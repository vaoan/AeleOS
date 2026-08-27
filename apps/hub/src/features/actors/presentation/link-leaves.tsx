/**
 * The two kinds that POINT somewhere without showing it.
 *
 * A `link` is a button and a `social` is a chip, and the distinction that
 * matters is against `media-leaves.tsx` rather than between them: these two
 * always draw a control whatever host was pasted, where a picture or an embed
 * frames what it recognises. `LeafFields.embeds` is what decides which hint an
 * author is shown, and this file is the half that never embeds.
 *
 * `social` resolves a brand for its icon and accepts anything it does not
 * recognise; `link` resolves nothing. Neither reaches a provider allowlist.
 */

import type { ReactNode } from "react";
import { safeHttpUrl } from "@/features/actors/domain/embeds";
import { resolveSocial } from "@/features/actors/domain/social-links";
import {
  LEAF_CARD,
  LEAF_TILE,
  LINK_ICON,
  SOCIAL_ICON,
  wordsOf,
  type LeafProps,
} from "@/features/actors/presentation/block-contract";
import { PublicSectionIcon } from "@/features/actors/presentation/public-section-icon";
import { tid } from "@/shared/infrastructure/test-id";

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
