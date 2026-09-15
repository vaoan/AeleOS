/**
 * Types for the agent-note freshness gate.
 *
 * The gate itself is plain `.mjs` so it can run as a CLI without a build step
 * or a TypeScript loader, matching `check-doc-freshness.mjs` and
 * `check-source-bytes.mjs`. This declaration exists so its tests can be written
 * in TypeScript and still typecheck.
 */

/** What a note file is, which decides whether it governs its directory. */
export type NoteKind = "note" | "pointer" | "vendored" | "empty";

/** A note and what kind it turned out to be. */
export interface NoteEntry {
  /** The note's repository-relative path. */
  path: string;
  /** What it is. Only `"note"` governs anything. */
  kind: NoteKind;
}

/** A path-scoped rule file and the globs it governs. */
export interface RuleEntry {
  readonly path: string;
  readonly globs: readonly string[];
  /**
   * Whether the frontmatter declares a `paths:` key at all, regardless of how
   * many globs were parsed out of it — the fact {@link ruleGlobProblems} needs
   * to tell "no `paths:` key" apart from "a `paths:` key that parsed empty".
   */
  readonly hasPathsKey: boolean;
}

/** One rule whose `paths:` frontmatter can never fire. */
export interface RuleGlobProblem {
  /** The rule file's repository-relative path. */
  readonly rule: string;
  /** What is wrong with it, in prose. */
  readonly problem: string;
}

/** One note that was not re-read, and what changed beneath it. */
export interface StaleNote {
  /** The note's repository-relative path. */
  note: string;
  /** The changed paths that demanded it, sorted. */
  files: string[];
}

/** What a comparison found. */
export interface NoteAudit {
  /** Notes left unread, sorted by path. This is what fails the gate. */
  stale: StaleNote[];
  /**
   * Changed paths no note governs, sorted.
   *
   * Reported rather than failed: a subtree whose nearest note is a pointer or
   * vendored is deliberately unguarded, and the fix is to write a real note
   * there.
   */
  ungoverned: string[];
}

/**
 * What kind of file a note is.
 *
 * @param text - the note's full contents.
 * @returns `"note"` for prose somebody here maintains, `"pointer"` for a file
 *   that is only `@import` lines, `"vendored"` for one wholly generated between
 *   BEGIN/END markers, and `"empty"` for one with nothing in it.
 */
export declare function classifyNote(text: string): NoteKind;

/**
 * Which note governs each directory that holds one.
 *
 * A directory holding both names keeps the hand-written one; a directory whose
 * notes are all skippable is kept anyway, because the upward walk must stop
 * there rather than continue to the note above.
 *
 * @param paths - every note file in the repository.
 * @param read - how to read one, given its path.
 * @returns a map from directory key — `""` for the repository root — to the
 *   note that decides it.
 */
export declare function noteIndex(
  paths: readonly string[],
  read: (path: string) => string,
): Map<string, NoteEntry>;

/**
 * Which notes a set of changes left unread.
 *
 * A note is never governed by another note, so editing one demands nothing of
 * the note above it. A rule file is never governed by a note or by another
 * rule.
 *
 * @param changed - every path the comparison reports, deletions included.
 * @param index - the map {@link noteIndex} built.
 * @param rules - every path-scoped rule, as {@link ruleIndex} built them; a
 *   changed file matching a rule's globs owes that rule a re-read exactly as
 *   it owes its directory note.
 * @returns the stale notes (directory notes and rule files alike) and the
 *   changed paths no note governs.
 */
export declare function auditChanges(
  changed: readonly string[],
  index: Map<string, NoteEntry>,
  rules?: readonly RuleEntry[],
): NoteAudit;

/**
 * Every note file git would let reach a commit.
 *
 * @param cwd - the repository to ask. Defaults to the process's directory.
 * @returns repository-relative note paths.
 * @throws whatever `git` throws when it is absent or the directory is not a
 *   repository. A gate that cannot enumerate must not report success.
 */
export declare function notePaths(cwd?: string): string[];

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
export declare function ruleGlobs(text: string): string[];

/**
 * Every rule file git would let reach a commit.
 *
 * @param cwd - the repository to ask. Defaults to the process's directory.
 * @returns repository-relative paths under `.claude/rules/`.
 * @throws whatever `git` throws when it is absent or the directory is not a
 *   repository. A gate that cannot enumerate must not report success.
 */
export declare function rulePaths(cwd?: string): string[];

/**
 * Each rule file with the globs it governs.
 *
 * @param paths - every rule file.
 * @param read - how to read one, given its path.
 * @returns entries in path order; a rule with no globs is kept with `[]` so
 *   the audit still knows it is a rule and never a governed file.
 */
export declare function ruleIndex(
  paths: readonly string[],
  read: (path: string) => string,
): RuleEntry[];

/**
 * Rules whose `paths:` frontmatter can never fire — the vacuous-pass vector
 * this gate's whole architecture leans on, since a rule that never matches
 * anything guards nothing while looking exactly like one that does.
 *
 * @param index - every rule file, as {@link ruleIndex} built it.
 * @param files - every tracked file (as `git ls-files` lists them, see
 *   {@link trackedFiles}), to test each glob against.
 * @returns one problem per (a) a rule whose frontmatter declares `paths:` but
 *   parsed zero globs out of it, and (b) a glob that matches no tracked file.
 */
export declare function ruleGlobProblems(
  index: readonly RuleEntry[],
  files: readonly string[],
): RuleGlobProblem[];

/**
 * Every file `git` would let reach a commit — tracked files, plus untracked
 * ones `.gitignore` does not exclude.
 *
 * @param cwd - the repository to ask. Defaults to the process's directory.
 * @returns repository-relative paths.
 * @throws whatever `git` throws when it is absent or the directory is not a
 *   repository. A gate that cannot enumerate must not report success.
 */
export declare function trackedFiles(cwd?: string): string[];

/**
 * What changed, either across a branch or in the index.
 *
 * @param cwd - the repository to ask.
 * @param baseRef - the ref to compare against, or `"--staged"` to compare HEAD
 *   to the index.
 * @returns repository-relative paths, deletions included.
 */
export declare function changedPaths(cwd: string, baseRef: string): string[];

/**
 * Runs the gate over a repository, printing what it found.
 *
 * @param cwd - the repository to check.
 * @param baseRef - the ref to compare against, or `"--staged"`.
 * @returns the process exit code: 1 when any note was left unread.
 */
export declare function run(cwd: string, baseRef: string): number;
