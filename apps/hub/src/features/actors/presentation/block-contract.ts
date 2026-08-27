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
import type { LeafBlock } from "@/features/actors/domain/block-schema";
import { contentFor } from "@/features/actors/domain/actor-content";
import type { EmbedShape } from "@/features/actors/domain/embeds";
import type { PageMeasure } from "@/features/actors/domain/actor-theme";
import type {
  PublicActor,
  PublicFursonaSummary,
} from "@/features/actors/infrastructure/public-actors";

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

/** The surface a card-shaped leaf sits on, shared so the kinds cannot drift. */
export const LEAF_CARD =
  "flex items-center gap-3 rounded-xl surface border-(--edge) bg-(--surface) p-4";

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
