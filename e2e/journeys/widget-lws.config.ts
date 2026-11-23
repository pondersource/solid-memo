// SPDX-FileCopyrightText: 2026 PonderSource contributors
//
// SPDX-License-Identifier: MIT

import { defineConfig } from "@playwright/test";
import journeys from "./playwright.config.ts";

/** The product's widget composition, with a real LWS issuer and disposable client. */
export default defineConfig(journeys, {
  testDir: "widget",
  outputDir: "test-results/widget",
  testMatch: "**/*.journey.ts",
});
