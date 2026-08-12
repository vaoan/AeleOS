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
      include: ["src/lib/**/*.ts", "e2e-target.ts"],
      // src/app is excluded: those are React components covered by the e2e
      // suite, and a coverage number on JSX measures rendering, not behaviour.
      //
      // src/lib/fonts.ts is excluded because it cannot be executed here at all:
      // `next/font/google` is a build-time transform, so `Space_Grotesk` is not
      // a function outside Next's compiler. Covering it would mean mocking the
      // module and then asserting that the mock was called — a test of the
      // stub, not of the code. Its one real invariant, that each face still
      // exposes its CSS variable, is asserted in the e2e suite against a
      // browser, where dropping `variable:` actually shows up.
      exclude: ["src/app/**", "src/lib/fonts.ts"],
      reporter: ["text-summary"],
      // Set from the measured floor, not aspirational. It starts green and
      // ratchets up — never down. Branches is the one that matters: an
      // untested error path is an untested branch.
      //
      // Raised as covered code landed: 96/97 before the nebula, then 97/98,
      // now 98/99 with the canvas. Turning the ratchet is part of the work;
      // leaving it slack lets the next change quietly spend the headroom.
      thresholds: {
        branches: 98,
        functions: 100,
        lines: 100,
        statements: 99,
      },
    },
  },
});
