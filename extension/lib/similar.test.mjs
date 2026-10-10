import { describe, it, expect } from "vitest";
import {
  similarValue,
  rowSkills,
  statDistance,
  spanWords,
  listedPeers,
} from "./similar.mjs";
import { STAT_RANGES } from "./stats.mjs";

const NOW = Date.parse("2026-10-07T12:00:00Z");
const iso = (hoursAgo = 0) => new Date(NOW - hoursAgo * 3600e3).toISOString();
const sniper = (price, attack, crit, i = 0, wait = null) => ({
  price,
  at: iso(i + 1),
  code: "sniper",
  skills: { attack, criticalChance: crit },
  listedAt: wait == null ? null : iso(i + 1 + wait),
});
/** similarValue at the tests' clock. */
const sv = (code, skills, fills, options = {}) =>
  similarValue(code, skills, fills, { now: NOW, ...options });
const gloves = (price, precision, i = 0) => ({
  price,
  at: iso(i + 1),
  code: "gloves3",
  skills: { precision },
});

describe("rowSkills", () => {
  it("keys a weapon's two numbers as attack and crit, an armour slot's one as its stat", () => {
    expect(rowSkills("sniper", [101, 16])).toEqual({
      attack: 101,
      criticalChance: 16,
    });
    expect(rowSkills("gloves3", [12])).toEqual({ precision: 12 });
    expect(rowSkills("chest5", [46, 99])).toEqual({ armor: 46 });
    expect(rowSkills("sniper", [101])).toBeNull(); // the crit was not read: no match possible
    expect(rowSkills("sniper", [])).toBeNull();
    expect(rowSkills("mystery", [1])).toBeNull();
  });
});

describe("statDistance and spanWords", () => {
  it("measures each stat against its own range and takes the largest share", () => {
    const r = STAT_RANGES.sniper; // attack 101–130, crit 16–20
    expect(
      statDistance(
        r,
        { attack: 101, criticalChance: 16 },
        { attack: 101, criticalChance: 16 },
      ),
    ).toBe(0);
    expect(
      statDistance(
        r,
        { attack: 101, criticalChance: 16 },
        { attack: 130, criticalChance: 16 },
      ),
    ).toBe(1);
    // one crit point is a quarter of the crit range, more than three attack points
    expect(
      statDistance(
        r,
        { attack: 101, criticalChance: 16 },
        { attack: 104, criticalChance: 17 },
      ),
    ).toBeCloseTo(0.25, 6);
    expect(
      statDistance(r, { attack: 101, criticalChance: 16 }, { attack: 104 }),
    ).toBeNull();
    expect(spanWords({ attack: [101, 106], criticalChance: [16, 16] })).toBe(
      "atk 101–106 · crit 16%",
    );
    expect(spanWords({ precision: [12, 13] })).toBe("prec 12–13%");
    expect(spanWords({ armor: [46, 46] })).toBe("armor 46");
  });
});

describe("similarValue", () => {
  it("prices a sniper by sales of the same stats, naming the span and the wait", () => {
    const fills = [
      sniper(40, 101, 16, 0, 2),
      sniper(42, 103, 16, 1, 4),
      sniper(41, 102, 16, 2, 3),
      sniper(70, 128, 20, 3),
      sniper(72, 130, 20, 4),
      sniper(55, 115, 18, 5),
    ];
    const v = sv("sniper", { attack: 101, criticalChance: 16 }, fills, {
      now: NOW,
    });
    expect(v).toMatchObject({
      value: 41,
      level: "same",
      n: 3,
      matched: true,
      low: 40,
      high: 42,
      sellsHours: 3,
      label: "3 same · 24 h",
      detail: "3 sales · atk 101–103 · crit 16% · 24 h",
      hours: 24,
    });
    // the top roll is priced by its own neighbours, not by the cheap ones
    expect(
      sv("sniper", { attack: 130, criticalChance: 20 }, fills),
    ).toMatchObject({ value: 48.5, level: "item", matched: false }); // only two such sales: the item's any-stats median, unmatched
    const more = [...fills, sniper(71, 129, 20, 6)];
    expect(
      sv("sniper", { attack: 130, criticalChance: 20 }, more),
    ).toMatchObject({ value: 71, level: "same", n: 3 });
  });
  it("widens to similar stats at five sales, then to the item at five, never tagging the latter as matched", () => {
    const fills = [
      gloves(13, 12, 0),
      gloves(14, 13, 1),
      gloves(12, 11, 2),
      gloves(15, 12, 3),
      gloves(13.5, 13, 4),
      gloves(30, 15, 5),
    ];
    // precision 11–15: a tenth is 0.4 points, so only exact 12s are "same" (two of them); within 1.25 points there are five
    const v = sv("gloves3", { precision: 12 }, fills);
    expect(v).toMatchObject({
      level: "similar",
      n: 5,
      matched: true,
      value: 13.5,
      label: "5 similar · 24 h",
    });
    const far = sv("gloves3", { precision: 15 }, fills);
    expect(far).toMatchObject({ level: "item", n: 6, matched: false });
    expect(far.label).toBe("6 any · 24 h");
    expect(sv("gloves3", null, fills)).toMatchObject({
      level: "item",
      matched: false,
    });
    expect(sv("gloves3", { precision: 12 }, fills.slice(0, 4))).toMatchObject({
      value: null,
      level: null,
      n: 4,
      label: "4 sales · too few alike",
    });
    expect(sv("gloves3", { precision: 12 }, []).label).toBe("no sales in 7 d");
  });
  it("looks at the last 24 hours first and widens a day at a time up to 7 days only when they hold too few alike", () => {
    // two same-stats sales today, a third three days ago: not enough in 24 h or 2 d, enough in 3 d
    const fills = [
      sniper(40, 101, 16, 1),
      sniper(41, 101, 16, 5),
      sniper(60, 101, 16, 60),
      sniper(90, 128, 20, 2),
    ];
    const v = sv("sniper", { attack: 101, criticalChance: 16 }, fills, {
      now: NOW,
    });
    expect(v).toMatchObject({ level: "same", n: 3, hours: 72, value: 41 });
    expect(v.label).toBe("3 same · 3 d");
    // nothing alike in 7 days: the item's own sales, widened the same way
    const old = [1, 2, 3, 4, 5].map((i) => sniper(50 + i, 128, 20, 30 + i));
    expect(
      sv("sniper", { attack: 101, criticalChance: 16 }, old, {
        now: NOW,
      }),
    ).toMatchObject({ level: "item", n: 5, hours: 48, label: "5 any · 2 d" });
    // sales older than 7 days never count
    const stale = [1, 2, 3].map((i) => sniper(40, 101, 16, 170 + i));
    expect(
      sv("sniper", { attack: 101, criticalChance: 16 }, stale, {
        now: NOW,
      }).value,
    ).toBeNull();
  });
  it("rests on the 50 newest sales alike at most", () => {
    // 60 same-stats sales in the last day: the 10 oldest are dear and must not move the median
    const fills = Array.from({ length: 60 }, (_, i) =>
      sniper(i < 50 ? 40 : 400, 101, 16, i * 0.3),
    );
    const v = sv("sniper", { attack: 101, criticalChance: 16 }, fills, {
      now: NOW,
    });
    expect(v).toMatchObject({ level: "same", n: 50, value: 40, high: 40 });
    expect(v.label).toBe("50 same · 24 h");
  });
  it("ignores fills without stats for a stat match and fills without a price altogether", () => {
    const fills = [
      { price: 10, at: iso(1), code: "gloves3", skills: null },
      { price: 0, at: iso(2), code: "gloves3", skills: { precision: 12 } },
      gloves(13, 12, 3),
      gloves(13, 12, 4),
      gloves(13, 12, 5),
    ];
    expect(sv("gloves3", { precision: 12 }, fills)).toMatchObject({
      level: "same",
      n: 3,
      value: 13,
    });
  });
});

describe("listedPeers", () => {
  it("finds the other listings of the same item with the same stats and the cheapest of them", () => {
    const rows = [
      {
        code: "sniper",
        price: 40.4,
        skills: { attack: 101, criticalChance: 16 },
      },
      {
        code: "sniper",
        price: 40.499,
        skills: { attack: 105, criticalChance: 16 },
      },
      {
        code: "sniper",
        price: 38,
        skills: { attack: 102, criticalChance: 16 },
      },
      {
        code: "sniper",
        price: 90,
        skills: { attack: 130, criticalChance: 20 },
      },
      { code: "gloves3", price: 1, skills: { precision: 12 } },
      {
        code: "sniper",
        price: null,
        skills: { attack: 101, criticalChance: 16 },
      },
    ];
    expect(listedPeers("sniper", rows[0].skills, rows, 0)).toEqual({
      n: 1,
      cheapest: 38,
    }); // 105 is four points off, more than a tenth of 29; 130/20 is another roll; the unpriced row does not count
    expect(listedPeers("sniper", rows[3].skills, rows, 3)).toEqual({
      n: 0,
      cheapest: null,
    });
    expect(listedPeers("sniper", null, rows, 0)).toEqual({
      n: 0,
      cheapest: null,
    });
  });
});
