// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as train from "./train.mjs";
import { readRecruitDialog } from "./recruit.mjs";
import { pickerDialog } from "./dom.mjs";
import { trainingValues } from "./hiring.mjs";

// SYNTHETIC: the Train window as the client code builds it, with the hand
// of a live screenshot (fixtures/v027-train-synthetic.html says so too)
beforeEach(() => {
  document.body.innerHTML = readFileSync(
    "fixtures/v027-train-synthetic.html",
    "utf8",
  );
});
afterEach(() => vi.restoreAllMocks());

const fresh = (value = 0.1012) => ({
  pointValue: { value, at: new Date().toISOString() },
});

const live = (name) => {
  document.body.innerHTML = readFileSync(
    `fixtures/v027-live-train-${name}.html`,
    "utf8",
  );
};

// The Employee window stays open before Train; the decimals are split by the game.
const employee = (name, wage = "2.87") => {
  const [whole, fraction] = wage.split(".");
  document.body.insertAdjacentHTML(
    "afterbegin",
    `<div role="dialog"><span>Employee</span><span>${name}</span><div><div><div>Daily output</div><div><div><div><svg></svg></div><span><span>25</span></span></div></div></div><div><div>Daily wage</div><div><div><div><svg></svg></div><span><span>${whole}<span>.${fraction}</span></span></span></div></div></div><div><div>Daily profit</div><div><div><div><div><svg></svg></div><span>+<div><div></div><div><span>0<span>.18</span></span></div></div></span></div></div></div></div></div></div>`,
  );
};

it.each([
  [
    "claudia",
    {
      production: 7,
      responsibility: 2,
      luck: 2,
      potential: 1,
      potentialMax: 10,
      wageChip: 0.183,
      bonus: 0.038,
      hiredDays: 0,
      age: 42,
      traits: ["laborer"],
      leadership: 3,
      wageDay: null,
    },
    [
      ["common", "Drill", "drill", 1, "luck"],
      ["common", "Negotiation", "negotiation", 5, null],
      ["common", "Drill", "drill", 1, "responsibility"],
    ],
  ],
  [
    "mohannad",
    {
      production: 4,
      responsibility: 3,
      luck: 1,
      potential: 1,
      potentialMax: 7,
      wageChip: -0.034,
      bonus: 0.042,
      hiredDays: 0,
      age: 33,
      traits: [],
      leadership: 3,
      wageDay: null,
    },
    [
      ["uncommon", "Wild card", "wild", null, null],
      ["uncommon", "Intensive drill", "drill", 2, "production"],
      ["uncommon", "Negotiation", "negotiation", 10, null],
    ],
  ],
])(
  "reads every header field and card in the live %s window",
  (name, trainee, cards) => {
    live(name);
    const read = train.readTrainDialog();
    expect(read).not.toBeNull();
    expect(read.trainee).toEqual(trainee);
    expect(
      read.cards.map((c) => [c.rarity, c.title, c.kind, c.delta, c.stat]),
    ).toEqual(cards);
    expect(read.boxes).toHaveLength(3);
  },
);

// Claudia's window again on 2026-10-28 with a legendary hand: a habit card teaching two traits is titled "Two new
// habits" (client module 3906: traitTo2 ? "Two new habits" : "New habit"), its caption in three text nodes.
it("reads the live legendary hand: Intensive drill +4, Second wind +4 and Two new habits, one cell above each card", () => {
  live("legendary");
  const read = train.readTrainDialog();
  expect(read.trainee).toEqual({
    production: 7,
    responsibility: 2,
    luck: 3,
    potential: 2,
    potentialMax: 10,
    wageChip: 0.183,
    bonus: 0.098,
    hiredDays: 0,
    age: 42,
    traits: ["laborer"],
    leadership: 3,
    wageDay: null,
  });
  expect(
    read.cards.map((c) => [c.rarity, c.title, c.kind, c.delta, c.stat]),
  ).toEqual([
    ["legendary", "Intensive drill", "drill", 4, "responsibility"],
    ["legendary", "Second wind", "secondWind", 4, null],
    ["legendary", "Two new habits", "habit", null, null],
  ]);
  expect(read.cards[2]).toMatchObject({
    traitTo: ["quickStudy", "sprinter"],
    trait: null,
  });
  expect(read.boxes).toHaveLength(3);
  const advisor = train.createTrain();
  advisor.render(fresh());
  // 23 days to 65 and 8 trainings already left: four more would each fetch about this hand's best other card
  // weighted by the days left (2.7 g) for 10 energy (4.5 g), so Second wind is worth nothing to her
  expect(
    [...document.querySelectorAll(".ss-train-value .ss-train-cell")].map(
      (c) => c.textContent,
    ),
  ).toEqual([
    "+0.21 g/day4.7 g in 23 d",
    "≈ 0 g+4 trainings",
    "★ +0.21 g/day4.9 g in 23 d",
  ]);
  expect(read.boxes[2].hasAttribute("data-ss-best")).toBe(true);
  // Second wind is priced against the best other card of the hand, now the habit: with output worth three times
  // as much, the habit's hand makes its trainings worth more than the drill's alone would
  const wind = (cards) =>
    trainingValues(cards, read.trainee, { pointValue: 0.3 }).values[1].gold;
  expect(wind(read.cards)).toBeGreaterThan(wind(read.cards.slice(0, 2)));
  advisor.clear();
});

it("uses only the matching Employee dialog's daily wage for Claudia's paid Production", () => {
  live("claudia");
  const fallback = trainingValues(
    train.readTrainDialog()?.cards ?? [],
    { production: 7, wageChip: 0.183, age: 42 },
    { pointValue: 0.1012 },
  );
  expect(fallback.values[1].gold).toBeCloseTo(23 * 6 * 0.1012 * 7 * 0.05, 9);
  employee("Someone Else", "9.99");
  expect(train.readTrainDialog()?.trainee.wageDay).toBeNull();
  employee("Claudia Heathcote");
  const read = train.readTrainDialog();
  expect(read.trainee.wageDay).toBe(2.87);
  const result = trainingValues(read.cards, read.trainee, {
    pointValue: 0.1012,
  });
  expect(result.values[1].gold).toBeCloseTo(2.79312, 6);
  expect(result.values[1].perDay).toBeCloseTo(0.12144, 6);
  expect(result.best).toBe(1);
  train.createTrain().render(fresh());
  expect(document.querySelector(".lens-help").title).toContain(
    "paid on Production 4, 7 with traits",
  );
});

it("keeps live card badges, stat groups and percentages out of the employee header", () => {
  live("mohannad");
  const wild = document.querySelector('[type="button"]');
  wild.querySelector('[role="img"]').setAttribute("aria-label", "Greedy");
  wild.insertAdjacentHTML(
    "beforeend",
    "<div><div><svg></svg>99</div><div><svg></svg>98</div><div><svg></svg>97</div></div><span>8/15</span>",
  );
  const read = train.readTrainDialog();
  expect(read.trainee).toMatchObject({
    production: 4,
    traits: [],
    potential: 1,
    potentialMax: 7,
    wageChip: -0.034,
  });
  const wage = [...document.querySelectorAll("span")].find(
    (e) => e.textContent === "-3.4%",
  );
  wage.remove();
  expect(train.readTrainDialog().trainee.wageChip).toBeNull();
});

it("reads role button cards and leaves a taught trait on its own Habit card", () => {
  live("mohannad");
  for (const card of document.querySelectorAll('div[type="button"]')) {
    card.removeAttribute("type");
    card.setAttribute("role", "button");
  }
  const wild = document.querySelector('[role="button"]');
  [...wild.querySelectorAll("span")].find(
    (e) => e.textContent === "Wild card",
  ).textContent = "New habit";
  [...wild.querySelectorAll("span")].find(
    (e) => e.textContent === "Random trait, +1 random stat",
  ).textContent = "Handy";
  wild.querySelector('[role="img"]').setAttribute("aria-label", "Handy");
  const read = train.readTrainDialog();
  expect(read.trainee.traits).toEqual([]);
  expect(read.cards[0]).toMatchObject({
    kind: "habit",
    traitTo: ["handy"],
    trait: null,
  });
});

it("prints tiny daily streams as approximately zero, and Second wind as total plus extra trainings", () => {
  const read = train.readTrainDialog();
  read.cards[0] = { ...read.cards[0], kind: "secondWind", delta: 2 };
  document.body.innerHTML = train.trainHtml(
    read,
    {
      best: 0,
      horizon: 25,
      values: [
        { gold: 0.83, perDay: null, hands: 2, note: "extra hands" },
        { gold: 0.1, perDay: 0.004, note: "small stream" },
        { gold: 0, perDay: 0, note: "no gain" },
      ],
    },
    0.1012,
  );
  const cells = [...document.querySelectorAll(".ss-train-cell")];
  expect(cells[0].querySelector("strong").textContent).toBe("★ +0.83 g");
  expect(cells[0].querySelector("small").textContent).toBe("+2 trainings");
  expect(cells[1].querySelector("strong").textContent).toBe("≈ 0 g/day");
  expect(cells[2].querySelector("strong").textContent).toBe("≈ 0 g/day");
});

it("renders above live cards without clicks and moves its existing line after a rerender", () => {
  live("claudia");
  const clicks = vi.spyOn(window.HTMLElement.prototype, "click");
  const advisor = train.createTrain();
  const read = advisor.render(fresh());
  const originals = read.cards.map((c) => c.button.outerHTML);
  const line = document.querySelector(".ss-train-value");
  expect(line.nextElementSibling).toBe(read.row);
  const cells = [...line.querySelectorAll(".ss-train-cell")];
  expect(cells[0].querySelector("strong").textContent).toMatch(
    /^\+\d+\.\d{2} g$/,
  );
  expect(cells[0].querySelector("small").textContent).toBe("9 trainings");
  expect(cells[1].querySelector("strong").textContent).toMatch(
    /^★ \+\d+\.\d{2} g\/day$/,
  );
  expect(cells[1].querySelector("small").textContent).toBe("4.9 g in 23 d");
  expect(read.boxes[1].hasAttribute("data-ss-best")).toBe(true);
  read.row.insertAdjacentElement("afterend", line);
  advisor.render(fresh());
  expect(line.nextElementSibling).toBe(read.row);
  expect(read.cards.map((c) => c.button.outerHTML)).toEqual(originals);
  expect(clicks).not.toHaveBeenCalled();
});

it("reads the employee and the three dealt cards", () => {
  const read = train.readTrainDialog();
  expect(read.trainee).toEqual({
    production: 5,
    responsibility: 1,
    luck: 1,
    potential: 1,
    potentialMax: 3,
    wageChip: 0.138,
    bonus: 0.009,
    hiredDays: 0,
    age: 40,
    traits: [],
    leadership: null,
    wageDay: null,
  });
  expect(
    read.cards.map((c) => [c.rarity, c.title, c.kind, c.delta, c.stat]),
  ).toEqual([
    ["uncommon", "Negotiation", "negotiation", 10, null],
    ["uncommon", "Intensive drill", "drill", 2, "luck"],
    ["uncommon", "Wild card", "wild", null, null],
  ]);
  expect(read.boxes).toHaveLength(3);
  expect(readRecruitDialog()).toBeNull();
  expect(pickerDialog()).toBeNull();
});

it("reads potential only from the header and uses null when it is missing", () => {
  const chip = [...document.querySelectorAll("span")].find(
    (e) => e.textContent === "1/3",
  );
  chip.textContent = "1 / 3";
  expect(train.readTrainDialog().trainee).toMatchObject({
    potential: 1,
    potentialMax: 3,
  });
  chip.remove();
  const fake = document.createElement("span");
  fake.textContent = "2/9";
  train.readTrainDialog().cards[0].button.append(fake);
  expect(train.readTrainDialog().trainee).toMatchObject({
    potential: null,
    potentialMax: null,
  });
  const advisor = train.createTrain();
  advisor.render(fresh());
  expect(document.querySelector(".lens-help").getAttribute("title")).toContain(
    "trainings left not read",
  );
});

it("marks Negotiation as the pick for an expensive worker, one line above the cards", () => {
  const buttons = [...document.querySelectorAll("button")];
  const original = buttons.map((b) => b.outerHTML);
  const parents = buttons.map((b) => b.parentElement);
  const clicks = buttons.map((b) => vi.spyOn(b, "click"));
  const advisor = train.createTrain();
  const read = advisor.render(fresh());
  const line = document.querySelector(".ss-train-value[data-lens]");
  expect(line.nextElementSibling).toBe(read.row);
  const cells = [...line.querySelectorAll(".ss-train-cell")].map((c) => [
    c.querySelector("strong").textContent,
    c.querySelector("small").textContent,
  ]);
  // The 1/3 includes this hand, leaving two future trainings, weighted by time.
  expect(cells).toEqual([
    ["★ +0.30 g/day", "7.6 g in 25 d"],
    ["+0.34 g", "2 trainings"],
    ["+0.12 g/day", "2.9 g in 25 d"],
  ]);
  const tip = line.querySelector(".lens-help").getAttribute("title");
  expect(tip).toContain(
    "★ Negotiation (-10%): +7.59 g, +0.30 g/day - wage chip +13.8% → +3.8%: saves 0.30 g a day",
  );
  expect(tip).toContain("Intensive drill (+2): +0.34 g - +2 Luck");
  expect(tip).toContain("Leadership was not read; odds use 0");
  expect(tip).toContain("25 days counted");
  // the best card's own box is outlined, and only it
  expect(read.boxes[0].hasAttribute("data-ss-best")).toBe(true);
  expect(document.querySelectorAll("[data-ss-best]")).toHaveLength(1);
  for (const [i, b] of buttons.entries()) {
    expect(b.outerHTML).toBe(original[i]);
    expect(b.parentElement).toBe(parents[i]);
    expect(clicks[i]).not.toHaveBeenCalled();
  }
  // a second render rewrites nothing that did not change
  const first = line.firstChild;
  advisor.render(fresh());
  expect(document.querySelectorAll(".ss-train-value")).toHaveLength(1);
  expect(line.firstChild).toBe(first);
  advisor.clear();
  expect(document.querySelector("[data-lens]")).toBeNull();
  expect(document.querySelector("[data-ss-best]")).toBeNull();
});

it("waits for the point value and never marks a card meanwhile", () => {
  const advisor = train.createTrain();
  advisor.render({});
  expect(document.querySelector(".ss-train-value").textContent).toContain(
    "reading point value",
  );
  expect(document.querySelector("[data-ss-best]")).toBeNull();
  advisor.render({ pointValue: { value: 0.1012, at: "2000-01-01" } });
  expect(document.querySelector("[data-ss-best]")).toBeNull();
});

it("reads a Production drill by its icon, a taught trait, and leaves an unknown card unpriced", () => {
  const [, drill, wild] = train.readTrainDialog().cards;
  // the drill's icon becomes Production's: +2 Production on a worker asking 113.8%
  for (const path of drill.button.querySelectorAll("path"))
    path.setAttribute("d", "M-production");
  // the wild card becomes a New habit teaching Specialist
  wild.button.querySelector("p").textContent = "New habit";
  wild.button
    .querySelector('[role="img"]')
    .setAttribute("aria-label", "Specialist");
  wild.button.querySelectorAll("p")[1].textContent = "Specialist";
  const read = train.readTrainDialog();
  expect(read.cards[1]).toMatchObject({ kind: "drill", stat: "production" });
  expect(read.cards[2]).toMatchObject({
    kind: "habit",
    traitTo: ["specialist"],
    trait: null,
  });
  const advisor = train.createTrain();
  advisor.render(fresh());
  const cells = [
    ...document.querySelectorAll(".ss-train-value .ss-train-cell"),
  ].map((c) => c.textContent);
  expect(cells[0]).toBe("★ +0.30 g/day7.6 g in 25 d");
  expect(cells[1]).toBe("−0.02 g/day−0.4 g in 25 d");
  // a card of a kind the advisor does not know keeps its place: "?" above it and never the pick
  read.cards[2].button.querySelector("p").textContent = "Brand new card";
  const unknown = train.readTrainDialog();
  expect(unknown.cards.map((c) => [c.title, c.kind])).toEqual([
    ["Negotiation", "negotiation"],
    ["Intensive drill", "drill"],
    ["Brand new card", null],
  ]);
  expect(unknown.boxes).toHaveLength(3);
  advisor.render(fresh());
  const after = [
    ...document.querySelectorAll(".ss-train-value .ss-train-cell"),
  ];
  expect(after.map((c) => c.textContent)[2]).toBe("?");
  expect(unknown.boxes[2].hasAttribute("data-ss-best")).toBe(false);
});

it("reads two taught traits from an 'A and B' caption and a removed one from 'Remove A'", () => {
  const wild = train.readTrainDialog().cards[2].button;
  wild.querySelector("p").textContent = "New habit";
  wild.querySelectorAll("p")[1].textContent = "Specialist and Handy";
  expect(train.readTrainDialog().cards[2]).toMatchObject({
    kind: "habit",
    traitTo: ["specialist", "handy"],
  });
  wild.querySelector("p").textContent = "Rehab";
  wild.querySelectorAll("p")[1].textContent = "Remove Handy";
  expect(train.readTrainDialog().cards[2]).toMatchObject({
    kind: "rehab",
    trait: "handy",
  });
});

it("says why no card is valued: a hidden Production, a stale point value", () => {
  const advisor = train.createTrain();
  advisor.render({ pointValue: { value: 0.1012, at: "2000-01-01" } });
  expect(document.querySelector(".ss-train-value").textContent).toContain(
    "point value is stale",
  );
  const chips = [...document.querySelectorAll("[aria-haspopup] span")];
  chips.find((e) => e.textContent === "5").textContent = "?";
  advisor.render(fresh());
  expect(document.querySelector(".ss-train-value").textContent).toContain(
    "his Production is hidden",
  );
  expect(document.querySelector("[data-ss-best]")).toBeNull();
});

it("reads a drill's stat from the icons after its title, never the title's own icon", () => {
  const drill = train.readTrainDialog().cards[1].button;
  // the card's title icon draws like Production's pickaxe
  drill.querySelector(":scope > svg path").setAttribute("d", "M-production");
  expect(train.readTrainDialog().cards[1].stat).toBe("luck");
});

it("tells the wage chip from the bonus chip by icon, and reads a worker without a bonus chip", () => {
  const chips = [...document.querySelectorAll("[aria-haspopup] span")];
  const bonus = chips.find((e) => e.textContent === "+0.9%").parentElement;
  // the game prints the bonus chip only when he has one
  bonus.remove();
  expect(train.readTrainDialog().trainee).toMatchObject({
    bonus: 0,
    wageChip: 0.138,
  });
  // a chip at exactly 0 reads "Market rate"
  const wage = [...document.querySelectorAll("[aria-haspopup] span")].find(
    (e) => e.textContent === "+13.8%",
  );
  wage.textContent = "Market rate";
  expect(train.readTrainDialog().trainee.wageChip).toBe(0);
});

it("shows nothing while the window does not read", () => {
  document.querySelector('[role="dialog"] button').remove();
  const stats = [...document.querySelectorAll("[aria-haspopup]")][0];
  stats.remove();
  expect(train.readTrainDialog()).toBeNull();
  const advisor = train.createTrain();
  expect(advisor.render(fresh())).toBeNull();
  expect(document.querySelector("[data-lens]")).toBeNull();
});
