// The game's Train window (v0.27): which of the three dealt cards to keep.
// Each card is valued in gold for this employee (hiring.trainingValues) and
// the best one's card is outlined; one compact line under the cards, the
// details in its "?" tooltip. Display only: no card, Pick or Close button
// is ever clicked, and the game's nodes keep their identity.
import { traitCode, trainingValues, TRAIN_STATS } from "./hiring.mjs";
import { escapeHtml as esc, signed } from "./format.mjs";
import { freshness, TTL } from "./quality.mjs";
import { setHtml, helpMark } from "./ui.mjs";
import { BEST_ATTR } from "./recruit.mjs";

const RARITY = /^(common|uncommon|rare|epic|legendary|mythic)$/i;
/** The cards' titles as the game prints them (English catalog), to their kind. */
const TITLES = new Map([
  ["drill", "drill"],
  ["intensive drill", "drill"],
  ["negotiation", "negotiation"],
  ["wild card", "wild"],
  ["new habit", "habit"],
  ["rehab", "rehab"],
  ["clean slate", "cleanSlate"],
  ["second wind", "secondWind"],
  ["mentoring", "mentoring"],
]);

const native = (/** @type {Element} */ n) => !n.closest("[data-lens]");
/** The trimmed text nodes under `el`, in order, the extension's own left out. */
function texts(el) {
  const out = [];
  const walk = el.ownerDocument.createTreeWalker(el, 4 /* SHOW_TEXT */);
  while (walk.nextNode()) {
    const node = walk.currentNode;
    if (node.parentElement?.closest("[data-lens]")) continue;
    const v = String(node.nodeValue ?? "").trim();
    if (v) out.push(v);
  }
  return out;
}
/** An icon's identity: its drawing (the same component draws the same paths). */
const iconOf = (/** @type {Element | null | undefined} */ el) =>
  el?.querySelector("svg")?.innerHTML ?? null;
/** The innermost elements whose whole text matches `re`, outside buttons and the extension's nodes. */
function textNodes(root, re) {
  return [...root.querySelectorAll("span, div, p")].filter((e) => {
    if (!native(e) || e.closest("button")) return false;
    const t = e.textContent?.trim() ?? "";
    return (
      re.test(t) &&
      ![...e.children].some((c) => (c.textContent?.trim() ?? "") === t)
    );
  });
}

/**
 * The three stat chips of the employee's header (Production, Responsibility,
 * Luck, in that order): a box of exactly three chips, each an icon and a
 * number or "?", outside the cards.
 */
function statChips(dialog) {
  return [...dialog.querySelectorAll("div")].find(
    (e) =>
      native(e) &&
      !e.closest("button") &&
      e.children.length === 3 &&
      [...e.children].every(
        (c) =>
          c.querySelector("svg") &&
          !c.querySelector('[role="img"]') &&
          /^(?:\?|\d+)$/.test(c.textContent?.trim() ?? ""),
      ),
  );
}

/**
 * One dealt card off its button: the rarity tag, the title, then what it
 * does ("-10%" "Expected wage", "+2" with the stat's icon, trait badges).
 * null when the button is no training card.
 */
function readCard(button, icons) {
  const t = texts(button);
  if (!t.length || !RARITY.test(t[0])) return null;
  const at = t.findIndex((x) => TITLES.has(x.toLowerCase()));
  if (at < 0) return null;
  const kind = TITLES.get(t[at].toLowerCase()) ?? null;
  const rest = t.slice(at + 1);
  const joined = rest.join(" ");
  /** @type {{ button: Element, rarity: string, title: string, kind: string | null,
   *   delta: number | null, stat: string | null, traitTo: string[], trait: string | null }} */
  const card = {
    button,
    rarity: t[0].toLowerCase(),
    title: t[at],
    kind,
    delta: null,
    stat: null,
    traitTo: [],
    trait: null,
  };
  if (kind === "negotiation") {
    const m = /-\s*(\d+)\s*%/.exec(joined);
    card.delta = m ? Number(m[1]) : null;
  } else if (kind === "drill" || kind === "secondWind") {
    const m = /\+\s*(\d+)/.exec(joined);
    card.delta = m ? Number(m[1]) : null;
  }
  if (kind === "drill") {
    // the drilled stat by its icon, the header's three stat icons in order;
    // only icons after the title: the card's own title icon comes first and
    // may draw like a stat's
    const title = [...button.querySelectorAll("*")].find(
      (e) =>
        (e.textContent?.trim() ?? "") === card.title &&
        ![...e.children].some(
          (c) => (c.textContent?.trim() ?? "") === card.title,
        ),
    );
    for (const svg of button.querySelectorAll("svg")) {
      // 4 = Node.DOCUMENT_POSITION_FOLLOWING: the icon comes after the title
      if (!title || !(title.compareDocumentPosition(svg) & 4)) continue;
      const i = icons.indexOf(svg.innerHTML);
      if (i >= 0) {
        card.stat = TRAIN_STATS[i];
        break;
      }
    }
  }
  if (kind === "habit" || kind === "rehab") {
    const badges = [...button.querySelectorAll('[role="img"][aria-label]')]
      .filter(native)
      .map((b) => traitCode(b.getAttribute("aria-label")));
    // the caption names the trait(s) taught ("Specialist", "A and B") or removed ("Remove A")
    const named = rest
      .flatMap((t) =>
        String(t)
          .replace(/^remove\s+/i, "")
          .split(/\s+and\s+/i),
      )
      .map(traitCode)
      .filter(Boolean);
    if (kind === "rehab") card.trait = named[0] ?? badges[0] ?? null;
    else {
      card.traitTo = /** @type {string[]} */ (named);
      card.trait =
        /** @type {string | null} */ (
          badges.find((c) => c && !named.includes(c))
        ) ?? null;
    }
  }
  return card;
}

/**
 * The open Train window: the employee as its header shows him and the dealt
 * cards. null when no window reads (every card must, or nothing is shown).
 */
export function readTrainDialog(root = document) {
  for (const dialog of root.querySelectorAll('[role="dialog"]')) {
    const stats = statChips(dialog);
    if (!stats) continue;
    const icons = [...stats.children].map(iconOf);
    const buttons = [...dialog.querySelectorAll("button")].filter(native);
    const cards = buttons
      .map((b) => readCard(b, icons))
      .filter((c) => c != null);
    if (cards.length < 2) continue;
    // the row that holds the cards, and each card's own box in it
    let row = cards[0].button.parentElement;
    while (row && !cards.every((c) => row?.contains(c.button)))
      row = row.parentElement;
    if (!row || row === dialog) continue;
    const boxes = cards.map(
      (c) =>
        [...(row?.children ?? [])].find((ch) => ch.contains(c.button)) ?? null,
    );
    if (boxes.some((b) => !b) || new Set(boxes).size !== cards.length) continue;
    const values = [...stats.children].map((c) => {
      const v = c.textContent?.trim() ?? "";
      return /^\d+$/.test(v) ? Number(v) : null;
    });
    // the chips: his production bonus (the pickaxe, Production's icon) and
    // his wage chip ("Market rate" at 0), in that order; his potential "1/3"
    const pcts = textNodes(dialog, /^(?:[+-]\d+(?:\.\d+)?%|Market rate)$/).map(
      (e) => ({
        // a percent with one decimal, as a share: "+13.8%" is 0.138
        value: /^market rate$/i.test(e.textContent?.trim() ?? "")
          ? 0
          : Math.round(Number.parseFloat(e.textContent ?? "") * 1e4) / 1e6,
        icon: iconOf(e.parentElement),
      }),
    );
    // told apart by their icons (the bonus chip draws Production's pickaxe,
    // and the game prints it only when he has a bonus); by their order
    // (bonus, then wage) only when no chip carries an icon
    const iconed = pcts.some((p) => p.icon != null);
    const bonusChip = iconed
      ? pcts.find((p) => p.icon === icons[0])
      : pcts.length >= 2
        ? pcts[0]
        : undefined;
    const wageChip = iconed
      ? pcts.find((p) => p !== bonusChip && p.icon !== icons[0])
      : pcts.find((p) => p !== bonusChip);
    const potentialNode = textNodes(dialog, /^(\d+)\s*\/\s*(\d+)$/).find(
      (e) => !row.contains(e),
    );
    const potential = /^(\d+)\s*\/\s*(\d+)$/.exec(
      potentialNode?.textContent?.trim() ?? "",
    );
    const hiredNode = textNodes(dialog, /^hired\s+\d+\s*d\b/i)[0];
    const hired = hiredNode
      ? Number(/(\d+)/.exec(hiredNode.textContent ?? "")?.[1])
      : 0;
    const ageMatch = /(\d{1,3})\s*$/.exec(
      hiredNode?.previousElementSibling?.textContent ?? "",
    );
    const traits = [...dialog.querySelectorAll('[role="img"][aria-label]')]
      .filter((b) => native(b) && !b.closest("button"))
      .map((b) => traitCode(b.getAttribute("aria-label")))
      .filter(Boolean);
    return {
      root: dialog,
      row,
      boxes: /** @type {Element[]} */ (boxes),
      cards,
      trainee: {
        production: values[0],
        responsibility: values[1],
        luck: values[2],
        potential: potential ? Number(potential[1]) : null,
        potentialMax: potential ? Number(potential[2]) : null,
        wageChip: wageChip?.value ?? null,
        bonus: bonusChip?.value ?? 0,
        hiredDays: Number.isFinite(hired) ? hired : 0,
        age: ageMatch ? Number(ageMatch[1]) : null,
        traits: /** @type {string[]} */ (traits),
      },
    };
  }
  return null;
}

/** A card's gold as the line prints it: "≈ 0 g" for less than a tenth. */
const goldText = (/** @type {number} */ g) =>
  Math.abs(g) < 0.05 ? "≈ 0 g" : `${signed(g, 1)} g`;

/** The advice line's cells, one under each card, and its tooltip. */
export function trainHtml(read, result, pointValue) {
  const cells = read.cards.map((card, i) => {
    const v = result?.values[i];
    if (!v || v.gold == null)
      return '<span class="ss-train-cell lens-muted">?</span>';
    const cls =
      v.gold > 0.05 ? "lens-pos" : v.gold < -0.05 ? "lens-neg" : "lens-muted";
    return `<span class="ss-train-cell ${cls}">${result?.best === i ? "★ " : ""}${esc(goldText(v.gold))}</span>`;
  });
  const t = read.trainee;
  const details = [
    ...read.cards.map((card, i) => {
      const v = result?.values[i];
      return `${result?.best === i ? "★ " : ""}${card.title}${card.delta != null ? ` (${card.kind === "negotiation" ? "-" : "+"}${card.delta}${card.kind === "negotiation" ? "%" : ""})` : ""}: ${v?.gold == null ? "not priced" : goldText(v.gold)} - ${v?.note ?? "not read"}`;
    }),
    `Production ${t.production}, wage chip ${t.wageChip == null ? "?" : `${t.wageChip >= 0 ? "+" : ""}${Math.round(t.wageChip * 1000) / 10}%`}, bonus ${t.bonus >= 0 ? "+" : ""}${Math.round(t.bonus * 1000) / 10}% + specialization still to come`,
    `${result?.horizon ?? "?"} days counted (until 65, 60 at most), output at the game's point value ${pointValue?.toFixed(4)}`,
  ];
  return `${cells.join("")}${helpMark(details.join("\n"))}`;
}

/** Own and remove only the advisor's nodes and the best card's mark. */
export function createTrain() {
  const owned = new Set();
  const marked = new Set();
  const clear = () => {
    for (const node of owned) node.remove();
    owned.clear();
    for (const box of marked) box.removeAttribute(BEST_ATTR);
    marked.clear();
  };
  function render({ pointValue = null, error = null, now = Date.now() } = {}) {
    const read = readTrainDialog();
    if (!read) {
      clear();
      return null;
    }
    const usable =
      !error && freshness(pointValue?.at, TTL.pointValue, now) === "fresh";
    const result =
      usable && read.trainee.production != null && read.trainee.wageChip != null
        ? trainingValues(read.cards, /** @type {any} */ (read.trainee), {
            pointValue: pointValue.value,
          })
        : null;
    let line = read.root.querySelector(".ss-train-value[data-lens]");
    if (!line) {
      line = document.createElement("div");
      line.className = "ss-train-value";
      line.dataset.lens = "";
      read.row.insertAdjacentElement("afterend", line);
      owned.add(line);
    }
    for (const node of owned)
      if (node !== line) {
        node.remove();
        owned.delete(node);
      }
    setHtml(
      line,
      result
        ? trainHtml(read, result, pointValue.value)
        : `<span class="lens-muted">WarEra Plus · ${
            error
              ? esc(error)
              : read.trainee.wageChip == null
                ? "his wage chip was not read"
                : read.trainee.production == null
                  ? "his Production is hidden: cards not valued"
                  : !pointValue
                    ? "reading point value…"
                    : "point value is stale; waiting for a fresh read"
          }</span>`,
    );
    const best = result?.best ?? null;
    for (const [i, box] of read.boxes.entries())
      if (i === best) {
        box.setAttribute(BEST_ATTR, "");
        marked.add(box);
      } else box.removeAttribute(BEST_ATTR);
    for (const box of marked)
      if (best == null || box !== read.boxes[best]) {
        box.removeAttribute(BEST_ATTR);
        marked.delete(box);
      }
    return read;
  }
  return { render, clear };
}
