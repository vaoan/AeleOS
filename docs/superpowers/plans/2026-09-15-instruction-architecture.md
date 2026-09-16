# Instruction Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every rule this repository paid for keeps binding, and the
always-loaded instruction file drops from 240 KB to a map under 200 lines.

**Architecture:** Separate each rule from the incident that produced it. The
rule (one imperative sentence plus a link) lives where it loads only when
relevant: a short root `CLAUDE.md` for invariants, `.claude/rules/*.md` with
`paths:` globs for everything tied to particular files, skills for
procedures. The narratives move verbatim into `docs/lessons/` and
`HISTORY.md` files that are read on demand and never imported. Two gates
change: `check:agent-notes` learns `paths:` so a rule file is guarded like a
directory note, and a temporary `check:lessons-preserved` proves no paragraph
was dropped during the move. An `InstructionsLoaded` hook measures the cost
before and after.

**Tech Stack:** Node 24 (`path.posix.matchesGlob`, no glob dependency),
plain `.mjs` scripts with `.d.mts` declarations and Vitest tests under
`tests/tools/` (the shape every `scripts/check-*.mjs` gate already has),
Claude Code hooks, rules and skills as documented at
`code.claude.com/docs/en/{hooks,memory,skills}`.

**Spec:** `docs/superpowers/specs/2026-09-15-instruction-architecture-design.md`

## Global Constraints

- **Nothing is deleted.** Every paragraph of the pre-move root `CLAUDE.md`
  and of the four actors notes exists verbatim somewhere in the tree until the
  final task retires the guard that proves it.
- **Each phase is its own branch and pull request**, cut from `origin/main`
  with `git checkout -b <name> origin/main`, in the order below. The next
  phase starts only after the previous one has merged.
- **The root `CLAUDE.md` is valid at every commit.** Every step that removes
  something from it leaves a working pointer in its place.
- **Rule numbers are preserved.** Root rule 30 stays rule 30: its file is
  `docs/lessons/rules/30-*.md`, and every existing citation of "root rule N"
  in code, TSDoc and notes resolves through the root's own sentence saying so.
- **Every export carries TSDoc stating the contract**; `pnpm lint` from the
  repository root fails without it. Never lint from `apps/hub`.
- **Every gate is shown to fail before it is believed** (root rule 1): each
  new check is sabotage-verified and the failing run's output is in the task.
- **No new dependencies.** Globs use `path.posix.matchesGlob` (Node ≥ 24 per
  `engines`); frontmatter is read by a line parser that understands only the
  `paths:` list form the docs show.
- **Filenames are kebab-case** (`.ls-lint.yml` checks `scripts/` and
  `tests/`; `docs/` and `.claude/` are ignored by it but follow the same
  convention).
- **`check:tools` runs cspell over `**/*.{ts,tsx,md,json}`**, so every new
  Markdown file is spell-checked on the day it lands. A real name goes in
  `cspell.json`'s `words` with a comment; a coinage is reworded (root rule
  41/42).
- **Write escape-bearing content with the Write or Edit tool, never through
  a shell string**: this harness halves doubled backslashes in Bash commands
  (root rule 28, 2026-09-15). Count newlines of any prose file a script
  touched before trusting it.
- **Hooks run under `sh` with `$CLAUDE_PROJECT_DIR` set**; every hook command
  is `node "$CLAUDE_PROJECT_DIR/scripts/<name>.mjs"` so it works on Windows
  through Git Bash and on the Linux runner alike.
- **Commit messages end with** `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`
  and every `git`/`gh` call uses the PAT in `.secrets` with identity from
  `gh api user` (`docs/git-with-gh-token.md`).

---

## File structure

| Path                                                   | Responsibility                                                                                                                                                                            |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/hook-log-instructions.mjs` (+ `.d.mts`)       | `InstructionsLoaded` hook: appends one JSON line per loaded instruction file to `.claude/instructions-log/<session>.jsonl`.                                                               |
| `scripts/instructions-report.mjs` (+ `.d.mts`)         | Summarises the log: tokens per session by file and by load reason. The baseline and the after-measurement.                                                                                |
| `scripts/check-lessons-preserved.mjs` (+ `.d.mts`)     | Temporary gate: every paragraph of each snapshot under `docs/lessons/snapshots/` exists verbatim (whitespace-insensitive) in some tracked Markdown file. Retired in Task 12.              |
| `scripts/extract-lessons.mjs` (+ `.d.mts`)             | One-shot, tested extraction of the root note's sections into `docs/overview.md`, `docs/HISTORY.md`, `docs/lessons/rules/NN-*.md` and `docs/lessons/conventions/*.md`. Retired in Task 12. |
| `scripts/hook-reinject-invariants.mjs` (+ `.d.mts`)    | `SessionStart` (`compact`) hook: prints the block between the invariant markers in the root `CLAUDE.md` to stdout.                                                                        |
| `scripts/check-agent-notes.mjs` (+ `.d.mts`)           | Extended: a `.claude/rules/*.md` file with `paths:` governs the files its globs match, exactly as a directory note governs its subtree.                                                   |
| `.claude/settings.json`                                | Gains `hooks` for `InstructionsLoaded` and `SessionStart`.                                                                                                                                |
| `.claude/rules/*.md`                                   | One file per concern, `paths:` frontmatter, one line per rule with a link.                                                                                                                |
| `.claude/skills/<name>/SKILL.md`                       | Four procedures: `apply-migration-edit`, `picture-proof`, `sabotage-verify`, `reseed-pastiches`.                                                                                          |
| `docs/overview.md`, `docs/HISTORY.md`, `docs/lessons/` | The long-form identity of the project, the dated record, and the incident narratives, all verbatim.                                                                                       |
| `CLAUDE.md`                                            | Rewritten as a map under 200 lines.                                                                                                                                                       |
| `apps/hub/src/features/actors/**/CLAUDE.md`            | Each layer note's narrative sections move to a sibling `HISTORY.md`; the standing rules become one-liners in `.claude/rules/editor-*.md`.                                                 |
| `tests/tools/*.test.ts`                                | One suite per script above.                                                                                                                                                               |

---

## Phase 1 — Measure first (branch `instructions-measure`)

### Task 1: The `InstructionsLoaded` hook and its log

**Files:**

- Create: `scripts/hook-log-instructions.mjs`
- Create: `scripts/hook-log-instructions.d.mts`
- Create: `tests/tools/hook-log-instructions.test.ts`
- Modify: `.claude/settings.json`
- Modify: `.gitignore`

**Interfaces:**

- Produces: `logEntry(payload: InstructionsLoadedPayload, now: Date, sizeOf: (path: string) => number): LogEntry` and `appendEntry(dir: string, entry: LogEntry): string` (returns the file written). `LogEntry` is `{ at: string; session: string; reason: string; file: string; bytes: number }`. Task 2 reads these lines back.

- [ ] **Step 1: Write the failing test**

```ts
// tests/tools/hook-log-instructions.test.ts
import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendEntry, logEntry } from "../../scripts/hook-log-instructions.mjs";

const payload = {
  session_id: "s-1",
  cwd: "/repo",
  hook_event_name: "InstructionsLoaded",
  reason: "nested_traversal",
  file_path: "/repo/apps/hub/src/features/actors/CLAUDE.md",
};

describe("logEntry", () => {
  it("records when, which session, why, which file and how big", () => {
    const entry = logEntry(
      payload,
      new Date("2026-09-15T10:00:00Z"),
      () => 26120,
    );
    expect(entry).toEqual({
      at: "2026-09-15T10:00:00.000Z",
      session: "s-1",
      reason: "nested_traversal",
      file: "/repo/apps/hub/src/features/actors/CLAUDE.md",
      bytes: 26120,
    });
  });

  // A file the hook cannot size must still be logged: the load happened.
  it("records a size of -1 when the file cannot be read", () => {
    const entry = logEntry(payload, new Date(0), () => {
      throw new Error("ENOENT");
    });
    expect(entry.bytes).toBe(-1);
  });
});

describe("appendEntry", () => {
  it("appends one JSON line per entry to the session's file", () => {
    const dir = mkdtempSync(join(tmpdir(), "instructions-log-"));
    try {
      const entry = logEntry(payload, new Date(0), () => 1);
      const file = appendEntry(dir, entry);
      appendEntry(dir, entry);
      expect(file).toBe(join(dir, "s-1.jsonl"));
      const lines = readFileSync(file, "utf8").trim().split("\n");
      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0] ?? "")).toEqual(entry);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run -c vitest.config.tools.ts tests/tools/hook-log-instructions.test.ts`
Expected: FAIL, "Failed to load url ../../scripts/hook-log-instructions.mjs".

- [ ] **Step 3: Write the hook**

```js
// scripts/hook-log-instructions.mjs
/**
 * `InstructionsLoaded` hook: one JSON line per instruction file Claude Code
 * loads, so the cost of the instruction architecture is measured rather than
 * estimated.
 *
 * Claude Code runs this with the event payload on stdin (`session_id`,
 * `reason`, `file_path`, …) — see code.claude.com/docs/en/hooks. Output is
 * ignored for this event, so the hook only writes to
 * `.claude/instructions-log/<session_id>.jsonl`, which is gitignored.
 * `scripts/instructions-report.mjs` reads it back.
 *
 * It never fails the load: a hook that throws would turn a logging problem
 * into a missing instruction file, which is the opposite of its job.
 *
 * Usage (registered in `.claude/settings.json`):
 *   node scripts/hook-log-instructions.mjs < payload.json
 */
import { appendFileSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * One log line from one hook payload.
 *
 * @param payload - the event as Claude Code sends it on stdin.
 * @param now - the timestamp to record.
 * @param sizeOf - how to measure a file, given its path. Defaults to `statSync`.
 * @returns the entry to append. `bytes` is `-1` when `sizeOf` throws, because
 *   the load happened whether or not the file could be measured.
 */
export function logEntry(payload, now, sizeOf = (file) => statSync(file).size) {
  let bytes = -1;
  try {
    bytes = sizeOf(payload.file_path);
  } catch {
    bytes = -1;
  }
  return {
    at: now.toISOString(),
    session: payload.session_id,
    reason: payload.reason,
    file: payload.file_path,
    bytes,
  };
}

/**
 * Appends an entry to its session's log file, creating the directory on
 * first use.
 *
 * @param dir - the log directory.
 * @param entry - as {@link logEntry} built it.
 * @returns the path of the file written.
 */
export function appendEntry(dir, entry) {
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${entry.session}.jsonl`);
  appendFileSync(file, `${JSON.stringify(entry)}\n`);
  return file;
}

/** Reads the payload from stdin and logs it; never exits non-zero. */
async function main() {
  try {
    let raw = "";
    for await (const chunk of process.stdin) raw += chunk;
    const payload = JSON.parse(raw);
    const dir = path.join(
      payload.cwd ?? process.cwd(),
      ".claude",
      "instructions-log",
    );
    appendEntry(dir, logEntry(payload, new Date()));
  } catch (error) {
    console.error(
      `hook-log-instructions: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

if (process.argv[1]?.endsWith("hook-log-instructions.mjs")) await main();
```

```ts
// scripts/hook-log-instructions.d.mts
/**
 * Types for the `InstructionsLoaded` logging hook.
 *
 * The hook is plain `.mjs` so Claude Code can run it with no build step; this
 * declaration lets its test be TypeScript and still typecheck.
 */

/** The fields of the hook payload this script reads. */
export interface InstructionsLoadedPayload {
  readonly session_id: string;
  readonly cwd?: string;
  readonly hook_event_name?: string;
  /** `session_start`, `nested_traversal`, `path_glob_match`, `include` or `compact`. */
  readonly reason: string;
  readonly file_path: string;
}

/** One line of the log. */
export interface LogEntry {
  readonly at: string;
  readonly session: string;
  readonly reason: string;
  readonly file: string;
  /** Size in bytes, or `-1` when the file could not be measured. */
  readonly bytes: number;
}

/**
 * One log line from one hook payload.
 *
 * @param payload - the event as Claude Code sends it.
 * @param now - the timestamp to record.
 * @param sizeOf - how to measure a file. Defaults to `statSync(file).size`.
 * @returns the entry; `bytes` is `-1` when `sizeOf` throws.
 */
export declare function logEntry(
  payload: InstructionsLoadedPayload,
  now: Date,
  sizeOf?: (file: string) => number,
): LogEntry;

/**
 * Appends an entry to `<dir>/<session>.jsonl`, creating `dir` if needed.
 *
 * @param dir - the log directory.
 * @param entry - as {@link logEntry} built it.
 * @returns the path of the file written.
 */
export declare function appendEntry(dir: string, entry: LogEntry): string;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run -c vitest.config.tools.ts tests/tools/hook-log-instructions.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Register the hook and ignore the log**

Edit `.claude/settings.json` so it reads:

```json
{
  "enabledPlugins": {
    "code-review@claude-plugins-official": true,
    "context7@claude-plugins-official": true,
    "frontend-design@claude-plugins-official": true,
    "playwright@claude-plugins-official": true,
    "pr-review-toolkit@claude-plugins-official": true,
    "security-guidance@claude-plugins-official": true,
    "supabase@claude-plugins-official": true,
    "superpowers@claude-plugins-official": true,
    "typescript-lsp@claude-plugins-official": true
  },
  "hooks": {
    "InstructionsLoaded": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "node \"$CLAUDE_PROJECT_DIR/scripts/hook-log-instructions.mjs\"",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

Append to `.gitignore`, under the existing Claude Code block:

```
.claude/instructions-log/
```

- [ ] **Step 6: Prove the hook fires in a real session**

Start a new `claude` session in the repository, read one file under
`apps/hub/src/features/actors/application/`, then exit. Run:

```bash
cat .claude/instructions-log/*.jsonl | head
```

Expected: at least one line with `"reason":"session_start"` naming the root
`CLAUDE.md`, and lines with `"reason":"nested_traversal"` naming
`apps/hub/CLAUDE.md`, `apps/hub/AGENTS.md`, `actors/CLAUDE.md` and
`actors/application/CLAUDE.md`. If nothing is written, run
`node scripts/hook-log-instructions.mjs` by hand with a payload on stdin
before suspecting the registration.

- [ ] **Step 7: Lint, spell, commit**

Run: `pnpm lint && pnpm exec cspell --no-progress scripts/hook-log-instructions.mjs scripts/hook-log-instructions.d.mts tests/tools/hook-log-instructions.test.ts && pnpm typecheck`
Expected: all clean.

```bash
git add scripts/hook-log-instructions.mjs scripts/hook-log-instructions.d.mts tests/tools/hook-log-instructions.test.ts .claude/settings.json .gitignore
git commit -m "build: log every instruction file Claude Code loads" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 2: The report that turns the log into numbers

**Files:**

- Create: `scripts/instructions-report.mjs`
- Create: `scripts/instructions-report.d.mts`
- Create: `tests/tools/instructions-report.test.ts`
- Modify: `package.json` (add `"report:instructions": "node scripts/instructions-report.mjs"`)

**Interfaces:**

- Consumes: `LogEntry` lines from Task 1.
- Produces: `summarise(entries: LogEntry[]): Summary` where `Summary` is `{ sessions: number; tokensPerSession: number; byReason: Record<string, number>; byFile: Array<{ file: string; tokens: number; sessions: number }> }`. Tokens are `Math.ceil(bytes / 3)`, the CLI's own factor for this model.

- [ ] **Step 1: Write the failing test**

```ts
// tests/tools/instructions-report.test.ts
import { describe, expect, it } from "vitest";
import { summarise } from "../../scripts/instructions-report.mjs";

const line = (
  session: string,
  reason: string,
  file: string,
  bytes: number,
) => ({
  at: "2026-09-15T00:00:00.000Z",
  session,
  reason,
  file,
  bytes,
});

describe("summarise", () => {
  it("answers zero for an empty log rather than dividing by nothing", () => {
    expect(summarise([])).toEqual({
      sessions: 0,
      tokensPerSession: 0,
      byReason: {},
      byFile: [],
    });
  });

  it("averages tokens per session and groups by reason and file", () => {
    const summary = summarise([
      line("a", "session_start", "/r/CLAUDE.md", 300),
      line("a", "nested_traversal", "/r/x/CLAUDE.md", 60),
      line("b", "session_start", "/r/CLAUDE.md", 300),
    ]);
    expect(summary.sessions).toBe(2);
    // (100 + 20 + 100) / 2, at three characters per token
    expect(summary.tokensPerSession).toBe(110);
    expect(summary.byReason).toEqual({
      session_start: 200,
      nested_traversal: 20,
    });
    expect(summary.byFile).toEqual([
      { file: "/r/CLAUDE.md", tokens: 200, sessions: 2 },
      { file: "/r/x/CLAUDE.md", tokens: 20, sessions: 1 },
    ]);
  });

  // A `-1` is "could not measure", not a credit.
  it("counts an unmeasured file as zero tokens", () => {
    const summary = summarise([line("a", "include", "/r/gone.md", -1)]);
    expect(summary.byFile).toEqual([
      { file: "/r/gone.md", tokens: 0, sessions: 1 },
    ]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run -c vitest.config.tools.ts tests/tools/instructions-report.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the report**

```js
// scripts/instructions-report.mjs
/**
 * Summarises `.claude/instructions-log/*.jsonl` into the numbers the
 * instruction-architecture spec is judged by: instruction tokens per session,
 * split by load reason and by file.
 *
 * Tokens are `ceil(bytes / 3)`, the factor the installed CLI uses for this
 * model when it decides whether a memory file is large. It is an estimate of
 * the same shape the warning uses, not a tokenizer.
 *
 * Usage:
 *   node scripts/instructions-report.mjs [logDir]
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/** The CLI's own characters-per-token factor for this model family. */
const CHARS_PER_TOKEN = 3;

/**
 * Turns log entries into the report's numbers.
 *
 * @param entries - every line of every session's log.
 * @returns totals; an empty log answers zeros rather than NaN.
 */
export function summarise(entries) {
  const sessions = new Set(entries.map((entry) => entry.session));
  const byReason = {};
  const byFileMap = new Map();
  let total = 0;
  for (const entry of entries) {
    const tokens =
      entry.bytes < 0 ? 0 : Math.ceil(entry.bytes / CHARS_PER_TOKEN);
    total += tokens;
    byReason[entry.reason] = (byReason[entry.reason] ?? 0) + tokens;
    const held = byFileMap.get(entry.file) ?? {
      file: entry.file,
      tokens: 0,
      sessions: new Set(),
    };
    held.tokens += tokens;
    held.sessions.add(entry.session);
    byFileMap.set(entry.file, held);
  }
  const byFile = [...byFileMap.values()]
    .map((held) => ({
      file: held.file,
      tokens: held.tokens,
      sessions: held.sessions.size,
    }))
    .sort((a, b) => b.tokens - a.tokens || a.file.localeCompare(b.file));
  return {
    sessions: sessions.size,
    tokensPerSession:
      sessions.size === 0 ? 0 : Math.round(total / sessions.size),
    byReason,
    byFile,
  };
}

/**
 * Reads every `.jsonl` in a directory.
 *
 * @param dir - the log directory.
 * @returns every entry, in file then line order.
 */
export function readLog(dir) {
  const entries = [];
  for (const name of readdirSync(dir)
    .filter((n) => n.endsWith(".jsonl"))
    .sort()) {
    for (const line of readFileSync(path.join(dir, name), "utf8").split("\n")) {
      if (line.trim() !== "") entries.push(JSON.parse(line));
    }
  }
  return entries;
}

/** Prints the summary as a table. */
function main() {
  const dir =
    process.argv[2] ?? path.join(process.cwd(), ".claude", "instructions-log");
  const summary = summarise(readLog(dir));
  console.log(`sessions: ${summary.sessions}`);
  console.log(`instruction tokens per session: ${summary.tokensPerSession}`);
  console.log("\nby reason:");
  for (const [reason, tokens] of Object.entries(summary.byReason))
    console.log(`  ${tokens}\t${reason}`);
  console.log("\nby file (tokens, sessions):");
  for (const row of summary.byFile)
    console.log(`  ${row.tokens}\t${row.sessions}\t${row.file}`);
}

if (process.argv[1]?.endsWith("instructions-report.mjs")) main();
```

```ts
// scripts/instructions-report.d.mts
/** Types for the instruction-log report. */
import type { LogEntry } from "./hook-log-instructions.d.mts";

/** What the report answers. */
export interface Summary {
  readonly sessions: number;
  /** Mean instruction tokens per session, rounded; 0 for an empty log. */
  readonly tokensPerSession: number;
  /** Total tokens by load reason across every session. */
  readonly byReason: Record<string, number>;
  /** Files by total tokens, descending, with how many sessions loaded each. */
  readonly byFile: ReadonlyArray<{
    file: string;
    tokens: number;
    sessions: number;
  }>;
}

/**
 * Turns log entries into the report's numbers.
 *
 * @param entries - every line of every session's log.
 * @returns totals; an empty log answers zeros rather than NaN.
 */
export declare function summarise(entries: readonly LogEntry[]): Summary;

/**
 * Reads every `.jsonl` in a directory.
 *
 * @param dir - the log directory.
 * @returns every entry, in file then line order.
 * @throws when the directory does not exist.
 */
export declare function readLog(dir: string): LogEntry[];
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run -c vitest.config.tools.ts tests/tools/instructions-report.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Add the script and commit**

Add to `package.json` `scripts`, beside `check:page-shapes`:

```json
"report:instructions": "node scripts/instructions-report.mjs",
```

Run: `pnpm report:instructions`
Expected: a table naming the root `CLAUDE.md` first, with the session count from Step 6 of Task 1.

```bash
git add scripts/instructions-report.mjs scripts/instructions-report.d.mts tests/tools/instructions-report.test.ts package.json
git commit -m "build: report instruction tokens per session from the load log" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 3: Open the phase-1 pull request and record the baseline

- [ ] **Step 1: Run every gate**

Run: `pnpm lint && pnpm typecheck && pnpm check:tools && pnpm check:docs origin/main && pnpm check:agent-notes origin/main`
Expected: all green. `knip --no-exit-code` may list the new scripts as unused if `scripts/*.mjs` entries changed; they have not, so it should not.

- [ ] **Step 2: Open the pull request**

```bash
set -a; . ./.secrets; set +a; export GH_TOKEN
git push -u origin instructions-measure
gh pr create --title "build: measure which instruction files load, and what they cost" --body-file - <<'EOF'
Phase 1 of `docs/superpowers/plans/2026-09-15-instruction-architecture.md`.

An `InstructionsLoaded` hook logs every instruction file Claude Code loads,
and `pnpm report:instructions` turns the log into tokens per session by file
and by reason. Nothing moves yet: this is the baseline the rest of the plan
is judged against.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
```

Picture proof: post the output of `pnpm report:instructions` from a real session as a comment on the pull request (it is the verification that would otherwise live only in a log).

- [ ] **Step 3: Collect the baseline**

Work normally for at least five sessions across the actors feature, then run
`pnpm report:instructions` and paste the output into
`docs/superpowers/specs/2026-09-15-instruction-architecture-design.md` under a
new heading `## Baseline (measured)` with the date. That edit rides with
Phase 2's pull request.

---

## Phase 2 — Extract, do not rewrite (branch `instructions-extract`)

### Task 4: The `check:lessons-preserved` gate

**Files:**

- Create: `scripts/check-lessons-preserved.mjs`
- Create: `scripts/check-lessons-preserved.d.mts`
- Create: `tests/tools/lessons-preserved.test.ts`
- Modify: `package.json` (`check:lessons-preserved`, and add it to `check:tools` after `check:source-bytes`)

**Interfaces:**

- Produces: `paragraphs(text: string): string[]` (normalised, non-empty), `missingParagraphs(snapshot: string, corpus: string): string[]`, `markdownCorpus(cwd: string, exclude: (path: string) => boolean): string`.

Normalisation: split on blank lines; for each block, strip a leading list marker (`- `, `* `, `N. `) and all indentation, collapse every run of whitespace to one space, trim. A paragraph is preserved when its normalised text is a substring of the normalised corpus. This is deliberately whitespace-insensitive because prettier rewraps prose, and deliberately NOT punctuation-insensitive: a changed word is a changed paragraph.

- [ ] **Step 1: Write the failing test**

```ts
// tests/tools/lessons-preserved.test.ts
import { describe, expect, it } from "vitest";
import {
  missingParagraphs,
  paragraphs,
} from "../../scripts/check-lessons-preserved.mjs";

describe("paragraphs", () => {
  it("splits on blank lines and collapses wrapping", () => {
    expect(paragraphs("a b\nc\n\n  d   e\n")).toEqual(["a b c", "d e"]);
  });

  it("strips list markers and numbering so a bullet moved into prose still matches", () => {
    expect(paragraphs("- one two\n  three\n\n12. **Four.** five")).toEqual([
      "one two three",
      "**Four.** five",
    ]);
  });

  it("ignores blank-only blocks", () => {
    expect(paragraphs("\n\n   \n")).toEqual([]);
  });
});

describe("missingParagraphs", () => {
  const snapshot = "First lesson,\nwrapped here.\n\n- Second lesson.\n";

  it("answers nothing when every paragraph survives, however rewrapped", () => {
    const corpus =
      "# Elsewhere\n\nFirst lesson, wrapped\nhere.\n\nSecond\nlesson.\n";
    expect(missingParagraphs(snapshot, corpus)).toEqual([]);
  });

  // The discriminating half: a dropped paragraph is named, a rewrapped one is not.
  it("names a paragraph that was dropped", () => {
    expect(missingParagraphs(snapshot, "First lesson, wrapped here.")).toEqual([
      "Second lesson.",
    ]);
  });

  // A changed word is a changed paragraph; the gate is whitespace-insensitive only.
  it("names a paragraph whose words changed", () => {
    expect(
      missingParagraphs(
        snapshot,
        "First lesson, wrapped there.\n\nSecond lesson.",
      ),
    ).toEqual(["First lesson, wrapped here."]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run -c vitest.config.tools.ts tests/tools/lessons-preserved.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the gate**

```js
// scripts/check-lessons-preserved.mjs
/**
 * Fails when a paragraph of a snapshot under `docs/lessons/snapshots/` no
 * longer exists, verbatim, in any tracked Markdown file.
 *
 * It is the mechanical form of "nothing was lost" for the instruction
 * architecture move (`docs/superpowers/specs/2026-09-15-instruction-architecture-design.md`):
 * the pre-move root `CLAUDE.md` and the four actors notes are snapshotted, the
 * text is extracted into `docs/lessons/`, `docs/HISTORY.md` and the rule
 * files, and this gate proves that every paragraph made the trip.
 *
 * Whitespace-insensitive, because prettier rewraps prose; nothing else is
 * forgiven. A changed word is a changed paragraph.
 *
 * TEMPORARY. It is retired, with the snapshots and `extract-lessons.mjs`,
 * once the move is complete and reviewed — a permanent gate pinning old
 * text would forbid ever rewriting a lesson.
 *
 * Usage:
 *   node scripts/check-lessons-preserved.mjs
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

/** Where the pre-move files are kept. */
export const SNAPSHOT_DIR = "docs/lessons/snapshots";

/**
 * A text's paragraphs, normalised for comparison.
 *
 * @param text - Markdown.
 * @returns each blank-line-separated block with list markers, indentation and
 *   wrapping removed and every whitespace run collapsed to one space. Blocks
 *   that are only whitespace are dropped.
 */
export function paragraphs(text) {
  return text
    .split(/\n[ \t]*\n/)
    .map((block) =>
      block
        .split("\n")
        .map((line) => line.replace(/^[ \t]*(?:[-*]|\d+\.)?[ \t]*/, ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((block) => block !== "");
}

/**
 * The snapshot paragraphs the corpus no longer holds.
 *
 * @param snapshot - the pre-move text.
 * @param corpus - every current Markdown file, concatenated.
 * @returns the missing paragraphs, normalised, in snapshot order.
 */
export function missingParagraphs(snapshot, corpus) {
  const haystack = paragraphs(corpus).join("\n");
  return paragraphs(snapshot).filter(
    (paragraph) => !haystack.includes(paragraph),
  );
}

/**
 * Every tracked or unignored Markdown file, concatenated.
 *
 * `git ls-files` rather than a crawl, for the reason root rule 32 records.
 *
 * @param cwd - the repository.
 * @param exclude - which paths to leave out (the snapshots themselves).
 * @returns the corpus.
 */
export function markdownCorpus(cwd, exclude) {
  const out = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "--", "*.md"],
    { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  return out
    .split("\n")
    .filter((file) => file !== "" && !exclude(file))
    .map((file) => {
      try {
        return readFileSync(path.join(cwd, file), "utf8");
      } catch {
        return "";
      }
    })
    .join("\n\n");
}

/** Runs the gate over the repository. */
function main() {
  const cwd = process.cwd();
  const snapshots = execFileSync(
    "git",
    [
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "--",
      `${SNAPSHOT_DIR}/*.md`,
    ],
    { cwd, encoding: "utf8" },
  )
    .split("\n")
    .filter((file) => file !== "");
  const corpus = markdownCorpus(cwd, (file) =>
    file.startsWith(`${SNAPSHOT_DIR}/`),
  );
  let missing = 0;
  for (const snapshot of snapshots) {
    const lost = missingParagraphs(
      readFileSync(path.join(cwd, snapshot), "utf8"),
      corpus,
    );
    if (lost.length === 0) continue;
    missing += lost.length;
    console.error(
      `\n${snapshot}: ${lost.length} paragraph(s) no longer exist anywhere:`,
    );
    for (const paragraph of lost.slice(0, 5))
      console.error(`  ${paragraph.slice(0, 160)}…`);
    if (lost.length > 5) console.error(`  …and ${lost.length - 5} more`);
  }
  if (missing > 0) {
    console.error(
      "\nEvery paragraph of a snapshot must survive verbatim until this gate is retired.",
    );
    process.exit(1);
  }
  console.log(
    `check:lessons-preserved — every paragraph of ${snapshots.length} snapshot(s) still exists.`,
  );
}

if (process.argv[1]?.endsWith("check-lessons-preserved.mjs")) main();
```

```ts
// scripts/check-lessons-preserved.d.mts
/** Types for the temporary lessons-preserved gate. */

/** Where the pre-move files are kept. */
export declare const SNAPSHOT_DIR: string;

/**
 * A text's paragraphs, normalised for comparison: list markers, indentation
 * and wrapping removed, whitespace collapsed, blank blocks dropped.
 *
 * @param text - Markdown.
 * @returns the normalised paragraphs, in order.
 */
export declare function paragraphs(text: string): string[];

/**
 * The snapshot paragraphs the corpus no longer holds, whitespace-insensitively.
 *
 * @param snapshot - the pre-move text.
 * @param corpus - every current Markdown file, concatenated.
 * @returns the missing paragraphs, normalised, in snapshot order.
 */
export declare function missingParagraphs(
  snapshot: string,
  corpus: string,
): string[];

/**
 * Every tracked or unignored Markdown file, concatenated.
 *
 * @param cwd - the repository.
 * @param exclude - which paths to leave out.
 * @returns the corpus.
 * @throws whatever `git` throws when it is absent.
 */
export declare function markdownCorpus(
  cwd: string,
  exclude: (path: string) => boolean,
): string;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run -c vitest.config.tools.ts tests/tools/lessons-preserved.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Snapshot the five files and wire the gate**

```bash
mkdir -p docs/lessons/snapshots
cp CLAUDE.md docs/lessons/snapshots/root-claude-md.md
cp apps/hub/src/features/actors/CLAUDE.md docs/lessons/snapshots/actors-claude-md.md
cp apps/hub/src/features/actors/domain/CLAUDE.md docs/lessons/snapshots/actors-domain-claude-md.md
cp apps/hub/src/features/actors/application/CLAUDE.md docs/lessons/snapshots/actors-application-claude-md.md
cp apps/hub/src/features/actors/presentation/CLAUDE.md docs/lessons/snapshots/actors-presentation-claude-md.md
```

Add to `package.json` `scripts`:

```json
"check:lessons-preserved": "node scripts/check-lessons-preserved.mjs",
```

and in `check:tools`, insert `pnpm check:lessons-preserved && ` immediately after `pnpm check:source-bytes && `.

Run: `pnpm check:lessons-preserved`
Expected: `check:lessons-preserved — every paragraph of 5 snapshot(s) still exists.` (trivially, since the originals are untouched).

- [ ] **Step 6: Sabotage-verify against the real tree**

Delete one paragraph from the root `CLAUDE.md` (any paragraph of rule 27), run `pnpm check:lessons-preserved`, and confirm it exits 1 naming `root-claude-md.md` and the first 160 characters of that paragraph. Restore with `git checkout -- CLAUDE.md` ONLY IF `git status` shows `CLAUDE.md` otherwise clean (root rule 34); otherwise copy the file aside first. Re-run: green.

Record the red run's first line in the commit message.

- [ ] **Step 7: Commit**

```bash
pnpm lint && pnpm typecheck && pnpm exec cspell --no-progress "scripts/check-lessons-preserved.*" tests/tools/lessons-preserved.test.ts
git add scripts/check-lessons-preserved.mjs scripts/check-lessons-preserved.d.mts tests/tools/lessons-preserved.test.ts package.json docs/lessons/snapshots
git commit -m "build: gate that every snapshot paragraph survives the lessons move" -m "Sabotaged: dropping one paragraph of rule 27 exits 1 naming it." -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 5: The extraction script

**Files:**

- Create: `scripts/extract-lessons.mjs`
- Create: `scripts/extract-lessons.d.mts`
- Create: `tests/tools/extract-lessons.test.ts`

**Interfaces:**

- Produces: `splitRoot(text: string): RootParts` where `RootParts` is `{ overview: string; conventions: Bullet[]; history: string; toolchainIntro: string; rules: Rule[]; afterRules: string }`, `Bullet` is `{ lead: string; body: string }`, `Rule` is `{ number: number; lead: string; body: string }`; and `slug(lead: string): string`; and `writeParts(parts: RootParts, cwd: string): string[]` returning the files written.

Section boundaries are the root's own `## ` headings, matched by exact text: `## What AeleOS is` through the end of `## References` is the overview; `## Conventions` holds bullets; `## Current state` is history; `## The toolchain, and the rules it cost` up to `### The rules. Each was paid for.` is the toolchain intro; each `^\d+\. \*\*` block until the next such line or the first line starting with `**` at column 0 is a rule; whatever follows the last rule is `afterRules`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/tools/extract-lessons.test.ts
import { describe, expect, it } from "vitest";
import { slug, splitRoot } from "../../scripts/extract-lessons.mjs";

const fixture = `# CLAUDE.md

Intro line.

## What AeleOS is

Identity paragraph.

## References

- **Design spec:** somewhere.

## Conventions

- **Secrets never in git.** Real values live elsewhere.

- **Every bug gets a regression test. No exceptions.** Finding the cause is
  half the work.

## Current state

- **Phase 0 — done.** Details.

## The toolchain, and the rules it cost

Full account elsewhere.

### The rules. Each was paid for.

1. **A newly adopted tool must be shown to fail before it is believed.** Three
   here were silently doing nothing.
2. **Two tools fighting is a
   configuration bug.** Prettier lowercases hex.

**\`no-deprecated\` is enabled**, and it is the only check.

Claude's role throughout: build the hub.
`;

describe("splitRoot", () => {
  it("cuts the file at its own headings", () => {
    const parts = splitRoot(fixture);
    expect(parts.overview).toContain("Intro line.");
    expect(parts.overview).not.toContain("# CLAUDE.md");
    expect(parts.overview).toContain("Identity paragraph.");
    expect(parts.overview).toContain("Design spec");
    expect(parts.history).toContain("Phase 0");
    expect(parts.toolchainIntro).toBe("Full account elsewhere.");
    expect(parts.afterRules).toContain("Claude's role throughout");
  });

  it("reads each convention bullet's bold lead and keeps its whole body", () => {
    const [first, second] = splitRoot(fixture).conventions;
    expect(first?.lead).toBe("Secrets never in git.");
    expect(second?.lead).toBe(
      "Every bug gets a regression test. No exceptions.",
    );
    expect(second?.body).toContain("half the work.");
  });

  // The lead of rule 2 wraps across a line: the bold must be read as one.
  it("numbers the rules and reads a wrapped lead as one sentence", () => {
    const rules = splitRoot(fixture).rules;
    expect(rules.map((r) => r.number)).toEqual([1, 2]);
    expect(rules[1]?.lead).toBe("Two tools fighting is a configuration bug.");
    expect(rules[1]?.body).toContain("Prettier lowercases hex.");
    expect(rules[1]?.body).not.toContain("no-deprecated");
  });

  // Nothing between the boundaries may vanish: the sum of the parts is the file.
  it("loses no line of the input", () => {
    const parts = splitRoot(fixture);
    const joined = [
      parts.overview,
      ...parts.conventions.map((b) => b.body),
      parts.history,
      parts.toolchainIntro,
      ...parts.rules.map((r) => r.body),
      parts.afterRules,
    ].join("\n");
    for (const line of fixture
      .split("\n")
      .filter((l) => l.trim() && !l.startsWith("#"))) {
      expect(joined).toContain(line.trim());
    }
  });
});

describe("slug", () => {
  it("kebab-cases a lead, dropping punctuation and code marks", () => {
    expect(slug("`check:docs` is per symbol")).toBe("check-docs-is-per-symbol");
  });

  // The cap is a byte count, not a word count, and the cut never leaves a
  // trailing hyphen. Thirteen four-letter words are 64 characters; the cut at
  // 60 lands on the hyphen after the twelfth, which is then stripped.
  it("caps at sixty characters without a trailing hyphen", () => {
    const thirteen = Array.from({ length: 13 }, () => "word").join(" ");
    const twelve = Array.from({ length: 12 }, () => "word").join("-");
    expect(slug(thirteen)).toBe(twelve);
    expect(slug(thirteen)).toHaveLength(59);
    expect(
      slug("A newly adopted tool must be shown to fail before it is believed."),
    ).toHaveLength(60);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run -c vitest.config.tools.ts tests/tools/extract-lessons.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the extractor**

```js
// scripts/extract-lessons.mjs
/**
 * Splits the pre-move root `CLAUDE.md` at its own headings and writes each
 * part where the instruction-architecture spec says it lives — verbatim.
 *
 * ONE-SHOT. It exists so the move is reproducible and testable rather than
 * done by hand across 3,600 lines; `check-lessons-preserved.mjs` is what
 * proves the result. Retired with that gate once the move is reviewed.
 *
 * Boundaries are exact heading text, so a heading renamed before this runs
 * is a loud failure rather than a silent misfile.
 *
 * Usage:
 *   node scripts/extract-lessons.mjs        # reads ./CLAUDE.md, writes docs/
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const H_OVERVIEW = "## What AeleOS is";
const H_CONVENTIONS = "## Conventions";
const H_HISTORY = "## Current state";
const H_TOOLCHAIN = "## The toolchain, and the rules it cost";
const H_RULES = "### The rules. Each was paid for.";

/**
 * Index of the line equal to `heading`, or a thrown error naming it.
 *
 * @param lines - the file.
 * @param heading - exact heading text.
 * @returns the line index.
 * @throws when the heading is absent, because a misfiled section is worse
 *   than a stopped script.
 */
function at(lines, heading) {
  const i = lines.indexOf(heading);
  if (i === -1) throw new Error(`heading not found: ${heading}`);
  return i;
}

/**
 * The bold lead of a bullet or rule whose opening `**` is on `lines[i]`,
 * read across wrapped lines.
 *
 * @param lines - the file.
 * @param i - the line holding the opening `**`.
 * @returns the text between the first `**` pair, joined with single spaces.
 */
function boldLead(lines, i) {
  let buffer = "";
  for (let j = i; j < Math.min(i + 12, lines.length); j += 1) {
    buffer += (buffer ? " " : "") + lines[j].trim();
    const match = /\*\*(.+?)\*\*/.exec(buffer);
    if (match) return match[1].replace(/\s+/g, " ");
  }
  throw new Error(`unterminated bold lead at line ${i + 1}`);
}

/**
 * Top-level bullets of a section, each with its lead and whole body.
 *
 * @param lines - the section's lines.
 * @returns one entry per line starting `- **`, body running to the next such
 *   line. Text before the first bullet is attached to the first bullet's body
 *   so nothing is dropped.
 */
function bullets(lines) {
  const starts = lines.flatMap((l, i) => (l.startsWith("- **") ? [i] : []));
  return starts.map((start, k) => {
    const end = starts[k + 1] ?? lines.length;
    const from = k === 0 ? 0 : start;
    return {
      lead: boldLead(lines, start),
      body: lines.slice(from, end).join("\n").trimEnd(),
    };
  });
}

/**
 * The root note cut into the parts the spec routes to different homes.
 *
 * @param text - the whole pre-move root `CLAUDE.md`.
 * @returns overview (everything above `## Conventions`, minus the title
 *   line), conventions bullets, history (`## Current state`), the toolchain
 *   intro, numbered rules, and everything after the last rule. Together they
 *   hold every non-heading line of the input.
 * @throws when a boundary heading is missing.
 */
export function splitRoot(text) {
  const lines = text.split("\n");
  const o = at(lines, H_OVERVIEW);
  const c = at(lines, H_CONVENTIONS);
  const h = at(lines, H_HISTORY);
  const t = at(lines, H_TOOLCHAIN);
  const r = at(lines, H_RULES);
  const ruleLines = lines.slice(r + 1);
  const starts = ruleLines.flatMap((l, i) =>
    /^\d+\. \*\*/.test(l) ? [i] : [],
  );
  const lastRuleEnd = (() => {
    const last = starts.at(-1) ?? 0;
    const after = ruleLines.findIndex((l, i) => i > last && /^\*\*/.test(l));
    return after === -1 ? ruleLines.length : after;
  })();
  const rules = starts.map((start, k) => {
    const end = k + 1 < starts.length ? starts[k + 1] : lastRuleEnd;
    return {
      number: Number(/^(\d+)\./.exec(ruleLines[start])?.[1]),
      lead: boldLead(ruleLines, start),
      body: ruleLines.slice(start, end).join("\n").trimEnd(),
    };
  });
  // The overview keeps the file's own preamble (everything above the first
  // `## `) minus the `# CLAUDE.md` title line, so no line of the input is
  // orphaned; `o` is only asserted to exist as a boundary sanity check.
  const overviewLines = lines
    .slice(0, c)
    .filter((line, i) => !(i === 0 && line.startsWith("# ")));
  return {
    overview: overviewLines.join("\n").trim(),
    conventions: bullets(lines.slice(c + 1, h)),
    history: lines
      .slice(h + 1, t)
      .join("\n")
      .trim(),
    toolchainIntro: lines
      .slice(t + 1, r)
      .join("\n")
      .trim(),
    rules,
    afterRules: ruleLines.slice(lastRuleEnd).join("\n").trim(),
  };
}

/**
 * A kebab-case filename stem for a lead sentence.
 *
 * @param lead - the bold lead.
 * @returns lowercase ASCII words joined by hyphens, at most 60 characters,
 *   with no leading or trailing hyphen.
 */
export function slug(lead) {
  return lead
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
}

/**
 * Writes every part to its home under `cwd`.
 *
 * @param parts - as {@link splitRoot} cut them.
 * @param cwd - the repository root.
 * @returns the files written, in order.
 */
export function writeParts(parts, cwd) {
  const written = [];
  const put = (rel, body) => {
    const file = path.join(cwd, rel);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${body.trimEnd()}\n`);
    written.push(rel);
  };
  put(
    "docs/overview.md",
    `# AeleOS — the long form\n\nMoved verbatim from the root \`CLAUDE.md\` on 2026-09-15 (see \`docs/superpowers/specs/2026-09-15-instruction-architecture-design.md\`). The root keeps the short form and points here.\n\n${parts.overview}`,
  );
  for (const bullet of parts.conventions) {
    put(
      `docs/lessons/conventions/${slug(bullet.lead)}.md`,
      `# ${bullet.lead}\n\n${bullet.body}`,
    );
  }
  put(
    "docs/HISTORY.md",
    `# AeleOS — the record\n\nThe root \`CLAUDE.md\`'s "Current state" section, moved verbatim on 2026-09-15. Dated, in the order it was written; read it for the account, not for a constraint on new code.\n\n${parts.history}`,
  );
  put(
    "docs/lessons/toolchain.md",
    `# The toolchain, and the rules it cost\n\n${parts.toolchainIntro}\n\nThe numbered rules are one file each under \`docs/lessons/rules/\`.\n\n${parts.afterRules}`,
  );
  for (const rule of parts.rules) {
    put(
      `docs/lessons/rules/${String(rule.number).padStart(2, "0")}-${slug(rule.lead)}.md`,
      `# Rule ${rule.number}: ${rule.lead}\n\n${rule.body}`,
    );
  }
  return written;
}

/** Runs the extraction over the repository. */
function main() {
  const cwd = process.cwd();
  const parts = splitRoot(readFileSync(path.join(cwd, "CLAUDE.md"), "utf8"));
  for (const file of writeParts(parts, cwd)) console.log(file);
}

if (process.argv[1]?.endsWith("extract-lessons.mjs")) main();
```

```ts
// scripts/extract-lessons.d.mts
/** Types for the one-shot lessons extraction. */

/** A convention bullet: its bold lead and its whole text. */
export interface Bullet {
  readonly lead: string;
  readonly body: string;
}

/** A numbered rule: its number, its bold lead and its whole text. */
export interface Rule {
  readonly number: number;
  readonly lead: string;
  readonly body: string;
}

/** The root note cut at its own headings. */
export interface RootParts {
  readonly overview: string;
  readonly conventions: readonly Bullet[];
  readonly history: string;
  readonly toolchainIntro: string;
  readonly rules: readonly Rule[];
  readonly afterRules: string;
}

/**
 * The root note cut into the parts the spec routes to different homes.
 *
 * @param text - the whole pre-move root `CLAUDE.md`.
 * @returns the parts; together they hold every line except the preamble and
 *   the boundary headings.
 * @throws when a boundary heading is missing.
 */
export declare function splitRoot(text: string): RootParts;

/**
 * A kebab-case filename stem for a lead sentence, at most 60 characters.
 *
 * @param lead - the bold lead.
 * @returns the stem.
 */
export declare function slug(lead: string): string;

/**
 * Writes every part to its home under `cwd`.
 *
 * @param parts - as {@link splitRoot} cut them.
 * @param cwd - the repository root.
 * @returns the files written, in order.
 */
export declare function writeParts(parts: RootParts, cwd: string): string[];
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run -c vitest.config.tools.ts tests/tools/extract-lessons.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Run it against the real file and prove nothing was lost**

```bash
node scripts/extract-lessons.mjs | wc -l
ls docs/lessons/rules | wc -l
pnpm exec prettier --write docs/overview.md docs/HISTORY.md "docs/lessons/**/*.md" >/dev/null
pnpm check:lessons-preserved
```

Expected: 63 files written (1 overview + 17 conventions + 1 history + 1 toolchain + 43 rules); `docs/lessons/rules` holds 43 files numbered `01-…` to `43-…`; the gate reports every paragraph of all 5 snapshots still exists. If it names a paragraph, the extractor dropped it: fix `splitRoot`, never the snapshot.

Then `pnpm exec cspell --no-progress "docs/**/*.md"`. Expected: clean, because every word was already in the root file the gate checks.

- [ ] **Step 6: Commit the extractor and its output**

```bash
pnpm lint && pnpm typecheck
git add scripts/extract-lessons.mjs scripts/extract-lessons.d.mts tests/tools/extract-lessons.test.ts docs/overview.md docs/HISTORY.md docs/lessons
git commit -m "docs: extract the root note's narratives into docs/, verbatim" -m "63 files; check:lessons-preserved green against all five snapshots." -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 6: The root map

**Files:**

- Modify: `CLAUDE.md` (rewritten)

**Interfaces:**

- Produces: the invariant markers `<!-- invariants:start -->` and `<!-- invariants:end -->` that Task 8's hook reads. HTML comments are stripped before injection, so the markers cost nothing.

- [ ] **Step 1: Replace the root with the map**

Write `CLAUDE.md` as exactly this, then adjust only the command list if `package.json` disagrees:

```markdown
# CLAUDE.md

Guidance for Claude Code in this repository. The rules here are short on
purpose: each links to the lesson that produced it, and the lessons are read
when they are relevant rather than on every turn. Design:
`docs/superpowers/specs/2026-09-15-instruction-architecture-design.md`.

## What AeleOS is

The central identity provider for the Furry Colombia platform: one person,
one login, across every app under `furrycolombia.com`. The identity provider
is Clerk, configured rather than built. This repository ships exactly one
app, the hub at `apps/hub`, plus the canonical actor-model schema in
`supabase/migrations/`, the handoff contract in `docs/integrating.md`, and
the shared package `packages/identity`. The long form, with every decision
and why: `docs/overview.md`.

<!-- invariants:start -->

## Invariants

These hold in every session and survive compaction; a `SessionStart` hook
re-injects this block after every `/compact`.

- **The user ID is sacred.** Every app stores `identity_sub` and never keys
  its own data to the IdP. Never weaken this.
- **Budget: $0.** A design that needs a paid tier or a card on file is wrong.
- **Never run anything against Libra's database.** It is in production. Each
  app has its own Supabase project; never cross credentials.
- **Branch from an explicit base**: `git checkout -b <name> origin/main`, and
  confirm with `git log --oneline origin/main..HEAD` before pushing.
- **Do not commit unless asked.** Work on branches; open PRs when a plan
  licenses it. Every `git`/`gh` call uses the PAT in `.secrets` and identity
  from `gh api user`, set `--local` each session: `docs/git-with-gh-token.md`.
- **An edited migration is hand-applied to live LAST, immediately before
  merge, one PR at a time**, when `gh pr list --state open` shows nothing
  else. Skill: `/apply-migration-edit`.
- **Picture proof on the PR is part of the work**, and the pictures are read
  back for what else is in the frame. Skill: `/picture-proof`.
- **Every bug gets a regression test**, sabotage-verified against the
  original fault, at the level the bug lived. Skill: `/sabotage-verify`.
- **Zero tolerance for flakiness.** Diagnose the mechanism; never retry,
  widen a budget or skip.
- **One agent per working tree**, or a worktree each.
- **Secrets never in git.** `.secrets` and `.env*` are ignored; only
  `.secrets.example` is committed.

<!-- invariants:end -->

## Commands

Run everything from the repository root, never from `apps/hub`.

- `pnpm lint`, `pnpm typecheck`, `pnpm --filter hub test`, `pnpm test:tools`
- `pnpm check:tools` (the whole tooling gate), `pnpm check:docs`,
  `pnpm check:agent-notes`, `pnpm check:schema-drift`, `pnpm check:contrast`
- `pnpm test:db` (resets the local Supabase stack from the migrations),
  `pnpm --filter hub test:e2e` (source `.secrets` first or half of it skips)
- `pnpm report:instructions` (what the instruction files cost per session)

## Where the rules live

- `.claude/rules/*.md` — one file per concern, loaded only when a matching
  file is read: `toolchain`, `testing`, `browser-proof`, `notes-and-docs`,
  `migrations`, `editor-and-blocks`, `pastiches`, `identity-package`.
- `.claude/skills/` — procedures: `apply-migration-edit`, `picture-proof`,
  `sabotage-verify`, `reseed-pastiches`.
- `docs/lessons/rules/NN-*.md` — the 43 numbered rules in full. **A citation
  of "root rule N" anywhere in this repository means the file numbered N.**
- `docs/lessons/conventions/*.md` — the conventions in full.
- `docs/HISTORY.md` — the dated record of what shipped and what it cost.
- `apps/hub/src/features/actors/CLAUDE.md` — the addressing model; each
  layer's `HISTORY.md` beside it holds that layer's account.
- `docs/superpowers/{specs,plans}/` — brainstorm → spec → plan → implement.

## Conventions in one line each

- Filenames are kebab-case. Every export carries TSDoc stating the contract,
  not the types; `pnpm check:docs` fails when code moves and TSDoc does not.
- Every export is tested on its happy path and each failure mode; branch
  coverage gates it. Edge cases are owed at unit and browser level, and they
  are different questions at each.
- A directory `CLAUDE.md` constrains code that does not exist yet; TSDoc
  constrains what exists. `pnpm check:agent-notes` fails when a file changes
  under a note, or under a rule file's `paths`, and the note did not.
- Change an implementation, move its documentation. Whoever fixes a fault
  deletes the note saying it is open.
- Specs and plans follow `docs/superpowers/{specs,plans}/YYYY-MM-DD-*.md`.

## Current state, in one paragraph

Phases 1a, 0, 1b and the fursona studio are done; the hub is live and
bilingual; public pages, the block model, dragging, weighted places, the
page source dock, the canvas-first editor and drop-target legibility have
shipped. Drag-to-add from a palette tab is designed and partly built. The
dated account of each is in `docs/HISTORY.md`; the open work is at the end
of it.

Claude's role throughout: build and test the hub here, specify exactly what
to configure in Clerk, and write the per-app integration code in the
respective app repositories.
```

- [ ] **Step 2: Check the size and the gate**

Run: `grep -c '' CLAUDE.md && wc -c < CLAUDE.md && pnpm check:lessons-preserved && pnpm exec prettier --check CLAUDE.md && pnpm exec cspell --no-progress CLAUDE.md`
Expected: under 200 lines, under 12,000 bytes, the gate green (every removed paragraph is in `docs/`), prettier and cspell clean.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: the root note is a map" -m "Under 200 lines. Every paragraph it lost is under docs/, proven by check:lessons-preserved." -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 7: Open the phase-2 pull request

- [ ] **Step 1: Run every gate and the notes gate against the base**

Run: `pnpm lint && pnpm typecheck && pnpm check:tools && pnpm check:docs origin/main && pnpm check:agent-notes origin/main`
Expected: green. `check:agent-notes` will list the root `CLAUDE.md` as re-read, since it changed.

- [ ] **Step 2: Paste the baseline into the spec**

Add the `## Baseline (measured)` section from Task 3 Step 3 to the spec, then commit it:

```bash
git add docs/superpowers/specs/2026-09-15-instruction-architecture-design.md
git commit -m "docs: record the phase-1 instruction-load baseline" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 3: Open the pull request with proof**

```bash
git push -u origin instructions-extract
gh pr create --title "docs: the root note is a map; every lesson moves verbatim" --body-file - <<'EOF'
Phase 2 of `docs/superpowers/plans/2026-09-15-instruction-architecture.md`.

The root `CLAUDE.md` is under 200 lines. Its 43 rules, 17 conventions and
the "Current state" record are under `docs/lessons/` and `docs/HISTORY.md`,
moved verbatim by a tested extractor and proven by `check:lessons-preserved`
against a snapshot of the old file. Rule numbers are preserved: "root rule
N" is `docs/lessons/rules/NN-*.md`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
```

Picture proof as a PR comment: the green `check:lessons-preserved` run, the sabotaged red run from Task 4 Step 6, and `pnpm report:instructions` from one fresh session after the change, beside the baseline.

---

## Phase 3 — Scope by concern (branch `instructions-rules`)

### Task 8: `check:agent-notes` learns `paths:`

**Files:**

- Modify: `scripts/check-agent-notes.mjs`
- Modify: `scripts/check-agent-notes.d.mts`
- Modify: `tests/tools/agent-notes.test.ts`

**Interfaces:**

- Produces: `ruleGlobs(text: string): string[]` (the `paths:` list from frontmatter, `[]` when none), `rulePaths(cwd?: string): string[]` (every `.claude/rules/**/*.md`), `ruleIndex(paths: readonly string[], read: (path: string) => string): RuleEntry[]` where `RuleEntry` is `{ path: string; globs: string[] }`, and `auditChanges(changed, index, rules = [])` whose `stale` now also names a rule file left unread while a file matching one of its globs changed.

- [ ] **Step 1: Write the failing tests**

Append to `tests/tools/agent-notes.test.ts`:

```ts
import { ruleGlobs, ruleIndex } from "../../scripts/check-agent-notes.mjs";

describe("ruleGlobs", () => {
  it("reads the paths list out of frontmatter", () => {
    const text =
      '---\npaths:\n  - "supabase/**"\n  - "scripts/check-schema-drift.mjs"\n---\n\n# Migrations\n';
    expect(ruleGlobs(text)).toEqual([
      "supabase/**",
      "scripts/check-schema-drift.mjs",
    ]);
  });

  it("answers nothing for a rule with no frontmatter, which loads at launch and governs no path", () => {
    expect(ruleGlobs("# Always\n\n- rule\n")).toEqual([]);
  });

  it("answers nothing when the frontmatter is not on line one", () => {
    expect(ruleGlobs("\n---\npaths:\n  - x\n---\n")).toEqual([]);
  });
});

describe("auditChanges with rules", () => {
  const index = noteIndex(["CLAUDE.md"], () => "# root");
  const rules = ruleIndex(
    [".claude/rules/migrations.md", ".claude/rules/always.md"],
    (path) =>
      path.endsWith("migrations.md")
        ? '---\npaths:\n  - "supabase/**"\n---\n# m'
        : "# always\n",
  );

  it("names a rule left unread while a file matching its globs changed", () => {
    const { stale } = auditChanges(
      ["supabase/migrations/0009_actor_profiles.sql"],
      index,
      rules,
    );
    expect(stale.map((s) => s.note)).toContain(".claude/rules/migrations.md");
  });

  it("is satisfied when the rule file changed in the same set", () => {
    const { stale } = auditChanges(
      [
        "supabase/migrations/0009_actor_profiles.sql",
        ".claude/rules/migrations.md",
      ],
      index,
      rules,
    );
    expect(stale.map((s) => s.note)).not.toContain(
      ".claude/rules/migrations.md",
    );
  });

  // The discriminating half: a rule whose globs match nothing changed owes nothing.
  it("does not name a rule whose globs match nothing in the change", () => {
    const { stale } = auditChanges(["apps/hub/src/x.ts"], index, rules);
    expect(stale.map((s) => s.note)).not.toContain(
      ".claude/rules/migrations.md",
    );
  });

  it("never treats a rule file as governed by a note or by another rule", () => {
    const { stale, ungoverned } = auditChanges(
      [".claude/rules/always.md"],
      index,
      rules,
    );
    expect(stale).toEqual([]);
    expect(ungoverned).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify the new cases fail**

Run: `pnpm exec vitest run -c vitest.config.tools.ts tests/tools/agent-notes.test.ts`
Expected: the seven new cases FAIL (`ruleGlobs is not a function`); every existing case passes.

- [ ] **Step 3: Implement**

In `scripts/check-agent-notes.mjs`, add after `NOTE_NAMES`:

```js
/** Where path-scoped rule files live. */
const RULES_DIR = ".claude/rules/";

/**
 * The `paths:` globs of a rule file.
 *
 * Reads only the shape the Claude Code docs show — `---` on line one, a
 * `paths:` key, one `- "glob"` per line, `---` to close — because the
 * repository has no YAML parser and should not gain one for a list.
 *
 * @param text - the rule file.
 * @returns its globs, unquoted; `[]` when there is no frontmatter or no
 *   `paths:` key, which is a rule that loads at launch and governs no path.
 */
export function ruleGlobs(text) {
  const lines = text.split("\n");
  if (lines[0]?.trim() !== "---") return [];
  const end = lines.findIndex((line, i) => i > 0 && line.trim() === "---");
  if (end === -1) return [];
  const globs = [];
  let inPaths = false;
  for (const line of lines.slice(1, end)) {
    if (/^paths:\s*$/.test(line)) {
      inPaths = true;
      continue;
    }
    if (/^\S/.test(line)) inPaths = false;
    const item = /^\s*-\s*["']?([^"']+?)["']?\s*$/.exec(line);
    if (inPaths && item) globs.push(item[1]);
  }
  return globs;
}

/**
 * Every rule file git would let reach a commit.
 *
 * @param cwd - the repository to ask.
 * @returns repository-relative paths under `.claude/rules/`.
 */
export function rulePaths(cwd = process.cwd()) {
  const out = execFileSync(
    "git",
    // `*` in a git pathspec crosses `/`, so this also lists nested rule files;
    // `**/*.md` would demand a subdirectory and skip the top-level ones.
    [
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "--",
      `${RULES_DIR}*.md`,
    ],
    { cwd, encoding: "utf8" },
  );
  return out.split("\n").filter((line) => line !== "");
}

/**
 * Each rule file with the globs it governs.
 *
 * @param paths - every rule file.
 * @param read - how to read one, given its path.
 * @returns entries in path order; a rule with no globs is kept with `[]` so
 *   the audit still knows it is a rule and never a governed file.
 */
export function ruleIndex(paths, read) {
  return [...paths]
    .sort()
    .map((rulePath) => ({ path: rulePath, globs: ruleGlobs(read(rulePath)) }));
}
```

Change `auditChanges` to take a third parameter and add the rule pass. Replace its body with:

```js
export function auditChanges(changed, index, rules = []) {
  const seen = new Set(changed);
  const notes = new Set([...index.values()].map((held) => held.path));
  const ruleFiles = new Set(rules.map((rule) => rule.path));
  const owed = new Map();
  const ungoverned = [];

  for (const file of changed) {
    if (notes.has(file) || ruleFiles.has(file)) continue;
    const held = governing(file, index);
    if (held === null) {
      ungoverned.push(file);
    } else {
      const already = owed.get(held.path);
      if (already === undefined) owed.set(held.path, [file]);
      else already.push(file);
    }
    for (const rule of rules) {
      if (!rule.globs.some((glob) => path.posix.matchesGlob(file, glob)))
        continue;
      const already = owed.get(rule.path);
      if (already === undefined) owed.set(rule.path, [file]);
      else already.push(file);
    }
  }

  const stale = [...owed.entries()]
    .filter(([note]) => !seen.has(note))
    .map(([note, files]) => ({ note, files: files.sort() }))
    .sort((a, b) => a.note.localeCompare(b.note));

  return { stale, ungoverned: ungoverned.sort() };
}
```

Update its TSDoc: `@param rules - every path-scoped rule, as {@link ruleIndex} built them; a changed file matching a rule's globs owes that rule a re-read exactly as it owes its directory note.` In `run`, build `const rules = ruleIndex(rulePaths(cwd), (file) => readFileSync(path.join(cwd, file), "utf8"));` and pass it as the third argument. Extend the header comment's first paragraph with one sentence: "A `.claude/rules/*.md` file with `paths:` frontmatter governs every file its globs match, in the same way, since 2026-09-15."

Mirror the three new exports and the changed signature in `scripts/check-agent-notes.d.mts` with TSDoc stating the contract as above, and add:

```ts
/** A path-scoped rule file and the globs it governs. */
export interface RuleEntry {
  readonly path: string;
  readonly globs: readonly string[];
}
```

- [ ] **Step 4: Run the suite to verify it passes**

Run: `pnpm exec vitest run -c vitest.config.tools.ts tests/tools/agent-notes.test.ts`
Expected: PASS, every case.

- [ ] **Step 5: Sabotage-verify at the gate level**

Create `.claude/rules/probe.md` with `paths: ["scripts/check-contrast.mjs"]`, stage it and a whitespace-only change to `scripts/check-contrast.mjs`, run `pnpm check:agent-notes --staged`: green (the rule is in the set). Unstage the rule file: red, naming `.claude/rules/probe.md` with `scripts/check-contrast.mjs` beneath it. Delete the probe and restore the script.

- [ ] **Step 6: Commit**

```bash
pnpm lint && pnpm typecheck
git add scripts/check-agent-notes.mjs scripts/check-agent-notes.d.mts tests/tools/agent-notes.test.ts
git commit -m "build: a path-scoped rule file is guarded like a directory note" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 9: The concern-scoped rule files

**Files:**

- Create: `.claude/rules/toolchain.md`, `testing.md`, `browser-proof.md`, `notes-and-docs.md`, `migrations.md`, `editor-and-blocks.md`, `pastiches.md`, `identity-package.md`
- Modify: `docs/lessons/toolchain.md` (the CI-gates paragraphs stay there; the rule files link to it)

**Interfaces:**

- Consumes: `docs/lessons/rules/NN-*.md` filenames from Task 5 (link targets), `ruleGlobs` frontmatter shape from Task 8.

Each file is: frontmatter, a one-line heading, then one bullet per rule of the form `- **<bold lead, verbatim>** → \`docs/lessons/rules/NN-<slug>.md\``, and one bullet per convention the same way pointing at `docs/lessons/conventions/<slug>.md`. No narrative. The assignment:

| file                   | `paths`                                                                                                                                                                                                                                             | rules                                             | conventions                                                                                                                          |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `toolchain.md`         | `eslint.config.mjs`, `package.json`, `cspell.json`, `.prettierrc.json`, `.ls-lint.yml`, `knip.json`, `stylelint.config.*`, `scripts/**/*.mjs`, `scripts/**/*.d.mts`, `.github/**`, `.husky/**`                                                      | 1, 2, 3, 4, 5, 6, 8, 9, 28, 32, 42                | —                                                                                                                                    |
| `testing.md`           | `**/*.test.ts`, `**/*.test.tsx`, `vitest.config*.ts`, `apps/hub/vitest*.ts`, `tests/tools/**`, `tests/db/**`, `tests/idp/**`                                                                                                                        | 7, 10, 11, 13, 14, 17, 23, 27, 29, 33, 34, 35, 40 | "Every export is tested…", "Edge cases are owed at BOTH levels…", "Every bug gets a regression test…"                                |
| `browser-proof.md`     | `apps/hub/tests/e2e/**`, `apps/hub/playwright.config.ts`, `apps/hub/.env.example`                                                                                                                                                                   | 12, 26, 31, 38, 41, 43                            | "Picture proof on the PR…"                                                                                                           |
| `notes-and-docs.md`    | `**/CLAUDE.md`, `**/AGENTS.md`, `**/HISTORY.md`, `docs/**`, `.claude/rules/**`, `.claude/skills/**`                                                                                                                                                 | 16, 18, 19, 21, 24, 25, 30                        | "Every export carries TSDoc…", "Change an implementation, move its documentation.", "Constraints about an export…", "Specs & plans:" |
| `migrations.md`        | `supabase/**`, `scripts/check-schema-drift.mjs`, `scripts/schema-drift-output.mjs`, `scripts/check-page-shapes.mjs`                                                                                                                                 | 20, 28                                            | "Squash the migrations…", "A claim about STORED data is checkable now…"                                                              |
| `editor-and-blocks.md` | `apps/hub/src/**`, `apps/hub/tests/**/*.tsx`                                                                                                                                                                                                        | 15, 36, 37, 39                                    | "What the block model CANNOT be pushed toward…", "A window is corners chosen one at a time…"                                         |
| `pastiches.md`         | `scripts/seed-pastiches.mjs`, `scripts/pastiche-*.mjs`, `scripts/pastiche-*.d.mts`, `scripts/era-looks.generated.json`, `apps/hub/tests/pastiche-*.ts`, `apps/hub/tests/era-looks-json.test.ts`, `apps/hub/src/features/actors/domain/era-looks.ts` | —                                                 | "The pastiches were rebuilt against their captures…"                                                                                 |
| `identity-package.md`  | `packages/identity/**`, `docs/integrating.md`                                                                                                                                                                                                       | —                                                 | one bullet: the package imports no framework and never Clerk; `getToken` is a parameter (from `docs/overview.md`)                    |

Rule 22 ("One agent per working tree") is an invariant in the root and gets no rule-file line. A rule that belongs to two concerns (28: toolchain and migrations; 30: notes and editor) is listed in both; the link is the same file.

- [ ] **Step 1: Write `migrations.md` first, as the template**

```markdown
---
paths:
  - "supabase/**"
  - "scripts/check-schema-drift.mjs"
  - "scripts/schema-drift-output.mjs"
  - "scripts/check-page-shapes.mjs"
---

# Migrations

Loaded when a file under `supabase/` or a drift script is read. Each line is
the rule; the link is why. Procedure for applying an edit to live:
`/apply-migration-edit`.

- **Squash the migrations, and squash them again.** Every object is defined
  exactly once; an in-place edit never reaches the live database on its own →
  `docs/lessons/conventions/squash-the-migrations-and-squash-them-again.md`
- **A claim about STORED data is checkable now — `pnpm check:page-shapes`.** →
  `docs/lessons/conventions/a-claim-about-stored-data-is-checkable-now-pnpm-check-page-s.md`
- **An agent that sabotages live state must restore it in the same run, and a
  session limit does not care.** → `docs/lessons/rules/20-an-agent-that-sabotages-live-state-must-restore-it-in-the-sa.md`
- **Anything that ships file CONTENT to a server, rather than committing it,
  is exposed to the checkout's line endings.** → `docs/lessons/rules/28-anything-that-ships-file-content-to-a-server-rather-than-com.md`
```

Confirm every link target exists: `for f in $(grep -oE 'docs/lessons/[^ )]+\.md' .claude/rules/migrations.md); do [ -f "$f" ] || echo "MISSING $f"; done`. The slugs above are computed by `slug()`; if a filename differs, the filename wins.

- [ ] **Step 2: Write the other seven files the same way**

Same shape, the `paths` and rule numbers from the table, lead sentences copied verbatim from the `# Rule N:` heading of each lessons file (never retyped), and the same missing-link check over `.claude/rules/*.md`. Keep each file under 100 lines.

- [ ] **Step 3: Verify the harness loads them**

Start a new `claude` session, read `supabase/migrations/0001_actors.sql`, exit, and run `pnpm report:instructions`. Expected: a line for `.claude/rules/migrations.md` with reason `path_glob_match`, and none for the other seven rule files.

- [ ] **Step 4: Gates and commit**

Run: `pnpm check:agent-notes --staged` after staging (every rule file is new, so nothing is owed), `pnpm exec cspell --no-progress ".claude/rules/*.md"`, `pnpm exec prettier --check ".claude/rules/*.md"`, `pnpm check:lessons-preserved`.

```bash
git add .claude/rules
git commit -m "docs: one rule file per concern, loaded only when its files are read" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 10: Open the phase-3 pull request

- [ ] Run `pnpm lint && pnpm typecheck && pnpm check:tools && pnpm check:docs origin/main && pnpm check:agent-notes origin/main`; push `instructions-rules`; open the PR titled "build: rule files by concern, guarded like notes"; post as proof the sabotage from Task 8 Step 5 and the `report:instructions` line from Task 9 Step 3.

---

## Phase 4 — Hook the invariants (branch `instructions-compact-hook`)

### Task 11: The compaction hook

**Files:**

- Create: `scripts/hook-reinject-invariants.mjs`
- Create: `scripts/hook-reinject-invariants.d.mts`
- Create: `tests/tools/hook-reinject-invariants.test.ts`
- Modify: `.claude/settings.json`

**Interfaces:**

- Consumes: the `<!-- invariants:start -->` / `<!-- invariants:end -->` markers Task 6 placed in `CLAUDE.md`.
- Produces: `invariantsFrom(text: string): string` — the text strictly between the markers, trimmed, or `""` when either marker is absent.

- [ ] **Step 1: Write the failing test**

```ts
// tests/tools/hook-reinject-invariants.test.ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { invariantsFrom } from "../../scripts/hook-reinject-invariants.mjs";

describe("invariantsFrom", () => {
  it("returns exactly what sits between the markers", () => {
    const text =
      "before\n<!-- invariants:start -->\n## Invariants\n\n- one\n<!-- invariants:end -->\nafter\n";
    expect(invariantsFrom(text)).toBe("## Invariants\n\n- one");
  });

  // A hook that printed the whole file on a missing marker would re-inject
  // everything the architecture exists to keep out.
  it("returns nothing when a marker is missing", () => {
    expect(invariantsFrom("no markers here")).toBe("");
    expect(invariantsFrom("<!-- invariants:start -->\nopen only")).toBe("");
  });

  // The real file must carry both markers, or the hook is silently empty.
  it("finds a non-empty block in the repository's own CLAUDE.md", () => {
    const block = invariantsFrom(readFileSync("CLAUDE.md", "utf8"));
    expect(block).toContain("identity_sub");
    expect(block.split("\n").length).toBeLessThan(40);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run -c vitest.config.tools.ts tests/tools/hook-reinject-invariants.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the hook**

```js
// scripts/hook-reinject-invariants.mjs
/**
 * `SessionStart` hook, matcher `compact`: prints the root `CLAUDE.md`'s
 * invariants block to stdout, which Claude Code adds to Claude's context
 * after every compaction (code.claude.com/docs/en/hooks-guide, "Re-inject
 * context after compaction").
 *
 * Only the project-root `CLAUDE.md` survives compaction on its own, and it
 * survives by being re-read whole; this hook is what lets the root stay a
 * map while the dozen rules that must hold for a whole session are restated
 * in under forty lines. The block is the one between
 * `<!-- invariants:start -->` and `<!-- invariants:end -->` — HTML comments
 * are stripped before injection, so the markers cost nothing.
 *
 * Prints nothing, and exits 0, when a marker is missing: an empty
 * re-injection is a gap, a whole-file one is the fault this architecture
 * exists to remove.
 *
 * Usage (registered in `.claude/settings.json`):
 *   node scripts/hook-reinject-invariants.mjs
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const START = "<!-- invariants:start -->";
const END = "<!-- invariants:end -->";

/**
 * The invariants block of a root note.
 *
 * @param text - the whole `CLAUDE.md`.
 * @returns the text strictly between the two markers, trimmed, or `""` when
 *   either marker is absent or they are out of order.
 */
export function invariantsFrom(text) {
  const start = text.indexOf(START);
  const end = text.indexOf(END);
  if (start === -1 || end === -1 || end < start) return "";
  return text.slice(start + START.length, end).trim();
}

/** Prints the block for the repository the hook runs in. */
function main() {
  const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
  try {
    const block = invariantsFrom(
      readFileSync(path.join(root, "CLAUDE.md"), "utf8"),
    );
    if (block !== "") process.stdout.write(`${block}\n`);
  } catch {
    // A missing root note is somebody else's problem; a hook must not fail a session.
  }
}

if (process.argv[1]?.endsWith("hook-reinject-invariants.mjs")) main();
```

```ts
// scripts/hook-reinject-invariants.d.mts
/** Types for the compaction re-inject hook. */

/**
 * The invariants block of a root note: the text strictly between
 * `<!-- invariants:start -->` and `<!-- invariants:end -->`, trimmed.
 *
 * @param text - the whole `CLAUDE.md`.
 * @returns the block, or `""` when either marker is absent or out of order.
 */
export declare function invariantsFrom(text: string): string;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run -c vitest.config.tools.ts tests/tools/hook-reinject-invariants.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Register it**

In `.claude/settings.json`, add beside `InstructionsLoaded`:

```json
"SessionStart": [
  {
    "matcher": "compact",
    "hooks": [
      {
        "type": "command",
        "command": "node \"$CLAUDE_PROJECT_DIR/scripts/hook-reinject-invariants.mjs\"",
        "timeout": 10
      }
    ]
  }
]
```

- [ ] **Step 6: Prove it in a session, then sabotage it**

Start a session, run `/compact`, then ask: "Without reading any file, what are this repository's invariants?" Expected: the answer names `identity_sub`, the $0 budget and Libra's database. Then remove the `**Budget: $0.**`bullet from`CLAUDE.md`in the working tree (copy the file aside first), run`/compact` in a fresh session, ask the same question: the budget is absent from the answer. Restore the copy. Record both answers in the PR.

- [ ] **Step 7: Commit and open the phase-4 pull request**

```bash
pnpm lint && pnpm typecheck && pnpm exec cspell --no-progress "scripts/hook-reinject-invariants.*" tests/tools/hook-reinject-invariants.test.ts
git add scripts/hook-reinject-invariants.mjs scripts/hook-reinject-invariants.d.mts tests/tools/hook-reinject-invariants.test.ts .claude/settings.json
git commit -m "build: re-inject the invariants after every compaction" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push -u origin instructions-compact-hook
gh pr create --title "build: re-inject the invariants after every compaction" --body "Phase 4 of docs/superpowers/plans/2026-09-15-instruction-architecture.md. Proof of both the positive and the sabotaged compaction is in the first comment.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

---

## Phase 5 — Procedures into skills (branch `instructions-skills`)

### Task 12: Four skills

**Files:**

- Create: `.claude/skills/apply-migration-edit/SKILL.md`
- Create: `.claude/skills/picture-proof/SKILL.md`
- Create: `.claude/skills/sabotage-verify/SKILL.md`
- Create: `.claude/skills/reseed-pastiches/SKILL.md`

**Interfaces:**

- Consumes: the lessons files for links (`docs/lessons/conventions/squash-the-migrations-and-squash-them-again.md`, `…/picture-proof-on-the-pr-is-part-of-the-work-not-a-follow-up.md`, `docs/lessons/rules/29-*.md`, `docs/lessons/rules/34-*.md`, `docs/lessons/conventions/the-pastiches-were-rebuilt-against-their-captures-one-task-a.md`); confirm each with `ls` before linking. The slugs here were computed with the same function Task 5 ships; the filename on disk still wins.

- [ ] **Step 1: Write `apply-migration-edit`**

```markdown
---
description: Hand-apply an edited, already-applied migration to the live Supabase project, in the only order that is safe
when_to_use: after editing any file under supabase/migrations/ that the live database has already applied; before merging such a PR
disable-model-invocation: true
---

# Apply a migration edit to live

`db push` will not re-run an applied file, so an in-place edit to `0009` or
any applied migration changes nothing on the live project until you apply it
by hand. Do it LAST, immediately before merge, one pull request at a time.

1. Confirm nothing else is open: `gh pr list --state open` must list only
   your PR. If it lists another, stop: applying now turns that PR's
   `schema-drift` check red for a change that is not in it.
2. Source the secrets in the same shell: `set -a; . ./.secrets; set +a`.
3. Apply only the changed statements, each `create or replace` or
   `comment on` in its own transaction, sending the file's own text rather
   than retyping it (root rule 20). Use `psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f <statement.sql>`
   with the statement extracted verbatim from the migration.
4. Re-run `pnpm check:schema-drift`: it must report that the live database
   matches the migrations.
5. Merge. If the check goes red for a function you did not touch, it is a
   line-endings report until proven otherwise (root rule 28).

Never re-seed pastiches in the same step; that is `/reseed-pastiches`.
Full account: `docs/lessons/conventions/squash-the-migrations-and-squash-them-again.md`.
```

- [ ] **Step 2: Write `picture-proof`**

```markdown
---
description: Post screenshots as a PR comment through a private gist, then read every picture back for what else is in the frame
when_to_use: when opening a pull request, and after every later commit on a branch that has one
disable-model-invocation: true
---

# Picture proof on the PR

A green check is not the picture; a screenshot that never left the working
tree is not the picture.

1. Point `PLAYWRIGHT_BASE_URL` at THIS branch (a local dev server or its
   preview), never at production from an earlier live check.
2. Photograph what changed the way a person would look at it: the editor,
   the public page, before-and-after where the bug was visual. Resize the
   viewport to `document.scrollHeight` before a full-page capture, or a
   `background-attachment: fixed` field photographs with a false white band.
3. Host the pictures: `gh api gists -X POST -f 'description=…' -F 'public=false' -f 'files[README.md][content]=placeholder'`,
   clone its `git_push_url`, add the PNGs, push, and reference
   `https://gist.githubusercontent.com/<user>/<id>/raw/<file>.png`.
   Confirm `gh api user` is the intended identity first.
4. `gh pr comment <n> --body-file -` with one caption per image stating the
   claim it proves.
5. READ EACH PICTURE BACK as its own step, asking "what else is in this
   frame, and is any of it wrong": edges, overlaps, clipped text, raw
   message keys, a colour that did not apply. Correct on the thread, never
   quietly.
6. Delete temporary specs and `shot-*.png` from the tree; nothing is committed.

Full account: `docs/lessons/conventions/picture-proof-on-the-pr-is-part-of-the-work-not-a-follow-up.md`.
```

- [ ] **Step 3: Write `sabotage-verify`**

```markdown
---
description: Prove a test can fail by breaking the code it guards, watching it go red, and restoring exactly
when_to_use: after writing any test that guards already-correct behaviour, and for every regression test
---

# Sabotage-verify a test

A test never seen red proves nothing.

1. Copy the file aside before the edit, and put the restore in a shell trap;
   never restore with `git checkout --`, which discards every uncommitted
   change in the file (root rule 34):
   `cp <file> "$TEMP/<file>.bak"; trap 'cp "$TEMP/<file>.bak" <file>' EXIT`
2. Make the mutation in the SOURCE, never at runtime through the instrument
   the test is built on (root rule 14).
3. Confirm the mutation landed by the FAILURE COUNT, not by grepping for the
   edit: a substitution that matched nothing looks exactly like a successful
   verification (root rule 29).
4. Name the wrong behaviour the case excludes and ask whether this fixture
   could tell it from the right one; if not, rewrite the fixture (root rule 27).
5. Restore, re-run green, and record the red run's first line in the commit
   message.

Full accounts: `docs/lessons/rules/29-*.md`, `docs/lessons/rules/34-*.md`,
`docs/lessons/rules/27-*.md`.
```

- [ ] **Step 4: Write `reseed-pastiches`**

```markdown
---
description: Re-seed the sixteen showcase pages to production from main, after a rebase, never from a stale branch
when_to_use: after any change to scripts/pastiche-pages.mjs, scripts/pastiche-references.mjs or scripts/era-looks.generated.json has merged
disable-model-invocation: true
---

# Re-seed the pastiche pages

The seeder writes production from whatever tree you are standing in and
bypasses `set_actor_sections` entirely, so it applies no database guard.

1. Be on `main`, fully rebased: `git checkout main && git pull`. Re-seeding
   from a branch cut before another change silently reverts that change on
   every seeded page.
2. `pnpm --filter hub test -- pastiche-pages era-looks-json`: the pages must
   pass the reassembled validation first, because the database will not
   refuse them.
3. `set -a; . ./.secrets; set +a; node scripts/seed-pastiches.mjs`.
4. Photograph at least the pages that changed and read the pictures back
   (`/picture-proof`); a broken reference capture fails no gate.
5. Expect `arquivo.pt` and `upload.wikimedia.org` to refuse rapid repeated
   requests; a respaced retry clears it, and it is not evidence the
   reference is wrong.

Full account: `docs/lessons/conventions/the-pastiches-were-rebuilt-against-their-captures-one-task-a.md`.
```

- [ ] **Step 5: Verify and commit**

Start a session and run `/apply-migration-edit`: the skill body appears. Run `pnpm exec cspell --no-progress ".claude/skills/**/*.md"` and `pnpm exec prettier --check ".claude/skills/**/*.md"`. Confirm every `docs/lessons/...` link resolves with `ls`.

```bash
git add .claude/skills
git commit -m "docs: four procedures become skills, loaded only when invoked" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push -u origin instructions-skills
gh pr create --title "docs: four procedures become skills" --body "Phase 5 of docs/superpowers/plans/2026-09-15-instruction-architecture.md.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

---

## Phase 6 — Dissolve the layer notes (branch `instructions-layer-notes`)

### Task 13: Each layer's narrative moves beside it

**Files:**

- Create: `apps/hub/src/features/actors/domain/HISTORY.md`, `apps/hub/src/features/actors/application/HISTORY.md`
- Modify: `apps/hub/src/features/actors/presentation/HISTORY.md` (append), the three layer `CLAUDE.md` files, `apps/hub/src/features/actors/CLAUDE.md`
- Create: `.claude/rules/editor-domain.md`, `.claude/rules/editor-application.md`, `.claude/rules/editor-presentation.md`

**Interfaces:**

- Consumes: `paragraphs`/`missingParagraphs` from Task 4 (the snapshots of all four notes already exist), `ruleGlobs` frontmatter from Task 8.

The method is the same one Task 5 applied to the root, done by hand because these notes are heading-shaped rather than numbered: every `###` section of a layer note whose body is an account of work done (a date in the heading, "shipped", "measured", "found") moves verbatim to that layer's `HISTORY.md`, in file order, under its own heading; the note keeps the heading line with a one-sentence rule if the section stated one, plus a link `→ HISTORY.md#<heading-anchor>`. Sections that are pure standing constraint (the "Read this before you change anything" preamble, the addressing model in the feature note) stay. Then every one-sentence rule left in a layer note is copied to the matching `.claude/rules/editor-<layer>.md` with `paths: ["apps/hub/src/features/actors/<layer>/**"]`, and the layer note shrinks to the preamble plus the list of rules with links.

- [ ] **Step 1: Move the domain note's sections**

For each `###` in `apps/hub/src/features/actors/domain/CLAUDE.md`, decide account or constraint by the test above; append accounts to `domain/HISTORY.md` under `# The actors feature — domain layer, history` with the same two-paragraph preamble `presentation/HISTORY.md` carries (adjusted to "domain"). Run `pnpm check:lessons-preserved` after every ten sections.

- [ ] **Step 2: Move the application note's sections** the same way into `application/HISTORY.md`.

- [ ] **Step 3: Move the rest of the presentation note's sections** into the existing `presentation/HISTORY.md`, appending after its last section.

- [ ] **Step 4: Write the three editor rule files**

Each is the frontmatter, a heading, and one bullet per standing rule the layer note now lists, each bullet ending with its `→` link to the note or the history anchor. Target under 100 lines each.

- [ ] **Step 5: Shrink the feature note**

`apps/hub/src/features/actors/CLAUDE.md` keeps its preamble, the addressing model sections (`## Two public pages, not one` through `## Things not to do`) and `## Two operational traps`; the public-barrel section (`### The public routes have their own barrel`) moves to `application/HISTORY.md`, with a one-line rule and link left behind. Target under 300 lines.

- [ ] **Step 6: Measure, gate, commit**

Run: `for f in apps/hub/src/features/actors/CLAUDE.md apps/hub/src/features/actors/*/CLAUDE.md .claude/rules/editor-*.md; do printf "%6d lines %8d bytes %s\n" "$(grep -c '' "$f")" "$(wc -c < "$f")" "$f"; done`
Expected: every note and rule file under 300 lines; the three layer notes under 100.

Run: `pnpm check:lessons-preserved && pnpm check:agent-notes --staged && pnpm exec cspell --no-progress "apps/hub/src/features/actors/**/*.md" ".claude/rules/*.md" && pnpm exec prettier --check "apps/hub/src/features/actors/**/*.md" ".claude/rules/*.md"`
Expected: green. Staging every changed note satisfies the notes gate; the lessons gate proves the four snapshots survived.

```bash
git add apps/hub/src/features/actors .claude/rules
git commit -m "docs(actors): each layer's account moves beside it; the notes keep the rules" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 7: Prove the load**

Start a session, read `apps/hub/src/features/actors/presentation/blocks.tsx`, exit, `pnpm report:instructions`. Expected: `actors/CLAUDE.md`, `presentation/CLAUDE.md` and `.claude/rules/editor-presentation.md` loaded; `domain/CLAUDE.md` and `application/CLAUDE.md` did not; the session's total is under 40,000 tokens. Post the table on the PR.

- [ ] **Step 8: Open the phase-6 pull request** titled "docs(actors): the layer notes hold rules; the histories hold the accounts".

---

## Phase 7 — Ablate and retire (branch `instructions-retire`)

### Task 14: Compare against the baseline and retire the temporary gate

**Files:**

- Delete: `scripts/check-lessons-preserved.mjs`, `scripts/check-lessons-preserved.d.mts`, `tests/tools/lessons-preserved.test.ts`, `scripts/extract-lessons.mjs`, `scripts/extract-lessons.d.mts`, `tests/tools/extract-lessons.test.ts`, `docs/lessons/snapshots/`
- Modify: `package.json` (remove `check:lessons-preserved` from `scripts` and from `check:tools`)
- Modify: `docs/superpowers/specs/2026-09-15-instruction-architecture-design.md` (status DELIVERED, the after-measurement beside the baseline)
- Modify: `CLAUDE.md` (the "Where the rules live" list no longer mentions snapshots; nothing else)

- [ ] **Step 1: Measure after at least five sessions on the new structure**

Run `pnpm report:instructions` over the sessions since phase 6 merged. Paste the table into the spec under `## After (measured)` beside the baseline, with the date and the session count. The acceptance test is that tokens per session fell by at least half; if it did not, name which files still load and why before continuing.

- [ ] **Step 2: Retire the temporary gate and the extractor**

```bash
git rm scripts/check-lessons-preserved.mjs scripts/check-lessons-preserved.d.mts tests/tools/lessons-preserved.test.ts scripts/extract-lessons.mjs scripts/extract-lessons.d.mts tests/tools/extract-lessons.test.ts
git rm -r docs/lessons/snapshots
```

Remove `"check:lessons-preserved": …` from `package.json` and `pnpm check:lessons-preserved && ` from `check:tools`. Run `pnpm check:tools` and `pnpm typecheck`: green, and `knip` reports nothing new.

- [ ] **Step 3: Mark the spec delivered and record the retirement**

Change the spec's status line to `**Status: DELIVERED (<date>).**` with one sentence: the gate and the extractor were retired in this PR once every snapshot paragraph had been reviewed in place. Add to `docs/lessons/toolchain.md` a dated paragraph naming the retired gate, so the next person who finds "check:lessons-preserved" cited in a commit message knows where it went.

- [ ] **Step 4: Ablation note**

Add to the spec's open questions a dated line: which rules, if any, the hook log shows loading in every session despite being path-scoped (a glob too wide), to be narrowed in the next pass.

- [ ] **Step 5: Commit and open the final pull request**

```bash
git add -A
git commit -m "build: retire the lessons-preserved gate; the move is complete and measured" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push -u origin instructions-retire
gh pr create --title "build: retire the lessons-preserved gate; the move is measured" --body "Phase 7 of docs/superpowers/plans/2026-09-15-instruction-architecture.md. Before and after tables are in the spec.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

---

## Self-review

**Spec coverage.** Measurement hook and report: Tasks 1–3. Extract without rewriting, with the nothing-lost gate written first and sabotaged: Tasks 4–6. Scope by concern and teach `check:agent-notes` to read `paths:`: Tasks 8–9. Compaction hook, sabotage-verified: Task 11. Four skills: Task 12. Layer notes dissolve into histories and rule files: Task 13. Ablate on a cadence and retire: Task 14. Rule numbers preserved: Task 5's filenames and Task 6's root sentence. Sister repositories: out of scope, named in the spec's open questions.

**Placeholder scan.** Task 9 Step 2 and Task 13 Steps 1–5 are hand work by construction (judgement about which sections are accounts), and each states the decision rule, the target size and the gate that checks the result rather than the words. Every other step carries its code.

**Type consistency.** `LogEntry` (Task 1) is what `summarise`/`readLog` (Task 2) consume. `paragraphs`/`missingParagraphs` (Task 4) are what Task 5 Step 5, Task 6 Step 2 and Task 13 rely on through the CLI. `ruleGlobs`/`ruleIndex`/`rulePaths` and the three-argument `auditChanges` (Task 8) are what Task 9's files are checked by. `invariantsFrom` (Task 11) reads the markers Task 6 placed. `slug` (Task 5) is what Task 9's link targets are computed with, and the plan says the filename wins over the plan's own spelling of a slug.
