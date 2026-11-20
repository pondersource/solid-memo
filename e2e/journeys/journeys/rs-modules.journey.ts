// SPDX-FileCopyrightText: 2026 PonderSource contributors
//
// SPDX-License-Identifier: MIT

import { expect, type Page } from "@playwright/test";
import { test } from "../fixtures.ts";
import type { CssAccount } from "../harness/cssAccount.ts";

async function connect(page: Page, server: string, account: CssAccount) {
  await page.goto("./");
  await page.locator(".rs-choose-solid").click();
  await page.locator("[name=rs-provider-address]").fill(server);
  await page.locator(".rs-solid-connect").click();
  await page.locator("#email").fill(account.email);
  await page.locator("#password").fill(account.password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.getByRole("button", { name: /authorize|consent/i }).click();
  await expect(page.getByRole("banner")).toContainText("Logged in as My storage");
}

test("@reload widget and flashcards module retain a deck, cards and study on a fresh device", async ({
  app,
  account,
  server,
  newDevice,
  playwright,
}) => {
  await connect(app.page, server, account);
  await app.instanceCreator.create("Module study");
  await app.decks.openDeckCreator();
  await app.deckCreator.create("Module vocabulary");
  await app.deckBrowser.openFor("Module vocabulary");
  await app.deckBrowser.openCardCreator();
  await app.cardCreator.addCards(
    [
      ["Sun", "Sol"],
      ["Moon", "Måne"],
    ],
    { front: "en", back: "sv" },
  );
  await app.cardCreator.back();
  await app.chrome.breadcrumb("breadcrumbs.decks");
  const saved = app.page.waitForResponse(
    (response) =>
      response.ok() &&
      response.request().method() === "PUT" &&
      response.url().includes("/flashcards/_rs/resources/") &&
      (response.request().postData() || "").includes("Answer"),
  );
  await app.decks.study("Module vocabulary");
  await app.study.studyAll({ grade: "good" });
  await app.study.endSession();
  await saved;
  const fresh = await newDevice();
  await connect(fresh.page, server, account);
  await fresh.decks.expectDeck("Module vocabulary");
  await fresh.studio.openFromApp();
  await fresh.studio.expectDeck("Module study", "Module vocabulary", { cards: 2, due: 0 });
  const route = fresh.page.url();
  await fresh.page.reload();
  await expect(fresh.page).toHaveURL(route);
  await fresh.studio.expectDeck("Module study", "Module vocabulary", { cards: 2, due: 0 });
  await fresh.studio.openDrafts("Module study");
  await fresh.studio.draftDeck("Module study", "Module vocabulary");
  await fresh.draftEditor.openDraft("Module vocabulary", { course: false });
  await fresh.draftEditor.openRelease();
  await fresh.draftEditor.addAuthor("Module test author");
  await fresh.draftEditor.chooseReleaseLicense("CC0 1.0");
  await fresh.draftEditor.choosePublisher("Module test author");
  const publishing = fresh.page.getByRole("region", {
    name: fresh.t("studio.publish.heading"),
    exact: true,
  });
  await expect(publishing.getByText(fresh.t("studio.publish.noErrors"))).toBeVisible();
  await publishing.getByRole("checkbox", { name: fresh.t("studio.publish.confirm") }).check();
  await publishing
    .getByRole("button", { name: fresh.t("studio.publish.publish"), exact: true })
    .click();
  const publicLink = publishing.locator('a[href*="/public/flashcards/"]');
  await expect(publicLink).toBeVisible({ timeout: 30000 });
  const publicUrl = (await publicLink.getAttribute("href"))!;
  const anyone = await playwright.request.newContext();
  try {
    const release = await anyone.get(publicUrl);
    expect(release.status()).toBe(200);
    expect(await release.text()).toContain("Module vocabulary");
  } finally {
    await anyone.dispose();
  }
  if (!(await fresh.page.locator(".rs-box-connected .rs-disconnect").isVisible()))
    await fresh.page.locator(".rs-widget-icon").click();
  await fresh.page.locator(".rs-box-connected .rs-disconnect").click();
  await expect(
    fresh.page.getByRole("button", { name: "Connect storage", exact: true }),
  ).toBeVisible();
});
