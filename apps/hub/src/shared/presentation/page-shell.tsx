import { getTranslations } from "next-intl/server";
import { SKIN_SCOPE } from "@/shared/domain/skins";
import type { ReactNode } from "react";
import { Link } from "@/shared/infrastructure/i18n/navigation";
import { cn } from "@/shared/infrastructure/cn";
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
 *
 * `width` is a different kind of prop and worth not confusing with those: it
 * says nothing about who is looking, only about what the page holds. A page
 * asks for it because it renders a table rather than prose.
 */
/**
 * What {@link PageShell} needs.
 *
 * `pageThemeSwitch` is the one thing the shell cannot work out for itself: a
 * theme arrives as a `<style>` a page emits, so only the caller knows whether
 * the page it is rendering has one to leave. Passing it IS that statement —
 * there was a separate `themed` boolean saying the same thing, and it went
 * when the light/dark toggle stopped needing to know.
 *
 * `width` gained a third value, `"full"`, which is not a wider column but no
 * column at all — see the prop.
 */
export interface PageShellProps {
  /** The page's content, laid out in the shared column. */
  children: ReactNode;
  /**
   * The control that leaves a page's own theme, rendered among the page
   * settings in the bar.
   *
   * **A slot, and in the BAR rather than in the page.** It rode the public
   * profile's header until the header became blocks — that was the one row the
   * app owned inside somebody's content, and there is no such row any more. A
   * control belonging to the app is exactly what should not sit among an
   * author's blocks, and the bar is where the other page settings already are.
   *
   * A slot rather than something the shell builds, for the reason `themed`
   * exists: only the caller knows whether there is a theme to leave, and only
   * the route can resolve its labels.
   */
  pageThemeSwitch?: ReactNode;

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

  /**
   * How wide the page column is. `"column"` — the default — is the 620px
   * reading measure every page used before the studio port. `"wide"` is for
   * pages that hold a table rather than prose, and it also stops the vertical
   * centring: centring is right for a short card and wrong for a long list,
   * which would otherwise start below the fold on a tall window.
   */
  /**
   * `"full"` hands the page its own width entirely.
   *
   * **Not a wider column — no column at all.** `main` gets no maximum, no
   * centring and no horizontal padding, because the public page applies the
   * measure to each top-level section itself. That inversion is what lets a
   * section bleed to both edges without `w-screen`, whose `100vw` includes the
   * scrollbar the centred column does not.
   *
   * The `"column"` and `"wide"` branches are untouched; the signed-in pages
   * depend on them.
   */
  width?: "column" | "wide" | "full";
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
 * **The shell no longer needs to be TOLD a page is themed.** It took a `themed`
 * prop while the light/dark toggle showed a question mark on such a page; that
 * question mark is gone, and whether there is a theme to leave is now said by
 * passing `pageThemeSwitch` at all. One fact, said once.
 *
 * The header bar spans the window; only the page below it is held to a column.
 * Constraining the bar's contents to that column too left the wordmark floating
 * mid-screen on a wide display, which read as a mistake rather than a choice.
 *
 * That column is 620px by default and `max-w-7xl` when `width` is `"wide"` —
 * see the prop for why going wide also drops the vertical centring. `"full"`
 * is a third thing rather than a wider column: `main` holds nothing back at
 * all — no maximum, centring, gutter or vertical padding — and the public page
 * applies the author's chosen measure and first/between/last chrome to each of
 * its own sections. That inversion is what lets a section reach both edges
 * without `w-screen`, whose `100vw` counts a scrollbar the centred column does
 * not, and what lets a first or last section drop its page chrome without a
 * page-level exception.
 *
 * The star sits beside the wordmark rather than with the page settings on the
 * right: it is the star that lights the dust, and putting it out is what turns
 * the nebula off. Filed away with language and theme it becomes one setting
 * among three and the relationship disappears.
 *
 * The right-hand group holds the page settings — the way out of an author's
 * theme, then language and theme — with the account menu after them when
 * signed in. The theme switch is FIRST of the three because it decides whether
 * the light/dark choice beside it is in force at all.
 *
 * The wordmark is a link, and `nav` sits directly after it: both are wayfinding
 * and they read as one group on the left, opposite the settings on the right.
 * Where the wordmark points is the caller's business — see `homeHref`.
 *
 * **The content column carries `SKIN_SCOPE`, and that is where a skin stops.**
 * A page's owner restyles their own content; the bar keeps the app's shape,
 * because the language and theme toggles live there and a control that changes
 * form on somebody else's page is harder to recognise as one. The COLOURS are
 * not scoped this way and cannot be — they have to reach the canvas and the
 * field, both mounted outside this element.
 *
 * It is set here rather than by each page, so a new page cannot forget it and
 * silently give somebody a style that does nothing.
 *
 * Exposes the `wordmark` and `page-content` test ids, which the end-to-end
 * suite selects by. The wordmark itself is a literal rather than a catalogue
 * entry because a proper noun reads the same in every language.
 *
 * **The header is a fixed `--bar-h` tall and carries `short:static`.** Both are
 * mechanism rather than styling: anything else that sticks — the editor's
 * toolbar — parks at that height, and the class is what lets a screen too short
 * for two bars take the stickiness away and zero the offset together. The
 * padding and gaps are narrower below `sm` because at the wide ones this row
 * came to 324px on a 320px screen, which is every page scrolling sideways.
 *
 * The column centres itself vertically when the page is shorter than the
 * window, and scrolls from the top when it is longer. Sign-in used to cling to
 * the header with a third of the window empty beneath it; this fixes that for
 * every page at once rather than making sign-in a special case.
 */
/**
 * What each width lays the content column out in.
 *
 * `full` drops both horizontal and vertical chrome. Public pages apply their
 * measure and first/between/last spacing to each depth-0 section, so `main`
 * must hold nothing back: no maximum, centring, gutter or page-edge padding.
 * That ownership is what lets one section become a flush banner or footer
 * without making either a page-level exception.
 */
const COLUMN: Record<"column" | "wide" | "full", string> = {
  column: "mx-auto max-w-[620px] justify-center px-4 py-6 sm:px-6 sm:py-10",
  wide: "mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10",
  full: "",
};

/** What {@link WidePageColumn} needs to recreate the signed-in page box. */
export interface WidePageColumnProps {
  /** The signed-in route content that keeps the old wide measure. */
  children: ReactNode;
  /** Deliberate utility overrides for a split editor layout. */
  className?: string;
}

/**
 * Gives one signed-in surface the wide column the app shell used to own.
 *
 * The signed-in shell is full-width so a page editor can render its complete
 * preview with the same geometry as a public route. Ordinary pages wrap their
 * whole result in this component; the editor wraps only its controls and lets
 * the preview remain a sibling. The default classes are byte-for-byte the old
 * wide shell column, including its flex sizing, so moving the ownership does
 * not move the page.
 *
 * `className` may replace individual Tailwind utilities through {@link cn};
 * the editor uses that seam to hand its bottom padding to the full-width
 * preview that follows while retaining every other part of the old column.
 *
 * @param props - the page content and any deliberate utility overrides.
 * @returns the content inside the signed-in wide column.
 */
export function WidePageColumn(props: WidePageColumnProps): ReactNode {
  const { children, className } = props;
  return (
    <div
      {...tid("wide-page-column")}
      className={cn(
        "flex w-full min-w-0 flex-1 flex-col",
        COLUMN.wide,
        className,
      )}
    >
      {children}
    </div>
  );
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
 * **The shell no longer needs to be TOLD a page is themed.** It took a `themed`
 * prop while the light/dark toggle showed a question mark on such a page; that
 * question mark is gone, and whether there is a theme to leave is now said by
 * passing `pageThemeSwitch` at all. One fact, said once.
 *
 * The header bar spans the window; only the page below it is held to a column.
 * Constraining the bar's contents to that column too left the wordmark floating
 * mid-screen on a wide display, which read as a mistake rather than a choice.
 *
 * That column is 620px by default and `max-w-7xl` when `width` is `"wide"` —
 * see the prop for why going wide also drops the vertical centring. `"full"`
 * is a third thing rather than a wider column: `main` holds nothing back at
 * all — no maximum, centring, gutter or vertical padding — and the public page
 * applies the author's chosen measure and first/between/last chrome to each of
 * its own sections. That inversion is what lets a section reach both edges
 * without `w-screen`, whose `100vw` counts a scrollbar the centred column does
 * not, and what lets a first or last section drop its page chrome without a
 * page-level exception.
 *
 * The star sits beside the wordmark rather than with the page settings on the
 * right: it is the star that lights the dust, and putting it out is what turns
 * the nebula off. Filed away with language and theme it becomes one setting
 * among three and the relationship disappears.
 *
 * The right-hand group holds the page settings — the way out of an author's
 * theme, then language and theme — with the account menu after them when
 * signed in. The theme switch is FIRST of the three because it decides whether
 * the light/dark choice beside it is in force at all.
 *
 * The wordmark is a link, and `nav` sits directly after it: both are wayfinding
 * and they read as one group on the left, opposite the settings on the right.
 * Where the wordmark points is the caller's business — see `homeHref`.
 *
 * **The content column carries `SKIN_SCOPE`, and that is where a skin stops.**
 * A page's owner restyles their own content; the bar keeps the app's shape,
 * because the language and theme toggles live there and a control that changes
 * form on somebody else's page is harder to recognise as one. The COLOURS are
 * not scoped this way and cannot be — they have to reach the canvas and the
 * field, both mounted outside this element.
 *
 * It is set here rather than by each page, so a new page cannot forget it and
 * silently give somebody a style that does nothing.
 *
 * Exposes the `wordmark` and `page-content` test ids, which the end-to-end
 * suite selects by. The wordmark itself is a literal rather than a catalogue
 * entry because a proper noun reads the same in every language.
 *
 * **The header is a fixed `--bar-h` tall and carries `short:static`.** Both are
 * mechanism rather than styling: anything else that sticks — the editor's
 * toolbar — parks at that height, and the class is what lets a screen too short
 * for two bars take the stickiness away and zero the offset together. The
 * padding and gaps are narrower below `sm` because at the wide ones this row
 * came to 324px on a 320px screen, which is every page scrolling sideways.
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
  width = "column",
  pageThemeSwitch,
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
      {/* `short:static` and the fixed height are one mechanism: anything else that
          sticks — the editor's toolbar — parks at `--bar-top`, which is this
          height, and the class is what lets a short landscape screen take the
          stickiness away and set that offset to zero together. Both live in
          `globals.css`, where the reasoning is. */}
      <header className="sticky top-0 z-10 h-(--bar-h) border-b border-(--edge)/40 bg-(--bar) backdrop-blur-md short:static">
        {/* Everything here is measured against 320px, the narrowest phone
            still in use. The star, the wordmark, two section links, language,
            theme and the account menu came to 324px there — four over, which
            is a page that scrolls sideways on every screen of the app rather
            than only in the editor. The padding and the gaps are where those
            four came from. */}
        <div className="flex size-full min-w-0 items-center gap-1 px-2 sm:gap-2 sm:px-6">
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
            className="shrink-0 rounded-lg px-1 font-display text-base font-bold tracking-tight sm:text-lg"
            {...tid("wordmark")}
          >
            AeleOS
          </Link>
          {nav}
          {/* Controls live together on the right. Beside the wordmark the star
              read as a bullet point rather than something pressable. */}
          <div className="ml-auto flex shrink-0 items-center gap-1">
            {/* Before language and theme, because it decides whether the
                light/dark choice beside it is even in force. */}
            {pageThemeSwitch ? (
              <div {...tid("public-theme-switch")}>{pageThemeSwitch}</div>
            ) : null}
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
        // **`SKIN_SCOPE` is where a skin stops.** A page's owner restyles
        // their own content; the bar above keeps the app's shape, because the
        // language and theme toggles live there and a control that changes
        // form on somebody else's page is harder to recognise as one. The
        // colours are not scoped this way and cannot be — they have to reach
        // the canvas and the field, which are mounted outside this element.
        //
        // Set here rather than on each page: a per-page class is one somebody
        // forgets on the next page, and the failure is a page whose owner
        // picked a style that silently did nothing.
        className={cn(
          SKIN_SCOPE,
          // **The padding is narrower on a phone, and that is load-bearing
          // rather than cosmetic.** The editor nests a card inside this column
          // inside an item box, and at `px-6` throughout the chrome alone was
          // 88px of a 360px screen — which is what pushed the form off the
          // right-hand edge there. `responsive.spec.ts` measures it.
          "flex w-full min-w-0 flex-1 flex-col",
          // The padding and the centring belong to the COLUMN, not to `main`.
          // A full-width public page has neither: each depth-0 section owns
          // its measure and first/between/last chrome independently.
          COLUMN[width],
        )}
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
 * Its padding is tighter below `sm`: this is the outermost of the nested boxes
 * the editor stacks, and at `p-6` throughout they took 88px of a 360px screen.
 *
 * Translucent so the nebula shows through, with a border that carries the
 * separation: at these lightness levels the fill alone cannot reach 3:1
 * against the field, so the border is doing the accessibility work rather
 * than the background. Do not remove it to "clean up" the look.
 *
 * Carries the `card` test id.
 * **It carries `surface`, and that class is the whole of how a skin reaches it.** It also keeps its own `shadow-sm`, which now beats the skin's shadow by the ordinary utility ordering — the hand-written `:not([class*="shadow"])` that used to be needed for exactly this is gone.
 * Every colour it paints comes from a token — `--bar`, `--edge`, `--surface` — and never from a literal. That is what lets a person's theme reach it at all.
 */
export function Card({ children }: CardProps) {
  return (
    <div
      className="rounded-2xl surface border-(--edge) bg-(--surface) p-4 shadow-sm backdrop-blur-md sm:p-6"
      {...tid("card")}
    >
      {children}
    </div>
  );
}
