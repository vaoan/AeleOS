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
    //
    // `scripts/` is the opposite problem. `pastiche-pages.mjs` reads
    // `era-looks.generated.json` via `readFileSync(new URL(...,
    // import.meta.url))`, and Vite's own module runner does not give a
    // transformed module a real `file:` URL for `import.meta.url` — reading
    // through it throws `ERR_INVALID_URL_SCHEME` before a single test runs.
    // Externalizing lets Node's native ESM loader load the file directly,
    // which sets `import.meta.url` correctly. `tests/pastiche-pages.test.ts`
    // is what needs this.
    server: {
      deps: { inline: [/next-intl/], external: [/\/scripts\//] },
    },
    setupFiles: ["tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["src/features/**/*.ts", "src/shared/**/*.ts", "e2e-target.ts"],
      // src/app is excluded because a coverage number on JSX measures
      // rendering, not behaviour — and because these files are Next route
      // entry points that need a request context vitest does not have.
      //
      // **This paragraph used to say the opposite and was wrong**, which is
      // worth leaving a mark: it claimed `tests/e2e/` held `auth.spec.ts`
      // alone and that no end-to-end test had ever loaded a signed-in page.
      // Both were true when written and neither survived Clerk sign-in
      // tickets. Six specs live there now — `auth`, `signed-in`, `picker`,
      // `public-pages`, `responsive`, `a11y` — and three of them drive signed-in
      // pages with a real session.
      //
      // So these routes ARE exercised end to end. They are still excluded from
      // the coverage threshold, for the reason above and not for that one: a
      // percentage over JSX measures rendering rather than behaviour, and a
      // browser suite is not a substitute for a threshold anyway — it proves
      // the paths somebody thought to walk.
      //
      // What stands in for it is direct-call tests: fursona-list-page and
      // fursona-edit-page invoke the page functions with a mocked data layer
      // and assert the branch each one takes. They are real tests and they
      // have been red, but they are opt-in — nothing fails if the next route
      // arrives without one. Adding a branch to a page means adding a case
      // there, deliberately, because no gate will ask.
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
        // Same first rationale as src/app: a coverage number on JSX measures
        // rendering, not behaviour. These live under src/shared because they
        // carry no domain concept, not because they belong in the measured set.
        //
        // The shell and the header controls are the part auth.spec.ts really
        // does reach, anonymously, and each control also has a unit test
        // (theme-toggle, star-toggle, language-toggle). That is why the honest
        // gap named above is the signed-in routes, not this directory.
        "src/shared/presentation/**",
        "src/shared/infrastructure/fonts.ts",
        "src/shared/infrastructure/i18n/request.ts",
        // Excluded on the same JSX rationale, but with no e2e behind it at
        // all: actor-tile and fursona-form render only for a signed-in person,
        // which no end-to-end test reaches. sign-in-form is the exception —
        // auth.spec.ts asserts its providers and that it offers no password.
        //
        // **`.tsx` only, which is narrower than it was and deliberately so.**
        // The rationale above is entirely about JSX — "a coverage number on
        // JSX measures rendering, not behaviour" — and a `.ts` file in a
        // presentation directory renders nothing. `block-style.ts` is the case
        // that forced the question: it is pure data-in/data-out, it is what
        // both the public page and the editor's preview compute a style bag
        // with, and it sat unmeasured only because of where it happens to
        // live. Same argument that moved `progressValue` into
        // `domain/progress-value.ts` rather than leaving it in `blocks.tsx`.
        "src/features/*/presentation/**/*.tsx",
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
