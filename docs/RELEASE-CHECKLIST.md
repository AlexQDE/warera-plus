# Release checklist

Go through the newest release's section and the manual gate on the live game, with your own account, before publishing. Then [CHROME-WEB-STORE.md](CHROME-WEB-STORE.md).

## 3.10.0 on the live page (v0.27)

- **Luck in Train.** Open an employee's **already pending** hand (never draw one: a draw costs 10 energy). A Luck drill shows gold (no longer "≈ 0 g"); its "?" names the trainings left after this one, how much the best card of a hand gains, the rarer odds, and the toolbox chance it does not price. On an employee's last training ("2/3": one left, this one), Luck reads ≈ 0 g.

## 3.9.0 on the live page (v0.27)

Reload the extension itself first (its card must read 3.9.0), then the game. Nothing here needs a listing, an opening or a purchase: pick pieces, read, close.

- **The picker's bar.** Market → Sell an item → a "+" slot: the bar sits under "Items", in the flow, above "0/5" and CLEAR, never over them; the card's CLOSE stays in reach. Inventory → Dismantle: the same under "Quick dismantle", the game's tabs uncovered.
- **The cases strip.** Each cell's label sits over its value ("Sealed bid" over "7.500 g"); the three rows keep the same columns.
- **The settings popup** opens wide enough to read (440 px), one short line of help a setting.
- **Sell items.** Pick a weapon and an armour piece: each gets its own line under its own price, from sales of both its stats. A piece whose game start comes from an offer with other stats (a high-attack weapon among same-crit offers) gets the red line. **use** writes only into its own piece's price. Close without PUT ON SALE.
- **Colours.** A SNIPE card is framed green all round and a FLIP card purple, each with its line tinted; they read apart at a glance on Cheapest and after Load more.
- **Wooden cases.** Settings, Advanced, Wooden cases: Flip, then the strip's wooden row shows the Ask in the Sealed bid's place and reads FLIP or PASS with "+X g a case · N cases under it"; back to Hold, the sealed bid and the old tag. Open a wooden case's window (if you hold one) without pressing OPEN: the panel shows Open and Sell (hold) or Buy (flip), Today, All, Last and, when they differ, how many of the game's "Total cases opened" the history holds.
- **The Ledger's Wooden chip** opens the drops by resource for the window; a second click closes it.

## 3.8.1 on the live page (v0.27)

Reload the extension itself first (its card on the extensions page must read 3.8.1), then the game. A reload of the game page alone runs the new code with the stylesheet the extension was loaded with: seen on 2026-10-27 as 3.8.1's "pay … tax incl." in a 52 px line that still ran past its card.

- **The line in its card.** `/market/equipments`: every card's line is inside the card, at its bottom, level with the lines beside it; nothing of the next row (seller, price, tile) is under a line; the line's text is not cut mid-word except a long sales phrase at its end. Open Details on one card: the card grows, the next row moves down, nothing is covered; close it again.
- **The price.** On a card, the line's "pay … tax incl." is the card's own price digit for digit (three decimals, e.g. 43.798), not the Buy chip's.
- **Thousands.** Most expensive: a card at 1,000 gold or more reads "pay 1.234K tax incl." (as the card prints it) and gets a tag, not "price unreadable".
- **Sort and filters.** Cheapest → New → Most expensive, an item picked in "+", a stat typed into the filter, Load more: every card has its line within a moment of showing, none without one.

## 3.8.0 on the live page (v0.27)

3.8.0 was checked on the test suite (37 files, 507 tests), with the live market and the Recruit window as the live page drew them on 2026-10-26 (`fixtures/v027-live-*.html`, classes stripped, computed gradients inlined). Its first live run, on 2026-10-27, is in [RELEASE-RUN-3.8.0.md](RELEASE-RUN-3.8.0.md). The fixtures carry no layout (no flex direction, no widths), so the placement below is what only the live page shows. Reload the extension itself first, then the game.

- **The market's cards.** `/market/equipments`: the bar no longer says "offers not read"; every Buy card carries a line **below** its contents, full width; the card's price and Buy do not move while the line fills; the grid keeps its native columns. Open Details on one: the price is the card's own (three decimals, e.g. 43.798), not the rounded Buy chip.
- **Your own offer.** Check an existing listing or list a cheap piece: its card (Withdraw, "Yours") has no line, contributes no snipe/flip signal to the head and is excluded from competing asks.
- **Filtered.** `?item=sniper`: every card is the sniper of its tier; set the Attack / Crit. chance filters: the picker's lit pieces follow them. Switch items in "+" → Select an item: no card is tagged as the new item before the list is replaced.
- **Tiers.** Find skinned pieces of the available tiers (uncommon, rare, legendary, mythic): compare each native frame with the stat-derived tier in Details. Details does not report frame disagreement.
- **Ages.** Wait a minute on the market: native offer ages advance and the lines stay.
- **Recruit.** Companies → a company's Recruit: under "Candidates · Roster", check the head `WarEra Plus · ★ name`, or `none pays here…`. Hover its `?` for point value, product/bid value and bonus. Open Recruit from a second company: check its product, point value and bonus in that tooltip. Each candidate's line sits above Hire; with Production shown, check `PN`, the wage chip (exact, or a range while a hidden trait may be Greedy or Modest) and the full Production/wage explanation in `?`. Hire, Reroll all and Close stay the game's and keep working.
- **Sell form.** The live sell window ("Sell items", one `price-<itemId>` field per piece) is not adapted: `lib/sellform.mjs` reads the old form only, so no price suggestion shows there yet.
- **Compact.** Check each candidate's single line and `?` tooltip at the Recruit window's width; only the best eligible candidate's card has a green outline.
- **Train.** Open an employee's pending training (never draw a new hand to test: a draw costs 10 energy): a line under the three cards with each priced card's gold (`?` if unpriced), ★ on the best, that card outlined green; the "?" names every card's reason. A drill card's stat is the one its icon shows (compare with the header chips). A New habit card: the "?" names the trait it teaches (and the one it replaces, faded on the card) as the card does. An employee without a bonus chip: the wage chip still reads. Picking a card and closing the window removes the line and the outline.
- **Settings.** Turn Hiring and training advisor off, then on: the blocks and outlines clear and return after the next visible settings poll, normally within about five seconds each time.
- **Cases.** Check one wooden case value in the cases strip (no floor/round band), or `–` when price/depth is missing; its tooltip names the v0.27 drops.

- **Skins.** Find vampireCountessGloves: precision 60 maps to mythic. Compare its 1458 scraps with the current scrap bids; at a bid of 0.2 they fetch 291.6 g, shown as 292 g.
- **The Ledger.** Use existing history or a deliberate toolbox opening: check the Toolbox chip and continued history reading (no "History read failed"). Wooden-case toolbox drops are dev-only fixture coverage; any such stored history counts the unpriced drop apart.
- **The case window.** Open the inventory windows for a battle case, wooden case and toolbox without pressing Open: only the battle case gets a panel.
- **Grid.** Open "+" → Select an item, pick an item, close it: cards keep their rarity.

The 3.6.0–3.1.0 sections describe their original versions; current acceptance is the 3.9.0, 3.8.1 and 3.8.0 sections plus the Manual gate; where they differ, the newer section holds.

## 3.6.0 on the live page

3.6.0 was checked on the test suite (unit, worker and jsdom page tests) and in headless Chromium on the synthetic market (`node scripts/jitter.mjs`, `node scripts/store-assets.mjs`). Not seen on the live game. Reload the extension itself first, then the game.

- **Sniper craft, seen.** Open the game's craft window, pick a slot (the button reads CRAFT), deliberately craft one. History reads are requested at 2.5 and 7 s; wait for the Ledger (Today) to list it with ◎ and twice the tier's steel (epic: 16 steel, not 8); its title says "picked in the game's craft window". Craft one with CRAFT RANDOM: no ◎, the base steel. A craft whose button press was missed (another device) and that is part of a run of 6 weapons or 5 of one armour piece carries a faint ◎ ("… in a row").
- **The setting.** Settings, Advanced, How you craft reads Detect for an install that never chose; Always random takes every ◎ away, Always sniper craft puts one on every craft; back to Detect.
- **The Ledger's list.** Use a window with more than 50 pieces: "1–50 of N" under the table, Older › and » walk to the oldest page, « and ‹ Newer back; available nonzero Craft / Case / Buy / Loot filters show counts; a new window or filter starts at the newest page; the list scrolls in its own box and keeps its place when the numbers refresh.
- **Steady cards.** Reload the equipment market with the network throttled (DevTools, Slow 4G): each Buy card's line appears once and keeps its width while the tag, `game avg` and sales basis arrive; the price and Buy stay put. Load more, then navigate away and back: wait for the scan and check the lines return once on the visible cards.
- **Prices.** Find a top roll adjusted from similar sales: Details says "brought to these stats"; compare its value with the listed sales and adjustment. Check a Ledger held value against its displayed sales basis. The live v0.27 sell form has no suggestion.
- **Sales refresh.** With DevTools' network panel on the extension's worker (chrome://extensions, the worker link), refresh an item's sales after five minutes: `transaction.getPaginatedTransactions` stops at the first held fill; page count depends on new volume, up to the configured cap.
- **Store package.** `npm run package`; load the zip's contents unpacked in a fresh profile (unzip it into a folder) and run through the bar, the Ledger and the settings.

## 3.3.0 on the live page

At 3.3.0, the sell form, picker and Quick dismantle were read live on 2026-10-10 (one piece picked, nothing listed); the new code ran only in tests (the MCP tab stayed hidden). This was the older form. Reload the extension itself first: a page reload alone keeps the old background.

- **Sell form (legacy):** on the old single-price form, pick one piece: the suggestion under PRICE shows sold/ask/trend, and Use fills the input without listing. Pick pieces whose estimates differ by more than 15%: "list apart", no Use. The v0.27 Sell items window is unsupported; expect no suggestion or Use there.
- **Quick dismantle (inventory):** the bar sits under "Quick dismantle"; marks on tiles; ↗ Flip and ♻ Scrap dim the rest; SELECT ALL and QUICK DISMANTLE are the game's and untouched.

## 3.2.0 on the live page

Checked on the tests and the synthetic page; the picker's DOM was read live on 2026-10-10 (structure only). Not seen on the live game:

- **Inventory picker:** open the Items picker in "Sell an item" (separate from the market's "+" → Select an item). The bar shows All and available nonzero Crafted / Bought / Case / Loot filters with counts; every tile carries a small mark (hover for source, cost and value, mixed identical sources, or `?` when history lacks it). Choose Crafted: other sources dim, scrolling keeps the marks; filter clicks do not select or list anything.
- **The market item in the picker:** with an item selected on the market, "◎ legendary boots N ×" dims the other items; × lifts it.
- **Sales windows:** check cards start at "N same · 24 h" and widen a day at a time through 7 d when matching sales are too few; a value uses at most 50 matching sales.
- **Tables:** the Ledger and Craft tab tables keep their own dark rows, without the game's grey stripes.

## 3.1.0 on the live page

3.1.0 was checked on the test suite and on a synthetic page (the real extension code, the account's real history, a stand-in for the game's dialogs). Not seen on the live game:

- **Craft window placement:** the panel goes above the row that holds CRAFT and the game's other buttons (the first ancestor of CRAFT with two native buttons that is not the whole dialog), else just before CRAFT. Confirm it sits full width above the buttons and the buttons keep their own look.
- **Eco / War in a game window:** clicking the switch flips it and the numbers, and does not close or click through the game's dialog.
- **A fresh craft:** deliberately craft one with the window open on the market page; after the requested history polls, wait for the piece first in the list with its stats, value and result. Same-stat values have no prefix; other bases use `≈`. Its item's sales are read before the market's other items.
- **Value marks:** check market cards and Ledger lines: same-stat values have no prefix; similar, any-stat and game-average values use `≈`, as the Craft tab's tooltips do. The picker and the Market tab's legend still mark same-stat values `~`.
- **Eco numbers:** the Ledger's "N in battle, not counted" and the craft window's "in battle" rows match pieces you remember wearing.

## Automated gate

- `npm ci --ignore-scripts`
- `npm run check` runs lint, typecheck, manifest/store checks, Vitest with many workers, and formatting. On a machine shared with other work, run the parts one at a time: `npm run lint`, `npm run typecheck`, `npm run validate`, `npx vitest run --maxWorkers=1`, `npm run format:check` (Prettier's `endOfLine: "auto"` lets a Windows checkout with `core.autocrlf=true` pass).
- `npm run package` builds `dist/warera-plus-<version>.zip`; note its SHA-256.
- Inspect `git diff --check`.
- Keep `package.json` and `manifest.json` versions aligned, with a `CHANGELOG.md` entry (the validator checks both).
- For jitter, screenshots and store assets, use a Playwright module whose Chromium revision is installed; set `PLAYWRIGHT_MODULE` to a `file:///` URL to its `index.mjs` when it is not locally resolvable.
- Run `node scripts/jitter.mjs` and `node scripts/jitter.mjs --late`; compare the reported numbers with the limits by eye: at most one shift while the market settles, none added by the extension for late offers or Load more. The script runs on the synthetic row page (`fixtures/market.html`), not the v0.27 cards, and only reports the shifts: it does not enforce the limits. To tell the page's own shifts from the extension's, run both again with `--settings '{"equipment":false}'`: Load more and the late offers must measure the same.
- `node scripts/screenshots.mjs` renders the synthetic fixture; compare `docs/screenshots/` at wide and narrow widths. `node scripts/store-assets.mjs` renders the store's images into `docs/store/` from the same stand-in page.

## Manual gate — required before merging/releasing

These checks require a real Chromium browser and the user's own WarEra account; automation and synthetic fixtures do **not** complete them. Historical provenance only: two offers' old layout (2026-10-07), case/craft windows read by injecting the readers (2026-10-08), and a Node run of the worker's history pipeline against one account's live feed (28,641 transactions, 11,778 of 11,780 fates tied). Installed 3.0.0 was not observed on the page; these records do not establish current 3.8.0 acceptance.

- Reload the existing unpacked extension from the same folder, then reload the game. Confirm existing key/preferences remain available and the settings page shows the two thresholds (SNIPE ROI, FLIP gap) and the modules.
- Test the key explicitly from settings. Check accepted, rejected, missing-header, offline and cooldown states. Never put keys in screenshots, logs or issues.
- **The bar:** on `/market/equipments` confirm one bar above the tax notice, the saved tab or closed default under it, and the game's original grid spacing. Click each tab: Market, Craft, Ledger open under the bar, the same tab again closes it, the choice survives a page reload. With the Equipment module off, confirm the bar still mounts with the Craft and Ledger tabs only. Confirm a tab or Refresh clicked while the game tab is in the background shows its effect once visible again (hidden tabs render nothing by design).
- **Card lines:** verify Buy and Withdraw remain unobstructed at narrow, normal and wide widths and 200% zoom. Check common/mythic cards, skins, hover colors, colorblind theme and Load more. Withdraw/"Yours" cards have no line or snipe/flip signal. On other cards, check the tag and large gain/ROI for the chosen route; small text shows scrap value and sells value/basis, or the missing data's read state. Follow `game avg` and sales bases as reads complete (all loaded items, the selected item first). In a weapon's Details, verify each sale is within the displayed match tolerance; the sales' span need not bracket the piece.
- **Weapon and armour cards:** compare native stats and durability with Details → "This piece" on one weapon, one bare-stat armour piece (e.g. `46`) and one helmet (`NN%`). Current cards read isolated item-tile stats. Report any mismatch even if a number prints: out-of-range stats are not always rejected as `stats unreadable`.
- **Tags:** with FLIP at 10%, find a card whose same/similar-stat sells value beats its price by more and confirm FLIP; `game avg` and `any stats` never qualify. Raise the threshold above the gap and check PASS on a card that does not qualify for SNIPE; check SNIPE takes precedence when scraps also qualify. Compare a FLIP estimate with the game's transactions using its own displayed adaptive window and stat adjustment. Open Details by mouse and keyboard (Tab to ▸, Enter/Space); check no native card action fires and focus stays after refresh.
- **Market tab:** confirm the six scrap floors match the game's resource market walked through the bids; select an item in the grid and confirm the fills line (count, median, low, high, last) against the game's transaction list; with the network off, refresh and confirm `last read failed` stays until a read succeeds.
- **Craft tab:** confirm the scrap and steel asks match the resource market; for one tier compare the random cost with the game's craft dialog at those prices (scraps × ask + steel × ask; the dialog shows the random steel, a chosen slot doubles it); confirm each slot's average in the opened tier matches the "Current value" the game prints on that item; with the averages still loading, confirm `k/6` and no EV, never a guess.
- **History and Ledger:** reload the extension and the game. While the history fills, keep the tab visible: the Ledger head shows its progress on five-second polls until it reaches the profile's start; note read errors or cooldowns. Reload again: the stored history comes back without a new fill. Compare one day's Got/Cashed and piece results with your sales and scraps that day. Change the API key for the same player: the history stays.
- **Case window:** open a battle case in inventory: above the Open buttons, check `Open ~X · Sell Y`, OPEN/SELL/EVEN, Today, All and Last. Toolboxes get no panel; the wooden case's is in the 3.9.0 section. After a deliberate battle-case opening, history reads are requested at 2.5 and 7 s; wait for Today to count it and Last to show the drop/value, checking for read errors rather than a fixed completion deadline.
- **Craft window:** open Craft items, pick a tier: check random cost at the asks, worth at game averages and your craft history above the buttons. Pick a slot: check chosen cost/value, including doubled steel. After a deliberate craft, wait through the 2.5/7 s history polls for its piece, stats, value and cost; check errors if it has not arrived.
- **Tax notice:** the market tax is the buyer's; confirm no extra tax adjustment is applied to bar quotes or the cards' tax-inclusive offer prices.
- Change the selected item while fills are loading. Verify the displayed fills match the selected item and unknown picker tiles remain visible. Show all and close the picker; no game width or visibility should remain changed.
- Resource market and inventory: compare sealed bids and depth with the game; check all three cases. Collapse/expand and manually refresh. Missing prices/depth must not produce SELL or OPEN EV.
- Open the map menu before and after distance loads. Turn the game's "Quick move & collect on case click" off first: with it on, a click that leaks to the "Nearest wooden case" item moves you to the case; with it off, the item's click takes the game's focus-only path instead. Toggle one way / round trip and click the line's text: the game reacts to neither. The native control remains usable by keyboard.
- Leave the tab hidden for two minutes, return, and confirm stale labels are paused while new data is read.
- Navigate between market, inventory and profile without reloading. Verify the bar, the case strip and the trip line disappear where not applicable and appear on return, once each.
- Test two tabs, change the saved key during a delayed request, and verify no old-account quote becomes active.
- Record real Performance traces on a large loaded market and a busy map. Compare scan counts, main-thread time and requests with 1.8.0; the synthetic numbers in `docs/perf/` are from the fixture, not the live page.

## Known assumptions

The valuation rules are not re-audited here. Wooden-case rules carry the 26 Oct 2026 v0.27 audit; the others keep the repository's 2026-09-16 model. Referenced research files are absent from this extension repository; their sample sizes, results and raw wooden-case measurements were not independently reproduced here.

**Crafting.** The recipe table is shipped ([docs/GAME-FACTS.md](GAME-FACTS.md) §3): scraps equal to the tier's scrap value, steel 1 / 2 / 4 / 8 / 16 / 32 for a random craft and twice that for a chosen slot (the game's craft dialog shows the random steel; chosen doubles it). The random craft's slot odds (30% weapon, 14% each armour slot) carry a 2,200-craft measurement and a historical game-config reference, not a fresh live read. The value of a craft is the game's average price per item, a mean of recent sales of any roll; a roll distribution by stat is not modelled.

**Cards.** Current cards use isolated item-tile stat tokens; v0.27 fixtures cover weapons, precision gloves, helmets and bare armour stats. The retained v0.26 row parser uses the last percentage as durability and preceding numbers as stats. The value method (a tenth of each stat's range for "same", a quarter for "similar", three and five sales) is a design choice, not measured against what the market actually pays for a stat step.

**Values.** The game's average (`gameStat.getEquipmentAvgByCode`) is an undocumented procedure that answered the key on 2026-10-07. If it disappears, cards can use fills and usable cached averages; incomplete Craft coverage withholds EV and reads `k/6`, or `0/6` when nothing usable is cached.

Wooden cases follow the v0.27 model: rarity odds 60/25/12/3, uniform integer production budgets 20–40 / 40–70 / 80–130 / 160–260 by rarity, rounded resource units with at least one, and 20 resource outcomes. Every outcome needs enough observed depth. Battle case openings follow the drop policy (`sellFrom`, default epic). Travel assumes 10 stamina or 2 oil per region per leg, while the game spends the stamina on hand first and pays the regions left with oil (the oil figure its "Nearest wooden case" item prints, read live on 2026-10-27); the extension does not read stamina balance, guarantee a case is still available, or model route changes between outbound and return legs.

The accepted-key check still uses the project's rate-limit-bucket heuristic (greater than 100). A missing header is now unverified, not a rejected-key claim. If the API changes bucket policy or undocumented procedures, update fixtures and the adapter. Since 3.4.0 an empty key reads keyless (books, averages, players) by design; a key that is set and not accepted is never silently replaced by keyless reads. Live check for 3.4.0: clear the key, reload the extension and the game; the floors, SNIPE tags, battle-case and craft windows fill; the market sales line, the Ledger, the craft window's results and the picker say they need the key; no request to transaction.getPaginatedTransactions is made.

Live check for 3.5.0: select a weapon in the market's Select an item, set CRIT. CHANCE (and ATTACK), then open the current Items picker in "Sell an item": nothing moves (3.5.1). Press ⇅ by crit: if scanning is needed, the game's list blanks while read, with no tiles flying past; no blanking is needed when all tiles are already rendered. Check crit-then-attack order, matching pieces lit and "N of M" in the head. Click a piece (0/5 → 1/5), then click it again: it stays selected. Change the native Weapons/rarity filter: the list is read again. Cancel without listing. In Quick dismantle the bar offers the items in the window, weapons first.
