"use client";

import { useDraggable } from "@dnd-kit/core";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react";
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
import { paletteId } from "@/features/actors/domain/block-drag";
import type { PaletteItem } from "@/features/actors/domain/palette-targets";
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

/** What one {@link PaletteThumbnail} needs. */
interface PaletteThumbnailProps {
  /** What this thumbnail offers — a leaf kind or a container mode. */
  readonly item: PaletteItem;
  /** The already-translated caption shown above the preview. */
  readonly caption: string;
  /** Threaded to the preview, exactly as the canvas renderer needs it. */
  readonly page: PageContext;
  /** Which language's fields the preview reads. */
  readonly locale: string;
}

/**
 * One draggable palette thumbnail: a caption over a real-renderer preview.
 *
 * **A real `useDraggable` source, wired exactly as `EditableBlockFrame`
 * demonstrates for the mouse case (2026-09-05), and by keyboard too
 * (2026-09-05, this task).** `onPointerDown` calls `listeners.onPointerDown`
 * only for `event.pointerType === "mouse"` — touch reaches it in a later
 * task, still deliberately excluded — while `onKeyDown` calls
 * `listeners.onKeyDown` UNCONDITIONALLY: `KeyboardSensor`'s own activator
 * only reacts to `keyboardCodes.start` (Space and Enter by default), so
 * wiring it costs nothing on every other keypress and lets `attributes`'
 * own `tabIndex={0}` make the thumbnail a genuine Tab stop before any drag
 * begins. **A second, explicit `tabIndex={0}` sits beside the spread**
 * (2026-09-05, this task) — `attributes` already carries the same value, so
 * this changes nothing at runtime, but `eslint-plugin-jsx-a11y`'s
 * `interactive-supports-focus` cannot see through a spread to confirm a
 * `role="button"` element is focusable, and refuses the file without an
 * attribute it can read directly. A thumbnail is always "filled" — unlike
 * an empty canvas place, there is no `disabled` condition to add.
 *
 * `role="button"` and `aria-label` name the item explicitly rather than
 * relying on the preview's own text content, matching `AddBlockPicker`'s own
 * `role="button"` convention for a non-native-button interactive element
 * that must not itself be a `<button>` — a `player`/`jukebox` preview draws
 * real transport controls, which a `<button>` may not contain at all.
 *
 * @param props - see {@link PaletteThumbnailProps}.
 * @returns the thumbnail.
 */
function PaletteThumbnail(props: PaletteThumbnailProps): ReactNode {
  const { item, caption, page, locale } = props;
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: paletteId(item),
  });
  const block =
    item.kind === "leaf"
      ? sampleLeaf(item.leafKind)
      : sampleContainer(item.mode);
  const dataAttr =
    item.kind === "leaf"
      ? { "data-palette-kind": item.leafKind }
      : { "data-palette-mode": item.mode };

  const beginDesktopDrag = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.pointerType !== "mouse") return;
    listeners?.onPointerDown?.(event);
  };

  const beginKeyboardDrag = (
    event: ReactKeyboardEvent<HTMLDivElement>,
  ): void => {
    listeners?.onKeyDown?.(event);
  };

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      tabIndex={0}
      role="button"
      aria-label={caption}
      {...tid("palette-item")}
      {...dataAttr}
      onPointerDown={beginDesktopDrag}
      onKeyDown={beginKeyboardDrag}
      className="grid gap-1.5 rounded-lg surface border-(--edge)/60 p-2 text-left text-sm"
    >
      <span className="text-xs font-medium text-(--muted)">{caption}</span>
      {/* `inert`, mirroring `AddBlockPicker`'s own preview: a `player`/
          `jukebox` sample renders real transport buttons through the same
          renderer, so the preview is removed from the accessibility tree,
          from focus and from hit-testing — a click or a drag anywhere on
          the thumbnail reaches this component rather than a control inside
          its own preview. */}
      <div className={`${CHROME_SCOPE} max-h-24 overflow-hidden`} inert>
        <PublicBlock
          block={block}
          locale={locale}
          depth={1}
          path="preview"
          page={page}
        />
      </div>
    </div>
  );
}

/**
 * The persistent Palette tab's content: a grouped list of compact
 * thumbnails, one per leaf kind and one per container mode, drawn by the
 * real renderer over fixed sample content.
 *
 * **Real drag sources by pointer AND by keyboard (2026-09-05).** Each
 * thumbnail is a real `useDraggable` — see {@link PaletteThumbnail} — that
 * begins a drag from a mouse press or from Space/Enter on a focused
 * thumbnail, mirroring `EditableBlockFrame`'s own mouse-only wiring for the
 * pointer half and `block-editor.tsx`'s `paletteCoordinateAt` for the
 * keyboard half: arrow keys step through the palette's own ordered targets,
 * Tab and Shift+Tab skip to the next or previous top-level section. Touch is
 * still a later task in this same feature.
 *
 * **The sample is never what gets added.** `sampleLeaf`/`sampleContainer`
 * exist only to draw a thumbnail — see their own TSDoc — and choosing what a
 * dropped thumbnail actually adds is `BlockEditor`'s own job, built from the
 * dragged {@link PaletteItem} rather than from this preview's content.
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
            <PaletteThumbnail
              key={kind}
              item={{ kind: "leaf", leafKind: kind }}
              caption={labels.kindNames[kind]}
              page={page}
              locale={locale}
            />
          ))}
        </div>
      </div>
      <div className="grid gap-2">
        <p className="text-xs font-medium text-(--muted)">
          {labels.layoutGroup}
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {CONTAINER_MODES.map((mode) => (
            <PaletteThumbnail
              key={mode}
              item={{ kind: "container", mode }}
              caption={labels.modeNames[mode]}
              page={page}
              locale={locale}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
