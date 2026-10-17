/**
 * Coalesce DOM work; never let a noisy stream postpone a scan indefinitely.
 * After a quiet spell the run goes before the next paint (a frame), so rows
 * the game has just drawn get their lines in the frame they first show in
 * and never jump when the lines arrive; while the page keeps changing it runs
 * at most once every `delay` ms.
 */
export function createScheduler(
  run,
  {
    delay = 100,
    set = setTimeout,
    cancel = clearTimeout,
    frame = globalThis.requestAnimationFrame?.bind(globalThis),
    cancelFrame = globalThis.cancelAnimationFrame?.bind(globalThis),
    now = () => Date.now(),
  } = {},
) {
  let timer = null;
  let raf = null;
  let last = -Infinity;
  const fire = () => {
    timer = null;
    raf = null;
    last = now();
    run();
  };
  return {
    schedule() {
      if (timer != null || raf != null) return;
      const since = now() - last;
      if (frame && since >= delay) raf = frame(fire);
      else timer = set(fire, Math.max(0, Math.min(delay, delay - since)));
    },
    cancel() {
      if (timer != null) cancel(timer);
      if (raf != null) cancelFrame?.(raf);
      timer = null;
      raf = null;
    },
  };
}
