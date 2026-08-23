"use client";

import { useId, useState, type ReactNode } from "react";
import type { AuthoringLanguage } from "@/features/actors/application/use-language-toggle";
import type { ActorTheme } from "@/features/actors/domain/actor-theme";
import type { Block } from "@/features/actors/domain/block-schema";
import {
  PublicBlocks,
  type PageContext,
} from "@/features/actors/presentation/blocks";
import { PreviewThemeHost } from "@/features/actors/presentation/preview-theme-host";
import { tid } from "@/shared/infrastructure/test-id";

/** Translated strings the complete page preview renders. */
export interface CompletePagePreviewLabels {
  /** Names the preview region. */
  title: string;
  /** Opens the complete page. */
  expand: string;
  /** Closes the complete page. */
  collapse: string;
}

/** What {@link CompletePagePreview} needs to render the current draft. */
export interface CompletePagePreviewProps {
  /** The live block tree held by the form. */
  blocks: Block[];
  /** The live, unsaved page theme. */
  theme: ActorTheme;
  /** The authoring language used by the real renderer. */
  lang: AuthoringLanguage;
  /** Live actor facts and page-level rendering context. */
  page: PageContext;
  /** Already-translated disclosure labels. */
  labels: CompletePagePreviewLabels;
}

/**
 * Shows the complete live page after the workbench.
 *
 * It starts collapsed so the builder remains the primary surface, mounts the
 * real public renderer only while open, and offers no editing or drag controls.
 * Its caller keeps it outside the drag context, so preview geometry cannot
 * become a drop target or alter collision measurement.
 *
 * @returns a read-only disclosure containing the current public page.
 */
export function CompletePagePreview({
  blocks,
  theme,
  lang,
  page,
  labels,
}: CompletePagePreviewProps): ReactNode {
  const [open, setOpen] = useState(false);
  const contentId = useId();

  return (
    <section className="mt-8 grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-bold">{labels.title}</h2>
        <button
          type="button"
          aria-controls={contentId}
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          className="rounded-lg surface border-(--edge) px-3 py-2 text-sm font-medium"
        >
          {open ? labels.collapse : labels.expand}
        </button>
      </div>

      {open ? (
        <PreviewThemeHost
          theme={theme}
          className="overflow-hidden rounded-xl surface border-(--edge)"
        >
          <div id={contentId} {...tid("complete-page-preview-content")}>
            <PublicBlocks blocks={blocks} locale={lang} page={page} />
          </div>
        </PreviewThemeHost>
      ) : null}
    </section>
  );
}
