// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { preferences } from "./lib/settings.mjs";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  document.body.innerHTML = "";
});

it("loads and saves the two wooden modes from Advanced", async () => {
  document.documentElement.innerHTML = readFileSync(
    "extension/popup.html",
    "utf8",
  );
  const sendMessage = vi.fn(async (message) => ({
    settings: preferences(
      message.type === "saveSettings"
        ? message.settings
        : { woodenMode: "flip" },
    ),
  }));
  vi.stubGlobal("chrome", {
    runtime: { sendMessage, getManifest: () => ({ version: "test" }) },
  });
  await import("./popup.js");
  await vi.waitFor(() =>
    expect(document.querySelector("#woodenMode")?.value).toBe("flip"),
  );
  const control = document.querySelector("#advanced #woodenMode");
  expect(
    [...control.options].map((o) => [
      o.value,
      o.textContent.replace(/\s+/g, " ").trim(),
    ]),
  ).toEqual([
    ["hold", "Hold (compare the opening with the sealed bid)"],
    ["flip", "Flip (buy at the ask, open, sell the drops)"],
  ]);
  control.value = "hold";
  document
    .querySelector("#settings")
    .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  await vi.waitFor(() =>
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "saveSettings",
        settings: expect.objectContaining({ woodenMode: "hold" }),
      }),
    ),
  );
});
