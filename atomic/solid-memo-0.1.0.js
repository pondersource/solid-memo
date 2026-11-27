// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

                                              

/** The three values the SM-2 algorithm transitions. */
                           
                     
                       
                      
 

export const MIN_EASE_FACTOR = 1.3;

/** The highest ease factor: 25 grades of 5 in a row from the start. */
export const MAX_EASE_FACTOR = 5;

/** The longest interval, in days: 100 years, for SM-2 and FSRS-6 alike. */
export const MAX_INTERVAL_DAYS = 36_500;

export const INITIAL_SM2_STATE           = {
  easeFactor: 2.5,
  intervalDays: 0,
  repetitions: 0,
};

/**
 * One SM-2 transition (SuperMemo 2). Source: Woźniak, P. A. (1990).
 * Optimization of learning. Master's thesis, University of Technology
 * in Poznań. Described at
 * https://www.supermemo.com/en/blog/application-of-a-computer-to-improve-the-results-obtained-in-working-with-the-supermemo-method
 * (docs/srs.md, which also says where Solid Memo departs from it).
 *
 * quality >= 3 (correct): repetitions increments; the ease factor is
 * updated first and the new value is used for the interval growth.
 * quality < 3 (lapse): repetitions and interval reset, ease factor kept.
 *
 * The state read is bounded first (boundedSm2State), and the one given
 * keeps the ease factor from 1.3 to 5 and the interval from 1 to 36,500
 * days, so that a state from elsewhere still gives a due day that can
 * be written.
 */
export function applySm2(read          , quality               )           {
  const state = boundedSm2State(read);
  if (quality < 3) {
    return {
      easeFactor: state.easeFactor,
      intervalDays: 1,
      repetitions: 0,
    };
  }

  const easeFactor = nextEaseFactor(state.easeFactor, quality);
  const repetitions = state.repetitions + 1;
  return {
    easeFactor,
    repetitions,
    intervalDays: nextInterval(repetitions, state.intervalDays, easeFactor),
  };
}

/**
 * An SM-2 state within the bounds Solid Memo keeps (docs/srs.md): the
 * ease factor from 1.3 to 5, the interval and the repetitions from 0
 * to 36,500. A state with a value that is not a finite number counts as
 * a new one. Bounded, a state from elsewhere is written back as numbers
 * the write check accepts.
 */
export function boundedSm2State(state          )           {
  const { easeFactor, intervalDays, repetitions } = state;
  if (![easeFactor, intervalDays, repetitions].every(Number.isFinite)) return INITIAL_SM2_STATE;
  return {
    easeFactor: clamp(easeFactor, MIN_EASE_FACTOR, MAX_EASE_FACTOR),
    intervalDays: clamp(intervalDays, 0, MAX_INTERVAL_DAYS),
    repetitions: clamp(repetitions, 0, MAX_INTERVAL_DAYS),
  };
}

function clamp(value        , min        , max        )         {
  return Math.min(max, Math.max(min, value));
}

function nextEaseFactor(easeFactor        , quality               )         {
  const q = 5 - quality;
  const updated = easeFactor + (0.1 - q * (0.08 + q * 0.02));
  return clamp(updated, MIN_EASE_FACTOR, MAX_EASE_FACTOR);
}

function nextInterval(
  repetitions        ,
  previousIntervalDays        ,
  easeFactor        ,
)         {
  if (repetitions === 1) return 1;
  if (repetitions === 2) return 6;
  return clamp(Math.round(previousIntervalDays * easeFactor), 1, MAX_INTERVAL_DAYS);
}

// SPDX-FileCopyrightText: 2026 Ponder Source contributors
//
// SPDX-License-Identifier: MIT


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
