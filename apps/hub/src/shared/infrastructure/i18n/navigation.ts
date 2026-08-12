import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

/**
 * Locale-aware replacements for Next's navigation APIs.
 *
 * Mirrors Libra's `createAppI18n`. Use these rather than importing `Link` or
 * `redirect` from `next/*`: the plain versions drop the locale prefix, which
 * silently bounces a Spanish visitor into the default locale on every internal
 * link.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
