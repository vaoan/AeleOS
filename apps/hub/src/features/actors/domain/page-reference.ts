import {
  BLOCK_LIMITS,
  BLOCK_STYLE_LIMITS,
  CONTAINER_KIND,
  CONTAINER_MODES,
  LEAF_KINDS,
  MAX_DEPTH,
  type Block,
  type ContainerMode,
  type LeafKind,
} from "@/features/actors/domain/block-schema";
import {
  CANVASES,
  CURSOR_MAX_PX,
  DEFAULT_THEME,
  PAGE_FONTS,
  PAGE_MEASURES,
  PAGE_SPACINGS,
  type ActorTheme,
} from "@/features/actors/domain/actor-theme";
import { leafFields } from "@/features/actors/domain/leaf-fields";
import { SKINS } from "@/shared/domain/skins";
import {
  GRADIENT_KINDS,
  MAX_STOPS,
  RADIAL_EXTENTS,
  RADIAL_SHAPES,
} from "@/shared/domain/gradient";
import { CANVAS_RANGE } from "@/shared/domain/canvas-motion";
import { MAX_CANVAS_COLOURS } from "@/shared/domain/canvas-slots";
import {
  REFUSED_KIND,
  REQUIRED_KINDS,
  type ActorKind,
} from "@/features/actors/domain/required-blocks";
import {
  DOCUMENT_VERSION,
  PASTE_LIMIT_BYTES,
} from "@/features/actors/domain/page-document";

/**
 * What each container mode DOES, in one line, for a reader who has never seen
 * this model.
 *
 * **Hand-written, and gated.** Every list and cap in {@link pageReference} is
 * interpolated from the constants that are already authoritative, so it cannot
 * go stale; a mode's MEANING cannot be derived from a type, so it is written
 * here instead, and `page-reference.test.ts` fails the build when a mode is
 * added without one. A reference that has gone stale is worse than none,
 * because the thing reading it — a language model — believes it completely.
 *
 * `satisfies Record<ContainerMode, string>` is what makes the gate structural
 * as well as tested: adding a mode to {@link CONTAINER_MODES} stops this file
 * compiling until a line is added here too.
 *
 * **`grid`'s own line says "equal width unless `weights` says otherwise"
 * rather than plain "equal tracks" (fixed in review round 1)** — the earlier
 * wording flatly contradicted the `weights` field two sentences later in
 * {@link pageReference}'s own section 2, which lays unequal tracks whenever a
 * `grid` carries one.
 *
 * **No line here may claim exclusivity, checked by `page-reference.test.ts`
 * against `/only|every other/i` (review round 2).** `tabs` used to say "only
 * one panel is visible" and `accordion` "shows every child as a collapsible
 * panel" — the first is true of the mode's OWN state rather than a claim
 * about other modes, so it was simply reworded ("the rest stay hidden until
 * chosen"); the second was an overclaim, since an EMPTY place gets no panel
 * at all (`filledSeatsOf` in `blocks.tsx`), so it now says "each filled
 * place". See {@link KIND_MEANINGS}'s own note for why the gate itself
 * exists.
 */
export const MODE_MEANINGS = {
  stack:
    "lays children one after another down the page — the resting, default arrangement",
  list: "lays children in a single column with a hairline between rows and no gap, the shape a modern feed uses",
  grid: "lays children across a fixed number of tracks — equal width unless `weights` says otherwise — wrapping into more rows as more are added",
  masonry:
    "packs children into columns by height, so a short entry is followed immediately by whatever comes next rather than waiting for a taller neighbour",
  carousel:
    "lays children in a single row that scrolls sideways, at every width",
  tabs: "shows one child at a time, chosen by a tab — the rest stay hidden until chosen",
  accordion:
    "shows each filled place as a collapsible panel — an empty one gets no panel at all — and any number may be open at once",
  timeline: "lays children as a marked, ordered sequence",
} as const satisfies Record<ContainerMode, string>;

/**
 * What each leaf kind HOLDS, in one line, for a reader who has never seen this
 * model.
 *
 * **Hand-written, and gated**, for the same reason {@link MODE_MEANINGS} is —
 * see its own note. `satisfies Record<LeafKind, string>` stops this file
 * compiling the moment {@link LEAF_KINDS} gains a member with no line here.
 *
 * Each line is written fresh from what the renderer actually does today, not
 * copied from `block-schema.ts`'s own TSDoc: that comment carries history,
 * corrections and the account of a rename (`post` became `embed`), which is
 * exactly the kind of material a reader with no memory of any of it should
 * never be handed as though it were the current behaviour.
 *
 * **`table`'s own line no longer claims exclusivity over `rows` (fixed in
 * review round 1).** It used to say "the only kind that reads its own `rows`
 * field", which was false — `player` and `jukebox` read it too, as a
 * playlist — and `block-schema.ts`'s TSDoc said the identical false thing,
 * which is exactly the failure the spec's "never generate this from the
 * TSDoc" rule exists to prevent: the TSDoc was not merely differently toned,
 * it was wrong. See {@link ROWS_MEANINGS}, which is gated against
 * `leafFields` rather than asserted by hand, so this cannot silently regress
 * a second time.
 *
 * **A THIRD copy of that exact sentence turned up in `text-leaves.tsx`'s own
 * `tableRows` TSDoc, one review round after the first two were fixed** — "every
 * kind stores them and only this one reads them", corrected the same way.
 * Three independent copies of one false generalisation is why round 2 stopped
 * trusting hand-written exclusivity claims at all: `stat` and `quote` each
 * used to say their pair inverts "from every other kind", when `progress`
 * inverts too — both now cross-reference the other two kinds that actually
 * share the behaviour, rather than claiming something about every kind that
 * does not. `jukebox` said "audio only", which is true of the kind's OWN
 * shape rather than a claim about others, and was simply reworded ("with no
 * video pane") to keep the line out of the gate's way. **No line here may
 * contain "only" or "every other" at all** — `page-reference.test.ts` checks
 * every entry in this record (and in {@link MODE_MEANINGS},
 * {@link THEME_KEY_MEANINGS} and {@link ROWS_MEANINGS}) against
 * `/only|every other/i`, sabotage-verified to redden the original `table`
 * falsehood. See the actors feature note for the rule this proved: an
 * exclusivity claim belongs in a gated record, never in prose.
 */
export const KIND_MEANINGS = {
  text: "a paragraph of the author's own prose — a heading and a body",
  link: "a button pointing somewhere else, with its own label and an address",
  picture: "one picture",
  player:
    "a retro media player of AeleOS's own, with a video pane, playing a playlist of audio and video files",
  jukebox:
    "a retro music player of AeleOS's own, with no video pane, playing a playlist of audio files",
  embed:
    "somebody else's own embed — YouTube, Spotify, Tidal, Twitch, Instagram, Mastodon and more — framed from an allowlisted provider",
  social:
    "a branded chip linking out to a profile elsewhere, labelled by whichever brand its address matches, or by its own hostname when none does",
  stat: "one fact — the description is the big value and the title is its label; the pair is inverted, the same as `quote` and `progress`",
  quote:
    "a quotation — the description is what was said and the title is who said it; the pair is inverted, the same as `stat` and `progress`",
  progress:
    "one measured thing drawn as a bar — the title labels it and the description (a fraction, a percentage or a number) sets how full the bar is; the pair is inverted, the same as `stat` and `quote`",
  table: "rows of paired cells",
  avatar:
    "the actor's own portrait, resolved by the page rather than typed in — its title is the picture's alt text",
  handle:
    "the actor's own address, resolved by the page rather than typed in — its title labels the value",
  name: "the actor's own display name, resolved by the page rather than typed in — its title labels the value, and it may render nothing at all when no name is set",
  owner:
    "a link to the fursona's owner, resolved by the page rather than typed in — required on a fursona's page and refused on a person's",
  fursonas:
    "the list of a person's own public fursonas, resolved by the page rather than typed in — required on a person's page and refused on a fursona's",
} as const satisfies Record<LeafKind, string>;

/**
 * What each leaf kind's `rows` field means to its own renderer, or `null`
 * when that kind ignores the field entirely (it is still stored regardless,
 * per {@link LeafBlock.rows}'s own note, since every field but `kind` is
 * accepted whatever the kind is).
 *
 * **Gated against `leafFields` rather than asserted by hand — the whole
 * reason this constant exists.** `page-reference.test.ts` checks, for every
 * member of {@link LEAF_KINDS}, that this record names a meaning exactly
 * where `leafFields(kind).rows` is `true` and names `null` everywhere else.
 * That is the direct fix for the Critical finding on this file's first
 * review: both this reference and `block-schema.ts`'s own TSDoc asserted
 * "`table` is the only kind that reads `rows`" as an absolute, when
 * `leaf-fields.ts`'s `RETRO` entry — `player` and `jukebox` — had `rows: true`
 * the entire time. A hand-written absolute claim about which kinds read a
 * field is exactly the kind of sentence that goes silently wrong the day the
 * data it was never checked against changes; this one is checked.
 */
export const ROWS_MEANINGS = {
  text: null,
  link: null,
  picture: null,
  player:
    "a playlist — one row per track, holding its address, then a title, then who made it",
  jukebox:
    "a playlist — one row per track, holding its address, then a title, then who made it",
  embed: null,
  social: null,
  stat: null,
  quote: null,
  progress: null,
  table: "the table's own paired cells",
  avatar: null,
  handle: null,
  name: null,
  owner: null,
  fursonas: null,
} as const satisfies Record<LeafKind, string | null>;

/**
 * The two kinds whose `icon` field picks a CHROME rather than a glyph.
 *
 * **Named explicitly rather than derived**, unlike {@link IDENTITY_KINDS}:
 * `LeafFields.icon` is one boolean for both meanings, so nothing in the data
 * itself distinguishes a glyph from a chrome choice — that distinction lives
 * only in `leaf-fields.ts`'s own prose. What IS checked, in
 * `page-reference.test.ts`, is that `leafFields("player")` and
 * `leafFields("jukebox")` are still the same object — `leaf-fields.ts` draws
 * both from its one `RETRO` entry — so this list cannot quietly drift from
 * that grouping without the test noticing the two have diverged.
 */
const RETRO_KINDS: ReadonlySet<LeafKind> = new Set(["player", "jukebox"]);

/**
 * The leaf kinds that draw the actor rather than what somebody typed.
 *
 * **Derived from {@link leafFields} rather than named by hand (fixed in
 * review round 1) — every identity kind's `LeafFields` has every flag false,
 * because there is nothing for an author to type**, and nothing else in
 * {@link LEAF_KINDS} shares that shape. `LEAF_KINDS` itself deliberately
 * carries no marker for "is an identity kind" — adding one would be exactly
 * the kind of welding this model exists to avoid — so this is the one honest
 * way to ask the question without restating a list that could silently fall
 * out of step with a sixth identity kind arriving later. `pageReference`
 * reads this array's own `.length` wherever the text used to say "Five" by
 * hand.
 */
const IDENTITY_KINDS: readonly LeafKind[] = LEAF_KINDS.filter((kind) => {
  const fields = leafFields(kind);
  return (
    !fields.description &&
    !fields.link &&
    !fields.embeds &&
    !fields.icon &&
    !fields.picture &&
    !fields.rows
  );
});

/**
 * Which of a leaf's optional fields this kind actually draws, and what each
 * one means for it — one sentence, generated from {@link leafFields} rather
 * than typed out by hand.
 *
 * This is the fix for the Important finding that section 3 named only the
 * four field NAMES a leaf might carry (`icon`, `image_url`, `link_url`,
 * `rows`) with no per-kind mapping, when `LEAF_FIELDS` already held the exact
 * answer, pinned by `leaf-fields.test.tsx`: `picture`'s own meaning never
 * mentioned `image_url`, `social` was implied to carry a description when its
 * own table entry sets `description: false`, and `icon` on `player`/`jukebox`
 * is the retro chrome rather than a glyph — see {@link RETRO_KINDS}.
 *
 * @param kind - the leaf kind.
 * @returns one sentence naming its optional fields, or that it carries none
 *   beyond the title every leaf must have.
 */
function fieldNotes(kind: LeafKind): string {
  const fields = leafFields(kind);
  const parts: string[] = [];
  if (fields.description) parts.push("a description");
  if (fields.link) {
    parts.push(
      fields.embeds
        ? "`link_url` (framed as an embed when the address matches a recognised provider, an ordinary button otherwise)"
        : "`link_url`",
    );
  }
  if (fields.icon) {
    parts.push(
      RETRO_KINDS.has(kind)
        ? "`icon` (which of the retro player's own chrome to wear — not a glyph)"
        : "`icon` (a small glyph)",
    );
  }
  if (fields.picture) parts.push("`image_url`");
  const rows = ROWS_MEANINGS[kind];
  if (rows) parts.push(`\`rows\` (${rows})`);
  if (parts.length === 0) {
    return "nothing beyond its title — its content is resolved by the page, not typed in";
  }
  return parts.join(", ");
}

/**
 * What each key of {@link ActorTheme} means, in one line.
 *
 * **Hand-written and gated, the same shape as {@link MODE_MEANINGS} and
 * {@link KIND_MEANINGS}.** `ActorTheme` is a TypeScript interface, which has
 * no runtime existence to iterate — so this is gated against
 * {@link DEFAULT_THEME} instead, a real object typed `: ActorTheme`, whose own
 * keys TypeScript already structurally checks against the interface.
 * `satisfies Record<keyof ActorTheme, string>` stops this file compiling the
 * moment `ActorTheme` gains a field with no line here; `page-reference.test.ts`
 * additionally compares `Object.keys` of the two at runtime, which is what
 * actually catches a field ADDED to `DEFAULT_THEME` without a matching entry
 * here, since a `satisfies` check alone would not notice an object holding
 * more keys than its declared type demands.
 *
 * This is the fix for the Important finding that section 8 named 4 of the
 * theme's 14 keys and section 1 promised "colours, canvas, skin and layout"
 * while delivering none of the canvas or the gradient's own shape.
 *
 * `surface` joined on 2026-08-28; the `Record<keyof ActorTheme, string>` above is what refused to compile until it had a meaning, which is the documentation gate being structural rather than remembered.
 */
export const THEME_KEY_MEANINGS = {
  background:
    "the page's own background: a gradient object (see below), or `null` for the design's own",
  accent: "the accent colour, as `#rrggbb`, or `null` for the design's own",
  surface:
    "what panels are painted with, as `#rrggbb`, or `null` to step off the background. Setting it lets a page be silver on teal or near-white on blue, which a stepped panel cannot be; text is then solved against whichever of the two grounds leaves least room",
  canvasColours: `the moving canvas's own colours, one \`#rrggbb\` per slot the chosen canvas paints with (up to ${MAX_CANVAS_COLOURS}), or \`null\` for the design's own`,
  canvas:
    "which moving backdrop plays behind the page — one of the canvases below",
  density: `how busy the canvas is, a multiplier from ${CANVAS_RANGE.min} to ${CANVAS_RANGE.max} (${CANVAS_RANGE.default} is untouched)`,
  speed: `how fast the canvas moves — the same ${CANVAS_RANGE.min}–${CANVAS_RANGE.max} multiplier range as \`density\``,
  scale: `how large what the canvas draws is — the same ${CANVAS_RANGE.min}–${CANVAS_RANGE.max} multiplier range as \`density\``,
  measure:
    "how wide the page's content column is — one of the measures below, or `null` for the design's own",
  font: "the page's own typeface — one of the fonts below, or `null` for the design's own",
  spacing:
    "how tightly the page sets its own content — one of the spacings below, or `null` for the design's own",
  skin: 'the page\'s own form — one of the skins below (never `null`: "default" IS a skin)',
  cursor: `a picture address to use as the mouse cursor, up to ${CURSOR_MAX_PX}px, or \`null\` for the ordinary one`,
  backgroundUrl:
    "a picture address behind the whole page, layered over the gradient, or `null` for none",
  backgroundFit:
    "how that background picture is placed — one of the values below",
} as const satisfies Record<keyof ActorTheme, string>;

/**
 * One leaf, carrying only the title every leaf must have.
 *
 * @param kind - the leaf kind.
 * @param title - its title, in English.
 * @returns the leaf, for {@link exampleBlocks}.
 */
function exampleLeaf(kind: LeafKind, title: string): Block {
  return { kind, title_en: title, description_en: "" };
}

/**
 * A small, complete page for the worked example — valid for the given actor
 * kind and refused for the other.
 *
 * **Kind-dependent on purpose.** A person's page requires `fursonas` and
 * refuses `owner`; a fursona's page is the mirror. One example cannot be
 * valid for both, so the reference's worked example is built for whichever
 * kind it was generated for — see {@link pageReference}.
 *
 * The shape mirrors what `withRequiredBlocks` seeds in practice: a header
 * pairing a portrait with a stack of the name, the handle and — on a
 * fursona's page only — the owner; an "About" section; and, on a person's
 * page only, a section naming their fursona list separately, because
 * `fursonas` is not part of the header either.
 *
 * **Checked against `missingRequiredKinds`, not only against `parseDocument`,
 * in the test file.** `parseDocument` only ever checks REFUSED kinds — it
 * never calls `missingRequiredKinds` — so a worked example missing a
 * required kind (an `avatar`-less fursona page, say) would still parse
 * `ok: true` while `set_actor_sections` refuses it outright. That gap was an
 * Important finding on this file's first review.
 *
 * @param kind - which actor kind the example is for.
 * @returns the page's blocks.
 */
function exampleBlocks(kind: ActorKind): Block[] {
  const stackChildren: Block[] = [
    exampleLeaf("name", "Name"),
    exampleLeaf("handle", "Handle"),
  ];
  if (kind === "fursona") stackChildren.push(exampleLeaf("owner", "Owner"));

  const header: Block = {
    kind: CONTAINER_KIND,
    mode: "grid",
    spaces: 2,
    children: [
      exampleLeaf("avatar", "Portrait"),
      {
        kind: CONTAINER_KIND,
        mode: "stack",
        spaces: 1,
        children: stackChildren,
      },
    ],
  };

  const about: Block = {
    kind: CONTAINER_KIND,
    mode: "stack",
    spaces: 1,
    name_en: "About",
    children: [
      {
        kind: "text",
        title_en: "About",
        description_en: "Write something about this page here.",
      },
    ],
  };

  if (kind === "person") {
    const fursonas: Block = {
      kind: CONTAINER_KIND,
      mode: "stack",
      spaces: 1,
      name_en: "Fursonas",
      children: [exampleLeaf("fursonas", "Fursonas")],
    };
    return [header, about, fursonas];
  }

  return [header, about];
}

/**
 * What each key of a block's style bag DOES.
 *
 * **Hand-written and gated, for the reason {@link MODE_MEANINGS} is** — a
 * meaning cannot be derived from a type, and `page-reference.test.ts` fails
 * the build the day {@link BLOCK_STYLE_LIMITS} gains a key with none.
 *
 * **Until 2026-08-29 the style keys were the one vocabulary here with no
 * meanings at all**, so the reference told an assistant that `heading_gap`
 * accepts `none`, `snug` or `roomy` and nothing whatever about what it
 * changes. Modes, kinds, theme keys and `rows` had carried meanings for
 * months; this list simply never got them, and every key added since inherited
 * the omission.
 *
 * It earned its first new entries the day after it was written — `corners` and
 * `heading_corners` arrived on a branch cut before this record existed, and
 * the gate caught them on the rebase rather than after they shipped, which is
 * the whole point of having it.
 *
 * `label` joined the same day for gap 16 of the pastiche findings — a block
 * may hide its own title, composing with rather than overriding the
 * enclosing mode's own decision.
 *
 * The same exclusivity gate covers these: no `only` and no `every other`, for
 * the reason recorded against {@link KIND_MEANINGS} — a claim that a key is
 * the sole reader of something belongs in a record checked against real data,
 * never in a sentence beside it.
 */
export const STYLE_KEY_MEANINGS = {
  skin: "the block's own aesthetic — corner, edge, shadow, gloss — absent inheriting whatever encloses it",
  background_url:
    "a picture painted behind this block's own content, as an `https` address; nothing is uploaded",
  background_fit:
    "how that picture is laid down: `cover` fills the box and crops, `tile` repeats it, absent places it once at its natural size",
  card_size:
    "kept for pages that stored it, and no renderer reads it today; it named a minimum card width for a grid that chose its own column count, where a container declares its places explicitly now",
  border:
    "the edge this block draws round every plain surface beneath it; `none` is a choice and absence inherits",
  chrome:
    'whether the block\'s content sits in a card at all: `bare` drops the fill, the edge, the shadow and the padding together, which `border: "none"` cannot do because it removes the border style alone',
  label:
    'whether the block draws its own title as a label, composing with whatever the enclosing mode already decided rather than overriding it — `hidden` narrows that decision and can never widen it, and absence or `"show"` leaves it exactly as the mode set it. Never a default; see the identity leaves, which stacked without it read as a column of label-value pairs rather than one identity',
  heading:
    "how a NAMED container draws its name: `plain` floats it above the content, `bar` is a solid strip with the content squared off beneath, `gradient` that strip with a vertical sheen, `soft` that strip in a quieter tone derived from the accent",
  text_align:
    "the edge this block's own text is set against, inherited by the surfaces beneath it",
  image_fit:
    "how a picture fills its box: `cover` crops and `contain` does not, absent being `cover`. A wide picture — a logo, a wordmark — is unreadable cropped into a round avatar",
  radius:
    "this block's corner, independent of its skin; absent inherits whatever the skin chose",
  heading_pad:
    "how much room a named block's name is given INSIDE its strip; a plain name has no strip to pad, so it is read where `heading` draws a bar",
  heading_image:
    "a picture painted ON that strip, as an `https` address, over the fill rather than instead of it — so a picture that fails to load leaves the author's colour behind the bar. Separate from `background_url`, which paints behind the CONTENT",
  heading_fit:
    "how the strip's picture is laid down, the same two options `background_fit` takes",
  corners:
    'which of the corners on this block are rounded, as a comma-separated list of `tl`, `tr`, `br` and `bl`. `radius` says how much and this says where, so `radius: "soft"` with `corners: "tl,tr"` is a panel rounded across the top and square along its foot. Absent means every corner, and `radius: "square"` is how a page says none',
  heading_corners:
    "the same for a named block's own bar. A bar rounded across its top over content rounded across its foot, with the join between them straight, is the window shape a single radius could not draw",
  heading_gap:
    "the room between a named block's name and the content under it. Absence is not one value: a bar welds to what it names and a plain name floats above it, so absent means whichever of those applies and this key is how to say something else",
} as const satisfies Record<keyof typeof BLOCK_STYLE_LIMITS, string>;

/**
 * One line describing what a key of the block style bag accepts.
 *
 * Built from {@link BLOCK_STYLE_LIMITS} rather than restated, so a value
 * added or renamed there changes what this prints without anybody having to
 * remember to update a second copy.
 *
 * @param key - the style key's name.
 * @param limit - the value {@link BLOCK_STYLE_LIMITS} holds for it: a list of
 *   the values it accepts, or a character cap.
 * @returns the line.
 */
function styleLimitLine(
  key: keyof typeof BLOCK_STYLE_LIMITS,
  limit: readonly string[] | number,
): string {
  // **Indexed rather than guarded, and the key is TYPED for that reason.**
  // `STYLE_KEY_MEANINGS` is `satisfies Record<keyof typeof
  // BLOCK_STYLE_LIMITS, string>`, so every key this can be called with has a
  // meaning and there is no absent case to handle. A `?? ""` here would be a
  // branch nothing can reach — which the coverage gate caught on the first
  // draft, and which is exactly the kind of defensive fallback that makes a
  // suite report a hole it cannot test.
  const says = ` — ${STYLE_KEY_MEANINGS[key]}`;
  if (Array.isArray(limit)) {
    const options = limit.map((value) => "`" + value + "`").join(", ");
    return `- \`${key}\`: one of ${options}${says}`;
  }
  return `- \`${key}\`: up to ${limit} characters${says}`;
}

/**
 * The page format, described for an AI assistant authoring or editing one —
 * a person's page, or a fursona's.
 *
 * **Every list and cap below is interpolated from the constants this module
 * imports, never typed out by hand.** Only the one-line MEANING of each
 * container mode, leaf kind, style key and theme key is hand-written, in
 * {@link MODE_MEANINGS}, {@link KIND_MEANINGS}, {@link STYLE_KEY_MEANINGS} and
 * {@link THEME_KEY_MEANINGS},
 * because a meaning cannot be derived from a type — and `page-reference.test.ts`
 * fails the build the day any of those three vocabularies gains a member with
 * no meaning written for it. A reference that has gone stale is worse than
 * none, because the thing reading it believes it completely.
 *
 * **The worked example is generated for the given `kind` and goes through
 * the real `parseDocument`, AND is checked against `missingRequiredKinds`**
 * — proved in the test file, which is what keeps this function from ever
 * handing out an example this build's own parser refuses, or one
 * `set_actor_sections` would refuse for missing a required kind that
 * `parseDocument` itself never checks. A person's page and a fursona's page
 * require and refuse different leaf kinds, so the example — and the rules
 * section above it — differ by `kind` rather than describing one page shape
 * for both.
 *
 * **Which modes read `spaces` and `weights` is stated as a fact about
 * `blocks.tsx`, not derived from it — domain code cannot import the
 * presentation layer that renders these modes, by this codebase's own
 * layering rule, so there is no constant to interpolate here the way
 * {@link CONTAINER_MODES} is.** Verified by reading `blocks.tsx` directly
 * (2026-08-28): only `Grid` reads `props.container.spaces` (as its track
 * count) and calls `trackListFor`, which is the only reader of `weights`;
 * `Masonry` reads `spaces` too, as its column count; `Stack`, `List`,
 * `Carousel`, `Tabs`, `Accordion` and `Timeline` read neither — `Stack`'s own
 * comment says so explicitly ("a `spaces` of three means nothing here").
 * Re-check this paragraph against `blocks.tsx` before trusting it after a
 * change to any mode's renderer.
 *
 * **Section 2's own `spaces` prose used to say "whichever mode is in charge,
 * children still fill places row by row" — false for `carousel`, `tabs` and
 * `accordion`, and self-contradicting two paragraphs above it, inside the
 * SAME document (review round 2).** A true statement about `grid` and
 * `masonry` had been generalised to "whichever mode", which is the identical
 * mistake as the theme paragraph below. Both are scoped back to only the
 * modes and keys they are actually true of.
 *
 * **Section 8's own closing paragraph used to say an invalid value for "any
 * other theme key" falls back to the design's own default — false for
 * `density`, `speed` and `scale` (review round 2).** `dial()`
 * (`canvas-motion.ts`) CLAMPS an out-of-range but usable number to
 * `CANVAS_RANGE.min`–`CANVAS_RANGE.max` rather than resetting it, and only
 * resets to the default when the value is not a usable number at all. The
 * sentence was true of colours when it was written and became false the
 * moment "any other theme key" widened it to cover the three dials too.
 *
 * **Round 2's own fix for the `spaces` paragraph named `masonry` explicitly
 * and was STILL wrong (review round 3).** "For both of them [`grid` and
 * `masonry`], children fill places row by row" is false for `masonry`: CSS
 * multi-column fills column-major — children go DOWN the first column, not
 * ACROSS the first row — which is the exact fact {@link MODE_MEANINGS}'s own
 * `masonry` line states two paragraphs above ("packs children into columns
 * by height"). Naming a mode explicitly while fixing an adjacent falsehood
 * is not the same as verifying the sentence being written; the paragraph now
 * says `grid` fills row by row and `masonry` fills its columns and grows
 * taller, and the "re-wraps into more rows" trailing clause was corrected
 * the same way — `masonry` gets taller columns, not more rows.
 *
 * **Section 8's closing paragraph repeated "a theme object is not a patch"
 * three times across the document (review round 3) — cut to one.** Section
 * 1's `theme` bullet already states the full claim; the dial paragraph's
 * own closing clause and section 8's restatement (which quoted the
 * `{"skin": "comic"}` example a second time) were redundant with it and are
 * gone. Section 8 now only points back to section 1 and gives the practical
 * instruction — read the current theme first, send it back with one key
 * changed — that section 1 does not.
 *
 * **Section 1 names what a document may NOT carry, and that half is as
 * load-bearing as the rest.** `parseDocument` reads `aeleos`, `theme` and
 * `blocks` and ignores every other top-level key rather than refusing it — so
 * an assistant asked to publish a page reaches for `"visibility": "public"`,
 * the page stays private, the assistant reports success, and the person
 * believes their page is published. Silence is the worst of the three
 * outcomes available there, and it is the one the envelope actually has, so
 * the reference states the exclusions, the reason `visibility` in particular
 * is dangerous, and that an unknown key silently does nothing.
 *
 * @param kind - which kind of actor's page this reference is being generated
 *   for. Decides which leaf kinds section 5 says are required and refused,
 *   and which shape the worked example takes.
 * @returns the reference, as plain text a person can hand to an assistant.
 */
export function pageReference(kind: ActorKind): string {
  const modeRows = CONTAINER_MODES.map(
    (mode) => `- \`${mode}\` — ${MODE_MEANINGS[mode]}`,
  ).join("\n");

  const kindRows = LEAF_KINDS.map(
    (leaf) => `- \`${leaf}\` — ${KIND_MEANINGS[leaf]}`,
  ).join("\n");

  const fieldRows = LEAF_KINDS.map(
    (leaf) => `- \`${leaf}\`: ${fieldNotes(leaf)}`,
  ).join("\n");

  const identityRows = IDENTITY_KINDS.map(
    (leaf) => `- \`${leaf}\` — ${KIND_MEANINGS[leaf]}`,
  ).join("\n");

  const required = REQUIRED_KINDS[kind];
  const refused = REFUSED_KIND[kind];
  const other: ActorKind = kind === "person" ? "fursona" : "person";

  const styleKeys = Object.keys(
    BLOCK_STYLE_LIMITS,
  ) as (keyof typeof BLOCK_STYLE_LIMITS)[];
  const styleRows = styleKeys
    .map((key) => styleLimitLine(key, BLOCK_STYLE_LIMITS[key]))
    .join("\n");

  const depthChain = Array.from({ length: MAX_DEPTH }, (_, index) =>
    index === 0 ? "section" : "container",
  ).join(" → ");

  const themeKeys = Object.keys(DEFAULT_THEME) as (keyof ActorTheme)[];
  const themeRows = themeKeys
    .map((key) => `- \`${key}\`: ${THEME_KEY_MEANINGS[key]}`)
    .join("\n");

  const example = JSON.stringify(
    { aeleos: DOCUMENT_VERSION, blocks: exampleBlocks(kind) },
    null,
    2,
  );

  return `# The AeleOS page format (for a ${kind}'s page)

This describes the JSON document an AeleOS page is written as, so that an
assistant can author or edit one on somebody's behalf. Every list and number
below is generated from this build's own source, so it cannot describe a
capability this build does not have.

## 1. What a document is

A document is one JSON object carrying these keys:

- \`aeleos\`: the version marker. This build writes and reads exactly
  \`${DOCUMENT_VERSION}\`; any other value, or a missing key, is refused.
- \`theme\`: the page's colours, canvas, skin and layout — described in
  section 8. Omitting this key, or setting it to \`null\`, means "leave the
  page's existing theme alone" rather than resetting it. **Sending a theme
  object is not the same as sending a patch to one** — every key inside it is
  read independently and falls back to the design's own default when absent,
  so a theme object that only sets \`skin\` resets everything else the page
  had. See section 8's closing note.
- \`blocks\`: the tree of content described in sections 2 through 5.

As a shorthand, a bare JSON array is also accepted in place of the whole
object, and is read as though it were \`blocks\` with no \`theme\` named. It is
leniency about the envelope's shape only — the array still has to satisfy
everything below.

**Those three keys are the whole document. Nothing else in it is read.** In
particular a document cannot carry, and must not try to set:

- \`visibility\` — whether strangers can read the page. This is deliberately
  outside the document, because a document that carried it would **publish a
  page by paste**: somebody imports a page to try it, saves, and a page they
  believed private is being read by strangers. Visibility is changed in the
  editor's own control and nowhere else.
- \`handle\`, \`display_name\`, \`avatar_url\` — who the page belongs to. These
  live on the actor rather than on the page, which is what lets a document be
  shared at all: see section 4, where the identity kinds draw whoever is
  importing rather than whoever wrote it.
- \`sort_order\`, \`featured\` — where a fursona's card sits in its owner's own
  list. They describe somebody else's list and mean nothing here.

A key this build does not read is ignored rather than refused, so adding one
does not fail — it silently does nothing. Do not emit them.

## 2. Containers — arrangement

A **container** arranges other blocks; it holds no content of its own. Its
\`kind\` is always \`"container"\`. It carries:

- \`mode\`: how it arranges its children. One of:

${modeRows}

- \`spaces\`: how many places it lays out ACROSS, from 1 to ${BLOCK_LIMITS.spaces}.
  **Only two modes read it, and read it very differently: \`grid\` lays that
  many tracks, filling them row by row and growing DOWNWARD — more rows — as
  more children are added, so a section of fifty pictures three across is
  three spaces and seventeen rows, not a section nobody can build.
  \`masonry\` reads it as its column count instead: children fill DOWN each
  column in turn (CSS multi-column's own column-major order), so adding more
  grows a column TALLER rather than adding another row.** Every other mode
  ignores the number entirely — \`stack\`, for one, lays exactly one place
  per row whatever \`spaces\` says, and \`carousel\`, \`tabs\` and \`accordion\`
  arrange their children by their own rules with no \`spaces\`-wide rows at
  all; see each mode's own line above. Narrowing \`spaces\` re-wraps a
  \`grid\` container's existing children into more rows, and makes a
  \`masonry\` container's columns taller — either way nothing already there
  is lost.
- \`weights\` (optional): one whole share per place, each from 1 to
  ${BLOCK_LIMITS.weight}, so \`spaces: 3\` with \`weights: [1, 3, 1]\` lays a
  narrow place, one three times as wide, and a narrow place. **Read only by
  \`grid\` — every other mode, \`masonry\` included, ignores it.** Omitting it
  means every place is the same width. It belongs on the PARENT, not on the
  child that sits in the place.
- \`children\`: an array, one entry per place, filling row by row. An entry
  may be \`null\` — an empty place that keeps its width on the page and draws
  nothing, which is different from a shorter array. A container may hold up
  to ${BLOCK_LIMITS.children} children across every one of its rows.
- \`name_en\` / \`name_es\` (optional): a heading drawn over the container.
  **A section is simply a container at the top of the page (depth 0) that
  usually carries one of these.**
- \`style\` (optional): see section 6.

## 3. Leaves — content

A **leaf** is one piece of content. Its \`kind\` is one of:

${kindRows}

Every leaf carries \`title_en\` (required, non-empty) and \`description_en\`
(may be empty); both may also carry a Spanish counterpart, \`title_es\` /
\`description_es\`, which is the author's own writing and not a required
translation. Beyond that, what each kind actually reads differs — some carry
no description at all, and a field's meaning can differ by kind:

${fieldRows}

## 4. The identity kinds — content that is not typed in

${IDENTITY_KINDS.length} of the kinds above draw the ACTOR itself rather than
words the author typed:

${identityRows}

Because these resolve from whoever owns the page rather than from typed
text, one document containing them renders correctly for whoever it is
imported for — which is what makes a shared document behave as a template
rather than as one specific page.

## 5. The rules for a ${kind}'s page

This reference was generated for a **${kind}**'s page. A ${kind}'s page must
carry at least one of each of: ${required.map((one) => `\`${one}\``).join(", ")}
— any number of copies, at any depth, in any container. A ${kind}'s page
refuses the \`${refused}\` kind outright: it has nothing to render on a
${kind}'s page, only on a ${other}'s.

## 6. A block's own style (optional)

Any block, container or leaf, may carry an optional \`style\` object. None of
its keys are required, and an absent key means "inherit whatever encloses
this" rather than a blank value:

${styleRows}

Two further keys live in the same style bag as plain booleans rather than an
enum or a character cap, which is why the list above — built from
\`BLOCK_STYLE_LIMITS\`, which only ever holds the capped and enumerated keys —
does not carry them, and why they are named here directly instead:

- \`bleed\` (boolean, optional, section-only — depth 0): \`true\` reaches both
  edges of the page instead of stopping at the theme's own measure.
- \`margins\` (boolean, optional, section-only — depth 0): explicit \`false\`
  removes that section's own side gutter and the spacing before or after its
  neighbours; absent (or \`true\`) is the page's ordinary chrome.

## 7. Caps

- A container may nest up to ${MAX_DEPTH} levels deep, the top-level section
  counting as the first: ${depthChain} → leaves only. Nesting one level
  past that is refused by name.
- A page may hold up to ${BLOCK_LIMITS.blocks} blocks in total, counting every
  depth.
- A \`table\` leaf may hold up to ${BLOCK_LIMITS.rows} rows of up to
  ${BLOCK_LIMITS.cells} cells each.
- Any one text field (a title, a description, a table cell) holds up to
  ${BLOCK_LIMITS.text} characters.
- The whole serialised page — every block, byte for byte as UTF-8 — must fit
  in ${BLOCK_LIMITS.bytes} bytes.
- A pasted document larger than ${PASTE_LIMIT_BYTES} bytes is refused before
  it is even parsed.

## 8. The theme

A theme carries:

${themeRows}

- Canvases (\`canvas\`): ${CANVASES.map((canvas) => `\`${canvas}\``).join(", ")}.
- Skins (\`skin\`): ${SKINS.map((skin) => `\`${skin}\``).join(", ")}.
- Measures (\`measure\`): ${PAGE_MEASURES.map((measure) => `\`${measure}\``).join(", ")}.
- Fonts (\`font\`): ${PAGE_FONTS.map((font) => `\`${font}\``).join(", ")}.
- Spacings (\`spacing\`): ${PAGE_SPACINGS.map((spacing) => `\`${spacing}\``).join(", ")}.
- How the background picture is placed (\`backgroundFit\`): one of
  ${BLOCK_STYLE_LIMITS.background_fit.map((fit) => `\`${fit}\``).join(", ")} —
  the same two options a block's own \`background_url\` takes.

\`background\` is an OBJECT, not a colour — \`{ kind, repeating, every, angle,
shape, extent, x, y, stops }\`:

- \`kind\`: which shape it runs in — one of
  ${GRADIENT_KINDS.map((value) => `\`${value}\``).join(", ")}.
- \`repeating\` (boolean) / \`every\` (percentage): whether the stops repeat
  outward, and how much of the gradient one repetition covers; \`every\` is
  ignored while \`repeating\` is false.
- \`angle\` (degrees): which way a linear gradient runs, or where a conic one
  starts; ignored by a radial gradient.
- \`shape\` / \`extent\`: a radial gradient's own shape (one of
  ${RADIAL_SHAPES.map((value) => `\`${value}\``).join(", ")}) and how far it
  reaches (one of ${RADIAL_EXTENTS.map((value) => `\`${value}\``).join(", ")});
  ignored by the other two kinds.
- \`x\` / \`y\` (percentage across, percentage down): where a radial or conic
  gradient is centred; ignored by a linear gradient.
- \`stops\`: the colours along it, in order, each \`{ color: "#rrggbb", at }\`
  with \`at\` from 0 to 100 — never empty, up to ${MAX_STOPS} stops.

Every colour anywhere in the theme — \`accent\`, \`canvasColours\`, a gradient
stop's \`color\` — is written as \`#rrggbb\`; an invalid one is dropped and that
key falls back to the design's own default. The same is true of an invalid
\`canvas\`, \`skin\`, \`measure\`, \`font\`, \`spacing\`, \`backgroundFit\`, \`cursor\`
or \`backgroundUrl\`. **\`density\`, \`speed\` and \`scale\` are the exception: a
number outside ${CANVAS_RANGE.min}–${CANVAS_RANGE.max} is CLAMPED to that
range rather than reset, and only a value that is not a usable number at
all** (not a number, or non-finite) **falls back to the default
(${CANVAS_RANGE.default}).**

See section 1 for what sending a theme object actually does to the rest of
the page's theme — every key is resolved independently, so this is not the
place to repeat it. To change one thing and keep the rest, read the page's
current theme first and send it back with that one key edited.

## A worked example, for a ${kind}'s page

This is a complete, valid document for a ${kind}'s page:

\`\`\`json
${example}
\`\`\`
`;
}
