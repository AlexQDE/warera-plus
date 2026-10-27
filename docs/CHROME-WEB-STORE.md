# Publishing WarEra Plus on the Chrome Web Store

Everything the Chrome Web Store dashboard asks for, ready to paste, and the steps around it. The dashboard changes its wording now and then: where a field below is named differently, the meaning is the same. Requirements were last checked on 17 October 2026 against Google's pages on [store images](https://developer.chrome.com/docs/webstore/images) and the [program policies](https://developer.chrome.com/docs/webstore/program-policies/policies).

## 1. Once: the developer account

- A Google account with 2-Step Verification on, registered as a Chrome Web Store developer at the [developer dashboard](https://chrome.google.com/webstore/devconsole) (a one-time registration fee).
- A publisher name and a contact email the store shows (dashboard, Account). It is public: use one meant for it.

## 2. Each release: the package

```sh
npm ci --ignore-scripts
npm run check      # must pass
npm run package    # dist/warera-plus-<version>.zip
```

The zip holds the extension folder with `manifest.json` at its root, without tests or scripts nothing loads; it is reproducible (the same tree gives the same SHA-256, printed). The store refuses a version it has seen: bump `version` in both `extension/manifest.json` and `package.json` (the validator keeps them equal and wants a `CHANGELOG.md` entry for it). Go through [RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md) on the live game first.

Upload: dashboard, **Add new item** (the first time) or the item's **Package** tab, **Upload new package** (an update), then the zip.

## 3. Store listing tab

**Name** (from the manifest): `WarEra Plus`

**Summary** (from the manifest's `description`, 132 characters at most, the validator checks it):

> Unofficial WarEra companion: SNIPE and FLIP tags on offers, craft and case values, and a ledger of your own crafting and trading.

**Description** (paste as is; plain text):

```text
WarEra Plus is an unofficial companion for the browser game WarEra (app.warera.io). It reads the market and your own history and tells you what things are worth. It never buys, crafts, lists, opens a case or travels for you.

ON THE EQUIPMENT MARKET
• SNIPE: the scraps a piece dismantles into, sold at the current bids, beat its price.
• FLIP: pieces with the same stats sold for more in the last 7 days.
• What a piece sells for, from recent sales of the same stats, brought to its exact roll.
• Details with the evidence: the dismantle, the sales behind the value, the cheapest listing of the same stats.

CRAFT
• What a craft of each tier costs at the market asks and what it is worth at the game's averages.
• A random craft against a sniper craft (the slot chosen, twice the steel).

LEDGER (with your API key)
• Your whole history, read once and kept in this browser: every craft, case opening, buy and loot with its cost and its result.
• Today, 7 days, 30 days or everything, with every piece in a list you can page through and filter.
• Sniper crafts charged their real steel.
• Eco or War: leave gear worn in battle out of your results, or count it.

IN THE GAME'S OWN WINDOWS
• The craft and case windows show what crafting or opening is worth now and how your own crafts and openings went.
• The sell form suggests a price from recent sales and the asks on the market.
• The item picker marks how you got each piece and lists a weapon's pieces by crit and attack.

YOUR DATA
The API key is optional and stays in your browser; it is sent only to the WarEra API (api2.warera.io). Your history is kept in your browser. No analytics, no tracking, no server of our own.

WarEra Plus is not affiliated with or endorsed by the makers of WarEra.
Source code and changelog: https://github.com/AlexQDE/warera-plus
```

**Category**: the one closest to a game companion (Games, under Lifestyle, in the dashboard's current list). **Language**: English.

**Graphic assets** (made by `node scripts/store-assets.mjs`, in [docs/store](store)):

| Field              | File                                                                                                                                         | Size                |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Store icon         | `extension/icons/icon128.png` (from the package)                                                                                             | 128×128             |
| Screenshots (1–5)  | `screenshot-1-market.png`, `screenshot-2-ledger.png`, `screenshot-3-craft.png`, `screenshot-4-craft-window.png`, `screenshot-5-settings.png` | 1280×800            |
| Small promo tile   | `promo-small-440x280.png`                                                                                                                    | 440×280 (required)  |
| Marquee promo tile | `promo-marquee-1400x560.png`                                                                                                                 | 1400×560 (optional) |

The screenshots show the extension's real interface and numbers its own code computes, but on a stand-in for the game's page (`fixtures/market.html`) with an invented player and market. Captures of the live game, 1280×800, make a better listing: take them when you can and drop them in under the same names. Google suggests a store icon whose artwork is 96×96 inside 16 pixels of transparent margin; the current icon fills its square, which the store accepts.

**Additional fields**: Official URL / homepage `https://github.com/AlexQDE/warera-plus`; support `https://github.com/AlexQDE/warera-plus/issues`.

## 4. Privacy practices tab

**Single purpose description**

> Decision support for the WarEra browser game: on app.warera.io it shows what market offers, crafts and case openings are worth, and the player's own results from their game history.

**Permission justifications**

- `storage`: Saves the user's settings, their optional WarEra API key, short-lived caches of market prices and the user's own game transaction history, all locally in this browser.
- `unlimitedStorage`: The user's whole game transaction history (tens of thousands of rows, several MB) is kept locally so the Ledger can show results since the start of their profile without reading it again; it outgrows the default quota.
- Host permission `https://api2.warera.io/*`: Reads market order books, average prices, the production point value, item sales and, with the user's own key, the user's own transactions from the game's official API. No other host is contacted.
- Content script on `https://app.warera.io/*`: Shows tags and values on the game's market offers, a bar with the craft and ledger tabs, and estimates inside the game's craft and case windows. It only reads the page; it never presses the game's buttons or makes transactions.
- Web accessible resources (if asked): The content script loads the extension's own modules with dynamic `import()`, which Chrome allows only for resources accessible to the page; they are code only, exposed to app.warera.io only.

**Are you using remote code?** No. Every script is in the package; the extension loads no script from the network and evaluates no strings as code; the WarEra API returns JSON data only.

**Data usage**: what WarEra Plus handles, all for its single purpose and kept in the user's browser. Declare:

- **Authentication information**: the user's WarEra API key, entered by the user, stored locally and sent only to the WarEra API (api2.warera.io) to authorize the user's own requests.
- **User activity**: the user's own game transactions read from the WarEra API with their key, and which slot they pick when they press the game's CRAFT button; stored and processed locally to compute their results.
- **Website content**: offers, prices and item stats read from the game's pages on app.warera.io; processed locally.

Leave the others (personally identifiable information, health, financial and payment, personal communications, location, web history) unticked: in-game gold is not a payment instrument, and nothing else is read. Tick the three certifications: no sale or transfer of user data to third parties outside the approved uses; no use or transfer for purposes unrelated to the single purpose; no use or transfer to determine creditworthiness or for lending.

**Privacy policy URL**: `https://github.com/AlexQDE/warera-plus/blob/main/docs/PRIVACY.md` (live once this branch is merged into `main`; before that, link the same file on the branch).

## 5. Distribution tab and submission

- **Visibility**: Public, or Unlisted for a first round with your own players (only people with the link can install it).
- **Regions**: all.
- **Submit for review.** Reviews usually take a few days; a first submission and a new permission take longer.

## 6. After it is live

- Put the store link in the README's Install section (it says "link added once the listing is live").
- Tag the release in git (`v3.6.0`), with the changelog's entry as its notes.
- Each update: bump the version, `npm run check`, `npm run package`, upload on the Package tab, submit. The privacy answers stay unless a permission or the data handled changes; then update them and [PRIVACY.md](PRIVACY.md) in the same release.

## Review risks, and what to do

- **The game's name in the extension's name.** "WarEra Plus" uses the game's name; the listing says it is unofficial. If a reviewer asks for a change on trademark grounds, rename the listing (for example "Plus for WarEra") in `manifest.json` (`name`, `action.default_title`) and the popup's title, and say so in the changelog; the extension's id, settings and history do not change with its name.
- **Permissions.** Only `storage` and `unlimitedStorage`, one API host and one site: no broad host access, no `tabs`, `scripting` or `webRequest`. Keep it that way; a new permission means a new review, and Chrome disables the extension for users until they accept a permission that adds a warning.
- **Content script at `document_start`.** It loads earlier to annotate the market before the game draws it; it reads only app.warera.io.
