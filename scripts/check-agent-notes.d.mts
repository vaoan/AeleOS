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
 * the note above it.
 *
 * @param changed - every path the comparison reports, deletions included.
 * @param index - the map {@link noteIndex} built.
 * @returns the stale notes and the changed paths no note governs.
 */
export declare function auditChanges(
  changed: readonly string[],
  index: Map<string, NoteEntry>,
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
