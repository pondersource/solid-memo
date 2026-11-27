// SPDX-FileCopyrightText: 2026 Ponder Source contributors
//
// SPDX-License-Identifier: MIT

import { applySm2, INITIAL_SM2_STATE } from "../packages/domain/src/sm2.ts";

const core = "https://atomicdata.dev/properties/";
const prefix = "solid-memo-card/v1:";
const fields = [
  ["front", "Front"],
  ["back", "Back", true],
  ["deck", "Deck"],
];
const dayMs = 86_400_000;

function el(tag, text) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

async function cards(store) {
  const { table, rowClass } = await store.getData();
  if (!table || !rowClass) throw new Error("Solid Memo needs a flashcard table.");

  function card(row) {
    if (row.error) throw new Error("Atomic could not read a flashcard.");
    const data = row.get(core + "description");
    if (
      row.get(core + "parent") !== table ||
      !row.get(core + "isA")?.includes(rowClass) ||
      typeof data !== "string" ||
      !data.startsWith(prefix)
    )
      return;
    return {
      ...JSON.parse(data.slice(prefix.length)),
      front: row.get(core + "name"),
      subject: row.subject,
    };
  }

  return {
    async list() {
      const all = await store.query({ property: core + "parent", value: table });
      if (all.length >= 500) throw new Error("This version supports fewer than 500 rows.");
      const result = [];
      for (let offset = 0; offset < all.length; offset += 100) {
        const rows = await store.getMany(all.slice(offset, offset + 100));
        result.push(...rows.map(card).filter(Boolean));
      }
      return result.sort((first, second) => first.front.localeCompare(second.front));
    },
    async save({ subject, front, ...record }) {
      const props = {
        [core + "name"]: front,
        [core + "description"]: prefix + JSON.stringify(record),
      };
      if (!subject) {
        await store.newResource({ parent: table, isA: [rowClass], propVals: props });
        return;
      }
      const row = await store.getResource(subject);
      if (!card(row)) throw new Error("That card is outside these decks.");
      for (const [property, value] of Object.entries(props)) row.set(property, value);
      await row.save();
    },
    async remove(subject) {
      const row = await store.getResource(subject);
      if (!card(row)) throw new Error("That card is outside these decks.");
      await row.destroy();
    },
  };
}

export async function view({ root, store }) {
  const decks = await cards(store);
  const style = el(
    "style",
    `
    main { max-width: 60rem; margin: auto; padding: 1.25rem; font: 1rem system-ui; }
    fieldset { display: grid; gap: .6rem; }
    fieldset label, fieldset input, textarea { display: block; width: 100%; box-sizing: border-box; }
    textarea { min-height: 4rem; }
    input, textarea, button { font: inherit; padding: .35rem; }
    button { margin: .2rem .4rem .2rem 0; }
    article { border-top: 1px solid #8886; margin-block: 1rem; padding-block: .5rem; }
    label input[type=checkbox] { display: inline; width: auto; }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; }
  `,
  );
  const main = el("main");
  const editor = el("fieldset");
  editor.append(el("legend", "Flashcard details"));
  const input = {};
  for (const [key, label, multiline] of fields) {
    input[key] = el(multiline ? "textarea" : "input");
    const wrapper = el("label", label);
    wrapper.append(input[key]);
    editor.append(wrapper);
  }
  const actions = el("div");
  const save = el("button", "Add card");
  const cancel = el("button", "Cancel edit");
  actions.append(save, cancel);
  editor.append(actions);
  const status = el("p");
  status.setAttribute("role", "status");
  const filterLabel = el("label", "Find cards");
  const filter = el("input");
  filter.type = "search";
  filterLabel.append(filter);
  const dueOnly = el("input");
  dueOnly.type = "checkbox";
  dueOnly.checked = true;
  const dueLabel = el("label", "Show due cards only");
  dueLabel.prepend(dueOnly);
  const results = el("section");
  main.append(el("h1", "Solid Memo"), editor, status, filterLabel, dueLabel, results);
  root.replaceChildren(style, main);

  let all = [];
  let selected;
  let busy = false;

  function edit(record) {
    selected = record;
    for (const [key] of fields) {
      input[key].value = record?.[key] || "";
    }
    save.textContent = record ? "Save card" : "Add card";
    cancel.hidden = !record;
  }

  function render() {
    results.replaceChildren();
    const query = filter.value.trim().toLocaleLowerCase();
    const now = Date.now();
    for (const card of all) {
      if (dueOnly.checked && card.dueAt > now) continue;
      if (![card.front, card.back, card.deck].join(" ").toLocaleLowerCase().includes(query))
        continue;
      const section = el("article");
      section.append(el("p", card.deck), el("h2", card.front));
      if (card.dueAt > now)
        section.append(el("p", "Due " + new Date(card.dueAt).toLocaleDateString()));
      const reveal = el("button", "Reveal answer");
      reveal.addEventListener("click", () => {
        reveal.disabled = true;
        section.append(el("pre", card.back));
        if (card.dueAt > now) return;
        for (const [label, quality] of [
          ["Again", 1],
          ["Hard", 3],
          ["Good", 4],
          ["Easy", 5],
        ]) {
          const grade = el("button", label);
          grade.addEventListener("click", () =>
            run(async () => {
              const state = applySm2(card.state, quality);
              const reviewed = { ...card, state, dueAt: Date.now() + state.intervalDays * dayMs };
              await decks.save(reviewed);
              if (selected?.subject === card.subject) selected = reviewed;
            }, "Review saved."),
          );
          section.append(grade);
        }
      });
      const change = el("button", "Edit card");
      change.addEventListener("click", () => {
        if (!busy) edit(card);
      });
      const remove = el("button", "Delete card");
      remove.addEventListener("click", () => {
        if (busy || !window.confirm("Delete this card?")) return;
        run(async () => {
          await decks.remove(card.subject);
          if (selected?.subject === card.subject) edit();
        }, "Card deleted.");
      });
      section.append(reveal, change, remove);
      results.append(section);
    }
    if (!results.children.length) results.append(el("p", "No matching cards."));
  }

  async function run(operation, message) {
    if (busy) return;
    busy = editor.disabled = true;
    status.textContent = "";
    try {
      await operation();
      all = await decks.list();
      render();
      status.textContent = message;
    } catch (error) {
      status.textContent = error.message;
    } finally {
      busy = editor.disabled = false;
    }
  }

  filter.addEventListener("input", render);
  dueOnly.addEventListener("change", render);
  cancel.addEventListener("click", () => edit());
  save.addEventListener("click", () =>
    run(async () => {
      const front = input.front.value.trim();
      const back = input.back.value.trim();
      if (!front || !back) throw new Error("Enter both sides of the flashcard.");
      await decks.save({
        subject: selected?.subject,
        front,
        back,
        deck: input.deck.value.trim() || "Default",
        state: selected?.state || INITIAL_SM2_STATE,
        dueAt: selected?.dueAt ?? 0,
      });
      edit();
    }, "Card saved."),
  );
  edit();
  await run(async () => {}, "");
}
