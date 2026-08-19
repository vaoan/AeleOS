import {
  CONTAINER_KIND,
  type Block,
  type ContainerMode,
  type LeafBlock,
  type LeafKind,
} from "@/features/actors/domain/block-schema";
import type {
  FursonaSection,
  SectionType,
} from "@/features/actors/domain/section-schema";

/**
 * One item of a flat section, named so the conversion below can say what it
 * takes without restating the shape.
 */
type FursonaSectionItem = FursonaSection["items"][number];

/** What one flat layout becomes as a block. */
interface FlatShape {
  /** The arrangement its container takes. */
  mode: ContainerMode;
  /** The places ACROSS that container declares; rows continue beneath them. */
  spaces: number;
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
 * implementation filled in — a space count, and (where the table names a
 * container without naming what it holds) the leaf kind that keeps the fields
 * the flat editor already offers for that layout.
 *
 * **How the space count was chosen, written down because somebody will want to
 * change one.** `spaces` is how many places a container lays ACROSS, and its
 * children fill them row by row, so the number to pick is the WIDTH the flat
 * layout drew — never how many items a section happens to hold. A gallery of
 * fifty pictures is a few places across with rows beneath it; fifty across is
 * a shape no screen has, and one across is a column of full-width pictures
 * nobody chose. So each row below carries the width its flat layout already
 * rendered at:
 *
 *  * **Three** for the card-shaped layouts — `cards`, `gallery`, `socials`,
 *    `posts` and `masonry` — which is the width their flat grids used.
 *  * **Four** for `stats`, because a statistic is a short label over a number
 *    and four of them read as a row rather than as a wall.
 *  * **Two** for `video`, `quote` and `progress`, whose content needs room: a
 *    player narrower than this cannot show a title, and a quote wants a line
 *    long enough to have a rhythm.
 *  * **One** for every arrangement that was never a grid — `stack`,
 *    `carousel`, `tabs`, `accordion` and `timeline` lay out one place per row
 *    whatever is declared, so the value is a resting one rather than a
 *    decision. `music` is a `stack` for that reason and not because a player
 *    is narrow.
 *
 * Changing one of these changes how a stored flat page LOOKS the next time
 * anybody reads it, because this conversion runs on the read as well as the
 * write — and it becomes what is stored at that page's next save.
 *
 * **Every `mode`/`kind` pair is distinct, and it is worth keeping so even
 * though nothing reads one back any more.** The reverse conversion existed
 * only for a flat editor opening a stored tree, and there is no flat editor;
 * what the distinctness buys now is that two flat layouts cannot become the
 * same block, so a page converted forward still looks like the layout its
 * author picked. `section-block-shim.test.ts` asserts it rather than trusting
 * a reader to check every row.
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
  cards: { mode: "grid", spaces: 3, kind: "link" },
  accordion: { mode: "accordion", spaces: 1, kind: "text" },
  "two-column": { mode: "stack", spaces: 1, kind: "stat" },
  gallery: { mode: "grid", spaces: 3, kind: "picture" },
  video: { mode: "grid", spaces: 2, kind: "player" },
  music: { mode: "stack", spaces: 1, kind: "player" },
  carousel: { mode: "carousel", spaces: 1, kind: "picture" },
  links: { mode: "stack", spaces: 1, kind: "link" },
  stats: { mode: "grid", spaces: 4, kind: "stat" },
  quote: { mode: "grid", spaces: 2, kind: "quote" },
  timeline: { mode: "timeline", spaces: 1, kind: "text" },
  socials: { mode: "grid", spaces: 3, kind: "social" },
  posts: { mode: "grid", spaces: 3, kind: "post" },
  masonry: { mode: "masonry", spaces: 3, kind: "link" },
  progress: { mode: "grid", spaces: 2, kind: "progress" },
  tabs: { mode: "tabs", spaces: 1, kind: "text" },
} as const satisfies Record<SectionType, FlatShape>;

/**
 * What a layout name this build does not know converts as.
 *
 * `stack` arranges nothing and `text` holds prose, so an unrecognised layout
 * keeps every word its author wrote and loses only an arrangement this build
 * could not have drawn anyway. The pair is claimed by no row of {@link SHAPES},
 * which keeps it distinguishable from anything that really was one of them.
 */
const UNKNOWN_SHAPE: FlatShape = { mode: "stack", spaces: 1, kind: "text" };

/**
 * {@link SHAPES}, as a lookup safe to index with a stored value.
 *
 * **A `Map` because the key comes out of `jsonb`.** Every caller happens to
 * pass a value `z.enum(SECTION_TYPES)` has already accepted, so
 * `SHAPES["__proto__"]` is not reachable today — but that is a property of
 * three call sites rather than of this table, and this feature's own rule is
 * that such lookups are `Map`s. It is not academic: a plain object answers
 * `__proto__` with `Object.prototype`, which is truthy and has no `mode`, so
 * the guard would pass and the conversion would emit a container with no
 * arrangement and no width. That is the exact shape of the Critical this
 * repository already shipped through `TIDAL_KINDS`.
 *
 * Built from {@link SHAPES} rather than restated, so the compile-time
 * `satisfies` check above stays the one place a layout can be forgotten.
 */
const SHAPE_OF: ReadonlyMap<string, FlatShape> = new Map(
  Object.entries(SHAPES),
);

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
 * nearly every field across the two directions is one and a forgotten spread
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
 * own, because the array IS the order at every depth, and this function's
 * caller sorts by it before converting.
 *
 * @param item - the item to convert.
 * @param kind - the leaf kind its section's layout decided.
 * @returns the leaf.
 */
function toLeaf(item: FursonaSectionItem, kind: LeafKind): LeafBlock {
  return withoutAbsent({
    kind,
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
 * Whatever the flat editor composed, as the tree of blocks the database
 * accepts.
 *
 * **It converts ONE way, and the direction it lost is the point.** It used to
 * run at the write as well, because the only editor there was composed flat
 * sections; the editor composes blocks now, so the write path converts nothing
 * and `blocksToSections` — which turned a stored tree back into flat sections
 * for that editor to open — is gone with the editor that needed it.
 *
 * **Its callers are the read paths and the template picker, and none is going
 * away soon.** Every page written before the block model is still flat in the
 * column, converted here on the read by `readActorPage` and by the public
 * pages' own `parseBlocks`; and the shipped templates are still written in the
 * flat vocabulary, converted here when the picker applies one. So this file
 * outlives the phase that created it, and a page stays flat in storage until
 * its owner next saves.

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
 * **Each container gets the WIDTH its flat layout drew and a child per item**,
 * never a place per item: `spaces` is how many places a container lays across
 * and its children fill them row by row, so a section of fifty pictures is a
 * few places across with rows beneath it. {@link SHAPES} carries the width for
 * every layout and says how each was chosen. No place written here is ever
 * empty — a flat section has no way to express one — so a converted page opens
 * with every place filled and grows empty ones only when somebody adds them.
 *
 * What it does NOT do, and must not be made to do: validate. `blocksSchema`
 * and `validate_block` are the authority, in that order, and a refusal from
 * either has to reach the person rather than being pre-empted here. One
 * consequence is worth knowing, and it is sharper than it used to read here:
 * the flat caps allow twenty sections of fifty items, which is more blocks
 * than `BLOCK_LIMITS.blocks` permits, so a legacy page near that ceiling
 * converts here into a tree nothing will accept. It READS and RENDERS
 * perfectly — the page-level caps are on the strict side only — and its owner
 * cannot save it at all until they take something off it, with the
 * `sectionsTooLarge` banner saying so. The database never sees it: the strict
 * schema refuses first. That is the honest outcome rather than a gap, because
 * the alternative — dropping blocks during conversion — deletes somebody's
 * writing to make a save succeed, and a second cap here would only pre-empt
 * the authority.
 *
 * **A layout name this build does not know becomes a stack of prose** rather
 * than nothing — see {@link UNKNOWN_SHAPE}. Nothing can reach that today,
 * because every caller passes a value `z.enum(SECTION_TYPES)` has accepted;
 * what it replaces is a plain-object lookup that answered `__proto__` with
 * `Object.prototype`, truthy and carrying neither a `mode` nor a `spaces`, so
 * the guard would have passed and the conversion emitted a container with
 * neither.
 *
 * @param sections - the sections, as the editor validated them.
 * @returns the same page as blocks: one named container per section, holding
 * one leaf per item.
 */
export function sectionsToBlocks(sections: readonly FursonaSection[]): Block[] {
  return sections
    .toSorted((a, b) => a.sort_order - b.sort_order)
    .map((section) => {
      const shape = SHAPE_OF.get(section.type) ?? UNKNOWN_SHAPE;
      return withoutAbsent({
        kind: CONTAINER_KIND,
        mode: shape.mode,
        spaces: shape.spaces,
        name_en: section.name_en,
        name_es: section.name_es,
        style: section.style,
        children: section.items
          .toSorted((a, b) => a.sort_order - b.sort_order)
          .map((item) => toLeaf(item, shape.kind)),
      });
    });
}
