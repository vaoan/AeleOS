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
 * how many places a container offers is already a PARAMETER of every one of
 * these — see {@link ContainerBlock.spaces} — so a second mode for it would be
 * the welded cross-product this model exists to undo. Prose columns,
 * if they are ever wanted, are `align: "stretch" | "start"` in
 * {@link blockStyleShape} — a dial that composes with every mode rather than
 * being available on one.
 *
 * **The database holds this same list, in `is_container_mode()`, and is
 * authoritative over it** — a mode it does not know is refused whatever this
 * array says. `block-limits-match-migration.test.ts` reads that list out of
 * `0009` and fails the build when the two disagree, so neither side can be
 * extended alone.
 *
 * **`list` is the newest and is not `stack` with a rule bolted on.** A gap
 * between rows says "separate things" and a rule says "one sequence"; the two
 * are different arrangements, which is why this is a mode rather than a dial.
 * It decides nothing about whether its children are cards — a feed is `list`
 * plus `chrome: "bare"`, and welding them would repeat the `gallery`/`links`
 * mistake of an arrangement that also fixes its content's form.
 */
export const CONTAINER_MODES = [
  "stack",
  "list",
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
 * `table`, `player` and `jukebox` are the only kinds that read
 * {@link LeafBlock.rows} — `table` as its own paired cells, `player` and
 * `jukebox` as a playlist, one row per track holding the address, then a
 * title, then who made it (`playlistFromRows`, `domain/playlist.ts`). Every
 * other kind ignores the field and stores it regardless, for that same
 * reason.
 *
 * **This sentence used to say `table` was the ONLY reader, and that was
 * false — found 2026-08-28, reviewing the page-source reference this file is
 * quoted by.** `leaf-fields.ts`'s `RETRO` entry, shared by `player` and
 * `jukebox`, has carried `rows: true` since the two of them existed; this
 * comment simply never matched it, and `page-reference.ts` copied the false
 * claim verbatim, which is exactly the failure the page-source-and-sharing
 * spec's "never generate the reference from this TSDoc" rule exists to
 * prevent — the TSDoc was not merely differently toned, it was wrong.
 * `page-reference.ts`'s `ROWS_MEANINGS` is gated against `leafFields` now,
 * rather than asserted by hand a second time.
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
 *
 * **Three kinds changed here on 2026-08-19 and one of them changed MEANING**,
 * which is the thing to know before reading anything older. `post` became
 * `embed` and absorbed what `player` used to be — they were one leaf under two
 * names, with byte-identical `LEAF_FIELDS` entries and one renderer. `player`
 * now means a retro media player of ours, and `jukebox` one without a video
 * pane. A document describing `player` as a frame around somebody else's page
 * predates that.
 *
 * **Five kinds added 2026-08-19 are a new CATEGORY, not five more entries.**
 * `avatar`, `handle`, `name`, `owner` and `fursonas` draw the ACTOR's own
 * content, resolved by the renderer from `PageContext`, where every kind above
 * draws what its author typed into the block. They still carry a title,
 * because every leaf must — `title_en` is required and non-empty at the write
 * and again in `validate_block` — and each uses it rather than leaving it
 * dead: see `LEAF_FIELDS`.
 */
export const LEAF_KINDS = [
  "text",
  "link",
  "picture",
  // **`player` no longer means an embed.** It is a retro media player with a
  // video pane, and `jukebox` is one without; `post` absorbed every embed the
  // two of them used to split. The name was taken back deliberately rather
  // than left to mean two things — see the actors feature note.
  "player",
  "jukebox",
  // **`embed` is what `post` was renamed to**, and the rename is the point:
  // it holds YouTube, Spotify, Tidal and Twitch as well as Instagram and
  // Mastodon, so "post" described a third of what it does. One kind, any
  // provider the table recognises.
  "embed",
  "social",
  "stat",
  "quote",
  "progress",
  "table",
  // **The identity leaves, whose content comes from the ACTOR ROW rather than
  // from fields somebody typed.** They are the first kinds here for which
  // `LEAF_FIELDS` names no content field at all: a renderer resolves them from
  // `PageContext`. `owner` and `fursonas` are the two exceptions and read their
  // `title` — the heading over somebody's characters is that person's own
  // words, not a catalogue string, and so is never reported as a missing
  // translation.
  //
  // Which of them a page must CARRY is not this list's business and depends on
  // the actor's kind: `owner` is required on a fursona's page and refused on a
  // person's, `fursonas` the reverse. See `domain/required-blocks.ts`.
  "avatar",
  "handle",
  "name",
  "owner",
  "fursonas",
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
 * **It compares the two SETS of names, not only the values**, which is what
 * makes renaming or removing a cap a change to both sides: `tracks` became
 * `spaces` here and `c_max_tracks` became `c_max_spaces` there, and doing
 * either half alone fails the build.
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
 *
 * **Adding a member is the same obligation as renaming one, not a lesser
 * case.** A cap declared here with no `c_max_` counterpart yet in `0009` is
 * refused by the guard by name, which is deliberate: it is what keeps a
 * client-only cap from ever being mistaken for one the database also
 * enforces.
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
  /**
   * Places ACROSS a container may declare — the authoring vocabulary somebody
   * picks a shape from.
   *
   * **It is how many across, never how many in total.** A three-space section
   * is three across and grows DOWNWARD into more rows as things are added,
   * which is the half of "it keeps extending down and so on" that a total
   * would throw away: a fifty-picture gallery is a three-space section with
   * seventeen rows, not a section nobody can build.
   *
   * So {@link BLOCK_LIMITS.children} caps the content separately and the two
   * are not one number. They were briefly written as one, on the reading that
   * a container holds exactly one thing per space — which is true of a ROW and
   * false of a section.
   */
  spaces: 6,
  /**
   * The largest share one place may take of its container's width.
   *
   * **The same ceiling as {@link BLOCK_LIMITS.spaces} and not by coincidence**
   * — both are "how lopsided may one container be", counted from opposite
   * ends. It bounds the worst ratio anybody can build at 1:6, which is what
   * keeps a slider from producing a sliver on a stranger's screen; the track
   * floor in `block-tracks.ts` then makes even that ratio readable.
   */
  weight: 6,
  /**
   * Children one container may hold, counted across every one of its rows.
   *
   * Unrelated to {@link BLOCK_LIMITS.spaces}, which is a width. This is what
   * bounds the array, and it is the cap the flat model's item list already
   * had — so every page that exists converts.
   */
  children: 50,
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
   * carrying accented text in both of its long fields the difference is 4,049
   * against 8,049 — a factor of two, in the direction where this schema promises
   * a save the database then refuses, after the whole page has been written.
   *
   * Those figures are the same whether the leaf is measured as written or **as
   * this schema parses it**, which is what the cap measures. They were not
   * always: the parse used to materialise a `span` on every leaf and the two
   * sides differed by about fifty bytes. Nothing on a fully written leaf is
   * materialised now, so there is one number rather than a pair to quote the
   * wrong half of. Spanish is this app's fallback language, so accented text is
   * the ordinary case rather than the edge one.
   */
  bytes: 65_536,
} as const;

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

/**
 * How many places across a container lays out.
 *
 * **The upper bound is on the WRITE only, and the asymmetry is the same
 * deploy-skew argument `mode` and `kind` already rest on.** A `spaces` this
 * build thinks is too large is one a newer deployment wrote after the cap was
 * raised — the ledger plans for exactly that — and refusing it here fails the
 * container, then the union, then the array, then the whole page: `null` to
 * its owner, whose editor opens empty and whose every save is then refused,
 * and `[]` to every stranger. That is precisely the blast radius
 * {@link specialise} and {@link unknownKindSchema} exist to prevent, and
 * `spaces` was the one number that had not been given the same treatment.
 *
 * The renderer already answers a count it does not know with a single place
 * (`SPACE_CLASS.get(n) ?? ""`), which was a branch nothing on the read path
 * could reach until this.
 *
 * **The lower bound stays on both sides**, because no deployment can have
 * written a zero or a fraction: both schemas and `is_space_count` in `0009`
 * refuse one, so a value below the floor is corruption rather than skew and
 * failing loudly is the honest answer.
 *
 * @param strictness - which side of the write/read split to build.
 * @returns the space count schema.
 */
function spaceCount(strictness: Strictness) {
  const count = z.number().int().min(1);
  return strictness === "strict" ? count.max(BLOCK_LIMITS.spaces) : count;
}

/**
 * What a container's weight list accepts, by which side of the split is being
 * built.
 *
 * **The lenient side never fails.** A weight list is the one key here that a
 * hand-written or skewed payload can make any shape at all, and a container
 * that refuses to parse costs the whole page — `null` to its owner and `[]` to
 * a stranger — over a value that was only ever going to cost a container its
 * proportions. So the lenient build `.catch`es everything to `undefined`,
 * which every reader already treats as "lay uniform tracks".
 *
 * The strict build bounds each share and the list's length; the cross-field
 * check that the length is the container's own `spaces` cannot live here,
 * because a field schema cannot see its siblings — see {@link containerSchema}.
 *
 * @param strictness - which side of the write/read split to build.
 * @returns the weight list schema.
 */
function weightList(strictness: Strictness) {
  const weight = z.number().int().min(1);
  if (strictness !== "strict") {
    // eslint-disable-next-line unicorn/no-useless-undefined -- zod's `.catch()` has no zero-argument form; the default IS `undefined`, not incidental to it.
    return z.array(weight).optional().catch(undefined);
  }
  return z
    .array(weight.max(BLOCK_LIMITS.weight))
    .max(BLOCK_LIMITS.spaces)
    .optional();
}

/**
 * What a container whose weight list is not as long as its places is refused
 * with.
 *
 * **It names the key**, for the reason the depth cap does: a mismatch reported
 * as anything else tells somebody a field they got right is wrong. The same
 * string is what `0009` raises, so the app and the database say one thing
 * about one payload.
 */
export const WEIGHTS_LENGTH_MESSAGE = "weights must have one share per space";

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
 *
 * The style bag carries `chrome`, `heading`, `text_align`, `image_fit` and
 * `radius` now, each an OPTION whose absence is inheritance. That word is
 * load-bearing for the last two in particular: `image_fit` absent emits
 * nothing at all rather than `cover`, because emitting the default would have
 * every unstyled block overwrite an enclosing section's `contain`; and
 * `radius` absent leaves whatever multiplier the skin chose, which is what
 * lets a corner and an aesthetic be picked separately.
 *
 * `heading_pad` joins them, and it is the one key here READ ONLY IN ONE PLACE:
 * a name drawn as a bar. A plain name has the page's own spacing around it and
 * no edge to be pressed against, so padding it would move text with nothing
 * behind it.
 *
 * `heading` gained a fourth value, `soft`, rather than a key of its own: it is
 * the same question — how is this name drawn — answered differently, and a
 * second key would be a second thing to keep in step with the renderer's own
 * table of what counts as a bar.
 *
 * `heading_image`, `heading_fit` and `heading_gap` are keys of their own,
 * because none of them is that question: two are a picture and how it lies,
 * and the third is the room UNDER the name rather than how the name is drawn.
 * The first two are read only where a bar exists; the third wherever a name
 * does.
 */
/**
 * The four corners a block may round, in CSS's own order.
 *
 * Exported so the editor can draw one control per corner without restating
 * them, and so the renderer's map cannot fall out of step with the schema.
 */
export const CORNERS = ["tl", "tr", "br", "bl"] as const;

/**
 * What a `corners` value has to look like: one or more corner names, comma
 * separated, with nothing else.
 *
 * **A repeat is accepted rather than refused.** `tl,tl` names the same corner
 * twice, which is not a mistake anybody can see and not a shape that breaks
 * anything downstream — the renderer asks whether a corner is in the list.
 * Refusing it would be a rule with no injury behind it.
 */
const CORNER_LIST = /^(tl|tr|br|bl)(,(tl|tr|br|bl))*$/;

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
  /**
   * Whether a block's content sits in a card or on the page itself.
   *
   * **`bare` is what every borderless feed needs and nothing could reach.**
   * Measured against real captures: a modern microblog is edge-to-edge rows
   * with a hairline between them, and `border: "none"` could not get there —
   * it removes the border STYLE and leaves the fill, the shadow and the
   * padding, so a leaf was always a card. See
   * `docs/superpowers/specs/2026-08-27-pastiche-findings.md`.
   */
  chrome: ["card", "bare"],
  /**
   * How a named container draws its own name.
   *
   * **`bar` is the dominant idiom of the mid-2000s social web** — a solid
   * coloured strip with the content squared off directly beneath it, as
   * MySpace and hi5 both used for every box on a profile. `plain` is the
   * heading floating above the content, which is what every page had before
   * this key and remains the default.
   *
   * **`soft` is the same strip in a QUIETER tone**, and it exists because real
   * designs stack two: Facebook's navy bar over a lighter blue one is the case
   * that asked for it, and one accent could only ever draw one strip. The tone
   * is DERIVED from the accent rather than picked — see `--accent-soft` — so
   * there is no second palette to keep in step, and its label is solved the
   * same way the accent's is.
   */
  heading: ["plain", "bar", "gradient", "soft"],
  /** Which edge a block's own text is set against. */
  text_align: ["start", "center", "end"],
  /**
   * How a picture fills the box it is given.
   *
   * **`cover` crops and `contain` does not, and the default has to stay
   * `cover`.** A portrait in a round avatar wants its edges taken off; a WIDE
   * image does not, and giving the pastiches their real logos is what found
   * this — a 94x45 wordmark came through a circular avatar as two meaningless
   * fragments. Absent is `cover`, which is what every page had before this key.
   */
  image_fit: ["cover", "contain"],
  /**
   * How round this block's corners are, independent of its skin.
   *
   * **The corner was welded to the whole aesthetic and this is the same
   * complaint `border` answered.** Square corners were reachable — five skins
   * set `--skin-round: 0` — but only by taking that skin's texture, shadow and
   * edge with them, and a 2003 page is square corners on an ordinary surface.
   * Absent inherits, so every existing page keeps exactly the corner its skin
   * chose.
   */
  radius: ["square", "soft", "round"],
  /**
   * How much room a NAMED block's own name is given.
   *
   * **Read only where the name is drawn as a bar**, which is where the
   * complaint came from: a solid strip at `px-3 py-2` puts small text hard
   * against a coloured edge, and with `spacing: "compact"` shrinking the type
   * as well, the bar reads as crowded. A plain floating name has the page's
   * own spacing around it already and nothing to be crowded by.
   *
   * Absent is exactly what every barred page had, so this changes nothing
   * anybody has stored.
   */
  heading_pad: ["snug", "roomy"],
  /**
   * Characters in the address of a picture painted ON a named block's bar.
   *
   * **The bar is a design surface now, not only a colour.** A title strip
   * carrying a photograph is most of what makes a page of this era look like
   * itself, and until this key the bar could be the accent, a sheen or the
   * soft tone and nothing else. Same cap as `background_url`, and it goes
   * through the same `backgroundImageValue` guard, because it lands in the
   * same kind of sink.
   *
   * It is INDEPENDENT of `background_url`: a section may carry one picture
   * behind its content and a different one on its bar. Reusing the section's
   * would have made the bar show whatever slice of it happened to fall there,
   * which is not "fill the strip".
   */
  heading_image: 500,
  /**
   * How that picture is laid down — the same vocabulary `background_fit` uses.
   *
   * One vocabulary rather than two, because it is the same question about the
   * same kind of value, and two lists would be two things to keep in step.
   */
  heading_fit: ["cover", "tile"],
  /**
   * The room between a named block's name and the content under it.
   *
   * **Absent is the behaviour every page already had, which is not one
   * value.** A bar welds to its content — a strip with a gap under it is a
   * floating label with a background — and a plain name floats with the page's
   * own spacing. So absence means "whichever of those applies", and this key
   * is the way to say something else: a barred section that wants air, or a
   * plain name pulled tight against what it names.
   */
  heading_gap: ["none", "snug", "roomy"],
  /**
   * Which of a block's own corners are rounded, as a comma-separated list of
   * `tl`, `tr`, `br` and `bl`.
   *
   * **`radius` says how MUCH and this says WHERE**, which is what makes the
   * two compose instead of competing: `radius: "soft"` with `corners: "tl,tr"`
   * is a panel rounded across the top and square along its foot — the window
   * shape Luna has and this model could not draw, recorded as an open gap
   * since the era looks were built.
   *
   * **Absent means every corner**, so a page that never sets it emits nothing
   * and is byte-for-byte what it was. There is no way to spell "no corners"
   * here and none is needed: `radius: "square"` already says that, and a
   * second spelling for one answer is a thing to keep in step.
   *
   * A string rather than an array because the style bag is validated by
   * walking `jsonb_each_text`, which hands every value over as text; an array
   * would need a shape that loop does not have, for a value four tokens long.
   */
  corners: 14,
  /** The same, for a named block's own bar. */
  heading_corners: 14,
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
  // **Absent is INHERITANCE and `card` is a CHOICE**, the same two states
  // `border` distinguishes one line above, for the same reason: a block inside
  // a `bare` section has to be able to ask for its card back.
  chrome: z.enum(BLOCK_STYLE_LIMITS.chrome).optional(),
  // **Read by a NAMED container and meaningless anywhere else**, which is the
  // shape `name_en` already has. It is stored at any depth for the reason
  // `bleed` is: a key that means nothing where it sits costs nothing, and
  // refusing it would make moving a block fail on a style it legitimately
  // carried a moment earlier.
  heading: z.enum(BLOCK_STYLE_LIMITS.heading).optional(),
  // Inherited by every plain surface beneath the block, like `border`.
  text_align: z.enum(BLOCK_STYLE_LIMITS.text_align).optional(),
  // Read by the kinds that draw a picture; absent is `cover`, the crop every
  // page had before this existed.
  image_fit: z.enum(BLOCK_STYLE_LIMITS.image_fit).optional(),
  // Overrides the skin's own corner; absent keeps it.
  radius: z.enum(BLOCK_STYLE_LIMITS.radius).optional(),
  // Read only where `heading` draws a bar; absent is today's `px-3 py-2`.
  heading_pad: z.enum(BLOCK_STYLE_LIMITS.heading_pad).optional(),
  // Read only where `heading` draws a bar, like `heading_pad`.
  heading_image: z.string().max(BLOCK_STYLE_LIMITS.heading_image).optional(),
  heading_fit: z.enum(BLOCK_STYLE_LIMITS.heading_fit).optional(),
  // Read wherever a name is drawn, barred or not.
  heading_gap: z.enum(BLOCK_STYLE_LIMITS.heading_gap).optional(),
  // `tl,tr,br,bl` at its longest is 11 characters; the cap is the SQL's own.
  corners: z
    .string()
    .max(BLOCK_STYLE_LIMITS.corners)
    .regex(CORNER_LIST)
    .optional(),
  heading_corners: z
    .string()
    .max(BLOCK_STYLE_LIMITS.heading_corners)
    .regex(CORNER_LIST)
    .optional(),
  // **A depth-0 key, and meaningless anywhere else.** A section reaches both
  // edges of the window; a block nested inside one has a section between it
  // and the page and cannot escape that. Absent means the page's own measure,
  // which is what every section had before this existed.
  //
  // `name_en` and `name_es` are already section-only in exactly this way, so
  // this is the bag's existing shape rather than a new kind of key.
  bleed: z.boolean().optional(),
  // **Meaningful at depth 0 only, and its polarity is the opposite of
  // `bleed`'s.** Absent — or `true` — keeps the page's ordinary chrome around
  // the section: the side gutter, the gap to its neighbour, and the space
  // under the bar or above the floor when it is first or last. `false` is the
  // explicit choice to remove all of it, which is what makes a first section a
  // banner and a last one a footer.
  //
  // Absence is therefore the STATE EVERY EXISTING PAGE IS IN, so the writer
  // never sends `true`: storing it on every page would look like a choice
  // nobody made. `true` is accepted anyway because it says the same thing, and
  // refusing it would make the two spellings of one answer disagree.
  //
  // Independent of `bleed`, which decides WIDTH. Stored at any depth for the
  // same reason `bleed` is — moving a section into another one must not fail
  // on a style it carried legitimately a moment earlier.
  margins: z.boolean().optional(),
};

/** One cell of a `table` leaf, in both languages. */
const tableCellShape = {
  // A blank cell is a real cell — a table with a gap in it is an ordinary
  // table — so this defaults to empty rather than being required.
  text_en: text.default(""),
  text_es: optionalText,
  /**
   * A mark drawn beside the row, read from the row's FIRST cell only.
   *
   * A contact box from 2004 has a small icon on every line, and the row header
   * is where it belongs — one icon per row rather than one per cell, which
   * would put a mark in the middle of a value. It is stored on every cell
   * because a cell is one shape, and read on the first: the alternative is a
   * second cell type that differs by position, which the row builder would
   * then have to keep in step with the markup.
   *
   * Absent draws nothing, which is what every stored table has.
   */
  icon: optionalText,
};

/**
 * The same array, capped on the write path and unbounded on the read one.
 *
 * See {@link spaceCount} for the argument, which is the same one every time:
 * a bound this build would refuse is a bound a newer deployment may have
 * raised, and refusing on the READ costs the whole page rather than the one
 * thing that is out of range.
 *
 * @param schema - the array to specialise.
 * @param strictness - which side of the split to build.
 * @param max - the cap the write path applies.
 * @returns the same array with the matching bound.
 */
function specialiseArray<Item extends z.ZodType>(
  schema: z.ZodArray<Item>,
  strictness: Strictness,
  max: number,
) {
  return strictness === "strict" ? schema.max(max) : schema;
}

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
 * **A leaf carries no arrangement of its own.** It had a `span` — its share of
 * its parent's tracks — and a container declares its spaces now, one thing to
 * each, so where a leaf sits is entirely its parent's business and its width
 * is not a property of the leaf at all.
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
 * **A container is its SPACES**, and `columns`/`span` are what that replaced.
 * A track count with children flowing into it could not say that the middle
 * place was empty, so the shape an author chose disappeared the moment their
 * content did not fill it.
 *
 * **`spaces` is a width and `children` is the content**, and the two are not
 * tied together. Children fill the places row by row and the section grows
 * downward, which is what makes a section of fifty pictures three across and
 * seventeen rows deep rather than a shape nobody can build.
 *
 * `kind` stays a literal here where {@link LeafBlock.kind} does not, which is
 * what keeps {@link isContainer} a one-sided test: there is exactly one
 * container kind and any name this build does not know is a leaf's problem.
 *
 * **A place may also carry a WEIGHT**, deciding how much of the container's
 * width it takes relative to its siblings — see {@link ContainerBlock.weights}.
 * That is a dimension `spaces` and `children` do not touch: how many places
 * and what fills them stay exactly as wide apart from this as they were
 * before it existed.
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
  /**
   * How many places ACROSS it lays out. Rows continue downward beneath them.
   *
   * A width, not a total: `children` may be longer than this and usually is,
   * and the last row may be part-filled, which is the ordinary state rather
   * than a fault.
   */
  spaces: number;
  /**
   * One share per place, deciding how wide each is relative to its siblings.
   *
   * **Absent means uniform**, which is what every page stored before this
   * existed means, and the renderer reaches that case through a CSS fallback
   * rather than a branch — so an unweighted page emits exactly the CSS it
   * always did.
   *
   * A width is the PARENT's business: a block dragged from a wide place into
   * a narrow one becomes narrow, because the width was never the block's. That
   * is what keeps a drop an exchange of two places, which a per-child span
   * could not.
   *
   * **A list whose length is not {@link ContainerBlock.spaces} is ignored, not
   * honoured in part.** The strict write refuses one by name; the lenient read
   * admits it and `trackListFor` resolves it to uniform.
   */
  weights?: number[];
  style?: BlockStyle;
  name_en?: string;
  name_es?: string;
  /**
   * What is in each place, in order, filling row by row.
   *
   * **`null` is an empty place and is not the same as a shorter list.** A
   * place is POSITIONAL: an empty one keeps its width on the page and is where
   * the editor offers to put the next thing, so `[a, null, b]` has to mean
   * that `b` is third — which a shorter array cannot say. Nothing may collapse
   * or strip these; the position is the whole model.
   *
   * A trailing `null` is legal and means nothing in particular, so it is kept
   * rather than trimmed: somebody is usually about to fill it, and trimming
   * would move every entry that came after the next one they add.
   */
  children: (Block | null)[];
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
 * kind this build does not recognise, rather than restating every field that
 * would then be free to drift.
 *
 * @param strictness - which side of the write/read split to build.
 * @returns the shape.
 */
function leafShape(strictness: Strictness) {
  return {
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
 * **`children` is NOT tied to `spaces`, and that is deliberate.** `spaces` is
 * how many places the container lays out ACROSS; children fill them row by
 * row, so a length that is not a multiple of the width is a part-filled last
 * row and is the ordinary state. An equality rule between the two was written
 * here once and made a fifty-picture gallery unrepresentable.
 *
 * **What IS load-bearing is the position.** An entry may be `null` — an empty
 * place that keeps its width and draws nothing — so nothing here may collapse,
 * trim or reorder the array. `[a, null, b]` means `b` is third.
 *
 * A note on where the cap actually bites: zod runs an array's element parses
 * before its own `.max()`, so this cap does not bound the work of a hostile
 * payload, only its acceptance. `validate_block` in `0009` checks the length
 * BEFORE walking, and the database is the authority on every write — see
 * {@link BLOCK_LIMITS}.
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
      spaces: spaceCount(strictness).default(1),
      weights: weightList(strictness),
      style: specialise(z.object(blockStyleShape), strictness).optional(),
      name_en: optionalText,
      name_es: optionalText,
      // **Capped on the WRITE only**, for the reason {@link spaceCount} states
      // at length: a length this build thinks is too long is one a newer
      // deployment wrote, and refusing it on the read blanks the whole page
      // rather than costing anything. Nothing is lost by admitting it — the
      // cap never bounded the WORK of a hostile payload in any case, since zod
      // parses an array's elements before its own `.max()`, and
      // `validate_block` checks the length before walking. The database is the
      // authority on the write and this is a courtesy in front of it.
      children: specialiseArray(
        z.array(blockSchemaAt(depth + 1, strictness).nullable()),
        strictness,
        BLOCK_LIMITS.children,
      ).default([]),
    }),
    strictness,
  ).superRefine((value, ctx) => {
    // **Strict only.** The lenient read admits a mismatch and every reader
    // resolves it to uniform tracks — see `trackListFor` — because refusing
    // here would fail the container, then the union, then the page.
    if (strictness !== "strict") return;
    if (value.weights && value.weights.length !== value.spaces) {
      ctx.addIssue({
        code: "custom",
        path: ["weights"],
        message: WEIGHTS_LENGTH_MESSAGE,
      });
    }
  });
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
 * What it produces is a leaf: the block's own words and its style, with
 * `children` and anything else stripped. `LEAVES.get(kind) ?? PlainLeaf`
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
 * What a container written by the build BEFORE this one calls its shape.
 *
 * **`#158` shipped a save boundary that writes `columns`, and this build reads
 * `spaces`.** For about a day the editor converted flat sections into blocks at
 * the moment of saving, through a shim whose table emitted `columns: 3` for a
 * card grid and `columns: 4` for a row of stats. Those pages are in the
 * database. Without this, the lenient object strips the key it does not know,
 * `spaces` falls to its `.default(1)`, and a three-across gallery reads back as
 * one full-width column — for its owner and for a stranger — after which the
 * next save writes that loss down permanently. Nothing warns, because a strip
 * is not an error.
 *
 * **It is a fallback rather than a rename**, so a container carrying both keeps
 * the `spaces` it was written with; `columns` is only ever consulted when there
 * is no answer. And a `columns` this build cannot read as a count — a string, a
 * fraction, a zero — is left alone rather than forced through, so the default
 * still applies and the page still renders. That is the same argument
 * {@link spaceCount} makes about the upper bound: a value out of range must
 * cost the container its shape, never the page its existence.
 *
 * **Only the LENIENT build applies it**, which is what makes this a migration
 * with an end rather than a second vocabulary. The strict save refuses an
 * unknown key and `validate_block` refuses `columns` by name, so the first time
 * an owner saves a converted page it is stored in the new shape and this stops
 * being consulted for it. **It can be deleted once no stored page carries
 * `columns`** — which `check:schema-drift` cannot tell you and no test can,
 * since it is a fact about the live database rather than about the code.
 *
 * A leaf's `span` from the same build is deliberately NOT carried anywhere: a
 * width is not a property of a block any more, and there is nothing for it to
 * become.
 *
 * @param value - whatever is being parsed as a block.
 * @returns the same value, with `spaces` filled in from `columns` where it was
 *   the only answer available.
 */
function withSpacesFromColumns(value: unknown): unknown {
  if (typeof value !== "object" || value === null) return value;
  const block: Record<string, unknown> = { ...value };
  if (block.kind !== CONTAINER_KIND || block.spaces !== undefined) return value;
  // The same rule the vocabulary itself reads by, rather than a second opinion
  // about what a count is.
  if (!spaceCount("lenient").safeParse(block.columns).success) return value;
  block.spaces = block.columns;
  return block;
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
  // **The `columns` fallback wraps the whole lenient union, not the container
  // option.** A discriminated union reads its discriminator off the option
  // schemas, so a preprocess inside one is a shape it has to reason about;
  // outside, the raw value is repaired before any option sees it, and because
  // a container's children are parsed by this same factory one level down,
  // every nested container gets the same repair without a second call site.
  return strictness === "strict"
    ? known
    : (z.preprocess(
        withSpacesFromColumns,
        z.union([known, unknownKindSchema()]),
      ) as z.ZodType<Block, unknown>);
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
 * What it does not do matters once the editor exists: **it measures depth from
 * whatever it is handed.** Validating a subtree with it permits
 * {@link MAX_DEPTH} further
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
 * **An empty space is not a block.** The budget bounds what has to be
 * rendered, and a space with nothing in it renders nothing — so a page of
 * wide-open sections must not be refused for blocks it does not hold.
 *
 * **Exported so the editor can withdraw its own add controls at the cap**,
 * counting the same way {@link blocksSchema} does rather than approximating
 * it with the length of the outermost array. A control that silently does
 * nothing at a limit is the fault this project keeps catching, and a control
 * withdrawn at the wrong number is the same fault with an alibi.
 *
 * @param blocks - the parsed blocks to count, empty spaces included.
 * @returns the total, containers included and empty spaces not.
 */
export function countBlocks(blocks: readonly (Block | null)[]): number {
  return blocks
    .filter((block) => block !== null)
    .reduce(
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
 * @param strictness - which side of the write/read split to build. Both caps
 *   below are applied on the write only; see {@link spaceCount} for why a cap
 *   on the read blanks a page rather than bounding it.
 * @returns the page schema.
 */
function pageSchema(
  block: z.ZodType<Block, unknown>,
  strictness: Strictness,
): z.ZodType<Block[], unknown> {
  const page = z.array(block);
  // **Both caps are on the WRITE only** — see {@link spaceCount} for the
  // argument in full. A page this build thinks holds too much is one a newer
  // deployment saved after a cap was raised, and a `refine` on the whole array
  // fails the whole array: the owner's editor opens empty and refuses to save,
  // a stranger sees nothing at all. `set_actor_sections` is what bounds what
  // can be stored, and it is the only writer of the column.
  if (strictness === "lenient") return page;
  return page
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
 * `spaces`, `children`, `description_en`, `text_en` — which on a
 * minimal container holding one text leaf grows 81 bytes into 112. Storing the
 * raw payload instead would let a page saved just under the cap read back over
 * it. That used to be a blank page — the exact outcome the leniency exists to
 * prevent — and is now merely untidy, because {@link lenientBlocksSchema}
 * applies no byte cap at all. Both halves are kept: measuring the parsed value
 * is what makes the write honest, and the read no longer depends on it.
 */
export const blocksSchema = pageSchema(blockSchema, "strict");

/**
 * Everything a page is made of, as it is READ back from storage.
 *
 * Lenient where {@link blocksSchema} is strict — on an unknown key, an
 * unknown `mode` or `kind`, an out-of-vocabulary `spaces`, a longer
 * `children`, and both page-level caps. Every one of those is a deliberate
 * ruling rather than an oversight: see {@link specialise} for the deploy-skew
 * argument and {@link spaceCount} for why the numbers needed it as much as the
 * names did.
 *
 * **What it is NOT lenient about is DEPTH**, and that exception is the one
 * worth stating. Every other cap here bounds what somebody may store; the
 * depth cap bounds a RECURSION over user-controlled `jsonb`, which is a stack
 * whose depth somebody else would otherwise choose. `validate_block` enforces
 * it with an explicit counter for that reason, and admitting an arbitrary
 * depth on the read would give away the one guarantee the duplication exists
 * to buy.
 */
export const lenientBlocksSchema = pageSchema(lenientBlockSchema, "lenient");
