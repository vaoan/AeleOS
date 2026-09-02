"use client";

import { Plus } from "lucide-react";
import { useId, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  CONTAINER_MODES,
  type Block,
  type ContainerMode,
  type LeafKind,
} from "@/features/actors/domain/block-schema";
import {
  newContainer,
  newLeaf,
  type BlockPath,
} from "@/features/actors/domain/block-edits";
import {
  sampleContainer,
  sampleLeaf,
} from "@/features/actors/domain/add-samples";
import { formatBlockPath } from "@/features/actors/domain/editor-selection";
import {
  Block as PublicBlock,
  type PageContext,
} from "@/features/actors/presentation/blocks";
import { CHROME_SCOPE } from "@/shared/domain/chrome";
import { tid } from "@/shared/infrastructure/test-id";

/**
 * What {@link AddBlockPicker} needs.
 *
 * **One control adds, at every scope that can hold a block.** `targetPath`
 * carries no placement logic of its own — this component never calls
 * `addContentAt` — it is stamped onto the trigger as `data-target-path` so
 * more than one picker on one screen (an empty place beside a container
 * footer's, say) stays distinguishable to a test or to browser automation.
 * Placing the chosen block is the caller's job, through `onAdd`, exactly as
 * choosing which position `onAdd` writes to is the caller's.
 */
export interface AddBlockPickerProps {
  /**
   * Where this control adds, for the `data-target-path` it stamps on its own
   * trigger. Carries no behaviour here — see this interface's own note.
   */
  targetPath: BlockPath;
  /** Which leaf kinds this scope may hold, already narrowed by the caller. */
  kinds: readonly LeafKind[];
  /** Whether a container may be added here — `mayNest(targetPath)`. */
  mayAddLayout: boolean;
  /** Whether this scope is at `BLOCK_LIMITS.blocks` — renders nothing at all. */
  atBlockLimit: boolean;
  /** Already-translated strings. */
  labels: {
    /** Names the trigger. */
    readonly add: string;
    /** The dialog's own heading. */
    readonly title: string;
    /** Heading over the content options. */
    readonly contentGroup: string;
    /** Heading over the layout options. */
    readonly layoutGroup: string;
    /** Shown instead of the layout group where `mayAddLayout` is false. */
    readonly nestingAtLimit: string;
    /** One caption per leaf kind, keyed by kind. */
    readonly leafKinds: Record<LeafKind, string>;
    /** One caption per container mode, keyed by mode. */
    readonly modes: Record<ContainerMode, string>;
  };
  /** Threaded to every preview, exactly as the canvas renderer needs it. */
  page: PageContext;
  /** Which language's fields the previews read. */
  locale: string;
  /**
   * Adds the chosen block.
   *
   * Called with exactly what `newLeaf(kind)` or `newContainer(mode, 2)`
   * produces — never with {@link sampleLeaf}'s or {@link sampleContainer}'s
   * output, which exists only to draw the option and is discarded the moment
   * a choice is made.
   *
   * @param block - the block to add.
   */
  onAdd: (block: Block) => void;
}

/**
 * How many places a section added from the picker starts with.
 *
 * Matches the page-level Add-section control's own default
 * (`NEW_SPACES` in `block-editor.tsx`), so a layout chosen through either
 * route starts the same shape.
 */
const PICKER_SPACES = 2;

/**
 * One popup offering every content kind and, where nesting still admits one,
 * every layout — drawn with the real renderer, never a second illustration.
 *
 * **Content and layout are offered together, and the depth cap is the only
 * thing that removes either.** Where `mayAddLayout` is false, the layout
 * group is replaced by `labels.nestingAtLimit` rather than omitted silently —
 * the same courtesy `mayNest` already gives the editor everywhere else.
 *
 * **Each option is drawn by `Block` from `blocks.tsx`**, the same renderer a
 * public page uses, over fixed sample content from `domain/add-samples.ts`.
 * A preview is not the page: it renders inside `CHROME_SCOPE`, outside
 * `SKIN_SCOPE`, with the workbench's own tokens, so an author's palette never
 * repaints the picker and the picker never claims the page will look like
 * this once added. Previews mount only while the dialog is open, bounding how
 * many of the real renderer's leaves and containers exist at once.
 *
 * **Renders nothing at all at `BLOCK_LIMITS`.** A scope that cannot hold
 * another block offers no Add control rather than a picker that refuses
 * every option — the same rule the page-level Add control already followed.
 *
 * @param props - see {@link AddBlockPickerProps}.
 * @returns the trigger, and the popup while it is open.
 */
export function AddBlockPicker(props: AddBlockPickerProps): ReactNode {
  const [open, setOpen] = useState(false);
  const titleId = useId();

  if (props.atBlockLimit) return null;

  const choose = (block: Block): void => {
    props.onAdd(block);
    setOpen(false);
  };

  const onDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "Escape") setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        {...tid("add-block")}
        data-target-path={formatBlockPath(props.targetPath)}
        onClick={() => setOpen(true)}
        className="flex w-fit items-center gap-1.5 rounded-lg surface border-(--edge)/60 px-3 py-1.5 text-sm"
      >
        <Plus className="size-4" />
        {props.labels.add}
      </button>
      {open ? (
        // The backdrop's own click and Escape are the dialog's dismissal,
        // not a control somebody tabs to — a keyboard user closes through
        // an option or the browser's own Escape handling once focus is
        // inside, which is why the dialog is not itself in the tab order.
        // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          {...tid("add-block-picker")}
          className={`${CHROME_SCOPE} fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4`}
          onClick={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
          onKeyDown={onDialogKeyDown}
        >
          <div className="grid max-h-[80vh] w-full max-w-2xl gap-4 overflow-y-auto rounded-xl surface border-(--edge) bg-(--menu) p-4">
            <h2 id={titleId} className="font-display text-base font-bold">
              {props.labels.title}
            </h2>
            <div className="grid gap-2">
              <p className="text-xs font-medium text-(--muted)">
                {props.labels.contentGroup}
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {props.kinds.map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    {...tid("add-block-option")}
                    data-add-kind={kind}
                    onClick={() => choose(newLeaf(kind))}
                    className="grid gap-1.5 rounded-lg surface border-(--edge)/60 p-2 text-left text-sm"
                  >
                    <span className="text-xs font-medium text-(--muted)">
                      {props.labels.leafKinds[kind]}
                    </span>
                    <div className={CHROME_SCOPE}>
                      <PublicBlock
                        block={sampleLeaf(kind)}
                        locale={props.locale}
                        depth={1}
                        path="preview"
                        page={props.page}
                      />
                    </div>
                  </button>
                ))}
              </div>
            </div>
            {props.mayAddLayout ? (
              <div className="grid gap-2">
                <p className="text-xs font-medium text-(--muted)">
                  {props.labels.layoutGroup}
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {CONTAINER_MODES.map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      {...tid("add-block-option")}
                      data-add-mode={mode}
                      onClick={() => choose(newContainer(mode, PICKER_SPACES))}
                      className="grid gap-1.5 rounded-lg surface border-(--edge)/60 p-2 text-left text-sm"
                    >
                      <span className="text-xs font-medium text-(--muted)">
                        {props.labels.modes[mode]}
                      </span>
                      <div className={CHROME_SCOPE}>
                        <PublicBlock
                          block={sampleContainer(mode)}
                          locale={props.locale}
                          depth={1}
                          path="preview"
                          page={props.page}
                        />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p
                {...tid("nesting-at-limit")}
                className="text-xs text-(--muted)"
              >
                {props.labels.nestingAtLimit}
              </p>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
