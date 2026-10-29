// The live v0.27 Recruit dialog: read the visible cards and display hiring's
// wage inference. No game actions and no input writes; one capturing click
// listener notes which company's Recruit button was pressed (its product,
// production bonus and country), never preventing or making a click.
import {
  traitCode,
  rankCandidates,
  RECIPES,
  productKind,
  valuePerPoint,
} from "./hiring.mjs";
import { parsePrice } from "./dom.mjs";
import { escapeHtml as esc, signed } from "./format.mjs";
import { freshness, TTL } from "./quality.mjs";
import { setHtml, helpMark } from "./ui.mjs";
import { rosterOf } from "./team.mjs";
import { unreadTeam, teamNotes } from "./teamview.mjs";

/** How long a pressed Recruit button stands for the dialog it opened. */
export const COMPANY_MEMORY_MS = 15 * 60_000;
/** The attribute that outlines the best pick's card (the game's node; removed on clear). */
export const BEST_ATTR = "data-ss-best";

const native = (node) => !node.closest("[data-lens]");
const hireButtons = (root) =>
  [...root.querySelectorAll("button")].filter(
    (b) => native(b) && /^\s*hire(?![a-z])/i.test(b.textContent ?? ""),
  );
const statGroup = (root) =>
  [...root.querySelectorAll("div")].find(
    (e) =>
      e.children.length === 3 &&
      [...e.children].every(
        (c) =>
          c.getAttribute("aria-haspopup") === "dialog" &&
          c.querySelector("svg") &&
          !c.querySelector('[role="img"]') &&
          /^(?:\?|[1-4])$/.test(c.textContent?.trim() ?? ""),
      ),
  );
const wageLine = (root) =>
  [...root.querySelectorAll("span")].find(
    (e) => native(e) && /\/\s*day\s*$/i.test(e.textContent ?? ""),
  );

/**
 * Read a Recruit dialog by its Hire cards, each with a wage a day and exactly
 * three ordered stat chips (Production, Responsibility, Luck). A missing
 * trait badge means no trait; hidden stats remain null, never zero. Return
 * null if any candidate's structure is unreadable, so we never rank a subset.
 */
export function readRecruitDialog(root = document) {
  for (const dialog of root.querySelectorAll('[role="dialog"]')) {
    const buttons = hireButtons(dialog);
    if (!buttons.length) continue;
    const candidates = [];
    for (const button of buttons) {
      let card = button.parentElement;
      let stats = null;
      let wage = null;
      for (
        let i = 0;
        card && card !== dialog && i < 12;
        i++, card = card.parentElement
      ) {
        stats = statGroup(card);
        wage = wageLine(card);
        if (stats && wage) break;
      }
      if (
        !card ||
        card === dialog ||
        !stats ||
        !wage ||
        hireButtons(card).length !== 1
      )
        continue;
      const header = wage.parentElement?.firstElementChild;
      const spans = [...(header?.querySelectorAll("span") ?? [])];
      const name =
        spans
          .find(
            (e) =>
              !e.children.length && !/^\d+$/.test(e.textContent?.trim() ?? ""),
          )
          ?.textContent?.trim() ?? "Candidate";
      const ageText = spans.find(
        (e) =>
          e.querySelector("svg") &&
          /^\d{1,3}$/.test(e.textContent?.trim() ?? ""),
      )?.textContent;
      const age = ageText == null ? null : Number(ageText.trim());
      const flag = /^(.+) flag$/.exec(
        header?.querySelector('img[alt$=" flag"]')?.getAttribute("alt") ?? "",
      );
      const traits = [];
      let hiddenTraits = 0;
      let unknownTraits = 0;
      for (const badge of card.querySelectorAll('[role="img"][aria-label]')) {
        if (!native(badge)) continue;
        const label = badge.getAttribute("aria-label")?.trim();
        const code = traitCode(label);
        if (code) traits.push(code);
        else if (label === "?") hiddenTraits++;
        else unknownTraits++;
      }
      const potential = /Potential\s*(\d+)/i.exec(
        stats.parentElement?.textContent ?? "",
      );
      const production = /^\d+$/.test(
        stats.children[0].textContent?.trim() ?? "",
      )
        ? Number(stats.children[0].textContent.trim())
        : null;
      const responsibilityText = stats.children[1].textContent?.trim() ?? "";
      const gender =
        [
          ...(header?.querySelectorAll(
            "[aria-label], [title], [data-gender], svg",
          ) ?? []),
        ]
          .map((e) =>
            [
              e.getAttribute("aria-label"),
              e.getAttribute("title"),
              e.getAttribute("data-gender"),
              e.getAttribute("class"),
            ]
              .filter(Boolean)
              .join(" "),
          )
          .map((label) =>
            /\b(?:female|venus)\b/i.test(label)
              ? "female"
              : /\b(?:male|mars)\b/i.test(label)
                ? "male"
                : null,
          )
          .find(Boolean) ?? null;
      candidates.push({
        card,
        button,
        statsGroup: stats,
        name,
        wageDay: parsePrice(
          wage.textContent.replace(/\s*\/\s*day\s*$/i, "").trim(),
        ),
        production,
        responsibility: /^\d+$/.test(responsibilityText)
          ? Number(responsibilityText)
          : null,
        gender,
        traits,
        hiddenTraits,
        unknownTraits,
        potential: potential ? Number(potential[1]) : null,
        age,
        nationality: flag ? flag[1] : null,
      });
    }
    if (candidates.length !== buttons.length) continue;
    const rosterNode = [...dialog.querySelectorAll("span")].find(
      (e) =>
        native(e) &&
        /^Roster\s*\d+\s*\/\s*\d+$/i.test(e.textContent?.trim() ?? ""),
    );
    const rosterMatch = /^Roster\s*(\d+)\s*\/\s*(\d+)$/i.exec(
      rosterNode?.textContent?.trim() ?? "",
    );
    const roster = rosterMatch
      ? { count: Number(rosterMatch[1]), capacity: Number(rosterMatch[2]) }
      : null;
    return {
      root: dialog,
      candidates,
      roster,
      rosterNode,
      alone: roster != null && roster.capacity <= 1,
    };
  }
  return null;
}

/**
 * The company a Recruit button belongs to, from its card on the Companies
 * page: the product (the card's image is named by its item code), the
 * production bonus (the first "N%" chip) and the country of its region (the
 * card's flag). null when the button sits in no company card.
 * @param {Element | null} button
 */
export function companyFromButton(button) {
  if (!button) return null;
  let card = button.parentElement;
  for (let i = 0; card && i < 8; i++, card = card.parentElement) {
    // past the card once a second company's Recruit button is in reach
    const recruits = [...card.querySelectorAll("button")].filter((b) =>
      /^\s*recruit(?![a-z])/i.test(b.textContent ?? ""),
    );
    if (recruits.length > 1) return null;
    const product = [...card.querySelectorAll("img")]
      .map((e) => e.getAttribute("alt") ?? "")
      .find((alt) => RECIPES[alt]);
    if (!product) continue;
    // the bonus chip: the first "N%" ahead of the button (its digits may sit
    // in their own span: "<span><span>4</span>%</span>")
    let bonus = null;
    for (const el of card.querySelectorAll("span, div")) {
      if (el.closest("button, [data-lens]")) continue;
      // 2 = Node.DOCUMENT_POSITION_PRECEDING: el comes before the button
      if (!(button.compareDocumentPosition(el) & 2)) continue;
      const m = /^([+-]?\d+(?:\.\d+)?)\s*%$/.exec(el.textContent?.trim() ?? "");
      if (m) {
        bonus = Number(m[1]) / 100;
        break;
      }
    }
    const flag = /^(.+) flag$/.exec(
      card.querySelector('img[alt$=" flag"]')?.getAttribute("alt") ?? "",
    );
    const companyId =
      [...card.querySelectorAll("a[href]")]
        .map(
          (a) =>
            /\/company\/([0-9a-f]{24})(?:[/?#]|$)/i.exec(
              a.getAttribute("href") ?? "",
            )?.[1] ?? null,
        )
        .find(Boolean) ??
      // on a company's own page its card links nowhere: the page is the company (live 2026-10-28)
      /^\/company\/([0-9a-f]{24})(?:\/|$)/i.exec(
        button.ownerDocument.defaultView?.location.pathname ?? "",
      )?.[1] ??
      null;
    return { product, bonus, country: flag ? flag[1] : null, companyId };
  }
  return null;
}

/** The wage expectation is the hired worker's coin chip, relative to 100%. */
const wageChip = (n) => {
  const pct = Math.round((n - 1) * 100);
  return `${pct >= 0 ? "+" : ""}${pct}%`;
};
const gold = (n, digits = 2) =>
  `<span class="${n >= 0 ? "lens-pos" : "lens-neg"}">${signed(n, digits)}</span>`;

/**
 * One candidate's advice on one line ("★ P2 · −2% · +6.3 g"), the rest in
 * the "?" tooltip: no controls or handlers.
 */
export function candidateHtml(candidate, value, best, teamLines = []) {
  if (!value) return '<span class="lens-muted">reading…</span>';
  if (!value.fits)
    return `<span class="lens-neg">wage doesn't fit</span>${helpMark("No Production from 1 to 4 explains this wage at today's point value (the point value moved a lot since the day's candidates were drawn, or the card was misread).")}`;
  const shares = Object.keys(value.shares)
    .map(Number)
    .sort((a, b) => a - b);
  const certain =
    value.likeliest != null && value.shares[value.likeliest] >= 0.95;
  const short =
    candidate.production != null || certain
      ? `P${candidate.production ?? value.likeliest}`
      : `P${shares[0]}-${shares.at(-1)}`;
  const production =
    candidate.production != null
      ? `Production ${candidate.production} (shown on his card)`
      : certain
        ? `Production ${value.likeliest}, read from his wage`
        : `Production ${shares[0]}-${shares.at(-1)} from his wage (${shares.map((p) => `${p}: ${Math.round(value.shares[p] * 100)}%`).join(", ")})`;
  const lo = wageChip(value.expectation.min);
  const hi = wageChip(value.expectation.max);
  const days =
    value.daysLeft == null
      ? `${value.horizon}-day estimate`
      : `${value.daysLeft} days to 65${value.daysLeft > value.horizon ? ` (first ${value.horizon} counted)` : ""}`;
  // a known Flight Risk badge is flagged; a hidden trait's small chance of
  // being one is part of the "? trait" note, not a warning
  const flighty = value.flightRisk >= 0.5;
  const unread = (candidate.hiddenTraits ?? 0) + (candidate.unknownTraits ?? 0);
  const details = [
    production,
    `Wage chip once hired: ${lo === hi ? lo : `${lo} to ${hi}`}`,
    `Gold a day: ${signed(value.perDayNow, 2)} now, ${signed(value.perDaySettled, 2)} after 20 days on the product`,
    `${days}: ≈ ${signed(value.total, 1)} g in all`,
    unread ? "His ? trait is priced as an average hire's trait" : "",
    value.drifted
      ? "His wage only fits with a wider slack: the point value moved since the candidates were drawn"
      : "",
    flighty ? "Flight Risk: may quit from 50 happiness" : "",
    value.total < 0 ? "Loses gold over his working life" : "",
    ...teamLines,
  ].filter(Boolean);
  const warn = value.drifted || flighty ? ' <b class="lens-neg">!</b>' : "";
  const team =
    Math.abs(value.team ?? 0) >= 0.05 ? ` · team ${gold(value.team, 1)} g` : "";
  return `<span class="ss-recruit-line">${best ? '<b class="lens-pos">★</b> ' : ""}<b>${esc(short)}</b> · ${esc(lo === hi ? lo : `${lo}…${hi}`)} · ${gold(value.total, 1)} g${team}${warn}</span>${helpMark(details.join("\n"))}`;
}

/**
 * What the advisor knows of the company whose Recruit window is open: its
 * kind of product, the gold a point of it fetches at the bids, its bonus.
 * @param {ReturnType<typeof companyFromButton> & { at: number } | null} company
 * @param {Record<string, { bid?: number | null }> | null | undefined} books
 * @param {boolean} booksFresh
 */
export function companyContext(company, books, booksFresh) {
  if (!company) return { kind: null, valuePerPoint: null, bonus: 0 };
  const bidOf = (code) => books?.[code]?.bid ?? null;
  return {
    kind: productKind(company.product),
    valuePerPoint:
      booksFresh && books ? valuePerPoint(company.product, bidOf) : null,
    bonus: company.bonus ?? 0,
  };
}

/** Own and remove only the advisor's nodes, including across portal replacements. */
export function createRecruit({ clock = () => Date.now() } = {}) {
  const owned = new Set();
  /** The game's candidate cards carrying the best-pick mark. */
  const marked = new Set();
  /** @type {(ReturnType<typeof companyFromButton> & { at: number }) | null} */
  let company = null;
  const clear = () => {
    for (const node of owned) node.remove();
    owned.clear();
    for (const card of marked) card.removeAttribute(BEST_ATTR);
    marked.clear();
  };
  // Note the company of a pressed Recruit button: observed, never prevented.
  const onClick = (e) => {
    const target = /** @type {Element | null} */ (e.target);
    const button = target?.closest?.("button");
    if (
      !button ||
      button.closest('[role="dialog"], [data-lens]') ||
      !/^\s*recruit(?![a-z])/i.test(button.textContent ?? "")
    )
      return;
    const found = companyFromButton(button);
    company = found ? { ...found, at: clock() } : null;
  };
  document.addEventListener("click", onClick, true);
  const dispose = () => {
    document.removeEventListener("click", onClick, true);
    clear();
  };
  function render({
    pointValue = null,
    error = null,
    books = null,
    booksAt = null,
    employees = null,
    employeesError = null,
    hasKey = true,
    pageUserId = null,
    now = Date.now(),
  } = {}) {
    const read = readRecruitDialog();
    if (!read) {
      clear();
      return null;
    }
    const usable =
      !error && freshness(pointValue?.at, TTL.pointValue, now) === "fresh";
    const here =
      company && now - company.at <= COMPANY_MEMORY_MS ? company : null;
    const ctx = companyContext(
      here,
      books,
      freshness(booksAt, TTL.cases, now) === "fresh",
    );
    const teamMissing =
      unreadTeam({
        employees,
        error: employeesError,
        hasKey,
        pageUserId,
        now,
      }) ??
      (!here?.companyId
        ? "team not counted: company not found; open Recruit from its card"
        : null);
    const roster = !teamMissing
      ? rosterOf(employees.rows, here.companyId, Date.parse(employees.at))
      : null;
    const ranked = usable
      ? rankCandidates(
          read.candidates.map((c) => ({
            ...c,
            // A flag is a country name; the API uses an id. No mapping exists.
            nationality: null,
            home:
              here?.country && c.nationality
                ? c.nationality === here.country
                : null,
          })),
          {
            pointValue: pointValue.value,
            alone: read.alone,
            bonus: ctx.bonus,
            kind: ctx.kind,
            valuePerPoint: ctx.valuePerPoint,
            roster,
            now,
          },
        )
      : null;
    const current = new Set();
    let head = read.root.querySelector(".ss-recruit-head[data-lens]");
    if (!head) {
      head = document.createElement("div");
      head.className = "ss-recruit-head";
      head.dataset.lens = "";
      const anchor = read.rosterNode?.parentElement;
      if (anchor) anchor.insertAdjacentElement("afterend", head);
      else read.root.prepend(head);
      owned.add(head);
    }
    current.add(head);
    const rosterLabel = read.roster
      ? `Roster ${read.roster.count}/${read.roster.capacity}`
      : "Roster unavailable";
    const pv = pointValue?.value;
    const basis = !here
      ? "Output at the game's point value (the company was not seen: open Recruit from its card)"
      : ctx.valuePerPoint != null
        ? `${here.product}: a point fetches ${ctx.valuePerPoint.toFixed(4)} at the bids${ctx.kind === "product" ? " (less its inputs)" : ""}`
        : `${here.product}: prices not read yet, output at the game's point value`;
    const best = ranked?.bestPays ? ranked.best : null;
    const details = [
      `Point value ${pv?.toFixed(4)} (wages rest on it)`,
      basis,
      here?.bonus != null
        ? `Company bonus ${here.bonus >= 0 ? "+" : ""}${Math.round(here.bonus * 100)}%`
        : "",
      `${read.alone ? "Works alone" : "Team estimate"} (${rosterLabel})`,
      "Specialization: +1% a day on the same product, up to +20%",
      "A hire costs 10 energy, which your own work turns into 3-6 g",
      "Gold figures are estimates at today's prices",
    ].filter(Boolean);
    const status = error
      ? esc(error)
      : !pointValue
        ? "reading point value…"
        : !usable
          ? "point value is stale; waiting for a fresh read"
          : best != null
            ? `<b class="lens-pos">★ ${esc(read.candidates[best].name)}</b>`
            : '<span class="lens-neg">none pays here: Reroll all (10 energy, more after) or leave the slot empty</span>';
    setHtml(
      head,
      `WarEra Plus · ${status}${usable ? helpMark(details.join("\n")) : ""}`,
    );
    // the best pick's card is outlined, every other card's mark removed
    for (const [i, candidate] of read.candidates.entries())
      if (i === best) {
        candidate.card.setAttribute(BEST_ATTR, "");
        marked.add(candidate.card);
      } else candidate.card.removeAttribute(BEST_ATTR);
    for (const card of marked)
      if (best == null || card !== read.candidates[best].card) {
        card.removeAttribute(BEST_ATTR);
        marked.delete(card);
      }
    for (const [i, candidate] of read.candidates.entries()) {
      let block = candidate.card.querySelector(".ss-recruit-value[data-lens]");
      if (!block) {
        block = document.createElement("div");
        block.className = "ss-recruit-value";
        block.dataset.lens = "";
        // Insert after the complete stats/traits group, before the native
        // Hire wrapper. The button and every ancestor keep their identity.
        candidate.statsGroup.parentElement.insertAdjacentElement(
          "afterend",
          block,
        );
        owned.add(block);
      }
      current.add(block);
      setHtml(
        block,
        candidateHtml(
          candidate,
          ranked?.values[i],
          ranked?.bestPays && ranked.best === i,
          teamMissing
            ? [teamMissing]
            : teamNotes(ranked?.values[i], {
                at: employees.at,
                count: roster.length,
                now,
              }),
        ),
      );
    }
    for (const node of owned)
      if (!current.has(node)) {
        node.remove();
        owned.delete(node);
      }
    return read;
  }
  return { render, clear, dispose, company: () => company };
}
