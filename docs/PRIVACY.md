# WarEra Plus privacy policy

Effective 27 October 2026, for version 3.8.0 and later.

WarEra Plus is a browser extension for the browser game WarEra. It is not made, endorsed or supported by the makers of WarEra. This policy says what data the extension handles, where that data goes and how to remove it. The short version: everything stays in your browser, except your API key, which goes only to the game's own API with the extension's requests, and the extension has no server, no analytics and no third party.

## What the extension handles, and where it goes

**Your WarEra API key (optional).** You paste it in the extension's settings. It is kept in the extension's local storage (`chrome.storage.local`), restricted to the extension's own trusted pages: neither the game's page nor the extension's script on it can read it. It is sent only to `https://api2.warera.io`, as the `x-api-key` header of the extension's own requests to the WarEra API, to read the data below. It is never sent anywhere else, and error messages shown on the page have it removed.

**Your game history, read from the WarEra API with your key.** Your own transactions in the game (crafts, market buys and sales, dismantles, case openings, battle loot and resource trades) and your public player card (your username). They are kept in the extension's local storage, by month, so the Ledger can show your results since the start of your profile without reading them again. They never leave your browser.

**Public market data, read from the WarEra API.** Order books, the game's average prices and its production point value, with your key or without one, and recent sales of items, with your key. Kept in local storage as short-lived caches.

**The public country list, read from the WarEra API without a key.** Read only while a Recruit window is open to match candidate and company flags to employee nationality ids. Cached for one day; only each country's id, code and name are kept.

**Your employees, read from the WarEra API with your key (team comparison, 3.11.0; added 28 October 2026; the My workforce panel from 3.13.0).** Stats, traits, happiness and its items, wages, names, gender, age, nationality and company ids, to estimate a hire's or training card's effect on coworkers. Read only while a Recruit, Train or My workforce window is open, at most every five minutes, and cached in this browser. Your Management level (Leadership before v0.27.3), as a Train window shows it, is kept in this browser for the workforce panel. The employee cache is cleared when the key changes or is rejected. Nothing is sent elsewhere.

**What the game's page shows.** On `https://app.warera.io` the extension reads the page to find the offers, their prices and item stats, your own player id (from the page's links to your own profile), the candidates' cards in a Recruit window (wage, shown stats, traits, age, nationality) with the company whose Recruit button you pressed, the employee and the dealt cards in a Train window and, when you press the game's CRAFT button, whether you picked a slot in the craft window. This is processed in your browser. The craft picks are kept in local storage until the extension ties each to the craft it made in your history (then only that craft's mark, chosen slot or random, is kept).

**Your settings.** Thresholds, the modules turned on, the tab open under the bar and the other preferences, in local storage.

## What it does not do

- No analytics, telemetry, advertising or tracking of any kind.
- No server of its own: nothing is sent to the extension's developer or to anyone but the WarEra API.
- No sale or transfer of any data, and no use of it for anything but showing you the extension's estimates. It is never used to determine creditworthiness or for lending.
- No reading of other websites: the extension runs only on `https://app.warera.io` and reads only `https://api2.warera.io`.
- No use of the game's login session: the extension's requests carry no cookies, and it never makes a purchase, a craft, a listing or any other action in the game.

The use of information received from the WarEra API adheres to the Chrome Web Store User Data Policy, including its Limited Use requirements ([Chrome Web Store program policies](https://developer.chrome.com/docs/webstore/program-policies/policies)).

## Permissions

- `storage`: your settings, your key, the caches and your history, in this browser.
- `unlimitedStorage`: your whole history can grow past Chrome's default 10 MB for an extension (one account's eight months took about 5 MB).
- Access to `https://api2.warera.io/*`: the WarEra API the data above is read from.
- A script on `https://app.warera.io/*`: the estimates on the game's own pages.

## Keeping and removing your data

The data stays in your browser until you remove it. Clearing the key in the settings stops every request that needs it; your history stays, so it does not have to be read again. Removing the extension from Chrome (`chrome://extensions`, Remove) deletes everything it stored: the key, the history, the caches and the settings.

## Changes and contact

A change to this policy is published in this file, with a new effective date, and noted in the [changelog](../CHANGELOG.md). Questions: open an issue at https://github.com/AlexQDE/warera-plus/issues.
