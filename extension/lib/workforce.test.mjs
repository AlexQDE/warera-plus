import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { trainOrder, placementFlags, losingGold } from "./workforce.mjs";
import {
  bestOfHand,
  trainingOdds,
  trainingPool,
  trainingValues,
  ENERGY_GOLD,
} from "./hiring.mjs";

const now = Date.parse("2026-10-28T12:00:00Z");
const live = JSON.parse(
  readFileSync("fixtures/employees-live-2026-10-28.json", "utf8"),
);
const ctx = { now, pointValue: 0.1, leadership: 3 };
const employee = (name, patch = {}) => ({
  ...structuredClone(live.find((e) => e.name === name)),
  ...patch,
});
const company = (id, product) => ({ [id]: { product } });

describe("workforce training priority", () => {
  it("skips trained, exhausted, retired and incomplete employees", () => {
    expect(trainOrder(live, ctx)).toEqual([]);
    const ready = employee("Rene Hermann", { trainingsToday: 0 });
    const rows = trainOrder(
      [
        ready,
        employee("Tom Murazik", { trainingsToday: 0, potential: 7 }),
        employee("Hubert Muller", { trainingsToday: 0, age: 65 }),
        employee("Alyssa Brown", { trainingsToday: undefined }),
      ],
      ctx,
    );
    expect(rows.map((r) => r.employee.name)).toEqual([ready.name]);
  });
  it("prices remaining hands with diminishing days and energy, with Luck zero inside the pool", () => {
    const e = employee("Rene Hermann", { trainingsToday: 0, potentialMax: 5 });
    const trainee = {
      production: e.breakdown.production.total,
      gender: e.gender,
      happiness: e.happinessBreakdown.value,
      incomeTax:
        -(
          e.happinessBreakdown.contributions.find(
            (part) => part.reason === "incomeTax",
          )?.delta ?? 0
        ) / 100,
      responsibility: e.breakdown.responsibility.total,
      luck: e.breakdown.luck.total,
      age: e.age,
      potential: e.potential + 1, // today's hand counted, as when it is drawn
      potentialMax: e.potentialMax,
      wageChip: e.wage / (e.base.production * 0.25 * ctx.pointValue) - 1,
      wageDay: e.wage * 24,
      bonus: e.productionBonus.total / 100,
      hiredDays: 6, // the API's current +6% specialization, at +1% a day
      traits: e.traits.map((t) => t.code),
      leadership: ctx.leadership,
    };
    const cards = trainingPool(trainee);
    const priced = trainingValues(cards, trainee, ctx);
    const luckOne =
      priced.values[
        cards.findIndex(
          (c) => c.kind === "drill" && c.stat === "luck" && c.delta === 1,
        )
      ].gold;
    const pool = cards.map((c, i) => ({
      ...c,
      gold:
        c.stat === "luck"
          ? 0
          : priced.values[i].gold - (c.kind === "wild" ? luckOne / 3 : 0),
    }));
    const hand = bestOfHand(pool, trainingOdds(trainee.luck, ctx.leadership));
    const H = 65 - e.age;
    const result = trainOrder([e], ctx)[0];
    expect(result.hands).toBe(2);
    expect(result.gold).toBeCloseTo(
      hand + (hand * (H - 1)) / H - 2 * ENERGY_GOLD,
      6,
    );
  });
  it("orders by finishing value, limits hands by retirement, and does not hide losses", () => {
    const rows = trainOrder(
      live.map((e) => ({ ...e, trainingsToday: 0 })),
      ctx,
    );
    expect(rows.length).toBeGreaterThan(5);
    expect(rows.every((r, i) => i === 0 || rows[i - 1].gold >= r.gold)).toBe(
      true,
    );
    expect(
      trainOrder(
        [employee("Tom Murazik", { trainingsToday: 0, age: 64 })],
        ctx,
      )[0].hands,
    ).toBe(1);
  });
});

describe("workforce placement", () => {
  it("uses the real company roster and strictly stronger base Production for Rival", () => {
    expect(
      placementFlags(live, {}, ctx).some(
        (r) => r.employee.name === "Alyssa Brown",
      ),
    ).toBe(false);
    const rows = placementFlags(
      live.filter((e) => e.name !== "Hubert Muller"),
      {},
      ctx,
    );
    const flag = rows.find((r) => r.employee.name === "Alyssa Brown");
    expect(flag.code).toBe("rival");
    expect(flag.goldDay).toBeGreaterThan(0);
    const alyssa = employee("Alyssa Brown");
    const equal = employee("Hubert Muller", { base: { production: 3 } });
    expect(
      placementFlags([alyssa, equal], {}, ctx).some((r) => r.code === "rival"),
    ).toBe(true);
  });
  it("prices a Bully's cost to actual coworkers, with full happiness losses", () => {
    const bully = employee("Walter Fritsch");
    const peer = employee("Lionel Leannon", { company: bully.company });
    const flag = placementFlags([bully, peer], {}, ctx).find(
      (r) => r.code === "bully",
    );
    // a cost: Lionel loses 10 points of bonus (Bully -10) on his 3 Production
    expect(flag.goldDay).toBeCloseTo(-6 * 3 * 0.1 * 0.1);
    expect(flag.note).toContain("costs coworkers");
  });
  it("flags product mismatches with +4 P priced at company bids", () => {
    const laborer = employee("Johnny McClure");
    const craftsman = employee("Dwight Harris");
    const companies = {
      ...company(laborer.company, "lightAmmo"),
      ...company(craftsman.company, "iron"),
    };
    const flags = placementFlags([laborer, craftsman], companies, {
      ...ctx,
      bidOf: (code) => ({ lightAmmo: 0.2, lead: 0.05, iron: 0.3 })[code],
    });
    expect(flags.map((r) => r.code).sort()).toEqual(["craftsman", "laborer"]);
    expect(flags.find((r) => r.code === "laborer").goldDay).toBeCloseTo(
      4 * 6 * 0.15 * (1 + laborer.productionBonus.total / 100),
    );
    expect(flags.every((r) => r.goldDay > 0 && r.note.includes("+4 P"))).toBe(
      true,
    );
  });
  it("uses only today's unambiguous specialization as a fallback; unknown products skip the rule", () => {
    const e = employee("Johnny McClure", {
      specializations: { lightAmmo: 2 },
      lastSpecializedDay: "2026-10-28",
    });
    expect(placementFlags([e], {}, ctx).some((r) => r.code === "laborer")).toBe(
      true,
    );
    expect(
      placementFlags([{ ...e, lastSpecializedDay: "2026-10-27" }], {}, ctx),
    ).toEqual([]);
    expect(
      placementFlags(
        [{ ...e, specializations: { lightAmmo: 2, iron: 2 } }],
        {},
        ctx,
      ),
    ).toEqual([]);
  });
  it("detects Mentor, Loner, Sociable, Envious and the assumed Prima Donna condition", () => {
    const make = (traits, wage = 1, P = 3) =>
      employee("Tom Murazik", {
        traits: traits.map((code) => ({ code })),
        wage,
        base: { production: P },
      });
    const peer = employee("Hubert Muller", { wage: 2 });
    expect(
      placementFlags([make(["mentor"], 1, 1), peer], {}, ctx).map(
        (r) => r.code,
      ),
    ).toContain("mentor");
    expect(
      placementFlags([make(["loner", "envious", "primaDonna"]), peer], {}, ctx)
        .map((r) => r.code)
        .sort(),
    ).toEqual(["envious", "loner", "primaDonna"]);
    expect(
      placementFlags([make(["sociable"])], {}, ctx).map((r) => r.code),
    ).toEqual(["sociable"]);
    expect(placementFlags([make(["primaDonna"], 2), peer], {}, ctx)).toEqual(
      [],
    );
  });
});

it("lists a negative employee day using hourly output and wage, priced at bids with point-value fallback", () => {
  const tom = employee("Tom Murazik");
  const rows = losingGold([tom], { ...ctx, pointValue: 0.08 });
  expect(rows[0].employee.name).toBe("Tom Murazik");
  expect(rows[0].goldDay).toBeCloseTo(
    tom.estimate.production * 24 * 0.08 - tom.wage * 24,
  );
  expect(
    losingGold([tom], {
      ...ctx,
      companies: company(tom.company, "lightAmmo"),
      bidOf: (c) => ({ lightAmmo: 0.04, lead: 0.03 })[c],
    })[0].goldDay,
  ).toBeLessThan(rows[0].goldDay);
  expect(losingGold([{ ...tom, wage: undefined }], ctx)).toEqual([]);
});
