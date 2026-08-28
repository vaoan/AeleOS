import { describe, expect, it } from "vitest";
import { sectionsToBlocks } from "@/features/actors/domain/section-block-shim";
import {
  SECTION_TYPES,
  type FursonaSection,
  type SectionType,
} from "@/features/actors/domain/section-schema";
import {
  BLOCK_LIMITS,
  blocksSchema,
  isContainer,
  type ContainerBlock,
} from "@/features/actors/domain/block-schema";
import { STARTER_LAYOUTS } from "@/features/actors/domain/fursona-templates";
// WHY THIS SUITE EXISTS, AND WHAT IT IS ALLOWED TO ASSUME.
//
// Every page written before the block model is still FLAT in the column —
// nothing converted them — and the shipped templates are still written in the
// flat vocabulary. So this conversion runs whenever anybody opens or reads one
// of those, and a page stays flat in storage until its owner next saves.
//
// It used to run backwards too, so a flat editor could open a stored tree. The
// editor composes blocks now, so that direction and its round-trip assertion
// are gone with the editor that needed them; what is left to prove is that
// nothing an author wrote is dropped on the way forward, and that the result
// is a page the database will take.
//
// Every payload this file builds is also parsed through `blocksSchema` — the
// same schema `0009` was copied from — so a conversion that produced something
// the database would refuse fails here rather than in front of somebody.
/**
 * A well-formed item, with overrides.
 *
 * @param over - fields to replace.
 * @returns the item.
 */
const item = (over: Partial<FursonaSection["items"][number]> = {}) => ({
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
const section = (over: Partial<FursonaSection> = {}): FursonaSection => ({
  name_en: "About",
  name_es: "Acerca de",
  type: "cards",
  sort_order: 1,
  items: [item()],
  ...over,
});
/**
 * The one container a page of one section converts to.
 *
 * @param sections - the page to convert.
 * @returns its first block, narrowed to a container.
 */
function firstContainer(sections: FursonaSection[]): ContainerBlock {
  const [block] = sectionsToBlocks(sections);
  if (!block || !isContainer(block)) throw new Error("not a container");
  return block;
}
describe("sectionsToBlocks", () => {
  it("makes a section a named container at the top of the page", () => {
    const block = firstContainer([section({ name_es: "Acerca de" })]);
    expect(block.kind).toBe("container");
    expect(block.name_en).toBe("About");
    expect(block.name_es).toBe("Acerca de");
  });
  // THE WIDTH THE FLAT LAYOUT DREW, not how many items the section holds.
  // `spaces` is how many places a container lays ACROSS and its children fill
  // them row by row, so a gallery of many pictures is a few places across with
  // rows beneath it — the reading that made a full gallery unrepresentable was
  // the one that treated this number as a total. `SHAPES`' own TSDoc says how
  // each was chosen.
  it("gives a section the width its flat layout drew", () => {
    expect(firstContainer([section({ type: "gallery" })]).spaces).toBe(3);
    expect(firstContainer([section({ type: "stats" })]).spaces).toBe(4);
    expect(firstContainer([section({ type: "quote" })]).spaces).toBe(2);
    expect(firstContainer([section({ type: "links" })]).spaces).toBe(1);
  });
  // A section filled to the flat model's own item cap becomes that many
  // children of a container a few places across, continuing downward in rows —
  // not a container that many places across, and not a refusal. This is the
  // case the width-versus-total confusion made unrepresentable.
  it("puts a full gallery into rows rather than into places across", () => {
    const items = Array.from({ length: BLOCK_LIMITS.children }, (_, index) =>
      item({ sort_order: index + 1, title_en: `Picture ${String(index)}` }),
    );
    const block = firstContainer([section({ type: "gallery", items })]);
    expect(block.spaces).toBe(3);
    expect(block.children).toHaveLength(BLOCK_LIMITS.children);
    expect(blocksSchema.safeParse([block]).success).toBe(true);
  });
  it("makes each item a leaf of the kind its layout decided", () => {
    const block = firstContainer([
      section({ type: "gallery", items: [item(), item({ sort_order: 2 })] }),
    ]);
    expect(block.mode).toBe("grid");
    expect(block.children).toHaveLength(2);
    expect(block.children.every((child) => child?.kind === "picture")).toBe(
      true,
    );
  });
  // `sort_order` is the flat model's ordering field and the block model has
  // none: the array IS the order. So this is the last point at which the
  // stored value means anything, and a page written before the editor
  // renumbered on every drag can carry an order its array does not have.
  it("orders sections and items by sort_order, not by array position", () => {
    const blocks = sectionsToBlocks([
      section({ name_en: "Second", sort_order: 2 }),
      section({
        name_en: "First",
        sort_order: 1,
        items: [
          item({ title_en: "b", sort_order: 2 }),
          item({ title_en: "a", sort_order: 1 }),
        ],
      }),
    ]);
    const [first, second] = blocks;
    if (!first || !isContainer(first)) throw new Error("not a container");
    expect(first.name_en).toBe("First");
    expect(
      first.children.map((child) =>
        !child || isContainer(child) ? "?" : child.title_en,
      ),
    ).toStrictEqual(["a", "b"]);
    if (!second || !isContainer(second)) throw new Error("not a container");
    expect(second.name_en).toBe("Second");
  });
  it("leaves the source untouched", () => {
    const page = [section({ sort_order: 2 }), section({ sort_order: 1 })];
    sectionsToBlocks(page);
    expect(page[0]?.sort_order).toBe(2);
  });
  // The two style bags are byte-identical — `style-bag-parity.test.ts` is what
  // keeps that true — so a section's own form travels unchanged.
  it("carries a section's style bag onto its container", () => {
    const style = { skin: "comic", border: "dashed" } as const;
    expect(firstContainer([section({ style })]).style).toStrictEqual(style);
  });
  it("carries every item field a leaf has a home for", () => {
    const block = firstContainer([
      section({
        type: "links",
        items: [
          item({
            icon: "paw-print",
            image_url: "https://example.test/a.png",
            link_url: "https://example.test",
          }),
        ],
      }),
    ]);
    expect(block.children[0]).toMatchObject({
      kind: "link",
      icon: "paw-print",
      image_url: "https://example.test/a.png",
      link_url: "https://example.test",
      title_es: "Un titulo",
      description_es: "Unas palabras.",
    });
  });
  // The database is the authority and this is what it was copied from. A
  // conversion the write schema refuses is one `set_actor_sections` refuses,
  // which is the banner this whole change exists to stop.
  it.each(SECTION_TYPES)(
    "writes a page the block schema accepts: %s",
    (type) => {
      const page = sectionsToBlocks([
        section({ type, items: [item(), item({ sort_order: 2 })] }),
      ]);
      expect(blocksSchema.safeParse(page).success).toBe(true);
    },
  );
  it("writes an empty page for an empty page", () => {
    expect(sectionsToBlocks([])).toStrictEqual([]);
  });
});
describe("what a converted page keeps", () => {
  // NOTHING AN AUTHOR WROTE IS DROPPED. Field by field rather than by a
  // structural comparison, because the conversion renames the container's
  // halves and drops `sort_order` on purpose — an equality assertion would
  // have to restate the whole output and would then pass on whatever the
  // conversion happened to produce.
  it.each(SECTION_TYPES)("carries every word of a section: %s", (type) => {
    const block = firstContainer([
      section({
        type,
        style: { skin: "glass" },
        items: [
          item({ sort_order: 1, icon: "paw-print" }),
          item({
            sort_order: 2,
            title_en: "Another",
            link_url: "https://a.test",
            image_url: "https://a.test/p.png",
          }),
        ],
      }),
    ]);
    expect(block.name_en).toBe("About");
    expect(block.name_es).toBe("Acerca de");
    expect(block.style).toStrictEqual({ skin: "glass" });
    expect(block.children).toHaveLength(2);
    const [first, second] = block.children;
    expect(first).toMatchObject({
      title_en: "A title",
      title_es: "Un titulo",
      description_en: "Some words.",
      description_es: "Unas palabras.",
      icon: "paw-print",
    });
    expect(second).toMatchObject({
      title_en: "Another",
      link_url: "https://a.test",
      image_url: "https://a.test/p.png",
    });
  });
  // A page written before the editor renumbered on every drag can carry an
  // order its array does not have, and this is the last point at which the
  // stored field means anything: a block has no order of its own, because the
  // array IS the order at every depth.
  it("orders by sort_order rather than by array position", () => {
    const page = sectionsToBlocks([
      section({
        name_en: "Second",
        sort_order: 9,
        items: [
          item({ title_en: "b", sort_order: 4 }),
          item({ title_en: "a", sort_order: 2 }),
        ],
      }),
      section({ name_en: "First", sort_order: 3, items: [] }),
    ]);
    expect(page.map((block) => isContainer(block) && block.name_en)).toEqual([
      "First",
      "Second",
    ]);
    const second = page[1];
    if (!second || !isContainer(second)) throw new Error("not a container");
    expect(
      second.children.map(
        (child) => child && !isContainer(child) && child.title_en,
      ),
    ).toEqual(["a", "b"]);
  });
  // NOTHING WRITTEN HERE IS EVER AN EMPTY PLACE, which is what lets a
  // converted page open with its shape already filled: a flat section holds
  // its items in an array with no way to say "nothing sits third", so there is
  // no gap to carry across.
  it("writes no empty place", () => {
    const block = firstContainer([
      section({ type: "gallery", items: [item(), item({ sort_order: 2 })] }),
    ]);
    expect(block.children.some((child) => child === null)).toBe(false);
  });
  // EVERY TEMPLATE, DRIVEN FROM THE LIST THAT SHIPS THEM, so one added later
  // is covered without anybody remembering to add a case. The template button
  // is the fastest way to fill a whole page, which is what made it the fastest
  // way to reach a save the database refused.
  it.each(STARTER_LAYOUTS.map((one) => [one.id, one] as const))(
    "converts the %s template into a page the database will take",
    (_id, layout) => {
      const blocks = sectionsToBlocks(structuredClone(layout.sections));
      expect(blocksSchema.safeParse(blocks).success).toBe(true);
      expect(blocks).toHaveLength(layout.sections.length);
    },
  );
});
describe("a layout name this build does not know", () => {
  // NOT REACHABLE TODAY, AND THAT IS THE POINT. Every caller passes a value
  // `z.enum(SECTION_TYPES)` has already accepted, so this fallback is guarded
  // by three call sites rather than by the table. `SHAPES` was a plain object
  // until a review noticed, and a plain object answers `__proto__` with
  // `Object.prototype` — truthy, with no `mode` and no `spaces` — so the guard
  // would have passed and the conversion emitted a container with neither.
  // That is the exact shape of the Critical this repository already shipped
  // through `TIDAL_KINDS`.
  it.each(["__proto__", "constructor", "toString", "diagram"])(
    "converts %s as a stack of prose rather than as nothing",
    (type) => {
      const page = sectionsToBlocks([
        section({ type: type as SectionType, items: [item()] }),
      ]);
      const [block] = page;
      if (!block || !isContainer(block)) throw new Error("not a container");
      expect(block.mode).toBe("stack");
      expect(block.spaces).toBe(1);
      expect(block.children[0]?.kind).toBe("text");
      // And it is still a page the database would take, which is the half a
      // structural check on its own would miss.
      expect(blocksSchema.safeParse(page).success).toBe(true);
    },
  );
});

describe("the decomposition table", () => {
  // TWO LAYOUTS THAT BECAME THE SAME BLOCK WOULD BE TWO PAGES THAT LOOK
  // IDENTICAL after conversion, which their authors would read as one of the
  // two having been retyped. The reverse conversion used to recover the layout
  // from this pair; nothing does now, and the distinctness is still what keeps
  // a converted page looking like the layout its author picked.
  it("gives every layout a distinct arrangement and kind", () => {
    const pairs = SECTION_TYPES.map((type) => {
      const block = firstContainer([section({ type })]);
      return `${block.mode}/${block.children[0]?.kind}`;
    });
    expect(new Set(pairs).size).toBe(SECTION_TYPES.length);
  });
});
