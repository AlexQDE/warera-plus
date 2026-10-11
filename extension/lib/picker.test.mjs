import { describe, it, expect } from "vitest";
import {
  tileStats,
  tileCode,
  pieceKey,
  heldIndex,
  tileSource,
  statOrder,
  sortGroups,
  meetsFilter,
} from "./picker.mjs";

describe("ordering the pieces by their stats", () => {
  const sniper = (index, attack, criticalChance) => ({
    index,
    skills: { attack, criticalChance },
  });
  it("orders a weapon by crit, then by attack, both from the highest", () => {
    expect(statOrder("sniper")).toEqual(["criticalChance", "attack"]);
    expect(statOrder("boots5")).toEqual(["dodge"]);
    expect(statOrder("nope")).toEqual([]);
    const groups = sortGroups("sniper", [
      sniper(0, 110, 19),
      sniper(1, 130, 20),
      sniper(2, 121, 20),
      sniper(3, 128, 20),
      sniper(4, 129, 19),
      sniper(5, 126, 18),
    ]);
    expect(groups.map((g) => g.value)).toEqual([20, 19, 18]);
    expect(groups[0].pieces.map((p) => p.skills.attack)).toEqual([
      130, 128, 121,
    ]);
    expect(groups[1].pieces.map((p) => p.skills.attack)).toEqual([129, 110]);
  });
  it("orders a piece of one stat by that stat, from the highest, in one group", () => {
    const boots = (index, dodge) => ({ index, skills: { dodge } });
    const groups = sortGroups("boots5", [
      boots(0, 33),
      boots(1, 38),
      boots(2, 35),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].pieces.map((p) => p.skills.dodge)).toEqual([38, 35, 33]);
  });
  it("tells which pieces the market's minimum-stat filter lets through; an empty field filters nothing", () => {
    const skills = { attack: 121, criticalChance: 20 };
    expect(meetsFilter(skills, { criticalChance: 20, attack: 120 })).toBe(true);
    expect(meetsFilter(skills, { criticalChance: 20, attack: 125 })).toBe(
      false,
    );
    expect(meetsFilter(skills, { criticalChance: 20 })).toBe(true);
    expect(meetsFilter(skills, {})).toBe(true);
  });
});

describe("reading a picker tile", () => {
  it("takes the last percentage as the durability and every number before it as a stat", () => {
    // tiles as the v0.27 picker printed them on 2026-10-10
    expect(tileStats(["270", "50%", "100%"])).toEqual({
      stats: [270, 50],
      durability: 100,
    });
    expect(tileStats(["59%", "100%"])).toEqual({
      stats: [59],
      durability: 100,
    });
    expect(tileStats(["70", "100%"])).toEqual({ stats: [70], durability: 100 });
    expect(tileStats(["270"])).toBeNull(); // no durability: not a tile we can read
    expect(tileStats(["x", "100%"])).toBeNull();
  });
  it("names the item from its slot and, for armour, the tier its stat falls in", () => {
    expect(tileCode("jet", [270, 50])).toBe("jet");
    expect(tileCode("chest", [70])).toBe("chest6");
    expect(tileCode("chest", [46])).toBe("chest5");
    expect(tileCode("gloves", [59])).toBe("gloves6");
    expect(tileCode("chest", [9999])).toBeNull();
    expect(tileCode(null, [1])).toBeNull();
  });
});

describe("matching tiles to the pieces the player holds", () => {
  const held = [
    {
      code: "jet",
      skills: { criticalChance: 50, attack: 270 },
      source: "crafted",
      cost: 380,
    },
    {
      code: "gun",
      skills: { attack: 59, criticalChance: 10 },
      source: "bought",
      cost: 4,
    },
    {
      code: "gun",
      skills: { attack: 59, criticalChance: 10 },
      source: "looted",
      cost: 0,
    },
    {
      code: "gun",
      skills: { attack: 59, criticalChance: 10 },
      source: "bought",
      cost: 4,
    },
  ];
  it("keys a piece by its code and stats whatever the order of the stats", () => {
    expect(pieceKey("jet", { attack: 270, criticalChance: 50 })).toBe(
      pieceKey("jet", { criticalChance: 50, attack: 270 }),
    );
    expect(pieceKey("jet", null)).toBeNull();
  });
  it("finds the source of a tile, and every source when identical pieces came different ways", () => {
    const index = heldIndex(held);
    expect(tileSource(index, "jet", [270, 50])).toMatchObject({
      sources: ["crafted"],
      pieces: [held[0]],
    });
    const guns = tileSource(index, "gun", [59, 10]);
    expect(guns.sources).toEqual(["bought", "looted"]);
    expect(guns.pieces).toHaveLength(3);
    expect(tileSource(index, "jet", [221, 41])).toMatchObject({
      sources: [],
      pieces: [],
    });
    expect(tileSource(index, "jet", [270])).toBeNull(); // the crit was not read
  });
});
