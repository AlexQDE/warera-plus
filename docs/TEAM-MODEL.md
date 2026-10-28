# Team model: what a hire or a training card does to the rest of the company

Design for WarEra Plus 3.11.0 (2026-10-28). The Recruit and Train advisors value a candidate or a card for one
employee only, with fixed reference conditions for traits that depend on coworkers (`hiring.mjs` `TRAITS` `team`
/ `alone`, `CONDITION_ODDS`). This adds the real team, read from the player's own employees through the API key,
and shows its part as a separate number.

The user's case: in Disabled Iron the Recruit advisor made a Bully the pick at +36.8 g. A Bully gives himself
+2 Production and every coworker −10 happiness; the only coworker, Lionel Leannon, sits at happiness 41.9, and
every point of happiness is a point of production bonus. The advisor never counted Lionel's loss.

## The numbers

- **Own**: the candidate's or the card's value for that employee, as today, except that the coworker conditions
  of his own team traits (Rival, Mentor, Loner, Sociable, Prima Donna...) and the effects his coworkers' traits
  have on him (an existing Bully's −10, a Foreman's +3 Responsibility, a Mentor's +2...) are evaluated on the
  real team instead of the reference guesses. Without a team read, today's model unchanged.
- **Team**: the sum over the other employees of the company of the change in their output, in gold, over the
  days both stay: each coworker's own horizon (65 − age, 60 days at most, the existing `H` rule) cut at the
  hire's or trainee's own horizon.
- **The pick (★)**: the largest own + team. Recruit and Train alike.
- Wages do not move with team effects (trait and team points are unpaid). Wages only matter to the rules that
  compare them (Prima Donna, Envious).

## Data: one call

`employee.getMyEmployees` (tRPC GET on api2, no input, `x-api-key`) returns every employee of the player (18 on
2026-10-28) with his company id, so grouping by `company` gives every company's roster. Per employee:
`_id, company, name, gender, age, nationality, base{production,luck,responsibility}, trained{...}, traits[{code,
revealed}], potential, potentialMax, wage` (gold an hour), `wageExpectation, specializations, lastMovedAt,
trainingsToday, trainingsPerDay, estimate{production (points an hour), wage}, breakdown.{production,luck,
responsibility}{base, trained, contributions[{code, delta, revealed, percent}], total}, happinessBreakdown{base,
contributions[{reason, delta, revealed, until}], shield, mitigated, value, quitChance}, productionBonus{total,
contributions[{source, percent}]}`. Sanitized live answer: `fixtures/employees-live-2026-10-28.json` (owner,
region, nationality and tool ids replaced; Disabled Iron is company `c00000000000000000000001`, Lionel alone in
it). `employee.getCompanyRoster {companyId}` answers the same per employee and is not needed.

- Worker kind `employees`: needs the key (none: `needs-key`, today's model and one muted note), TTL 5 min,
  requested only while a Recruit or Train window is open, the existing single-flight, backoff and cache.
- **Recruit**: the company id is the `/company/<24 hex>` link inside the company card whose Recruit button
  opened the window (seen 4 levels above the button on 2026-10-28; `companyFromButton` already walks that card).
  The roster is every employee with that `company`; an empty company is a roster of none.
- **Train**: the trainee is the employee with the Train window's name (and age, when two share a name); his
  coworkers are the others of his `company`. No match: today's model, and the tooltip says the trainee was not
  found among your employees.

## Verified on the live data (2026-10-28)

| Fact                                                                                                             | Evidence                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Points an hour = `breakdown.production.total` × 0.25 × (1 + `productionBonus.total` / 100)                       | Lionel 3 × 0.25 × 0.999 = 0.749 (0.75); Mohannad 6 × 0.25 × 1.052 = 1.578 (1.58); Claudia 7 × 0.25 × 1.598 = 2.797 (2.8) |
| `base` already includes `trained`; `total` = base + flat contributions                                           | Mohannad base 6 (4 + 2 trained); Hubert 4 + craftsman 3 = 7; Alyssa 3 + rival 3 = 6                                      |
| Percent contributions (specialization, tool, sprinter, event, management) live in `productionBonus`, added up    | Lionel −0.1 = management 6 − happiness 8.1 + specialization 2                                                            |
| Happiness → production bonus: value − 50, both sides                                                             | Rene 51.4 → +1.4; Claudia 51.8 → +1.8; Lionel 41.9 → −8.1                                                                |
| Happiness = 50 + Σ contributions, each negative one mitigated by the shield; shield = Responsibility total × 0.1 | Laith −4 −5 +5 with shield 0.4: 50 − 9 + 5 + 3.6 = 49.6                                                                  |
| Wages are paid on `base` Production; trait and team points are unpaid                                            | Claudia: wage on 4, output on 7 (Laborer)                                                                                |
| A hire or move gives `recentlyMoved` −5 until 7 days later                                                       | Lionel moved 27 Oct, until 3 Nov                                                                                         |

## The rules (client trait table; the server evaluates the conditions)

"v1" says what this release evaluates. A rule marked **assumed** is written into GAME-FACTS and named in the
tooltip whenever it decides a number.

| Trait                              | Condition                         | Effect                                                                                                                                                                                                                                                                | v1                                              |
| ---------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| bully                              | any coworker                      | himself +2 P; every coworker happiness −10                                                                                                                                                                                                                            | yes                                             |
| comic                              | any coworker                      | himself −1 P; every coworker happiness +10                                                                                                                                                                                                                            | yes                                             |
| foreman                            | any coworker                      | every coworker +3 Responsibility (shield +0.3)                                                                                                                                                                                                                        | yes                                             |
| luckyCharm / jinx                  | any coworker                      | every coworker Luck +3 / −2                                                                                                                                                                                                                                           | named, not priced                               |
| trainer                            | any coworker                      | every coworker +1 training a day                                                                                                                                                                                                                                      | named, not priced                               |
| rival                              | a stronger coworker               | +3 P when met, −1 when not                                                                                                                                                                                                                                            | yes; **assumed**: base P, strictly greater      |
| mentor                             | a weaker coworker                 | every weaker coworker +2 P; himself −1 P while any                                                                                                                                                                                                                    | yes; **assumed**: base P, strictly less         |
| loner                              | sole employee                     | +100% production bonus, happiness +5                                                                                                                                                                                                                                  | yes                                             |
| sociable                           | per coworker                      | +25% per coworker, 50% at most; happiness −10 when alone                                                                                                                                                                                                              | yes                                             |
| primaDonna                         | best paid                         | **assumed**: +20% and happiness −10 together while his hourly wage is the highest, nothing otherwise (the table's own convention: an unmet part is named, as Rival's `deltaWhenUnmet` and Sociable's `happinessWhenAlone`; Loner's met state carries both its fields) | yes                                             |
| envious                            | per better-paid coworker          | happiness −5 each, −10 at most                                                                                                                                                                                                                                        | yes                                             |
| nationalist                        | coworkers share his nationality   | +2 Responsibility, happiness +5; **assumed**: every coworker                                                                                                                                                                                                          | when nationalities are known                    |
| xenophobe                          | a coworker of another nationality | −2 P, happiness −5                                                                                                                                                                                                                                                    | when known                                      |
| cosmopolitan                       | per nationality                   | +2 P per other nationality present, +4 at most                                                                                                                                                                                                                        | when known                                      |
| girlPower / bandOfBrothers         | per coworker of a gender          | +15% per female / male coworker, 30% at most                                                                                                                                                                                                                          | yes (gender is on the roster and the card)      |
| manHater / misogynist              | per coworker of a gender          | −15% per male / female coworker, −30% at most                                                                                                                                                                                                                         | yes                                             |
| oldFriends / nemesis / sweethearts | a named partner present           | ±15% / +20%                                                                                                                                                                                                                                                           | no: the partner is not readable for a candidate |
| recruiter                          | always                            | a candidate slot                                                                                                                                                                                                                                                      | no output effect                                |

A candidate's gender is read when the Recruit header identifies it; otherwise gender rules are skipped in
both states and named in `assumed`. His flag is a country name and the API nationality is a country id, with
no mapping: nationality rules involving a candidate stay unevaluated and are named too. Hidden Responsibility
uses the starting 1–4 average, 2.5, for his happiness shield. Without a roster the original `CONDITION_ODDS`
path stays unchanged. Prima Donna includes ties; Nationalist requires at least one coworker.

## How a change is evaluated: Δ on top of the server's state

The model never rebuilds an employee from scratch. Each roster member starts from what the server says now
(`total`, `productionBonus.total`, the happiness contributions, `shield`), and a change only adds or removes the
effects whose conditions it switches:

1. Evaluate every team-trait condition for every member before and after the change (the hire added, or the
   card applied to the trainee: a drill raises his base, a habit adds its trait(s) and drops the faded one, Rehab
   and Clean slate remove traits, Negotiation lowers his wage, Wild card averaged over its cases as today).
2. For each member, the effects that switch on or off become: flat P deltas, percent bonus deltas, happiness
   items added or removed, Responsibility deltas.
3. After: P' = total + ΔP; R' = R + ΔR, shield' = min(1, 0.1 × R'); happiness' = 50 + Σ positive items +
   Σ negative items × (1 − shield'), the items being the server's plus the added minus the removed;
   bonus' = bonus − (happiness − 50) + (happiness' − 50) + Δpercent.
4. Day by day over the window: drop `recentlyMoved` (any item with `until`) once its date passes, and let the
   specialization part of the bonus grow as today (`SPEC_PER_DAY` to `SPEC_CAP`). Points a day = 24 × P × 0.25 ×
   (1 + bonus / 100), before and after; Δgold = Σ Δpoints × V.
5. V: the company product's value a point at the bids where the Recruit context has it (`valuePerPoint`), else
   the game's point value, as the advisors use today.

Effects already active and unchanged cancel out in the Δ, so they need not be recognised in the breakdown: an
existing Bully's −10 stays in the coworkers' happiness before and after. Only the shield and the caps make
levels matter, and both are computed from the server's own items. As a check, every condition the model
evaluates as met "before" is compared with the breakdown where the server shows it (`rival` +3 or −1 in the
production contributions); a disagreement is named in the tooltip.

## On screen

- **Recruit** line: `★ P2 · −2% · +36.8 g · team −3.3 g`; the team part only when the team was read and moves
  more than 0.05 g.
- **Train** cells: the first line as in 3.10.1 (own gold a day, the ★ by own + team); the second line gains
  `· team −1.2 g` when the team moves: `8.2 g in 32 d · team −1.2 g`.
- **The "?" tooltip**: one line per coworker who moves, with the mechanism, e.g.
  `Lionel Leannon: happiness −9.0 (Bully −10, shield 0.1), output −9.0%, −3.3 g in 20 d`; then
  `team read 2 min ago, 1 coworker`; then every **assumed** rule that decided a number.
- Without the key, or with the team unread: today's display and one muted line in the tooltip
  (`team not counted: no API key` / `reading your employees…` / `trainee not among your employees`).

## The acceptance case (from the fixture)

Disabled Iron with Lionel (base P3, R1, happiness items incomeTax −4 and recentlyMoved −5 until 3 Nov, shield
0.1, bonus −0.1%, age 45: 20 days left) and a Bully candidate of base P2, age 30, hired on 28 Oct:

- Lionel before: 50 − 9 × 0.9 = 41.9. After: 50 − 19 × 0.9 = 32.9. His bonus falls by 9.0 points.
- Δ points a day = 24 × 3 × 0.25 × (−0.09) = −1.62, every day of the 20 (the recentlyMoved expiry moves both
  sides alike). Team = −32.4 points × V: −3.15 g at V = 0.0971, −3.28 g at 0.1012.
- The Bully himself: +2 P while he has a coworker (his own value, unpaid points).

## Out of scope for this release

- The candidate's own happiness (the region's income tax, his own recentlyMoved −5): today's model does not
  price it and this release does not start to.
- Quitting: `quitChance` is shown for the after-state when the server's curve is known; until then the tooltip
  prints the coworker's happiness after the change and no price.
- Partner traits, Luck effects, Trainer's extra trainings: named, not priced.

## Build plan

- **Run A**: `extension/lib/team.mjs`, pure and typed like `hiring.mjs`, with `team.test.mjs` on the fixture:
  the roster from `getMyEmployees` answers, the condition evaluation, the Δ step above, the acceptance case.
- **Run B**: the `employees` worker kind (`api.mjs`, `controller.mjs`, TTL), the company id from the card link,
  the trainee match, `hiring.mjs` integration (P odds and hidden-trait cases taken in expectation over
  `team.mjs`), the Recruit and Train display, docs (README, GAME-FACTS §12, RELEASE-CHECKLIST, CHANGELOG).
- Shipped as 3.11.0 with the "Two new habits" fix; PR #5 (FLIP on a falling market) follows as 3.12.0.
