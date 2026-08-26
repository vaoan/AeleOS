"use client";

import { useId, useState, type ReactNode } from "react";
import type { AuthoringLanguage } from "@/features/actors/application/use-language-toggle";
import {
  atmosphereCss,
  type ActorTheme,
} from "@/features/actors/domain/actor-theme";
import {
  lenientBlockSchema,
  type Block,
} from "@/features/actors/domain/block-schema";
import {
  PublicBlocks,
  type PageContext,
} from "@/features/actors/presentation/blocks";
import { PreviewThemeHost } from "@/features/actors/presentation/preview-theme-host";
import { tid } from "@/shared/infrastructure/test-id";
import { WidePageColumn } from "@/shared/presentation/page-shell";

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
 * real public renderer only while open, and only then lenient-parses each draft
 * block, so a closed disclosure does no recursive work on a keystroke. It
 * offers no editing or drag controls. Its caller keeps it outside the drag
 * context, so preview geometry cannot become a drop target or alter collision
 * measurement.
 *
 * Its disclosure control keeps the editor's former wide-column geometry, but
 * the preview host itself is a full-width sibling of that column. Depth-zero
 * sections therefore apply the same measure and bleed as the public route, and
 * container queries answer to the page rather than the workbench. The host has
 * no card chrome of its own.
 *
 * **It is not a SCROLL CONTAINER, and it was one until 2026-08-25.** The host
 * carried `overflow-x-auto` so horizontal excess would scroll inside the
 * preview rather than dragging the workbench sideways. What that overlooked is
 * that `overflow-x: auto` with `overflow-y: visible` computes the visible axis
 * to `auto` as well — measured, not read off the spec — so the box clipped ink
 * on all four edges. Ink overflow is not scrollable overflow, so nothing
 * scrolled and no scrollbar appeared: a shadow was simply gone. A bled,
 * margin-less, unnamed section is flush with the host's own edge, and a
 * `neobrutalism` banner's hard cast measured 77.33 channels over the field
 * below it on the page against **0.00** here. `main` on the public route is
 * not a scroll container either, so removing it is what makes the two boxes
 * the same kind of box.
 *
 * That was measured at the page's FOOT rather than its head, and the reason is
 * worth carrying: above a first section sits the page bar, which is opaque and
 * paints over the halo, so the public page lifts 0 channels there too. A guard
 * written at the top would have agreed with a clipped preview for entirely the
 * wrong reason.
 *
 * Horizontal excess is still reachable and still never clipped — the DOCUMENT
 * scrolls, exactly as it does for a stranger reading an over-wide page. Nothing
 * between this content and the document may clip, which is what
 * `complete-page-fidelity.spec.ts` asserts; and `responsive.spec.ts` measures
 * at every phone stop that there is no excess to reach in the first place.
 *
 * **Opening it puts the author's ATMOSPHERE on the editor document, and the
 * host then paints no backdrop of its own.** That is the only arrangement in
 * which a preview can show what sits BEHIND a page: the nebula canvas is
 * `fixed inset-0 -z-10` in the root layout, so an opaque in-flow backdrop hides
 * it outright, and the field is `background-attachment: fixed` on `body`, so a
 * copy painted on this box stretches over the whole document instead of over
 * the window. Letting both through is exactly the public composition rather
 * than an approximation of it.
 *
 * **This widens the trigger the theme panel established; it does not weaken
 * the boundary.** The set that reaches the document is `atmosphereCss`'s
 * closed one — field, picture, canvas — so no control token moves and the
 * workbench keeps its own surfaces, borders and writing. What changes is that
 * atmosphere is now live while EITHER page-scale surface is open, because both
 * are places where a page-scale choice has to be judged. With both closed the
 * builder's resting state is untouched.
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
  let content: ReactNode = null;
  if (open) {
    const renderableBlocks = blocks.flatMap((block) => {
      const parsed = lenientBlockSchema.safeParse(block);
      return parsed.success ? [parsed.data] : [];
    });
    const atmosphere = atmosphereCss(theme);
    content = (
      <>
        {/* The document wears the author's field, background picture and
            canvas while this is open — the same closed set, from the same
            emitter, that the theme panel mounts. Unmounting restores the app's
            atmosphere through the cascade; nothing is reset by hand. */}
        {atmosphere ? <style>{atmosphere}</style> : null}
        <PreviewThemeHost
          theme={theme}
          atmosphere="document"
          className="w-full min-w-0"
        >
          <div id={contentId} {...tid("complete-page-preview-content")}>
            <PublicBlocks blocks={renderableBlocks} locale={lang} page={page} />
          </div>
        </PreviewThemeHost>
      </>
    );
  }

  return (
    <section
      {...tid("complete-page-preview")}
      className="mt-8 grid min-w-0 gap-3 pb-6 sm:pb-10"
    >
      <WidePageColumn className="flex-none py-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-bold">{labels.title}</h2>
          <button
            type="button"
            aria-controls={open ? contentId : undefined}
            aria-expanded={open}
            {...tid("complete-page-preview-toggle")}
            onClick={() => setOpen((current) => !current)}
            className="rounded-lg surface border-(--edge) px-3 py-2 text-sm font-medium"
          >
            {open ? labels.collapse : labels.expand}
          </button>
        </div>
      </WidePageColumn>

      {content}
    </section>
  );
}
