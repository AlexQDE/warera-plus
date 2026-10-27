// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as train from "./train.mjs";
import { readRecruitDialog } from "./recruit.mjs";
import { pickerDialog } from "./dom.mjs";

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

it("marks Negotiation as the pick for an expensive worker, one line under the cards", () => {
  const buttons = [...document.querySelectorAll("button")];
  const original = buttons.map((b) => b.outerHTML);
  const parents = buttons.map((b) => b.parentElement);
  const clicks = buttons.map((b) => vi.spyOn(b, "click"));
  const advisor = train.createTrain();
  const read = advisor.render(fresh());
  const line = document.querySelector(".ss-train-value[data-lens]");
  expect(line.previousElementSibling).toBe(read.row);
  const cells = [...line.querySelectorAll(".ss-train-cell")].map(
    (c) => c.textContent,
  );
  // Luck now prices the one future hand; Wild card includes its +1 Luck share.
  expect(cells).toEqual(["★ +7.6 g", "+0.2 g", "+2.9 g"]);
  const tip = line.querySelector(".lens-help").getAttribute("title");
  expect(tip).toContain(
    "★ Negotiation (-10%): +7.6 g - wage chip +13.8% → +3.8%: saves 0.30 g a day",
  );
  expect(tip).toContain("Intensive drill (+2): +0.2 g - +2 Luck");
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
  expect(cells[0]).toBe("★ +7.6 g");
  expect(cells[1]).toBe("−0.4 g");
  // a card of a kind the advisor does not know: "?" and never the pick
  read.cards[2].button.querySelector("p").textContent = "Brand new card";
  expect(train.readTrainDialog().cards).toHaveLength(2);
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
