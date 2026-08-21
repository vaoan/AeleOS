import { Plus, Quote as QuoteMark } from "lucide-react";
import { Fragment, type CSSProperties, type ReactNode } from "react";
import { contentFor } from "@/features/actors/domain/actor-content";
import {
  MAX_DEPTH,
  isContainer,
  type Block as BlockNode,
  type ContainerBlock,
  type ContainerMode,
  type LeafBlock,
  type LeafKind,
} from "@/features/actors/domain/block-schema";
import { trackListFor } from "@/features/actors/domain/block-tracks";
import {
  resolveEmbed,
  safeHttpUrl,
  type EmbedShape,
} from "@/features/actors/domain/embeds";
import { progressValue } from "@/features/actors/domain/progress-value";
import { resolveSocial } from "@/features/actors/domain/social-links";
import { blockStyle } from "@/features/actors/presentation/block-style";
import { EmbedFrame } from "@/features/actors/presentation/embed-frame";
import { PublicSectionIcon } from "@/features/actors/presentation/public-section-icon";
import { RetroPlayer } from "@/features/actors/presentation/retro-player";
import type { ChromeKind } from "@/features/actors/domain/chromes";
import { tid } from "@/shared/infrastructure/test-id";
import {
  AvatarLeaf,
  FursonasLeaf,
  HandleLeaf,
  NameLeaf,
  OwnerLeaf,
} from "@/features/actors/presentation/identity-leaves";
import type {
  PublicActor,
  PublicFursonaSummary,
} from "@/features/actors/infrastructure/public-actors";
import type { PageMeasure } from "@/features/actors/domain/actor-theme";

/**
 * What a block may need that is not in the block.
 *
 * **Threaded by hand rather than provided by React context, and that is
 * mechanism rather than preference.** This file is a server component
 * throughout — every container mode is CSS precisely so it stays one — and
 * context needs a client boundary. So page-level values travel down the
 * recursion, which is what `parentHost` already did alone before anything
 * joined it.
 *
 * **One object rather than one prop per value.** Every level of the recursion
 * passes this through untouched, so the cost of a new page-level value is one
 * field here instead of one prop on {@link BlockProps}, on `ModeProps`, on
 * `LeafProps` and at every pass-through site in between — eighteen of them
 * when this was written.
 *
 * It carries no block data and never should: anything a single block knows
 * belongs on the block. The test is whether every block on the page would
 * answer it identically.
 *
 * **Most of it exists for the identity leaves**, which draw the actor rather
 * than what an author typed — see `presentation/identity-leaves.tsx`. Those
 * fields pass that test exactly: an actor's handle, address, name and portrait
 * are the same for every block on their page.
 *
 * `owner` and `fursonas` are mutually exclusive and both optional, because a
 * page is one kind or the other. Absent means "not a question this page
 * kind asks"; the leaf that would read it renders nothing, which is only
 * reachable through a write that refuses that kind anyway.
 *
 * It carries the page's MEASURE too, which only {@link PublicBlocks} reads.
 */
export interface PageContext {
  /**
   * This deployment's own hostname, for Twitch's `parent=`.
   *
   * Resolved by the route, never here: a presentation component is not the
   * thing that knows its own deployment configuration. Empty degrades Twitch
   * to a link rather than failing — see `domain/embeds.ts`.
   */
  parentHost: string;
  /** Which kind of page this is. */
  actorKind: "person" | "fursona";
  /**
   * The actor's raw handle.
   *
   * **Raw, and the `handle` leaf is what decides whether it may show.** A
   * person is minted as `u-<actor_ref with the hyphens out>`, which on a
   * person is the `owner_ref` of every fursona they own — the exact column
   * `/api/actors/mine` strips by name. `isMachineHandle` catches it and the
   * address stands in.
   */
  handle: string;
  /** The address this page was reached at. */
  address: string;
  /** The display name, when they set one. */
  displayName: string | null;
  /** Their picture, when they set one. */
  avatarUrl: string | null;
  /**
   * Who owns this page's fursona. A fursona's page only.
   *
   * `displayName` and `avatarUrl` are null unless that person's OWN profile is
   * readable — gated in `public_fursona`, never re-decided here. See
   * {@link PublicActor.owner}.
   */
  owner?: NonNullable<PublicActor["owner"]>;
  /** The owner's public fursonas. A person's page only. */
  fursonas?: PublicFursonaSummary[];
  /**
   * How wide the content column is, or null for the design's own.
   *
   * Read only by {@link PublicBlocks}, which applies it to each top-level
   * section — see `MEASURE_CLASS` for why the page itself is not held to it.
   */
  measure: PageMeasure | null;
  /**
   * The heading a `fursonas` leaf falls back to when its author wrote none.
   *
   * Resolved by the route, because this file is a server component and cannot
   * read a locale. The block's own title wins: that heading is the author's
   * own words, and a missing `title_es` is somebody who has not written the
   * Spanish yet rather than a fault.
   */
  fursonasFallbackTitle: string;
}

/**
 * What one block needs to render itself and everything beneath it.
 *
 * **`path` and `labelled` are both about the PARENT**, which is what makes the
 * recursion compose: a path is the containing block's path with this block's
 * position appended, and whether a block still owes its own name depends on
 * whether the mode above it has already shown it. Only `labelled` is optional,
 * because only it has an answer a caller with nothing to say can be given.
 *
 * **Nothing here says how WIDE this block is, and that absence is the model.**
 * A `tracks` prop stood beside these, carrying the containing grid's track
 * count so a stored `span` could be narrowed against it. Both are gone: a
 * container declares how many places it lays ACROSS and every child takes
 * exactly one of them, so where a block sits is entirely its parent's business
 * and its width is not a property of the block at all. What it does ask about
 * its own width, it asks in CSS — see {@link SPACE_CLASS}.
 *
 * **`page` is the exception and is about no parent at all** — see
 * {@link PageContext}. It is the deployment's and the actor's own data,
 * resolved by the route and threaded unchanged the whole way down to the
 * leaves that read it. It shares the recursion rather than the meaning.
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
   * Everything page-level a block or a leaf beneath it may read.
   *
   * Resolved by the route, never here — see {@link PageContext} for why it is
   * one object threaded by hand rather than a prop each or a React context.
   */
  page: PageContext;
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
  /** Threaded to the children — see {@link BlockProps.page}. */
  page: PageContext;
}

/** One arrangement, as a component over {@link ModeProps}. */
type ModeRenderer = (props: ModeProps) => ReactNode;

/**
 * The grid a container declares, by how many places it lays ACROSS.
 *
 * **Every entry is a CONTAINER query, and that is the correction this replaces
 * a viewport breakpoint with.** The classes were `sm:`-prefixed, which asks how
 * wide the WINDOW is — and in a tree that answer is wrong in a way that gets
 * worse the deeper it goes: a three-space section inside one place of another
 * three-space section is about a ninth of the page, while every `sm:` rule
 * inside it believes it has the whole screen. Tailwind's `@` variants query the
 * nearest ancestor declaring `container-type`, which is the enclosing
 * `<section>` — see {@link Block} — so a container asks how much room IT has.
 *
 * **Still a static class per count rather than an inline
 * `grid-template-columns`.** An inline style cannot carry a query of any kind,
 * viewport or container, so the collapse to a single track would have nowhere
 * to live. Tailwind's own `grid-cols-<n>` compiles to
 * `repeat(<n>, minmax(0, 1fr))`, which is the template the design asks for, and
 * a `minmax` whose floor is `0` is the one shape that cannot overflow whatever
 * the container's width turns out to be.
 *
 * **The threshold rises with the count**, which a single breakpoint could not
 * express and is the second thing wrong with asking the viewport: two places
 * are comfortable in a box where six are unreadable. Each is set so a place
 * clears roughly 150px before it is laid at all — `@xs` is 20rem, `@lg` 32rem,
 * `@2xl` 42rem, `@4xl` 56rem and `@5xl` 64rem, against a `gap-4` gutter
 * between places. One place declares nothing, because `grid-cols-1` is already
 * the base every container carries.
 *
 * A `Map` rather than a record because the count arrives from `jsonb`. The
 * schema bounds it on the WRITE and deliberately not on the read — a count
 * this build thinks too large is one a newer deployment wrote, and refusing it
 * would blank the page rather than cost the container its shape — so the
 * `?? ""` at the call site is a branch a stored value really reaches. Indexing
 * a plain object with a stored value is besides the shape that put a
 * `__proto__` through `TIDAL_KINDS`, and a number key cannot be one of those
 * names, which is exactly the guarantee a `Map` makes and a record does not.
 *
 * **The class owns the QUERY and the property owns the TRACKS**, and the split
 * is forced rather than chosen. Weights are author data, so no build step can
 * ever see them and no class can be generated for them; an inline
 * `grid-template-columns` would carry no query and so would apply at 320px,
 * flattening the collapse. So the inline style sets `--block-tracks` — a
 * static value needing no query — and the fallback here is the uniform list,
 * which means an unweighted container emits the same declaration it always
 * did and reaches it without a branch.
 *
 * **`--block-tracks` is set on every grid, weighted or not, and that is a fix
 * rather than a redundancy.** Custom properties INHERIT, and `var()` uses its
 * fallback only when the property is unset on the element asking — an
 * inherited value counts as set. So an unweighted grid nested anywhere beneath
 * a weighted one used to resolve the ANCESTOR's track list instead of its own
 * fallback: a two-place grid dropped into the middle place of a 1:3:1 section
 * laid three tracks at that ratio, not two equal ones, because nothing reset
 * the property between them. {@link Grid} now writes `"initial"` when there is
 * no ratio to state — a value `minmax()`/`repeat()` never parse as, so it
 * cannot itself become a stray real track list — which resets the property at
 * that element and re-arms every `var()` fallback beneath it, all the way down
 * to the next weighted grid, if any.
 */
const SPACE_CLASS = new Map<number, string>([
  [1, ""],
  [
    2,
    "@xs:[grid-template-columns:var(--block-tracks,repeat(2,minmax(0,1fr)))]",
  ],
  [
    3,
    "@lg:[grid-template-columns:var(--block-tracks,repeat(3,minmax(0,1fr)))]",
  ],
  [
    4,
    "@2xl:[grid-template-columns:var(--block-tracks,repeat(4,minmax(0,1fr)))]",
  ],
  [
    5,
    "@4xl:[grid-template-columns:var(--block-tracks,repeat(5,minmax(0,1fr)))]",
  ],
  [
    6,
    "@5xl:[grid-template-columns:var(--block-tracks,repeat(6,minmax(0,1fr)))]",
  ],
]);

/**
 * The column count `masonry` packs into, by the container's own space count.
 *
 * The same declared number as {@link SPACE_CLASS} reads and at the same
 * thresholds, spent on CSS multi-column rather than on grid tracks — which is
 * what separates this mode from `grid`. A grid's rows take the height of the
 * tallest item in them; multi-column has no rows at all, so a short item is
 * followed by whatever comes next regardless of its neighbour's height.
 *
 * One column declares nothing, for the reason {@link SPACE_CLASS} gives: it is
 * the base already on the element.
 */
/**
 * Where a lone block on a part-filled last row is laid, by the container's own
 * space count.
 *
 * **Only where the leftover divides evenly**, which is why odd counts are the
 * only entries. Three places holding four things leaves the fourth alone with
 * two empty tracks beside it, so putting it in the middle gives it one each; a
 * count of four leaves three, and no track boundary splits three in half — a
 * block moved one track along there would be off-centre, which is worse than
 * honestly at the start of the row.
 *
 * **It moves where a block is DRAWN and not where it is stored.** The selector
 * reads `:last-child:nth-child(<n>k+1)`, so it can only ever match the last
 * element of a container that happens to start a row; nothing about the tree
 * changes, and dragging the block elsewhere re-asks the question from scratch.
 *
 * **A container whose last place is EMPTY is not centred, and that is the
 * empty-place rule rather than an omission.** An empty place renders an
 * element that holds its width, so it is the `:last-child`, and the selector
 * misses. Somebody who left a trailing gap chose that shape.
 *
 * Each entry carries the same container-query prefix its track count does,
 * because below that width the container is a single column and there is no
 * leftover to divide — a `col-start` applied there would push the block off
 * the only track there is.
 *
 * **A weighted grid is never centred** — see {@link Grid}.
 */
const LONE_CENTRE = new Map<number, string>([
  [3, "@lg:[&>*:last-child:nth-child(3n+1)]:col-start-2"],
  [5, "@4xl:[&>*:last-child:nth-child(5n+1)]:col-start-3"],
]);

const MASONRY_CLASS = new Map<number, string>([
  [1, ""],
  [2, "@xs:columns-2"],
  [3, "@lg:columns-3"],
  [4, "@2xl:columns-4"],
  [5, "@4xl:columns-5"],
  [6, "@5xl:columns-6"],
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
 * A `Map` for the same reason as {@link SPACE_CLASS}: the depth is derived
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
 *
 * **A place may hold nothing, which is why `block` is nullable.** An empty
 * place is not a shorter list: it keeps its width on the page and draws
 * nothing, so `[a, null, b]` has to mean that `b` is third. See
 * {@link placeIn} for what an empty one renders as and {@link filledSeatsOf}
 * for the two modes that cannot have one.
 */
interface Seat {
  /** The child block, or nothing when the place is empty. */
  block: BlockNode | null;
  /** Its path: the container's own, with this child's position appended. */
  path: string;
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
   *
   * **It counts the container's own places, empty ones included**, so a
   * numeral names where the thing actually sits rather than where it landed
   * after the empties were dropped.
   */
  ordinal: number;
}

/**
 * A seat a mode has already established holds something.
 *
 * `first` lives here rather than on {@link Seat} because it is a claim about
 * the FILLED places: `tabs` opens on it, and a container whose first place is
 * empty must still open on the first tab it actually drew rather than on none
 * at all.
 */
interface FilledSeat extends Seat {
  /** The child block, which this seat is known to have. */
  block: BlockNode;
  /** Whether it is the first place holding anything. */
  first: boolean;
}

/**
 * Where each of a container's places sits, empty ones included.
 *
 * @param props - the mode's own props.
 * @returns one seat per place, in the order the author put them.
 */
function seatsOf(props: ModeProps): Seat[] {
  return props.container.children.map((block, position) => ({
    block,
    path: `${props.path}-${position}`,
    ordinal: position + 1,
  }));
}

/**
 * Where each of a container's OCCUPIED places sits.
 *
 * **For the two modes whose place is a CONTROL rather than a box**, `tabs` and
 * `accordion`. An empty place there is a tab that opens onto nothing and a
 * disclosure with nothing to disclose — a control that does not work, which is
 * strictly worse than the gap it would fill and is the same refusal
 * {@link PlainLeaf}, {@link LeafCaption} and {@link Accordion} already make in
 * three other places. Every mode that lays a BOX keeps the place, because
 * there the empty box IS the shape its author chose.
 *
 * Each seat keeps its true `path` and `ordinal`, so dropping an empty place
 * renumbers nothing: the third place is still called the third.
 *
 * @param props - the mode's own props.
 * @returns one seat per occupied place, in the author's order.
 */
function filledSeatsOf(props: ModeProps): FilledSeat[] {
  return seatsOf(props)
    .filter((seat): seat is Seat & { block: BlockNode } => seat.block !== null)
    .map((seat, position) => ({ ...seat, first: position === 0 }));
}

/**
 * One place of a container: what is in it, or the room it keeps for nothing.
 *
 * **An empty place renders an element that occupies its position and draws
 * nothing**, which is the decision the whole model rests on. Collapsing would
 * make a space count meaningless the moment a section were partly filled — a
 * three-space section holding two things would read as two columns — and the
 * shape an author chose would change under them as they worked. It carries no
 * border, no surface and no padding, so what a visitor sees is room rather
 * than a broken box.
 *
 * A trailing empty place is kept for the same reason and trimmed by nothing:
 * somebody is usually about to fill it, and trimming would move every entry
 * after the next thing they add.
 *
 * @param props - the mode's own props, which carry everything a child needs.
 * @param seat - where the place sits.
 * @param labelled - false when this mode has already shown the child's name
 *   somewhere of its own; see {@link BlockProps.labelled}.
 * @returns the child, or the empty place, keyed by its path.
 */
function placeIn(props: ModeProps, seat: Seat, labelled = true): ReactNode {
  if (!seat.block) return <div key={seat.path} {...tid("public-space")} />;
  return (
    <Block
      key={seat.path}
      block={seat.block}
      locale={props.locale}
      depth={props.depth + 1}
      path={seat.path}
      page={props.page}
      labelled={labelled}
    />
  );
}

/**
 * What a mode puts on the control it lifts a child's label onto.
 *
 * It takes a {@link FilledSeat} rather than a {@link Seat}, which is the type
 * saying that only a place holding something ever gets a control — see
 * {@link filledSeatsOf}.
 *
 * @param seat - where the child sits.
 * @param locale - the locale being read.
 * @returns the child's own name, or its position when it has none.
 */
function liftedLabel(seat: FilledSeat, locale: string): string {
  return labelOf(seat.block, locale) || String(seat.ordinal);
}

/**
 * The resting arrangement: one block under another, and no grid at all.
 *
 * **A flex column rather than a single-column grid, deliberately.** It lays
 * out one place per row whatever the container declared, so a `spaces` of
 * three means nothing here — arranging nothing is what this mode is.
 *
 * An empty place still keeps its row, because the position is the model: see
 * {@link placeIn}.
 *
 * @param props - the container and what its children need.
 * @returns the stacked children.
 */
function Stack(props: ModeProps): ReactNode {
  return (
    <div className="flex flex-col gap-4" {...tid("block-stack")}>
      {seatsOf(props).map((seat) => placeIn(props, seat))}
    </div>
  );
}

/**
 * The container's own places, laid across and continuing downward in rows.
 *
 * **This is where `spaces` means what it says.** The container declares how
 * many places it lays ACROSS; its children fill them one to a place, row by
 * row, and the section grows downward as more are added — which is why a
 * fifty-picture gallery is three places across and seventeen rows deep rather
 * than a shape nobody can build.
 *
 * **An empty place holds its column and the row does not close up**, which is
 * grid auto-placement doing the work: every in-flow child takes the next cell
 * whether or not it paints anything. See {@link placeIn}.
 *
 * **A lone block on a part-filled last row is centred across the leftover**,
 * where the leftover divides evenly — see {@link LONE_CENTRE} — and **never
 * when the grid is weighted**: centring gives a lone block one leftover track
 * each side, and tracks that are not the same width have no "one each" to
 * give it, so a weighted grid leaves the lone block where it is instead. That
 * is a rendering choice made from where a block already sits and it moves
 * nothing stored, which is the distinction that keeps it compatible with a
 * place being positional.
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
  const across = SPACE_CLASS.get(props.container.spaces) ?? "";
  const tracks = trackListFor(props.container);
  // **Not centred when weighted.** Centring gives a lone block one leftover
  // track each side, which is not something unequal tracks can be divided into.
  const lone = tracks ? "" : (LONE_CENTRE.get(props.container.spaces) ?? "");
  return (
    <div
      className={`grid grid-cols-1 gap-4 ${across} ${lone}`}
      // Set unconditionally — see the note on `--block-tracks` above. `"initial"`
      // resets the property at THIS element even when there is no ratio to
      // state, so a nested unweighted grid's own `var()` fallback re-arms
      // instead of inheriting an ancestor's tracks.
      style={{ "--block-tracks": tracks ?? "initial" } as CSSProperties}
      {...tid("block-grid")}
    >
      {seatsOf(props).map((seat) => placeIn(props, seat))}
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
 * It reads the container's own space count as its COLUMN count — the same
 * declared number `grid` spends on tracks, spent on a different mechanism.
 * An empty place still takes its turn in the flow, so the count of things
 * between two filled ones is what its author left there.
 *
 * @param props - the container and what its children need.
 * @returns the packed children.
 */
function Masonry(props: ModeProps): ReactNode {
  const across = MASONRY_CLASS.get(props.container.spaces) ?? "";
  return (
    <div className={`columns-1 gap-4 ${across}`} {...tid("block-masonry")}>
      {seatsOf(props).map((seat) => (
        <div key={seat.path} className="mb-4 break-inside-avoid">
          {placeIn(props, seat)}
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
 * An empty place keeps its card-shaped room, so the gap somebody left is one
 * they can swipe past.
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
        // **`@md:w-96` and not `sm:w-96`, which is the whole of Task 4 in one
        // class.** A card 384px wide is right in a section that has room for
        // it and wrong in one that does not, and the WINDOW cannot tell the
        // difference: at a 1400px viewport the `sm:` form gave a card 384px
        // inside a place a third of the page wide, so a card was permanently
        // wider than the box it scrolls in and no card could ever be seen
        // whole. `@md` is 28rem, measured against the enclosing `<section>`.
        <div key={seat.path} className="w-[85%] shrink-0 snap-center @md:w-96">
          {placeIn(props, seat)}
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
 * **An EMPTY place gets no tab.** A place here is a control rather than a box,
 * and a tab labelled by its position that opens onto nothing is a control that
 * does not work — see {@link filledSeatsOf}. The places that remain keep their
 * own ordinals, so dropping an empty one renumbers no tab.
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
      {filledSeatsOf(props).map((seat) => {
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
              {placeIn(props, seat, false)}
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
 * **An EMPTY place gets no disclosure**, for the reason {@link filledSeatsOf}
 * gives: a summary that discloses nothing is a control that does not work.
 *
 * **A container with nothing in any of its places renders nothing at all.**
 * The wrapper carries the border and the surface, so an empty one is a
 * bordered sliver with nothing in it — the same fault the flat `two-column`
 * layout records for a `dl` whose every row was dropped, in a new place. A
 * container holding only empty places is the same case and goes the same way.
 *
 * The plus rotates into a cross on open, which needs no script either.
 *
 * @param props - the container and what its children need.
 * @returns the disclosures.
 */
function Accordion(props: ModeProps): ReactNode {
  const seats = filledSeatsOf(props);
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
            {placeIn(props, seat, false)}
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
 * **An empty place keeps its step and loses its MARKER**, which is the two
 * halves of the same rule rather than an inconsistency. The step stays because
 * a sequence with a gap in it is what its author left there, and dropping it
 * would renumber everything after it. The dot goes because a marker beside
 * nothing is chrome for content that is not there — the identical argument
 * that drops an empty place entirely in {@link Tabs} and {@link Accordion},
 * where the chrome IS the control. `placeIn`'s own doc states the standard an
 * empty place is held to: no border, no surface, no padding, so what a visitor
 * sees is room rather than a broken box, and a bullet with nothing next to it
 * fails it.
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
          {seat.block ? (
            <span
              aria-hidden
              className="absolute top-1.5 -left-7.5 size-3 rounded-full border-2 border-(--surface) bg-(--accent)"
            />
          ) : null}
          {placeIn(props, seat)}
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
 * {@link Block} puts the style bag on the wrapping element, so a per-kind
 * renderer cannot silently drop it — the failure this project keeps producing
 * is a prop somebody had to remember to pass on, and the fix is to leave it
 * nowhere it can be forgotten. There was a span beside it once; a container
 * declares its spaces now and a child takes exactly one, so a leaf has no
 * width of its own to forget.
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
  page: PageContext;
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
 * and the difference is where the key comes from.** `SPACE_CLASS` and
 * {@link LEAVES} are indexed by values that arrived from `jsonb`; this is
 * indexed by `ResolvedEmbed.shape`, which `resolveEmbed` copies off a module
 * constant in `EMBED_PROVIDERS`. Nothing an author typed can reach it.
 *
 * **These heights are a FALLBACK now, not the answer.** Every one of them was
 * chosen by reasoning about how a provider designs its widget, and measuring
 * on 2026-08-19 found each one wrong: a short tweet painted 225px of the 600px
 * `post` box, an Apple Music album needed 450 of the 168px `audio` one, and
 * TikTok wanted 756 where `aspect-9/16` at the 320px cap gives 569. What a
 * frame actually gets is `ResolvedEmbed.height` when the provider was measured
 * and its own reported height when it reports one; these classes are what is
 * left for a provider that fills whatever it is given — where any height is
 * correct — and for the moment before a `post` provider has said anything.
 *
 * **The width cap moved out**, to {@link FRAME_BOX}, so that a caption sits
 * under the frame rather than at the far left of a place three times its
 * width.
 */
const FRAME_SHAPE: Record<EmbedShape, string> = {
  video: "aspect-video w-full rounded-xl surface border-(--edge)",
  portrait: "aspect-9/16 w-full rounded-xl surface border-(--edge)",
  audio: "h-42 w-full rounded-xl surface border-(--edge)",
  post: "h-150 w-full rounded-xl surface border-(--edge)",
};

/**
 * How wide the whole figure may be, and where the leftover goes.
 *
 * **`mx-auto` is the fix and the cap is not new.** A post has been capped at
 * 420px and a TikTok at 320 since the flat renderer, which is right — a tweet
 * laid across a 900px place is unreadable — but the leftover all went to the
 * right, so a frame in a one-space section hugged the left edge of a page that
 * is otherwise centred. Splitting it evenly is a rendering choice and moves
 * nothing an author stored.
 *
 * **It caps the FIGURE rather than the frame**, so the caption is the same
 * width as the thing it captions. Capping the frame alone left a tweet's title
 * and description starting hundreds of pixels to its left, which read as two
 * unrelated blocks.
 *
 * A `video` or an `audio` player takes the full place, so neither declares
 * anything: a video is worth all the room its author gave it, and both fill
 * whatever height they get.
 */
const FRAME_BOX: Record<EmbedShape, string> = {
  video: "",
  audio: "",
  portrait: "mx-auto w-full max-w-80",
  post: "mx-auto w-full max-w-105",
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
 * **Several kinds fall back HERE on their own terms**, which is a different
 * thing: {@link StatLeaf} and {@link TableLeaf} when the drop rule leaves no
 * pair to announce, {@link QuoteLeaf} when there are no words to quote,
 * {@link ProgressLeaf} when the value is not one `progressValue` can read, and
 * {@link PictureLeaf} when the address is one `safeHttpUrl` refuses. Each
 * shows its author's words rather than vanishing out of a grid track. The
 * list is named rather than counted, because a count in a comment goes stale
 * the moment a kind joins it — this one already had.
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
 * The body of both retro player leaves.
 *
 * **The whole of the doc that used to sit here has MOVED to {@link PostLeaf},
 * because the behaviour did.** This is no longer an embed of any kind: it
 * draws a player of ours, over a playlist stored in `rows`, wearing the chrome
 * named in `icon`. Nothing here resolves a provider.
 *
 * The two kinds differ only in whether the chrome has a video pane, so they
 * share this and differ by the argument — a second copy would be two chances
 * to disagree about a caption.
 *
 * @param kind - which chrome roster to draw from.
 * @param props - the leaf and how to read it.
 * @returns the player, with the author's own caption under it.
 */
function retroLeaf(kind: ChromeKind, props: LeafProps): ReactNode {
  const { leaf, locale, labelled } = props;
  const { title, description } = wordsOf(leaf, locale);
  return (
    <figure className="grid gap-2" {...tid(`block-${kind}`)}>
      <RetroPlayer
        kind={kind}
        chrome={leaf.icon}
        rows={leaf.rows}
        skinUrl={leaf.link_url}
        title={title}
        locale={locale}
      />
      <LeafCaption title={labelled ? title : ""} description={description} />
    </figure>
  );
}

/**
 * A retro media player with a video pane.
 *
 * **This kind used to mean an embed and no longer does.** `post` absorbed every
 * embed the two of them split, and the name was taken back for the thing it
 * says — see the actors feature note for the conversion that made it
 * unambiguous rather than inferred.
 */
function PlayerLeaf(props: LeafProps): ReactNode {
  return retroLeaf("player", props);
}

/**
 * A retro music player: a playlist and no video pane.
 *
 * The pane is the dividing line and it is a LICENSING one — YouTube's terms
 * forbid hiding the player, so only a chrome with somewhere to show it may
 * offer a YouTube address at all.
 */
function JukeboxLeaf(props: LeafProps): ReactNode {
  return retroLeaf("jukebox", props);
}

/**
 * Any embed at all: a video, a track, a post — whatever the provider table
 * recognises.
 *
 * **This is the merge of two kinds that were one leaf under two names.**
 * `player` and `post` had byte-identical field sets in `LEAF_FIELDS`, resolved
 * through the same table and rendered the same frame; nothing about an embed
 * varies per leaf, because the height, the shape and the aspect all come from
 * `EMBED_PROVIDERS`. It was renamed from `post` in the same change, because it
 * holds YouTube, Spotify and Tidal as well as Instagram and Mastodon.
 *
 * **An address that resolves to no provider renders as a {@link SocialLeaf}
 * chip, never as nothing and never as a bare link.** Bluesky is the case this
 * exists for — `embed.bsky.app` hard-refuses the handle a pasted Bluesky
 * address carries, so it never resolves — and a page that already brands
 * Bluesky as a chip elsewhere would be inconsistent showing it unbranded here.
 * The chip falls back once more on its own terms, so this too reaches a row and
 * never nothing.
 *
 * **`parentHost` is passed now, and the previous behaviour was DELIBERATE
 * rather than a bug.** It used to be withheld, with a reason written down:
 * Twitch is the only provider that reads it, its player is a `video` shape
 * rather than a post, and a video did not belong in a post's 420px column — the
 * `player` leaf framed it instead. There is no post's column any more, and this
 * kind already frames YouTube, Vimeo, TikTok and Dailymotion, so a chipped
 * Twitch would be the one arbitrary case rather than the consistent one. The
 * old reasoning did not become wrong; its premise went away. Without a
 * `parentHost` Twitch still resolves to null and takes the chip, because a
 * frame built without one is a player guaranteed to error.
 *
 * @param props - the leaf and how to read it.
 * @returns the embed, or the chip it could not become one.
 */
function EmbedLeaf(props: LeafProps): ReactNode {
  const { leaf, locale, labelled, page } = props;
  // **`parentHost` is passed here now, and its absence was a real bug.** The
  // two embed kinds this one absorbed differed in exactly two ways, and this
  // was the undocumented half: `player` passed it and `post` did not, so the
  // same Twitch address was a working player in one kind and a dead chip in the
  // other. Twitch refuses to load unless `parent=` names the embedding domain.
  const embed = resolveEmbed(leaf.link_url, { parentHost: page.parentHost });
  if (!embed) return SocialLeaf(props);
  const { title, description } = wordsOf(leaf, locale);
  return (
    <figure
      className={`grid gap-2 ${FRAME_BOX[embed.shape]}`}
      {...tid("block-embed")}
    >
      <EmbedFrame
        embed={embed}
        title={title}
        className={FRAME_SHAPE[embed.shape]}
      />
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
 *
 * **`player` no longer renders an embed.** `EmbedLeaf` is the only renderer
 * that resolves a provider now; `PlayerLeaf` and `JukeboxLeaf` draw a retro
 * chrome of ours over a playlist, and both go through `retroLeaf`.
 *
 * **The five identity leaves live in their own module**,
 * `presentation/identity-leaves.tsx`, and are registered here like any other
 * kind. They are separated because they render the ACTOR — resolved from
 * {@link PageContext} — rather than what an author typed into the block, which
 * makes them a different thing to read; and because this file is long enough
 * already.
 */
export const LEAVES: ReadonlyMap<string, LeafRenderer> = new Map(
  Object.entries({
    text: PlainLeaf,
    link: LinkLeaf,
    picture: PictureLeaf,
    player: PlayerLeaf,
    jukebox: JukeboxLeaf,
    embed: EmbedLeaf,
    social: SocialLeaf,
    stat: StatLeaf,
    quote: QuoteLeaf,
    progress: ProgressLeaf,
    table: TableLeaf,
    // The identity leaves live in their own module: this file is already ~2000
    // lines, and their content comes from `PageContext` rather than from the
    // leaf, which makes them a different kind of thing to read.
    avatar: AvatarLeaf,
    handle: HandleLeaf,
    name: NameLeaf,
    owner: OwnerLeaf,
    fursonas: FursonasLeaf,
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
 * **Both elements this renders declare a containment context, and that is what
 * "content adapts to its parent" is made of.** `@container` compiles to
 * `container-type: inline-size`, so every `@`-prefixed rule beneath asks how
 * wide ITS OWN box is rather than how wide the window is — a `sm:` rule inside
 * one place of a three-space section believes it has the whole screen, and is
 * wrong by a factor that grows with depth. The `<section>` is what a mode's own
 * track classes query ({@link SPACE_CLASS}); the leaf wrapper is what a kind's
 * own rules query, so a leaf asks about the box it was actually given.
 *
 * **A block carries no width of its own any more.** `span` and the `tracks`
 * prop that narrowed it are both gone: a container declares how many places it
 * lays across and each child takes exactly one, so a wide thing is a container
 * of one place nested where it is wanted — the same recursion doing the work
 * rather than a second mechanism beside it.
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
 * template falls back to `auto`. See {@link SPACE_CLASS} for the same argument
 * made about the query: a `minmax` whose floor is `0` is the one shape that
 * cannot overflow whatever the container's width turns out to be.
 *
 * **What `min-w-0` on the leaf covers is narrower than it looks, and the
 * obvious reason for it is wrong.** It is NOT that a flex item is floored at
 * `min-width: auto`: per Flexbox §4.5 an automatic minimum size applies only
 * when that property is on the container's MAIN axis, so in `Stack`'s column
 * it computes to `0` and the items are not floored at all. What it guards is
 * {@link Timeline}, the one mode laying `auto` grid tracks — in its `<ol>` and
 * its `<li>` — where a wide descendant would otherwise grow the track and push
 * the page out with it.
 *
 * **`@container` on the same element does that job too, and neither can be
 * sabotaged alone.** `container-type: inline-size` applies inline-size
 * containment, so the leaf's inline size is computed without reference to its
 * contents — which zeroes exactly the min-content contribution `min-w-0`
 * zeroes. Measured on this branch by deleting one at a time and running
 * `blocks-render.spec.ts` in a real Chromium: **either alone leaves all twelve
 * tests green, and removing BOTH reddens two** — the 320px sweep by 367px of
 * sideways scroll, and the 1400px narrow space by a table box painting 271px
 * outside its own place. An earlier version of this paragraph credited
 * `min-w-0` with a 447px phone overflow on its own; that number belongs to an
 * arrangement this element no longer has, and a single-guard sabotage cannot
 * reproduce it. Keep both, and know that a check on either one alone is
 * measuring the other.
 *
 * `min-w-0` on the `<section>` is redundant for a separate and solid reason —
 * a container always carries the explicit template — and is kept only so the
 * two elements this function renders say the same thing.
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
 * `page` is handed to every child unchanged and read only by the leaves that
 * need it — see {@link PageContext}.
 *
 * @returns the block and everything beneath it.
 */
export function Block({
  block,
  locale,
  depth,
  path,
  page,
  labelled = true,
}: BlockProps): ReactNode {
  const style = blockStyle(block.style);

  if (!isContainer(block)) {
    return (
      <div
        className="@container min-w-0"
        style={style}
        data-block-kind={block.kind}
        {...tid("public-leaf")}
      >
        <Leaf leaf={block} locale={locale} labelled={labelled} page={page} />
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
      className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3"
      style={style}
      {...marker}
    >
      {name ? <Tag className={heading.className}>{name}</Tag> : null}
      {mode({
        container: block,
        locale,
        depth,
        path,
        page,
      })}
    </section>
  );
}

/**
 * What {@link PublicBlocks} needs.
 *
 * `page` is the page-level data every block shares — see {@link PageContext}.
 * It is threaded rather than provided by a React context because this whole
 * file is a server component.
 */
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
  page: PageContext;
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
 * The page stacks the outermost blocks one to a row and hands them nothing
 * about width, because there is nothing to hand: a block takes exactly one
 * place of whatever contains it, and here that is the page.
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
 * `page` goes to every top-level block unchanged; this function reads no field
 * of it.
 *
 * @returns the page, or nothing when there is nothing on it.
 */
/**
 * What each measure lays a top-level section out in.
 *
 * **Whole class strings, never interpolated.** Tailwind reads source text, so
 * `max-w-${size}` compiles to nothing at all — the fault that would show as a
 * page silently ignoring its own setting.
 *
 * The padding rides these rather than the shell, because a full-width page has
 * no column to put it on and a bleeding section must not have it at all.
 */
const DEFAULT_PAGE_MEASURE: PageMeasure = "wider";

/**
 * What a section that opts out of the measure is laid out in.
 *
 * **No maximum, no centring and no padding**, so it reaches both edges. There
 * is no `w-screen` and no negative margin here, and that is the whole reason
 * the measure moved per-section: `100vw` counts the scrollbar that a centred
 * column does not, so the breakout version gains a horizontal scrollbar the
 * moment a page is tall enough to need a vertical one.
 *
 * It keeps `data-page-gutter` even though it has no gutter — the attribute
 * marks "this is the page's own box", which is what the container-query guard
 * excludes, and a bled section is still that box.
 */
const BLEED_CLASS = "w-full";

/**
 * Whether a top-level block runs to both edges of the window.
 *
 * **Read at depth 0 and nowhere else.** A block nested inside a section has a
 * section between it and the page and cannot escape it, so honouring the key
 * deeper down would be a control that appears to do something and does not.
 * The editor does not offer it there for the same reason.
 *
 * `false` and absent are the same answer, which is why the editor stores
 * absence rather than `false`: a bag's missing key already means "inherit the
 * page" everywhere else in it.
 *
 * @param block - the top-level block.
 * @returns true when it opts out of the measure its page chose.
 */
function bleeds(block: BlockNode): boolean {
  return isContainer(block) && block.style?.bleed === true;
}

/**
 * What each measure lays a top-level section out in.
 */
const MEASURE_CLASS: Record<PageMeasure, string> = {
  narrow: "mx-auto w-full max-w-[620px] px-4 sm:px-6",
  medium: "mx-auto w-full max-w-3xl px-4 sm:px-6",
  wide: "mx-auto w-full max-w-5xl px-4 sm:px-6",
  wider: "mx-auto w-full max-w-7xl px-4 sm:px-6",
  widest: "mx-auto w-full max-w-[96rem] px-4 sm:px-6",
  full: "w-full px-4 sm:px-6",
};

/** The same measures without the ordinary page-side gutter. */
const MEASURE_WITHOUT_GUTTER_CLASS: Record<PageMeasure, string> = {
  narrow: "mx-auto w-full max-w-[620px]",
  medium: "mx-auto w-full max-w-3xl",
  wide: "mx-auto w-full max-w-5xl",
  wider: "mx-auto w-full max-w-7xl",
  widest: "mx-auto w-full max-w-[96rem]",
  full: "w-full",
};

const FIRST_MARGIN = "pt-6 sm:pt-10";
const BETWEEN_MARGIN = "mt-10";
const LAST_MARGIN = "pb-6 sm:pb-10";

/**
 * Composes the page box a depth-0 block owns.
 *
 * Width and page chrome are independent: bleed chooses the width, while
 * margins chooses the horizontal gutter and first/between/last spacing.
 *
 * @param block - the top-level block.
 * @param position - its zero-based page position.
 * @param count - the number of top-level blocks.
 * @param measure - the page measure chosen by the author.
 * @returns whole Tailwind class strings for that page box.
 */
function pageBoxClass(
  block: BlockNode,
  position: number,
  count: number,
  measure: PageMeasure,
): string {
  const hasMargins = !isContainer(block) || block.style?.margins !== false;
  let width = BLEED_CLASS;
  if (!bleeds(block)) {
    width = hasMargins
      ? MEASURE_CLASS[measure]
      : MEASURE_WITHOUT_GUTTER_CLASS[measure];
  }
  if (!hasMargins) return width;
  return [
    width,
    position === 0 ? FIRST_MARGIN : "",
    position > 0 ? BETWEEN_MARGIN : "",
    position === count - 1 ? LAST_MARGIN : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Everything on one public page.
 *
 * A **server component**, like the whole of this file.
 *
 * The page stacks the outermost blocks one to a row. Each sits inside the
 * author's chosen measure — see {@link MEASURE_CLASS} — because the route asks
 * the shell for a full-width `main` and lets each section centre itself. That
 * inversion is what lets one section reach both edges without `w-screen`.
 *
 * Its grid declares `minmax(0, 1fr)` rather than leaving its single track
 * `auto`: an `auto` track is floored at its content's min-content width, so one
 * wide descendant would grow the whole page sideways instead of scrolling
 * inside its own box. Measured, not reasoned.
 *
 * **A page with no blocks renders nothing at all**, not an empty grid. That
 * state is unreachable in production now — `withRequiredBlocks` guarantees a
 * portrait and a handle — but the guard stays, because this component is
 * handed a tree rather than fetching one and a caller may pass an empty array.
 *
 * `page` goes to every top-level block unchanged; only its `measure` is read
 * here.
 *
 *
 * **A section carrying `style.bleed` opts out of the measure entirely** and
 * reaches both edges — see {@link BLEED_CLASS}. Read at depth 0 only.
 * `style.margins === false` independently opts that same section out of page
 * chrome: no side gutter, no neighbour gap, and no bar/floor padding when it
 * is first or last. Absent or `true` keeps today's spacing. The parent stack
 * owns no `gap-10`, because a gap neither neighbour can drop is one neither
 * can opt out of.
 *
 * @returns the page, or nothing when there is nothing on it.
 */
export function PublicBlocks({
  blocks,
  locale,
  page,
}: PublicBlocksProps): ReactNode {
  if (blocks.length === 0) return null;
  // Resolved once, and OUTSIDE the class attribute: `better-tailwindcss` reads
  // string literals in a `className` expression as class names, so the default
  // stop written inline was reported as an unknown class called `wider`.
  const measure = page.measure ?? DEFAULT_PAGE_MEASURE;
  // Position named once, exactly as `seatsOf` does it and for the same reason:
  // a block has no identity but where it sits, and `react/no-array-index-key`
  // reads the map callback's index parameter.
  const seats = blocks.map((block, position) => ({
    block,
    path: String(position),
  }));
  return (
    <div className="grid grid-cols-[minmax(0,1fr)]">
      {seats.map((seat, position) => (
        // **The measure is applied PER SECTION, not to the page.** The route
        // asks the shell for a full-width `main`, so each top-level block
        // centres itself in the author's chosen measure — which is what lets
        // one of them opt out and reach both edges without `w-screen`, whose
        // `100vw` counts the scrollbar that a centred column does not.
        <div
          key={seat.path}
          // **The page's own gutter, and the one element here sized by the
          // WINDOW.** Everything below it is a block and adapts to its parent
          // through a container query; this is the outermost box and has no
          // container above it. An ordinary measured section carries the
          // horizontal gutter plus its positional page chrome here; bleed
          // removes the width constraint, and `margins: false` removes all
          // chrome. The marker lets the no-viewport-breakpoint guard say so
          // precisely instead of being relaxed.
          data-page-gutter=""
          className={pageBoxClass(seat.block, position, seats.length, measure)}
        >
          <Block
            block={seat.block}
            locale={locale}
            depth={0}
            path={seat.path}
            page={page}
          />
        </div>
      ))}
    </div>
  );
}
