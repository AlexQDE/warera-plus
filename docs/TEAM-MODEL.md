# Team model: what a hire or training card changes

Updated for WarEra v0.27.3 (2026-10-29). Recruit and Train value the employee's
own gold and the change to coworkers separately; the star picks the greatest
own + team value. Sources and configuration are in [GAME-FACTS §13](GAME-FACTS.md).

## Authoritative inputs

`employee.getMyEmployees` returns the player's employees, grouped by company.
The live read supplied on 2026-10-29 contained 19 employees. Relevant fields:

- `base.production` already includes training; `breakdown.production.total`
  includes unpaid trait and team points. Never add trained points twice.
- `happinessBreakdown {base:50, contributions:[{reason,delta,until?,code?,
eventCode?}], mitigated, value, quitChance}`. Responsibility contributes
  **+3 happiness per point**; income tax contributes minus its percentage.
  Happiness stays in 0..100, and its production bonus is value − 50.
- `productionBonus {total, contributions:[{source,percent}]}` includes
  Management, happiness, specialization, the employee's tool and events.
  Management is player-wide (+22 in the supplied live read); a company card's
  percentage is income tax, not a production bonus.
- Wages are hourly and rest on paid base Production. Responsibility, trait
  and coworker Production do not increase them.

The server's totals stay authoritative. Current levels and unchanged effects
are not reconstructed from the extension's incomplete trait model. For an
employee with a known happiness value, add only the happiness deltas a change
switches on or off, including +3 per changed Responsibility point. Negative
items count in full.

**Loyal limitation:** this team model does not halve new negative items or
reprice existing items when Loyal is gained or lost. The supplied roster had
`mitigated = 0` throughout. Its meaning as Loyal's removed penalty is
**ASSUMED**. The standalone trait table retains its historical reference
estimate for Loyal; it does not implement team mitigation.

The 2026-10-28 JSON and Train fixtures are historical snapshots. Their server
totals remain valid test inputs; new changes to those snapshots use v0.27.3
deltas. They do not establish current happiness configuration.

## Own value and team value

A new hire's initial happiness is `clamp(50 + 3R − tax + trait happiness,0,100)`.
His bonus is Management + (happiness − 50) + specialization; he has no tool.
Responsibility is shown on Recruit; an unread chip falls back to 2.5. Tax
comes from the company chip, else a roster member's income-tax item, else 0
with a note. Management comes from any player employee row, else 0 with a
note. Specialist always matches the hiring company's good: +3 P and +5
happiness. Happiness already represented in `TRAITS.pct` is counted once.

For a drill of +k Responsibility, use the employee's server happiness when
available, else `clamp(50 + 3R − tax,0,100)`. Its improvement is
`clamp(happiness + 3k,0,100) − happiness` output bonus percentage points.
There is no wage change and no multiplication by the existing bonus. A
Foreman gives every coworker +3 R, hence +9 happiness, capped at 100.

The **team** total is the sum of changes to other employees' output in gold
over the days both stay: each coworker's `min(65 − age,60)` horizon, capped
at the hire's or trainee's own horizon. Wages matter to Prima Donna and
Envious conditions, but team effects themselves do not change coworker wages.

## Delta calculation

1. Build before/after trait states. Hire adds a candidate; a card changes
   only the subject's stat, traits or negotiated wage.
2. Evaluate conditions on both rosters. Collect only effects that switch:
   flat P, percent bonus, happiness items and Responsibility.
3. For each day, expire happiness items whose `until` has passed, anchored
   to the employee snapshot's timestamp. Use the server happiness plus that
   expiry delta as the baseline, clamped to 0..100. Then apply
   `Δhappiness = 3ΔR + Δpositive + Δnegative` and clamp again.
4. Let specialization grow +1 percent a day to +20. Change bonus only by
   the happiness change and switched percent effects. Change P only by the
   switched flat contributions.
5. Before/after points a day are `6 × P × (1 + bonus/100)`. Sum their
   difference times the company's value per point. Use product bids less
   input opportunity cost when complete, else the game's point value.

The subject's direct Responsibility drill is priced by `hiring.mjs`, while
conditional team changes are priced by `team.mjs`. For Wild card, apply its
direct Responsibility gain before the new conditional happiness items so
the cap is shared. Average the combined trait/stat outcomes after multiplying
Production by bonus, using the uniform eligible training-trait list.

The model checks recognised before-state Production contributions against
the server breakdown and names disagreements in the tooltip. Unknown inputs
skip affected conditions in both states and name the omission.

## Team rules

| Trait                               | Condition                                                     | Effect                                             |
| ----------------------------------- | ------------------------------------------------------------- | -------------------------------------------------- |
| Bully                               | any coworker                                                  | himself +2 P; each coworker −10 happiness          |
| Comic                               | any coworker                                                  | himself −1 P; each coworker +10 happiness          |
| Foreman                             | any coworker                                                  | each coworker +3 R, hence +9 happiness             |
| Rival                               | strictly stronger base P coworker (**assumed**)               | +3 P, otherwise −1                                 |
| Mentor                              | strictly weaker base P coworker (**assumed**)                 | himself −1 P; weaker coworkers +2 P                |
| Loner                               | sole employee                                                 | +100% bonus and +5 happiness                       |
| Sociable                            | each coworker                                                 | +25% bonus each, cap +50%; alone −10 happiness     |
| Prima Donna                         | highest hourly wage, ties included (**assumed**)              | +20% bonus and −10 happiness together              |
| Envious                             | each better-paid coworker                                     | −5 happiness each, cap −10                         |
| Nationalist                         | every coworker shares nationality, at least one (**assumed**) | +2 R and +5 happiness, hence +11 happiness         |
| Xenophobe                           | foreign coworker                                              | −2 P and −5 happiness                              |
| Cosmopolitan                        | distinct other nationalities                                  | +2 P each, cap +4                                  |
| Girl Power / Band of Brothers       | female / male coworkers                                       | +15% each, cap +30%                                |
| Misandrist / Misogynist             | male / female coworkers                                       | −15% each, cap −30%                                |
| Lucky Charm / Jinx                  | any coworker                                                  | coworker Luck +3 / −2; named, not priced           |
| Trainer                             | any coworker                                                  | coworker +1 training a day; named, not priced      |
| Old Friends / Nemesis / Sweethearts | named partner                                                 | +15% / −15% / +20%; partner unreadable, not priced |
| Recruiter                           | always                                                        | extra candidate slot; no output price              |

Known genders and nationality ids drive conditions. A Recruit flag supplies
a country name, which cannot be compared with a roster nationality id;
affected candidate conditions are skipped and disclosed. Without a roster,
the standalone reference estimates remain in use. Training additionally
filters exclusive, owned, gender-disallowed and partner traits from habits
and Wild card; negative traits have rare Rehab, mixed traits have none.

## Display and acceptance examples

Recruit prints `★ +12.0 g · team +0.5 g`. Only hidden Production leads the
line, such as `P2-3 · …`; the native card already shows the other chips.
Train prints own value plus a team line when the team changes by at least
0.05 g. Tooltips name affected coworkers, mechanisms, snapshot age and
assumptions. Without a usable employee read, they explain why team value is
unavailable. Advice never clicks Hire, Train, Move or Fire.

Example with R1, tax 4 and recently moved −10: happiness is `50 + 3 − 4 − 10
= 39`. A Bully takes it to 29: −10 bonus percentage points. For P3 over 20
days at point value 0.1012, the team loss is `20 × 6 × 3 × 0.10 × 0.1012 =
3.6432 g`. Foreman instead gives +9 happiness, until the 100 cap intervenes.
At happiness 98, a +2 R drill gives +2 bonus percentage points, not +6.

Move advice remains conditional: moving costs −10 happiness for seven days;
Creature of Habit can add its own move penalty. No free-transfer model is
introduced. Quitting, partner activation, tools not yet held, future Luck
effects on coworkers and Trainer's extra hands have no gold price here.
