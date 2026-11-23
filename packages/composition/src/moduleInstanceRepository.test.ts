// SPDX-FileCopyrightText: 2026 PonderSource contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import type { InstanceRepository } from "@solid-memo/application/ports";
import { createModuleInstanceRepository, moduleStorageRoots } from "./moduleInstanceRepository";

const native = { webId: "https://pod.example/profile#me", root: "https://pod.example/owner/" };
const adapter = {
  webId: "https://flashcards.storage.pondersource.invalid/profile/card#me",
  root: "https://flashcards.storage.pondersource.invalid/",
  optional: true,
};
const instance = { url: adapter.root + "kept/", name: "Existing study" };
const source = () => ({
  storageSources: () => [native, adapter],
  identityFor: (url: string) => (url.startsWith(adapter.root) ? adapter.webId : undefined),
});
function repository() {
  return Object.fromEntries(
    [
      "listInstances",
      "getRegistrationOptions",
      "createInstance",
      "attachInstance",
      "deleteInstance",
      "detachInstance",
      "readOldRegistrations",
      "removeOldRegistrations",
      "renameRegistrations",
      "readMeta",
      "saveMeta",
      "upgradeMeta",
    ].map((name) => [name, vi.fn()]),
  ) as unknown as InstanceRepository;
}

describe("module sources", () => {
  it("keeps old bundles and absent module capabilities on the existing repository", async () => {
    const repo = repository();
    vi.mocked(repo.listInstances).mockResolvedValue([instance]);
    expect(moduleStorageRoots(undefined)).toEqual([]);
    expect(moduleStorageRoots(() => undefined)).toEqual([]);
    expect(moduleStorageRoots(() => ({}))).toEqual([]);
    expect(moduleStorageRoots(() => ({ storageSources: () => [native, native, adapter] }))).toEqual(
      [native.root, adapter.root],
    );
    for (const module of [
      undefined,
      () => undefined,
      () => ({}),
      () => ({ storageSources: () => [] }),
    ]) {
      const current = createModuleInstanceRepository(repo, module);
      expect(await current.listInstances(native.webId)).toEqual([instance]);
      await current.renameRegistrations({
        webId: native.webId,
        instanceUrl: instance.url,
        title: "Kept",
      });
      expect(repo.renameRegistrations).toHaveBeenLastCalledWith({
        webId: native.webId,
        instanceUrl: instance.url,
        title: "Kept",
      });
    }
  });
  it("discovers both formats without duplicating or rewriting their instance URLs", async () => {
    const repo = repository();
    vi.mocked(repo.listInstances).mockImplementation(async (webId) =>
      webId === native.webId
        ? [{ url: native.root + "memo/", name: "Original" }, instance]
        : [instance],
    );
    const current = createModuleInstanceRepository(repo, source);
    expect(await current.listInstances(native.webId)).toEqual([
      { url: native.root + "memo/", name: "Original" },
      instance,
    ]);
    expect(vi.mocked(repo.listInstances).mock.calls).toEqual([[native.webId], [adapter.webId]]);
    vi.mocked(repo.listInstances).mockClear();
    await current.listInstances("https://public.example/profile#me");
    expect(repo.listInstances).toHaveBeenCalledExactlyOnceWith("https://public.example/profile#me");
  });
  it("only an optional adapter's absent404 counts as no existing source", async () => {
    const repo = repository();
    const current = createModuleInstanceRepository(repo, source);
    vi.mocked(repo.listInstances).mockImplementation(async (webId) => {
      if (webId === adapter.webId) throw Object.assign(new Error("Absent"), { statusCode: 404 });
      return [instance];
    });
    expect(await current.listInstances(native.webId)).toEqual([instance]);
    for (const statusCode of [403, 500, undefined]) {
      const failure = Object.assign(new Error("Unreadable"), { statusCode });
      vi.mocked(repo.listInstances).mockImplementation(async (webId) => {
        if (webId === adapter.webId) throw failure;
        return [];
      });
      await expect(current.listInstances(native.webId)).rejects.toBe(failure);
    }
    const missingNative = Object.assign(new Error("Missing native profile"), { statusCode: 404 });
    vi.mocked(repo.listInstances).mockRejectedValue(missingNative);
    await expect(current.listInstances(native.webId)).rejects.toBe(missingNative);
  });
  it("routes registration writes to their original identity and leaves document methods intact", async () => {
    const repo = repository();
    const current = createModuleInstanceRepository(repo, source);
    await current.createInstance({
      webId: native.webId,
      containerUrl: instance.url,
      name: instance.name,
      registrationTarget: "private",
    });
    expect(repo.createInstance).toHaveBeenCalledWith({
      webId: adapter.webId,
      containerUrl: instance.url,
      name: instance.name,
      registrationTarget: "private",
    });
    await current.attachInstance({
      webId: native.webId,
      instanceUrl: instance.url,
      registrationTarget: "private",
    });
    expect(repo.attachInstance).toHaveBeenCalledWith({
      webId: adapter.webId,
      instanceUrl: instance.url,
      registrationTarget: "private",
    });
    await current.deleteInstance({ webId: native.webId, instance });
    await current.detachInstance({ webId: native.webId, instance });
    for (const method of [repo.deleteInstance, repo.detachInstance])
      expect(method).toHaveBeenCalledWith({ webId: adapter.webId, instance });
    await current.readOldRegistrations({ webId: native.webId, instanceUrl: instance.url });
    await current.removeOldRegistrations({ webId: native.webId, instanceUrl: instance.url });
    for (const method of [repo.readOldRegistrations, repo.removeOldRegistrations])
      expect(method).toHaveBeenCalledWith({ webId: adapter.webId, instanceUrl: instance.url });
    await current.renameRegistrations({
      webId: native.webId,
      instanceUrl: instance.url,
      title: "Renamed",
    });
    expect(repo.renameRegistrations).toHaveBeenCalledWith({
      webId: adapter.webId,
      instanceUrl: instance.url,
      title: "Renamed",
    });
    expect(current.readMeta).toBe(repo.readMeta);
    expect(current.saveMeta).toBe(repo.saveMeta);
    expect(current.getRegistrationOptions).toBe(repo.getRegistrationOptions);
  });
});
