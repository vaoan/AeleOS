import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// fonts.ts cannot be imported here — `next/font/local` is a build-time
// transform, so calling it outside Next's compiler throws. It is read as text
// instead. That is enough for the one thing this file guards, which is a
// property of the source rather than of the runtime.
const DIR = resolve(process.cwd(), "src/shared/infrastructure");
const source = readFileSync(resolve(DIR, "fonts.ts"), "utf8");
const vendored = readdirSync(resolve(DIR, "fonts")).filter((f) =>
  f.endsWith(".woff2"),
);

/** Every `path:` in a localFont `src` array, as written in fonts.ts. */
const referenced = [...source.matchAll(/path: "\.\/fonts\/([^"]+)"/g)].map(
  (m) => m[1],
);

describe("the vendored fonts", () => {
  // The regression this exists to prevent, in one assertion. `next/font/google`
  // self-hosts what it ships, but downloads the woff2 files from
  // fonts.gstatic.com WHILE COMPILING — so a 404 there fails the build. It did:
  // Google answered 404 for three Space Grotesk files, layout.tsx never
  // compiled, and the e2e job timed out waiting for a dev server. e2e is a
  // required check, so an outage at Google blocked every merge in the
  // repository. No browser test can see this; only the source can.
  it("are loaded from disk, never fetched from Google while compiling", () => {
    expect(source).toContain('from "next/font/local"');
    // Matched as an import, not as a mention: the TSDoc above `display`
    // explains at length why Google was dropped, and a bare substring test
    // fails on that prose — which it did, the first time this was written.
    expect(source).not.toMatch(/from ["']next\/font\/google["']/);
  });

  it("all exist on disk", () => {
    expect(referenced.length).toBeGreaterThan(0);
    for (const file of referenced) expect(vendored).toContain(file);
  });

  // The other direction, so the directory cannot quietly accumulate weight
  // nothing renders — these are binaries in git, and an orphan is pure cost.
  it("are all actually referenced", () => {
    for (const file of vendored) expect(referenced).toContain(file);
  });
});
