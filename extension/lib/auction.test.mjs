// @vitest-environment jsdom
// The v0.27 auction house, read off the dev server's own markup (fixtures/v027-auctions.json, read
// 2026-10-17): every text node as the page had it, so "277", ".", "927" and "5h", "35m", "28s" stay apart.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, it, expect } from "vitest";
import {
  auctionRows,
  auctionTokens,
  offerRows,
  offerButtonCount,
} from "./dom.mjs";
import { readStatBlock } from "./offers.mjs";

// jsdom replaces the global URL, which node:fs does not take: resolve the path as a string
const FIXTURE = JSON.parse(
  readFileSync(
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../fixtures/v027-auctions.json",
    ),
    "utf8",
  ),
);
/** An element tree of the fixture as live nodes; styles as inline styles. */
function build(t) {
  if (typeof t === "string") return document.createTextNode(t);
  const [tag, attrs, ...kids] = t;
  const el =
    tag === "svg"
      ? document.createElementNS("http://www.w3.org/2000/svg", "svg")
      : document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k !== "_s") {
      el.setAttribute(k, v);
      continue;
    }
    const style = [
      v.bi ? "background-image: linear-gradient(45deg, red, black)" : "",
      v.bc ? `background-color: ${v.bc}` : "",
      v.bd ? `border: 1px solid ${v.bd}` : "",
      v.tf ? `transform: ${v.tf}` : "",
    ].filter(Boolean);
    el.setAttribute("style", style.join("; "));
  }
  for (const kid of kids) el.appendChild(build(kid));
  return el;
}
export function auctionPage(cards = FIXTURE.cards) {
  document.body.innerHTML =
    '<main><section id="market"></section><div id="list"></div></main>';
  document.getElementById("market").appendChild(build(FIXTURE.notice));
  for (const c of cards) document.getElementById("list").appendChild(build(c));
}

beforeEach(() => auctionPage());
afterEach(() => {
  document.body.innerHTML = "";
});

describe("the v0.27 auction cards", () => {
  it("reads a card without bids: the stats, the countdown, the start and max before tax, the buttons with it", () => {
    const [tank] = auctionRows();
    expect(tank).toMatchObject({
      kind: "auction",
      alt: "tank",
      price: 305.72,
      priceText: "305.72",
      bid: 218.9,
      start: 199,
      max: 277.927,
      ends: "5h35m28s",
    });
    expect(readStatBlock(tank.tokens)).toMatchObject({
      readable: true,
      stats: [151, 33],
      durability: 100,
    });
  });
  it("reads a skinned card and a card that has bids (its current bid takes the start's place)", () => {
    const [, mythic, elite] = auctionRows();
    expect(mythic).toMatchObject({
      alt: "vampireCountessGloves",
      start: 600,
      max: 639.35,
      price: 703.28,
      bid: 660,
      ends: "6d23h26m6s",
    });
    expect(readStatBlock(mythic.tokens).stats).toEqual([60]);
    expect(elite).toMatchObject({
      start: 25.9,
      max: 141.122,
      price: 155.23,
      bid: 29.91,
      ends: "22h23m52s",
    });
    expect(auctionRows()).toHaveLength(3);
  });
  it("skips a card without the buy-now and bid pair (an own auction, an ended one)", () => {
    const cards = document.querySelectorAll("#list > div");
    // no bid button left: one priced button
    [...cards[0].querySelectorAll("button")].at(-1).remove();
    // an own auction: a cancel button instead of the pair
    for (const b of cards[1].querySelectorAll("button")) b.remove();
    cards[1].insertAdjacentHTML("beforeend", "<button>Cancel auction</button>");
    const rows = auctionRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].start).toBe(25.9);
  });
  it("reads the prices around any countdown, and without one", () => {
    const span = (card) =>
      [...card.querySelectorAll("span")].find((s) =>
        /^\d+[dhms]/.test(s.textContent ?? ""),
      );
    const cards = document.querySelectorAll("#list > div");
    span(cards[0]).textContent = "45s";
    span(cards[1]).remove();
    const [a, b] = auctionRows();
    expect(a).toMatchObject({ ends: "45s", start: 199, max: 277.927 });
    expect(b).toMatchObject({ ends: null, start: 600, max: 639.35 });
  });
  it("joins what the page splits: a decimal's parts, a percent, a countdown's units", () => {
    const tank = document.querySelector("#list > div");
    expect(auctionTokens(tank)).toEqual([
      "151",
      "33%",
      "100%",
      "Tank",
      "5h35m28s",
      "Starting price",
      "199",
      "Max price",
      "277.927",
      "seller_1",
      "0 bids",
    ]);
  });
  it("leaves the old offer rows to their reader, and counts the auction buttons as offer buttons", () => {
    expect(offerRows()).toHaveLength(0);
    expect(offerButtonCount()).toBe(6);
    document.body.innerHTML =
      '<main><article><div><img alt="knife"></div><div>1</div><button>BUY</button></article></main>';
    expect(auctionRows()).toHaveLength(0);
    expect(offerRows()).toHaveLength(1);
  });
});

describe("readStatBlock", () => {
  it("reads the leading numbers: the last percentage is the durability, the numbers before it the stats", () => {
    expect(readStatBlock(["151", "33%", "100%", "Tank"])).toMatchObject({
      readable: true,
      stats: [151, 33],
      stat: 151,
      durability: 100,
    });
    expect(readStatBlock(["23%", "100%", "Elite Gloves"])).toMatchObject({
      readable: true,
      stats: [23],
      durability: 100,
    });
    expect(readStatBlock(["Tank", "199"])).toMatchObject({
      readable: false,
      stats: [],
      durability: null,
    });
  });
});
