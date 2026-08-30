import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import globals from "globals";
import { globalIgnores } from "eslint/config";
import boundaries from "eslint-plugin-boundaries";
import sonarjs from "eslint-plugin-sonarjs";
import unicorn from "eslint-plugin-unicorn";
import betterTailwindcss from "eslint-plugin-better-tailwindcss";
import nextVitals from "eslint-config-next/core-web-vitals";
import jsdoc from "eslint-plugin-jsdoc";
import tsdoc from "eslint-plugin-tsdoc";
import i18next from "eslint-plugin-i18next";
import testingLibrary from "eslint-plugin-testing-library";
import vitest from "@vitest/eslint-plugin";
import playwright from "eslint-plugin-playwright";
import unusedImports from "eslint-plugin-unused-imports";
import security from "eslint-plugin-security";

export default tseslint.config(
  // ESLint keeps its own ignore list — it does not read .gitignore. Build
  // outputs are gitignored but were still being linted, which only showed up
  // once someone ran `vercel build` locally: 4307 errors from minified bundles
  // in .vercel/output. CI never saw it because those directories do not exist
  // on a fresh checkout, so the gate was green and wrong.
  {
    ignores: [
      "node_modules/**",
      "supabase/**",
      ".superpowers/**",
      ".vercel/**",
      "**/.next/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "**/coverage/**",
      "**/dist/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // **Type-aware linting, for one rule that pays for the whole of it.**
  //
  // `@typescript-eslint/no-deprecated` reports any use of a symbol carrying a
  // `@deprecated` tag — ours, and far more usefully our DEPENDENCIES'. Nothing
  // else here can see that: a library marking an API deprecated in its own
  // types is invisible to every other check we run. The first thing it found
  // was Clerk saying that middleware path-matching "can leave protected
  // resources reachable", and the second was next-intl's whole locale API.
  //
  // It cannot work without type information, because whether a call is
  // deprecated is a property of the thing being called rather than of the text
  // calling it. `projectService` rather than a `project` array: it resolves
  // each file against the nearest tsconfig the way the editor does, so a file
  // in a new package is covered without editing a list here.
  //
  // The cost is real — lint goes from about three seconds to twelve — and it is
  // worth it for the only check that reads the whole dependency surface.
  {
    files: ["apps/*/src/**/*.{ts,tsx}", "packages/*/src/**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-deprecated": "error",
    },
  },
  prettier,
  // Node.js scripts — grant Node globals (process, console, Buffer, etc.),
  // mirroring puck's eslint.config.mjs pattern for its scripts/ directory.
  {
    files: ["scripts/**/*.{js,mjs,cjs}"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  ...nextVitals.map((config) => ({
    ...config,
    files: ["apps/hub/**/*.{ts,tsx}"],
  })),
  {
    files: ["apps/hub/**/*.{ts,tsx}"],
    settings: { next: { rootDir: "apps/hub/" } },
  },
  // Documentation standards — see
  // docs/superpowers/specs/2026-08-12-documentation-and-test-standards-design.md
  //
  // TSDoc states the contract, never the types: TypeScript already has those,
  // and a doc that repeats them is drift waiting to happen.
  {
    files: ["**/*.ts", "**/*.tsx"],
    plugins: { jsdoc, tsdoc },
    settings: { jsdoc: { mode: "typescript" } },
    rules: {
      "jsdoc/require-jsdoc": [
        "error",
        {
          publicOnly: true,
          require: {
            FunctionDeclaration: true,
            ArrowFunctionExpression: true,
            FunctionExpression: true,
            MethodDefinition: true,
            ClassDeclaration: true,
          },
          contexts: ["TSTypeAliasDeclaration", "TSInterfaceDeclaration"],
        },
      ],
      "jsdoc/require-description": ["error", { checkConstructors: false }],
      // Without require-param, check-param-names has nothing to compare and the
      // drift guard is toothless — found by probing it and getting no failure.
      "jsdoc/require-param": "error",
      "jsdoc/require-param-description": "error",
      "jsdoc/require-returns-description": "error",
      // Signature drift: a renamed or reordered parameter fails until the doc
      // follows it. This is the one piece of staleness a tool can detect exactly.
      "jsdoc/check-param-names": "error",
      "jsdoc/no-types": "error",
      "jsdoc/require-param-type": "off",
      "jsdoc/require-returns-type": "off",
      "tsdoc/syntax": "error",
    },
  },
  // React components: destructured props yield `@param root0.children`, which
  // is noise — the props type already says it. The component still needs a doc.
  {
    files: ["**/*.tsx"],
    rules: { "jsdoc/require-param": "off" },
  },
  // Tests document themselves: `it("throws when the row is incomplete")` says
  // more than a doc comment above it would.
  {
    files: [
      "**/*.test.ts",
      "**/*.test.tsx",
      "**/*.spec.ts",
      "tests/**",
      "**/tests/**",
    ],
    rules: {
      "jsdoc/require-jsdoc": "off",
      "jsdoc/require-param": "off",
      "jsdoc/require-returns-description": "off",
    },
  },
  // ==========================================================================
  // Rules adopted from Libra (`Z:\Github\libra/eslint.config.mjs`).
  //
  // A subset, not a copy. Libra's config is 1600 lines and much of it encodes
  // that repo's own shape — `boundaries` between its feature folders, TanStack
  // Query, its `packages/*` layout. Those would fail here or, worse, pass while
  // guarding nothing. What follows is the portion that transfers.
  // ==========================================================================

  // Accessibility. The design commits to measurable contrast and target sizes;
  // these are the parts of that promise a linter can hold.
  {
    // The plugin itself comes from eslint-config-next; registering it again is
    // a config error, so only the rules are set here.
    files: ["apps/hub/src/**/*.tsx"],
    rules: {
      "jsx-a11y/alt-text": "error",
      "jsx-a11y/aria-props": "error",
      "jsx-a11y/aria-proptypes": "error",
      "jsx-a11y/aria-role": "error",
      "jsx-a11y/aria-unsupported-elements": "error",
      "jsx-a11y/heading-has-content": "error",
      "jsx-a11y/label-has-associated-control": "error",
      "jsx-a11y/interactive-supports-focus": "error",
      "jsx-a11y/click-events-have-key-events": "error",
      "jsx-a11y/no-static-element-interactions": "error",
      "jsx-a11y/no-noninteractive-element-interactions": "warn",
      "jsx-a11y/anchor-is-valid": "error",
      "jsx-a11y/no-autofocus": "error",
    },
  },

  // Copy belongs in the catalogue, not in a component. Now that the hub ships
  // two languages, a literal string in JSX is a string one of them will never
  // get — and it is invisible until somebody browsing in the other language
  // reports it.
  {
    files: ["apps/hub/src/**/*.tsx"],
    plugins: { i18next },
    rules: {
      "i18next/no-literal-string": [
        "error",
        {
          mode: "jsx-text-only",
          "should-validate-template": true,
          "jsx-attributes": {
            include: ["alt", "aria-label", "aria-placeholder", "title"],
          },
          // Proper nouns and symbols that read the same in every language.
          // Everything else in JSX has to come from the catalogue. "@" is a
          // handle prefix, not language text — allowlisting it here keeps
          // that judgment in one auditable place instead of a suppression
          // comment at every call site that renders a handle.
          words: { exclude: ["AeleOS", "Furry Colombia", "@"] },
        },
      ],
    },
  },

  // React and DOM discipline.
  {
    files: ["apps/hub/src/**/*.{ts,tsx}"],
    plugins: { security, "unused-imports": unusedImports },
    rules: {
      "react/button-has-type": "error",
      "react/no-array-index-key": "error",
      // querySelector bypasses React's rendering model and breaks under SSR and
      // concurrent rendering. Use a ref.
      "no-restricted-properties": [
        "error",
        {
          object: "document",
          property: "querySelector",
          message: "Avoid document.querySelector — use a React ref.",
        },
        {
          object: "document",
          property: "querySelectorAll",
          message: "Avoid document.querySelectorAll — use a React ref.",
        },
      ],
      "no-console": ["error", { allow: ["warn", "error"] }],
      "unused-imports/no-unused-imports": "error",
      "security/detect-unsafe-regex": "error",
      "security/detect-eval-with-expression": "error",
    },
  },

  // Unit tests.
  {
    files: ["**/*.test.{ts,tsx}"],
    plugins: { vitest, "testing-library": testingLibrary },
    rules: {
      "vitest/no-focused-tests": "error",
      "vitest/no-disabled-tests": "warn",
      "vitest/no-identical-title": "error",
      "vitest/valid-expect": "error",
      "vitest/expect-expect": "error",
      // **These four are about a test that cannot fail rather than a test that
      // fails.** That is the worse of the two: a red test is a message, a test
      // that silently asserts nothing is a green tick nobody has earned.
      //
      // An `expect` inside an `if` runs only when the branch does, so a
      // condition that stops being true takes the assertion with it and says
      // nothing. An `expect` outside a test body never runs at all. A
      // `describe` given an async callback resolves after the suite is
      // collected, so the tests inside it are never registered.
      "vitest/no-conditional-expect": "error",
      "vitest/no-standalone-expect": "error",
      "vitest/require-to-throw-message": "off",
      "vitest/valid-describe-callback": "error",
      // A commented-out test is a test nobody is running and nobody can see is
      // not running.
      "vitest/no-commented-out-tests": "warn",
      "testing-library/no-await-sync-queries": "error",
      "testing-library/no-dom-import": "error",
      "testing-library/prefer-screen-queries": "error",
      // **The flakiest thing a component test can do is forget an `await`.**
      // `findBy*` and `waitFor` return promises; unawaited, the assertion
      // inside them is scheduled and the test ends before it runs — passing
      // whatever the component did. These three make that a build failure.
      "testing-library/await-async-queries": "error",
      "testing-library/await-async-utils": "error",
      "testing-library/no-unnecessary-act": "error",
      // `waitFor(() => getBy...)` retries a throwing query on a timer;
      // `findBy` is the same thing with the retry built in and a real error
      // message when it gives up.
      "testing-library/prefer-find-by": "error",
      //
      // **`no-wait-for-multiple-assertions` and `no-wait-for-side-effects` are
      // deliberately NOT here, and that is a finding rather than an omission.**
      // Both were enabled, and neither reported the canonical violation from
      // its own documentation — two `expect` calls in one `waitFor` callback,
      // `waitFor` imported from `@testing-library/react`, in a file the plugin
      // is otherwise linting, with `--print-config` confirming both rules
      // resolved to "error". The sibling rules fired on the same file, so this
      // is not detection: `prefer-find-by` and `await-async-queries` both
      // caught their probes.
      //
      // A rule that cannot be shown to fire is indistinguishable from one that
      // is off, and carrying it reads as protection nobody has. This repository
      // has already found three linters silently doing nothing; the answer then
      // was to introduce a violation and watch it fail, and the answer here is
      // the same. If a later version of the plugin makes them work, they are
      // worth having — the flakiness they describe is real.
    },
  },

  // End-to-end tests. Two rules, both learned the hard way in Libra:
  //
  // 1. Select by test id. Role, text, label and placeholder queries all couple
  //    a test to the words on screen, so shipping a translation breaks the
  //    suite. This repo already had the smell — a selector matching
  //    /nebula|nebulosa/ to survive both languages.
  // 2. Do not assert exact text, for the same reason.
  //
  // The accessible name still matters and is still asserted — in the unit
  // tests, where the component is rendered in one known language.
  {
    files: ["**/e2e/**/*.{ts,tsx}"],
    plugins: { playwright },
    rules: {
      "playwright/no-focused-test": "error",
      // Conditional skips are allowed; unconditional ones are not. The
      // signed-in suite needs a Clerk secret key, and most suites here need
      // none — a fork pull request has no secrets at all, so `test.skip(!creds)`
      // is what keeps the anonymous majority runnable instead of failing. It is
      // the same reason `tests/db` and `tests/idp` use `describe.skipIf`. A
      // skip somebody wrote to silence a failure is still a warning.
      "playwright/no-skipped-test": ["warn", { allowConditional: true }],
      // Timeouts are a guess about how slow a machine is. Wait for a condition.
      "playwright/no-wait-for-timeout": "error",
      "playwright/no-element-handle": "error",
      "playwright/no-eval": "off",
      // **The rest of this block is one subject: a browser test is flaky
      // unless every wait is a condition and every assertion retries.**
      //
      // `prefer-web-first-assertions` is the biggest of them.
      // `expect(await locator.textContent()).toBe(x)` samples the page ONCE, so
      // it fails whenever the assertion happens to arrive first;
      // `expect(locator).toHaveText(x)` polls until it is true or the timeout
      // expires. The two look alike and behave nothing alike.
      "playwright/prefer-web-first-assertions": "error",
      // `networkidle` waits for the network to go quiet for half a second,
      // which an app with polling or analytics never does — Playwright's own
      // documentation discourages it.
      "playwright/no-networkidle": "error",
      // `{ force: true }` skips the actionability checks, which is to say it
      // skips the part that waits for the element to be ready. It converts a
      // flaky failure into a silent click on nothing.
      "playwright/no-force-option": "error",
      // A `page.pause()` left behind hangs CI until the job times out.
      "playwright/no-page-pause": "error",
      // Awaiting something that is not a promise means somebody expected a
      // wait that is not happening.
      "playwright/no-useless-await": "error",
      "playwright/no-useless-not": "error",
      // The same "cannot fail" family as the vitest rules above.
      "playwright/no-conditional-expect": "error",
      "playwright/no-standalone-expect": "error",
      "playwright/expect-expect": "error",
      "playwright/valid-expect": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.property.name=/^(getByRole|getAllByRole|queryByRole|queryAllByRole|findByRole|findAllByRole)$/]",
          message:
            "Use getByTestId in E2E tests. Role queries couple the test to the accessible name, which is translated.",
        },
        {
          selector:
            "CallExpression[callee.property.name=/^(getByText|getAllByText|queryByText|queryAllByText|findByText|findAllByText)$/]",
          message:
            "Use getByTestId in E2E tests. Text queries break the moment a string is translated.",
        },
        {
          selector:
            "CallExpression[callee.property.name=/^(getByLabel|getByLabelText|getByPlaceholder|getByPlaceholderText)$/]",
          message:
            "Use getByTestId in E2E tests. Labels and placeholders are translated.",
        },
        {
          selector: "CallExpression[callee.property.name='toContainText']",
          message:
            "Do not assert translated text in E2E tests. Use toBeVisible().",
        },
        {
          selector: "CallExpression[callee.property.name='toHaveText']",
          message:
            "Do not assert translated text in E2E tests. Use toBeVisible().",
        },
        {
          selector:
            "CallExpression[callee.property.name='locator'] Literal[value=/data-testid/]",
          message:
            "Use page.getByTestId('id') rather than a raw attribute selector.",
        },
        {
          // `playwright/no-wait-for-timeout` above already bans
          // `page.waitForTimeout(ms)`. This bans the manual equivalent — an
          // unconditional `setTimeout` wrapped in a `Promise` — which is the
          // same guess about how slow a machine is, spelled out by hand
          // instead of through the banned method. Wait for a real condition
          // (`expect.poll`, `waitForFunction`, a support helper) instead. A
          // genuinely justified exception — an ordering fix like
          // `support/drag.ts`'s documented rAF-then-timer sequencing, or a
          // measurement that paces itself to a wall-clock cadence — gets a
          // targeted `eslint-disable-next-line` naming which and why, not a
          // file excluded from this rule.
          selector:
            "NewExpression[callee.name='Promise'] CallExpression[callee.name='setTimeout']",
          message:
            "No unconditional setTimeout-based waits. Wait for a condition, or justify this exact line with eslint-disable-next-line and a comment.",
        },
      ],
    },
  },

  // The retry module's own test is not under `e2e/`, but it is exactly the
  // code the rule above exists for: a backoff sleep is the same guess about
  // machine speed whether it lives in a spec or in the helper a spec imports.
  {
    files: ["apps/hub/tests/retry-fetch.test.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "NewExpression[callee.name='Promise'] CallExpression[callee.name='setTimeout']",
          message:
            "No unconditional setTimeout-based waits. Wait for a condition, or justify this exact line with eslint-disable-next-line and a comment.",
        },
      ],
    },
  },

  {
    ...betterTailwindcss.configs["recommended"],
    files: ["apps/hub/src/**/*.{ts,tsx}"],
    settings: {
      "better-tailwindcss": { entryPoint: "apps/hub/src/app/globals.css" },
    },
    rules: {
      ...betterTailwindcss.configs["recommended"].rules,
      // Off because it fights Prettier, which owns formatting here and has the
      // final word: the two rewrap the same strings differently and each
      // undoes the other on the next run.
      "better-tailwindcss/enforce-consistent-line-wrapping": "off",
    },
  },

  {
    files: ["apps/hub/src/**/*.{ts,tsx}", "packages/*/src/**/*.{ts,tsx}"],
    plugins: { sonarjs, unicorn },
    rules: {
      ...sonarjs.configs.recommended.rules,
      ...unicorn.configs["flat/recommended"].rules,

      // **Off, because this codebase cannot express the thing it prevents.**
      // It wants `Readonly<Props>` on every component, which stops a component
      // mutating its own props OBJECT. Counted: 56 components destructure in
      // the signature and 0 take `props` whole, so there is no props object in
      // scope to mutate — and 0 assignments to a props member exist anywhere.
      //
      // `Readonly` is shallow as well, so even where it applied it would catch
      // `props.x = 1` and not `props.items.push(…)` or `props.actor.handle =
      // "…"` — the mutations that would actually hurt.
      //
      // Fifty-seven signatures and as many contract docs, to guard a pattern
      // nobody can write here against a check that would miss the dangerous
      // form. If components ever start taking `props` whole, revisit this.
      "sonarjs/prefer-read-only-props": "off",

      // `@typescript-eslint/no-deprecated` reports the same findings with the
      // same type information. One voice per finding: two rules flagging the
      // same call is how people learn to read past both.
      "sonarjs/deprecation": "off",

      // **`null` is a value this domain means.** Postgres columns are nullable,
      // `parseTheme` returns null for "the author picked nothing", and
      // `displayName: null` is different from `displayName: ""` — one is unset
      // and the other is empty. The rule wants `undefined` everywhere, which
      // would erase that distinction at exactly the boundary where it matters,
      // between a row and a form. Both sister repos turn it off too.
      "unicorn/no-null": "off",

      // **Off, because its autofix broke the auth gate.**
      //
      // It rewrote the middleware `matcher` — the regular expression deciding
      // which requests Clerk even sees — into a `String.raw` template. Next
      // reads that config STATICALLY, so a tagged template is not a value it
      // can read at all: `next build` refused the whole app with "Invalid
      // segment configuration export detected", naming no file.
      //
      // The rule is reasonable in general and wrong for anything a build tool
      // parses rather than executes. It fired in exactly one place, and that
      // place was the one where a silent failure would have meant routes going
      // ungated. Nothing here is worth the escape it saves.
      "unicorn/prefer-string-raw": "off",

      // **Prettier lowercases hex digits and this rule wants them upper.**
      // Left at its default the two fought: the fix ran, Prettier undid it,
      // and the next lint reported the same four literals again. Prettier is
      // the formatter of record here — pre-commit runs `--check` — so the rule
      // is told which case that is rather than being turned off.
      "unicorn/number-literal-case": [
        "error",
        { hexadecimalValue: "lowercase" },
      ],

      // **Calibrated, not silenced.** Two functions exceed the default 15:
      // the row, which is one element with six conditional controls, and the
      // canvas effect, whose shape is argued for in the actors note — a record
      // of renderers keyed by name, deliberately not a chain of branches. Both
      // are wide rather than deep, which is the kind of complexity this metric
      // scores badly and readers do not. 20 still catches a genuine tangle.
      "sonarjs/cognitive-complexity": ["error", 20],

      // **`| 0` here is an int32 COERCION, not a truncation.** It feeds
      // `Math.imul` in the hash and the xorshift, where 32-bit wrap-around is
      // the point; `Math.trunc` does not wrap, so the rule's replacement is a
      // different function that happens to agree on the values we pass today.
      // A rule that is right in general and wrong in the only place it fires.
      "unicorn/prefer-math-trunc": "off",

      // **A handler defined inside a list callback is React's own idiom.**
      // Every finding is an `onPin`/`onRemove` prop inside a `.map()`, where
      // hoisting means either a component per row or a factory that closes
      // over the same values by hand. The rule is about deeply nested logic;
      // JSX props are not that.
      "sonarjs/no-nested-functions": "off",

      // **Separators help a decimal and hurt a hex constant.** `100_000` reads
      // better than `100000`; `0x9e_37_79_b9` reads worse than `0x9e3779b9`,
      // which is a constant people recognise on sight — it is the golden ratio
      // the xorshift seeds from. The autofix rewrote four of those before this
      // was noticed. Decimals keep the rule; hex keeps its shape unless
      // somebody deliberately groups it.
      "unicorn/numeric-separators-style": [
        "error",
        { hexadecimal: { onlyIfContainsSeparator: true } },
      ],

      // Renames `props` to `properties`, `ref` to `reference`, `params` to
      // `parameters` — including the ones React and Next define. A convention
      // this app does not own is not a convention it should paraphrase.
      "unicorn/prevent-abbreviations": "off",
    },
  },

  globalIgnores(["apps/hub/.next/**", "apps/hub/next-env.d.ts"]),

  // **The architecture, declared once as a graph rather than repeated as path
  // patterns.**
  //
  // This was ~390 lines of `no-restricted-imports` blocks, one per feature per
  // layer, each restating every pattern that still bound its files — because
  // flat config REPLACES that rule for overlapping globs instead of merging it.
  // The note that used to sit here said so out loud: a new block that forgets a
  // pattern it still owes is a silently disabled rule. Adding a fourth feature
  // meant editing nine blocks correctly or quietly losing a boundary, and
  // nothing would have reported the loss.
  //
  // `boundaries` states the same rules as a graph over named element types, so
  // a feature is added by naming it — the rules already cover it — and nothing
  // is repeated for the cascade to swallow. The sister repos use it; their
  // graph is looser (they let features import each other), so this expresses
  // our rules in their tool rather than copying their rules.
  //
  // Two things here have no equivalent in what they replace. `default:
  // "disallow"` inverts the old blocks, which listed what was forbidden and so
  // failed OPEN when a pattern was forgotten. And `no-unknown-files` means a
  // file that declares no home at all fails, rather than landing beside the
  // scheme and being governed by whichever glob happened to match it.
  {
    files: ["apps/hub/src/**/*.{ts,tsx}", "packages/*/src/**/*.{ts,tsx}"],
    plugins: { boundaries },
    settings: {
      // **Without this the graph is decorative.** `boundaries` asks the
      // `import/resolver` settings where a specifier points, and with none
      // configured `./client` inside the package did not resolve at all — it
      // came back an unknown element. An import the rule cannot place is an
      // import it cannot police, which is the same failure as a disabled rule
      // wearing a different hat. The TypeScript resolver reads the `paths` the
      // compiler reads, so `@/` means here what it means everywhere else.
      "import/resolver": {
        typescript: {
          alwaysTryTypes: true,
          noWarnOnMultipleProjects: true,
          project: ["apps/*/tsconfig.json", "packages/*/tsconfig.json"],
        },
      },
      // Patterns are matched against a file's FOLDER unless `mode: "file"` says
      // otherwise, which is why these stop at the layer directory rather than
      // reaching down to the file. Order matters — the first pattern that
      // matches names the element — so the barrel is listed before the feature
      // it belongs to, even though the two cannot overlap today.
      "boundaries/elements": [
        { type: "proxy", mode: "file", pattern: "apps/hub/src/proxy.ts" },
        {
          type: "feature-barrel",
          mode: "file",
          pattern: "apps/hub/src/features/*/index.ts",
          capture: ["feature"],
        },
        {
          type: "feature",
          pattern: "apps/hub/src/features/*/*",
          capture: ["feature", "layer"],
        },
        {
          type: "shared",
          pattern: "apps/hub/src/shared/*",
          capture: ["layer"],
        },
        { type: "app", pattern: ["apps/hub/src/app", "apps/hub/src/app/**"] },
        {
          type: "identity",
          pattern: ["packages/identity/src", "packages/identity/src/**"],
        },
      ],
    },
    rules: {
      "boundaries/no-unknown-files": "error",
      "boundaries/no-unknown": "error",
      // `boundaries/dependencies`, not `element-types`: v6 renamed it and warns
      // on every run otherwise, and a deprecation printed on every lint is one
      // nobody reads by the second week.
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          message:
            "{{ from.type }} must not import {{ to.type }}. See docs/superpowers/specs/2026-08-12-hub-layering-and-contract-seam-design.md.",
          rules: [
            // A route is a thin wrapper. It reaches a feature through the
            // barrel and never past it: a deep import pins the caller to where
            // a file happens to live, which is what the barrel exists to stop.
            {
              from: { type: "app" },
              allow: {
                to: { type: ["app", "feature-barrel", "shared", "identity"] },
              },
            },
            // The proxy runs before any of it and needs the session's route
            // test. The same barrel rule applies.
            {
              from: { type: "proxy" },
              allow: { to: { type: ["feature-barrel", "shared"] } },
            },
            // A barrel may reach into its OWN feature and nobody else's.
            {
              from: { type: "feature-barrel" },
              allow: {
                to: [
                  {
                    type: "feature",
                    captured: { feature: "{{ from.captured.feature }}" },
                  },
                  { type: ["shared", "identity"] },
                ],
              },
            },
            // domain/ is the innermost ring: its own feature's domain, and
            // shared's. Never application, infrastructure or presentation.
            {
              from: { type: "feature", captured: { layer: "domain" } },
              allow: {
                to: [
                  {
                    type: "feature",
                    captured: {
                      feature: "{{ from.captured.feature }}",
                      layer: "domain",
                    },
                  },
                  { type: "shared", captured: { layer: "domain" } },
                  { type: "identity" },
                ],
              },
            },
            // application/ and infrastructure/ point inward and sideways —
            // never out to presentation. A component that needs one of these
            // imports it, not the other way round.
            {
              from: {
                type: "feature",
                captured: [
                  { layer: "application" },
                  { layer: "infrastructure" },
                ],
              },
              allow: {
                to: [
                  {
                    type: "feature",
                    captured: [
                      {
                        feature: "{{ from.captured.feature }}",
                        layer: "domain",
                      },
                      {
                        feature: "{{ from.captured.feature }}",
                        layer: "application",
                      },
                      {
                        feature: "{{ from.captured.feature }}",
                        layer: "infrastructure",
                      },
                    ],
                  },
                  {
                    type: "shared",
                    captured: [
                      { layer: "domain" },
                      { layer: "application" },
                      { layer: "infrastructure" },
                    ],
                  },
                  { type: "identity" },
                ],
              },
            },
            // presentation/ is outermost: anything in its own feature, and
            // anything shared.
            {
              from: { type: "feature", captured: { layer: "presentation" } },
              allow: {
                to: [
                  {
                    type: "feature",
                    captured: { feature: "{{ from.captured.feature }}" },
                  },
                  { type: ["shared", "identity"] },
                ],
              },
            },
            // shared/ knows nothing about any feature — the dependency rule in
            // the one direction that must never invert. Its own layers point
            // inward exactly as a feature's do.
            {
              from: { type: "shared", captured: { layer: "domain" } },
              allow: {
                to: [
                  { type: "shared", captured: { layer: "domain" } },
                  { type: "identity" },
                ],
              },
            },
            {
              from: {
                type: "shared",
                captured: [
                  { layer: "application" },
                  { layer: "infrastructure" },
                ],
              },
              allow: {
                to: [
                  {
                    type: "shared",
                    captured: [
                      { layer: "domain" },
                      { layer: "application" },
                      { layer: "infrastructure" },
                    ],
                  },
                  { type: "identity" },
                ],
              },
            },
            {
              from: { type: "shared", captured: { layer: "presentation" } },
              allow: { to: { type: ["shared", "identity"] } },
            },
            // The package is the outermost boundary of all: it knows itself.
            // What it must never know — an app, or a framework — is the
            // `no-restricted-imports` block below, because those are module
            // names rather than elements of this graph.
            {
              from: { type: "identity" },
              allow: { to: { type: "identity" } },
            },
          ],
        },
      ],
    },
  },

  // The one import rule `boundaries` does not express, and it binds every file
  // the same way, so it is written once rather than nine times. A `../` chain
  // says where a file sits rather than what it depends on, and it breaks the
  // moment either of them moves.
  {
    files: ["apps/hub/src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["../*"],
              message:
                "Reach sideways with an absolute @/ import. A ../ chain breaks the moment a file moves.",
            },
          ],
        },
      ],
    },
  },

  // A package knows nothing about any app, and nothing about any framework.
  //
  // The first rule is the boundary that lets packages/identity be published to
  // repositories that have no apps/hub. The second is the one the package's
  // whole design rests on, and until it was written the property held only by
  // accident: Clerk, Next and React are unresolvable from the package's
  // node_modules today, so a forbidden import failed to resolve rather than
  // failing to lint — one `pnpm add` away from passing every gate green.
  {
    files: ["packages/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/*", "**/apps/**"],
              message:
                "Packages must not depend on apps. Dependencies flow one way: apps import packages.",
            },
            {
              group: [
                "@clerk/*",
                "@clerk/*/**",
                "next",
                "next/*",
                "next/*/**",
                "react",
                "react-dom",
                "react-dom/*",
              ],
              message:
                "This package must never learn which provider issued the token, nor which framework renders it. Take it as a parameter instead — that is what keeps swapping the issuer a one-column identity_sub backfill rather than a change to every app on the platform.",
            },
          ],
        },
      ],
    },
  },
);
