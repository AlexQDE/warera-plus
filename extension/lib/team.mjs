// @ts-check
// What a hire or a training card changes in the real company. The server's
// totals stay authoritative: only team effects that switch are added or
// removed. Pure model, no page or API access. See docs/TEAM-MODEL.md.
import {
  TRAITS,
  RETIRE_AGE,
  HORIZON_DAYS,
  SPEC_PER_DAY,
  SPEC_CAP,
  HOURS_PER_POINT,
} from "./hiring.mjs";

export const SHIELD_PER_RESPONSIBILITY = 0.1;
export const HAPPINESS_NEUTRAL = 50;
export const POINTS_PER_PRODUCTION_HOUR = 0.25;
export const HOURS_PER_DAY = 24;
export const DAY_MS = 86400000;

/**
 * @typedef {{ delta?: number, deltaWhenUnmet?: number,
 *   coworkerProduction?: number, responsibility?: number,
 *   coworkerResponsibility?: number, happiness?: number,
 *   coworkerHappiness?: number, happinessWhenAlone?: number,
 *   happinessPerCoworker?: number, happinessCap?: number,
 *   percent?: number, percentPerCoworker?: number, percentCap?: number,
 *   productionPerNationality?: number, productionCap?: number,
 *   coworkerLuck?: number, coworkerTrainings?: number, slots?: number }} RuleEffect
 * @typedef {{ condition: string, effect: RuleEffect, priced: boolean }} TeamRule
 */

/** Percent fields are bonus points (25 means +25%), as in the API.
 * @type {Readonly<Record<string, TeamRule>>} */
export const TEAM_RULES = {
  bully: {
    condition: "any coworker",
    effect: { delta: 2, coworkerHappiness: -10 },
    priced: true,
  },
  comic: {
    condition: "any coworker",
    effect: { delta: -1, coworkerHappiness: 10 },
    priced: true,
  },
  foreman: {
    condition: "any coworker",
    effect: { coworkerResponsibility: 3 },
    priced: true,
  },
  luckyCharm: {
    condition: "any coworker",
    effect: { coworkerLuck: 3 },
    priced: false,
  },
  jinx: {
    condition: "any coworker",
    effect: { coworkerLuck: -2 },
    priced: false,
  },
  trainer: {
    condition: "any coworker",
    effect: { coworkerTrainings: 1 },
    priced: false,
  },
  rival: {
    condition: "a stronger coworker",
    effect: { delta: 3, deltaWhenUnmet: -1 },
    priced: true,
  },
  mentor: {
    condition: "a weaker coworker",
    effect: { delta: -1, coworkerProduction: 2 },
    priced: true,
  },
  loner: {
    condition: "sole employee",
    effect: { percent: 100, happiness: 5 },
    priced: true,
  },
  sociable: {
    condition: "per coworker",
    effect: { percentPerCoworker: 25, percentCap: 50, happinessWhenAlone: -10 },
    priced: true,
  },
  primaDonna: {
    condition: "best paid",
    effect: { percent: 20, happiness: -10 },
    priced: true,
  },
  envious: {
    condition: "per better-paid coworker",
    effect: { happinessPerCoworker: -5, happinessCap: -10 },
    priced: true,
  },
  nationalist: {
    condition: "coworkers share his nationality",
    effect: { responsibility: 2, happiness: 5 },
    priced: true,
  },
  xenophobe: {
    condition: "a coworker of another nationality",
    effect: { delta: -2, happiness: -5 },
    priced: true,
  },
  cosmopolitan: {
    condition: "per nationality",
    effect: { productionPerNationality: 2, productionCap: 4 },
    priced: true,
  },
  girlPower: {
    condition: "per female coworker",
    effect: { percentPerCoworker: 15, percentCap: 30 },
    priced: true,
  },
  bandOfBrothers: {
    condition: "per male coworker",
    effect: { percentPerCoworker: 15, percentCap: 30 },
    priced: true,
  },
  manHater: {
    condition: "per male coworker",
    effect: { percentPerCoworker: -15, percentCap: -30 },
    priced: true,
  },
  misogynist: {
    condition: "per female coworker",
    effect: { percentPerCoworker: -15, percentCap: -30 },
    priced: true,
  },
  oldFriends: {
    condition: "a named partner present",
    effect: { percent: 15 },
    priced: false,
  },
  nemesis: {
    condition: "a named partner present",
    effect: { percent: -15 },
    priced: false,
  },
  sweethearts: {
    condition: "a named partner present",
    effect: { percent: 20 },
    priced: false,
  },
  recruiter: { condition: "always", effect: { slots: 1 }, priced: false },
};

/**
 * @typedef {{ delta: number | null, until: number | null }} HappinessItem
 * @typedef {{ code?: string, delta?: number, percent?: boolean }} Contribution
 * @typedef {{ total?: number, contributions?: Contribution[] }} StatBreakdown
 * @typedef {{ _id?: string, name?: string, company?: string, gender?: string | null,
 *   age?: number, nationality?: string | null,
 *   base?: { production?: number }, traits?: { code?: string, revealed?: boolean }[],
 *   wage?: number, wageExpectation?: number,
 *   breakdown?: { production?: StatBreakdown, responsibility?: StatBreakdown, luck?: StatBreakdown },
 *   happinessBreakdown?: { contributions?: { delta?: number, until?: string | number | null }[],
 *     shield?: number, value?: number },
 *   productionBonus?: { total?: number, contributions?: { source?: string, percent?: number }[] }
 * }} ApiEmployee
 * @typedef {{ id: string | null, name: string | null, company: string | null,
 *   gender: "male" | "female" | null, age: number | null, nationality: string | null,
 *   baseP: number | null, P: number | null, R: number | null, L: number | null,
 *   traits: string[] | null, wageHour: number | null, bonus: number | null,
 *   spec: number | null, items: HappinessItem[] | null, shield: number | null,
 *   happiness: number | null, horizon: number | null,
 *   productionContributions: Record<string, number> | null,
 *   observedAt?: number, wageExpectation?: number | null }} Member
 * @typedef {{ name?: string, gender: "male" | "female" | null,
 *   nationality: string | null, age: number, baseP: number, R: number,
 *   traits: string[], wageHour: number }} Candidate
 * @typedef {{ kind: "drill", stat: "production" | "responsibility" | "luck", delta: number }
 *   | { kind: "habit", traitTo: string[], trait?: string }
 *   | { kind: "rehab", trait: string } | { kind: "cleanSlate", traits: string[] }
 *   | { kind: "wild", trait: string, stat: "production" | "responsibility" | "luck", delta: number }
 *   | { kind: "negotiation", delta: number }} TeamCard
 * @typedef {{ kind: "hire", candidate: Candidate }
 *   | { kind: "card", id: string, card: TeamCard }} TeamChange
 * @typedef {{ now: number, pointValue: number, valuePerPoint?: number,
 *   subjectHorizon: number }} TeamContext
 * @typedef {{ P: number | null, happiness: number | null, bonus: number | null }} OutputState
 * @typedef {{ id: string | null, name: string | null, gold: number | null,
 *   days: number | null, before: OutputState, after: OutputState, why: string[] }} CoworkerChange
 * @typedef {{ self: { prod: number, pct: number | null, pctDays: (number | null)[], why: string[] },
 *   others: CoworkerChange[], team: number, assumed: string[], checks: string[] }} TeamResult
 */

/** @param {unknown} value @returns {number | null} */
const numberOf = (value) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
/** @param {unknown} value @returns {string | null} */
const textOf = (value) =>
  typeof value === "string" && value.length ? value : null;
/** @param {number | null} value @param {number} delta */
const plus = (value, delta) => (value == null ? null : value + delta);
/** @param {number | null} age */
const horizonOf = (age) =>
  age == null ? null : Math.max(0, Math.min(RETIRE_AGE - age, HORIZON_DAYS));
/** @param {unknown} value */
function untilOf(value) {
  return typeof value === "string"
    ? numberOf(Date.parse(value))
    : numberOf(value);
}

/** Read the API's base as-is: trained points are already inside it.
 * @param {ApiEmployee} employee @param {number} now @returns {Member} */
export function memberOf(employee, now) {
  const R = numberOf(employee.breakdown?.responsibility?.total);
  const contributions = employee.breakdown?.production?.contributions;
  /** @type {Record<string, number> | null} */
  const productionContributions = contributions ? {} : null;
  for (const part of contributions ?? []) {
    const delta = numberOf(part.delta);
    if (productionContributions && part.code && !part.percent && delta != null)
      productionContributions[part.code] =
        (productionContributions[part.code] ?? 0) + delta;
  }
  const specialization = employee.productionBonus?.contributions?.filter(
    (part) => part.source === "specialization",
  );
  const age = numberOf(employee.age);
  return {
    id: textOf(employee._id),
    name: textOf(employee.name),
    company: textOf(employee.company),
    gender:
      employee.gender === "male" || employee.gender === "female"
        ? employee.gender
        : null,
    age,
    nationality: textOf(employee.nationality),
    baseP: numberOf(employee.base?.production),
    P: numberOf(employee.breakdown?.production?.total),
    R,
    L: numberOf(employee.breakdown?.luck?.total),
    traits:
      employee.traits?.flatMap((trait) => (trait.code ? [trait.code] : [])) ??
      null,
    wageHour: numberOf(employee.wage),
    wageExpectation: numberOf(employee.wageExpectation),
    bonus: numberOf(employee.productionBonus?.total),
    // a bonus read without a specialization part is none yet (a hire's first day), not an unknown
    spec: specialization?.length
      ? numberOf(
          specialization.reduce((sum, part) => sum + (part.percent ?? NaN), 0),
        )
      : Array.isArray(employee.productionBonus?.contributions)
        ? 0
        : null,
    items:
      employee.happinessBreakdown?.contributions?.map((item) => ({
        delta: numberOf(item.delta),
        until: untilOf(item.until),
      })) ?? null,
    shield:
      numberOf(employee.happinessBreakdown?.shield) ??
      (R == null ? null : Math.min(1, R * SHIELD_PER_RESPONSIBILITY)),
    happiness: numberOf(employee.happinessBreakdown?.value),
    horizon: horizonOf(age),
    productionContributions,
    observedAt: now,
  };
}

/** @param {ApiEmployee[]} employees @param {string} companyId @param {number} now */
export function rosterOf(employees, companyId, now) {
  return employees
    .filter((employee) => employee.company === companyId)
    .map((employee) => memberOf(employee, now));
}

/** Exact name first; age is a tie-breaker, never a fuzzy match.
 * @template {{ name?: string | null, age?: number | null }} T
 * @param {T[]} employees @param {string} name @param {number | null} [age]
 * @returns {T | null} */
export function findTrainee(employees, name, age) {
  const matches = employees.filter((employee) => employee.name === name);
  if (matches.length === 1) return matches[0];
  const byAge =
    age == null ? [] : matches.filter((employee) => employee.age === age);
  return byAge.length === 1 ? byAge[0] : null;
}

/**
 * One code's raw effects on one member, including incoming coworker effects.
 * Percent is in bonus points here; only the public self.pct is a share.
 * @typedef {{ prod: number, R: number, pct: number, happiness: number,
 *   luck: number, trainings: number, note: string }} RuleState
 * @typedef {Record<string, RuleState>} Effects
 * @typedef {{ prod: number, R: number, pct: number, positive: number,
 *   negative: number, why: string[] }} Delta
 */
/** @returns {RuleState} */
const emptyRule = () => ({
  prod: 0,
  R: 0,
  pct: 0,
  happiness: 0,
  luck: 0,
  trainings: 0,
  note: "",
});
/** @param {Effects[]} effects @param {number} index @param {string} code */
function ruleAt(effects, index, code) {
  return (effects[index][code] ??= emptyRule());
}
/** @param {string} code */
const titleOf = (code) => TRAITS[code]?.title ?? code;

// An unknown added coworker must not turn off a known existing effect.
// Skip that owner's rule in both states rather than diffing known vs zero.
/** @param {Member[]} before @param {Member[]} after @param {Set<string>} assumed */
function skippedRules(before, after, assumed) {
  return after.map((owner, index) => {
    const peers = [
      ...before.filter((_, i) => i !== index),
      ...after.filter((_, i) => i !== index),
    ];
    const skipped = new Set();
    const traits = new Set([
      ...(before[index]?.traits ?? []),
      ...(owner.traits ?? []),
    ]);
    for (const code of traits) {
      let missing = "";
      if (
        ["girlPower", "bandOfBrothers", "manHater", "misogynist"].includes(
          code,
        ) &&
        peers.some((peer) => peer.gender == null)
      )
        missing = "coworker gender";
      if (
        ["nationalist", "xenophobe", "cosmopolitan"].includes(code) &&
        (owner.nationality == null ||
          before[index]?.nationality === null ||
          peers.some((peer) => peer.nationality == null))
      )
        missing = "nationality";
      if (
        ["rival", "mentor"].includes(code) &&
        (owner.baseP == null || peers.some((peer) => peer.baseP == null))
      )
        missing = "base Production";
      if (
        ["primaDonna", "envious"].includes(code) &&
        (owner.wageHour == null || peers.some((peer) => peer.wageHour == null))
      )
        missing = "hourly wage";
      if (missing) {
        skipped.add(code);
        assumed.add(`${titleOf(code)}: unknown ${missing}; rule skipped`);
      }
    }
    return skipped;
  });
}

/** @param {Member[]} roster @param {Set<string>[]} skipped
 * @param {Set<string>} assumed @returns {Effects[]} */
function evaluate(roster, skipped, assumed) {
  /** @type {Effects[]} */
  const effects = roster.map(() => ({}));
  roster.forEach((owner, index) => {
    const peers = roster
      .map((member, i) => ({ member, i }))
      .filter((peer) => peer.i !== index);
    for (const code of new Set(owner.traits ?? [])) {
      const rule = TEAM_RULES[code];
      if (!rule || skipped[index].has(code)) continue;
      const e = rule.effect;
      const self = ruleAt(effects, index, code);
      if (
        ["bully", "comic", "foreman", "luckyCharm", "jinx", "trainer"].includes(
          code,
        )
      ) {
        if (peers.length) self.prod += e.delta ?? 0;
        for (const { i } of peers) {
          const other = ruleAt(effects, i, code);
          other.happiness += e.coworkerHappiness ?? 0;
          other.R += e.coworkerResponsibility ?? 0;
          other.luck += e.coworkerLuck ?? 0;
          other.trainings += e.coworkerTrainings ?? 0;
        }
      } else if (code === "rival") {
        assumed.add("Rival: compares base Production, strictly greater");
        self.prod += peers.some(
          ({ member }) =>
            /** @type {number} */ (member.baseP) >
            /** @type {number} */ (owner.baseP),
        )
          ? (e.delta ?? 0)
          : (e.deltaWhenUnmet ?? 0);
      } else if (code === "mentor") {
        assumed.add("Mentor: compares base Production, strictly less");
        const weaker = peers.filter(
          ({ member }) =>
            /** @type {number} */ (member.baseP) <
            /** @type {number} */ (owner.baseP),
        );
        if (weaker.length) self.prod += e.delta ?? 0;
        for (const { i } of weaker)
          ruleAt(effects, i, code).prod += e.coworkerProduction ?? 0;
      } else if (code === "loner") {
        if (!peers.length) {
          self.pct += e.percent ?? 0;
          self.happiness += e.happiness ?? 0;
        }
      } else if (code === "sociable") {
        self.pct += Math.min(
          peers.length * (e.percentPerCoworker ?? 0),
          e.percentCap ?? 0,
        );
        if (!peers.length) self.happiness += e.happinessWhenAlone ?? 0;
      } else if (code === "primaDonna") {
        assumed.add(
          "Prima Donna: +20% and happiness −10 together while hourly wage is highest (ties included)",
        );
        if (
          peers.every(
            ({ member }) =>
              /** @type {number} */ (owner.wageHour) >=
              /** @type {number} */ (member.wageHour),
          )
        ) {
          self.pct += e.percent ?? 0;
          self.happiness += e.happiness ?? 0;
        }
      } else if (code === "envious") {
        const count = peers.filter(
          ({ member }) =>
            /** @type {number} */ (member.wageHour) >
            /** @type {number} */ (owner.wageHour),
        ).length;
        self.happiness += Math.max(
          count * (e.happinessPerCoworker ?? 0),
          e.happinessCap ?? 0,
        );
      } else if (code === "nationalist") {
        assumed.add("Nationalist: every coworker shares his nationality");
        if (
          peers.length &&
          peers.every(({ member }) => member.nationality === owner.nationality)
        ) {
          self.R += e.responsibility ?? 0;
          self.happiness += e.happiness ?? 0;
        }
      } else if (code === "xenophobe") {
        if (
          peers.some(({ member }) => member.nationality !== owner.nationality)
        ) {
          self.prod += e.delta ?? 0;
          self.happiness += e.happiness ?? 0;
        }
      } else if (code === "cosmopolitan") {
        const nationalities = new Set(
          peers
            .map(({ member }) => member.nationality)
            .filter((nationality) => nationality !== owner.nationality),
        );
        self.prod += Math.min(
          nationalities.size * (e.productionPerNationality ?? 0),
          e.productionCap ?? 0,
        );
      } else if (
        ["girlPower", "bandOfBrothers", "manHater", "misogynist"].includes(code)
      ) {
        const gender =
          code === "girlPower" || code === "misogynist" ? "female" : "male";
        const count = peers.filter(
          ({ member }) => member.gender === gender,
        ).length;
        const amount = count * (e.percentPerCoworker ?? 0);
        self.pct +=
          amount < 0
            ? Math.max(amount, e.percentCap ?? 0)
            : Math.min(amount, Math.abs(e.percentCap ?? 0));
      } else if (["oldFriends", "nemesis", "sweethearts"].includes(code)) {
        self.note = `${titleOf(code)}: named partner unreadable, not priced`;
      }
    }
  });
  return effects;
}

/** @param {number} value @param {number} [digits] */
function signed(value, digits) {
  return `${value < 0 ? "−" : "+"}${digits == null ? Math.abs(value) : Math.abs(value).toFixed(digits)}`;
}

/** Keep negative items negative when removing them: a positive compensation
 * item would evade the shield and overstate Rehab's happiness gain.
 * @param {Effects} before @param {Effects} after @returns {Delta} */
function difference(before, after) {
  const delta = {
    prod: 0,
    R: 0,
    pct: 0,
    positive: 0,
    negative: 0,
    why: /** @type {string[]} */ ([]),
  };
  for (const code of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const a = before[code] ?? emptyRule();
    const b = after[code] ?? emptyRule();
    delta.prod += b.prod - a.prod;
    delta.R += b.R - a.R;
    delta.pct += b.pct - a.pct;
    delta.positive += Math.max(0, b.happiness) - Math.max(0, a.happiness);
    delta.negative += Math.min(0, b.happiness) - Math.min(0, a.happiness);
    const title = titleOf(code);
    if (b.prod !== a.prod)
      delta.why.push(`${title}: Production ${signed(b.prod - a.prod)}`);
    if (b.R !== a.R)
      delta.why.push(`${title}: Responsibility ${signed(b.R - a.R)}`);
    if (b.pct !== a.pct)
      delta.why.push(`${title}: output ${signed(b.pct - a.pct)}%`);
    if (b.happiness !== a.happiness)
      delta.why.push(`${title} ${signed(b.happiness - a.happiness)}`);
    if (b.luck !== a.luck)
      delta.why.push(`${title}: Luck ${signed(b.luck - a.luck)}, not priced`);
    if (b.trainings !== a.trainings)
      delta.why.push(
        `${title}: trainings a day ${signed(b.trainings - a.trainings)}, not priced`,
      );
    if (b.note || a.note) delta.why.push(b.note || a.note);
  }
  return delta;
}

/** @param {Member} member @param {number} at @param {number} shield */
function itemHappiness(member, at, shield) {
  if (member.items == null || member.items.some((item) => item.delta == null))
    return null;
  return (
    HAPPINESS_NEUTRAL +
    member.items.reduce((sum, item) => {
      if (item.until != null && item.until <= at) return sum;
      const delta = /** @type {number} */ (item.delta);
      return sum + delta * (delta < 0 ? 1 - shield : 1);
    }, 0)
  );
}

/** @param {Member} member @param {Delta} delta @param {number} at
 * @param {number} day @returns {{ before: OutputState, after: OutputState, shield: number | null }} */
function statesAt(member, delta, at, day) {
  const shield = delta.R
    ? member.R == null
      ? null
      : Math.min(1, SHIELD_PER_RESPONSIBILITY * (member.R + delta.R))
    : member.shield;
  const rawBefore =
    member.shield == null ? null : itemHappiness(member, at, member.shield);
  const rawObserved =
    member.shield == null
      ? null
      : itemHappiness(
          member,
          member.observedAt ?? at - day * DAY_MS,
          member.shield,
        );
  const happiness =
    member.happiness == null
      ? null
      : member.happiness +
        (rawBefore != null && rawObserved != null
          ? rawBefore - rawObserved
          : 0);
  const hasHappinessChange =
    delta.R !== 0 || delta.positive !== 0 || delta.negative !== 0;
  const rawAfter = shield == null ? null : itemHappiness(member, at, shield);
  const afterHappiness = !hasHappinessChange
    ? happiness
    : rawAfter == null || shield == null
      ? null
      : rawAfter + delta.positive + delta.negative * (1 - shield);
  // Missing specialization does not hide a known day-zero bonus; later
  // days cannot price flat Production accurately without its current part.
  const growth =
    day === 0
      ? 0
      : member.spec == null
        ? null
        : Math.min(SPEC_CAP * 100, member.spec + day * SPEC_PER_DAY * 100) -
          member.spec;
  const bonus =
    member.bonus == null ||
    happiness == null ||
    member.happiness == null ||
    growth == null
      ? null
      : member.bonus + happiness - member.happiness + growth;
  const afterBonus =
    bonus == null || happiness == null || afterHappiness == null
      ? null
      : bonus + afterHappiness - happiness + delta.pct;
  return {
    before: { P: member.P, happiness, bonus },
    after: {
      P: plus(member.P, delta.prod),
      happiness: afterHappiness,
      bonus: afterBonus,
    },
    shield,
  };
}

/** @param {Member} member @param {Delta} delta @param {number} shield @param {number} now */
function ownHappiness(member, delta, shield, now) {
  // A new hire's own tax and recentlyMoved are deliberately outside v1.
  let shieldChange = 0;
  if (delta.R) {
    const before =
      member.shield == null ? null : itemHappiness(member, now, member.shield);
    const after = itemHappiness(member, now, shield);
    if (before == null || after == null) return null;
    shieldChange = after - before;
  }
  return delta.positive + delta.negative * (1 - shield) + shieldChange;
}

/** @param {Member} member @param {TeamCard} card @param {TeamContext} ctx @returns {Member} */
function applyCard(member, card, ctx) {
  const after = {
    ...member,
    traits: member.traits == null ? null : [...member.traits],
  };
  if (card.kind === "wild" && after.traits != null)
    after.traits = [...new Set([...after.traits, card.trait])];
  if (card.kind === "drill" || card.kind === "wild") {
    if (card.stat === "production") {
      after.baseP = plus(member.baseP, card.delta);
      // Wage is on paid base Production; the direct drill is priced by the
      // caller, but its wage can switch Envious or Prima Donna conditions.
      if (member.baseP && member.wageHour != null)
        after.wageHour =
          (member.wageHour * (member.baseP + card.delta)) / member.baseP;
    } else if (card.stat === "responsibility")
      after.R = plus(member.R, card.delta);
    else after.L = plus(member.L, card.delta);
  } else if (card.kind === "negotiation") {
    const baseWage =
      member.wageExpectation && member.wageHour != null
        ? member.wageHour / member.wageExpectation
        : member.baseP == null
          ? null
          : member.baseP * POINTS_PER_PRODUCTION_HOUR * ctx.pointValue;
    after.wageHour =
      member.wageHour == null || baseWage == null
        ? null
        : member.wageHour - (baseWage * card.delta) / 100;
  } else if (after.traits != null) {
    const removed =
      card.kind === "cleanSlate" ? card.traits : card.trait ? [card.trait] : [];
    after.traits = after.traits.filter((trait) => !removed.includes(trait));
    if (card.kind === "habit")
      after.traits = [...new Set([...after.traits, ...card.traitTo])];
  }
  if (member.traits != null && after.traits != null && after.wageHour != null) {
    // Trait markups add to wage expectation. Apply their ratio after any
    // Production drill so Wild card's stat and trait both affect the wage.
    const markup = (/** @type {string[]} */ traits) =>
      1 +
      traits.reduce((sum, code) => sum + ((TRAITS[code]?.wage ?? 1) - 1), 0);
    const beforeMarkup = markup(member.traits);
    const afterMarkup = markup(after.traits);
    if (beforeMarkup !== afterMarkup)
      after.wageHour = (after.wageHour * afterMarkup) / beforeMarkup;
  }
  return after;
}

/** @param {Member[]} roster @param {TeamChange} change @param {TeamContext} ctx
 * @returns {TeamResult} */
export function teamEffect(roster, change, ctx) {
  /** @type {TeamResult} */
  const result = {
    self: { prod: 0, pct: 0, pctDays: [], why: [] },
    others: [],
    team: 0,
    assumed: [],
    checks: [],
  };
  const assumed = new Set();
  const subject =
    change.kind === "hire"
      ? roster.length
      : roster.findIndex((member) => member.id === change.id);
  if (subject < 0) {
    result.assumed.push("trainee not among your employees");
    return result;
  }
  const afterRoster = [...roster];
  if (change.kind === "hire") {
    const c = change.candidate;
    afterRoster.push({
      id: null,
      name: c.name ?? null,
      company: roster[0]?.company ?? null,
      gender: c.gender,
      nationality: c.nationality,
      age: c.age,
      baseP: c.baseP,
      P: c.baseP,
      R: c.R,
      L: null,
      traits: [...c.traits],
      wageHour: c.wageHour,
      bonus: 0,
      spec: 0,
      items: [],
      shield: Math.min(1, c.R * SHIELD_PER_RESPONSIBILITY),
      happiness: HAPPINESS_NEUTRAL,
      horizon: horizonOf(c.age),
      productionContributions: null,
      observedAt: ctx.now,
    });
  } else afterRoster[subject] = applyCard(roster[subject], change.card, ctx);
  const skipped = skippedRules(roster, afterRoster, assumed);
  const before = evaluate(roster, skipped, assumed);
  const after = evaluate(afterRoster, skipped, assumed);
  roster.forEach((member, index) => {
    for (const [code, actual] of Object.entries(
      member.productionContributions ?? {},
    )) {
      if (
        !TEAM_RULES[code]?.priced ||
        skipped[index].has(code) ||
        !before[index][code]
      )
        continue;
      const expected = before[index][code]?.prod ?? 0;
      if (Math.abs(expected - actual) > 1e-9)
        result.checks.push(
          `${member.name ?? member.id ?? "Employee"}: ${titleOf(code)} expected ${signed(expected)}, server ${signed(actual)}`,
        );
    }
  });
  afterRoster.forEach((member, index) => {
    const delta = difference(before[index] ?? {}, after[index]);
    if (index === subject) {
      // Only conditional team changes belong here; direct card effects are
      // already valued in hiring.mjs (including a Responsibility drill).
      let original = roster[index] ?? member;
      // A Wild card can raise Responsibility and add a happiness trait in
      // the same case. Its direct shield gain is priced by the caller;
      // mitigate only the new team items at the card's resulting shield.
      if (change.kind === "card" && original.R !== member.R)
        original = {
          ...original,
          R: member.R,
          shield:
            member.R == null
              ? null
              : Math.min(1, member.R * SHIELD_PER_RESPONSIBILITY),
        };
      const shield = delta.R
        ? original.R == null
          ? null
          : Math.min(1, SHIELD_PER_RESPONSIBILITY * (original.R + delta.R))
        : original.shield;
      const pctAt = (/** @type {number} */ day) => {
        if (delta.positive === 0 && delta.negative === 0 && delta.R === 0)
          return delta.pct / 100;
        const happinessChange =
          shield == null
            ? null
            : ownHappiness(original, delta, shield, ctx.now + day * DAY_MS);
        return happinessChange == null
          ? null
          : (delta.pct + happinessChange) / 100;
      };
      result.self.prod = delta.prod;
      result.self.pct = pctAt(0);
      for (let day = 0; day < ctx.subjectHorizon; day++)
        result.self.pctDays.push(pctAt(day));
      result.self.why = delta.why;
      return;
    }
    if (!delta.why.length) return;
    const days =
      member.horizon == null
        ? null
        : Math.max(0, Math.min(member.horizon, ctx.subjectHorizon));
    const state = statesAt(member, delta, ctx.now, 0);
    const why = [...delta.why];
    if (
      state.before.happiness != null &&
      state.after.happiness != null &&
      state.before.happiness !== state.after.happiness
    ) {
      const sources = delta.why.filter((line) => !line.includes(":"));
      why.push(
        `happiness ${signed(state.after.happiness - state.before.happiness, 1)} (${[...sources, `shield ${state.shield}`].join(", ")})`,
      );
    }
    if (delta.R) why.push(`shield ${state.shield}`);
    let gold = days == null ? null : 0;
    const priced =
      delta.prod || delta.R || delta.pct || delta.positive || delta.negative;
    const V = numberOf(ctx.valuePerPoint ?? ctx.pointValue);
    if (priced && gold != null && days != null) {
      for (let day = 0; day < days; day++) {
        const { before: a, after: b } = statesAt(
          member,
          delta,
          ctx.now + day * DAY_MS,
          day,
        );
        if (
          a.P == null ||
          b.P == null ||
          a.bonus == null ||
          b.bonus == null ||
          V == null
        ) {
          gold = null;
          break;
        }
        gold +=
          HOURS_PER_POINT *
          (b.P * (1 + b.bonus / 100) - a.P * (1 + a.bonus / 100)) *
          V *
          Math.min(1, days - day);
      }
    }
    if (gold == null)
      assumed.add(
        `${member.name ?? member.id ?? "Employee"}: missing output or horizon; team value not priced`,
      );
    result.others.push({
      id: member.id,
      name: member.name,
      gold,
      days,
      before: state.before,
      after: state.after,
      why,
    });
    result.team += gold ?? 0;
  });
  result.assumed = [...assumed];
  return result;
}

/** Average complete scenarios, including nonlinear conditions, before display.
 * An unaffected coworker contributes zero, rather than disappearing from the denominator.
 * @param {{ result: TeamResult, prob: number }[]} cases @returns {TeamResult} */
export function averageTeamEffects(cases) {
  const result = /** @type {TeamResult} */ ({
    self: {
      prod: 0,
      pct: 0,
      pctDays: Array.from(
        {
          length: Math.max(
            0,
            ...cases.map(({ result }) => result.self.pctDays.length),
          ),
        },
        () => 0,
      ),
      why: [],
    },
    others: [],
    team: 0,
    assumed: [],
    checks: [],
  });
  const selfWhy = new Map();
  const others = new Map();
  for (const { result: r, prob } of cases) {
    result.self.prod += r.self.prod * prob;
    result.self.pct =
      result.self.pct == null || r.self.pct == null
        ? null
        : result.self.pct + r.self.pct * prob;
    result.self.pctDays = result.self.pctDays.map((mean, day) => {
      const pct =
        day < r.self.pctDays.length ? r.self.pctDays[day] : r.self.pct;
      return mean == null || pct == null ? null : mean + pct * prob;
    });
    for (const why of r.self.why)
      selfWhy.set(why, (selfWhy.get(why) ?? 0) + prob);
    result.team += r.team * prob;
    result.assumed.push(...r.assumed);
    result.checks.push(...r.checks);
    for (const other of r.others) {
      const key = other.id ?? other.name;
      if (!others.has(key))
        others.set(key, {
          ...other,
          gold: 0,
          after: { ...other.before },
          reasons: new Map(),
        });
      const mean = others.get(key);
      mean.gold =
        mean.gold == null || other.gold == null
          ? null
          : mean.gold + other.gold * prob;
      for (const stat of /** @type {const} */ (["P", "happiness", "bonus"]))
        mean.after[stat] =
          mean.after[stat] == null ||
          other.before[stat] == null ||
          other.after[stat] == null
            ? null
            : mean.after[stat] +
              (other.after[stat] - other.before[stat]) * prob;
      for (const why of other.why)
        mean.reasons.set(why, (mean.reasons.get(why) ?? 0) + prob);
    }
  }
  /** @param {Map<string, number>} reasons */
  const lines = (reasons) =>
    [...reasons].map(([why, prob]) =>
      prob >= 1 - 1e-9 ? why : `${why} (${(prob * 100).toFixed(1)}% of cases)`,
    );
  result.self.why = lines(selfWhy);
  result.others = [...others.values()].map(({ reasons, ...other }) => ({
    ...other,
    why: lines(reasons),
  }));
  result.assumed = [...new Set(result.assumed)];
  result.checks = [...new Set(result.checks)];
  return result;
}
