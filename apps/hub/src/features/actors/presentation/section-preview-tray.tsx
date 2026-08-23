"use client";

import type { CSSProperties, ReactNode } from "react";
import type { ActorTheme } from "@/features/actors/domain/actor-theme";
import {
  lenientBlockSchema,
  type Block as PageBlock,
} from "@/features/actors/domain/block-schema";
import type { AuthoringLanguage } from "@/features/actors/application/use-language-toggle";
import { blockStyle } from "@/features/actors/presentation/block-style";
import { Block, type PageContext } from "@/features/actors/presentation/blocks";
import { PreviewThemeHost } from "@/features/actors/presentation/preview-theme-host";
import { tid } from "@/shared/infrastructure/test-id";

/** What {@link SectionPreviewTray} needs to render one live section. */
interface SectionPreviewTrayProps {
  /** The in-progress section tree. */
  block: PageBlock;
  /** Its top-level position, which keeps renderer ids distinct. */
  position: number;
  /** The authored language the preview should show. */
  lang: AuthoringLanguage;
  /** Live actor facts consumed by identity leaves. */
  page: PageContext;
  /** The in-progress page theme contained inside the preview. */
  theme: ActorTheme;
  /** Already-translated heading above the preview. */
  title: string;
}

/**
 * Separates properties children inherit from properties the boundary paints.
 *
 * @param style - the section style resolved by the public renderer's helper.
 * @returns each half, absent when it has no declarations.
 */
function splitStyle(style: CSSProperties | undefined): {
  inherited: CSSProperties | undefined;
  painted: CSSProperties | undefined;
} {
  const inherited: Record<string, unknown> = {};
  const painted: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(style ?? {})) {
    if (name.startsWith("--")) inherited[name] = value;
    else painted[name] = value;
  }
  return {
    inherited:
      Object.keys(inherited).length > 0
        ? (inherited as CSSProperties)
        : undefined,
    painted:
      Object.keys(painted).length > 0 ? (painted as CSSProperties) : undefined,
  };
}

/**
 * Draws an in-progress section with the real public renderer.
 *
 * The author theme and section style are contained here so neither can restyle
 * the workbench controls. A malformed in-progress block draws no tray content
 * rather than taking down the editor.
 *
 * @returns the themed live preview, or nothing when the block cannot be read.
 */
export function SectionPreviewTray({
  block,
  position,
  lang,
  page,
  theme,
  title,
}: SectionPreviewTrayProps): ReactNode {
  const parsed = lenientBlockSchema.safeParse(block);
  if (!parsed.success) return null;
  const { inherited, painted } = splitStyle(blockStyle(block.style));

  return (
    <div {...tid("block-preview")} className="grid gap-1.5">
      <span className="text-xs font-medium text-(--muted)">{title}</span>
      <PreviewThemeHost
        theme={theme}
        className="relative overflow-hidden rounded-xl"
      >
        <div style={inherited} className="relative p-3">
          <div
            aria-hidden
            {...tid("section-preview-face")}
            style={painted}
            className="pointer-events-none absolute inset-0 rounded-xl surface border-(--edge) bg-(--surface)"
          />
          <Block
            block={parsed.data}
            locale={lang}
            depth={0}
            path={`preview-${position}`}
            page={page}
          />
        </div>
      </PreviewThemeHost>
    </div>
  );
}
