// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { suggestPrice } from "./pricing.mjs";
import { startLens } from "./app.mjs";
import { DEFAULTS } from "./settings.mjs";
import {
  findSellForm,
  readSellForm,
  renderSellHint,
  sellHintHtml,
} from "./sellform.mjs";

// The sell form as read live on 2026-10-10 with one mythic jet picked: the
// picked tile, the item's name and rarity, the game's "Market average", the
// PRICE input prefilled with the game's "Suggested price", and the range it
// allows (353 to 806.5, 0.7-1.6x of the suggestion).
const jet = `<div class="tile" style="background-image: linear-gradient(45deg, red, black)"><img alt="winterJet" src="x.png"><div>270</div><div>50<b>%</b></div><div>100<b>%</b></div></div>`;
const FORM = (tiles = jet) =>
  `<main></main><div role="dialog"><div class="backdrop"></div><div class="wrapper"><div class="card"><div>Sell an item</div><div class="slots">${tiles}<div>+</div></div><div>Items</div><div>Fighter Jet</div><div>Mythic</div><div>Market average <span>484.55</span></div><div class="block"><label><span>PRICE</span><div><div><input name="price" value="504.177"></div><button>-</button><button>+</button></div></label><div>Suggested price <span>504.177</span></div><div class="range"><span>353</span><span>504.177</span><span>806.5</span></div></div><div>You receive <span>504.177</span></div><button>Close</button><button>Put on sale</button></div></div></div>`;

const NOW = Date.parse("2026-10-27T12:00:00Z");
const tankFills = [
  ...[199, 200, 201].map((price) => ({
    price,
    skills: { attack: 168, criticalChance: 33 },
  })),
  ...[163, 164, 164, 164, 165].map((price) => ({
    price,
    skills: { attack: 147, criticalChance: 33 },
  })),
].map((f, i) => ({
  ...f,
  at: new Date(NOW - (i + 1) * 3600e3).toISOString(),
  state: 100,
  code: "tank",
}));

function liveSell(attack = 147) {
  document.body.innerHTML = readFileSync(
    "fixtures/v027-live-sell.html",
    "utf8",
  );
  for (const img of document.querySelectorAll('img[alt="hamsterTank"]')) {
    if (!img.closest("li"))
      img.parentElement.parentElement.querySelector("span span").textContent =
        String(attack);
  }
  return document.querySelector('[role="dialog"]');
}

function pricePiece(piece, fills = tankFills) {
  return {
    code: piece.code,
    game: piece.game,
    s: suggestPrice({
      code: piece.code,
      skills: piece.skills,
      fills,
      asks: piece.asks,
      game: piece.game,
      now: NOW,
    }),
  };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("the sell form", () => {
  it("finds the form and reads the picked pieces, the game's estimate and the range it allows", () => {
    document.body.innerHTML = FORM();
    const form = findSellForm();
    expect(form).not.toBeNull();
    const read = readSellForm(form);
    expect(read.input.name).toBe("price");
    expect(read.items).toEqual([
      {
        code: "jet",
        stats: [270, 50],
        skills: { attack: 270, criticalChance: 50 },
      },
    ]);
    expect(read.game).toEqual({
      average: 484.55,
      suggested: 504.177,
      min: 353,
      max: 806.5,
    });
    document.body.innerHTML = "<main></main>";
    expect(findSellForm()).toBeNull();
  });
  it("puts one line under PRICE, and Use writes the price into the game's input without listing anything", () => {
    document.body.innerHTML = FORM();
    const form = findSellForm();
    const read = readSellForm(form);
    const html = sellHintHtml([
      {
        code: "jet",
        s: {
          price: 471.9,
          why: "first in line",
          sold: {
            value: 485,
            n: 12,
            level: "same",
            hours: 24,
            label: "12 same · 24 h",
          },
          floor: { price: 471.901, ageMin: 10 },
          trend: 0.04,
          rising: true,
          clamped: false,
        },
      },
    ]);
    const typed = vi.fn();
    read.input.addEventListener("input", (e) => typed(e.target.value));
    const sale = vi.fn();
    [...form.querySelectorAll("button")]
      .find((b) => b.textContent === "Put on sale")
      .addEventListener("click", sale);
    renderSellHint(read, html);
    renderSellHint(read, html); // a second scan keeps one line
    const hints = form.querySelectorAll(".ss-sell");
    expect(hints).toHaveLength(1);
    expect(hints[0].previousElementSibling.tagName).toBe("LABEL");
    const text = hints[0].textContent.replace(/\s+/g, " ");
    expect(text).toContain("471.9 first in line");
    expect(text).toContain("sold 485 · 12 same · 24 h");
    expect(text).toContain("ask 472 · 10 min");
    expect(text).toContain("rising");
    hints[0].querySelector("[data-sell-use]").click();
    expect(read.input.value).toBe("471.9");
    expect(typed).toHaveBeenCalledWith("471.9");
    expect(sale).not.toHaveBeenCalled();
  });
  it("says when the ask it lists under is a piece of better stats", () => {
    const div = document.createElement("div");
    div.innerHTML = sellHintHtml([
      {
        code: "jet",
        s: {
          price: 534.998,
          why: "under better stats",
          sold: {
            value: 494,
            n: 5,
            level: "same",
            hours: 24,
            label: "5 same · 24 h",
          },
          floor: { price: 534.999, ageMin: 46, better: true },
          trend: null,
          rising: false,
          clamped: false,
        },
      },
    ]);
    const text = div.textContent.replace(/\s+/g, " ");
    expect(text).toContain("534.998 under better stats");
    expect(text).toContain("better ask 535 · 46 min");
  });
  it("says the sales need the API key when there is none to read them with", () => {
    const div = document.createElement("div");
    div.innerHTML = sellHintHtml([
      {
        code: "boots5",
        noKey: true,
        s: {
          price: 190,
          why: "the game's estimate",
          sold: { value: null, n: 0, level: null, hours: null, label: "" },
          floor: null,
          trend: null,
          rising: false,
          clamped: false,
        },
      },
    ]);
    const text = div.textContent.replace(/\s+/g, " ");
    expect(text).toContain("190 the game's estimate");
    expect(text).toContain("sales need your API key");
  });
  it("says to list apart when the picked pieces are worth very different prices", () => {
    const one = (code, price) => ({
      code,
      s: {
        price,
        why: "what sells",
        sold: {
          value: price,
          n: 3,
          level: "same",
          hours: 24,
          label: "3 same · 24 h",
        },
        floor: null,
        trend: null,
        rising: false,
        clamped: false,
      },
    });
    const html = sellHintHtml([one("jet", 471.9), one("tank", 180)]);
    const div = document.createElement("div");
    div.innerHTML = html;
    const text = div.textContent.replace(/\s+/g, " ");
    // one price would sell the jet at the tank's: no Use, a warning with each piece's price
    expect(text).toContain("list apart: jet 472 · tank 180");
    expect(div.querySelector("[data-sell-use]")).toBeNull();
    // a piece whose sales are still being read: wait for them rather than show the game's estimate first
    div.innerHTML = sellHintHtml([{ code: "jet", s: null }]);
    expect(div.textContent).toContain("reading the sales");
    expect(div.querySelector("[data-sell-use]")).toBeNull();
    // close enough: one price for all, the lowest, so none sits above what it sells for
    const near = sellHintHtml([one("tank", 180), one("tank", 175)]);
    div.innerHTML = near;
    expect(div.textContent.replace(/\s+/g, " ")).toContain("175 for all");
    expect(div.querySelector("[data-sell-use]").dataset.sellUse).toBe("175");
  });
});

describe("the v0.27 sell window", () => {
  it("finds the dialog and reads each picked piece, its starting price, range and similar offers", () => {
    const form = liveSell();
    expect(findSellForm()).toBe(form);
    const read = readSellForm(form);
    expect(read.perItem).toBe(true);
    expect(read.items).toHaveLength(2); // neither slot copies nor offers are picked pieces
    expect(read.items[0]).toMatchObject({
      code: "tank",
      stats: [147, 33],
      skills: { attack: 147, criticalChance: 33 },
      itemId: "6ae09befd6a885ddc946d478",
      game: { suggested: 164.99, min: 122.654, max: 280.352 },
      asks: [
        { price: 163.9, skills: { attack: 148, criticalChance: 33 } },
        { price: 164.99, skills: { attack: 147, criticalChance: 33 } },
        { price: 166.3, skills: { attack: 147, criticalChance: 33 } },
      ],
    });
    expect(read.items[1]).toMatchObject({
      code: "boots5",
      stats: [32],
      skills: { dodge: 32 },
      itemId: "6ae09befd6a885ddc946d479",
      game: { suggested: 190, min: 133, max: 304 },
      asks: [{ price: 192.5, skills: { dodge: 32 } }],
    });
    for (const piece of read.items) {
      expect(piece.input.name).toBe(`price-${piece.itemId}`);
      expect(piece.form.contains(piece.input)).toBe(true);
      expect(piece.form.querySelectorAll('input[name^="price-"]')).toHaveLength(
        1,
      );
    }
  });

  it("keeps the first-seen starting price per itemId through typing, reordering and replacing an input", () => {
    const form = liveSell();
    const [tank, boots] = readSellForm(form).items;
    tank.input.value = "210";
    boots.input.value = "199";
    const replacement = tank.input.cloneNode(true);
    replacement.value = "220";
    tank.input.replaceWith(replacement);
    tank.form.parentElement.before(boots.form.parentElement);
    const items = readSellForm(form).items;
    expect(items.find((p) => p.itemId === tank.itemId).game.suggested).toBe(
      164.99,
    );
    expect(items.find((p) => p.itemId === boots.itemId).game.suggested).toBe(
      190,
    );
    form.remove();
    const reopened = liveSell();
    reopened.querySelector('input[name^="price-"]').value = "175";
    expect(readSellForm(reopened).items[0].game.suggested).toBe(175);
  });

  it("finds the window when its title runs straight into the first tile's numbers, as the live DOM has it", () => {
    const form = liveSell();
    // the live dialog has no whitespace between its nodes: "Sell items27050%100%Items…"
    const walker = document.createTreeWalker(form, window.NodeFilter.SHOW_TEXT);
    const blank = [];
    while (walker.nextNode())
      if (!walker.currentNode.nodeValue.trim()) blank.push(walker.currentNode);
    for (const n of blank) n.remove();
    expect(form.textContent).toMatch(/^×?Sell items\d/);
    expect(findSellForm()).toBe(form);
    expect(readSellForm(form).items).toHaveLength(2);
  });

  it("reads offers and a range printed in thousands, and waits for the game's start when the input comes up empty", () => {
    const form = liveSell();
    // the game splits "1.234K" at its point, as on the market's cards
    const spans = [...form.querySelector("ul li").querySelectorAll("span")];
    spans.find((s) => s.textContent === "163").textContent = "1";
    spans.find((s) => s.textContent === ".9").textContent = ".234K";
    const range = [...form.querySelectorAll("span")];
    range.find((s) => s.textContent === "122.654").textContent = "1.5K";
    range.find((s) => s.textContent === "280.352").textContent = "2.8K";
    const [tank] = readSellForm(form).items;
    expect(tank.asks[0].price).toBe(1234);
    expect(tank.game).toMatchObject({ min: 1500, max: 2800 });
    form.remove();
    const empty = liveSell();
    const input = empty.querySelector('input[name^="price-"]');
    input.value = "";
    expect(readSellForm(empty).items[0].game.suggested).toBeNull();
    input.value = "171.5";
    expect(readSellForm(empty).items[0].game.suggested).toBe(171.5);
  });

  it("prices a high-attack tank from both stats and warns about the game's lower starting price", () => {
    const form = liveSell(168);
    const [tank] = readSellForm(form).items;
    const pick = pricePiece(tank);
    expect(pick.s).toMatchObject({
      price: 200,
      fair: 200,
      sold: { level: "same", n: 3 },
      floor: null,
    });
    renderSellHint(tank, sellHintHtml([pick]));
    const hint = form.querySelector(".ss-sell");
    expect(hint.textContent).toContain("200 what sells");
    expect(hint.textContent).toContain("sold 200 · 3 same · 24 h");
    expect(hint.querySelector(".lens-neg").textContent).toBe(
      "the game starts you at 164.99 from an offer with other stats; pieces with these stats sell ≈ 200",
    );
  });

  it("warns only when the start is more than 5% below same- or similar-stat fair value", () => {
    const [tank] = readSellForm(liveSell(168)).items;
    const pick = pricePiece(tank);
    const div = document.createElement("div");
    const warning = (start, level) => {
      div.innerHTML = sellHintHtml([
        {
          ...pick,
          game: { suggested: start },
          s: { ...pick.s, sold: { ...pick.s.sold, level } },
        },
      ]);
      return div.querySelector(".lens-neg");
    };
    expect(warning(164.99, "similar")).not.toBeNull();
    expect(warning(190, "same")).toBeNull();
    expect(warning(189.999, "same")).not.toBeNull();
    expect(warning(164.99, "item")).toBeNull();
    expect(warning(null, "same")).toBeNull();
  });

  it("keeps two hints and their use buttons separate, stops every hint click and never submits", () => {
    const form = liveSell(168);
    const read = readSellForm(form);
    const [tank, boots] = read.items;
    const tankPick = pricePiece(tank);
    const bootPick = pricePiece(boots, []);
    const dialogClick = vi.fn();
    form.addEventListener("click", dialogClick);
    const submitted = vi.fn((e) => e.preventDefault());
    form.querySelector("form").addEventListener("submit", submitted);
    const inputs = [vi.fn(), vi.fn()];
    read.items.forEach((p, i) => p.input.addEventListener("input", inputs[i]));
    for (let i = 0; i < 2; i++) {
      renderSellHint(tank, sellHintHtml([tankPick]));
      renderSellHint(boots, sellHintHtml([bootPick]));
    }
    const hints = [...form.querySelectorAll(".ss-sell")];
    expect(hints).toHaveLength(2);
    expect(
      hints.every((h) => h.previousElementSibling.tagName === "LABEL"),
    ).toBe(true);
    expect(form.textContent).not.toContain("list apart");
    // A framework-owned instance setter must be bypassed, like the existing form does.
    const instanceSetter = vi.fn();
    Object.defineProperty(tank.input, "value", {
      configurable: true,
      get() {
        return Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value",
        ).get.call(this);
      },
      set: instanceSetter,
    });
    hints[0].querySelector("b").click();
    hints[0].querySelector(".lens-neg").click();
    hints[0].click();
    hints[0].querySelector("[data-sell-use]").click();
    expect(tank.input.value).toBe("200");
    expect(boots.input.value).toBe("190");
    expect(instanceSetter).not.toHaveBeenCalled();
    expect(inputs[0]).toHaveBeenCalledTimes(1);
    expect(inputs[0].mock.calls[0][0].bubbles).toBe(true);
    expect(inputs[1]).not.toHaveBeenCalled();
    hints[1].querySelector("[data-sell-use]").click();
    expect(boots.input.value).toBe("192.499");
    expect(tank.input.value).toBe("200");
    expect(inputs[1]).toHaveBeenCalledTimes(1);
    expect(dialogClick).not.toHaveBeenCalled();
    expect(submitted).not.toHaveBeenCalled();
  });

  it("wires each piece to its own sales, dialog asks and cached market asks", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    let app;
    try {
      window.history.replaceState({}, "", "/market/equipments");
      document.body.innerHTML = readFileSync(
        "fixtures/v027-live-market.html",
        "utf8",
      )
        .replaceAll("gsg9Gloves", "dieselBoots")
        .replace("<span><span>4</span>%", "<span><span>32</span>%")
        .replaceAll("1<span>.5</span>", "188<span>.4</span>");
      const runtime = {
        sendMessage: vi.fn(async (msg) => {
          if (msg.type === "getSettings")
            return {
              settings: { ...DEFAULTS },
              hasKey: true,
              revision: 1,
              authRevision: 1,
            };
          if (msg.type === "sales")
            return {
              sales: {
                code: msg.itemCode,
                at: new Date(NOW).toISOString(),
                complete: true,
                fills: msg.itemCode === "tank" ? tankFills : [],
              },
            };
          return {};
        }),
      };
      app = await startLens(runtime);
      await vi.advanceTimersByTimeAsync(1000);
      // The offer from the last market scan remains useful in an inventory sale.
      window.history.replaceState({}, "", "/inventory");
      const form = liveSell(168);
      app.scan();
      await vi.advanceTimersByTimeAsync(1500);
      const codes = runtime.sendMessage.mock.calls
        .filter(([m]) => m.type === "sales")
        .map(([m]) => m.itemCode);
      expect(codes).toContain("tank");
      expect(codes).toContain("boots5");
      const hints = [...form.querySelectorAll(".ss-sell")];
      expect(hints).toHaveLength(2);
      expect(hints[0].textContent).toContain("200 what sells");
      expect(hints[0].querySelector(".lens-neg")).not.toBeNull();
      expect(hints[1].textContent).toContain("188.399 first in line");
    } finally {
      app?.dispose();
      vi.useRealTimers();
      window.history.replaceState({}, "", "/");
    }
  });
});
