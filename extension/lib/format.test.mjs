import { describe, it, expect } from "vitest";
import { gold, ordinal, signedGold } from "./format.mjs";

describe("gold amounts", () => {
  it("prints whole gold from 100 up, one decimal from 10, two below", () => {
    expect(gold(5302.03)).toBe("5,302");
    expect(gold(482.6)).toBe("483");
    expect(gold(38.04)).toBe("38.0");
    expect(gold(3.862)).toBe("3.86");
    expect(gold(0)).toBe("0.00");
    expect(gold(null)).toBe("–");
    expect(gold(NaN)).toBe("–");
  });
  it("signs a result with a real minus sign", () => {
    expect(signedGold(-5302.03)).toBe("−5,302");
    expect(signedGold(138.2)).toBe("+138");
    expect(signedGold(-2.444)).toBe("−2.44");
    expect(signedGold(null)).toBe("–");
  });
});

describe("ordinals", () => {
  it("rounds a percentile and gives it its English suffix, the teens with th", () => {
    expect(
      [
        0, 1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31.25, 99.6, 100, 101, 111, 112,
      ].map(ordinal),
    ).toEqual([
      "0th",
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
      "23rd",
      "31st",
      "100th",
      "100th",
      "101st",
      "111th",
      "112th",
    ]);
  });
});
