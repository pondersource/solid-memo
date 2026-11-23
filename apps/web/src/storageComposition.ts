// SPDX-FileCopyrightText: 2026 PonderSource contributors
//
// SPDX-License-Identifier: MIT

/** The product uses the shared storage widget; native interoperability has its own build. */
export type StorageComposition = "remotestorage" | "native-interop";

/** Refuse an unknown composition rather than testing a different storage path silently. */
export function storageComposition(value: string | undefined): StorageComposition {
  if (value === undefined || value === "" || value === "remotestorage") return "remotestorage";
  if (value === "native-interop") return value;
  throw new Error(
    `STORAGE_COMPOSITION must be "remotestorage" or "native-interop"; it is ${JSON.stringify(value)}.`,
  );
}

/** The native suite must not initialize an unused remoteStorage connection beside its native session. */
export function storageCompositionHtml(html: string, composition: StorageComposition): string {
  return composition === "remotestorage"
    ? html
    : html.replace(/<!-- storage-modules:start -->[\s\S]*?<!-- storage-modules:end -->/, "");
}
