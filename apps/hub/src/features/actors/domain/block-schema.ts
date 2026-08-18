import { z } from "zod";

/**
 * The ways a container arranges what is inside it.
 *
 * **A mode decides arrangement and nothing else.** That separation is the whole
 * point of this model: the layouts it replaces welded an arrangement to a
 * content kind — `gallery` was a grid _of pictures_, `links` a list _of links_ —
 * so every new idea had to become another welded pair, and "a player beside a
 * paragraph beside a table" was not merely unsupported but unrepresentable.
 * Here the arrangement is the container's and the content is each child's.
 *
 * Each of these earns its place by a mechanism none of the others has, which is
 * the same bar the layout list always set itself: `grid` lays uniform tracks
 * and `masonry` packs by height through CSS multi-column layout, where those
 * tracks leave a ragged gap between a long entry and a short one; `carousel`
 * scrolls sideways at every width; `tabs` shows one panel at a time where
 * `accordion` may have every one open at once; `timeline` is a sequence.
 * `stack` is the resting state and lays out nothing at all.
 *
 * **`columns` was in this list and was removed before anything could store
 * one**, and the way it failed is the bar restated. Three consecutive tasks
 * wrote down three different meanings for it — this file said it lay uniform
 * tracks exactly as `grid` does, `0009` said `grid` fills them across and
 * `columns` down, and the renderer shipped the same grid aligned to the start
 * of each row. A name each author filled in from context is not a mechanism, and
 * the track count is already a PARAMETER of `grid`, so a second mode for it
 * would be the welded cross-product this model exists to undo. Prose columns,
 * if they are ever wanted, are `align: "stretch" | "start"` in
 * {@link blockStyleShape} — a dial that composes with every mode rather than
 * being available on one.
 *
 * **The database holds this same list, in `is_container_mode()`, and is
 * authoritative over it** — a mode it does not know is refused whatever this
 * array says. `block-limits-match-migration.test.ts` reads that list out of
 * `0009` and fails the build when the two disagree, so neither side can be
 * extended alone.
 */
export const CONTAINER_MODES = [
  "stack",
  "grid",
  "masonry",
  "carousel",
  "tabs",
  "accordion",
  "timeline",
] as const;

/** One arrangement a container may put its children in. */
export type ContainerMode = (typeof CONTAINER_MODES)[number];

/**
 * The kinds of content one leaf may hold.
 *
 * A leaf is one piece of content and renders on its own terms, so a container
 * may hold leaves of different kinds side by side — the thing the welded
 * layouts could not express, since every item in a section rendered
 * identically.
 *
 * `stat`, `quote` and `progress` **invert the title/description pair** when
 * they render: the description is the big text and the title is its label. The
 * inversion is a rendering fact rather than a schema one — the fields are named
 * the same here for every kind, so switching a block's kind to look at it and
 * switching back finds what was typed still there.
 *
 * `table` is the only kind that reads {@link LeafBlock.rows}; every other kind
 * ignores it, and stores it regardless, for that same reason.
 *
 * **A debt these kinds inherited from the `two-column` layout they replace,
 * now PAID — and one half of it deliberately reversed.** That layout was the
 * only one that hid a whole ITEM rather than one element of one, and the reason
 * is what it was: a table of label and value, rendered as a `<dl>` so that a
 * screen reader announces `dt` and `dd` as a PAIR rather than as two unrelated
 * runs of text. `stat` took ONE pair and `table` many; both live in
 * `blocks.tsx`. What each rule became:
 *
 *  * **A row whose LOCALISED value is empty still disappears entirely, label
 *    and all** — carried over unchanged. A `dt` with no `dd` is invalid markup,
 *    so half a row is not an option; and a label with nothing beside it is
 *    noise on a page strangers read. It comes back the moment its owner writes
 *    the value. The filter reads the value AFTER `contentFor` has chosen a
 *    language, so a row written in one language only appears for readers of
 *    that language — the same fallback every other kind has, made visible
 *    because here it decides a whole row. `table` applies it to each row's
 *    VALUE cells, never its first, so a blank label beside a real value is an
 *    ordinary table with a gap in it.
 *  * **The list does NOT disappear when no row survives. That rule inverts for
 *    a leaf, and the inversion is the point.** The flat layout dropped the
 *    whole `<dl>` because it carried the border and would otherwise be a
 *    bordered box with nothing in it — and because an item was one row among
 *    others, so dropping it closed the gap. **A block is not one row among
 *    others: it sits in a grid track its author deliberately placed it in**,
 *    and a leaf that rendered nothing would leave a hole nothing on the page
 *    explains. So `stat` and `table` drop the pair or the row and then fall
 *    back to the plain leaf, which shows the author's own words. Never
 *    nothing; never a bordered box with nothing in it either.
 *  * **The pairing is the point**, not the two columns — which is why `table`
 *    is a real `<table>` with `<th scope="row">` rather than a `<dl>`: eight
 *    cells is the model's cap and a description list cannot pair past two, but
 *    a row header is announced WITH each value at any width. "Two columns"
 *    named the shape of each ROW, never a grid of title-and-paragraph blocks
 *    that happened to have two per row.
 *
 * The arrangement half is a container's business now and carries none of this.
 */
export const LEAF_KINDS = [
  "text",
  "link",
  "picture",
  "player",
  "post",
  "social",
  "stat",
  "quote",
  "progress",
  "table",
] as const;

/** One kind of content a leaf may hold. */
export type LeafKind = (typeof LEAF_KINDS)[number];

/**
 * The `kind` naming a block that arranges rather than holds content.
 *
 * Compare a parsed block against this rather than the string, so the one place
 * that decides container-or-leaf is a name a renderer can import.
 */
export const CONTAINER_KIND = "container";

/**
 * Every value a block's `kind` may take.
 *
 * The container kind together with every leaf kind, in that order. It is
 * derived rather than restated so the two cannot disagree, and it is what
 * `is_block_kind()` in `0009` was copied from —
 * `block-limits-match-migration.test.ts` compares the two.
 */
export const BLOCK_KINDS = [CONTAINER_KIND, ...LEAF_KINDS] as const;

// **A `BlockKind` union was exported here and is gone.** Nothing ever wanted
// it: every consumer either discriminates on `CONTAINER_KIND` or narrows
// through `Block` itself, and `is_block_kind()` compares against the ARRAY.
// An exported type with no consumer reads as a contract somebody is meant to
// code against, which this was not — `knip` reported it and the honest answer
// was to remove it rather than to find it a home.

/**
 * How far a block may sit from the top of the page.
 *
 * Depth 0 is a section. A container at depth 2 may hold only leaves.
 *
 * **The cap is a parse-time concern, not a walk somebody has to remember to
 * run.** Every schema this module exports is rooted at a factory that threads
 * depth through the recursion, so a container at the cap meets an option that
 * refuses it by name and "too deep" is an ordinary schema refusal. A separate
 * recursive validator over user-controlled `jsonb` is the shape that exhausts
 * its own stack — which is why `validate_block` in `0009` enforces the same cap
 * with an explicit counter passed down the recursion rather than trusting this
 * one. That one is authoritative; this one exists so somebody hears about the
 * cap while building rather than after a round trip.
 *
 * Three is where independent costs bite. Beyond it, "where am I" stops being
 * answerable at a glance on a phone. And style recalculation — measured at
 * 15.6 ms on the editor's DOM, times roughly twelve under CPU throttling —
 * grows with the node count that nesting multiplies.
 */
export const MAX_DEPTH = 3;

/**
 * What a block nested past {@link MAX_DEPTH} is refused with.
 *
 * **The string is the contract, not an incidental.** Without an option that
 * fails by name, a container one level too far is refused for naming a `kind`
 * no leaf has — so the editor would tell somebody their block kind is invalid
 * and their title is missing, neither of which they got wrong. That is the
 * fault class this repo already paid for once, when a missing `nuqs` adapter
 * was reported as "we could not load your identity".
 *
 * `validate_block`'s own `raise exception` carries this same text, so the app
 * and the database say one thing about one payload.
 */
export const TOO_DEEP_MESSAGE = "too deep";

/**
 * What the database accepts, mirrored so somebody hears about a cap while
 * typing.
 *
 * **The database is authoritative and this is the copy** — which is a thing
 * worth being nervous about, because a copy that drifts either rejects what the
 * database would have taken or promises what it will refuse.
 *
 * **`block-limits-match-migration.test.ts` is what pins these to the SQL.** It
 * reads each `c_max_*` constant out of `0009` and compares it here, and it
 * asserts its own regexes matched something before comparing anything — a
 * pattern that quietly matches nothing makes every comparison after it pass
 * forever, which is the one way a drift guard fails silently.
 *
 * The byte cap is written `65_536` so it reads as the power of two it is rather
 * than as a number somebody picked. The migration states the same value in SQL,
 * where separators are not available, and the guard compares them as numbers —
 * so the two spellings cannot drift apart.
 *
 * **That guard pins the NUMBERS and not the UNITS**, and the difference is not
 * academic: this schema once measured `bytes` in UTF-16 code units while
 * `0009` measured `octet_length`, and both sides read `65_536` throughout. The
 * numbers agreed while the caps did not, by a factor of two on accented text.
 * What holds the units in step is each side naming its measure where it takes
 * it — `TextEncoder` here, `octet_length` there — so a reader comparing them
 * has something to compare.
 */
export const BLOCK_LIMITS = {
  /**
   * Blocks in one page, counted at every depth rather than at the top.
   *
   * Set so that a legal tree cannot on its own approach the node count at which
   * style recalculation was measured to cost 15.6 ms — nesting multiplies nodes
   * and every block is several of them. The byte cap below still does the heavy
   * lifting for anything carrying real writing.
   */
  blocks: 500,
  /** Children one container may hold directly. */
  children: 50,
  /**
   * Grid tracks a container may declare, and the widest span a block may take.
   *
   * One number for both, because a span is a count of its parent's tracks and a
   * vocabulary wider than the widest container could never be satisfied.
   */
  tracks: 4,
  /** Rows one `table` leaf may hold. */
  rows: 50,
  /**
   * Cells in one row of a `table` leaf.
   *
   * A table wider than this cannot be read on a phone, which is where most of
   * these pages are read.
   */
  cells: 8,
  /** Characters in any one text field. */
  text: 2000,
  /**
   * **UTF-8 bytes** in the whole serialised page, measured with `TextEncoder`.
   *
   * The measure is named because it is the one thing about these caps the two
   * sides can agree on by accident and disagree on in production. Postgres
   * measures `octet_length`, which is UTF-8 bytes; `String.length` counts UTF-16
   * code units, and the two agree only for ASCII. On a single legal leaf
   * carrying accented text in both of its long fields the difference is 4,110
   * against 8,110 — a factor of two, in the direction where this schema promises
   * a save the database then refuses, after the whole page has been written.
   *
   * Those are the figures for the leaf **as this schema parses it**, which is
   * what the cap measures, and they are ~50 larger than the same leaf as
   * written: the parse materialises `span` and `description_en`. Both pairs
   * were measured and both are true of different things, so the one quoted
   * here is the one on the side of the parse the cap actually applies to.
   * Spanish is this app's fallback language, so accented text is the ordinary
   * case rather than the edge one.
   */
  bytes: 65_536,
} as const;

/**
 * The tracks a page lays its outermost blocks across.
 *
 * A block's span is a count of its PARENT's tracks, and the page is the parent
 * of the outermost blocks — which stack down it, one to a row. Pass this to
 * {@link effectiveSpan} when rendering the top level; nothing narrows a span on
 * the way into storage.
 */
export const PAGE_TRACKS = 1;

/** Which side of the write/read split a schema is being built for. */
type Strictness = "strict" | "lenient";

/** A text field somebody writes in one language. */
const text = z.string().max(BLOCK_LIMITS.text);

/**
 * A field the author may simply not have written yet.
 *
 * Optional rather than required-but-empty, and this is the difference between a
 * person's own words and a catalogue key: next-intl fails a build for a missing
 * translation, because those are the app's own chrome. These are somebody's
 * writing about their own character, and not having written the Spanish yet is
 * an ordinary state that must never be reported as a fault.
 */
const optionalText = text.optional();

/** A count of grid tracks — a container's own, or a block's share of them. */
const trackCount = z.number().int().min(1).max(BLOCK_LIMITS.tracks);

/** Measures a serialised page the way Postgres's `octet_length` does. */
const utf8 = new TextEncoder();

/**
 * What each key of a block's style bag accepts.
 *
 * **Exported for the same reason {@link BLOCK_LIMITS} is: it is the thing the
 * migration guard compares against.** `block-limits-match-migration.test.ts`
 * used to pin the style bag to hand-typed literals — `32`, `500`,
 * `["cover","tile"]` — which caught a change to the SQL and NOT a value added
 * to the zod enum alone. That is the direction where the editor promises a
 * save the database then refuses, which is the asymmetry the byte-cap incident
 * already cost this project once. `is_block_kind` and `is_container_mode` were
 * compared against the client's own arrays from the start; the style bag was
 * the one that was not.
 *
 * {@link blockStyleShape} is built from this rather than restating it, so
 * there is one value per rule to have gotten wrong.
 */
export const BLOCK_STYLE_LIMITS = {
  /** Characters in a skin's name. Not checked against a list — see the shape. */
  skin: 32,
  /** Characters in a background picture's address. */
  background_url: 500,
  /** How a background picture is laid down. */
  background_fit: ["cover", "tile"],
  /** The minimum width a card may shrink to. */
  card_size: ["s", "m", "l"],
  /** The edge a block draws round every plain surface beneath it. */
  border: ["solid", "dashed", "dotted", "double", "none"],
} as const;

/**
 * The keys a block's own style bag may carry, shared by the strict and lenient
 * schemas built from it.
 *
 * Shared rather than restated, because adding a key to one and not the other is
 * a defect that shows up only as a page quietly missing something.
 *
 * **This bag is byte-identical to `section-schema.ts`'s, and restated rather
 * than imported** because that file is the flat model this one replaces. It
 * was expected to be deleted with the public renderer and was not: the flat
 * EDITOR still reads it, and rewriting that editor is phase 3 of the
 * blocks-and-grids design. So the duplication outlives the phase that created
 * it, and until phase 3 a change to either bag has to be made in both. The
 * compiler cannot see the two as related, so `style-bag-parity.test.ts`
 * compares them key by key and value by value; it goes when
 * `section-schema.ts` does.
 *
 * **This is where a dial goes that is not an arrangement.** An `align` key
 * taking `stretch` or `start` is the recorded example and is deliberately NOT
 * built: it is what somebody wants when they ask for prose columns, and putting it
 * here rather than in {@link CONTAINER_MODES} is what makes it available on
 * every mode instead of welded to one. See that list for the mode it replaced.
 */
const blockStyleShape = {
  skin: z.string().max(BLOCK_STYLE_LIMITS.skin).optional(),
  background_url: z.string().max(BLOCK_STYLE_LIMITS.background_url).optional(),
  background_fit: z.enum(BLOCK_STYLE_LIMITS.background_fit).optional(),
  // **Stored, and read by no renderer.** It named the minimum width a card in
  // an `auto-fill` grid could shrink to, leaving the browser to decide how
  // many fit — and a container declares an explicit track count now, so that
  // sentence cannot become true again for `grid`. The meaning survives exactly
  // in CSS multi-column's `column-width`, which is `masonry`'s to read and the
  // intended home; nothing offers the key to an author in the meantime, so
  // this is a value with no reader rather than a control that does nothing.
  // Whoever wires it must move this comment and `0009`'s column comment with
  // it.
  card_size: z.enum(BLOCK_STYLE_LIMITS.card_size).optional(),
  // **`none` is a CHOICE and absence is INHERITANCE — the two are not the same
  // state.** Absent means the block takes whatever `--skin-border-style` an
  // enclosing scope already set; `"none"` means the author explicitly turned
  // the border off here, regardless of what surrounds it. Storing `""` for
  // either would be a third state this bag refuses everywhere else in it.
  border: z.enum(BLOCK_STYLE_LIMITS.border).optional(),
};

/** One cell of a `table` leaf, in both languages. */
const tableCellShape = {
  // A blank cell is a real cell — a table with a gap in it is an ordinary
  // table — so this defaults to empty rather than being required.
  text_en: text.default(""),
  text_es: optionalText,
};

/**
 * The same object, refusing an unknown key on the write path and stripping one
 * on the read path.
 *
 * **The leniency is not about legacy data — there is none — but about deploy
 * skew.** A strict read fails the whole page the moment one block carries a key
 * the running build does not recognise, and every reader treats a failed parse
 * as "no page at all", so an owner's editor and a stranger's public page both
 * render EMPTY while a newer deployment's writes are being read by an older
 * one. Stripping the key costs nothing anybody would notice: it was never going
 * to render regardless, and everything else on the block still does.
 *
 * **This function covers KEYS and nothing else, which three documents got
 * wrong.** An unrecognised `kind` is a different mechanism entirely — a
 * discriminated union refuses an unrecognised discriminator whatever this does
 * — and it needs {@link unknownKindSchema}. An unrecognised `mode` needs
 * `containerSchema`'s own split. Do not read this paragraph as covering
 * either.
 *
 * @param schema - the object to specialise.
 * @param strictness - which side of the split to build.
 * @returns the same object with the matching unknown-key behaviour.
 */
function specialise<Shape extends z.ZodRawShape>(
  schema: z.ZodObject<Shape>,
  strictness: Strictness,
) {
  return strictness === "strict" ? schema.strict() : schema;
}

/** How one block chooses to LOOK. Form only — never colour. */
export type BlockStyle = z.infer<z.ZodObject<typeof blockStyleShape>>;

/**
 * One cell of a `table` leaf.
 *
 * Module-private: it names the element type of {@link LeafBlock.rows} and
 * nothing outside this file has ever needed to say it. A structural type does
 * not have to be exported to be usable through the exported type that holds
 * it, and exporting one with no consumer reads as a contract somebody is meant
 * to code against.
 */
type BlockTableCell = z.infer<z.ZodObject<typeof tableCellShape>>;

/**
 * One piece of content.
 *
 * Every field but `kind` is accepted whatever the kind is, and that is
 * deliberate: switching a block's kind to look at it and switching back finds
 * what was typed still there. What a kind RENDERS is a separate question, and
 * the editor offers only the fields a kind will use — a control that stores
 * what somebody types and shows nothing is the worst kind, because nothing
 * tells them it did nothing.
 *
 * `link_url` and `image_url` are not validated here beyond their length. The
 * rule that matters is enforced where they are used, by `resolveEmbed`,
 * `resolveSocial` and `safeHttpUrl`, which build an address rather than
 * trusting one.
 *
 * **`kind` is wider than {@link LeafKind}, and only a lenient READ can produce
 * the extra** — see the field's own note. The consequence for callers is that
 * `kind` is no longer a literal type, so TypeScript will not narrow this union
 * by comparing it; reach for {@link isContainer} instead of
 * `block.kind === CONTAINER_KIND`.
 */
export type LeafBlock = {
  /**
   * What kind of content this is.
   *
   * **Wider than {@link LeafKind} on purpose, and only a READ can produce
   * the extra.** The write schema and `validate_block` both refuse a kind
   * outside the vocabulary, so nothing can be stored with one; the LENIENT
   * schema admits it, because refusing it would fail the whole page while a
   * new kind is rolling out and the database is ahead of the deployment —
   * see {@link unknownKindSchema}. `LEAVES.get(kind) ?? PlainLeaf` in
   * `blocks.tsx` is what answers it, which is what that fallback was written
   * for.
   */
  kind: LeafKind | (string & {});
  span: number;
  style?: BlockStyle;
  title_en: string;
  title_es?: string;
  description_en: string;
  description_es?: string;
  icon?: string;
  image_url?: string;
  link_url?: string;
  rows?: BlockTableCell[][];
};

/**
 * A block that arranges other blocks.
 *
 * **A section is a container at depth 0 that carries a name**, which is what
 * collapses two parallel models into one: one style bag, one renderer, one
 * validator. A container deeper down may name itself too — an unnamed container
 * is a group with no heading, which is the ordinary case for one nested inside
 * another.
 *
 * `columns` is the container's own track count and `span` is its share of the
 * tracks of whatever contains IT.
 *
 * `kind` stays a literal here where {@link LeafBlock.kind} does not, which is
 * what keeps {@link isContainer} a one-sided test: there is exactly one
 * container kind and any name this build does not know is a leaf's problem.
 */
export type ContainerBlock = {
  kind: typeof CONTAINER_KIND;
  /**
   * How it arranges its children.
   *
   * Wider than {@link ContainerMode} for the same reason {@link LeafBlock.kind}
   * is wider than {@link LeafKind}: only the lenient read can produce a name
   * this build does not know, and `MODES.get(mode) ?? Stack` answers it.
   */
  mode: ContainerMode | (string & {});
  columns: number;
  span: number;
  style?: BlockStyle;
  name_en?: string;
  name_es?: string;
  children: Block[];
};

/** One block of a page: either an arrangement or a piece of content. */
export type Block = ContainerBlock | LeafBlock;

/**
 * Whether a block arranges other blocks.
 *
 * **A predicate rather than `block.kind === CONTAINER_KIND` at each call site,
 * and the reason is a type rather than a preference.** A leaf's `kind` is
 * deliberately wider than {@link LeafKind} — the lenient read admits a name
 * this build does not know, see {@link unknownKindSchema} — and TypeScript
 * narrows a union by a discriminant only while that property is a literal in
 * every member. It is not, so the bare comparison stopped narrowing anything.
 * This says the model's own rule once, where it can be read.
 *
 * @param block - the block to test.
 * @returns true when it is a container.
 */
export function isContainer(block: Block): block is ContainerBlock {
  return block.kind === CONTAINER_KIND;
}

/**
 * How wide a block actually renders inside a container.
 *
 * **A span is narrowed here, at render, and never on the way into storage.**
 * The ruling is that a page must never become unsavable — a block dragged into
 * a narrower container would otherwise be refused, and somebody would lose a
 * whole page to a value they cannot see. Rewriting the stored span would have
 * satisfied that too, and it is the wrong half: it destroys what was typed, so
 * dragging the block back out could not restore it. That contradicts this
 * model's own rule that switching something and switching back finds what was
 * typed still there, and it matches how `card_size` is handled — gate the
 * field, never the value.
 *
 * Pass {@link PAGE_TRACKS} for a block at the top of a page, which has no
 * parent container.
 *
 * @param span - the span the author chose, as parsed.
 * @param tracks - the track count of whatever contains the block.
 * @returns the span to lay out with, never wider than the container.
 */
export function effectiveSpan(span: number, tracks: number): number {
  return Math.min(span, tracks);
}

/**
 * The rows of a `table` leaf.
 *
 * @param strictness - which side of the write/read split to build.
 * @returns the rows schema.
 */
function tableRowsSchema(strictness: Strictness) {
  const cell = specialise(z.object(tableCellShape), strictness);
  return z.array(z.array(cell).max(BLOCK_LIMITS.cells)).max(BLOCK_LIMITS.rows);
}

/**
 * Everything a leaf carries apart from its `kind`.
 *
 * Factored out so {@link unknownKindSchema} can build the same leaf around a
 * kind this build does not recognise, rather than restating twelve fields that
 * would then be free to drift.
 *
 * @param strictness - which side of the write/read split to build.
 * @returns the shape.
 */
function leafShape(strictness: Strictness) {
  return {
    span: trackCount.default(1),
    style: specialise(z.object(blockStyleShape), strictness).optional(),
    // **A title is required on the WRITE and merely expected on the READ,
    // and that split is a fix rather than an inconsistency.** A leaf is a
    // heading with something under it: without the heading there is a blank
    // box and nothing to render, while without the description there is a
    // perfectly good card — which is exactly what a template hands somebody
    // to fill in. So the editor is refused an empty title.
    //
    // But `min(1)` on the read path made one leaf's empty title fail the
    // WHOLE page: `parseBlocks` answers `[]` for a failed parse, so a
    // stranger got "nothing here yet" over a page full of content. That is
    // precisely the blast radius {@link specialise} exists to prevent, and
    // the leniency had only ever been extended to unknown keys. `0009`
    // type-checks `title_en` and now refuses a zero-length one too, so the
    // write is where the rule is enforced; here it is a floor that must
    // never take a page down with it. Every renderer already handles an
    // empty title — `PlainLeaf` shows the description alone, `EmbedFrame`
    // falls back to the provider's own id, and a lifted label falls back to
    // the child's position.
    title_en: strictness === "strict" ? text.min(1) : text,
    title_es: optionalText,
    description_en: text.default(""),
    description_es: optionalText,
    icon: optionalText,
    image_url: optionalText,
    link_url: optionalText,
    rows: tableRowsSchema(strictness).optional(),
  };
}

/**
 * One leaf, at any depth.
 *
 * @param strictness - which side of the write/read split to build.
 * @returns the leaf schema.
 */
function leafSchema(strictness: Strictness) {
  return specialise(
    z.object({ kind: z.enum(LEAF_KINDS), ...leafShape(strictness) }),
    strictness,
  );
}

/**
 * One container, holding blocks one level deeper than itself.
 *
 * @param depth - how far this container sits from the top of the page.
 * @param strictness - which side of the write/read split to build.
 * @returns the container schema.
 */
function containerSchema(depth: number, strictness: Strictness) {
  return specialise(
    z.object({
      kind: z.literal(CONTAINER_KIND),
      // **Read leniently, written strictly.** A mode this build does not know
      // is one a newer deployment writes; refusing it here would blank the
      // whole page rather than costing that container its arrangement, and
      // `MODES.get(mode) ?? Stack` already stacks it. Capped rather than
      // unbounded because it is still stored text; `0009` refuses anything
      // outside `is_container_mode()`, so only deploy skew produces one.
      mode:
        strictness === "strict" ? z.enum(CONTAINER_MODES) : z.string().max(32),
      columns: trackCount.default(1),
      span: trackCount.default(1),
      style: specialise(z.object(blockStyleShape), strictness).optional(),
      name_en: optionalText,
      name_es: optionalText,
      children: z
        .array(blockSchemaAt(depth + 1, strictness))
        .max(BLOCK_LIMITS.children)
        .default([]),
    }),
    strictness,
  );
}

/**
 * The option a container meets once it is past the cap: it matches on `kind`
 * and then always fails, carrying {@link TOO_DEEP_MESSAGE}.
 *
 * It is deliberately **not** specialised by strictness. Every other key is
 * stripped rather than refused, so the shape itself always parses and the depth
 * refusal is the only issue reported — which is the whole point of having this
 * option rather than letting the leaf schema refuse a container for the wrong
 * reason.
 *
 * @returns the always-failing container option.
 */
function tooDeepSchema() {
  return z
    .object({ kind: z.literal(CONTAINER_KIND) })
    .pipe(z.never({ error: TOO_DEEP_MESSAGE }));
}

/**
 * The lenient read's answer to a `kind` this build does not know.
 *
 * **This is what the deploy-skew argument actually needs, and until it existed
 * the argument was false.** `blockSchemaAt` builds a discriminated union, and a
 * discriminated union refuses an unrecognised discriminator outright — so one
 * block carrying a kind from a newer deployment failed the WHOLE array,
 * `parseBlocks` answered `[]`, and a stranger got "nothing here yet" over a
 * page full of content. That is precisely the outcome {@link specialise}'s
 * leniency was written to prevent, and the leniency only ever covered unknown
 * KEYS. Three documents said otherwise for the length of a branch.
 *
 * **It refuses every kind the vocabulary DOES name**, which is what keeps every
 * other guarantee intact. A too-deep container still meets
 * {@link tooDeepSchema} and fails, rather than falling through here and being
 * admitted as a leaf; a malformed `table` is still refused as a `table` rather
 * than quietly becoming something else. The only thing this admits is a name
 * nothing in this build has an opinion about.
 *
 * What it produces is a leaf: the block's own words, its span and its style,
 * with `children` and anything else stripped. `LEAVES.get(kind) ?? PlainLeaf`
 * renders it as a plain card, so somebody's writing is on the page rather than
 * missing from it — and a subtree the depth counter never walked cannot arrive
 * with it.
 *
 * @returns the fallback option, for the lenient build only.
 */
function unknownKindSchema() {
  return z.object({
    ...leafShape("lenient"),
    kind: z
      .string()
      .max(BLOCK_LIMITS.text)
      .refine((kind) => !(BLOCK_KINDS as readonly string[]).includes(kind), {
        error: "a kind this build already knows",
      }),
  });
}

/**
 * The schema for a block sitting at the given depth.
 *
 * Below the cap a block is a container or a leaf. At the cap the container
 * option is replaced by {@link tooDeepSchema}, so nesting one level too far is
 * refused by name rather than by whatever the leaf schema happens to say about
 * a container — and the guard is something a caller cannot forget to run.
 *
 * **The recursion terminates on depth rather than on `z.lazy()`.** Threading
 * depth through the factory bounds the cycle, so the whole tree of schemas is
 * built eagerly and nothing is deferred; the explicit return type is still
 * required, because TypeScript cannot infer the return type of a function that
 * calls itself. The cost stays linear only while a level has a single container
 * variant to build — another one, or a much larger cap, is when `z.lazy()`
 * would start to earn its place.
 *
 * @param depth - how far the block sits from the top of the page.
 * @param strictness - which side of the write/read split to build.
 * @returns the block schema for that depth.
 */
function blockSchemaAt(
  depth: number,
  strictness: Strictness,
): z.ZodType<Block, unknown> {
  const leaf = leafSchema(strictness);
  const known =
    depth >= MAX_DEPTH
      ? z.discriminatedUnion("kind", [tooDeepSchema(), leaf])
      : z.discriminatedUnion("kind", [
          containerSchema(depth, strictness),
          leaf,
        ]);
  // The strict build has no fallback: an unknown kind is a typo the editor must
  // report, and a save is the one moment somebody can still fix it. Only the
  // READ tolerates one — see {@link unknownKindSchema}.
  return strictness === "strict"
    ? known
    : (z.union([known, unknownKindSchema()]) as z.ZodType<Block, unknown>);
}

/**
 * One block as the EDITOR validates it before saving, with everything beneath
 * it.
 *
 * **Strict on every unknown key, block and style alike** — a typo the author
 * just typed is refused rather than silently dropped. Use
 * {@link lenientBlockSchema} instead when parsing what is already stored; the
 * two differ on purpose, see {@link specialise}.
 *
 * What it does not do matters once the editor exists. Nothing narrows its span,
 * because there is no parent here to narrow it against — see
 * {@link effectiveSpan}. And **it measures depth from whatever it is handed**:
 * validating a subtree with it permits {@link MAX_DEPTH} further
 * levels beneath that subtree, so an editor checking a dragged branch in
 * isolation can accept a tree the save then refuses. Nothing over-deep can
 * persist, because a page saves through {@link blocksSchema}, which re-parses
 * from the top.
 */
export const blockSchema = blockSchemaAt(0, "strict");

/** One block as it is READ back from storage. Lenient — see {@link specialise}. */
export const lenientBlockSchema = blockSchemaAt(0, "lenient");

/**
 * How many blocks a page holds, counting every depth.
 *
 * @param blocks - the parsed blocks to count.
 * @returns the total, containers included.
 */
function countBlocks(blocks: readonly Block[]): number {
  return blocks.reduce(
    (total, block) =>
      total + 1 + (isContainer(block) ? countBlocks(block.children) : 0),
    0,
  );
}

/**
 * The page-level rules shared by the write and read schemas — a total-block cap
 * and a serialised byte cap, applied identically whichever block shape is
 * inside.
 *
 * Factored out so the byte cap — the backstop that catches a payload legal in
 * every individual field and ruinous in total — is written once rather than
 * kept in step by hand across both callers. It takes the block schema as a
 * parameter rather than rebuilding one, so both page schemas inherit the depth
 * bound instead of re-deriving it.
 *
 * @param block - the block shape to validate: {@link blockSchema} for
 *   {@link blocksSchema}, {@link lenientBlockSchema} for
 *   {@link lenientBlocksSchema}.
 * @returns the page schema.
 */
function pageSchema(
  block: z.ZodType<Block, unknown>,
): z.ZodType<Block[], unknown> {
  return z
    .array(block)
    .refine((blocks) => countBlocks(blocks) <= BLOCK_LIMITS.blocks, {
      error: "too many blocks",
    })
    .refine(
      (blocks) =>
        utf8.encode(JSON.stringify(blocks)).length <= BLOCK_LIMITS.bytes,
      { error: "blocks are too large" },
    );
}

/**
 * Everything a page is made of, as the EDITOR validates it before saving.
 *
 * Strict throughout — see {@link blockSchema}.
 *
 * **The byte cap is measured on the PARSED value, so the parse result is what
 * must be persisted.** Defaults are materialised on the way through —
 * `span`, `columns`, `children`, `description_en`, `text_en` — which on a
 * minimal container holding one text leaf grows 80 bytes into 130. Storing the
 * raw payload instead would let a page saved just under the cap read back over
 * it, and {@link lenientBlocksSchema} would then refuse the whole thing: a
 * blank page, which is the exact outcome the leniency exists to prevent.
 */
export const blocksSchema = pageSchema(blockSchema);

/**
 * Everything a page is made of, as it is READ back from storage.
 *
 * Lenient on an unknown key where {@link blocksSchema} is strict, which is a
 * deliberate ruling rather than an oversight — see {@link specialise} for the
 * deploy-skew argument it rests on.
 */
export const lenientBlocksSchema = pageSchema(lenientBlockSchema);
