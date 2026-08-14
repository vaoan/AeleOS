import { describe, expect, it } from "vitest";
import {
  SECTION_LIMITS,
  SECTION_TYPES,
  sectionsSchema,
} from "@/features/actors/domain/section-schema";

/**
 * A well-formed item, with overrides.
 *
 * @param over - fields to replace.
 * @returns the item.
 */
const item = (over: Record<string, unknown> = {}) => ({
  title_en: "A title",
  title_es: "Un titulo",
  description_en: "Some words.",
  description_es: "Unas palabras.",
  sort_order: 1,
  ...over,
});

/**
 * A well-formed section, with overrides.
 *
 * @param over - fields to replace.
 * @returns the section.
 */
const section = (over: Record<string, unknown> = {}) => ({
  name_en: "About",
  name_es: "Acerca de",
  type: "cards",
  sort_order: 1,
  items: [item()],
  ...over,
});

/**
 * Whether the schema accepts a value.
 *
 * @param value - what to validate.
 * @returns true when it parsed.
 */
const accepts = (value: unknown) => sectionsSchema.safeParse(value).success;

/**
 * A copy of an object without one key.
 *
 * @param source - the object to copy.
 * @param key - the field to leave out.
 * @returns the copy.
 */
function without(
  source: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const copy = { ...source };
  delete copy[key];
  return copy;
}

describe("sectionsSchema", () => {
  it("accepts a well-formed section", () => {
    expect(accepts([section()])).toBe(true);
  });

  it("accepts an empty list", () => {
    expect(accepts([])).toBe(true);
  });

  it.each(SECTION_TYPES)("accepts the %s type", (type) => {
    expect(accepts([section({ type })])).toBe(true);
  });

  // The value here must be one nobody would plausibly ADD. It was `carousel`,
  // which became a real layout in 0017 — at which point this test asserted the
  // opposite of its name and passed for a whole release doing so. A name that
  // could not be a layout is the point, not a name that merely is not one yet.
  it("refuses a type it does not know", () => {
    expect(accepts([section({ type: "not-a-layout" })])).toBe(false);
  });

  it("refuses a section with no English name", () => {
    expect(accepts([without(section(), "name_en")])).toBe(false);
  });

  // The case that must never regress. These are a person's own words, not
  // catalogue keys — not having written the Spanish yet is an ordinary state,
  // and 0013 accepts it too.
  it("accepts a section with no Spanish name", () => {
    expect(accepts([without(section(), "name_es")])).toBe(true);
  });

  it("refuses an item with no English title", () => {
    expect(accepts([section({ items: [without(item(), "title_en")] })])).toBe(
      false,
    );
  });

  it("accepts an item with no Spanish title or description", () => {
    const englishOnly = without(without(item(), "title_es"), "description_es");
    expect(accepts([section({ items: [englishOnly] })])).toBe(true);
  });

  it("accepts a section with no items", () => {
    expect(accepts([section({ items: [] })])).toBe(true);
  });
});

describe("the limits", () => {
  /**
   * A run of well-formed sections.
   *
   * @param count - how many to build.
   * @returns the sections.
   */
  const sections = (count: number) =>
    Array.from({ length: count }, (_, n) => section({ sort_order: n + 1 }));

  it("accept the most sections allowed", () => {
    expect(accepts(sections(SECTION_LIMITS.sections))).toBe(true);
  });

  it("refuse one section more", () => {
    expect(accepts(sections(SECTION_LIMITS.sections + 1))).toBe(false);
  });

  it("accept the most items allowed", () => {
    const items = Array.from({ length: SECTION_LIMITS.items }, (_, n) =>
      item({ sort_order: n + 1 }),
    );
    expect(accepts([section({ items })])).toBe(true);
  });

  it("refuse one item more", () => {
    const items = Array.from({ length: SECTION_LIMITS.items + 1 }, (_, n) =>
      item({ sort_order: n + 1 }),
    );
    expect(accepts([section({ items })])).toBe(false);
  });

  it("accept the longest text allowed", () => {
    const long = "x".repeat(SECTION_LIMITS.text);
    expect(
      accepts([section({ items: [item({ description_en: long })] })]),
    ).toBe(true);
  });

  it("refuse one character more", () => {
    const tooLong = "x".repeat(SECTION_LIMITS.text + 1);
    expect(
      accepts([section({ items: [item({ description_en: tooLong })] })]),
    ).toBe(false);
  });

  // The backstop, mirroring 0013's. Every field here is legal on its own and
  // only the total is not, which is exactly what the byte cap is for.
  it("refuse a payload that is legal field by field but far too large", () => {
    const fat = Array.from({ length: SECTION_LIMITS.sections }, (_, n) =>
      section({
        sort_order: n + 1,
        items: Array.from({ length: SECTION_LIMITS.items }, (__, m) =>
          item({
            sort_order: m + 1,
            description_en: "x".repeat(SECTION_LIMITS.text),
            description_es: "y".repeat(SECTION_LIMITS.text),
          }),
        ),
      }),
    );
    expect(accepts(fat)).toBe(false);
  });
});
