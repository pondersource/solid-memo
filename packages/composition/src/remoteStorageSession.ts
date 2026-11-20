// SPDX-FileCopyrightText: 2026 PonderSource contributors
//
// SPDX-License-Identifier: MIT

import type { SolidSession } from "@solid-memo/solid/solidSession";

/** The widget connection and the flashcards module's storage boundary. */
export interface StorageConnection {
  api?: {
    publish(url: string): Promise<string>;
    getPublicURL(url: string): Promise<string | undefined>;
  };
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
