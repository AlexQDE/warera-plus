import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["extension/**/*.test.mjs"],
    // each file in a fresh vm context of a reused worker: its own globals and DOM as under forks, without a
    // process spawned and jsdom loaded for every file (about half the run)
    pool: "vmForks",
    // four test processes at most: the limit on the development machine, and a GitHub runner's four cores
    maxWorkers: 4,
  },
});
