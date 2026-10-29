// @ts-check
// Which candidate in the game's Recruit window to hire, from what his card
// shows: his wage a day, the one stat, trait or potential revealed, a "?"
// badge for each hidden trait, his age. Pure model, no page access.
//
// Facts (v0.27, docs/GAME-FACTS.md §12): a starting stat is 1 to 4, all
// equally likely; half of all candidates carry one trait. A wage is one hour
// of his own base output, Production / 4 points, at the game's point value
// (gameStat.getPpMoneyValue), times his wage expectation, drawn between 70%
// and 130% (config employee.wageExpectationSpread 0.3), times 1.2 for Greedy
// or 0.85 for Modest. The card prints that wage x 24. So
//
//   wage a day / (6 x point value) = Production x expectation x trait
//
// is known exactly even when Production is hidden, and Production is read
// back from it: the 1..4 that fit inside 70%..130%, each weighted by how
// likely his wage is under it (a uniform expectation spreads over a width
// proportional to Production, so a smaller Production that fits is likelier).
// Trait Production is not paid; the specialization bonus (+1% a day on the
// same product, +20% at most) is what makes an average worker pay.

/** Gold a day per production point at a point value: 24 hours x 1/4. */
// team.mjs uses these constants and TRAITS only inside functions; neither
// module evaluates the other's bindings during initialization.
import { TEAM_RULES, teamEffect, averageTeamEffects } from "./team.mjs";

export const HOURS_PER_POINT = 6;
export const STAT_MIN = 1;
export const STAT_MAX = 4;
export const WAGE_SPREAD = 0.3;
export const SPEC_PER_DAY = 0.01;
export const SPEC_CAP = 0.2;
export const RETIRE_AGE = 65;
/** Days the total looks ahead at most, whatever his age. */
export const HORIZON_DAYS = 60;
/**
 * Slack on the expectation's range: the card rounds the wage to 0.01 a day
 * and the point value the extension reads can have moved since the day's
 * candidates were drawn.
 */
export const WAGE_TOLERANCE = 0.03;
/**
 * The slack tried when no Production fits at WAGE_TOLERANCE: the point value
 * moved a lot since the day's candidates were drawn. Such a reading is kept
 * and flagged `drifted`, never dropped.
 */
export const DRIFT_TOLERANCE = 0.15;

/**
 * @typedef {{ prod?: number, pct?: number, flat?: number, drift?: number }} Effect
 *   prod: unpaid production points (raised by the bonus like his own);
 *   pct: a share of his own output; flat: points-equivalent he adds to or
 *   takes from coworkers; drift: his wage's rise for every full week since
 *   he was hired (Climber: config wageExpectationDriftPerWeek 0.02).
 * @typedef {{ title: string, weight: number, polarity: string,
 *   wage?: number, alone: Effect | null, team: Effect | null, note: string,
 *   home?: { yes: Effect, no: Effect },
 *   kind?: { raw: Effect, product: Effect } }} Trait
 *   home: the effect when his nationality is (yes) or is not (no) the
 *   company's country, used instead of alone/team when that is known; kind:
 *   the effect on a company making a raw resource or a product.
 */

/**
 * The 52 traits, their weight on a new hire (config employee traits
 * hireWeight, 354 in all) and what each is worth in the model's units at the
 * reference conditions of the v0.27 guide (10% income tax, coworkers of
 * Production 3, a tool where it matters). `wage` is the multiplier the trait
 * puts on the wage he asks; it is already inside the wage the card prints.
 * @type {Readonly<Record<string, Trait>>}
 */
export const TRAITS = {
  handy: {
    title: "Handy",
    weight: 5,
    polarity: "positive",
    alone: { pct: 0.4 },
    team: { pct: 0.4 },
    note: "+40% with a tool",
  },
  improviser: {
    title: "Improviser",
    weight: 5,
    polarity: "positive",
    alone: { pct: 0.25 },
    team: { pct: 0.25 },
    note: "+25% without a tool",
  },
  nationalist: {
    title: "Nationalist",
    weight: 10,
    polarity: "positive",
    alone: {},
    team: { pct: 0.05 },
    note: "coworkers of his nationality",
  },
  xenophobe: {
    title: "Xenophobe",
    weight: 10,
    polarity: "negative",
    alone: {},
    team: { prod: -2, pct: -0.05 },
    note: "a foreign coworker",
  },
  cosmopolitan: {
    title: "Cosmopolitan",
    weight: 10,
    polarity: "positive",
    alone: {},
    team: { prod: 4 },
    note: "coworkers of 2 other nationalities",
  },
  loner: {
    title: "Loner",
    weight: 5,
    polarity: "positive",
    alone: { pct: 1.05 },
    team: {},
    note: "+100% only when alone",
  },
  sociable: {
    title: "Sociable",
    weight: 10,
    polarity: "mixed",
    alone: { pct: -0.1 },
    team: { pct: 0.5 },
    note: "+25% per coworker",
  },
  comic: {
    title: "Comic",
    weight: 10,
    polarity: "mixed",
    alone: {},
    team: { prod: -1, flat: 0.6 },
    note: "cheers coworkers up",
  },
  mentor: {
    title: "Mentor",
    weight: 2,
    polarity: "mixed",
    alone: {},
    team: { prod: 3 },
    note: "lifts weaker coworkers",
  },
  foreman: {
    title: "Foreman",
    weight: 5,
    polarity: "positive",
    alone: {},
    team: { flat: 0.18 },
    note: "coworker Responsibility",
  },
  rival: {
    title: "Rival",
    weight: 5,
    polarity: "mixed",
    alone: { prod: -1 },
    team: { prod: 3 },
    note: "a stronger coworker",
  },
  primaDonna: {
    title: "Prima Donna",
    weight: 5,
    polarity: "mixed",
    alone: {},
    team: { pct: 0.2 },
    note: "if best paid",
  },
  bully: {
    title: "Bully",
    weight: 5,
    polarity: "mixed",
    alone: {},
    team: { prod: 2, flat: -0.6 },
    note: "hurts coworkers",
  },
  envious: {
    title: "Envious",
    weight: 10,
    polarity: "negative",
    alone: {},
    team: { pct: -0.1 },
    note: "better-paid coworkers",
  },
  oldFriends: {
    title: "Old Friends",
    weight: 2,
    polarity: "positive",
    alone: {},
    team: { pct: 0.15 },
    note: "with his friend",
  },
  nemesis: {
    title: "Nemesis",
    weight: 2,
    polarity: "negative",
    alone: {},
    team: { pct: -0.15 },
    note: "with his enemy",
  },
  sweethearts: {
    title: "Sweethearts",
    weight: 0,
    polarity: "positive",
    alone: {},
    team: { pct: 0.2 },
    note: "office romance only",
  },
  girlPower: {
    title: "Girl Power",
    weight: 5,
    polarity: "positive",
    alone: {},
    team: { pct: 0.3 },
    note: "2 female coworkers",
  },
  bandOfBrothers: {
    title: "Band of Brothers",
    weight: 5,
    polarity: "positive",
    alone: {},
    team: { pct: 0.3 },
    note: "2 male coworkers",
  },
  manHater: {
    title: "Misandrist",
    weight: 5,
    polarity: "negative",
    alone: {},
    team: { pct: -0.3 },
    note: "2 male coworkers",
  },
  misogynist: {
    title: "Misogynist",
    weight: 5,
    polarity: "negative",
    alone: {},
    team: { pct: -0.3 },
    note: "2 female coworkers",
  },
  specialist: {
    title: "Specialist",
    weight: 10,
    polarity: "positive",
    alone: { prod: 3, pct: 0.05 },
    team: { prod: 3, pct: 0.05 },
    note: "on his favourite product",
  },
  craftsman: {
    title: "Craftsman",
    weight: 10,
    polarity: "mixed",
    alone: { prod: 3 },
    team: { prod: 3 },
    kind: { product: { prod: 3 }, raw: { prod: -1 } },
    note: "+3 on products, -1 on raws",
  },
  laborer: {
    title: "Laborer",
    weight: 10,
    polarity: "mixed",
    alone: { prod: 3 },
    team: { prod: 3 },
    kind: { raw: { prod: 3 }, product: { prod: -1 } },
    note: "+3 on raws, -1 on products",
  },
  quickStudy: {
    title: "Quick Study",
    weight: 10,
    polarity: "positive",
    alone: { pct: 1 / 30 },
    team: { pct: 1 / 30 },
    note: "full product bonus in 10 days",
  },
  stockpiler: {
    title: "Stockpiler",
    weight: 10,
    polarity: "positive",
    alone: {},
    team: {},
    note: "ignores a full storage",
  },
  claustrophobe: {
    title: "Claustrophobe",
    weight: 5,
    polarity: "negative",
    alone: { pct: -0.2 },
    team: { pct: -0.2 },
    note: "storage level 1-2",
  },
  sprinter: {
    title: "Sprinter",
    weight: 5,
    polarity: "positive",
    alone: { pct: 0.5 / 30 },
    team: { pct: 0.5 / 30 },
    note: "first day only",
  },
  veteran: {
    title: "Veteran",
    weight: 5,
    polarity: "positive",
    alone: { pct: 0.2 },
    team: { pct: 0.2 },
    note: "+20% after 30 days",
  },
  creatureOfHabit: {
    title: "Creature of Habit",
    weight: 10,
    polarity: "negative",
    alone: {},
    team: {},
    note: "-30% for 3 days after a move",
  },
  diamondInTheRough: {
    title: "Diamond in the Rough",
    weight: 2,
    polarity: "positive",
    alone: { prod: 1 / 3 },
    team: { prod: 1 / 3 },
    note: "grows every 10 days",
  },
  burnout: {
    title: "Burnout",
    weight: 2,
    polarity: "negative",
    alone: { prod: -1 / 3 },
    team: { prod: -1 / 3 },
    note: "falls every 20 days",
  },
  lateBloomer: {
    title: "Late Bloomer",
    weight: 5,
    polarity: "positive",
    alone: { prod: 2 },
    team: { prod: 2 },
    note: "at 40 or older",
  },
  wornOut: {
    title: "Worn Out",
    weight: 10,
    polarity: "negative",
    alone: { prod: -0.7 },
    team: { prod: -0.7 },
    note: "at 40 or older",
  },
  patriot: {
    title: "Patriot",
    weight: 10,
    polarity: "positive",
    alone: { prod: 2, pct: 0.1 },
    team: { prod: 2, pct: 0.1 },
    home: { yes: { prod: 2, pct: 0.1 }, no: {} },
    note: "in his home core region",
  },
  homesick: {
    title: "Homesick",
    weight: 10,
    polarity: "negative",
    alone: { prod: -2, pct: -0.1 },
    team: { prod: -2, pct: -0.1 },
    home: { yes: {}, no: { prod: -2, pct: -0.1 } },
    note: "working abroad",
  },
  expat: {
    title: "Expat",
    weight: 10,
    polarity: "positive",
    alone: { prod: 2 },
    team: { prod: 2 },
    home: { yes: {}, no: { prod: 2 } },
    note: "working abroad",
  },
  taxShy: {
    title: "Tax-shy",
    weight: 10,
    polarity: "negative",
    alone: { pct: -0.1 },
    team: { pct: -0.1 },
    note: "at 10% tax",
  },
  statist: {
    title: "Statist",
    weight: 10,
    polarity: "positive",
    alone: {},
    team: {},
    note: "tax 20% or more",
  },
  greedy: {
    title: "Greedy",
    weight: 10,
    polarity: "negative",
    wage: 1.2,
    alone: {},
    team: {},
    note: "asks 20% more (in his wage)",
  },
  modest: {
    title: "Modest",
    weight: 10,
    polarity: "positive",
    wage: 0.85,
    alone: {},
    team: {},
    note: "asks 15% less (in his wage)",
  },
  climber: {
    title: "Climber",
    weight: 10,
    polarity: "negative",
    alone: { drift: 0.02 },
    team: { drift: 0.02 },
    note: "+2% wage a week",
  },
  loyal: {
    title: "Loyal",
    weight: 5,
    polarity: "positive",
    alone: { pct: 0.0375 },
    team: { pct: 0.0375 },
    note: "halves happiness losses",
  },
  flightRisk: {
    title: "Flight Risk",
    weight: 10,
    polarity: "negative",
    alone: null,
    team: null,
    note: "may quit from 50 happiness",
  },
  anchor: {
    title: "Anchor",
    weight: 5,
    polarity: "mixed",
    alone: {},
    team: {},
    note: "never quits",
  },
  gambler: {
    title: "Gambler",
    weight: 10,
    polarity: "mixed",
    alone: { pct: -0.15 },
    team: { pct: -0.15 },
    note: "-15% output, +3 Luck",
  },
  scavenger: {
    title: "Scavenger",
    weight: 2,
    polarity: "mixed",
    alone: { pct: -0.25 },
    team: { pct: -0.25 },
    note: "-25% output, x2 toolboxes",
  },
  salvager: {
    title: "Salvager",
    weight: 5,
    polarity: "positive",
    alone: {},
    team: {},
    note: "toolboxes while storage is full",
  },
  luckyCharm: {
    title: "Lucky Charm",
    weight: 5,
    polarity: "positive",
    alone: {},
    team: {},
    note: "coworkers +3 Luck",
  },
  jinx: {
    title: "Jinx",
    weight: 10,
    polarity: "negative",
    alone: {},
    team: {},
    note: "coworkers -2 Luck",
  },
  recruiter: {
    title: "Recruiter",
    weight: 2,
    polarity: "positive",
    alone: {},
    team: {},
    note: "+1 candidate in every company",
  },
  trainer: {
    title: "Trainer",
    weight: 5,
    polarity: "positive",
    alone: {},
    team: {},
    note: "coworkers train twice a day",
  },
};

const BY_TITLE = new Map(
  Object.entries(TRAITS).map(([code, t]) => [t.title.toLowerCase(), code]),
);

/**
 * A trait code from the label the game prints on its badge (English titles);
 * null for "?" (hidden) or a label in another language.
 * @param {string | null | undefined} label
 */
export function traitCode(label) {
  const key = String(label ?? "")
    .trim()
    .toLowerCase();
  return BY_TITLE.get(key) ?? null;
}

/** @param {Effect | null} e */
const effectOf = (e) => ({
  prod: e?.prod ?? 0,
  pct: e?.pct ?? 0,
  flat: e?.flat ?? 0,
  drift: e?.drift ?? 0,
});

/**
 * The traits a hidden "?" can be, each with its share of new hires.
 * @returns {Array<{ code: string, share: number }>}
 */
export function hiddenTraitPool() {
  const pool = Object.entries(TRAITS).filter(([, t]) => t.weight > 0);
  const total = pool.reduce((s, [, t]) => s + t.weight, 0);
  return pool.map(([code, t]) => ({ code, share: t.weight / total }));
}

/**
 * @typedef {{
 *   wageDay: number | null,
 *   production?: number | null,
 *   traits?: ReadonlyArray<string>,
 *   unknownTraits?: number,
 *   hiddenTraits?: number,
 *   potential?: number | null,
 *   age?: number | null,
 *   home?: boolean | null,
 *   name?: string, responsibility?: number | null, gender?: "male" | "female" | null,
 *   nationality?: string | null,
 * }} Candidate
 *   traits: recognised trait codes; unknownTraits: badges whose label is not
 *   recognised (another language); hiddenTraits: "?" badges; home: his
 *   nationality is the company's country (null when not known).
 * @typedef {{ pointValue: number | null, valuePerPoint?: number | null,
 *   bonus?: number, alone?: boolean, kind?: "raw" | "product" | null,
 *   roster?: import("./team.mjs").Member[] | null, now?: number }} Context
 *   pointValue: the game's point value (wages rest on it); valuePerPoint:
 *   what a point of this company's product is worth (default the point
 *   value; see valuePerPoint()); bonus: the company's production bonus as a
 *   share (0.04 for +4%), less the income tax's happiness cost; alone: no
 *   coworkers; kind: the company makes a raw resource or a product.
 */

/**
 * The resources a company can make: production points a unit and the inputs
 * a unit consumes (gameConfig items[].productionPoints / productionNeeds,
 * live 2026-10-26).
 * @type {Readonly<Record<string, { pp: number, needs: Readonly<Record<string, number>> }>>}
 */
export const RECIPES = {
  grain: { pp: 1, needs: {} },
  limestone: { pp: 1, needs: {} },
  iron: { pp: 1, needs: {} },
  coca: { pp: 1, needs: {} },
  lead: { pp: 1, needs: {} },
  petroleum: { pp: 1, needs: {} },
  wood: { pp: 1, needs: {} },
  livestock: { pp: 20, needs: {} },
  fish: { pp: 40, needs: {} },
  concrete: { pp: 10, needs: { limestone: 10 } },
  steel: { pp: 10, needs: { iron: 10 } },
  bread: { pp: 10, needs: { grain: 10 } },
  steak: { pp: 20, needs: { livestock: 1 } },
  cookedFish: { pp: 40, needs: { fish: 1 } },
  lightAmmo: { pp: 1, needs: { lead: 1 } },
  ammo: { pp: 4, needs: { lead: 4 } },
  heavyAmmo: { pp: 16, needs: { lead: 16 } },
  cocain: { pp: 200, needs: { coca: 200 } },
  oil: { pp: 1, needs: { petroleum: 1 } },
  paper: { pp: 1, needs: { wood: 1 } },
};

/**
 * Raw resource or product, by its recipe; null for a code no company makes.
 * @param {string | null | undefined} code
 * @returns {"raw" | "product" | null}
 */
export function productKind(code) {
  const r = code ? RECIPES[code] : null;
  if (!r) return null;
  return Object.keys(r.needs).length ? "product" : "raw";
}

/**
 * What one production point of a company's product fetches sold at once: the
 * product's best bid less its inputs at their best bids (they could be sold
 * instead), per point. null when a price is missing.
 * @param {string | null | undefined} code
 * @param {(code: string) => number | null | undefined} bidOf
 */
export function valuePerPoint(code, bidOf) {
  const r = code ? RECIPES[code] : null;
  if (!r) return null;
  const bid = bidOf(/** @type {string} */ (code));
  if (!(bid != null && bid > 0)) return null;
  let inputs = 0;
  for (const [input, qty] of Object.entries(r.needs)) {
    const b = bidOf(input);
    if (!(b != null && b > 0)) return null;
    inputs += qty * b;
  }
  return (bid - inputs) / r.pp;
}

/**
 * The trait cases a candidate can be, each with its prior share: his
 * recognised traits are certain, every hidden or unread badge is one draw
 * from the hire pool (half of all candidates carry one trait, so at most one
 * badge in practice; a second is drawn the same way).
 * @param {Candidate} c
 * @returns {Array<{ codes: string[], share: number }>}
 */
export function traitCases(c) {
  const known = [...(c.traits ?? [])].filter((code) => TRAITS[code]);
  const draws = Math.max(0, (c.hiddenTraits ?? 0) + (c.unknownTraits ?? 0));
  /** @type {Array<{ codes: string[], share: number }>} */
  let cases = [{ codes: known, share: 1 }];
  const pool = hiddenTraitPool();
  for (let i = 0; i < Math.min(draws, 2); i++)
    cases = cases.flatMap((k) =>
      pool.map((p) => ({
        codes: [...k.codes, p.code],
        share: k.share * p.share,
      })),
    );
  return cases;
}

/** @param {ReadonlyArray<string>} codes */
const wageMultOf = (codes) =>
  codes.reduce((m, code) => m * (TRAITS[code]?.wage ?? 1), 1);

/**
 * How likely each Production 1..4 is, and the expectation it implies, from
 * the wage a day the card prints. A revealed Production is certain. Each
 * entry carries its trait case. null without a wage or a point value.
 * @param {Candidate} c
 * @param {number | null} pointValue
 * @param {number} [tolerance]
 * @returns {Array<{ production: number, codes: string[], expectation: number, prob: number }> | null}
 */
export function productionOdds(c, pointValue, tolerance = WAGE_TOLERANCE) {
  if (!(pointValue && pointValue > 0) || !(c.wageDay && c.wageDay > 0))
    return null;
  const x = c.wageDay / (HOURS_PER_POINT * pointValue);
  const lo = (1 - WAGE_SPREAD) * (1 - tolerance);
  const hi = (1 + WAGE_SPREAD) * (1 + tolerance);
  const revealed =
    c.production != null && Number.isFinite(c.production) ? c.production : null;
  const levels =
    revealed != null
      ? [revealed]
      : Array.from({ length: STAT_MAX - STAT_MIN + 1 }, (_, i) => STAT_MIN + i);
  /** @type {Array<{ production: number, codes: string[], expectation: number, prob: number }>} */
  const out = [];
  for (const k of traitCases(c))
    for (const p of levels) {
      const m = wageMultOf(k.codes);
      const e = x / (p * m);
      if (e < lo || e > hi) continue;
      // density of the observed wage under (p, m): uniform expectation of
      // width 2 x spread, scaled by p x m
      out.push({
        production: p,
        codes: k.codes,
        expectation: e,
        prob: k.share / (p * m),
      });
    }
  const total = out.reduce((s, o) => s + o.prob, 0);
  if (!(total > 0)) return [];
  for (const o of out) o.prob /= total;
  return out;
}

/**
 * Production's spread over 1..4 from the odds: { [production]: prob }.
 * @param {ReturnType<typeof productionOdds>} odds
 */
export function productionShares(odds) {
  /** @type {Record<number, number>} */
  const s = {};
  for (const o of odds ?? []) s[o.production] = (s[o.production] ?? 0) + o.prob;
  return s;
}

/**
 * How often a trait's condition holds where nothing on the page says (a
 * tool in his hands, his favourite product, coworkers of one gender or
 * nationality, a better-paid or stronger coworker): its effect is weighed
 * by it. Conditions the context settles (alone or in a team, his home
 * country, a raw or a product, his age) are not here.
 * @type {Readonly<Record<string, number>>}
 */
export const CONDITION_ODDS = {
  handy: 0.3,
  improviser: 0.7,
  nationalist: 0.5,
  xenophobe: 0.5,
  cosmopolitan: 0.25,
  mentor: 0.5,
  rival: 0.5,
  primaDonna: 0.33,
  envious: 0.5,
  oldFriends: 0.1,
  nemesis: 0.1,
  sweethearts: 0.1,
  girlPower: 0.25,
  bandOfBrothers: 0.25,
  manHater: 0.25,
  misogynist: 0.25,
  specialist: 0.05, // his favourite product: one of twenty
  claustrophobe: 0.7,
};
/** Traits that work only from 40 on. */
const FROM_40 = new Set(["lateBloomer", "wornOut"]);
/** The share of candidates aged 40 or more (starting ages 18 to 45). */
const P_40 = 6 / 28;

/**
 * A trait's effect where he works: the company's kind of product, his
 * nationality and his age decide when they are known (else both ways
 * averaged), otherwise alone or in a team; conditions nothing settles are
 * weighed by CONDITION_ODDS.
 * @param {string} code
 * @param {{ alone: boolean, home: boolean | null, kind: "raw" | "product" | null, age?: number | null }} at
 */
function effectFor(code, at) {
  const t = TRAITS[code];
  /** @param {Effect | null} x @param {Effect | null} y */
  const mix = (x, y) => {
    const a = effectOf(x);
    const b = effectOf(y);
    return {
      prod: (a.prod + b.prod) / 2,
      pct: (a.pct + b.pct) / 2,
      flat: (a.flat + b.flat) / 2,
      drift: (a.drift + b.drift) / 2,
    };
  };
  const e = t.kind
    ? at.kind
      ? effectOf(t.kind[at.kind])
      : mix(t.kind.raw, t.kind.product)
    : t.home
      ? at.home != null
        ? effectOf(at.home ? t.home.yes : t.home.no)
        : mix(t.home.yes, t.home.no)
      : effectOf(at.alone ? t.alone : t.team);
  let p = CONDITION_ODDS[code] ?? 1;
  if (FROM_40.has(code))
    p *=
      at.age != null && Number.isFinite(at.age) ? (at.age >= 40 ? 1 : 0) : P_40;
  return {
    prod: e.prod * p,
    pct: e.pct * p,
    flat: e.flat * p,
    drift: e.drift,
  };
}

/**
 * Gold a day he makes his owner at a production bonus, one case.
 * @param {{ production: number, codes: string[] }} k
 * @param {{ wageDay: number, valuePerPoint: number, bonus: number, alone: boolean,
 *   home: boolean | null, kind: "raw" | "product" | null, age: number | null, day: number,
 *   self?: import("./team.mjs").TeamResult["self"] }} at
 */
function profitDay(k, at) {
  let prod = 0;
  let pct = 0;
  let flat = 0;
  let drift = 0;
  for (const code of k.codes) {
    if (at.self && TEAM_RULES[code]) continue;
    const e = effectFor(code, at);
    prod += e.prod;
    pct += e.pct;
    flat += e.flat;
    drift += e.drift;
  }
  if (at.self) {
    prod += at.self.prod;
  }
  const teamPct = at.self ? (at.self.pctDays?.[at.day] ?? at.self.pct ?? 0) : 0;
  const v = HOURS_PER_POINT * at.valuePerPoint;
  const out =
    v *
    ((k.production + prod) * (1 + at.bonus + teamPct) +
      k.production * pct +
      flat);
  const wage = at.wageDay * (1 + drift * Math.floor(at.day / 7));
  return out - wage;
}

/**
 * What a candidate is likely worth: Production read from his wage, the
 * expectation he will show once hired, gold a day today and once his
 * specialization is full, days until he asks to retire and the gold until
 * then (HORIZON_DAYS at most). null when his wage or the point value is
 * missing.
 * @param {Candidate} c
 * @param {Context} ctx
 */
export function candidateValue(c, ctx) {
  let odds = productionOdds(c, ctx.pointValue);
  if (odds == null) return null;
  let drifted = false;
  if (odds.length === 0) {
    const wide = productionOdds(c, ctx.pointValue, DRIFT_TOLERANCE);
    if (wide?.length) {
      odds = wide;
      drifted = true;
    }
  }
  // a product whose inputs fetch more than it does is worth less than nothing
  // a point: that is kept, never replaced by the point value
  const valuePerPoint =
    ctx.valuePerPoint != null && Number.isFinite(ctx.valuePerPoint)
      ? ctx.valuePerPoint
      : /** @type {number} */ (ctx.pointValue);
  const bonus = ctx.bonus ?? 0;
  const alone = ctx.alone ?? false;
  const home = c.home ?? null;
  const kind = ctx.kind ?? null;
  const wageDay = /** @type {number} */ (c.wageDay);
  const daysLeft =
    c.age != null && Number.isFinite(c.age)
      ? Math.max(0, RETIRE_AGE - c.age)
      : null;
  const horizon = Math.min(daysLeft ?? HORIZON_DAYS, HORIZON_DAYS);
  const shares = productionShares(odds);
  const fits = odds.length > 0;
  const cases = odds.map((k) => ({
    ...k,
    result: ctx.roster
      ? teamEffect(
          ctx.roster,
          {
            kind: "hire",
            candidate: {
              name: c.name,
              baseP: k.production,
              R: c.responsibility ?? 2.5,
              traits: k.codes,
              wageHour: wageDay / 24,
              age: c.age ?? RETIRE_AGE - horizon,
              gender: c.gender ?? null,
              nationality: c.nationality ?? null,
            },
          },
          {
            now: ctx.now ?? Date.now(),
            pointValue: /** @type {number} */ (ctx.pointValue),
            valuePerPoint,
            subjectHorizon: horizon,
          },
        )
      : null,
  }));
  const team = ctx.roster
    ? averageTeamEffects(
        cases.map((k) => ({
          result: /** @type {import("./team.mjs").TeamResult} */ (k.result),
          prob: k.prob,
        })),
      )
    : null;
  if (
    team &&
    c.responsibility == null &&
    team.self.why.some((why) =>
      /^(?:Bully|Sociable|Envious|Xenophobe|Prima Donna) [−-]/.test(why),
    )
  )
    team.assumed.push(
      "Candidate Responsibility hidden: average 2.5 for happiness shield",
    );
  /** @param {number} day */
  const expected = (day) =>
    cases.reduce(
      (s, k) =>
        s +
        k.prob *
          profitDay(k, {
            wageDay,
            valuePerPoint,
            bonus: bonus + Math.min(day * SPEC_PER_DAY, SPEC_CAP),
            alone,
            home,
            kind,
            age: c.age ?? null,
            day,
            self: k.result?.self,
          }),
      0,
    );
  let total = 0;
  for (let d = 0; d < horizon; d++) total += expected(d);
  const meanProduction = odds.reduce((s, k) => s + k.prob * k.production, 0);
  const expectations = odds.map((k) => k.expectation);
  // the chance he is a Flight Risk (certain when the badge says so, the
  // trait's share of hires when it is hidden): priced at nothing, flagged
  const risky = odds.reduce(
    (s, k) =>
      s + (k.codes.some((code) => TRAITS[code]?.alone === null) ? k.prob : 0),
    0,
  );
  /** @type {number | null} */
  let likeliest = null;
  for (const [p, share] of Object.entries(shares))
    if (likeliest == null || share > shares[likeliest]) likeliest = Number(p);
  return {
    fits,
    drifted,
    shares,
    meanProduction: fits ? meanProduction : null,
    likeliest,
    expectation: fits
      ? { min: Math.min(...expectations), max: Math.max(...expectations) }
      : null,
    perDayNow: fits ? expected(0) : null,
    perDaySettled: fits ? expected(SPEC_CAP / SPEC_PER_DAY) : null,
    daysLeft,
    horizon,
    total: fits ? total : null,
    flightRisk: risky,
    ...(team ?? {}),
  };
}

/**
 * Every candidate valued and the best one marked: the largest total, then
 * the larger gold a day once settled. A candidate whose wage fits no
 * Production 1..4 (point value moved, a misread) is never the best.
 * @param {ReadonlyArray<Candidate>} list
 * @param {Context} ctx
 */
export function rankCandidates(list, ctx) {
  const valued = list.map((c, index) => ({
    index,
    value: candidateValue(c, ctx),
  }));
  /** @param {ReturnType<typeof candidateValue>} value */
  const combined = (value) =>
    value?.total == null ? -Infinity : value.total + (value.team ?? 0);
  const ranked = valued
    .filter((v) => v.value?.fits && v.value.total != null)
    .sort(
      (a, b) =>
        combined(b.value) - combined(a.value) ||
        /** @type {number} */ (b.value?.perDaySettled) -
          /** @type {number} */ (a.value?.perDaySettled),
    );
  const best = ranked.length ? ranked[0].index : null;
  return {
    values: valued.map((v) => v.value),
    best,
    bestPays: best != null && combined(valued[best].value) > 0,
  };
}

// ------------------------------------------------------------- training -
// The game's Train window deals three cards and keeps one (the draw is paid:
// 10 energy). Each card is valued in gold for this employee until he turns
// 65 (HORIZON_DAYS at most), at the game's point value. Card rules (client
// config, docs/GAME-FACTS.md §12): a drill adds 1 / 2 / 3 / 4 to a stat by
// rarity; Negotiation takes 5 / 10 / 20 points off his wage expectation,
// never below 70%; Wild card gives a random hidden trait and +1 to a random
// stat; New habit teaches the trait(s) it shows (replacing one it shows
// faded); Rehab removes the trait it shows, Clean slate every negative one;
// Second wind adds training potential.

/** Gold that 10 energy of the player's own work makes (3-6 g, Production skill 0-10): a further training's cost. */
export const ENERGY_GOLD = 4.5;
/** A Negotiation card never takes the wage expectation below this. */
export const WAGE_FLOOR = 0.7;
/** Income tax (%) a Responsibility drill is valued at: the v0.27 guide's reference. */
export const REF_TAX = 10;
/** Stats a drill can raise, in the order the Train window prints its chips. */
export const TRAIN_STATS = ["production", "responsibility", "luck"];
/** Client training config (module 56899, read 2026-10-27). */
export const TRAIN_PER_DAY = 1;
export const TRAIN_ENERGY_COST = 10;
export const TRAIN_HAND_SIZE = 3;
export const TRAIN_POTENTIAL_CAP = 15;
export const TRAIN_WEIGHTS = {
  common: 55,
  uncommon: 25,
  rare: 13,
  epic: 5,
  legendary: 2,
};
export const LUCK_TRAIN_SHIFT = {
  uncommon: 0.5,
  rare: 0.3,
  epic: 0.15,
  legendary: 0.05,
};
export const LEADERSHIP_TRAIN_SHIFT = {
  uncommon: 1,
  rare: 0.6,
  epic: 0.3,
  legendary: 0.1,
};
export const LUCK_TOOLBOX_PER_POINT = 0.001;
export const TOOLBOX_CHANCE_CAP = 0.02;

/**
 * @typedef {{ kind: string | null, rarity?: string | null, delta?: number | null,
 *   stat?: string | null, traitTo?: ReadonlyArray<string>, trait?: string | null }} TrainingCard
 *   kind: drill | negotiation | wild | habit | rehab | cleanSlate | secondWind;
 *   traitTo / trait: the trait codes the card teaches / removes or replaces.
 * @typedef {{ production: number, responsibility?: number | null,
 *   luck?: number | null, potential?: number | null, potentialMax?: number | null,
 *   wageChip: number, traits?: ReadonlyArray<string>, bonus?: number,
 *   hiredDays?: number, age?: number | null, leadership?: number | null,
 *   wageDay?: number | null }} Trainee
 *   wageChip: his coin chip as a share (+0.138), Greedy / Modest and a
 *   Climber's drift included, as the game prints it; bonus: his pickaxe chip
 *   as a share (0.009 for +0.9%).
 */

/**
 * Rarity shares at the employee's Luck and the player's Leadership.
 * Common cannot go below zero; above that point the total weight grows.
 * @param {number} luck
 * @param {number} [leadership]
 */
export function trainingOdds(luck, leadership = 0) {
  const points = Number.isFinite(luck) ? Math.max(0, luck) : 0;
  const levels = Number.isFinite(leadership) ? Math.max(0, leadership) : 0;
  const weights = { ...TRAIN_WEIGHTS };
  let shift = 0;
  for (const rarity of /** @type {Array<keyof typeof LUCK_TRAIN_SHIFT>} */ (
    Object.keys(LUCK_TRAIN_SHIFT)
  )) {
    const gain =
      points * LUCK_TRAIN_SHIFT[rarity] +
      levels * LEADERSHIP_TRAIN_SHIFT[rarity];
    weights[rarity] += gain;
    shift += gain;
  }
  weights.common = Math.max(0, weights.common - shift);
  const total = Object.values(weights).reduce((s, w) => s + w, 0);
  for (const rarity of /** @type {Array<keyof typeof weights>} */ (
    Object.keys(weights)
  ))
    weights[rarity] /= total;
  return weights;
}

/**
 * Every card available to this employee under the client pool rules.
 * @param {Trainee} trainee
 * @returns {TrainingCard[]}
 */
export function trainingPool(trainee) {
  /** @type {TrainingCard[]} */
  const pool = [];
  const drillRarities = ["common", "uncommon", "epic", "legendary"];
  for (const stat of TRAIN_STATS)
    for (const [i, rarity] of drillRarities.entries())
      pool.push({ kind: "drill", rarity, delta: i + 1, stat });
  const owned = new Set(trainee.traits ?? []);
  let negatives = 0;
  for (const code of owned) {
    const polarity = TRAITS[code]?.polarity;
    if (polarity === "negative") negatives++;
    if (polarity === "negative" || polarity === "mixed")
      pool.push({
        kind: "rehab",
        rarity: polarity === "negative" ? "rare" : "uncommon",
        trait: code,
      });
  }
  if (negatives >= 2) pool.push({ kind: "cleanSlate", rarity: "legendary" });
  const available = Object.entries(TRAITS).filter(([code]) => !owned.has(code));
  const positive = available.filter(([, t]) => t.polarity === "positive");
  for (const [code, t] of available)
    if (t.polarity === "positive" || t.polarity === "mixed")
      pool.push({
        kind: "habit",
        rarity: t.polarity === "positive" ? "epic" : "rare",
        traitTo: [code],
      });
  for (let i = 0; i < positive.length; i++)
    for (let j = i + 1; j < positive.length; j++)
      pool.push({
        kind: "habit",
        rarity: "legendary",
        traitTo: [positive[i][0], positive[j][0]],
      });
  if (available.length) pool.push({ kind: "wild", rarity: "uncommon" });
  for (const [i, rarity] of ["rare", "epic", "legendary"].entries()) {
    const delta = i + 2;
    if (
      trainee.potentialMax != null &&
      trainee.potentialMax + delta <= TRAIN_POTENTIAL_CAP
    )
      pool.push({ kind: "secondWind", rarity, delta });
  }
  const markup = [...owned].reduce(
    (s, c) => s + ((TRAITS[c]?.wage ?? 1) - 1),
    0,
  );
  const expectation = (1 + trainee.wageChip) / (1 + markup);
  for (const [i, rarity] of ["common", "uncommon", "rare"].entries()) {
    const delta = [5, 10, 20][i];
    // Tiny tolerance keeps exact floor boundaries despite floating-point division.
    if (expectation - delta / 100 >= WAGE_FLOOR - 1e-12)
      pool.push({ kind: "negotiation", rarity, delta });
  }
  return pool;
}

/**
 * Exact expected best card: the single-draw CDF raised to handSize.
 * Model assumption: independent rarity draws, renormalised over the pool's
 * available rarities, then uniform cards within that rarity; keep the best.
 * Unpriced cards are omitted; an empty hand or pool has value zero.
 * @param {ReadonlyArray<{ rarity?: string | null, gold: number | null }>} pricedPool
 * @param {Readonly<Record<string, number>>} odds
 * @param {number} [handSize]
 */
export function bestOfHand(pricedPool, odds, handSize = TRAIN_HAND_SIZE) {
  if (handSize <= 0) return 0;
  const cards = pricedPool.flatMap(({ rarity, gold }) =>
    rarity && gold != null && Number.isFinite(gold) && odds[rarity] > 0
      ? [{ rarity, gold }]
      : [],
  );
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const c of cards) counts.set(c.rarity, (counts.get(c.rarity) ?? 0) + 1);
  const weight = [...counts.keys()].reduce((s, r) => s + odds[r], 0);
  if (!weight) return 0;
  cards.sort((a, b) => a.gold - b.gold);
  let cdf = 0;
  let prev = 0;
  let expected = 0;
  for (const c of cards) {
    cdf = Math.min(
      1,
      cdf +
        odds[c.rarity] / weight / /** @type {number} */ (counts.get(c.rarity)),
    );
    const next = cdf ** handSize;
    expected += c.gold * (next - prev);
    prev = next;
  }
  return expected;
}

/**
 * Every card of a hand valued for one employee: gold, perDay (daily streams),
 * hands (Luck and Second wind), and note; best, horizon and paidProduction.
 * Gold is null for a card that cannot be priced; the best is
 * the largest gold (ties to the first), which matters even when all lose:
 * the window keeps one card anyway. null without a point value.
 * @param {ReadonlyArray<TrainingCard>} cards
 * @param {Trainee} trainee
 * @param {{ pointValue: number | null, valuePerPoint?: number | null, alone?: boolean | null,
 *   roster?: import("./team.mjs").Member[] | null, traineeId?: string | null, now?: number }} ctx
 */
export function trainingValues(cards, trainee, ctx) {
  const pp = ctx.pointValue;
  if (!(pp != null && pp > 0) || !(trainee.production >= 0)) return null;
  const V =
    ctx.valuePerPoint != null && Number.isFinite(ctx.valuePerPoint)
      ? ctx.valuePerPoint
      : pp;
  const P = trainee.production;
  const subject = ctx.roster?.find((m) => m.id === ctx.traineeId);
  const now = ctx.now ?? Date.now();
  const traits = [...(trainee.traits ?? [])].filter((c) => TRAITS[c]);
  // the markup Greedy and Modest put on his expectation (summed, as the chip sums it)
  const markup = traits.reduce((s, c) => s + ((TRAITS[c].wage ?? 1) - 1), 0);
  const M = 1 + trainee.wageChip; // his whole wage multiplier
  const paidEstimate =
    trainee.wageDay != null && M > 0
      ? trainee.wageDay / (HOURS_PER_POINT * pp * M)
      : NaN;
  const paidProduction =
    subject?.baseP ??
    (Number.isFinite(paidEstimate) &&
    Math.round(paidEstimate) > 0 &&
    Math.abs(paidEstimate - Math.round(paidEstimate)) <= 0.15
      ? Math.round(paidEstimate)
      : P);
  const expectation = M / (1 + markup);
  const H = Math.min(
    trainee.age != null && Number.isFinite(trainee.age)
      ? Math.max(0, RETIRE_AGE - trainee.age)
      : HORIZON_DAYS,
    HORIZON_DAYS,
  );
  const left =
    trainee.potential != null &&
    Number.isFinite(trainee.potential) &&
    trainee.potentialMax != null &&
    Number.isFinite(trainee.potentialMax)
      ? Math.max(0, trainee.potentialMax - trainee.potential)
      : null;
  // Drawing the open hand already increased potential; no second subtraction.
  const futureHands =
    left == null ? null : Math.max(0, Math.min(left, (H - 1) * TRAIN_PER_DAY));
  /** Full-horizon value left for hands drawn on days 1 through count. */
  const handWeight = (/** @type {number} */ count) => {
    let weight = 0;
    for (let j = 1; j <= count; j++) weight += (H - j / TRAIN_PER_DAY) / H;
    return weight;
  };
  const hired =
    subject?.spec != null
      ? subject.spec / (100 * SPEC_PER_DAY)
      : (trainee.hiredDays ?? 0);
  const full = SPEC_CAP / SPEC_PER_DAY;
  /** His production bonus d days on: the chip now plus the specialization still to come. */
  const bonusAt = (/** @type {number} */ d) =>
    (trainee.bonus ?? 0) +
    (Math.min(hired + d, full) - Math.min(hired, full)) * SPEC_PER_DAY;
  const sum = (/** @type {(d: number) => number} */ f) => {
    let s = 0;
    for (let d = 0; d < H; d++) s += f(d);
    return s;
  };
  /** Gold over the horizon of gaining one trait; alone and in a team averaged when not known. */
  const traitGold = (/** @type {string} */ code) => {
    const t = TRAITS[code];
    if (!t) return null;
    const where = { home: null, kind: null, age: trainee.age ?? null };
    const a =
      subject && TEAM_RULES[code]
        ? effectOf({})
        : effectFor(code, { ...where, alone: true });
    const b =
      subject && TEAM_RULES[code]
        ? effectOf({})
        : effectFor(code, { ...where, alone: false });
    const e =
      ctx.alone == null
        ? {
            prod: (a.prod + b.prod) / 2,
            pct: (a.pct + b.pct) / 2,
            flat: (a.flat + b.flat) / 2,
            drift: (a.drift + b.drift) / 2,
          }
        : ctx.alone
          ? a
          : b;
    const paid = HOURS_PER_POINT * pp * paidProduction;
    return sum(
      (d) =>
        HOURS_PER_POINT * V * (e.prod * (1 + bonusAt(d)) + P * e.pct + e.flat) -
        paid * (1 + markup) * e.drift * Math.floor((hired + d) / 7) -
        paid * expectation * ((t.wage ?? 1) - 1),
    );
  };
  const drillGold = (/** @type {string | null | undefined} */ stat, k = 1) => {
    if (stat === "production")
      return sum((d) => HOURS_PER_POINT * k * (V * (1 + bonusAt(d)) - pp * M));
    if (stat === "responsibility") {
      if (subject) {
        if (
          subject.shield == null ||
          subject.R == null ||
          subject.items == null ||
          subject.items.some((item) => item.delta == null)
        )
          return null;
        const gain = Math.min(1, (subject.R + k) * 0.1) - subject.shield;
        return sum((d) => {
          const loss =
            subject.items?.reduce(
              (s, item) =>
                s +
                (item.delta != null &&
                item.delta < 0 &&
                (item.until == null || item.until > now + d * 86400e3)
                  ? -item.delta
                  : 0),
              0,
            ) ?? 0;
          return (HOURS_PER_POINT * V * P * loss * gain) / 100;
        });
      }
      // each point shields a tenth of his happiness losses: at REF_TAX
      // income tax, k points keep k x tax / 10 % of his output
      const kk = Math.max(0, Math.min(k, 10 - (trainee.responsibility ?? 0)));
      return sum(
        (d) =>
          HOURS_PER_POINT * V * P * (1 + bonusAt(d)) * ((kk * REF_TAX) / 1000),
      );
    }
    if (stat === "luck") return 0; // No recursive Luck value inside the future pool.
    return null;
  };
  const pct = (/** @type {number} */ x) =>
    `${x >= 0 ? "+" : ""}${Math.round(x * 1000) / 10}%`;
  /**
   * Reuse the dealt-card rules for the pool, with Luck held at zero there.
   * @param {TrainingCard} card
   * @param {boolean} [priceLuck]
   * @returns {{ gold: number | null, note: string, hands?: number | null }}
   */
  const basePriceCard = (card, priceLuck = false) => {
    const k = card.delta ?? 0;
    switch (card.kind) {
      case "negotiation": {
        const cut = Math.max(0, Math.min(k / 100, expectation - WAGE_FLOOR));
        const daily =
          HOURS_PER_POINT * pp * paidProduction * (1 + markup) * cut;
        return {
          gold: H * daily,
          note: `wage chip ${pct(trainee.wageChip)} → ${pct(M - cut * (1 + markup) - 1)}: saves ${daily.toFixed(2)} g a day`,
        };
      }
      case "drill":
        if (card.stat === "luck" && priceLuck) return luckValue(k);
        return {
          gold: drillGold(card.stat, k),
          note:
            card.stat === "production"
              ? `+${k} Production, paid too: his wage rises with it (wage chip ${pct(trainee.wageChip)})`
              : card.stat === "responsibility"
                ? subject
                  ? `+${k} Responsibility shields actual happiness losses, including their expiry`
                  : `+${k} Responsibility shields happiness losses (valued at ${REF_TAX}% income tax)`
                : card.stat === "luck"
                  ? `+${k} Luck: held at zero inside the future pool`
                  : "the drilled stat was not read",
        };
      case "wild": {
        const luck = priceLuck ? luckValue(1).gold : 0;
        if (luck == null)
          return {
            gold: null,
            note: "trainings left not read for the random Luck stat",
          };
        const trait = hiddenTraitPool().reduce(
          (s, p) => s + p.share * /** @type {number} */ (traitGold(p.code)),
          0,
        );
        const stat =
          TRAIN_STATS.reduce(
            (s, st) =>
              s +
              (st === "luck" ? luck : /** @type {number} */ (drillGold(st, 1))),
            0,
          ) / TRAIN_STATS.length;
        return {
          gold: trait + stat,
          note: "a random hidden trait (by how often each comes) and +1 to a random stat, on average",
        };
      }
      case "habit": {
        const gains = (card.traitTo ?? []).map(traitGold);
        if (!gains.length || gains.some((g) => g == null))
          return { gold: null, note: "the trait it teaches was not read" };
        const lost = card.trait ? (traitGold(card.trait) ?? 0) : 0;
        return {
          gold:
            gains.reduce(
              (/** @type {number} */ s, g) => s + /** @type {number} */ (g),
              0,
            ) - lost,
          note: `teaches ${(card.traitTo ?? []).map((c) => TRAITS[c].title).join(" and ")}${card.trait ? ` in place of ${TRAITS[card.trait]?.title ?? card.trait}` : ""}`,
        };
      }
      case "rehab": {
        const g = card.trait ? traitGold(card.trait) : null;
        return g == null
          ? { gold: null, note: "the trait it removes was not read" }
          : {
              gold: -g,
              note: `removes ${TRAITS[/** @type {string} */ (card.trait)].title}`,
            };
      }
      case "cleanSlate": {
        const bad = traits.filter((c) => TRAITS[c].polarity === "negative");
        return {
          gold: -bad.reduce(
            (s, c) => s + /** @type {number} */ (traitGold(c)),
            0,
          ),
          note: `removes ${bad.map((c) => TRAITS[c].title).join(", ") || "no bad trait he shows"}`,
        };
      }
      default:
        return { gold: null, note: "this card is not priced" };
    }
  };
  /** @param {import("./team.mjs").TeamResult} team */
  const correctionFor = (team) =>
    sum(
      (d) =>
        HOURS_PER_POINT *
        V *
        (team.self.prod * (1 + bonusAt(d)) +
          (P + team.self.prod) * (team.self.pctDays[d] ?? team.self.pct ?? 0)),
    );
  const teamCache = new Map();
  /** @param {TrainingCard} card @param {boolean} [priceLuck]
   * @returns {{ gold: number | null, note: string, hands?: number | null } & Partial<import("./team.mjs").TeamResult>} */
  const priceCard = (card, priceLuck = false) => {
    const value = basePriceCard(card, priceLuck);
    if (!subject || !ctx.roster || !subject.id) return value;
    if (value.gold == null) return { ...value, ...averageTeamEffects([]) };
    const key = JSON.stringify(card);
    let cached = teamCache.get(key);
    if (!cached) {
      let team;
      let correction;
      const effect = (/** @type {import("./team.mjs").TeamCard} */ c) =>
        teamEffect(
          /** @type {import("./team.mjs").Member[]} */ (ctx.roster),
          { kind: "card", id: /** @type {string} */ (subject.id), card: c },
          { now, pointValue: pp, valuePerPoint: V, subjectHorizon: H },
        );
      if (card.kind === "wild") {
        const cases = hiddenTraitPool().flatMap((t) =>
          TRAIN_STATS.map((stat) => ({
            result: effect({
              kind: "wild",
              trait: t.code,
              stat: /** @type {"production" | "responsibility" | "luck"} */ (
                stat
              ),
              delta: 1,
            }),
            prob: t.share / TRAIN_STATS.length,
          })),
        );
        team = averageTeamEffects(cases);
        // Production and bonus multiply within each outcome, before averaging.
        correction = cases.reduce(
          (s, c) => s + c.prob * correctionFor(c.result),
          0,
        );
      } else if (card.kind === "cleanSlate") {
        team = effect({
          kind: "cleanSlate",
          traits: traits.filter((c) => TRAITS[c].polarity === "negative"),
        });
      } else if (card.kind === "negotiation") {
        const cut = Math.max(
          0,
          Math.min((card.delta ?? 0) / 100, expectation - WAGE_FLOOR),
        );
        team = effect({ kind: "negotiation", delta: cut * 100 });
      } else if (["drill", "habit", "rehab"].includes(card.kind ?? "")) {
        team = effect(
          /** @type {import("./team.mjs").TeamCard} */ ({
            ...card,
            delta: card.delta ?? 0,
          }),
        );
      } else team = averageTeamEffects([]);
      cached = { team, correction: correction ?? correctionFor(team) };
      teamCache.set(key, cached);
      if (team.self.pct == null)
        team.assumed.push(
          "Trainee happiness inputs incomplete; self team happiness not priced",
        );
    }
    const { team, correction } = cached;
    return {
      ...value,
      gold: value.gold == null ? null : value.gold + correction,
      ...team,
    };
  };
  const windValue = (
    /** @type {TrainingCard} */ card,
    /** @type {number} */ top,
  ) => {
    const hands =
      futureHands == null
        ? null
        : Math.max(
            0,
            Math.min(card.delta ?? 0, (H - 1) * TRAIN_PER_DAY - futureHands),
          );
    let gold = 0;
    for (let j = 1; j <= (hands ?? 0); j++) {
      const weight = (H - ((futureHands ?? 0) + j) / TRAIN_PER_DAY) / H;
      gold += Math.max(0, top * weight - ENERGY_GOLD);
    }
    return {
      gold: hands == null ? null : gold,
      hands,
      note: `+${hands ?? "?"} trainings after ${futureHands ?? "?"} already left: a hand's best card averages ${top.toFixed(1)} g at these odds, weighted by days left; each costs ${TRAIN_ENERGY_COST} energy (≈ ${ENERGY_GOLD} g of your own work)`,
    };
  };
  const luck = trainee.luck ?? 0;
  const leadership = trainee.leadership ?? 0;
  const odds = trainingOdds(luck, leadership);
  const pool = trainingPool(trainee);
  const otherPool = pool
    .filter((c) => c.kind !== "secondWind")
    .map((c) => ({ ...c, ...priceCard(c) }));
  // The pool's Second wind uses the baseline expected best hand of other
  // cards, rather than the maximum of the entire pool. Hold these card
  // prices fixed while changing the rarity odds, so Luck measures the draw.
  const otherBest = bestOfHand(otherPool, odds);
  const pricedPool = [
    ...otherPool,
    ...pool
      .filter((c) => c.kind === "secondWind")
      .map((c) => ({ ...c, ...windValue(c, otherBest) })),
  ];
  const baseline = bestOfHand(pricedPool, odds);
  const percent = (/** @type {number} */ x) =>
    `${x >= 0 ? "+" : ""}${Math.round(x * 10000) / 100}%`;
  // the server's draw is not in the client: each card draws a rarity, then a card of it at random
  const assumption = "model: each card draws a rarity, then a card of it";
  const luckValue = (/** @type {number} */ k) => {
    const improvedOdds = trainingOdds(luck + k, leadership);
    const gain = bestOfHand(pricedPool, improvedOdds) - baseline;
    const changes = Object.keys(LUCK_TRAIN_SHIFT)
      .map(
        (r) =>
          `${r} ${percent(improvedOdds[/** @type {keyof typeof improvedOdds} */ (r)] - odds[/** @type {keyof typeof odds} */ (r)])}`,
      )
      .join(", ");
    const toolbox = (/** @type {number} */ l) =>
      Math.min(TOOLBOX_CHANCE_CAP, Math.max(0, l) * LUCK_TOOLBOX_PER_POINT);
    return {
      gold: futureHands == null ? null : handWeight(futureHands) * gain,
      hands: futureHands,
      note: `+${k} Luck: ${futureHands == null ? "trainings left not read" : `${futureHands} more training${futureHands === 1 ? "" : "s"} after this one, weighted by days left; best hand averages ${gain >= 0 ? "+" : ""}${gain.toFixed(2)} g more`} (rarer cards: ${changes}); toolbox chance ${percent(toolbox(luck + k) - toolbox(luck))} an hour, not priced; ${assumption}`,
    };
  };
  const values = cards.map((card) => priceCard(card, true));
  // Second wind: more trainings later, each a new hand whose best card is
  // worth what a hand at these odds averages, less the 10 energy it costs.
  // This hand's other cards are what picking it gives up, not what later
  // hands hold: pricing them as such counted a strong hand twice.
  for (const [i, card] of cards.entries())
    if (card.kind === "secondWind")
      values[i] = { ...values[i], ...windValue(card, otherBest) };
  /** @type {number | null} */
  let best = null;
  for (const [i, v] of values.entries())
    if (
      v.gold != null &&
      (best == null ||
        v.gold + (v.team ?? 0) >
          /** @type {number} */ (values[best].gold) + (values[best].team ?? 0))
    )
      best = i;
  return {
    values: values.map((v, i) => ({
      ...v,
      perDay:
        H > 0 &&
        v.gold != null &&
        cards[i].kind !== "secondWind" &&
        !(cards[i].kind === "drill" && cards[i].stat === "luck")
          ? v.gold / H
          : null,
    })),
    best,
    horizon: H,
    paidProduction,
  };
}
