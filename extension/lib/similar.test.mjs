import { describe, it, expect } from "vitest";
import {
  similarValue,
  rowSkills,
  statDistance,
  spanWords,
  listedPeers,
  statSlopes,
  windowFills,
  marketTrend,
  offerCap,
  MIN_SLOPE_PAIRS,
  MIN_TREND_SALES,
  MIN_TREND_DAYS,
  MAX_TREND_DROP,
  TREND_SALES,
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

describe("offerCap", () => {
  const offer = (price, attack, crit, code = "sniper") => ({
    code,
    price,
    skills: { attack, criticalChance: crit },
  });
  const piece = { attack: 110, criticalChance: 18 };
  it("caps a resale at the second cheapest other offer whose every stat is at least the piece's, before tax", () => {
    const rows = [
      offer(40, 110, 18), // the piece itself: never its own competition
      offer(44, 109, 20), // a lower attack: not as good, whatever its crit
      offer(46, 110, 18), // the same roll
      offer(47, 112, 17), // a lower crit
      offer(48, 125, 19), // better in both
      offer(41, 130, 20, "jet"), // another item
      {
        code: "sniper",
        price: null,
        skills: { attack: 130, criticalChance: 20 },
      }, // an own offer: no price
      offer(52, 115, 18),
    ];
    // as good or better: 46, 48, 52; the second cheapest is 48, over the page's 2% tax
    expect(offerCap("sniper", piece, rows, 0, 2)).toEqual({
      cap: 48 / 1.02,
      offer: 48,
      n: 3,
      taxRead: true,
    });
    // at 0% the card's price is the seller's
    expect(offerCap("sniper", piece, rows, 0, 0)?.cap).toBe(48);
  });
  it("caps nothing below two such offers, and takes a rate the page did not give as none", () => {
    expect(
      offerCap("sniper", piece, [offer(40, 110, 18), offer(46, 110, 18)], 0, 2),
    ).toBeNull();
    const rows = [offer(40, 110, 18), offer(46, 111, 18), offer(48, 110, 19)];
    expect(offerCap("sniper", piece, rows, 0, null)).toMatchObject({
      cap: 48,
      taxRead: false,
    });
    expect(offerCap("sniper", null, rows, 0, 2)).toBeNull(); // stats unread: nothing to compare
  });
});

describe("what a stat is worth, and sales brought to the piece's stats", () => {
  // A week of jet sales: attack 221-300 pays (the whole range is worth e^0.6, +82%), crit pays nothing.
  const jets = (n, worth = (atk) => 300 * Math.exp(0.6 * ((atk - 221) / 79))) =>
    Array.from({ length: n }, (_, i) => {
      const attack = 221 + ((i * 37) % 80);
      const crit = 41 + ((i * 7) % 10);
      return {
        price: worth(attack),
        at: iso(i * 0.4),
        code: "jet",
        skills: { attack, criticalChance: crit },
      };
    });
  it("reads each stat's worth off pairs of sales: attack pays here, crit does not", () => {
    const slopes = statSlopes("jet", jets(120));
    expect(slopes.attack).toBeCloseTo(0.6, 6);
    expect(slopes.criticalChance).toBeCloseTo(0, 6);
    // the same list is worked out once
    const fills = jets(120);
    expect(statSlopes("jet", fills)).toBe(statSlopes("jet", fills));
  });
  it("prices a top roll by the lower rolls it is grouped with no more: each sale is brought to its stats", () => {
    const fills = jets(120);
    const top = { attack: 300, criticalChance: 45 };
    const worth = 300 * Math.exp(0.6);
    const plain = sv("jet", top, fills, { adjust: false });
    const adjusted = sv("jet", top, fills);
    expect(plain.level).toBe(adjusted.level);
    expect(plain.value).toBeLessThan(worth * 0.97); // the sales alike are lower rolls, on the whole
    expect(adjusted.value).toBeCloseTo(worth, 6);
    expect(adjusted.adjusted).toBe(true);
    expect(adjusted.detail).toContain("brought to these stats");
    // and a bottom roll by the higher ones it is grouped with
    const bottom = sv("jet", { attack: 221, criticalChance: 45 }, fills);
    expect(bottom.value).toBeCloseTo(300, 6);
  });
  it("adjusts nothing on a market where stats do not pay, on a thin one, or where a better roll sold for less", () => {
    const flat = jets(120, () => 400);
    expect(statSlopes("jet", flat)).toEqual({ attack: 0, criticalChance: 0 });
    const piece = { attack: 290, criticalChance: 45 };
    expect(sv("jet", piece, flat)).toMatchObject({
      value: 400,
      adjusted: false,
    });
    // fewer pairs than MIN_SLOPE_PAIRS: no worth is read
    const thin = jets(6);
    expect(MIN_SLOPE_PAIRS).toBeGreaterThan(15);
    expect(statSlopes("jet", thin).attack).toBe(0);
    // better rolls selling for less is noise, never a reason to price a better roll down
    const odd = jets(120, (atk) => 600 - atk);
    expect(statSlopes("jet", odd).attack).toBe(0);
    // the item's own median (any stats) is never adjusted
    const any = sv("jet", { attack: 300, criticalChance: 50 }, jets(5));
    expect(any).toMatchObject({ level: "item", adjusted: false });
  });
  it("cuts an item's sales read to the week once a minute, shared by every caller", () => {
    const sales = {
      code: "jet",
      fills: [
        { price: 1, at: iso(1), code: "jet" },
        { price: 2, at: iso(200), code: "jet" },
        { price: 3, at: iso(2), code: "tank" },
      ],
    };
    const a = windowFills(sales, NOW);
    expect(a.map((f) => f.price)).toEqual([1]);
    expect(windowFills(sales, NOW + 30_000)).toBe(a);
    expect(windowFills(sales, NOW + 61_000)).not.toBe(a);
    expect(windowFills(null, NOW)).toEqual([]);
  });
});

describe("the market's fall, and sales brought to today", () => {
  // A week of jets, three rolls a day (2, 9 and 16 hours into each day back), stats paying nothing; a sale
  // d days old sold at level(d). The piece's roll sells once a day, so its value reaches back 72 hours.
  const ROLLS = [
    { attack: 260, criticalChance: 45 },
    { attack: 230, criticalChance: 42 },
    { attack: 290, criticalChance: 48 },
  ];
  const piece = ROLLS[0];
  const week = (level, days = 7) =>
    Array.from({ length: days * 3 }, (_, i) => {
      const hours = Math.floor(i / 3) * 24 + 2 + (i % 3) * 7;
      return {
        price: level(hours / 24),
        at: iso(hours),
        code: "jet",
        skills: ROLLS[i % 3],
      };
    });
  const falling = (d) => 400 / 0.96 ** d; // 4% a day, 400 today
  it("reads the week's fall off the sales and brings each sale alike down to today's level", () => {
    const fills = week(falling);
    const trend = marketTrend("jet", fills);
    expect(trend.perDay).toBeCloseTo(-0.04, 9);
    expect(trend).toMatchObject({ n: 21, days: 7 });
    expect(marketTrend("jet", fills)).toBe(trend); // worked out once per list
    const v = sv("jet", piece, fills);
    expect(v).toMatchObject({ level: "same", n: 3, hours: 72 });
    expect(v.value).toBeCloseTo(400, 6);
    expect(v.trend).toBeCloseTo(-0.04, 9);
    // as it was: the median of the three is the one a day and 2 hours old, 4.5% above today
    const plain = sv("jet", piece, fills, { trend: false });
    expect(plain.value).toBeCloseTo(falling(26 / 24), 6);
    expect(plain.trend).toBeNull();
  });
  it("reads a busy market's fall over its last three days, not over its newest day or two", () => {
    // 1,000 sales in the week, one every 10 minutes: the newest 200 sold within 34 hours, 429 within 72
    const fills = Array.from({ length: 1000 }, (_, i) => ({
      price: falling((i * 0.168) / 24),
      at: iso(i * 0.168),
      code: "jet",
      skills: ROLLS[i % 3],
    }));
    const trend = marketTrend("jet", fills);
    expect(trend).toMatchObject({ n: TREND_SALES, days: 3 });
    expect(trend.perDay).toBeCloseTo(-0.04, 9);
  });
  it("reads a fall of the last three days after a flat week: the steeper of the week's slope and theirs", () => {
    // flat from 3 days back, then 8% a day: over the week the flat days' pairs outnumber the fall's
    const fills = week((d) => 400 / 0.92 ** Math.min(3, d));
    const trend = marketTrend("jet", fills);
    expect(trend).toMatchObject({ n: 21, days: 7 });
    expect(trend.perDay).toBeCloseTo(-0.08, 9);
    // a week flat but for its last three days rising lifts nothing, as any rise
    const rose = week((d) => 400 * 0.92 ** Math.min(3, d));
    expect(marketTrend("jet", rose).perDay).toBe(0);
    // a week that fell 8% a day and held its last three days: the week's slope is the steeper
    const held = marketTrend(
      "jet",
      week((d) => 400 / 0.92 ** Math.max(0, d - 3)),
    );
    expect(held.perDay).toBeLessThan(-0.04);
    expect(held.perDay).toBeGreaterThan(-0.08);
  });
  it("lifts no sale when the market rose, and takes a fall steeper than 10% a day as 10%", () => {
    const rising = week((d) => 400 * 0.96 ** d);
    expect(marketTrend("jet", rising).perDay).toBe(0);
    const v = sv("jet", piece, rising);
    expect(v.trend).toBeNull();
    expect(v.value).toBe(sv("jet", piece, rising, { trend: false }).value);
    const crash = week((d) => 400 / 0.8 ** d); // 20% a day
    expect(marketTrend("jet", crash).perDay).toBeCloseTo(-MAX_TREND_DROP, 9);
    // brought down 10% a day only: still above today's 400
    expect(sv("jet", piece, crash).value).toBeCloseTo(
      400 * (0.9 / 0.8) ** (26 / 24),
      6,
    );
  });
  it("corrects nothing below eight sales, or on fewer than three days", () => {
    expect(MIN_TREND_SALES).toBe(8);
    expect(MIN_TREND_DAYS).toBe(3);
    const seven = week(falling).filter((f) => f.skills === piece); // one a day
    expect(marketTrend("jet", seven)).toMatchObject({ perDay: 0, n: 7 });
    const twoDays = week(falling, 2); // six sales on two days
    expect(marketTrend("jet", twoDays)).toMatchObject({ perDay: 0, days: 2 });
    const burst = [...twoDays, ...week(falling, 2)]; // twelve sales, still two days
    expect(marketTrend("jet", burst)).toMatchObject({ perDay: 0, n: 12 });
  });
  it("takes the stats off first: a week that sold worse rolls later reads as no fall", () => {
    // A flat market where attack pays (its whole range e^0.6): the oldest sales are the best rolls, so the
    // prices as they are fall through the week; brought to one roll, they do not move.
    const fills = Array.from({ length: 200 }, (_, i) => {
      const hours = i * 0.84;
      const attack = Math.min(
        300,
        Math.max(
          221,
          221 + Math.round((79 * hours) / 168) + ((i * 7) % 11) - 5,
        ),
      );
      return {
        price: 300 * Math.exp((0.6 * (attack - 221)) / 79),
        at: iso(hours),
        code: "jet",
        skills: { attack, criticalChance: 45 },
      };
    });
    const median = (xs) => [...xs].sort((a, b) => a - b)[xs.length >> 1];
    const today = median(fills.slice(0, 28).map((f) => f.price));
    const weekAgo = median(fills.slice(-28).map((f) => f.price));
    expect(today).toBeLessThan(weekAgo * 0.7);
    expect(statSlopes("jet", fills).attack).toBeCloseTo(0.6, 6);
    expect(marketTrend("jet", fills).perDay).toBe(0);
    const v = sv("jet", piece, fills);
    expect(v.trend).toBeNull();
    expect(v.value).toBe(sv("jet", piece, fills, { trend: false }).value);
  });
  it("never brings the item's own median down: only sales alike are", () => {
    const any = sv("jet", { attack: 221, criticalChance: 50 }, week(falling));
    expect(any).toMatchObject({ level: "item", trend: null });
    expect(any.value).toBe(
      sv("jet", { attack: 221, criticalChance: 50 }, week(falling), {
        trend: false,
      }).value,
    );
  });
});
