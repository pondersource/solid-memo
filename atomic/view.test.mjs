// SPDX-FileCopyrightText: 2026 Ponder Source contributors
//
// SPDX-License-Identifier: MIT

import assert from "node:assert/strict";
import { test } from "node:test";
import { view } from "./view.mjs";

function node(tag) {
  return {
    tag,
    value: "",
    children: [],
    handlers: {},
    prepend(...children) {
      this.children.unshift(...children);
    },
    append(...children) {
      this.children.push(...children);
    },
    replaceChildren(...children) {
      this.children = children;
    },
    setAttribute() {},
    addEventListener(type, handler) {
      this.handlers[type] = handler;
    },
  };
}

function find(root, predicate) {
  if (predicate(root)) return root;
  for (const child of root.children) {
    const result = find(child, predicate);
    if (result) return result;
  }
}

test("review a card and preserve its next due date", async () => {
  globalThis.document = { createElement: node };
  const core = "https://atomicdata.dev/properties/";
  const rows = new Map();
  const getResource = async (subject) => {
    const props = { ...rows.get(subject) };
    return {
      subject,
      get: (key) => props[key],
      set: (key, value) => {
        props[key] = value;
      },
      save: async () => {
        rows.set(subject, props);
      },
    };
  };
  const store = {
    getData: async () => ({ table: "deck", rowClass: "card" }),
    query: async () => [...rows.keys()],
    getResource,
    getMany: (subjects) => Promise.all(subjects.map(getResource)),
    newResource: async ({ parent, isA, propVals }) => {
      rows.set("card1", { ...propVals, [`${core}parent`]: parent, [`${core}isA`]: isA });
    },
  };
  const root = node("div");
  await view({ root, store });
  const button = (label) => find(root, (n) => n.tag === "button" && n.textContent === label);
  const field = (label) =>
    find(root, (n) => n.tag === "label" && n.textContent === label).children[0];
  field("Front").value = "Bonjour";
  field("Back").value = "Hello";
  await button("Add card").handlers.click();
  button("Reveal answer").handlers.click();
  assert.ok(find(root, (n) => n.tag === "pre" && n.textContent === "Hello"));
  await button("Good").handlers.click();
  const description = rows.get("card1")[`${core}description`];
  const card = JSON.parse(description.slice("solid-memo-card/v1:".length));
  assert.ok(card.dueAt > Date.now());
  assert.equal(card.state.intervalDays, 1);
  await view({ root, store });
  assert.equal(button("Reveal answer"), undefined);
  const dueOnly = find(root, (n) => n.type === "checkbox");
  dueOnly.checked = false;
  dueOnly.handlers.change();
  assert.ok(button("Reveal answer"));
});
