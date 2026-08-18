import {
  CONTAINER_KIND,
  isContainer,
  type Block,
  type ContainerMode,
  type LeafBlock,
  type LeafKind,
} from "@/features/actors/domain/block-schema";
import {
  SECTION_TYPES,
  type FursonaSection,
  type SectionType,
} from "@/features/actors/domain/section-schema";

/**
 * One item of a flat section, named so the two directions below can say what
 * they take and return without restating the shape.
 */
type FursonaSectionItem = FursonaSection["items"][number];

/** What one flat layout becomes as a block. */
interface FlatShape {
  /** The arrangement its container takes. */
  mode: ContainerMode;
  /** The tracks that container declares. */
  columns: number;
  /** The kind every one of its children is. */
  kind: LeafKind;
}

/**
 * Which container and which leaf each flat layout becomes.
 *
 * **This is the decomposition table from
 * `docs/superpowers/specs/2026-08-17-blocks-and-grids-design.md` and
 * `features/actors/CLAUDE.md`, made executable.** Nothing here was invented:
 * every row is that table's row, with the two things the table leaves to the
 * implementation filled in — a track count, and (where the table names a
 * container without naming what it holds) the leaf kind that keeps the fields
 * the flat editor already offers for that layout.
 *
 * **Every `mode`/`kind` pair is distinct, and that is load-bearing rather than
 * tidy.** {@link blocksToSections} reads the pair back to recover the layout,
 * so two layouts sharing one pair would make a round trip through storage
 * silently retype somebody's section. `section-block-shim.test.ts` asserts the
 * distinctness rather than trusting a reader to check sixteen rows.
 *
 * Three rows are worth reading rather than skimming, because each is a
 * judgement the table did not make:
 *
 *  * **`cards` keeps the grid and `links` takes the stack.** Both are cards
 *    carrying an icon, a title and a description — the flat model's one
 *    genuinely redundant pair, which the block model expresses as one leaf
 *    kind in two arrangements. `cards` is the layout the shipped templates
 *    build with and the one whose whole name is the grid, so it keeps it; a
 *    stack of full-width buttons is what `links` looked like on a phone
 *    anyway.
 *  * **`video` is a two-track grid and `music` a stack**, which is exactly
 *    what the two flat layouts were: `Music` laid one player per row on the
 *    argument that two players side by side leave neither wide enough to show
 *    a track name.
 *  * **`two-column` becomes one `stat` leaf per pair**, not one `table` leaf
 *    holding every pair. The decomposition table offers both — "a `table`
 *    leaf, or a `stat` leaf, for a single pair" — and a flat item IS a single
 *    pair. Choosing `table` would fold every item into a row and drop
 *    `sort_order`, `icon`, `image_url` and `link_url` with it, so a page could
 *    not survive the round trip this shim exists to make survivable; it would
 *    also need a caption, and the only string available to invent one from is
 *    the section name the heading above it already shows.
 */
const SHAPES = {
  cards: { mode: "grid", columns: 3, kind: "link" },
  accordion: { mode: "accordion", columns: 1, kind: "text" },
  "two-column": { mode: "stack", columns: 1, kind: "stat" },
  gallery: { mode: "grid", columns: 3, kind: "picture" },
  video: { mode: "grid", columns: 2, kind: "player" },
  music: { mode: "stack", columns: 1, kind: "player" },
  carousel: { mode: "carousel", columns: 1, kind: "picture" },
  links: { mode: "stack", columns: 1, kind: "link" },
  stats: { mode: "grid", columns: 4, kind: "stat" },
  quote: { mode: "grid", columns: 2, kind: "quote" },
  timeline: { mode: "timeline", columns: 1, kind: "text" },
  socials: { mode: "grid", columns: 3, kind: "social" },
  posts: { mode: "grid", columns: 3, kind: "post" },
  masonry: { mode: "masonry", columns: 3, kind: "link" },
  progress: { mode: "grid", columns: 2, kind: "progress" },
  tabs: { mode: "tabs", columns: 1, kind: "text" },
} as const satisfies Record<SectionType, FlatShape>;

/**
 * The layout a container's arrangement and its children's kind name together.
 *
 * **A `Map` where {@link SHAPES} is a plain object, and the difference is not
 * a style choice.** A `SectionType` reaches {@link SHAPES} only after
 * `z.enum(SECTION_TYPES)` has accepted it, so it can never be `__proto__`; a
 * `mode` and a `kind` reach this one straight out of `jsonb`, where they can
 * be anything at all. That is the shape of the Critical this repository
 * already shipped through `TIDAL_KINDS`, and a `Map` has no inherited entries
 * to find.
 *
 * Built from {@link SHAPES} rather than restated, so there is one table to
 * have gotten wrong.
 */
const LAYOUT_OF = new Map<string, SectionType>(
  SECTION_TYPES.map((type) => [
    `${SHAPES[type].mode}/${SHAPES[type].kind}`,
    type,
  ]),
);

/**
 * The layout an EMPTY container falls back to, keyed by its arrangement alone.
 *
 * **The one thing this shim cannot round-trip, stated where it happens.** A
 * container with no children carries no leaf kind, so `grid` alone cannot say
 * whether it was `cards`, `gallery`, `posts`, `socials`, `video`, `quote`,
 * `progress` or `stats`. A section somebody added and saved before putting
 * anything in it therefore reopens as this layout instead of the one they
 * picked — nothing they wrote is lost, because there is nothing in it, and
 * the picker is one control away.
 *
 * Declared rather than derived from the first matching row of {@link SHAPES},
 * because "whichever happened to be listed first" is a decision nobody made.
 * `section-block-shim.test.ts` asserts that every mode {@link SHAPES} uses
 * appears here, so a layout added to that table cannot leave this one behind.
 */
const EMPTY_LAYOUT_OF = new Map<string, SectionType>([
  ["stack", "links"],
  ["grid", "cards"],
  ["masonry", "masonry"],
  ["carousel", "carousel"],
  ["tabs", "tabs"],
  ["accordion", "accordion"],
  ["timeline", "timeline"],
]);

/**
 * The same object with every key that holds `undefined` removed.
 *
 * **A key holding `undefined` is not an absent key, and here the difference is
 * the contract.** Both directions promise that a page survives storage
 * unchanged, and that promise is only worth stating as equality — which is how
 * `section-block-shim.test.ts` asserts it — if an unwritten Spanish title
 * comes back absent rather than present-and-empty. It also keeps the block
 * style bag's own rule intact one level up: absent means "inherit", and a key
 * that exists holding nothing is the third state that bag refuses everywhere.
 *
 * One helper rather than a conditional spread per optional field, because
 * there are thirteen of them across the two directions and a forgotten one
 * would show up only as a round trip that is nearly equal.
 *
 * @param value - the object to clean.
 * @returns the same object without its absent keys.
 */
function withoutAbsent<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, held]) => held !== undefined),
  ) as T;
}

/**
 * One flat item as the leaf its layout became.
 *
 * `sort_order` is dropped rather than carried: a block has no order of its
 * own, because the array IS the order at every depth. {@link toItem} puts it
 * back from the position.
 *
 * @param item - the item to convert.
 * @param kind - the leaf kind its section's layout decided.
 * @returns the leaf.
 */
function toLeaf(item: FursonaSectionItem, kind: LeafKind): LeafBlock {
  return withoutAbsent({
    kind,
    span: 1,
    title_en: item.title_en,
    title_es: item.title_es,
    description_en: item.description_en,
    description_es: item.description_es,
    icon: item.icon,
    image_url: item.image_url,
    link_url: item.link_url,
  });
}

/**
 * One leaf as the flat item it came from.
 *
 * @param leaf - the leaf to convert.
 * @param position - where it sits among its siblings, counting from zero.
 * @returns the item, ordered by its position.
 */
function toItem(leaf: LeafBlock, position: number): FursonaSectionItem {
  return withoutAbsent({
    title_en: leaf.title_en,
    title_es: leaf.title_es,
    description_en: leaf.description_en,
    description_es: leaf.description_es,
    icon: leaf.icon,
    image_url: leaf.image_url,
    link_url: leaf.link_url,
    // One-based, matching what the editor's own `renumber` writes: a section's
    // and an item's `sort_order` are its position among its siblings plus one.
    sort_order: position + 1,
  });
}

/**
 * Whatever the flat editor composed, as the tree of blocks the database
 * accepts.
 *
 * **This is a shim and it has a stated end: the block editor, phase 3 of
 * `2026-08-17-blocks-and-grids-design.md`.** The task that lands that editor
 * deletes this file, `section-schema.ts`, `fursona-templates.ts` and
 * `section-editor.tsx` together — the flat model has no other reader once
 * somebody can build a tree directly. Nothing else may grow a dependency on
 * it in the meantime.
 *
 * It exists because `set_actor_sections` began validating blocks, and refuses
 * the flat shape outright, while the editor that composes that shape is still
 * the only editor there is. Every save carrying a section was refused in
 * production, templates included. Converting at the write is what lets both
 * halves keep working until the second one is replaced.
 *
 * **Sections and items are ordered by `sort_order` here, not by their array
 * position.** A block has no order of its own — the array IS the order — so
 * this is the last point at which the stored field means anything, and a page
 * written before the editor renumbered on every drag can still carry an order
 * its array does not have.
 *
 * **A section's own style bag travels unchanged**, because the block style bag
 * is byte-identical to the flat one; `style-bag-parity.test.ts` is what keeps
 * that true.
 *
 * What it does NOT do, and must not be made to do: validate. `blocksSchema`
 * and `validate_block` are the authority, in that order, and a refusal from
 * either has to reach the person rather than being pre-empted here. One
 * consequence is worth knowing: the flat caps allow twenty sections of fifty
 * items, which is 1,020 blocks against `BLOCK_LIMITS.blocks`' 500, so a page
 * far larger than any real one is accepted by the editor and refused by the
 * database. That refusal is reported — see `PageRefusedError` — and is not
 * worth a second cap in a file that is being deleted.
 *
 * @param sections - the sections, as the editor validated them.
 * @returns the same page as blocks: one named container per section, holding
 * one leaf per item.
 */
export function sectionsToBlocks(sections: readonly FursonaSection[]): Block[] {
  return sections
    .toSorted((a, b) => a.sort_order - b.sort_order)
    .map((section) => {
      const shape = SHAPES[section.type];
      return withoutAbsent({
        kind: CONTAINER_KIND,
        mode: shape.mode,
        columns: shape.columns,
        span: 1,
        name_en: section.name_en,
        name_es: section.name_es,
        style: section.style,
        children: section.items
          .toSorted((a, b) => a.sort_order - b.sort_order)
          .map((item) => toLeaf(item, shape.kind)),
      });
    });
}

/**
 * One container as the flat section it came from, or nothing when it is not
 * one this shim wrote.
 *
 * @param block - the block to convert.
 * @param position - where it sits on the page, counting from zero.
 * @returns the section, or null when the block cannot be one.
 */
function toSection(block: Block, position: number): FursonaSection | null {
  if (!isContainer(block)) return null;
  // A container with no name is a group, which the flat model has no way to
  // express: `name_en` is required there. Only a block editor can make one.
  if (!block.name_en) return null;

  const children: LeafBlock[] = [];
  for (const child of block.children) {
    // A nested container is the whole point of the block model and the one
    // thing a flat list cannot hold. Refusing is what keeps the editor from
    // flattening somebody's tree and saving the flattening back over it.
    if (isContainer(child)) return null;
    // A leaf that spans more than its one track, wears its own style bag or
    // carries table rows is carrying something no flat item has a field for.
    // Dropping it silently is how a save destroys what it could not read.
    if (child.span !== 1 || child.style || child.rows) return null;
    children.push(child);
  }

  const kinds = new Set(children.map((child) => child.kind));
  // One leaf kind per section, because a flat section's layout decided what
  // every one of its items was. A container holding a picture beside a player
  // is precisely what the block model added and the flat model cannot say.
  if (kinds.size > 1) return null;

  const layout =
    children.length === 0
      ? EMPTY_LAYOUT_OF.get(block.mode)
      : LAYOUT_OF.get(`${block.mode}/${children[0]!.kind}`);
  if (!layout) return null;

  return withoutAbsent({
    name_en: block.name_en,
    name_es: block.name_es,
    type: layout,
    sort_order: position + 1,
    items: children.map((child, index) => toItem(child, index)),
    style: block.style,
  });
}

/**
 * A stored page as flat sections the editor can open, or **null** when it is
 * not a page this shim wrote.
 *
 * **The null is the whole safety property and it must not be softened into an
 * empty array or a best effort.** `set_actor_sections` REPLACES, so an editor
 * that opened a tree it half-understood and then saved would write the half
 * back over the whole — the erasure that is already a Critical with a
 * regression test. `readActorPage` maps this null onto `ActorPage.sections`'
 * own null, which refuses the save outright with a reason; see that type for
 * why "nothing is written" and "I could not read what is written" have to stay
 * different answers.
 *
 * So it recognises exactly what {@link sectionsToBlocks} writes and nothing
 * else. A tree with a container inside a container, a leaf spanning two
 * tracks, a leaf wearing its own style, a container holding two kinds of leaf,
 * an unnamed container, or a `mode`/`kind` pair no flat layout claims — every
 * one of those is a page only a block editor could have built, and every one
 * answers null.
 *
 * **`sort_order` is rebuilt from position**, one-based, exactly as the
 * editor's own `renumber` writes it. It is the field the flat model orders by
 * and the block model does not have, so there is nothing else it could be.
 *
 * The one thing that does not survive the round trip is a section somebody
 * saved with no items at all — see {@link EMPTY_LAYOUT_OF}.
 *
 * @param blocks - the page, as it was read back from storage.
 * @returns the flat sections, or null when the tree is not flat-shaped.
 */
export function blocksToSections(
  blocks: readonly Block[],
): FursonaSection[] | null {
  const sections: FursonaSection[] = [];
  for (const [position, block] of blocks.entries()) {
    const section = toSection(block, position);
    if (!section) return null;
    sections.push(section);
  }
  return sections;
}
