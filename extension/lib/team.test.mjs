import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  TEAM_RULES,
  SHIELD_PER_RESPONSIBILITY,
  HAPPINESS_NEUTRAL,
  POINTS_PER_PRODUCTION_HOUR,
  memberOf,
  rosterOf,
  findTrainee,
  teamEffect,
  averageTeamEffects,
} from "./team.mjs";

const employees = JSON.parse(
  readFileSync(
    new URL("../../fixtures/employees-live-2026-10-28.json", import.meta.url),
    "utf8",
  ),
);
const now = Date.parse("2026-10-28T12:00:00Z");
const company = "c00000000000000000000001";
const ctx = { now, pointValue: 0.1012, subjectHorizon: 35 };
const candidate = (overrides = {}) => ({
  name: "New hire",
  gender: "male",
  nationality: "nat-2",
  age: 30,
  baseP: 2,
  R: 1,
  traits: [],
  wageHour: 0.05,
  ...overrides,
});
const hire = (overrides = {}) => ({
  kind: "hire",
  candidate: candidate(overrides),
});
const drill = (id, stat, delta) => ({
  kind: "card",
  id,
  card: { kind: "drill", stat, delta },
});
const effect = (roster, change, overrides = {}) =>
  teamEffect(roster, change, { ...ctx, ...overrides });

// Hand-built server states: traits are already included in P, R and the items.
function member(overrides = {}) {
  return {
    id: "a",
    name: "A",
    company,
    gender: "male",
    age: 45,
    nationality: "nat-2",
    baseP: 3,
    P: 3,
    R: 1,
    L: 1,
    traits: [],
    wageHour: 0.05,
    bonus: 0,
    spec: 0,
    items: [],
    shield: 0.1,
    happiness: 50,
    horizon: 20,
    productionContributions: {},
    ...overrides,
  };
}

describe("the roster read", () => {
  it("caps the Responsibility fallback shield at one", () => {
    expect(
      memberOf({ breakdown: { responsibility: { total: 12 } } }, now).shield,
    ).toBe(1);
    expect(
      memberOf(
        {
          breakdown: { responsibility: { total: 12 } },
          happinessBreakdown: { shield: 0.7 },
        },
        now,
      ).shield,
    ).toBe(0.7);
  });
  it("uses Wild card's raised Responsibility to mitigate its new happiness loss without pricing the drill twice", () => {
    const subject = member({
      items: [{ delta: -4, until: null }],
      happiness: 46.4,
    });
    const peer = member({ id: "peer", nationality: "another-country" });
    const result = effect([subject, peer], {
      kind: "card",
      id: subject.id,
      card: {
        kind: "wild",
        trait: "xenophobe",
        stat: "responsibility",
        delta: 1,
      },
    });
    expect(result.self.prod).toBe(-2);
    expect(result.self.pct).toBeCloseTo((-5 * 0.8) / 100, 10);
  });
  it("averages moved and unaffected cases over their full probabilities", () => {
    const roster = rosterOf(employees, company, now);
    const bully = effect(roster, hire({ traits: ["bully"] }));
    const plain = effect(roster, hire());
    const mean = averageTeamEffects([
      { result: bully, prob: 0.25 },
      { result: plain, prob: 0.75 },
    ]);
    expect(mean.team).toBeCloseTo(bully.team / 4, 10);
    expect(mean.others[0].after.happiness).toBeCloseTo(41.9 - 9 / 4, 10);
    expect(mean.others[0].why.join("\n")).toContain("25.0% of cases");
    expect(mean.self.prod).toBe(0.5);
  });
  it("reads Lionel alone in Disabled Iron without double-counting training", () => {
    const roster = rosterOf(employees, company, now);
    expect(roster).toHaveLength(1);
    expect(roster[0]).toMatchObject({
      name: "Lionel Leannon",
      P: 3,
      R: 1,
      baseP: 3,
      happiness: 41.9,
      shield: 0.1,
      horizon: 20,
    });
    expect(roster[0].bonus).toBeCloseTo(-0.1, 10);
    expect(roster[0].spec).toBe(2);
    expect(roster[0].items).toEqual([
      { delta: -4, until: null },
      { delta: -5, until: Date.parse("2026-11-03T11:27:36.442Z") },
    ]);
    const mohannad = memberOf(
      employees.find((e) => e.name === "Mohannad Al-Tawil"),
      now,
    );
    expect(mohannad.baseP).toBe(6);
    expect(mohannad.P).toBe(6);
  });

  it("keeps hidden traits, finite missing values and the Responsibility fallback", () => {
    const m = memberOf(
      {
        _id: "missing",
        age: 80,
        traits: [{ code: "bully", revealed: false }],
        base: { production: NaN },
      },
      now,
    );
    expect(m).toMatchObject({
      baseP: null,
      P: null,
      R: null,
      L: null,
      happiness: null,
      bonus: null,
      shield: null,
      gender: null,
      nationality: null,
      horizon: 0,
      items: null,
      traits: ["bully"],
    });
    expect(
      memberOf({ breakdown: { responsibility: { total: 4 } } }, now).shield,
    ).toBe(0.4);
    expect(memberOf({}, now).horizon).toBeNull();
  });

  it("matches exact names and uses age only for duplicate names", () => {
    expect(findTrainee(employees, "Lionel Leannon", 99)?.age).toBe(45);
    expect(findTrainee(employees, "lionel leannon", 45)).toBeNull();
    const duplicates = [
      { name: "A", age: 20 },
      { name: "A", age: 21 },
    ];
    expect(findTrainee(duplicates, "A", null)).toBeNull();
    expect(findTrainee(duplicates, "A", 21)?.age).toBe(21);
    expect(
      findTrainee([...duplicates, { name: "A", age: 21 }], "A", 21),
    ).toBeNull();
  });
});

describe("team changes on the live fixture", () => {
  it("prices the Bully acceptance case at -3.27888 gold", () => {
    const roster = rosterOf(employees, company, now);
    const result = effect(roster, hire({ traits: ["bully"] }));
    expect(result.self.prod).toBe(2);
    expect(result.self.pct).toBe(0);
    expect(result.others).toHaveLength(1);
    const lionel = result.others[0];
    expect(lionel.days).toBe(20);
    expect(lionel.after.happiness).toBeCloseTo(32.9, 10);
    expect(lionel.after.bonus - lionel.before.bonus).toBeCloseTo(-9, 10);
    expect(
      (6 * 3 * (lionel.after.bonus - lionel.before.bonus)) / 100,
    ).toBeCloseTo(-1.62, 10);
    expect(result.team / 0.1012).toBeCloseTo(-32.4, 10);
    expect(result.team).toBeCloseTo(-3.27888, 6);
    expect(lionel.why).toContain("happiness −9.0 (Bully −10, shield 0.1)");
    expect(result.checks).toEqual([]);
    // Both sides lose recentlyMoved and gain specialization; Bully's loss stays constant.
    for (let day = 0; day < 20; day++) {
      const daily = effect(roster, hire({ traits: ["bully"] }), {
        now: now + day * 86400000,
        subjectHorizon: 1,
      });
      expect(daily.team / 0.1012).toBeCloseTo(-1.62, 10);
    }
  });

  it("counts a coworker with no specialization part yet as 0%, not unknown, over the whole window", () => {
    const fresh = employees.map((e) =>
      e.company === company
        ? {
            ...e,
            productionBonus: {
              total: e.productionBonus.total - 2,
              contributions: e.productionBonus.contributions.filter(
                (part) => part.source !== "specialization",
              ),
            },
          }
        : e,
    );
    const roster = rosterOf(fresh, company, now);
    expect(roster[0].spec).toBe(0);
    const result = effect(roster, hire({ traits: ["bully"] }));
    expect(result.others[0].days).toBe(20);
    expect(result.team / 0.1012).toBeCloseTo(-32.4, 10);
    // without a bonus at all the specialization stays unknown
    const { productionBonus, ...bare } = employees.find(
      (e) => e.company === company,
    );
    expect(productionBonus).toBeDefined();
    expect(memberOf(bare, now).spec).toBeNull();
  });

  it("uses strictly stronger base Production for Rival, excluding the drilled points", () => {
    const roster = rosterOf(employees, "c00000000000000000000003", now);
    const alyssa = roster.find((m) => m.name === "Alyssa Brown");
    const tom = roster.find((m) => m.name === "Tom Murazik");
    const trained = effect(roster, drill(alyssa.id, "production", 2));
    expect(trained.self.prod).toBe(-4);
    expect(trained.team).toBe(0);
    expect(trained.checks).toEqual([]);
    expect(trained.assumed.join(" ")).toMatch(/Rival.*base.*strict/i);
    const equal = effect(roster, drill(tom.id, "production", 2));
    expect(equal.self.prod).toBe(0);
    expect(equal.team).toBe(0);
    expect(equal.others).toHaveLength(0);
  });

  it("adds four unpaid points to a Rival when a stronger hire arrives", () => {
    const rival = member({
      traits: ["rival"],
      P: 2,
      productionContributions: { rival: -1 },
    });
    const result = effect([rival], hire({ baseP: 5 }), { subjectHorizon: 1 });
    expect(result.others[0].before.P).toBe(2);
    expect(result.others[0].after.P).toBe(6);
    expect(result.team).toBeCloseTo(24 * 0.1012, 10);
    expect(result.checks).toEqual([]);
    const mismatch = effect(
      [{ ...rival, productionContributions: { rival: 3 } }],
      hire({ baseP: 5 }),
    );
    expect(mismatch.checks.join(" ")).toMatch(/Rival.*−1.*3/);
    expect(mismatch.team).toBeCloseTo(24 * 0.1012 * 21.9, 10);
  });

  it("recomputes Foreman's shield and the expiring happiness item day by day", () => {
    const roster = rosterOf(employees, company, now);
    const change = hire({ traits: ["foreman"] });
    const result = effect(roster, change);
    expect(result.others[0].after.happiness).toBeCloseTo(44.6, 10);
    expect(result.others[0].why.join(" ")).toMatch(
      /Responsibility.*3.*shield 0.4/,
    );
    const beforeExpiry = effect(roster, change, {
      now: now + 5 * 86400000,
      subjectHorizon: 1,
    });
    const afterExpiry = effect(roster, change, {
      now: now + 6 * 86400000,
      subjectHorizon: 1,
    });
    expect(beforeExpiry.team / 0.1012).toBeCloseTo(18 * 0.027, 10);
    expect(afterExpiry.others[0].after.happiness).toBeCloseTo(47.6, 10);
    expect(afterExpiry.team / 0.1012).toBeCloseTo(18 * 0.012, 10);
    expect(result.team).toBeCloseTo(
      (6 * 18 * 0.027 + 14 * 18 * 0.012) * 0.1012,
      10,
    );
  });
});

describe("conditional traits and cards", () => {
  it.each([
    [
      "Rehab Greedy",
      ["greedy"],
      0.12,
      0.11,
      { kind: "rehab", trait: "greedy" },
      1,
    ],
    [
      "Clean slate",
      ["greedy"],
      0.12,
      0.11,
      { kind: "cleanSlate", traits: ["greedy"] },
      1,
    ],
    [
      "Rehab Modest",
      ["modest"],
      0.085,
      0.09,
      { kind: "rehab", trait: "modest" },
      -1,
    ],
    ["teach Greedy", [], 0.1, 0.11, { kind: "habit", traitTo: ["greedy"] }, -1],
    ["teach Modest", [], 0.1, 0.09, { kind: "habit", traitTo: ["modest"] }, 1],
    [
      "replace Greedy",
      ["greedy"],
      0.12,
      0.11,
      { kind: "habit", trait: "greedy", traitTo: ["modest"] },
      1,
    ],
    [
      "Wild Greedy and Production",
      [],
      0.08,
      0.13,
      { kind: "wild", trait: "greedy", stat: "production", delta: 1 },
      -1,
    ],
    [
      "Wild Modest",
      [],
      0.1,
      0.09,
      { kind: "wild", trait: "modest", stat: "luck", delta: 1 },
      1,
    ],
    [
      "summed markup",
      ["greedy", "modest"],
      0.105,
      0.086,
      { kind: "rehab", trait: "greedy" },
      1,
    ],
  ])(
    "recomputes Envious after %s changes the wage",
    (_, traits, wageHour, peerWage, card, direction) => {
      const subject = member({ id: "trainee", baseP: 2, traits, wageHour });
      const peer = member({
        id: "peer",
        traits: ["envious"],
        wageHour: peerWage,
        items: direction > 0 ? [{ delta: -5, until: null }] : [],
        happiness: direction > 0 ? 45.5 : 50,
        bonus: direction > 0 ? -4.5 : 0,
      });
      const result = effect(
        [subject, peer],
        { kind: "card", id: subject.id, card },
        { subjectHorizon: 1 },
      );
      expect(result.others[0]?.after.happiness).toBe(direction > 0 ? 50 : 45.5);
      expect(result.team).toBeCloseTo(direction * 18 * 0.045 * 0.1012, 10);
      expect(subject.wageHour).toBe(wageHour);
      expect(subject.traits).toEqual(traits);
    },
  );

  it("lets Prima Donna become best paid when Rehab removes a coworker's Greedy", () => {
    const subject = member({
      id: "trainee",
      traits: ["greedy"],
      wageHour: 0.12,
    });
    const peer = member({ id: "peer", traits: ["primaDonna"], wageHour: 0.11 });
    const result = effect(
      [subject, peer],
      {
        kind: "card",
        id: subject.id,
        card: { kind: "rehab", trait: "greedy" },
      },
      { subjectHorizon: 1 },
    );
    expect(result.others[0]?.after.bonus).toBeCloseTo(11, 10);
    expect(result.team).toBeCloseTo(18 * 0.11 * 0.1012, 10);
  });

  it("expires the trainee's own shield gain daily and averages each day", () => {
    const subject = member({
      items: [
        { delta: -4, until: null },
        { delta: -5, until: now + 86400e3 },
      ],
      happiness: 41.9,
    });
    const roster = [subject, member({ id: "peer" })];
    const result = effect(
      roster,
      {
        kind: "card",
        id: subject.id,
        card: { kind: "habit", traitTo: ["nationalist"] },
      },
      { subjectHorizon: 3 },
    );
    expect(result.self.pct).toBeCloseTo(0.068, 10);
    expect(result.self.pctDays).toEqual([
      expect.closeTo(0.068, 10),
      expect.closeTo(0.058, 10),
      expect.closeTo(0.058, 10),
    ]);
    const unchanged = effect(roster, drill(subject.id, "luck", 1), {
      subjectHorizon: 3,
    });
    const mean = averageTeamEffects([
      { result, prob: 0.25 },
      { result: unchanged, prob: 0.75 },
    ]);
    expect(mean.self.pctDays).toEqual([
      expect.closeTo(0.017, 10),
      expect.closeTo(0.0145, 10),
      expect.closeTo(0.0145, 10),
    ]);
    expect(mean.self.pct).toBeCloseTo(mean.self.pctDays[0], 10);
  });
  it("ends both Mentor effects when the weaker worker trains to equality", () => {
    const mentor = member({
      id: "mentor",
      baseP: 4,
      P: 3,
      traits: ["mentor"],
      productionContributions: { mentor: -1 },
    });
    const weak = member({
      id: "weak",
      baseP: 2,
      P: 4,
      productionContributions: { mentor: 2 },
    });
    const result = effect([mentor, weak], drill("weak", "production", 2), {
      subjectHorizon: 1,
    });
    expect(result.self.prod).toBe(-2);
    expect(result.others[0].after.P).toBe(4);
    expect(result.team).toBeCloseTo(6 * 0.1012, 10);
    expect(result.checks).toEqual([]);
    const hired = effect(
      [member({ baseP: 2 })],
      hire({ baseP: 4, traits: ["mentor"] }),
      { subjectHorizon: 1 },
    );
    expect(hired.self.prod).toBe(-1);
    expect(hired.others[0].after.P).toBe(5);
    expect(hired.team).toBeCloseTo(12 * 0.1012, 10);
  });

  it("removes a Loner's 100% and +5 happiness", () => {
    const loner = member({
      traits: ["loner"],
      items: [{ delta: 5, until: null }],
      happiness: 55,
      bonus: 105,
    });
    const result = effect([loner], hire(), { subjectHorizon: 1 });
    expect(result.others[0].after.happiness).toBe(50);
    expect(result.others[0].after.bonus).toBe(0);
    expect(result.team).toBeCloseTo(-18 * 1.05 * 0.1012, 10);
    expect(effect([], hire({ traits: ["loner"] })).self.pct).toBe(1.05);
  });

  it("lifts Sociable out of alone and caps his bonus at 50%", () => {
    const sociable = member({
      traits: ["sociable"],
      items: [{ delta: -10, until: null }],
      happiness: 41,
      bonus: -9,
    });
    const first = effect([sociable], hire(), { subjectHorizon: 1 });
    expect(first.others[0].after.happiness).toBe(50);
    expect(first.others[0].after.bonus).toBe(25);
    expect(first.team).toBeCloseTo(18 * 0.34 * 0.1012, 10);
    const peers = [member({ id: "b" }), member({ id: "c" })];
    const capped = effect(
      [member({ traits: ["sociable"], bonus: 50 }), ...peers],
      hire(),
    );
    expect(capped.team).toBe(0);
    expect(effect(peers, hire({ traits: ["sociable"] })).self.pct).toBe(0.5);
  });

  it("caps Envious at two better-paid coworkers", () => {
    const envious = member({ traits: ["envious"] });
    const first = effect([envious], hire({ wageHour: 0.06 }), {
      subjectHorizon: 1,
    });
    expect(first.others[0].after.happiness).toBe(45.5);
    expect(first.team).toBeCloseTo(-18 * 0.045 * 0.1012, 10);
    const already = {
      ...envious,
      happiness: 41,
      bonus: -9,
      items: [{ delta: -10, until: null }],
    };
    expect(
      effect(
        [
          already,
          member({ id: "b", wageHour: 0.06 }),
          member({ id: "c", wageHour: 0.07 }),
        ],
        hire({ wageHour: 0.08 }),
      ).team,
    ).toBe(0);
    const second = effect(
      [
        {
          ...envious,
          happiness: 45.5,
          bonus: -4.5,
          items: [{ delta: -5, until: null }],
        },
        member({ id: "b", wageHour: 0.06 }),
      ],
      hire({ wageHour: 0.07 }),
      { subjectHorizon: 1 },
    );
    expect(second.others[0].after.happiness).toBe(41);
    expect(second.team).toBeCloseTo(first.team, 10);
  });

  it("switches both Prima Donna parts off for a better-paid hire; ties stay highest", () => {
    const prima = member({
      traits: ["primaDonna"],
      items: [{ delta: -10, until: null }],
      happiness: 41,
      bonus: 11,
    });
    const result = effect([prima], hire({ wageHour: 0.06 }), {
      subjectHorizon: 1,
    });
    expect(result.others[0].after.happiness).toBe(50);
    expect(result.others[0].after.bonus).toBe(0);
    expect(result.team).toBeCloseTo(-18 * 0.11 * 0.1012, 10);
    expect(result.assumed.join(" ")).toMatch(/Prima Donna/);
    expect(effect([prima], hire({ wageHour: 0.05 })).team).toBe(0);
  });

  it.each([
    ["girlPower", "female", 0.15],
    ["bandOfBrothers", "male", 0.15],
    ["manHater", "male", -0.15],
    ["misogynist", "female", -0.15],
  ])("counts %s per coworker and caps it at two", (trait, gender, pct) => {
    const owner = member({ traits: [trait] });
    const first = effect([owner], hire({ gender }), { subjectHorizon: 1 });
    expect(first.team).toBeCloseTo(18 * pct * 0.1012, 10);
    expect(first.others[0].after.bonus).toBeCloseTo(100 * pct, 10);
    expect(
      effect(
        [
          member({ id: "b", gender }),
          member({ id: "c", gender }),
          member({ id: "d", gender }),
        ],
        hire({ traits: [trait] }),
      ).self.pct,
    ).toBeCloseTo(2 * pct, 10);
    const unknown = effect(
      [owner, member({ id: "b", gender })],
      hire({ gender: null }),
    );
    expect(unknown.team).toBe(0);
    expect(unknown.assumed.join(" ")).toMatch(/unknown.*gender.*skipped/i);
  });

  it("evaluates known nationalities, all coworkers for Nationalist and distinct others for Cosmopolitan", () => {
    const nationalist = member({
      traits: ["nationalist"],
      R: 3,
      shield: 0.3,
      happiness: 55,
      bonus: 5,
      items: [{ delta: 5, until: null }],
    });
    const result = effect(
      [nationalist, member({ id: "b" })],
      hire({ nationality: "foreign" }),
      { subjectHorizon: 1 },
    );
    expect(result.others[0].after.happiness).toBe(50);
    expect(result.others[0].after.bonus).toBe(0);
    expect(result.team).toBeCloseTo(-18 * 0.05 * 0.1012, 10);
    expect(result.assumed.join(" ")).toMatch(/Nationalist.*every/i);
    const xenophobe = effect(
      [member()],
      hire({ nationality: "foreign", traits: ["xenophobe"] }),
    );
    expect(xenophobe.self.prod).toBe(-2);
    expect(xenophobe.self.pct).toBeCloseTo(-0.045, 10);
    const cosmopolitan = effect(
      [
        member(),
        member({ id: "b", nationality: "third" }),
        member({ id: "c", nationality: "third" }),
      ],
      hire({ nationality: "foreign", traits: ["cosmopolitan"] }),
    );
    expect(cosmopolitan.self.prod).toBe(4);
    const unknown = effect(
      [nationalist, member({ id: "b" })],
      hire({ nationality: null }),
    );
    expect(unknown.team).toBe(0);
    expect(unknown.assumed.join(" ")).toMatch(/unknown.*nationality.*skipped/i);
  });

  it("applies habit replacement, Rehab and Clean slate as trait changes", () => {
    const bully = member({ traits: ["bully"], P: 5 });
    const peer = member({
      id: "b",
      happiness: 41,
      bonus: -9,
      items: [{ delta: -10, until: null }],
    });
    const replace = effect(
      [bully, peer],
      {
        kind: "card",
        id: "a",
        card: { kind: "habit", trait: "bully", traitTo: ["comic"] },
      },
      { subjectHorizon: 1 },
    );
    expect(replace.self.prod).toBe(-3);
    expect(replace.others[0].after.happiness).toBe(60);
    expect(replace.team).toBeCloseTo(18 * 0.19 * 0.1012, 10);
    for (const card of [
      { kind: "rehab", trait: "bully" },
      { kind: "cleanSlate", traits: ["bully"] },
    ]) {
      const result = effect(
        [bully, peer],
        { kind: "card", id: "a", card },
        { subjectHorizon: 1 },
      );
      expect(result.self.prod).toBe(-2);
      expect(result.others[0].after.happiness).toBe(50);
      expect(result.team).toBeCloseTo(18 * 0.09 * 0.1012, 10);
    }
  });

  it("uses base wage for Negotiation and recomputes wage comparisons after a Production drill", () => {
    const worker = member({ id: "paid", wageHour: 0.1 });
    const envious = member({
      traits: ["envious"],
      wageHour: 0.099,
      happiness: 45.5,
      bonus: -4.5,
      items: [{ delta: -5, until: null }],
    });
    const result = effect(
      [worker, envious],
      { kind: "card", id: "paid", card: { kind: "negotiation", delta: 10 } },
      { subjectHorizon: 1 },
    );
    expect(result.self.prod).toBe(0);
    expect(result.self.pct).toBe(0);
    expect(result.others[0].after.happiness).toBe(50);
    expect(result.team).toBeCloseTo(18 * 0.045 * 0.1012, 10);
    const drilled = effect(
      [
        member({ id: "paid", baseP: 2, wageHour: 0.04 }),
        member({ traits: ["envious"], wageHour: 0.05 }),
      ],
      drill("paid", "production", 1),
      { subjectHorizon: 1 },
    );
    expect(drilled.team).toBeCloseTo(-18 * 0.045 * 0.1012, 10);
  });

  it("names Luck, Trainer and partners without pricing them", () => {
    const result = effect(
      [member()],
      hire({
        traits: [
          "luckyCharm",
          "jinx",
          "trainer",
          "oldFriends",
          "nemesis",
          "sweethearts",
        ],
      }),
    );
    expect(result.team).toBe(0);
    expect(result.self.prod).toBe(0);
    expect(result.self.pct).toBe(0);
    expect(result.others[0].why.join(" ")).toMatch(
      /Luck.*3.*Luck.*2.*training/i,
    );
    expect(result.self.why.join(" ")).toMatch(
      /Old Friends.*Nemesis.*Sweethearts/,
    );
  });

  it("combines a hire's own conditions with incoming Bully, Foreman and Mentor effects", () => {
    const roster = [
      member({ id: "bully", traits: ["bully"] }),
      member({ id: "foreman", traits: ["foreman"] }),
      member({ id: "mentor", baseP: 4, traits: ["mentor"] }),
    ];
    const result = effect(
      roster,
      hire({ nationality: "foreign", traits: ["xenophobe"] }),
    );
    expect(result.self.prod).toBe(0); // Mentor +2, Xenophobe −2.
    expect(result.self.pct).toBeCloseTo((-15 * 0.6) / 100, 10);
    expect(result.team).toBe(0);
    expect(
      effect([member()], hire({ traits: ["primaDonna"], wageHour: 0.1 })).self
        .pct,
    ).toBeCloseTo(0.11, 10);
  });

  it("caps shields at one and reverses a Foreman's shield when Rehab removes it", () => {
    const full = effect(
      [
        member({
          R: 9,
          shield: 0.9,
          happiness: 49,
          bonus: -1,
          items: [{ delta: -10, until: null }],
        }),
      ],
      hire({ traits: ["foreman"] }),
      { subjectHorizon: 1 },
    );
    expect(full.others[0].after.happiness).toBe(50);
    expect(full.team).toBeCloseTo(18 * 0.01 * 0.1012, 10);
    const foreman = member({ id: "foreman", traits: ["foreman"] });
    const peer = member({
      R: 4,
      shield: 0.4,
      items: [{ delta: -10, until: null }],
      happiness: 44,
      bonus: -6,
    });
    const removed = effect(
      [foreman, peer],
      {
        kind: "card",
        id: "foreman",
        card: { kind: "rehab", trait: "foreman" },
      },
      { subjectHorizon: 1 },
    );
    expect(removed.others[0].after.happiness).toBe(41);
    expect(removed.team).toBeCloseTo(-18 * 0.03 * 0.1012, 10);
    const direct = effect([peer], drill("a", "responsibility", 2));
    expect(direct.self.prod).toBe(0);
    expect(direct.self.pct).toBe(0);
    expect(direct.team).toBe(0);
  });

  it("grows specialization to its cap for a flat Production delta", () => {
    const rival = member({
      traits: ["rival"],
      P: 2,
      bonus: 18,
      spec: 18,
      productionContributions: { rival: -1 },
    });
    const result = effect([rival], hire({ baseP: 5 }), {
      subjectHorizon: 4,
      valuePerPoint: 1,
    });
    expect(result.team).toBeCloseTo(24 * (1.18 + 1.19 + 1.2 + 1.2), 10);
    expect(result.others[0].days).toBe(4);
  });

  it("expires hand-built members' positive and negative items on both sides", () => {
    const moved = member({
      items: [
        { delta: -5, until: now + 0.5 * 86400000 },
        { delta: 5, until: now + 1.5 * 86400000 },
      ],
      happiness: 50.5,
      bonus: 0.5,
    });
    const result = effect([moved], hire({ traits: ["bully"] }), {
      subjectHorizon: 3,
    });
    expect(result.others[0].after.happiness).toBe(41.5);
    expect(result.team).toBeCloseTo(-3 * 18 * 0.09 * 0.1012, 10);
  });

  it("prices the subject's shield change only on unexpired items", () => {
    const subject = member({
      traits: [],
      items: [
        { delta: -4, until: null },
        { delta: -5, until: now - 1 },
      ],
      happiness: 46.4,
      bonus: -3.6,
    });
    const result = effect([subject, member({ id: "peer" })], {
      kind: "card",
      id: "a",
      card: { kind: "habit", traitTo: ["nationalist"] },
    });
    expect(result.self.prod).toBe(0);
    expect(result.self.pct).toBeCloseTo((5 + 4 * 0.2) / 100, 10);
  });

  it("names an unreadable Mentor condition without reporting a false server disagreement", () => {
    const mentor = member({
      id: "mentor",
      baseP: null,
      traits: ["mentor"],
      productionContributions: { mentor: -1 },
    });
    const lifted = member({ P: 5, productionContributions: { mentor: 2 } });
    const result = effect([mentor, lifted], hire());
    expect(result.team).toBe(0);
    expect(result.checks).toHaveLength(0);
    expect(result.assumed.join(" ")).toMatch(/Mentor.*unknown base Production/);
  });

  it("keeps unknown state null, respects zero horizons, and leaves inputs unchanged", () => {
    const roster = rosterOf(employees, company, now);
    const snapshot = structuredClone(roster);
    expect(effect(roster, hire()).team).toBe(0);
    expect(effect(roster, hire()).others).toHaveLength(0);
    expect(effect([], hire()).self.prod).toBe(0);
    expect(effect([], hire()).team).toBe(0);
    const zero = effect(roster, hire({ traits: ["bully"] }), {
      subjectHorizon: 0,
    });
    expect(zero.team).toBe(0);
    expect(zero.others[0].days).toBe(0);
    expect(
      effect([member({ horizon: 0 })], hire({ traits: ["bully"] })).team,
    ).toBe(0);
    const missing = effect(
      [memberOf({ _id: "missing" }, now)],
      hire({ traits: ["bully"] }),
    );
    expect(missing.others[0].after.happiness).toBeNull();
    expect(missing.others[0].gold).toBeNull();
    expect(missing.team).toBe(0);
    expect(JSON.stringify(missing)).not.toMatch(/NaN/);
    expect(roster).toEqual(snapshot);
  });

  it("exports the 23 rules and the named model constants", () => {
    expect(Object.keys(TEAM_RULES)).toHaveLength(23);
    expect(TEAM_RULES.rival.effect.deltaWhenUnmet).toBe(-1);
    expect(TEAM_RULES.sociable.effect.happinessWhenAlone).toBe(-10);
    expect(TEAM_RULES.foreman.effect.coworkerResponsibility).toBe(3);
    expect(TEAM_RULES.trainer.priced).toBe(false);
    expect(SHIELD_PER_RESPONSIBILITY).toBe(0.1);
    expect(HAPPINESS_NEUTRAL).toBe(50);
    expect(POINTS_PER_PRODUCTION_HOUR).toBe(0.25);
  });
});
