# 3.8.0 release run, 27 October 2026

What [RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md) found on main `00bb3f0` (3.8.0). The live checks ran on the maintainer's account in Brave, with the unpacked extension reloaded. They were read-only: nothing was bought, listed, crafted, opened, dismantled, hired or trained.

## Automated gate

The gate ran on a clean worktree at `00bb3f0`, one step at a time, before this branch changed any code. After the changes (`app.mjs`, `casesview.mjs`, `craftdesk.mjs`, `scripts/screenshots.mjs`, the new `trip.test.mjs`), lint, typecheck, validate, formatting and the whole suite passed again on the branch. The branch was merged into 3.8.1 (`fc4bed8`) as `6f7b997`. On the merged tree lint, typecheck, validate and formatting pass, the suite is 38 files and 514 tests, and `dist/warera-plus-3.8.1.zip` has 45 files, 171.9 KB, SHA-256 `9ca0c36f48e95fe0f40b9a80950e5408e79044ec6f74d639b175cca4e61d081b`. The browser steps ran once free memory passed the 4 GB the maintainer's PC needs, with Playwright 1.61.1 from `E:\Qcerris\Naomi\node_modules`, which matches the installed Chromium 1228 (`PLAYWRIGHT_MODULE=file:///E:/Qcerris/Naomi/node_modules/playwright/index.mjs`).

| Step                             | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm ci --ignore-scripts`        | Not re-run: the worktree used the main checkout's install of the same `package-lock.json`                                                                                                                                                                                                                                                                                                                                                                                |
| lint, typecheck, validate        | Pass (validate: 37 modules, 31 public, no runtime dependencies)                                                                                                                                                                                                                                                                                                                                                                                                          |
| tests                            | `00bb3f0`: 37 files, 507 tests pass. The branch: 38 files, 509 tests pass. Both serial (`npx vitest run --maxWorkers=1`)                                                                                                                                                                                                                                                                                                                                                 |
| `npm run format:check`           | Failed on 102 files, line endings only (CRLF from `core.autocrlf`). It passes with `--end-of-line auto`, and now passes as is: `package.json` sets Prettier's `endOfLine: "auto"`                                                                                                                                                                                                                                                                                        |
| `npm run package`                | `dist/warera-plus-3.8.0.zip`, 45 files, 170.9 KB, SHA-256 `d19aaa752a51c7921a2688e27f247c1cbd82f44c78dff9811c469a68b10a92ef`                                                                                                                                                                                                                                                                                                                                             |
| `git diff --check`               | Clean (the worktree, and `940f37c..00bb3f0`)                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Versions                         | 3.8.0 in `package.json`, `manifest.json` and `CHANGELOG.md`                                                                                                                                                                                                                                                                                                                                                                                                              |
| `node scripts/jitter.mjs`        | One layout shift while the market settles (CLS 0.2155; 0.0313 with the equipment module off, so the lines join the bar's one insertion). Load more 0.0071, the same with the module off: the extension adds none. Bar and lines at 53 ms, tags at 317 ms, settled at 6.6 s, 4.31 writes a row, 17 scans in 170 ms (the longest 30 ms)                                                                                                                                    |
| `node scripts/jitter.mjs --late` | Lines 76 ms after the offers draw (876 ms from the start). One shift of 0.0031 and Load more 0.0071, both the same with the module off: the extension adds none                                                                                                                                                                                                                                                                                                          |
| `node scripts/screenshots.mjs`   | Crashed: it clicked a Compact/Details button the bar no longer has. Fixed on this branch; then all 8 images rendered (kept outside the repository). Details still prints "82th" and "61th percentile" (fixed in 3.8.1). Benchmark: 40 bursts, 40 scans in 159.1 ms (the longest 42.6 ms), 3,840 getComputedStyle and 12,481 querySelectorAll calls, no innerText reads, no scans in a quiet 3 s; `docs/perf/browser.json` (1.6.0) has 123.4 ms, 14.4 ms, 1,440 and 2,641 |
| `node scripts/store-assets.mjs`  | All 7 images rendered on `00bb3f0` (left in the gate worktree, not committed). The settings shot shows v3.8.0 and the hiring module. The market shot's head reads "cashed −22.9 g" where the committed one reads "+0.32 g". The fonts are this PC's                                                                                                                                                                                                                      |

## 3.8.0 on the live page

- **The market's cards.**
  - Pass:
    - the bar no longer says "offers not read" ("2 snipes · 5 flips");
    - every card carries a line: 12 of 12, and 24 of 24 after Load more;
    - cards are 282 px wide.
  - **Fail:** the line spills past the card's bottom into the next row (line 758-810 px against a card bottom at 763 px). Fixed in 3.8.1 (`fc4bed8`): live, 12 of 12 lines sit inside their cards.
- **Details.**
  - Pass:
    - the card's own price, three decimals (Offer 1.400 g on a card printing 1.4);
    - "This piece: armor 5 · 100%";
    - 48 sales of the same stats in 24 h, brought to these stats;
    - Enter on ▸ opens Details, focus stays on the button, and the game gets no click.
  - **Fail (text):** "the 2th percentile". Fixed in 3.8.1.
- **Filtered.** `?item=sniper`: 12 of 12 cards are the epic sniper (103-107 attack, 16-17% crit, 40.699-40.999 g). Select an item → epic gloves: 12 of 12 cards read `gloves4`.
- **Your own offer.** Not checked: it needs a listing.
- **Tiers (skins).** Not checked: no skinned piece was at hand.
- **Ages.** Not checked over a timed minute. Lines were present on every return to the market.
- **Recruit.** Pass, on two companies:
  - Iron 1:
    - the head reads "WarEra Plus · ★ " and a candidate's name over 4 one-line candidates, with one ★ and one green outline;
    - the head's "?" names the point value 0.1012, iron at 0.0970 a point at the bids, the +4% bonus and "works alone";
    - a candidate's "?" names "Production 3 (shown on his card)", the wage chip range, gold a day now and after 20 days, and the days to 65;
    - every block sits before Hire, never inside it.
  - Oil Barrel: the head names oil at 0.1060 a point.
- **Train.** Not checked: no known pending hand, and drawing one costs 10 energy.
- **Settings.** Not checked live: the popup needs the extension's id. The tests cover the advisor switch, which takes effect on the next settings poll (about 5 s).
- **Cases.** Pass:
  - the inventory strip prints one wooden-case value (opening 7.750 g against a sealed bid of 7.390 g, UNCERTAIN);
  - its tooltip names the v0.27 rules;
  - the battle Case and the Elite Case are listed beside it.
- **Ledger and toolbox.** The Toolbox chip shows ("Toolbox 1") from the account's existing history.
- **Case window** (battle case, not opened): "Open ~3.70 · Sell 3.81 EVEN", today, all time, the last opening. Eco/War switch the numbers within 1-2 s, and the window stays open.
- **Grid.** After Select an item, the cards keep the right tier.

## Manual gate, live

- **The bar.**
  - One bar.
  - Market, Craft and Ledger open; the same tab again closes; the open tab survives a reload.
  - The Market tab's floors (6 / 18 / 54 / 162 / 486 / 1458 scraps at the 0.236 bid: 1.42 … 344) match the API's scrap book.
  - The Craft tab's asks (scraps 0.238, steel 1.939) match the API's books. A common random craft costs 3.37 = 6 × 0.238 + 1 × 1.939.
- **The Ledger.**
  - All 13,713 (Craft 1,427 · Case 10,150 · Buy 1,365 · Loot 769).
  - Paging: 1-50 → Older 51-100 → » 13,701-13,713 → « back to 1-50.
  - The Craft filter shows 1-50 of 1,427. The list scrolls in its own box.
- **Craft window** (legendary, not crafted): "Craft now 147 → 163 · +16.4 g (+11%)". The cost is the 486 scraps and 16 steel the game's button shows.
- **Quick dismantle** (nothing dismantled):
  - the source bar with counts and a mark on every tile;
  - ↗ Flip dims the rest, and All brings it back;
  - ⇅ by crit offers the window's items, weapons first.
  - Notes, not bugs:
    - "All 256" counts the pieces the history says you hold, while the window lists 244, because equipped pieces are not in it;
    - ↗ Flip lights 13 tiles for 4 flip pieces, because identical tiles share one history group.
- **Navigation.** Market → inventory → back, without a reload: the bar once on the market, the strip once on the inventory.
- **Tax notice.** The account's country charges 0%, so "no extra tax" cannot be told apart here.
- **Map trip line.**
  - Pass:
    - the map menu's "Nearest wooden case" item carries the line: "13 regions · One way · 130 stamina required, or 26 oil · 5.278 g · Sealed net +1.932 g · opened expected net +2.499 g";
    - the toggle switches to Round trip (260 stamina or 52 oil · 10.556 g) and back, and its click never reached the game. A listener just inside the game's item checked this.
  - **Fail, fixed on this branch:** a click on the line's text (anything but the toggle) reached the game's item. The game's "Quick move & collect on case click" setting was on, and with it on that click runs `userMapLoot.moveAndCollect`: the player travels to the case and collects it. In the run a safety listener caught the one stray click, so nothing moved. Now the line stops every click (`app.mjs`, `trip.test.mjs`).
  - **Model gap:** the game pays a move with the stamina on hand first (10 a region) and the regions left with oil (2 a region). Here that was 20 stamina and 22 oil, the "22" the game's item prints. The line says "130 stamina required, or 26 oil", and 130 is more than this account's stamina bar holds (100).
  - Keyboard: the game's item is outside the tab order (tabindex -1) with or without the line; the toggle is a button.
- **Not checked live:**
  - the two-minute hidden tab: the test tool brings a tab back to the front when it reads it, and the game closes the map menu when its tab is hidden, so this needs a person;
  - the Market tab's sales against the game's transaction list;
  - the Items picker in "Sell an item";
  - the key states;
  - throttling, Performance traces, a fresh profile, 200% zoom and the colorblind theme.

## Needs the player

- **Actions in the game:**
  - list one cheap piece (own offer);
  - craft one sniper and one random piece (◎ and doubled steel in the Ledger);
  - open a case and a toolbox (counts and the last opening);
  - open an employee's **already pending** training hand.
- **The key:**
  - test it in the settings (accepted, rejected);
  - clear it and reload (keyless surfaces);
  - change it with two tabs open.
- **DevTools and profiles:**
  - Slow 4G on the market;
  - the worker's Network panel for the sales refresh;
  - Performance traces;
  - the store zip in a fresh profile;
  - 200% zoom and the colorblind theme.

## Fixes

- **This run's branch** (`431d4d9`, merged into 3.8.1):
  - a click on the map's trip line no longer reaches the game's "Nearest wooden case" item, which can move the player;
  - the trip line's age is a live label (`timeLabel`), so a passing second no longer rewrites the line and swallows a press on its toggle;
  - the checklist's stale wording rewritten to the current cards, Recruit, Ledger and wooden-case rules;
  - the craft board's tooltip marks the game's average with ≈, as the Market tab's legend says;
  - `scripts/screenshots.mjs` runs again: the stale Compact/Details click is gone, and the popup and the benchmark take the version from the manifest;
  - Prettier's `endOfLine: "auto"`, so `npm run check` passes on a Windows checkout.
- **3.8.1** (`fc4bed8`):
  - the card line's overflow: while a card holds the line, the card is a column and the line sits at its bottom;
  - card prices from 1,000 up ("1.234K"), which read as no price;
  - "2th" and the other ordinals.
- **Open:**
  - out-of-range stats taken from `?item=` (`dom.mjs`) are not rejected, and Details has no line for a frame that disagrees with the stat-derived tier; both wait for the maintainer's call;
  - the live "Sell items" window is not adapted, so it shows no price suggestion;
  - the trip line's cost model: the game spends the stamina on hand first, then oil, so the line could read the oil figure the game's item prints;
  - a press on the trip line that starts in the instant the distance arrives can still reach the game's item, because the line then moves to its new anchor mid-click;
  - the picker and the Market tab's legend mark same-stat values `~`, while cards and Ledger lines print them bare (`equipment.mjs`);
  - scans on the synthetic page do more work than in 1.6.0 (see the benchmark above), and the longest takes more than a frame;
  - `scripts/jitter.mjs` reports layout shifts but does not fail on them, and it runs on the v0.26 row stand-in, not the v0.27 cards;
  - the store images come from the same stand-in; captures of the live v0.27 game would make a better listing (CHROME-WEB-STORE.md).
