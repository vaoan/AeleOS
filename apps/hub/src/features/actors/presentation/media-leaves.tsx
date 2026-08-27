/**
 * The kinds that show something hosted somewhere ELSE.
 *
 * A picture, an embedded post, and the two retro players. What groups them is
 * not that they look alike — they do not — but that each resolves an address
 * an author pasted, which is the one thing on a page that reaches another
 * origin. `resolveEmbed`, the provider allowlist and the frame-shape tables are
 * consumed here and nowhere else among the leaves.
 *
 * **AeleOS hosts no files**, so every one of these is a link the author gave
 * us, rebuilt into an embed. See `embeds.ts` for what that costs and why the
 * refusal to interpolate a quote lives in the domain rather than beside a
 * caller.
 *
 * `LeafCaption` lives here because these three are its only callers: a picture,
 * a player and an embed all draw a title and description BENEATH the thing
 * itself, where the word kinds print their own.
 */

import type { ReactNode } from "react";
import type { ChromeKind } from "@/features/actors/domain/chromes";
import { resolveEmbed, safeHttpUrl } from "@/features/actors/domain/embeds";
import {
  FRAME_BOX,
  FRAME_SHAPE,
  wordsOf,
  type LeafProps,
} from "@/features/actors/presentation/block-contract";
import { EmbedFrame } from "@/features/actors/presentation/embed-frame";
// **The two fallbacks these kinds degrade to, and the only edges out of this
// module.** A picture whose address will not pass `safeHttpUrl` renders as
// words, and an embed no provider claims renders as a chip — so `media`
// depends on `text` and `link`, and neither depends back. The grouping is what
// made that visible; it was three calls inside one file before.
import { PlainLeaf } from "@/features/actors/presentation/text-leaves";
import { SocialLeaf } from "@/features/actors/presentation/link-leaves";
import { RetroPlayer } from "@/features/actors/presentation/retro-player";
import { tid } from "@/shared/infrastructure/test-id";

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
export function PictureLeaf(props: LeafProps): ReactNode {
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
export function PlayerLeaf(props: LeafProps): ReactNode {
  return retroLeaf("player", props);
}

/**
 * A retro music player: a playlist and no video pane.
 *
 * The pane is the dividing line and it is a LICENSING one — YouTube's terms
 * forbid hiding the player, so only a chrome with somewhere to show it may
 * offer a YouTube address at all.
 */
export function JukeboxLeaf(props: LeafProps): ReactNode {
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
export function EmbedLeaf(props: LeafProps): ReactNode {
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
