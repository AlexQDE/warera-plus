// @ts-check
/**
 * Where the drop policy starts selling: drops of this rarity and above are
 * valued at the game's average item price (sold on the equipment market),
 * every rarity below it at the scrap quote (dismantled). "never" scraps all.
 */
export const SELL_FROM = Object.freeze([
  "never",
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
  "mythic",
]);
/** The one section open under the bar on the equipment market; "none" is the bar alone. */
export const PANELS = Object.freeze(["none", "market", "craft", "ledger"]);
export const DEFAULTS = Object.freeze({
  /** SNIPE needs at least this ROI on the scrap value (a negative threshold shows near misses); 3% keeps a one-cent margin from shouting. */
  minMarginPct: 3,
  /** FLIP needs the value (same-roll fills, else the game's average) at least this far above the price. */
  flipPct: 10,
  intervalSec: 30,
  /** @type {"none" | "market" | "craft" | "ledger"} */
  panel: "none",
  casesCollapsed: true,
  roundTrip: false,
  equipment: true,
  cases: true,
  travel: true,
  picker: true,
  sellFrom: "epic",
  craft: true,
  /** The player's own id for the ledger; null means "read it off the game page's own-profile links". */
  userId: /** @type {string | null} */ (null),
  /** How the player crafts: "random" lets the game pick the slot at the base steel fee, "chosen" doubles the steel. */
  craftSteelMode: /** @type {"random" | "chosen"} */ ("random"),
  /** "eco" leaves gear worn in battle out of the ledger's results; "war" counts it (contracts, bounties). */
  ledgerMode: /** @type {"eco" | "war"} */ ("eco"),
  schemaVersion: 5,
});
/** Settings saved before this schema wrote the old SNIPE default (0) with every save: it was not a choice. */
const OLD_MIN_MARGIN_SCHEMA = 5;
/** @param {unknown} value @param {number} min @param {number} max @param {number} fallback */
const clamp = (value, min, max, fallback) =>
  value !== "" && value !== null && Number.isFinite(Number(value))
    ? Math.min(max, Math.max(min, Math.round(Number(value))))
    : fallback;
/** @param {unknown} value @param {boolean} fallback */
const flag = (value, fallback) =>
  typeof value === "boolean" ? value : fallback;
/** Public preferences only. Never copy arbitrary storage fields across the content boundary.
 * @param {Record<string, unknown>} [input]
 */
export function preferences(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) input = {};
  const panel = String(input.panel ?? "");
  const oldDefault =
    (Number(input.schemaVersion) || 0) < OLD_MIN_MARGIN_SCHEMA &&
    Number(input.minMarginPct) === 0;
  return {
    ...DEFAULTS,
    minMarginPct: oldDefault
      ? DEFAULTS.minMarginPct
      : clamp(input.minMarginPct, -50, 500, DEFAULTS.minMarginPct),
    flipPct: clamp(input.flipPct, -50, 500, DEFAULTS.flipPct),
    intervalSec: clamp(input.intervalSec, 10, 600, DEFAULTS.intervalSec),
    panel: /** @type {"none" | "market" | "craft" | "ledger"} */ (
      PANELS.includes(panel) ? panel : DEFAULTS.panel
    ),
    casesCollapsed: flag(input.casesCollapsed, DEFAULTS.casesCollapsed),
    roundTrip: input.roundTrip === true,
    equipment: input.equipment !== false,
    cases: input.cases !== false,
    travel: input.travel !== false,
    picker: input.picker !== false,
    sellFrom: SELL_FROM.includes(/** @type {string} */ (input.sellFrom))
      ? /** @type {string} */ (input.sellFrom)
      : DEFAULTS.sellFrom,
    craft: input.craft !== false,
    userId: /^[0-9a-f]{24}$/.test(String(input.userId ?? "").trim())
      ? String(input.userId).trim()
      : null,
    craftSteelMode: input.craftSteelMode === "chosen" ? "chosen" : "random",
    ledgerMode: input.ledgerMode === "war" ? "war" : "eco",
  };
}
