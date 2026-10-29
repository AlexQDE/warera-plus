# WarEra Plus

An unofficial browser extension for [WarEra](https://app.warera.io). It puts estimates next to what the game already shows you: what an offer on the equipment market is worth, what a craft costs and returns, what opening a case gives, how your own crafting and trading has done, which candidate to hire and which training card to keep. It does not play for you: it never buys, sells, lists, crafts, opens a case, dismantles, hires, trains or travels. Formerly **WarEra Lens**, originally **WarEra Scrap Sniper**: the same extension, settings and key.

[Changelog](CHANGELOG.md) · [Privacy policy](docs/PRIVACY.md) · [How it works inside](docs/ARCHITECTURE.md) · [Game facts it rests on](docs/GAME-FACTS.md)

WarEra Plus is not made, endorsed or supported by the makers of WarEra.

## What it shows

**On the equipment market.** A bar above the offers with three tabs, **Market**, **Craft** and **Ledger**, none open until you pick one. Under each offer card from another player, one block: a tag, the gain of the tagged route (dismantle the piece for its scraps, or sell it on) and what pieces with these stats sell for. **Details** opens the evidence: the bids its scraps would fill, the sales it is compared with, how fast such pieces sell. A SNIPE card is framed green and a FLIP card purple. Your own offers are left untagged.

| Tag       | Meaning                                                                                                                                                                                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SNIPE     | The scraps the piece dismantles into, sold at the current bids, beat its price by at least your minimum ROI (3% default)                                                                                                                                           |
| FLIP      | Pieces with these stats sold in the last 7 days, brought down to today's level when the market fell, for at least your FLIP margin (10% default) above its price, with fewer than two offers of stats at least as good listed under that (before tax); needs a key |
| NEAR MISS | A scrap loss within a negative minimum ROI you set; never a profitable label                                                                                                                                                                                       |
| PASS      | Neither                                                                                                                                                                                                                                                            |
| NO QUOTE  | No scrap quote, an unreadable price or rarity, or too little depth on the bids                                                                                                                                                                                     |
| READING   | The first scrap quote is still being read                                                                                                                                                                                                                          |
| STALE     | The quote is older than the refresh interval or the last read failed; no tag until a fresh one                                                                                                                                                                     |

**Craft tab.** For each tier, what a craft costs at the market's asks (the tier's scraps and the steel fee; a sniper craft, with the slot picked, burns twice the steel), what it is worth at the game's average prices of its six items, and what scrapping a bad roll at once loses.

**Ledger tab** (needs a key). Your history since the start of your profile, read from the API and kept in your browser: every craft, case opening, buy and battle loot, with its cost, what became of the piece (sold, dismantled, still held) and the result. It covers today, 7 days, 30 days or everything, and lists every piece of the window, 50 a page, filtered by source. **Eco** leaves gear worn in battle out of the results, **War** counts it.

**In the game's own windows.**

- The craft window: what the craft costs and is worth now, your results with that tier and today's crafts.
- The case window: what opening it is worth against selling it sealed, your results with that case, and what your last opening gave when it was this case. The wooden case's window also lists your openings' drops at their day's prices and at today's bids.
- The Sell items window: under each piece's price, what pieces of both its stats sell for, the asks it competes with, a **use** button for that piece, and a red line when the game's starting price comes from an offer with other stats and sits under what these stats sell for.
- The item picker and Quick dismantle: how you got each piece (crafted, from a case, bought, loot; needs a key), and behind **⇅ by crit** a list of one item's pieces from the best roll down with what each sells for. A click on a piece in that list selects it in the game's list.
- The Recruit window (Companies, a company's **Recruit** button): one line per candidate, with his Production (as his card shows it, or estimated from his wage when the card hides it), the wage chip he will show once hired and the gold until he retires; the details are on its "?". With your key, `team −3.3 g` alongside his own gold shows what he changes for the company's other employees. The largest own plus team gets the ★ and outline; the tooltip names each affected coworker, the read's age and the assumptions.
- The Train window: a two-line value **above each dealt card**, bold gold a day over the total until he turns 65 and the days counted. With your key, the second line adds the card's `team` gold when it moves a coworker; its own value includes the team effects it changes for the trainee too. A Luck drill shows its total and the future trainings it improves; Second wind its total and extra trainings. The largest own plus team gets a ★ and an outline. The "?" explains each value, each affected coworker, the Leadership used for the odds and the Production his wage is paid on. Without an employee read, both windows keep their original estimates and explain why the team is not counted.
- The My workforce window (Companies, the Workforce section): with your key, a panel above the Employees list with who to train first (by what finishing their trainings is worth), who sits in the wrong place for his traits (Rival, Mentor, Bully, Loner, Sociable, Envious, Prima Donna, Laborer, Craftsman), and who earns less than his wage. When your saved API key belongs to another account, this panel, Recruit and Train say so instead of advising.

**Cases and travel.** On the market and in the inventory, what each case is worth opened against sold sealed: a wooden case's resources at the current bids; the other cases' gear at the game's average prices from the rarity you sell from (Epic by default, in the settings) and at its scraps below it. With **Flip** chosen for wooden cases in the settings (Advanced), the wooden case shows its ask in place of the sealed bid and is tagged FLIP when buying one at the ask and opening it beats your SNIPE minimum ROI. The Ledger's **Wooden** chip lists your wooden case drops by resource. On the map, what a trip to the nearest wooden case costs.

## How it works

It has two sources, and no others.

1. **The page you have open.** It reads what the game has drawn in your tab, the same text you see: an offer card's price (the one beside "tax incl.") and the item's stats, a candidate's wage and shown stats, the window you opened, your player id from the page's links to your profile. It does not see the game's network requests or their answers, and it never reads your login session.
2. **The game's public API** at `api2.warera.io`, read-only:

| Procedure                                | What for                                                                                           | Key                    | How often, at most                                                                                                                                                                                                          |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tradingOrder.getTopOrders`              | The scrap book, 100 orders a side                                                                  | No                     | Every 30 s (settable, 10-600 s) on the market and while a craft, case, item picker or Quick dismantle window is open                                                                                                        |
| `tradingOrder.getTopOrdersPerItemCode` ¹ | The books of the cases, of scraps and of the 20 resources a wooden case gives, 20 orders a side    | No                     | Every 60 s while case values, trip costs, the Craft or Ledger tab or a craft, case or Recruit window are open                                                                                                               |
| `gameStat.getEquipmentAvgByCode` ¹       | The game's average price of each of the 36 gear items                                              | No                     | Every 10 min while something on screen needs it                                                                                                                                                                             |
| `gameStat.getPpMoneyValue` ¹             | The game's production point value, which wages rest on, for the Recruit and Train windows          | No                     | Every 10 min while the Recruit or Train window is open                                                                                                                                                                      |
| `employee.getMyEmployees`                | Your employees: stats, traits, happiness, wages and company                                        | Yes                    | Every 5 min while a Recruit or Train window is open                                                                                                                                                                         |
| `transaction.getPaginatedTransactions`   | An item's sales over 7 days; your own history                                                      | Yes                    | An item's sales every 5 min while it is on screen or the Ledger, a craft window or the Sell items window prices it; your history every 60 s (every 5 s while it is first read, every 15 s around a craft or a case opening) |
| `itemTrading.getItemTrading` ¹           | The daily average prices of scraps, steel, cases and the resources you got, for the Ledger's costs | Read with your history | Every 10 min, one read per item (5 to 25)                                                                                                                                                                                   |
| `user.getUserLite`                       | Your username                                                                                      | Read with your history | Once                                                                                                                                                                                                                        |

¹ Not in the API's documentation ([openapi.json](https://api2.warera.io/openapi.json), last updated for 0.17.4-beta); the game's own client reads them on the same api2. When the multi-book read fails, the books are read with `tradingOrder.getTopOrders` instead.

Each request is a GET that carries your key in its `x-api-key` header when you set one, with cookies off and redirects refused. Nothing goes anywhere else. Everything is worked out in your browser; your key, your history and the caches stay there. There is no server, no analytics and no third party.

## What it does on the page

It adds its own lines, the bar and the outlines. Beyond that it touches the game's page only when you click one of its own controls:

- **⇅ by crit** (**⇅ by stat** on armour) scrolls the game's item list through to read it, hidden while it does, puts it back where it was, and reads it again if it changes while the list is open;
- a click on a piece in its list scrolls the game's list to that piece and clicks its tile, and clicks again if that click unselected a piece already selected;
- **use** writes a suggested price into one piece's price field in the sell form; PUT ON SALE is still yours to press.

It never presses Buy, Sell, Withdraw, Craft, Open, Dismantle, Hire, Train, Travel or any confirmation, never submits a form, never loads more offers or reloads the page by itself, and has no alerts or sounds. After an update it shows a **Reload page** link; the reload is yours.

## The game's rules

[Rule 3](https://app.warera.io/rules) bans bots, scripts and automation used to gain an advantage over other players, web scraping included, and says "data collection and display tools that use the official public API are allowed". WarEra Plus is such a tool:

- **The game's public API only**: public procedures on `api2.warera.io`, the documented ones and those the [WarEra tRPC client](https://github.com/AlexQDE/TRPC) lists, with your own key or the keyless allowance, at the rates above.
- **No login session.** It never reads, uses or sends the game's session: no cookies, no tokens, no access to the game's own requests.
- **Nothing the game does not make public.** Its estimates are arithmetic on what the page shows and the API returns. The Recruit estimate of a hidden Production is the wage the card prints over the game's point value.
- **No automation.** Every action in the game is yours ([above](#what-it-does-on-the-page)).
- **Only the page you have open**: the text the game has already drawn in your tab, to put its numbers beside it. It never opens other pages or loads more offers, and sends nothing it reads anywhere.

On 27 October 2026 a WarEra admin confirmed that the extension may use these api2 procedures with the public key, the four the documentation does not list included. Of the hiring estimate, the admin's review was that it gives no alternative way to perform game actions and no information the game does not make public: "just math using existing info".

If you are on the game's staff and see a problem, [open an issue](https://github.com/AlexQDE/warera-plus/issues).

## Install

From this repository, unpacked, in Chrome 105 or later or another Chromium browser:

1. Download or clone the repository and check out the version to use.
2. Open `chrome://extensions`, turn on **Developer mode**, choose **Load unpacked** and select the `extension` folder.
3. Reload the WarEra page. After an update, replace the files in the same folder, press **Reload** on the extension, then reload the game: a reloaded extension does not replace its script in tabs already open.

**Your API key (optional).** Open the settings from the toolbar icon, paste the key you create in the game's account settings, **Save**, then **Test**. Without a key: the scrap prices, SNIPE and the game's average price on the market, the Craft tab and the craft and case windows' costs and worth, the case values, the trip costs, the item picker's list by crit, and the Recruit and Train windows. A key adds what rests on sales and on your history, which the API serves only with one: FLIP, values by stats, the Ledger, your own craft and case results, and how you got each piece.

## What the numbers are

- **Scrap value**: the scraps a piece dismantles into (6 / 18 / 54 / 162 / 486 / 1458 by rarity, at full durability) walked down the scrap bids, never the top bid multiplied past the depth on record. A card's price includes the buyer's tax and is compared as it is.
- **What a piece sells for**: the median of the newest sales (50 at most) of the same item whose stats sit within a tenth of each stat's range (3 or more), else within a quarter (5 or more), over the last 24 hours, widened a day at a time to 7 days only while too few. When at least 40 pairs of the item's sales tell what a stat is worth, each sale is first brought to the piece's own stats. When the item's market fell (over its newest 200 sales, or over the last 3 days of a market that sells more, and over the last 3 days alone when those fell faster; 8 sales or more on 3 days or more, the stats taken out first), each sale is also brought down to today's level, by 10% a day at most; a rising market lifts no sale. With no sales alike, the item's median over any stats (5 sales or more), else the game's average price for the item, marked ≈, which never earns a tag.
- **A craft**: the tier's scraps plus the steel fee (1 / 2 / 4 / 8 / 16 / 32 by tier for a random craft, twice that for a sniper craft) at the asks. A random craft gives a weapon 30% of the time and each armour slot 14%.
- **The Ledger's costs**: a craft or a case at that day's average price (else your own trades that day, or the latest earlier day on record, or the first one, marked ≈), a buy at what you paid, loot at nothing. A sniper craft costs its double steel when the extension saw you press CRAFT with a slot picked; for crafts it did not see, six weapons or five of one armour piece in a row in one tier count as sniper crafts. A held piece counts at what pieces of its stats sell for, else at its item's median, else at the game's average.
- **A candidate**: what his Production makes for that company (the company's product at the bids less its inputs, with its bonus and his specialization, +1% a day up to +20%), less his wage, until he turns 65 (60 days at most). When his card hides his Production, it is estimated from his wage: a wage a day is 6 × Production × the game's point value × his expectation (70-130%, ×1.2 for Greedy, ×0.85 for Modest), so usually one or two Productions fit (up to three or four with a hidden trait or a point value that moved), each with its odds. A hidden trait counts at the odds of each trait coming with a hire.
- **A training card**: its gold for the employee until 65, from what the Train window shows and the game's point value. Daily effects show gold a day above the card; Luck shows a total for the future hands it improves, using Luck and Leadership's rarity shifts and counting only the days left when each hand is drawn. The potential counts the open hand already. An open Employee window with the same name supplies the daily wage to infer paid Production; output still uses the header's Production, including traits. The rules for each card are in the [changelog](CHANGELOG.md).

Estimates, not promises; quotes are snapshots, not reserved liquidity.

## Not working on the live game yet

- 3.9.0's Sell items hints and wooden case panel, and 3.10.1's Train advice, are built from those windows' live structure (read on 2026-10-27). The new Train display is checked against live fixtures; the [release checklist](docs/RELEASE-CHECKLIST.md) covers what is left to see on the live page.

## Privacy and permissions

Your key and your history stay in this browser. The extension now also reads your employees with your key to compare team effects in open Recruit and Train windows; their stats, traits, happiness, wages and companies are cached in this browser. The extension asks for `storage` and `unlimitedStorage` (settings, caches and your history, which grows with your profile), reads `https://api2.warera.io/*` and runs on `https://app.warera.io/*` only. Details: [docs/PRIVACY.md](docs/PRIVACY.md).

## Development

Node 24 (CI runs 24); no runtime dependencies and no build step.

```sh
npm ci --ignore-scripts
npm run check     # lint, typecheck, manifest validation, tests, formatting
npm run package   # dist/warera-plus-<version>.zip, the store package
npm run build:dev # dist/dev: a copy for the game's dev server (dev.warera.io, apidev.warera.io), loaded unpacked
```

Development scripts (Playwright with its Chromium for the browser ones; point `PLAYWRIGHT_MODULE` at the module when it is not resolvable):

- `node scripts/jitter.mjs [--late]`: how fast the equipment market settles and how much it moves while it does, on the synthetic page `fixtures/market.html` with a cold worker's delays.
- `node scripts/backtest-prices.mjs`: the stat-matched value against what pieces are worth, on synthetic markets.
- `node scripts/screenshots.mjs` and `node scripts/store-assets.mjs`: screenshots of the synthetic page, and the store's screenshots and tile.
- `node scripts/bench-loader.mjs`: the row loader's DOM work in jsdom.

Synthetic pages and markets test behaviour, not the live game: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) lists the modules and what the tests cover.

## Releasing

Before a release, go through [docs/RELEASE-CHECKLIST.md](docs/RELEASE-CHECKLIST.md) on the live game. Publishing to the Chrome Web Store, the listing text, the screenshots and the privacy answers: [docs/CHROME-WEB-STORE.md](docs/CHROME-WEB-STORE.md).

## Ukratko

WarEra Plus je neoficijalna ekstenzija za WarEra. Pored onoga što igra već prikazuje stavlja procene: koliko vredi ponuda na tržištu opreme, koliko košta i vredi craft, šta daje otvaranje kutije, kako ti idu craft i trgovina, kog kandidata da zaposliš i koju kartu za trening da zadržiš. Ne igra umesto tebe: nikad ne kupuje, ne prodaje, ne listira, ne craftuje, ne otvara kutije, ne rastavlja, ne zapošljava, ne trenira i ne putuje.

Ima samo dva izvora. Prvi je stranica koju imaš otvorenu: čita tekst koji je igra već nacrtala u tvom tabu (cenu pored „tax incl.“, statove, platu kandidata), ne vidi zahteve igre i nikad ne čita tvoju sesiju. Drugi je javni API igre na `api2.warera.io`, samo za čitanje: sedam procedura iz tabele iznad, sa tvojim ključem ili bez njega. Četiri od njih nisu u zastareloj dokumentaciji API-ja, a admin igre je potvrdio da ekstenzija sme da ih koristi sa javnim ključem.

Kad kartica kandidata skriva Production, ekstenzija ga procenjuje iz plate koju kartica prikazuje i vrednosti poena iz API-ja. Admin igre je tu procenu pregledao 27. oktobra 2026. Na stranici dira nešto samo na tvoj klik: **⇅ by crit** prođe kroz listu predmeta da je pročita, klik na komad u njenoj listi ga označi u listi igre, a **use** upisuje predloženu cenu. Dugme igre uvek pritiskaš ti.

Ključ (API key) je opcion. Bez njega rade cene otpada i SNIPE, Craft, vrednosti kutija, put do drvene kutije, Recruit i Train. FLIP, vrednosti po statovima, Ledger, tvoji rezultati craftova i kutija i poreklo predmeta traže ključ. Ključ i istorija ostaju u ovom pregledaču, a ključ ide samo na `api2.warera.io`.

## License

MIT. See [LICENSE](LICENSE).
