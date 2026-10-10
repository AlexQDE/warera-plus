import { describe, it, expect } from "vitest";
import {
  tileStats,
  tileCode,
  pieceKey,
  heldIndex,
  tileSource,
} from "./picker.mjs";

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
