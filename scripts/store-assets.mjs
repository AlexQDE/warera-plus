// The Chrome Web Store's images, into docs/store/: five 1280x800 screenshots
// (the equipment market with its tags, the Ledger, the Craft tab, the
// game's craft window, the settings) and the 440x280 small promo tile and
// 1400x560 marquee. Rendered in headless Chromium from the synthetic market
// page (fixtures/market.html) with the extension's real code; the numbers
// come from a synthetic player's history and market, which the extension's
// own worker code (controller.mjs) views, so a screenshot shows what the code
// computes. A stand-in page and invented data: replace the screenshots with
// captures of the live game when you have them.
//
//   node scripts/store-assets.mjs
//
// Needs Playwright with its Chromium (PLAYWRIGHT_MODULE when not resolvable).
import http from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createController } from "../extension/lib/controller.mjs";
import { CACHE_VERSION } from "../extension/lib/quality.mjs";
import { ALL_GEAR_CODES } from "../extension/lib/items.mjs";
import { STAT_RANGES } from "../extension/lib/stats.mjs";
import { SCRAP_LADDER } from "../extension/lib/ladder.mjs";
import { describeCode } from "../extension/lib/craftdata.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "docs/store");
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);

// ---------------------------------------------------------------- the player
const ME = "6a0b0c0d0e0f101112131415";
const OTHER = "6a1b1c1d1e1f202122232425";
const NOW = Date.now();
let seed = 21;
const rnd = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
let serial = 0;
const oid = () => (++serial).toString(16).padStart(24, "a");
const at = (minutesAgo) => new Date(NOW - minutesAgo * 60e3).toISOString();
const rollOf = (code) =>
  Object.fromEntries(
    Object.entries(STAT_RANGES[code]).map(([k, [lo, hi]]) => [
      k,
      lo + Math.floor(rnd() * (hi - lo + 1)),
    ]),
  );
// what a piece is worth on this market: its item's price at a middling roll, more for a better one
const BASE = {
  knife: 1.2,
  gun: 4.4,
  rifle: 14,
  sniper: 61,
  tank: 152,
  jet: 430,
  helmet1: 1.4,
  chest1: 1.3,
  gloves1: 1.4,
  pants1: 1.3,
  boots1: 1.4,
  helmet2: 4.1,
  chest2: 4.6,
  gloves2: 4.2,
  pants2: 4.0,
  boots2: 4.3,
  helmet3: 13.2,
  chest3: 12.4,
  gloves3: 13.6,
  pants3: 12.1,
  boots3: 13.1,
  helmet4: 41,
  chest4: 38,
  gloves4: 42,
  pants4: 37,
  boots4: 40,
  helmet5: 136,
  chest5: 129,
  gloves5: 141,
  pants5: 127,
  boots5: 139,
  helmet6: 440,
  chest6: 412,
  gloves6: 452,
  pants6: 405,
  boots6: 446,
};
const worth = (code, skills) => {
  const ranges = STAT_RANGES[code];
  const shares = Object.entries(ranges).map(
    ([k, [lo, hi]]) => (skills[k] - lo) / Math.max(1, hi - lo),
  );
  const mean = shares.reduce((a, b) => a + b, 0) / shares.length;
  return (BASE[code] ?? 10) * Math.exp(0.5 * (mean - 0.5));
};
const round3 = (v) => Math.round(v * 1000) / 1000;

const rows = [];
const piece = (code, skills = rollOf(code)) => ({
  _id: oid(),
  code,
  skills,
  state: 100,
});
const craft = (code, minutesAgo, item = piece(code)) => {
  rows.push({
    _id: oid(),
    itemCode: "scraps",
    quantity: SCRAP_LADDER[describeCode(code).rarity],
    sellerId: ME,
    buyerId: ME,
    transactionType: "craftItem",
    item,
    createdAt: at(minutesAgo),
  });
  return { item, minutesAgo };
};
const sell = ({ item, minutesAgo: got }, minutesAgo, factor = 1) =>
  rows.push({
    _id: oid(),
    money: round3(worth(item.code, item.skills) * factor),
    itemCode: item.code,
    quantity: 1,
    sellerId: ME,
    buyerId: OTHER,
    transactionType: "itemMarket",
    item: { ...item, lastAcquisitionAt: at(got) },
    offerCreatedAt: at(minutesAgo + 40 + rnd() * 200),
    createdAt: at(minutesAgo),
  });
const scrap = ({ item }, minutesAgo, share = 1) =>
  rows.push({
    _id: oid(),
    itemCode: "scraps",
    quantity: Math.floor(SCRAP_LADDER[describeCode(item.code).rarity] * share),
    sellerId: ME,
    buyerId: ME,
    transactionType: "dismantleItem",
    item,
    createdAt: at(minutesAgo),
  });
const buy = (code, minutesAgo, factor) => {
  const item = piece(code);
  rows.push({
    _id: oid(),
    money: round3(worth(code, item.skills) * factor),
    itemCode: code,
    quantity: 1,
    sellerId: OTHER,
    buyerId: ME,
    transactionType: "itemMarket",
    item,
    createdAt: at(minutesAgo),
  });
  return { item, minutesAgo };
};
const open = (minutesAgo) => {
  const r = rnd();
  const tier = r < 0.62 ? 1 : r < 0.92 ? 2 : 4;
  const weapon = rnd() < 0.3;
  const code = weapon
    ? ["knife", "gun", "rifle", "sniper"][tier - 1]
    : `${["helmet", "chest", "gloves", "pants", "boots"][Math.floor(rnd() * 5)]}${tier}`;
  const item = piece(code);
  rows.push({
    _id: oid(),
    itemCode: "case1",
    quantity: 1,
    sellerId: ME,
    buyerId: ME,
    transactionType: "openCase",
    item,
    createdAt: at(minutesAgo),
  });
  return { item, minutesAgo };
};
const loot = (code, minutesAgo) =>
  rows.push({
    _id: oid(),
    itemCode: code,
    quantity: 1,
    sellerId: ME,
    buyerId: ME,
    transactionType: "battleLoot",
    item: piece(code),
    createdAt: at(minutesAgo),
  });
const randomLegendary = () =>
  rnd() < 0.3
    ? "tank"
    : `${["helmet", "chest", "gloves", "pants", "boots"][Math.floor(rnd() * 5)]}5`;

// today: a sniper craft session the extension saw, sold, scrapped and held
const presses = [];
const today = [];
for (let i = 0; i < 10; i++) {
  const c = craft("sniper", 180 - i * 3);
  presses.push(NOW - (180 - i * 3) * 60e3 - 700);
  today.push(c);
}
scrap(today[0], 140);
scrap(today[1], 139);
sell(today[2], 120, 1.06);
sell(today[3], 95, 0.98);
sell(today[4], 61, 1.1);
// today: a few random legendary crafts
const legendaryToday = [0, 1, 2, 3].map((i) =>
  craft(randomLegendary(), 300 - i * 4),
);
sell(legendaryToday[0], 210, 1.02);
scrap(legendaryToday[1], 290);
scrap(legendaryToday[2], 289);
// yesterday: a sniper session made on another device, told by its streak
const yesterday = [];
for (let i = 0; i < 12; i++) yesterday.push(craft("sniper", 1700 - i * 4));
for (const [k, c] of yesterday.slice(0, 6).entries())
  sell(c, 1500 - k * 70, 0.95 + rnd() * 0.15);
scrap(yesterday[6], 1650);
scrap(yesterday[7], 1640);
// the week: random legendary crafts, cases, buys to flip, loot
for (let d = 2; d < 7; d++)
  for (let i = 0; i < 3; i++) {
    const c = craft(randomLegendary(), d * 1440 + i * 5);
    const fate = rnd();
    if (fate < 0.45) sell(c, d * 1440 - 300 - i * 30, 0.92 + rnd() * 0.2);
    else if (fate < 0.75) scrap(c, d * 1440 - 10);
  }
for (let i = 0; i < 30; i++) {
  const c = open(200 + i * 290);
  if (rnd() < 0.85) scrap(c, 190 + i * 290);
}
for (let i = 0; i < 8; i++) {
  const c = buy(i % 3 ? "tank" : "jet", 400 + i * 700, 0.82 + rnd() * 0.08);
  if (i < 6) sell(c, 300 + i * 700 - 200, 1.0 + rnd() * 0.08);
}
for (let i = 0; i < 4; i++)
  loot(["helmet4", "gloves5", "boots2", "gun"][i], 600 + i * 1300);
rows.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

// the market: each item's sales of the last three days, with their stats
const salesOf = (code) => ({
  code,
  hours: 168,
  at: new Date(NOW).toISOString(),
  complete: true,
  cacheVersion: CACHE_VERSION,
  fills: Array.from({ length: 140 }, (_, i) => {
    const skills = rollOf(code);
    return {
      id: oid(),
      price: round3(worth(code, skills) * (0.92 + rnd() * 0.16)),
      at: new Date(NOW - (i * 0.5 + rnd() * 0.4) * 3600e3).toISOString(),
      state: 100,
      code,
      skills,
      listedAt: new Date(NOW - (i * 0.5 + 2) * 3600e3).toISOString(),
    };
  }),
});
const SALES = Object.fromEntries(
  Object.keys(BASE).map((code) => [code, salesOf(code)]),
);
const avgValues = Object.fromEntries(
  ALL_GEAR_CODES.map((c) => [c, BASE[c] ?? null]),
);
const AVG = {
  at: new Date(NOW).toISOString(),
  values: avgValues,
  times: Object.fromEntries(
    ALL_GEAR_CODES.map((c) => [c, new Date(NOW).toISOString()]),
  ),
  failures: {},
  missing: [],
  cacheVersion: CACHE_VERSION,
};
const DAILY = {
  scraps: 0.221,
  steel: 1.62,
  case1: 3.62,
  case2: 22.1,
  woodenCase: 7.6,
};

// ---------------------------------------------- the worker's view of it all
function memory(initial = {}) {
  const data = structuredClone(initial);
  return {
    data,
    async get(keys) {
      return structuredClone(
        keys == null
          ? data
          : Object.fromEntries(
              (Array.isArray(keys) ? keys : [keys]).map((k) => [k, data[k]]),
            ),
      );
    },
    async set(values) {
      Object.assign(data, structuredClone(values));
    },
    async remove(keys) {
      for (const k of Array.isArray(keys) ? keys : [keys]) delete data[k];
    },
  };
}
const ok = (data) => ({
  ok: true,
  status: 200,
  headers: new Headers({ "ratelimit-limit": "500" }),
  json: async () => ({ result: { data } }),
});
const fakeApi = async (url) => {
  const u = new URL(url);
  const input = JSON.parse(u.searchParams.get("input"));
  const proc = u.pathname.split("/").pop();
  if (proc === "transaction.getPaginatedTransactions") {
    const page = input.cursor ? Number(input.cursor.slice(1)) : 0;
    return ok({
      items: rows.slice(page * 100, page * 100 + 100),
      nextCursor: rows.length > (page + 1) * 100 ? `p${page + 1}` : null,
    });
  }
  if (proc === "itemTrading.getItemTrading")
    return ok({
      itemCode: input.itemCode,
      values: Array.from({ length: 30 }, (_, d) => ({
        valueAt: new Date(NOW - d * 86400e3).toISOString().slice(0, 10),
        avgValue: (DAILY[input.itemCode] ?? 1) * (0.97 + ((d * 7) % 6) / 100),
      })),
    });
  if (proc === "user.getUserLite")
    return ok({ _id: ME, username: "DemoPlayer" });
  return ok({});
};
let clock = NOW;
const worker = createController({
  storage: memory({
    settings: {
      apiKey: "store-assets-only",
      userId: ME,
      schemaVersion: 6,
      craftSteelMode: "auto",
    },
    avg: AVG,
    ...Object.fromEntries(
      Object.entries(SALES).map(([c, s]) => [`sales:${c}`, s]),
    ),
  }),
  session: memory(),
  fetchImpl: fakeApi,
  now: () => clock,
});
// today's presses of the game's CRAFT button, each reported as it happened
for (const t of presses) {
  clock = t;
  await worker.handle({
    type: "craftPick",
    userId: ME,
    tier: "epic",
    chosen: true,
    slot: "sniper",
    at: t,
  });
}
clock = NOW;
for (let i = 0; i < 5; i++) {
  const r = await worker.handle({ type: "history", userId: ME, force: true });
  if (r.history?.done) break;
}
const views = {};
for (const window of ["today", "week", "all"])
  views[window] = (
    await worker.handle({ type: "ledger", userId: ME, window })
  ).ledger;
const meta = views.today.meta;

// ------------------------------------------------------- the page and its runtime
const levels = (price, n, step) =>
  Array.from({ length: n }, (_, i) => ({
    price: Number((price + i * step).toFixed(3)),
    quantity: 2000 + i * 900,
  }));
const book = (bid, ask) => ({
  at: new Date(NOW).toISOString(),
  bid,
  ask,
  bidQty: 2000,
  askQty: 2000,
  bids: levels(bid, 10, -0.001),
  asks: levels(ask, 10, 0.001),
  bidCapped: false,
  askCapped: false,
});
const BOOKS = {
  scraps: book(0.219, 0.222),
  steel: book(1.6, 1.63),
  oil: book(0.24, 0.25),
  woodenCase: book(7.4, 7.8),
  case1: book(3.5, 3.6),
  case2: book(21.6, 22.3),
};
const runtimeFor = (settings) => `(() => {
  const settings = ${JSON.stringify({
    minMarginPct: 3,
    flipPct: 10,
    intervalSec: 30,
    panel: "none",
    casesCollapsed: true,
    roundTrip: false,
    equipment: true,
    cases: true,
    travel: true,
    picker: true,
    sellFrom: "epic",
    craft: true,
    userId: ME,
    craftSteelMode: "auto",
    ledgerMode: "eco",
    schemaVersion: 6,
    ...settings,
  })};
  const info = { settings, hasKey: true, revision: 1, authRevision: 1 };
  const SALES = ${JSON.stringify(SALES)};
  const VIEWS = ${JSON.stringify(views)};
  const BOOKS = ${JSON.stringify(BOOKS)};
  const AVG = ${JSON.stringify(AVG)};
  const META = ${JSON.stringify(meta)};
  return {
    sendMessage: async (msg) => {
      switch (msg.type) {
        case 'getSettings': return structuredClone(info);
        case 'saveSettings': Object.assign(settings, msg.settings); info.revision++; return structuredClone(info);
        case 'book': return { book: BOOKS.scraps };
        case 'cases': return { cases: { at: new Date().toISOString(), books: BOOKS } };
        case 'avg': return { avg: AVG };
        case 'sales': return SALES[msg.itemCode] ? { sales: SALES[msg.itemCode] } : { error: 'http', message: 'no sales' };
        case 'history': return { history: META };
        case 'ledger': return { ledger: VIEWS[msg.window] ?? VIEWS.today };
        default: return { ok: true };
      }
    },
  };
})()`;

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
      ? resolve(root, "extension", "." + url.pathname.slice(4))
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
await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const VIEWPORT = { width: 1280, height: 800 };

async function market(query, settings) {
  const page = await browser.newPage({ viewport: VIEWPORT });
  await page.goto(`${base}/market/equipments?${query}`, { waitUntil: "load" });
  await page.addStyleTag({ url: "/ext/content.css" });
  await page.evaluate(
    `(async () => { const { startLens } = await import('/ext/lib/app.mjs'); window.__app = await startLens(${runtimeFor(settings)}); })()`,
  );
  await page.waitForTimeout(1500);
  return page;
}
async function shot(page, name) {
  await page.screenshot({ path: resolve(outDir, name) });
  console.log(`  docs/store/${name}`);
}

// 1. the equipment market: the bar, the Market tab, a tag and a value on every offer
{
  const page = await market("item=jet&rows=12", { panel: "market" });
  await shot(page, "screenshot-1-market.png");
  await page.close();
}
// 2. the Ledger: everything, a page of the list, the sniper crafts marked
{
  const page = await market("rows=6", { panel: "ledger" });
  await page.click('[data-action="desk-window"][data-window="all"]');
  await page.waitForTimeout(800);
  await page.evaluate(() => window.scrollTo(0, 60));
  await shot(page, "screenshot-2-ledger.png");
  await page.close();
}
// 3. the Craft tab, the epic tier open
{
  const page = await market("item=sniper&rows=6", { panel: "craft" });
  await page.click('[data-action="desk-tier"][data-tier="4"]');
  await page.waitForTimeout(600);
  await shot(page, "screenshot-3-craft.png");
  await page.close();
}
// 4. the game's craft window (a stand-in), the sniper picked: what it costs, what it is worth, today's crafts
{
  const page = await market("rows=6", { panel: "none" });
  await page.evaluate(() => {
    const tiers = [
      ["Mythic", "1.46K", "32"],
      ["Legendary", "486", "16"],
      ["Epic", "162", "8"],
      ["Rare", "54", "4"],
      ["Uncommon", "18", "2"],
      ["Common", "6", "1"],
    ];
    const slots = [
      "sniper",
      "helmet4",
      "chest4",
      "gloves4",
      "pants4",
      "boots4",
    ];
    const shade = document.createElement("div");
    shade.style.cssText =
      "position:fixed;inset:0;background:rgba(3,7,18,.72);display:grid;place-items:center;z-index:50";
    shade.innerHTML = `<div role="dialog" style="width:620px;max-height:760px;overflow:auto;background:#111827;border:1px solid #1f2937;border-radius:14px;padding:16px 18px;color:#e5e7eb;font:14px system-ui">
      <div style="font-weight:800;letter-spacing:.06em">CRAFT ITEMS</div>
      <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin:12px 0">${tiers
        .map(
          ([n, s, t]) =>
            `<div style="border:1px solid ${n === "Epic" ? "#a855f7" : "#1f2937"};border-radius:8px;padding:6px;text-align:center"><div>${n}</div><div style="color:#9ca3af;font-size:12px">${s}</div><div style="color:#9ca3af;font-size:12px">${t}</div></div>`,
        )
        .join("")}</div>
      <div style="font-weight:700;margin:4px 0 8px">Epic</div>
      <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin-bottom:12px">${slots
        .map(
          (s) =>
            `<div class="${s === "sniper" ? "slot picked" : "slot"}" style="height:64px;border-radius:10px;display:grid;place-items:center;background-image:linear-gradient(160deg,#3b1f5c,#1a1030);${s === "sniper" ? "outline:2px solid #a855f7" : ""}"><img alt="${s}" width="34" height="34" src="data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M6 20 L16 4 L26 20 L16 28 Z" fill="#c4b5fd"/></svg>')}"></div>`,
        )
        .join("")}</div>
      <div style="display:flex;gap:8px;justify-content:flex-end"><button style="padding:8px 16px;border-radius:8px;border:1px solid #374151;background:#1f2937;color:#e5e7eb">CLOSE</button><button style="padding:8px 22px;border-radius:8px;border:0;background:#7c3aed;color:#fff;font-weight:700">CRAFT</button></div>
    </div>`;
    document.body.appendChild(shade);
  });
  await page.waitForTimeout(6500); // the next tick reads the books the window prices with
  await shot(page, "screenshot-4-craft-window.png");
  await page.close();
}
// 5. the settings: the optional key, the thresholds, how you craft
{
  const page = await browser.newPage({ viewport: VIEWPORT });
  await page.addInitScript(
    `window.chrome = { runtime: { getManifest: () => ({ version: ${JSON.stringify(JSON.parse(await readFile(resolve(root, "extension/manifest.json"), "utf8")).version)} }), sendMessage: async (m) => m.type === 'getSettings' ? { settings: { minMarginPct: 3, flipPct: 10, intervalSec: 30, craftSteelMode: 'auto', sellFrom: 'epic', schemaVersion: 6 }, hasKey: true, apiKey: 'not-a-real-key-0000', revision: 1, authRevision: 1 } : { settings: {} } } };`,
  );
  await page.goto(`${base}/ext/popup.html`, { waitUntil: "networkidle" });
  await page.evaluate(() =>
    document.getElementById("advanced")?.setAttribute("open", ""),
  );
  await page.evaluate(() => {
    document.body.style.zoom = "1.25";
  });
  await page.waitForTimeout(300);
  await shot(page, "screenshot-5-settings.png");
  await page.close();
}

// the tiles: the icon, the name, what it does
const icon = `data:image/png;base64,${(await readFile(resolve(root, "extension/icons/icon128.png"))).toString("base64")}`;
async function tile(name, width, height, body) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.setContent(
    `<!doctype html><html><body style="margin:0;width:${width}px;height:${height}px;overflow:hidden;background:radial-gradient(circle at 20% 30%,#163a2a 0%,#0b1220 55%,#070b14 100%);color:#e6ecf5;font-family:system-ui,-apple-system,'Segoe UI',sans-serif">${body}</body></html>`,
  );
  await page.screenshot({ path: resolve(outDir, name) });
  console.log(`  docs/store/${name}`);
  await page.close();
}
await tile(
  "promo-small-440x280.png",
  440,
  280,
  `<div style="display:flex;flex-direction:column;justify-content:center;height:100%;padding:0 34px;box-sizing:border-box;gap:14px">
    <div style="display:flex;align-items:center;gap:14px"><img src="${icon}" width="64" height="64" style="border-radius:14px"><div style="font-size:34px;font-weight:800;letter-spacing:.01em">WarEra Plus</div></div>
    <div style="font-size:19px;line-height:1.35;color:#bfe9d2">Snipe, flip and craft smarter.<br>Your whole history, priced.</div>
    <div style="font-size:12px;color:#93a1b5">Unofficial companion for WarEra</div>
  </div>`,
);
await tile(
  "promo-marquee-1400x560.png",
  1400,
  560,
  `<div style="display:flex;align-items:center;height:100%;padding:0 90px;box-sizing:border-box;gap:60px">
    <img src="${icon}" width="200" height="200" style="border-radius:40px;flex:none">
    <div style="display:grid;gap:18px">
      <div style="font-size:72px;font-weight:800">WarEra Plus</div>
      <div style="font-size:30px;color:#bfe9d2">SNIPE and FLIP tags on every offer · craft and case values · a ledger of everything you crafted, opened and traded</div>
      <div style="font-size:20px;color:#93a1b5">Unofficial, read-only companion for WarEra · your key stays in your browser</div>
    </div>
  </div>`,
);
await browser.close();
server.close();
