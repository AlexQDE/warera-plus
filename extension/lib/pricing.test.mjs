import { describe, it, expect } from "vitest";
import { suggestPrice, ageMinutes } from "./pricing.mjs";

const NOW = Date.parse("2026-10-10T20:00:00Z");
const hoursAgo = (h) => new Date(NOW - h * 3600e3).toISOString();
const boots = (price, dodge, h) => ({
  price,
  at: hoursAgo(h),
  skills: { dodge },
});
const ask = (price, dodge, ageMin) => ({ price, skills: { dodge }, ageMin });

describe("reading a listing's age", () => {
  it("reads the row's age token in minutes", () => {
    expect(ageMinutes("7m")).toBe(7);
    expect(ageMinutes("3h47m")).toBe(227);
    expect(ageMinutes("12h ago")).toBe(720);
    expect(ageMinutes("2d")).toBe(2880);
    expect(ageMinutes("1d3h")).toBe(1620);
    expect(ageMinutes("100%")).toBeNull();
    expect(ageMinutes("32")).toBeNull();
    expect(ageMinutes("m")).toBeNull();
  });
});

describe("suggesting a price", () => {
  it("lists first in line when fresh asks of the same stats sit above what sold: prices are rising", () => {
    // what sold today at dodge 32 is lower than what is listed now, and the cheapest ask is ten minutes old
    const fills = [185, 184, 186, 183, 187].map((p, i) => boots(p, 32, i + 1));
    const s = suggestPrice({
      code: "boots5",
      skills: { dodge: 32 },
      fills,
      asks: [ask(192, 32, 10), ask(198, 32, 5), ask(205, 32, 20)],
      now: NOW,
    });
    expect(s.price).toBe(191.999);
    expect(s.why).toBe("first in line");
    expect(s.rising).toBe(true);
    expect(s.sold).toMatchObject({
      value: 185,
      n: 5,
      level: "same",
      hours: 24,
    });
    expect(s.floor).toEqual({ price: 192, ageMin: 10 });
  });
  it("keeps to what sells when the cheapest ask is well under it, and offers the quick price beside", () => {
    const fills = [200, 201, 199].map((p, i) => boots(p, 32, i + 1));
    const s = suggestPrice({
      code: "boots5",
      skills: { dodge: 32 },
      fills,
      asks: [ask(170, 32, 180)],
      now: NOW,
    });
    expect(s.price).toBe(200);
    expect(s.why).toBe("what sells; the cheapest ask is under it");
    expect(s.fast).toBe(169.999);
  });
  it("reads the trend as today's sales against the week's", () => {
    const fills = [
      ...[220, 221, 219].map((p, i) => boots(p, 32, i + 1)),
      ...[200, 199, 201, 200].map((p, i) => boots(p, 32, 30 + i * 10)),
    ];
    const s = suggestPrice({
      code: "boots5",
      skills: { dodge: 32 },
      fills,
      asks: [],
      now: NOW,
    });
    expect(s.trend).toBeCloseTo(0.1, 6);
    expect(s.rising).toBe(true);
    expect(s.price).toBe(220);
    expect(s.why).toBe("what sells");
  });
  it("stays inside the range the game allows, and falls back to the game's own estimate", () => {
    const fills = [300, 301, 299].map((p, i) => boots(p, 32, i + 1));
    const game = { suggested: 504.177, min: 353, max: 806.5 };
    const low = suggestPrice({
      code: "boots5",
      skills: { dodge: 32 },
      fills,
      asks: [],
      now: NOW,
      game,
    });
    expect(low.price).toBe(353);
    expect(low.clamped).toBe(true);
    const none = suggestPrice({
      code: "boots5",
      skills: { dodge: 32 },
      fills: [],
      asks: [],
      now: NOW,
      game,
    });
    expect(none.price).toBe(504.177);
    expect(none.why).toBe("the game's estimate");
  });
  it("ignores asks of other stats", () => {
    const fills = [185, 184, 186].map((p, i) => boots(p, 32, i + 1));
    const s = suggestPrice({
      code: "boots5",
      skills: { dodge: 32 },
      fills,
      asks: [ask(150, 25, 3)], // dodge 25 is another roll
      now: NOW,
    });
    expect(s.floor).toBeNull();
    expect(s.price).toBe(185);
  });
});
