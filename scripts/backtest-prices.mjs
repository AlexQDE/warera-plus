// How close a piece's value comes to what it is worth, on synthetic markets
// where that worth is known: the stat-matched value with each sale alike
// brought to the piece's stats (similar.statSlopes) against the same value
// taking the prices as they are (the method before 3.6.0).
//
//   node scripts/backtest-prices.mjs [--markets 12] [--pieces 120] [--seed 99]
//
// A market is a week of sales of one item. A sale's price is the item's base
// price times exp(what its stats are worth + where the market stood that hour
// + noise): the stats' worth is linear in each stat's share of its range, or
// flat with a step at the top crit (what the codex reports for jets), or
// nothing at all; the market drifts day by day (3% a day); the noise is
// lognormal (8-12%). Rolls are uniform. A piece's worth is the same formula
// now, without noise. For each scenario and weekly volume (60, 200, 600
// sales) it values `pieces` random pieces on each of `markets` markets and
// prints the mean of the markets' median |log(value / worth)|, over all
// pieces and over the top fifth of the roll. Only values resting on sales
// alike count (matched), the ones that can earn a tag. The markets are
// invented: this compares the two methods under stated assumptions, it does
// not measure the game.
import { similarValue } from "../extension/lib/similar.mjs";
import { STAT_RANGES } from "../extension/lib/stats.mjs";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? Number(args[i + 1]) : fallback;
};
const MARKETS = opt("--markets", 12);
const PIECES = opt("--pieces", 120);
let seed = opt("--seed", 99);
const rnd = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
const gauss = () =>
  Math.sqrt(-2 * Math.log(Math.max(1e-12, rnd()))) *
  Math.cos(2 * Math.PI * rnd());
const NOW = Date.parse("2026-10-17T12:00:00Z");
const roll = ([lo, hi]) => lo + Math.floor(rnd() * (hi - lo + 1));
const share = ([lo, hi], v) => (v - lo) / Math.max(1, hi - lo);

/** What stats are worth on a market: linear betas per stat, plus a step at a stat's top value. */
function worth(code, skills, { betas, step }) {
  const ranges = STAT_RANGES[code];
  let w = 0;
  for (const [k, b] of Object.entries(betas))
    w += b * share(ranges[k], skills[k]);
  if (step && skills[step.stat] === ranges[step.stat][1]) w += step.size;
  return w;
}

function market(code, n, model) {
  const ranges = STAT_RANGES[code];
  // the market's level by hour: a daily random walk, linear between days
  const days = Array.from({ length: 9 }, () => gauss() * model.drift);
  for (let i = 1; i < days.length; i++) days[i] += days[i - 1];
  const level = (hoursAgo) => {
    const d = (168 - hoursAgo) / 24;
    const i = Math.min(days.length - 2, Math.floor(d));
    return days[i] + (days[i + 1] - days[i]) * (d - i);
  };
  const fills = Array.from({ length: n }, () => {
    const hoursAgo = rnd() * 168;
    const skills = Object.fromEntries(
      Object.entries(ranges).map(([k, r]) => [k, roll(r)]),
    );
    return {
      price: Math.exp(
        Math.log(model.base) +
          worth(code, skills, model) +
          level(hoursAgo) +
          gauss() * model.sigma,
      ),
      at: new Date(NOW - hoursAgo * 3600e3).toISOString(),
      code,
      skills,
    };
  }).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const truth = (skills) =>
    model.base * Math.exp(worth(code, skills, model) + level(0));
  return { fills, truth };
}

const linear = (betas, sigma = 0.08) => ({ betas, sigma, drift: 0.03 });
const SCENARIOS = [
  [
    "jet: attack and crit pay",
    "jet",
    380,
    linear({ attack: 0.6, criticalChance: 0.3 }),
  ],
  [
    "jet: attack pays, crit only at 50",
    "jet",
    380,
    {
      ...linear({ attack: 0.6 }),
      step: { stat: "criticalChance", size: 0.17 },
    },
  ],
  ["jet: stats pay nothing", "jet", 380, linear({}, 0.1)],
  [
    "sniper: attack and crit pay",
    "sniper",
    55,
    linear({ attack: 0.5, criticalChance: 0.4 }),
  ],
  [
    "tank: stats pay a little",
    "tank",
    120,
    linear({ attack: 0.2, criticalChance: 0.1 }, 0.12),
  ],
  ["legendary boots: dodge pays", "boots5", 130, linear({ dodge: 0.8 }, 0.1)],
  [
    "mythic helmet: crit damage pays",
    "helmet6",
    420,
    linear({ criticalDamages: 0.8 }, 0.1),
  ],
  ["epic chest: armor pays nothing", "chest4", 30, linear({}, 0.12)],
];
const VOLUMES = [60, 200, 600];

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
};
const mean = (xs) => {
  const ok = xs.filter(Number.isFinite);
  return ok.reduce((a, b) => a + b, 0) / ok.length;
};
const pct = (v) => `${(v * 100).toFixed(1)}%`.padStart(6);

const rows = [];
for (const [name, code, base, model] of SCENARIOS)
  for (const n of VOLUMES) {
    const r = {
      name,
      n,
      plain: [],
      adjusted: [],
      plainTop: [],
      adjustedTop: [],
    };
    for (let m = 0; m < MARKETS; m++) {
      const { fills, truth } = market(code, n, { base, ...model });
      const ranges = STAT_RANGES[code];
      const errs = { plain: [], adjusted: [], plainTop: [], adjustedTop: [] };
      for (let i = 0; i < PIECES; i++) {
        const skills = Object.fromEntries(
          Object.entries(ranges).map(([k, rg]) => [k, roll(rg)]),
        );
        const top =
          Object.entries(ranges).reduce(
            (s, [k, rg]) => s + share(rg, skills[k]),
            0,
          ) /
            Object.keys(ranges).length >=
          0.8;
        for (const adjust of [false, true]) {
          const v = similarValue(code, skills, fills, { now: NOW, adjust });
          if (v.value == null || !v.matched) continue;
          const e = Math.abs(Math.log(v.value / truth(skills)));
          const k = adjust ? "adjusted" : "plain";
          errs[k].push(e);
          if (top) errs[`${k}Top`].push(e);
        }
      }
      for (const k of Object.keys(errs)) r[k].push(median(errs[k]));
    }
    rows.push(r);
  }

console.log(
  `${MARKETS} markets per line, ${PIECES} pieces each; mean of the markets' median |log(value / worth)|, as it was -> brought to the piece's stats`,
);
console.log(`${"market".padEnd(36)} sales      all pieces          top fifth`);
for (const r of rows)
  console.log(
    `${r.name.padEnd(36)} ${String(r.n).padStart(5)}   ${pct(mean(r.plain))} -> ${pct(mean(r.adjusted))}   ${pct(mean(r.plainTop))} -> ${pct(mean(r.adjustedTop))}`,
  );
const all = (k) => mean(rows.map((r) => mean(r[k])));
console.log(
  `\nall markets: ${pct(all("plain"))} -> ${pct(all("adjusted"))}; top fifth ${pct(all("plainTop"))} -> ${pct(all("adjustedTop"))}`,
);
