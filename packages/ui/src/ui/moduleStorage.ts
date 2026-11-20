// SPDX-FileCopyrightText: 2026 PonderSource contributors
//
// SPDX-License-Identifier: MIT

/** Module identifiers are stable across providers but are not web links. */
export function isModuleStorage(url: string): boolean {
  return url.startsWith("https://flashcards.storage.pondersource.invalid/");
}
