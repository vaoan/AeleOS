"use client";

import { DynamicIcon, iconNames, type IconName } from "lucide-react/dynamic";

/**
 * What {@link PublicSectionIcon} needs.
 *
 * `fallback` is optional because only some layouts want one. Cards pass it —
 * a card with an empty icon tile is ragged beside cards that have one — and
 * links deliberately do not, since a link without an icon is an ordinary link
 * and a default mark beside somebody carefully named button would be noise.
 */
export interface PublicSectionIconProps {
  /** The stored icon name, which may be empty or not an icon at all. */
  name: string | undefined;
  /** Shown when `name` is missing or is not one lucide has. */
  fallback?: string;
}

/**
 * One section item's icon, or nothing.
 *
 * **The only client component on a public page**, and it is one reluctantly:
 * `DynamicIcon` lazy-loads its glyph, which a server component cannot do. It is
 * isolated here so the rest of the page — including the accordion, which is a
 * `<details>` element and needs no script at all — renders on the server and
 * works with JavaScript switched off. An icon that never arrives costs a
 * decoration; a section that never arrives costs the page.
 *
 * **A name lucide does not have renders nothing rather than failing.** `icon` is
 * free text as far as `0009` is concerned, so a value from an older row or a
 * hand-written payload must not take a stranger's page down. `IconPicker`
 * applies the same rule on the writing side, and this needs its own test
 * because it does not share that component's code.
 *
 * **A `fallback` is used when the name is missing or unknown**, and only the
 * layouts that need one pass it. Cards do, because a card with an empty icon
 * tile is ragged beside cards that have one; links do not, because a link
 * without an icon is a perfectly ordinary link.
 *
 * Every colour it paints comes from a token — `--accent` — and never from a literal. That is what lets a person's theme reach it at all.
 *
 * @returns the icon, or null.
 */
export function PublicSectionIcon({ name, fallback }: PublicSectionIconProps) {
  const known = (value: string | undefined) =>
    Boolean(value && (iconNames as readonly string[]).includes(value));
  const shown = known(name) ? name : known(fallback) ? fallback : undefined;
  if (!shown) return null;
  return (
    <DynamicIcon
      name={shown as IconName}
      className="size-5 shrink-0 text-(--accent)"
      aria-hidden
    />
  );
}
