"use client";

import type { ReactNode } from "react";
import {
  PREVIEW_ATMOSPHERE,
  previewThemeCss,
  type ActorTheme,
} from "@/features/actors/domain/actor-theme";
import { SKIN_SCOPE } from "@/shared/domain/skins";
import { cn } from "@/shared/infrastructure/cn";
import { tid } from "@/shared/infrastructure/test-id";

/**
 * Where the atmosphere behind one preview comes from.
 *
 * `own` paints the author's field on the host itself, which is what a bounded
 * workbench tray needs: it is a card among controls and there is no page-scale
 * backdrop for it to sit on.
 *
 * `document` paints nothing and lets `body` and the root canvas show through.
 * Only a caller that has ALSO put the author's atmosphere on the document may
 * ask for it — otherwise the host shows the app's field behind somebody's
 * page, which is the opposite of what this exists for.
 */
export type PreviewAtmosphere = "own" | "document";

/**
 * What {@link PreviewThemeHost} needs to contain an editor preview.
 *
 * A theme and its content, plus where the backdrop behind them comes from.
 * That last is the caller's to decide because only the caller knows whether
 * anything has put the author's atmosphere on the document — see
 * {@link PreviewAtmosphere}.
 */
export interface PreviewThemeHostProps {
  /** The unsaved theme the editor is showing. */
  theme: ActorTheme;
  /** Preview content that may receive the theme. */
  children: ReactNode;
  /** Presentation classes the preview surface adds to its boundary. */
  className?: string;
  /**
   * Where the backdrop comes from. Defaults to `own`.
   *
   * See {@link PreviewAtmosphere} for the obligation `document` puts on the
   * caller.
   */
  atmosphere?: PreviewAtmosphere;
}

/**
 * Contains an unsaved theme inside one editor preview.
 *
 * This client-only boundary is deliberately separate from the public
 * `ThemeScope`: public pages theme the document, while editor chrome must stay
 * outside every declaration this host applies.
 *
 * Its stylesheet stays unlayered so these live author declarations beat the
 * app's layered token defaults inside the dedicated host. Selector containment,
 * rather than a weaker cascade layer, keeps them away from workbench chrome.
 *
 * **It consumes `--field` and `--ink` itself because `body` does**, and a token
 * this host overrides cannot reach a declaration already resolved on an
 * ancestor. `globals.css` paints the field and sets the page's text colour on
 * `body`; both are computed there against the APP's tokens, so without these
 * two utilities a preview showed author-coloured surfaces carrying app-coloured
 * writing. `previewThemeCss` covers the same hazard for the properties
 * `globals.css` composes at `:root`.
 *
 * **`--ink` is applied in BOTH modes and `--field` in only one**, which is the
 * asymmetry to keep straight. `--ink` is a control token and never reaches the
 * document at all, so a preview that did not restate it would carry the app's
 * writing colour whatever is behind it. `--field` is atmosphere, and a host
 * wearing the document's atmosphere has `body` painting it already.
 *
 * **A host that paints its own field cannot show the canvas, and that is the
 * whole reason `atmosphere` exists.** `NebulaCanvas` is `fixed inset-0 -z-10`
 * in the root layout, so on a public page it paints between `body`'s field and
 * the content and its clouds show through every gutter. An opaque background on
 * an in-flow element covers a negative layer completely — measured, not
 * reasoned: a page with a nebula photographed mottled at its public address and
 * perfectly smooth in the complete preview. Declining to paint is what lets the
 * real canvas and the real window-anchored field through, which is also the
 * only mechanism here that closes the `background-attachment` gap below.
 *
 * **The field is deliberately NOT `background-attachment: fixed` in `own`
 * mode, even though `body`'s is**, and that was measured rather than assumed.
 * Copying the attachment anchors the author's gradient to the WINDOW, so the
 * slice showing behind a section becomes a function of where that section
 * happens to sit on screen — which differs between a published page and a
 * section part-way down an editor. Measured against the public page, `fixed`
 * put the sections 29 channels out where painting on this box leaves them
 * within 7. That trade-off still binds every tray; `document` mode escapes it
 * entirely by not painting.
 *
 * @returns the preview content inside its scoped theme boundary.
 */
export function PreviewThemeHost({
  theme,
  children,
  className = "",
  atmosphere = "own",
}: PreviewThemeHostProps): ReactNode {
  const css = previewThemeCss(theme);
  // Held outside the `className` expression: `better-tailwindcss` reads string
  // literals there as class names, and a conditional one written inline is
  // reported as an unknown class. Same reason `PublicBlocks` resolves its
  // measure first.
  const ownField = atmosphere === "own" ? "[background:var(--field)]" : null;
  return (
    <>
      {css ? <style>{css}</style> : null}
      <div
        data-preview-theme=""
        {...(atmosphere === "document"
          ? { [PREVIEW_ATMOSPHERE]: "document" }
          : {})}
        {...tid("preview-theme-host")}
        className={cn(SKIN_SCOPE, "text-(--ink)", ownField, className)}
      >
        {children}
      </div>
    </>
  );
}
