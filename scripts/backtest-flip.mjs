// FLIP on the game's own sales: how often a FLIP tag would have been right on
// an item's market over the last days, three ways: A, the value without the
// market's fall (as before 3.11.0); C, sales alike brought down to today's
// level by the market's fall; C + cap, C no higher than the second cheapest
// offer of stats at least as good (as shipped). The sales feed answers only
// an API key, so this runs with yours, from the environment; it only reads.
//
//   WARERA_API_KEY=<key> node scripts/backtest-flip.mjs [codes…] [--days 7] [--every 6] [--tax 0] [--flip 10] [--pick 4] [--pages 80]
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

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? Number(args[i + 1]) : fallback;
};
const DAYS = opt("--days", 7);
const EVERY = opt("--every", 6);
const TAX = opt("--tax", 0);
const FLIP = opt("--flip", 10) / 100;
const PICK = opt("--pick", 4);
const PAGES = opt("--pages", 80);
// the codes: every argument that is neither an option nor an option's value
const codes = args.filter(
  (a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"),
);
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
for (const code of codes)
  if (!STAT_RANGES[code]) {
    console.error(
      `${code} is no item code; the codes: ${Object.keys(STAT_RANGES).join(" ")}`,
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

const WAYS = ["A", "C", "C + cap"];

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
    // a piece bought at t is listed again and sells about the item's median wait later
    const resaleEnd = wait == null ? null : t + (wait + RESALE_HOURS / 2) * H;
    if (resaleEnd == null || resaleEnd > NOW) continue;
    first ??= t;
    last = t;
    waits.push(wait);
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
      const tagged = (v, ceiling = Infinity) =>
        v.matched && v.value != null && Math.min(v.value, ceiling) >= bar;
      const tags = {
        A: tagged(plain),
        C: tagged(shipped),
        "C + cap": tagged(shipped, cap),
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
    console.log("  no moment to judge: no sale carries its listing time");
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
    `${indent}${"".padEnd(8)}${"tags".padStart(6)}${"real".padStart(6)}${"precision".padStart(11)}${"lost gold".padStart(11)}${"median gain".padStart(13)}${"recall".padStart(8)}`,
  );
  for (const w of WAYS) {
    const c = count[w];
    console.log(
      `${indent}${w.padEnd(8)}${String(c.tags).padStart(6)}${String(c.real).padStart(6)}${ratio(c.real, c.tags).padStart(11)}${ratio(c.lost, c.tags).padStart(11)}${signed(median(c.gains)).padStart(13)}${ratio(c.real, real).padStart(8)}`,
    );
  }
}

try {
  console.log(
    `FLIP at +${FLIP * 100}%, tax ${TAX}%; moments every ${EVERY} h over the last ${DAYS} days; a tag is real when the piece's stats sold for that much in the ${RESALE_HOURS} h around the moment + the item's median wait`,
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
