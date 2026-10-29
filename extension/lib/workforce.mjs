// @ts-check
// Display-only priorities. API totals remain authoritative; all output is
// conditional advice, never a command to train, dismiss or move a worker.
import {
  bestOfHand,
  trainingPool,
  trainingOdds,
  trainingValues,
  ENERGY_GOLD,
  RETIRE_AGE,
  HORIZON_DAYS,
  HOURS_PER_POINT,
  SPEC_PER_DAY,
  productKind,
  valuePerPoint,
} from "./hiring.mjs";
import { rosterOf, teamEffect } from "./team.mjs";

/**
 * @typedef {import("./team.mjs").ApiEmployee & {
 *   potential?: number, potentialMax?: number, trainingsToday?: number,
 *   trainingsPerDay?: number, estimate?: { production?: number, wage?: number },
 *   specializations?: Record<string, number>, lastSpecializedDay?: string
 * }} Employee
 * @typedef {Record<string, { product?: string | null }>} Companies
 * @typedef {{ now: number, pointValue: number | null, leadership?: number,
 *   companies?: Companies, bidOf?: (code: string) => number | null | undefined }} Context
 * @typedef {{ employee: Employee, code: string, note: string,
 *   goldDay: number | null, assumed: string[] }} Flag
 */

/** @param {unknown} n @returns {n is number} */
const finite = (n) => typeof n === "number" && Number.isFinite(n);

/** A card on the page wins over a specialization; historical specializations
 * do not establish what a company makes today. Multiple keys are ambiguous.
 * @param {Employee} employee @param {Companies} companies @param {number} now */
export function companyProduct(employee, companies, now) {
  const product = employee.company
    ? companies[employee.company]?.product
    : null;
  if (productKind(product)) return product;
  const keys = Object.keys(employee.specializations ?? {});
  return employee.lastSpecializedDay ===
    new Date(now).toISOString().slice(0, 10) &&
    keys.length === 1 &&
    productKind(keys[0])
    ? keys[0]
    : null;
}

/** @param {Employee} employee @param {Context} ctx @param {Companies} [companies] */
function pointPrice(employee, ctx, companies = ctx.companies ?? {}) {
  const product = companyProduct(employee, companies, ctx.now);
  const bidValue = ctx.bidOf ? valuePerPoint(product, ctx.bidOf) : null;
  return finite(bidValue) ? bidValue : ctx.pointValue;
}

/** Finish the remaining trainings, one hand today and one on each later day.
 * Retain negative values: training consumes the player's energy even when a
 * hand is worth less. Luck drills and Wild's Luck outcome are zero inside
 * the future pool, just as trainingValues' own internal pool is priced.
 * @param {Employee[]} employees @param {Context} ctx */
export function trainOrder(employees, ctx) {
  /** @type {{ employee: Employee, hands: number, gold: number, handGold: number, horizon: number }[]} */
  const rows = [];
  if (!(ctx.pointValue != null && ctx.pointValue > 0)) return rows;
  for (const employee of employees) {
    const { age, potential, potentialMax, trainingsToday, trainingsPerDay } =
      employee;
    const P = employee.breakdown?.production?.total;
    const baseP = employee.base?.production;
    const wage = employee.wage;
    if (
      !finite(age) ||
      !finite(potential) ||
      !finite(potentialMax) ||
      !finite(trainingsToday) ||
      !finite(trainingsPerDay) ||
      trainingsToday >= trainingsPerDay ||
      potential >= potentialMax ||
      !finite(P) ||
      !finite(baseP) ||
      baseP <= 0 ||
      !finite(wage)
    )
      continue;
    const H = Math.max(0, Math.min(RETIRE_AGE - age, HORIZON_DAYS));
    if (!H) continue;
    const trainee = {
      production: P,
      responsibility: employee.breakdown?.responsibility?.total,
      luck: employee.breakdown?.luck?.total ?? 0,
      // today's hand is not drawn yet; trainingValues prices a hand already counted in the potential
      potential: potential + 1,
      potentialMax,
      age,
      wageChip: wage / (baseP * 0.25 * ctx.pointValue) - 1,
      wageDay: wage * 24,
      bonus: (employee.productionBonus?.total ?? 0) / 100,
      hiredDays:
        (employee.productionBonus?.contributions
          ?.filter((part) => part.source === "specialization")
          .reduce((sum, part) => sum + (part.percent ?? 0), 0) ?? 0) /
        (100 * SPEC_PER_DAY),
      traits: employee.traits?.flatMap((t) => (t.code ? [t.code] : [])) ?? [],
      leadership: ctx.leadership ?? 0,
    };
    const cards = trainingPool(trainee);
    const priced = trainingValues(cards, trainee, {
      pointValue: ctx.pointValue,
      valuePerPoint: pointPrice(employee, ctx),
      now: ctx.now,
    });
    if (!priced) continue;
    const luckIndex = cards.findIndex(
      (c) => c.kind === "drill" && c.stat === "luck" && c.delta === 1,
    );
    const luckOne = priced.values[luckIndex]?.gold ?? 0;
    const pool = cards.map((card, i) => ({
      ...card,
      gold:
        card.kind === "drill" && card.stat === "luck"
          ? 0
          : priced.values[i].gold == null
            ? null
            : priced.values[i].gold - (card.kind === "wild" ? luckOne / 3 : 0),
    }));
    const handGold = bestOfHand(
      pool,
      trainingOdds(trainee.luck, trainee.leadership),
    );
    const hands = Math.min(Math.floor(potentialMax - potential), Math.ceil(H));
    let gold = 0;
    for (let j = 0; j < hands; j++)
      gold += (handGold * (H - j)) / H - ENERGY_GOLD;
    rows.push({ employee, hands, gold, handGold, horizon: H });
  }
  return rows.sort((a, b) => b.gold - a.gold);
}

/** Conditional traits on each employee's real company roster. Prices for
 * moves needing a destination or different wages stay unknown in v1.
 * @param {Employee[]} employees @param {Companies} companies @param {Context} ctx */
export function placementFlags(employees, companies, ctx) {
  /** @type {Flag[]} */
  const flags = [];
  for (const employee of employees) {
    if (!employee.company || !employee._id) continue;
    const roster = rosterOf(employees, employee.company, ctx.now);
    const member = roster.find((m) => m.id === employee._id);
    if (!member) continue;
    const peers = roster.filter((m) => m !== member);
    const V = pointPrice(employee, ctx, companies);
    const productionGain = (/** @type {number} */ delta) =>
      finite(V) && member.bonus != null
        ? HOURS_PER_POINT * delta * (1 + member.bonus / 100) * V
        : null;
    for (const code of member.traits ?? []) {
      let note = "";
      let goldDay = null;
      if (
        (code === "rival" || code === "mentor") &&
        member.baseP != null &&
        peers.every((p) => p.baseP != null)
      ) {
        if (
          code === "rival" &&
          !peers.some(
            (p) =>
              /** @type {number} */ (p.baseP) >
              /** @type {number} */ (member.baseP),
          )
        ) {
          note = "Rival: no strictly stronger coworker; −1 instead of +3 P";
          goldDay = productionGain(4);
        } else if (
          code === "mentor" &&
          !peers.some(
            (p) =>
              /** @type {number} */ (p.baseP) <
              /** @type {number} */ (member.baseP),
          )
        )
          note = "Mentor: no weaker coworker";
      } else if (code === "bully" && peers.length)
        note = "Bully: costs coworkers";
      else if (code === "loner" && peers.length)
        note = "Loner: has coworkers; needs a company alone";
      else if (code === "sociable" && !peers.length)
        note = "Sociable: alone; needs coworkers";
      else if (
        (code === "envious" || code === "primaDonna") &&
        member.wageHour != null &&
        peers.every((p) => p.wageHour != null) &&
        peers.some(
          (p) =>
            /** @type {number} */ (p.wageHour) >
            /** @type {number} */ (member.wageHour),
        )
      )
        note =
          code === "envious"
            ? "Envious: better-paid coworkers"
            : "Prima Donna: not best paid (assumed rule)";
      else if (code === "laborer" || code === "craftsman") {
        const kind = productKind(companyProduct(employee, companies, ctx.now));
        if (
          (code === "laborer" && kind === "product") ||
          (code === "craftsman" && kind === "raw")
        ) {
          note = `${code === "laborer" ? "Laborer" : "Craftsman"}: −1 instead of +3; +4 P at a ${code === "laborer" ? "raw" : "product"} company`;
          goldDay = productionGain(4);
        }
      }
      if (!note) continue;
      const effect = teamEffect(
        roster,
        {
          kind: "card",
          id: employee._id,
          card: { kind: "rehab", trait: code },
        },
        {
          now: ctx.now,
          pointValue: ctx.pointValue ?? 0,
          valuePerPoint: V ?? undefined,
          subjectHorizon: 1,
        },
      );
      // what his coworkers lose a day: the gain they would have without him, as a cost
      if (code === "bully")
        goldDay = effect.others.every((o) => o.gold != null)
          ? -effect.others.reduce((s, o) => s + (o.gold ?? 0), 0)
          : null;
      if (
        code === "envious" &&
        member.P != null &&
        effect.self.pct != null &&
        finite(V)
      )
        goldDay = HOURS_PER_POINT * member.P * effect.self.pct * V;
      flags.push({
        employee,
        code,
        note,
        goldDay,
        assumed: [...effect.assumed, ...effect.checks],
      });
    }
  }
  return flags;
}

/** Employee's own daily margin; hourly wage is already in gold.
 * @param {Employee[]} employees @param {Context} ctx */
export function losingGold(employees, ctx) {
  const rows = [];
  for (const employee of employees) {
    const production = employee.estimate?.production;
    const wage = employee.wage;
    const V = pointPrice(employee, ctx);
    if (!finite(production) || !finite(wage) || !finite(V)) continue;
    const goldDay = production * 24 * V - wage * 24;
    if (goldDay < 0) rows.push({ employee, goldDay });
  }
  return rows.sort((a, b) => a.goldDay - b.goldDay);
}
