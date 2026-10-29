// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createWorkforce, readWorkforceDialog } from "./workforceview.mjs";

const now = Date.parse("2026-10-28T12:00:00Z");
const fixture = readFileSync("fixtures/v027-workforce-synthetic.html", "utf8");
const rows = JSON.parse(
  readFileSync("fixtures/employees-live-2026-10-28.json", "utf8"),
);
const state = (patch = {}) => ({
  now,
  hasKey: true,
  employees: { rows, at: new Date(now - 120_000).toISOString() },
  pointValue: { value: 0.08, at: new Date(now).toISOString() },
  booksAt: new Date(now).toISOString(),
  books: {},
  leadership: { level: 3, at: new Date(now - 60_000).toISOString() },
  ...patch,
});
let view;
beforeEach(() => {
  document.body.innerHTML = fixture;
  view = createWorkforce();
});
afterEach(() => {
  view.clear();
  vi.restoreAllMocks();
});

it("finds My workforce and its Employees section, excluding the chart legend", () => {
  const read = readWorkforceDialog();
  expect(read.root).toBe(document.querySelector('[role="dialog"]'));
  expect(read.heading.tagName).toBe("H3");
  expect(read.companies["c00000000000000000000002"].product).toBe("lead");
  expect(read.companies["c00000000000000000000003"].product).toBe("lightAmmo");
});
it("takes a company's own page as that company, whose card links nowhere", () => {
  // a company's own page holds its card alone: its product image, no /company/ link
  for (const card of document.querySelectorAll("article")) card.remove();
  document.body.insertAdjacentHTML(
    "afterbegin",
    '<div id="own"><img alt="iron"><span>Disabled Iron</span></div>',
  );
  const id = "c00000000000000000000009";
  expect(readWorkforceDialog().companies[id]).toBeUndefined();
  window.history.pushState({}, "", `/company/${id}`);
  try {
    expect(readWorkforceDialog().companies[id]).toEqual({ product: "iron" });
    // a second product on the page leaves it unknown rather than guessed
    document
      .querySelector("#own")
      .insertAdjacentHTML("beforeend", '<img alt="steel">');
    expect(readWorkforceDialog().companies[id]).toBeUndefined();
  } finally {
    window.history.pushState({}, "", "/");
  }
});
it("mounts before sort buttons once, never clicks or replaces the game's nodes, and clears on close", () => {
  const nodes = [...document.querySelectorAll('[role="dialog"] *')];
  const clicks = vi.spyOn(window.HTMLElement.prototype, "click");
  const read = view.render(state());
  const panel = read.root.querySelector(".ss-workforce");
  expect(
    panel.compareDocumentPosition(document.querySelector(".sort-buttons")) & 4,
  ).toBeTruthy();
  expect(panel.compareDocumentPosition(read.heading) & 2).toBeTruthy();
  view.render(state());
  expect(document.querySelectorAll(".ss-workforce")).toHaveLength(1);
  expect(nodes.every((n) => n.isConnected)).toBe(true);
  expect(clicks).not.toHaveBeenCalled();
  expect(panel.textContent).toContain("Losing gold");
  expect(panel.textContent).toContain("Tom Murazik");
  expect(panel.textContent).toContain("fire, retrain or move");
  expect(panel.querySelector(".lens-help").title).toContain(
    "employees read 2 min ago",
  );
  expect(panel.querySelector(".lens-help").title).toContain("Management 3");
  read.root.remove();
  expect(view.render(state())).toBeNull();
  expect(panel.parentNode).toBeNull();
});
it("keeps only its own nodes and follows a replacement dialog", () => {
  const first = view.render(state()).root;
  document.body.insertAdjacentHTML(
    "beforeend",
    '<p data-lens class="other-lens">keep</p>',
  );
  first.remove();
  document.body.insertAdjacentHTML("beforeend", fixture);
  view.render(state());
  expect(document.querySelectorAll(".ss-workforce")).toHaveLength(1);
  expect(first.querySelector(".ss-workforce")).toBeNull();
  view.clear();
  expect(document.querySelector(".other-lens")).not.toBeNull();
});
it.each([
  ["no key", { hasKey: false }, /API key/],
  ["loading employees", { employees: null }, /reading your employees/],
  [
    "stale employees",
    { employees: { rows, at: new Date(now - 300_000).toISOString() } },
    /employees are stale/,
  ],
  ["failed employees", { employeesError: "refresh failed" }, /refresh failed/],
  ["loading point value", { pointValue: null }, /reading point value/],
  [
    "stale point value",
    { pointValue: { value: 0.08, at: new Date(now - 600_000).toISOString() } },
    /point value is stale/,
  ],
])("shows one muted line for %s", (_reason, patch, message) => {
  view.render(state(patch));
  const panel = document.querySelector(".ss-workforce");
  expect(panel.children).toHaveLength(1);
  expect(panel.querySelector(".lens-muted").textContent).toMatch(message);
  expect(panel.textContent).not.toContain("Train first");
});
it("shows top five training values and counts distinct employees needing attention", () => {
  view.render(
    state({
      employees: {
        rows: rows.map((e) => ({ ...e, trainingsToday: 0 })),
        at: new Date(now).toISOString(),
      },
    }),
  );
  expect(document.querySelectorAll('[data-workforce="train"]')).toHaveLength(5);
  expect(document.querySelector(".ss-workforce").textContent).toMatch(
    /WarEra Plus · \d+ to look at/,
  );
});
it("uses the case books' best bids less inputs, then falls back when books become stale", () => {
  const tom = rows.find((e) => e.name === "Tom Murazik");
  const priced = state({
    employees: { rows: [tom], at: new Date(now).toISOString() },
    books: { lightAmmo: { bid: 0.04 }, lead: { bid: 0.03 } },
  });
  view.render(priced);
  expect(
    document.querySelector('[data-workforce="losing"]').textContent,
  ).toContain("−0.5 g a day");
  view.render({ ...priced, booksAt: new Date(now - 60_000).toISOString() });
  expect(
    document.querySelector('[data-workforce="losing"]').textContent,
  ).toContain("−0.1 g a day");
});
it("discloses assumptions, unknown products, stale books and missing Management", () => {
  const employee = {
    ...rows.find((e) => e.name === "Dwight Harris"),
    lastSpecializedDay: "2026-10-27",
  };
  view.render(
    state({
      employees: { rows: [employee], at: new Date(now).toISOString() },
      leadership: null,
      booksAt: new Date(now - 60_000).toISOString(),
    }),
  );
  const title = document.querySelector(".ss-workforce .lens-help").title;
  expect(title).toContain("Management 0");
  expect(title).toContain("never seen");
  expect(title).toContain("unknown product");
  expect(title).toContain("point value");
  expect(title).toContain("Prima Donna");
  expect(title).toContain("moves and hires are v2");
  expect(document.querySelector(".ss-workforce").textContent).toContain(
    "all placed well",
  );
});

it("replaces all advice with a warning for another account's key and restores it for a matching owner", () => {
  const owner = "a123456789abcdef01234567";
  const owned = state({
    pageUserId: owner.toUpperCase(),
    employees: {
      rows: rows.map((row) => ({
        ...row,
        owner,
        trainingsToday: 0,
        // Put the Bully beside a coworker so all three advice sections exist.
        company:
          row.name === "Walter Fritsch"
            ? rows.find((e) => e.name === "Lionel Leannon").company
            : row.company,
      })),
      at: new Date(now).toISOString(),
    },
  });
  view.render(owned);
  const panel = document.querySelector(".ss-workforce");
  const advice = panel.innerHTML;
  expect(panel.textContent).toContain("Train first");
  expect(panel.textContent).toContain("Placement");
  expect(panel.textContent).toContain("Losing gold");
  view.render({ ...owned, pageUserId: "b123456789abcdef01234567" });
  expect(panel.textContent).toBe(
    "WarEra Plus · the API key reads another account's employees: save this account's key in the settings",
  );
  expect(panel.children).toHaveLength(1);
  expect(panel.querySelector(".lens-neg[role='alert']")).not.toBeNull();
  expect(panel.querySelector("[data-workforce], .lens-help")).toBeNull();
  for (const label of ["Train first", "Placement", "Losing gold"])
    expect(panel.textContent).not.toContain(label);
  view.render(owned);
  expect(panel.innerHTML).toBe(advice);
});

it.each([
  ["unknown page id", { pageUserId: null }],
  [
    "no employees",
    {
      pageUserId: "b123456789abcdef01234567",
      employees: { rows: [], at: new Date(now).toISOString() },
    },
  ],
])("makes no account claim with %s", (_reason, patch) => {
  view.render(
    state({
      employees: {
        rows: rows.map((row) => ({
          ...row,
          owner: "a123456789abcdef01234567",
        })),
        at: new Date(now).toISOString(),
      },
      ...patch,
    }),
  );
  const panel = document.querySelector(".ss-workforce");
  expect(panel.textContent).not.toContain("another account");
  expect(panel.querySelector('[role="alert"]')).toBeNull();
});
