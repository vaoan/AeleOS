import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Link } from "@/shared/infrastructure/i18n/navigation";
import { LanguageToggle } from "@/shared/presentation/language-toggle";
import { NebulaToggle } from "@/shared/presentation/nebula-toggle";
import { ThemeToggle } from "@/shared/presentation/theme-toggle";
import { tid } from "@/shared/infrastructure/test-id";

/**
 * What every page renders inside.
 *
 * Deliberately small. The shell resolves its own control labels from the
 * catalogue rather than accepting them, so adding a control does not mean
 * editing every page that renders a shell.
 *
 * The exception is anything that differs by whether somebody is signed in —
 * `trailing`, `nav` and `homeHref`. Those are slots because the shell must not
 * learn about sessions: it renders the sign-in page too, and a shell that
 * checks for a session is a shell that can send a signed-out visitor somewhere
 * they cannot go.
 */
export interface PageShellProps {
  /** The page's content, laid out in the shared column. */
  children: ReactNode;

  /**
   * Optional header content pinned to the right — the user button when signed
   * in. A slot rather than a second shell, so signing in changes what is on
   * the page and never what the page looks like.
   */
  trailing?: ReactNode;

  /**
   * Optional section links, rendered after the wordmark. The signed-in layout
   * passes them; public pages do not, because nothing they would link to is
   * reachable while signed out.
   */
  nav?: ReactNode;

  /**
   * Where the wordmark points. Defaults to the public home page, which is
   * correct everywhere — the signed-in layout overrides it with `/me` so that
   * clicking it lands somewhere useful rather than on marketing copy.
   *
   * It is a prop rather than a signed-in check inside the shell because the
   * shell renders on the sign-in page too, where a link to `/me` would bounce
   * straight back to sign-in.
   */
  homeHref?: string;
}

/**
 * The one composition every page uses: header bar, then a 620px column.
 *
 * Sign-in is not an exception. It gets the same header, the same column and
 * the same cards, because a page that invents its own layout is how a design
 * stops being one design — and because the sign-in page is the first thing a
 * new person sees, so it has to look like the product rather than a detour.
 *
 * Dark and light differ only by the token block. There is no theme-conditional
 * markup here and there should never be any: if a change needs different
 * elements per theme, the tokens are wrong rather than the layout.
 *
 * The header bar spans the window; only the page below it is held to 620px.
 * Constraining the bar's contents to that column too left the wordmark floating
 * mid-screen on a wide display, which read as a mistake rather than a choice.
 *
 * The star sits beside the wordmark rather than with the page settings on the
 * right: it is the star that lights the dust, and putting it out is what turns
 * the nebula off. Filed away with language and theme it becomes one setting
 * among three and the relationship disappears.
 *
 * The right-hand group holds the page settings — language and theme — with the
 * account menu after them when signed in.
 *
 * The wordmark is a link, and `nav` sits directly after it: both are wayfinding
 * and they read as one group on the left, opposite the settings on the right.
 * Where the wordmark points is the caller's business — see `homeHref`.
 *
 * Exposes the `wordmark` and `page-content` test ids, which the end-to-end
 * suite selects by. The wordmark itself is a literal rather than a catalogue
 * entry because a proper noun reads the same in every language.
 *
 * The column centres itself vertically when the page is shorter than the
 * window, and scrolls from the top when it is longer. Sign-in used to cling to
 * the header with a third of the window empty beneath it; this fixes that for
 * every page at once rather than making sign-in a special case.
 */
export async function PageShell({
  children,
  trailing,
  nav,
  homeHref = "/",
}: PageShellProps) {
  // The shell resolves its own chrome labels rather than taking them as props.
  // Threading one per control through every page means every new control edits
  // every page, and a page that forgets one renders an unlabelled button.
  const t = await getTranslations("controls");
  const tNebula = await getTranslations("nebula");

  return (
    <div className="flex min-h-screen flex-col">
      {/* The bar spans the window and so do its contents. Pinning them to the
          620px content column instead left the wordmark stranded at x=434 on a
          1440px screen — text dropped in the middle of an empty bar rather
          than a navigation bar. The column still governs the page below. */}
      <header className="sticky top-0 z-10 border-b border-[var(--edge)]/40 bg-[var(--bar)] backdrop-blur-md">
        <div className="flex w-full items-center gap-2 px-6 py-3">
          {/* The star sits with the wordmark because it *is* the wordmark's
              light source: switching it off puts out the dust it lights. That
              relationship is the reason it needs no visible label, and it is
              lost when the control is filed away with the page settings. */}
          <NebulaToggle label={tNebula("toggle")} />
          {/* The wordmark is a proper noun, so it is a literal rather than a
              catalogue entry — it reads the same in every language.

              It is a link because a wordmark that does nothing is the most
              reliably disappointing control on the web: it is the first thing
              people click to get out of a dead end, and for its whole life
              this one was a `span`. The locale-aware Link, not an `a` — a bare
              href drops the `/es` prefix and switches somebody's language on
              the way home. */}
          <Link
            href={homeHref}
            className="rounded-lg px-1 font-display text-lg font-bold tracking-tight"
            {...tid("wordmark")}
          >
            AeleOS
          </Link>
          {nav}
          {/* Controls live together on the right. Beside the wordmark the star
              read as a bullet point rather than something pressable. */}
          <div className="ml-auto flex items-center gap-1">
            <LanguageToggle label={t("language")} />
            <ThemeToggle
              toDarkLabel={t("toDark")}
              toLightLabel={t("toLight")}
            />
            {trailing ? <div className="ml-1">{trailing}</div> : null}
          </div>
        </div>
      </header>
      {/* `justify-center` with `flex-1` centres a short page and leaves a long
          one scrolling from the top — so sign-in sits in the middle of the
          field instead of clinging to the header with a third of the window
          empty beneath it, without turning into a different layout. */}
      <main
        className="mx-auto flex w-full max-w-[620px] flex-1 flex-col justify-center px-6 py-10"
        {...tid("page-content")}
      >
        {children}
      </main>
    </div>
  );
}

/** A surface panel. The only container the design has. */
export interface CardProps {
  /** The panel's content. */
  children: ReactNode;
}

/**
 * The single surface used everywhere content sits on the field.
 *
 * Translucent so the nebula shows through, with a border that carries the
 * separation: at these lightness levels the fill alone cannot reach 3:1
 * against the field, so the border is doing the accessibility work rather
 * than the background. Do not remove it to "clean up" the look.
 *
 * Carries the `card` test id.
 */
export function Card({ children }: CardProps) {
  return (
    <div
      className="rounded-2xl border border-[var(--edge)] bg-[var(--surface)] p-6 shadow-sm backdrop-blur-md"
      {...tid("card")}
    >
      {children}
    </div>
  );
}
