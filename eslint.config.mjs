import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import globals from "globals";
import { globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import jsdoc from "eslint-plugin-jsdoc";
import tsdoc from "eslint-plugin-tsdoc";

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
  globalIgnores(["apps/hub/.next/**", "apps/hub/next-env.d.ts"]),
);
