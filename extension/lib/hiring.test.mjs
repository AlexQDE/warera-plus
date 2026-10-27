import { describe, it, expect } from "vitest";
import {
  TRAITS,
  traitCode,
  hiddenTraitPool,
  traitCases,
  productionOdds,
  productionShares,
  candidateValue,
  rankCandidates,
  valuePerPoint,
  productKind,
  trainingValues,
  ENERGY_GOLD,
} from "./hiring.mjs";

describe("the training cards", () => {
  // the live Train window of 2026-10-27: Sorayut Chaichana, 40, hired today,
  // Production 5, Responsibility 1, Luck 1, wage chip +13.8%, bonus +0.9%;
  // his hand: Negotiation -10%, Intensive drill Luck +2, Wild card
  const PV = 0.1012;
  const SORAYUT = {
    production: 5,
    responsibility: 1,
    wageChip: 0.138,
    traits: [],
    bonus: 0.009,
    hiredDays: 0,
    age: 40,
  };
  const HAND = [
    { kind: "negotiation", rarity: "uncommon", delta: 10 },
    { kind: "drill", rarity: "uncommon", stat: "luck", delta: 2 },
    { kind: "wild", rarity: "uncommon" },
  ];
  it("takes Negotiation for an expensive worker: 10 points off his wage for 25 days", () => {
    const r = trainingValues(HAND, SORAYUT, { pointValue: PV });
    expect(r?.horizon).toBe(25);
    expect(r?.values[0].gold).toBeCloseTo(25 * 6 * PV * 5 * 0.1, 9);
    expect(r?.values[0].note).toContain("wage chip +13.8% → +3.8%");
    expect(r?.values[1].gold).toBe(0);
    expect(/** @type {number} */ (r?.values[2].gold)).toBeLessThan(
      /** @type {number} */ (r?.values[0].gold),
    );
    expect(r?.best).toBe(0);
  });
  it("prices a Production drill against the wage it raises", () => {
    const drill = [{ kind: "drill", stat: "production", delta: 2 }];
    // asking 113.8%, his bonus only passes it after 13 days on the product
    const dear = trainingValues(drill, SORAYUT, { pointValue: PV });
    expect(/** @type {number} */ (dear?.values[0].gold)).toBeLessThan(0);
    // a cheap worker (asking 80%) gains from day one
    const cheap = trainingValues(
      drill,
      { ...SORAYUT, wageChip: -0.2 },
      { pointValue: PV },
    );
    let expected = 0;
    for (let d = 0; d < 25; d++)
      expected += 6 * 2 * (PV * (1 + 0.009 + Math.min(d, 20) / 100) - PV * 0.8);
    expect(cheap?.values[0].gold).toBeCloseTo(expected, 9);
  });
  it("stops Negotiation at 70% and counts Greedy's markup in what it saves", () => {
    const low = trainingValues(
      [{ kind: "negotiation", delta: 10 }],
      { ...SORAYUT, wageChip: -0.25 },
      { pointValue: PV },
    );
    expect(low?.values[0].gold).toBeCloseTo(25 * 6 * PV * 5 * 0.05, 9);
    // a Greedy worker's chip is 1.2 x his expectation: the card cuts the
    // expectation, the markup multiplies the saving
    const greedy = trainingValues(
      [{ kind: "negotiation", delta: 10 }],
      { ...SORAYUT, wageChip: 1.0 * 1.2 - 1, traits: ["greedy"] },
      { pointValue: PV },
    );
    expect(greedy?.values[0].gold).toBeCloseTo(25 * 6 * PV * 5 * 1.2 * 0.1, 9);
  });
  it("values traits taught and removed, and Second wind by the hand's best card", () => {
    const r = trainingValues(
      [
        { kind: "habit", traitTo: ["specialist"] },
        { kind: "rehab", trait: "greedy" },
        { kind: "secondWind", delta: 2 },
      ],
      { ...SORAYUT, wageChip: 1.0 * 1.2 - 1, traits: ["greedy"] },
      { pointValue: PV },
    );
    const [habit, rehab, wind] = /** @type {any} */ (r).values;
    expect(habit.gold).toBeGreaterThan(0);
    // losing Greedy: his wage drops by a fifth of his expectation's pay
    expect(rehab.gold).toBeCloseTo(25 * 6 * PV * 5 * 1.0 * 0.2, 9);
    expect(wind.gold).toBeCloseTo(
      2 * Math.max(0, Math.max(habit.gold, rehab.gold) - ENERGY_GOLD),
      9,
    );
    expect(trainingValues(HAND, SORAYUT, { pointValue: null })).toBeNull();
  });
  it("leaves an unread card unpriced and never the best", () => {
    const r = trainingValues(
      [{ kind: null }, { kind: "drill", stat: "luck", delta: 1 }],
      SORAYUT,
      { pointValue: PV },
    );
    expect(r?.values[0].gold).toBeNull();
    expect(r?.best).toBe(1);
  });
});

// The four candidates of one live Recruit window (2026-10-26, point value
// 0.1019; fixtures/v027-live-recruit.html). The server sent their hidden
// stats as 0 with revealed: false, so the card's wage is all there is.
const PP = 0.1019;
const SHERMAN = {
  wageDay: 1.2,
  production: null,
  traits: [],
  hiddenTraits: 0,
  age: 32,
};
const ALEXANDER = {
  wageDay: 2.82,
  production: null,
  traits: [],
  hiddenTraits: 0,
  age: 36,
};
const JOSCHA = {
  wageDay: 1.88,
  production: 3,
  traits: [],
  hiddenTraits: 0,
  age: 34,
};
const MOAZ = {
  wageDay: 1.58,
  production: null,
  traits: ["gambler"],
  hiddenTraits: 0,
  age: 23,
};

describe("trait table", () => {
  it("holds the 52 traits with the config's hire weights, 354 in all", () => {
    expect(Object.keys(TRAITS)).toHaveLength(52);
    expect(Object.values(TRAITS).reduce((s, t) => s + t.weight, 0)).toBe(354);
  });
  it("reads a badge's English label back to its code, never a '?'", () => {
    expect(traitCode("Gambler")).toBe("gambler");
    expect(traitCode(" tax-shy ")).toBe("taxShy");
    expect(traitCode("Misandrist")).toBe("manHater");
    expect(traitCode("?")).toBeNull();
    expect(traitCode("Kockar")).toBeNull();
    expect(traitCode(null)).toBeNull();
  });
  it("draws a hidden trait from the hire pool by weight", () => {
    const pool = hiddenTraitPool();
    expect(pool.reduce((s, p) => s + p.share, 0)).toBeCloseTo(1, 12);
    expect(pool.find((p) => p.code === "greedy")?.share).toBeCloseTo(
      10 / 354,
      12,
    );
    expect(pool.some((p) => p.code === "sweethearts")).toBe(false);
    expect(
      traitCases({ wageDay: 1, traits: ["loner"], hiddenTraits: 0 }),
    ).toEqual([{ codes: ["loner"], share: 1 }]);
    expect(traitCases({ wageDay: 1, hiddenTraits: 1 })).toHaveLength(
      pool.length,
    );
  });
});

describe("Production read from the wage", () => {
  it("pins a hidden Production when only one level fits 70%-130%", () => {
    const s = productionOdds(SHERMAN, PP);
    expect(productionShares(s)).toEqual({ 2: 1 });
    expect(s?.[0].expectation).toBeCloseTo(1.2 / (6 * PP * 2), 9);
    expect(productionShares(productionOdds(ALEXANDER, PP))).toEqual({ 4: 1 });
  });
  it("weighs two levels that fit by how tightly each explains the wage", () => {
    const shares = productionShares(productionOdds(MOAZ, PP));
    expect(shares[2]).toBeCloseTo(0.6, 9);
    expect(shares[3]).toBeCloseTo(0.4, 9);
  });
  it("takes a revealed Production as given and reads his expectation off it", () => {
    const odds = productionOdds(JOSCHA, PP);
    expect(productionShares(odds)).toEqual({ 3: 1 });
    expect(odds?.[0].expectation).toBeCloseTo(1.88 / (6 * PP * 3), 9);
  });
  it("lets a hidden trait be Greedy or Modest, which moves the wage", () => {
    const plain = productionShares(
      productionOdds({ wageDay: 0.6114 * 2.5, hiddenTraits: 0 }, PP),
    );
    const hidden = productionShares(
      productionOdds({ wageDay: 0.6114 * 2.5, hiddenTraits: 1 }, PP),
    );
    expect(Object.keys(plain)).toEqual(["2", "3"]);
    // a Modest worker of Production 4 asks 85% x 73.5%: the hidden trait
    // lets it in, with the 2.8% of hires that are Modest
    expect(Object.keys(hidden)).toEqual(["2", "3", "4"]);
    expect(hidden[2] + hidden[3] + hidden[4]).toBeCloseTo(1, 9);
    expect(hidden[4]).toBeLessThan(0.02);
    expect(hidden[2]).not.toBeCloseTo(plain[2], 6);
  });
  it("finds no level for a wage no Production 1-4 can ask, and nothing without a point value", () => {
    expect(
      productionOdds({ wageDay: 6 * PP * 6, hiddenTraits: 0 }, PP),
    ).toEqual([]);
    expect(productionOdds(SHERMAN, null)).toBeNull();
    expect(productionOdds({ wageDay: null }, PP)).toBeNull();
  });
});

describe("what a candidate is worth", () => {
  it("adds up the gold until he turns 65, specialization growing 1% a day to 20%", () => {
    const v = candidateValue(SHERMAN, { pointValue: PP, alone: true });
    const out = 6 * PP * 2;
    expect(v?.perDayNow).toBeCloseTo(out - 1.2, 9);
    expect(v?.perDaySettled).toBeCloseTo(out * 1.2 - 1.2, 9);
    expect(v?.daysLeft).toBe(33);
    // 33 days: sum of min(d, 20) over d = 0..32 is 450
    expect(v?.total).toBeCloseTo(out * (33 + 4.5) - 33 * 1.2, 9);
  });
  it("counts trait output on top of his own and leaves a wage trait inside the wage", () => {
    const moaz = candidateValue(MOAZ, { pointValue: PP, alone: true });
    const settled = 6 * PP * 2.4 * (1 + 0.2 - 0.15) - 1.58;
    expect(moaz?.perDaySettled).toBeCloseTo(settled, 9);
    const greedy = candidateValue(
      { ...JOSCHA, traits: ["greedy"], wageDay: 1.88 * 1.2 },
      { pointValue: PP, alone: true },
    );
    expect(greedy?.expectation?.min).toBeCloseTo(1.88 / (6 * PP * 3), 9);
  });
  it("values a Loner alone and a Sociable in a team", () => {
    const base = {
      wageDay: 6 * PP * 2,
      production: 2,
      hiddenTraits: 0,
      age: 30,
    };
    const lonerAlone = candidateValue(
      { ...base, traits: ["loner"] },
      { pointValue: PP, alone: true },
    );
    const lonerTeam = candidateValue(
      { ...base, traits: ["loner"] },
      { pointValue: PP, alone: false },
    );
    expect(/** @type {number} */ (lonerAlone?.perDayNow)).toBeGreaterThan(
      /** @type {number} */ (lonerTeam?.perDayNow),
    );
    const sociableTeam = candidateValue(
      { ...base, traits: ["sociable"] },
      { pointValue: PP, alone: false },
    );
    expect(sociableTeam?.perDayNow).toBeCloseTo(6 * PP * 2 * 0.5, 9);
  });
  it("prices output at the product's own value per point when it is known", () => {
    const atPoint = candidateValue(JOSCHA, { pointValue: PP });
    const atSteel = candidateValue(JOSCHA, {
      pointValue: PP,
      valuePerPoint: 2 * PP,
    });
    expect(
      /** @type {number} */ (atSteel?.perDayNow) -
        /** @type {number} */ (atPoint?.perDayNow),
    ).toBeCloseTo(6 * PP * 3, 9);
  });
  it("flags a Flight Risk instead of pricing it, and a hidden trait by its share", () => {
    const v = candidateValue(
      { ...JOSCHA, traits: ["flightRisk"] },
      { pointValue: PP },
    );
    expect(v?.flightRisk).toBeCloseTo(1, 12);
    const hidden = candidateValue(
      { ...JOSCHA, hiddenTraits: 1 },
      { pointValue: PP },
    );
    expect(hidden?.flightRisk).toBeGreaterThan(0);
    expect(hidden?.flightRisk).toBeLessThan(0.1);
    expect(candidateValue(JOSCHA, { pointValue: PP })?.flightRisk).toBe(0);
  });
  it("prices a product's point at its bid less its inputs, a raw's at its bid", () => {
    const bids = {
      steel: 1.844,
      iron: 0.091,
      cookedFish: 8.321,
      fish: 3.37,
      grain: 0.082,
    };
    const bidOf = (c) => bids[c] ?? null;
    expect(valuePerPoint("steel", bidOf)).toBeCloseTo(
      (1.844 - 10 * 0.091) / 10,
      12,
    );
    expect(valuePerPoint("cookedFish", bidOf)).toBeCloseTo(
      (8.321 - 3.37) / 40,
      12,
    );
    expect(valuePerPoint("grain", bidOf)).toBeCloseTo(0.082, 12);
    expect(valuePerPoint("bread", bidOf)).toBeNull();
    expect(valuePerPoint("tank", bidOf)).toBeNull();
    expect(productKind("steel")).toBe("product");
    expect(productKind("iron")).toBe("raw");
    expect(productKind("tank")).toBeNull();
  });
  it("raises a Climber's wage 2% for every full week since the hire", () => {
    const plain = {
      wageDay: 6 * PP * 2,
      production: 2,
      hiddenTraits: 0,
      age: 25,
    };
    const ctx = { pointValue: PP, alone: true };
    const a = candidateValue(plain, ctx);
    const b = candidateValue({ ...plain, traits: ["climber"] }, ctx);
    expect(b?.perDayNow).toBeCloseTo(/** @type {number} */ (a?.perDayNow), 12);
    // 40 days: weeks 0..5, the wage up 2% a week after each full one
    let extra = 0;
    for (let d = 0; d < 40; d++)
      extra += plain.wageDay * 0.02 * Math.floor(d / 7);
    expect(
      /** @type {number} */ (a?.total) - /** @type {number} */ (b?.total),
    ).toBeCloseTo(extra, 9);
  });
  it("applies a home-or-abroad trait and a raw-or-product trait where they are known", () => {
    const base = {
      wageDay: 6 * PP * 2,
      production: 2,
      hiddenTraits: 0,
      age: 30,
    };
    const ctx = { pointValue: PP, alone: true };
    const day0 = (c, x = ctx) =>
      /** @type {number} */ (candidateValue(c, x)?.perDayNow);
    expect(day0({ ...base, traits: ["patriot"], home: true })).toBeCloseTo(
      6 * PP * (2 + 2 * 0.1),
      9,
    );
    expect(day0({ ...base, traits: ["patriot"], home: false })).toBeCloseTo(
      0,
      9,
    );
    expect(day0({ ...base, traits: ["expat"], home: false })).toBeCloseTo(
      6 * PP * 2,
      9,
    );
    expect(day0({ ...base, traits: ["homesick"], home: true })).toBeCloseTo(
      0,
      9,
    );
    expect(
      day0({ ...base, traits: ["craftsman"] }, { ...ctx, kind: "raw" }),
    ).toBeCloseTo(-6 * PP, 9);
    expect(
      day0({ ...base, traits: ["laborer"] }, { ...ctx, kind: "raw" }),
    ).toBeCloseTo(6 * PP * 3, 9);
  });
});

describe("the pick", () => {
  it("picks the live window's best: Production 2 asking 98% over Production 4 asking 115%", () => {
    const r = rankCandidates([SHERMAN, ALEXANDER, JOSCHA, MOAZ], {
      pointValue: PP,
      alone: true,
    });
    expect(r.best).toBe(0);
    expect(r.bestPays).toBe(true);
    expect(/** @type {number} */ (r.values[1]?.total)).toBeLessThan(0);
    expect(/** @type {number} */ (r.values[3]?.total)).toBeLessThan(0);
  });
  it("keeps a wage just past 130% as a drifted reading instead of blanking it", () => {
    const v = candidateValue(
      { wageDay: 6 * PP * 4 * 1.35, hiddenTraits: 0, age: 30 },
      { pointValue: PP },
    );
    expect(v?.fits).toBe(true);
    expect(v?.drifted).toBe(true);
    expect(v?.likeliest).toBe(4);
    expect(candidateValue(SHERMAN, { pointValue: PP })?.drifted).toBe(false);
  });
  it("never picks a candidate whose wage fits no Production", () => {
    const odd = { wageDay: 6 * PP * 6, hiddenTraits: 0, age: 18 };
    const r = rankCandidates([odd, ALEXANDER], { pointValue: PP, alone: true });
    expect(r.values[0]?.fits).toBe(false);
    expect(r.best).toBe(1);
    expect(r.bestPays).toBe(false);
  });
});
