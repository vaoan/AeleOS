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
        className={`${SKIN_SCOPE} [background:var(--field)] ${className}`}
      >
        {children}
      </div>
    </>
  );
}
