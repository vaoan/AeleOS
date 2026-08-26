import type { ReactNode } from "react";
import { SKIN_SCOPE } from "@/shared/domain/skins";
import { cn } from "@/shared/infrastructure/cn";
import { tid } from "@/shared/infrastructure/test-id";

/**
 * How wide a page lays its content column.
 *
 * `column` carries `justify-center`, which with `flex-1` centres a SHORT page
 * and leaves a long one scrolling from the top — so sign-in sits in the middle
 * of the field instead of clinging to the header with a third of the window
 * empty beneath it, without becoming a different layout.
 *
 * `full` drops both horizontal and vertical chrome. Public pages apply their
 * measure and first/between/last spacing to each depth-0 section, so `main`
 * must hold nothing back: no maximum, centring, gutter or page-edge padding.
 * That ownership is what lets one section become a flush banner or footer
 * without making either a page-level exception.
 */
export const COLUMN: Record<"column" | "wide" | "full", string> = {
  column: "mx-auto max-w-[620px] justify-center px-4 py-6 sm:px-6 sm:py-10",
  wide: "mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10",
  full: "",
};

/** What {@link PageContent} needs. */
export interface PageContentProps {
  /** Which column the content sits in. */
  width: keyof typeof COLUMN;
  /** The page. */
  children: ReactNode;
}

/**
 * The `main` element a page's content lives in.
 *
 * **Separate from `PageShell` because a document can need a page's content
 * column WITHOUT the app's bar**, and exactly one does: the preview route,
 * which is meant to BE somebody's page rather than to sit inside the app. It
 * was extracted rather than restated for the reason the `SKIN_SCOPE` note
 * below gives — a second declaration is one somebody forgets.
 *
 * **`SKIN_SCOPE` is where a skin stops.** A page's owner restyles their own
 * content; a bar above, where there is one, keeps the app's shape, because the
 * language and theme toggles live there and a control that changes form on
 * somebody else's page is harder to recognise as one. The colours are not
 * scoped this way and cannot be — they have to reach the canvas and the field,
 * which are mounted outside this element.
 *
 * Set here rather than on each page: a per-page class is one somebody forgets
 * on the next page, and the failure is a page whose owner picked a style that
 * silently did nothing.
 *
 * Its fields are documented on {@link PageContentProps} rather than as
 * `@param` blocks: `jsdoc/check-param-names` demands one entry per
 * destructured member and `tsdoc/syntax` refuses the dotted name that would
 * take, so a destructuring component in this repository documents its shape on
 * the interface and carries no `@param` at all. `PreviewThemeHost` is the same
 * shape for the same reason.
 *
 * @returns the content element.
 */
export function PageContent({ width, children }: PageContentProps): ReactNode {
  return (
    <main
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
        // its measure and first/between/last chrome independently. The
        // signed-in layout also uses full here, then restores the old wide
        // box at each route so a complete preview can remain outside it.
        COLUMN[width],
      )}
      {...tid("page-content")}
    >
      {children}
    </main>
  );
}
