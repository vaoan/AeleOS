"use client";

import type { ReactNode } from "react";
import {
  CONTAINER_MODES,
  LEAF_KINDS,
  type ContainerMode,
  type LeafKind,
} from "@/features/actors/domain/block-schema";
import {
  sampleContainer,
  sampleLeaf,
} from "@/features/actors/domain/add-samples";
import {
  Block as PublicBlock,
  type PageContext,
} from "@/features/actors/presentation/blocks";
import { CHROME_SCOPE } from "@/shared/domain/chrome";
import { tid } from "@/shared/infrastructure/test-id";

/**
 * What {@link AddPalette} needs.
 *
 * **`page` and `locale` are not in the design brief's own interface, and
 * that is a gap this component closes rather than reproduces.** The brief
 * asked for `AddPaletteProps` to carry only `labels`, but every thumbnail
 * here is drawn by the same real renderer `AddBlockPicker` already uses —
 * `Block` from `blocks.tsx` — and that renderer's own signature requires a
 * `PageContext` and a locale to resolve an owner link, a fursona list and
 * every other actor-aware leaf a sample might (in principle) draw. Omitting
 * them would have made this component either throw or silently render with
 * an invented, disconnected context the caller has no way to supply — so
 * they are added here, threaded exactly as `AddBlockPickerProps` already
 * threads them.
 *
 * `labels.kindNames`/`modeNames` reuse the SAME per-kind/per-mode catalogue
 * `AddBlockPicker` already reads — `leafKinds`/`modes` in `pages/labels.ts`
 * — so a caller builds this bag from strings it already has rather than a
 * second translated vocabulary kept in step with the first by hand.
 */
export interface AddPaletteProps {
  /** Already-translated strings. */
  readonly labels: {
    /** Heading over the leaf-kind thumbnails. */
    readonly contentGroup: string;
    /** Heading over the container-mode thumbnails. */
    readonly layoutGroup: string;
    /** One caption per leaf kind, keyed by kind. */
    readonly kindNames: Record<LeafKind, string>;
    /** One caption per container mode, keyed by mode. */
    readonly modeNames: Record<ContainerMode, string>;
  };
  /** Threaded to every preview, exactly as the canvas renderer needs it. */
  readonly page: PageContext;
  /** Which language's fields the previews read. */
  readonly locale: string;
}

/**
 * The persistent Palette tab's content: a grouped list of compact
 * thumbnails, one per leaf kind and one per container mode, drawn by the
 * real renderer over fixed sample content.
 *
 * **Static and non-interactive for now (2026-09-05) — a checkpoint, not the
 * finished feature.** Each thumbnail is a plain `<div>` that cannot take
 * focus and starts no drag: this ships the FIRST user-visible piece of
 * "drag-to-add from a palette tab," the thumbnails themselves and their
 * captions, while the modal `AddBlockPicker` remains the only way to
 * actually add a block. A later task makes a thumbnail a real
 * `useDraggable` source and gives it a role; this one does not, on purpose,
 * so there is nothing here yet that looks interactive and is not.
 *
 * **Mirrors `AddBlockPicker`'s own preview mechanism exactly**, down to the
 * `inert` wrap: `player`/`jukebox` samples render real transport `<button>`s
 * through the same renderer, and a clickable ancestor may not contain
 * interactive content at all (`nested-interactive`, an axe rule) — `inert`
 * removes the whole preview from the accessibility tree, from focus, and
 * from hit-testing, which is what will let a future drag start from
 * anywhere on the thumbnail without a transport button underneath it
 * swallowing the gesture.
 *
 * **Every thumbnail is SHRUNK by its own wrapper**, `max-h-24 overflow-hidden`,
 * rather than by anything the renderer itself knows about — the same renderer
 * draws a full-size preview in `AddBlockPicker`'s
 * dialog, and clipping it here is purely a matter of how much room a
 * persistent tab can spend on one caption.
 *
 * **The sample is never what gets added.** `sampleLeaf`/`sampleContainer`
 * exist only to draw a thumbnail — see their own TSDoc — and nothing here
 * hands their output anywhere a save could reach it, since this component
 * has no `onAdd` of any kind yet.
 *
 * Rendered inside `CHROME_SCOPE`, never `SKIN_SCOPE`: this shows what a KIND
 * or a MODE is, not what an author's own page will make of it.
 *
 * @param props - see {@link AddPaletteProps}.
 * @returns the grouped thumbnail list.
 */
export function AddPalette(props: AddPaletteProps): ReactNode {
  const { labels, page, locale } = props;
  return (
    <div className={`${CHROME_SCOPE} grid gap-4`}>
      <div className="grid gap-2">
        <p className="text-xs font-medium text-(--muted)">
          {labels.contentGroup}
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {LEAF_KINDS.map((kind) => (
            <div
              key={kind}
              {...tid("palette-item")}
              data-palette-kind={kind}
              className="grid gap-1.5 rounded-lg surface border-(--edge)/60 p-2 text-left text-sm"
            >
              <span className="text-xs font-medium text-(--muted)">
                {labels.kindNames[kind]}
              </span>
              <div className={`${CHROME_SCOPE} max-h-24 overflow-hidden`} inert>
                <PublicBlock
                  block={sampleLeaf(kind)}
                  locale={locale}
                  depth={1}
                  path="preview"
                  page={page}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-2">
        <p className="text-xs font-medium text-(--muted)">
          {labels.layoutGroup}
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {CONTAINER_MODES.map((mode) => (
            <div
              key={mode}
              {...tid("palette-item")}
              data-palette-mode={mode}
              className="grid gap-1.5 rounded-lg surface border-(--edge)/60 p-2 text-left text-sm"
            >
              <span className="text-xs font-medium text-(--muted)">
                {labels.modeNames[mode]}
              </span>
              <div className={`${CHROME_SCOPE} max-h-24 overflow-hidden`} inert>
                <PublicBlock
                  block={sampleContainer(mode)}
                  locale={locale}
                  depth={1}
                  path="preview"
                  page={page}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
