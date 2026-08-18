#!/usr/bin/env node
/**
 * Fails when the LIVE AeleOS database and `supabase/migrations/` disagree.
 *
 * This exists because of a defect nothing else in the repository could see.
 * The migration set is squashed so that every object is defined exactly once,
 * which makes a change to an existing function an **edit in place** to the file
 * that already defines it. Supabase records that file as applied, and
 * `supabase db push` never re-runs an applied file — so an in-place edit
 * reaches the migration set and never reaches the database, silently and
 * permanently.
 *
 * Measured, not theorised: `set_actor_sections()` on the live project was
 * missing its entire per-section style-validation block, so `skin`,
 * `background_url`, `background_fit` and `card_size` were unvalidated at the
 * database level for five merged pull requests. `pnpm test:db` could not see
 * it, because it builds a FRESH database from the files — where drift cannot
 * exist by construction. `conformance` runs that same fresh build, so it could
 * not see it either, and the `actor_profiles.sections` column comment — the one
 * signal this repository's conventions ask to be kept in step — was current, so
 * it was truthful about the file and false about the database.
 *
 * **A pass per engine, because no single one sees everything.** Measured
 * against this project on 2026-08-17:
 *
 * | engine          | `COMMENT ON` | noise with no drift present |
 * | --------------- | ------------ | --------------------------- |
 * | `pg-delta`      | yes          | none, as of 2026-08-17      |
 * | `migra`         | no           | none                        |
 * | `pg-schema-diff`| no           | none                        |
 *
 * So `migra` is the structural pass and any output at all fails it, and
 * `pg-delta` is the comment pass where only `COMMENT ON` counts.
 *
 * **That noise column moved under us, and it is the reason this file has a
 * history.** On 2026-08-16 pg-delta added ~26 `GRANT` and `ALTER DEFAULT
 * PRIVILEGES` statements to every diff — the hosted project's own default
 * privileges, which `0001` names and deliberately does not restate. On
 * 2026-08-17 they are gone: pg-delta is an alpha the CLI fetches at run time,
 * so "what this engine always prints" is somebody else's release schedule.
 * Nothing here may depend on that noise again. What it cost is written up in
 * `schema-drift-output.mjs`, which had made it the proof that anything ran.
 *
 * **Every pass always runs, and the comment pass goes first, because migra lies
 * about failure.** Measured the same day: `--use-migra` given a deliberately
 * wrong password EXITS 0, prints "No schema changes found" and writes nothing
 * to stdout — a result no different from a clean project. Had that been the
 * only pass, this job would have gone silently and permanently green the first
 * time the secret was rotated or renamed. `pg-delta` reports the authentication
 * failure and exits non-zero, so running it first makes a connection to the
 * live database a precondition of reaching any verdict at all.
 *
 * Findings are reported structure-first even so, because a drifted function
 * body is the bigger fact and it is also what could feed the comment pass's
 * line-shaped match a fragment of its own body.
 *
 * **The comment pass reads text, so its parse is its own module and its own
 * suite.** `schema-drift-output.mjs` splits pg-delta's output and refuses to
 * return when the shape says it can no longer be trusted — refuses in a way
 * coupled to what this file depends on, rather than merely asking whether
 * anything still looks like a statement.
 *
 * **A pass is accepted on a positive signal and never on silence.** The CLI
 * splits its answer across two streams — a diff on stdout, "No schema changes
 * found" on stderr — so a pass that wrote nothing anywhere has not told us it
 * ran, and that is exactly what a wrong password or a connection lost mid-run
 * looks like. Both streams are therefore captured rather than inherited, and
 * an empty stdout is believed only when the verdict says so. The cost is that
 * the CLI's own progress no longer streams as it happens: it is written out
 * when the pass ends, which for a shadow-database build is a minute of
 * apparent silence. Worth it, and the alternative was reading a clean run's
 * only evidence off a stream nothing was keeping.
 *
 * **The structural pass has no equivalent, and cannot have one here.** migra
 * emits SQL or nothing, so "the schemas differ" and "these two were never
 * going to compare equal" — a CLI bump, or a shadow database built at a
 * different PostgreSQL major version from the live project's — are the same
 * answer. What stands in for a canary is honesty: the versions are printed on
 * every run and repeated in the failure, and the failure says outright that
 * they are a candidate explanation. See `versions` and `drifted`'s shape 4.
 *
 * It is still held to the same positive signal: an empty stdout counts as
 * clean only when the verdict was printed. That is worth less here than it is
 * for pg-delta and is not sold as more — migra prints the verdict on a wrong
 * password too — but a migra pass that printed NEITHER a diff nor a verdict is
 * a run that did not happen, and this check will not read that as agreement.
 *
 * **Making this a required check has a cost that is not this script's to pay,
 * and it must be settled first.** The comparison is live against THE BRANCH's
 * migrations, and the remedy for shape 1 is a hand-push to live — which
 * immediately puts live ahead of every other branch's files. So one pull
 * request going green turns every other open one, and `main`, red until it
 * merges, with nothing their authors can do about it; and an abandoned push
 * leaves live ahead of `main` with no rollback. Serialising the hand-push as
 * the last step before a merge is what makes that survivable, and `drifted`
 * says so where somebody hitting it will read it. The alternative worth
 * weighing before requiring this is to diff live against `origin/main`'s
 * migrations rather than the branch's — "drift" would then mean "`main` and
 * live disagree", which is the actual invariant and is unaffected by any open
 * pull request.
 *
 * **One residual false green is accepted, knowingly.** The comment pass proves
 * the database was reachable when IT ran; the structural pass runs a minute
 * later. A connection lost in between gives migra its usual exit 0 and
 * "No schema changes found", and the structural half is then never compared
 * while the job reports green. No signal exists to catch it, because migra's
 * success and its failure are byte-identical. Closing it would mean deriving
 * structure from `pg-delta` as well and subtracting a hand-maintained list of
 * its platform noise — trading engines that need no upkeep for a list that
 * silently rots and can hide the very drift it is filtering past. The window is
 * one transient network failure landing inside a specific minute, and the next
 * pull request checks again. Accepted on that basis; do not let it become
 * folklore that it was overlooked.
 *
 * **The connection string is built from a constant** in `aeleos-project.mjs`
 * and this script supplies only a password, so it cannot be pointed at Libra —
 * which is in production — by a mistyped variable or a stale shell.
 *
 * Requires: Docker (the CLI builds a shadow database from the migration files),
 * and the project's database password as `SUPABASE_DB_PASSWORD` or
 * `AELEOS_DB_PASSWORD`, or `SUPABASE_DB_PASSWORD` in `.secrets`.
 *
 * Usage: `pnpm check:schema-drift`
 */
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import {
  POOLER_DESCRIPTION,
  PROJECT_NAME,
  PROJECT_REF,
  poolerUrl,
} from "./aeleos-project.mjs";
import {
  explainCliFailure,
  OutputShapeError,
  readDiffRun,
  reportedNoChanges,
} from "./schema-drift-output.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The CLI's own entry point, run with this Node rather than through a shell.
 *
 * `pnpm exec supabase` would need `shell: true`, and the connection string —
 * which carries the database password — is an argument. Concatenating that into
 * a shell command line is both a quoting bug waiting for a password containing
 * a shell metacharacter and the thing Node's DEP0190 warns about. The package's
 * `bin` is a Node script, so `process.execPath` runs it directly on every
 * platform, with the arguments passed as an array and never parsed by anything.
 */
const supabaseManifest = createRequire(import.meta.url).resolve(
  "supabase/package.json",
);
const supabaseCli = resolve(dirname(supabaseManifest), "dist/supabase.js");

/**
 * The two versions that decide whether a comparison is meaningful at all.
 *
 * **The structural pass has no canary, and this is what stands in for one.**
 * The comment pass can notice its own blindness, because it reads text and
 * {@link readDiffStatements} refuses a shape it no longer understands. migra
 * emits SQL or nothing, and "the schemas differ" and "these two engines were
 * never going to agree" are byte-identical answers — a CLI bump, or a shadow
 * database built at a different PostgreSQL major version from the live
 * project's, is reported as drift with remedies that do not apply. Nothing
 * available here distinguishes them, so the honest move is to name the two
 * inputs on every run and in every drift report, and to say in {@link drifted}
 * that they are a candidate explanation. Do not read the presence of these
 * numbers as a check on them: they are printed, not compared.
 *
 * `major_version` is read rather than assumed because `config.toml` is what
 * the CLI builds the shadow database from; a missing or renamed key reports
 * "unknown" instead of guessing, since a wrong number here would be worse
 * than none.
 */
const versions = (() => {
  const cli = JSON.parse(readFileSync(supabaseManifest, "utf8")).version;
  const configPath = resolve(rootDir, "supabase/config.toml");
  const major = existsSync(configPath)
    ? /^\s*major_version\s*=\s*(\d+)/m.exec(readFileSync(configPath, "utf8"))
    : null;
  return { cli, shadowMajor: major?.[1] ?? "unknown" };
})();

/** The app's own schema. Everything else on the project belongs to Supabase. */
const SCHEMA = "public";

/**
 * Prints a line of progress.
 *
 * @param message - what happened.
 */
function log(message) {
  process.stdout.write(`[schema-drift] ${message}\n`);
}

/**
 * Reports that no comparison could be made, and exits non-zero.
 *
 * Kept apart from {@link drifted} because the two are different answers and the
 * advice for them is different. "The schemas disagree" is a finding; "I could
 * not look" is a broken check, and dressing the second as the first sends
 * whoever reads the log looking for a drift that was never measured.
 *
 * Exits immediately after writing. On the Linux pipes CI runs on, stderr writes
 * are synchronous and the message always lands; on Windows pipes they are not,
 * so a local run can occasionally exit red with its explanation cut short. Run
 * it again in a terminal if that happens.
 *
 * @param headline - what went wrong.
 * @param body - the detail.
 * @returns never; the process exits.
 */
function abort(headline, body) {
  process.stderr.write(`\n[schema-drift] ${headline}\n\n${body}\n\n`);
  process.stderr.write(
    "[schema-drift] Nothing was compared. This is not a clean result.\n",
  );
  process.exit(1);
}

/**
 * Reports the drift and exits non-zero.
 *
 * @param headline - what disagreed.
 * @param body - the diff.
 * @returns never; the process exits.
 */
function drifted(headline, body) {
  process.stderr.write(`\n[schema-drift] ${headline}\n\n${body}\n\n`);
  process.stderr.write(
    "[schema-drift] The live database and supabase/migrations/ disagree.\n" +
      "[schema-drift]\n" +
      "[schema-drift] Read the DDL above as a description of the LIVE side: it\n" +
      "[schema-drift] is what a migration would have to say to produce what the\n" +
      "[schema-drift] project currently has. Whichever side is wrong is a\n" +
      "[schema-drift] judgement, not something this check can make.\n" +
      "[schema-drift]\n" +
      "[schema-drift] Drift comes in shapes, and they want different fixes:\n" +
      "[schema-drift]\n" +
      "[schema-drift]  1. An existing function, view, constraint or comment\n" +
      "[schema-drift]     reads differently. An in-place edit to an already\n" +
      "[schema-drift]     applied migration never reached the project, because\n" +
      "[schema-drift]     `db push` will not re-run one. Run that file's own\n" +
      "[schema-drift]     definition against the project by hand — `create or\n" +
      "[schema-drift]     replace function` and `comment on` are idempotent.\n" +
      "[schema-drift]     This is the case the check was built for.\n" +
      "[schema-drift]\n" +
      "[schema-drift]  2. A whole object is missing from the project and your\n" +
      "[schema-drift]     branch adds a migration for it. You have not pushed\n" +
      "[schema-drift]     it yet: `supabase db push`. Migrations reach this\n" +
      "[schema-drift]     project by hand — no workflow pushes them — so that\n" +
      "[schema-drift]     is a step before the merge, not after.\n" +
      "[schema-drift]\n" +
      "[schema-drift]  3. Only `grant … to service_role` on a table you added.\n" +
      "[schema-drift]     Nothing is wrong with the project: the hosted default\n" +
      "[schema-drift]     privileges granted it and the migration file did not.\n" +
      "[schema-drift]     Add the grant to the file, beside the table — 0011\n" +
      "[schema-drift]     says why every table states it rather than inherits.\n" +
      "[schema-drift]\n" +
      "[schema-drift]  4. None of the above, and nothing you changed is in it.\n" +
      "[schema-drift]     Then the two sides may not be comparable rather than\n" +
      "[schema-drift]     different: the engine is whatever version the lockfile\n" +
      "[schema-drift]     holds, and the shadow database is built at\n" +
      "[schema-drift]     config.toml's major_version, which the live project\n" +
      "[schema-drift]     need not share. Versions for this run are above. A\n" +
      "[schema-drift]     CLI bump or a Postgres skew is reported HERE, as\n" +
      "[schema-drift]     drift, because no engine tells us the difference — so\n" +
      "[schema-drift]     compare those two before hand-applying anything.\n" +
      "[schema-drift]\n" +
      "[schema-drift] Before fixing shape 1 or 2 by hand, read the cost to\n" +
      "[schema-drift] everybody else: the hand-push makes LIVE the newer side,\n" +
      "[schema-drift] so every other open pull request — and `main` — sees drift\n" +
      "[schema-drift] until yours merges, and nothing their authors can do fixes\n" +
      "[schema-drift] it. Push last, immediately before the merge, one pull\n" +
      "[schema-drift] request at a time; and if yours is abandoned afterwards,\n" +
      "[schema-drift] the push has to be undone by hand — nothing rolls it back.\n",
  );
  process.exit(1);
}

/**
 * Reads a value out of `.secrets`, which is a `KEY=value` file per line.
 *
 * @param key - the name to look for.
 * @returns the value, or null when the file or the key is absent.
 */
function readSecret(key) {
  const path = resolve(rootDir, ".secrets");
  if (!existsSync(path)) return null;
  const match = new RegExp(`^${key}=(.*)$`, "m").exec(
    readFileSync(path, "utf8"),
  );
  return match ? match[1].trim() : null;
}

/**
 * Runs one `supabase db diff` pass and returns both of the streams it wrote.
 *
 * Exits the process when the CLI itself fails. A check that reports "no drift"
 * because it could not reach the database is worse than no check: it is a green
 * tick that means nothing, which is the exact failure three tools in this
 * repository shipped with.
 *
 * **stderr is captured and written back out, rather than inherited.** The CLI
 * puts its "No schema changes found" verdict there, and that verdict is the
 * only evidence a clean run leaves — inheriting the stream sends it to the
 * terminal where this check cannot read it, which is how a clean database came
 * to be reported as "nothing was compared". Everything the CLI wrote is
 * printed unchanged so its own errors still reach whoever is reading, at the
 * cost of arriving when the pass ends instead of as it happens.
 *
 * @param dbUrl - the connection string, never logged.
 * @param engine - the CLI's engine flag. Required, and there is no "let the CLI
 *   decide" value: the default happening to be pg-delta is what the whole
 *   design once rested on, and a moved default would have cost comment
 *   sensitivity and the honest exit code in one silent step. An unknown flag
 *   fails loudly instead. Do not reintroduce a nullable engine here.
 * @returns the diff on `stdout`, trimmed, and everything the CLI wrote to
 *   `stderr`.
 */
function diff(dbUrl, engine) {
  const result = spawnSync(
    process.execPath,
    [
      supabaseCli,
      "db",
      "diff",
      "--db-url",
      dbUrl,
      "--schema",
      SCHEMA,
      engine,
      // The CLI prints JSON when it believes it is talking to an agent and SQL
      // when it believes it is talking to a person. Which of those CI counts as
      // is not something this check should depend on.
      "--agent",
      "no",
      "--yes",
    ],
    { cwd: rootDir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  const stderr = result.stderr ?? "";
  // Straight back out, before any verdict, so the CLI's own account of a
  // failure still precedes ours exactly as it did when this stream was
  // inherited.
  process.stderr.write(stderr);
  if (result.status !== 0) {
    // Deliberately not a guess at the cause. A wrong password, an unreachable
    // host, a stopped Docker daemon and a migration that will not apply to the
    // shadow database all leave through here, and the CLI's own stderr is
    // printed above — so the real error is already on screen, and naming a
    // couple of them below it would assert something this check never
    // established. The one exception is a failure whose signature says exactly
    // what happened and what to do: see {@link explainCliFailure}, which names
    // the shadow database's port and nothing else.
    abort(
      `supabase db diff exited ${result.status ?? "on a signal"}.`,
      explainCliFailure(stderr) ?? "The CLI's own error is above.",
    );
  }
  return { stdout: (result.stdout ?? "").trim(), stderr };
}

/**
 * Reads the comment pass's run, or aborts saying it could not be read.
 *
 * **This parse must be able to notice its own blindness.** Reading another
 * tool's output by shape means an upstream formatting change — single newlines
 * between statements, an added indent, a lower-cased keyword — could turn the
 * comment filter into a permanent, silent zero that logs "0 comment(s) differ"
 * for ever, with nothing to distinguish it from a clean project.
 *
 * The guards live in {@link readDiffRun} rather than here, and they are coupled
 * to what this caller depends on: a `COMMENT ON` present in the raw output but
 * not isolated as a statement raises, and so does a run that ended without
 * either a diff or the CLI's clean verdict. So the parse cannot succeed while
 * the comment pass is blind, nor while nothing has established that the pass
 * happened at all.
 *
 * An unreadable run is a could-not-look, not a finding, so it leaves through
 * {@link abort} and carries the "Nothing was compared" line.
 *
 * @param run - the pg-delta pass's two streams.
 * @returns whether it was clean, the statements read, and the comment ones
 *   among them.
 */
function readStatements(run) {
  try {
    return readDiffRun(run);
  } catch (error) {
    if (!(error instanceof OutputShapeError)) throw error;
    abort("pg-delta's run could not be read as an answer.", error.message);
    // Unreachable: abort() exits. Present so every path returns a value.
    return { clean: false, statements: [], comments: [] };
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

const password =
  process.env.SUPABASE_DB_PASSWORD ??
  process.env.AELEOS_DB_PASSWORD ??
  readSecret("SUPABASE_DB_PASSWORD");

// Through abort() like every other could-not-look path, so it carries the
// "Nothing was compared" line too. A missing secret expands to "" in a workflow
// rather than going unset, which is why this tests the value and not the key.
if (!password) {
  abort(
    "no database password.",
    "Set SUPABASE_DB_PASSWORD, or run `pnpm sync-secrets` to write .secrets.",
  );
}

// **Masked before the DSN is built, and masked in its ENCODED form.** Actions
// masks the literal secret it injected; `poolerUrl` percent-encodes the
// password into the DSN, so a password containing `@`, `+`, `/`, `%`, `#`, `:`
// or a space — precisely the ones that need encoding — becomes a string the
// masker has never seen. That matters here because stderr is INHERITED: this
// script hands it to the CLI, which hands it to its own shadow provisioner, so
// a third-party binary printing the connection string would print an unmasked
// database credential into a public repository's build log. Nothing in this
// repository prints it, and the CLI redacts its own output; masking the value
// that could actually appear is what stops that from being the whole defence.
// It must repeat `poolerUrl`'s encoding, because masking the raw password
// would cover a string that never reaches a log.
if (process.env.GITHUB_ACTIONS) {
  process.stdout.write(`::add-mask::${encodeURIComponent(password)}\n`);
}

const dbUrl = poolerUrl(password);

log(
  `target: ${PROJECT_NAME} (${PROJECT_REF}) via ${POOLER_DESCRIPTION}, schema ${SCHEMA}`,
);
// Named on every run, clean or not, so the log of a green run is the record
// somebody compares against when a later run goes red for no reason they can
// find in their own diff. See {@link versions}.
log(
  `engine: supabase CLI ${versions.cli}, shadow database at PostgreSQL ${versions.shadowMajor}`,
);

// **The comment pass runs first, and its exit code is the connection proof.**
// Measured on 2026-08-17: `--use-migra` given a deliberately wrong password
// EXITS 0, prints "No schema changes found" and writes nothing to stdout —
// indistinguishable from a clean project. `pg-delta` reports the authentication
// failure and exits non-zero, as a command that could not do its job should. So
// the honest engine goes first, and no green verdict is reachable without it
// having connected.
//
// **`--use-pg-delta` is named rather than left to the CLI's default.** The
// default happens to be pg-delta today. If it ever moved to migra, this pass
// would lose comment sensitivity AND the honest exit code in one step, and the
// whole check would go permanently green on a blank password — the failure this
// shape exists to prevent, walking back in through the door marked "default".
log("comment pass (pg-delta) — the one thing migra cannot see");
const { clean, statements, comments } = readStatements(
  diff(dbUrl, "--use-pg-delta"),
);
// Both outcomes are named, and neither is silence. "reported no changes" is
// the CLI's own verdict quoted back; a count of statements is a diff that was
// actually read. A reader can tell from the log which of the two happened,
// which is the thing this check could not say when it treated the first as a
// broken parse.
log(
  clean
    ? "comment pass: pg-delta reported no changes at all"
    : `comment pass: ${statements.length} statement(s) read, ${comments.length} comment(s) differ`,
);

log(
  "structural pass (migra) — tables, functions, views, constraints, policies",
);
const migra = diff(dbUrl, "--use-migra");
const structural = migra.stdout;

// An empty stdout is believed only when migra said so. It is a weaker claim
// than the comment pass's — migra prints this verdict on a wrong password too,
// which is why that pass runs first — but a run that printed neither a diff nor
// a verdict never reached a conclusion, and this must not be read as agreement.
if (structural === "" && !reportedNoChanges(migra.stderr)) {
  abort(
    'migra printed neither a diff nor its "No schema changes found" verdict.',
    "The structural half of the comparison reached no conclusion. The CLI's\n" +
      "own output is above; a changed message, a changed flag or a run that\n" +
      "died quietly are the candidates.",
  );
}

// Structure before comments when both differ. A drifted function body is the
// bigger fact, and it is also the one that can make the line-shaped match above
// pick up a fragment of its own body.
if (structural !== "") {
  // Deliberately hedged, unlike the comment pass's headline. migra says the
  // same thing for "the schemas differ" and for "I was comparing two things
  // that were never going to agree", and it has no canary that could tell
  // them apart — see {@link versions} and shape 4 below. Stating drift
  // outright here would send the first person who hits a CLI bump off to
  // hand-apply SQL that is not the problem.
  drifted(
    "The live schema and the migration files did not compare equal under " +
      `supabase CLI ${versions.cli}, shadow database at PostgreSQL ` +
      `${versions.shadowMajor}. migra would need to apply:`,
    structural,
  );
}
if (comments.length > 0) {
  drifted(
    "A comment on the live database differs from the migration files:",
    comments.join("\n\n"),
  );
}

log("the live database matches supabase/migrations/");
