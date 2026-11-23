// SPDX-FileCopyrightText: 2026 PonderSource contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { storageComposition, storageCompositionHtml } from "./storageComposition";

describe("storage composition", () => {
  it("keeps remoteStorage as the default and accepts the explicit native test build", () => {
    for (const value of [undefined, "", "remotestorage"])
      expect(storageComposition(value)).toBe("remotestorage");
    expect(storageComposition("native-interop")).toBe("native-interop");
    expect(() => storageComposition("native")).toThrow(
      'STORAGE_COMPOSITION must be "remotestorage" or "native-interop"; it is "native".',
    );
  });

  it("initializes the widget only in the product composition", () => {
    const page =
      '<main></main><!-- storage-modules:start --><script src="./storage/start.js"></script><!-- storage-modules:end --><div id="app"></div>';
    expect(storageCompositionHtml(page, "remotestorage")).toBe(page);
    expect(storageCompositionHtml(page, "native-interop")).toBe(
      '<main></main><div id="app"></div>',
    );
    expect(storageCompositionHtml('<div id="app"></div>', "native-interop")).toBe(
      '<div id="app"></div>',
    );
  });
});
