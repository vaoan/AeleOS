import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  SECTION_LIMITS,
  SECTION_TYPES,
} from "@/features/actors/domain/section-schema";

/**
 * The migration's own constants, read out of the SQL.
 *
 * The database is authoritative. The client's copy exists to tell somebody
 * about a cap while they are typing rather than after a round trip, and a copy
 * that drifts is worse than no copy — it either rejects what the database would
 * have accepted, or promises what the database will refuse.
 */
const sql = readFileSync(
  resolve(process.cwd(), "../../supabase/migrations/0009_actor_profiles.sql"),
  "utf8",
);

/**
 * Reads one `c_max_*` constant out of the migration.
 *
 * @param name - the constant's suffix, as in `c_max_sections`.
 * @returns the number the migration declares.
 */
function fromMigration(name: string): number {
  const found = sql.match(
    new RegExp(`c_max_${name}\\s+constant\\s+int\\s*:=\\s*(\\d+)`),
  );
  if (!found?.[1])
    throw new Error(
      `c_max_${name} was not found in 0013. If it was renamed, this guard is ` +
        `now checking nothing and must be updated with it.`,
    );
  return Number(found[1]);
}

describe("the client's section limits", () => {
  // Asserted before anything is compared. A regular expression that quietly
  // matched nothing would make every comparison below pass forever, which is
  // the one way a drift guard fails silently.
  it("are all actually found in the migration", () => {
    for (const name of ["sections", "items", "text", "bytes"])
      expect(() => fromMigration(name)).not.toThrow();
  });

  it.each([
    ["sections", "sections"],
    ["items", "items"],
    ["text", "text"],
    ["bytes", "bytes"],
  ])("match 0013's c_max_%s", (name, key) => {
    expect({
      [key]: SECTION_LIMITS[key as keyof typeof SECTION_LIMITS],
    }).toEqual({ [key]: fromMigration(name) });
  });
});

/**
 * The same file the caps come from.
 *
 * `is_section_type` sits beside `set_actor_sections` in `0009`, which is where
 * the squash put it: a migration that only redefined that file own function was
 * folded back into it rather than left stacked on top.
 */
const layoutSql = sql;

describe("the client's layout list", () => {
  // The same drift argument as the caps, with a sharper edge: a layout the
  // client offers and the database refuses is not a warning somebody sees while
  // typing — it is a save that fails after they have written the whole section.
  it("is exactly what the migration accepts", () => {
    const body = layoutSql.match(
      /create or replace function public\.is_section_type[\s\S]*?select p_type in \(([\s\S]*?)\)\s*\$\$/,
    )?.[1];
    if (!body)
      throw new Error(
        "is_section_type was not found in 0009. If it was renamed or its shape " +
          "changed, this guard is now checking nothing and must be updated with it.",
      );

    // Comments come out FIRST. The prose in this one contains an apostrophe,
    // and a quote-matching pass over the raw text reads it as the start of a
    // value — which is how a guard like this reports a difference that is not
    // there, or worse, stops seeing one that is.
    const inMigration = [
      ...body.replace(/--.*/g, "").matchAll(/'([^']+)'/g),
    ].map((m) => m[1]);
    expect(inMigration.length).toBeGreaterThan(0);
    expect([...inMigration].sort()).toEqual([...SECTION_TYPES].sort());
  });
});
