// SPDX-FileCopyrightText: 2026 PonderSource contributors
//
// SPDX-License-Identifier: MIT

import type { ModulePublishing } from "@solid-memo/solid/solidReleasePublisher";
import type { ModuleStorageSources } from "./moduleInstanceRepository";
import type { SolidSession } from "@solid-memo/solid/solidSession";

/** The adapter's existing records and its explicit public-copy publisher. */
interface AdapterStorageApi extends Partial<ModuleStorageSources> {
  readonly root: string;
  readonly nativeSolidDocuments?: false;
  publish(url: string): Promise<string>;
  getPublicURL(url: string): Promise<string | undefined>;
}

/** Native documents retain their own sharing; adapter capabilities stay separate. */
interface NativeStorageApi extends Partial<ModuleStorageSources> {
  readonly root: string;
  readonly nativeSolidDocuments: true;
  readonly adapter: AdapterStorageApi;
}

/** The widget connection and the flashcards module's storage boundary. */
export interface StorageConnection {
  readonly api?: AdapterStorageApi | NativeStorageApi;
  fetch: typeof globalThis.fetch;
  restore(): Promise<{ webId: string } | null>;
  onUser(listener: (user: { webId: string } | null) => void): () => void;
  open(): void;
  disconnect(): void;
}

/** The flashcards rs.js module owns every authenticated storage request. */
export function createRemoteStorageSession(connection: StorageConnection): SolidSession {
  let webId: string | undefined;
  const logout = async () => {
    connection.disconnect();
    webId = undefined;
  };
  const open = async () => connection.open();
  const watch = (listener: () => void) =>
    connection.onUser((user) => {
      webId = user?.webId;
      if (!user) listener();
    });
  return {
    fetch: connection.fetch,
    webId: () => webId,
    sessionGateway: {
      async restore() {
        const user = await connection.restore();
        webId = user?.webId;
        return user ? { session: { webId: user.webId }, origin: "restored" } : null;
      },
      onSessionExpired: watch,
      onReturnedWithoutSession: watch,
      discoverOidcIssuer: async () => {
        throw new Error("Choose your provider in the storage widget");
      },
      login: open,
      loginWithIssuer: open,
      logout,
      hasStoredSession: async () => Boolean(await connection.restore()),
      forgetStoredSession: logout,
    },
  };
}

/** Select sharing at the document's original source after each widget restore. */
export function createRemoteStoragePublishing(
  connection: Pick<StorageConnection, "api">,
): ModulePublishing {
  const active = () => {
    const api = connection.api;
    return api?.nativeSolidDocuments ? api.adapter : api;
  };
  return {
    handles: (url) => {
      const api = connection.api;
      return api?.nativeSolidDocuments !== true || url.startsWith(api.adapter.root);
    },
    publish: (url) => active()!.publish(url),
    getPublicURL: (url) => active()!.getPublicURL(url),
  };
}
