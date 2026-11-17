// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { createFlashcards, type FlashcardsOptions } from "./flashcards";

export type SolidDeckRepositoryDeps = FlashcardsOptions;

export const createSolidDeckRepository: (
  options: SolidDeckRepositoryDeps,
) => ReturnType<typeof createFlashcards> = createFlashcards;
