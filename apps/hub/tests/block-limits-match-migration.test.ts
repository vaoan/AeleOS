import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  PAGE_FONTS,
  PAGE_MEASURES,
  PAGE_SPACINGS,
} from "@/features/actors/domain/actor-theme";
import {
  BLOCK_KINDS,
  BLOCK_LIMITS,
  BLOCK_STYLE_LIMITS,
  CONTAINER_MODES,
  MAX_DEPTH,
} from "@/features/actors/domain/block-schema";
import {
  REFUSED_KIND,
  REQUIRED_KINDS,
} from "@/features/actors/domain/required-blocks";

/**
 * The migration's own constants, read out of the SQL.
 *
 * The database is authoritative. The client's copy exists to tell somebody
 * about a cap while they are typing rather than after a round trip, and a copy
 * that drifts is worse than no copy — it either rejects what the database would
 * have accepted, or promises what the database will refuse.
 *
 * This replaces `section-limits-match-migration.test.ts`, which pinned the flat
 * model's caps to the same file. It is modelled on it deliberately, including
 * the self-checks: each regex is asserted to have matched something before
 * anything is compared, because a pattern that quietly matches nothing makes
 * every comparison after it pass forever.
 */
const sql = readFileSync(
  resolve(process.cwd(), "../../supabase/migrations/0009_actor_profiles.sql"),
  "utf8",
);

/**
 * Reads one `c_max_*` constant out of the migration.
 *
 * @param name - the constant's suffix, as in `c_max_blocks`.
 * @returns the number the migration declares.
 */
function fromMigration(name: string): number {
  const found = sql.match(
    new RegExp(`c_max_${name}\\s+constant\\s+int\\s*:=\\s*(\\d+)`),
  );
  if (!found?.[1])
    throw new Error(
      `c_max_${name} was not found in 0009. If it was renamed, this guard is ` +
        `now checking nothing and must be updated with it.`,
    );
  return Number(found[1]);
}

/**
 * Every value one `in (...)` list in the migration declares.
 *
 * @param fn - the function to read, unqualified.
 * @param parameter - the name of the parameter it tests, as in `p_kind`.
 * @returns the strings that function accepts.
 */
function listFromMigration(fn: string, parameter: string): string[] {
  const body = sql.match(
    new RegExp(
      `create or replace function public\\.${fn}[\\s\\S]*?select ${parameter} in \\(([\\s\\S]*?)\\)\\s*\\$\\$`,
    ),
  )?.[1];
  if (!body)
    throw new Error(
      `${fn} was not found in 0009. If it was renamed or its shape changed, ` +
        `this guard is now checking nothing and must be updated with it.`,
    );
  // Comments come out FIRST. The prose in them contains apostrophes, and a
  // quote-matching pass over the raw text reads one as the start of a value —
  // which is how a guard like this reports a difference that is not there, or
  // worse, stops seeing one that is.
  return [...body.replace(/--.*/g, "").matchAll(/'([^']+)'/g)]
    .map((match) => match[1])
    .filter((value): value is string => value !== undefined);
}

describe("the client's block limits", () => {
  // Asserted before anything is compared. A regular expression that quietly
  // matched nothing would make every comparison below pass forever, which is
  // the one way a drift guard fails silently.
  it("are all actually found in the migration", () => {
    for (const name of [...Object.keys(BLOCK_LIMITS), "depth"])
      expect(() => fromMigration(name)).not.toThrow();
  });

  // **The reverse direction, which the two above do not have.** Both enumerate
  // `Object.keys(BLOCK_LIMITS)`, so a cap DELETED from the client silently
  // loses its test rather than failing, and a `c_max_*` added to the SQL alone
  // is never noticed. Collecting the constants out of the migration and
  // comparing the two sets is what closes both.
  it("has a client counterpart for every c_max_ in the migration", () => {
    const declared = [...sql.matchAll(/c_max_(\w+)\s+constant/g)].map(
      (match) => match[1] as string,
    );
    // Non-empty first, for the reason every other self-check here exists: a
    // pattern that matched nothing would make the comparison below pass
    // forever.
    expect(declared.length).toBeGreaterThan(4);
    // `depth` is the one deliberate exception — it is `MAX_DEPTH` rather than a
    // member of `BLOCK_LIMITS`, and it has its own case below.
    // Deduplicated: `c_max_bytes` is declared in more than one function, so
    // comparing the raw list would fail on a repetition rather than on drift.
    // The sets are what must agree; how many times the SQL restates a constant
    // is its own business.
    expect([...new Set(declared)].toSorted()).toEqual(
      [...Object.keys(BLOCK_LIMITS), "depth"].toSorted(),
    );
  });

  it.each(Object.keys(BLOCK_LIMITS))("match 0009's c_max_%s", (key) => {
    expect({
      [key]: BLOCK_LIMITS[key as keyof typeof BLOCK_LIMITS],
    }).toEqual({ [key]: fromMigration(key) });
  });

  // Not one of `BLOCK_LIMITS`, and the one whose drift is worst: the database
  // refusing a shallower tree than the editor builds is a page somebody wrote
  // and cannot save.
  it("match 0009's c_max_depth", () => {
    expect(MAX_DEPTH).toBe(fromMigration("depth"));
  });
});

describe("the client's vocabulary", () => {
  // The same drift argument as the caps, with a sharper edge: a kind the client
  // offers and the database refuses is not a warning somebody sees while
  // typing — it is a save that fails after they have built the whole page.
  it("is exactly the kinds the migration accepts", () => {
    const inMigration = listFromMigration("is_block_kind", "p_kind");
    expect(inMigration.length).toBeGreaterThan(0);
    expect([...inMigration].sort()).toEqual([...BLOCK_KINDS].sort());
  });

  it("is exactly the modes the migration accepts", () => {
    const inMigration = listFromMigration("is_container_mode", "p_mode");
    expect(inMigration.length).toBeGreaterThan(0);
    expect([...inMigration].sort()).toEqual([...CONTAINER_MODES].sort());
  });
});

/**
 * The style-bag validation block inside `validate_block`.
 *
 * Anchored on the loop over the block's own `style`, which appears nowhere
 * else in `0009` — the page-level skin lives in `set_actor_theme`'s own loop
 * and raises a differently worded exception instead, so a plain search for
 * `'skin'` would find that block first rather than this one.
 */
const styleBlock = sql.match(
  /for v_key, v_value in select \* from jsonb_each_text\(p_block -> 'style'\)[\s\S]*?end loop;/,
)?.[0];

describe("the client's style limits", () => {
  it("the style block is found in 0009", () => {
    // Asserted before anything below is compared, for the same reason the
    // cap guard checks its own regex first.
    expect(styleBlock).toBeTruthy();
  });

  // **Compared against the ZOD SHAPE, not against a literal, and that was the
  // hole.** These read `32`, `500` and three hand-typed arrays, so the guard
  // caught a change to the SQL and not a value added to the client's enum
  // alone — which is the direction that promises a save the database then
  // refuses, exactly the asymmetry the byte-cap incident was. The kind and mode
  // lists were already compared against the client's arrays; the style bag was
  // the one that was not.
  it.each([
    ["skin", BLOCK_STYLE_LIMITS.skin],
    ["background_url", BLOCK_STYLE_LIMITS.background_url],
  ])("the %s length matches 0009's style block", (key, expected) => {
    // **`String.raw`, and that is the whole of this comment.** In an ordinary
    // template literal the escapes in this pattern are STRING escapes, and
    // they collapse before `RegExp` ever sees them — so it silently became
    // `[sS]*?length(v_value) > (d+)`, matching nothing, and capturing
    // `v_value` rather than a number if it ever had. Doubling every backslash
    // works too, and the sibling below does exactly that; this reads as the
    // pattern it actually is, which is why the two differ.
    const found = styleBlock?.match(
      new RegExp(
        String.raw`v_key = '${key}' then[\s\S]*?length\(v_value\) > (\d+)`,
      ),
    );
    // Asserted before the comparison, like every other self-check in this
    // file. Without it a pattern that matches nothing reads as `NaN`, which
    // fails today but says nothing about why.
    expect(found?.[1]).toBeDefined();
    expect(Number(found?.[1])).toBe(expected);
  });

  it.each([
    ["background_fit", BLOCK_STYLE_LIMITS.background_fit],
    ["card_size", BLOCK_STYLE_LIMITS.card_size],
    ["border", BLOCK_STYLE_LIMITS.border],
    ["chrome", BLOCK_STYLE_LIMITS.chrome],
    ["heading", BLOCK_STYLE_LIMITS.heading],
    ["text_align", BLOCK_STYLE_LIMITS.text_align],
    ["image_fit", BLOCK_STYLE_LIMITS.image_fit],
    ["radius", BLOCK_STYLE_LIMITS.radius],
    ["heading_pad", BLOCK_STYLE_LIMITS.heading_pad],
  ])("the %s values match 0009's style block", (key, expected) => {
    const found = styleBlock?.match(
      new RegExp(`v_key = '${key}' then[\\s\\S]*?v_value not in \\(([^)]+)\\)`),
    );
    const values = found?.[1]
      .split(",")
      .map((value) => value.trim().replaceAll("'", ""));
    expect(values?.toSorted()).toEqual(expected.toSorted());
  });
});

/**
 * The PAGE-level vocabularies, pinned to `set_actor_theme`'s own allowlist.
 *
 * **This is the guard that did not exist when `measure` shipped.** That key was
 * added to `PAGE_MEASURES` and never to the allowlist, whose final branch is
 * `raise exception 'unknown theme key %'` — so picking a width did not merely
 * fail to persist, it made the WHOLE theme save throw, every colour beside it
 * included. Root rule 30 is that incident; nothing pinned these three until
 * now, and `font` and `spacing` are added in the same change as this test for
 * exactly that reason.
 *
 * These read `set_actor_theme`'s branches rather than `validate_block`'s: the
 * three keys named here appear only in the former, so the pattern cannot
 * accidentally match the style bag's loop.
 */
describe("the client's page-level theme vocabulary", () => {
  it.each([
    ["measure", PAGE_MEASURES],
    ["font", PAGE_FONTS],
    ["spacing", PAGE_SPACINGS],
  ])("the %s values match 0009's set_actor_theme", (key, expected) => {
    const found = sql.match(
      // **`String.raw`, and this file already warned about it.** In an
      // ordinary template literal these are STRING escapes and collapse before
      // `RegExp` sees them — the pattern becomes `[sS]`, matches nothing, and
      // every assertion after it passes forever. Written the plain way first
      // here, and caught only because the self-check below exists.
      new RegExp(
        String.raw`v_key = '${key}' then[\s\S]*?v_value not in \(([^)]+)\)`,
      ),
    );
    // Self-checked before the comparison, like every other regex in this file:
    // a pattern that matches nothing makes the assertion after it pass forever.
    expect(found?.[1]).toBeDefined();
    const values = found?.[1]
      .split(",")
      .map((value) => value.trim().replaceAll("'", ""));
    expect(values?.toSorted()).toEqual([...expected].toSorted());
  });
});

/**
 * Reads one branch of `set_actor_sections`' per-kind rules out of the
 * migration.
 *
 * @param branch - the SQL that opens the branch, as it appears in `0009`.
 * @returns the required kinds and the refused one the database declares.
 */
function kindRules(branch: string): { required: string[]; refused: string } {
  const found = sql.match(
    new RegExp(
      branch +
        String.raw`\s+v_required := array\[([^\]]+)\];\s+v_refused\s+:= '([a-z]+)';`,
    ),
  );
  if (!found?.[1] || !found[2])
    throw new Error(
      `The per-kind rules were not found after "${branch}" in 0009. If that ` +
        `block was rewritten, this guard is now checking nothing and must be ` +
        `updated with it.`,
    );
  return {
    required: found[1].split(",").map((one) => one.trim().replaceAll("'", "")),
    refused: found[2],
  };
}

describe("the per-actor-kind block rules match the migration", () => {
  it("agrees with 0009 about a person's page", () => {
    const sqlRules = kindRules(String.raw`v_actor_kind = 'person' then`);
    expect(sqlRules.required).toEqual([...REQUIRED_KINDS.person]);
    expect(sqlRules.refused).toBe(REFUSED_KIND.person);
  });

  it("agrees with 0009 about a fursona's page", () => {
    const sqlRules = kindRules(String.raw`else`);
    expect(sqlRules.required).toEqual([...REQUIRED_KINDS.fursona]);
    expect(sqlRules.refused).toBe(REFUSED_KIND.fursona);
  });
});
