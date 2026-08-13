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
  /** The fursona list. */
  fursonas: string;
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
  // `/fursonas` matches by prefix, so the section stays lit on `/fursonas/new`
  // and `/fursonas/<handle>/edit`. Those are the pages that answer "where am I"
  // with nothing today, which is most of the reason this component exists.
  { href: "/fursonas", key: "fursonas", exact: false },
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
 * @returns the nav, or null on the picker.
 */
export function AppNav({ labels }: AppNavProps) {
  // Locale-stripped, so these comparisons never mention `/es` or `/en`.
  const pathname = usePathname();

  if (pathname.startsWith("/picker")) return null;

  return (
    <nav aria-label={labels.ariaLabel} className="ml-4 flex items-center gap-1">
      {SECTIONS.map(({ href, key, exact }) => {
        const active = exact
          ? pathname === href
          : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`rounded-lg px-2.5 py-1.5 text-sm transition-colors hover:bg-[var(--edge)]/30 ${
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
