// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { startLens } from "./app.mjs";
import { DEFAULTS } from "./settings.mjs";

// The map menu's "Nearest wooden case" item as the live page drew it on
// 2026-10-27: the game's click handler sits on an ancestor of the label and
// the "N regions away" subtitle, and with the game's "Quick move & collect on
// case click" on, that click moves the player to the case
// (userMapLoot.moveAndCollect). The trip line is appended inside the item, so
// no click on it may reach the game.
let app;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-27T12:00:00Z"));
  window.history.replaceState({}, "", "/world");
  Object.defineProperty(document, "hidden", {
    configurable: true,
    value: false,
  });
  document.body.innerHTML =
    '<main><div id="atlas-nearest-loot"><div><span>Nearest wooden case</span><span>13 regions away</span></div></div></main>';
});
afterEach(() => {
  app?.dispose();
  app = null;
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.innerHTML = "";
});
function mockRuntime() {
  const info = {
    settings: { ...DEFAULTS },
    hasKey: true,
    revision: 1,
    authRevision: 1,
  };
  return {
    info,
    sendMessage: vi.fn(async (msg) => {
      if (msg.type === "getSettings") return structuredClone(info);
      if (msg.type === "saveSettings") {
        Object.assign(info.settings, msg.settings);
        info.revision++;
        return structuredClone(info);
      }
      if (msg.type === "cases")
        return { cases: { at: new Date().toISOString(), books: {} } };
      return {};
    }),
  };
}

describe("the map's trip line", () => {
  it("keeps every click on the line from the game's item, and its toggle still switches the trip", async () => {
    const runtime = mockRuntime();
    const game = vi.fn();
    document
      .getElementById("atlas-nearest-loot")
      .addEventListener("click", game);
    // React hears the item's click at its root, so a click must not reach the document either
    document.addEventListener("click", game);
    app = await startLens(runtime);
    await vi.advanceTimersByTimeAsync(300);
    const line = document.querySelector(".ss-trip");
    expect(line.textContent).toContain("13 regions");
    line.querySelector("strong").click();
    line.querySelector(".lens-trip").click();
    line.click();
    expect(game).not.toHaveBeenCalled();
    line.querySelector('[data-action="trip-mode"]').click();
    await vi.advanceTimersByTimeAsync(300);
    expect(game).not.toHaveBeenCalled();
    expect(runtime.info.settings.roundTrip).toBe(true);
    expect(document.querySelector(".ss-trip").textContent).toContain(
      "Round trip",
    );
    document.removeEventListener("click", game);
  });
  it("keeps the line's nodes while only its age changes, so a press on the toggle is not lost to a rewrite", async () => {
    app = await startLens(mockRuntime());
    await vi.advanceTimersByTimeAsync(300);
    const toggle = document.querySelector('.ss-trip [data-action="trip-mode"]');
    expect(document.querySelector(".ss-trip [data-lens-time]")).not.toBeNull();
    await vi.advanceTimersByTimeAsync(6000);
    app.scan();
    await vi.advanceTimersByTimeAsync(50);
    expect(document.querySelector('.ss-trip [data-action="trip-mode"]')).toBe(
      toggle,
    );
  });
});
