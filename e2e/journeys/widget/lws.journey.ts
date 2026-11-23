// SPDX-FileCopyrightText: 2026 PonderSource contributors
//
// SPDX-License-Identifier: MIT

import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures.ts";
import type { CssAccount } from "../harness/cssAccount.ts";

/** Supply this disposable issuer's public registration; every request still uses the real SDK. */
async function configure(page: Page, server: string, clientId: string, redirectUri: string) {
  await page.context().grantPermissions(["local-network-access"], {
    origin: new URL(redirectUri).origin,
  });
  await page.route("**/storage/start.js", async (route) => {
    const response = await route.fetch();
    const options = JSON.stringify({
      issuer: server,
      clientId,
      redirectUri,
      idTokenSigningAlg: "ES256",
    });
    await route.fulfill({
      response,
      body: `${await response.text()}\nwindow.ponderStorage.rs.lws.configureOpenID(${options});\nwindow.ponderStorage.rs.lws.handleIncomingRedirect().catch(error => { const alert = document.createElement('p'); alert.setAttribute('role','alert'); alert.textContent = error.message; document.getElementById('storage-widget').append(alert); });`,
    });
  });
}

async function connect(page: Page, account: CssAccount) {
  await page.goto("./");
  await page.locator(".rs-choose-lws").click();
  await page.locator("[name=rs-lws-address]").fill(account.pod);
  await page.locator(".rs-lws-connect").click();
  await expect(page.getByRole("heading", { name: "Log in", exact: true })).toBeVisible();
  await page.locator("#email").fill(account.email);
  await page.locator("#password").fill(account.password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByRole("radio", { name: account.webId })).toBeChecked();
  await page.getByRole("button", { name: "Authorize", exact: true }).click();
  await expect(page.getByRole("banner")).toContainText("Logged in as My storage");
}

test("the LWS widget signs in, keeps private study and restores it on a fresh device", async ({
  app,
  account,
  server,
  newDevice,
  playwright,
  baseURL,
}) => {
  if (!baseURL) throw new Error("The widget journey requires the app URL.");
  const api = await playwright.request.newContext({ ignoreHTTPSErrors: true });
  let clientId: string;
  try {
    const discovery = await api.get(new URL(".well-known/openid-configuration", server).href);
    expect(discovery.ok()).toBe(true);
    const provider = (await discovery.json()) as { registration_endpoint: string };
    const registration = await api.post(provider.registration_endpoint, {
      data: {
        redirect_uris: [baseURL],
        response_types: ["code"],
        grant_types: ["authorization_code"],
        token_endpoint_auth_method: "none",
        application_type: "web",
        scope: "openid webid",
        id_token_signed_response_alg: "ES256",
      },
    });
    expect(registration.ok()).toBe(true);
    clientId = ((await registration.json()) as { client_id: string }).client_id;
  } finally {
    await api.dispose();
  }
  await configure(app.page, server, clientId, baseURL);
  await connect(app.page, account);
  await app.instanceCreator.create("LWS study");
  await app.decks.openDeckCreator();
  await app.deckCreator.create("LWS vocabulary");
  await app.deckBrowser.openFor("LWS vocabulary");
  await app.deckBrowser.openCardCreator();
  await app.cardCreator.addCards([["Sun", "Sol"]], { front: "en", back: "sv" });
  await app.cardCreator.back();
  await app.chrome.breadcrumb("breadcrumbs.decks");
  const saved = app.page.waitForResponse(
    (response) =>
      response.ok() &&
      ["PUT", "POST"].includes(response.request().method()) &&
      response.url().startsWith(account.pod) &&
      (response.request().postData() || "").includes("Answer"),
  );
  await app.decks.study("LWS vocabulary");
  await app.study.studyAll({ grade: "good" });
  await app.study.endSession();
  const write = await saved;
  const anonymous = await playwright.request.newContext({ ignoreHTTPSErrors: true });
  try {
    expect([401, 403, 404]).toContain(
      (
        await anonymous.get(new URL(write.headers().location || write.url(), write.url()).href)
      ).status(),
    );
  } finally {
    await anonymous.dispose();
  }
  const fresh = await newDevice();
  await configure(fresh.page, server, clientId, baseURL);
  await connect(fresh.page, account);
  await fresh.decks.expectDeck("LWS vocabulary");
  await fresh.studio.openFromApp();
  await fresh.studio.expectDeck("LWS study", "LWS vocabulary", { cards: 1, due: 0 });
});
