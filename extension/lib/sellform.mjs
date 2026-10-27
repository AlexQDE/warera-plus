// The game's sell form ("+ NEW ITEM OFFER"): which pieces are picked, the
// game's own estimate and the range it allows, and one line of ours under
// PRICE with a suggested price (pricing.mjs) and a Use button that writes it
// into the game's input. Nothing is listed: PUT ON SALE stays the player's.
import { gold, escapeHtml as esc } from "./format.mjs";
import { setHtml } from "./ui.mjs";
import { slotFromAlt, isItemImageAlt, slotName } from "./dom.mjs";
import { tileTokens, tileStats, tileCode } from "./picker.mjs";
import { rowSkills } from "./similar.mjs";

const NUMBER = /^[\d,]+(?:\.\d+)?$/;
const num = (/** @type {string} */ t) => Number(t.replace(/,/g, ""));
/** Pieces whose prices differ more than this are not sold at one price. */
const SPREAD = 0.15;

/** The open sell form: a dialog that starts "Sell an item" and holds the price input. */
export function findSellForm(root = document) {
  return (
    [...root.querySelectorAll('[role="dialog"]')].find(
      (d) =>
        /^\s*sell an item/i.test(d.textContent ?? "") &&
        !!d.querySelector('input[name="price"]'),
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
function pickedItems(form) {
  const items = [];
  for (const img of form.querySelectorAll("img")) {
    const alt = img.getAttribute("alt");
    if (!isItemImageAlt(alt)) continue;
    const tile = tileOf(img, form);
    const read = tile ? tileStats(tileTokens(tile)) : null;
    const code = read ? tileCode(slotFromAlt(alt), read.stats) : null;
    if (!code || !read) continue;
    items.push({
      code,
      stats: read.stats,
      skills: rowSkills(code, read.stats),
    });
  }
  return items;
}

/**
 * The picked pieces (code, stats), the price input, and the game's numbers:
 * its "Market average", its "Suggested price" and the range around it.
 * @param {Element} form
 */
export function readSellForm(form) {
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
 * @param {Array<{ code: string, noKey?: boolean, s: ReturnType<typeof import("./pricing.mjs").suggestPrice> }>} picks
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
  return `<div><span class="lens-brand">◈</span> <b>${priceText(lo)}</b> <small>${one ? esc(one.why) : "for all"}</small> ${use}</div>${basis ? `<small>${basis}</small>` : ""}`;
}

/**
 * Show `html` under the form's PRICE label (one element, reused), and wire
 * Use to write its price into the game's input the way typing would.
 * @param {ReturnType<typeof readSellForm>} read @param {string} html
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
    el.addEventListener("click", (e) => {
      const b = /** @type {HTMLElement | null} */ (
        /** @type {Element} */ (e.target).closest("[data-sell-use]")
      );
      if (!b || !read.input) return;
      e.preventDefault();
      e.stopPropagation();
      // the prototype's setter, then an input event: the game's form sees a typed value
      const setter = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(read.input),
        "value",
      )?.set;
      setter?.call(read.input, b.dataset.sellUse ?? "");
      read.input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  if (label.nextElementSibling !== el)
    label.insertAdjacentElement("afterend", el);
  setHtml(el, html);
}
