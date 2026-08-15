import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import globals from "globals";
import { globalIgnores } from "eslint/config";
import boundaries from "eslint-plugin-boundaries";
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
      "testing-library/no-await-sync-queries": "error",
      "testing-library/no-dom-import": "error",
      "testing-library/prefer-screen-queries": "error",
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
      ],
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
