// How close a piece's value comes to what it is worth, on synthetic markets
// where that worth is known: the stat-matched value with each sale alike
// brought to the piece's stats (similar.statSlopes) against the same value
// taking the prices as they are (the method before 3.6.0); then how often
// FLIP is right on markets that fall, without the market's fall, with it,
// and with the offers' cap.
//
//   node scripts/backtest-prices.mjs [--markets 12] [--pieces 120] [--listings 20] [--seed 99]
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
// alike count (matched), the ones that can earn a tag. The market's fall is
// left out here (trend: false), so the two differ by the stats alone.
//
// FLIP on markets that trend: flat, falling 3% or 6% a day, 15% down in the
// last 48 hours, rising 3% a day, for four of the items above, at the volumes
// above and at 1,000 sales a week (the most the extension reads). Each sale
// was listed a while before it sold (exponential, a 24-hour median).
// `listings` offers of random rolls are priced at their worth now times
// lognormal noise (10%). An offer is a real flip when it is worth 10% more
// than its price at resale: after the median listed-to-sold wait of the item's
// sales, with the market going on as it went (a fall keeps falling, the drop
// stays down, the rise keeps rising), since a piece bought now sells only
// then. FLIP at 10%, three ways: A, the value without the market's fall; C, as
// shipped (sales alike brought to today); C + cap, as shipped with offerCap
// over the listings (no tax). It prints how many tags were real flips
// (precision), how many real flips got a tag (recall) and how many tags there
// were.
//
// The markets are invented: this compares methods under stated assumptions,
// it does not measure the game.
import { similarValue, offerCap } from "../extension/lib/similar.mjs";
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
          const v = similarValue(code, skills, fills, {
            now: NOW,
            adjust,
            trend: false,
          });
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

// ---------- FLIP on markets that trend ----------
const LISTINGS = opt("--listings", 20);
const FLIP = 0.1;
const WAIT_MEDIAN = 24; // hours from listing to sale, the median of an exponential
// and a busy market: 1,000 sales a week, the most the extension reads (10 pages)
const FLIP_VOLUMES = [...VOLUMES, 1000];
/** Where the market stands `h` hours ago, in log price (0 now); a negative `h` is later than now. */
const TRENDS = [
  ["flat", () => 0],
  ["falling 3% a day", (h) => -Math.log(0.97) * (h / 24)],
  ["falling 6% a day", (h) => -Math.log(0.94) * (h / 24)],
  [
    "15% down in the last 48 h",
    (h) => -Math.log(0.85) * Math.min(1, Math.max(0, h / 48)),
  ],
  ["rising 3% a day", (h) => Math.log(0.97) * (h / 24)],
];
const FLIP_ITEMS = SCENARIOS.filter(([name]) =>
  [
    "jet: attack and crit pay",
    "sniper: attack and crit pay",
    "legendary boots: dodge pays",
    "epic chest: armor pays nothing",
  ].includes(name),
);

function trendingMarket(code, n, model, level) {
  const ranges = STAT_RANGES[code];
  const rollOf = () =>
    Object.fromEntries(Object.entries(ranges).map(([k, r]) => [k, roll(r)]));
  const fills = Array.from({ length: n }, () => {
    const hoursAgo = rnd() * 168;
    const skills = rollOf();
    const wait = -Math.log(Math.max(1e-12, rnd())) * (WAIT_MEDIAN / Math.LN2);
    return {
      price: Math.exp(
        Math.log(model.base) +
          worth(code, skills, model) +
          level(hoursAgo) +
          gauss() * model.sigma,
      ),
      at: new Date(NOW - hoursAgo * 3600e3).toISOString(),
      listedAt: new Date(NOW - (hoursAgo + wait) * 3600e3).toISOString(),
      code,
      skills,
    };
  }).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const worthAt = (skills, hoursAgo) =>
    model.base * Math.exp(worth(code, skills, model) + level(hoursAgo));
  const listings = Array.from({ length: LISTINGS }, () => {
    const skills = rollOf();
    return {
      code,
      skills,
      price: worthAt(skills, 0) * Math.exp(gauss() * 0.1),
    };
  });
  return { fills, worthAt, listings };
}

const WAYS = ["A", "C", "C + cap"];
const flipRows = [];
for (const [trend, level] of TRENDS)
  for (const n of FLIP_VOLUMES) {
    const count = Object.fromEntries(
      WAYS.map((w) => [w, { tags: 0, real: 0 }]),
    );
    const atBuy = { tags: 0, real: 0 }; // C + cap judged by the worth now, not at resale
    let real = 0;
    for (let m = 0; m < MARKETS; m++)
      for (const [, code, base, model] of FLIP_ITEMS) {
        const { fills, worthAt, listings } = trendingMarket(
          code,
          n,
          { base, ...model },
          level,
        );
        // a piece bought now is listed again and sells after the item's typical wait
        const resaleIn = median(
          fills.map(
            (f) => (Date.parse(f.at) - Date.parse(f.listedAt)) / 3600e3,
          ),
        );
        listings.forEach((l, i) => {
          const isReal = worthAt(l.skills, -resaleIn) >= l.price * (1 + FLIP);
          if (isReal) real++;
          const plain = similarValue(code, l.skills, fills, {
            now: NOW,
            trend: false,
          });
          const shipped = similarValue(code, l.skills, fills, { now: NOW });
          const cap = offerCap(code, l.skills, listings, i, 0)?.cap ?? Infinity;
          const tagged = (v, ceiling = Infinity) =>
            v.value != null &&
            v.matched &&
            Math.min(v.value, ceiling) >= l.price * (1 + FLIP);
          const tags = {
            A: tagged(plain),
            C: tagged(shipped),
            "C + cap": tagged(shipped, cap),
          };
          for (const w of WAYS)
            if (tags[w]) {
              count[w].tags++;
              if (isReal) count[w].real++;
            }
          if (tags["C + cap"]) {
            atBuy.tags++;
            if (worthAt(l.skills, 0) >= l.price * (1 + FLIP)) atBuy.real++;
          }
        });
      }
    flipRows.push({ trend, n, count, real, atBuy });
  }

const ratio = (a, b) => (b ? pct(a / b) : "    –");
console.log(
  `\nFLIP on markets that trend: ${MARKETS} markets per line of each of ${FLIP_ITEMS.length} items, ${LISTINGS} listings each, FLIP at +${FLIP * 100}%; a real flip is worth that much more at resale, after the item's median listed-to-sold wait`,
);
console.log(
  `${"market".padEnd(28)} sales  precision${WAYS.map((w) => w.padStart(8)).join("")}  recall${WAYS.map((w) => w.padStart(8)).join("")}  tags ${WAYS.join(" / ")}`,
);
for (const r of flipRows)
  console.log(
    `${r.trend.padEnd(28)} ${String(r.n).padStart(5)}           ${WAYS.map((w) => ratio(r.count[w].real, r.count[w].tags).padStart(8)).join("")}        ${WAYS.map((w) => ratio(r.count[w].real, r.real).padStart(8)).join("")}  ${WAYS.map((w) => r.count[w].tags).join(" / ")}`,
  );
const falling = flipRows.filter(
  (r) => r.trend !== "flat" && !r.trend.startsWith("rising"),
);
const sum = (rs, f) => rs.reduce((t, r) => t + f(r), 0);
console.log(
  `\nfalling markets, all volumes: precision ${WAYS.map(
    (w) =>
      `${w} ${ratio(
        sum(falling, (r) => r.count[w].real),
        sum(falling, (r) => r.count[w].tags),
      ).trim()}`,
  ).join(", ")}; recall ${WAYS.map(
    (w) =>
      `${w} ${ratio(
        sum(falling, (r) => r.count[w].real),
        sum(falling, (r) => r.real),
      ).trim()}`,
  ).join(", ")}`,
);
console.log(
  `C + cap's precision judged by the worth now instead of at resale: ${ratio(
    sum(falling, (r) => r.atBuy.real),
    sum(falling, (r) => r.atBuy.tags),
  ).trim()} on the falling markets (at resale: ${ratio(
    sum(falling, (r) => r.count["C + cap"].real),
    sum(falling, (r) => r.count["C + cap"].tags),
  ).trim()})`,
);
