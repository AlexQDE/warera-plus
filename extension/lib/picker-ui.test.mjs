// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { createEquipment } from "./equipment.mjs";
import { DEFAULTS } from "./settings.mjs";
import { tileTokens } from "./picker.mjs";

// The v0.27 inventory picker as read live on 2026-10-10: a dialog that starts
// "Items0/5", rows of tiles in a virtual list (data-index), each tile a
// gradient-backed box holding the skin image and its numbers, every "%" in
// a text node of its own.
const tile = (alt, numbers) =>
  `<div class="cell"><div class="tile" style="background-image: linear-gradient(45deg, rgb(66, 18, 19) 0%, rgb(19, 5, 5) 100%); position: relative"><div><img alt="${alt}" src="x.png"></div><div>${numbers
    .map((n) =>
      typeof n === "string"
        ? `<div><b>${n.slice(0, -1)}</b>%</div>`
        : `<div>${n}</div>`,
    )
    .join("")}</div></div></div>`;
const PICKER = `<main></main><div role="dialog"><div class="card"><div>Items</div><div>0/5</div><div data-index="0">${[
  tile("winterJet", [270, "50%", "100%"]),
  tile("winterGun", [59, "10%", "100%"]),
  tile("winterGun", [59, "10%", "100%"]),
  tile("dieselChest", [70, "100%"]),
].join("")}</div><button>Close</button></div></div>`;

const held = [
  {
    code: "jet",
    skills: { attack: 270, criticalChance: 50 },
    source: "crafted",
    at: "2026-10-10T10:00:00Z",
    cost: 380.4,
    value: { value: 420, label: "3 same · 24 h", level: "same", hours: 24 },
  },
  {
    code: "gun",
    skills: { attack: 59, criticalChance: 10 },
    source: "bought",
    cost: 4,
  },
  {
    code: "gun",
    skills: { attack: 59, criticalChance: 10 },
    source: "looted",
    cost: 0,
  },
  {
    code: "gun",
    skills: { attack: 59, criticalChance: 10 },
    source: "bought",
    cost: 4,
  },
];

let equipment, state;
beforeEach(() => {
  document.body.innerHTML = PICKER;
  equipment = createEquipment({
    settings: () => ({ ...DEFAULTS }),
    requestSales: vi.fn(),
    rescan: vi.fn(),
  });
  state = {
    book: {
      at: new Date().toISOString(),
      bids: [{ price: 0.2, quantity: 1e6 }],
    },
    error: null,
    salesErrors: {},
    salesReading: null,
    busy: false,
    setup: null,
    salesByCode: {},
    avg: null,
    ledger: { heldPieces: held },
    craftsUserId: "697b55e4bcecf3b37667e0d1",
  };
});
afterEach(() => {
  equipment.clear();
  document.body.innerHTML = "";
});
const cells = () => [...document.querySelectorAll(".cell")];
const badge = (i) => cells()[i].querySelector(".ss-src-badge");

describe("the inventory picker", () => {
  it("reads a tile's numbers off its text nodes, a % joined to the number before it", () => {
    expect(tileTokens(document.querySelector(".tile"))).toEqual([
      "270",
      "50%",
      "100%",
    ]);
  });
  it("marks every tile with how it came, identical pieces with every way, unknown ones with ?", () => {
    equipment.render(state);
    expect(badge(0).textContent).toBe("⚒");
    expect(badge(0).title).toContain("Crafted");
    expect(badge(0).title).toContain("cost 380");
    expect(badge(0).title).toContain("sells 420");
    expect(badge(1).textContent).toBe("↓/✦");
    expect(badge(1).title).toBe("3 identical: 2 bought · 1 loot");
    expect(badge(3).textContent).toBe("?");
    expect(badge(3).title).toContain("not in your history");
    const bar = document.querySelector(".ss-pick-bar");
    expect(bar.textContent.replace(/\s+/g, " ")).toContain("⚒ Crafted 1");
    expect(bar.textContent.replace(/\s+/g, " ")).toContain("↓ Bought 2");
  });
  it("dims, never hides, what another source brought; All brings everything back", () => {
    equipment.render(state);
    document.querySelector('[data-picker-source="crafted"]').click();
    expect(cells().map((c) => c.dataset.ssPick)).toEqual([
      "show",
      "hide",
      "hide",
      "hide",
    ]);
    document.querySelector('[data-picker-source="looted"]').click();
    // the guns came both ways: they stay lit under either
    expect(cells().map((c) => c.dataset.ssPick)).toEqual([
      "hide",
      "show",
      "show",
      "hide",
    ]);
    document.querySelector('[data-picker-source="all"]').click();
    expect(cells().every((c) => c.dataset.ssPick === "show")).toBe(true);
  });
  it("says what is missing when no history can be read, instead of waiting for ever", () => {
    state.craftsUserId = null;
    state.ledger = null;
    equipment.render(state);
    expect(document.querySelector(".ss-pick-bar").textContent).toContain(
      "turn on Craft",
    );
    expect(document.querySelector(".ss-src-badge")).toBeNull();
  });
  it("waits for the history before it offers the filter", () => {
    state.ledger = null;
    equipment.render(state);
    expect(document.querySelector(".ss-pick-bar").textContent).toContain(
      "reading your history",
    );
    expect(document.querySelector(".ss-src-badge")).toBeNull();
    expect(document.querySelector("[data-picker-source]")).toBeNull();
  });
});
