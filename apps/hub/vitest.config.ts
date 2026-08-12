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
    // next-intl's ESM build imports "next/navigation" without an extension,
    // which Vite cannot resolve from inside pnpm's nested store. Inlining it
    // makes Vite process the package and resolve the import the way Next does.
    server: { deps: { inline: [/next-intl/] } },
    setupFiles: ["tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["src/features/**/*.ts", "src/shared/**/*.ts", "e2e-target.ts"],
      // src/app is excluded: those are React components covered by the e2e
      // suite, and a coverage number on JSX measures rendering, not behaviour.
      //
      // fonts.ts is excluded because it cannot be executed here at all:
      // `next/font/google` is a build-time transform, so `Space_Grotesk` is not
      // a function outside Next's compiler. Covering it would mean mocking the
      // module and then asserting that the mock was called — a test of the
      // stub, not of the code. Its one real invariant, that each face still
      // exposes its CSS variable, is asserted in the e2e suite against a
      // browser, where dropping `variable:` actually shows up.
      //
      // i18n/request.ts is excluded for the same reason: it's next-intl's
      // `getRequestConfig` callback, invoked by the plugin inside a Next
      // request context that doesn't exist under vitest.
      exclude: [
        "src/app/**",
        // Same rationale as src/app: these are React components exercised by
        // the e2e suite, and a coverage number on JSX measures rendering, not
        // behaviour. They live under src/shared because they carry no domain
        // concept, not because they belong in the coverage-measured set.
        "src/shared/presentation/**",
        "src/shared/infrastructure/fonts.ts",
        "src/shared/infrastructure/i18n/request.ts",
        "src/features/*/presentation/**",
        "src/features/*/index.ts",
      ],
      reporter: ["text-summary"],
      // Set from the measured floor, not aspirational. It starts green and
      // ratchets up — never down. Branches is the one that matters: an
      // untested error path is an untested branch.
      //
      // Raised as covered code landed: 96/97 before the nebula, then 97/98,
      // then 98/99 with the canvas, and now 100 on all four. Adopting
      // @aeleos/identity moved the branching failure modes into the package,
      // leaving the hub only adapters — so the floor here is total. Turning the
      // ratchet is part of the work; leaving it slack lets the next change
      // quietly spend the headroom.
      thresholds: {
        branches: 100,
        functions: 100,
        lines: 100,
        statements: 100,
      },
    },
  },
});
