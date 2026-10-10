// @ts-check
// A listing price for a piece of given stats, from what can be seen: what
// pieces of those stats sold for (the newest sales alike, 24 hours first,
// similar.mjs), the asks of the same stats on the market now with their
// age, and today's sales against the week's. The book is ordered by price,
// then by listing time, so matching the cheapest ask queues behind it and
// one thousandth under it is first in line; a cheaper ask of better stats
// counts too, since nobody buys ours above it. When fresh asks sit above what
// sold, or today sells above the week, prices are rising: list first in
// line. When the cheapest ask is well under what sells, keep to what sells
// and offer the quick price beside it. Always inside the range the game's
// sell form allows (0.7-1.6x its own estimate). Pure.
import { STAT_RANGES } from "./stats.mjs";
import { positive } from "./quality.mjs";
import {
  similarValue,
  statDistance,
  SAME_DISTANCE,
  SIMILAR_DISTANCE,
} from "./similar.mjs";

/** An ask this many minutes old or younger is fresh. */
export const FRESH_MINUTES = 60;
/** Fresh asks this far above what sold, or today this far above the week, mean prices are rising. */
export const RISING = 0.03;
/** The cheapest ask counts as "at" what sells within this share under it. */
const NEAR = 0.03;

/**
 * A row's age token in minutes: "7m", "3h47m", "12h ago", "2d", "1d3h".
 * null for anything else.
 * @param {unknown} text
 */
export function ageMinutes(text) {
  const m =
    /^\s*(?:(\d+)\s*d)?\s*(?:(\d+)\s*h)?\s*(?:(\d+)\s*m(?:in)?)?\s*(?:ago)?\s*$/i.exec(
      String(text ?? ""),
    );
  if (!m || (m[1] == null && m[2] == null && m[3] == null)) return null;
  return Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

/** @param {ReadonlyArray<number>} xs */
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};
const round3 = (/** @type {number} */ v) => Math.round(v * 1000) / 1000;

/**
 * @typedef {{ price: number, skills?: Record<string, number> | null, ageMin?: number | null }} Ask
 * @typedef {{ suggested?: number | null, min?: number | null, max?: number | null }} GameRange
 */

/**
 * @param {{ code: string, skills: Record<string, number> | null, fills: ReadonlyArray<any> | null | undefined, asks?: ReadonlyArray<Ask>, now?: number, game?: GameRange | null }} input
 */
export function suggestPrice({
  code,
  skills,
  fills,
  asks = [],
  now = Date.now(),
  game = null,
}) {
  const ranges = STAT_RANGES[code] ?? null;
  const sold = similarValue(code, skills, fills, { now });
  const near = (
    /** @type {Record<string, number> | null | undefined} */ k,
    /** @type {number} */ d,
  ) => !!ranges && !!skills && (statDistance(ranges, skills, k) ?? 1) <= d;
  // today's sales against the week's, of these stats or near them
  const alike = (fills ?? [])
    .filter(
      (f) => positive(f?.price) != null && near(f.skills, SIMILAR_DISTANCE),
    )
    .map((f) => ({ price: f.price, age: (now - Date.parse(f.at)) / 3600e3 }))
    .filter((x) => Number.isFinite(x.age) && x.age >= 0 && x.age <= 168);
  const today = median(alike.filter((x) => x.age <= 24).map((x) => x.price));
  const week = median(alike.filter((x) => x.age > 24).map((x) => x.price));
  const enough =
    alike.filter((x) => x.age <= 24).length >= 3 &&
    alike.filter((x) => x.age > 24).length >= 3;
  const trend = enough && today != null && week ? today / week - 1 : null;
  // the asks of the same stats now, and of stats at least as good in every
  // one: a buyer takes the better piece when it is not dearer, so the
  // cheapest of either is the one to list under; the fresh ones are the same stats only
  const listed = asks.filter((a) => positive(a?.price) != null);
  const same = listed.filter((a) => near(a.skills, SAME_DISTANCE));
  const better = (/** @type {Ask} */ a) =>
    !!ranges &&
    !!skills &&
    Object.keys(ranges).every(
      (k) =>
        typeof skills[k] === "number" &&
        typeof a.skills?.[k] === "number" &&
        a.skills[k] >= skills[k],
    );
  const cheapest = listed
    .filter((a) => near(a.skills, SAME_DISTANCE) || better(a))
    .reduce(
      (/** @type {Ask | null} */ best, a) =>
        !best || a.price < best.price ? a : best,
      null,
    );
  // a better piece that is not one of the same stats
  const underBetter =
    !!cheapest && !near(cheapest.skills, SAME_DISTANCE) && better(cheapest);
  const freshMedian = median(
    same
      .filter((a) => a.ageMin != null && a.ageMin <= FRESH_MINUTES)
      .map((a) => a.price),
  );
  const fair = sold.value;
  const rising =
    (trend != null && trend >= RISING) ||
    (freshMedian != null && fair != null && freshMedian >= fair * (1 + RISING));
  const fast = cheapest ? round3(cheapest.price - 0.001) : null;
  const first = underBetter ? "under better stats" : "first in line";
  /** @type {{ price: number | null, why: string }} */
  let pick;
  if (fast != null && fair != null)
    pick =
      rising || fast >= fair * (1 - NEAR)
        ? { price: fast, why: first }
        : {
            price: round3(fair),
            why: "what sells; the cheapest ask is under it",
          };
  else if (fast != null) pick = { price: fast, why: first };
  else if (fair != null) pick = { price: round3(fair), why: "what sells" };
  else
    pick = {
      price: positive(game?.suggested) ?? null,
      why: "the game's estimate",
    };
  let clamped = false;
  if (pick.price != null) {
    const lo = positive(game?.min);
    const hi = positive(game?.max);
    if (lo != null && pick.price < lo) {
      pick.price = lo;
      clamped = true;
    } else if (hi != null && pick.price > hi) {
      pick.price = hi;
      clamped = true;
    }
  }
  return {
    price: pick.price,
    why: pick.why,
    fast,
    fair: fair == null ? null : round3(fair),
    sold: {
      value: sold.value,
      n: sold.n,
      level: sold.level,
      hours: sold.hours,
      label: sold.label,
    },
    floor: cheapest
      ? {
          price: cheapest.price,
          ageMin: cheapest.ageMin ?? null,
          better: underBetter,
        }
      : null,
    trend,
    rising,
    clamped,
  };
}
