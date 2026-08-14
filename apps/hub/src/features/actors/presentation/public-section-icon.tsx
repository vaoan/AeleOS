"use client";

import { DynamicIcon, iconNames, type IconName } from "lucide-react/dynamic";

/** What {@link PublicSectionIcon} needs. */
export interface PublicSectionIconProps {
  /** The stored icon name, which may be empty or not an icon at all. */
  name: string | undefined;
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
 * @returns the icon, or null.
 */
export function PublicSectionIcon({ name }: PublicSectionIconProps) {
  if (!name || !(iconNames as readonly string[]).includes(name)) return null;
  return (
    <DynamicIcon
      name={name as IconName}
      className="size-5 shrink-0 text-[var(--accent)]"
      aria-hidden
    />
  );
}
