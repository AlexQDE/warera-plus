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
// As the live DOM nests it: the dialog holds a full-screen backdrop first,
// then a wrapper with the card; the card holds the title, then a scrolling
// body (the counter, the game's filters, the rows), then CLOSE.
const PICKER = `<main></main><div role="dialog"><div class="backdrop"></div><div class="wrapper"><div class="card"><div class="x"><button aria-label="close"></button></div><div class="title"><span>Items</span></div><div class="body"><div class="scroller"><div class="content"><div>0/5<button>Clear</button></div><div class="filters"><button>All 4</button></div><div data-index="0">${[
  tile("winterJet", [270, "50%", "100%"]),
  tile("winterGun", [59, "10%", "100%"]),
  tile("winterGun", [59, "10%", "100%"]),
  tile("dieselChest", [70, "100%"]),
].join("")}</div></div></div><button>Close</button></div></div></div></div>`;

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

let equipment, state, rescan;
beforeEach(() => {
  document.body.innerHTML = PICKER;
  rescan = vi.fn();
  equipment = createEquipment({
    settings: () => ({ ...DEFAULTS }),
    requestSales: vi.fn(),
    rescan,
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
  it("puts its bar under the title when the dialog is the card itself, never in the close button's box", () => {
    // as read live on 2026-10-27, Sell an item and Quick dismantle alike: the card carries role="dialog"; its
    // first child is an absolutely placed box with the close button, then the title, then the body
    document.body.innerHTML = `<main></main><div role="dialog" class="card"><div class="x" style="position: absolute"><button aria-label="close"></button></div><div class="title"><span>Items</span></div><div class="body"><div>0/5<button>Clear</button></div><div data-index="0">${tile("winterJet", [270, "50%", "100%"])}</div><button>Close</button></div></div>`;
    equipment.render(state);
    const bar = document.querySelector(".ss-pick-bar");
    expect(bar.parentElement.getAttribute("role")).toBe("dialog");
    expect(bar.previousElementSibling.classList.contains("title")).toBe(true);
    expect(document.querySelector(".x .ss-pick-bar")).toBeNull();
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
  it("puts its bar in the card under the title, not in the full-screen backdrop", () => {
    equipment.render(state);
    const bar = document.querySelector(".ss-pick-bar");
    expect(bar.closest(".backdrop")).toBeNull();
    expect(bar.parentElement.className).toBe("card");
    expect(bar.previousElementSibling.className).toBe("title");
    // a second render keeps the one bar where it is
    equipment.render(state);
    expect(document.querySelectorAll(".ss-pick-bar")).toHaveLength(1);
  });
  it("asks for an extension reload when the page's code is newer than the worker's", () => {
    state.ledger = { windows: {} }; // a view without heldPieces: a worker from before 3.2
    equipment.render(state);
    expect(document.querySelector(".ss-pick-bar").textContent).toContain(
      "reload WarEra Plus",
    );
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

describe("flip and scrap candidates in the picker", () => {
  // the guns were bought at 4 and sell at 6 now (+50%); the chest sells at 300
  // while its 1,458 scraps fetch 364.5 at a 0.25 bid
  const valued = [
    held[0],
    ...held.slice(1).map((p) => ({ ...p, value: { value: 6, level: "same" } })),
    {
      code: "chest6",
      skills: { armor: 70 },
      source: "looted",
      cost: 0,
      value: { value: 300, level: "same" },
    },
  ];
  beforeEach(() => {
    state.ledger = { heldPieces: valued };
    state.book = {
      at: new Date().toISOString(),
      bids: [{ price: 0.25, quantity: 1e6 }],
    };
  });
  it("offers Flip for what was bought and now sells above the FLIP threshold, Scrap for what its scraps beat", () => {
    equipment.render(state);
    const bar = document.querySelector(".ss-pick-bar").textContent;
    expect(bar.replace(/\s+/g, " ")).toContain("↗ Flip 2");
    expect(bar.replace(/\s+/g, " ")).toContain("♻ Scrap 1");
    document.querySelector('[data-picker-source="flip"]').click();
    expect(cells().map((c) => c.dataset.ssPick)).toEqual([
      "hide",
      "show",
      "show",
      "hide",
    ]);
    document.querySelector('[data-picker-source="scrap"]').click();
    expect(cells().map((c) => c.dataset.ssPick)).toEqual([
      "hide",
      "hide",
      "hide",
      "show",
    ]);
    expect(badge(3).title).toContain("scraps 365 > sells 300");
  });
  it("works the same in the game's Quick dismantle window", () => {
    document.body.innerHTML = PICKER.replace(
      '<div class="title"><span>Items</span></div>',
      '<div class="title">Quick dismantle</div>',
    ).replace("0/5", "Equipped items are left out of select all.");
    equipment.render(state);
    const bar = document.querySelector(".ss-pick-bar");
    expect(bar.previousElementSibling.textContent).toBe("Quick dismantle");
    expect(badge(0).textContent).toBe("⚒");
  });
});

describe("the list by stats", () => {
  // the list clicks on timers (vlist.mjs waits 80 ms after a click): fake ones, moved on by hand, so no test sleeps
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  // a row of epic snipers in the game's own order, and a jet
  const SNIPERS = [
    [110, 19],
    [130, 20],
    [121, 20],
    [128, 20],
    [129, 19],
    [126, 18],
  ];
  const LIST = (page = "", title = "<span>Items</span>") =>
    `<main>${page}</main><div role="dialog"><div class="backdrop"></div><div class="wrapper"><div class="card"><div class="title">${title}</div><div class="body"><div class="scroller"><div class="content"><div>0/5<button>Clear</button></div><div data-index="0">${[
      ...SNIPERS.map(([a, c]) => tile("sniper", [a, `${c}%`, "100%"])),
      tile("winterJet", [270, "50%", "100%"]),
    ].join(
      "",
    )}</div></div></div><button>Close</button></div></div></div></div>`;
  const ctx = { bids: null, flipPct: 10, avg: { sniper: 300, jet: 480 } };
  /** Clicks on the game's tiles, by their place in the row; each selects or unselects, as the game's do. */
  const listen = () => {
    const picks = [];
    const chosen = new Set();
    const count = document.querySelector(".content > div");
    [...document.querySelectorAll(".tile")].forEach((t, i) =>
      t.addEventListener("click", () => {
        picks.push(i);
        if (chosen.has(i)) chosen.delete(i);
        else chosen.add(i);
        if (/^\d+\/5$/.test(count.firstChild.nodeValue))
          count.firstChild.nodeValue = `${chosen.size}/5`;
      }),
    );
    return { picks, chosen };
  };
  const sort = () => document.querySelector(".ss-pick-bar .lens-sort");
  const words = () => sort().textContent.replace(/\s+/g, " ");
  const open = async (code) => {
    equipment.picker(code, true, held, ctx);
    sort().querySelector("[data-sort-toggle]").click();
    await vi.advanceTimersByTimeAsync(0); // read at once: no layout here, so nothing to scroll
    expect(rescan).toHaveBeenCalled();
    equipment.picker(code, true, held, ctx);
  };

  it("reads nothing and lists nothing until asked: opening the window stays still", async () => {
    document.body.innerHTML = LIST();
    equipment.picker("sniper", true, held, ctx);
    await vi.advanceTimersByTimeAsync(50);
    expect(rescan).not.toHaveBeenCalled(); // no read of the list
    expect(sort().querySelector("[data-sort-pick]")).toBeNull();
    const toggle = sort().querySelector("[data-sort-toggle]");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(toggle.textContent).toContain("by crit");
    toggle.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(rescan).toHaveBeenCalled();
    equipment.picker("sniper", true, held, ctx);
    expect(sort().querySelectorAll("[data-sort-pick]").length).toBe(6);
    // the same button closes it again
    sort().querySelector("[data-sort-toggle]").click();
    expect(sort().querySelector("[data-sort-pick]")).toBeNull();
  });

  it("lists the market's item by crit, then attack, from the highest, valued, with what the market's filter lets through", async () => {
    document.body.innerHTML = LIST(
      '<input name="attack" value="125"><input name="criticalChance" value="20">',
    );
    await open("sniper");
    expect(words()).toMatch(/20%.*130.*128.*121.*19%.*129.*110.*18%.*126/);
    expect(words()).not.toContain("270"); // the jet is another item
    expect(words()).toContain("≈300"); // no sales of these stats held: the game's average
    // crit at least 20 and attack at least 125: two of them
    const through = [...sort().querySelectorAll("[data-sort-pick]")]
      .filter((b) => b.dataset.pass === "true")
      .map((b) => b.dataset.sortPick);
    expect(through).toEqual(["0:1", "0:3"]);
    expect(words()).toContain("2 of 6");
  });
  it("selects the piece clicked in the list by clicking its tile in the game's list once", async () => {
    document.body.innerHTML = LIST();
    const { picks, chosen } = listen();
    await open("sniper");
    sort().querySelector('[data-sort-pick="0:2"]').click(); // attack 121, crit 20
    await vi.advanceTimersByTimeAsync(300); // the first click has landed
    expect(picks).toEqual([2]);
    expect([...chosen]).toEqual([2]);
    // clicked again: it stays selected
    sort().querySelector('[data-sort-pick="0:2"]').click();
    await vi.advanceTimersByTimeAsync(300);
    expect(picks).toEqual([2, 2, 2]);
    expect([...chosen]).toEqual([2]);
  });
  it("offers the items in the window when the market names none, weapons first, and lists the one picked", async () => {
    document.body.innerHTML = LIST("", "Quick dismantle");
    await open(null);
    const codes = [...sort().querySelectorAll("[data-sort-code]")].map(
      (b) => b.dataset.sortCode,
    );
    expect(codes).toEqual(["sniper", "jet"]);
    expect(words()).toMatch(/20%.*130/);
    sort().querySelector('[data-sort-code="jet"]').click();
    expect(words()).toMatch(/50%.*270/);
    expect(words()).not.toMatch(/130/);
  });
  it("lists every piece of a crit, however many, each one clickable", async () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      tile("sniper", [130 - i, "20%", "100%"]),
    ).join("");
    document.body.innerHTML = LIST().replace(
      '<div data-index="0">',
      `<div data-index="0">${many}`,
    );
    await open("sniper");
    const crit20 = sort().querySelector(".lens-sort-g");
    expect(crit20.querySelectorAll("[data-sort-pick]").length).toBe(23); // the 20 added and three of the six
    expect(crit20.textContent).not.toMatch(/\+\d/);
  });
  it("never clicks a piece twice in a window that prints no counter, so it is not unselected", async () => {
    document.body.innerHTML = LIST("", "Quick dismantle").replace(
      "0/5",
      "Equipped items are left out of select all.",
    );
    const { picks } = listen();
    await open(null);
    sort().querySelector('[data-sort-pick="0:2"]').click();
    await vi.advanceTimersByTimeAsync(300); // the first click has landed
    expect(picks).toEqual([2]);
    sort().querySelector('[data-sort-pick="0:2"]').click();
    await vi.advanceTimersByTimeAsync(300);
    expect(picks).toEqual([2]);
    expect(words()).toContain("already selected");
  });
});
