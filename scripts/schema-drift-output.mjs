/**
 * Reads `supabase db diff --use-pg-delta` output into statements.
 *
 * Its own module so that the parse can be handed a string. This is the half of
 * the drift check that reads another tool's output **by shape**, which makes it
 * the half that can quietly stop working — and a guard that has never been
 * handed the fault it guards against has never been shown to catch anything.
 * `tests/tools/schema-drift-output.test.ts` hands it that fault.
 *
 * The first guard here did not. It asked only whether *some* chunk still began
 * with `ALTER ` or `GRANT `, which is a claim about the array's contents and
 * not about whether the split still found the boundaries it needs. Collapse
 * pg-delta's separator from a blank line to a single newline and the whole
 * diff becomes one chunk that still begins with that noise — the noise is
 * always first — so the guard was satisfied while a `COMMENT ON` sitting
 * twenty-seven statements later was silently dropped. Measured against this
 * project on 2026-08-17: 29 chunks, the comment at index 27.
 *
 * @see `scripts/check-schema-drift.mjs` — the only caller.
 */

/**
 * Raised when the output cannot be read, as opposed to read and found clean.
 *
 * Carries no remediation of its own: the caller turns it into the "nothing was
 * compared" exit, which is a different answer from "the schemas disagree" and
 * must never be reported as one.
 */
export class OutputShapeError extends Error {
  /**
   * @param message - what about the shape was wrong, in a reader's terms.
   */
  constructor(message) {
    super(message);
    this.name = "OutputShapeError";
  }
}

/**
 * Every `COMMENT ON` that begins a line, however the statements are separated.
 *
 * Anchored per LINE rather than per statement, deliberately: it is the one
 * count of "how many comment statements are in here" that survives a change to
 * how statements are joined, which is what lets it check the split instead of
 * being one more thing that depends on it.
 */
const COMMENT_AT_LINE_START = /^COMMENT ON /gm;

/**
 * The single-line statements the hosted project's own default privileges
 * always produce, and which are therefore never absent.
 *
 * Measured on 2026-08-17 against a clean project: 26 of them, each its own
 * statement on its own line. That makes their count a floor for how many
 * chunks the split should have produced.
 */
const NOISE_AT_LINE_START = /^(?:ALTER DEFAULT PRIVILEGES|GRANT) /gm;

/**
 * Counts the non-overlapping matches of a global pattern.
 *
 * `String.prototype.match` is used rather than `RegExp.exec` in a loop because
 * it does not carry `lastIndex` from one call to the next — these patterns are
 * module constants, so a stateful read would make each call depend on the last.
 *
 * @param haystack - the text to search.
 * @param pattern - a global regular expression.
 * @returns how many times it matched.
 */
function count(haystack, pattern) {
  return (haystack.match(pattern) ?? []).length;
}

/**
 * Splits a pg-delta diff into statements and picks out the comment ones.
 *
 * Throws {@link OutputShapeError} rather than returning an empty result when
 * the output cannot be trusted. **That distinction is the whole point of this
 * module.** A comment drift the parse fails to isolate would otherwise be
 * reported as `0 comment(s) differ` — a green tick over real drift, for ever,
 * with nothing in the log to tell it apart from a clean project.
 *
 * Three things are checked, and each closes a different way that could happen:
 *
 * 1. **Recognisable at all.** pg-delta's output against the hosted project is
 *    never empty, because the platform default privileges always produce
 *    statements. So "nothing recognisable" cannot mean "nothing differs"; it
 *    means the format moved.
 * 2. **Cardinality.** If the separator collapses to a single newline the whole
 *    diff becomes one chunk, and that chunk still begins with the same noise —
 *    so a check asking only "does anything look like a statement" is satisfied
 *    by it and learns nothing. The number of chunks must therefore be at least
 *    the number of single-line noise statements present.
 * 3. **Containment.** Every `COMMENT ON` beginning a line must come back as a
 *    statement of its own. This is the load-bearing one: it is coupled
 *    directly to what the caller depends on, so the guard cannot pass while the
 *    comment pass is blind, and it holds however the separator changes because
 *    it never asks how statements are joined.
 *
 * Check 2 alone could in principle fire on real drift rather than a format
 * change — a drifted function body would have to carry two or more lines
 * beginning, in capitals, with `GRANT ` or `ALTER DEFAULT PRIVILEGES `, which
 * this repository's lower-case SQL does not. It would be the wrong message for
 * the situation but still a red while real drift exists, which is the safe
 * direction to be wrong in.
 *
 * @param raw - stdout from `supabase db diff --use-pg-delta`, trimmed or not.
 * @returns the statements found, and the subset of them that are comments.
 * @throws OutputShapeError when the output's shape says the parse is unreliable.
 */
export function readDiffStatements(raw) {
  const text = raw.trim();
  const statements = text
    .split(/\n{2,}/)
    .map((statement) => statement.trim())
    .filter(Boolean);

  const noise = count(text, NOISE_AT_LINE_START);
  if (noise === 0) {
    throw new OutputShapeError(
      `Read ${statements.length} chunk(s) and found none of the ALTER DEFAULT ` +
        "PRIVILEGES or GRANT statements the hosted project's own default " +
        "privileges always produce. Either the CLI's output format changed — " +
        "in which case the COMMENT ON filter is now blind and must be " +
        "refitted — or Supabase changed its cloud default privileges.",
    );
  }

  if (statements.length < noise) {
    throw new OutputShapeError(
      `Found ${noise} single-line statement(s) in the output but the split ` +
        `produced only ${statements.length} chunk(s), so statements are no ` +
        "longer separated the way this parse expects. A COMMENT ON anywhere " +
        "but the very start of a chunk would be dropped without a trace.",
    );
  }

  const comments = statements.filter((statement) =>
    statement.startsWith("COMMENT ON "),
  );
  const present = count(text, COMMENT_AT_LINE_START);
  if (present !== comments.length) {
    throw new OutputShapeError(
      `The output contains ${present} line(s) beginning COMMENT ON but the ` +
        `parse isolated ${comments.length} comment statement(s). Whatever it ` +
        "failed to isolate is real drift that would have gone unreported.",
    );
  }

  return { statements, comments };
}
