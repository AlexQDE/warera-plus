// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as recruit from "./recruit.mjs";
import { findSellForm } from "./sellform.mjs";
import { pickerDialog } from "./dom.mjs";

beforeEach(() => {
  document.body.innerHTML = readFileSync(
    "fixtures/v027-live-recruit.html",
    "utf8",
  );
});
afterEach(() => vi.restoreAllMocks());

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
  const candidate = recruit.readRecruitDialog().candidates[0];
  candidate.statsGroup.children[0].lastElementChild.textContent = "2";
  candidate.statsGroup.parentElement.insertAdjacentHTML(
    "beforeend",
    '<span role="img" aria-label="Bully"></span>',
  );
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
  expect(line()).toContain("team −3.3 g");
  expect(tip()).toContain(
    "Lionel Leannon: happiness −9.0 (Bully −10, shield 0.1), output −9.0%, −3.3 g in 20 d",
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
  lionel.happinessBreakdown.contributions.find(
    (item) => item.reason === "recentlyMoved",
  ).until = new Date(now - 1000).toISOString();
  document.body.insertAdjacentHTML(
    "afterbegin",
    '<div id="disabled"><a href="/company/c00000000000000000000001">Disabled Iron</a><img alt="iron"><button>Recruit 1/2</button></div>',
  );
  const candidate = recruit.readRecruitDialog().candidates[0];
  candidate.statsGroup.parentElement.insertAdjacentHTML(
    "beforeend",
    '<span role="img" aria-label="Foreman"></span>',
  );
  const advisor = recruit.createRecruit({ clock: () => now });
  document
    .querySelector("#disabled button")
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  advisor.render({
    now,
    pointValue: { value: 0.1012, at: new Date(now).toISOString() },
    employees: { rows, at: new Date(now - 120_000).toISOString() },
  });
  expect(
    candidate.card.querySelector(".ss-recruit-value .lens-help").title,
  ).toContain("happiness +1.2");
  advisor.dispose();
});

it("reads all four candidates, with no hidden trait invented when no badge exists", () => {
  expect(recruit.readRecruitDialog).toBeTypeOf("function");
  const read = recruit.readRecruitDialog();
  expect(read.roster).toMatchObject({ count: 0, capacity: 1 });
  expect(read.alone).toBe(true);
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
    ["Sherman Dach", 1.2, null, [], 0, 0, 32, null],
    ["Alexander Stroman", 2.82, null, [], 0, 0, 36, null],
    ["Joscha Gürbig", 1.88, 3, [], 0, 0, 34, null],
    ["Moaz Yassin", 1.58, null, ["gambler"], 0, 0, 23, null],
  ]);
});

it("separates hidden and untranslated trait badges, reads potential and team capacity", () => {
  expect(recruit.readRecruitDialog).toBeTypeOf("function");
  const moaz = recruit.readRecruitDialog().candidates[3];
  moaz.card.querySelector('[role="img"]').setAttribute("aria-label", "?");
  moaz.card
    .querySelector('[role="img"]')
    .parentElement.insertAdjacentHTML(
      "afterend",
      '<div role="img" aria-label="Untranslated trait"></div><span>Potential 4</span>',
    );
  const roster = [...document.querySelectorAll("span")].find(
    (e) => e.textContent === "Roster 0/1",
  );
  roster.textContent = "Roster 2/3";
  const read = recruit.readRecruitDialog();
  expect(read.alone).toBe(false);
  expect(read.candidates[3]).toMatchObject({
    traits: [],
    hiddenTraits: 1,
    unknownTraits: 1,
    potential: 4,
  });
});

it("reads a labelled gender icon and shown Responsibility without treating a country name as a nationality id", () => {
  const candidate = recruit.readRecruitDialog().candidates[0];
  candidate.card
    .querySelector('img[alt$=" flag"]')
    .insertAdjacentHTML("afterend", '<svg aria-label="Female"></svg>');
  expect(recruit.readRecruitDialog().candidates[0]).toMatchObject({
    gender: "female",
    responsibility: 1,
    nationality: "Mali",
  });
});

it("renders the fixture's wage inference and best pick without touching any game button", () => {
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
  const [sherman, alexander, joscha, moaz] = read.candidates;
  expect(line(sherman)).toBe("★ P2 · -2% · +6.3 g");
  expect(tip(sherman)).toContain("Production 2, read from his wage");
  expect(tip(sherman)).toContain("Wage chip once hired: -2%");
  expect(tip(sherman)).toContain(
    "Gold a day: +0.02 now, +0.27 after 20 days on the product",
  );
  expect(tip(sherman)).toContain("33 days to 65: ≈ +6.3 g in all");
  expect(line(alexander)).toBe("P4 · +15% · −1.8 g");
  expect(tip(alexander)).toContain("Loses gold over his working life");
  expect(line(joscha)).toBe("P3 · +2% · +6.1 g");
  expect(tip(joscha)).toContain("Production 3 (shown on his card)");
  expect(line(moaz)).toBe(
    "P2-3 · +29%…-14% · −4.7 g".replace("+29%…-14%", "-14%…+29%"),
  );
  expect(tip(moaz)).toContain("Production 2-3 from his wage (2: 60%, 3: 40%)");
  // the best pick's own card is outlined, and only it
  expect(sherman.card.hasAttribute("data-ss-best")).toBe(true);
  expect(document.querySelectorAll("[data-ss-best]")).toHaveLength(1);
  const header = document.querySelector(".ss-recruit-head");
  expect(header.textContent).toBe("WarEra Plus · ★ Sherman Dach?");
  const headTip = header.querySelector(".lens-help").getAttribute("title");
  expect(headTip).toContain("Point value 0.1019 (wages rest on it)");
  expect(headTip).toContain("Output at the game's point value");
  expect(headTip).toContain("Works alone (Roster 0/1)");
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
    expect(
      annotation.compareDocumentPosition(c.button) &
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
  const wage = [...read.candidates[1].card.querySelectorAll("span")].find((e) =>
    /\/ day$/.test(e.textContent),
  );
  wage.textContent = `${(6 * 0.1019 * 4 * 1.35).toFixed(2)} / day`;
  read.candidates[3].card
    .querySelector('[role="img"]')
    .setAttribute("aria-label", "?");
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
  // a hidden trait is a 1-in-35 chance of Flight Risk: noted, not flagged
  expect(tip(read.candidates[3])).not.toContain("Flight Risk");
  expect(tip(read.candidates[3])).toContain(
    "His ? trait is priced as an average hire's trait",
  );
  expect(tip(read.candidates[3])).toMatch(/Wage chip once hired: .* to /);
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

it("prices the pressed company's product at the bids, with its bonus and country", () => {
  // a company card as the Companies page draws it (read live 2026-10-26):
  // product image named by its code, the bonus chip, the region's flag
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
  expect(headTip()).toContain("Company bonus +4%");
  const read = recruit.readRecruitDialog();
  expect(read.candidates.map((c) => c.nationality)).toEqual([
    "Mali",
    "Mali",
    "Liechtenstein",
    "Tunisia",
  ]);
  const sherman = read.candidates[0].card
    .querySelector(".ss-recruit-value .lens-help")
    .getAttribute("title");
  // 6 x 0.0934 x 2 x (1.04 .. 1.24) against 1.2 a day; 33 days: +3.9
  expect(sherman).toContain("Gold a day: −0.03 now, +0.19 after 20 days");
  expect(sherman).toContain("≈ +3.9 g in all");
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

it("fails closed on a malformed candidate and removes nodes from replaced dialogs", () => {
  const advisor = recruit.createRecruit();
  const state = { pointValue: { value: 0.1019, at: new Date().toISOString() } };
  advisor.render(state);
  const old = document.querySelector('[role="dialog"]');
  document.body.innerHTML = readFileSync(
    "fixtures/v027-live-recruit.html",
    "utf8",
  );
  advisor.render(state);
  expect(old.querySelector("[data-lens]")).toBeNull();
  recruit
    .readRecruitDialog()
    .candidates[0].statsGroup.firstElementChild.remove();
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
