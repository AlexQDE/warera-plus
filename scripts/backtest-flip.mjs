// FLIP on the game's own sales: how often a FLIP tag would have been right on
// an item's market over the last days, four ways: A, the value without the
// market's fall (as before 3.12.0); C, sales alike brought down to today's
// level by the market's fall; C + cap, C no higher than the second cheapest
// offer of stats at least as good (as shipped); C + cap + fall, C carried on
// down by the same fall to the moment a piece bought now would sell again
// (the item's median listed-to-sold wait, 48 hours at most), then capped as
// C + cap. The extension does not do the last: this is the check of whether
// it should. The sales feed answers only an API key, so this runs with yours,
// from the environment; it only reads.
//
//   WARERA_API_KEY=<key> node scripts/backtest-flip.mjs [codes…] [--days 7] [--every 6] [--tax 0] [--flip 10] [--pick 4] [--pages 80] [--help]
//
// Without codes it reads every item's last 7 days as the extension does (10
// pages at most), prints how much each market fell a day as C reads it, and
// checks the `pick` that fell most, of those that sold 100 or more.
//
// A check reads `days` + 7 days of the item's sales and walks moments `every`
// hours apart over the last `days`. At a moment T it holds what the extension
// held: the item's sales of the 7 days before T (the newest 1,000), and the
// offers on the market at T as far as the sales tell them: every piece listed
// before T that sold after it, at the price it sold for. The feed has no
// offer that was withdrawn or is still open, so the market held more offers
// than these and a cap at T was no higher than here (the page's cap looks
// over the cards loaded, this one over every offer found). An offer costs its
// price plus `tax`% (your country's market tax, as the market's notice prints
// it); FLIP is a value `flip`% or more above that. A tag was real when the
// piece would have sold for that much at resale: the median of the sales
// alike (same or similar stats, brought to the piece's stats) in the 24 hours
// around T + the item's median listed-to-sold wait, the offer's own sale left
// out; an offer with too few such sales is not judged. Lost gold: tags that
// would have sold for less than they cost.
//
// --help, an option it does not know and an option without a number in its
// range print the usage and leave before the key is looked at or anything is
// read.
import { fetchSales, holdUntil } from "../extension/lib/api.mjs";
import {
  similarValue,
  offerCap,
  marketTrend,
  statSlopes,
  WINDOW_HOURS,
} from "../extension/lib/similar.mjs";
import { comparableFills } from "../extension/lib/resale.mjs";
import { STAT_RANGES } from "../extension/lib/stats.mjs";

/** C + cap + fall carries C down over the item's median listed-to-sold wait, this long at most. */
const MAX_FALL_HOURS = 48;
/** The options: each takes a number, with its default and the range it may take. */
const OPTIONS = {
  days: { value: 7, want: "a number of days above 0", ok: (n) => n > 0 },
  every: { value: 6, want: "a number of hours above 0", ok: (n) => n > 0 },
  tax: {
    value: 0,
    want: "a rate from 0 to 100",
    ok: (n) => n >= 0 && n <= 100,
  },
  flip: {
    value: 10,
    want: "a margin from -50 to 500, as the settings take",
    ok: (n) => n >= -50 && n <= 500,
  },
  pick: {
    value: 4,
    want: "a whole number from 1",
    ok: (n) => Number.isInteger(n) && n >= 1,
  },
  pages: {
    value: 80,
    want: "a whole number from 1",
    ok: (n) => Number.isInteger(n) && n >= 1,
  },
};
const USAGE = `Usage: WARERA_API_KEY=<key> node scripts/backtest-flip.mjs [codes…] [options]

How often FLIP would have been right at resale on the game's own sales: A, the
value without the market's fall; C, sales alike brought down to today; C + cap,
as shipped; C + cap + fall, C carried on down to the resale (the median
listed-to-sold wait, ${MAX_FALL_HOURS} h at most) before the cap, which the extension does
not do. Without codes, every item's last 7 days are read and the ones that
fell most are checked. It only reads.

Options:
  --days <n>    days of moments replayed (${OPTIONS.days.value})
  --every <h>   hours between moments (${OPTIONS.every.value})
  --tax <pct>   your country's market tax, paid on top of an offer's price (${OPTIONS.tax.value})
  --flip <pct>  the FLIP margin (${OPTIONS.flip.value})
  --pick <n>    how many of the items that fell a scan checks (${OPTIONS.pick.value})
  --pages <n>   pages of 100 sales read for an item at most (${OPTIONS.pages.value})
  -h, --help    this text; nothing is read

Codes: ${Object.keys(STAT_RANGES).join(" ")}`;

/** The usage, and out: on stdout for --help, on stderr after what was wrong. Nothing has been read. */
function usage(problem = null) {
  if (problem) console.error(`${problem}\n\n${USAGE}`);
  else console.log(USAGE);
  process.exit(problem ? 1 : 0);
}

const codes = [];
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "-h" || a === "--help") usage();
  if (a.startsWith("-")) {
    const name = a.slice(2);
    if (!a.startsWith("--") || !Object.hasOwn(OPTIONS, name))
      usage(`Unknown option ${a}.`);
    const raw = args[++i];
    const n = raw == null || raw.trim() === "" ? NaN : Number(raw);
    if (!Number.isFinite(n) || !OPTIONS[name].ok(n))
      usage(
        `${a} takes ${OPTIONS[name].want}${raw == null ? "" : `, not ${raw}`}.`,
      );
    OPTIONS[name].value = n;
  } else if (!Object.hasOwn(STAT_RANGES, a)) usage(`${a} is no item code.`);
  else codes.push(a);
}
const DAYS = OPTIONS.days.value;
const EVERY = OPTIONS.every.value;
const TAX = OPTIONS.tax.value;
const FLIP = OPTIONS.flip.value / 100;
const PICK = OPTIONS.pick.value;
const PAGES = OPTIONS.pages.value;
const KEY = process.env.WARERA_API_KEY ?? "";
const READ_PAGES = 10; // the extension's read: the newest 1,000 sales of 7 days
const MIN_CHECK_SALES = 100; // a scan checks no market that sold fewer in 7 days
const RESALE_HOURS = 24; // the window around the resale moment a piece's worth is read over
const H = 3600e3;
const NOW = Date.now();

if (!KEY) {
  console.error(
    "WARERA_API_KEY is not set: the sales feed answers no request without a key.",
  );
  process.exit(1);
}

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};
const ratio = (a, b) => (b ? `${((a / b) * 100).toFixed(1)}%` : "–");
const signed = (v) =>
  v == null ? "–" : `${v < 0 ? "−" : "+"}${Math.abs(v * 100).toFixed(1)}%`;
const when = (t) => new Date(t).toISOString().slice(5, 16).replace("T", " ");

/** One item's sales over the last `hours`, newest first; a rate limit is waited out. */
async function read(code, hours, maxPages) {
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetchSales(globalThis.fetch, KEY, code, {
        hours,
        maxPages,
        now: NOW,
        timeoutMs: 30_000,
      });
      return {
        complete: r.complete,
        fills: comparableFills(r.fills, { code, hours, now: NOW }),
      };
    } catch (e) {
      if (e?.code !== "rate-limited" || attempt >= 5) throw e;
      const ms = Math.max(0, holdUntil(e.retryAfter) - Date.now());
      console.error(`  rate limited: waiting ${Math.ceil(ms / 1000)} s`);
      await new Promise((resolve) => setTimeout(resolve, ms));
    }
  }
}

/** Every item's last 7 days, as the extension reads them; the codes to check. */
async function scan() {
  console.log(
    `\nNo codes named: every item's last 7 days (${READ_PAGES} pages at most, as the extension reads them)`,
  );
  const rows = [];
  for (const code of Object.keys(STAT_RANGES)) {
    const { fills, complete } = await read(code, WINDOW_HOURS, READ_PAGES);
    rows.push({
      code,
      sales: fills.length,
      complete,
      ...marketTrend(code, fills),
    });
  }
  rows.sort((a, b) => a.log - b.log || b.sales - a.sales);
  const picked = rows
    .filter((r) => r.log < 0 && r.sales >= MIN_CHECK_SALES)
    .slice(0, PICK)
    .map((r) => r.code);
  console.log(`${"item".padEnd(8)} ${"sales".padStart(6)}  fall a day (C)`);
  for (const r of rows)
    console.log(
      `${r.code.padEnd(8)} ${`${r.sales}${r.complete ? "" : "+"}`.padStart(6)}  ${(r.log < 0 ? signed(r.perDay) : "none").padStart(14)}  ${r.n ? `from ${r.n} sales on ${r.days} days` : ""}${picked.includes(r.code) ? "  <- checked" : ""}`,
    );
  if (!picked.length)
    console.log(
      `No market of ${MIN_CHECK_SALES} sales or more fell; name codes to check them anyway.`,
    );
  return picked;
}

const WAYS = ["A", "C", "C + cap", "C + cap + fall"];

/** Walk one item's last `DAYS` and count each way's tags against what the pieces sold for at resale. */
async function check(code) {
  const { fills: all, complete } = await read(code, (DAYS + 7) * 24, PAGES);
  /** What the extension held at `t`: the newest 1,000 sales of the 7 days before it. */
  const heldAt = (t) =>
    comparableFills(all, { code, hours: WINDOW_HOURS, now: t }).slice(
      0,
      READ_PAGES * 100,
    );
  const count = Object.fromEntries(
    WAYS.map((w) => [w, { tags: 0, real: 0, lost: 0, gains: [] }]),
  );
  const waits = [];
  const pieces = new Set();
  let first = null;
  let last = null;
  let late = 0; // moments whose resale is still to come
  let seen = 0;
  let judged = 0;
  let real = 0;
  for (let t = NOW - DAYS * 24 * H; t <= NOW; t += EVERY * H) {
    const held = heldAt(t);
    const wait = median(
      held
        .map((f) =>
          f.listedAt ? (Date.parse(f.at) - Date.parse(f.listedAt)) / H : NaN,
        )
        .filter((h) => Number.isFinite(h) && h >= 0),
    );
    if (wait == null) continue;
    // a piece bought at t is listed again and sells about the item's median wait later
    const resaleEnd = t + (wait + RESALE_HOURS / 2) * H;
    if (resaleEnd > NOW) {
      late++;
      continue;
    }
    first ??= t;
    last = t;
    waits.push(wait);
    // C + cap + fall: C's fall carried on to the resale, over the wait (MAX_FALL_HOURS at most)
    const toResale = Math.exp(
      (marketTrend(code, held).log * Math.min(wait, MAX_FALL_HOURS)) / 24,
    );
    const book = all
      .filter(
        (f) =>
          f.listedAt &&
          Date.parse(f.listedAt) <= t &&
          Date.parse(f.at) > t &&
          f.skills,
      )
      .map((f) => ({
        code,
        skills: f.skills,
        price: f.price * (1 + TAX / 100),
        fill: f,
      }));
    const resaleSlopes = statSlopes(code, heldAt(resaleEnd));
    const resaleFills = all.filter((f) => {
      const at = Date.parse(f.at);
      return at > resaleEnd - RESALE_HOURS * H && at <= resaleEnd;
    });
    for (const [i, offer] of book.entries()) {
      seen++;
      pieces.add(offer.fill.id ?? offer.fill);
      const worth = similarValue(
        code,
        offer.skills,
        resaleFills.filter((f) => f !== offer.fill),
        { now: resaleEnd, trend: false, slopes: resaleSlopes },
      );
      if (!worth.matched || worth.value == null) continue;
      judged++;
      const bar = offer.price * (1 + FLIP);
      const isReal = worth.value >= bar;
      if (isReal) real++;
      const plain = similarValue(code, offer.skills, held, {
        now: t,
        trend: false,
      });
      const shipped = similarValue(code, offer.skills, held, { now: t });
      const cap = offerCap(code, offer.skills, book, i, TAX)?.cap ?? Infinity;
      const tagged = (v, ceiling = Infinity, factor = 1) =>
        v.matched &&
        v.value != null &&
        Math.min(v.value * factor, ceiling) >= bar;
      const tags = {
        A: tagged(plain),
        C: tagged(shipped),
        "C + cap": tagged(shipped, cap),
        "C + cap + fall": tagged(shipped, cap, toResale),
      };
      for (const w of WAYS) {
        if (!tags[w]) continue;
        const c = count[w];
        c.tags++;
        if (isReal) c.real++;
        if (worth.value < offer.price) c.lost++;
        c.gains.push(worth.value / offer.price - 1);
      }
    }
  }
  const now = marketTrend(code, heldAt(NOW));
  console.log(
    `\n${code}: ${all.length}${complete ? "" : "+"} sales in ${DAYS + 7} d${complete ? "" : ` (the ${PAGES}-page cap: the oldest moments hold fewer)`}; C reads its fall now at ${now.log < 0 ? `${signed(now.perDay)} a day` : "none"} (${now.n} sales on ${now.days} days)`,
  );
  if (first == null) {
    console.log(
      late
        ? `  no moment to judge: the resale of each (the median wait + ${RESALE_HOURS / 2} h) is still to come; replay more --days`
        : "  no moment to judge: no sale carries its listing time",
    );
    return { count, judged, real };
  }
  console.log(
    `  ${waits.length} moments ${EVERY} h apart, ${when(first)} to ${when(last)} UTC, median wait ${median(waits).toFixed(0)} h; ${seen} offers on the market (${pieces.size} pieces), ${judged} judged at resale, ${real} of them real flips`,
  );
  print(count, real, "  ");
  return { count, judged, real };
}

function print(count, real, indent) {
  console.log(
    `${indent}${"".padEnd(15)}${"tags".padStart(6)}${"real".padStart(6)}${"precision".padStart(11)}${"lost gold".padStart(11)}${"median gain".padStart(13)}${"recall".padStart(8)}`,
  );
  for (const w of WAYS) {
    const c = count[w];
    console.log(
      `${indent}${w.padEnd(15)}${String(c.tags).padStart(6)}${String(c.real).padStart(6)}${ratio(c.real, c.tags).padStart(11)}${ratio(c.lost, c.tags).padStart(11)}${signed(median(c.gains)).padStart(13)}${ratio(c.real, real).padStart(8)}`,
    );
  }
}

try {
  console.log(
    `A: no fall · C: sales alike brought down to today · C + cap: as shipped · C + cap + fall: C carried on down to the resale, over the median wait (${MAX_FALL_HOURS} h at most), not in the extension`,
  );
  console.log(
    `FLIP at ${FLIP < 0 ? "−" : "+"}${Math.abs(FLIP * 100)}%, tax ${TAX}%; moments every ${EVERY} h over the last ${DAYS} days; a tag is real when the piece's stats sold for that much in the ${RESALE_HOURS} h around the moment + the item's median wait`,
  );
  const checked = codes.length ? codes : await scan();
  const results = [];
  for (const code of checked) results.push(await check(code));
  if (results.length > 1) {
    const total = Object.fromEntries(
      WAYS.map((w) => [
        w,
        {
          tags: 0,
          real: 0,
          lost: 0,
          gains: results.flatMap((r) => r.count[w].gains),
        },
      ]),
    );
    for (const r of results)
      for (const w of WAYS)
        for (const k of ["tags", "real", "lost"]) total[w][k] += r.count[w][k];
    const real = results.reduce((s, r) => s + r.real, 0);
    const judged = results.reduce((s, r) => s + r.judged, 0);
    console.log(
      `\n${checked.join(", ")}: ${judged} offers judged at resale, ${real} of them real flips`,
    );
    print(total, real, "");
  }
} catch (e) {
  console.error(`\n${e?.message ?? e}${e?.code ? ` (${e.code})` : ""}`);
  process.exit(1);
}
