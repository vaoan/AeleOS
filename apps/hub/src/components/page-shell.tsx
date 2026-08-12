import type { ReactNode } from "react";
import { NebulaToggle } from "@/components/nebula-toggle";

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
 */
export function PageShell({ children, toggleLabel, trailing }: PageShellProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-[var(--edge)]/40 bg-[var(--bar)] backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[620px] items-center gap-2 px-6 py-3">
          <NebulaToggle label={toggleLabel} />
          <span className="font-display text-lg font-bold tracking-tight">
            AeleOS
          </span>
          {trailing ? <div className="ml-auto">{trailing}</div> : null}
        </div>
      </header>
      <main className="mx-auto w-full max-w-[620px] flex-1 px-6 py-10">
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
 */
export function Card({ children }: CardProps) {
  return (
    <div className="rounded-2xl border border-[var(--edge)] bg-[var(--surface)] p-6 shadow-sm backdrop-blur-md">
      {children}
    </div>
  );
}
