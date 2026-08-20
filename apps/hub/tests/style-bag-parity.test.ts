import { describe, expect, it } from "vitest";
import { blockSchema } from "@/features/actors/domain/block-schema";
import { sectionStyleSchema } from "@/features/actors/domain/section-schema";

/**
 * The style bag exists twice — once on the flat section model and once on the
 * block model that replaces it — and it is restated rather than imported,
 * because Task 8 deletes `section-schema.ts` and an import would make that
 * deletion reach into the new file.
 *
 * Nothing else can see the two as related. `jscpd` does not flag them, the
 * compiler has no reason to compare them, and each file's own suite exercises
 * only its own copy. The realistic drift is a key added to the LIVE model
 * during the window and never reaching the new one, after which the block
 * renderer silently lacks it — a control that accepts what somebody types,
 * stores it, and renders nothing. This repo has already paid for that once,
 * with four style keys unvalidated for weeks.
 *
 * **Delete this file along with `section-schema.ts` when the editor is ported
 * — phase 3.** It guards a duplication that ends there. It said "at Task 8"
 * until Task 8 came and went without deleting either: the flat model outlives
 * the flat renderer, because the editor still speaks it.
 *
 * It guards one direction, deliberately: a key on the section bag must exist on
 * the block bag and behave identically. The reverse is not drift — a key added
 * to the block bag alone is the new model moving on from one that is being
 * removed.
 */
const EXPECTED_KEYS = [
  "skin",
  "background_url",
  "background_fit",
  "card_size",
  "border",
  // Meaningful in the BLOCK model only, at depth 0 — a section reaching both
  // edges of the window. It is in the flat bag because these two are held
  // identical and the guard is worth more than one unused key: a bag that may
  // differ is a bag somebody lets differ by accident.
  "bleed",
];

/** A 500-character address, the longest `background_url` either bag allows. */
const longestAddress = () => {
  const base = "https://example.test/";
  return base + "x".repeat(500 - base.length);
};

/** Values each key must accept and must refuse, on both bags alike. */
const CASES = new Map<string, { accepted: unknown[]; refused: unknown[] }>([
  [
    "skin",
    { accepted: ["glass", "x".repeat(32)], refused: ["x".repeat(33), 7] },
  ],
  [
    "background_url",
    {
      accepted: ["https://example.test/a.png", longestAddress()],
      refused: [longestAddress() + "x", 7],
    },
  ],
  ["background_fit", { accepted: ["cover", "tile"], refused: ["parallax"] }],
  ["card_size", { accepted: ["s", "m", "l"], refused: ["xl"] }],
  [
    "border",
    {
      accepted: ["solid", "dashed", "dotted", "double", "none"],
      refused: ["groove", ""],
    },
  ],
  // A boolean and nothing else. The strings are the interesting refusals:
  // `"true"` is what a form control hands back if somebody forgets to convert
  // it, and it must not be taken for the boolean.
  ["bleed", { accepted: [true, false], refused: ["true", 1, null] }],
]);

/**
 * Whether the section bag accepts a style.
 *
 * @param style - the bag to validate.
 * @returns true when it parsed.
 */
const sectionAccepts = (style: unknown) =>
  sectionStyleSchema.safeParse(style).success;

/**
 * Whether the block bag accepts a style, reached through a whole block because
 * the bag itself is module-private there.
 *
 * @param style - the bag to validate.
 * @returns true when it parsed.
 */
const blockAccepts = (style: unknown) =>
  blockSchema.safeParse({
    kind: "text",
    title_en: "A title",
    style,
  }).success;

describe("the style bag exists twice and must not drift", () => {
  it("has the keys both copies are written against", () => {
    expect(Object.keys(sectionStyleSchema.shape)).toEqual(EXPECTED_KEYS);
  });

  it("has a case for every key it claims", () => {
    expect([...CASES.keys()]).toEqual(EXPECTED_KEYS);
  });

  it.each(EXPECTED_KEYS)("agrees on what %s accepts", (key) => {
    for (const value of CASES.get(key)?.accepted ?? []) {
      expect(sectionAccepts({ [key]: value })).toBe(true);
      expect(blockAccepts({ [key]: value })).toBe(true);
    }
  });

  it.each(EXPECTED_KEYS)("agrees on what %s refuses", (key) => {
    for (const value of CASES.get(key)?.refused ?? []) {
      expect(sectionAccepts({ [key]: value })).toBe(false);
      expect(blockAccepts({ [key]: value })).toBe(false);
    }
  });

  it.each(EXPECTED_KEYS)("agrees that %s may be left unset", (key) => {
    const withoutKey = Object.fromEntries(
      EXPECTED_KEYS.filter((other) => other !== key).map((other) => [
        other,
        CASES.get(other)?.accepted[0],
      ]),
    );
    expect(sectionAccepts(withoutKey)).toBe(true);
    expect(blockAccepts(withoutKey)).toBe(true);
  });

  it("agrees on the empty bag", () => {
    expect(sectionAccepts({})).toBe(true);
    expect(blockAccepts({})).toBe(true);
  });

  // Without this the agreement above would be meaningless: a bag that accepted
  // everything would pass every case in it.
  it("agrees on refusing a key neither renders", () => {
    expect(sectionAccepts({ corner_radius: "8px" })).toBe(false);
    expect(blockAccepts({ corner_radius: "8px" })).toBe(false);
  });
});
