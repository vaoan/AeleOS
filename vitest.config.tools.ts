import { defineConfig } from "vitest/config";

/**
 * Tests for the repository's own tooling — the scripts that gate everything
 * else.
 *
 * A separate config because the other two are scoped to suites that need a
 * database: `tests/db` boots Supabase and `tests/idp` needs Clerk credentials.
 * Tooling tests need neither and must run everywhere, including in the
 * conformance job before any stack exists.
 */
export default defineConfig({
  test: {
    include: ["tests/tools/**/*.test.ts"],
    environment: "node",
  },
});
