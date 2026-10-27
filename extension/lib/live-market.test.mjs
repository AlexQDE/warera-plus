// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as dom from "./dom.mjs";
import { createEquipment } from "./equipment.mjs";
import { DEFAULTS } from "./settings.mjs";

const fixture = (sniper = false) => {
  window.history.replaceState(
    {},
    "",
    `/market/equipments${sniper ? "?item=sniper" : ""}`,
  );
  document.body.innerHTML = readFileSync(
    `fixtures/v027-live-market${sniper ? "-sniper" : ""}.html`,
    "utf8",
  );
};
beforeEach(() => fixture());
afterEach(() => vi.restoreAllMocks());

it("reads all three live armour cards without seller levels becoming stats", () => {
  expect(dom.cardRows).toBeTypeOf("function");
  const rows = dom.cardRows();
  expect(
    rows.map((r) => [
      r.code,
      r.rarity,
      r.stats.stats,
      r.stats.durability,
      r.price,
      r.ownOffer,
    ]),
  ).toEqual([
    ["gloves1", "common", [4], 100, 1.5, false],
    ["helmet1", "common", [3], 100, 1.5, false],
    ["chest1", "common", [1], 100, 1.5, false],
  ]);
  expect(dom.offerRows()).toHaveLength(0);
  expect(dom.offerButtonCount()).toBe(3);
});

it("reads exact taxed prices, not rounded cost chips or the selected item's average", () => {
  fixture(true);
  expect(dom.cardRows).toBeTypeOf("function");
  expect(
    dom
      .cardRows()
      .map((r) => [
        r.code,
        r.rarity,
        r.stats.stats,
        r.stats.durability,
        r.price,
      ]),
  ).toEqual([
    ["sniper", "epic", [102, 17], 100, 43.798],
    ["sniper", "epic", [103, 17], 100, 43.799],
    ["sniper", "epic", [103, 16], 100, 44.1],
  ]);
  expect(dom.statFilter(["attack", "criticalChance"])).toEqual({});
  document.querySelector('[name="attack"]').value = "110";
  document.querySelector('[name="criticalChance"]').value = "18";
  expect(dom.statFilter(["attack", "criticalChance"])).toEqual({
    attack: 110,
    criticalChance: 18,
  });
});

it("joins split prices and ages without reading buttons or its own annotations", () => {
  fixture(true);
  const first = dom.cardRows()[0];
  const label = [...first.row.querySelectorAll("span")].find(
    (e) => e.textContent === "tax incl.",
  );
  label.previousElementSibling.innerHTML = "43<span>.</span><span>798</span>";
  const age = [...first.row.querySelectorAll("span")].find(
    (e) => e.textContent === "2m",
  );
  age.innerHTML = "3h<span>47m</span>";
  first.tile.insertAdjacentHTML("beforeend", "<div data-lens>888%</div>");
  first.button.insertAdjacentHTML(
    "beforeend",
    "<span>999%</span><span>9d</span>",
  );
  first.row.insertAdjacentHTML(
    "beforeend",
    "<div data-lens>777<span>m</span></div>",
  );
  const read = dom.cardRows()[0];
  expect(read.price).toBe(43.798);
  expect(read.stats.stats).toEqual([102, 17]);
  expect(read.stats.durability).toBe(100);
  expect(read.lines.at(-1)).toBe("3h47m");
});

/** The tax-included price beside a card's "tax incl.", as the game writes it: the whole part, then a span with the point and the rest as text nodes of their own. */
const setPrice = (row, whole, ...rest) => {
  const label = [...row.querySelectorAll("span")].find(
    (e) => e.textContent === "tax incl.",
  );
  const amount = label.previousElementSibling.querySelector("span span");
  const inner = document.createElement("span");
  inner.append(whole);
  if (rest.length) {
    const decimals = document.createElement("span");
    decimals.append(...rest);
    inner.append(decimals);
  }
  amount.replaceChildren(inner);
};

it("reads a card priced in thousands or millions as the game prints it, and leaves a not-for-sale marker unread", () => {
  fixture(true);
  const [a, b, c] = dom.cardRows().map((r) => r.row);
  // the game's number format: three decimals of K from 1,000 up, of M from a million, of B from a billion
  setPrice(a, "1", ".", "001K");
  setPrice(b, "12", ".", "5M");
  setPrice(c, "1e+41B"); // 1e50, the price an offer not for sale carries
  expect(dom.cardRows().map((r) => [r.priceText, r.price])).toEqual([
    ["1.001K", 1001],
    ["12.5M", 12_500_000],
    ["1e+41B", null],
  ]);
  setPrice(a, "2", ".", "5B");
  setPrice(b, "7K");
  expect(dom.cardRows().map((r) => r.price)).toEqual([2.5e9, 7000, null]);
});

it("prints the price it measures against as the card prints it, named as what the buyer pays with tax", () => {
  fixture(true);
  const equipment = createEquipment({
    settings: () => ({ ...DEFAULTS, picker: false }),
    requestSales: vi.fn(),
  });
  const state = {
    book: {
      at: new Date().toISOString(),
      bids: [{ price: 0.2, quantity: 2000 }],
    },
  };
  setPrice(dom.cardRows()[2].row, "1", ".", "234K");
  equipment.render(state);
  const strips = [...document.querySelectorAll(".ss-verdict[data-card]")];
  expect(
    strips.map((s) => s.querySelector("small").textContent.split(" · ")[0]),
  ).toEqual([
    "pay 43.798 tax incl.",
    "pay 43.799 tax incl.",
    "pay 1.234K tax incl.",
  ]);
  // never the Buy chip's rounded 43.8
  expect(strips[0].textContent).not.toMatch(/43\.8(?!\d)/);
  strips[0].querySelector('[data-action="details"]').click();
  equipment.render(state);
  expect(strips[0].querySelector(".lens-details").textContent).toContain(
    "You pay 43.798 g, tax incl.",
  );
  equipment.clear();
});

it("keeps its strip inside the card: while it is there the card's own content takes its own height, not the whole card's", () => {
  // The card's content row is the card's full height (h: 100%, client module 98170), so a strip after it went
  // below the card, onto the next row of cards. jsdom lays nothing out: the rules are read off the stylesheet.
  const style = document.createElement("style");
  style.textContent = readFileSync("extension/content.css", "utf8");
  document.head.append(style);
  const rules = [...style.sheet.cssRules].filter((r) => r.selectorText);
  const release = rules.find((r) =>
    /:has\(>\s*\.ss-verdict\[data-card\]\)\s*>\s*div:not\(\[data-lens\]\)/.test(
      r.selectorText,
    ),
  );
  expect(release?.style.getPropertyValue("height")).toBe("auto");
  const strip = rules.find(
    (r) => r.selectorText === ".ss-verdict[data-lens][data-card]",
  );
  expect(
    parseFloat(strip.style.getPropertyValue("height")),
  ).toBeLessThanOrEqual(40);
  style.remove();
});

it("reads the new tax notice and its country's rate", () => {
  expect(dom.taxNotice()?.textContent).toContain("Prices include your tax");
  expect(dom.taxRateFromText(dom.taxNotice()?.textContent)).toBe(0);
  expect(
    dom.taxRateFromText(
      "the seller's price plus the 7.5% market tax of your country",
    ),
  ).toBe(7.5);
});

it("does not take an extension-owned explanation for the game's tax notice", () => {
  dom.taxNotice().remove();
  document.body.insertAdjacentHTML(
    "afterbegin",
    "<div data-lens><div><span>10% market tax</span></div></div>",
  );
  expect(dom.taxNotice()).toBeNull();
});

it("names the code from the stat ranges, checks the frame against it, and agrees with the URL when the stats do", () => {
  expect(dom.cardRows).toBeTypeOf("function");
  expect(dom.cardRows()[0]).toMatchObject({
    code: "gloves1",
    frameRarity: "common",
    frameAgrees: true,
  });
  const row = dom.cardRows()[0];
  row.tile.style.backgroundImage =
    "linear-gradient(45deg, rgb(59, 35, 95) 0%, rgb(15, 9, 25) 100%)";
  // a frame colour that disagrees is recorded, the stats still name the code
  expect(dom.cardRows()[0]).toMatchObject({
    code: "gloves1",
    frameRarity: "epic",
    frameAgrees: false,
  });
  window.history.replaceState({}, "", "/market/equipments?item=gloves1");
  expect(dom.cardRows()[0].code).toBe("gloves1");
});

it("reuses cached reads, excludes its own nodes, and invalidates changed prices", () => {
  expect(dom.cardRows).toBeTypeOf("function");
  const cache = dom.createRowCache();
  const first = dom.cardRows(document, dom.RARITY_PALETTE, cache);
  expect(cache.reads).toBe(3);
  first[0].row.insertAdjacentHTML(
    "beforeend",
    "<div data-lens><button>Buy999</button>999%</div>",
  );
  expect(dom.cardRows(document, dom.RARITY_PALETTE, cache)[0].stats).toBe(
    first[0].stats,
  );
  expect(cache.reads).toBe(3);
  expect(dom.offerButtonCount()).toBe(3);
  const label = [...first[0].row.querySelectorAll("span")].find(
    (e) => e.textContent === "tax incl.",
  );
  label.previousElementSibling.textContent = "1.501";
  expect(dom.cardRows(document, dom.RARITY_PALETTE, cache)[0].price).toBe(
    1.501,
  );
  expect(cache.reads).toBe(4);
});

it.each([false, true])(
  "annotates live cards in a bottom line and clears the unread warning (sniper=%s)",
  (sniper) => {
    fixture(sniper);
    const buttons = [...document.querySelectorAll("button")];
    const parents = buttons.map((b) => b.parentElement);
    const clicks = buttons.map((b) => vi.spyOn(b, "click"));
    const equipment = createEquipment({
      settings: () => ({ ...DEFAULTS, picker: false }),
      requestSales: vi.fn(),
    });
    const state = {
      book: {
        at: new Date().toISOString(),
        bids: [{ price: 0.3, quantity: 2000 }],
      },
    };
    const initial = equipment.render({});
    expect(initial.count).toBe(3);
    expect(document.querySelectorAll(".ss-verdict[data-card]")).toHaveLength(3);
    const lines = [...document.querySelectorAll(".ss-verdict")];
    equipment.render(state);
    expect(equipment.pulse()).not.toContain("offers not read");
    expect(document.querySelectorAll('[data-scrap-sniper="hit"]')).toHaveLength(
      3,
    );
    expect([...document.querySelectorAll(".ss-verdict")]).toEqual(lines);
    for (const [i, b] of buttons.entries()) {
      expect(b.parentElement).toBe(parents[i]);
      expect(clicks[i]).not.toHaveBeenCalled();
    }
    for (const line of lines)
      expect(line.parentElement.lastElementChild).toBe(line);
    equipment.clear();
  },
);

it("reads an own offer but never tags it", () => {
  expect(dom.cardRows).toBeTypeOf("function");
  const first = dom.cardRows()[0];
  first.button.textContent = "Withdraw";
  first.row
    .querySelector('a[href^="/user/"]')
    .parentElement.insertAdjacentHTML("afterend", "<span>Yours</span>");
  expect(dom.cardRows()[0].ownOffer).toBe(true);
  const equipment = createEquipment({
    settings: () => DEFAULTS,
    requestSales: vi.fn(),
  });
  const result = equipment.render({
    book: {
      at: new Date().toISOString(),
      bids: [{ price: 0.3, quantity: 2000 }],
    },
  });
  expect(first.row.querySelector("[data-lens]")).toBeNull();
  expect(first.row.hasAttribute("data-scrap-sniper")).toBe(false);
  expect(dom.offerButtonCount()).toBe(2);
  expect(result.hits).toBe(2);
  // the player's own listing is not an ask to undercut
  expect(equipment.asks("gloves1")).toEqual([]);
  expect(equipment.asks("helmet1")).toHaveLength(1);
  equipment.clear();
});

it("dates every card's ask by the age it prints", () => {
  fixture(true);
  expect(dom.cardRows().map((r) => r.lines.at(-1))).toEqual([
    "2m",
    "3m",
    "12m",
  ]);
  const equipment = createEquipment({
    settings: () => ({ ...DEFAULTS, picker: false }),
    requestSales: vi.fn(),
  });
  equipment.render({
    book: {
      at: new Date().toISOString(),
      bids: [{ price: 0.2, quantity: 2000 }],
    },
  });
  expect(equipment.asks("sniper").map((a) => [a.price, a.ageMin])).toEqual([
    [43.798, 2],
    [43.799, 3],
    [44.1, 12],
  ]);
  // a minute on, with the extension's own line now in every card: the card
  // is read again and dated by its new age alone
  const first = dom.cardRows()[0];
  expect(first.row.querySelector(".ss-verdict[data-lens]")).not.toBeNull();
  const age = [...first.row.querySelectorAll("span")].find(
    (e) => e.textContent === "2m",
  );
  age.textContent = "3m";
  equipment.render({
    book: {
      at: new Date().toISOString(),
      bids: [{ price: 0.2, quantity: 2000 }],
    },
  });
  expect(equipment.asks("sniper")[0].ageMin).toBe(3);
  equipment.clear();
});

it("trusts the cards' stats over an address that changed before the list did", () => {
  // the address names the sniper a frame before the game replaces the
  // gloves, helmet and chest cards
  window.history.replaceState({}, "", "/market/equipments?item=sniper");
  expect(dom.cardRows().map((r) => r.code)).toEqual([
    "gloves1",
    "helmet1",
    "chest1",
  ]);
  // stats out of every range fit no tier: no code, whatever the address says
  const first = dom.cardRows()[0];
  first.tile.querySelector("span span").textContent = "99";
  expect(dom.cardRows()[0].code).toBeNull();
  window.history.replaceState({}, "", "/market/equipments?item=gloves3");
  expect(dom.cardRows()[0].code).toBeNull();
});

it("says in Details when the frame's colours name another tier than the stats", () => {
  const equipment = createEquipment({
    settings: () => ({ ...DEFAULTS, picker: false }),
    requestSales: vi.fn(),
  });
  const state = {
    book: {
      at: new Date().toISOString(),
      bids: [{ price: 0.2, quantity: 2000 }],
    },
  };
  dom.cardRows()[0].tile.style.backgroundImage =
    "linear-gradient(45deg, rgb(59, 35, 95) 0%, rgb(15, 9, 25) 100%)";
  equipment.render(state);
  const strip = document.querySelector(".ss-verdict[data-card]");
  strip.querySelector('[data-action="details"]').click();
  equipment.render(state);
  expect(strip.querySelector(".lens-details").textContent).toContain(
    "The frame's colours say epic; the stats name common, and the stats price it",
  );
  equipment.clear();
});

it("keeps the live cards' PASS, NEAR MISS, FLIP and STALE verdicts", () => {
  fixture(true);
  const settings = { ...DEFAULTS, picker: false };
  const equipment = createEquipment({
    settings: () => settings,
    requestSales: vi.fn(),
  });
  const at = new Date().toISOString();
  const state = { book: { at, bids: [{ price: 0.2, quantity: 2000 }] } };
  const tag = () => document.querySelector(".ss-verdict .lens-tag").textContent;
  equipment.render(state);
  expect(tag()).toBe("PASS");
  settings.minMarginPct = -10;
  state.book.bids[0].price = 0.26;
  equipment.render(state);
  expect(tag()).toBe("NEAR MISS");
  equipment.render({
    ...state,
    salesByCode: {
      sniper: {
        at,
        complete: true,
        code: "sniper",
        fills: [52, 53, 54].map((price) => ({
          price,
          at,
          code: "sniper",
          state: 100,
          skills: { attack: 102, criticalChance: 17 },
        })),
      },
    },
  });
  expect(tag()).toBe("FLIP");
  equipment.render({ ...state, book: { ...state.book, at: "2000-01-01" } });
  expect(tag()).toBe("STALE");
  equipment.clear();
});
