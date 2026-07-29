import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["tests/db/global-setup.ts"],
    include: ["tests/db/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
