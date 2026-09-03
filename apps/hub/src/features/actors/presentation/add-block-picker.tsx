"use client";

import { Plus } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
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
 * **An option is a `role="button"` `<div>` over an `inert` preview
 * (2026-09-02), not a `<button>`.** `player`/`jukebox` samples render real
 * transport buttons through the same renderer the preview uses, which a
 * `<button>` may not contain at all; `inert` on the preview is what keeps
 * the option itself the one thing a click or a screen reader can reach.
 * The dialog moves focus into itself on open, which is what makes Escape
 * (and every option's own keyboard activation) actually work — see the
 * `useEffect` and `onOptionKeyDown` below for both mechanisms.
 *
 * @param props - see {@link AddBlockPickerProps}.
 * @returns the trigger, and the popup while it is open.
 */
export function AddBlockPicker(props: AddBlockPickerProps): ReactNode {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  // **Focus has to move INTO the dialog, or Escape never reaches it.**
  // `onKeyDown` below listens on this element, and a keydown only bubbles up
  // from wherever focus actually is — which, without this, stays on the
  // trigger BUTTON outside the dialog (Chromium focuses a button on click),
  // a sibling rather than an ancestor of this element. Found in a real
  // browser: `add-block-picker.spec.ts`'s Escape case timed out with the
  // dialog still visible, because the keydown was firing on the trigger the
  // whole time. `tabIndex={-1}` is what makes a plain `<div>` a valid
  // `.focus()` target without adding it to the tab order — matching the
  // comment already here about a keyboard user closing through an option or
  // Escape "once focus is inside," which asserted an invariant nothing
  // actually implemented.
  useEffect(() => {
    if (open) dialogRef.current?.focus();
  }, [open]);

  if (props.atBlockLimit) return null;

  const choose = (block: Block): void => {
    props.onAdd(block);
    setOpen(false);
  };

  const onDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "Escape") setOpen(false);
  };

  // **An option is a `role="button"` `<div>`, never a real `<button>`
  // (2026-09-02).** Its own preview draws the REAL renderer over real sample
  // content — `PublicBlock`, the same one a public page uses — and two of
  // this feature's own kinds, `player` and `jukebox`, render real transport
  // buttons. A `<button>` may not contain interactive content at all; React
  // warned about exactly that on every open ("In HTML, `<button>` cannot be
  // a descendant of `<button>`. This will cause a hydration error"), which a
  // browser run caught and no unit test could have — jsdom raises the same
  // warning to the console rather than to an assertion. Keyboard behaviour
  // is kept by hand: `tabIndex={0}` makes it a stop, and Enter/Space are
  // wired here exactly as a native `<button>` would answer them.
  const onOptionKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    activate: () => void,
  ): void => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    activate();
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
        // an option or Escape once focus is inside, which the effect above
        // is what actually puts there.
        // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          {...tid("add-block-picker")}
          className={`${CHROME_SCOPE} fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4 outline-none`}
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
                  <div
                    key={kind}
                    role="button"
                    tabIndex={0}
                    {...tid("add-block-option")}
                    data-add-kind={kind}
                    onClick={() => choose(newLeaf(kind))}
                    onKeyDown={(event) =>
                      onOptionKeyDown(event, () => choose(newLeaf(kind)))
                    }
                    className="grid cursor-pointer gap-1.5 rounded-lg surface border-(--edge)/60 p-2 text-left text-sm"
                  >
                    <span className="text-xs font-medium text-(--muted)">
                      {props.labels.leafKinds[kind]}
                    </span>
                    {/* **`inert`, not merely non-`<button>` (2026-09-02).**
                        Swapping the option's own tag to a `<div>` fixed the
                        HTML-validity warning, and axe still refused it:
                        `nested-interactive` — a `role="button"` containing
                        REAL buttons (`player`/`jukebox`'s own transport
                        controls) is exactly the anti-pattern that rule
                        exists for, regardless of which tag the outer one is.
                        `inert` removes this whole preview from the
                        accessibility tree, from focus, and from
                        hit-testing — so a click anywhere inside it, on a
                        transport button included, is excluded from the
                        browser's own hit-test and falls through to the
                        option `<div>` behind it, the same mechanism
                        `canvas-interaction-lock.ts` already relies on for
                        the editor canvas. */}
                    <div className={CHROME_SCOPE} inert>
                      <PublicBlock
                        block={sampleLeaf(kind)}
                        locale={props.locale}
                        depth={1}
                        path="preview"
                        page={props.page}
                      />
                    </div>
                  </div>
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
                    <div
                      key={mode}
                      role="button"
                      tabIndex={0}
                      {...tid("add-block-option")}
                      data-add-mode={mode}
                      onClick={() => choose(newContainer(mode, PICKER_SPACES))}
                      onKeyDown={(event) =>
                        onOptionKeyDown(event, () =>
                          choose(newContainer(mode, PICKER_SPACES)),
                        )
                      }
                      className="grid cursor-pointer gap-1.5 rounded-lg surface border-(--edge)/60 p-2 text-left text-sm"
                    >
                      <span className="text-xs font-medium text-(--muted)">
                        {props.labels.modes[mode]}
                      </span>
                      <div className={CHROME_SCOPE} inert>
                        <PublicBlock
                          block={sampleContainer(mode)}
                          locale={props.locale}
                          depth={1}
                          path="preview"
                          page={props.page}
                        />
                      </div>
                    </div>
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
