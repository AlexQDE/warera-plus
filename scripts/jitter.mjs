// How fast the extension settles on the equipment market and how much it
// moves while it does, in headless Chromium on the synthetic fixture.
//
//   node scripts/jitter.mjs [--rows 36] [--runs 3] [--ext extension] [--json out.json]
//
// The content app runs against a mock worker that answers the way a real one
// does on a cold start: the settings at once, the scrap book after 250 ms,
// the books of cases and steel after 300 ms, the game's averages after
// 400 ms, and each item's sales one at a time (the tab reads them single
// file) after 600 to 1,400 ms. Measured from the moment the app starts:
//   bar      the bar is in the page
//   lines    every offer row carries its line
//   tags     every row's line holds a tag other than READING
//   settled  the last time any row's line changed (all sales read)
//   writes   rewrites of the row lines per row (fewer is steadier)
//   cls      the layout shift score while it settles (Chromium's own measure)
//   loadMoreCls  the same for three clicks of Load more once settled (12 new rows each)
// With --late the page draws its offers 800 ms after the app starts (the game reads them after it starts).
//   scanMs   main-thread time spent scanning, and the longest scan
// Needs Playwright with its Chromium (PLAYWRIGHT_MODULE when not resolvable).
import http from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const rows = Number(opt("--rows", 36));
const runs = Number(opt("--runs", 3));
const extDir = resolve(root, opt("--ext", "extension"));
const jsonOut = opt("--json", null);
const trace = args.includes("--trace");
const overrides = JSON.parse(opt("--settings", "{}"));
// --late: the page draws its offers 800 ms after the app starts, as the game does after its own read
const late = args.includes("--late");
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);

const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
};
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const file = /^\/market\/equipments\/?$/.test(url.pathname)
    ? resolve(root, "fixtures/market.html")
    : url.pathname.startsWith("/ext/")
      ? resolve(extDir, "." + url.pathname.slice(4))
      : null;
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      "content-type": TYPES[extname(file)] ?? "application/octet-stream",
    });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

// A cold worker: real delays, deterministic data. Sales are read one at a time by the tab, as in the extension.
const RUNTIME = `(() => {
  const T0 = Date.now();
  const iso = (msAgo = 0) => new Date(Date.now() - msAgo).toISOString();
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const levels = (price, n, step) => Array.from({ length: n }, (_, i) => ({ price: Number((price + i * step).toFixed(3)), quantity: 500 + i * 300 }));
  const book = (bid, ask) => ({ at: iso(), bid, ask, bidQty: 500, askQty: 500, bids: levels(bid, 8, -0.001), asks: levels(ask, 8, 0.001), bidCapped: false, askCapped: false });
  const BASE = { jet: 380, tank: 120, knife: 1.2, boots5: 130, helmet4: 42, chest2: 4.6 };
  const STAT = { jet: 270, tank: 155, knife: 30, boots5: 35, helmet4: 80, chest2: 8 };
  let seed = 11;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  const skillsFor = (code) => code === 'jet' ? { attack: 221 + Math.round(rnd() * 79), criticalChance: 41 + Math.round(rnd() * 9) } : code === 'tank' ? { attack: 141 + Math.round(rnd() * 29), criticalChance: 26 + Math.round(rnd() * 9) } : code === 'knife' ? { attack: 21 + Math.round(rnd() * 19), criticalChance: 1 + Math.round(rnd() * 4) } : code === 'boots5' ? { dodge: 31 + Math.round(rnd() * 9) } : code === 'helmet4' ? { criticalDamages: 71 + Math.round(rnd() * 19) } : { armor: 6 + Math.round(rnd() * 4) };
  const fillsFor = (code) => Array.from({ length: 160 }, (_, i) => ({ price: Number(((BASE[code] ?? 10) * (0.85 + rnd() * 0.3)).toFixed(3)), at: iso((i * 0.9 + rnd()) * 3600e3), state: 100, code, skills: skillsFor(code), listedAt: iso((i * 0.9 + 2) * 3600e3) }));
  const settings = { minMarginPct: 3, flipPct: 10, intervalSec: 30, panel: 'none', casesCollapsed: true, roundTrip: false, equipment: true, cases: true, travel: true, picker: true, sellFrom: 'epic', craft: true, userId: null, craftSteelMode: 'auto', ledgerMode: 'eco', schemaVersion: 6 };
  Object.assign(settings, ${JSON.stringify(overrides)});
  const info = { settings, hasKey: true, revision: 1, authRevision: 1 };
  const books = { scraps: book(0.221, 0.224), steel: book(1.612, 1.655), oil: book(0.241, 0.249), woodenCase: book(7.4, 7.9), case1: book(3.4, 3.6), case2: book(21.5, 22.4) };
  window.__mock = { calls: [] };
  let salesSeq = 0;
  return {
    sendMessage: async (msg) => {
      window.__mock.calls.push([msg.type, Date.now() - T0, msg.itemCode ?? '']);
      switch (msg.type) {
        case 'getSettings': await wait(5); return structuredClone(info);
        case 'saveSettings': Object.assign(settings, msg.settings); info.revision++; return structuredClone(info);
        case 'book': await wait(250); return { book: books.scraps };
        case 'cases': await wait(300); return { cases: { at: iso(), books } };
        case 'avg': await wait(400); return { avg: { at: iso(), values: { ...BASE }, times: Object.fromEntries(Object.keys(BASE).map((c) => [c, iso()])), failures: {} } };
        case 'sales': { await wait(600 + ((salesSeq++ * 337) % 800)); return { sales: { code: msg.itemCode, hours: 168, at: iso(), complete: true, fills: fillsFor(msg.itemCode) } }; }
        default: return {};
      }
    },
  };
})()`;

// Every row's line, as text, each time it changes; layout shifts as Chromium scores them.
const WATCH = `(() => {
  window.__jitter = { shifts: [], lines: new Map(), writes: 0, changed: 0, firstLines: null, firstTags: null, bar: null, history: [] };
  new PerformanceObserver((list) => { for (const e of list.getEntries()) if (!e.hadRecentInput) window.__jitter.shifts.push([e.startTime, e.value]); }).observe({ type: 'layout-shift', buffered: true });
})()`;

async function once() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  await page.addInitScript(WATCH);
  await page.goto(`${base}/market/equipments?rows=${late ? 0 : rows}`, {
    waitUntil: "load",
  });
  await page.addStyleTag({ url: `/ext/content.css` });
  const result = await page.evaluate(
    `(async () => {
      const j = window.__jitter;
      const offers = document.getElementById('offers');
      const t0 = performance.now();
      const lineOf = (row) => row.querySelector(':scope > .ss-verdict');
      const sample = () => {
        const now = performance.now() - t0;
        if (j.bar == null && document.getElementById('scrap-sniper-bar')) j.bar = now;
        const rs = [...offers.children];
        let withLine = 0, tagged = 0;
        rs.forEach((row, i) => {
          const el = lineOf(row);
          if (!el) return;
          withLine++;
          const tag = el.querySelector('.lens-tag')?.dataset.kind;
          if (tag && tag !== 'loading') tagged++;
          const text = el.textContent;
          if (j.lines.get(i) !== text) { if (j.lines.has(i)) j.changed = now; j.lines.set(i, text); j.writes++; if (i === 0) j.history.push([Math.round(now), text]); }
        });
        if (j.firstLines == null && rs.length && withLine === rs.length) j.firstLines = now;
        if (j.firstTags == null && rs.length && tagged === rs.length) j.firstTags = now;
      };
      new MutationObserver(sample).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
      const runtime = ${RUNTIME};
      const { startLens } = await import('/ext/lib/app.mjs');
      window.__app = await startLens(runtime);
      if (${late}) {
        await new Promise((r) => setTimeout(r, 800));
        j.shifts.length = 0;
        window.__fixture.addRows(${rows});
      }
      await new Promise((r) => setTimeout(r, 9000));
      sample();
      // "Load more": twelve rows drawn by the page at once, the lines must come in the same frame
      const before = j.shifts.length;
      const settledWrites = j.writes / offers.children.length;
      for (let k = 0; k < 3; k++) {
        const more = document.querySelector('.more');
        more.scrollIntoView({ block: 'end' });
        await new Promise((r) => setTimeout(r, 200));
        more.click();
        await new Promise((r) => setTimeout(r, 400));
      }
      const more = j.shifts.slice(before);
      j.shifts.length = before;
      const shifts = j.shifts.filter(([t]) => t >= t0);
      const m = window.__app.metrics;
      return {
        bar: j.bar, lines: j.firstLines, tags: j.firstTags, settled: j.changed,
        writesPerRow: settledWrites,
        cls: shifts.reduce((s, [, v]) => s + v, 0), shifts: shifts.length,
        moreCls: more.reduce((s, [, v]) => s + v, 0),
        scans: m.scans, scanMs: m.scanMs, maxScanMs: m.maxScanMs,
        rowsWritten: m.equipment?.rowsWritten ?? null,
        trace: { shifts: shifts.map(([t, v]) => [Math.round(t - t0), Number(v.toFixed(4))]), firstRow: j.history, calls: window.__mock.calls },
      };
    })()`,
  );
  await browser.close();
  return result;
}

const all = [];
for (let i = 0; i < runs; i++) all.push(await once());
if (trace) console.log(JSON.stringify(all[0].trace, null, 1));
const med = (k) => {
  const xs = all
    .map((r) => r[k])
    .filter((x) => x != null)
    .sort((a, b) => a - b);
  return xs.length ? xs[Math.floor(xs.length / 2)] : null;
};
const round = (v, d = 0) => (v == null ? null : Number(v.toFixed(d)));
const summary = {
  rows,
  runs,
  barMs: round(med("bar")),
  linesMs: round(med("lines")),
  tagsMs: round(med("tags")),
  settledMs: round(med("settled")),
  writesPerRow: round(med("writesPerRow"), 2),
  cls: round(med("cls"), 4),
  loadMoreCls: round(med("moreCls"), 4),
  shifts: med("shifts"),
  scans: med("scans"),
  scanMs: round(med("scanMs"), 1),
  maxScanMs: round(med("maxScanMs"), 1),
};
console.log(JSON.stringify(summary, null, 2));
if (jsonOut)
  await writeFile(
    resolve(root, jsonOut),
    JSON.stringify(summary, null, 2) + "\n",
  );
server.close();
