import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import globals from "globals";
import { globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

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
  globalIgnores(["apps/hub/.next/**", "apps/hub/next-env.d.ts"]),
);
