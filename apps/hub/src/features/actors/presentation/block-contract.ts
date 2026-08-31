/**
 * The contract every block renderer speaks, and the surfaces they share.
 *
 * **Split out of `blocks.tsx` (2026-08-27) so a leaf module can be written
 * without importing the file that registers it.** `identity-leaves.tsx` used
 * to RESTATE this props interface rather than import it, with a comment saying
 * why: importing it would have made the module depend on the renderer that
 * imports it, which is a cycle. A restated interface is a second copy of a
 * contract, free to drift from the first — so the contract moved out instead,
 * and both leaf modules now speak the same one.
 *
 * Nothing here renders. It is types, class strings and two lookup tables, which
 * is what lets every kind's module import it with no risk of a cycle.
 */

import type { ReactNode } from "react";
import {
  isContainer,
  type Block,
  type BlockStyle,
  type LeafBlock,
} from "@/features/actors/domain/block-schema";
import { contentFor } from "@/features/actors/domain/actor-content";
import type { EmbedShape } from "@/features/actors/domain/embeds";
import type { PageMeasure } from "@/features/actors/domain/actor-theme";
import type {
  PublicActor,
  PublicFursonaSummary,
} from "@/features/actors/infrastructure/public-actors";

/**
 * What a card reads its four corners from, in CSS's own order.
 *
 * **One constant, because eight copies is how a bar and its cards stop
 * agreeing.** A window is a bar whose foot is square over a body whose head is
 * square; if one shell's class drifts from another's the join opens, and
 * nothing fails — the page simply stops being a window.
 *
 * **The fallback is the EXPRESSION and not `var(--radius-xl)`, which is
 * load-bearing.** `@theme inline` makes a utility inline a theme token's value
 * rather than reference it, so `rounded-xl` compiles to exactly this `calc()`
 * and resolves `--skin-round` at the element. Referencing the token instead
 * reads a value already computed at `:root`, freezing that scope's skin —
 * measured, that gave every nested skin the page's own corner, and
 * `section-skin-nesting.spec.ts` is what caught it.
 *
 * It lives in this file rather than in `blocks.tsx` because the leaf modules
 * need it too and `blocks.tsx` imports them. Nothing here renders, which is
 * what makes it importable from either direction with no cycle.
 */
export const CORNER_CLASS =
  "rounded-[var(--corner-tl,calc(var(--skin-round)*0.75rem))_var(--corner-tr,calc(var(--skin-round)*0.75rem))_var(--corner-br,calc(var(--skin-round)*0.75rem))_var(--corner-bl,calc(var(--skin-round)*0.75rem))]";

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
export interface LeafProps {
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
export type LeafRenderer = (props: LeafProps) => ReactNode;

/** The surface a card-shaped leaf sits on, shared so the kinds cannot drift. *
 * A leaf card pads itself by `--block-pad` rather than a literal, so a block's
 * own `chrome` and a page's `spacing` can both reach it.
 */
export const LEAF_CARD =
  "flex items-center gap-3 rounded-xl surface border-(--edge) bg-(--surface) p-(--block-pad)";

/**
 * The tile a card-shaped leaf's icon sits in.
 *
 * **Every such leaf carries one, including the ones whose author chose no
 * icon** — a tile rendered only sometimes makes a row of them ragged, which is
 * the fault `Cards` already fixed on the flat page by always rendering it. Each
 * kind names its own fallback glyph.
 */
export const LEAF_TILE =
  "grid size-9 shrink-0 place-items-center rounded-lg surface border-(--edge) bg-(--bar)";

/**
 * What a `link` leaf shows when its author chose no icon.
 *
 * Deliberately neutral, for the reason `CARD_ICON` gives on the flat page: it
 * stands in for anything at all somebody might link to, and a glyph that meant
 * something would be wrong more often than right.
 */
export const LINK_ICON = "link";

/**
 * What a `social` leaf shows when it carries neither an author's icon nor a
 * recognised brand's.
 *
 * `resolveSocial` answers `icon: undefined` for a host it does not know, by
 * design. A globe reads as "somewhere on the web", which is exactly what a chip
 * with no other information is.
 */
export const SOCIAL_ICON = "globe";

/**
 * A leaf's own words in the language being read.
 *
 * @param leaf - the leaf.
 * @param locale - the locale being read.
 * @returns its title and description, each falling back to English.
 */
export function wordsOf(leaf: LeafBlock, locale: string) {
  return {
    title: contentFor(leaf, "title", locale),
    description: contentFor(leaf, "description", locale),
  };
}

/**
 * Whether a leaf should still draw its own title, composing the enclosing
 * mode's decision with the block's own `style.label`.
 *
 * **`labelled` is the mode's answer and `style.label` is the block's own, and
 * `hidden` can only narrow, never widen, what the mode already decided.** A
 * `tabs` or `accordion` panel that has already shown this leaf's title
 * elsewhere sets `labelled: false`, and `label: "show"` cannot undo that —
 * there is nowhere left on the leaf itself to put a title the mode already
 * drew. `label: "hidden"` reaches the other way, suppressing a title the mode
 * would otherwise have shown, which is the whole reason the key exists: see
 * gap 16 of `docs/superpowers/specs/2026-08-27-pastiche-findings.md`, where
 * four identity leaves stacked at the top of a page each drawing their own
 * title read as a column of label-value pairs rather than one identity.
 *
 * **Absent (or `"show"`) behaves exactly as `labelled` alone always has**, so
 * a page that never sets the key renders byte-for-byte as it did before the
 * key existed.
 *
 * **Only five leaf kinds ever call this at all** — the four identity leaves
 * (`identity-leaves.tsx`) and `PlainLeaf`, the `text` kind
 * (`text-leaves.tsx`). Every other leaf kind — `stat`, `quote`, `progress`,
 * `table`, `link`, `social`, the media leaves — and every container
 * (`blocks.tsx`'s own name draws from `labelled` alone) ignore `style.label`
 * entirely. {@link honoursLabel} answers exactly this set, and it is doing so
 * for the SECOND time. It briefly existed, gating an "Own title" select in
 * `section-style-popup.tsx` — but that popup only ever opened for a
 * `ContainerBlock`, whose `kind` is always the literal `"container"` and
 * never one of these five, so the gate answered `false` at every call site
 * there was, and it was removed as dead on 2026-08-30. It is back the same
 * day: `leaf-editor.tsx` mounts the same popup for a LEAF now, gated through
 * {@link styleGatesFor} off the leaf's own `kind` — exactly the value
 * `honoursLabel` needed and a `ContainerBlock` could never supply.
 *
 * @param labelled - whether the enclosing mode has already shown this leaf's
 *   title, or has left that decision to the leaf.
 * @param style - the leaf's own style bag, absent when it has none.
 * @returns whether the leaf should draw its own title.
 */
export function showsLabel(
  labelled: boolean,
  style: BlockStyle | undefined,
): boolean {
  return labelled && style?.label !== "hidden";
}

/**
 * The leaf kinds `showsLabel` composes with — see that function's own note on
 * why this list exists twice for the same set.
 *
 * A `Set`, not a plain object: a leaf's `kind` is wider than {@link LeafKind}
 * (the lenient read admits a name this build does not know), so this is
 * indexed by text that came out of `jsonb` — the shape that put `__proto__`
 * through `TIDAL_KINDS` once already. A `Set` has no inherited entries to
 * find.
 */
const LABEL_KINDS: ReadonlySet<string> = new Set([
  "text",
  "avatar",
  "handle",
  "name",
  "owner",
]);

/**
 * Whether a leaf's own renderer reads `style.label` at all — the gate
 * `SectionStylePopup`'s "Own title" select needs to offer the key only where
 * it does something.
 *
 * @param kind - a leaf's own `kind`, known or not.
 * @returns whether `style.label` changes anything this leaf draws.
 */
export function honoursLabel(kind: string): boolean {
  return LABEL_KINDS.has(kind);
}

/**
 * The leaf kinds that draw an `<img>` reading `--img-fit` directly —
 * `AvatarLeaf`, `OwnerLeaf`'s own mini portrait, and `PictureLeaf`. `handle`,
 * `name` and `fursonas` draw no `<img>` of their own; `FursonaCardList`'s
 * avatars are a fixed `object-cover` rather than a read of this token.
 *
 * A container is never gated this way — the key is a token that INHERITS, so
 * a container's own choice reaches whichever of these sits anywhere beneath
 * it, whether or not the container itself draws a picture. Only a LEAF's own
 * kind decides whether offering the field here would do anything.
 */
const IMAGE_FIT_KINDS: ReadonlySet<string> = new Set([
  "avatar",
  "owner",
  "picture",
]);

/**
 * Whether a leaf's own renderer reads `--img-fit` directly.
 *
 * @param kind - a leaf's own `kind`, known or not.
 * @returns whether `image_fit` changes anything this leaf draws.
 */
export function honoursImageFit(kind: string): boolean {
  return IMAGE_FIT_KINDS.has(kind);
}

/**
 * Whether a leaf's own renderer reads `style.portrait` — `avatar` alone.
 * `OwnerLeaf`'s own mini avatar deliberately does not, by its own key's
 * TSDoc in `domain/block-schema.ts`.
 *
 * @param kind - a leaf's own `kind`, known or not.
 * @returns whether `portrait` changes anything this leaf draws.
 */
export function honoursPortrait(kind: string): boolean {
  return kind === "avatar";
}

/**
 * The leaf kinds whose own rendered box carries `CORNER_CLASS` — the ONLY
 * mechanism `radius` and `corners` (the style key) ever reach through.
 * `text`, `stat`, `progress` and `table` wear it via `MEASURE_CARD`/their own
 * literal; `quote`, `picture` and `owner` name it directly. Every other kind
 * either draws a fixed corner a class like `rounded-xl`/`rounded-full` never
 * asks `--skin-round` about (`link`, `social` via `LEAF_CARD`; `embed` via
 * `FRAME_SHAPE`; `avatar`), draws no box at all (`handle`, `name`), or reads
 * neither token from anywhere (`player`, `jukebox`, whose chrome is
 * `--chrome-*` tokens a skin never touches; `fursonas`, whose own wrapper is
 * a bare `<section>`/`<div>`).
 *
 * **Found by reading every renderer this file's own `LEAVES` registers, not
 * by reasoning about the shape of the model** — see `honoursCard` for why
 * that mattered here specifically: `surface` and `CORNER_CLASS` are two
 * different CSS features that do not always travel together.
 */
const CORNERS_KINDS: ReadonlySet<string> = new Set([
  "text",
  "stat",
  "quote",
  "progress",
  "table",
  "picture",
  "owner",
]);

/**
 * Whether a leaf's own renderer reads `--skin-round`/`--corner-*` at all —
 * the gate `radius` and `corners` (the style key) both need, since neither
 * has a second mechanism.
 *
 * @param kind - a leaf's own `kind`, known or not.
 * @returns whether `radius`/`corners` change anything this leaf draws.
 */
export function honoursCorners(kind: string): boolean {
  return CORNERS_KINDS.has(kind);
}

/**
 * The leaf kinds whose own rendered box carries `surface` — the utility
 * `skin`, `border` and `chrome` all act through (border style and width,
 * gloss, shadow, backdrop, clip; `chrome`'s `bare`/`card` toggle the same
 * tokens `surface` already reads). `CORNERS_KINDS` is a strict SUBSET of
 * this one: every kind that reads `CORNER_CLASS` also reads `surface` on the
 * same element, but `link`, `social` (`LEAF_CARD`), `embed` (`FRAME_SHAPE`)
 * and `avatar` read `surface` on a box shaped by a literal `rounded-xl` or
 * `rounded-full` instead — real for the first three keys, dead for the other
 * two. `player`/`jukebox` (a bespoke `--chrome-*` chrome that shares no token
 * with a skin), `handle`/`name` (a bare `<span>`, no box at all) and
 * `fursonas` (a bare `<section>`/`<div>`) read neither.
 */
const CARD_KINDS: ReadonlySet<string> = new Set([
  "text",
  "link",
  "picture",
  "embed",
  "social",
  "stat",
  "quote",
  "progress",
  "table",
  "avatar",
  "owner",
]);

/**
 * Whether a leaf's own renderer reads `surface` at all — the gate `skin`,
 * `border` and `chrome` need.
 *
 * @param kind - a leaf's own `kind`, known or not.
 * @returns whether `skin`/`border`/`chrome` change anything this leaf draws.
 */
export function honoursCard(kind: string): boolean {
  return CARD_KINDS.has(kind);
}

/**
 * Which of a block's own style controls apply — computed once from the block
 * being edited, rather than by a caller working out separate booleans by
 * hand and a popup that has to trust it got them right.
 *
 * **One place for this knowledge**, matching {@link showsLabel}: a leaf-kind
 * list scattered across `block-card.tsx` and `leaf-editor.tsx` is two places
 * to keep in step, and the gap this whole feature keeps finding is exactly
 * that shape.
 *
 * **`background_url`, `background_fit` and `text_align` carry no gate of
 * their own, and that is a finding rather than an oversight.** `blockStyle`
 * writes all three as an INLINE style on the wrapper `Block` itself renders —
 * `backgroundImage`/`backgroundRepeat`/`backgroundSize` paint that element
 * directly, and `textAlign` is an ordinary inheriting CSS property no
 * descendant text opts out of — so all three act on every block whatever it
 * contains, container or leaf, with no per-kind renderer standing between
 * the style bag and the paint. `skin`, `border`, `chrome`, `radius` and the
 * `corners` style key are the opposite shape: each is read only by a
 * per-kind renderer's OWN box (`surface`, `CORNER_CLASS`), which a leaf may
 * or may not draw at all. That difference is `card`/`corners` below.
 */
export interface StyleGates {
  /**
   * Whether the name-style controls apply — the bar, its picture, its fit,
   * the room under it and around it, and its own corner picker. A NAMED
   * container only; a leaf has no name field to draw one from.
   */
  heading: boolean;
  /**
   * Whether `bleed` and `margins` apply. A depth-0 CONTAINER only — `bleeds`
   * and the page box's own margin test in `blocks.tsx` both read
   * `isContainer` before either key, so a leaf's own `style.bleed` or
   * `style.margins` is stored, validated, and read by nothing. Offering the
   * controls on one would be exactly the do-nothing control this feature
   * keeps trimming.
   */
  atTop: boolean;
  /** Whether the "Own title" select applies — see {@link honoursLabel}. */
  label: boolean;
  /**
   * Whether the picture-fit select applies. Always true for a container,
   * because the key inherits to whatever draws a picture beneath it; gated
   * by kind for a leaf — see {@link honoursImageFit}.
   */
  imageFit: boolean;
  /** Whether the portrait-size select applies — see {@link honoursPortrait}. */
  portrait: boolean;
  /**
   * Whether `skin`, `border` and `chrome` apply. Always true for a
   * container — every one of those keys sets tokens that cascade to
   * whatever a container's children draw, so offering them is meaningful
   * regardless of what is nested, the same reasoning `imageFit` already
   * follows. Gated by kind for a leaf — see {@link honoursCard}.
   */
  card: boolean;
  /**
   * Whether `radius` and the `corners` style key apply. Always true for a
   * container, for the same cascading reason `card` is. Gated by kind for a
   * leaf, and NARROWER than `card` — see {@link honoursCorners} for why the
   * two are not the same gate.
   */
  corners: boolean;
}

/**
 * Computes {@link StyleGates} for the block `SectionStylePopup` is about to
 * edit.
 *
 * **`card` and `corners` are unconditioned for a container and derived from
 * the leaf's own `kind` for a leaf**, through {@link honoursCard} and
 * {@link honoursCorners} — the same shape every other leaf-only gate here
 * follows.
 *
 * @param block - the block being edited, a container or a leaf.
 * @param atTop - whether this block sits at depth 0. Ignored for a leaf: a
 *   leaf at the top level (a page may hold one — see `block-editor.tsx`)
 *   still honours neither `bleed` nor `margins`, because both are read only
 *   where {@link isContainer} already agreed before either key is asked.
 * @returns which controls this particular block's popup should offer.
 */
export function styleGatesFor(block: Block, atTop: boolean): StyleGates {
  if (isContainer(block)) {
    return {
      heading: Boolean(block.name_en?.trim() || block.name_es?.trim()),
      atTop,
      label: false,
      imageFit: true,
      portrait: false,
      card: true,
      corners: true,
    };
  }
  return {
    heading: false,
    atTop: false,
    label: honoursLabel(block.kind),
    imageFit: honoursImageFit(block.kind),
    portrait: honoursPortrait(block.kind),
    card: honoursCard(block.kind),
    corners: honoursCorners(block.kind),
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
export const FRAME_SHAPE: Record<EmbedShape, string> = {
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
export const FRAME_BOX: Record<EmbedShape, string> = {
  video: "",
  audio: "",
  portrait: "mx-auto w-full max-w-80",
  post: "mx-auto w-full max-w-105",
};
