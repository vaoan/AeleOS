import { defineConfig, devices } from "@playwright/test";
import { e2eTarget } from "./e2e-target";

const target = e2eTarget();

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
  // stay quick enough that nobody minds. `canvas` is the frame-cost guard,
  // which drives a real browser through every canvas in the app at the top of
  // both dials — minutes of work whose answer almost never changes. It has its
  // own CI job, and that job only does the work when a canvas has been ADDED;
  // see `scripts/canvas-additions.mjs` for why that trigger and what it misses.
  //
  // `testIgnore` on the ordinary project is what keeps the two from both
  // running it. Without it `pnpm test:e2e` would still pick the file up, since
  // Playwright matches every spec under `testDir` by default — which is exactly
  // how it came to be part of the `e2e` job in the first place.
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: /canvas-performance\.spec\.ts/,
    },
    {
      name: "canvas",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /canvas-performance\.spec\.ts/,
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
