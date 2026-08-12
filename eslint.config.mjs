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
          // Proper nouns read the same in every language. Everything else in
          // JSX has to come from the catalogue.
          words: { exclude: ["AeleOS", "Furry Colombia"] },
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
);
