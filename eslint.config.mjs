import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import globals from "globals";
import { globalIgnores } from "eslint/config";
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
      "playwright/no-skipped-test": "warn",
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

  // Import boundaries. Each block repeats the "../" pattern because flat config
  // REPLACES no-restricted-imports for overlapping globs rather than merging
  // it — factoring the shared pattern into its own block silently disables it
  // everywhere a more specific block matches.
  //
  // Adding a feature means adding a block here and naming it in the others.
  // Two features make that clearer than a plugin; revisit at four.
  //
  // The first block is the floor: it matches everything under src/, so routes,
  // the proxy, and any file that declares no home at all — a future
  // src/utils.ts, a src/hooks/ directory — are governed the moment they appear
  // rather than landing beside the scheme silently. What it asks of them is
  // that a feature is reached through its barrel: a deep import pins the caller
  // to where a file happens to live, which is what the barrel exists to
  // prevent. Blocks after it narrow the floor for files that do declare a home.
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
            {
              group: ["@/features/*/*"],
              message:
                "Import a feature through its barrel: @/features/<name>.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["apps/hub/src/features/session/**/*.{ts,tsx}"],
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
            {
              group: ["@/features/actors", "@/features/actors/**"],
              message:
                "Features must not import each other. Move the shared piece to src/shared/, or into packages/identity if apps outside this repo need it too.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["apps/hub/src/features/actors/**/*.{ts,tsx}"],
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
            {
              group: ["@/features/session", "@/features/session/**"],
              message:
                "Features must not import each other. Move the shared piece to src/shared/, or into packages/identity if apps outside this repo need it too.",
            },
          ],
        },
      ],
    },
  },

  // shared/ knows nothing about any feature — the dependency rule, in the one
  // direction that must never invert.
  {
    files: ["apps/hub/src/shared/**/*.{ts,tsx}"],
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
            {
              group: ["@/features", "@/features/**"],
              message:
                "shared/ must not depend on a feature — that inverts the dependency rule. Pass what it needs in as a prop or a parameter.",
            },
          ],
        },
      ],
    },
  },

  // Layer direction: inward only. `domain` is the innermost ring and knows
  // nothing of the three outside it; `application` and `infrastructure` know
  // nothing of `presentation`. Nothing enforces this until a file breaks it,
  // and Phase 1b-ii is where the first domain/ appears — so the rules land
  // before the code they govern, not after.
  //
  // These blocks come last on purpose: each one REPLACES the broader block
  // above for the files it matches, which is why every pattern binding those
  // files is written out again here rather than inherited — except the
  // floor's barrel pattern (`@/features/*/*`), which stays there alone: a
  // feature's own files legitimately deep-import within that same feature,
  // and repeating the barrel rule here would forbid exactly that.
  {
    files: ["apps/hub/src/features/session/domain/**/*.{ts,tsx}"],
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
            {
              group: ["@/features/actors", "@/features/actors/**"],
              message:
                "Features must not import each other. Move the shared piece to src/shared/, or into packages/identity if apps outside this repo need it too.",
            },
            {
              group: [
                "@/**/application",
                "@/**/application/**",
                "@/**/infrastructure",
                "@/**/infrastructure/**",
                "@/**/presentation",
                "@/**/presentation/**",
              ],
              message:
                "domain/ is the innermost layer: it must not import application, infrastructure or presentation. Invert the dependency — take what it needs as a parameter.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["apps/hub/src/features/actors/domain/**/*.{ts,tsx}"],
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
            {
              group: ["@/features/session", "@/features/session/**"],
              message:
                "Features must not import each other. Move the shared piece to src/shared/, or into packages/identity if apps outside this repo need it too.",
            },
            {
              group: [
                "@/**/application",
                "@/**/application/**",
                "@/**/infrastructure",
                "@/**/infrastructure/**",
                "@/**/presentation",
                "@/**/presentation/**",
              ],
              message:
                "domain/ is the innermost layer: it must not import application, infrastructure or presentation. Invert the dependency — take what it needs as a parameter.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["apps/hub/src/shared/domain/**/*.{ts,tsx}"],
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
            {
              group: ["@/features", "@/features/**"],
              message:
                "shared/ must not depend on a feature — that inverts the dependency rule. Pass what it needs in as a prop or a parameter.",
            },
            {
              group: [
                "@/**/application",
                "@/**/application/**",
                "@/**/infrastructure",
                "@/**/infrastructure/**",
                "@/**/presentation",
                "@/**/presentation/**",
              ],
              message:
                "domain/ is the innermost layer: it must not import application, infrastructure or presentation. Invert the dependency — take what it needs as a parameter.",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "apps/hub/src/features/session/application/**/*.{ts,tsx}",
      "apps/hub/src/features/session/infrastructure/**/*.{ts,tsx}",
    ],
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
            {
              group: ["@/features/actors", "@/features/actors/**"],
              message:
                "Features must not import each other. Move the shared piece to src/shared/, or into packages/identity if apps outside this repo need it too.",
            },
            {
              group: ["@/**/presentation", "@/**/presentation/**"],
              message:
                "Layers point inward: application and infrastructure must not import presentation. A component that needs this should import it, not the other way round.",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "apps/hub/src/features/actors/application/**/*.{ts,tsx}",
      "apps/hub/src/features/actors/infrastructure/**/*.{ts,tsx}",
    ],
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
            {
              group: ["@/features/session", "@/features/session/**"],
              message:
                "Features must not import each other. Move the shared piece to src/shared/, or into packages/identity if apps outside this repo need it too.",
            },
            {
              group: ["@/**/presentation", "@/**/presentation/**"],
              message:
                "Layers point inward: application and infrastructure must not import presentation. A component that needs this should import it, not the other way round.",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "apps/hub/src/shared/application/**/*.{ts,tsx}",
      "apps/hub/src/shared/infrastructure/**/*.{ts,tsx}",
    ],
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
            {
              group: ["@/features", "@/features/**"],
              message:
                "shared/ must not depend on a feature — that inverts the dependency rule. Pass what it needs in as a prop or a parameter.",
            },
            {
              group: ["@/**/presentation", "@/**/presentation/**"],
              message:
                "Layers point inward: application and infrastructure must not import presentation. A component that needs this should import it, not the other way round.",
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
