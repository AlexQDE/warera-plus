// @ts-check
// What a piece with THESE stats sells for: the median of recent sales of
// the same item whose stats sit next to the piece's, each stat measured
// against its own roll range (docs/GAME-FACTS.md §4) so a sniper's crit
// (16–20) weighs as much as its attack (101–130). Prices move fast, so the
// last 24 hours are asked first and the window widens a day at a time up to
// 7 days only while it holds too few sales alike; in each window the same
// stats come before similar ones, and a value rests on the 50 newest sales
// alike at most. A piece that reaches none has no stat-matched value, only
// the item's any-stats median (widened the same way), and that never earns
// a tag. Pure; equipment.mjs, craftdesk.mjs and the worker render the result.
import { STAT_RANGES } from "./stats.mjs";
import { WEAPONS } from "./items.mjs";
import { positive } from "./quality.mjs";

/** Sales within a tenth of every stat's range: "same stats". */
export const SAME_DISTANCE = 0.1;
/** Sales within a quarter of every stat's range: "similar stats". */
export const SIMILAR_DISTANCE = 0.25;
export const MIN_SAME = 3;
export const MIN_SIMILAR = 5;
export const MIN_ITEM = 5;
/** The window the fills are read over, in hours (the worker reads 7 days). */
export const WINDOW_HOURS = 168;
/** The windows a value is asked over, narrowest first: 24 hours, then a day more at a time. */
export const WINDOWS = Object.freeze([24, 48, 72, 96, 120, 144, 168]);
/** The most sales alike a value rests on: the newest ones. */
export const MAX_SALES = 50;
/** "24 h", "3 d": a window in the words a row prints. @param {number} hours */
export const windowWords = (hours) =>
  hours <= 24 ? `${hours} h` : `${Math.round(hours / 24)} d`;

/** Short words for the stats on a row or a ledger line. @type {Readonly<Record<string, string>>} */
export const STAT_SHORT = Object.freeze({
  attack: "atk",
  criticalChance: "crit",
  criticalDamages: "crit dmg",
  armor: "armor",
  precision: "prec",
  dodge: "dodge",
});
/** Stats the game prints as a percentage. */
export const PERCENT = new Set([
  "criticalChance",
  "criticalDamages",
  "precision",
  "dodge",
]);

/** @typedef {{ price: number, at: string, skills?: Record<string, number> | null, listedAt?: string | null }} Fill */
/** @typedef {{ value: number | null, level: "same" | "similar" | "item" | null, n: number, matched: boolean, span: Record<string, [number, number]>, low: number | null, high: number | null, sellsHours: number | null, hours: number | null, label: string, detail: string, fills: Fill[] }} SimilarValue */

/** @param {ReadonlyArray<number>} xs */
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};

/**
 * The stats a row prints, keyed the way fills carry them: a weapon's attack
 * and crit in that order, an armour slot's one stat.
 * @param {string | null | undefined} code @param {ReadonlyArray<number> | null | undefined} stats
 * @returns {Record<string, number> | null}
 */
export function rowSkills(code, stats) {
  const ranges = code ? STAT_RANGES[code] : null;
  if (!ranges || !stats?.length) return null;
  const keys = WEAPONS.includes(String(code))
    ? ["attack", "criticalChance"]
    : Object.keys(ranges);
  /** @type {Record<string, number>} */
  const out = {};
  keys.forEach((k, i) => {
    const v = stats[i];
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  });
  return Object.keys(out).length === keys.length ? out : null;
}

/** "atk 101–106 · crit 16–17%": the stat span of the matched sales. @param {Record<string, [number, number]>} span */
export function spanWords(span) {
  return Object.entries(span)
    .map(([k, [lo, hi]]) => {
      const unit = PERCENT.has(k) ? "%" : "";
      return `${STAT_SHORT[k] ?? k} ${lo === hi ? `${lo}${unit}` : `${lo}–${hi}${unit}`}`;
    })
    .join(" · ");
}

/**
 * How far a fill's stats sit from the piece's, as a share of each stat's
 * range (the largest share wins); null when either side lacks a stat.
 * @param {Record<string, readonly [number, number]>} ranges @param {Record<string, number>} a @param {Record<string, number> | null | undefined} b
 */
export function statDistance(ranges, a, b) {
  let d = 0;
  for (const [k, [lo, hi]] of Object.entries(ranges)) {
    const x = a[k];
    const y = b?.[k];
    if (typeof x !== "number" || typeof y !== "number") return null;
    const width = Math.max(1, hi - lo);
    d = Math.max(d, Math.abs(x - y) / width);
  }
  return d;
}

/**
 * The value of a piece of `code` with `skills` over `fills` (the 7 days the
 * worker reads). For each window of WINDOWS, narrowest first: the median of
 * the newest MAX_SALES sales within SAME_DISTANCE of its stats when there
 * are MIN_SAME of them, else within SIMILAR_DISTANCE when there are
 * MIN_SIMILAR; no window has enough: the item's newest sales in the
 * narrowest window holding MIN_ITEM ("any stats", not matched). Every
 * answer names the sales it rests on and the window.
 * @param {string} code @param {Record<string, number> | null | undefined} skills @param {ReadonlyArray<Fill> | null | undefined} fills
 * @param {{ now?: number }} [options]
 * @returns {SimilarValue}
 */
export function similarValue(code, skills, fills, { now = Date.now() } = {}) {
  const ranges = STAT_RANGES[code] ?? null;
  const last = WINDOWS[WINDOWS.length - 1];
  // newest first, each with its age in hours; older than the widest window never counts
  const priced = (fills ?? [])
    .filter((f) => positive(f?.price) != null)
    .map((f) => ({ f, age: (now - Date.parse(f.at)) / 3600e3 }))
    .filter((x) => Number.isFinite(x.age) && x.age <= last)
    .sort((a, b) => a.age - b.age);
  const none = /** @type {SimilarValue} */ ({
    value: null,
    level: null,
    n: priced.length,
    matched: false,
    span: {},
    low: null,
    high: null,
    sellsHours: null,
    hours: null,
    label: priced.length
      ? `${priced.length} sales · too few alike`
      : "no sales in 7 d",
    detail: priced.length
      ? `${priced.length} sales of this item in 7 d, too few with these stats`
      : "no sales of this item in 7 d",
    fills: [],
  });
  /** @param {Fill[]} list @param {"same" | "similar" | "item"} level @param {number} hours */
  const answer = (list, level, hours) => {
    const prices = list.map((f) => f.price);
    /** @type {Record<string, [number, number]>} */
    const span = {};
    if (ranges && level !== "item")
      for (const k of Object.keys(ranges)) {
        const vs = list.map((f) => Number(f.skills?.[k]));
        span[k] = [Math.min(...vs), Math.max(...vs)];
      }
    const waits = list
      .map((f) =>
        f.listedAt ? (Date.parse(f.at) - Date.parse(f.listedAt)) / 3600e3 : NaN,
      )
      .filter((h) => Number.isFinite(h) && h >= 0);
    const when = windowWords(hours);
    return /** @type {SimilarValue} */ ({
      value: median(prices),
      level,
      n: list.length,
      matched: level !== "item",
      span,
      low: Math.min(...prices),
      high: Math.max(...prices),
      sellsHours: median(waits),
      hours,
      label: `${list.length} ${level === "item" ? "any" : level} · ${when}`,
      detail: `${list.length} sales · ${level === "item" ? "any stats" : spanWords(span)} · ${when}`,
      fills: list,
    });
  };
  /** @param {Array<{ f: Fill, age: number }>} list @param {number} hours */
  const newest = (list, hours) =>
    list
      .filter((x) => x.age <= hours)
      .slice(0, MAX_SALES)
      .map((x) => x.f);
  if (ranges && skills) {
    const scored = priced
      .map((x) => ({ ...x, d: statDistance(ranges, skills, x.f.skills) }))
      .filter((x) => x.d != null);
    const same = scored.filter(
      (x) => /** @type {number} */ (x.d) <= SAME_DISTANCE,
    );
    const similar = scored.filter(
      (x) => /** @type {number} */ (x.d) <= SIMILAR_DISTANCE,
    );
    for (const hours of WINDOWS) {
      const s = newest(same, hours);
      if (s.length >= MIN_SAME) return answer(s, "same", hours);
      const m = newest(similar, hours);
      if (m.length >= MIN_SIMILAR) return answer(m, "similar", hours);
    }
  }
  for (const hours of WINDOWS) {
    const all = newest(priced, hours);
    if (all.length >= MIN_ITEM) return answer(all, "item", hours);
  }
  return none;
}

/**
 * Other listings of the same item on the page with the same stats (within
 * SAME_DISTANCE): how many and the cheapest, for "this stats lists from X".
 * @param {string} code @param {Record<string, number> | null | undefined} skills @param {ReadonlyArray<{ code?: string | null, price?: number | null, skills?: Record<string, number> | null }>} rows @param {number} self the row's own index
 */
export function listedPeers(code, skills, rows, self) {
  const ranges = STAT_RANGES[code] ?? null;
  if (!ranges || !skills) return { n: 0, cheapest: null };
  const prices = rows
    .map((r, i) => ({ r, i }))
    .filter(
      ({ r, i }) =>
        i !== self &&
        r.code === code &&
        positive(r.price) != null &&
        (statDistance(ranges, skills, r.skills) ?? 1) <= SAME_DISTANCE,
    )
    .map(({ r }) => /** @type {number} */ (r.price));
  return {
    n: prices.length,
    cheapest: prices.length ? Math.min(...prices) : null,
  };
}
