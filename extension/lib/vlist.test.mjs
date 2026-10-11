// @vitest-environment jsdom
import { afterEach, describe, it, expect } from "vitest";
import { scanList, clickEntry, selectionCount } from "./vlist.mjs";

// The v0.27 picker's list as read live on 2026-10-11: rows of eight tiles,
// each row absolutely placed (transform: translateY(4 + 105 * index px)) in
// a content box as tall as every row, inside a scrolling box; only the rows
// in view and a few around them are in the DOM, and they change on the
// scroll event. A click on a tile selects it (the counter goes 0/5 -> 1/5),
// a second click unselects it.
function fakeList(items, { perRow = 8, rowHeight = 105, viewport = 300 } = {}) {
  const rows = Math.ceil(items.length / perRow);
  const dialog = document.createElement("div");
  dialog.setAttribute("role", "dialog");
  dialog.innerHTML = `<div class="card"><div class="title">Items</div><div class="head"><span class="count">0/5</span></div><div class="scroller" style="overflow-y: auto"><div class="content" style="height: ${rows * rowHeight}px; position: relative"></div></div></div>`;
  document.body.appendChild(dialog);
  const scroller = dialog.querySelector(".scroller");
  const content = dialog.querySelector(".content");
  let top = 0;
  let scrolls = 0; // how often the list was scrolled
  Object.defineProperty(scroller, "clientHeight", { value: viewport });
  Object.defineProperty(scroller, "scrollHeight", { value: rows * rowHeight });
  Object.defineProperty(scroller, "scrollTop", {
    get: () => top,
    set: (v) => {
      scrolls++;
      top = Math.max(0, Math.min(v, rows * rowHeight - viewport));
    },
  });
  const selected = new Set();
  const count = () => {
    dialog.querySelector(".count").textContent = `${selected.size}/5`;
  };
  const render = () => {
    const first = Math.max(0, Math.floor(top / rowHeight) - 1);
    const last = Math.min(rows - 1, Math.ceil((top + viewport) / rowHeight));
    content.innerHTML = "";
    for (let r = first; r <= last; r++) {
      const row = document.createElement("div");
      row.dataset.index = String(r);
      row.style.transform = `translateY(${4 + r * rowHeight}px)`;
      for (let c = 0; c < perRow; c++) {
        const i = r * perRow + c;
        if (i >= items.length) break;
        const tile = document.createElement("div");
        tile.className = "tile";
        tile.dataset.item = String(i);
        tile.textContent = items[i];
        tile.addEventListener("click", () => {
          if (selected.has(i)) selected.delete(i);
          else selected.add(i);
          count();
        });
        row.appendChild(tile);
      }
      content.appendChild(row);
    }
  };
  scroller.addEventListener("scroll", render);
  render();
  return {
    dialog,
    scroller,
    selected,
    rendered: () => content.children.length,
    scrolls: () => scrolls,
  };
}
// what a row holds, column by column: here the tile's text is its item
const readRow = (row) =>
  [...row.querySelectorAll(".tile")].map((tile) => ({
    tile,
    item: tile.textContent,
  }));
const instant = () => Promise.resolve();

afterEach(() => {
  document.body.innerHTML = "";
});

describe("the game's virtual list", () => {
  it("hides the list while it scrolls through it, so the rows do not fly past", async () => {
    const items = Array.from({ length: 70 }, (_, i) => `piece ${i}`);
    const list = fakeList(items);
    const seen = [];
    const scan = await scanList(list.dialog, readRow, {
      wait: async () => {
        seen.push(list.scroller.hasAttribute("data-ss-reading"));
      },
    });
    expect(scan.complete).toBe(true);
    expect(seen.length).toBeGreaterThan(1);
    expect(seen.every(Boolean)).toBe(true);
    expect(list.scroller.hasAttribute("data-ss-reading")).toBe(false);
  });
  it("does not scroll at all when every row is already in view", async () => {
    // the game's own filter leaves two rows, both drawn
    const items = Array.from({ length: 12 }, (_, i) => `piece ${i}`);
    const list = fakeList(items, { viewport: 150 });
    expect(list.rendered()).toBe(2);
    const scan = await scanList(list.dialog, readRow, { wait: instant });
    expect(scan.complete).toBe(true);
    expect(scan.entries).toHaveLength(12);
    expect(list.scrolls()).toBe(0);
  });
  it("reads every row by scrolling through the list, then puts the scroll back", async () => {
    const items = Array.from({ length: 70 }, (_, i) => `piece ${i}`);
    const list = fakeList(items);
    list.scroller.scrollTop = 210;
    list.scroller.dispatchEvent(new Event("scroll"));
    expect(list.rendered()).toBeLessThan(9); // not every row is in the DOM
    const scan = await scanList(list.dialog, readRow, { wait: instant });
    expect(scan.complete).toBe(true);
    expect(scan.entries.map((e) => e.item)).toEqual(items);
    expect(scan.entries[69]).toMatchObject({ row: 8, col: 5 });
    expect(list.scroller.scrollTop).toBe(210);
  });
  it("selects a piece by scrolling to its row and clicking its tile once", async () => {
    const items = Array.from({ length: 70 }, (_, i) => `piece ${i}`);
    const list = fakeList(items);
    const scan = await scanList(list.dialog, readRow, { wait: instant });
    const entry = scan.entries[61];
    const same = (x) => x.item === entry.item;
    expect(selectionCount(list.dialog)).toEqual({ n: 0, max: 5 });
    expect(
      await clickEntry(list.dialog, entry, readRow, same, { wait: instant }),
    ).toBe("selected");
    expect([...list.selected]).toEqual([61]);
    expect(selectionCount(list.dialog)).toEqual({ n: 1, max: 5 });
    // a piece already selected stays selected: the click that unselected it is undone
    expect(
      await clickEntry(list.dialog, entry, readRow, same, { wait: instant }),
    ).toBe("already");
    expect([...list.selected]).toEqual([61]);
  });
  it("clicks nothing when the tile at that place is another piece now", async () => {
    const items = Array.from({ length: 20 }, (_, i) => `piece ${i}`);
    const list = fakeList(items);
    const scan = await scanList(list.dialog, readRow, { wait: instant });
    const entry = scan.entries[12];
    expect(
      await clickEntry(list.dialog, entry, readRow, (x) => x.item === "gone", {
        wait: instant,
      }),
    ).toBe("missing");
    expect(list.selected.size).toBe(0);
  });
});
