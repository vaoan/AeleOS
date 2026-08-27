/**
 * The content kinds — everything a page's author types, pastes or links.
 *
 * **Split out of `blocks.tsx` (2026-08-27), which held the container machinery
 * and every leaf in one 2,333-line file.** The identity leaves had already left
 * for exactly this reason, with a note saying the file was long enough; this is
 * the rest of that move. `blocks.tsx` keeps what arranges blocks — the modes,
 * the page shell, and the {@link LEAVES} registry — and the kinds live beside
 * their siblings.
 *
 * **The registry is still the seam and is still exhaustive.** `blocks.tsx`
 * indexes these through `satisfies Record<LeafKind, LeafRenderer>`, so a kind
 * added to the vocabulary without a renderer here is a build failure rather
 * than a blank space on somebody's page. Splitting the file changed where the
 * renderers live and nothing about what enforces them.
 *
 * The counterpart is `identity-leaves.tsx`, which draws the ACTOR rather than
 * what an author typed — a different thing to read, which is why it is a
 * different module.
 */

import { Quote as QuoteMark } from "lucide-react";
import type { ReactNode } from "react";
import { contentFor } from "@/features/actors/domain/actor-content";
import type { LeafBlock } from "@/features/actors/domain/block-schema";
import { resolveEmbed, safeHttpUrl } from "@/features/actors/domain/embeds";
import { progressValue } from "@/features/actors/domain/progress-value";
import { resolveSocial } from "@/features/actors/domain/social-links";
import type { ChromeKind } from "@/features/actors/domain/chromes";
import { EmbedFrame } from "@/features/actors/presentation/embed-frame";
import { PublicSectionIcon } from "@/features/actors/presentation/public-section-icon";
import { RetroPlayer } from "@/features/actors/presentation/retro-player";
import { tid } from "@/shared/infrastructure/test-id";
import {
  FRAME_BOX,
  FRAME_SHAPE,
  LEAF_CARD,
  LEAF_TILE,
  LINK_ICON,
  SOCIAL_ICON,
  wordsOf,
  type LeafProps,
} from "@/features/actors/presentation/block-contract";

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
export function PlainLeaf({ leaf, locale, labelled }: LeafProps): ReactNode {
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
export function LinkLeaf({ leaf, locale, labelled }: LeafProps): ReactNode {
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
export function SocialLeaf({ leaf, locale, labelled }: LeafProps): ReactNode {
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
export function StatLeaf(props: LeafProps): ReactNode {
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
export function QuoteLeaf(props: LeafProps): ReactNode {
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
export function ProgressLeaf(props: LeafProps): ReactNode {
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
export function TableLeaf(props: LeafProps): ReactNode {
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
