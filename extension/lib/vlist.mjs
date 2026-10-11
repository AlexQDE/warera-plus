// @ts-check
// The game's virtual lists (the v0.27 picker and the Quick dismantle window,
// read live 2026-10-11): rows of tiles, each row carrying its `data-index`
// and placed by `transform: translateY(...)` in a box as tall as every row,
// inside a scrolling box. Only the rows in view and a few around them are in
// the DOM, and they change on the scroll event. So the whole list is read by
// scrolling through it (the scroll put back after), and a piece is reached
// by scrolling to its row. A click on a tile selects it; a second click
// unselects it, so a click that lowered the counter is undone.

/** @param {number} ms */
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * The list's rows in the DOM now, ours left out.
 * @param {Element} dialog
 */
export const listRows = (dialog) =>
  /** @type {HTMLElement[]} */ ([
    ...dialog.querySelectorAll("[data-index]"),
  ]).filter((r) => !r.closest("[data-lens]"));

/**
 * The box that scrolls the rows: the first ancestor of a row that scrolls.
 * @param {Element} dialog
 * @returns {HTMLElement | null}
 */
export function listScroller(dialog) {
  const row = listRows(dialog)[0];
  for (let n = row?.parentElement; n && n !== dialog; n = n.parentElement) {
    const overflow = getComputedStyle(n).overflowY;
    if (/auto|scroll/.test(overflow) && n.scrollHeight > n.clientHeight + 1)
      return n;
  }
  return null;
}

/** @param {HTMLElement} el */
const translateY = (el) => {
  const m = /translateY\(\s*(-?\d+(?:\.\d+)?)px\s*\)/.exec(el.style.transform);
  return m ? Number(m[1]) : null;
};

/**
 * One row's height, from two rows in the DOM one index apart.
 * @param {Element} dialog
 */
function rowHeight(dialog) {
  const at = new Map(
    listRows(dialog).map((r) => [Number(r.dataset.index), translateY(r)]),
  );
  for (const [i, y] of at) {
    const next = at.get(i + 1);
    if (y != null && next != null && next > y) return next - y;
  }
  return 100;
}

/** @param {HTMLElement} scroller @param {number} top */
function scrollTo(scroller, top) {
  scroller.scrollTop = top;
  // the event the list renders on; a programmatic scroll sends it a frame later, if at all
  scroller.dispatchEvent(new Event("scroll"));
}

/**
 * Every row is drawn now: they run from the first without a gap and the last
 * one reaches the bottom of the rows' box (a list the game's own filter cut
 * short).
 * @param {Element} dialog
 */
function allInView(dialog) {
  const rows = listRows(dialog);
  if (!rows.length) return true;
  const idx = rows.map((r) => Number(r.dataset.index)).sort((a, b) => a - b);
  if (idx.some((v, i) => v !== i)) return false;
  const height = parseFloat(rows[0].parentElement?.style.height ?? "");
  const last = rows.find((r) => Number(r.dataset.index) === idx.at(-1));
  const y = last ? translateY(last) : null;
  return (
    Number.isFinite(height) && y != null && y + rowHeight(dialog) >= height - 2
  );
}

/**
 * Every piece in the list, column by column, row by row: `readRow` tells what
 * a row's tiles are ([{ tile, ...what it reads }]); each entry gets its `row`
 * and `col`. `complete` when every row from the first to the last was seen.
 * When rows are missing the list is scrolled through hidden (`data-ss-reading`,
 * content.css), so its rows never fly past, and put back before it shows again.
 * @template {{ tile: Element }} T
 * @param {Element} dialog @param {(row: HTMLElement) => T[]} readRow
 * @param {{ wait?: () => Promise<unknown> }} [options]
 */
export async function scanList(
  dialog,
  readRow,
  { wait = () => delay(50) } = {},
) {
  /** @type {Map<number, T[]>} */
  const byRow = new Map();
  const take = () => {
    for (const r of listRows(dialog)) {
      const i = Number(r.dataset.index);
      if (Number.isInteger(i) && !byRow.has(i)) byRow.set(i, readRow(r));
    }
  };
  take();
  const scroller = listScroller(dialog);
  if (scroller && !allInView(dialog)) {
    const start = scroller.scrollTop;
    const h = rowHeight(dialog);
    const step = Math.max(h, scroller.clientHeight - h);
    const end = scroller.scrollHeight - scroller.clientHeight;
    scroller.setAttribute("data-ss-reading", "");
    try {
      for (let top = 0, n = 0; n < 500; top += step, n++) {
        scrollTo(scroller, Math.min(top, end));
        await wait();
        take();
        if (top >= end) break;
      }
      scrollTo(scroller, start);
      await wait();
    } finally {
      scroller.removeAttribute("data-ss-reading");
    }
  }
  const rows = [...byRow.keys()].sort((a, b) => a - b);
  return {
    entries: rows.flatMap((row) =>
      /** @type {T[]} */ (byRow.get(row)).map((x, col) => ({ ...x, row, col })),
    ),
    complete: rows.length > 0 && rows.every((r, i) => r === i),
  };
}

/**
 * The selection counter ("0/5"), off the dialog's own text: { n, max }, null
 * when it shows none. An element's own text nodes are joined first: React
 * prints `{n}/5` as two of them ("0", "/5").
 * @param {Element} dialog
 */
export function selectionCount(dialog) {
  for (const el of dialog.querySelectorAll("*")) {
    if (el.closest("[data-lens]")) continue;
    let own = "";
    for (const n of el.childNodes) if (n.nodeType === 3) own += n.nodeValue;
    const m = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(own);
    if (m) return { n: Number(m[1]), max: Number(m[2]) };
  }
  return null;
}

/**
 * Select the piece at `entry` (its row and column from scanList): scroll to
 * its row, check the tile there is still that piece (`same`), click it once.
 * "selected", "already" (it was selected: the click that unselected it is
 * undone) or "missing" (not there now: nothing clicked).
 * @template {{ tile: Element }} T
 * @param {Element} dialog @param {{ row: number, col: number }} entry
 * @param {(row: HTMLElement) => T[]} readRow @param {(x: T) => boolean} same
 * @param {{ wait?: () => Promise<unknown> }} [options]
 */
export async function clickEntry(
  dialog,
  entry,
  readRow,
  same,
  { wait = () => delay(80) } = {},
) {
  const find = () =>
    listRows(dialog).find((r) => Number(r.dataset.index) === entry.row);
  let row = find();
  const scroller = listScroller(dialog);
  if (scroller) {
    // the row a third of the way down the view, so it is rendered and seen
    const h = rowHeight(dialog);
    scrollTo(
      scroller,
      Math.max(0, entry.row * h - Math.round(scroller.clientHeight / 3)),
    );
    await wait();
    row = find();
  }
  if (!row) return "missing";
  const x = readRow(row)[entry.col];
  if (!x || !same(x)) return "missing";
  const before = selectionCount(dialog);
  /** @type {HTMLElement} */ (x.tile).click();
  await wait();
  const after = selectionCount(dialog);
  if (before && after && after.n < before.n) {
    const again = readRow(find() ?? row)[entry.col];
    if (again && same(again)) /** @type {HTMLElement} */ (again.tile).click();
    await wait();
    return "already";
  }
  return "selected";
}
