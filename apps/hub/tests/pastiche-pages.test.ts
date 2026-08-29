import { describe, expect, it } from "vitest";

import { PAGES, ERA_LOOKS } from "../../../scripts/pastiche-pages.mjs";
import {
  REFERENCES,
  inspirationSection,
} from "../../../scripts/pastiche-references.mjs";
import { parseTheme, THEME_SEEDS } from "@/features/actors/domain/actor-theme";
import { blocksSchema } from "@/features/actors/domain/block-schema";
import { REQUIRED_KINDS } from "@/features/actors/domain/required-blocks";
import { contrastRatio, parseHex, srgbToOklch } from "@/shared/domain/color";
import { derivePalette, hexFromOklchValue } from "@/shared/domain/palette";

/** Every seeded page, social and era look alike, with a name to report by. */
const everyPage = [
  ...PAGES.map((p) => [p.handle, p.blocks, p.theme] as const),
  ...ERA_LOOKS.map((l) => [l.id, l.blocks, l.theme] as const),
];

describe("every seeded page", () => {
  it("covers both sets", () => {
    // A vacuous suite is the failure mode here: if the import ever answers an
    // empty array every case below passes for free.
    expect(everyPage.length).toBe(16);
  });

  it.each(everyPage)(
    "%s keeps every theme value it sets",
    (id, _blocks, theme) => {
      // parseTheme is the READ path — it normalises, drops and clamps. Asserting
      // idempotence would be true and useless: what matters is that no value the
      // seeder sets is silently DISCARDED at read, which is the exact shape of
      // the shipped `measure` bug — a vocabulary written down in TypeScript that
      // the read path had never heard of.
      const parsed = parseTheme(theme) as Record<string, unknown>;
      for (const [key, value] of Object.entries(theme)) {
        if (value === null) continue; // null means "the design's own", not a value.
        expect(parsed[key], `${id} lost its ${key}`).toEqual(value);
      }
    },
  );

  it.each(everyPage)("%s is a tree the schema accepts", (_id, blocks) => {
    expect(() => blocksSchema.parse(blocks)).not.toThrow();
  });

  it.each(everyPage)("%s carries every required kind", (id, blocks) => {
    const kinds = new Set<string>();
    const walk = (b: unknown): void => {
      const node = b as { kind?: string; children?: unknown[] };
      if (node.kind) kinds.add(node.kind);
      node.children?.forEach(walk);
    };
    (blocks as unknown[]).forEach(walk);
    // Every one of these is a fursona page, so `owner` is required and
    // `fursonas` is refused. Collected into one array and asserted in a
    // single `expect` — a sequential `expect` per kind stops at the first
    // failure, so a page missing two kinds would only ever report one.
    const missing = REQUIRED_KINDS.fursona.filter(
      (required) => !kinds.has(required),
    );
    expect(
      missing,
      `${id} is missing: ${missing.join(", ") || "nothing"}`,
    ).toEqual([]);
  });
});

/**
 * Reads one of {@link derivePalette}'s own `oklch(...)` strings back into a
 * tuple, through the same hex round-trip {@link hexFromOklchValue} already
 * does for the picker — no contrast math is written here, only real exported
 * functions composed. `derivePalette` never emits a string that string does
 * not match, so the non-null assertion costs no untested branch.
 *
 * @param cssValue - one value out of a solved palette.
 * @returns the colour as OKLCH.
 */
function readOklch(cssValue: string): [number, number, number] {
  const hex = hexFromOklchValue(cssValue)!;
  return srgbToOklch(parseHex(hex)!);
}

describe("pages with a surface stay readable", () => {
  // Only a page that sets BOTH a background and a surface reaches
  // `derivePalette` with one at all — `themeVars` skips the call entirely
  // when `theme.background` is null, exactly as production does, so a page
  // with a surface and no background (none exist today) would be asserting
  // nothing rather than something false.
  const withSurface = everyPage.filter(([, , theme]) => {
    const parsed = parseTheme(theme);
    return parsed.background !== null && parsed.surface !== null;
  });

  it("found pages to check", () => {
    // The vacuous-suite guard again: if parseTheme ever started reading every
    // surface back as null, every case below would pass by not existing —
    // and a weaker `toBeGreaterThan(0)` would still pass if parseTheme
    // regressed and read only some of the ten as non-null. Pinned to the
    // exact count so that regression turns this red instead of quiet.
    expect(withSurface.length).toBe(10);
  });

  // **This pins our sixteen pages. It does not close gap 14.** Gap 14 is that
  // an AUTHOR choosing a colour gets no feedback at all — nothing short of a
  // person running derivePalette by hand would catch it, and that is still
  // true after this case exists. What this asserts is narrower: none of the
  // pages this repository itself ships is sitting on the same mid-lightness
  // hole `#555a6a` was found in, and a future change to the accent, the
  // background stops, the OKLCH constants or the solve order that reopens it
  // on any of these ten pages turns red here instead of shipping quietly.
  //
  // The floors are `derivePalette`'s own — `TEXT = 4.5`, `NON_TEXT = 3` — not
  // reimplemented, and the palette itself comes from the real function, given
  // the real background and the real accent fallback production uses
  // (`theme.accent ?? THEME_SEEDS.accent`, see `themeVars`). Only the CSS
  // strings it returns are turned back into numbers here.
  it.each(withSurface)(
    "%s's surface clears ink and muted at 4.5:1, edge at 3:1",
    (id, _blocks, theme) => {
      const parsed = parseTheme(theme);
      const palette = derivePalette(
        parsed.background!,
        parsed.accent ?? THEME_SEEDS.accent,
        parsed.surface,
      );
      const surface = readOklch(palette["--surface-solid"]!);
      const ink = readOklch(palette["--ink"]!);
      const muted = readOklch(palette["--muted"]!);
      const edge = readOklch(palette["--edge"]!);

      expect(
        contrastRatio(ink, surface),
        `${id}: ink vs its own surface`,
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(muted, surface),
        `${id}: muted vs its own surface`,
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(edge, surface),
        `${id}: edge vs its own surface`,
      ).toBeGreaterThanOrEqual(3);
    },
  );
});

describe("the inspiration section", () => {
  it.each(Object.keys(REFERENCES))(
    "%s appends a tree the schema accepts",
    (handle) => {
      // The section is appended at seed time, so this is where it is checked —
      // the page module never holds it.
      expect(() =>
        blocksSchema.parse([inspirationSection(REFERENCES[handle])]),
      ).not.toThrow();
    },
  );

  it("names a reference for every seeded page and no others", () => {
    const seeded = [
      ...PAGES.map((p) => p.handle),
      ...ERA_LOOKS.map((l) => l.id),
    ];
    expect(Object.keys(REFERENCES).sort()).toEqual(seeded.sort());
  });
});
