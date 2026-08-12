import type { ReactNode } from "react";
import { NebulaToggle } from "@/components/nebula-toggle";
import { tid } from "@/lib/test-id";

/** What every page renders inside. */
export interface PageShellProps {
  /** The page's content, laid out in the shared column. */
  children: ReactNode;
  /** Accessible name for the star, from the message catalogue. */
  toggleLabel: string;
  /**
   * Optional header content pinned to the right — the user button when signed
   * in. A slot rather than a second shell, so signing in changes what is on
   * the page and never what the page looks like.
   */
  trailing?: ReactNode;
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
 * Exposes the `wordmark` and `page-content` test ids, which the end-to-end
 * suite selects by. The wordmark itself is a literal rather than a catalogue
 * entry because a proper noun reads the same in every language.
 *
 * The column centres itself vertically when the page is shorter than the
 * window, and scrolls from the top when it is longer. Sign-in used to cling to
 * the header with a third of the window empty beneath it; this fixes that for
 * every page at once rather than making sign-in a special case.
 */
export function PageShell({ children, toggleLabel, trailing }: PageShellProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-[var(--edge)]/40 bg-[var(--bar)] backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[620px] items-center gap-2 px-6 py-3">
          <NebulaToggle label={toggleLabel} />
          {/* The wordmark is a proper noun, so it is a literal rather than a
              catalogue entry — it reads the same in every language. */}
          <span
            className="font-display text-lg font-bold tracking-tight"
            {...tid("wordmark")}
          >
            AeleOS
          </span>
          {trailing ? <div className="ml-auto">{trailing}</div> : null}
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
