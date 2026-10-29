// Shared Recruit / Train tooltip text. No page access or game actions.
// @ts-check
import { signed } from "./format.mjs";
import { freshness, TTL } from "./quality.mjs";

/** @typedef {{ rows: import("./team.mjs").ApiEmployee[], at: string }} Employees */

/** Display-only comparison; an unknown page id or empty roster proves nothing.
 * @param {Employees | null | undefined} employees
 * @param {string | null | undefined} pageUserId */
export function employeeAccountMismatch(employees, pageUserId) {
  return Boolean(
    pageUserId &&
    employees?.rows.length &&
    !employees.rows.some(
      (row) => row.owner?.toLowerCase() === pageUserId.toLowerCase(),
    ),
  );
}

/** A snapshot is used only while fresh and without a failed refresh.
 * @param {{ employees?: Employees | null, error?: string | null, hasKey?: boolean, pageUserId?: string | null, now: number }} state */
export function unreadTeam({
  employees,
  error,
  hasKey = true,
  pageUserId,
  now,
}) {
  if (!hasKey) return "team not counted: no API key";
  if (error) return `team not counted: ${error}`;
  if (!employees) return "reading your employees…";
  if (employeeAccountMismatch(employees, pageUserId))
    return "team not counted: your API key belongs to another account; save this account's key in the settings";
  if (freshness(employees.at, TTL.employees, now) !== "fresh")
    return "team not counted: employees are stale; waiting for a fresh read";
  return null;
}

/** @param {Partial<import("./team.mjs").TeamResult> | null | undefined} result
 * @param {{ at: string, count: number, now: number }} context */
export function teamNotes(result, { at, count, now }) {
  const lines = (result?.others ?? []).map((other) => {
    const happiness = other.why.filter((line) => line.startsWith("happiness "));
    const why = happiness.length
      ? [
          ...happiness,
          ...other.why.filter(
            (line) => !line.startsWith("happiness ") && line.includes(":"),
          ),
        ]
      : other.why;
    const output =
      other.before.bonus != null &&
      other.after.bonus != null &&
      other.before.bonus !== other.after.bonus
        ? `output ${signed(other.after.bonus - other.before.bonus, 1)}%`
        : "";
    const gold =
      other.gold == null
        ? "not priced"
        : `${signed(other.gold, 1)} g in ${other.days} d`;
    return `${other.name ?? "Employee"}: ${[...why, output, gold].filter(Boolean).join(", ")}`;
  });
  return [
    ...(result?.self?.why.length
      ? [`Own team effects: ${result.self.why.join(", ")}`]
      : []),
    ...lines,
    `team read ${Math.max(0, Math.floor((now - Date.parse(at)) / 60_000))} min ago, ${count} coworker${count === 1 ? "" : "s"}`,
    ...(result?.assumed ?? []),
    ...(result?.checks ?? []),
  ];
}
