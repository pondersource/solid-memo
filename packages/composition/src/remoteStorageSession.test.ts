// SPDX-FileCopyrightText: 2026 PonderSource contributors
//
// SPDX-License-Identifier: MIT

import { expect, it, vi } from "vitest";
import { createRemoteStorageSession, type StorageConnection } from "./remoteStorageSession";
it("restores module identity, uses the widget and forwards only module storage", async () => {
  const stop = vi.fn();
  const connection: StorageConnection = {
    fetch: vi.fn(),
    restore: vi.fn().mockResolvedValue({ webId: "https://flashcards.example/me" }),
    onUser: vi.fn().mockReturnValue(stop),
    open: vi.fn(),
    disconnect: vi.fn(),
  };
  const session = createRemoteStorageSession(connection),
    gateway = session.sessionGateway;
  expect(session.fetch).toBe(connection.fetch);
  expect(await gateway.restore()).toEqual({
    session: { webId: "https://flashcards.example/me" },
    origin: "restored",
  });
  expect(session.webId()).toBe("https://flashcards.example/me");
  expect(await gateway.hasStoredSession()).toBe(true);
  await gateway.login("https://ignored.example/me");
  await gateway.loginWithIssuer("https://ignored.example/");
  expect(connection.open).toHaveBeenCalledTimes(2);
  await expect(gateway.discoverOidcIssuer("https://ignored.example/me")).rejects.toThrow(
    "storage widget",
  );
  const ended = vi.fn();
  expect(gateway.onSessionExpired(ended)).toBe(stop);
  expect(gateway.onReturnedWithoutSession(ended)).toBe(stop);
  const callback = vi.mocked(connection.onUser).mock.calls[0]![0];
  callback({ webId: "https://another.example/me" });
  expect(session.webId()).toBe("https://another.example/me");
  expect(ended).not.toHaveBeenCalled();
  callback(null);
  expect(session.webId()).toBeUndefined();
  expect(ended).toHaveBeenCalledOnce();
  await gateway.logout();
  await gateway.forgetStoredSession();
  expect(connection.disconnect).toHaveBeenCalledTimes(2);
  vi.mocked(connection.restore).mockResolvedValue(null);
  expect(await gateway.restore()).toBeNull();
  expect(await gateway.hasStoredSession()).toBe(false);
});

it("chooses sharing from the current source and retains native release URLs", async () => {
  const { createRemoteStoragePublishing } = await import("./remoteStorageSession");
  const copy = {
    root: "https://flashcards.storage.pondersource.invalid/",
    publish: vi.fn(async () => "https://public.example/copy"),
    getPublicURL: vi.fn(async () => "https://public.example/copy"),
  };
  const connection = { api: undefined as StorageConnection["api"] };
  const publishing = createRemoteStoragePublishing(connection);
  expect(publishing.handles!("https://pod.example/release.ttl")).toBe(true);
  connection.api = copy;
  expect(publishing.handles!(copy.root + "release.ttl")).toBe(true);
  expect(await publishing.publish(copy.root + "release.ttl")).toBe("https://public.example/copy");
  expect(await publishing.getPublicURL(copy.root + "release.ttl")).toBe(
    "https://public.example/copy",
  );
  connection.api = { root: "https://pod.example/", nativeSolidDocuments: true, adapter: copy };
  expect(publishing.handles!("https://pod.example/release.ttl")).toBe(false);
  expect(publishing.handles!(copy.root + "release.ttl")).toBe(true);
  expect(await publishing.publish(copy.root + "release.ttl")).toBe("https://public.example/copy");
  expect(await publishing.getPublicURL(copy.root + "release.ttl")).toBe(
    "https://public.example/copy",
  );
});
