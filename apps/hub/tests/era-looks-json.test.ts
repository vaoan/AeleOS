import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { ERA_LOOKS } from "@/features/actors/domain/era-looks";

// THE ARTEFACT THE SEEDER READS, AND WHY IT EXISTS AT ALL.
//
// `scripts/seed-pastiches.mjs` is plain JavaScript that writes DIRECT SQL, and
// it cannot import `era-looks.ts`: Node strips types but will not resolve this
// app's `@/` alias, and every path out of that module goes through one. So the
// seeder needs the looks as data.
//
// **The obvious answer — paste the five trees into the seeder — is the one
// this file exists to prevent.** Two copies of a page would look identical the
// day they were written and drift the first time either changed, and the whole
// point of seeding these is to LOOK at what the picker offers. A seeded page
// that had quietly diverged from the template would be a photograph of
// something nobody can pick.
//
// So there is one source (`ERA_LOOKS`, typed) and one generated artefact, and
// this fails when they disagree. Regenerate with:
//
//   UPDATE_ERA_LOOKS=1 pnpm --filter hub exec vitest run tests/era-looks-json.test.ts
//
// It is deliberately NOT written on every run. A file that rewrites itself
// whenever the suite runs cannot fail — the drift would be repaired before
// anybody was told about it, which is the same vacuity as a test that cannot
// go red.

/** Where the seeder looks for it. Relative to this file, not to the runner. */
const ARTEFACT = resolve(
  import.meta.dirname,
  "../../../scripts/era-looks.generated.json",
);

/** What the artefact should hold, formatted the way it is written. */
const expected = `${JSON.stringify(ERA_LOOKS, null, 2)}\n`;

describe("the era looks artefact", () => {
  it("matches what the app actually ships", () => {
    if (process.env.UPDATE_ERA_LOOKS) {
      writeFileSync(ARTEFACT, expected, "utf8");
    }

    // **Compared as DATA, not as text, and that is a boundary rather than a
    // convenience.** Prettier formats this file like every other committed
    // JSON, and `JSON.stringify(x, null, 2)` does not agree with it — so a
    // text comparison would make the two tools fight forever, with the
    // formatter winning on every commit and this failing on every run. The
    // formatter owns the SHAPE and this owns the CONTENT; naming the owner is
    // what stops that loop.
    const actual: unknown = JSON.parse(readFileSync(ARTEFACT, "utf8"));
    expect(
      actual,
      "scripts/era-looks.generated.json is out of date — regenerate it with UPDATE_ERA_LOOKS=1",
    ).toEqual(JSON.parse(JSON.stringify(ERA_LOOKS)));
  });

  it("holds every look, so the seeder cannot silently seed fewer", () => {
    // Anti-vacuity for the comparison above: it would pass on two empty files.
    const parsed = JSON.parse(readFileSync(ARTEFACT, "utf8")) as {
      id: string;
    }[];
    expect(parsed.map((one) => one.id)).toEqual(ERA_LOOKS.map((one) => one.id));
    expect(parsed.length).toBeGreaterThan(0);
  });
});
