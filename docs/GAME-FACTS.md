# Game facts the extension relies on

The 1.6.0 build was made without access to the game or to the research
repository behind this extension, so it shipped no recipes, guessed at the
tax side and called most rules "unverified". This file carries what that
research knows, with its provenance, so that no number in the extension has
to be typed in by the player or guessed by a contributor. Every fact carries a
tag: **MEASURED** (reproduced on the full market feed or in game), **CLIENT**
(read off the game's own client bundle or config), **CODEX** (the community
codex at warera.unikhorne.dev/codex, which cites its sources and dates) and
**UNVERIFIED** (an assumption the code still makes).

## 1. Items, codes and what a slot rolls

Six rarities, one weapon name per tier, five armour slots with the tier digit
in the code:

| Tier | Rarity    | Weapon | Armour codes                             |
| ---- | --------- | ------ | ---------------------------------------- |
| 1    | common    | knife  | helmet1, chest1, gloves1, pants1, boots1 |
| 2    | uncommon  | gun    | helmet2 … boots2                         |
| 3    | rare      | rifle  | helmet3 … boots3                         |
| 4    | epic      | sniper | helmet4 … boots4                         |
| 5    | legendary | tank   | helmet5 … boots5                         |
| 6    | mythic    | jet    | helmet6, chest6, gloves6, pants6, boots6 |

Each slot rolls one stat (weapons two): weapon = attack + critical chance,
helmet = critical damage, gloves = precision, chest and pants = armor, boots =
dodge. **CLIENT** (`gameConfig.getGameConfig` → `items[].dynamicStats`,
snapshot of 2026-09; identical to the codex tables).

## 2. Scraps, dismantling and durability

- **Scrap ladder** (what a piece dismantles into at 100% durability): common
  6, uncommon 18, rare 54, epic 162, legendary 486, mythic **1458**.
  **MEASURED**: 17,269,842 real dismantle transactions reproduced with zero
  mismatches (August 2026). The codex prints 1460 for mythic; the audit says 1458. `lib/ladder.mjs` already carries this.
- **Yield at durability** `s` of `max`: `floor(full × (1 + 2s/max) / 3)`,
  the full ladder at 100%, exactly one third at 0% (a destroyed piece returns
  2 / 6 / 18 / 54 / 162 / 486; the operator measured those in game on
  2026-09-16). **MEASURED**.
- **Steel is never returned** by dismantling. **CLIENT** (the bundle
  decomposes the dismantle return as `craftCost/3` + a durability-scaled bonus
  and has no steel term).
- **Market listings are always at 100% durability** (editor's correction,
  2026-09-03). A durability filter on listed gear is therefore moot; the
  durability on a fill still matters for comparing resale evidence.
- Wear: 1% per hit on armour (a dodged hit costs nothing), 1% per hit on the
  weapon including misses. **CODEX** (controlled run of 164 hits,
  2026-09-16).
- **A dismantle row tells worn gear from a fresh reroll.** The scraps it
  returns equal the tier's ladder exactly for a piece at 100% and fall below
  it for any wear; nothing returns more. **MEASURED** on one account's whole
  history (2026-10-10): 11,419 dismantles, 9,474 at the full ladder, 1,945
  below it (most at exactly one third, gear worn out), none above; of the
  crafted pieces dismantled, legendary 264 of 287 and epic 475 of 509 came
  back short. 3.1.0 marks such a piece `worn`: in **Eco** it leaves the
  results (cost and result) and is counted apart, in **War** it counts. A
  piece still held carries no durability in the history, so a held piece
  that is being worn is priced at what pieces of its stats sell for.

## 3. Crafting recipes

A craft consumes **scraps equal to the scrap ladder of the output tier** and
a **steel fee** that the transaction feed does not record.

| Rarity    | Scraps | Steel, random slot | Steel, chosen slot |
| --------- | ------ | ------------------ | ------------------ |
| common    | 6      | 1                  | 2                  |
| uncommon  | 18     | 2                  | 4                  |
| rare      | 54     | 4                  | 8                  |
| epic      | 162    | 8                  | 16                 |
| legendary | 486    | 16                 | 32                 |
| mythic    | 1458   | 32                 | 64                 |

- Scraps: **MEASURED**, 534,037 of 534,037 June 2026 `craftItem` rows carry
  exactly the output tier's ladder as the input (code `scraps`, money 0,
  output state 100).
- Steel, random: **CLIENT**, `craftCostSteel = {1, 2, 4, 8, 16, 32}` in the
  bundle.
- Steel, chosen slot: **CODEX** (verify level "official"): the craft menu
  says choosing the slot costs ×2 steel, scraps unchanged. Cross-check: at the
  2026-09-16 market a mythic craft computed 381 g random and 438 g chosen;
  the operator read 378 and 436 in game the same evening.
- A **random craft** returns a weapon in about 30% of cases and each of the
  five armour slots in about 14% (2,200 crafts of five heavy crafters,
  **CODEX**; the game config's `loot.weaponChancePercent` is also 30).
- The recipe is the same for every slot of a tier. There is no recipe table
  in the game config; the numbers above are the whole table.

Consequences for the Craft Desk:

1. Every tier × slot cell has a recipe: ladder scraps + the **chosen-slot**
   steel. No cell should read "no recipe"; the player's own entry may still
   override the shipped one.
2. A random craft of a tier is a distribution over six codes (0.30 weapon,
   0.14 each armour slot) at half the steel. The existing `craftEV` already
   takes such a distribution; it is "unavailable" until every slot of the
   tier has a sales estimate, which is the honest answer.
3. **The reroll floor.** A bad roll dismantled at 100% returns all its
   scraps; the steel is the only sunk cost of an attempt. The worst case of a
   craft is therefore `scraps × scrap bid` back and `steel × steel price`
   lost, not the whole input cost.
4. Codex reading of September 2026 prices, for orientation only (re-price
   live): mythic random cost 381 g against results worth, averaged over
   every roll, jet 453, boots 440, gloves 380, helmet 370, pants 361, chest 346. Choosing the slot never paid for a seller at those prices (legendary
   boots gained 23.89 g for 27.17 g extra steel; a jet 51.26 for 54.34); it
   flips when steel falls below 1.60 g (jet) or 1.49 g (legendary boots).

## 4. Stat ranges per item (the roll)

`gameConfig.getGameConfig` → `items[].dynamicStats`, **CLIENT**, matching the
codex tables (which add a 260-profile live verification). The holes between
tiers are intentional, so a stat value maps back to its rarity unambiguously.

| Code             | Stat              | Range           |
| ---------------- | ----------------- | --------------- |
| knife            | attack / crit %   | 21–40 / 1–5     |
| gun              | attack / crit %   | 51–60 / 6–10    |
| rifle            | attack / crit %   | 71–90 / 11–15   |
| sniper           | attack / crit %   | 101–130 / 16–20 |
| tank             | attack / crit %   | 141–170 / 26–35 |
| jet              | attack / crit %   | 221–300 / 41–50 |
| helmet1          | criticalDamages   | 1–15            |
| helmet2          | criticalDamages   | 16–30           |
| helmet3          | criticalDamages   | 31–50           |
| helmet4          | criticalDamages   | 71–90           |
| helmet5          | criticalDamages   | 91–110          |
| helmet6          | criticalDamages   | 121–150         |
| chest / pants 1  | armor             | 1–5             |
| chest / pants 2  | armor             | 6–10            |
| chest / pants 3  | armor             | 11–15           |
| chest / pants 4  | armor             | 21–30           |
| chest / pants 5  | armor             | 36–50           |
| chest / pants 6  | armor             | 56–70           |
| gloves / boots 1 | precision / dodge | 1–5             |
| gloves / boots 2 | precision / dodge | 6–10            |
| gloves / boots 3 | precision / dodge | 11–15           |
| gloves / boots 4 | precision / dodge | 21–25           |
| gloves / boots 5 | precision / dodge | 31–40           |
| gloves / boots 6 | precision / dodge | 51–60           |

- The shape of the roll inside a range is **UNVERIFIED** (uniform is not
  confirmed). Do not weight outcomes by an assumed uniform roll.
- Price of a roll: the codex reports a jet at 293 attack / 47% crit selling
  around 560 g against a 453 g average, and that the crit factor's value is
  flat from 41 to 49 and jumps only at 50 (about +19%). **CODEX**.
- Fills from `transaction.getPaginatedTransactions` carry `item.skills`
  (the stat object) next to `item.state`; `api.mjs` currently drops it. That
  field is the way to price rolls against plain rolls.

## 5. The market tax

- The tax is the **buyer's**, at the buyer's own country's rate, and it goes
  to that country. **The seller receives the listed price either way.**
  **CODEX** (Markets; sourced to the client config and the wiki).
- Since **2026-09-09** the price shown on the equipment market **already
  includes** the buyer's tax. The notice above the list reads
  "All prices displayed include a 1% market tax from your country" (observed
  from a 1% country). Earlier builds printed "Taxed price".
- Consequences: the Craft Desk's `proceeds` should run in **added** mode (the
  seller nets the listing, the buyer in a c% country sees listing × (1 + c)),
  not the current "deducted" default. `dom.taxRateFromText` expects the
  number **after** "market tax"; in the live notice it comes **before**, so
  the parser returns null on the real page and must accept both orders.
- Whether `money` on a fill is the seller's listing or the buyer's taxed total
  is **UNVERIFIED** (the research repo compared fills as-is, 2026-09-16). The
  codex's rule (seller receives the listing; tax is a separate flow to the
  country) makes the listing the likelier reading. Label it.
- The equipment verdict keeps the editor's rule of 2026-09-03: scraps × the
  **highest scrap bid** compared **as-is** with the displayed price, no tax on
  either leg. Do not reintroduce a tax model there.

## 6. Cases

- Opening odds (**CODEX**, audited in the research repo on 543,747 /
  18,692 opens): slot 30% weapon / 70% armour; Case: common 62%, uncommon
  30%, rare 7.1%, epic 0.85%, legendary 0.04%, mythic 0.01%; Elite case:
  uncommon 50%, rare 32%, epic 15%, legendary 2.5%, mythic 0.5%. Expected
  scraps per open 14.7188 (case) and 67.499 (elite); `lib/cases.mjs` carries
  them.
- Wooden cases (v0.26.0, 2026-09-15): hourly roll of 25% base + the loot
  skill's value, at most 5 held, expire after 48 h, a 20-code resource pool.
  **CLIENT**. Travel costs 10 stamina per region hop when the bar covers the
  whole trip, else 2 oil per hop, never both (**CLIENT**, confirmed in game).
  What a wooden case drops changed in v0.27: §12.

## 7. The page

- Rarity is readable **only from the item frame's border colour**. Since
  v0.26 the shades are the theme's 850 step: gray `#1C2E31`, emerald
  `#0A2C1C`, blue `#0E1D3F`, purple `#2A1745`, yellow `#2B2B12`, red
  `#390F10`; hover is the 700 step; the colour-blind theme paints epic pink.
  Grid tiles carry `id="item-code-selector-<code>"`, so the palette is
  calibrated off the page each scan (`dom.calibrateRarityBorders`).
- Item images: `<img alt={skinKey || itemCode}>`, so the alt is the skin name
  ("winterJet") when skinned and the plain code otherwise.
- Offer rows: 12 per page behind a translated "Load more"; the price is the
  line right before **BUY**; your own listing shows **DELETE** instead.
- Offer row lines (read live 2026-10-07): a weapon prints its attack, its
  crit and the durability in that order (`101`, `16%`, `100%`, then the
  seller, the age, the price, BUY); an armour piece prints its one stat and
  the durability (`12%`, `100%` for precision gloves; armor is printed bare,
  `46`). So the durability is the last percentage before the price and
  every number before it is a stat. Under a selected item the page shows a
  minimum-stat filter (ATTACK / CRIT. CHANCE for a weapon), empty by default.
- Literal English anchors in every locale: "Buy", "market tax" / "Taxed
  price", the grid titles, the picker label "Item", "New item offer".
- **The inventory picker since v0.27** (read live 2026-10-10): "+ NEW ITEM
  OFFER" opens "SELL AN ITEM" with five slots ("pick up to 5 weapons or
  equipment in perfect condition"); a slot opens a dialog whose text starts
  `Items0/5`, then the game's own filters (All / Weapons / Equipment, All /
  each rarity). The tiles sit in a **virtual list** (rows carry `data-index`;
  64 of 286 tiles were in the DOM), so a filter must dim tiles, not remove
  them. A tile is a box with a rarity gradient (`background-image`), the
  skin image and its numbers, each `%` in a text node of its own
  (`270 | 50 | % | 100 | %`). Only 100% pieces are offered, so a tile's
  code and stats match the history's held pieces exactly; the 3.0 picker
  test for "Item" no longer matched it.
- The picker's virtual list (read live 2026-10-11): rows of 8 tiles, each
  row `top: 0; transform: translateY(4 + 105 * index px)` inside a box as
  tall as every row, in a scrolling box (753 px tall for 225 pieces in
  2,851 px). The rows change on the scroll event: a programmatic scroll in a
  hidden tab renders nothing until a `scroll` event is dispatched. A click
  on a tile selects it (the counter goes 0/5 -> 1/5 and the piece shows in
  the head); a second click unselects it; the tile's classes do not change.
  The market's minimum-stat filter inputs are named by the stat
  (`input[name=attack]`, `input[name=criticalChance]`; placeholder = the
  range's low end, rifle 71 / 11).
- The grid's "Current value" is `gameStat.getEquipmentAvgByCode`, a mean of
  recent sales, not the cheapest offer (jet 430.5 while the cheapest offer
  was 383.8 on 2026-09-03).
- Reloading an unpacked extension does not replace the content script in
  open tabs; the game page must be reloaded too, or the old script runs with
  a dead runtime. The other way round, reloading the page alone runs the new
  `lib/` code (imported from disk) with the old `content.css` (read when the
  extension was loaded): seen in Brave on 2026-10-27, 3.8.1's lines in
  3.8.0's 52 px box until the extension itself was reloaded.

## 8. The API

- `api2.warera.io` answers a wrong or missing key from the keyless bucket
  (`ratelimit-limit` 100) instead of refusing; an accepted key gets 500. So
  "accepted" means limit > 100; a missing header is unverified, not rejected.
- Without a key (2026-10-11, policy `100;w=60`, per address): `tradingOrder.getTopOrders`,
  `tradingOrder.getTopOrdersPerItemCode`, `itemTrading.getItemTrading`,
  `gameStat.getEquipmentAvgByCode` and `user.getUserLite` answer;
  `transaction.getPaginatedTransactions` answers 401 "API token required"
  (sales and a player's history need a key). A GET batch counts as one.
- `tradingOrder.getTopOrders {itemCode, limit}`: limit capped at 100 per
  side, no cursor; a side returning exactly 100 rows is truncated.
- Undocumented but answering the key: `tradingOrder.getTopOrdersPerItemCode
{itemCodes, limit}` (every book in one call) and
  `gameStat.getEquipmentAvgByCode {itemCode}`. A tRPC GET batch (`?batch=1`)
  counts as one request.
- `transaction.getPaginatedTransactions {transactionType: "itemMarket",
itemCode, limit: 100}` is the per-item fills feed; a fill carries `money`,
  `createdAt`, `item.code`, `item.state`, `item.skills`. Busy commons hit the
  500-fill cap inside 72 h.
- `itemOffer.getItemOffers` (the open offers) is session-only: API keys get
  "API tokens cannot access this endpoint". Same for `user.getMe`,
  `userMapLoot.getMine`, `country.getMyCountry`.
- Some open offers are priced at 1e50 g as "not for sale" markers; ignore
  anything above 1e6 in value sums.

## 9. What this means for the next release

In order of value, each small enough for one commit with tests:

1. Ship the recipe table (section 3) as `lib/recipes.mjs`; the Craft Desk
   takes a player's entry first, else the shipped chosen-slot recipe, and
   labels the source. Drop `fixtures/recipes.json` (its numbers were
   invented) and the "no recipe" state for the 36 codes.
2. Add a per-tier **Random** column: half the steel, six outcomes at the
   slot odds, EV through the existing `craftEV`.
3. Show the reroll floor in the detail: scraps back at the scrap bid, steel
   lost per attempt.
4. Switch `proceeds` to the seller-nets-the-listing reading and make
   `taxRateFromText` read the live notice (section 5).
5. Carry `item.skills` on fills and show a stat's place in its range
   (section 4) in Details and in the ledger form.
6. Rewrite the "Crafting" paragraph of the release checklist and the README's
   Craft Desk section from this file.

Status: 1 to 4 and 6 shipped in 1.7.0 (`ladder.mjs` carries the table and
the odds, `craftdata.mjs` the shipped recipes, the overrides and the random
craft, `craft.mjs` the reroll floor; the desk passes the buyer-side tax mode
and the notice parser reads both word orders). 5 shipped in 1.8.0 as
`stats.mjs` (fills now carry `skills`); the stat's place in its range on an
offer's Details is still open.

## 10. The community ledger's method, verified (2026-10-05) — historical

The site `warera-prices.web.app` answered "Site Not Found" on 2026-10-07; the
verification below stands as a record, and the extension no longer has
anything to compare against.

warera-prices.web.app/ledger replays a player's own feed in the browser with
the player's API key. Read against the feed for one account (8 legendary
crafts that morning, slot drawn at random, all still held):

- **Cost = the recipe at the craft day's average input prices, random-craft
  steel.** `itemTrading.getItemTrading {itemCode}` (keyed, bucket 500)
  returns 30 daily rows `{valueAt, avgValue, totalValue, totalQuantity,
transactionsCount}`. On 2026-10-05 scraps averaged 0.247778 and steel
  1.789756: 486 × 0.247778 + 16 × 1.789756 = 149.056 per craft, × 8 =
  1,192.45 against the site's 1,192.46. The chosen-slot fee (32 steel) would
  give 177.69. **MEASURED** on the site's own numbers.
- **The per-piece figures on its Desk tab are not costs.** Each is the
  piece's clearing price × 1.01, the viewer's 1% buyer tax (Mali): 162.610
  = 161.000 × 1.01, and so on for all seven. A second corroboration of §5.
- **"Clears" = the median of recent sales of the same roll value.** For
  the seven held pieces the median over the exact roll in the last 72 h
  came within 2% of the site's figure (chest5 at 46 and 47 clear
  differently, 129.396 and 131.231, so the site prices per roll value, not
  per band); the fifth-of-range band and the whole item were further off.
  The site's window is unknown; the 24-hour exact-roll median matched four
  of seven to the cent.
- **"At market" is the plain sum of the held pieces' clears**: 161.000 +
  121.775 + 129.396 × 2 + 131.231 + 167.990 + 122.251 + 187.250 = 1,150.29.
- **The headline counts epic and up** ("5 below epic not counted"), reports
  "crafting today" as the realized result on pieces that are gone and "net
  value" as the held pieces' clears against their inputs.
- **"Sells 2.8h"** on a piece is the typical wait for that roll; fills
  carry `offerCreatedAt`, so it is the median of createdAt − offerCreatedAt
  over the roll's sales. Not shipped yet.
- **The player's own feed**: `transaction.getPaginatedTransactions` takes
  `userId` with the key (documented filter; a wrong id answers an empty
  list, not an error). A craft row's `item` is the OUTPUT piece with `_id`,
  `code`, `skills`, `state 100`; its `quantity` is the scraps consumed and
  the steel is nowhere in the feed. A later sale (`sellerId` = the player)
  or dismantle with the same `item._id` closes the craft; across 200 crafts,
  75 sales and 100 dismantles of one account every join was by that id.
- **The player's own id** is on the game page: the header links
  `/user/<id>/inventory` and `/user/<id>/skills` are the logged-in player's
  (chat and ranking links point at bare `/user/<id>`); `user.getUserLite
{userId}` answers the key with the username. `user.getMe` stays
  session-only.
- **The market feed is far denser than the craft feed** (measured
  2026-10-07, own account): the `itemMarket` feed of an active trader
  carries about 100 rows per 3.5 hours, so a 500-row cap covers ~17 hours.
  The sale/dismantle walk is therefore cut at the oldest craft in the window,
  not at the window itself.

Separately, the author's local 1.5.2 (labelled stat reading in
`statsdom.mjs`, `market.mjs` skills, the bounded Load-more loader) is still
unmerged in the private repository; its row reader reads **labelled** numbers
only, which is the right answer to the checklist's open question about the
live row layout.

## 11. v0.27 on the dev server (read 2026-10-17) — historical: the auction house did not ship, and 3.8.0 dropped its support

The game's next version, read on dev.warera.io (client 0.27.0-beta, build
`JWLllTElOSrQkss76XV1d`) against live 0.26.2-beta. Dev is a test world: its
prices are not live prices. Nothing was listed, bid or hired to read this.

- **The equipment market is an auction house.** `/market/equipments`
  leads to `/market/auctions`; the client calls no `itemOffer.*` and the
  server answers 404 "No procedure found" for them. `itemAuction.*` replaces
  them: `getAuctions {itemCode?, minSkills?, sort, limit: 12, cursor?}`
  (sorts endingSoon, newest, lowestPrice, lowestMaxPrice, mostBids),
  `getMyAuctions {view: selling | bidding | ended}`, `getMyItemsValue
{itemIds}`, `getById {auctionId}`, `createAuctions`, `placeBid`,
  `cancelAuction`. With an API key `getAuctions`, `getMyAuctions`,
  `getMyItemsValue` answer 403 "API tokens cannot access this endpoint" (a
  keyed 403 is read as a rejected key by `api.mjs`: never ask them with the
  key); `getById` answers without a key.
- **An auction**: `estimatedValue`, `startPrice` (0 allowed), `maxPrice`
  (100-160% of the estimate; a bid at it wins at once), `price` (current),
  `bids [{user, amount, at}]`, `leader {amount, escrow, taxRate, taxCountry}`,
  `durationHours` (6, 12, 24, 48, 72, 120 or 168; 24 by default), `endsAt`,
  `status` (active, sold, unsold, cancelled). Bids are typed before tax; the
  bidder's country adds its market tax and the bid plus the tax is held until
  the bidder is outbid (refunded at once) or wins; the seller receives the
  whole winning bid. A bid in the last minute resets the countdown to one
  minute. Up to five weapons or equipment at 100% durability, one auction
  each, the same start price and length.
- **The estimate** is the item's average price (`gameStat.getEquipmentAvgByCode`)
  times 1 + 0.05 × the mean of where each stat sits in its range (§4, 0 at the
  bottom, 1 at the top), to three decimals: 72 of 72 active auctions, and the
  form's "From 82.404 to 131.846" for an epic sniper 123/16 at an 80.87
  average. Two legendary/mythic pants carried an
  estimate while the public average answered 0.
- **The card** prints the stats, the item's name, the countdown (separate
  text nodes "5h", "35m", "28s"), "Starting price" (or "Current bid" once bid
  on) and "Max price", both before tax, the seller, the bid count, and two
  buttons: Buy now with the max price plus the buyer's tax, Bid with the next
  minimum bid plus the tax (about 5% over a current bid). Amounts are split
  into nodes ("277", ".", "927"). The item frame has no border: the rarity is
  the item code's, or for a skin the tier its stat falls in. The notice:
  "Bids are shown before tax: when you bid, your country … adds its 10%
  market tax." The item grid is in a "Select an item" window (the tiles keep
  `item-code-selector-<code>`; frames mythic 88,27,29 · legendary 53,54,16 ·
  epic 59,35,95 · rare 23,48,101 · uncommon 10,61,40 · common 26,56,62);
  `?item=` and the stat inputs (`attack`, `criticalChance`, …) are as before.
- **The form** ("Start an auction", opened by SELL AN ITEM) has
  `input[name=startPrice]` and `input[name=maxPrice]`, disabled until a piece
  is picked in the same "Items 0/5" picker as before (rows `translateY(4 +
99·i)`). With one piece the max is in gold and the form prints the range;
  with several it is a percentage of each piece's estimate.
- **A sale** is an `itemMarket` transaction as before: `money` before tax, a
  new `item._id`, the seller's `lastAcquisitionAt`, `offerCreatedAt` = the
  auction's start (so listed-to-sold now mirrors the auction length).
- **Workers become NPC employees** (`employee.*`, all session-only; hire with
  Energy, train once a day per employee with a hand of cards, hidden traits,
  happiness, events) and players become managers (`manager.*`,
  `managerOffer.*`, `/market/jobs`). Nothing here reads them.
- **Tools and toolboxes.** 36 tools (`sickle|pickaxe|skillet|hammer|flask|
caliper` 1-6, `isTradable: false`, a production stat) come out of the
  `toolbox` case (legendary, not tradable). Opening one writes an `openCase`
  row with `itemCode: "toolbox"` and the tool as `item`; tools dismantle into
  scraps on the gear ladder (a common one 6). `itemTrading.getItemTrading
{itemCode: "toolbox"}` answers 404 "Itemtradings not found."
- **Wooden cases can drop cases** (client config `caseDrops: case1 1-10,
toolbox 1-10, case2 1`; the chance is not in the client): an `openCase` row
  with the case's code, a quantity and no item (toolbox ×7, ×8 seen). **Not
  in the live v0.27** (§12): the live client has no `caseDrops` and 13,155
  live wooden opens gave resources only.

## 12. v0.27 live (2026-10-26)

**Historical employee rules.** The Responsibility shield, half-of-candidates
trait model, Sprinter, Leadership, mixed-trait Rehab and hire/move happiness
figures recorded here are superseded by §13. The old API/HTML fixtures remain
evidence of their capture dates; they are not current employee configuration.

v0.27 went live on 2026-10-26 (client build `XmH-E6LDGflCh7NUJ-csh`, read
22:00 UTC on the live page with the player's own session; nothing was bought,
listed or hired). Several things differ from what the dev server showed in §11.

- **No auction house.** `/market/equipments` lists item offers as before,
  from `itemOffer.getItemOffers {itemCode?, minSkills?, sort: cheapest |
newest | mostExpensive, limit: 12, cursor?}` (the sort is kept in the
  cookie `item-offers-sort`, the item in `?item=`). Offers are cards in a CSS
  grid (`repeat(auto-fill, minmax(min(100%, 260px), 1fr))`), then Load more.
  A card (client module 98170): the item tile (frame with a
  `linear-gradient(45deg, <rarity> 0%, <dark> 100%)` background and no
  border, the image's alt the skin key or the plain code, the stat chips, a
  durability bar and "100%"), the seller (avatar, flag, name, a level badge
  whose number is an SVG `<text>`), the offer's age ("22m") or "Yours" on the
  player's own offer, the price **the buyer pays, tax included** (3 decimals,
  e.g. 43.798) and "tax incl.", then **Buy** with a cost chip holding the
  rounded amount (43.8), or **Withdraw** on the player's own offer. The
  notice: "Prices include your tax · Every price here is what you pay, tax
  included: the seller's price plus the N% market tax of your country …".
  Frames seen: common `rgb(35, 55, 59)`, epic `rgb(59, 35, 95)`. Sanitized
  markup: `fixtures/v027-live-market.html`, `fixtures/v027-live-market-sniper.html`.
- **The card's layout and numbers** (read 2026-10-27 off build
  `D256KTEyoPbDLXMnwL_LR`'s bundle, keyless, from the landing page; module
  98170 is as on 2026-10-26). The card (module 25620, size sm) is a block,
  `position: relative`, padding 8 px, `h: 100%` of its grid cell (the grid's
  gap 8 px); its one child is a flex row, also `h: 100%` (nowrap, items at the
  top, gap 8 px): the item tile, then a column (gap 4 px: the seller line, the
  price line, the Buy box with 4 px under it). Anything placed after that row
  inside the card lands below the card, over the next row of cards.
  Numbers go through module 37686's `ZV(value, precision)` (the card's price
  at precision 3; the Buy chip was seen with two decimals at most, 43.798 as
  43.8 and 1.49 as 1.49, not read in the code): below 1,000 `toFixed`, trailing zeros
  cut ("1.49", "43.798"); from 1,000 the value in K, from a million in M,
  from a billion in B, each to three decimals, trailing zeros cut again
  ("1.234K", "1.235M", whole thousands "7K"; 1e50 is "1e+41B"). Module 18156 splits the text at the point: the whole part, then
  a span with "." and the rest as text nodes of their own ("1", ".", "234K").
  A price of 1,000 or more is known only to the gold, to 1,000 gold from a
  million.
- **The list redraws.** The grid sits in a `Loadable` (module 7378): while a
  query loads (a new sort, item or stat filter, not Load more) it unmounts the
  grid and draws a skeleton, then a new grid. Load more appends 12 cards to
  the same grid. The section around it holds the tax notice, Sell an item, the
  item selector ("+", or the picked item's tile with its average) with the sort
  tabs and, for a picked item, its minimum-stat inputs, then the list.
- **Selling** is the "Sell an item" button: a "Sell items" window, up to 5
  pieces at 100% durability, each with its own price (`price-<itemId>`,
  0.7-1.6x the game's estimate, `itemOffer.getPriceSuggestions {itemIds}` →
  `{itemId, suggestedPrice, priceRange, similarOffers[3]}`), then
  `itemOffer.createItemOffers {items: [{itemId, price}]}`. A click on one of
  the three similar offers sets the price 0.001 under it.
- **Wooden cases** (patch notes §15, client module 30899
  `productionValueByRarity`): a rarity is rolled 60 / 25 / 12 / 3 (was
  65/20/13/2), one resource of that rarity uniformly, and a budget of
  production points by rarity: common 20-40, uncommon 40-70, rare 80-130,
  epic 160-260 (every case was 20-80). Units = **round**(budget / the
  resource's productionPoints), at least 1. **MEASURED**: 13,155 live opens
  from the global `openCase` feed (2026-10-26 16:00-19:39 UTC; a wooden open
  is a row whose `itemCode` is the resource and whose `quantity` the units, no
  item): rarities 60.4 / 24.8 / 11.9 / 2.9% (|z| ≤ 1.0), every amount inside
  the round rule (χ² 219.8 on 265 df), e.g. livestock 1 or 2 at 47.5 / 52.5%
  (round 47.6 / 52.4, floor would be 95 / 5), cooked fish 7 twice (260 / 40 =
  6.5 rounds up). No case or toolbox drops. At the 2026-10-26 22:30 UTC bids
  an open was worth 7.80 against a sealed bid of 7.43 (EVEN); the old rules
  gave about 6.1.
- **Candidates** (Companies → a company's Recruit button, client module 3906):
  3 a day per company (+1 with a Recruiter trait), each card showing the
  name, nationality, age, the **wage a day** (24 × the hourly wage, up to two
  decimals, "1.2 / day"), three stat chips always in the order Production,
  Responsibility, Luck ("?" when hidden), the revealed trait as a
  `role="img"` badge labelled with its title, a "?" badge per hidden trait
  (tooltip "Hidden trait"; no badge means no trait), "Potential N" when the
  training potential is the revealed hint, and Hire. The gauge on Hire and
  Reroll all is the **player's current energy** (a skill bar marking the
  cost), not the cost: hiring costs 10 energy (`hireEnergyCost`), Reroll all
  10 (`rerollEnergyCost`; the patch notes say it doubles after the first).
  `employee.getCandidates {companyId}` is session-only and sends hidden stats
  as 0 with `revealed: false`, the potential not at all: nothing hidden can
  be read ahead of hiring. The wage can: wage = Production / 4 × the point
  value × the expectation (`wageExpectationSpread` 0.3: 70-130%) × 1.2
  Greedy / 0.85 Modest, so wage a day / (6 × point value) = Production ×
  expectation × trait, and `lib/hiring.mjs` reads Production back from it
  (live: 1.2 / day at 0.1019 is Production 2 for certain, 2.82 is 4).
- **The point value** is `gameStat.getPpMoneyValue` (GET, no input; the
  procedure takes void and refuses `input={}`): `{"result":{"data":0.1012}}`,
  public, keyless. It moved from 0.1019 to 0.1012 within the day.
- **Employee and team facts verified 2026-10-28.**
  `employee.getMyEmployees` is a tRPC GET with no input and the player's
  `x-api-key`. It returns an array of the player's employees, with company
  ids, names, gender, age, nationality ids, base and trained stats, traits,
  hourly wages, wage expectation, stat breakdowns, happiness items and
  shield, and the production bonus's parts. The sanitized answer is
  `fixtures/employees-live-2026-10-28.json` (18 employees); the company link
  `/company/<24 hex>` is inside the card, four levels above its Recruit
  button. Train's header supplies the exact trainee name; age breaks a name
  tie. Group employees by company; an empty company has no coworkers.
  The server's `base` already includes `trained`; total Production is base
  plus flat contributions, never trained twice. Points an hour are total
  Production × 0.25 × (1 + total production bonus / 100). Lionel's
  3 × 0.25 × 0.999 = 0.749 (shown 0.75), Mohannad's 6 × 0.25 × 1.052 =
  1.578 (1.58), Claudia's 7 × 0.25 × 1.598 = 2.797 (2.8).
  Specialization, tools, Sprinter, events and management add in the bonus.
  Happiness contributes value − 50, above or below 50; happiness is
  50 + positive items + negative items × (1 − shield), with shield = total
  Responsibility × 0.1, capped at 1. Wages use base Production: trait and
  team points are unpaid. A hire or move adds `recentlyMoved` −5 for seven
  days; expiring items drop on their `until` date. Lionel's income tax −4
  and recentlyMoved −5 with shield 0.1 give happiness 41.9. Adding a Bully's
  −10 gives 32.9, output bonus −9.0 points; over his 20 days left the loss
  is 32.4 points (−3.27888 g at 0.1012).
- **Team trait rules (client table, read 2026-10-28).** Bully gives himself
  +2 Production with coworkers and each coworker −10 happiness; Comic
  himself −1 and coworkers +10 happiness. Foreman gives coworkers
  +3 Responsibility. Lucky Charm / Jinx give coworkers +3 / −2 Luck;
  Trainer adds one training a day. Rival is +3 Production with a stronger
  coworker, −1 otherwise; Mentor loses 1 while any weaker coworker gains 2.
  Loner alone gets +100% bonus and +5 happiness. Sociable gets +25% per
  coworker, capped at 50%, and −10 happiness alone. Prima Donna has +20%
  bonus and −10 happiness in the table's best-paid state. Envious loses
  5 happiness per better-paid coworker, capped at −10. Nationalist gets
  +2 Responsibility and +5 happiness with coworkers of his nationality;
  Xenophobe loses 2 Production and 5 happiness with a foreign coworker;
  Cosmopolitan gains 2 Production per other nationality, capped at 4.
  Girl Power / Band of Brothers add 15% per female / male coworker, capped
  at 30%; Misandrist / Misogynist subtract 15% per male / female coworker,
  capped at −30%. Old Friends / Nemesis / Sweethearts need a named partner
  (+15% / −15% / +20%); Recruiter adds a candidate slot.
- **Team model assumptions (2026-10-28), not server-verified conditions.**
  Rival and Mentor compare **base** Production with strict greater / less;
  Prima Donna's +20% and −10 happiness apply together only while his hourly
  wage is highest, ties included; Nationalist requires at least one
  coworker and every coworker of his nationality. Unknown gender,
  nationality, base Production or hourly wage skips the affected rule in
  both before and after states, and names it in `assumed`; a Recruit flag
  is a country **name**, the roster's nationality an **id**, with no mapping,
  so nationality conditions involving a candidate stay unevaluated. A
  hidden candidate Responsibility uses the 1–4 average, 2.5, for his shield.
  A named partner is unreadable; partner traits, Luck changes and Trainer's
  extra trainings are named without a gold price. Own plus team chooses
  the pick. Team is only the change over each coworker's days left to 65,
  capped at 60 and at the subject's own horizon, using the server's totals
  and a day-by-day delta with specialization growth and item expiry.
  Candidate Production and hidden-trait cases, and Wild card's combined
  trait and stat cases, are averaged after evaluating the real conditions.
  New hires' own tax, recentlyMoved and quitting are outside this model.
  See [TEAM-MODEL.md](TEAM-MODEL.md) for the design and evidence.
- **Training** (client module 3906, the card 81658; config `training`): one
  draw a day per employee (+1 with a Trainer coworker), 10 energy, a hand of
  3, keep one; a pending hand is `employee.pendingTraining.offers` and
  reopening it draws nothing (pressing train without one draws and pays).
  Cards: Drill / Intensive drill +1 common, +2 uncommon, +3 epic, +4
  legendary to one stat (no rare drill); Negotiation −5 / −10 / −20 points
  of wage expectation (common / uncommon / rare), never below 0.7; Wild card
  a random hidden trait and +1 to a random stat; New habit a mixed (rare) or
  positive (epic) trait, two positives (legendary), shown on the card, the
  legendary one titled "Two new habits" (`traitTo2 ? … : "New habit"`; a
  drill's title is "Intensive drill" above +1, read 2026-10-28, build
  `6pO9D_vom7joxH3ibKzmO`), its caption "A and B" in three text nodes; Rehab
  one negative (rare) or mixed (uncommon) trait; Clean slate every negative
  (legendary, dealt with 2+); Second wind +2 / +3 / +4 potential; Mentoring
  never dealt. The window's header prints his stats, a happiness chip, his
  production bonus (pickaxe, "+0.9%"), his wage chip (coin, "+13.8%":
  (expectation + Climber drift) × (1 + Greedy 0.2 / Modest −0.15) − 1,
  "Market rate" at 0) and his potential ("1/3"); a card shows its rarity,
  title and effect ("-10%" "Expected wage", "+2" with the stat's icon and
  "Now 1").
- **Live Train markup and paid Production** (2026-10-27): dealt cards are
  `div[type="button"]` inside their three boxes, while Close and Pick a card
  remain real buttons. Header Production includes trait points; wages use
  base Production. Claudia's Laborer gives +3 on raws: header 7, output
  6 × 7 × 1.038 ≈ 44 points/day, wage 6 × 0.1012 × 4 × 1.183 ≈ 2.87 g/day.
  The Employee dialog stays open before Train, with the same employee name;
  its Stats block's Daily wage supplies that independent wage reading.
  Sanitized windows: `fixtures/v027-live-train-claudia.html` and
  `fixtures/v027-live-train-mohannad.html`.
- **A hand's odds** (read 2026-10-27, client module 56899 and its config):
  `training.rarityWeights` common 55, uncommon 25, rare 13, epic 5,
  legendary 2; every Luck point adds `luck.trainingWeightShiftPerPoint`
  (uncommon 0.5, rare 0.3, epic 0.15, legendary 0.05) and takes their sum
  from common, never below 0 (`vh(leadership, luck)`). Live windows read on
  2026-10-27 show "Your Leadership" and "Their Luck" with their levels:
  Leadership shifts 1 / 0.6 / 0.3 / 0.1 a level the same way. At Leadership
  3, Luck 1 gives 48 / 28.5 / 15.1 / 6.05 / 2.35%, Luck 2 gives
  47 / 29 / 15.4 / 6.2 / 2.4%, Luck 4 gives 45 / 30 / 16 / 6.5 / 2.5%.
  This corrects the earlier inference from `pt(0, luck)` in the client.
  The pool an employee is dealt from
  (`S(e)`): a drill for each of Production, Luck and Responsibility at +1
  common, +2 uncommon, +3 epic, +4 legendary; Rehab for each trait that is
  not positive (negative rare, mixed uncommon); Clean slate (legendary) with
  2 or more negative traits; New habit for each trait he lacks, mixed rare
  and positive epic, and a legendary card for each pair of positive traits
  the conflict list allows; Wild card (uncommon) while a trait can be gained;
  Second wind +2 rare, +3 epic, +4 legendary while potentialMax + gain ≤ 15;
  Negotiation −5% common, −10% uncommon, −20% rare while the expectation
  stays at 0.7 or more. Trainings left are potentialMax − potential (the
  header's "1/3" is potential / potentialMax, and already counts the open
  hand: Lionel's 0/8 became 1/8 immediately after drawing it). A future hand
  drawn j days from now only pays for H − j of today's H-day horizon;
  Second wind's extra hands come after the ones already left. The draw itself is
  server-side, but a hand has one rarity: every card of each of the five hands
  read on 2026-10-27 to 29 shared it (three uncommon, three common, three
  legendary...), as the Intel planner also states. `lib/hiring.mjs` draws the
  hand's rarity by the odds, then three different cards of it at random. Luck also gives a toolbox chance of 0.001 an
  hour a point, at most 0.02 (`zr`), times the traits'
  `toolboxChanceMultiplier`.

## 13. v0.27.3 (2026-10-29)

Sources: live reads supplied on 2026-10-29 from client chunk
`_app-4dc4091e745d6c41.js` (employee config, all 52 trait entries and the full
training-pool function), `employee.getMyEmployees` (the player's 19 employees),
`company.getProductionBonus` (the player's Steel company) and
`country.getCountryById` (Mali). These facts supersede employee rules in §12.
No live calls were needed for this model update.

- **Employee config:** `traitsPerEmployee {min:1,max:1}`, `candidateSlots 3`,
  `baseStat 1..4`, `startAge 18..45`, `aging.yearsPerDay 1`, hidden
  `potentialMax 3..10`, `hireEnergyCost 10`, `rerollEnergyCost 10`,
  `fire.hireLockHours 12`. Every candidate carries exactly one trait, shown as
  a `?` badge until hired, drawn by hire weight (52 traits, total weight 354;
  Sweethearts has weight 0). The current Recruit fixture is
  `fixtures/v0273-live-recruit.html`; shown Production, Responsibility, Luck
  and wage chips belong to the game. Advice repeats only hidden Production.
- **Happiness config:** min 0, max 100, neutral 50, full-storage penalty 10,
  unpaid penalty 10, tax penalty 1 per percent, maximum quit chance 0.05,
  `happinessQuitThreshold 30`, production bonus 1 percent per happiness point.
  `responsibilityHappinessPerPoint 3`: R1/R2/R3/R4 contribute +3/+6/+9/+12.
  `wageExpectationSpread 0.3`; wages still depend on paid Production only.
- **Moves still cost happiness:** `move.companyMoveHappinessPenalty 10`,
  `penaltyDays 7`. Do not infer free transfers. Specialization grows 1 percent
  a day, capped at 20 percent (`percentPerDay 1`, `maxPercent 20`).
- **Live happiness:** all 19 employees returned
  `{base:50, contributions:[{reason,delta,until?,code?,eventCode?}], mitigated,
value, quitChance}` with no `shield`. Value is `clamp(50 + sum(delta),0,100)`.
  Reasons include `responsibility` (+3R), `incomeTax` (−4 in Mali), `trait`
  (Specialist +5, Patriot +10), `event`, and `recentlyMoved` (−10).
  `mitigated` was 0 for everyone. **ASSUMED:** it is the part Loyal's
  `happinessPenaltyMultiplier 0.5` removes from negative items. The team model
  does not simulate Loyal mitigation; its changed negative items count in full.
- **Live production bonus:** contributions are `management` (player-wide,
  +22 here, 2 × Management skill), `happiness` (value − 50), `specialization`,
  `tool` (the employee's held tool) and `event`. No company-wide production
  part was present: `company.getProductionBonus` for Steel returned
  `{depositBonus:0,total:0}`. `skills.managementBonusPercentPerLevel` is 2.
- **Recruit's company percentage is income tax.** The client renders
  `taxes.income` on every company card, including a disabled one. Mali returned
  `taxes {income:4, market:0, manager:4}`. The reader's compatibility field
  `bonus` is passed into valuation as `incomeTax`, never added to output.
- **New hire valuation:** happiness is `clamp(50 + 3R − tax + trait happiness,
0,100)`; production bonus is Management + (happiness − 50) + specialization,
  without a tool. Read Management's percentage from any player employee row,
  even in another company; without rows use 0 and disclose its omission. Tax
  comes first from the company chip, then the `incomeTax` item of a member of
  that company, else 0 with a note. Shown Responsibility is used; an unread
  `?` falls back to the starting mean 2.5. Trait happiness already stored in
  `TRAITS.pct` is counted once, and applies to unpaid Production too.
- **Tax traits:** Tax-shy is a production percentage, not happiness:
  `productionPercentPerTaxPercent:-1, capPercent:-30`. Price it at the known
  income tax (Recruit chip, roster or trainee), otherwise the table's 10%
  reference. Statist gives +2 Responsibility (+6 happiness) when known income
  tax is at least 20%, none below; unknown tax keeps the table's value.
  Training happiness effects and Responsibility share the daily 0..100 cap,
  using observed happiness and the snapshot-anchored expiry of its items.
  A card's signed direct trait, Responsibility and trainee team happiness
  changes are summed before clamping, including replacements and each Wild
  outcome. At happiness 98, Statist plus Nationalist can add only two points;
  at 99, Wild's +1 Responsibility and Xenophobe's −5 happiness give 97.
- **Age traits:** Sprinter is gone; Early Bloomer replaces it, weight 5,
  positive, `PER_YEAR_OF_AGE {stat:PRODUCTION,peakDelta:6,delta:-2,perYears:10,
ageAbove:30,capDelta:-6}`. Its production is
  `max(0,6 − 2*floor(max(0,age−30)/10))`: +6 at 39, +4 at 44, +2 at 55, 0 at 60. Verified: Claudia Heathcote, age 44, had +4. Patch description: +6 until
  40, then −2 per 10 years, gone at 60. Late Bloomer config is
  `{delta:2,perYears:10,ageAbove:40,capDelta:6}`; Worn Out is
  `{delta:-2,perYears:10,ageAbove:50,capDelta:-6}`. **ASSUMED**, by the verified
  Early Bloomer step shape: Late Bloomer is
  `min(6,2*floor(max(0,age−40)/10))`; Worn Out is
  `max(-6,-2*floor(max(0,age−50)/10))`. All three use age + day throughout the
  horizon. Unknown starting age averages uniformly over 18..45 each day.
- **Specialist on hire** always matches the company's good: +3 Production
  and +5 happiness, condition share 1. The training habit estimate keeps
  `CONDITION_ODDS.specialist = 0.05`, because its good is unknown there.
- **Training config:** rarity weights common/uncommon/rare/epic/legendary
  55/25/13/5/2; hand size 3. Every stat has drills +1/+2/+3/+4 at
  common/uncommon/epic/legendary. Wild card is fixed uncommon; negative Rehab
  fixed rare, with no Rehab for mixed traits. Negotiation drops expectation
  by 5/10/20 percentage points at common/uncommon/rare, floor 0.7. Mixed
  habits are rare, positive habits epic, positive pairs legendary. Clean
  slate requires at least two negatives and is legendary. Second wind gains
  +2/+3/+4 at rare/epic/legendary while potentialMax stays at or below 15.
- **Training eligibility:** a trait must be absent, nonexclusive with every
  owned trait, permitted for the employee's known gender, and not a partner
  trait (`oldFriends`, `nemesis`, `sweethearts`). Habits exclude negatives;
  pair habits require two eligible positives also nonexclusive with each
  other. Wild card is present only with at least one eligible trait, includes
  any polarity and draws uniformly over that list, not by hire weight. Its
  bad-trait chance is negative eligible count / total eligible count.
  Female-only traits: `girlPower`, `manHater`; male-only: `bandOfBrothers`,
  `misogynist`. An unknown gender does not filter the training pool.
- **Recruit gender:** the live age icons (2026-10-29) are unlabelled Material
  Design `mdiGenderMale` / `mdiGenderFemale` paths. Bouba Sall, 38, is male;
  the other three candidates in the fixture are female. The reader identifies
  the paths, retaining label/class checks for other renderings, and passes the
  gender into team rules alongside coworkers' API `gender`. **ASSUMED:**
  hires use the same gender restrictions as the client's training pool.
  Hidden hire-trait weights are renormalized after that filter; unknown gender
  leaves the full pool available. Bouba's cases exclude Girl Power and Man Hater.
- **All 30 exclusive pairs:** `[handy,improviser]`, `[loner,sociable]`,
  `[cosmopolitan,xenophobe]`, `[comic,bully]`, `[craftsman,laborer]`,
  `[expat,homesick]`, `[statist,taxShy]`, `[diamondInTheRough,burnout]`,
  `[greedy,modest]`, `[flightRisk,anchor]`, `[luckyCharm,jinx]`,
  `[scavenger,handy]`, `[nationalist,cosmopolitan]`, `[loyal,flightRisk]`,
  `[lateBloomer,wornOut]`, `[earlyBloomer,lateBloomer]`, `[veteran,burnout]`,
  `[foreman,bully]`, `[mentor,bully]`, `[primaDonna,modest]`, `[climber,modest]`,
  `[envious,modest]`, `[patriot,expat]`, `[xenophobe,expat]`,
  `[stockpiler,claustrophobe]`, `[loner,comic]`, `[loner,foreman]`,
  `[loner,mentor]`, `[loner,trainer]`, `[loner,luckyCharm]`.
- **Management replaces Leadership:** training rarity shifts per Management
  level are uncommon 1, rare 0.6, epic 0.3, legendary 0.1. Per Luck point the
  shifts are 0.5/0.3/0.15/0.05. Add both shifts to each noncommon weight and
  subtract their sum from common, floored at 0, then normalize. Train accepts
  both `Your Management N` and historical `Your Leadership N`; the new label
  has not yet been seen live. Internal `leadership` message/cache names stay
  compatible, while user-visible text says Management.
- **Responsibility and teams:** a +k drill gives +3k happiness, capped at 100,
  therefore that many output bonus percentage points, with no wage change.
  Foreman's +3 coworker Responsibility means +9 happiness, similarly capped.
  Bully, Comic, Envious, Xenophobe, Prima Donna and Sociable happiness items
  count in full. Server totals remain authoritative; valuation applies only
  switched deltas, item expiry and specialization growth. Existing team
  condition assumptions and unpriced partner/Luck/Trainer effects remain
  documented in [TEAM-MODEL.md](TEAM-MODEL.md).
