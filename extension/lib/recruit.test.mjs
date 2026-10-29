// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as recruit from "./recruit.mjs";
import { findSellForm } from "./sellform.mjs";
import { pickerDialog } from "./dom.mjs";
import { candidateValue, traitCases } from "./hiring.mjs";
import { rosterOf } from "./team.mjs";

beforeEach(() => {
  document.body.innerHTML = readFileSync(
    "fixtures/v0273-live-recruit.html",
    "utf8",
  );
});
afterEach(() => vi.restoreAllMocks());

const COUNTRIES = [
  { id: "6873d0ea1758b40e712b5ee9", code: "ml", name: "Mali" },
  { id: "111111111111111111111111", code: "co", name: "Colombia" },
  { id: "222222222222222222222222", code: "bw", name: "Botswana" },
  { id: "333333333333333333333333", code: "st", name: "São Tomé and Príncipe" },
  { id: "444444444444444444444444", code: "gw", name: "Guinea-Bissau" },
];

it.each([
  ["ml", "Colombia", COUNTRIES[0].id],
  [null, "cOlOmBiA", COUNTRIES[1].id],
  [null, "SAO TOME AND PRINCIPE", COUNTRIES[3].id],
  [null, "Guinea-Bissau", COUNTRIES[4].id],
  ["zz", "Unknown", null],
])("maps flag code %s and name %s to %s", (code, name, expected) => {
  expect(recruit.countryId(code, name, COUNTRIES)).toBe(expected);
});

it("reads flag codes from src and retains the alt-only name fallback", () => {
  const read = recruit.readRecruitDialog();
  expect(read.candidates.map((c) => c.countryCode)).toEqual([
    "ml",
    "ml",
    "co",
    "bw",
  ]);
  const flag = read.candidates[0].card.querySelector('img[alt$=" flag"]');
  flag.removeAttribute("src");
  expect(recruit.readRecruitDialog().candidates[0]).toMatchObject({
    countryCode: null,
    nationality: "Mali",
  });
  expect(recruit.countryId(null, "Mali", COUNTRIES)).toBe(COUNTRIES[0].id);
});

it.each([
  ["Nationalist", COUNTRIES[0].id, "+18.5 g"],
  ["Xenophobe", COUNTRIES[1].id, "−31.1 g"],
  ["Cosmopolitan", COUNTRIES[1].id, "★ +52.0 g"],
])(
  "prices %s from the candidate and coworker nationality ids",
  (trait, nationality, line) => {
    const now = Date.parse("2026-10-29T12:00:00Z");
    const at = new Date(now).toISOString();
    const company = "c00000000000000000000001";
    document.body.insertAdjacentHTML(
      "afterbegin",
      `<div id="nationality-company"><a href="/company/${company}">Iron</a><img alt="iron"><span>0%</span><button>Recruit 1/3</button></div>`,
    );
    const candidate = recruit.readRecruitDialog().candidates[0];
    candidate.card
      .querySelector('[role="img"]')
      .setAttribute("aria-label", trait);
    const advisor = recruit.createRecruit({ clock: () => now });
    try {
      document
        .querySelector("#nationality-company button")
        .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      const state = {
        now,
        pointValue: { value: 0.1012, at },
        employees: {
          at,
          rows: [
            {
              _id: "coworker",
              company,
              name: "Coworker",
              nationality,
              age: 40,
              gender: "male",
              base: { production: 2 },
              traits: [],
              wage: 0.05,
              breakdown: {
                production: { total: 2, contributions: [] },
                responsibility: { total: 1 },
                luck: { total: 1 },
              },
              happinessBreakdown: { value: 53, contributions: [] },
              productionBonus: {
                total: 0,
                contributions: [{ source: "management", percent: 0 }],
              },
            },
          ],
        },
      };
      const tip = () =>
        candidate.card.querySelector(".ss-recruit-value .lens-help").title;
      advisor.render(state);
      expect(tip()).toContain(
        `${trait}: unknown nationality (country list not read yet); rule skipped`,
      );
      advisor.render({ ...state, countries: { rows: COUNTRIES, at } });
      expect(tip()).toContain(trait);
      expect(tip()).not.toContain(`${trait}: unknown nationality`);
      expect(candidate.card.querySelector(".ss-recruit-line").textContent).toBe(
        line,
      );
      const flag = candidate.card.querySelector('img[alt$=" flag"]');
      flag.setAttribute("src", "https://media.warera.io/images/flags/zz.svg");
      flag.setAttribute("alt", "Unknown flag");
      advisor.render({ ...state, countries: { rows: COUNTRIES, at } });
      expect(tip()).toContain(
        `${trait}: unknown nationality (flag not recognised); rule skipped`,
      );
    } finally {
      advisor.dispose();
    }
  },
);

it.each(["Patriot", "Homesick", "Expat"])(
  "uses country ids for %s, with shown names as the fallback",
  (trait) => {
    const now = Date.parse("2026-10-29T12:00:00Z");
    const at = new Date(now).toISOString();
    document.body.insertAdjacentHTML(
      "afterbegin",
      '<div id="home-company"><img alt="iron"><span>0%</span><img alt="Mali flag" src="https://media.warera.io/images/flags/ml.svg"><button>Recruit 1/3</button></div>',
    );
    const candidate = recruit.readRecruitDialog().candidates[0];
    candidate.card
      .querySelector('[role="img"]')
      .setAttribute("aria-label", trait);
    const companyFlag = document.querySelector(
      '#home-company img[alt$=" flag"]',
    );
    expect(
      recruit.companyFromButton(document.querySelector("#home-company button")),
    ).toMatchObject({
      country: "Mali",
      countryCode: "ml",
    });
    const advisor = recruit.createRecruit({ clock: () => now });
    const click = () =>
      document
        .querySelector("#home-company button")
        .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    const tip = () =>
      candidate.card.querySelector(".ss-recruit-value .lens-help").title;
    try {
      click();
      const state = { now, pointValue: { value: 0.1012, at } };
      advisor.render(state);
      const nameBased = tip();
      // Both codes identify Mali even when the company's alt text differs.
      companyFlag.setAttribute("alt", "Translated country flag");
      click();
      advisor.render({ ...state, countries: { rows: COUNTRIES, at } });
      expect(tip()).toBe(nameBased);
      // A company's code also overrides an otherwise matching name.
      companyFlag.setAttribute("alt", "Mali flag");
      companyFlag.setAttribute(
        "src",
        "https://media.warera.io/images/flags/co.svg",
      );
      click();
      advisor.render({ ...state, countries: { rows: COUNTRIES, at } });
      expect(tip()).not.toBe(nameBased);
      companyFlag.removeAttribute("src");
      expect(
        recruit.companyFromButton(
          document.querySelector("#home-company button"),
        ),
      ).toMatchObject({
        country: "Mali",
        countryCode: null,
      });
      click();
      advisor.render({ ...state, countries: { rows: COUNTRIES, at } });
      expect(tip()).toBe(nameBased);
    } finally {
      advisor.dispose();
    }
  },
);

it("prints only gold and team for shown Production, and leads with hidden Production", () => {
  const value = {
    fits: true,
    shares: { 2: 0.5, 3: 0.5 },
    likeliest: 2,
    expectation: { min: 1, max: 1 },
    horizon: 30,
    daysLeft: 30,
    perDayNow: 0.2,
    perDaySettled: 0.4,
    total: 12,
    team: 0.5,
    flightRisk: 0,
  };
  const el = document.createElement("div");
  el.innerHTML = recruit.candidateHtml(
    { production: 2, wageChipShown: 0 },
    value,
    true,
  );
  expect(el.querySelector(".ss-recruit-line").textContent).toBe(
    "★ +12.0 g · team +0.5 g",
  );
  expect(el.querySelector(".lens-help").title).not.toMatch(
    /Production|His chip/,
  );
  el.innerHTML = recruit.candidateHtml(
    { production: null, wageChipShown: 0 },
    value,
    false,
  );
  expect(el.querySelector(".ss-recruit-line").textContent).toBe(
    "P2-3 · +12.0 g · team +0.5 g",
  );
  expect(el.querySelector(".lens-help").title).toContain(
    "Production 2-3 from his wage",
  );
});

it("uses the Recruit chip as tax and Management from another company's employee", () => {
  const now = Date.parse("2026-10-29T12:00:00Z");
  document.body.insertAdjacentHTML(
    "afterbegin",
    '<div id="tax-company"><a href="/company/c00000000000000000000001">Steel</a><img alt="steel"><span>4%</span><button>Recruit 0/3</button></div>',
  );
  const candidate = recruit.readRecruitDialog().candidates[0];
  candidate.card.querySelector('[role="img"]').remove();
  const advisor = recruit.createRecruit({ clock: () => now });
  try {
    document
      .querySelector("#tax-company button")
      .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    advisor.render({
      now,
      pointValue: { value: 0.1, at: new Date(now).toISOString() },
      employees: {
        at: new Date(now).toISOString(),
        rows: [
          {
            company: "another-company",
            productionBonus: {
              contributions: [{ source: "management", percent: 22 }],
            },
          },
        ],
      },
    });
    const tip = candidate.card.querySelector(
      ".ss-recruit-value .lens-help",
    ).title;
    expect(tip).toContain("Gold a day: +0.52 now, +1.00 after 20 days");
    expect(tip).not.toContain("Management bonus not counted");
    expect(
      document.querySelector(".ss-recruit-head .lens-help").title,
    ).toContain("Income tax 4%");
  } finally {
    advisor.dispose();
  }
});

it("finds the company id at the live card's four-level button ancestry", () => {
  document.body.insertAdjacentHTML(
    "afterbegin",
    '<div id="disabled"><a href="/company/c00000000000000000000001">Disabled Iron</a><img alt="iron"><span>6%</span><div><div><div><button>Recruit 1/2</button></div></div></div></div>',
  );
  expect(
    recruit.companyFromButton(document.querySelector("#disabled button")),
  ).toMatchObject({ companyId: "c00000000000000000000001", product: "iron" });
});

it("takes the company id from the page's address on a company's own page, whose card links nowhere", () => {
  document.body.insertAdjacentHTML(
    "afterbegin",
    '<div id="own"><img alt="iron"><span>6%</span><div><div><div><button>Recruit 1/2</button></div></div></div></div>',
  );
  const button = document.querySelector("#own button");
  expect(recruit.companyFromButton(button)?.companyId).toBeNull();
  window.history.pushState({}, "", "/company/c00000000000000000000001");
  try {
    expect(recruit.companyFromButton(button)).toMatchObject({
      companyId: "c00000000000000000000001",
      product: "iron",
    });
  } finally {
    window.history.pushState({}, "", "/");
  }
  // the Companies list is no company's page
  window.history.pushState({}, "", "/companies");
  try {
    expect(recruit.companyFromButton(button)?.companyId).toBeNull();
  } finally {
    window.history.pushState({}, "", "/");
  }
});

it("shows the Bully's real loss to Lionel and keeps the old line without employees", () => {
  const now = Date.parse("2026-10-28T12:00:00Z");
  const employees = {
    rows: JSON.parse(
      readFileSync("fixtures/employees-live-2026-10-28.json", "utf8"),
    ),
    at: new Date(now - 120_000).toISOString(),
  };
  document.body.insertAdjacentHTML(
    "afterbegin",
    '<div id="disabled"><a href="/company/c00000000000000000000001">Disabled Iron</a><img alt="iron"><span>0%</span><div><div><div><button>Recruit 1/2</button></div></div></div></div>',
  );
  const candidate = recruit.readRecruitDialog().candidates[3];
  candidate.statsGroup.children[0].lastElementChild.textContent = "2";
  candidate.card
    .querySelector('[role="img"]')
    .setAttribute("aria-label", "Bully");
  const advisor = recruit.createRecruit({ clock: () => now });
  document
    .querySelector("#disabled button")
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  const state = {
    pointValue: { value: 0.1012, at: new Date(now).toISOString() },
    now,
  };
  advisor.render(state);
  const line = () =>
    candidate.card.querySelector(".ss-recruit-line").textContent;
  const tip = () =>
    candidate.card.querySelector(".ss-recruit-value .lens-help").title;
  const original = line();
  expect(original).not.toContain("team");
  expect(tip()).toContain("reading your employees…");
  advisor.render({ ...state, employees });
  expect(line()).toContain("team −3.6 g");
  expect(tip()).toContain(
    "Lionel Leannon: happiness −10.0 (Bully −10), output −10.0%, −3.6 g in 20 d",
  );
  expect(tip()).toContain("team read 2 min ago, 1 coworker");
  advisor.render({ ...state, hasKey: false });
  expect(line()).toBe(original);
  expect(tip()).toContain("team not counted: no API key");
  advisor.render({ ...state, employees: { ...employees, at: "2000-01-01" } });
  expect(line()).toBe(original);
  expect(tip()).toContain("team not counted: employees are stale");
  advisor.dispose();
});

it("anchors an expiring happiness item at the employee snapshot's timestamp", () => {
  const now = Date.parse("2026-10-28T12:00:00Z");
  const rows = JSON.parse(
    readFileSync("fixtures/employees-live-2026-10-28.json", "utf8"),
  );
  const lionel = rows.find((e) => e.name === "Lionel Leannon");
  lionel.happinessBreakdown.value = 88;
  const move = lionel.happinessBreakdown.contributions.find(
    (item) => item.reason === "recentlyMoved",
  );
  move.delta = -10;
  move.until = new Date(now - 1000).toISOString();
  document.body.insertAdjacentHTML(
    "afterbegin",
    '<div id="disabled"><a href="/company/c00000000000000000000001">Disabled Iron</a><img alt="iron"><button>Recruit 1/2</button></div>',
  );
  const candidate = recruit.readRecruitDialog().candidates[0];
  candidate.card
    .querySelector('[role="img"]')
    .setAttribute("aria-label", "Foreman");
  const advisor = recruit.createRecruit({ clock: () => now });
  document
    .querySelector("#disabled button")
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  const state = {
    now,
    pointValue: { value: 0.1012, at: new Date(now).toISOString() },
    employees: { rows, at: new Date(now - 120_000).toISOString() },
  };
  const tip = () =>
    candidate.card.querySelector(".ss-recruit-value .lens-help").title;
  advisor.render({ ...state, now: now - 2000 });
  expect(tip()).toContain("happiness +9.0");
  advisor.render(state);
  expect(tip()).toContain("happiness +2.0");
  advisor.dispose();
});

it("rejects a Recruit dialog when one candidate's Production svg is missing", () => {
  const candidates = recruit.readRecruitDialog().candidates;
  expect(candidates).toHaveLength(4);
  candidates[0].statsGroup.children[0].querySelector("svg").remove();
  expect(recruit.readRecruitDialog()).toBeNull();
});

it("warns about another account's key and removes its team estimate", () => {
  const now = Date.parse("2026-10-28T12:00:00Z");
  const owner = "a123456789abcdef01234567";
  const rows = JSON.parse(
    readFileSync("fixtures/employees-live-2026-10-28.json", "utf8"),
  ).map((row) => ({ ...row, owner }));
  document.body.insertAdjacentHTML(
    "afterbegin",
    '<div id="company"><a href="/company/c00000000000000000000001">Iron</a><img alt="iron"><span>0%</span><button>Recruit 1/2</button></div>',
  );
  const candidate = recruit.readRecruitDialog().candidates[3];
  candidate.statsGroup.children[0].lastElementChild.textContent = "2";
  candidate.card
    .querySelector('[role="img"]')
    .setAttribute("aria-label", "Bully");
  const advisor = recruit.createRecruit({ clock: () => now });
  try {
    document
      .querySelector("#company button")
      .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    const state = {
      now,
      pointValue: { value: 0.1012, at: new Date(now).toISOString() },
      employees: { rows, at: new Date(now - 120_000).toISOString() },
      pageUserId: owner.toUpperCase(),
    };
    const line = () =>
      candidate.card.querySelector(".ss-recruit-line").textContent;
    const tip = () =>
      candidate.card.querySelector(".ss-recruit-value .lens-help").title;
    advisor.render(state);
    const matching = line();
    expect(matching).toContain("team −3.6 g");
    advisor.render({ ...state, pageUserId: "b123456789abcdef01234567" });
    expect(tip()).toContain(
      "team not counted: your API key belongs to another account; save this account's key in the settings",
    );
    expect(line()).not.toContain("team");
    expect(tip()).not.toContain("Lionel Leannon:");
    expect(tip()).not.toContain("0 coworkers");
    advisor.render(state);
    expect(line()).toBe(matching);
  } finally {
    advisor.dispose();
  }
});

it("reads all four candidates, with no hidden trait invented when no badge exists", () => {
  expect(recruit.readRecruitDialog).toBeTypeOf("function");
  const candidates = recruit.readRecruitDialog().candidates;
  for (const candidate of candidates.slice(0, 3))
    candidate.card.querySelector('[role="img"]').remove();
  candidates[3].card
    .querySelector('[role="img"]')
    .setAttribute("aria-label", "Gambler");
  const read = recruit.readRecruitDialog();
  expect(read.roster).toMatchObject({ count: 1, capacity: 3 });
  expect(read.alone).toBe(false);
  expect(
    read.candidates.map((c) => [
      c.name,
      c.wageDay,
      c.production,
      c.traits,
      c.hiddenTraits,
      c.unknownTraits,
      c.age,
      c.potential,
    ]),
  ).toEqual([
    ["Bouba Sall", 2.6, 4, [], 0, 0, 38, null],
    ["Marème Sow", 2.25, 4, [], 0, 0, 37, null],
    ["Ariadna Zamarripa Yunta", 0.48, 1, [], 0, 0, 31, null],
    ["Masego Moalosi", 1.27, 3, ["gambler"], 0, 0, 20, null],
  ]);
});

it("separates hidden and untranslated trait badges and reads team capacity", () => {
  expect(recruit.readRecruitDialog).toBeTypeOf("function");
  const masego = recruit.readRecruitDialog().candidates[3];
  masego.card
    .querySelector('[role="img"]')
    .parentElement.insertAdjacentHTML(
      "afterend",
      '<div role="img" aria-label="Untranslated trait"></div>',
    );
  const roster = [...document.querySelectorAll("span")].find(
    (e) => e.textContent === "Roster 1/3",
  );
  roster.textContent = "Roster 2/3";
  const read = recruit.readRecruitDialog();
  expect(read.roster).toEqual({ count: 2, capacity: 3 });
  expect(read.alone).toBe(false);
  expect(read.candidates[3]).toMatchObject({
    traits: [],
    hiddenTraits: 1,
    unknownTraits: 1,
  });
  roster.textContent = "Roster 0/1";
  expect(recruit.readRecruitDialog().alone).toBe(true);
});

it("reads a labelled gender icon and shown Responsibility without treating a country name as a nationality id", () => {
  const candidate = recruit.readRecruitDialog().candidates[0];
  candidate.card
    .querySelector('path[d^="M9,9C10.29,9"]')
    .setAttribute("d", "unknown-icon");
  candidate.card
    .querySelector('img[alt$=" flag"]')
    .insertAdjacentHTML("afterend", '<svg aria-label="Female"></svg>');
  expect(recruit.readRecruitDialog().candidates[0]).toMatchObject({
    gender: "female",
    responsibility: 4,
    nationality: "Mali",
  });
});

it("reads unlabelled age icons and excludes female-only hidden traits for Bouba Sall", () => {
  const read = recruit.readRecruitDialog();
  expect(read.candidates.map((c) => c.gender)).toEqual([
    "male",
    "female",
    "female",
    "female",
  ]);
  const bouba = read.candidates[0];
  expect(bouba).toMatchObject({ name: "Bouba Sall", age: 38 });
  const codes = traitCases(bouba).flatMap((c) => c.codes);
  expect(codes).not.toContain("girlPower");
  expect(codes).not.toContain("manHater");
  expect(codes).toContain("bandOfBrothers");
  expect(codes).toContain("misogynist");
});

it.each([
  [0, "girlPower", "female", 0],
  [1, "girlPower", "female", 0.15],
  [0, "bandOfBrothers", "male", 0.15],
  [1, "bandOfBrothers", "male", 0],
  [0, "manHater", "female", -0.15],
  [1, "manHater", "female", 0],
  [0, "misogynist", "male", 0],
  [1, "misogynist", "male", -0.15],
])(
  "uses candidate %i's icon gender for a coworker's %s",
  (index, trait, gender, pct) => {
    const now = Date.parse("2026-10-29T12:00:00Z");
    const roster = rosterOf(
      [
        {
          _id: "peer",
          company: "company",
          gender,
          age: 64,
          base: { production: 2 },
          traits: [{ code: trait, revealed: true }],
          wage: 0.05,
          breakdown: { production: { total: 2 }, responsibility: { total: 1 } },
          happinessBreakdown: { value: 50, contributions: [] },
          productionBonus: {
            total: 0,
            contributions: [{ source: "specialization", percent: 0 }],
          },
        },
      ],
      "company",
      now,
    );
    const candidate = recruit.readRecruitDialog().candidates[index];
    const value = candidateValue(
      { ...candidate, age: 64, hiddenTraits: 0 },
      { pointValue: 0.1, roster, now },
    );
    expect(value.team).toBeCloseTo(6 * 0.1 * 2 * pct, 12);
  },
);

it.each(["- / day", "garbled / day"])(
  "rejects the entire dialog with wage %s and clears recommendations",
  (wage) => {
    const advisor = recruit.createRecruit();
    try {
      advisor.render({
        pointValue: { value: 0.1019, at: new Date().toISOString() },
      });
      const card = recruit.readRecruitDialog().candidates[0].card;
      const line = [...card.querySelectorAll("span")]
        .filter((e) => /\/\s*day\s*$/.test(e.textContent))
        .at(-1);
      line.textContent = wage;
      expect(recruit.readRecruitDialog()).toBeNull();
      advisor.render({
        pointValue: { value: 0.1019, at: new Date().toISOString() },
      });
      expect(
        document.querySelector(".ss-recruit-value, [data-ss-best]"),
      ).toBeNull();
    } finally {
      advisor.dispose();
    }
  },
);

it.each([0, 1])(
  "rejects unreadable stat chip %i but accepts a hidden ?",
  (index) => {
    const chip =
      recruit.readRecruitDialog().candidates[0].statsGroup.children[index];
    const text = [...chip.querySelectorAll("span")].find(
      (e) => !e.children.length,
    );
    text.textContent = "?";
    expect(
      recruit.readRecruitDialog().candidates[0][
        index === 0 ? "production" : "responsibility"
      ],
    ).toBeNull();
    text.textContent = "garbled";
    expect(recruit.readRecruitDialog()).toBeNull();
  },
);

it("renders the fixture's shown wages and best pick without touching any game button", () => {
  expect(recruit.createRecruit).toBeTypeOf("function");
  const buttons = [...document.querySelectorAll("button")];
  const original = buttons.map((b) => b.outerHTML);
  const parents = buttons.map((b) => b.parentElement);
  const clicks = buttons.map((b) => vi.spyOn(b, "click"));
  const advisor = recruit.createRecruit();
  advisor.render({
    pointValue: { value: 0.1019, at: new Date().toISOString() },
  });
  const read = recruit.readRecruitDialog();
  // one line each, the details in the "?" tooltip
  const line = (c) =>
    c.card.querySelector(".ss-recruit-value .ss-recruit-line").textContent;
  const tip = (c) =>
    c.card.querySelector(".ss-recruit-value .lens-help").getAttribute("title");
  const [bouba, mareme, ariadna, masego] = read.candidates;
  expect(line(bouba)).toBe("+18.3 g");
  expect(tip(bouba)).not.toContain("Production 4");
  expect(tip(bouba)).toContain(
    "His chip without a hidden Greedy's or Modest's part: -11% to +25%",
  );
  expect(tip(bouba)).toContain(
    "Gold a day: +0.39 now, +0.89 after 20 days on the product",
  );
  expect(tip(bouba)).toContain("27 days to 65: ≈ +18.3 g in all");
  expect(line(mareme)).toBe("+22.5 g");
  expect(line(ariadna)).toBe("+15.3 g");
  expect(tip(ariadna)).not.toContain("Production 1");
  expect(line(masego)).toBe("★ +51.3 g");
  expect(tip(masego)).not.toContain("Production 3");
  // the best pick's own card is outlined, and only it
  expect(masego.card.hasAttribute("data-ss-best")).toBe(true);
  expect(document.querySelectorAll("[data-ss-best]")).toHaveLength(1);
  const header = document.querySelector(".ss-recruit-head");
  expect(header.textContent).toBe("WarEra Plus · ★ Masego Moalosi?");
  const headTip = header.querySelector(".lens-help").getAttribute("title");
  expect(headTip).toContain("Point value 0.1019 (wages rest on it)");
  expect(headTip).toContain("Output at the game's point value");
  expect(headTip).toContain("Team estimate (Roster 1/3)");
  expect(headTip).toContain(
    "Specialization: +1% a day on the same product, up to +20%",
  );
  expect(headTip).toContain(
    "A hire costs 10 energy, which your own work turns into 3-6 g",
  );
  const block = read.candidates[0].card.querySelector(".ss-recruit-value");
  const content = block.firstChild;
  advisor.render({
    pointValue: { value: 0.1019, at: new Date().toISOString() },
  });
  expect(document.querySelectorAll(".ss-recruit-value")).toHaveLength(4);
  expect(block.firstChild).toBe(content);
  for (const [i, b] of buttons.entries()) {
    expect(b.outerHTML).toBe(original[i]);
    expect(b.parentElement).toBe(parents[i]);
    expect(clicks[i]).not.toHaveBeenCalled();
  }
  for (const c of read.candidates) {
    const annotation = c.card.querySelector(".ss-recruit-value");
    expect(annotation.hasAttribute("data-lens")).toBe(true);
    expect(c.card.querySelectorAll(".ss-recruit-line")).toHaveLength(1);
    expect(
      c.statsGroup.compareDocumentPosition(annotation) &
        window.Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  }
  advisor.clear();
  expect(document.querySelector("[data-lens]")).toBeNull();
  expect(document.querySelector("[data-ss-best]")).toBeNull();
});

it("shows no pay warning and loading/errors without stale advice", () => {
  expect(recruit.createRecruit).toBeTypeOf("function");
  const advisor = recruit.createRecruit();
  advisor.render({});
  expect(document.querySelector(".ss-recruit-head").textContent).toContain(
    "reading point value",
  );
  advisor.render({ pointValue: { value: 0.04, at: new Date().toISOString() } });
  expect(document.querySelector(".ss-recruit-head").textContent).toContain(
    "none pays here: Reroll all (10 energy, more after) or leave the slot empty",
  );
  expect(document.querySelector("[data-ss-best]")).toBeNull();
  advisor.render({ pointValue: { value: 0.1019, at: "2000-01-01" } });
  expect(document.querySelector(".ss-recruit-head").textContent).toContain(
    "point value is stale",
  );
  expect(document.querySelector(".ss-recruit-value").textContent).not.toContain(
    "★",
  );
  advisor.render({ error: "could not reach the API" });
  expect(document.querySelector(".ss-recruit-head").textContent).toContain(
    "could not reach the API",
  );
});

it("shows wage drift, flight risk and uncertain wage expectation ranges", () => {
  const read = recruit.readRecruitDialog();
  const wage = [...read.candidates[1].card.querySelectorAll("span")]
    .reverse()
    .find((e) => /\/ day$/.test(e.textContent));
  wage.textContent = `${(6 * 0.1019 * 4 * 1.35).toFixed(2)} / day`;
  read.candidates[1].card.querySelector('[role="img"]').remove();
  const advisor = recruit.createRecruit();
  advisor.render({
    pointValue: { value: 0.1019, at: new Date().toISOString() },
  });
  const tip = (c) =>
    c.card.querySelector(".ss-recruit-value .lens-help").getAttribute("title");
  // drifted: a "!" on the line, the reason in the tooltip
  expect(
    read.candidates[1].card.querySelector(".ss-recruit-line").textContent,
  ).toContain("!");
  expect(tip(read.candidates[1])).toContain(
    "His wage only fits with a wider slack",
  );
  expect(tip(read.candidates[1])).toContain("Loses gold over his working life");
  // a hidden trait is a 1-in-35 chance of Flight Risk: noted, not flagged
  expect(tip(read.candidates[3])).not.toContain("Flight Risk");
  expect(tip(read.candidates[3])).toContain(
    "His ? trait is priced as an average hire's trait",
  );
  expect(tip(read.candidates[3])).toContain(
    "His chip without a hidden Greedy's or Modest's part: -31% to -19%",
  );
  read.candidates[3].card
    .querySelector('[role="img"]')
    .setAttribute("aria-label", "Flight Risk");
  advisor.render({
    pointValue: { value: 0.1019, at: new Date().toISOString() },
  });
  expect(tip(read.candidates[3])).toContain(
    "Flight Risk: may quit from 50 happiness",
  );
});

it("prices the pressed company's product at the bids, with its income tax and country", () => {
  // a company card as the Companies page draws it (read live 2026-10-26):
  // product image named by its code, the income tax chip, the region's flag
  document.body.insertAdjacentHTML(
    "afterbegin",
    '<div id="company"><div><img alt="steel"><span>Steel 2</span></div><div><div><svg></svg><span>4%</span></div><div><span>7</span></div></div><div><img alt="Mali flag"></div><span>No employees</span><div><button type="button"><span>Recruit 0/1</span></button></div></div>',
  );
  expect(
    recruit.companyFromButton(document.querySelector("#company button")),
  ).toEqual({
    product: "steel",
    bonus: 0.04,
    country: "Mali",
    countryCode: null,
    companyId: null,
  });
  // the chip's digits in their own span, as the game prints a stat
  const chip = [...document.querySelectorAll("#company span")].find(
    (e) => e.textContent === "4%",
  );
  chip.innerHTML = "<span>4</span>%";
  expect(
    recruit.companyFromButton(document.querySelector("#company button"))?.bonus,
  ).toBe(0.04);
  // no product image in its own card: never another company's
  const list = document.createElement("div");
  list.innerHTML =
    '<div><img alt="iron"><span>9%</span><button>Recruit 1/2</button></div><div><span>Mine</span><button id="other">Recruit 0/1</button></div>';
  document.body.append(list);
  expect(
    recruit.companyFromButton(document.querySelector("#other")),
  ).toBeNull();
  list.remove();
  const advisor = recruit.createRecruit();
  document
    .querySelector("#company button")
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  expect(advisor.company()).toMatchObject({ product: "steel", bonus: 0.04 });
  const at = new Date().toISOString();
  const books = { steel: { bid: 1.844 }, iron: { bid: 0.091 } };
  advisor.render({
    pointValue: { value: 0.1019, at },
    books,
    booksAt: at,
  });
  const headTip = () =>
    document.querySelector(".ss-recruit-head .lens-help").getAttribute("title");
  expect(headTip()).toContain(
    "steel: a point fetches 0.0934 at the bids (less its inputs)",
  );
  expect(headTip()).toContain("Income tax 4%");
  const read = recruit.readRecruitDialog();
  expect(read.candidates.map((c) => c.nationality)).toEqual([
    "Mali",
    "Mali",
    "Colombia",
    "Botswana",
  ]);
  const bouba = read.candidates[0].card
    .querySelector(".ss-recruit-value .lens-help")
    .getAttribute("title");
  // Production 4 and a hidden trait, 4% income tax, 2.6/day for 27 days.
  expect(bouba).toContain("Gold a day: +0.07 now, +0.53 after 20 days");
  expect(bouba).toContain("≈ +9.2 g in all");
  // stale books: the product is named, the game's point value used
  advisor.render({
    pointValue: { value: 0.1019, at },
    books,
    booksAt: "2000-01-01",
  });
  expect(headTip()).toContain(
    "steel: prices not read yet, output at the game's point value",
  );
  advisor.dispose();
  expect(document.querySelector("[data-lens]")).toBeNull();
});

it("removes nodes from replaced dialogs and clears advice when candidates disappear", () => {
  const advisor = recruit.createRecruit();
  const state = { pointValue: { value: 0.1019, at: new Date().toISOString() } };
  advisor.render(state);
  const old = document.querySelector('[role="dialog"]');
  document.body.innerHTML = readFileSync(
    "fixtures/v0273-live-recruit.html",
    "utf8",
  );
  advisor.render(state);
  expect(old.querySelector("[data-lens]")).toBeNull();
  document.querySelector('[role="dialog"] ul').remove();
  expect(recruit.readRecruitDialog()).toBeNull();
  advisor.render(state);
  expect(document.querySelector("[data-lens]")).toBeNull();
});

it("never identifies Recruit as a picker or sell form, or Sell items as Recruit", () => {
  expect(recruit.readRecruitDialog).toBeTypeOf("function");
  expect(findSellForm()).toBeNull();
  expect(pickerDialog()).toBeNull();
  document.body.innerHTML =
    '<div role="dialog">Sell items<img alt="gsg9Gloves"><input name="price-abc"><button>Sell</button></div>';
  expect(recruit.readRecruitDialog()).toBeNull();
  expect(pickerDialog()).toBeNull();
  expect(findSellForm()).toBeNull();
});

// v0.27.3 (live 2026-10-29): the candidates are the rows of a list with no Hire button of their own ("Pick a
// candidate" below), the wage chip sits in the stats row after Production, Responsibility and Luck, and the name
// is bare text beside the flag
it("reads and prices v0.27.3's candidate rows, which have no Hire button", () => {
  document.body.innerHTML = readFileSync(
    "fixtures/v0273-live-recruit.html",
    "utf8",
  );
  const read = recruit.readRecruitDialog();
  expect(
    read.candidates.map((c) => [
      c.name,
      c.age,
      c.wageDay,
      c.production,
      c.responsibility,
      c.hiddenTraits,
      c.nationality,
    ]),
  ).toEqual([
    ["Bouba Sall", 38, 2.6, 4, 4, 1, "Mali"],
    ["Marème Sow", 37, 2.25, 4, 1, 1, "Mali"],
    ["Ariadna Zamarripa Yunta", 31, 0.48, 1, 1, 1, "Colombia"],
    ["Masego Moalosi", 20, 1.27, 3, 1, 1, "Botswana"],
  ]);
  expect(read.roster).toEqual({ count: 1, capacity: 3 });
  expect(read.candidates.every((c) => c.card.tagName === "LI")).toBe(true);
  const buttons = [...document.querySelectorAll("button")];
  const clicks = buttons.map((b) => vi.spyOn(b, "click"));
  const advisor = recruit.createRecruit();
  advisor.render({
    pointValue: { value: 0.0943, at: new Date().toISOString() },
  });
  expect(document.querySelectorAll(".ss-recruit-value")).toHaveLength(4);
  const lines = read.candidates.map(
    (c) => c.card.querySelector(".ss-recruit-line").textContent,
  );
  // the shown Production, the card's own wage chip (+14.9%, −14.6%), and gold until 65
  expect(read.candidates.map((c) => c.wageChipShown)).toEqual([
    0.149, -0.008, -0.146, -0.249,
  ]);
  expect(lines).toEqual(["+11.9 g", "+16.1 g", "+12.7 g", "★ +43.2 g"]);
  // a hidden trait may be Greedy or Modest: the part of the wage it would carry, in the tooltip
  expect(
    read.candidates[0].card.querySelector(".lens-help").getAttribute("title"),
  ).toContain(
    "His chip without a hidden Greedy's or Modest's part: -4% to +15%",
  );
  expect(document.querySelectorAll("[data-ss-best]")).toHaveLength(1);
  expect(read.candidates[3].card.hasAttribute("data-ss-best")).toBe(true);
  for (const click of clicks) expect(click).not.toHaveBeenCalled();
  advisor.clear();
  expect(document.querySelectorAll(".ss-recruit-value")).toHaveLength(0);
});
