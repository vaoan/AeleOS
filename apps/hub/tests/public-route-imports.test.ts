import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

// WHY A TEST RATHER THAN A LINT RULE.
//
// `features/actors/public.ts` exists so a signed-out visitor does not download
// the editor. It works only while the public routes import THAT barrel and not
// `features/actors/index.ts`, which reaches the whole feature — including
// `fursona-editor`, and through it Motion.
//
// The boundary graph cannot express the difference. `eslint.config.mjs` types
// both files as `feature-barrel` (the pattern is `features/*/{index,public}.ts`),
// and `boundaries/dependencies` allows a route to import any barrel. There is
// no way to say "these two routes get the narrow one". So the rule that keeps
// the split real lives here.
//
// WHAT THIS SUITE CANNOT SEE.
//
// Every assertion here is about import STRINGS. It cannot tell whether a
// module named in the barrel actually exports the symbol claimed from it:
// the first draft of `public.ts` named `infrastructure/actor-page` for
// `readPublicPerson`/`readPublicFursona`, which live in
// `infrastructure/public-actors`, and all ten cases below were green.
// `pnpm typecheck` and `pnpm --filter hub build` are what answer that, and
// both are required checks — do not add a symbol here on a green vitest run
// alone.
//
// It reads SOURCE rather than a build, deliberately: a bundle assertion needs
// `next build` and would answer minutes later, in a suite that runs in
// milliseconds. The source is where the mistake is made — somebody adds an
// import to a public page — so the source is where it is caught.

// SABOTAGE-VERIFIED, 2026-09-03, each against the claim it is for:
//   - a public route repointed at `@/features/actors` reddens exactly the two
//     cases about that route, and no others;
//   - a `FursonaEditor` re-export appended to `public.ts` reddens only
//     "carries no editor presentation";
//   - a re-export FROM `@/features/actors` reddens "re-exports from modules"
//     and, corroborating rather than independently, "reaches only its own
//     feature" — the wide barrel's specifier is not a `.../` prefix, so that
//     second case catches the same sabotage for a different reason and is not
//     separate evidence of it (root rule 23).
// The tree restored to 10 passing after each.

/** Repository root, from this file rather than the process's directory. */
const ROOT = resolve(import.meta.dirname, "../../..");

/**
 * The routes a signed-out visitor can reach that render actor content.
 *
 * Not derived by globbing `app/`: `/[locale]` and `sign-in` are public too and
 * import nothing from this feature, so a glob would either include them
 * pointlessly or need a filter that is itself a claim nobody checks. These two
 * are the pages the barrel split was measured against, named so a reader can
 * see exactly what is pinned.
 */
const PUBLIC_ROUTES = [
  "apps/hub/src/app/[locale]/[person]/page.tsx",
  "apps/hub/src/app/[locale]/[person]/[handle]/page.tsx",
] as const;

/** Every module specifier a file imports from, in source order. */
function importsOf(relative: string): string[] {
  const source = readFileSync(resolve(ROOT, relative), "utf8");
  return [...source.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]!);
}

describe("public routes", () => {
  // Anti-vacuity: every assertion below is about the CONTENTS of this list, so
  // an empty or mistyped list would let all of them pass for free.
  it("names the two routes the split was measured against", () => {
    expect(PUBLIC_ROUTES).toHaveLength(2);
    for (const route of PUBLIC_ROUTES) {
      expect(importsOf(route).length).toBeGreaterThan(0);
    }
  });

  it.each(PUBLIC_ROUTES)("%s reaches the narrow barrel", (route) => {
    expect(importsOf(route)).toContain("@/features/actors/public");
  });

  it.each(PUBLIC_ROUTES)("%s never reaches the wide barrel", (route) => {
    // The wide barrel pulls `fursona-editor`, and through it Motion, onto a
    // page nobody signed in to reach. Measured once at +109,155 bytes.
    expect(importsOf(route)).not.toContain("@/features/actors");
  });

  it.each(PUBLIC_ROUTES)("%s never deep-imports the feature", (route) => {
    // A deep import would dodge both barrels and pin the route to where a file
    // happens to live, which is what a barrel exists to stop. `boundaries`
    // catches this too; asserting it here keeps the whole rule in one place.
    const deep = importsOf(route).filter(
      (specifier) =>
        specifier.startsWith("@/features/actors/") &&
        specifier !== "@/features/actors/public",
    );
    expect(deep).toEqual([]);
  });
});

describe("the narrow barrel", () => {
  /** What `public.ts` itself imports from. */
  const BARREL = "apps/hub/src/features/actors/public.ts";

  it("re-exports from modules, never from the wide barrel", () => {
    // Re-exporting from `index.ts` would make this file a synonym for it and
    // put the editor back on the public route while every test above stayed
    // green — the split would be words rather than bytes.
    expect(importsOf(BARREL)).not.toContain("@/features/actors");
  });

  it("reaches only its own feature", () => {
    for (const specifier of importsOf(BARREL)) {
      expect(specifier.startsWith("@/features/actors/")).toBe(true);
    }
  });

  it("carries no editor presentation", () => {
    // The named modules are the ones that transitively reach Motion today.
    // A symbol whose graph includes one of these undoes the split silently.
    const editorOnly = ["fursona-editor", "page-source-dock", "block-editor"];
    for (const specifier of importsOf(BARREL)) {
      for (const editorModule of editorOnly) {
        expect(specifier).not.toContain(editorModule);
      }
    }
  });
});

describe("the shared block renderer", () => {
  it("keeps the shared block renderer free of the editor's own drag wrapper", () => {
    // `blocks.tsx` is imported by both barrels above -- the narrow one the two
    // public routes use, and the wide one `block-editor.tsx` uses. A static
    // import of `editable-block-frame` here would pull `@dnd-kit` into every
    // public route's bundle whether or not any instrumentation ever mounts,
    // the exact fault the barrel split above already fixed once for Motion.
    const source = readFileSync(
      resolve(ROOT, "apps/hub/src/features/actors/presentation/blocks.tsx"),
      "utf8",
    );
    expect(source).not.toMatch(/editable-block-frame/);
  });
});
