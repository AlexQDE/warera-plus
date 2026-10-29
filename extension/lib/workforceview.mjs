// My workforce is read by its title and Employees sort controls, never the
// chart's Employees legend. Only our own panel is written; game rows and
// controls retain their identity and receive no programmatic interactions.
import {
  trainOrder,
  placementFlags,
  losingGold,
  companyProduct,
} from "./workforce.mjs";
import { productKind, TRAIN_ENERGY_COST, ENERGY_GOLD } from "./hiring.mjs";
import { freshness, TTL } from "./quality.mjs";
import { employeeAccountMismatch, unreadTeam } from "./teamview.mjs";
import { escapeHtml as esc, signed } from "./format.mjs";
import { helpMark, setHtml } from "./ui.mjs";

const native = (node) => !node.closest("[data-lens]");
const companyId = (link) =>
  /\/company\/([0-9a-f]{24})(?:[/?#]|$)/i
    .exec(link.getAttribute("href") ?? "")?.[1]
    ?.toLowerCase() ?? null;

/** Company cards anywhere in the document, including cards without a
 * Recruit button. Stop when an ancestor holds more than one company. */
function readCompanies(root) {
  const companies = {};
  for (const link of root.querySelectorAll('a[href*="/company/"]')) {
    const id = companyId(link);
    if (!id || !native(link)) continue;
    for (
      let card = link.parentElement;
      card && card !== root;
      card = card.parentElement
    ) {
      const ids = new Set(
        [...card.querySelectorAll('a[href*="/company/"]')]
          .map(companyId)
          .filter(Boolean),
      );
      if (ids.size > 1) break;
      const products = [
        ...new Set(
          [...card.querySelectorAll("img[alt]")]
            .filter(native)
            .map((img) => img.getAttribute("alt"))
            .filter((code) => productKind(code)),
        ),
      ];
      if (products.length === 1) {
        companies[id] = { product: products[0] };
        break;
      }
    }
  }
  // on a company's own page its card links nowhere: the page is the company, as Recruit reads it
  const doc = /** @type {Document} */ (root.ownerDocument ?? root);
  const here = /^\/company\/([0-9a-f]{24})(?:\/|$)/i
    .exec(doc.defaultView?.location.pathname ?? "")?.[1]
    ?.toLowerCase();
  if (here && !companies[here]) {
    const products = [
      ...new Set(
        [...doc.querySelectorAll("img[alt]")]
          .filter((img) => native(img) && !img.closest('[role="dialog"]'))
          .map((img) => img.getAttribute("alt"))
          .filter((code) => productKind(code)),
      ),
    ];
    if (products.length === 1) companies[here] = { product: products[0] };
  }
  return companies;
}

export function readWorkforceDialog(root = document) {
  const dialogs = [...root.querySelectorAll('[role="dialog"]')];
  if (root.matches?.('[role="dialog"]')) dialogs.unshift(root);
  for (const dialog of dialogs) {
    const walk = dialog.ownerDocument.createTreeWalker(dialog, 4);
    let first = "";
    while (walk.nextNode()) {
      if (!native(walk.currentNode.parentElement)) continue;
      first = walk.currentNode.textContent.trim();
      if (first) break;
    }
    if (
      !/^My workforce\b/i.test(first) ||
      dialog.hidden ||
      dialog.getAttribute("aria-hidden") === "true"
    )
      continue;
    const buttons = [...dialog.querySelectorAll("button")].filter(native);
    const sort = buttons.filter((b) =>
      /^(By Company|Production|Profit|Happiness)$/i.test(b.textContent.trim()),
    );
    if (!sort.some((b) => /^By Company$/i.test(b.textContent.trim()))) continue;
    const heading = [
      ...dialog.querySelectorAll("h2, h3, h4, h5, div, span, p"),
    ].find(
      (el) =>
        native(el) &&
        !el.closest("button") &&
        el.textContent.trim() === "Employees" &&
        ![...el.children].some(
          (child) => child.textContent.trim() === "Employees",
        ) &&
        sort.every((button) => el.compareDocumentPosition(button) & 4),
    );
    if (!heading) continue;
    let before = sort[0];
    while (
      before.parentElement &&
      before.parentElement !== dialog &&
      !before.parentElement.contains(heading)
    )
      before = before.parentElement;
    return {
      root: dialog,
      heading,
      before,
      companies: readCompanies(dialog.ownerDocument),
    };
  }
  return null;
}

const age = (at, now) =>
  at
    ? `${Math.max(0, Math.floor((now - Date.parse(at)) / 60_000))} min ago`
    : "never read";
const nameOf = (employee) => esc(employee.name ?? "Employee");
const gold = (n, day = false) => `${signed(n, 1)} g${day ? " a day" : ""}`;

export function createWorkforce() {
  const owned = new Set();
  // Card pricing is relatively expensive: a DOM mutation or the five-second
  // tick reuses it until its data, company products, or game day changes.
  let cached = null;
  function clear() {
    for (const node of owned) node.remove();
    owned.clear();
    cached = null;
  }
  function render(state) {
    const read = readWorkforceDialog();
    if (!read) {
      clear();
      return null;
    }
    let panel = [...owned].find((node) => read.root.contains(node));
    for (const node of owned)
      if (node !== panel) {
        node.remove();
        owned.delete(node);
      }
    if (!panel) {
      panel = read.root.ownerDocument.createElement("div");
      panel.className = "ss-workforce ss-recruit-head";
      panel.dataset.lens = "";
      owned.add(panel);
    }
    if (panel.nextElementSibling !== read.before)
      read.before.insertAdjacentElement("beforebegin", panel);
    const { employees, pointValue, leadership, now = Date.now() } = state;
    if (employeeAccountMismatch(employees, state.pageUserId)) {
      cached = null;
      setHtml(
        panel,
        `<span class="lens-neg" role="alert">WarEra Plus · the API key reads another account's employees: save this account's key in the settings</span>`,
      );
      return read;
    }
    const missing =
      unreadTeam({
        employees,
        error: state.employeesError,
        hasKey: state.hasKey,
        pageUserId: state.pageUserId,
        now,
      }) ??
      (state.error
        ? state.error
        : !pointValue
          ? "reading point value…"
          : freshness(pointValue.at, TTL.pointValue, now) !== "fresh"
            ? "point value is stale; waiting for a fresh read"
            : !(pointValue.value > 0)
              ? "point value is unavailable"
              : null);
    if (missing) {
      cached = null;
      setHtml(
        panel,
        `<span class="lens-muted">WarEra Plus · ${esc(missing)}</span>`,
      );
      return read;
    }
    const booksFresh = freshness(state.booksAt, TTL.cases, now) === "fresh";
    const productsKey = JSON.stringify(read.companies);
    const day = new Date(now).toISOString().slice(0, 10);
    const level = leadership?.level ?? 0;
    if (
      !cached ||
      cached.employees !== employees ||
      cached.pointValue !== pointValue ||
      cached.books !== state.books ||
      cached.booksFresh !== booksFresh ||
      cached.level !== level ||
      cached.day !== day ||
      cached.productsKey !== productsKey
    ) {
      const ctx = {
        now,
        pointValue: pointValue.value,
        leadership: level,
        companies: read.companies,
        bidOf: (code) =>
          booksFresh
            ? (state.books?.[code]?.bid ??
              state.books?.[code]?.bids?.[0]?.price ??
              null)
            : null,
      };
      cached = {
        employees,
        pointValue,
        books: state.books,
        booksFresh,
        level,
        day,
        productsKey,
        train: trainOrder(employees.rows, ctx),
        placement: placementFlags(employees.rows, read.companies, ctx),
        losing: losingGold(employees.rows, ctx),
      };
    }
    const { train, placement, losing } = cached;
    const count = new Set(
      [...train, ...placement, ...losing].map((row) => row.employee),
    ).size;
    const unknown = employees.rows.filter(
      (e) => !companyProduct(e, read.companies, now),
    );
    const assumptions = [
      `employees read ${age(employees.at, now)}`,
      `point value read ${age(pointValue.at, now)}`,
      `case books read ${age(state.booksAt, now)}; ${booksFresh ? "company bids when complete, else point value" : "books unavailable or stale: using point value"}`,
      `Management ${level}${leadership ? `, last seen ${age(leadership.at, now)} in Train` : "; never seen in Train, using 0"}`,
      "Training: one rarity per hand, then three different cards; future pool holds Luck value at zero. Today's hand has full value, later hands are weighted by remaining days to age 65 (60-day horizon), one a day; stats and odds held fixed.",
      `Each hand costs ${TRAIN_ENERGY_COST} energy, valued at ${ENERGY_GOLD} g of your own work; negative training values are retained. Responsibility gives +3 happiness per point, capped at 100; training values use its own-trait model, without coworker changes.`,
      "Wage multiplier inferred from hourly wage / (base Production × 0.25 × point value). Specialization and future output follow the Train model.",
      "Rival and Mentor compare base Production, strictly greater / less. Envious compares hourly wages; happiness items count in full; Responsibility adds +3 happiness per point (0-100 cap).",
      "Prima Donna (assumed rule): +20% output and −10 happiness while best paid, ties included. A raise's wage cost and an unknown destination are not priced.",
      "Laborer / Craftsman: −1 in the wrong industry, +3 in the right one; +4 P is priced at the current company's value and bonus, before any move costs. Company cards win; fallback is a single specialization key last used today (UTC).",
      "Loner, Sociable and Mentor fixes need a destination or coworker, so no gold figure. Bully shows only his coworkers' output loss, not his own benefit. Losing gold is each employee's own hourly estimate × 24 × value per point minus hourly wage × 24.",
      ...(unknown.length
        ? [
            `unknown product: ${unknown.map((e) => e.name ?? "Employee").join(", ")}; Laborer / Craftsman rules skipped; using point value`,
          ]
        : []),
      ...new Set(placement.flatMap((flag) => flag.assumed)),
      "moves and hires are v2; display only",
    ];
    const sections = [];
    if (train.length)
      sections.push(
        `<div><strong>Train first</strong>${train
          .slice(0, 5)
          .map(
            (r) =>
              `<span data-workforce="train">${nameOf(r.employee)} ${gold(r.gold)}</span>`,
          )
          .join("")}</div>`,
      );
    if (placement.length)
      sections.push(
        `<div><strong>Placement</strong>${placement.map((r) => `<span data-workforce="placement">${nameOf(r.employee)} · ${esc(r.note)}${r.goldDay == null ? "" : ` ≈ ${gold(r.goldDay, true)}`}</span>`).join("")}</div>`,
      );
    if (losing.length)
      sections.push(
        `<div><strong>Losing gold</strong>${losing.map((r) => `<span data-workforce="losing">${nameOf(r.employee)} ${gold(r.goldDay, true)}: fire, retrain or move</span>`).join("")}</div>`,
      );
    setHtml(
      panel,
      `<div class="ss-workforce-title"><strong>WarEra Plus · ${count ? `${count} to look at` : "all placed well"}</strong>${helpMark(assumptions.join("\n"))}</div>${sections.join("")}`,
    );
    return read;
  }
  return { render, clear };
}
