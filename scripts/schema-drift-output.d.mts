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
 * Names the cause of a failed run, when it is one this check can recognise.
 *
 * Only one signature is recognised: the shadow database failing to take its
 * port, which is what a local Supabase stack (`pnpm db:start`, `pnpm test:db`)
 * or a container left behind by an interrupted run does to this check. It reads
 * like an infrastructure fault and is not one, so the advice names the port and
 * both holders. Anything else returns null and the caller falls back to the
 * CLI's own error, rather than guessing at a cause it never established.
 *
 * @param stderr - everything the CLI wrote to stderr during one run.
 * @returns advice naming the cause, or null when the failure is not one of the
 *   recognised ones.
 */
export declare function explainCliFailure(stderr: string): string | null;

/**
 * Whether the CLI printed its "no changes" verdict on the given stderr.
 *
 * **Read this as proof that the command ran, not that the schemas agree.** It
 * is the only positive signal a run with an empty stdout leaves behind, which
 * is why it is exported: the structural pass has the same empty-stdout problem
 * and no parse of its own, so it asks this question directly. `--use-migra`
 * prints this same verdict when it could not connect at all, so for that engine
 * a verdict means "the CLI completed" and nothing stronger.
 *
 * @param stderr - everything the CLI wrote to stderr during one run.
 * @returns true when the verdict line is present.
 */
export declare function reportedNoChanges(stderr: string): boolean;

/**
 * Reads one pg-delta run: its statements, and the comment ones among them.
 *
 * Throws {@link OutputShapeError} rather than returning an empty result when
 * the run's shape says the parse can no longer be trusted — because a comment
 * drift the parse fails to isolate would otherwise be reported as
 * `0 comment(s) differ`, indistinguishable in the log from a clean project.
 *
 * A run is accepted on one of two positive signals and never on silence: a diff
 * on stdout, or the clean verdict on stderr. Where there is a diff, the guards
 * are coupled to what the caller depends on — every line that reads as a
 * comment statement must be written in the exact form the filter matches, and
 * must come back as a statement of its own — so it is not possible for this to
 * return while a comment has been dropped.
 *
 * @param run - one completed run: `stdout` carries the diff, `stderr` the
 *   CLI's own progress and its verdict. Both are required, because a clean run
 *   puts its only evidence in the second.
 * @returns whether the run was clean, the statements found, and the subset of
 *   them that are comments. A clean run returns both lists empty.
 * @throws OutputShapeError when neither outcome is recognisable, or when the
 *   diff's shape says the parse is unreliable.
 */
export declare function readDiffRun(run: { stdout: string; stderr: string }): {
  clean: boolean;
  statements: string[];
  comments: string[];
};
