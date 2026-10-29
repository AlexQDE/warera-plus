import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { rosterOf, teamEffect } from "./team.mjs";
import * as hiring from "./hiring.mjs";
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

const TEAM_NOW = Date.parse("2026-10-28T12:00:00Z");
const EMPLOYEES = JSON.parse(
  readFileSync("fixtures/employees-live-2026-10-28.json", "utf8"),
);
const TEAM_CTX = { pointValue: 0.1012, now: TEAM_NOW };
const LIONEL = rosterOf(EMPLOYEES, "c00000000000000000000001", TEAM_NOW);

describe("roster-aware hiring and training", () => {
  const bully = {
    production: 2,
    wageDay: 1.2,
    responsibility: 1,
    age: 30,
    traits: ["bully"],
    gender: "male",
  };
  it("separates the Bully's unpaid self points from Lionel's loss", () => {
    const plain = candidateValue({ ...bully, traits: [] }, TEAM_CTX);
    const value = candidateValue(bully, { ...TEAM_CTX, roster: LIONEL });
    let self = 0;
    for (let d = 0; d < 35; d++)
      self += 6 * 0.1012 * 2 * (1 + Math.min(d / 100, 0.2));
    expect(value.total).toBeCloseTo(plain.total + self, 9);
    expect(value.team).toBeCloseTo(-3.27888, 9);
    expect(value.others[0].name).toBe("Lionel Leannon");
    expect(value.others[0].after.happiness).toBeCloseTo(32.9, 9);
    expect(candidateValue(bully, TEAM_CTX).team).toBeUndefined();
  });

  it("applies incoming team happiness to a hire's unpaid Production too", () => {
    const roster = [{ ...LIONEL[0], traits: ["bully"] }];
    const value = candidateValue(bully, { ...TEAM_CTX, roster });
    expect(value.self.prod).toBe(2);
    expect(value.self.pct).toBeCloseTo(-0.09, 10);
    expect(value.perDayNow).toBeCloseTo(6 * 0.1012 * 4 * 0.91 - 1.2, 10);
    let expected = 0;
    for (let d = 0; d < 35; d++)
      expected += 6 * 0.1012 * 4 * (0.91 + Math.min(d / 100, 0.2)) - 1.2;
    expect(value.total).toBeCloseTo(expected, 10);
    // The legacy trait percentage keeps its existing formula without a roster.
    const legacy = candidateValue(
      { ...bully, traits: ["bully", "handy"] },
      TEAM_CTX,
    );
    expect(legacy.perDayNow).toBeCloseTo(
      6 * 0.1012 * (4 + 2 * 0.12 - 0.6) - 1.2,
      10,
    );
    const mixed = candidateValue(
      { ...bully, traits: ["bully", "handy"] },
      { ...TEAM_CTX, roster },
    );
    expect(mixed.perDayNow).toBeCloseTo(
      6 * 0.1012 * (4 * 0.91 + 2 * 0.12) - 1.2,
      10,
    );
  });

  it("takes Production and hidden traits in expectation, including real team conditions", () => {
    const candidate = {
      wageDay: 1.58,
      hiddenTraits: 1,
      age: 30,
      responsibility: 1,
    };
    const ctx = { ...TEAM_CTX, roster: LIONEL };
    const expected = productionOdds(candidate, TEAM_CTX.pointValue).reduce(
      (sum, k) =>
        sum +
        k.prob *
          candidateValue(
            {
              ...candidate,
              production: k.production,
              traits: k.codes,
              hiddenTraits: 0,
            },
            ctx,
          ).team,
      0,
    );
    expect(candidateValue(candidate, ctx).team).toBeCloseTo(expected, 10);
    // Unknown nationality never substitutes the card's country name for an API country id.
    const unknown = candidateValue(
      { ...bully, traits: ["xenophobe"], nationality: null },
      ctx,
    );
    expect(unknown.assumed.join("\n")).toContain(
      "Xenophobe: unknown nationality; rule skipped",
    );
    expect(unknown.total).toBeCloseTo(
      candidateValue({ ...bully, traits: [] }, TEAM_CTX).total,
      9,
    );
  });

  it("lets a coworker's loss change the pick and whether any hire pays", () => {
    const roster = [{ ...LIONEL[0], P: 100 }];
    const candidates = [bully, { ...bully, traits: [], wageDay: 1.18 }];
    const values = candidates.map((c) =>
      candidateValue(c, { ...TEAM_CTX, roster }),
    );
    const ranked = rankCandidates(candidates, { ...TEAM_CTX, roster });
    expect(values[0].total).toBeGreaterThan(values[1].total);
    expect(values[0].total + values[0].team).toBeLessThan(0);
    expect(ranked.best).toBe(1);
    expect(ranked.bestPays).toBe(true);
    const loner = [{ ...roster[0], traits: ["loner"] }];
    expect(
      rankCandidates(candidates, { ...TEAM_CTX, roster: loner }).bestPays,
    ).toBe(false);
  });

  const trainee = {
    production: 3,
    responsibility: 1,
    luck: 1,
    wageChip: 0,
    bonus: -0.001,
    age: 45,
    traits: [],
    potential: 1,
    potentialMax: 3,
  };

  it("applies a taught team bonus to the unpaid Production gained with it", () => {
    const subject = { ...LIONEL[0], spec: 0, id: "trainee" };
    const peer = { ...LIONEL[0], id: "peer", wageHour: 0.01 };
    const r = trainingValues(
      [{ kind: "habit", traitTo: ["bully", "primaDonna"] }],
      trainee,
      { ...TEAM_CTX, roster: [subject, peer], traineeId: subject.id },
    );
    let expected = 0;
    for (let d = 0; d < 20; d++)
      expected += 6 * 0.1012 * (2 * (0.999 + d / 100) + 5 * 0.11);
    expect(r.values[0].self.prod).toBe(2);
    expect(r.values[0].self.pct).toBeCloseTo(0.11, 10);
    expect(r.values[0].gold).toBeCloseTo(expected, 10);
  });

  it("prices Nationalist's own shield only while each happiness loss lasts", () => {
    const subject = {
      ...LIONEL[0],
      id: "trainee",
      items: [
        { delta: -4, until: null },
        { delta: -5, until: TEAM_NOW + 86400e3 },
      ],
    };
    const r = trainingValues(
      [{ kind: "habit", traitTo: ["nationalist"] }],
      trainee,
      {
        ...TEAM_CTX,
        roster: [subject, { ...LIONEL[0], id: "peer" }],
        traineeId: subject.id,
      },
    );
    expect(r.values[0].gold).toBeCloseTo(
      6 * 0.1012 * 3 * (0.068 + 19 * 0.058),
      10,
    );
  });

  it("lets Rehab's Greedy wage cut end a coworker's Envious penalty", () => {
    const subject = {
      ...LIONEL[0],
      id: "trainee",
      traits: ["greedy"],
      wageHour: 0.12,
    };
    const peer = {
      ...LIONEL[0],
      id: "peer",
      traits: ["envious"],
      wageHour: 0.11,
      happiness: 45.5,
      bonus: -4.5,
      items: [{ delta: -5, until: null }],
    };
    const r = trainingValues(
      [{ kind: "rehab", trait: "greedy" }],
      { ...trainee, traits: ["greedy"], wageChip: 0.2 },
      { ...TEAM_CTX, roster: [subject, peer], traineeId: subject.id },
    );
    expect(r.values[0].others[0]?.after.happiness).toBe(50);
    expect(r.values[0].team).toBeCloseTo(20 * 6 * 0.1012 * 3 * 0.045, 10);
  });
  it("prices a taught Bully and Rehab through self and team deltas, and ranks their sum", () => {
    const cards = [
      { kind: "habit", traitTo: ["bully"] },
      { kind: "habit", traitTo: ["comic"] },
    ];
    const roster = [
      { ...LIONEL[0], id: "trainee", name: "Trainee" },
      { ...LIONEL[0], P: 100 },
    ];
    const ctx = { ...TEAM_CTX, roster, traineeId: "trainee" };
    const r = trainingValues(cards, trainee, ctx);
    const effect = teamEffect(
      roster,
      { kind: "card", id: "trainee", card: cards[0] },
      { ...TEAM_CTX, subjectHorizon: 20 },
    );
    expect(r.values[0].team).toBeCloseTo(effect.team, 10);
    expect(r.values[0].gold).toBeGreaterThan(20 * 6 * 0.1012 * 2);
    expect(r.values[0].others[0].name).toBe("Lionel Leannon");
    expect(r.values[0].gold).toBeGreaterThan(r.values[1].gold);
    expect(r.best).toBe(1);
    expect(
      trainingValues(cards, trainee, TEAM_CTX).values[0].team,
    ).toBeUndefined();
  });

  it("prices the self change when a Rival catches up and a Mentor's lift is lost", () => {
    const roster = [
      {
        ...LIONEL[0],
        id: "trainee",
        baseP: 2,
        P: 7,
        spec: 0,
        traits: ["rival"],
      },
      { ...LIONEL[0], id: "mentor", baseP: 3, traits: ["mentor"] },
    ];
    const t = { ...trainee, production: 7, traits: ["rival"] };
    const card = [{ kind: "drill", stat: "production", delta: 1 }];
    const without = trainingValues(card, t, TEAM_CTX);
    const withTeam = trainingValues(card, t, {
      ...TEAM_CTX,
      roster,
      traineeId: "trainee",
    });
    let correction = 0;
    for (let d = 0; d < 20; d++)
      correction += 6 * 0.1012 * -6 * (1 - 0.001 + d / 100);
    expect(withTeam.values[0].gold - without.values[0].gold).toBeCloseTo(
      correction,
      9,
    );
    expect(withTeam.values[0].self.why.join("\n")).toContain(
      "Rival: Production −4",
    );
  });

  it("values a Responsibility drill using actual, expiring negative happiness items", () => {
    const r = trainingValues(
      [{ kind: "drill", stat: "responsibility", delta: 1 }],
      trainee,
      { ...TEAM_CTX, roster: LIONEL, traineeId: LIONEL[0].id },
    );
    let expected = 0;
    for (let day = 0; day < 20; day++) {
      const negative = LIONEL[0].items.reduce(
        (s, item) =>
          s +
          (item.delta < 0 &&
          (item.until == null || item.until > TEAM_NOW + day * 86400e3)
            ? -item.delta
            : 0),
        0,
      );
      expected += (6 * 0.1012 * 3 * negative * 0.1) / 100;
    }
    expect(r.values[0].gold).toBeCloseTo(expected, 10);
    expect(r.values[0].note).toContain("actual happiness losses");
    expect(r.values[0].team).toBe(0);
  });

  it("averages Wild card's trait and random stat together through the team model", () => {
    const roster = [{ ...LIONEL[0], id: "trainee", traits: [] }, LIONEL[0]];
    const r = trainingValues([{ kind: "wild" }], trainee, {
      ...TEAM_CTX,
      roster,
      traineeId: "trainee",
    });
    const expected = hiddenTraitPool().reduce(
      (sum, p) =>
        sum +
        p.share *
          hiring.TRAIN_STATS.reduce(
            (s, stat) =>
              s +
              teamEffect(
                roster,
                {
                  kind: "card",
                  id: "trainee",
                  card: { kind: "wild", trait: p.code, stat, delta: 1 },
                },
                { ...TEAM_CTX, subjectHorizon: 20 },
              ).team /
                3,
            0,
          ),
      0,
    );
    expect(r.values[0].team).toBeCloseTo(expected, 9);
  });

  it("prices Wild card's combined Production and bonus before averaging", () => {
    const subject = {
      ...LIONEL[0],
      id: "trainee",
      items: [],
      happiness: 50,
      bonus: 0,
      spec: 0,
    };
    const peer = { ...subject, id: "peer", nationality: "foreign" };
    const price = (nationality) =>
      trainingValues(
        [{ kind: "wild" }],
        { ...trainee, age: 64, bonus: 0 },
        {
          ...TEAM_CTX,
          roster: [{ ...subject, nationality }, peer],
          traineeId: subject.id,
        },
      ).values[0].gold;
    // Known foreign peers enable Cosmopolitan +2 and Xenophobe -2: their
    // flat gains cancel. Xenophobe's loss applies to his remaining P1,
    // shielded by R1 (R2 in Wild card's Responsibility case).
    expect(price(subject.nationality) - price(null)).toBeCloseTo(
      ((6 * 0.1012 * (3 - 2) * -(0.045 + 0.04 + 0.045)) / 3) * (10 / 354),
      10,
    );
  });

  it("uses the actual negotiated wage to switch a coworker's Envious penalty", () => {
    const subject = {
      ...LIONEL[0],
      id: "trainee",
      traits: ["greedy"],
      wageExpectation: 1,
      wageHour: 0.1,
    };
    const envious = {
      ...LIONEL[0],
      id: "peer",
      name: "Envious coworker",
      traits: ["envious"],
      wageHour: 0.089,
      items: [{ delta: -5, until: null }],
      happiness: 45.5,
    };
    // 10 points off expectation: 0.1 → 0.09, still above 0.089.
    const r = trainingValues(
      [{ kind: "negotiation", delta: 10 }],
      { ...trainee, traits: ["greedy"], wageChip: 0.2 },
      { ...TEAM_CTX, roster: [subject, envious], traineeId: "trainee" },
    );
    expect(r.values[0].team).toBe(0);
  });

  it("leaves unread training cards unpriced with a roster", () => {
    const r = trainingValues(
      [{ kind: "habit" }, { kind: "unknown" }],
      trainee,
      { ...TEAM_CTX, roster: LIONEL, traineeId: LIONEL[0].id },
    );
    expect(r.values.every((v) => v.gold === null && v.team === 0)).toBe(true);
    expect(r.best).toBeNull();
  });
});

describe("the training cards", () => {
  // the live Train window of 2026-10-27: Sorayut Chaichana, 40, hired today,
  // Production 5, Responsibility 1, Luck 1, wage chip +13.8%, bonus +0.9%;
  // his hand: Negotiation -10%, Intensive drill Luck +2, Wild card
  const PV = 0.1012;
  const SORAYUT = {
    production: 5,
    responsibility: 1,
    luck: 1,
    potential: 1,
    potentialMax: 3,
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
  /** What the best card of a hand at his odds averages: every card he can be dealt but Second wind, Luck at zero. */
  const expectedBest = (/** @type {any} */ trainee, pointValue = PV) => {
    const others = hiring
      .trainingPool(trainee)
      .filter((c) => c.kind !== "secondWind");
    const prices = trainingValues(
      others,
      { ...trainee, potential: trainee.potentialMax },
      { pointValue },
    ).values;
    return hiring.bestOfHand(
      others.map((c, i) => ({ ...c, gold: prices[i].gold })),
      hiring.trainingOdds(trainee.luck ?? 0, trainee.leadership ?? 0),
    );
  };
  it("prices a dealt Second wind at what later hands average, not at the strong card dealt beside it", () => {
    // a friend's Train window of 2026-10-29: Brenda Collins, 24, hired 2 days ago, Production 5, Responsibility 1,
    // Luck 3 under Leadership 11, wage chip -6.6%, bonus +10.1%, potential 3/10; a legendary hand: Second wind +4,
    // Intensive drill +4 Production and Two new habits (Stockpiler and Recruiter); point value 0.0943
    const brenda = {
      production: 5,
      responsibility: 1,
      luck: 3,
      leadership: 11,
      potential: 3,
      potentialMax: 10,
      wageChip: -0.066,
      bonus: 0.101,
      hiredDays: 2,
      age: 24,
      traits: [],
    };
    const hand = [
      { kind: "secondWind", rarity: "legendary", delta: 4 },
      { kind: "drill", rarity: "legendary", stat: "production", delta: 4 },
      {
        kind: "habit",
        rarity: "legendary",
        traitTo: ["stockpiler", "recruiter"],
      },
    ];
    const r = trainingValues(hand, brenda, { pointValue: 0.0943 });
    const [wind, drill, habits] = /** @type {any} */ (r).values;
    // 41 days to 65 and 7 trainings left after this hand: four more on days 8 to 11
    const top = expectedBest(brenda, 0.0943);
    // a hand is one rarity: 14.7 g (15.7 g when every card drew its own rarity)
    expect(top).toBeCloseTo(14.7, 1);
    expect(wind.hands).toBe(4);
    expect(wind.gold).toBeCloseTo(
      [8, 9, 10, 11].reduce(
        (s, j) => s + Math.max(0, (top * (41 - j)) / 41 - ENERGY_GOLD),
        0,
      ),
      9,
    );
    // about 27 g, where pricing each later hand at the +4 drill beside it (28.3 g) read 69 g: the drill edges it
    expect(wind.gold).toBeCloseTo(27.3, 1);
    expect(drill.gold).toBeCloseTo(28.3, 1);
    expect(habits.gold).toBe(0);
    expect(r?.best).toBe(1);
    // the same alone, or beside a weak card
    for (const cards of [[hand[0]], [hand[0], hand[2]]])
      expect(
        trainingValues(cards, brenda, { pointValue: 0.0943 }).values[0].gold,
      ).toBe(wind.gold);
    expect(wind.note).toContain("a hand's best card averages 14.7 g");
  });
  it("takes Negotiation for an expensive worker: 10 points off his wage for 25 days", () => {
    const r = trainingValues(HAND, SORAYUT, { pointValue: PV });
    expect(r?.horizon).toBe(25);
    expect(r?.values[0].gold).toBeCloseTo(25 * 6 * PV * 5 * 0.1, 9);
    expect(r?.values[0].note).toContain("wage chip +13.8% → +3.8%");
    expect(r?.values[1].gold).toBeGreaterThan(0);
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
  it("infers paid Production from a rounded daily wage, falling back for an implausible wage", () => {
    const cards = [
      { kind: "negotiation", delta: 5 },
      { kind: "habit", traitTo: ["greedy"] },
      { kind: "drill", stat: "responsibility", delta: 1 },
    ];
    const t = {
      ...SORAYUT,
      production: 7,
      wageChip: 0.183,
      wageDay: 2.87,
      age: 42,
      traits: ["laborer"],
    };
    const r = trainingValues(cards, t, { pointValue: PV });
    expect(r.paidProduction).toBe(4);
    expect(r.values[0].gold).toBeCloseTo(23 * 6 * PV * 4 * 0.05, 9);
    expect(r.values[0].perDay).toBeCloseTo(6 * PV * 4 * 0.05, 9);
    expect(r.values[1].gold).toBeCloseTo(-23 * 6 * PV * 4 * 1.183 * 0.2, 9);
    const fallback = trainingValues(
      cards,
      { ...t, wageDay: 6 * PV * 4.3 * 1.183 },
      { pointValue: PV },
    );
    expect(fallback.paidProduction).toBe(7);
    expect(fallback.values[0].gold).toBeCloseTo(23 * 6 * PV * 7 * 0.05, 9);
    expect(r.values[2].gold).toBe(fallback.values[2].gold);
  });
  it("assigns daily values only to streams, and null at a zero horizon", () => {
    const cards = [
      { kind: "negotiation", delta: 10 },
      { kind: "drill", stat: "luck", delta: 1 },
      { kind: "secondWind", delta: 2 },
    ];
    const r = trainingValues(cards, SORAYUT, { pointValue: PV });
    expect(r.values[0].perDay).toBeCloseTo(r.values[0].gold / 25, 12);
    expect(r.values[1]).toMatchObject({ perDay: null, hands: 2 });
    expect(r.values[2]).toMatchObject({ perDay: null, hands: 2 });
    expect(
      trainingValues(
        cards,
        { ...SORAYUT, age: 65 },
        { pointValue: PV },
      ).values.every((v) => v.perDay === null),
    ).toBe(true);
  });
  it("adds Second wind hands after existing ones, only before retirement, keeping their full energy cost", () => {
    const cards = [
      { kind: "negotiation", delta: 20 },
      { kind: "secondWind", delta: 4 },
    ];
    const trainee = {
      ...SORAYUT,
      production: 40,
      potential: 1,
      potentialMax: 3,
      age: 60,
    };
    const r = trainingValues(cards, trainee, { pointValue: PV });
    // each extra hand is worth what a hand at his odds averages, not this hand's Negotiation
    const top = expectedBest(trainee);
    expect(top).not.toBeCloseTo(5 * 6 * PV * 40 * 0.2, 1);
    expect(
      trainingValues([cards[1]], trainee, { pointValue: PV }).values[0],
    ).toMatchObject({ gold: r.values[1].gold, hands: 2 });
    expect(r.values[1].hands).toBe(2);
    expect(r.values[1].gold).toBeCloseTo(
      Math.max(0, (top * 2) / 5 - ENERGY_GOLD) +
        Math.max(0, top / 5 - ENERGY_GOLD),
      10,
    );
    const full = trainingValues(
      cards,
      { ...trainee, potentialMax: 8 },
      { pointValue: PV },
    );
    expect(full.values[1]).toMatchObject({ gold: 0, hands: 0, perDay: null });
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
  it("values traits taught and removed, and Second wind by the best card a later hand averages", () => {
    const greedy = { ...SORAYUT, wageChip: 1.0 * 1.2 - 1, traits: ["greedy"] };
    const r = trainingValues(
      [
        { kind: "habit", traitTo: ["specialist"] },
        { kind: "rehab", trait: "greedy" },
        { kind: "secondWind", delta: 2 },
      ],
      greedy,
      { pointValue: PV },
    );
    const [habit, rehab, wind] = /** @type {any} */ (r).values;
    expect(habit.gold).toBeGreaterThan(0);
    // losing Greedy: his wage drops by a fifth of his expectation's pay
    expect(rehab.gold).toBeCloseTo(25 * 6 * PV * 5 * 1.0 * 0.2, 9);
    expect(wind.gold).toBeCloseTo(
      [3, 4].reduce(
        (s, j) =>
          s + Math.max(0, (expectedBest(greedy) * (25 - j)) / 25 - ENERGY_GOLD),
        0,
      ),
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
  it("prices Luck by the future hands, counting the open hand and the horizon", () => {
    const drill = [HAND[1]];
    const price = (changes) =>
      trainingValues(drill, { ...SORAYUT, ...changes }, { pointValue: PV })
        ?.values[0];
    // At the potential cap, Second wind is absent from the pool, keeping
    // its prices identical as the number of remaining hands changes.
    const one = price({ potential: 14, potentialMax: 15 });
    expect(one.gold).toBeGreaterThan(0);
    expect(price({ potential: 13, potentialMax: 15 }).gold).toBeCloseTo(
      ((24 + 23) / 24) * one.gold,
      10,
    );
    expect(price({ potential: 12, potentialMax: 15 }).gold).toBeCloseTo(
      ((24 + 23 + 22) / 24) * one.gold,
      10,
    );
    expect(price({ potential: 2, potentialMax: 3 }).hands).toBe(1);
    expect(price({ potential: 2, potentialMax: 3 }).gold).toBeGreaterThan(0);
    expect(price({ potential: 3, potentialMax: 3 }).gold).toBe(0);
    expect(price({ potential: 4, potentialMax: 3 }).gold).toBe(0);
    expect(price({ potential: 0, potentialMax: 3, age: 64 }).gold).toBe(0);
    // Two days in the horizon allow just one future hand, whatever potential remains.
    expect(price({ potential: 0, potentialMax: 3, age: 63 }).gold).toBeCloseTo(
      price({ potential: 1, potentialMax: 3, age: 63 }).gold,
      12,
    );
    expect(one.note).toContain(
      "1 more training after this one, weighted by days left; best hand averages +",
    );
    expect(one.note).toContain(
      "uncommon +1%, rare +0.6%, epic +0.3%, legendary +0.1%",
    );
    expect(one.note).toContain("toolbox chance +0.2% an hour, not priced");
    expect(one.note).toContain(
      "model: a hand draws one rarity, then three different cards of it",
    );
    // potential already counts the hand open now
    expect(one.note).toContain("1 more training after this one");
  });
  it("leaves Luck and its random-stat contribution unknown without potential", () => {
    const r = trainingValues(
      HAND,
      { ...SORAYUT, potential: null, potentialMax: null },
      { pointValue: PV },
    );
    expect(r.values[1].gold).toBeNull();
    expect(r.values[1].note).toContain("trainings left not read");
    expect(r.values[2].gold).toBeNull();
    expect(r.best).toBe(0);
  });
  it("includes Luck's value in Wild card's random stat average", () => {
    const a = trainingValues(HAND, SORAYUT, { pointValue: PV });
    const b = trainingValues(
      HAND,
      { ...SORAYUT, potential: 3 },
      { pointValue: PV },
    );
    const luck = trainingValues(
      [{ kind: "drill", stat: "luck", delta: 1 }],
      SORAYUT,
      { pointValue: PV },
    );
    expect(luck.values[0].gold).toBeGreaterThan(0);
    expect(a.values[2].gold - b.values[2].gold).toBeCloseTo(
      luck.values[0].gold / 3,
      12,
    );
  });
  it("caps the toolbox chance in Luck's note", () => {
    const r = trainingValues(
      [HAND[1]],
      { ...SORAYUT, luck: 20 },
      { pointValue: PV },
    );
    expect(r.values[0].note).toContain(
      "toolbox chance +0% an hour, not priced",
    );
  });
  it("compares fixed pool prices, valuing Second wind from the expected best other hand", () => {
    const trainee = {
      ...SORAYUT,
      potential: 1,
      potentialMax: 12,
      leadership: 3,
    };
    const pool = hiring.trainingPool(trainee);
    const others = pool.filter((c) => c.kind !== "secondWind");
    // With no future hands, the ordinary card rules price Luck at zero.
    const prices = trainingValues(
      others,
      { ...trainee, potential: 12 },
      { pointValue: PV },
    ).values;
    const priced = others.map((c, i) => ({ ...c, gold: prices[i].gold }));
    const odds = hiring.trainingOdds(trainee.luck, trainee.leadership);
    const expectedOther = hiring.bestOfHand(priced, odds);
    for (const c of pool.filter((c) => c.kind === "secondWind"))
      priced.push({
        ...c,
        gold: Array.from({ length: c.delta }, (_, i) =>
          Math.max(0, (expectedOther * (25 - (12 + i))) / 25 - ENERGY_GOLD),
        ).reduce((s, g) => s + g, 0),
      });
    const perHand =
      hiring.bestOfHand(
        priced,
        hiring.trainingOdds(trainee.luck + 2, trainee.leadership),
      ) - hiring.bestOfHand(priced, odds);
    const r = trainingValues([HAND[1]], trainee, { pointValue: PV });
    const weight = Array.from(
      { length: 11 },
      (_, i) => (25 - (i + 1)) / 25,
    ).reduce((s, x) => s + x, 0);
    expect(r.values[0].hands).toBe(11);
    expect(r.values[0].gold).toBeCloseTo(weight * perHand, 10);
  });
});

describe("future training hands", () => {
  it.each([
    [1, [48, 28.5, 15.1, 6.05, 2.35]],
    [2, [47, 29, 15.4, 6.2, 2.4]],
    [4, [45, 30, 16, 6.5, 2.5]],
  ])("matches the live Leadership 3 table at Luck %i", (luck, percentages) => {
    expect(hiring.LEADERSHIP_TRAIN_SHIFT).toEqual({
      uncommon: 1,
      rare: 0.6,
      epic: 0.3,
      legendary: 0.1,
    });
    Object.values(hiring.trainingOdds(luck, 3)).forEach((p, i) =>
      expect(Math.abs(p * 100 - percentages[i])).toBeLessThan(0.01),
    );
  });
  it("shifts the game's rarity weights at Luck 0 and 10 with leadership 0", () => {
    expect(hiring.trainingOdds(0)).toEqual({
      common: 0.55,
      uncommon: 0.25,
      rare: 0.13,
      epic: 0.05,
      legendary: 0.02,
    });
    expect(hiring.trainingOdds(10)).toEqual({
      common: 0.45,
      uncommon: 0.3,
      rare: 0.16,
      epic: 0.065,
      legendary: 0.025,
    });
    const high = hiring.trainingOdds(100);
    expect(high.common).toBe(0);
    expect(Object.values(high).reduce((s, x) => s + x, 0)).toBeCloseTo(1, 12);
  });
  it("builds the employee's pool with rehab, habits and positive pairs", () => {
    const pool = hiring.trainingPool({
      production: 5,
      wageChip: -0.04,
      potentialMax: 12,
      traits: ["greedy", "homesick", "gambler", "handy"],
    });
    const counts = (key) =>
      pool.reduce((out, c) => {
        out[c[key]] = (out[c[key]] ?? 0) + 1;
        return out;
      }, {});
    expect(counts("kind")).toEqual({
      drill: 12,
      rehab: 3,
      cleanSlate: 1,
      habit: 335,
      wild: 1,
      secondWind: 2,
      negotiation: 2,
    });
    expect(counts("rarity")).toEqual({
      common: 4,
      uncommon: 6,
      rare: 13,
      epic: 29,
      legendary: 304,
    });
    expect(pool.filter((c) => c.kind === "rehab")).toEqual([
      { kind: "rehab", rarity: "rare", trait: "greedy" },
      { kind: "rehab", rarity: "rare", trait: "homesick" },
      { kind: "rehab", rarity: "uncommon", trait: "gambler" },
    ]);
    const habits = pool.filter((c) => c.kind === "habit");
    expect(
      habits.every((c) =>
        c.traitTo.every((t) => !["handy", "gambler"].includes(t)),
      ),
    ).toBe(true);
    const pairs = habits.filter((c) => c.rarity === "legendary");
    expect(pairs).toHaveLength(300);
    expect(
      pairs.every(
        (c) =>
          c.traitTo.length === 2 &&
          c.traitTo.every((t) => TRAITS[t].polarity === "positive"),
      ),
    ).toBe(true);
    expect(
      new Set(pairs.map((c) => [...c.traitTo].sort().join(","))).size,
    ).toBe(300);
  });
  it("limits Second wind by the potential cap and Negotiation by the expectation floor", () => {
    const pool = (potentialMax, wageChip, traits = []) =>
      hiring.trainingPool({
        production: 2,
        potentialMax,
        wageChip,
        traits,
      });
    const deltas = (cards, kind) =>
      cards.filter((c) => c.kind === kind).map((c) => c.delta);
    expect(deltas(pool(11, 0), "secondWind")).toEqual([2, 3, 4]);
    expect(deltas(pool(13, 0), "secondWind")).toEqual([2]);
    expect(deltas(pool(14, 0), "secondWind")).toEqual([]);
    expect(deltas(pool(null, 0), "secondWind")).toEqual([]);
    expect(deltas(pool(15, -0.3), "negotiation")).toEqual([]);
    expect(deltas(pool(15, -0.25), "negotiation")).toEqual([5]);
    expect(deltas(pool(15, -0.2), "negotiation")).toEqual([5, 10]);
    expect(deltas(pool(15, -0.1), "negotiation")).toEqual([5, 10, 20]);
    expect(deltas(pool(15, 0.8 * 1.2 - 1, ["greedy"]), "negotiation")).toEqual([
      5, 10,
    ]);
    const allTraits = pool(15, 0, Object.keys(TRAITS));
    expect(allTraits.some((c) => c.kind === "habit" || c.kind === "wild")).toBe(
      false,
    );
    expect(pool(15, 0, ["greedy"]).some((c) => c.kind === "cleanSlate")).toBe(
      false,
    );
  });
  it("draws one rarity for the whole hand, then different cards of it, and keeps the best", () => {
    const pool = [
      { rarity: "common", gold: 0 },
      { rarity: "common", gold: 4 },
      { rarity: "uncommon", gold: 10 },
    ];
    // Rare is absent: common and uncommon renormalise to 1/2 each.
    const odds = {
      common: 0.2,
      uncommon: 0.2,
      rare: 0.6,
      epic: 0,
      legendary: 0,
    };
    // a common hand holds both common cards (best 4), an uncommon one the 10: never a mix
    expect(hiring.bestOfHand(pool, odds)).toBeCloseTo(7, 12);
    expect(hiring.bestOfHand(pool, odds, 1)).toBeCloseTo(6, 12);
    // three different cards out of four: {1,2,3} -> 3, the three hands with the 4 -> 4
    expect(
      hiring.bestOfHand(
        [1, 2, 3, 4].map((gold) => ({ rarity: "common", gold })),
        odds,
      ),
    ).toBeCloseTo(3.75, 12);
    expect(hiring.bestOfHand(pool, odds, 0)).toBe(0);
    expect(hiring.bestOfHand([], odds)).toBe(0);
    expect(hiring.bestOfHand([{ rarity: "common", gold: -4 }], odds)).toBe(-4);
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
