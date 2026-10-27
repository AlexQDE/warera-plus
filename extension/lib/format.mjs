// @ts-check
/** @param {unknown} value */
export const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ] ?? c,
  );
const goldFormat = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});
/** @param {unknown} v @param {number} [d] */
export const fmt = (v, d = 3) =>
  v == null || !Number.isFinite(Number(v))
    ? "–"
    : d === 3
      ? goldFormat.format(Number(v))
      : Number(v).toLocaleString("en-US", {
          minimumFractionDigits: d,
          maximumFractionDigits: d,
        });
/** @param {number | null | undefined} v @param {number} [d] */
export const signed = (v, d = 3) =>
  v == null ? "–" : `${v < 0 ? "−" : "+"}${fmt(Math.abs(v), d)}`;
/**
 * A gold amount as a player reads it: whole gold from 100 up, one decimal
 * from 10, two below (unit prices of resources keep `fmt`'s three).
 * @param {unknown} v
 */
export const gold = (v) => {
  if (v == null || !Number.isFinite(Number(v))) return "–";
  const a = Math.abs(Number(v));
  return fmt(Number(v), a >= 100 ? 0 : a >= 10 ? 1 : 2);
};
/** A rank as words read it, rounded: 1st, 2nd, 3rd, 4th, 11th, 21st, 112th. @param {number} n */
export const ordinal = (n) => {
  const r = Math.round(n);
  const last2 = Math.abs(r) % 100;
  /** @type {Record<number, string>} */
  const suffixes = { 1: "st", 2: "nd", 3: "rd" };
  const suffix =
    last2 >= 11 && last2 <= 13 ? "th" : (suffixes[last2 % 10] ?? "th");
  return `${r}${suffix}`;
};
/** A gold result with its sign. @param {number | null | undefined} v */
export const signedGold = (v) =>
  v == null || !Number.isFinite(v)
    ? "–"
    : `${v < 0 ? "−" : "+"}${gold(Math.abs(v))}`;
/** @param {unknown} n */
export function fmtQty(n) {
  if (n == null || !Number.isFinite(Number(n))) return "–";
  const v = Number(n);
  return v >= 1e6
    ? `${(v / 1e6).toFixed(1)}M`
    : v >= 1e4
      ? `${Math.round(v / 1e3)}k`
      : v >= 1e3
        ? `${(v / 1e3).toFixed(1)}k`
        : String(Math.round(v));
}
/** @param {string | null | undefined} iso @param {number} [now] */
export function ago(iso, now = Date.now()) {
  if (!iso || !Number.isFinite(Date.parse(iso))) return "never";
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  return s < 60
    ? `${s}s ago`
    : s < 3600
      ? `${Math.floor(s / 60)}m ago`
      : `${Math.floor(s / 3600)}h ago`;
}
