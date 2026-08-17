import { describe, expect, it } from "vitest";
import {
  OutputShapeError,
  readDiffStatements,
} from "../../scripts/schema-drift-output.mjs";

/**
 * The guard this suite exists for is a guard against an UPSTREAM formatting
 * change, so every fixture is shaped like real `pg-delta` output measured
 * against the hosted project on 2026-08-17: a `-- Migration unit` header
 * paragraph, a `SET`, then one statement per paragraph separated by a blank
 * line, with the platform default-privilege noise always present. That run was
 * 29 chunks, 26 of them noise, and the one `COMMENT ON` at index 27.
 *
 * The fixtures are deliberately small rather than a captured file. A captured
 * fixture only ever proves the parse still reads last year's format; what has
 * to be proved is that the parse REFUSES on the formats it cannot read.
 */
const HEADER =
  "-- Migration unit 1: schema_changes\n" +
  "-- Transaction mode: transactional\n" +
  "-- Boundary reason: default";

const SET_STATEMENT = "SET check_function_bodies = false;";

const NOISE = [
  "ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO service_role;",
  "GRANT DELETE, INSERT, SELECT, UPDATE ON public.actors TO service_role;",
  "GRANT DELETE, INSERT, SELECT, UPDATE ON public.actor_profiles TO service_role;",
  "GRANT ALL ON FUNCTION public.ensure_person_actor(text) TO service_role;",
  "GRANT DELETE, INSERT, UPDATE ON public.actors_public TO service_role;",
];

const COMMENT =
  "COMMENT ON COLUMN public.actor_profiles.sections IS 'Actor sections. Validated by set_actor_sections.';";

/**
 * The superseded guard: "does at least one chunk still look like a statement".
 * Restated here rather than imported, because the point of the assertions that
 * use it is that a shape can satisfy it and still be unreadable — which is only
 * visible when the old test is applied to the same bytes as the new one.
 */
const SUPERSEDED_CANARY = /^(?:ALTER|GRANT) /;

/** Joins statements the way pg-delta does today: one blank line between each. */
const healthy = (...statements: string[]) =>
  [HEADER, SET_STATEMENT, ...statements].join("\n\n");

/** Applies the superseded guard to a run, exactly as it was written. */
const supersededGuardPasses = (raw: string) =>
  raw
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .some((chunk) => SUPERSEDED_CANARY.test(chunk));

describe("readDiffStatements", () => {
  it("reads a clean diff as statements with no comments among them", () => {
    const { statements, comments } = readDiffStatements(healthy(...NOISE));

    expect(statements).toHaveLength(NOISE.length + 2);
    expect(comments).toEqual([]);
  });

  it("isolates a comment that sits well after the noise", () => {
    const { statements, comments } = readDiffStatements(
      healthy(...NOISE, COMMENT),
    );

    expect(statements).toContain(COMMENT);
    expect(comments).toEqual([COMMENT]);
  });

  it("accepts output that has not been trimmed", () => {
    const { comments } = readDiffStatements(
      `\n\n${healthy(...NOISE, COMMENT)}\n\n`,
    );

    expect(comments).toEqual([COMMENT]);
  });
});

describe("readDiffStatements, on a shape it cannot trust", () => {
  it("refuses when the statements collapse into one chunk beginning with noise", () => {
    // The reproduction the superseded guard could not see, and the reason this
    // module exists. A tool is likelier to change how it joins STATEMENTS than
    // to stop separating its preamble, so the header keeps its blank line and
    // the run still splits — into a chunk that begins with the noise, because
    // the noise is always first.
    const collapsed = [
      HEADER,
      SET_STATEMENT,
      [...NOISE, COMMENT].join("\n"),
    ].join("\n\n");

    expect(supersededGuardPasses(collapsed)).toBe(true);

    expect(() => readDiffStatements(collapsed)).toThrow(OutputShapeError);
    expect(() => readDiffStatements(collapsed)).toThrow(
      /produced only 3 chunk\(s\)/,
    );
  });

  it("refuses when the whole run collapses into a single chunk", () => {
    const collapsed = healthy(...NOISE, COMMENT).replaceAll(/\n{2,}/g, "\n");

    expect(collapsed.split(/\n{2,}/)).toHaveLength(1);
    expect(() => readDiffStatements(collapsed)).toThrow(
      /produced only 1 chunk\(s\)/,
    );
  });

  it("refuses a comment glued to the end of an otherwise healthy chunk", () => {
    // Cardinality alone cannot see this — there are more chunks than noise
    // statements. Containment can, because the comment is in the text and not
    // in the list.
    const glued = healthy(
      ...NOISE,
      `GRANT USAGE ON SCHEMA public TO service_role;\n${COMMENT}`,
    );

    expect(supersededGuardPasses(glued)).toBe(true);
    expect(() => readDiffStatements(glued)).toThrow(
      /contains 1 line\(s\) beginning COMMENT ON but the parse isolated 0/,
    );
  });

  it("refuses when statements grow an indent", () => {
    // The mirror image: the parse isolates a comment that the raw text does not
    // present at a line start, so the counts disagree the other way.
    const indented = healthy(...NOISE, `  ${COMMENT}`);

    expect(() => readDiffStatements(indented)).toThrow(
      /contains 0 line\(s\) beginning COMMENT ON but the parse isolated 1/,
    );
  });

  it("refuses output with none of the noise the project always produces", () => {
    expect(() => readDiffStatements(healthy(COMMENT))).toThrow(
      /found none of the ALTER DEFAULT PRIVILEGES or GRANT statements/,
    );
  });

  it("refuses empty output, which this project never produces", () => {
    expect(() => readDiffStatements("   \n\n  ")).toThrow(/Read 0 chunk\(s\)/);
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
