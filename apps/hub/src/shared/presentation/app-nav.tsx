"use client";

import { Link, usePathname } from "@/shared/infrastructure/i18n/navigation";

/**
 * Translated strings {@link AppNav} renders.
 *
 * Not exported: the only caller builds this object inline, so exporting it
 * would add a name to the module's surface that nothing imports. Contrast
 * `FursonaFormLabels`, which is exported because `fursonaFormLabels()` returns
 * it — a type crosses the boundary there and does not here.
 */
interface AppNavLabels {
  /** Names the landmark for a screen reader — never rendered visually. */
  ariaLabel: string;
  /** The person's own identity page. */
  me: string;
  /** The list of pages somebody owns. */
  pages: string;
}

/** What {@link AppNav} needs. */
export interface AppNavProps {
  /** Already-translated section names. */
  labels: AppNavLabels;
}

/** Where the nav can take you, and how a path counts as being there. */
const SECTIONS = [
  // `/me` matches exactly: a future `/mementos` must not light this up.
  { href: "/me", key: "me", exact: true },
  // `/pages` matches by prefix, so the section stays lit on `/pages/new`
  // and `/fursonas/<handle>/edit`. Those are the pages that answer "where am I"
  // with nothing today, which is most of the reason this component exists.
  { href: "/pages", key: "pages", exact: false },
] as const;

/**
 * The section links in the header, for signed-in pages.
 *
 * A client component because the active section is derived from the current
 * path, and a server layout cannot read one. It takes its labels as props for
 * the same reason {@link FursonaForm} does: the catalogue lookup belongs on the
 * server, where the locale already is.
 *
 * **Renders nothing on the picker**, which shares the `(app)` layout but is not
 * a place to wander off from — another app sent the person there to make one
 * choice, and the page's own decline path is the way out it is supposed to
 * offer. Hiding here rather than moving the picker to its own route group is
 * deliberate: that group would need a second copy of the layout that calls
 * `auth.protect()`, and duplicating the thing that protects is the worse trade.
 *
 * The active section carries `aria-current="page"`, which is what makes it
 * legible to a screen reader; the weight change alone would only reach people
 * who can see it.
 *
 * Its gaps and padding are tighter below `sm`. With the wide ones the header —
 * star, wordmark, these links, language, theme and the account menu — came to
 * 324px on a 320px screen, so every page in the app scrolled sideways rather
 * than only the editor.
 *
 * @returns the nav, or null on the picker.
 */
export function AppNav({ labels }: AppNavProps) {
  // Locale-stripped, so these comparisons never mention `/es` or `/en`.
  const pathname = usePathname();

  if (pathname.startsWith("/picker")) return null;

  return (
    <nav
      aria-label={labels.ariaLabel}
      className="ml-1 flex min-w-0 items-center gap-0.5 sm:ml-4 sm:gap-1"
    >
      {SECTIONS.map(({ href, key, exact }) => {
        const active = exact
          ? pathname === href
          : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`truncate rounded-lg px-1.5 py-1.5 text-sm transition-colors hover:bg-[var(--edge)]/30 sm:px-2.5 ${
              active ? "font-medium text-[var(--ink)]" : "text-[var(--muted)]"
            }`}
          >
            {labels[key]}
          </Link>
        );
      })}
    </nav>
  );
}
