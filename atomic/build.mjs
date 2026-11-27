// SPDX-FileCopyrightText: 2026 Ponder Source contributors
//
// SPDX-License-Identifier: MIT

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";

const read = (relative) => readFileSync(new URL(relative, import.meta.url), "utf8");
const scheduler = stripTypeScriptTypes(read("../packages/domain/src/sm2.ts"));
const view = read("./view.mjs").replace(/^import \{[^\n]+sm2\.ts";\n/m, "");
const output = new URL("./dist/", import.meta.url);
mkdirSync(output, { recursive: true });
writeFileSync(new URL("solid-memo-0.1.0.js", output), scheduler + "\n" + view);
