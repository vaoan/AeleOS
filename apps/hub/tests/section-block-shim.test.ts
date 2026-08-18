import { describe, expect, it } from "vitest";
import {
  blocksToSections,
  sectionsToBlocks,
} from "@/features/actors/domain/section-block-shim";
import {
  SECTION_TYPES,
  sectionsSchema,
  type FursonaSection,
} from "@/features/actors/domain/section-schema";
import {
  blocksSchema,
  isContainer,
  type Block,
  type ContainerBlock,
} from "@/features/actors/domain/block-schema";
import { FURSONA_TEMPLATES } from "@/features/actors/domain/fursona-templates";

// WHY THIS SUITE EXISTS, AND WHAT IT IS ALLOWED TO ASSUME.
//
// `set_actor_sections` walks `validate_block` and refuses the flat shape
// outright, while the only editor there is composes that flat shape. Every
// save carrying a section was refused in production. This shim converts at the
// write and back at the read, so the two halves meet until the block editor
// replaces the second one.
//
// The assertion that actually proves it is the ROUND TRIP: flat in, blocks
// out, flat back, equal. A one-way test would pass on a conversion that
// silently retyped somebody's section, and that is the exact failure a person
// meets a week later when they reopen their page.
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

/**
 * A leaf, loose enough to carry what a block editor could write and a flat
 * item cannot.
 *
 * @param over - fields to replace.
 * @returns the leaf.
 */
const leaf = (over: Record<string, unknown> = {}) =>
  ({
    kind: "text",
    span: 1,
    title_en: "A leaf",
    description_en: "",
    ...over,
  }) as unknown as Block;

/**
 * A container holding whatever it is given.
 *
 * @param over - fields to replace.
 * @returns the container.
 */
const container = (over: Record<string, unknown> = {}) =>
  ({
    kind: "container",
    mode: "stack",
    columns: 1,
    span: 1,
    name_en: "About",
    children: [leaf()],
    ...over,
  }) as unknown as Block;

describe("sectionsToBlocks", () => {
  it("makes a section a named container at the top of the page", () => {
    const block = firstContainer([section({ name_es: "Acerca de" })]);
    expect(block.kind).toBe("container");
    expect(block.name_en).toBe("About");
    expect(block.name_es).toBe("Acerca de");
    expect(block.span).toBe(1);
  });

  it("makes each item a leaf of the kind its layout decided", () => {
    const block = firstContainer([
      section({ type: "gallery", items: [item(), item({ sort_order: 2 })] }),
    ]);
    expect(block.mode).toBe("grid");
    expect(block.children).toHaveLength(2);
    expect(block.children.every((child) => child.kind === "picture")).toBe(
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
        isContainer(child) ? "?" : child.title_en,
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

describe("blocksToSections", () => {
  it("recovers a section from the container it became", () => {
    expect(blocksToSections(sectionsToBlocks([section()]))).toStrictEqual([
      section(),
    ]);
  });

  // One-based, matching the editor's own `renumber`, and rebuilt from position
  // because a block carries no order of its own.
  it("rebuilds sort_order from position", () => {
    const blocks = sectionsToBlocks([
      section({ name_en: "One", sort_order: 7 }),
      section({
        name_en: "Two",
        sort_order: 9,
        items: [item({ sort_order: 4 }), item({ sort_order: 6 })],
      }),
    ]);
    const back = blocksToSections(blocks);
    expect(back?.map((one) => one.sort_order)).toStrictEqual([1, 2]);
    expect(back?.[1]?.items.map((one) => one.sort_order)).toStrictEqual([1, 2]);
  });

  it("reads nothing as nothing", () => {
    expect(blocksToSections([])).toStrictEqual([]);
  });

  // EVERY REFUSAL BELOW IS THE SAME RULE: a tree this shim did not write is a
  // tree only a block editor could have built, and flattening it into what a
  // flat editor can hold would let the next save write the flattening back
  // over the whole. `readActorPage` maps this null onto the refusal.
  it("refuses a leaf at the top of the page", () => {
    expect(blocksToSections([leaf()])).toBeNull();
  });

  it("refuses an unnamed container", () => {
    expect(blocksToSections([container({ name_en: undefined })])).toBeNull();
    expect(blocksToSections([container({ name_en: "" })])).toBeNull();
  });

  it("refuses a container inside a container", () => {
    expect(
      blocksToSections([container({ children: [container()] })]),
    ).toBeNull();
  });

  it("refuses a leaf that spans more than its one track", () => {
    expect(
      blocksToSections([container({ children: [leaf({ span: 2 })] })]),
    ).toBeNull();
  });

  it("refuses a leaf wearing its own style bag", () => {
    expect(
      blocksToSections([
        container({ children: [leaf({ style: { skin: "comic" } })] }),
      ]),
    ).toBeNull();
  });

  it("refuses a leaf carrying table rows", () => {
    expect(
      blocksToSections([
        container({
          children: [leaf({ kind: "table", rows: [[{ text_en: "a" }]] })],
        }),
      ]),
    ).toBeNull();
  });

  // The thing the block model added and the flat model cannot say: a picture
  // beside a player, in one container.
  it("refuses a container holding two kinds of leaf", () => {
    expect(
      blocksToSections([
        container({
          mode: "grid",
          children: [leaf({ kind: "picture" }), leaf({ kind: "link" })],
        }),
      ]),
    ).toBeNull();
  });

  it("refuses a mode and kind pair no flat layout claims", () => {
    expect(
      blocksToSections([
        container({ mode: "timeline", children: [leaf({ kind: "quote" })] }),
      ]),
    ).toBeNull();
  });

  // A kind the lenient read admits because a newer deployment wrote it. There
  // is no flat layout for it and there cannot be.
  it("refuses a kind this build does not know", () => {
    expect(
      blocksToSections([container({ children: [leaf({ kind: "diagram" })] })]),
    ).toBeNull();
  });

  it("refuses an empty container in a mode no flat layout claims", () => {
    expect(
      blocksToSections([container({ mode: "spiral", children: [] })]),
    ).toBeNull();
  });

  // THE ONE THING THAT DOES NOT ROUND-TRIP, ASSERTED RATHER THAN IMPLIED. A
  // container with no children carries no leaf kind, so `grid` alone cannot
  // say which of eight layouts it was. Nothing is lost, because there is
  // nothing in it.
  it("reopens an empty section as its arrangement's default layout", () => {
    const back = blocksToSections(
      sectionsToBlocks([section({ type: "gallery", items: [] })]),
    );
    expect(back?.[0]?.type).toBe("cards");
    expect(back?.[0]?.items).toStrictEqual([]);
  });
});

describe("the round trip", () => {
  // THE ASSERTION THE WHOLE SHIM IS FOR. A one-way conversion can look right
  // and still retype somebody's section on the way back, which they discover
  // when they reopen the page rather than when they save it.
  it.each(SECTION_TYPES)("survives storage: %s", (type) => {
    const page = [
      section({
        type,
        items: [
          item({ sort_order: 1, icon: "paw-print" }),
          item({
            sort_order: 2,
            title_en: "Another",
            link_url: "https://a.test",
          }),
        ],
        style: { skin: "glass" },
      }),
    ];
    expect(blocksToSections(sectionsToBlocks(page))).toStrictEqual(page);
  });

  it("survives storage without the optional halves", () => {
    const page = [
      {
        name_en: "Bare",
        type: "stats" as const,
        sort_order: 1,
        items: [{ title_en: "One", description_en: "1", sort_order: 1 }],
      },
    ];
    expect(blocksToSections(sectionsToBlocks(page))).toStrictEqual(page);
  });

  // EVERY TEMPLATE, DRIVEN FROM THE LIST THAT SHIPS THEM, so one added later
  // is covered without anybody remembering to add a case. The template button
  // is how this bug was found: one click fills a whole page, so it is the
  // fastest way to reach a save that carries sections.
  it.each(FURSONA_TEMPLATES.map((one) => [one.id, one] as const))(
    "survives storage: the %s template",
    (_id, template) => {
      const page = structuredClone(template.sections);
      const blocks = sectionsToBlocks(page);
      expect(blocksSchema.safeParse(blocks).success).toBe(true);
      const back = blocksToSections(blocks);
      expect(back).toStrictEqual(page);
      // And what comes back is still a page the editor would let somebody
      // save, which is the half a structural comparison does not cover.
      expect(sectionsSchema.safeParse(back).success).toBe(true);
    },
  );
});

describe("the decomposition table", () => {
  // WITHOUT THIS THE ROUND TRIP IS A COINCIDENCE. `blocksToSections` recovers
  // a layout from the mode and kind its container and children carry, so two
  // layouts sharing one pair would silently retype one of them — and the
  // per-type round trip above would fail for one of the two, in a way that
  // reads as a bug in the conversion rather than in the table.
  it("gives every layout a distinct arrangement and kind", () => {
    const pairs = SECTION_TYPES.map((type) => {
      const block = firstContainer([section({ type })]);
      return `${block.mode}/${block.children[0]?.kind}`;
    });
    expect(new Set(pairs).size).toBe(SECTION_TYPES.length);
  });

  // A layout added to the table without an entry in the empty-container map
  // would make a section somebody saved before filling in unreadable, which
  // refuses every later save on that page.
  it("names an empty-section layout for every arrangement it uses", () => {
    for (const type of SECTION_TYPES) {
      const empty = sectionsToBlocks([section({ type, items: [] })]);
      expect(blocksToSections(empty)).not.toBeNull();
    }
  });
});
