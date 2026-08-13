import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SECTION_LIMITS } from "@/features/actors/domain/section-schema";

/**
 * The migration's own constants, read out of the SQL.
 *
 * The database is authoritative. The client's copy exists to tell somebody
 * about a cap while they are typing rather than after a round trip, and a copy
 * that drifts is worse than no copy — it either rejects what the database would
 * have accepted, or promises what the database will refuse.
 */
const sql = readFileSync(
  resolve(process.cwd(), "../../supabase/migrations/0013_fursona_sections.sql"),
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
