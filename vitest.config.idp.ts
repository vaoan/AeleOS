import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["tests/idp/global-setup.ts"],
    include: ["tests/idp/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
