import { readdirSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { CORNER_CLASS } from "@/features/actors/presentation/block-contract";

// **The guard for a class string that has to be identical in eight places.**
//
// A window is a bar whose foot is square over a body whose head is square. If
// one card shell's corner class drifts from another's the join opens and
// NOTHING FAILS — no type error, no red test, no exception. The page simply
// stops being a window, which is the kind of fault this repository keeps
// paying for.
//
// So the rule is mechanical: the literal lives in exactly one file, and every
// other shell interpolates the constant. This is the only thing that can see
// a ninth copy pasted in tomorrow.

/** Where the class is allowed to appear as a literal. */
const HOME = "block-contract.ts";

/** The bit of the class that identifies it wherever it is written. */
const FINGERPRINT = "rounded-[var(--corner-";

/**
 * Every source file under the actors feature.
 *
 * @param dir - where to start.
 * @returns each file's path.
 */
function sourcesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourcesUnder(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe("the corner class", () => {
  const root = resolve(import.meta.dirname, "../src/features/actors");
  const files = sourcesUnder(root);

  it("is written out in exactly one file", () => {
    const carriers = files
      .filter((path) => readFileSync(path, "utf8").includes(FINGERPRINT))
      .map((path) => basename(path));

    expect(carriers).toEqual([HOME]);
  });

  // Anti-vacuity for the case above: it would pass on a crawl that found no
  // files at all, or a fingerprint that matches nothing.
  it("is found by that fingerprint at all", () => {
    expect(files.length).toBeGreaterThan(20);
    expect(CORNER_CLASS).toContain(FINGERPRINT);
  });

  // The shape the renderers depend on: four corners, each falling back to the
  // expression `@theme inline` puts in `rounded-xl`. A fallback naming
  // `--radius-xl` instead reads a value computed at `:root` and freezes that
  // scope's skin — see the constant's own note.
  it("gives every corner a fallback that resolves the skin where it is read", () => {
    for (const corner of ["tl", "tr", "br", "bl"]) {
      expect(CORNER_CLASS).toContain(
        `var(--corner-${corner},calc(var(--skin-round)*0.75rem))`,
      );
    }
    expect(CORNER_CLASS).not.toContain("--radius-xl");
  });
});
