"use client";

import { useEffect, useState, type ReactNode } from "react";
import { PublicBlocks } from "@/features/actors/presentation/blocks";
import {
  PREVIEW_READY,
  readPreviewDraft,
  type PreviewDraft,
} from "@/features/actors/presentation/preview-message";
import { ThemeScope } from "@/features/actors/presentation/theme-scope";
import { PageContent } from "@/shared/presentation/page-content";

/**
 * Somebody's draft page, rendered as its own document.
 *
 * **This is the whole point of the preview route: a second VIEWPORT.** An
 * inline preview shares the editor's window, so everything anchored to the
 * viewport — `background-attachment: fixed`, `cover`, the outermost container
 * query — resolves against a box the workbench is in. Measured on a real page,
 * that put up to 72.6% of a section's pixels somewhere else while every box
 * matched to the sub-pixel; the controlling measurement is that scrolling ONE
 * document by 120px moved the same section's backdrop by 71.2%. The two
 * documents were never disagreeing. See
 * `docs/superpowers/specs/2026-08-26-preview-route-design.md`.
 *
 * **It holds nothing of its own and reads nothing.** No actor, no auth, no
 * visibility decision — so this is not a second place deciding what may be
 * shown, which `PublicProfile`'s own note forbids, and a stranger who opens
 * the URL gets an empty document. If the channel ever fails, the preview is
 * visibly EMPTY rather than quietly showing content the author would read as
 * their draft.
 *
 * **It announces itself rather than waiting to be found.** The parent sends
 * nothing until this posts `PREVIEW_READY`, because the obvious alternative —
 * the parent posting on the iframe's `load` — rests on a premise about what
 * has already run. `load` says the document loaded, not that this effect has
 * committed. Rule 26 in the root `CLAUDE.md` is that exact shape, and its
 * failure mode is not a flake that gets rarer on a fast machine but a
 * deterministic loss on a heavier page.
 *
 * The announcement is posted AFTER `addEventListener` in the same effect, so
 * there is no window in which the parent can answer a listener that does not
 * exist yet.
 *
 * @returns the draft page, or nothing until one arrives.
 */
export function PreviewDocument(): ReactNode {
  const [draft, setDraft] = useState<PreviewDraft | null>(null);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      // Both, and neither alone: an origin check by itself lets any document
      // on this origin drive the preview, and a source check by itself lets
      // any document claim to be the parent. `EmbedFrame` established this.
      if (event.origin !== globalThis.location.origin) return;
      if (event.source !== window.parent) return;
      const next = readPreviewDraft(event.data);
      if (next) setDraft(next);
    };

    window.addEventListener("message", onMessage);
    window.parent.postMessage(
      { kind: PREVIEW_READY },
      globalThis.location.origin,
    );
    return () => window.removeEventListener("message", onMessage);
  }, []);

  if (!draft) return null;

  return (
    <ThemeScope theme={draft.theme}>
      {/* `full`, so each depth-0 section applies its own measure and bleed
          exactly as it does on a public route. A column here would cap the two
          widest measures and stop a bled section reaching either edge. */}
      <PageContent width="full">
        <PublicBlocks
          blocks={draft.blocks}
          locale={draft.locale}
          page={draft.page}
        />
      </PageContent>
    </ThemeScope>
  );
}
