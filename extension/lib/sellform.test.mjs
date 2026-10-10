// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
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
