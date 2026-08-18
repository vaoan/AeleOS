import { Plus, Quote as QuoteMark } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { contentFor } from "@/features/actors/domain/actor-content";
import {
  MAX_DEPTH,
  PAGE_TRACKS,
  effectiveSpan,
  isContainer,
  type Block as BlockNode,
  type ContainerBlock,
  type ContainerMode,
  type LeafBlock,
  type LeafKind,
} from "@/features/actors/domain/block-schema";
import {
  resolveEmbed,
  safeHttpUrl,
  type EmbedShape,
  type ResolvedEmbed,
} from "@/features/actors/domain/embeds";
import { progressValue } from "@/features/actors/domain/progress-value";
import { resolveSocial } from "@/features/actors/domain/social-links";
import { blockStyle } from "@/features/actors/presentation/block-style";
import { PublicSectionIcon } from "@/features/actors/presentation/public-section-icon";
import { tid } from "@/shared/infrastructure/test-id";

/**
 * What one block needs to render itself and everything beneath it.
 *
 * **`tracks`, `path` and `labelled` are all about the PARENT**, which is what
 * makes the recursion compose: a span is a count of the containing grid's
 * tracks, a path is the containing block's path with this block's position
 * appended, and whether a block still owes its own name depends on whether the
 * mode above it has already shown it. Only `labelled` is optional, because
 * only it has an answer a caller with nothing to say can be given.
 *
 * **`parentHost` is the exception and is not about the parent at all** — it is
 * this deployment's own configuration, resolved by the route and threaded
 * unchanged the whole way down to the one leaf kind that reads it. It shares
 * the recursion rather than the meaning.
 */
export interface BlockProps {
  /** The block to render, as parsed. */
  block: BlockNode;
  /** The locale being read, which decides which language is preferred. */
  locale: string;
  /**
   * How far this block sits from the top of the page — 0 for a section.
   *
   * **It decides a heading's LEVEL and nothing else.** The recursion does not
   * need it to terminate: a container's children are one level deeper by
   * construction and the schema refuses a tree past {@link MAX_DEPTH} before
   * anything reaches here, so there is no counter to forget to increment.
   */
  depth: number;
  /**
   * The track count of whatever contains this block.
   *
   * Pass `PAGE_TRACKS` for a block at the top of a page. A stored span wider
   * than this is narrowed by {@link effectiveSpan} here, at render — never on
   * the way into storage, where it would destroy what the author typed.
   */
  tracks: number;
  /**
   * This block's position in the tree, as digits and hyphens.
   *
   * **Built only from array indices, never from anything an author typed**, so
   * it is safe as an HTML `id` and as a radio group's `name`. That is not
   * fussiness: `aria-controls` takes a space-separated ID-reference LIST, so a
   * single id carrying a section name with a space in it tokenises into pieces
   * that resolve to nothing — a dangling reference, which is worse than none.
   * The flat renderer this supersedes had to keep two separate values to get
   * that right; here the path is the identifier and there is nothing else to
   * reach for.
   */
  path: string;
  /**
   * This deployment's own hostname, for Twitch's `parent=`.
   *
   * **A `player` leaf reads it**, through `resolveEmbed`; every other kind and
   * every mode threads it onward untouched. Twitch's player refuses to load
   * unless `parent=` names the embedding domain, so an empty value degrades
   * Twitch to a link rather than framing a player guaranteed to error.
   *
   * Resolved by the route, never read here: a presentation component is not the
   * thing that knows its own deployment configuration.
   */
  parentHost: string;
  /**
   * Whether this block still has to show its own name.
   *
   * **`false` means an enclosing mode has already shown it**, which `tabs` and
   * `accordion` both do: the child's label IS the tab, and IS the summary. A
   * block that printed it again would say the same words twice on one screen —
   * a fault the flat model could not produce, because there an item's title
   * WAS the summary and its description WAS the panel.
   *
   * Absent means yes, which is the ordinary case and what a page's outermost
   * blocks want. It is optional rather than required so a caller with nothing
   * to say about it says nothing; a mode that starts lifting a label and
   * forgets to pass `false` prints the words twice, which is visible on the
   * first render rather than silent.
   */
  labelled?: boolean;
}

/** What every entry in {@link MODES} is handed. */
interface ModeProps {
  /** The container whose children are being arranged. */
  container: ContainerBlock;
  /** The locale being read. */
  locale: string;
  /** The container's own depth; its children render one deeper. */
  depth: number;
  /** The container's own path; its children append their index to it. */
  path: string;
  /** Threaded to the children — see {@link BlockProps.parentHost}. */
  parentHost: string;
}

/** One arrangement, as a component over {@link ModeProps}. */
type ModeRenderer = (props: ModeProps) => ReactNode;

/**
 * The grid a container declares, by its track count.
 *
 * **A static class per count, not an inline `grid-template-columns`, and the
 * reason is the breakpoint.** Every block is one track below `sm` and takes
 * its declared share above it; an inline style cannot carry a media query, and
 * a span that survives the collapse is the 320px overflow this project has
 * already shipped once — `grid-column: span 3` inside a single-track grid does
 * not clamp, it creates two implicit tracks and pushes the row past the
 * viewport. Tailwind's own `grid-cols-<n>` compiles to
 * `repeat(<n>, minmax(0, 1fr))`, which is the template the design asks for,
 * and a `minmax` whose floor is `0` is the one shape that cannot overflow
 * whatever the container's width turns out to be.
 *
 * A `Map` rather than a record because the count arrives from `jsonb`. The
 * schema bounds it on both the read and the write path, but indexing a plain
 * object with a stored value is the shape that put a `__proto__` through
 * `TIDAL_KINDS` — and a number key cannot be one of those names, which is
 * exactly the guarantee a `Map` makes and a record does not.
 */
const TRACK_CLASS = new Map<number, string>([
  [1, "sm:grid-cols-1"],
  [2, "sm:grid-cols-2"],
  [3, "sm:grid-cols-3"],
  [4, "sm:grid-cols-4"],
]);

/**
 * The share of its parent's tracks a block takes, by its effective span.
 *
 * A span of one carries no class at all: the grid already gives every item one
 * track, and an emitted `col-span-1` would be a declaration that changes
 * nothing. Every other entry is `sm:`-prefixed for the reason
 * {@link TRACK_CLASS} gives — below the breakpoint there is one track and
 * nothing to span.
 */
const SPAN_CLASS = new Map<number, string>([
  [1, ""],
  [2, "sm:col-span-2"],
  [3, "sm:col-span-3"],
  [4, "sm:col-span-4"],
]);

/**
 * The column count `masonry` packs into, by the container's track count.
 *
 * The same declared number as {@link TRACK_CLASS} reads, spent on CSS
 * multi-column rather than on grid tracks — which is what separates this mode
 * from `grid`. A grid's rows take the height of the tallest item in them;
 * multi-column has no rows at all, so a short item is followed by whatever
 * comes next regardless of its neighbour's height.
 */
const MASONRY_CLASS = new Map<number, string>([
  [1, "sm:columns-1"],
  [2, "sm:columns-2"],
  [3, "sm:columns-3"],
  [4, "sm:columns-4"],
]);

/** A heading level, and how it is set. */
interface Heading {
  /** The element to render. */
  tag: "h2" | "h3" | "h4";
  /** Its type. */
  className: string;
}

/**
 * The heading the deepest container a page can hold gets, and the answer for
 * any depth {@link HEADING} does not name.
 *
 * **A named constant rather than a `Map` miss handled at the call site**, so
 * the lookup below is total and `Block` needs no coalescing branch of its own.
 * A branch that cannot be reached is one no test can cover and no coverage
 * number reports, presentation being excluded from the measured set — so the
 * honest form is not to have one.
 */
const DEEPEST_HEADING: Heading = {
  tag: "h4",
  className: "font-display text-base font-bold tracking-tight",
};

/**
 * The heading a named container gets, by its depth.
 *
 * **Levels descend with depth and skip nothing**, so a page reads as an
 * outline rather than as a flat list of everything somebody wrote. A container
 * exists only at a depth the schema admits, so this is exhaustive over the
 * depths that can occur, and {@link DEEPEST_HEADING} answers anything past
 * them — a heading a level off is recoverable and a missing one is not.
 *
 * The deepest entry is derived from the model's own cap rather than typed
 * again: a block at `MAX_DEPTH` may only be a leaf, so the deepest container
 * sits one level above it. Raising the cap therefore leaves a depth with no
 * entry, which a named test asserts against.
 *
 * A `Map` for the same reason as {@link TRACK_CLASS}: the depth is derived
 * from stored structure.
 */
const HEADING = new Map<number, Heading>([
  [
    0,
    { tag: "h2", className: "font-display text-2xl font-bold tracking-tight" },
  ],
  [
    1,
    { tag: "h3", className: "font-display text-lg font-bold tracking-tight" },
  ],
  [MAX_DEPTH - 1, DEEPEST_HEADING],
]);

/**
 * What a block calls itself in the language being read.
 *
 * A container names itself with `name_*` and a leaf with `title_*`, so the two
 * are read by the key each actually carries rather than by a union of both —
 * `tabs` and `accordion` both need a label for a child that may be either.
 *
 * @param block - the block to label.
 * @param locale - the locale being read.
 * @returns its name or title, falling back to English, and `""` when neither
 *   is written.
 */
function labelOf(block: BlockNode, locale: string): string {
  return isContainer(block)
    ? contentFor(block, "name", locale)
    : contentFor(block, "title", locale);
}

/**
 * Where one child sits inside its container.
 *
 * **A block carries no identity of its own** — no stored id and no
 * `sort_order`, because the array's order IS the order — so its position is
 * the only thing that distinguishes it from a sibling holding identical words.
 * Naming that position once, here, is what lets every mode key its children
 * and build its identifiers off a value rather than off the loop counter each
 * would otherwise have to reach for.
 */
interface Seat {
  /** The child block. */
  block: BlockNode;
  /** Its path: the container's own, with this child's position appended. */
  path: string;
  /** Whether it is the first of its siblings, which `tabs` opens on. */
  first: boolean;
  /**
   * Its place in the container, counting from one.
   *
   * **What a mode that lifts a label falls back to when the child has none.**
   * `name_en` is optional on a container, so `labelOf` can honestly answer
   * `""` — and a `<label>` whose only content is an `sr-only` radio is a form
   * control with no accessible name, which is axe's `label` rule at `wcag2a`
   * and a tab nobody can tell apart regardless of the tag. A numeral is the
   * one label this file can supply without inventing words: it needs no
   * catalogue, reads the same in both languages, and is visibly a position
   * rather than something its author wrote.
   */
  ordinal: number;
}

/**
 * Where each of a container's children sits.
 *
 * @param props - the mode's own props.
 * @returns one seat per child, in the order the author put them.
 */
function seatsOf(props: ModeProps): Seat[] {
  return props.container.children.map((block, position) => ({
    block,
    path: `${props.path}-${position}`,
    first: position === 0,
    ordinal: position + 1,
  }));
}

/**
 * One child of a container, at one deeper level.
 *
 * @param props - the mode's own props, which carry everything a child needs.
 * @param seat - where the child sits.
 * @param tracks - the track count the child's span is measured against — the
 *   container's own for a mode that lays out tracks, and one for a mode that
 *   lays out none, so a span can never reach a grid that has nowhere to put it.
 * @param labelled - false when this mode has already shown the child's name
 *   somewhere of its own; see {@link BlockProps.labelled}.
 * @returns the child, keyed by its path.
 */
function childBlock(
  props: ModeProps,
  seat: Seat,
  tracks: number,
  labelled = true,
): ReactNode {
  return (
    <Block
      key={seat.path}
      block={seat.block}
      locale={props.locale}
      depth={props.depth + 1}
      tracks={tracks}
      path={seat.path}
      parentHost={props.parentHost}
      labelled={labelled}
    />
  );
}

/**
 * What a mode puts on the control it lifts a child's label onto.
 *
 * @param seat - where the child sits.
 * @param locale - the locale being read.
 * @returns the child's own name, or its position when it has none.
 */
function liftedLabel(seat: Seat, locale: string): string {
  return labelOf(seat.block, locale) || String(seat.ordinal);
}

/**
 * The resting arrangement: one block under another, and no grid at all.
 *
 * **A flex column rather than a single-column grid, deliberately.** A grid
 * would give a child's `grid-column` somewhere to land, and a span declared on
 * a block whose parent lays out no tracks would then create implicit columns
 * and push the row past the viewport. Laying out no tracks has to mean laying
 * out none.
 *
 * @param props - the container and what its children need.
 * @returns the stacked children.
 */
function Stack(props: ModeProps): ReactNode {
  return (
    <div className="flex flex-col gap-4" {...tid("block-stack")}>
      {seatsOf(props).map((seat) => childBlock(props, seat, 1))}
    </div>
  );
}

/**
 * Uniform tracks, filled across and then down.
 *
 * Children stretch to the height of the tallest in their row, which is what
 * makes a row of cards read as a row rather than as a ragged shelf. A dial for
 * the other alignment belongs in the style bag rather than in a second mode —
 * see `blockStyleShape`'s own note, and `CONTAINER_MODES` for the mode that
 * tried to be one.
 *
 * @param props - the container and what its children need.
 * @returns the grid.
 */
function Grid(props: ModeProps): ReactNode {
  const tracks = props.container.columns;
  return (
    <div
      className={`grid grid-cols-1 gap-4 ${TRACK_CLASS.get(tracks) ?? ""}`}
      {...tid("block-grid")}
    >
      {seatsOf(props).map((seat) => childBlock(props, seat, tracks))}
    </div>
  );
}

/**
 * Packed by height rather than laid in rows.
 *
 * **`break-inside-avoid` is load-bearing.** Without it a browser is free to
 * split one child across a column boundary, stranding its last lines at the
 * top of the next column — the one failure this mode has that a grid cannot.
 * Multi-column has no row gap to lean on either, so the vertical space between
 * stacked children is a literal margin rather than the `gap` a grid gets for
 * free.
 *
 * Children are laid out against a single track: multi-column flows content, it
 * does not place items in cells, so there is nothing here for a span to span.
 *
 * @param props - the container and what its children need.
 * @returns the packed children.
 */
function Masonry(props: ModeProps): ReactNode {
  const tracks = props.container.columns;
  return (
    <div
      className={`columns-1 gap-4 ${MASONRY_CLASS.get(tracks) ?? ""}`}
      {...tid("block-masonry")}
    >
      {seatsOf(props).map((seat) => (
        <div key={seat.path} className="mb-4 break-inside-avoid">
          {childBlock(props, seat, 1)}
        </div>
      ))}
    </div>
  );
}

/**
 * One row, swiped sideways at every width.
 *
 * **Scroll snapping rather than JavaScript**, so this stays a server component
 * with nothing hydrated: every child is reachable in order by keyboard and by
 * a screen reader, and nothing moves on its own while somebody is reading. It
 * scrolls at every size on purpose — that is the honest difference from
 * `grid`, and it is chosen by naming a different mode rather than by a setting
 * on that one.
 *
 * @param props - the container and what its children need.
 * @returns the carousel.
 */
function Carousel(props: ModeProps): ReactNode {
  return (
    <div
      className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-3"
      {...tid("block-carousel")}
    >
      {seatsOf(props).map((seat) => (
        <div key={seat.path} className="w-[85%] shrink-0 snap-center sm:w-96">
          {childBlock(props, seat, 1)}
        </div>
      ))}
    </div>
  );
}

/**
 * One child at a time, chosen from a row of tabs.
 *
 * **A native radio group and `:checked` decide which panel shows, so this
 * stays a server component with no script of its own.** Every tab is a real,
 * focusable `<input type="radio">`; arrow keys move between them exactly as in
 * any other radio group and a screen reader announces each as one choice among
 * the others — all of it free, where a hand-rolled `role="tablist"` needs a
 * script managing focus to get the same thing. Ported from the flat renderer's
 * `tabs` layout, which a real-browser spec already proved; the details below
 * were each paid for there and none of them is decoration.
 *
 * **A tab's radio and its own panel are interleaved, each pair a `Fragment`,
 * not grouped into two lists.** `label:has(:checked)+&` is one fixed selector,
 * identical for every child, selecting a panel by its ONE immediately
 * preceding sibling — so nothing needs an index-specific class name, which
 * Tailwind's build-time scan could never see anyway from a list whose length
 * is not known until a page is requested. The tab row still paints above every
 * panel: `order-1`/`order-2` reorders the two kinds of element for LAYOUT
 * without moving them in the document, and a CSS combinator reads document
 * order rather than the painted one.
 *
 * **Reading order is not painted order, and that is a known cost of this
 * mechanism rather than an oversight.** A linear reader reaches panel one
 * before tab two. That is what buys the whole mode being a server component;
 * the trade is accepted, not hidden.
 *
 * The radio group's `name` and each panel's `id` are both built from the
 * container's own path, which carries only digits and hyphens — see
 * {@link BlockProps.path} for why nothing an author typed may reach either.
 *
 * **`w-full` on the panel is load-bearing and reads as decoration.** A panel is
 * a flex item on the ROW axis, which is the shape that does propagate a
 * min-content floor — so a wide descendant (an eight-column `table` is the one
 * the model admits) would widen the whole page rather than scrolling inside its
 * own box. It does not, because a definite specified size caps the automatic
 * minimum: `min(specified size suggestion, content size suggestion)`. Measured
 * at 320px, deleting `w-full` overflows by 416px. Do not remove it, and do not
 * replace it with `min-w-0` alone — the width is also what makes each panel
 * take the whole row under a wrapping flex.
 *
 * **The tab IS the child's name, so the panel does not print it again.** The
 * child renders with `labelled={false}`; without that every tab showed its own
 * words twice, once on the tab and once at the top of its panel. The flat
 * renderer could not produce this — there an item's title WAS the tab and its
 * description WAS the panel — so it is a fault nesting introduced rather than
 * one carried over. A child with no name of its own is labelled by its
 * position; see {@link Seat.ordinal} for why a numeral and not a word.
 *
 * @param props - the container and what its children need.
 * @returns the tabs.
 */
function Tabs(props: ModeProps): ReactNode {
  const group = `block-${props.path}-tabs`;
  return (
    <div className="flex flex-wrap" {...tid("block-tabs")}>
      {seatsOf(props).map((seat) => {
        const panelId = `block-${seat.path}-panel`;
        return (
          <Fragment key={seat.path}>
            <label className="order-1 cursor-pointer border-b-2 border-transparent px-4 py-2 text-sm font-medium text-(--muted) has-checked:border-(--accent) has-checked:text-(--ink) has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-(--accent)">
              <input
                type="radio"
                name={group}
                defaultChecked={seat.first}
                aria-controls={panelId}
                className="sr-only"
              />
              {liftedLabel(seat, props.locale)}
            </label>
            <div
              id={panelId}
              className="order-2 mt-2 hidden w-full [label:has(:checked)+&]:block"
            >
              {childBlock(props, seat, 1, false)}
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

/**
 * Disclosures down the page, any number of them open at once.
 *
 * `<details>` and `<summary>`, deliberately: this is the one page in the app a
 * stranger might reach on a hostile network or an old browser, and a
 * disclosure that needs no script is free.
 *
 * **No `name` attribute on the `<details>` elements, and that absence is the
 * mode.** HTML's own `name` would make them exclusive — one open at a time —
 * which is `tabs`, vertically. Multi-open is what separates the two, so the
 * attribute must never be added here to "group" them.
 *
 * **The summary IS the child's name, so the disclosure does not print it
 * again** — the child renders with `labelled={false}`, exactly as `tabs` does
 * and for the same reason. A child with no name is labelled by its position.
 *
 * **A container with no children renders nothing at all.** The wrapper carries
 * the border and the surface, so an empty one is a bordered sliver with
 * nothing in it — the same fault the flat `two-column` layout records for a
 * `dl` whose every row was dropped, in a new place.
 *
 * The plus rotates into a cross on open, which needs no script either.
 *
 * @param props - the container and what its children need.
 * @returns the disclosures.
 */
function Accordion(props: ModeProps): ReactNode {
  const seats = seatsOf(props);
  if (seats.length === 0) return null;
  return (
    <div
      className="overflow-hidden rounded-xl surface border-(--edge) bg-(--surface)"
      {...tid("block-accordion")}
    >
      {seats.map((seat) => (
        <details
          key={seat.path}
          className="group border-b border-(--edge)/25 last:border-b-0"
        >
          <summary className="flex cursor-pointer items-center justify-between gap-4 p-5 font-display font-bold [&::-webkit-details-marker]:hidden">
            {liftedLabel(seat, props.locale)}
            <Plus className="size-5 shrink-0 text-(--muted) transition-transform group-open:rotate-45" />
          </summary>
          <div className="border-t border-(--edge)/25 bg-(--bar) px-5 py-4">
            {childBlock(props, seat, 1, false)}
          </div>
        </details>
      ))}
    </div>
  );
}

/**
 * A sequence, in the order the author put it.
 *
 * The rule down the left is a border on the list rather than an element per
 * row, so nothing decorative lands in the accessibility tree — a screen reader
 * gets an ordinary ordered list.
 *
 * @param props - the container and what its children need.
 * @returns the timeline.
 */
function Timeline(props: ModeProps): ReactNode {
  return (
    <ol
      className="ml-1.5 grid gap-6 border-l border-(--edge) pl-6"
      {...tid("block-timeline")}
    >
      {seatsOf(props).map((seat) => (
        <li key={seat.path} className="relative grid gap-1">
          <span
            aria-hidden
            className="absolute top-1.5 -left-7.5 size-3 rounded-full border-2 border-(--surface) bg-(--accent)"
          />
          {childBlock(props, seat, 1)}
        </li>
      ))}
    </ol>
  );
}

/**
 * Every mode, by the name stored on the container.
 *
 * **A `Map`, not a record, because `mode` arrives from `jsonb`.** This repo
 * shipped a Critical from exactly the other shape: a plain object indexed by
 * user-controlled text answered `__proto__`, `constructor` and `toString` with
 * truthy inherited values, which passed a `!entry` guard and then threw during
 * a public page render. A `Map` has no inherited entries to find.
 *
 * The private object below is a compile-time completeness check and is never
 * indexed: `satisfies Record<ContainerMode, …>` fails to compile the moment
 * `CONTAINER_MODES` gains a name with no renderer behind it, and
 * `Object.entries` reads only its own keys. The exported `Map` is what
 * anything looks a mode up in.
 *
 * **A `columns` entry sat here and is gone**, along with the mode itself —
 * it laid the same tracks as `grid` and differed only in how a row's children
 * were aligned, which is a dial rather than an arrangement. See
 * `CONTAINER_MODES` for the full account and for where such a dial belongs.
 */
export const MODES: ReadonlyMap<string, ModeRenderer> = new Map(
  Object.entries({
    stack: Stack,
    grid: Grid,
    masonry: Masonry,
    carousel: Carousel,
    tabs: Tabs,
    accordion: Accordion,
    timeline: Timeline,
  } satisfies Record<ContainerMode, ModeRenderer>),
);

/**
 * What every entry in {@link LEAVES} is handed.
 *
 * **A leaf renderer owns what is INSIDE the leaf and nothing around it.**
 * {@link Block} puts the span and the style bag on the wrapping element, so a
 * per-kind renderer cannot silently drop either — the failure this project
 * keeps producing is a prop somebody had to remember to pass on, and the fix is
 * to leave it nowhere it can be forgotten.
 */
interface LeafProps {
  /** The leaf to render, as parsed. */
  leaf: LeafBlock;
  /** The locale being read, which decides which language is preferred. */
  locale: string;
  /**
   * Whether this leaf still has to show its own title.
   *
   * `false` when an enclosing `tabs` or `accordion` has already shown it — see
   * {@link BlockProps.labelled}. It reaches only the kinds that PRINT the
   * title: `picture` reads it as alt text, which is not something a tab has
   * already said out loud.
   */
  labelled: boolean;
  /** This deployment's own hostname, for Twitch's `parent=`. */
  parentHost: string;
}

/** One content kind, as a component over {@link LeafProps}. */
type LeafRenderer = (props: LeafProps) => ReactNode;

/** The surface a card-shaped leaf sits on, shared so the kinds cannot drift. */
const LEAF_CARD =
  "flex items-center gap-3 rounded-xl surface border-(--edge) bg-(--surface) p-4";

/**
 * The tile a card-shaped leaf's icon sits in.
 *
 * **Every such leaf carries one, including the ones whose author chose no
 * icon** — a tile rendered only sometimes makes a row of them ragged, which is
 * the fault `Cards` already fixed on the flat page by always rendering it. Each
 * kind names its own fallback glyph.
 */
const LEAF_TILE =
  "grid size-9 shrink-0 place-items-center rounded-lg surface border-(--edge) bg-(--bar)";

/**
 * What a `link` leaf shows when its author chose no icon.
 *
 * Deliberately neutral, for the reason `CARD_ICON` gives on the flat page: it
 * stands in for anything at all somebody might link to, and a glyph that meant
 * something would be wrong more often than right.
 */
const LINK_ICON = "link";

/**
 * What a `social` leaf shows when it carries neither an author's icon nor a
 * recognised brand's.
 *
 * `resolveSocial` answers `icon: undefined` for a host it does not know, by
 * design. A globe reads as "somewhere on the web", which is exactly what a chip
 * with no other information is.
 */
const SOCIAL_ICON = "globe";

/**
 * A leaf's own words in the language being read.
 *
 * @param leaf - the leaf.
 * @param locale - the locale being read.
 * @returns its title and description, each falling back to English.
 */
function wordsOf(leaf: LeafBlock, locale: string) {
  return {
    title: contentFor(leaf, "title", locale),
    description: contentFor(leaf, "description", locale),
  };
}

/**
 * The frame classes for each {@link EmbedShape}.
 *
 * A `Record` rather than a chain of tests, and the type is the point: it fails
 * to compile the moment `EmbedShape` grows a member with no class behind it,
 * where a ternary would compile happily and send an unrecognised shape down
 * whichever branch it fell into by accident.
 *
 * **A `Record` is safe here where a `Map` is required elsewhere in this file,
 * and the difference is where the key comes from.** `TRACK_CLASS` and
 * {@link LEAVES} are indexed by values that arrived from `jsonb`; this is
 * indexed by `ResolvedEmbed.shape`, which `resolveEmbed` copies off a module
 * constant in `EMBED_PROVIDERS`. Nothing an author typed can reach it.
 *
 * Ported verbatim from the flat renderer's own `FRAME_SHAPE`, including the
 * reasoning about `post`: a post's height is whatever its author wrote rather
 * than a ratio, so it is a fixed-height narrow column that scrolls its own
 * content — chosen by reasoning about how each provider designs its widget,
 * **not measured against any provider's real rendered content**.
 */
const FRAME_SHAPE: Record<EmbedShape, string> = {
  video: "aspect-video w-full rounded-xl surface border-(--edge)",
  portrait: "aspect-9/16 w-full max-w-80 rounded-xl surface border-(--edge)",
  audio: "h-42 w-full rounded-xl surface border-(--edge)",
  post: "h-150 w-full max-w-105 rounded-xl surface border-(--edge)",
};

/**
 * A leaf's own words, on a plain surface.
 *
 * **This is the `text` kind AND the fallback every other kind lands on**, which
 * is one function rather than two on purpose: "a heading with optional prose"
 * is exactly what a leaf that cannot render its content has left to show, so a
 * separate fallback would be a second body of the same thing, free to drift.
 * A leaf with words never renders as nothing — "refuses nothing, shows nothing"
 * is the trap the media layouts already avoid, and a block that vanished would
 * leave a hole in a grid its author placed it in.
 *
 * **A leaf with NO words renders nothing at all, and that is the same rule
 * rather than an exception to it.** It is reachable only inside `tabs` or
 * `accordion`, where the mode has lifted the title and the author left the
 * description empty — `title_en` is `min(1)` in the schema, so at
 * `labelled: true` there is always something. What is left is an empty
 * bordered card in a panel: a visible artefact that says nothing, which is
 * strictly worse than the gap it would fill, and the grid track is held by the
 * WRAPPING element in {@link Block} rather than by this one. `Accordion`
 * guards the structurally identical case for itself and {@link LeafCaption}
 * guards it for a caption; this is the third instance of one rule, not a new
 * one.
 *
 * It is also what a kind {@link LEAVES} does not name renders as. Every kind
 * the model admits now has a renderer, so that is no longer a gap being filled
 * in but the answer for a `kind` that reached the renderer from a payload
 * bypassing both the schema and the database — including one chosen to walk a
 * prototype chain.
 *
 * **Four kinds fall back HERE on their own terms**, which is a different
 * thing: {@link StatLeaf} and {@link TableLeaf} when the drop rule leaves no
 * pair to announce, {@link QuoteLeaf} when there are no words to quote, and
 * {@link PictureLeaf} when the address is one `safeHttpUrl` refuses. Each
 * shows its author's words rather than vanishing out of a grid track.
 *
 * The title is styled as a heading and is **not** a heading element. A leaf
 * sits at any depth the model admits, including one past the deepest level
 * {@link HEADING} names, so a real `<h*>` here would either skip or repeat a
 * level depending on what contains it — which is what axe's `heading-order`
 * names, though **that rule is `best-practice` and `a11y.spec.ts` runs only
 * the WCAG tags, so nothing in CI re-proves this against a browser.** What
 * holds it is the unit case `gives a leaf's own title no heading element`; see
 * `TAGS` in that spec for the verified list of which rules do and do not run.
 * The container above this carries the page's actual outline.
 *
 * @returns the words.
 */
function PlainLeaf({ leaf, locale, labelled }: LeafProps): ReactNode {
  const { title, description } = wordsOf(leaf, locale);
  const heading = labelled ? title : "";
  if (!heading && !description) return null;
  return (
    <div className="grid gap-1 rounded-xl surface border-(--edge) bg-(--surface) p-5">
      {heading ? (
        <span className="font-display text-sm/tight font-bold">{title}</span>
      ) : null}
      {description ? (
        <p className="text-xs/relaxed text-(--muted)">{description}</p>
      ) : null}
    </div>
  );
}

/**
 * A leaf's own words beneath whatever it framed or showed.
 *
 * **Nothing at all when there is nothing to say.** An empty `<figcaption>` is a
 * visible hole in a gap-spaced grid, the same fault every flat layout avoids by
 * leaving the element out when the description is empty — and here both halves
 * can be absent at once, because an enclosing `tabs` has already shown the
 * title.
 *
 * @returns the caption, or nothing.
 */
function LeafCaption({
  title,
  description,
}: {
  title: string;
  description: string;
}): ReactNode {
  if (!title && !description) return null;
  return (
    <figcaption className="grid gap-1">
      {title ? (
        <span className="font-display text-sm/tight font-bold">{title}</span>
      ) : null}
      {description ? (
        <p className="text-xs/relaxed text-(--muted)">{description}</p>
      ) : null}
    </figcaption>
  );
}

/**
 * One link out, as a card.
 *
 * **The address is built by `safeHttpUrl` and an address it refuses renders as
 * a plain card rather than as an anchor.** React escapes text, not URL schemes,
 * so an `href` is the one place on this page where what somebody pasted would
 * otherwise become script running in the reader's session. The refusal is the
 * whole guard: the value is made safe by construction rather than escaped,
 * because WHATWG normalisation leaves a `"` in the host and a `\` in the query
 * exactly as they were.
 *
 * The card still renders with the author's own title and description, so the
 * block holds its track and a reader sees a tile rather than a gap. **Never
 * nothing.**
 *
 * **It does not print the refused address, and the earlier claim that it did
 * was wrong.** Rendering it was considered and refused on the product
 * argument rather than a technical one: this is a page strangers read, the
 * refused value is most often a `javascript:` or `data:` string somebody
 * pasted by mistake, and putting it in front of every visitor helps nobody.
 * The author is the one who needs to know, and the editor is where they are —
 * so what a visitor gets is a card that is visibly not a link.
 *
 * It carries `nofollow ugc` alongside `noopener noreferrer`. The second pair is
 * about the reader's own tab; the first is about this being a page anybody can
 * publish links on, which search engines are entitled to know before a fursona
 * page becomes a way to buy ranking.
 *
 * **It names no focus offset**, and must not: the card is a `surface`, which
 * rings itself on the INSIDE, and a `focus-visible:outline-offset-*` on the
 * element beats that utility on both sort order and specificity.
 *
 * @returns the link, or the card it could not become one.
 */
function LinkLeaf({ leaf, locale, labelled }: LeafProps): ReactNode {
  const { title, description } = wordsOf(leaf, locale);
  const href = safeHttpUrl(leaf.link_url);
  const inside = (
    <>
      <span className={LEAF_TILE}>
        <PublicSectionIcon name={leaf.icon} fallback={LINK_ICON} />
      </span>
      <span className="grid gap-0.5">
        {labelled && title ? (
          <span className="font-display text-sm font-bold">{title}</span>
        ) : null}
        {description ? (
          <span className="text-xs text-(--muted)">{description}</span>
        ) : null}
      </span>
    </>
  );
  return href ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow ugc"
      className={`${LEAF_CARD} transition-colors hover:border-(--accent)`}
      {...tid("block-link")}
    >
      {inside}
    </a>
  ) : (
    <div className={LEAF_CARD} {...tid("block-link")}>
      {inside}
    </div>
  );
}

/**
 * One picture somebody pasted the address of.
 *
 * **AeleOS hosts no files and this must not grow an upload.** That is a budget
 * decision rather than a technical one — hosting other people's pictures is the
 * single cost on a profile builder that grows with how much people enjoy it —
 * and reopening it means reopening the three constraints the removed bucket
 * carried. See the root `CLAUDE.md`.
 *
 * The address goes through the same `safeHttpUrl` guard an anchor does, which
 * the flat `gallery` layout did NOT do: it put the stored value straight into
 * `src`. Nothing was exploitable there, since an `<img>` cannot execute a
 * `javascript:` address — but a value trusted because of where it currently
 * lands is a trap for whichever sink reuses it next, which is the argument
 * `backgroundImageValue` already makes about CSS.
 *
 * **The title is the ALT TEXT and is not printed beside the picture**, exactly
 * as `gallery` and `carousel` read it. A caption repeating what the alt already
 * says is read out twice by a screen reader and adds nothing for anybody else.
 * `labelled` therefore does not reach this kind: a tab that lifted the title
 * lifted a description of the picture, not a heading over it.
 *
 * An address it cannot use falls back to {@link PlainLeaf} rather than to
 * nothing. The flat gallery dropped such an item entirely, which was right for
 * an item in a list of pictures and is wrong for a block: its author placed it
 * in a grid, and a block that vanished would leave a hole nothing explains.
 *
 * @param props - the leaf and how to read it.
 * @returns the picture, or the words it could not illustrate.
 */
function PictureLeaf(props: LeafProps): ReactNode {
  const { leaf, locale } = props;
  const { title, description } = wordsOf(leaf, locale);
  const src = safeHttpUrl(leaf.image_url);
  if (!src) return PlainLeaf(props);
  return (
    <figure className="grid gap-2" {...tid("block-picture")}>
      {/* eslint-disable-next-line @next/next/no-img-element -- the address is arbitrary and typed by hand, so next/image would try to optimise a host it has never been configured for. */}
      <img
        src={src}
        alt={title}
        className="w-full rounded-xl surface border-(--edge) object-cover"
      />
      <LeafCaption title="" description={description} />
    </figure>
  );
}

/**
 * One third-party player or post, framed.
 *
 * **`resolveEmbed` decides the address, never the author.** What it returns is
 * built from a fixed template on an allowlisted host, so the value stored on
 * the block cannot reach the frame — see that function's TSDoc for the whole
 * argument. This component must never grow a branch that puts a stored value
 * into `src`.
 *
 * The frame is sandboxed, lazy, and **asks for no autoplay permission**. A
 * profile that starts making noise at whoever opened it is the thing people
 * remember most fondly and least accurately about the pages this borrows from.
 *
 * Its shape comes from {@link FRAME_SHAPE}, keyed on the resolution's own
 * `shape` — never guessed from the provider here.
 *
 * **A frame with no accessible name falls back to the provider's own id.** An
 * `<iframe>` with an empty `title` is axe's `frame-title`, at WCAG level A, and
 * `title_en` is required by the schema — but this file never trusts a caller's
 * validation over its own rendering, and the provider is a true thing to say
 * about the frame rather than words invented for somebody's page.
 *
 * @returns the frame.
 */
function EmbedFrame({
  embed,
  title,
}: {
  embed: ResolvedEmbed;
  title: string;
}): ReactNode {
  return (
    <iframe
      src={embed.src}
      title={title || embed.provider}
      loading="lazy"
      referrerPolicy="strict-origin-when-cross-origin"
      // No `autoplay`. Everything else is what a player legitimately needs.
      allow="clipboard-write; encrypted-media; picture-in-picture; fullscreen"
      sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"
      className={FRAME_SHAPE[embed.shape]}
    />
  );
}

/**
 * One embedded player.
 *
 * **An address `resolveEmbed` cannot place renders as a {@link LinkLeaf}, never
 * as an empty frame.** Silence would leave somebody looking at a gap on their
 * own page with no way to learn that what they pasted is not one this hub can
 * play; a frame built from it would be the pass-through the whole embed model
 * exists to refuse. That fallback cascades once more on its own terms — an
 * address `safeHttpUrl` also refuses renders as the plain card — so a `player`
 * leaf reaches a plain row and never nothing.
 *
 * `parentHost` is threaded through for the one provider that cannot be built
 * without it: Twitch's player refuses to load unless `parent=` names the
 * embedding domain, so without one it resolves to null and takes the link
 * fallback rather than framing a player guaranteed to error.
 *
 * @param props - the leaf and how to read it.
 * @returns the player, or the link it could not become one.
 */
function PlayerLeaf(props: LeafProps): ReactNode {
  const { leaf, locale, labelled, parentHost } = props;
  const embed = resolveEmbed(leaf.link_url, { parentHost });
  if (!embed) return LinkLeaf(props);
  const { title, description } = wordsOf(leaf, locale);
  return (
    <figure className="grid gap-2" {...tid("block-player")}>
      <EmbedFrame embed={embed} title={title} />
      <LeafCaption title={labelled ? title : ""} description={description} />
    </figure>
  );
}

/**
 * One embedded social post.
 *
 * **An address that resolves to no provider renders as a {@link SocialLeaf}
 * chip, never as nothing and never as a bare link.** Bluesky is the case this
 * exists for — `embed.bsky.app` hard-refuses the handle a pasted Bluesky
 * address carries, so it never resolves — and a page that already brands
 * Bluesky as a chip elsewhere would be inconsistent showing it unbranded here.
 * The chip falls back once more on its own terms, so this too reaches a row and
 * never nothing.
 *
 * **It resolves without `parentHost`, exactly as the flat `posts` layout did.**
 * The only provider that reads it is Twitch, whose player is a `video` shape
 * rather than a post; a Twitch address in a post is better served by the
 * branded chip than by a video frame in a 420px column.
 *
 * @param props - the leaf and how to read it.
 * @returns the post, or the chip it could not become one.
 */
function PostLeaf(props: LeafProps): ReactNode {
  const { leaf, locale, labelled } = props;
  const embed = resolveEmbed(leaf.link_url);
  if (!embed) return SocialLeaf(props);
  const { title, description } = wordsOf(leaf, locale);
  return (
    <figure className="grid gap-2" {...tid("block-post")}>
      <EmbedFrame embed={embed} title={title} />
      <LeafCaption title={labelled ? title : ""} description={description} />
    </figure>
  );
}

/**
 * One branded link chip.
 *
 * **`resolveSocial` is deliberately the opposite of `resolveEmbed`: it accepts
 * any `http(s)` address.** A host in its brand table becomes a chip carrying
 * that brand's label, icon and the handle pulled from the address; a host
 * outside it still becomes a chip, labelled with its own hostname. That is the
 * property that makes this kind worth having, and the one somebody will want to
 * "fix" by refusing an unknown host — do not. Nothing here reaches a frame or
 * executes anything, so tightening it would delete the reason it exists rather
 * than close a hole.
 *
 * It returns null only for an address that must not be linked at all —
 * `javascript:`, `data:`, or nothing parseable — and the chip then renders as a
 * `<span>`, with the author's own words still on it.
 *
 * **The author's own icon wins over the derived one.** Somebody who picked an
 * icon meant it; only an empty selection falls through to what `resolveSocial`
 * derived from the address, and then to {@link SOCIAL_ICON}.
 *
 * **The sub-line is the HANDLE, not the description**, which is what the flat
 * `socials` layout showed and all that a chip has room for. The editor must not
 * offer a `social` leaf a description it will not render — the "stores what
 * somebody types and shows nothing" fault `LINKED`/`ICONED` exist to prevent.
 *
 * @returns the chip.
 */
function SocialLeaf({ leaf, locale, labelled }: LeafProps): ReactNode {
  const { title } = wordsOf(leaf, locale);
  const social = resolveSocial(leaf.link_url);
  // The author's own title when a mode above has not already shown it, and the
  // brand's own name otherwise — which is not a repeat of the title, because it
  // is derived from the address rather than from what anybody wrote.
  const label = (labelled ? title : "") || social?.label || "";
  const inside = (
    <>
      <span className={LEAF_TILE}>
        <PublicSectionIcon
          name={leaf.icon || social?.icon}
          fallback={SOCIAL_ICON}
        />
      </span>
      <span className="grid gap-0.5">
        {label ? (
          <span className="font-display text-sm font-bold">{label}</span>
        ) : null}
        {social?.handle ? (
          <span className="text-xs text-(--muted)">{social.handle}</span>
        ) : null}
      </span>
    </>
  );
  return social ? (
    <a
      href={social.href}
      target="_blank"
      rel="noopener noreferrer nofollow ugc"
      className={`${LEAF_CARD} transition-colors hover:border-(--accent)`}
      {...tid("block-social")}
    >
      {inside}
    </a>
  ) : (
    <span className={LEAF_CARD} {...tid("block-social")}>
      {inside}
    </span>
  );
}

/**
 * The card a `stat` and a `progress` sit on.
 *
 * Shared so the two cannot drift apart: they are the same card with a
 * different thing under the label, and a page that mixes them reads as one
 * row of tiles only while that stays true.
 */
const MEASURE_CARD = "rounded-xl surface border-(--edge) bg-(--surface) p-4";

/**
 * The treatment a LABEL gets on the kinds that invert the pair.
 *
 * **Small, muted and uppercase is what says "this is the label" rather than
 * "this is the heading"**, and it is the half of the inversion a reader
 * actually sees. Written once because `stat` and `progress` must agree: the
 * one thing this feature is most likely to get wrong is which of the two
 * fields is the label, and two independent class lists is how a fix reaches
 * one kind and not the other.
 */
const MEASURE_LABEL = "text-xs tracking-wide text-(--muted) uppercase";

/**
 * One measured fact: a label and the value it names.
 *
 * **The title is the LABEL and the description is the VALUE** — the reverse
 * of how the two read on `text` or `link`. A stat is "Species: arctic fox",
 * and the half worth setting large is the answer. The inversion is a
 * rendering fact rather than a schema one, so the fields keep their generic
 * names on the block and switching a kind to look at it finds what was typed
 * still there.
 *
 * **It is a `<dl>`, which is the debt `LEAF_KINDS` records being paid.** The
 * `two-column` layout this model replaced was a table of label and value, and
 * what made it worth having was not the two columns but the PAIRING: `dt` and
 * `dd` are announced together, where two spans are two unrelated runs of
 * text. `stat` is the home for one such pair and {@link TableLeaf} for many.
 *
 * **The drop rule comes with it, and it inverts at the edge.** A row whose
 * LOCALISED value is empty disappears, label and all — a `dt` with no `dd` is
 * invalid markup and half a row is not an option — and because the value is
 * read AFTER a language has been picked, a stat written in one language only
 * is a stat for readers of that language. But where the flat layout then
 * dropped the whole list, a leaf must not: it sits in a grid track its author
 * deliberately placed it in, so vanishing leaves a hole nothing explains. The
 * pair is dropped; the block falls back to {@link PlainLeaf} and shows its
 * label.
 *
 * A `labelled` of false is the other way to have no pair — an enclosing tab
 * or disclosure has already said the label — and the value renders alone
 * rather than as a `dd` with no `dt`, which is the same invalid half-row
 * seen from the other side.
 *
 * @param props - the leaf and how to read it.
 * @returns the pair, the value alone, or the label it could not pair.
 */
function StatLeaf(props: LeafProps): ReactNode {
  const { leaf, locale, labelled } = props;
  const { title, description } = wordsOf(leaf, locale);
  if (!description) return PlainLeaf(props);
  const value = (
    <span className="font-display text-lg/tight font-bold">{description}</span>
  );
  if (!labelled || !title) {
    return (
      <div className={`grid gap-1 ${MEASURE_CARD}`} {...tid("block-stat")}>
        {value}
      </div>
    );
  }
  return (
    <dl className={`grid gap-1 ${MEASURE_CARD}`} {...tid("block-stat")}>
      <dt className={MEASURE_LABEL}>{title}</dt>
      <dd className="font-display text-lg/tight font-bold">{description}</dd>
    </dl>
  );
}

/**
 * One quotation, and who said it.
 *
 * **The description is what was said and the title is who said it** — the
 * second kind whose two fields do not mean "heading" and "body". Ported from
 * the flat `quote` layout, mark and em dash included.
 *
 * A quotation with no words is not a quotation, so an empty description falls
 * back to {@link PlainLeaf} — which still shows the attribution as its title,
 * rather than leaving a mark hanging over nothing. An enclosing tab that
 * already showed the attribution drops the caption and keeps the words, the
 * same choice {@link LeafCaption} makes.
 *
 * @param props - the leaf and how to read it.
 * @returns the quotation, or the words it could not attribute.
 */
function QuoteLeaf(props: LeafProps): ReactNode {
  const { leaf, locale, labelled } = props;
  const { title, description } = wordsOf(leaf, locale);
  if (!description) return PlainLeaf(props);
  return (
    <figure
      className="grid gap-3 rounded-xl surface border-(--edge) bg-(--surface) p-5"
      {...tid("block-quote")}
    >
      <QuoteMark className="size-5 text-(--accent)" />
      <blockquote className="font-display text-lg/snug text-balance">
        {description}
      </blockquote>
      {labelled && title ? (
        <figcaption className="text-xs text-(--muted) before:mr-1 before:content-['—']">
          {title}
        </figcaption>
      ) : null}
    </figure>
  );
}

/**
 * One proportion, drawn as a bar.
 *
 * **The title is the LABEL and the description is the VALUE**, the same
 * inversion {@link StatLeaf} carries and the single thing this feature is
 * most likely to get wrong — it has been got wrong once already. This kind
 * additionally tries to READ that value as a number, through
 * {@link progressValue}: a commission queue, a ref sheet's completion, a
 * species trait on a scale.
 *
 * **A value `progressValue` cannot read renders a plain row and NO BAR AT
 * ALL.** That is not a tidy-up; it is the whole guard. The failure this
 * refusal exists for is not a wrong number but a bar drawn from `NaN`, whose
 * `width` CSSOM rejects outright — the declaration is dropped, the fill falls
 * back to `auto`, and the bar renders FULL. A bar reading 100% on nonsense
 * looks like an answer, which is the worst outcome this layout has. The
 * refusal must therefore be asserted on the RENDERED output rather than on
 * what the parser returned, because the original fault survived a suite that
 * only checked the latter.
 *
 * A value it CAN read still renders verbatim beside the bar, so nothing an
 * author wrote is hidden behind the percentage it was turned into.
 *
 * **The bar is named even when the label is not shown.** `aria-label` falls
 * back to the value itself, which is a true thing to say about the bar — a
 * `progressbar` with no accessible name is a control a screen reader can only
 * call "progress bar", and the bar renders only when the value parsed, so the
 * fallback is never empty.
 *
 * @param props - the leaf and how to read it.
 * @returns the bar, or the row it could not draw one from.
 */
function ProgressLeaf(props: LeafProps): ReactNode {
  const { leaf, locale, labelled } = props;
  const { title, description } = wordsOf(leaf, locale);
  const label = labelled ? title : "";
  // Neither half left to show — a tab lifted the label and the value is
  // unwritten. The card would be an empty bordered box, since its own row and
  // its bar are all conditional; {@link PlainLeaf} answers that case for every
  // kind in one place.
  if (!label && !description) return PlainLeaf(props);
  const percent = progressValue(description);
  return (
    <div className={`grid gap-2 ${MEASURE_CARD}`} {...tid("block-progress")}>
      <div className="flex items-baseline justify-between gap-3">
        {label ? <span className={MEASURE_LABEL}>{title}</span> : null}
        {description ? (
          <span className="font-display text-sm font-bold">{description}</span>
        ) : null}
      </div>
      {percent === null ? null : (
        <div
          role="progressbar"
          aria-label={title || description}
          aria-valuenow={Math.round(percent)}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-2 overflow-hidden rounded-full surface border-(--edge) bg-(--bar)"
        >
          <div
            className="h-full rounded-full bg-(--accent)"
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
    </div>
  );
}

/** One cell of a {@link TableLeaf}, read in the language being read. */
interface TableCell {
  /** Its text, falling back to English. */
  text: string;
  /**
   * Its position in the row, as a key.
   *
   * **A cell carries no identity of its own** — no id and no sort order,
   * because the array's order IS the order — so its position is the only
   * thing distinguishing it from a neighbour holding identical words. Derived
   * here rather than at the `key` prop for the reason `seatsOf` does the
   * same: `react/no-array-index-key` reads the map callback's index parameter
   * and this file has no other identity to offer.
   */
  key: string;
}

/** One row of a {@link TableLeaf}, split into the pair it announces. */
interface TableRow {
  /**
   * Its first cell, which becomes the row's header.
   *
   * `""` for a row whose author left the first cell blank, and for a row with
   * no cells at all — neither survives as an excuse to render nothing.
   */
  label: string;
  /**
   * Its remaining cells, which are the values the row states.
   *
   * **This is what the drop rule reads**, never the label: a label with
   * nothing beside it is the half-row the `<dl>` debt refuses.
   */
  values: TableCell[];
  /** Its position in the table, as a key — see {@link TableCell.key}. */
  key: string;
}

/**
 * A `table` leaf's rows, read in the language being read.
 *
 * Every row is split into its header and its values, because that split is
 * what the drop rule and the markup both need and computing it twice is how
 * the two stop agreeing.
 *
 * **Nothing is dropped here.** The filter belongs to {@link TableLeaf}, which
 * has somewhere to fall back to when nothing survives; a helper that returned
 * an already-filtered list would hide the empty case from the one function
 * that has to answer for it.
 *
 * @param leaf - the leaf, whose `rows` may be absent — every kind stores them
 *   and only this one reads them.
 * @param locale - the locale being read.
 * @returns one entry per stored row, in the order the author put them.
 */
function tableRows(leaf: LeafBlock, locale: string): TableRow[] {
  // **Shape-checked rather than trusted, at both levels.** Every other lookup
  // in this file is explicitly defensive about a payload that bypassed the
  // schema and the database alike — it is why `MODES` and `LEAVES` are `Map`s
  // and why an unknown `kind` renders rather than throwing. `rows` arrives from
  // the same `jsonb`, and a stored object where an array is expected, or a
  // string where a row is expected, would be a `TypeError` thrown DURING a
  // public page render. That is the `TIDAL_KINDS` failure exactly, from the one
  // place the file stopped being paranoid.
  const rows = Array.isArray(leaf.rows) ? leaf.rows : [];
  return rows.map((row, position) => {
    const cells = Array.isArray(row) ? row : [];
    const [head, ...values] = cells.map((cell, column) => ({
      text: contentFor(cell, "text", locale),
      key: String(column),
    }));
    return { label: head?.text ?? "", values, key: String(position) };
  });
}

/**
 * Many pairs at once: rows of a label and the values beside it.
 *
 * **This is `stat` generalised, and it carries the same debt** — see
 * `LEAF_KINDS`' TSDoc. A real `<table>` with `<th scope="row">` on the first
 * cell keeps the property that made `two-column` worth having: a screen
 * reader announces the row header WITH each value, so a label and its value
 * are heard as a pair rather than as two unrelated runs of text. A `<dl>`
 * cannot do it past two columns and the model allows eight, so the table is
 * the shape that generalises without losing the pairing.
 *
 * **A row whose localised values are all empty disappears entirely, label and
 * all.** Half a row is not an option, and the values are read AFTER a
 * language has been picked — so a row written in one language only is a row
 * for readers of that language, which is the ordinary fallback made visible
 * because here it decides a whole row. A row with a label and no value cells
 * at all is the same case and goes the same way.
 *
 * **When NO row survives it falls back to {@link PlainLeaf} rather than
 * rendering nothing**, and that is where this deliberately parts from the
 * layout it inherits. The flat `two-column` dropped the whole list, correctly:
 * an item was one row among others and dropping it closed the gap. A block
 * sits in a grid track its author deliberately placed it in, so a leaf that
 * vanished would leave a hole nothing on the page explains. Absent `rows`
 * takes the same path, which is what a `table` looks like the moment it is
 * added.
 *
 * **The table scrolls inside its own box.** Eight columns of real words do
 * not fit a 320px viewport, and a table that overflowed would scroll the
 * whole PAGE sideways — the one failure the responsive suite exists to catch.
 *
 * The caption carries the leaf's title and description, which is where a
 * table's words go: everything else is a cell somebody wrote. An enclosing
 * tab that already showed the title drops that half and keeps the
 * description.
 *
 * @param props - the leaf and how to read it.
 * @returns the table, or the words it could not fill one with.
 */
function TableLeaf(props: LeafProps): ReactNode {
  const { leaf, locale, labelled } = props;
  const { title, description } = wordsOf(leaf, locale);
  const rows = tableRows(leaf, locale).filter((row) =>
    row.values.some((cell) => cell.text !== ""),
  );
  if (rows.length === 0) return PlainLeaf(props);
  const caption = labelled ? title : "";
  return (
    <div className="overflow-x-auto rounded-xl surface border-(--edge) bg-(--surface)">
      <table className="w-full" {...tid("block-table")}>
        {caption || description ? (
          <caption className="px-5 py-3.5 text-left">
            {/* A `<div>` inside the caption rather than `display: grid` ON it.
                A `<caption>` is `display: table-caption` in every UA sheet, and
                overriding that would take the element out of the table's own
                caption box and leave a grid box among the table's anonymous
                boxes — a layout question jsdom cannot answer, so it is avoided
                rather than guessed at. */}
            <div className="grid gap-1">
              {caption ? (
                <span className="font-display text-sm/tight font-bold">
                  {caption}
                </span>
              ) : null}
              {description ? (
                <span className="text-xs/relaxed text-(--muted)">
                  {description}
                </span>
              ) : null}
            </div>
          </caption>
        ) : null}
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.key}
              className="border-b border-(--edge)/25 last:border-b-0 even:bg-(--bar)"
            >
              <th
                scope="row"
                className="border-r border-(--edge)/25 px-5 py-3.5 text-left font-display text-sm font-bold"
              >
                {row.label}
              </th>
              {row.values.map((cell) => (
                <td key={cell.key} className="px-5 py-3.5 text-sm/relaxed">
                  {cell.text}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Every content kind that renders on its own terms, by the name stored on the
 * leaf.
 *
 * **A `Map`, not a record, because `kind` arrives from `jsonb`.** This repo
 * shipped a Critical from exactly the other shape: a plain object indexed by
 * user-controlled text answered `__proto__`, `constructor` and `toString` with
 * truthy inherited values, which passed a `!entry` guard and then threw during
 * a public page render. A `Map` has no inherited entries to find.
 *
 * The private object below is a compile-time check and is never indexed:
 * `satisfies Record<LeafKind, …>` refuses a key that is not a leaf kind AND
 * fails to compile the moment `LEAF_KINDS` gains one with no renderer behind
 * it, and `Object.entries` reads only its own keys.
 *
 * **It was `Partial` while kinds were still missing and is total now**, which
 * is the point of having spent the type at all: a kind added to the vocabulary
 * without a renderer is a build failure rather than a blank space on somebody's
 * page. {@link PlainLeaf} still answers a `kind` that reached here from a
 * payload bypassing the schema and the database alike — the runtime miss and
 * the compile-time gap are different failures and only one of them can be
 * typed away.
 */
export const LEAVES: ReadonlyMap<string, LeafRenderer> = new Map(
  Object.entries({
    text: PlainLeaf,
    link: LinkLeaf,
    picture: PictureLeaf,
    player: PlayerLeaf,
    post: PostLeaf,
    social: SocialLeaf,
    stat: StatLeaf,
    quote: QuoteLeaf,
    progress: ProgressLeaf,
    table: TableLeaf,
  } satisfies Record<LeafKind, LeafRenderer>),
);

/**
 * One piece of content, rendered on its kind's own terms.
 *
 * **The seam the container renderer reaches leaves through.** Everything about
 * a leaf's placement — its span, its style bag, its `data-block-kind` marker —
 * belongs to {@link Block} and is on the element wrapping this one, so no kind
 * can drop any of it.
 *
 * A kind {@link LEAVES} does not name renders as {@link PlainLeaf}. That covers
 * both the kinds not yet built and a `kind` from a payload that bypassed the
 * schema and the database alike — including one chosen to walk a prototype
 * chain, which the `Map` answers as an ordinary miss.
 *
 * @param props - the leaf and how to read it.
 * @returns the leaf.
 */
function Leaf(props: LeafProps): ReactNode {
  // A kind is a render FUNCTION and is called as one, never mounted as
  // `<Kind …/>` — see the identical note in `Block` for why a component read
  // out of a lookup during render is a new component identity every time.
  const render = LEAVES.get(props.leaf.kind) ?? PlainLeaf;
  return render(props);
}

/**
 * One block of a page — an arrangement, or one piece of content.
 *
 * A **server component**, and this file is written to stay one: every mode is
 * CSS, including the modes that look like they need a script.
 *
 * **A container renders `<Block>` for each of its children, and that is the
 * whole recursion.** Nothing counts levels to stop: the schema refuses a tree
 * past `MAX_DEPTH` before it can be handed here, and `validate_block` in
 * `0009` refuses the same tree at the database, with a counter of its own.
 * `depth` is carried for heading levels alone.
 *
 * **A span narrows here and nowhere else.** {@link effectiveSpan} measures the
 * author's span against the tracks of whatever contains this block; a stored
 * span wider than its parent is legal and stays stored as typed, so dragging
 * the block somewhere wider restores what was meant. The narrowing is a class
 * rather than an inline property because it must not survive the collapse to a
 * single track — see {@link TRACK_CLASS}.
 *
 * **The style bag applies at every level**, through `blockStyle`, so
 * a container two levels down chooses a skin, a background picture and a
 * border exactly as a section does. A block whose author set nothing carries
 * no `style` attribute at all.
 *
 * Only a NAMED container gets a heading, and only when `labelled` is not
 * false. An unnamed one is a group with no label, which is the ordinary case
 * for a container nested inside another — and the only reasonable rendering,
 * since inventing a heading would put words on somebody's page that they did
 * not write. `false` is the separate case of a mode having shown the name
 * somewhere of its own; see {@link BlockProps.labelled}.
 *
 * **A leaf's own content is {@link Leaf}'s and its PLACEMENT is this
 * function's.** The span class, the style bag and the `data-block-kind` marker
 * are all on the element wrapping the leaf, so no per-kind renderer can drop
 * any of them — a kind replaces what is inside that element and never what is
 * around it. `parentHost` is handed down with the rest, for the `player` kind
 * that reads it.
 *
 * **The leaf carries `min-w-0` and the section declares its own single track,
 * and the two guard different things.** Measured at 320px with an eight-column
 * `table` leaf on the page: `document.scrollWidth` read 656 against a
 * `clientWidth` of 320, and the `overflow-x-auto` box round the table had
 * resolved to 638px wide and so had nothing left to scroll. The table did not
 * overflow the page; **the page grew to fit the table**, which looks the same
 * to a reader and has the opposite cause.
 *
 * A `grid` track sized `auto` is floored at its content's min-content
 * contribution, so one wide descendant widens it, which widens the track above
 * it, all the way out to the page. `grid-cols-[minmax(0,1fr)]` removes that
 * floor — `Grid` already gets it from `grid-cols-1`, and a grid with no
 * template falls back to `auto`. See {@link TRACK_CLASS} for the same argument
 * made about the breakpoint: a `minmax` whose floor is `0` is the one shape
 * that cannot overflow whatever the container's width turns out to be.
 *
 * **What `min-w-0` on the leaf covers is narrower than it looks, and the
 * obvious reason for it is wrong.** It is NOT that a flex item is floored at
 * `min-width: auto`: per Flexbox §4.5 an automatic minimum size applies only
 * when that property is on the container's MAIN axis, so in `Stack`'s column
 * it computes to `0` and the items are not floored at all. The one arrangement
 * where the leaf's own `min-w-0` is load-bearing is {@link Timeline}, which
 * lays `auto` grid tracks in its `<ol>` and its `<li>`; removing it there
 * overflows a phone by 447px, which `blocks-render.spec.ts` now has a fixture
 * for. `min-w-0` on the `<section>` is redundant — a container always carries
 * the explicit template — and is kept only so the two elements this function
 * renders say the same thing.
 *
 * **The `public-section` marker is on the `<section>` element and is
 * unconditional at depth 0.** It was on the heading, which renders only for a
 * named container — a state the flat model could not reach, since a section's
 * name was required there. The end-to-end suite both COUNTS sections by this
 * id and reaches the styled element through it, and the styled element is the
 * `<section>`, so this is where its callers actually want it.
 *
 * **A kind this build does not know renders as a plain leaf rather than
 * nothing**, which is what the lenient read exists to allow: a page written by
 * a newer deployment stays readable, one block plainer than its author meant.
 * That is why the union is narrowed with {@link isContainer} here instead of a
 * comparison — a leaf's `kind` is no longer a literal type, so a comparison
 * would not narrow it.
 *
 * @returns the block and everything beneath it.
 */
export function Block({
  block,
  locale,
  depth,
  tracks,
  path,
  parentHost,
  labelled = true,
}: BlockProps): ReactNode {
  const style = blockStyle(block.style);
  const span = SPAN_CLASS.get(effectiveSpan(block.span, tracks)) ?? "";

  if (!isContainer(block)) {
    return (
      <div
        className={`min-w-0 ${span}`}
        style={style}
        data-block-kind={block.kind}
        {...tid("public-leaf")}
      >
        <Leaf
          leaf={block}
          locale={locale}
          labelled={labelled}
          parentHost={parentHost}
        />
      </div>
    );
  }

  // A mode is a render FUNCTION and is called as one, never mounted as
  // `<Mode …/>`. A component read out of a lookup during render is a new
  // component identity on every render, which resets any state inside it;
  // these hold none, and calling them directly says so rather than relying on
  // that staying true.
  const mode = MODES.get(block.mode) ?? Stack;
  const name = labelled ? contentFor(block, "name", locale) : "";
  const heading = HEADING.get(depth) ?? DEEPEST_HEADING;
  const Tag = heading.tag;
  // Only a section is marked, and every section is. A nested container
  // carrying the same test id would make the end-to-end suite's own selector
  // ambiguous the first time somebody nested one.
  const marker = depth === 0 ? tid("public-section") : {};

  return (
    <section
      className={`grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 ${span}`}
      style={style}
      {...marker}
    >
      {name ? <Tag className={heading.className}>{name}</Tag> : null}
      {mode({
        container: block,
        locale,
        depth,
        path,
        parentHost,
      })}
    </section>
  );
}

/** What {@link PublicBlocks} needs. */
export interface PublicBlocksProps {
  /** The page, as parsed — the outermost blocks, in the author's order. */
  blocks: BlockNode[];
  /** The locale being read, which decides which language is preferred. */
  locale: string;
  /**
   * This deployment's own hostname, for Twitch's `parent=`.
   *
   * **Resolved by the route, not read here.** This renders on both public
   * pages and neither is the thing that knows its own deployment
   * configuration — the same reason `locale` is a route-resolved prop. Empty
   * means Twitch resolves to nothing and renders as a link; see
   * `domain/embeds.ts`.
   */
  parentHost: string;
}

/**
 * A whole page of blocks.
 *
 * **This is the seam between a route and the tree**, and it is deliberately
 * thin: everything about how a block looks belongs to {@link Block}, so the
 * only things decided here are the gap between the outermost blocks and what
 * their span is measured against.
 *
 * **Nothing is sorted, and that is the model rather than an omission.** The
 * flat sections this replaces carried a `sort_order` and had to be sorted on
 * every read, in two places, because two sections could share one — the array
 * order was not authoritative. A block carries no order of its own: **the
 * array IS the order**, at every depth, so a renderer that sorted would be
 * inventing a key the model does not have.
 *
 * Each block's `path` is its position, which is the identifier the whole tree
 * builds its `id`s and radio-group `name`s from — see {@link BlockProps.path}
 * for why nothing an author typed may reach either.
 *
 * `tracks` is {@link PAGE_TRACKS}: the page is the parent of the outermost
 * blocks and stacks them one to a row, so a span stored wider than that is
 * narrowed here at render and left alone in storage.
 *
 * The page's own grid declares `minmax(0, 1fr)` rather than leaving its single
 * track `auto`, for the reason {@link Block} states at length: an `auto` track
 * is floored at its content's min-content width, so one wide descendant grows
 * the whole page sideways instead of scrolling inside its own box. Measured,
 * not reasoned.
 *
 * **A page with no blocks renders nothing at all**, not an empty grid. The
 * empty state is the route's to show, in the visitor's own language, and a
 * bordered nothing above it would be a second answer to one question.
 *
 * @returns the page, or nothing when there is nothing on it.
 */
export function PublicBlocks({
  blocks,
  locale,
  parentHost,
}: PublicBlocksProps): ReactNode {
  if (blocks.length === 0) return null;
  // Position named once, exactly as `seatsOf` does it and for the same reason:
  // a block has no identity but where it sits, and `react/no-array-index-key`
  // reads the map callback's index parameter.
  const seats = blocks.map((block, position) => ({
    block,
    path: String(position),
  }));
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-10">
      {seats.map((seat) => (
        <Block
          key={seat.path}
          block={seat.block}
          locale={locale}
          depth={0}
          tracks={PAGE_TRACKS}
          path={seat.path}
          parentHost={parentHost}
        />
      ))}
    </div>
  );
}
