/**
 * Reads one `supabase db diff --use-pg-delta` RUN — both of its streams.
 *
 * Its own module so that the parse can be handed strings. This is the half of
 * the drift check that reads another tool's output **by shape**, which makes it
 * the half that can quietly stop working — and a guard that has never been
 * handed the fault it guards against has never been shown to catch anything.
 * `tests/tools/schema-drift-output.test.ts` hands it those faults.
 *
 * **Both streams, because the CLI splits its verdict across them.** A diff goes
 * to stdout; "No schema changes found" goes to stderr. A parse given only
 * stdout therefore cannot tell a clean project from a run that never happened,
 * which is the whole question this module exists to answer.
 *
 * **A run ends in one of two recognised outcomes, and nothing else is
 * accepted.** Either the engine wrote a diff, or it wrote its clean verdict.
 * Each is positive evidence that something reached the live database and ran to
 * a conclusion. Silence on both streams is not evidence of anything, and it is
 * what a wrong password, a connection dropped mid-run, and a flag the CLI no
 * longer understands all look like.
 *
 * **That is what the first version of this module got wrong, and the shape of
 * the mistake is worth more than the fix.** It drew BOTH guarantees — that the
 * engine ran at all, and that the text parse still recognises what it depends
 * on — from one signal: the ~26 `GRANT` and `ALTER DEFAULT PRIVILEGES`
 * statements the hosted project's own default privileges added to every diff.
 * Measured on 2026-08-16 they were never absent, so requiring them looked free.
 * Measured on 2026-08-17 they are gone — pg-delta is an alpha the CLI fetches
 * at run time, and the one it fetches now does not report them — so a clean
 * project prints a single line on stderr and nothing at all on stdout, and the
 * guard threw on the one outcome it existed to bless. `check:schema-drift`
 * exited 1 on a clean database, saying nothing had been compared.
 *
 * The lesson is not "that measurement expired". It is that **a proof of life
 * must be present in every legitimate outcome**, or it is a proof of one
 * outcome wearing a proof of life's name. So the clean verdict is now read as
 * the success token it is, and the parse canary is scoped to the runs that
 * actually produced text to parse.
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
 * The verdict the CLI prints — on stderr — when the two schemas agree.
 *
 * Anchored to a whole line so that it is the CLI's own conclusion being read
 * and not a phrase that happened to appear inside some other message.
 */
const CLEAN_VERDICT = /^No schema changes found\s*$/m;

/**
 * The header pg-delta opens a non-empty diff with.
 *
 * It is the one thing a diff always carries whatever the schemas differ by, so
 * it is what stands in for "this is still the format this parse was written
 * against". The default-privilege noise used to serve that purpose and no
 * longer exists; a header that disappears or is reworded takes this check red
 * rather than blind, which is the direction to be wrong in.
 */
const UNIT_HEADER = /^-- Migration unit /;

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
 * The same statement written any way a formatter might choose to write it.
 *
 * Compared against {@link COMMENT_AT_LINE_START} so that the exact form the
 * filter matches on is itself checked. Lower-case keywords, an added indent or
 * a second space would otherwise make every comment invisible to the filter
 * while the output still looked entirely healthy — the silent permanent zero
 * this module exists to make impossible.
 */
const COMMENT_HOWEVER_WRITTEN = /^[ \t]*comment\s+on\s/gim;

/**
 * The docker error the CLI reports when the shadow database cannot take its
 * port.
 *
 * Captured group is the port, so the advice can name the number the reader
 * will have to free rather than a number this file believes is configured.
 */
const SHADOW_PORT_TAKEN =
  /Bind for \S*?:(\d+) failed: port is already allocated/;

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
 * Names the cause of a failed run, when it is one this check can recognise.
 *
 * **Only one signature is recognised, and it earns its place by how quietly it
 * used to break things.** This check builds a throwaway shadow database from
 * `supabase/migrations/`, and it wants the same port a local Supabase stack
 * uses. Start one — `pnpm db:start`, or `pnpm test:db`, both routine now that
 * Docker is available here — and every run of this check fails at "Creating
 * shadow database..." with a docker port message, which reads like an
 * infrastructure fault and not like "the thing you started is in the way". A
 * container left behind by an interrupted run does the same and is worse,
 * because nothing the reader started is running.
 *
 * Anything else returns null and the caller falls back to the CLI's own error,
 * which is already on screen. Guessing at causes this check never established
 * is what {@link OutputShapeError}'s "nothing was compared" wording exists to
 * avoid, and a wrong guess costs more than no guess.
 *
 * @param stderr - everything the CLI wrote to stderr during one run.
 * @returns advice naming the cause, or null when the failure is not one of the
 *   recognised ones.
 */
export function explainCliFailure(stderr) {
  const portTaken = SHADOW_PORT_TAKEN.exec(stderr);
  if (portTaken) {
    return (
      `The shadow database could not start: port ${portTaken[1]} is already ` +
      "in use.\n\nThis check builds a throwaway database from " +
      "supabase/migrations/ on that port,\nso anything else holding it stops " +
      "the comparison before it begins. A local\nstack (`pnpm db:start`, " +
      "`pnpm test:db`) is the usual holder, and `supabase\nstop` releases it. " +
      "So is a shadow container left behind by an interrupted\nrun of this " +
      "very check, which nothing cleans up on its own: `docker ps`\nwill show " +
      "it.\n\nThe CLI's own error is above."
    );
  }
  return null;
}

/**
 * Whether the CLI printed its "no changes" verdict on the given stderr.
 *
 * **Read this as proof that the command ran, not that the schemas agree.** It
 * is the only positive signal a run with an empty stdout leaves behind, which
 * is why it is exported: the structural pass has the same empty-stdout problem
 * and no parse of its own, so it asks this question directly.
 *
 * Its one weakness is stated rather than hidden: `--use-migra` prints this same
 * verdict when it could not connect at all, so for that engine a verdict means
 * "the CLI completed", not "the database answered". Only the pg-delta pass,
 * which exits non-zero on a connection it cannot make, establishes the second.
 *
 * @param stderr - everything the CLI wrote to stderr during one run.
 * @returns true when the verdict line is present.
 */
export function reportedNoChanges(stderr) {
  return CLEAN_VERDICT.test(stderr);
}

/**
 * Reads one pg-delta run: its statements, and the comment ones among them.
 *
 * Throws {@link OutputShapeError} rather than returning an empty result when
 * the run cannot be trusted. **That distinction is the whole point of this
 * module.** A comment drift the parse fails to isolate would otherwise be
 * reported as `0 comment(s) differ` — a green tick over real drift, for ever,
 * with nothing in the log to tell it apart from a clean project.
 *
 * An empty stdout is answered by the verdict on stderr and by nothing else. A
 * non-empty stdout is parsed, and three things are checked, each closing a
 * different way the parse could go blind:
 *
 * 1. **Still the format this was written against.** The diff must open with
 *    pg-delta's `-- Migration unit` header as a chunk of its own, and must
 *    split into more than that one chunk. A run whose blank lines have gone
 *    entirely is one chunk, and cannot be read at all.
 * 2. **Still written the way the filter matches.** Every line that reads as a
 *    comment statement in any casing or indentation must also match the exact
 *    `COMMENT ON ` form the filter uses. This is what a lower-cased keyword or
 *    an added indent trips, and neither is visible to the other two checks.
 * 3. **Containment.** Every `COMMENT ON` beginning a line must come back as a
 *    statement of its own. This is the load-bearing one: it is coupled
 *    directly to what the caller depends on, so the guard cannot pass while the
 *    comment pass is blind, and it holds however the separator changes because
 *    it never asks how statements are joined.
 *
 * Check 2 could in principle fire on real drift rather than a format change — a
 * drifted function body would have to carry a line beginning, in any casing,
 * with `comment on `, which no function in this schema does. It would be the
 * wrong message for the situation but still a red while real drift exists,
 * which is the safe direction to be wrong in.
 *
 * @param run - one completed run: `stdout` carries the diff, `stderr` the
 *   CLI's own progress and its verdict. Both are required, because a clean run
 *   puts its only evidence in the second.
 * @returns whether the run was clean, the statements found, and the subset of
 *   them that are comments. A clean run returns both lists empty.
 * @throws OutputShapeError when neither outcome is recognisable, or when the
 *   diff's shape says the parse is unreliable.
 */
export function readDiffRun(run) {
  const text = run.stdout.trim();

  if (text === "") {
    if (!reportedNoChanges(run.stderr)) {
      throw new OutputShapeError(
        'pg-delta wrote no diff and never printed the "No schema changes ' +
          'found" verdict, so nothing says it reached the database and ' +
          "finished. That is a wrong password, a connection lost mid-run, or " +
          "a CLI that no longer understands the flags this check passes — not " +
          "a clean project, which says so in as many words.",
      );
    }
    return { clean: true, statements: [], comments: [] };
  }

  const statements = text
    .split(/\n{2,}/)
    .map((statement) => statement.trim())
    .filter(Boolean);

  if (statements.length < 2 || !UNIT_HEADER.test(statements[0])) {
    throw new OutputShapeError(
      `Read ${statements.length} chunk(s), the first of which is not the ` +
        "`-- Migration unit` header every pg-delta diff opens with. Either " +
        "the statements are no longer separated by a blank line — in which " +
        "case a COMMENT ON anywhere but the very start would be dropped " +
        "without a trace — or the output format changed and the COMMENT ON " +
        "filter must be refitted against it.",
    );
  }

  const written = count(text, COMMENT_HOWEVER_WRITTEN);
  const present = count(text, COMMENT_AT_LINE_START);
  if (written !== present) {
    throw new OutputShapeError(
      `The output contains ${written} line(s) that read as a comment ` +
        `statement but only ${present} in the exact \`COMMENT ON \` form this ` +
        "filter matches. The keyword case or the indentation moved, so every " +
        "comment in this run is invisible to the filter.",
    );
  }

  const comments = statements.filter((statement) =>
    statement.startsWith("COMMENT ON "),
  );
  if (present !== comments.length) {
    throw new OutputShapeError(
      `The output contains ${present} line(s) beginning COMMENT ON but the ` +
        `parse isolated ${comments.length} comment statement(s). Whatever it ` +
        "failed to isolate is real drift that would have gone unreported.",
    );
  }

  return { clean: false, statements, comments };
}
