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
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
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
