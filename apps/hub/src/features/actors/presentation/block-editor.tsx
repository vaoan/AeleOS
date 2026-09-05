"use client";

import { createPortal } from "react-dom";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import type { PageContext } from "@/features/actors/presentation/blocks";
import { Sparkles } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
  type SetStateAction,
} from "react";
import {
  useController,
  type Control,
  type FieldValues,
  type Path,
} from "react-hook-form";
import {
  BLOCK_LIMITS,
  countBlocks,
  isContainer,
  lenientBlockSchema,
  type Block,
  type ContainerBlock,
  type LeafBlock,
  type LeafKind,
} from "@/features/actors/domain/block-schema";
import {
  addContentAt,
  appendPlace,
  blockAt,
  clearAt,
  patchContainer,
  patchLeaf,
  removeAt,
  type BlockPath,
} from "@/features/actors/domain/block-edits";
import {
  cloneAt,
  type CloneRefusal,
} from "@/features/actors/domain/block-clone";
import {
  formatBlockPath,
  parentSelection,
  parseBlockPath,
  repairSelection,
  sameSelection,
  siblingTarget,
  type EditorSelection,
} from "@/features/actors/domain/editor-selection";
import {
  canvasPlaceId,
  canvasPlacePath,
  placeId,
  placeName,
  placeOrder,
  placePath,
  stepPlace,
} from "@/features/actors/domain/block-drag";
import {
  applyDrop,
  applySiblingDrop,
  isLinearScope,
  type DropRefusal,
  type DropTarget,
} from "@/features/actors/domain/block-drops";
import type { BlockProblem } from "@/features/actors/domain/block-problems";
import {
  FURSONA_TEMPLATES,
  type ChosenPage,
} from "@/features/actors/domain/fursona-templates";
import type { ActorTheme } from "@/features/actors/domain/actor-theme";
import {
  fitsActorKind,
  holdsNothingAuthored,
  lockedKinds,
  offerableLeafKinds,
  removalLocked,
  withRequiredBlocks,
} from "@/features/actors/domain/required-blocks";
import type { AuthoringLanguage } from "@/features/actors/application/use-language-toggle";
import {
  BlockCard,
  type BlockCardLabels,
} from "@/features/actors/presentation/block-card";
import {
  PropertiesPanel,
  type PropertiesPanelLabels,
  type PropertiesTab,
} from "@/features/actors/presentation/properties-panel";
import {
  Block as PublicBlock,
  DEFAULT_PAGE_MEASURE,
  pageBoxClass,
  type EditorRenderHook,
} from "@/features/actors/presentation/blocks";
import { EditableBlockFrame } from "@/features/actors/presentation/editable-block-frame";
import {
  dragAnnouncements,
  type DragAnnouncementLabels,
} from "@/features/actors/presentation/drag-announcements";
import { LeafEditor } from "@/features/actors/presentation/leaf-editor";
import { StyleFields } from "@/features/actors/presentation/section-style-popup";
import {
  styleGatesFor,
  type StyleGates,
} from "@/features/actors/presentation/block-contract";
import { lockCanvasInteraction } from "@/features/actors/presentation/canvas-interaction-lock";
import {
  AddBlockPicker,
  type AddBlockPickerProps,
} from "@/features/actors/presentation/add-block-picker";
import { addTargetFor } from "@/features/actors/domain/add-target";
import { useAddSlot } from "@/features/actors/presentation/add-slot";
import {
  SECTION_PRESETS,
  presetBlock,
} from "@/features/actors/presentation/section-presets";
import { CHROME_SCOPE } from "@/shared/domain/chrome";
import { WidePageColumn } from "@/shared/presentation/page-shell";
import {
  TemplatePicker,
  type TemplatePickerLabels,
} from "@/features/actors/presentation/template-picker";
import { tid } from "@/shared/infrastructure/test-id";

/**
 * What a drag says, plus the ways a drop can be refused.
 *
 * **The refusals are `DropRefusal` in words.** `applyDrop` answers why a drop
 * did not happen, and until this bag existed there was nowhere for it to be
 * said — a refused drag was a drag that silently did nothing, which is the
 * fault this repository keeps catching.
 */
interface BlockDragLabels extends DragAnnouncementLabels {
  /** Says a block was dropped somewhere inside itself. */
  intoItself: string;
  /** Says a drop would nest one level past the cap. */
  tooDeep: string;
  /** Says the place a drop named is no longer there. */
  noSuchPlace: string;
  /** Says a linear insert would grow a list past {@link BLOCK_LIMITS.children}. */
  tooMany: string;
}

/**
 * Translated strings {@link BlockEditor} renders.
 *
 * Extends the card's and the template picker's, because this level owns one
 * label bag and hands slices of it down — which is also why the picker's two
 * confirmation words are named for what they confirm rather than `confirm` and
 * `cancel`: the toolbar's `cancel` already means "stop editing", and in one bag
 * they would be the same key with two meanings.
 *
 * `drag` is nested for the same reason `style` and `theme` are: it has words
 * of its own that would collide flat.
 *
 * The Properties panel's own words live here too (2026-09-04): this level
 * owns selection and builds each pane's tab labels from strings it already
 * has elsewhere in the bag — see `panelContentFor`. `inspectorClose` is the
 * panel's own way out at any depth; there is no Back or breadcrumb any
 * more, since there is no tree left to navigate.
 *
 * **`addBlock`/`addBlockTitle`/`addContentGroup`/`addLayoutGroup` are the Add
 * picker's own strings.** One control, one name — the compact builder menu's
 * single global Add (2026-09-04), portalled into `EditorToolbar` from
 * whichever scope is selected, replacing the page-level, container-footer
 * and per-empty-place mounts this bag used to feed separately.
 */
export interface BlockEditorLabels
  extends BlockCardLabels, TemplatePickerLabels {
  /** Heading above the sections. */
  sectionsTitle: string;
  /** Shown when there are no sections at all. */
  empty: string;
  /** Adds a section. */
  addSection: string;
  /** Labels each top-level section's real-renderer preview. */
  previewTitle: string;
  /** Field label for the new section's shape. */
  newSectionSpaces: string;
  /** Explains why the add controls are gone. */
  atLimit: string;
  /** Names a section's own grip. */
  dragSection: string;
  /** What a drag says out loud. */
  drag: BlockDragLabels;
  /**
   * Opens the brand preset list — "Add a section for…" or similar.
   *
   * Names the group, not any one brand: a brand's own name is never
   * translated, so this is the only string {@link BlockEditor} needs from the
   * catalogue for the whole preset control.
   */
  addSectionFor: string;
  /**
   * Selects the page itself, so the Properties panel can edit identity and
   * theme. Reused as the Page pane's own `primaryTab` label — see
   * `panelContentFor`.
   */
  selectPage: string;
  /** Clears the current selection and closes the Properties panel. */
  inspectorClose: string;
  /** Wraps the selected content in a layout. */
  wrapInLayout: string;
  /**
   * Names the single global Add control's trigger, in the toolbar.
   *
   * One name whatever the current selection targets — the page root, a
   * selected container, or the parent of a selected leaf — because it is the
   * same control everywhere; only its target differs, and that is never
   * named in the trigger's own words.
   */
  addBlock: string;
  /** The picker's own dialog heading. */
  addBlockTitle: string;
  /** Heading over the picker's content options. */
  addContentGroup: string;
  /** Heading over the picker's layout options. */
  addLayoutGroup: string;
  /**
   * The Properties panel's Appearance tab — a container's and a leaf's
   * second tab alike (2026-09-04).
   */
  panelTabAppearance: string;
  /** The Properties panel's Theme tab, Page's second tab. */
  panelTabTheme: string;
  /** Clones the selected block, at the panel's foot. */
  cloneBlock: string;
  /** Says a clone would nest one level past the depth cap. */
  cloneRefusedTooDeep: string;
  /** Says a clone would grow a list past what it may hold. */
  cloneRefusedTooMany: string;
}

/**
 * What {@link BlockEditor} needs.
 *
 * `problems` is threaded from the form rather than recomputed here, so one
 * walk of react-hook-form's error tree answers it for every card — and so the
 * banner and the marks beneath it can never disagree about which blocks are
 * wrong.
 *
 * **Two props cross a boundary rather than describing this component**, and
 * both exist because the page has two halves and this component holds one.
 * `onApplyDocument` sends a picked template up to the field that can hold its
 * look; `theme` brings the current one down so `holdsNothingAuthored` can be
 * asked about the whole page. Neither is painted with — this component still
 * owns no look — and without the second the confirmation guard is reachable by
 * nothing, which is what shipped for a commit.
 *
 * **`onApplyDocument` in particular** The template picker lives here and the THEME
 * does not: `control` reaches a single field, the page, and a look is a second
 * field the editor above owns. So a picked template is forwarded up rather
 * than applied here, and lands in the same `applyDocumentTo` a pasted document
 * goes through.
 *
 * **It takes a `PageContext` for the canvas renderer**, so the same `Block`
 * components a public route uses see the live actor. It takes a `theme` only
 * to ASK about it: nothing here paints from one, because the DOCUMENT wears
 * the page being built and the canvas inherits the author's palette, skin and
 * field from `:root` the same way a stranger's browser will. What keeps that
 * off the Properties panel workbench is `CHROME_SCOPE` on each control
 * island.
 *
 * The Properties panel starts deselected and mounts only after a canvas or
 * Page selection (2026-09-04). There is no Items tab and no tree navigation
 * any more — click-to-select on the canvas is the only way in. Every
 * selection kind gets exactly two fixed tabs: Page/Theme, Layout/Appearance
 * or Content/Appearance — see `panelContentFor`.
 *
 * **It also owns the interaction lock (2026-09-02)**, mounted in an effect
 * over the canvas element this component renders — see
 * {@link BlockEditorProps.pageInteractionsEnabled}.
 *
 * **Preview is a reset, not a pause (2026-09-03).**
 * {@link BlockEditorProps.controlsHidden} derives no visible selection, and
 * {@link BlockEditorProps.selectionResetKey} invalidates the stored one in
 * the same update that opens Preview, so Show controls cannot resurrect it.
 * While controls show, this component's canvas is the only vertical scroller.
 *
 * **It takes the save-refusal summary as a node too**, for the same reason it
 * takes `pageFields`/`pageTheme`: the editor above owns the errors, and the
 * padding that keeps the fixed Properties panel from covering the summary is
 * here. See {@link BlockEditorProps.banner}.
 */
export interface BlockEditorProps<T extends FieldValues> {
  /** The form's control, for the one field holding the whole page. */
  control: Control<T>;
  /** Which language's fields to bind to. */
  lang: AuthoringLanguage;
  /** Already-translated strings. */
  labels: BlockEditorLabels;
  /** This deployment's own hostname, threaded to every preview for Twitch. */
  page: PageContext;
  /**
   * What the save schema refused, and where.
   *
   * Threaded rather than recomputed, so one walk of react-hook-form's error
   * tree answers it for every card — and so the banner and the marks below it
   * can never disagree about which blocks are wrong.
   */
  problems: readonly BlockProblem[];
  /**
   * Applies a whole chosen page — blocks AND look — to the form.
   *
   * **This component holds the picker and does NOT hold the theme**, which is
   * the seam this prop exists to cross. `control` reaches one field, the page;
   * a look is a second field the editor above owns. So the picker's choice is
   * forwarded up rather than applied here, and it lands in the same
   * `applyDocument` a pasted document goes through — one path, not two.
   */
  onApplyDocument: (chosen: ChosenPage) => void;
  /**
   * The live theme, asked about rather than styled with.
   *
   * **This component still owns no look** — it paints nothing from this and
   * hands it to no child. It exists because `holdsNothingAuthored` is a
   * question about the WHOLE page and this component holds only half of it:
   * the blocks are here, the palette is a field the editor above owns. Passing
   * the theme keeps that predicate in one place; computing half the answer
   * here and half above is the second implementation that drifts.
   *
   * Without it the guard is unreachable, which is exactly what shipped for one
   * commit: somebody who had chosen colours and nothing else got no
   * confirmation, because the call site never told the predicate about them.
   */
  theme: ActorTheme | null;
  /**
   * The identity fields — handle, display name, avatar, visibility — shown
   * in the Page selection's own Page tab (2026-09-04).
   *
   * Owned above because they are form fields this component does not hold.
   * Absent in unit tests that only exercise the page tree. Split from the
   * theme panel below because the two-tab Properties panel routes them to
   * different tabs: one combined `pageOptions` node could not be handed to
   * both without this component's own opinion about which half is which.
   */
  pageFields?: ReactNode;
  /**
   * The theme panel, shown in the Page selection's own Theme tab.
   *
   * Split from {@link pageFields} for the same reason — see that prop's own
   * note.
   */
  pageTheme?: ReactNode;
  /**
   * The save-refusal summary, rendered above the canvas.
   *
   * **It is passed in rather than rendered by the editor above, because the
   * inspector's accommodation is here (2026-09-03).** A selection pads THIS
   * component's section by `md:pl-[min(36rem,40vw)]` so the fixed inspector
   * has somewhere to sit; a banner rendered as a sibling of that section got
   * no such padding, and the inspector — open exactly when somebody presses
   * Save — covered its heading and every message under it. Measured at 1280:
   * the heading sat at x=41 with the panel's right edge at x=512, and
   * `elementFromPoint` over the heading answered the inspector's own fields.
   *
   * It stays OUTSIDE `editor-canvas` on purpose. The summary exists because a
   * field's own message can be scrolled out of view, so a summary that scrolls
   * away with the page would solve nothing.
   *
   * Absent in unit tests that only exercise the page tree.
   */
  banner?: ReactNode;
  /**
   * Whether the live page is currently interactive.
   *
   * Computed above by {@link pageInteractionsEnabled} from Preview and the
   * toolbar switch — this component only acts on the result. **When true,
   * canvas clicks do not select or clear**: the click belongs to the page
   * itself, exactly as it does for a visitor, and the interaction lock is
   * released so a real link, button or frame can respond. When false, the
   * canvas is locked by {@link lockCanvasInteraction} and a click instead
   * chooses the nearest block.
   */
  pageInteractionsEnabled: boolean;
  /**
   * Whether Preview has removed the editing controls.
   *
   * Preview is not a paused inspector: while true no selection is rendered,
   * and the stored selection is cleared before controls can return.
   */
  controlsHidden: boolean;
  /**
   * Monotonic command that invalidates any selection made before it.
   *
   * The parent increments this in the same event that opens Preview. It owns
   * only the reset signal; the selected value and every selection transition
   * remain local to this component.
   */
  selectionResetKey: number;
}

/** How far a pointer travels before a press becomes a drag rather than a click. */
const DRAG_THRESHOLD = 8;

/** Which arrow keys step towards the end of the list of places. */
const FORWARD_KEYS = new Set(["ArrowDown", "ArrowRight"]);

/** Which arrow keys step back towards its start. */
const BACK_KEYS = new Set(["ArrowUp", "ArrowLeft"]);

/**
 * The target kind a destination path offers for its parent arrangement.
 *
 * @param blocks - the current page.
 * @param path - the candidate place.
 * @param edge - which insertion edge a linear destination advertises.
 * @returns an insertion bar for a sequence, otherwise a positional place.
 */
function targetAt(
  blocks: readonly Block[],
  path: BlockPath,
  edge: "before" | "after",
): DropTarget {
  return isLinearScope(blocks, path.slice(0, -1))
    ? { kind: edge, path }
    : { kind: "place", path };
}

/**
 * A keyboard step translated through the active drag surface.
 *
 * Inspector grips remain sibling-only during the transition; canvas grips
 * admit any domain-valid cross-container destination.
 *
 * @param blocks - the current page.
 * @param source - the lifted place.
 * @param next - the next rendered place in drawing order.
 * @param canvasDrag - whether the lift began on the live renderer.
 * @param edge - the insertion edge implied by the arrow direction.
 * @returns the candidate target, or none outside an inspector sibling scope.
 */
function keyboardDropTarget(
  blocks: readonly Block[],
  source: BlockPath,
  next: BlockPath,
  canvasDrag: boolean,
  edge: "before" | "after",
): DropTarget | null {
  const destination = canvasDrag ? next : siblingTarget(source, next);
  return destination ? targetAt(blocks, destination, edge) : null;
}

/**
 * The place under the pointer, or the one a keyboard drag has stepped to.
 *
 * A plain function — called from an inline `useCallback` body in
 * {@link BlockEditor} rather than defined there directly — so its own
 * considerable branching (parsing the matching id space, containing the
 * pointer, validating the domain drop, and ranking the deepest nested
 * destination in one pass) is counted against ITS OWN cognitive-complexity
 * budget rather than against {@link BlockEditor}'s, which would otherwise
 * absorb the complexity of every closure defined inside it. The refs are
 * taken as plain parameters, read only once this runs — never during
 * render — which is also what the ref-during-render lint rule requires of
 * whatever calls this.
 *
 * @param args - what the library is measuring, and where the pointer is.
 * @param pageRef - the current page, read fresh on every collision check.
 * @param keyboardTarget - written with the winning target, for `onDragOver`.
 * @param pointerTarget - written with the winning target, for `onDragOver`.
 * @returns the one place a drop would land on, or none.
 */
// eslint-disable-next-line sonarjs/cognitive-complexity -- collision admission must parse the matching id space, contain the pointer, validate the domain drop, and rank the deepest nested destination in one pass
function detectCollisionAt(
  args: Parameters<CollisionDetection>[0],
  pageRef: RefObject<Block[]>,
  keyboardTarget: RefObject<DropTarget | null>,
  pointerTarget: RefObject<DropTarget | null>,
): ReturnType<CollisionDetection> {
  const activeId = String(args.active.id);
  const canvasDrag = Boolean(canvasPlacePath(activeId));
  const from = canvasPlacePath(activeId) ?? placePath(activeId);
  if (!from) return [];
  if (!args.pointerCoordinates) {
    const target = keyboardTarget.current;
    return target
      ? [{ id: canvasDrag ? canvasPlaceId(target.path) : placeId(target.path) }]
      : [];
  }

  let best:
    | { readonly id: string; readonly path: BlockPath; readonly depth: number }
    | undefined;
  pointerTarget.current = null;
  for (const container of args.droppableContainers) {
    const candidateId = String(container.id);
    const path = canvasDrag
      ? canvasPlacePath(candidateId)
      : placePath(candidateId);
    const rect = args.droppableRects.get(container.id);
    if (!path || !rect) continue;
    const { x, y } = args.pointerCoordinates;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      continue;
    }
    const edge = y < rect.top + rect.height / 2 ? "before" : "after";
    const target = targetAt(pageRef.current, path, edge);
    if (!applyDrop(pageRef.current, from, target).ok) continue;
    if (!best || path.length > best.depth) {
      best = { id: String(container.id), path, depth: path.length };
      pointerTarget.current = target;
    }
  }
  return best ? [{ id: best.id }] : [];
}

/**
 * Where an arrow key moves a keyboard drag to.
 *
 * A plain function for the same reason {@link detectCollisionAt} is one —
 * its own branching (walking rendered places until one is on screen, and
 * refusing a candidate the domain itself would refuse) is counted against a
 * budget of its own rather than against {@link BlockEditor}'s.
 *
 * **It steps over any place nothing is showing**, and that is a fix rather
 * than a refinement. `placeOrder` walks the whole stored tree, while a
 * COLLAPSED card renders none of its places — so those places register no
 * droppable and the library has no rectangle for them. Landing on one used to
 * keep the new path anyway and fall back to the current coordinates, after
 * which the collision named an id nothing had registered, dnd-kit resolved
 * `over` to null, and the drag announced "it stayed where it was" while it
 * was still running; a space bar pressed there dropped nothing at all,
 * because `onDragEnd` returns early on a null `over`. So the walk keeps
 * stepping until it finds a place the library is actually measuring, which
 * makes every place the keyboard can reach one a drop can land on.
 *
 * @param event - the key.
 * @param args - the drag, and where it is now.
 * @param pageRef - the current page, read fresh on every step.
 * @param keyboardAt - written with the place a step lands on.
 * @param keyboardTarget - written with the target a step resolves to.
 * @returns the coordinates of the place it steps to, or nothing when the walk
 * runs out of places that are on screen.
 */
function coordinateGetterAt(
  event: Parameters<KeyboardCoordinateGetter>[0],
  args: Parameters<KeyboardCoordinateGetter>[1],
  pageRef: RefObject<Block[]>,
  keyboardAt: RefObject<BlockPath | undefined>,
  keyboardTarget: RefObject<DropTarget | null>,
): ReturnType<KeyboardCoordinateGetter> {
  const forward = FORWARD_KEYS.has(event.code);
  if (!forward && !BACK_KEYS.has(event.code)) return;
  const from = placePath(String(args.active));
  const canvasFrom = canvasPlacePath(String(args.active));
  const source = canvasFrom ?? from;
  if (!source) return;
  const order = placeOrder(pageRef.current, source);
  let next = stepPlace(order, keyboardAt.current ?? source, forward);
  while (next) {
    const id = canvasFrom ? canvasPlaceId(next) : placeId(next);
    const rect = args.context.droppableRects.get(id);
    const target = keyboardDropTarget(
      pageRef.current,
      source,
      next,
      Boolean(canvasFrom),
      forward ? "after" : "before",
    );
    if (rect && target && applyDrop(pageRef.current, source, target).ok) {
      keyboardAt.current = next;
      keyboardTarget.current = target;
      return { x: rect.left, y: rect.top };
    }
    next = stepPlace(order, next, forward);
  }
}

function useResettableSelection(
  resetKey: number,
): [EditorSelection, Dispatch<SetStateAction<EditorSelection>>] {
  const [stored, setStored] = useState<{
    resetKey: number;
    value: EditorSelection;
  }>({ resetKey, value: null });
  const selection = stored.resetKey === resetKey ? stored.value : null;
  const setSelection = useCallback(
    (next: SetStateAction<EditorSelection>) => {
      setStored((current) => {
        const currentValue =
          current.resetKey === resetKey ? current.value : null;
        return {
          resetKey,
          value: typeof next === "function" ? next(currentValue) : next,
        };
      });
    },
    [resetKey],
  );
  return [selection, setSelection];
}

/**
 * Where a container will put its next appended child.
 *
 * @param block - the selected block, when it still resolves.
 * @returns its first empty position, its appended position, or zero.
 */
function nextChildPosition(block: Block | null): number {
  if (!block || !isContainer(block)) return 0;
  const empty = block.children.indexOf(null);
  return empty === -1 ? block.children.length : empty;
}

/**
 * The one global Add, portalled into `EditorToolbar`'s slot.
 *
 * A tiny function of its own rather than an inline ternary in
 * {@link BlockEditor}'s own JSX — pulled out purely to keep that component's
 * cognitive complexity under the project's own gate, not because the logic
 * is complex on its own terms.
 *
 * @param slot - where to portal to, or null before it mounts.
 * @param props - what {@link AddBlockPicker} needs.
 * @returns the portalled picker, or nothing while there is no slot.
 */
function addSlotPortal(
  slot: HTMLElement | null,
  props: AddBlockPickerProps,
): ReactNode {
  return slot ? createPortal(<AddBlockPicker {...props} />, slot) : null;
}

/** What {@link panelContentFor} needs to build one selection kind's panes. */
interface PanelContentInputs {
  /** The repaired, current selection — `null`, Page, or a block. */
  currentSelection: EditorSelection | null;
  /** The Page tab's identity fields, unrelated to its theme. */
  pageFields: ReactNode;
  /** The section-adding controls, shown only alongside the Page fields. */
  addPalette: ReactNode;
  /** The Page tab's theme controls, in the second pane. */
  pageTheme: ReactNode;
  /** The selection, narrowed to a container, or `null`. */
  selectedContainer: ContainerBlock | null;
  /** The selection, narrowed to a leaf, or `null`. */
  selectedLeaf: LeafBlock | null;
  /** Where the selected block sits, when there is one. */
  selectedPath: BlockPath | undefined;
  /** The selected block's own style-bag gates, or `null` with no selection. */
  selectedStyleGates: StyleGates | null;
  /** Applies an edit to the whole page. */
  apply: (edit: (blocks: Block[]) => Block[]) => void;
  /** Which language's fields to bind to. */
  lang: AuthoringLanguage;
  /** Already-translated strings for the whole editor. */
  labels: BlockEditorLabels;
  /** Whether the page already holds as many blocks as it may. */
  atBlockLimit: boolean;
  /** The required kinds this page holds exactly one of. */
  locked: ReadonlySet<string>;
  /** What the save schema refused, and where. */
  problems: readonly BlockProblem[];
  /** The leaf kinds this page may hold. */
  kinds: readonly LeafKind[];
}

/**
 * Builds the Properties panel's two panes and its tab labels for the current
 * selection kind.
 *
 * Pulled out of {@link BlockEditor} purely to keep that component's cognitive
 * complexity under the project's own gate — the three selection kinds
 * (Page, a container, a leaf) are mutually exclusive branches with no
 * meaningful shared logic, so this is a dispatch rather than an algorithm.
 *
 * @returns the primary and secondary pane content, and the panel's tab
 * labels for whichever kind is selected — Page's own labels when nothing
 * matches, since the panel renders nothing without a selection anyway.
 */
function panelContentFor({
  currentSelection,
  pageFields,
  addPalette,
  pageTheme,
  selectedContainer,
  selectedLeaf,
  selectedPath,
  selectedStyleGates,
  apply,
  lang,
  labels,
  atBlockLimit,
  locked,
  problems,
  kinds,
}: PanelContentInputs): {
  primary: ReactNode;
  secondary: ReactNode;
  panelLabels: PropertiesPanelLabels;
} {
  const defaultLabels: PropertiesPanelLabels = {
    close: labels.inspectorClose,
    primaryTab: labels.selectPage,
    secondaryTab: labels.panelTabTheme,
  };

  if (currentSelection?.kind === "page") {
    return {
      primary: (
        <>
          {pageFields}
          {addPalette}
        </>
      ),
      secondary: pageTheme,
      panelLabels: defaultLabels,
    };
  }

  if (selectedContainer && selectedPath) {
    return {
      primary: (
        <>
          <BlockCard
            block={selectedContainer}
            path={selectedPath}
            apply={apply}
            lang={lang}
            labels={labels}
            atBlockLimit={atBlockLimit}
            locked={locked}
            problems={problems}
            dragHandle={null}
            kinds={kinds}
            showChildren={false}
            hideStylePopup
            hideRemove
          />
          {selectedContainer.children.length < BLOCK_LIMITS.children ? (
            <button
              type="button"
              {...tid("add-place")}
              onClick={() =>
                apply((current) => appendPlace(current, selectedPath))
              }
              className="w-fit rounded-lg surface border-(--edge)/60 px-3 py-1.5 text-sm"
            >
              {labels.addPlace}
            </button>
          ) : null}
        </>
      ),
      secondary: selectedStyleGates ? (
        <StyleFields
          value={selectedContainer.style}
          onChange={(style) =>
            apply((current) => patchContainer(current, selectedPath, { style }))
          }
          labels={labels.style}
          gates={selectedStyleGates}
        />
      ) : null,
      panelLabels: {
        close: labels.inspectorClose,
        primaryTab: labels.addLayoutGroup,
        secondaryTab: labels.panelTabAppearance,
      },
    };
  }

  if (selectedLeaf && selectedPath) {
    return {
      primary: (
        <LeafEditor
          leaf={selectedLeaf}
          path={selectedPath}
          apply={apply}
          lang={lang}
          labels={labels.leaf}
          problems={problems}
          dragHandle={null}
          kinds={kinds}
          hideStylePopup
          hideRemove
        />
      ),
      secondary: selectedStyleGates ? (
        <StyleFields
          value={selectedLeaf.style}
          onChange={(style) =>
            apply((current) => patchLeaf(current, selectedPath, { style }))
          }
          labels={labels.leaf.style}
          gates={selectedStyleGates}
        />
      ) : null,
      panelLabels: {
        close: labels.inspectorClose,
        primaryTab: labels.addContentGroup,
        secondaryTab: labels.panelTabAppearance,
      },
    };
  }

  return { primary: null, secondary: null, panelLabels: defaultLabels };
}

/** What {@link panelFootFor} needs. */
interface PanelFootInputs {
  /** The repaired, current selection — `null`, Page, or a block. */
  currentSelection: EditorSelection | null;
  /** The selection, resolved to a block, when there is one. */
  selectedBlock: Block | null;
  /** Where the selected block sits, when there is one. */
  selectedPath: BlockPath | undefined;
  /** Whether the selected block is itself a named container. */
  selectedContainer: ContainerBlock | null;
  /** Why the last clone attempt was refused, or `null`. */
  cloneRefusal: CloneRefusal | null;
  /** The required kinds this page holds exactly one of. */
  locked: ReadonlySet<string>;
  /** Already-translated strings for the whole editor. */
  labels: BlockEditorLabels;
  /** Clones the current selection. */
  cloneSelected: () => void;
  /** Deletes the current selection. */
  deleteSelected: () => void;
}

/**
 * The Properties panel's foot: Clone and Delete, or nothing when nothing
 * selected is a block.
 *
 * Pulled out of {@link BlockEditor} for the same reason {@link
 * panelContentFor} is — a JSX value assigned to a `const` is not a function
 * boundary, so every ternary in it is counted directly against whichever
 * function it sits in, and this one nests three deep (selected-a-block, then
 * a clone refusal, then a locked delete) before it draws anything.
 *
 * @returns Clone and Delete, or nothing when the current selection is Page,
 * nothing, or unresolved.
 */
function panelFootFor({
  currentSelection,
  selectedBlock,
  selectedPath,
  selectedContainer,
  cloneRefusal,
  locked,
  labels,
  cloneSelected,
  deleteSelected,
}: PanelFootInputs): ReactNode {
  if (currentSelection?.kind !== "block" || !selectedBlock || !selectedPath) {
    return null;
  }

  const cannotDeleteSelected = removalLocked(selectedBlock, locked);
  const cloneRefusalMessage =
    cloneRefusal === "too deep"
      ? labels.cloneRefusedTooDeep
      : labels.cloneRefusedTooMany;
  const deleteTestId = selectedContainer ? "remove-section" : "remove-block";
  const deleteLabel = selectedContainer
    ? labels.removeSection
    : labels.leaf.removeBlock;

  return (
    <div className="grid gap-2">
      {cloneRefusal ? (
        <p
          role="status"
          {...tid("clone-refusal")}
          className="text-sm text-(--accent)"
        >
          {cloneRefusalMessage}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button
          type="button"
          {...tid("clone-block")}
          onClick={cloneSelected}
          className="flex-1 rounded-lg surface border-(--edge)/60 px-3 py-1.5 text-sm"
        >
          {labels.cloneBlock}
        </button>
        <button
          type="button"
          {...tid(deleteTestId)}
          disabled={cannotDeleteSelected}
          title={cannotDeleteSelected ? labels.removeLocked : undefined}
          onClick={deleteSelected}
          className="flex-1 rounded-lg surface border-(--edge)/60 px-3 py-1.5 text-sm disabled:opacity-40"
        >
          {deleteLabel}
        </button>
      </div>
    </div>
  );
}

/**
 * The page: sections, what is in each of their places, and what is in those.
 *
 * **The whole tree is ONE form field, held by one `useController`.** That is
 * forced rather than preferred: a place may hold nothing, and `useFieldArray`
 * keys every entry by an id it puts ON the entry — so it cannot represent a
 * `null`, which is the one thing this model turns on. Every edit is therefore
 * a pure function over the tree in `domain/block-edits.ts`, applied through
 * `apply` and handed back to the form whole; and because those functions are
 * domain code they are covered to 100%, where a `useFieldArray` call inside a
 * presentation component is measured by nothing.
 *
 * **A block is addressed by its position and never by a captured index.** Each
 * card rebuilds its children's paths from where it is rendering, on every
 * render, so a path cannot go stale the way an index captured in a handler
 * does — the fault the flat editor documented at length and which produced a
 * delete landing on the wrong row.
 *
 * **The live renderer is the drag surface.** This component is the one place
 * in the app allowed to import `EditableBlockFrame` — `blocks.tsx` renders
 * public routes too and never names it — and builds the `EditorRenderHook`
 * `blocks.tsx` calls on every rendered block and empty place, only while
 * edit controls are active and page interaction is locked. A mouse may lift
 * the rendered block directly; touch and keyboard lift the selected block
 * through its accessible grip so a touch scroll is never captured by an
 * unselected block.
 *
 * **Pointer collision ranks the live renderer's nested rectangles deepest
 * first; keyboard navigation walks their drawing order.** Both ask
 * `applyDrop` before advertising a destination, then call it again at the
 * final boundary. Linear parents show before/after insertion bars and shift;
 * positional parents highlight a place and preserve swap/move semantics.
 * The returned destination path becomes the selection after every success.
 *
 * Inspector grips remain sibling-only during the transition away from Items.
 * Their ids use a separate namespace so a mounted inspector row cannot replace
 * the corresponding live-renderer registration inside dnd-kit.
 * **The walk steps over any place nothing is showing** — a collapsed card
 * registers no drop target for its places, and stopping on one announced that
 * the drag had ended while it was still running.
 *
 * **A refused drop's sentence is retired by the next EDIT.** It used to be
 * cleared only at the next lift, so it stayed on the page through everything
 * somebody did afterwards, describing a gesture they had moved on from.
 *
 * **`<DndContext id={useId()}>`, and it is not decoration.** dnd-kit generates
 * ids from a module-level counter, and that id reaches the DOM as
 * `aria-describedby` on every grip — so two server renders in one warm process
 * emit different ids and every request after the first hydrates mismatched.
 * React's own id is stable across the pair.
 *
 * **A refused drop says why, in words.** `moveBlock` names three refusals and
 * a drag that silently did nothing would be the "the control did nothing"
 * fault this repository keeps paying for. It is spoken to the live region and
 * shown beside the heading.
 *
 * **`refusalOf` and the announcements' own `name` callback both resolve a
 * drag id with `canvasPlacePath(id) ?? placePath(id)` (2026-09-04)**, matching
 * every other canvas-aware call in this component — `placePath` alone
 * understands only the inspector's `"place:"` prefix, so a canvas grip's id
 * resolved to nothing and announced an empty place name with no refusal ever
 * spoken. `applySiblingDrop` only ever calls `applyLinearDrop` with
 * `sameParent: true`, though, so this fix's `refusalOf` half has no
 * discriminating case: `"too many"` needs `!sameParent` and cannot fire
 * through a sibling drop, and `"into itself"`/`"too deep"` both need a depth
 * change a same-parent target cannot produce from an already-valid tree.
 *
 * **The add controls are withdrawn at the block cap, with a sentence saying
 * why.** A button that silently does nothing reads as broken, and the cap is
 * not a fault on the person's part — it is a number `blocksSchema` and
 * `validate_block` both enforce, mirrored here only so nobody discovers it
 * after a save. It is counted the way the schema counts it, empty places
 * excluded, rather than approximated by the length of the outermost array.
 *
 * **A template fills the whole page rather than adding to it**, which is why
 * the picker asks first when there is anything to lose. Templates are still
 * written in the flat vocabulary and are converted where they are declared — the
 * same conversion that opens every page already stored — so a template and a
 * stored page arrive in the editor as the same shape.
 *
 * **The brand presets append and never ask first.** Appending is not
 * destructive, unlike a template's replace, and adding a confirmation would
 * make the two controls look interchangeable when they are not.
 *
 * **What the save refused travels down with everything else.** A refused page
 * used to produce one banner line and nothing else, over a page where nothing
 * was marked; `problems` is what lets the block that is actually wrong say so.
 * It is a prop rather than something each card works out, because the banner
 * and the marks have to be two views of one answer.
 *
 * **It carries test ids**, because the end-to-end suite runs in Spanish and
 * may not assert on translated text — so a control without one cannot be
 * reached by the only tests that drive a real browser.
 *
 * Its select is painted with `--menu`, not left transparent: a dropdown's list
 * is drawn from the control's own background, and a transparent one is painted
 * on white. `dropdown-legibility.test.ts` guards every select in the app.
 *
 * **Applying a template runs the identity shim over the result.** A template
 * replaces the page and names no identity block, so without that, choosing one
 * would strip somebody's portrait and leave a tree the write refuses.
 *
 * `page` supplies the actor facts the identity shim and each real-renderer
 * preview need. Each card stays visually paired with its tray by a tighter
 * inner gap than the gap separating successive section pairs — and the CARD is
 * what sits in a column, while the tray is full width, because a depth-0
 * section has to be able to apply the author's measure and to bleed. See
 * {@link BlockEditorProps}.
 *
 * **The remove control withdraws when a block holds the last copy of a kind
 * the page must carry.** `lockedKinds` is computed once over the whole tree
 * and threaded down, so every bin in the editor locks at the same moment —
 * the same reasoning `atBlockLimit` already follows.
 *
 * **The template picker's confirmation asks whether anything here is the
 * AUTHOR's**, not whether there are any sections. Every page now opens
 * carrying its required blocks, so the plain count is true of a page nobody
 * has touched — and the warning would then be about work they had not done.
 * See `holdsNothingAuthored`.
 *
 * **Three elements carry `data-editor-stack`**, which is what lets hiding the
 * controls close the sections up to exactly the spacing a public page gives
 * them. This editor needs gaps to keep each control card legible beside its
 * preview; `PublicBlocks` has none, because `pageBoxClass` owns every margin
 * between sections. Left in place with the cards hidden, those gaps would put
 * every section further down the document than a visitor sees it.
 *
 * **A column meaning "no vertical padding" says `py-0 sm:py-0`.**
 * `COLUMN.wide` is `py-6 sm:py-10`, and tailwind-merge treats a responsive
 * variant as its own group — a bare `py-0` overrides the base and leaves the
 * `sm:` one standing, which is 40px nobody asked for at every width above
 * `sm`.
 *
 * **It forwards `labels.leaf` to a top-level leaf**, the same bag a card hands
 * its own leaves. A page may hold a leaf at depth 0, so this file renders one
 * directly and speaks the same contract the card does.
 *
 * **It computes `kinds` once, beside `locked` (2026-08-27).**
 * `offerableLeafKinds(page.actorKind)` is what narrows the kind select to what
 * this page's actor kind may hold — `owner` on a person's page and `fursonas`
 * on a fursona's are the ones each excludes — and it is threaded to every
 * top-level `BlockCard` and `LeafEditor` exactly as `locked` already is, so
 * every card in the tree agrees on the same list.
 *
 * **The template picker's confirmation is decided here and needs BOTH halves
 * of the page.** `holdsNothingAuthored` reads the blocks this component holds
 * and the `theme` it is handed; without the second it answers "nothing here is
 * theirs" for somebody who chose colours and touched nothing else, and the
 * picker replaces their palette without asking. That is not hypothetical — it
 * shipped for one commit, and no unit test caught it because the case written
 * for it clicked the confirmation only if it happened to be there.
 *
 * **It offers only the templates that could actually be applied here.** An era
 * look is a FURSONA document — it names `owner`, which has nothing to render on
 * somebody's own profile — so offering one at `/me/edit` would hand them a page
 * that applies cleanly and then cannot be saved. `fitsActorKind` withholds it,
 * which is the same reasoning that withdraws a refused kind from the leaf
 * select rather than letting the database explain it afterwards.
 *
 * **The inspector remains recursive and shallow for this canvas-only step.**
 * Page and containers list only
 * their immediate positions in Items; a selected container or leaf mounts one
 * existing `BlockCard` or `LeafEditor` in Options. Descendants never mount
 * there, and `BlockPath` alone derives parents and breadcrumbs.
 * Deselecting unmounts that one workbench rather than parking a second copy
 * off screen, where browser automation and keyboard navigation could still
 * discover controls that no viewport could reach. Escape is captured before
 * an inspector popup can detach its focused field, so closing that popup does
 * not accidentally deselect the page.
 *
 * Inspector rows register only visible siblings. The canvas independently
 * registers the rendered tree and admits cross-level destinations only when
 * `applyDrop` accepts their cycle, depth, capacity, and place constraints.
 *
 * **A canvas click selects a block only while `pageInteractionsEnabled` is
 * false (2026-09-02).** While it is true, `onCanvasClick` returns
 * immediately — the click belongs to the live page, exactly as it does for a
 * visitor — and the interaction lock covering the canvas is released in the
 * same effect that watches this prop.
 *
 * **One `AddBlockPicker` is the only way to add, and it is mounted ONCE
 * (2026-09-04), portalled into `EditorToolbar`'s own slot rather than
 * mounted separately at the page, a container's footer, and every empty
 * place — see `add-target.ts` and `add-slot.tsx`.** A real signed-in browser
 * check (Task 4 of the compact-menu plan) found the container-footer mount
 * genuinely redundant once the toolbar's global Add existed — see the
 * actors feature note for the account — so the container's own footer
 * (`BlockCard`'s `add-place` button, which appends an empty position rather
 * than a block) is the only add-adjacent control left inside a container's
 * own Layout tab. The Items scope this used to live in
 * (`inspector-items.tsx`, since deleted — see "The Properties panel
 * replaces the recursive inspector" in the actors feature note) is gone
 * entirely now, one task after this comment was written. The sixteen flat
 * `add-leaf-*` buttons, `add-section`, `add-into-*` and the HTML5
 * drag-to-add path they carried are gone too — see the actors feature note
 * for why drag-to-add is a deliberate removal rather than an oversight.
 *
 * **Two of its five motion places live here as plain CSS, deliberately not
 * Motion (2026-09-02).** The canvas's own `md:pl-[…]` accommodation
 * transitions (`transition-[padding-left] duration-210 ease-out`) and the
 * selection outline's colour (`outline-color 150ms ease-out`, over a static
 * base rule so there is something to transition FROM) both stay CSS so
 * `@dnd-kit` and the page's own boxes never receive an inline `transform`
 * from an `m.*` ancestor — see `editor-motion.tsx` for the other three.
 *
 * **While controls show, only `editor-canvas` scrolls (2026-09-03).** The
 * toolbar and the inspector stay put; Preview removes that bound and returns
 * scrolling to the document. Close on the inspector clears selection without
 * walking Back.
 *
 * **The refusal summary sits inside this component's section but outside the
 * canvas.** Inside, because the section is what pads itself for the fixed
 * inspector and a sibling of it was covered by the panel; outside the canvas,
 * because a summary that scrolls away from the person who just pressed Save
 * solves nothing. The `<style>` holder beside it is `display: contents`, so
 * two stylesheets stop costing the section's `gap-4`.
 *
 * **The Page control is INSIDE that scroller and rides the page with it.**
 * Bounding the canvas would otherwise have made its old placement above the
 * canvas permanent — one pill holding a band of the author's backdrop at
 * every scroll offset, where before it scrolled away like anything else on
 * the page. Being inside the canvas puts it inside `onCanvasClick`'s own
 * subtree, which is why that handler exempts `CHROME_SCOPE`: without it the
 * press would open the inspector and the same click would close it again.
 *
 * **Its column owns the breath under the bar, and the bar owns none of it
 * (2026-09-04).** The toolbar's `mb-6` was outside this scroller, so it held
 * 24px of the author's backdrop under the chrome at every offset; this
 * column's `pt-3` is the first thing inside the scroller and scrolls away
 * with the pill it belongs to. The canvas begins exactly at the bar's foot.
 *
 * The stack's own top margin is edit-mode-free for the same reason: 32px
 * above the first section scrolls away on a document that scrolls and is
 * permanent furniture above a bounded canvas. Preview keeps the margin class
 * and renders identically, since `[data-controls="hidden"]` already zeroes
 * every `[data-editor-stack]` margin in CSS.
 *
 * **`onCanvasClick` asks `data-block-path` before `CHROME_SCOPE`
 * (2026-09-05).** An empty place's own wrapper carries `CHROME_SCOPE` too —
 * see `EditableBlockFrame` — so checking that exemption first silently
 * swallowed a click meant to select the enclosing container. The canvas's
 * own capture-phase Escape-deselect handler also exempts
 * `add-block-picker` now, alongside the panel and the source dock, for the
 * same class of fault: the picker is portalled to `document.body` rather
 * than nested inside either, so closing it with Escape cleared the
 * selection the picker's own target depended on. See the actors feature
 * note's account for both, found by this component's own e2e suite run for
 * the first time against real Clerk credentials.
 *
 * @returns the page editor.
 */
export function BlockEditor<T extends FieldValues>({
  control,
  lang,
  labels,
  page,
  problems,
  onApplyDocument,
  theme,
  pageFields,
  pageTheme,
  banner,
  pageInteractionsEnabled: interactionsEnabled,
  controlsHidden,
  selectionResetKey,
}: BlockEditorProps<T>) {
  const dndId = useId();
  const canvasRef = useRef<HTMLDivElement>(null);
  // **Where this component's own Add control portals to, if anywhere.**
  // `EditorToolbar` renders the target slot; a test that mounts this
  // component alone, with no provider above it, gets null here and the
  // portal below renders nothing — the same "absent is an ordinary answer"
  // shape `useEscapeSlot` already follows.
  const addSlot = useAddSlot();
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [refusal, setRefusal] = useState<DropRefusal | null>(null);
  const [advertisedTarget, setAdvertisedTarget] = useState<DropTarget | null>(
    null,
  );
  const [selection, setSelection] = useResettableSelection(selectionResetKey);
  const [tab, setTab] = useState<PropertiesTab>("primary");
  const [cloneRefusal, setCloneRefusal] = useState<CloneRefusal | null>(null);

  const field = useController({ control, name: "sections" as Path<T> });
  // Memoized so an unwritten field — which answers a fresh `[]` each time —
  // does not give every effect below a new dependency on every render.
  const value: unknown = field.field.value;
  const blocks = useMemo(() => (value ?? []) as Block[], [value]);
  const currentSelection = controlsHidden
    ? null
    : repairSelection(blocks, selection);

  // Preview is the page, not a suspended editor. Deriving `currentSelection`
  // above removes the inspector in the same render; `selectionResetKey`
  // invalidates the stored value in that same update, so Show controls cannot
  // resurrect it. The layout effect resets both possible scroll owners: edit
  // mode starts at the canvas top and Preview starts at the document top.
  useLayoutEffect(() => {
    if (canvasRef.current) canvasRef.current.scrollTop = 0;
    if (globalThis.scrollY !== 0) {
      globalThis.scrollTo({ top: 0, behavior: "auto" });
    }
  }, [controlsHidden]);

  // Read by the two callbacks the sensors hold across a whole drag. They are
  // memoized so the sensor is not rebuilt on every keystroke, which means they
  // cannot close over the render's own `blocks` — and it is synced in an
  // EFFECT rather than during render, which is both what React asks for and
  // sufficient: a key event is not a render, and every effect has run long
  // before one arrives.
  const pageRef = useRef(blocks);
  useEffect(() => {
    pageRef.current = blocks;
  }, [blocks]);

  // **Locks the canvas whenever page interaction is off, and releases it the
  // instant it turns on.** `blocks` is in the dependency list so a block
  // added or changed mid-session — a freshly authored link, a newly selected
  // player — is caught by the lock's own initial sweep as well as by its
  // `MutationObserver`, which is a courtesy against the observer running
  // late rather than a substitute for it.
  useEffect(() => {
    if (interactionsEnabled) return;
    const root = canvasRef.current;
    if (!root) return;
    return lockCanvasInteraction(root);
  }, [interactionsEnabled, blocks]);

  useEffect(() => {
    const repaired = repairSelection(blocks, selection);
    if (sameSelection(selection, repaired)) return;
    let active = true;
    queueMicrotask(() => {
      if (active) setSelection(repaired);
    });
    return () => {
      active = false;
    };
  }, [blocks, selection, setSelection]);

  // Where a KEYBOARD drag is now. There is no pointer to infer it from, and a
  // rectangle synthesised from the last arrow key would be a second answer to
  // a question the coordinate getter already answered exactly.
  const keyboardAt = useRef<BlockPath | undefined>(undefined);
  const keyboardTarget = useRef<DropTarget | null>(null);
  const pointerTarget = useRef<DropTarget | null>(null);

  /**
   * Hands the form a whole new page.
   *
   * Every control below writes through this, so the form holds one value and
   * the edits themselves stay pure functions somebody can test without a DOM.
   *
   * **It also retires the last refused drop.** The sentence explaining a
   * refusal used to be cleared only by the NEXT drag, so it sat on the page
   * through every subsequent edit — describing a gesture somebody had since
   * moved on from, about blocks they may have deleted. Any edit at all is
   * evidence they moved on.
   *
   * @param edit - what to make of the page.
   */
  const apply = (edit: (current: Block[]) => Block[]): void => {
    setRefusal(null);
    setCloneRefusal(null);
    const next = edit(blocks);
    setSelection((current) => repairSelection(next, current));
    field.field.onChange(next);
  };

  // See `detectCollisionAt`'s own TSDoc for what this does and why the
  // branching lives in a plain function rather than in this closure — the
  // inline arrow here is trivial so nothing here reads a ref during render.
  const detectCollision = useCallback<CollisionDetection>(
    (args) => detectCollisionAt(args, pageRef, keyboardTarget, pointerTarget),
    [],
  );

  /**
   * Enters one target, resetting the Properties panel to its first tab.
   *
   * **Always "primary", whatever the selection's own kind.** The old
   * Items/Options split picked a pane by whether the target could hold
   * children; the two-tab panel has no such asymmetry — every kind's own
   * pair (Content/Appearance, Layout/Appearance, Page/Theme) opens on its
   * first name.
   *
   * @param next - Page or a resolving block selection.
   */
  const enterSelection = (next: Exclude<EditorSelection, null>): void => {
    setSelection(next);
    setTab("primary");
  };

  /**
   * Where an arrow key moves a keyboard drag to.
   *
   * **It steps over any place nothing is showing**, and that is a fix rather
   * than a refinement. `placeOrder` walks the whole stored tree, while a
   * COLLAPSED card renders none of its places — so those places register no
   * droppable and the library has no rectangle for them. Landing on one used to
   * keep the new path anyway and fall back to the current coordinates, after
   * which the collision named an id nothing had registered, dnd-kit resolved
   * `over` to null, and the drag announced "it stayed where it was" while it
   * was still running; a space bar pressed there dropped nothing at all,
   * because `onDragEnd` returns early on a null `over`. So the walk keeps
   * stepping until it finds a place the library is actually measuring, which
   * makes every place the keyboard can reach one a drop can land on.
   *
   * @param event - the key.
   * @param args - the drag, and where it is now.
   * @returns the coordinates of the place it steps to, or nothing when the walk
   * runs out of places that are on screen.
   */
  // See `coordinateGetterAt`'s own TSDoc for what this does and why the
  // branching lives in a plain function rather than in this closure.
  const coordinateGetter = useCallback<KeyboardCoordinateGetter>(
    (event, args) =>
      coordinateGetterAt(event, args, pageRef, keyboardAt, keyboardTarget),
    [],
  );

  const keyboardOptions = useMemo(
    () => ({ coordinateGetter }),
    [coordinateGetter],
  );
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: DRAG_THRESHOLD },
    }),
    useSensor(KeyboardSensor, keyboardOptions),
  );

  /**
   * What a refusal says to the person who made the drop.
   *
   * @param why - the refusal `moveBlock` answered.
   * @returns the sentence.
   */
  const refusalText = (why: DropRefusal): string => {
    if (why === "into itself") return labels.drag.intoItself;
    if (why === "too deep") return labels.drag.tooDeep;
    if (why === "too many") return labels.drag.tooMany;
    return labels.drag.noSuchPlace;
  };

  /**
   * Remembers where a keyboard drag begins, and clears the last refusal.
   *
   * @param event - the lift.
   */
  const onDragStart = (event: DragStartEvent): void => {
    keyboardAt.current =
      canvasPlacePath(String(event.active.id)) ??
      placePath(String(event.active.id));
    keyboardTarget.current = null;
    pointerTarget.current = null;
    setAdvertisedTarget(null);
    setRefusal(null);
  };

  /** Mirrors dnd-kit's resolved target into editor-only renderer feedback. */
  const onDragOver = (): void => {
    setAdvertisedTarget(keyboardTarget.current ?? pointerTarget.current);
  };

  /** Clears transient destination chrome when a lift is cancelled. */
  const onDragCancel = (): void => {
    keyboardAt.current = undefined;
    keyboardTarget.current = null;
    pointerTarget.current = null;
    setAdvertisedTarget(null);
  };

  /**
   * Lands the lifted block on the sibling it was over, or says why it did not.
   *
   * Linear parents insert-and-shift; positional parents still exchange. See
   * {@link applySiblingDrop}. A no-op comes back as the very array it was
   * given, which is why the write is skipped by identity rather than by
   * comparing trees.
   *
   * @param event - what was lifted, and what it was over.
   */
  const onDragEnd = (event: DragEndEvent): void => {
    keyboardAt.current = undefined;
    const from =
      canvasPlacePath(String(event.active.id)) ??
      placePath(String(event.active.id));
    const target = keyboardTarget.current ?? pointerTarget.current;
    keyboardTarget.current = null;
    pointerTarget.current = null;
    setAdvertisedTarget(null);
    if (!from || !target || !event.over) return;
    const result = applyDrop(blocks, from, target);
    if (!result.ok) {
      setRefusal(result.refusal);
      return;
    }
    if (result.blocks !== blocks) {
      setRefusal(null);
      field.field.onChange(result.blocks);
    }
    setSelection({ kind: "block", path: result.path });
    setTab("primary");
  };

  /**
   * Deselects on an Escape the canvas itself owns, and no other.
   *
   * **The listener is on the CAPTURE phase, and that is the whole of why it
   * works.** `SectionStylePopup` closes itself from a bubble-phase `document`
   * listener; React had flushed that close before a bubble listener here ran,
   * so `event.target` was already detached from the document and
   * `target.closest(…)` answered null for a field that had genuinely been
   * inside the inspector. Measured: focus read `section-style-skin` with
   * `closest` finding the inspector immediately before the key, and the
   * selection cleared anyway. Capture runs before anything can remove the
   * target, so the question is asked of a node still in the tree.
   *
   * **The inspector, the source dock and the Add picker keep their own
   * Escape.** All three hold controls that close themselves with it — the
   * style popup, the icon picker, the dock's own dialog, `AddBlockPicker`'s
   * own dialog — and closing one of those must not also throw away what the
   * author had selected. `AddBlockPicker` is portalled to `document.body`
   * rather than rendered inside the panel, which is exactly why it needs
   * naming here rather than being reached through `properties-panel`'s own
   * selector: it was left off this list once, and pressing Escape to close
   * it silently cleared the current selection, retargeting the next Add at
   * the page root instead of the container the author had open — found by a
   * real depth-cap test failing with 8 layout options offered where the cap
   * should have refused all of them.
   */
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest(
          '[data-testid="properties-panel"], [data-testid="page-source-dock"], [data-testid="add-block-picker"]',
        )
      ) {
        return;
      }
      setSelection(null);
    };
    globalThis.addEventListener("keydown", onKey, true);
    return () => globalThis.removeEventListener("keydown", onKey, true);
  }, [setSelection]);

  /**
   * Chooses a block from a canvas click, or deselects on empty canvas.
   *
   * **Does nothing at all while page interaction is on.** The click belongs
   * to the page then — a real link, button or frame — and the interaction
   * lock is what already keeps that click from also changing selection; this
   * guard is what keeps it from changing selection through the OTHER path, a
   * click that reaches an inert element's non-inert wrapper.
   *
   * @param event - the click.
   */
  const onCanvasClick = (event: ReactMouseEvent<HTMLDivElement>): void => {
    if (interactionsEnabled) return;
    const target = event.target as Element | null;

    // **`data-block-path` is asked FIRST, `CHROME_SCOPE` only once that has
    // failed — reversed from an earlier version, and reversed for a real
    // fault.** `EditableBlockFrame`'s own empty-place wrapper carries
    // `CHROME_SCOPE` too, so Preview can hide its dashed placeholder box the
    // same way it hides every other editor-only island — so a click landing
    // on an EMPTY place (never itself carrying `data-block-path`, only
    // `data-canvas-path`) matched `CHROME_SCOPE` on itself and returned
    // before `closest("[data-block-path]")` ever ran, silently refusing to
    // select the enclosing container. Checking `data-block-path` first fixes
    // that without weakening the Page-control case this guard exists for:
    // the Page control rides the page, inside this handler's own subtree,
    // but is not nested inside any block's own `data-block-path` subtree, so
    // it still falls through to the `CHROME_SCOPE` check below and is
    // correctly ignored rather than clearing the selection a press had just
    // made.
    const hit = target?.closest("[data-block-path]");
    if (hit instanceof HTMLElement && event.currentTarget.contains(hit)) {
      const path = parseBlockPath(hit.dataset.blockPath ?? "");
      if (path) {
        const next: EditorSelection = { kind: "block", path };
        if (!sameSelection(currentSelection, next)) enterSelection(next);
        return;
      }
    }
    if (target?.closest(`.${CHROME_SCOPE}`)) return;
    setSelection(null);
  };

  /**
   * Places Add content at a target, selecting what was added.
   *
   * **The empty path is the page root, not a container**, so it cannot ask
   * `blockAt` for a target to append inside — `blockAt(blocks, [])` answers
   * null by design, the page being an array rather than a block. The new
   * block's own position is `blocks.length` either way, computed from THIS
   * render's closure over `blocks` before `apply` schedules the next one, and
   * a leaf added there lands wrapped in an unnamed one-place stack, at
   * `[position, 0]`, so depth 0 stays containers.
   *
   * This is the one function every Add mount calls — the toolbar's global
   * control is now the only one — so a target computed by `addTargetFor` and
   * a container's own path both select what they added the same way.
   *
   * @param path - where to add — a container's own path to append inside it,
   * or the empty path for the page root.
   * @param block - what to add.
   */
  const addAt = (path: BlockPath, block: Block): void => {
    const target = blockAt(blocks, path);
    const position =
      path.length === 0 ? blocks.length : nextChildPosition(target);
    apply((current) => addContentAt(current, path, block));
    if (path.length === 0) {
      const childPath = isContainer(block) ? [position] : [position, 0];
      setSelection({ kind: "block", path: childPath });
      setTab("primary");
      return;
    }
    if (target && isContainer(target)) {
      const childPath = [...path, position];
      setSelection({ kind: "block", path: childPath });
      setTab("primary");
    }
  };

  /**
   * What a drop should be ANNOUNCED as, when it is not an ordinary move.
   *
   * It asks `applySiblingDrop` again rather than reading what `onDragEnd`
   * decided out of a mutable box. That is not a second decision: the same
   * pure function on the same page answers the same thing, and there is no
   * moment at which the two could disagree — `@dnd-kit` dispatches to the
   * accessibility monitor inside the same batched update as the handler
   * above, so `blocks` here is still the page the drop was computed against.
   *
   * @param activeId - the drag id of what was lifted.
   * @param overId - the drag id of what it was dropped on.
   * @returns the refusal in words, or nothing when the drop succeeded.
   */
  const refusalOf = (activeId: string, overId: string): string | undefined => {
    const from = placePath(activeId);
    const to = placePath(overId);
    if (!from || !to) return;
    const result = applySiblingDrop(blocks, from, to);
    if (!result) return;
    return result.ok ? undefined : refusalText(result.refusal);
  };

  // Not memoized. It closes over the page, which changes on every edit, so a
  // `useMemo` over that buys nothing and costs the React Compiler its ability
  // to memoize the component at all. `useDndMonitor` re-registers a listener
  // when this changes, which is a set add and remove in an effect.
  const accessibility = {
    announcements: dragAnnouncements(
      labels.drag,
      (id) => placeName(canvasPlacePath(id) ?? placePath(id) ?? []),
      refusalOf,
    ),
    screenReaderInstructions: { draggable: labels.drag.instructions },
  };

  const atBlockLimit = countBlocks(blocks) >= BLOCK_LIMITS.blocks;
  // **One walk answers it for every card**, exactly as `atBlockLimit` does, so
  // every remove control in the editor locks at the same moment. A required
  // kind the page holds twice is not locked — the rule is at-least-one.
  const locked = lockedKinds(blocks, page.actorKind);
  // The kind select is narrowed to what this actor kind's page may hold —
  // `set_actor_sections` refuses the other one outright, and offering it here
  // was a control that accepted a press and produced an unexplained failure
  // one save later.
  const kinds = offerableLeafKinds(page.actorKind);
  // **One label bag for the Add picker, built once and passed to every
  // instance of it** — the toolbar's global control and (pending Task 4)
  // a container's own footer — rather than each call site re-slicing
  // `labels` its own way, which is exactly the kind of duplication that
  // drifts the moment a string is reworded in one place and not the others.
  const addPickerLabels = {
    add: labels.addBlock,
    title: labels.addBlockTitle,
    contentGroup: labels.addContentGroup,
    layoutGroup: labels.addLayoutGroup,
    nestingAtLimit: labels.nestingAtLimit,
    leafKinds: labels.leaf.leafKinds,
    modes: labels.modes,
  };
  // **The one global Add, portalled into the toolbar's slot (2026-09-04).**
  // `addTargetFor` reads the current selection — Page or nothing targets the
  // root, a container targets itself, a leaf targets its own parent — and
  // `addAt` is the same function every OTHER Add mount in this file already
  // calls, so a choice made through the toolbar selects what it added
  // exactly as one made from a container's own footer does.
  const addTarget = addTargetFor(blocks, currentSelection);
  const addProps: AddBlockPickerProps = {
    targetPath: addTarget.targetPath,
    kinds,
    mayAddLayout: addTarget.mayAddLayout,
    atBlockLimit,
    labels: addPickerLabels,
    page,
    locale: lang,
    onAdd: (block) => addAt(addTarget.targetPath, block),
  };
  // Position named once, exactly as `PublicBlocks` does it and for the same
  // reason: a block has no identity but where it sits, and
  // `react/no-array-index-key` reads the map callback's index parameter.
  const seats = blocks.map((block, position) => ({
    block,
    key: `seat-${position}`,
    position,
  }));
  const selectedPath =
    currentSelection?.kind === "block" ? currentSelection.path : undefined;
  const selectedBlock = selectedPath ? blockAt(blocks, selectedPath) : null;
  const selectedAttr = selectedPath ? formatBlockPath(selectedPath) : "";
  const measure = page.measure ?? DEFAULT_PAGE_MEASURE;

  const addPalette = (
    <>
      {atBlockLimit ? (
        <p className="text-sm text-(--muted)">{labels.atLimit}</p>
      ) : (
        <>
          <div className="grid gap-1.5">
            <button
              type="button"
              aria-expanded={presetsOpen}
              {...tid("section-presets")}
              onClick={() => setPresetsOpen((was) => !was)}
              className="flex w-fit items-center gap-1.5 rounded-lg surface border-(--edge)/60 px-3 py-1.5 text-sm"
            >
              <Sparkles className="size-4" />
              {labels.addSectionFor}
            </button>
            {presetsOpen ? (
              <div className="flex flex-wrap gap-1.5">
                {SECTION_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    {...tid(`preset-${preset.id}`)}
                    onClick={() => {
                      addAt([], presetBlock(preset));
                      setPresetsOpen(false);
                    }}
                    className="rounded-lg surface border-(--edge)/60 px-3 py-1.5 text-sm"
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <TemplatePicker
            hasSections={!holdsNothingAuthored(blocks, page.actorKind, theme)}
            templates={FURSONA_TEMPLATES.filter((template) =>
              fitsActorKind(template.blocks, page.actorKind),
            )}
            labels={labels}
            onApply={({ blocks: chosen, theme: nextTheme }) =>
              onApplyDocument({
                blocks: withRequiredBlocks(chosen, page.actorKind),
                theme: nextTheme,
              })
            }
          />
        </>
      )}
    </>
  );

  const selectedContainer =
    selectedBlock && isContainer(selectedBlock) ? selectedBlock : null;
  const selectedLeaf =
    selectedBlock && !isContainer(selectedBlock) ? selectedBlock : null;

  /**
   * Clones the current selection, or records why it was refused.
   *
   * Selects the copy on success, matching every other successful edit's own
   * convention. `cloneAt`'s no-op-by-identity return (a missing block) never
   * reaches here, because a selection that no longer resolves cannot be
   * selected in the first place — `repairSelection` sees to that on every
   * render.
   */
  const cloneSelected = (): void => {
    if (!selectedPath) return;
    const result = cloneAt(blocks, selectedPath);
    if (!result.ok) {
      setCloneRefusal(result.reason);
      return;
    }
    setCloneRefusal(null);
    if (result.blocks !== blocks) field.field.onChange(result.blocks);
    setSelection({ kind: "block", path: result.path });
    setTab("primary");
  };

  /**
   * Removes the current selection and selects its parent.
   *
   * **Depth 0 shrinks the array; anything nested clears its place**, the
   * same split `BlockCard`'s own remove button already makes — the page's
   * own list has no empty entries and cannot hold one. Applied uniformly to
   * a leaf as well as a container, which corrects a narrower case
   * `LeafEditor`'s own inline button never had to handle: a leaf sitting
   * alone at depth 0 would otherwise be `clearAt`, leaving a `null` the
   * page's own array has no shape for.
   */
  const deleteSelected = (): void => {
    if (!currentSelection || !selectedPath || !selectedBlock) return;
    const depth = selectedPath.length - 1;
    apply((current) =>
      depth === 0
        ? removeAt(current, selectedPath)
        : clearAt(current, selectedPath),
    );
    setSelection(parentSelection(currentSelection));
    setTab("primary");
  };

  // **Clone and Delete, or nothing — the page selection has neither.** See
  // `panelFootFor`'s own TSDoc for why this is a function call rather than a
  // `const` built from JSX inline: a JSX value is not a function boundary,
  // so every ternary in it would otherwise count directly against this
  // component.
  const panelFoot = panelFootFor({
    currentSelection,
    selectedBlock,
    selectedPath,
    selectedContainer,
    cloneRefusal,
    locked,
    labels,
    cloneSelected,
    deleteSelected,
  });

  // **The style bag's own gates, computed exactly as `BlockCard`/`LeafEditor`
  // already compute them for their own (now-hidden) style popup.** `atTop`
  // is a fact about DEPTH, never about the block's own kind — a container or
  // a leaf sitting directly on the page (path length 1) gets `bleed`/
  // `margins` and `label`/`imageFit`/`portrait` gated by kind either way.
  const selectedStyleGates = selectedBlock
    ? styleGatesFor(selectedBlock, (selectedPath?.length ?? 0) === 1)
    : null;

  const {
    primary: primaryContent,
    secondary: secondaryContent,
    panelLabels,
  } = panelContentFor({
    currentSelection,
    pageFields,
    addPalette,
    pageTheme,
    selectedContainer,
    selectedLeaf,
    selectedPath,
    selectedStyleGates,
    apply,
    lang,
    labels,
    atBlockLimit,
    locked,
    problems,
    kinds,
  });

  return (
    <section
      data-editor-stack
      // **Canvas accommodation transitions as plain CSS, never Motion** — the
      // spec's third motion place, kept off `m.*` on purpose so `@dnd-kit`
      // and the page's own boxes never receive an inline `transform` from
      // this. The transition applies at every width; it only ever has
      // something to animate from `md` up, where `pr-` itself is conditional.
      // **`pr-`, not `pl-` (2026-09-04)**: the Properties panel moved to the
      // desktop-right, so the canvas makes room on the right now.
      className={`${controlsHidden ? "mt-8 grid gap-4" : "flex min-h-0 flex-1 flex-col gap-4"} transition-[padding-right] duration-210 ease-out ${currentSelection ? "md:pr-[min(36rem,40vw)]" : ""}`}
    >
      {/* Inside the section, so the inspector's own accommodation padding
          moves it clear of the panel; outside the canvas, so it cannot
          scroll away from the person who just pressed Save. */}
      {banner}

      {/* **The one global Add, portalled into `EditorToolbar`'s slot.** Null
          until the slot mounts — see `useAddSlot`'s own note — which is the
          ordinary state in a test that renders this component with no
          provider above it. */}
      {addSlotPortal(addSlot, addProps)}

      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={detectCollision}
        accessibility={accessibility}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragCancel={onDragCancel}
        onDragEnd={onDragEnd}
      >
        <PropertiesPanel
          selection={currentSelection}
          tab={tab}
          onTab={setTab}
          labels={panelLabels}
          onClose={() => setSelection(null)}
          primary={primaryContent}
          secondary={secondaryContent}
          foot={panelFoot}
        />
        {/* **`contents`, because this holds only stylesheets.** As an ordinary
            flex child it generated no box and still cost the section's own
            `gap-4` — 16px of the author's backdrop spent on two `<style>`
            elements. `display: contents` takes it out of flex layout
            altogether; its children are `<style>`, which lay out nothing, so
            the gap has nothing to apply to. The class stays for the
            hide-controls rule to find, though a `<style>` needs no hiding: it
            draws nothing either way. */}
        <div className={`${CHROME_SCOPE} contents`}>
          {/* **The selection outline transitions its COLOUR, plain CSS rather
              than Motion** — the spec's fourth motion place, and the one that
              must not animate an author's own geometry or colours. A static
              base rule gives every block a transparent outline at the same
              offset the selected one uses, which is what lets the colour
              change TRANSITION rather than pop: transitioning `outline-color`
              alone needs the property already set to something, or there is
              nothing for the browser to interpolate FROM. Only the selected
              path's rule is conditional; the base rule always renders. */}
          <style>{`[data-editor-canvas] [data-block-path] { outline: 2px solid transparent; outline-offset: 4px; transition: outline-color 150ms ease-out; }`}</style>
          {selectedAttr ? (
            <style>{`[data-editor-canvas] [data-block-path="${selectedAttr}"] { outline-color: var(--accent); }`}</style>
          ) : null}
        </div>

        {/* A canvas selection is deliberately pointer-only; Escape provides
            the keyboard path for deselection, while Page in the toolbar
            provides keyboard selection without turning this document tree
            into one invalid, giant button. */}
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
        <div
          {...tid("editor-canvas")}
          ref={canvasRef}
          data-editor-canvas=""
          data-editor-stack
          className={
            controlsHidden
              ? "grid"
              : "grid min-h-0 flex-1 overflow-x-clip overflow-y-auto"
          }
          onClick={onCanvasClick}
        >
          {/* **The Page control RIDES the page, inside the scroller
              (2026-09-03).** It sat above the canvas, which was invisible
              while the document scrolled — it scrolled away with the sections
              like anything else on the page. Bounding the canvas made that
              placement permanent furniture instead: one pill holding a band of
              the author's own backdrop between the bar and their first
              section, at every scroll offset. It is still chrome and still
              leaves with every other island in Preview; what changed is that
              it now moves with the page it names.

              What that costs is reach — scroll far enough and it is gone, as
              it was before the canvas owned the scroll. The inspector's own
              Page breadcrumb is the route back from a selection; from no
              selection at all it is a scroll up. */}
          {/* Its breath above is `pt-3` HERE rather than a margin on the bar.
              The bar's own `mb-6` sat outside this scroller, so it held 24px
              of the author's backdrop under the chrome at every offset; this
              padding is the first thing in the scroller and scrolls away with
              the pill it belongs to. */}
          <WidePageColumn
            className={`${CHROME_SCOPE} py-0 pt-3 sm:py-0 sm:pt-3`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                {...tid("select-page")}
                onClick={() => {
                  enterSelection({ kind: "page" });
                }}
                className="rounded-lg surface border-(--edge)/60 bg-(--menu) px-3 py-1.5 text-sm"
              >
                {labels.selectPage}
              </button>
              {refusal ? (
                <p
                  role="status"
                  {...tid("drag-refusal")}
                  className="text-sm text-(--accent)"
                >
                  {refusalText(refusal)}
                </p>
              ) : null}
            </div>
          </WidePageColumn>
          {blocks.length === 0 ? (
            <p className={`${CHROME_SCOPE} px-4 py-8 text-sm text-(--muted)`}>
              {labels.empty}
            </p>
          ) : null}
          {seats.map((seat, position) => {
            const parsed = lenientBlockSchema.safeParse(seat.block);
            if (!parsed.success) return null;
            return (
              <div key={seat.key}>
                <div
                  {...tid("block-preview")}
                  className={pageBoxClass(
                    parsed.data,
                    position,
                    blocks.length,
                    measure,
                  )}
                >
                  <PublicBlock
                    block={parsed.data}
                    locale={lang}
                    depth={0}
                    path={String(seat.position)}
                    page={page}
                    editor={
                      controlsHidden || interactionsEnabled
                        ? undefined
                        : ({
                            wrap: ({ path, filled, children }) => (
                              <EditableBlockFrame
                                path={path}
                                filled={filled}
                                editor={{
                                  selectedPath: selectedAttr || undefined,
                                  activeTarget: advertisedTarget,
                                  dragLabel: labels.dragBlock,
                                }}
                              >
                                {children}
                              </EditableBlockFrame>
                            ),
                          } satisfies EditorRenderHook)
                    }
                  />
                </div>
              </div>
            );
          })}
        </div>
      </DndContext>
    </section>
  );
}
