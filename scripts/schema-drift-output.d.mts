/**
 * Types for the pg-delta output parse.
 *
 * The parse itself is plain `.mjs` so that `check-schema-drift.mjs` can run as
 * a CLI with no build step and no TypeScript loader, matching
 * `check-contrast.mjs` and `check-doc-freshness.mjs`. This declaration exists
 * so its tests can be written in TypeScript and still typecheck.
 */

/**
 * Raised when the output cannot be read, as opposed to read and found clean.
 *
 * Carries no remediation of its own: the caller turns it into the "nothing was
 * compared" exit, which is a different answer from "the schemas disagree" and
 * must never be reported as one.
 */
export declare class OutputShapeError extends Error {
  /**
   * @param message - what about the shape was wrong, in a reader's terms.
   */
  constructor(message: string);
}

/**
 * Splits a pg-delta diff into statements and picks out the comment ones.
 *
 * Throws {@link OutputShapeError} rather than returning an empty result when
 * the output's shape says the parse can no longer be trusted — because a
 * comment drift the parse fails to isolate would otherwise be reported as
 * `0 comment(s) differ`, indistinguishable in the log from a clean project.
 *
 * The guard is coupled to what the caller depends on: every `COMMENT ON`
 * beginning a line in the raw text must come back as a statement of its own,
 * so it is not possible for this to return while a comment has been dropped.
 *
 * @param raw - stdout from `supabase db diff --use-pg-delta`, trimmed or not.
 * @returns the statements found, and the subset of them that are comments.
 * @throws OutputShapeError when the output's shape says the parse is unreliable.
 */
export declare function readDiffStatements(raw: string): {
  statements: string[];
  comments: string[];
};
