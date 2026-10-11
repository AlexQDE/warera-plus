// @ts-check
// The game's inventory picker ("+ NEW ITEM OFFER" -> a slot), read: which
// item a tile is and how the player got it. A tile prints its stats and its
// durability ("270 · 50% · 100%"); its image names the slot, and for armour
// the stat's value names the tier (the tiers' ranges do not overlap,
// docs/GAME-FACTS.md §4). The tile is then matched by code and stats to
// the pieces the player holds by their history: crafted, bought, opened
// from a case or looted. Pure; equipment.mjs renders the result.
import { STAT_RANGES } from "./stats.mjs";
import { WEAPONS } from "./items.mjs";
import { rowSkills } from "./similar.mjs";

const NUMBER = /^(\d+(?:\.\d+)?)(%?)$/;

/**
 * A tile's numbers off its text nodes, without reading layout: the game
 * prints every "%" in a node of its own, so it is joined to the number
 * before it ("270", "50", "%" -> "270", "50%"). Text the extension added is
 * left out.
 * @param {Element} el
 */
export function tileTokens(el) {
  /** @type {string[]} */
  const out = [];
  const walk = el.ownerDocument.createTreeWalker(el, 4 /* SHOW_TEXT */);
  while (walk.nextNode()) {
    const node = walk.currentNode;
    if (node.parentElement?.closest("[data-lens]")) continue;
    const v = String(node.nodeValue ?? "").trim();
    if (!v) continue;
    if (v === "%" && out.length) out[out.length - 1] += "%";
    else out.push(v);
  }
  return out;
}

/**
 * A tile's lines: the last percentage is the durability, every number
 * before it a stat. null when a line is not a number or no durability shows.
 * @param {ReadonlyArray<string>} lines
 */
export function tileStats(lines) {
  const tokens = lines.map((l) => String(l).trim()).filter(Boolean);
  const parsed = tokens.map((t) => NUMBER.exec(t));
  if (!parsed.length || parsed.some((m) => !m)) return null;
  const last = /** @type {RegExpExecArray} */ (parsed[parsed.length - 1]);
  if (last[2] !== "%" || parsed.length < 2) return null;
  return {
    stats: parsed
      .slice(0, -1)
      .map((m) => Number(/** @type {RegExpExecArray} */ (m)[1])),
    durability: Number(last[1]),
  };
}

/**
 * The item code of a tile: a weapon's name is its tier; an armour slot's
 * tier is the one whose range holds its stat.
 * @param {string | null | undefined} slot @param {ReadonlyArray<number> | null | undefined} stats
 */
export function tileCode(slot, stats) {
  if (!slot || !stats?.length) return null;
  if (WEAPONS.includes(slot)) return slot;
  for (let tier = 1; tier <= 6; tier++) {
    const ranges = STAT_RANGES[`${slot}${tier}`];
    if (!ranges) continue;
    const [lo, hi] = Object.values(ranges)[0];
    if (stats[0] >= lo && stats[0] <= hi) return `${slot}${tier}`;
  }
  return null;
}

/**
 * "jet|attack:270,criticalChance:50": a piece's code and stats, the stats in
 * a fixed order. null without stats.
 * @param {string} code @param {Record<string, number> | null | undefined} skills
 */
export const pieceKey = (code, skills) =>
  skills && Object.keys(skills).length
    ? `${code}|${Object.keys(skills)
        .sort()
        .map((k) => `${k}:${skills[k]}`)
        .join(",")}`
    : null;

/**
 * @template {{ code: string, skills?: Record<string, number> | null, source: string }} P
 * @param {ReadonlyArray<P>} pieces the pieces the player holds
 * @returns {Map<string, P[]>}
 */
export function heldIndex(pieces) {
  /** @type {Map<string, P[]>} */
  const index = new Map();
  for (const p of pieces) {
    const key = pieceKey(p.code, p.skills);
    if (!key) continue;
    const list = index.get(key) ?? [];
    list.push(p);
    index.set(key, list);
  }
  return index;
}

/**
 * The held pieces a tile can be and how they came: every source among
 * identical pieces (they cannot be told apart). null when the tile's stats
 * do not make a whole piece.
 * @template {{ source: string }} P
 * @param {Map<string, P[]>} index @param {string} code @param {ReadonlyArray<number>} stats
 */
export function tileSource(index, code, stats) {
  const skills = rowSkills(code, stats);
  const key = skills ? pieceKey(code, skills) : null;
  if (!key) return null;
  const pieces = index.get(key) ?? [];
  return { key, pieces, sources: [...new Set(pieces.map((p) => p.source))] };
}

/**
 * The stats a piece of `code` is ordered by, the first deciding: a weapon by
 * its crit, then its attack (pick the crit on the market's filter, walk the
 * attack down); a piece of one stat by that stat. Empty for an unknown code.
 * @param {string} code
 */
export function statOrder(code) {
  const keys = Object.keys(STAT_RANGES[code] ?? {});
  return WEAPONS.includes(code) ? ["criticalChance", "attack"] : keys;
}

/**
 * Pieces of `code` in that order, from the highest: one group per value of
 * the first stat when there is a second (a weapon's crit), else one group.
 * @template {{ skills: Record<string, number> }} P
 * @param {string} code @param {ReadonlyArray<P>} pieces
 * @returns {Array<{ value: number | null, pieces: P[] }>}
 */
export function sortGroups(code, pieces) {
  const keys = statOrder(code);
  if (!keys.length) return [];
  const sorted = pieces
    .filter((p) => keys.every((k) => typeof p.skills?.[k] === "number"))
    .sort((a, b) => {
      for (const k of keys) {
        const d = b.skills[k] - a.skills[k];
        if (d) return d;
      }
      return 0;
    });
  if (keys.length < 2)
    return sorted.length ? [{ value: null, pieces: sorted }] : [];
  /** @type {Array<{ value: number | null, pieces: P[] }>} */
  const groups = [];
  for (const p of sorted) {
    const v = p.skills[keys[0]];
    if (groups.at(-1)?.value !== v) groups.push({ value: v, pieces: [] });
    /** @type {{ pieces: P[] }} */ (groups.at(-1)).pieces.push(p);
  }
  return groups;
}

/**
 * Whether stats pass the market's minimum-stat filter ({ attack: 120,
 * criticalChance: 20 }); a stat left empty filters nothing.
 * @param {Record<string, number>} skills @param {Record<string, number>} filter
 */
export const meetsFilter = (skills, filter) =>
  Object.entries(filter).every(
    ([k, min]) => typeof skills?.[k] === "number" && skills[k] >= min,
  );
