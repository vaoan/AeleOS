import { defineConfig, devices } from "@playwright/test";
import { e2eTarget } from "./e2e-target";

const target = e2eTarget();

/**
 * The specs the `canvas` project owns, and the ordinary suite therefore skips.
 *
 * One constant rather than two regexes: the `testMatch` below and the
 * `testIgnore` beside it must name exactly the same files, and a spec added to
 * one and forgotten in the other either runs twice or runs nowhere.
 */
const COST_SUITE = /(canvas-performance|personalised-page-cost)\.spec\.ts/;

export default defineConfig({
  testDir: "./tests/e2e",
  // Obtains Clerk's testing token so an automated browser may sign in. It is a
  // no-op without a secret key, because most suites here are anonymous.
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: target.baseURL,
    trace: "on-first-retry",
  },
  // **Two projects, and the split is about WHEN each runs rather than how.**
  //
  // `chromium` is the ordinary suite: it runs on every pull request and must
  // stay quick enough that nobody minds. `canvas` is the cost guard, which
  // drives a real browser through every canvas in the app at the top of both
  // dials and then through a heavily personalised page on a throttled phone —
  // minutes of work whose answer almost never changes. It has its own CI job,
  // and that job only does the work when something that decides what a page
  // costs has changed; see `scripts/canvas-additions.mjs` for the trigger.
  //
  // `testIgnore` on the ordinary project is what keeps the two from both
  // running these. Without it `pnpm test:e2e` would still pick them up, since
  // Playwright matches every spec under `testDir` by default — which is exactly
  // how the frame-cost file came to be part of the `e2e` job in the first
  // place. **The two patterns have to be kept in step by hand**, so they are
  // one constant used twice rather than two regexes that can drift.
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: COST_SUITE,
    },
    {
      name: "canvas",
      use: { ...devices["Desktop Chrome"] },
      testMatch: COST_SUITE,
    },
  ],
  ...(target.startsServer
    ? {
        webServer: {
          command: "pnpm dev",
          url: target.baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }
    : {}),
});
