"use client";

import type { ReactNode } from "react";
import {
  lenientBlockSchema,
  type ContainerBlock,
} from "@/features/actors/domain/block-schema";
import type { AuthoringLanguage } from "@/features/actors/application/use-language-toggle";
import {
  Block,
  DEFAULT_PAGE_MEASURE,
  pageBoxClass,
  type PageContext,
} from "@/features/actors/presentation/blocks";
import { tid } from "@/shared/infrastructure/test-id";

/** What {@link SectionPreviewTray} needs to render one live section. */
interface SectionPreviewTrayProps {
  /** The in-progress section tree. */
  block: ContainerBlock;
  /** Its top-level position, which keeps renderer ids distinct. */
  position: number;
  /** How many top-level blocks the page holds. */
  count: number;
  /** The authored language the preview should show. */
  lang: AuthoringLanguage;
  /** Live actor facts consumed by identity leaves. */
  page: PageContext;
}

/**
 * Draws an in-progress section exactly as a public page draws it.
 *
 * **It paints NOTHING of its own, and that is the whole of the change.** It
 * used to be a card: a label, padding, a rounded face carrying `--surface` at
 * 90% alpha, a border, and the author's `--field` on an in-flow box. Every one
 * of those was the editor's furniture standing between the author and their
 * page — and the field in particular covered the nebula canvas outright, since
 * `NebulaCanvas` is `fixed inset-0 -z-10` in the root layout and an in-flow
 * background simply paints on top of it. A block with no background of its own
 * showed a card where the page shows the sky.
 *
 * The document carries the theme now — `FursonaEditor` mounts `ThemeScope` with
 * the live draft, exactly as a public route does with a stored one — so the
 * field, the background picture and the canvas are all behind this already, and
 * anything painted here would be in front of them.
 *
 * **It lays the real page box**, through the same `pageBoxClass` `PublicBlocks`
 * uses: the author's measure, `bleed`, `margins`, and first/between/last
 * spacing. A caller may assume a section here is the size and position it will
 * be on the page, and that the container queries inside it answer to the page's
 * width rather than to the workbench's.
 *
 * **`overflow` is not set, and must not be.** The host carried `overflow-x-auto`
 * so excess would scroll inside the preview rather than drag the workbench —
 * and a `visible` axis paired with a non-visible one computes to `auto`, so the
 * box clipped on all four edges. Ink overflow is not scrollable overflow, so
 * nothing scrolled and no scrollbar appeared: every `neon` glow and `comic`
 * shadow was simply gone. The document scrolls instead, which is exactly what a
 * stranger gets on an over-wide page.
 *
 * A malformed in-progress block draws nothing rather than taking down the
 * editor.
 *
 * This mounts the real renderer's third-party frames while their author edits.
 * That discloses the author's request to the same allowlisted providers a
 * published page uses, and is accepted because an embed is exactly the content
 * an author must verify before publishing.
 *
 * @returns the live section in its page box, or nothing when it cannot be read.
 */
export function SectionPreviewTray({
  block,
  position,
  count,
  lang,
  page,
}: SectionPreviewTrayProps): ReactNode {
  const parsed = lenientBlockSchema.safeParse(block);
  if (!parsed.success) return null;

  return (
    <div
      {...tid("block-preview")}
      className={pageBoxClass(
        parsed.data,
        position,
        count,
        page.measure ?? DEFAULT_PAGE_MEASURE,
      )}
    >
      <Block
        block={parsed.data}
        locale={lang}
        depth={0}
        path={`preview-${position}`}
        page={page}
      />
    </div>
  );
}
