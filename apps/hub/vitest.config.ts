import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts", "e2e-target.ts"],
      // src/app is excluded: those are React components covered by the e2e
      // suite, and a coverage number on JSX measures rendering, not behaviour.
      exclude: ["src/app/**"],
      reporter: ["text-summary"],
      // Set from the measured floor (96.42% branches at the time of writing),
      // not aspirational. It starts green and ratchets up — never down.
      // Branches is the one that matters: an untested error path is an
      // untested branch.
      thresholds: {
        branches: 96,
        functions: 100,
        lines: 100,
        statements: 97,
      },
    },
  },
});
