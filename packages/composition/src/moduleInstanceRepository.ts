// SPDX-FileCopyrightText: 2026 PonderSource contributors
//
// SPDX-License-Identifier: MIT

import type { InstanceRepository } from "@solid-memo/application/ports";

/** The module's native documents and any earlier adapter records, kept in place. */
export interface ModuleStorageSources {
  storageSources(): readonly { webId: string; root: string; optional?: boolean }[];
  identityFor(url: string): string | undefined;
}

/** The selected module can change when a widget connection is restored. */
export type ModuleStorage = () => Partial<ModuleStorageSources> | undefined;

/** Roots granted to this module, including an existing adapter's virtual Pod. */
export function moduleStorageRoots(module: ModuleStorage | undefined): string[] {
  return [
    ...new Set(
      module?.()
        ?.storageSources?.()
        .map(({ root }) => root),
    ),
  ];
}

/** Keep each registration in its original source; document URLs stay unchanged. */
export function createModuleInstanceRepository(
  repository: InstanceRepository,
  module: ModuleStorage | undefined,
): InstanceRepository {
  const identity = (webId: string, url: string) => module?.()?.identityFor?.(url) ?? webId;
  return {
    ...repository,
    async listInstances(webId) {
      const sources = module?.()?.storageSources?.();
      if (!sources?.some((source) => source.webId === webId))
        return repository.listInstances(webId);
      const instances = new Map<
        string,
        Awaited<ReturnType<InstanceRepository["listInstances"]>>[number]
      >();
      for (const source of sources) {
        let listed: Awaited<ReturnType<InstanceRepository["listInstances"]>>;
        try {
          listed = await repository.listInstances(source.webId);
        } catch (error) {
          if (source.optional && (error as { statusCode?: number }).statusCode === 404) continue;
          throw error;
        }
        for (const instance of listed)
          if (!instances.has(instance.url)) instances.set(instance.url, instance);
      }
      return [...instances.values()];
    },
    createInstance: (args) =>
      repository.createInstance({ ...args, webId: identity(args.webId, args.containerUrl) }),
    attachInstance: (args) =>
      repository.attachInstance({ ...args, webId: identity(args.webId, args.instanceUrl) }),
    deleteInstance: (args) =>
      repository.deleteInstance({ ...args, webId: identity(args.webId, args.instance.url) }),
    detachInstance: (args) =>
      repository.detachInstance({ ...args, webId: identity(args.webId, args.instance.url) }),
    readOldRegistrations: (args) =>
      repository.readOldRegistrations({ ...args, webId: identity(args.webId, args.instanceUrl) }),
    removeOldRegistrations: (args) =>
      repository.removeOldRegistrations({ ...args, webId: identity(args.webId, args.instanceUrl) }),
    renameRegistrations: (args) =>
      repository.renameRegistrations({ ...args, webId: identity(args.webId, args.instanceUrl) }),
  };
}
