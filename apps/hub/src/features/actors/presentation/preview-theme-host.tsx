"use client";

import type { ReactNode } from "react";
import {
  previewThemeCss,
  type ActorTheme,
} from "@/features/actors/domain/actor-theme";
import { SKIN_SCOPE } from "@/shared/domain/skins";
import { tid } from "@/shared/infrastructure/test-id";

/** What {@link PreviewThemeHost} needs to contain an editor preview. */
export interface PreviewThemeHostProps {
  /** The unsaved theme the editor is showing. */
  theme: ActorTheme;
  /** Preview content that may receive the theme. */
  children: ReactNode;
  /** Presentation classes the preview surface adds to its boundary. */
  className?: string;
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
 * **THIS IS A TRAY'S HOST ONLY.** It briefly had a second mode that painted
 * nothing, so the complete preview could show the document's own canvas and
 * window-anchored field through itself. That mode is gone with the inline
 * complete preview: the preview is a real document at
 * `/{locale}/me/preview` now, with a real `body` and its own canvas, and an
 * option with no caller is what `COLUMN.full` already cost this app twice.
 *
 * **The field is deliberately NOT `background-attachment: fixed`, even though
 * `body`'s is**, and that was measured rather than assumed. Copying the
 * attachment anchors the author's gradient to the WINDOW, so the slice showing
 * behind a section becomes a function of where that section happens to sit on
 * screen. Measured against the public page, `fixed` put the sections 29
 * channels out where painting on this box leaves them within 7.
 *
 * That trade-off still binds every tray and cannot be escaped here, which is
 * the honest limit of a bounded preview: a tray is a card among controls, and
 * there is no page-scale backdrop for it to sit on. The complete preview
 * escapes it by being a page.
 *
 * @returns the preview content inside its scoped theme boundary.
 */
export function PreviewThemeHost({
  theme,
  children,
  className = "",
}: PreviewThemeHostProps): ReactNode {
  const css = previewThemeCss(theme);
  return (
    <>
      {css ? <style>{css}</style> : null}
      <div
        data-preview-theme=""
        {...tid("preview-theme-host")}
        className={`${SKIN_SCOPE} text-(--ink) [background:var(--field)] ${className}`}
      >
        {children}
      </div>
    </>
  );
}
