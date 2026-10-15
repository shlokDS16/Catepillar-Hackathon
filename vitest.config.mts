import { defineConfig } from "vitest/config";

/**
 * Root test config, for the `packages/shared` + `scripts` runs.
 *
 * `exclude`: `.claude/worktrees/` holds full checkouts of this repo for the track branches, so
 * without this a bare root run collects every test several times over — from older commits — and
 * reports failures that exist nowhere in the tree you are working on. It cost the Showable 1
 * validation a false alarm.
 *
 * `testTimeout`: several files under `scripts/` are integration tests against the SHARED Supabase
 * project in Mumbai, not local unit tests. `my_snapshot()` round-trips in ~3.7 s from here, so the
 * 5 s default failed at random — a flaky gate is worse than a slow one, because it teaches you to
 * ignore red. 30 s is the honest budget for a remote round trip.
 *
 * `fileParallelism: false`: those same files seed overlapping rows and contend for advisory lock
 * 4210001, which adds latency on top of that round trip. The database is a shared resource; one
 * file at a time is the honest way to use it.
 */
export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**", "**/.claude/worktrees/**"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
