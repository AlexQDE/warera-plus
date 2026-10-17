// The original marker is retained so re-injection cannot start a second copy.
// Injected at document_start: the app is up before the game draws its market,
// so the offers get their lines in the frame they first show in.
(async () => {
  if (window.__scrapSniper) return;
  window.__scrapSniper = true;
  try {
    const { startLens } = await import(chrome.runtime.getURL("lib/app.mjs"));
    const app = await startLens();
    window.addEventListener("pagehide", (e) => {
      if (!e.persisted) app.dispose();
    });
  } catch {
    const show = () => {
      const notice = document.createElement("div");
      notice.dataset.lens = "";
      notice.textContent =
        "WarEra Plus could not start. Reload the game page after updating the extension.";
      document.body.prepend(notice);
    };
    if (document.body) show();
    else document.addEventListener("DOMContentLoaded", show, { once: true });
  }
})();
