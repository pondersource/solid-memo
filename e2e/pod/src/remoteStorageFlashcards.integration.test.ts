// @vitest-environment node

// SPDX-FileCopyrightText: 2026 PonderSource contributors
//
// SPDX-License-Identifier: MIT

/** The shipped module reads and edits the upstream documents at their original URLs. */
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { describe, expect, inject, it } from "vitest";
import { DataFactory, Parser, Store } from "n3";
import { createContainerAt } from "@solid-memo/solid/client/resources";
import { listContainer } from "@solid-memo/solid/containers";
import { createSolidInstanceRepository } from "@solid-memo/solid/solidInstanceRepository";
import { createSolidDeckRepository } from "@solid-memo/solid/solidDeckRepository";
import { createSolidAnswerLog } from "@solid-memo/solid/solidAnswerLog";

interface Source {
  webId: string;
  root: string;
  optional?: boolean;
}
interface ModuleApi {
  root: string;
  webId: string;
  fetch: typeof fetch;
  adapter?: ModuleApi;
  initialize(): Promise<void>;
  nativeSolid(context: { fetch: typeof fetch; webId: string; root: string }): ModuleApi;
  storageSources(): Source[];
}

const { namedNode } = DataFactory;
const EXTRA = "https://other-app.example/vocab#";
const modules = runInNewContext(
  `${await readFile(process.env.RS_MODULES_BUNDLE ?? new URL("../../../apps/web/public/storage/modules.js", import.meta.url), "utf8")}\nPonderSourceModules;`,
  {
    // The app and module share browser intrinsics; the VM only isolates the bundle name.
    Error,
    TypeError,
    SyntaxError,
    URL,
    Request,
    Response,
    Headers,
    crypto,
    fetch,
    console,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    ArrayBuffer,
    Blob,
    AbortController,
    AbortSignal,
    setTimeout,
    clearTimeout,
    structuredClone,
  },
) as { Flashcards: { builder(client: object): { exports: ModuleApi } } };

/** Actual JSON documents on the reference Pod, in the module's original record paths. */
function storedClient(root: string) {
  const containers = new Set<string>();
  const address = (path: string) => root + path.split("/").map(encodeURIComponent).join("/");
  const ensure = async (url: string) => {
    if (containers.has(url)) return;
    const response = await fetch(url, { method: "HEAD" });
    if (response.status === 404) await createContainerAt(url, { fetch });
    else if (!response.ok) throw new Error(`Reading adapter container: ${response.status}`);
    containers.add(url);
  };
  return {
    declareType() {},
    async getObject(path: string) {
      const response = await fetch(address(path));
      if (response.status === 404) return undefined;
      if (!response.ok) throw new Error(`Reading adapter record: ${response.status}`);
      return response.json();
    },
    async storeObject(type: string, path: string, value: object) {
      await ensure(root);
      const parts = path.split("/");
      for (let count = 1; count < parts.length; count++)
        await ensure(address(parts.slice(0, count).join("/")) + "/");
      const response = await fetch(address(path), {
        method: "PUT",
        headers: { "content-type": "application/json; charset=UTF-8" },
        body: JSON.stringify({
          ...value,
          "@context": `http://remotestorage.io/spec/modules/flashcards/${encodeURIComponent(type)}`,
        }),
      });
      if (!response.ok) throw new Error(`Writing adapter record: ${response.status}`);
    },
    async getListing(prefix = "") {
      const url = address(prefix);
      const children = await listContainer(url, fetch);
      return Object.fromEntries(
        children.map((child) => [decodeURIComponent(child.slice(url.length)), {}]),
      );
    },
    async remove(path: string) {
      const response = await fetch(address(path), { method: "DELETE" });
      if (!response.ok && response.status !== 404)
        throw new Error(`Removing adapter record: ${response.status}`);
    },
  };
}

function upstream(fetcher: typeof fetch) {
  const options = {
    fetch: fetcher,
    now: () => new Date("2026-11-23T12:00:00Z"),
    randomId: () => crypto.randomUUID(),
  };
  return {
    instances: createSolidInstanceRepository(options),
    decks: createSolidDeckRepository(options),
    history: createSolidAnswerLog(options),
  };
}
async function put(url: string, body: BodyInit, type: string) {
  const response = await fetch(url, { method: "PUT", headers: { "content-type": type }, body });
  expect(response.ok, `Writing ${url}: ${response.status}`).toBe(true);
}
const text = (url: string) =>
  fetch(url, { headers: { Accept: "text/turtle" } }).then((response) => response.text());

for (const server of inject("solidServers"))
  describe(`remoteStorage flashcard native format on ${server.name}`, () => {
    it("keeps original native URLs, unknown RDF and existing adapter records through edits and fresh readers", async () => {
      const root = new URL(`module-formats-${crypto.randomUUID()}/`, server.url).href;
      await createContainerAt(root, { fetch });
      const webId = root + "profile/card#me";
      await put(
        root + "profile/card",
        `<#me> <http://www.w3.org/ns/pim/space#storage> <${root}> .`,
        "text/turtle",
      );
      const original = upstream(fetch);
      const instance = await original.instances.createInstance({
        webId,
        containerUrl: root + "native/",
        name: "Upstream study",
        registrationTarget: "private",
      });
      const deck = await original.decks.createDeck(instance.url, { en: "Upstream vocabulary" });
      const imageUrl = instance.url + "picture.png";
      const image = new Uint8Array([137, 80, 78, 71, 0, 255, 1, 128]);
      await put(imageUrl, image, "image/png");
      const card = await original.decks.addCard(deck, {
        front: { en: "Sun" },
        back: { sv: "Sol" },
        frontImageUrl: imageUrl,
      });
      await original.history.append(instance.url, {
        id: "answer-original",
        deckUrl: deck.url,
        cardUrl: card.url,
        direction: "front-to-back",
        grade: 4,
        answeredAt: "2026-11-23T12:00:00Z",
        studyDay: "2026-11-23",
        nextIntervalDays: 1,
      });
      await put(
        deck.cardsDocumentUrl,
        (await text(deck.cardsDocumentUrl)) +
          `\n<${card.url}> <${EXTRA}extension> [ <${EXTRA}code> "unknown card extension"; <${EXTRA}next> [ <${EXTRA}code> "nested blank node" ] ].\n<${EXTRA}sibling> <${EXTRA}code> "unrelated sibling" .`,
        "text/turtle",
      );
      const historyUrl = instance.url + "history/2026-11.ttl";
      const historyBefore = await text(historyUrl);
      const typeIndexBefore = await text(root + "settings/privateTypeIndex.ttl");

      const client = storedClient(root + "flashcards/");
      const adapter = modules.Flashcards.builder(client).exports;
      await adapter.initialize();
      const old = upstream(adapter.fetch);
      const existing = await old.instances.createInstance({
        webId: adapter.webId,
        containerUrl: adapter.root + "existing/",
        name: "Existing adapter study",
        registrationTarget: "private",
      });
      const oldDeck = await old.decks.createDeck(existing.url, {
        en: "Existing adapter vocabulary",
      });
      const oldCard = await old.decks.addCard(oldDeck, {
        front: { en: "Moon" },
        back: { sv: "Måne" },
      });
      // Records from before bounded hash names keep their original encoded URL key.
      const resourcesRoot = root + "flashcards/_rs/resources/";
      for (const address of await listContainer(resourcesRoot, fetch)) {
        const key = "_rs/resources/" + decodeURIComponent(address.slice(resourcesRoot.length));
        const record = (await client.getObject(key)) as { url: string; resource: object };
        if (record.url !== oldDeck.cardsDocumentUrl) continue;
        await client.storeObject(
          "rdf-resource",
          "_rs/resources/" + encodeURIComponent(record.url),
          { ...record, extensionFromOlderApp: "keep" },
        );
        await client.remove(key);
      }
      const recordPathsBefore = (await listContainer(resourcesRoot, fetch)).sort();

      const native = adapter.nativeSolid({ fetch, webId, root });
      expect(native.adapter).toBe(adapter);
      expect(native.storageSources()).toEqual([
        { webId, root },
        { webId: adapter.webId, root: adapter.root, optional: true },
      ]);
      const moduleReader = upstream(native.fetch);
      expect(await moduleReader.instances.listInstances(webId)).toEqual([instance]);
      const [sameDeck] = await moduleReader.decks.listDecks(instance.url);
      expect(sameDeck!.url).toBe(deck.url);
      expect(sameDeck!.cardsDocumentUrl).toBe(deck.cardsDocumentUrl);
      const [sameCard] = await moduleReader.decks.listCards(sameDeck!);
      expect(sameCard!.url).toBe(card.url);
      await moduleReader.decks.updateCard(sameDeck!, sameCard!, {
        front: { en: "Sun edited through module" },
        back: sameCard!.back,
        frontImageUrl: sameCard!.frontImageUrl,
      });
      const oldWriter = upstream(native.adapter!.fetch);
      await oldWriter.decks.updateCard(oldDeck, oldCard, {
        front: { en: "Moon edited in place" },
        back: oldCard.back,
      });

      const fresh = upstream((input, init) => fetch(input, init));
      const [freshCard] = await fresh.decks.listCards(deck);
      expect(freshCard!.url).toBe(card.url);
      expect(freshCard!.front).toEqual({ en: "Sun edited through module" });
      expect(freshCard!.back).toEqual({ sv: "Sol" });
      expect(freshCard!.frontImageUrl).toBe(imageUrl);
      expect((await fresh.history.readMonth(instance.url, "2026-11"))[0]!.id).toBe(
        "answer-original",
      );
      expect(await text(historyUrl)).toBe(historyBefore);
      expect(await text(root + "settings/privateTypeIndex.ttl")).toBe(typeIndexBefore);
      expect(new Uint8Array(await (await fetch(imageUrl)).arrayBuffer())).toEqual(image);
      const preserved = new Store(
        new Parser({ baseIRI: deck.cardsDocumentUrl }).parse(await text(deck.cardsDocumentUrl)),
      );
      const extension = preserved.getObjects(
        namedNode(card.url),
        namedNode(EXTRA + "extension"),
        null,
      )[0]!;
      expect(extension.termType).toBe("BlankNode");
      expect(
        preserved.getObjects(extension, namedNode(EXTRA + "code"), null).map((term) => term.value),
      ).toEqual(["unknown card extension"]);
      const nested = preserved.getObjects(extension, namedNode(EXTRA + "next"), null)[0]!;
      expect(
        preserved.getObjects(nested, namedNode(EXTRA + "code"), null).map((term) => term.value),
      ).toEqual(["nested blank node"]);
      expect(
        preserved
          .getObjects(namedNode(EXTRA + "sibling"), namedNode(EXTRA + "code"), null)
          .map((term) => term.value),
      ).toEqual(["unrelated sibling"]);
      const freshAdapter = modules.Flashcards.builder(storedClient(root + "flashcards/")).exports;
      const [freshOldCard] = await upstream(freshAdapter.fetch).decks.listCards(oldDeck);
      expect(freshOldCard!.front).toEqual({ en: "Moon edited in place" });
      expect(freshOldCard!.back).toEqual({ sv: "Måne" });
      expect(
        await client.getObject("_rs/resources/" + encodeURIComponent(oldDeck.cardsDocumentUrl)),
      ).toMatchObject({ extensionFromOlderApp: "keep" });
      expect((await listContainer(root + "flashcards/_rs/resources/", fetch)).sort()).toEqual(
        recordPathsBefore,
      );
      // A corrupt existing index is unknown data, never an absent collection.
      let corrupted = false;
      for (const address of await listContainer(resourcesRoot, fetch)) {
        const key = "_rs/resources/" + decodeURIComponent(address.slice(resourcesRoot.length));
        const record = (await client.getObject(key)) as { url: string; resource: object };
        if (record.url !== adapter.root + "settings/privateTypeIndex") continue;
        await client.storeObject("rdf-resource", key, {
          ...record,
          url: "https://other-app.example/wrong-index",
        });
        corrupted = true;
      }
      expect(corrupted).toBe(true);
      const corruptSource = modules.Flashcards.builder(storedClient(root + "flashcards/")).exports;
      await expect(
        upstream(corruptSource.fetch).instances.listInstances(corruptSource.webId),
      ).rejects.toThrow();
    });
  });
