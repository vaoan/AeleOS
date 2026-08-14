import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { IMAGE_LIMITS } from "@/features/actors/domain/image-limits";

// The bucket is authoritative and IMAGE_LIMITS is a copy, so the copy is not
// trusted to stay right. This reads the migration and fails if either value
// drifts — the same guard the section limits carry, for the same reason.
const MIGRATION = readFileSync(
  resolve(process.cwd(), "../../supabase/migrations/0013_actor_images.sql"),
  "utf8",
);

describe("the image limits match 0013", () => {
  it("agrees on the byte cap", () => {
    const match = /file_size_limit[\s\S]*?^\s*(\d+),/m.exec(MIGRATION);
    // Guarding the guard. A regex that matches nothing would otherwise pass a
    // comparison against nothing, which is how a drift test becomes decoration
    // — this repository has been bitten by exactly that once already.
    expect(match?.[1]).toBeDefined();
    expect(Number(match?.[1])).toBe(IMAGE_LIMITS.bytes);
  });

  it("agrees on the accepted types", () => {
    const block = /allowed_mime_types\)?[\s\S]*?array\[([^\]]+)\]/.exec(
      MIGRATION,
    );
    expect(block?.[1]).toBeDefined();

    const declared = [...(block?.[1] ?? "").matchAll(/'([^']+)'/g)].map(
      (m) => m[1],
    );
    expect(declared.length).toBeGreaterThan(0);
    expect(declared.sort()).toEqual([...IMAGE_LIMITS.types].sort());
  });
});
