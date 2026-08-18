import { describe, expect, it } from "vitest";
import {
  explainCliFailure,
  OutputShapeError,
  readDiffRun,
  reportedNoChanges,
} from "../../scripts/schema-drift-output.mjs";

/**
 * Every fixture is shaped like real `supabase db diff --use-pg-delta` output
 * measured on 2026-08-17, against both the hosted project and a local stack
 * built from the same migrations. Two shapes were measured, and the parse has
 * to tell them apart:
 *
 * - **Clean.** stdout is EMPTY. The verdict — `No schema changes found` — is
 *   printed on stderr, after the CLI's progress lines.
 * - **Drifted.** stdout opens with a `-- Migration unit` header paragraph, then
 *   a `SET`, then one statement per paragraph separated by a blank line. stderr
 *   carries the progress lines and no verdict.
 *
 * The ~26 `GRANT`/`ALTER DEFAULT PRIVILEGES` statements measured a day earlier
 * are absent from both, which is why they appear in no fixture here: pg-delta
 * is an alpha the CLI fetches at run time, and a guard that required that noise
 * threw on every clean database until this suite was rewritten.
 *
 * The fixtures are deliberately small rather than a captured file. A captured
 * fixture only ever proves the parse still reads last week's format; what has
 * to be proved is that the parse REFUSES on the formats it cannot read.
 */
const HEADER =
  "-- Migration unit 1: schema_changes\n" +
  "-- Transaction mode: transactional\n" +
  "-- Boundary reason: default";

const SET_STATEMENT = "SET check_function_bodies = false;";

const STATEMENTS = [
  "CREATE OR REPLACE FUNCTION public.is_container_mode (\n  p_mode text\n)\n  RETURNS boolean\n  LANGUAGE sql\n  AS $function$\n  select p_mode in ('stack', 'grid')\n$function$;",
  "GRANT DELETE, INSERT, SELECT, UPDATE ON public.actors TO service_role;",
];

const COMMENT =
  "COMMENT ON COLUMN public.actor_profiles.sections IS 'Actor sections. Validated by set_actor_sections.';";

/** The CLI's progress chatter, which both outcomes print and neither proves. */
const PROGRESS =
  "Creating shadow database...\n" +
  "Applying migration 0001_actors.sql...\n" +
  "Diffing schemas: public\n" +
  "Finished supabase db diff on branch feat/blocks-and-grids.\n";

/** What a clean run leaves behind: nothing on stdout, the verdict on stderr. */
const CLEAN_STDERR = `${PROGRESS}\nNo schema changes found\n`;

/** Joins statements the way pg-delta does today: one blank line between each. */
const healthy = (...statements: string[]) =>
  [HEADER, SET_STATEMENT, ...statements].join("\n\n");

/** A drifted run: the diff on stdout, no verdict on stderr. */
const drifted = (...statements: string[]) => ({
  stdout: healthy(...statements),
  stderr: PROGRESS,
});

/**
 * The filter as it would be written without a containment guard: split on
 * blank lines, keep the chunks that start with `COMMENT ON `.
 *
 * Restated here rather than imported, because the point of the assertions that
 * use it is that a shape can satisfy it and still be blind — which is only
 * visible when the naive filter is applied to the same bytes as the real one.
 */
const naiveCommentFilter = (raw: string) =>
  raw
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.startsWith("COMMENT ON "));

describe("reportedNoChanges", () => {
  it("recognises the verdict among the CLI's progress lines", () => {
    expect(reportedNoChanges(CLEAN_STDERR)).toBe(true);
  });

  it("does not recognise progress alone as a verdict", () => {
    expect(reportedNoChanges(PROGRESS)).toBe(false);
  });

  it("does not accept the phrase buried inside another line", () => {
    // Anchored to a whole line so that it is the CLI's own conclusion being
    // read, and not a sentence that quoted it — an upstream reword would take
    // this check red rather than let a non-verdict pass as one.
    expect(
      reportedNoChanges("hint: No schema changes found unless you --linked\n"),
    ).toBe(false);
  });
});

/**
 * Real stderr from a run that failed because a local Supabase stack — started
 * by `pnpm db:start` — already held the shadow database's port. Measured on
 * 2026-08-17. Docker names the endpoint after the container.
 */
const PORT_TAKEN_STDERR =
  "Creating shadow database...\n" +
  'failed to start docker container "": Error response from daemon: failed to ' +
  "set up container networking: driver failed programming external " +
  "connectivity on endpoint shadow_db (0940f57365f7): Bind for " +
  "0.0.0.0:54320 failed: port is already allocated\n\n" +
  "Try stopping the running project with supabase stop --project-id aeleos\n" +
  "failed to provision the shadow database: exit 1\n";

describe("explainCliFailure", () => {
  it("names the port, and both things that hold it", () => {
    const advice = explainCliFailure(PORT_TAKEN_STDERR);

    expect(advice).toContain("port 54320");
    expect(advice).toContain("pnpm db:start");
    expect(advice).toContain("shadow container left behind");
  });

  it("reads the port out of the message rather than assuming one", () => {
    // config.toml can move it, and a wrong number would send the reader to
    // free a port nothing is holding.
    const advice = explainCliFailure(
      PORT_TAKEN_STDERR.replace("0.0.0.0:54320", "[::]:54399"),
    );

    expect(advice).toContain("port 54399");
  });

  it("says nothing about a failure it does not recognise", () => {
    // A wrong password, a dead Docker daemon and a network timeout all arrive
    // here, and the CLI has already explained each of them itself.
    expect(
      explainCliFailure(
        "error diffing schema: error running script:\nError: timeout " +
          "exceeded when trying to connect\n",
      ),
    ).toBeNull();
  });
});

describe("readDiffRun, on a clean run", () => {
  it("reads an empty stdout as clean when the verdict says so", () => {
    // The regression test for the defect that made this rewrite: a clean
    // database exited 1 saying nothing had been compared, because the only
    // proof of life the parse accepted was noise pg-delta had stopped
    // printing. Sabotage-verify by deleting the verdict branch — this goes red.
    const run = readDiffRun({ stdout: "", stderr: CLEAN_STDERR });

    expect(run).toEqual({ clean: true, statements: [], comments: [] });
  });

  it("reads a whitespace-only stdout the same way", () => {
    expect(readDiffRun({ stdout: "  \n\n ", stderr: CLEAN_STDERR }).clean).toBe(
      true,
    );
  });

  it("refuses an empty stdout with no verdict, which is how a wrong password looks", () => {
    expect(() => readDiffRun({ stdout: "", stderr: PROGRESS })).toThrow(
      OutputShapeError,
    );
    expect(() => readDiffRun({ stdout: "", stderr: PROGRESS })).toThrow(
      /never printed the "No schema changes found" verdict/,
    );
  });

  it("refuses a run that wrote nothing at all", () => {
    expect(() => readDiffRun({ stdout: "", stderr: "" })).toThrow(
      OutputShapeError,
    );
  });
});

describe("readDiffRun, on a diff", () => {
  it("reads a diff with no comments among its statements", () => {
    const run = readDiffRun(drifted(...STATEMENTS));

    expect(run.clean).toBe(false);
    expect(run.statements).toHaveLength(STATEMENTS.length + 2);
    expect(run.comments).toEqual([]);
  });

  it("isolates a comment that sits after every other statement", () => {
    const run = readDiffRun(drifted(...STATEMENTS, COMMENT));

    expect(run.statements).toContain(COMMENT);
    expect(run.comments).toEqual([COMMENT]);
  });

  it("accepts output that has not been trimmed", () => {
    const run = readDiffRun({
      stdout: `\n\n${healthy(...STATEMENTS, COMMENT)}\n\n`,
      stderr: PROGRESS,
    });

    expect(run.comments).toEqual([COMMENT]);
  });

  it("reads a diff even when the run also printed the verdict", () => {
    // Belt and braces: a diff is a positive signal on its own, so stdout wins
    // and the stderr is not consulted. Nothing in the CLI does both today.
    const run = readDiffRun({
      stdout: healthy(...STATEMENTS, COMMENT),
      stderr: CLEAN_STDERR,
    });

    expect(run.comments).toEqual([COMMENT]);
  });
});

describe("readDiffRun, on a shape it cannot trust", () => {
  it("refuses when the statements collapse into one chunk after the header", () => {
    // The reproduction the parse exists for. A tool is likelier to change how
    // it joins STATEMENTS than to stop separating its preamble, so the header
    // keeps its blank line and the run still splits — into chunks that look
    // entirely healthy while the comment inside one of them is invisible.
    const collapsed = {
      stdout: [HEADER, SET_STATEMENT, [...STATEMENTS, COMMENT].join("\n")].join(
        "\n\n",
      ),
      stderr: PROGRESS,
    };

    expect(naiveCommentFilter(collapsed.stdout)).toEqual([]);
    expect(collapsed.stdout).toContain(COMMENT);

    expect(() => readDiffRun(collapsed)).toThrow(OutputShapeError);
    expect(() => readDiffRun(collapsed)).toThrow(
      /contains 1 line\(s\) beginning COMMENT ON but the parse isolated 0/,
    );
  });

  it("refuses when the whole run collapses into a single chunk", () => {
    const stdout = healthy(...STATEMENTS, COMMENT).replaceAll(/\n{2,}/g, "\n");

    expect(stdout.split(/\n{2,}/)).toHaveLength(1);
    expect(() => readDiffRun({ stdout, stderr: PROGRESS })).toThrow(
      /Read 1 chunk\(s\)/,
    );
  });

  it("refuses a diff that does not open with the unit header", () => {
    // The header is what says "this is still the format this parse was written
    // against", now that the platform noise that used to say it is gone.
    const stdout = [SET_STATEMENT, ...STATEMENTS, COMMENT].join("\n\n");

    expect(() => readDiffRun({ stdout, stderr: PROGRESS })).toThrow(
      /is not the `-- Migration unit` header/,
    );
  });

  it("refuses a comment glued to the end of an otherwise healthy chunk", () => {
    const glued = drifted(
      ...STATEMENTS,
      `GRANT USAGE ON SCHEMA public TO service_role;\n${COMMENT}`,
    );

    expect(naiveCommentFilter(glued.stdout)).toEqual([]);
    expect(() => readDiffRun(glued)).toThrow(
      /contains 1 line\(s\) beginning COMMENT ON but the parse isolated 0/,
    );
  });

  it("refuses when statements grow an indent", () => {
    expect(() => readDiffRun(drifted(...STATEMENTS, `  ${COMMENT}`))).toThrow(
      /only 0 in the exact `COMMENT ON ` form/,
    );
  });

  it("refuses when the keywords are written in lower case", () => {
    // Nothing else here could see this: the chunks are separated correctly,
    // the header is intact, and the filter simply matches nothing for ever.
    expect(() =>
      readDiffRun(drifted(...STATEMENTS, COMMENT.toLowerCase())),
    ).toThrow(/only 0 in the exact `COMMENT ON ` form/);
  });

  it("refuses when the keywords grow a second space", () => {
    expect(() =>
      readDiffRun(
        drifted(...STATEMENTS, COMMENT.replace("COMMENT ON", "COMMENT  ON")),
      ),
    ).toThrow(/contains 1 line\(s\) that read as a comment statement/);
  });
});

describe("OutputShapeError", () => {
  it("is named, so a caller can tell it from a programming fault", () => {
    const error = new OutputShapeError("shape moved");

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("OutputShapeError");
    expect(error.message).toBe("shape moved");
  });
});
