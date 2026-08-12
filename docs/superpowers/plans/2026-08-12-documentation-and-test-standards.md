# Documentation and Test Standards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every export in this repository carries TSDoc, every error branch carries a test, every component directory carries its constraints — and each of those is enforced by a gate that fails the build rather than by good intentions.

**Architecture:** Three artefacts with no overlap. TSDoc states the contract, tests prove the behaviour, `CLAUDE.md` holds the prohibitions. Enforcement is ESLint for presence and signature drift, Vitest branch coverage for untested error paths, and a bespoke per-symbol checker for documentation that did not move when its implementation did.

**Tech Stack:** ESLint 9 flat config, `eslint-plugin-jsdoc`, `eslint-plugin-tsdoc`, Vitest v4 coverage (v8), the TypeScript compiler API, pnpm.

## Global Constraints

- **This plan follows `docs/superpowers/specs/2026-08-12-documentation-and-test-standards-design.md`.** Read it first — particularly §3, which records that the freshness check is a deliberately-adopted heuristic and why.
- **Retrofit, not forward-only.** No file is exempted. A two-tier codebase teaches that the rule is optional.
- **TSDoc states the contract, never the types.** TypeScript already has the types. Documentation that restates them is noise that will drift.
- **Constraints about an export go in its TSDoc**, not a separate file. A
  per-directory `CLAUDE.md` was in an earlier draft and was dropped before
  implementation — see the spec §2 for why. Directory notes remain optional and
  unenforced.
- **Every new gate must be proved to fail.** Break the thing it guards, watch it go red, restore. A gate never seen red is not known to work — this repository has shipped two of those already.
- **Branch from an explicit base:** `git checkout -b <name> origin/main`. Confirm with `git log --oneline origin/main..HEAD`.
- **Budget: $0.** Everything here is a dev dependency; nothing calls a paid service.
- Steps marked 🧑 are human-only.

## What this plan does NOT cover

TypeDoc or a generated documentation site, a shadcn component registry, and rolling these standards out to `libra` or `puck`. Each is named in the spec as out of scope.

## File structure

| File                                | Responsibility                             |
| ----------------------------------- | ------------------------------------------ |
| `eslint.config.mjs`                 | presence, syntax and signature-drift rules |
| `apps/hub/vitest.config.ts`         | branch coverage thresholds                 |
| `scripts/check-doc-freshness.mjs`   | per-symbol staleness detection             |
| `tests/tools/doc-freshness.test.ts` | tests for the checker itself               |
| `package.json`                      | wires both scripts into `check:tools`      |

---

### Task 1: Turn on TSDoc enforcement, and retrofit the code

Rules first, then the documentation they demand — in one change, so `main` is never in a state where the rule exists but the code violates it.

**Files:**

- Modify: `eslint.config.mjs`, `package.json`
- Modify: `apps/hub/src/lib/env.ts`, `apps/hub/src/lib/actors.ts`, `apps/hub/src/lib/supabase-server.ts`, `apps/hub/src/lib/public-routes.ts`, `apps/hub/e2e-target.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `pnpm lint` fails on any undocumented export, malformed TSDoc, empty description, or `@param` that disagrees with the signature.

- [ ] **Step 1: Install the plugins**

```bash
pnpm add -Dw eslint-plugin-jsdoc@^64 eslint-plugin-tsdoc@^0.5
```

- [ ] **Step 2: Add the rules**

In `eslint.config.mjs`, add a block scoped to TypeScript sources. It must come after any config that might disable it.

```js
import jsdoc from "eslint-plugin-jsdoc";
import tsdoc from "eslint-plugin-tsdoc";

// …inside the exported config array:
{
  files: ["**/*.ts", "**/*.tsx"],
  plugins: { jsdoc, tsdoc },
  rules: {
    // Presence: every export carries a doc comment.
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
        contexts: [
          "TSTypeAliasDeclaration",
          "TSInterfaceDeclaration",
          "VariableDeclaration > VariableDeclarator > ArrowFunctionExpression",
        ],
      },
    ],
    // Substance: a doc that says nothing is not a doc.
    "jsdoc/require-description": ["error", { checkConstructors: false }],
    "jsdoc/require-param-description": "error",
    "jsdoc/require-returns-description": "error",
    // Drift: parameters must match the signature, in order.
    "jsdoc/check-param-names": "error",
    // TypeScript already states the types; repeating them is drift waiting to happen.
    "jsdoc/no-types": "error",
    "jsdoc/require-param-type": "off",
    "jsdoc/require-returns-type": "off",
    // Valid TSDoc, not merely valid JSDoc.
    "tsdoc/syntax": "error",
  },
  settings: { jsdoc: { mode: "typescript" } },
}
```

Test files are exempt: their names are the documentation, and `it("throws when …")` says more than a doc comment would.

```js
{
  files: ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts", "tests/**"],
  rules: { "jsdoc/require-jsdoc": "off" },
}
```

- [ ] **Step 3: Run it and see the damage**

```bash
pnpm lint
```

Expected: FAIL, listing every undocumented export across the five source files. Record the count — it is the retrofit worklist.

- [ ] **Step 4: Retrofit each file**

Document the contract, not the types. For example, `apps/hub/src/lib/actors.ts`:

```ts
/**
 * A person's public actor, as exposed by the `actors_public` view.
 *
 * Never carries `owner_ref` or `identity_sub` — those are absent from the view
 * by construction, which is what makes it safe to hand to a client.
 */
export type PersonActor = {
  id: string;
  actorRef: string;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
};

/**
 * Ensures the signed-in person has an actor row, returning its `actor_ref`.
 *
 * Idempotent and safe to call on every request: the database derives the ref
 * deterministically from the identity claim, so a second call returns the
 * existing row rather than creating another.
 *
 * @throws if the RPC reports an error, or returns anything other than a
 * non-empty string — a null ref would otherwise reach the caller typed as a
 * string and render as a blank platform ID.
 */
export async function ensurePersonActor(): Promise<string> {
```

Repeat for `env.ts`, `supabase-server.ts`, `public-routes.ts` and `e2e-target.ts`. In each case say what a caller may assume, what throws, and anything security-relevant — `public-routes.ts` in particular must record that its list is the definition of what is reachable without a session.

- [ ] **Step 5: Verify**

```bash
pnpm lint && pnpm typecheck && pnpm --filter hub test
```

Expected: all exit 0, 35 tests still passing.

- [ ] **Step 6: Prove the rule bites**

Delete the doc comment above `ensurePersonActor` and run `pnpm lint`.
Expected: FAIL, `Missing JSDoc comment`. Restore it.

Then rename a parameter without touching its `@param` — in `e2e-target.ts`, change `env` to `environment` — and run `pnpm lint`.
Expected: FAIL from `check-param-names`. Restore.

- [ ] **Step 7: Commit**

```bash
git add eslint.config.mjs package.json apps/hub/src/lib apps/hub/e2e-target.ts pnpm-lock.yaml
git commit -m "feat(lint): require TSDoc on every export, and retrofit"
```

---

### Task 2: Branch coverage, so "test every error" is a gate

**Files:**

- Modify: `apps/hub/vitest.config.ts`, `apps/hub/package.json`, `package.json`

**Interfaces:**

- Consumes: the existing 35 tests.
- Produces: `pnpm --filter hub test:coverage`, failing below threshold.

- [ ] **Step 1: Install the coverage provider**

```bash
pnpm --filter hub add -D @vitest/coverage-v8
```

- [ ] **Step 2: Measure before choosing a threshold**

Add to `apps/hub/vitest.config.ts` inside `test`:

```ts
coverage: {
  provider: "v8",
  include: ["src/lib/**/*.ts", "e2e-target.ts"],
  reporter: ["text-summary"],
},
```

Then:

```bash
pnpm --filter hub exec vitest run --coverage
```

Record the actual branch percentage. **Do not guess a threshold** — set it from the measurement so it starts green and can only be ratcheted up.

- [ ] **Step 3: Set the thresholds at the measured floor**

```ts
coverage: {
  provider: "v8",
  include: ["src/lib/**/*.ts", "e2e-target.ts"],
  // UI components are excluded: they are covered by the e2e suite, and a
  // coverage number on JSX measures rendering, not behaviour.
  exclude: ["src/app/**"],
  reporter: ["text-summary"],
  thresholds: {
    // Set from the measurement in Step 2. Branches is the one that matters —
    // an untested error path is an untested branch.
    branches: 90,
    functions: 90,
    lines: 90,
    statements: 90,
  },
},
```

Adjust each number down to the measured value if it is below 90, and record in the commit message that it is a floor to be raised, not a target reached.

- [ ] **Step 4: Add the script**

`apps/hub/package.json`:

```json
"test:coverage": "vitest run --coverage"
```

Root `package.json`:

```json
"test:hub:coverage": "pnpm --filter hub test:coverage"
```

- [ ] **Step 5: Prove it bites**

Add an untested branch to `apps/hub/src/lib/actors.ts`, temporarily:

```ts
if (actorRef === "__never__") throw new Error("unreachable");
```

```bash
pnpm --filter hub test:coverage
```

Expected: FAIL on the branch threshold. Remove the line and confirm it passes again.

- [ ] **Step 6: Wire into CI**

In `.github/workflows/db-tests.yml`, the `hub` job runs `pnpm --filter hub test`. Change it to `pnpm --filter hub test:coverage` so the threshold gates pull requests.

- [ ] **Step 7: Commit**

```bash
git add apps/hub/vitest.config.ts apps/hub/package.json package.json .github/workflows/db-tests.yml pnpm-lock.yaml
git commit -m "test: gate on branch coverage so untested error paths fail"
```

---

### Task 3: The documentation freshness checker

The heuristic from spec §3. Per-symbol and normalised, because a per-file check that fires on formatting is one people learn to ignore.

**Files:**

- Create: `scripts/check-doc-freshness.mjs`
- Test: `tests/tools/doc-freshness.test.ts`

**Interfaces:**

- Consumes: git, the TypeScript compiler API.
- Produces: `extractSymbols(code: string, fileName: string): Map<string, {code: string, doc: string}>` exported for testing, and a CLI that exits non-zero when a changed export's documentation did not move.

- [ ] **Step 1: Write the failing test**

`tests/tools/doc-freshness.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  extractSymbols,
  findStale,
} from "../../scripts/check-doc-freshness.mjs";

const withDoc = (doc: string, body: string) => `
/**
 * ${doc}
 */
export function thing(a: string): string {
  ${body}
}
`;

describe("extractSymbols", () => {
  it("pairs an exported symbol with its documentation", () => {
    const s = extractSymbols(withDoc("Does a thing.", "return a;"), "x.ts");
    expect(s.has("thing")).toBe(true);
    expect(s.get("thing")?.doc).toContain("Does a thing");
  });

  it("ignores unexported symbols, which carry no contract", () => {
    const s = extractSymbols("function hidden() {}", "x.ts");
    expect(s.size).toBe(0);
  });
});

describe("findStale", () => {
  it("flags a symbol whose body changed while its doc did not", () => {
    const before = extractSymbols(withDoc("Returns a.", "return a;"), "x.ts");
    const after = extractSymbols(
      withDoc("Returns a.", "throw new Error(a);"),
      "x.ts",
    );
    expect(findStale(before, after).map((f) => f.name)).toEqual(["thing"]);
  });

  it("stays quiet when the doc moved with the code", () => {
    const before = extractSymbols(withDoc("Returns a.", "return a;"), "x.ts");
    const after = extractSymbols(
      withDoc("Throws with a.", "throw new Error(a);"),
      "x.ts",
    );
    expect(findStale(before, after)).toEqual([]);
  });

  // The mitigation that decides whether this check is usable: Prettier must
  // never trigger it.
  it("ignores reformatting that changes no behaviour", () => {
    const before = extractSymbols(withDoc("Returns a.", "return a;"), "x.ts");
    const after = extractSymbols(
      withDoc("Returns a.", "return    a;\n\n"),
      "x.ts",
    );
    expect(findStale(before, after)).toEqual([]);
  });

  it("says nothing about a symbol that did not change", () => {
    const same = withDoc("Returns a.", "return a;");
    expect(
      findStale(extractSymbols(same, "x.ts"), extractSymbols(same, "x.ts")),
    ).toEqual([]);
  });

  it("does not flag a newly added symbol — require-jsdoc owns that", () => {
    const before = extractSymbols("", "x.ts");
    const after = extractSymbols(withDoc("New.", "return a;"), "x.ts");
    expect(findStale(before, after)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run tests/tools/doc-freshness.test.ts`
Expected: FAIL — `Failed to resolve import "../../scripts/check-doc-freshness.mjs"`.

- [ ] **Step 3: Implement**

`scripts/check-doc-freshness.mjs`:

```js
/**
 * Flags exports whose implementation changed while their TSDoc did not.
 *
 * A heuristic by nature — no tool can see that prose went stale. It is adopted
 * deliberately (see the design, §3) because AI-driven development churns code
 * faster than comments. Two properties keep it usable: it reports per symbol
 * rather than per file, and it normalises whitespace so formatting never fires
 * it.
 */
import { execFileSync } from "node:child_process";
import ts from "typescript";

/** Collapses whitespace so reformatting cannot register as a change. */
const normalise = (s) => s.replace(/\s+/g, " ").trim();

/** The doc comment immediately above a node, or "" when there is none. */
function leadingDoc(node, source) {
  const ranges = ts.getLeadingCommentRanges(source.text, node.pos) ?? [];
  return ranges
    .filter((r) => source.text.slice(r.pos, r.pos + 3) === "/**")
    .map((r) => source.text.slice(r.pos, r.end))
    .join("\n");
}

const isExported = (node) =>
  node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;

function nameOf(node) {
  if (ts.isVariableStatement(node)) {
    return node.declarationList.declarations[0]?.name?.getText?.() ?? null;
  }
  return node.name?.getText?.() ?? null;
}

/**
 * Every exported top-level symbol, paired with its normalised implementation
 * and documentation.
 *
 * @returns a map of symbol name to its normalised code and doc text.
 */
export function extractSymbols(code, fileName) {
  const source = ts.createSourceFile(
    fileName,
    code,
    ts.ScriptTarget.Latest,
    true,
  );
  const out = new Map();
  source.forEachChild((node) => {
    if (!isExported(node)) return;
    const name = nameOf(node);
    if (!name) return;
    const doc = leadingDoc(node, source);
    const body = node.getText(source);
    out.set(name, { code: normalise(body), doc: normalise(doc) });
  });
  return out;
}

/**
 * Symbols present in both versions whose code moved while their doc stood still.
 *
 * New symbols are ignored: `jsdoc/require-jsdoc` already refuses an undocumented
 * export, and flagging them here would report the same problem twice.
 *
 * @returns one entry per stale symbol, in file order.
 */
export function findStale(before, after) {
  const stale = [];
  for (const [name, now] of after) {
    const then = before.get(name);
    if (!then) continue;
    if (then.code !== now.code && then.doc === now.doc) stale.push({ name });
  }
  return stale;
}

/** Reads a path at a git ref, or "" when the file did not exist there. */
function atRef(ref, file) {
  try {
    return execFileSync("git", ["show", `${ref}:${file}`], {
      encoding: "utf8",
    });
  } catch {
    return "";
  }
}

/** Entry point: compares the working tree against a base ref. */
function main() {
  const base = process.argv[2] ?? "origin/main";
  const changed = execFileSync(
    "git",
    ["diff", "--name-only", `${base}...HEAD`],
    {
      encoding: "utf8",
    },
  )
    .split("\n")
    .map((l) => l.trim())
    .filter((f) => /\.tsx?$/.test(f) && !/\.(test|spec)\.tsx?$/.test(f));

  let findings = 0;
  for (const file of changed) {
    const before = atRef(base, file);
    const after = atRef("HEAD", file);
    if (!before || !after) continue;
    for (const { name } of findStale(
      extractSymbols(before, file),
      extractSymbols(after, file),
    )) {
      findings += 1;
      console.error(
        `${file}: \`${name}\` changed but its TSDoc did not. ` +
          `Update it, or restate the invariant that still holds.`,
      );
    }
  }

  if (findings) {
    console.error(
      `\n${findings} symbol(s) with documentation that may be stale.`,
    );
    process.exit(1);
  }
  console.log("Documentation moved with the code.");
}

// Only run as a CLI, so the test can import the pure functions.
if (process.argv[1] && process.argv[1].endsWith("check-doc-freshness.mjs"))
  main();
```

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run tests/tools/doc-freshness.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Prove it against a real change**

On a scratch branch, change the body of `ensurePersonActor` without touching its doc, commit, then:

```bash
node scripts/check-doc-freshness.mjs origin/main
```

Expected: exit 1, naming `ensurePersonActor`. Then edit its doc, commit, re-run.
Expected: exit 0. Discard the scratch branch.

- [ ] **Step 6: Wire it in**

Root `package.json`:

```json
"check:docs": "node scripts/check-doc-freshness.mjs"
```

In `.github/workflows/db-tests.yml`, add to the `conformance` job after `pnpm check:tools`. It needs full history to resolve the base:

```yaml
- uses: actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09 # v5.1.0
  with:
    fetch-depth: 0
```

```yaml
- run: pnpm check:docs origin/${{ github.base_ref || 'main' }}
```

- [ ] **Step 7: Commit**

```bash
git add scripts/check-doc-freshness.mjs tests/tools/doc-freshness.test.ts package.json .github/workflows/db-tests.yml
git commit -m "feat(ci): flag exports whose docs did not move with the code"
```

---

### Task 4: Record the standards where they will be read

**Files:**

- Modify: `CLAUDE.md`

- [ ] **Step 1: Add a section**

Under `## Conventions`, before the git rules:

```markdown
- **Every export carries TSDoc, and it states the contract — not the types.**
  TypeScript has the types. Say what a caller may assume, what throws, what is
  idempotent, what is security-relevant. `pnpm lint` fails without it.
- **Every export is tested on its happy path and on each failure mode.** Branch
  coverage gates this; an untested error branch fails the build. A test that
  guards already-correct behaviour must be verified by sabotage — break the
  code, watch it go red, restore. A test never seen red proves nothing.
- **Change an implementation, move its documentation.** `pnpm check:docs`
  compares each exported symbol against the base branch and fails when the code
  moved and the TSDoc did not. It is a heuristic and it is deliberate: under
  AI-driven development a stale comment is a confident, wrong instruction.
- **Constraints about an export live in its TSDoc**, where they are enforced and
  freshness-checked. A `CLAUDE.md` beside the code is optional and unenforced —
  it is for rules constraining code that does not exist yet, which cannot attach
  to an export. TSDoc constrains what exists; a directory note constrains what
  comes next.
```

- [ ] **Step 2: Verify every gate**

```bash
pnpm lint && pnpm typecheck && pnpm format:check && pnpm secretlint && pnpm check:tools
pnpm check:docs origin/main
pnpm --filter hub test:coverage
```

Expected: all exit 0.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: record the documentation and test standards"
```

---

## Verification checklist

- [ ] `pnpm lint` fails when a doc comment is deleted from any export.
- [ ] `pnpm lint` fails when a parameter is renamed without its `@param`.
- [ ] `pnpm --filter hub test:coverage` fails when an untested branch is added.
- [ ] `pnpm check:docs` names the symbol when an implementation changes alone.
- [ ] `pnpm check:docs` stays silent when Prettier reformats a file.
- [ ] All five existing source files carry TSDoc that states contracts, not types.
- [ ] Every one of those failures was observed, not assumed.

## Follow-on work

- **The visual identity plan** (`2026-08-12-aeleos-visual-identity-design.md`) is written to these standards, which is why this lands first.
- **Raising the coverage floor.** The threshold starts at the measured value; it should ratchet up as tests are added, never down.
- **A component registry** for cross-app distribution, when a second app consumes AeleOS components.
- **Rolling the standards to `libra` and `puck`**, once proved here.
