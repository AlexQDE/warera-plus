// The game's sell forms: the old shared PRICE and v0.27's price per piece.
// Each hint uses sales of both stats and the game's allowed range. Use only
// writes into its input: PUT ON SALE stays the player's.
import { gold, escapeHtml as esc } from "./format.mjs";
import { setHtml } from "./ui.mjs";
import { slotFromAlt, isItemImageAlt, slotName, parsePrice } from "./dom.mjs";
import { tileTokens, tileStats, tileCode } from "./picker.mjs";
import { rowSkills } from "./similar.mjs";

const NUMBER = /^[\d,]+(?:\.\d+)?$/;
/** A price as the game prints it, thousands to billions abbreviated ("1.234K"). */
const PRICE = /^[\d,]+(?:\.\d+)?[KkMmBb]?$/;
/** Tokens joined with spaces, a number split at its point ("1" ".234K") joined back. @param {string[]} tokens */
const joinTokens = (tokens) => tokens.join(" ").replace(/(\d) (\.\d)/g, "$1$2");
const num = (/** @type {string} */ t) => Number(t.replace(/,/g, ""));
/** Pieces whose prices differ more than this are not sold at one price. */
const SPREAD = 0.15;
const PIECE_PRICE = 'input[name^="price-"]';
// The initial value belongs to the item, even when the game replaces its input.
// Closing the dialog releases the map, so a new sale starts from a fresh offer.
const startingPrices = new WeakMap();

/** The open sell form, with either a shared price or a price for each item. */
export function findSellForm(root = document) {
  return (
    [...root.querySelectorAll('[role="dialog"]')].find(
      (d) =>
        (/^\s*sell an item/i.test(d.textContent ?? "") &&
          !!d.querySelector('input[name="price"]')) ||
        (/^\s*(?:×\s*)?sell items\b/i.test(d.textContent ?? "") &&
          !!d.querySelector(PIECE_PRICE)),
    ) ?? null
  );
}

/** The gradient-backed box around an item image (the game draws every tile that way). */
function tileOf(img, stop) {
  for (let e = img; e && e !== stop; e = e.parentElement) {
    const s = getComputedStyle(e);
    if (s.backgroundImage && s.backgroundImage !== "none") return e;
  }
  return null;
}

/**
 * The pieces picked in a form: each tile that prints its stats, as its code, stats and skills. A tile without
 * stats is not a piece.
 * @param {Element} form
 */
function pickedItems(form, offer = false) {
  const items = [];
  for (const img of form.querySelectorAll("img")) {
    const alt = img.getAttribute("alt");
    if (!isItemImageAlt(alt)) continue;
    const tile = tileOf(img, form);
    if (!tile || img.closest("[data-lens]")) continue;
    const tokens = tileTokens(tile);
    let read = tileStats(tokens);
    let code = read ? tileCode(slotFromAlt(alt), read.stats) : null;
    // Offers may omit durability. Add it only when the printed stats do not
    // already make a complete piece, so crit is never mistaken for durability.
    if (offer && (!code || !rowSkills(code, read?.stats))) {
      read = tileStats([...tokens, "100%"]);
      code = read ? tileCode(slotFromAlt(alt), read.stats) : null;
    }
    if (!code || !read) continue;
    items.push({
      code,
      stats: read.stats,
      skills: rowSkills(code, read.stats),
    });
  }
  return items;
}

/** The piece's header and its offers share a section with exactly one price. */
function pieceSection(input, form) {
  let header = null;
  for (let e = input.parentElement; e && e !== form; e = e.parentElement) {
    if (e.querySelectorAll(PIECE_PRICE).length !== 1) break;
    if (!header && pickedItems(e).length) header = e;
    // The nearest tile/input ancestor can be just the header; the list is
    // its sibling in the next ancestor of the same piece.
    if (header && e.querySelector("ul")) return e;
  }
  return header;
}

/** Before-tax offers only: never the player's "Your offer" marker. */
function pieceAsks(section, code) {
  const asks = [];
  for (const li of section.querySelectorAll("ul li")) {
    if (/\byour offer\b/i.test(li.textContent ?? "")) continue;
    const item = pickedItems(li, true).find((p) => p.code === code && p.skills);
    if (!item) continue;
    // The price is a span group after the seller and badges. Its integer
    // and fraction are separate spans ("163" ".9", "1" ".234K"); read the
    // outer group, not just its integer.
    const spans = [...li.querySelectorAll("span")].filter(
      (e) => !tileOf(e, li) && PRICE.test(tileTokens(e).join("")),
    );
    const amount = spans
      .filter((e) => !spans.some((other) => other !== e && other.contains(e)))
      .at(-1);
    const price = amount ? parsePrice(tileTokens(amount).join("")) : null;
    if (price != null && price > 0 && Number.isFinite(price))
      asks.push({ price, skills: item.skills });
  }
  return asks;
}

function readPieces(form, inputs) {
  let starts = startingPrices.get(form);
  if (!starts) startingPrices.set(form, (starts = new Map()));
  const items = [];
  for (const input of inputs) {
    const section = pieceSection(input, form);
    const item = section ? pickedItems(section)[0] : null;
    if (!section || !item) continue;
    const itemId = input.name.slice("price-".length);
    // the game's start, once it has filled the input: an empty first read must not stand for it
    if (!starts.has(itemId) && NUMBER.test(input.value))
      starts.set(itemId, num(input.value));
    const range =
      /\bfrom\s*([\d,]+(?:\.\d+)?[KkMmBb]?)\s*to\s*([\d,]+(?:\.\d+)?[KkMmBb]?)\s*before\s+tax\b/i.exec(
        joinTokens(tileTokens(section)),
      );
    items.push({
      ...item,
      itemId,
      form: section,
      input,
      game: {
        suggested: starts.get(itemId) ?? null,
        min: range ? parsePrice(range[1]) : null,
        max: range ? parsePrice(range[2]) : null,
      },
      asks: pieceAsks(section, item.code),
    });
  }
  return { form, input: null, items, game: null, perItem: true };
}

/**
 * The picked pieces (code, stats), the price input, and the game's numbers:
 * its "Market average", its "Suggested price" and the range around it.
 * @param {Element} form
 */
export function readSellForm(form) {
  const inputs = [...form.querySelectorAll(PIECE_PRICE)];
  if (inputs.length) return readPieces(form, inputs);
  const input = /** @type {HTMLInputElement | null} */ (
    form.querySelector('input[name="price"]')
  );
  const items = pickedItems(form);
  const tokens = tileTokens(form);
  const after = (/** @type {RegExp} */ re) => {
    const i = tokens.findIndex((t) => re.test(t));
    return i >= 0 && NUMBER.test(tokens[i + 1] ?? "")
      ? num(tokens[i + 1])
      : null;
  };
  // the numbers between "Suggested price" and "You receive": the suggestion, then the range's ends
  const from = tokens.findIndex((t) => /^suggested price$/i.test(t));
  const to = tokens.findIndex((t, i) => i > from && /^you receive$/i.test(t));
  const range = (
    from >= 0 ? tokens.slice(from + 1, to > from ? to : undefined) : []
  )
    .filter((t) => NUMBER.test(t))
    .map(num);
  return {
    form,
    input,
    items,
    game: {
      average: after(/^market average$/i),
      suggested: range[0] ?? null,
      min: range.length ? Math.min(...range) : null,
      max: range.length ? Math.max(...range) : null,
    },
  };
}

const ageWords = (/** @type {number | null} */ m) =>
  m == null
    ? ""
    : m < 60
      ? `${m} min`
      : m < 1440
        ? `${Math.round(m / 60)} h`
        : `${Math.round(m / 1440)} d`;
const priceText = (/** @type {number} */ v) =>
  String(Math.round(v * 1000) / 1000);

/**
 * Our line under PRICE for the picked pieces (each { code, s } with s from
 * suggestPrice). One piece: its price, why, and what it rests on. Several:
 * one price for all when they are close (the lowest), else each piece's
 * price and no Use, since one price would sell the dearer ones cheap.
 * `noKey`: no API key to read sales with, so the price rests on the asks.
 * @param {Array<{ code: string, noKey?: boolean, game?: { suggested?: number | null }, s: ReturnType<typeof import("./pricing.mjs").suggestPrice> }>} picks
 */
export function sellHintHtml(picks) {
  const priced = picks.filter((p) => p.s?.price != null);
  if (!priced.length || picks.some((p) => !p.s))
    return `<span class="lens-brand">◈</span> <span class="lens-muted">reading the sales of these stats…</span>`;
  const prices = priced.map((p) => /** @type {number} */ (p.s.price));
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  if (priced.length > 1 && hi > lo * (1 + SPREAD))
    return `<span class="lens-brand">◈</span> <span class="lens-neg">list apart:</span> ${priced
      .map((p) => `${esc(slotName(p.code))} ${gold(p.s.price)}`)
      .join(" · ")}`;
  const one = priced.length === 1 ? priced[0].s : null;
  const use = `<button type="button" data-sell-use="${priceText(lo)}" title="write this price into the form; nothing is listed until you press PUT ON SALE">use</button>`;
  const basis = one
    ? [
        one.sold.value != null
          ? `sold ${gold(one.sold.value)} · ${esc(one.sold.label)}`
          : priced[0].noKey
            ? `<span class="lens-muted">sales need your API key</span>`
            : "",
        one.floor
          ? `${one.floor.better ? "better ask" : "ask"} ${gold(one.floor.price)} · ${ageWords(one.floor.ageMin)}`
          : "",
        one.rising
          ? `<span class="lens-pos">rising${one.trend != null ? ` ${one.trend >= 0 ? "+" : "−"}${Math.round(Math.abs(one.trend) * 100)}% vs week` : ""}</span>`
          : "",
        one.clamped
          ? `<span class="lens-muted">kept in the game's range</span>`
          : "",
      ]
        .filter(Boolean)
        .join(" · ")
    : `${priced.length} pieces, the lowest of their prices`;
  const start = priced[0].game?.suggested;
  const warning =
    one &&
    (one.sold.level === "same" || one.sold.level === "similar") &&
    one.fair != null &&
    start != null &&
    start > 0 &&
    start < one.fair * 0.95
      ? `<small class="lens-neg">the game starts you at ${priceText(start)} from an offer with other stats; pieces with these stats sell ≈ ${gold(one.fair)}</small>`
      : "";
  return `<div><span class="lens-brand">◈</span> <b>${priceText(lo)}</b> <small>${one ? esc(one.why) : "for all"}</small> ${use}</div>${basis ? `<small>${basis}</small>` : ""}${warning}`;
}

/**
 * Show `html` under the form's PRICE label (one element, reused), and wire
 * Use to write its price into the game's input the way typing would.
 * @param {{ form: Element, input: HTMLInputElement | null, itemId?: string }} read @param {string} html
 */
export function renderSellHint(read, html) {
  const label = read.input?.closest("label");
  if (!label) return;
  let el = /** @type {HTMLElement | null} */ (
    read.form.querySelector(".ss-sell")
  );
  if (!el) {
    el = document.createElement("div");
    el.className = "ss-sell";
    el.dataset.lens = "";
  }
  if (read.itemId) el.dataset.sellItem = read.itemId;
  // Refresh the input reference on every render in case the game replaced it.
  el.onclick = (e) => {
    e.stopPropagation(); // every click, including the basis and warning, stays ours
    const b = /** @type {HTMLElement | null} */ (
      /** @type {Element} */ (e.target).closest("[data-sell-use]")
    );
    if (!b || !read.input) return;
    e.preventDefault();
    // the prototype's setter, then an input event: the game's form sees a typed value
    const setter = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(read.input),
      "value",
    )?.set;
    setter?.call(read.input, b.dataset.sellUse ?? "");
    read.input.dispatchEvent(new Event("input", { bubbles: true }));
  };
  if (label.nextElementSibling !== el)
    label.insertAdjacentElement("afterend", el);
  setHtml(el, html);
}
