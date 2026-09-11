"use client";

import {
  DndContext,
  KeyboardCode,
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
  newContainer,
  newLeaf,
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
  palettePayload,
  placeId,
  placeName,
  placeOrder,
  placePath,
  stepPlace,
} from "@/features/actors/domain/block-drag";
import {
  insertTargetsFor,
  stepInsertSection,
  stepInsertTarget,
  type InsertTarget,
} from "@/features/actors/domain/palette-targets";
import { insertBlockAt } from "@/features/actors/domain/palette-insert";
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
  type PropertiesActiveTab,
  type PropertiesPanelLabels,
} from "@/features/actors/presentation/properties-panel";
import { AddPalette } from "@/features/actors/presentation/add-palette";
import {
  Block as PublicBlock,
  DEFAULT_PAGE_MEASURE,
  pageBoxClass,
  type EditorRenderHook,
} from "@/features/actors/presentation/blocks";
import {
  AppendSlot,
  EditableBlockFrame,
} from "@/features/actors/presentation/editable-block-frame";
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
 * **`addBlock`/`addBlockTitle` are unread catalogue strings now (2026-09-06),
 * matching `addSection`/`newSectionSpaces` above them.** They named the
 * single global Add control's trigger and its dialog heading — the compact
 * builder menu's `AddBlockPicker`, portalled into `EditorToolbar` from
 * whichever scope was selected — and that whole mechanism is deleted along
 * with `add-target.ts`/`add-slot.tsx`: adding a block is a drag from the
 * persistent Palette tab now, which needs no trigger to open it and draws no
 * dialog with a heading. Left in both catalogues rather than chased through
 * every consumer for a removal this task did not otherwise need.
 * `addContentGroup`/`addLayoutGroup` remain read, by `AddPalette`'s own
 * headings over its leaf-kind and container-mode thumbnails.
 *
 * **`panelTabPalette` names the Properties panel's persistent third tab
 * (2026-09-05).** It is never selection-dependent the way `selectPage`/
 * `panelTabTheme`/`addContentGroup`/etc. are, since the Palette tab shows the
 * same thing whatever is or is not selected — see `panelContentFor`'s own
 * `defaultLabels` and its two other branches, all three of which now carry
 * this same fixed string.
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
   * Unread (2026-09-06). Named the single global Add control's trigger in
   * the toolbar, deleted along with `AddBlockPicker`/`add-target.ts`/
   * `add-slot.tsx` — see this interface's own TSDoc.
   */
  addBlock: string;
  /** Unread (2026-09-06). Named the deleted picker's own dialog heading. */
  addBlockTitle: string;
  /** Heading over the Palette tab's content thumbnails. */
  addContentGroup: string;
  /** Heading over the Palette tab's layout thumbnails. */
  addLayoutGroup: string;
  /**
   * The Properties panel's Appearance tab — a container's and a leaf's
   * second tab alike (2026-09-04).
   */
  panelTabAppearance: string;
  /** The Properties panel's Theme tab, Page's second tab. */
  panelTabTheme: string;
  /**
   * The Properties panel's persistent third tab's own name (2026-09-05) —
   * never selection-dependent, unlike the two above.
   */
  panelTabPalette: string;
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
 * The Properties panel renders unconditionally now (2026-09-05), showing its
 * persistent Palette tab whether or not anything is selected — see
 * `properties-panel.tsx`'s own TSDoc for why. It starts deselected, and with
 * nothing selected the panel shows only that one tab; selecting a canvas
 * block or Page shows two more, fixed per selection kind: Page/Theme,
 * Layout/Appearance or Content/Appearance — see `panelContentFor`. There is
 * no Items tab and no tree navigation any more — click-to-select on the
 * canvas is the only way in to those two.
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
 *
 * **The canvas accommodation width is a shared token now, not a literal
 * repeated per consumer (2026-09-05).** `--properties-panel-width` is
 * declared once in `globals.css` as `min(36rem, 40vw)`; this component's own
 * `md:pr-(--properties-panel-width)` and `properties-panel.tsx`'s
 * `md:w-(--properties-panel-width)` both read it, and
 * `page-source-dock.tsx` reads the same token through its own `panelOpen`
 * prop — so all three stay in step by construction rather than by three
 * people remembering the same magic number in three files.
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
   * component's section by `md:pr-(--properties-panel-width)` so the
   * fixed inspector has somewhere to sit; a banner rendered as a sibling of
   * that section got no such padding, and the inspector — open exactly when
   * somebody presses Save — covered its heading and every message under it.
   * Measured at 1280:
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
 * @param insertTargetsRef - every place a palette-origin drag in progress
 * may land on, computed once at `onDragStart` — read here, never written.
 * @param paletteKeyboardTarget - the palette target a keyboard step last
 * resolved to, written by {@link paletteCoordinateAt} — read here, never
 * written, mirroring how `keyboardTarget` is read rather than written by the
 * canvas-move branch below.
 * @returns the one place a drop would land on, or none.
 */
// eslint-disable-next-line sonarjs/cognitive-complexity -- collision admission must parse the matching id space, contain the pointer, validate the domain drop, and rank the deepest nested destination in one pass
function detectCollisionAt(
  args: Parameters<CollisionDetection>[0],
  pageRef: RefObject<Block[]>,
  keyboardTarget: RefObject<DropTarget | null>,
  pointerTarget: RefObject<DropTarget | null>,
  insertTargetsRef: RefObject<readonly InsertTarget[] | null>,
  paletteKeyboardTarget: RefObject<InsertTarget | null>,
): ReturnType<CollisionDetection> {
  const activeId = String(args.active.id);

  // **A palette-origin drag is an EARLY, mutually exclusive branch.** It
  // never calls `applyDrop` — `insertBlockAt` is what validates a drop, not
  // the move planner — and it is decided purely by whether the pointer is
  // over any of the ids `insertTargetsFor` already offered at `onDragStart`,
  // ranked deepest-first exactly as the pointer branch below already ranks
  // canvas-move candidates. **A keyboard drag reads `paletteKeyboardTarget`
  // instead (2026-09-05, closing what was "not wired for the palette until a
  // later task")** — mirroring the canvas-move branch's own
  // `keyboardTarget.current` read below, since `paletteCoordinateAt` already
  // resolved and wrote the winning target for this exact key press.
  const paletteItem = palettePayload(activeId);
  if (paletteItem) {
    if (!args.pointerCoordinates) {
      const target = paletteKeyboardTarget.current;
      return target ? [{ id: canvasPlaceId(target.path) }] : [];
    }
    let bestInsert: { readonly id: string; readonly depth: number } | undefined;
    for (const target of insertTargetsRef.current ?? []) {
      const id = canvasPlaceId(target.path);
      const rect = args.droppableRects.get(id);
      if (!rect) continue;
      const { x, y } = args.pointerCoordinates;
      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
        continue;
      }
      if (!bestInsert || target.path.length > bestInsert.depth) {
        bestInsert = { id, depth: target.path.length };
      }
    }
    return bestInsert ? [{ id: bestInsert.id }] : [];
  }

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
 * Where a palette-origin keyboard drag steps to.
 *
 * A plain function for the same reason {@link detectCollisionAt} and
 * {@link coordinateGetterAt} are ones — its own branching (recognising which
 * key it reads, choosing which stepper answers it, and walking rendered
 * targets until one is on screen) is counted against a budget of its own
 * rather than against {@link coordinateGetterAt}'s, which would otherwise
 * absorb it on every canvas-move drag too.
 *
 * **Arrow keys read `stepInsertTarget`; Tab and Shift+Tab read
 * `stepInsertSection`.** Forward is `ArrowDown`/`ArrowRight` exactly as the
 * canvas-move branch defines it, or `Tab` without the shift key; backward is
 * `ArrowUp`/`ArrowLeft`, or `Tab` WITH the shift key — the same convention
 * `stepInsertSection`'s own TSDoc assumes when it says "Tab and Shift+Tab are
 * therefore not exact inverses on a page of three or more sections." That
 * asymmetry is `stepInsertSection`'s own, accepted rather than corrected
 * here — see its TSDoc for the reason, and for why no test in this file
 * asserts exact backward/forward symmetry across three or more sections.
 *
 * **Reads `insertTargetsRef.current` rather than recomputing
 * `orderedInsertTargets(pageRef.current, item)` on every key press** — a
 * deliberate departure from this task's own brief. `insertTargetsRef` is
 * computed exactly once, at `onDragStart`, and {@link detectCollisionAt}'s
 * palette branch and `onDragEnd`'s already read that SAME computation rather
 * than recomputing it, specifically so a page edited mid-drag cannot make the
 * pointer branch and the keyboard branch disagree about which targets exist.
 * Recomputing here only for the keyboard case would reopen exactly that
 * disagreement — the ranked pointer highlight (`insertTargets` on
 * `AppendSlot`, the one place still lighting up every candidate at once —
 * see `apps/hub/src/features/actors/CLAUDE.md`'s "drop-target-legibility"
 * account for why `EditableBlockFrame`'s own copy of this is gone) and the
 * keyboard step could point at two different sets of targets during the
 * same drag.
 *
 * **It keeps stepping until a rendered rectangle exists**, mirroring
 * {@link coordinateGetterAt}'s own loop for the identical reason: a target
 * `insertTargetsFor` names is real in the domain sense the moment the drag
 * begins, but nothing guarantees every one of them has a mounted, measured
 * droppable at the instant a key is pressed.
 *
 * @param event - the key.
 * @param args - the drag, and where it is now.
 * @param insertTargetsRef - every place this drag may land on, computed once
 * at `onDragStart` — read here, never written.
 * @param paletteKeyboardTarget - written with the target a step resolves to.
 * @returns the coordinates of the target it steps to, or nothing when the key
 * is not one this drag reads, or the walk runs out of targets that are on
 * screen.
 */
function paletteCoordinateAt(
  event: Parameters<KeyboardCoordinateGetter>[0],
  args: Parameters<KeyboardCoordinateGetter>[1],
  insertTargetsRef: RefObject<readonly InsertTarget[] | null>,
  paletteKeyboardTarget: RefObject<InsertTarget | null>,
): ReturnType<KeyboardCoordinateGetter> {
  const forward = FORWARD_KEYS.has(event.code);
  const back = BACK_KEYS.has(event.code);
  const tab = event.code === "Tab";
  if (!forward && !back && !tab) return;
  const goingForward = tab ? !event.shiftKey : forward;
  const step = tab ? stepInsertSection : stepInsertTarget;
  const order = insertTargetsRef.current ?? [];
  let next = step(
    order,
    paletteKeyboardTarget.current ?? undefined,
    goingForward,
  );
  while (next) {
    const rect = args.context.droppableRects.get(canvasPlaceId(next.path));
    if (rect) {
      paletteKeyboardTarget.current = next;
      return { x: rect.left, y: rect.top };
    }
    next = step(order, next, goingForward);
  }
}

/**
 * Where an arrow key moves a keyboard drag to.
 *
 * A plain function for the same reason {@link detectCollisionAt} is one —
 * its own branching (walking rendered places until one is on screen, and
 * refusing a candidate the domain itself would refuse) is counted against a
 * budget of its own rather than against {@link BlockEditor}'s.
 *
 * **A palette-origin drag is checked FIRST and delegates to
 * {@link paletteCoordinateAt} entirely** — mirroring `onDragStart`'s own
 * palette branch — because arrow-key stepping through
 * `orderedInsertTargets` and Tab's own section-skip have nothing in common
 * with `placeOrder`/`stepPlace` below beyond both answering a
 * `KeyboardCoordinateGetter`. The two are mutually exclusive per drag, the
 * same way `onDragStart`, `detectCollisionAt` and `onDragEnd` already keep
 * their own two branches apart.
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
 * @param insertTargetsRef - every place a palette-origin drag in progress
 * may land on, computed once at `onDragStart` — forwarded to
 * {@link paletteCoordinateAt} untouched.
 * @param paletteKeyboardTarget - forwarded to {@link paletteCoordinateAt}
 * untouched; never read or written on the canvas-move path below.
 * @returns the coordinates of the place it steps to, or nothing when the walk
 * runs out of places that are on screen.
 */
function coordinateGetterAt(
  event: Parameters<KeyboardCoordinateGetter>[0],
  args: Parameters<KeyboardCoordinateGetter>[1],
  pageRef: RefObject<Block[]>,
  keyboardAt: RefObject<BlockPath | undefined>,
  keyboardTarget: RefObject<DropTarget | null>,
  insertTargetsRef: RefObject<readonly InsertTarget[] | null>,
  paletteKeyboardTarget: RefObject<InsertTarget | null>,
): ReturnType<KeyboardCoordinateGetter> {
  if (palettePayload(String(args.active))) {
    return paletteCoordinateAt(
      event,
      args,
      insertTargetsRef,
      paletteKeyboardTarget,
    );
  }
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
 * The page's own root append slot — one past the last top-level section,
 * where a whole new SECTION lands when a palette drag targets it.
 *
 * Pulled out of {@link BlockEditor}'s own render body for two reasons at
 * once: it keeps that component's cognitive complexity under the budget,
 * and — because this is a plain, lowercase helper rather than a component
 * or hook by naming convention — `react-hooks/refs` does not treat its
 * read of `insertTargetsRef.current` as a ref access "during render" the
 * way it would inside `BlockEditor`'s own top-level JSX. `blocks.tsx` never
 * wraps this component's own top-level seat list in a call to `Block`, so
 * there is no `editor.appendSlot` call site for the page root the way a
 * container's own is reached — this is the one place in the tree that
 * renders `AppendSlot` directly rather than through that render-prop seam.
 *
 * `controlsHidden`/`interactionsEnabled` gate visibility, matching every
 * other editor-only island; `blocksLength` is the page's own top-level
 * child count, read fresh on every call so a stale count can never reach
 * the rendered slot; `insertTargetsRef` is the same ref {@link BlockEditor}
 * threads to every other `AppendSlot` on the page.
 *
 * @returns the append slot, or `null` while controls are hidden or page
 * interaction is on.
 */
function pageRootAppendSlot({
  controlsHidden,
  interactionsEnabled,
  blocksLength,
  insertTargetsRef,
}: {
  readonly controlsHidden: boolean;
  readonly interactionsEnabled: boolean;
  readonly blocksLength: number;
  readonly insertTargetsRef: RefObject<readonly InsertTarget[] | null>;
}): ReactNode {
  if (controlsHidden || interactionsEnabled) return null;
  return (
    <AppendSlot
      path={formatBlockPath([blocksLength])}
      insertTargets={insertTargetsRef.current}
    />
  );
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
 * How many places a section added from the palette starts with.
 *
 * **Moved here from the deleted `add-block-picker.tsx` (2026-09-06), which
 * used to be this constant's only home.** Nothing outside this file reads
 * it any more — the modal picker it was written for is gone, and the
 * palette's own `onDragEnd` palette branch is now its one caller — so it is
 * a local constant rather than an export.
 */
const PICKER_SPACES = 2;

/** What {@link panelContentFor} needs to build one selection kind's panes. */
interface PanelContentInputs {
  /** The repaired, current selection — `null`, Page, or a block. */
  currentSelection: EditorSelection | null;
  /** The Page tab's identity fields, unrelated to its theme. */
  pageFields: ReactNode;
  /**
   * The section-adding controls — brand presets and the template picker —
   * shown only alongside the Page fields.
   *
   * **Named `pageStartOptions`, not `addPalette` (2026-09-05).** This is a
   * whole-PAGE starting point — "pick a template for the whole page" — and
   * is a wholly different thing from the persistent Palette tab's own
   * `AddPalette` component, which drags a single block onto the canvas. The
   * two used to share a name (`addPalette`, lowercase, for this; `AddPalette`
   * the component, capitalized) in the same file, which is legal TypeScript
   * and a real trap for the next reader.
   */
  pageStartOptions: ReactNode;
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
  pageStartOptions,
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
    paletteTab: labels.panelTabPalette,
  };

  if (currentSelection?.kind === "page") {
    return {
      primary: (
        <>
          {pageFields}
          {pageStartOptions}
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
        paletteTab: labels.panelTabPalette,
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
        paletteTab: labels.panelTabPalette,
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
 * **A palette-origin lift needed the identical fix a second time
 * (2026-09-06), on a THIRD id space neither `canvasPlacePath` nor
 * `placePath` was ever going to understand.** `active.id` at the start of
 * such a drag is a `paletteId(...)` string naming a leaf kind or a
 * container mode, not a place — so the `name` callback fell through to
 * `placeName([])` and announced "Picked up ." with the item unnamed, on
 * every palette lift, silently. `dragItemName` checks `palettePayload`
 * first and names the item itself; `over.id` never needs the same
 * treatment, because a palette item is only ever a draggable SOURCE and
 * every `over` during its drag is a real, already-rendered canvas place.
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
 * **The persistent Palette tab is the only way to add, now that
 * `AddBlockPicker`/`add-target.ts`/`add-slot.tsx` are deleted (2026-09-06).**
 * A person drags a leaf-kind or layout thumbnail from the Properties panel's
 * own Palette tab directly onto the live canvas — see `add-palette.tsx` and
 * this component's own `onDragStart`/`detectCollisionAt`/`onDragEnd` palette
 * branches — or lifts one by keyboard and steps between highlighted targets.
 * The container's own footer (`BlockCard`'s `add-place` button, which
 * appends an empty position rather than a block) is the only other
 * add-adjacent control, inside a container's own Layout tab. The Items scope
 * this used to live in (`inspector-items.tsx`, since deleted — see "The
 * Properties panel replaces the recursive inspector" in the actors feature
 * note) is gone entirely, and so is the single global Add button the
 * compact-menu plan replaced the Items scope's own controls with — see the
 * actors feature note's "Drag-to-add from a palette tab" account for what
 * replaced each removed mechanism in turn.
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
 * swallowed a click meant to select the enclosing container. See the actors
 * feature note's account, found by this component's own e2e suite run for
 * the first time against real Clerk credentials.
 *
 * **The canvas's own capture-phase Escape-deselect handler no longer needs
 * to name the Add mechanism at all (2026-09-06).** It used to exempt
 * `add-block-picker` by name, because that dialog was portalled to
 * `document.body` rather than nested inside the panel or the source dock —
 * so closing it with Escape cleared the selection the picker's own target
 * depended on. The Palette tab that replaced it is one of `PropertiesPanel`'s
 * own panes, which the existing `properties-panel` exemption already
 * covers, so nothing new needed adding when the picker was deleted.
 *
 * **The Properties panel renders unconditionally now, and its persistent
 * Palette tab's own content is deferred-mounted (2026-09-05).** The panel
 * itself is no longer selection-gated — see `properties-panel.tsx`'s own
 * TSDoc — so this component's canvas accommodation padding
 * (`md:pr-(--properties-panel-width)`) is tied to `controlsHidden`
 * alone rather than to `currentSelection`: gating it on a selection would
 * leave the canvas unaccommodated, with the panel covering its own right
 * edge, the moment nothing is selected. **`page-source-dock.tsx` reads the
 * same `controlsHidden`-derived condition through its own `panelOpen` prop**,
 * so the two never disagree about whether the panel is showing. A
 * `paletteOpened` flag, set once the Palette tab is
 * first asked for and never reset, gates whether `AddPalette`'s content is
 * actually passed to `PropertiesPanel`'s `palette` prop at all — mirroring
 * `PageSourceField`'s own `sourceMounted` guard elsewhere in this feature.
 * Without it, `AddPalette` mounts all sixteen leaf-kind and eight
 * container-mode previews through the real renderer on every render of this
 * component regardless of whether anybody ever opens the tab, `player`/
 * `jukebox` among them — both of which reach `useTranslations` through
 * `RetroPlayer`, which crashes outright in any harness that does not wrap
 * this component in `NextIntlClientProvider`.
 *
 * **A palette thumbnail is a real drag source onto the canvas now
 * (2026-09-05).** `onDragStart` branches on `palettePayload` first and
 * never falls through to the canvas-move logic below it; the winning branch
 * computes `insertTargetsFor` once and stores it on `insertTargetsRef`,
 * which `detectCollisionAt`'s own early palette branch ranks
 * deepest-path-first against real registered droppable rects.
 * `onDragEnd`'s matching branch calls `insertBlockAt` — never `applyDrop`,
 * since inserting fresh content is not a move — selects the result on
 * success, and sets the same `refusal` state the canvas-move branch already
 * renders through `drag-refusal` on failure.
 *
 * **A palette thumbnail lifts by keyboard now too (2026-09-05).** Enter or
 * Space on a focused thumbnail starts the drag, the arrow keys step through
 * `orderedInsertTargets` via `paletteCoordinateAt`, and Tab/Shift+Tab skip a
 * whole top-level section via `stepInsertSection` — the same
 * `coordinateGetterAt` mechanism the canvas-move drag already used, branched
 * on `palettePayload` first exactly as `onDragStart` and `detectCollisionAt`
 * already branch. The shared `KeyboardSensor`'s own `keyboardCodes.end`
 * drops Tab (dnd-kit's default includes it, which would otherwise end ANY
 * keyboard drag on that key before a coordinate getter ever ran) — settled
 * by reading the installed `@dnd-kit/core` rather than by adding a second,
 * competing `onKeyDown` listener. `paletteKeyboardTarget`, parallel to
 * `keyboardTarget`, holds the step's own current position and is cleared
 * everywhere that ref already is.
 *
 * **Every container's own append slot — one past its current children — is
 * a real, always-mounted droppable (2026-09-05).** `PublicBlock`'s `editor`
 * prop supplies `appendSlot`, the `EditorRenderHook` member `Block`
 * (`blocks.tsx`) calls once per container right after that container's own
 * children; this component reads the container's live child count fresh out
 * of `blocks` via `blockAt` on every call, so a stale count can never reach
 * the rendered `AppendSlot`.
 *
 * **The PAGE's own root append slot is a real droppable too, closed
 * (2026-09-06) rather than left for a later task.** One past the last
 * top-level section is where a whole new SECTION lands — the one thing
 * `AddBlockPicker` was still needed for even after the container-level slot
 * shipped, since the top-level seat list below is never itself passed
 * through `Block`, so `appendSlot` never had a call site for it. This
 * component renders one `AppendSlot` of its own, directly after the last
 * seat, at `formatBlockPath([blocks.length])` — the exact top-level target
 * `insertTargetsFor` already offered from Task 1 of the palette feature,
 * unreachable by pointer until now for want of a rendered rectangle to drop
 * onto. See the actors feature note's own account of both.
 *
 * **A canvas-move drag's own landing draws exactly one `DropMark`, never
 * every candidate (2026-09-11).** Its `wrap` call site passes
 * `carriedHeight: null` into `EditableBlockInstrumentation` — there is no
 * carried block to measure for this drag either, since it moves the
 * rendered node itself rather than a ghost of it — see the actors feature
 * note's "drop-target-legibility" account for the full change, including
 * why `AppendSlot` alone still lights up every palette target at once.
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
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [refusal, setRefusal] = useState<DropRefusal | null>(null);
  const [advertisedTarget, setAdvertisedTarget] = useState<DropTarget | null>(
    null,
  );
  // **Forces exactly one re-render at the start and end of a palette-origin
  // drag, found missing by a real browser rather than assumed present
  // (2026-09-06).** `insertTargetsRef` below is a ref precisely because its
  // own comment says "the drag's own `onDragOver`-driven state updates"
  // already cause whatever render this needs — which is true for a
  // canvas-move drag, whose `onDragOver` calls `setAdvertisedTarget` with a
  // value that changes as the pointer crosses targets, and false for a
  // palette-origin one: `pointerTarget`/`keyboardTarget` are written only by
  // the canvas-move branches of `onDragStart`/`detectCollisionAt`, so a
  // palette drag's `onDragOver` computes `null ?? null` for its entire
  // course and React bails out of every one of those `setAdvertisedTarget`
  // calls as a no-op state update. Nothing else in this component re-renders
  // during that window, so `insertTargetsRef.current` — set at
  // `onDragStart` — was captured stale (still `null`, from before the drag)
  // in every `AppendSlot` the tree renders (and, before
  // `apps/hub/src/features/actors/CLAUDE.md`'s "drop-target-legibility"
  // change, every `EditableBlockFrame` too), and `data-canvas-drop="place"`
  // never appeared for a real pointer-driven palette drag.
  // `palette-drag-to-add.spec.ts`'s own depth-cap case and
  // `a11y.spec.ts`'s drag-in-progress scan both caught this the first time
  // either asked a real browser rather than jsdom's degenerate rects. This
  // state's only job is to differ from itself across that boundary — `true`
  // at the start of a palette drag, `false` at its end or cancellation —
  // which is enough: `insertTargetsFor`'s own membership answer is constant
  // for the whole drag, so nothing here needs to change on every pointer
  // move the way `advertisedTarget` genuinely does for a canvas-move one.
  const [, setPaletteDragActive] = useState(false);
  const [selection, setSelection] = useResettableSelection(selectionResetKey);
  const [tab, setTab] = useState<PropertiesActiveTab>("primary");
  // **`AddPalette` does not mount until the Palette tab is opened once, and
  // stays mounted after that (2026-09-05).** It draws every leaf kind and
  // container mode through the real renderer, `player`/`jukebox` included —
  // the same "gate the mount, not the render" shape the deleted
  // `AddBlockPicker`'s own dialog `open` state used to give it for free, now
  // that there is no dialog to gate behind. This pane is a persistent TAB,
  // mounted
  // whether or not it is the active one, per `PropertiesPanel`'s own
  // "hidden, never omitted" convention for its panes — so without this flag,
  // every render of this component would mount all sixteen leaf-kind and
  // eight container-mode previews unconditionally, which needs a real
  // `NextIntlClientProvider` that a caller who never opens this tab would
  // otherwise have no reason to supply. The same shape `PageSourceField`'s
  // own `sourceMounted` guard already uses for the source dock.
  const [paletteOpened, setPaletteOpened] = useState(false);
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
  // **Every place a palette-origin drag in progress may land on, computed
  // once at `onDragStart` and read by `detectCollisionAt` on every pointer
  // move.** A ref rather than state: recomputing this is `insertTargetsFor`
  // walking the whole page, and nothing reads it during render except
  // through the `editor` object literal below, which itself is rebuilt on
  // every render regardless. **A render still has to be TRIGGERED for that
  // fresh read to reach the DOM, and this file used to claim the drag's own
  // `onDragOver`-driven state updates already caused one — see
  // `paletteDragActive`'s own comment above for why that was false, found
  // by a real browser rather than assumed.**
  const insertTargetsRef = useRef<readonly InsertTarget[] | null>(null);
  // **Where a palette-origin KEYBOARD drag is now — parallel to
  // `keyboardTarget`, and read by nothing on the canvas-move path.**
  // `keyboardTarget` and `keyboardAt` above are the canvas-move drag's own
  // "where is this now" pair; a palette drag has no `BlockPath` of its own
  // to move FROM, only a target to land ON, which is why this needs no
  // `paletteKeyboardAt` counterpart to `keyboardAt`.
  const paletteKeyboardTarget = useRef<InsertTarget | null>(null);

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
    (args) =>
      detectCollisionAt(
        args,
        pageRef,
        keyboardTarget,
        pointerTarget,
        insertTargetsRef,
        paletteKeyboardTarget,
      ),
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
      coordinateGetterAt(
        event,
        args,
        pageRef,
        keyboardAt,
        keyboardTarget,
        insertTargetsRef,
        paletteKeyboardTarget,
      ),
    [],
  );

  // **`end` deliberately drops `Tab` from dnd-kit's own default.** The
  // installed `@dnd-kit/core@6.3.1` has no way to declare Tab a "step" key —
  // `KeyboardSensorOptions.keyboardCodes` offers exactly three buckets
  // (`start`/`cancel`/`end`), never a fourth for an arbitrary coordinate-
  // changing key — and its DEFAULT `end` bucket already contains `Tab`
  // alongside Space and Enter. `KeyboardSensor.handleKeyDown` checks
  // `keyboardCodes.end` BEFORE ever calling the coordinate getter, so with
  // the default left in place, pressing Tab during ANY drag — palette or
  // canvas-move — ends it outright and `paletteCoordinateAt` never sees the
  // key at all. Removing Tab from `end` here is what lets it fall through
  // to the coordinate getter instead, which is the only configuration this
  // library supports for what Step 1 of this task's own brief asked to
  // confirm.
  //
  // **This is a single sensor shared by both branches, so the change is
  // shared too** — a canvas-move drag loses Tab as a redundant, undocumented
  // way to END a drag (Space and Enter already do that, and still do), and
  // gains nothing from it, since `coordinateGetterAt`'s own `FORWARD_KEYS`/
  // `BACK_KEYS` never included Tab. No code and no test in this file relied
  // on Tab ending a canvas-move drag before this change.
  const keyboardOptions = useMemo(
    () => ({
      coordinateGetter,
      keyboardCodes: {
        start: [KeyboardCode.Space, KeyboardCode.Enter],
        cancel: [KeyboardCode.Esc],
        end: [KeyboardCode.Space, KeyboardCode.Enter],
      },
    }),
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
   * **A palette-origin drag is checked FIRST and never falls through to the
   * canvas-move branch below.** `palettePayload` only ever answers a real
   * value for an id `paletteId` built, which no canvas grip or inspector
   * row ever produces, so the two branches cannot both fire for one lift.
   * `insertTargetsFor` is computed exactly once here, against the
   * page as it stood the moment the drag began — `detectCollisionAt`,
   * `paletteCoordinateAt` (the keyboard equivalent) and `onDragEnd` all read
   * this same computation rather than recomputing it, which is what makes a
   * page edited mid-drag able to go stale under a target the drag is still
   * carrying (see `insertBlockAt`'s own independent re-check).
   *
   * @param event - the lift.
   */
  const onDragStart = (event: DragStartEvent): void => {
    const activeId = String(event.active.id);
    const paletteItem = palettePayload(activeId);
    if (paletteItem) {
      insertTargetsRef.current = insertTargetsFor(blocks, paletteItem);
      paletteKeyboardTarget.current = null;
      keyboardAt.current = undefined;
      keyboardTarget.current = null;
      pointerTarget.current = null;
      setAdvertisedTarget(null);
      setRefusal(null);
      setPaletteDragActive(true);
      return;
    }
    insertTargetsRef.current = null;
    paletteKeyboardTarget.current = null;
    keyboardAt.current = canvasPlacePath(activeId) ?? placePath(activeId);
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
    insertTargetsRef.current = null;
    paletteKeyboardTarget.current = null;
    keyboardAt.current = undefined;
    keyboardTarget.current = null;
    pointerTarget.current = null;
    setAdvertisedTarget(null);
    setPaletteDragActive(false);
  };

  /**
   * Lands the lifted block on the sibling it was over, or says why it did not.
   *
   * **A palette-origin drag is checked FIRST, and it never calls
   * `applyDrop`.** `insertBlockAt` is what validates a palette drop —
   * inserting a freshly built leaf or container is not a move, so the move
   * planner has nothing to say about it. It re-checks the depth and count
   * caps independently of whatever `insertTargetsFor` offered at
   * `onDragStart`, which is what catches a target gone stale from an edit
   * made mid-drag. A drop with no `over` at all — the pointer never crossed
   * a valid target — does nothing, matching the canvas-move branch's own
   * `!event.over` guard below.
   *
   * Linear parents insert-and-shift; positional parents still exchange. See
   * {@link applySiblingDrop}. A no-op comes back as the very array it was
   * given, which is why the write is skipped by identity rather than by
   * comparing trees.
   *
   * @param event - what was lifted, and what it was over.
   */
  const onDragEnd = (event: DragEndEvent): void => {
    const activeId = String(event.active.id);
    const paletteItem = palettePayload(activeId);
    if (paletteItem) {
      insertTargetsRef.current = null;
      paletteKeyboardTarget.current = null;
      setAdvertisedTarget(null);
      setPaletteDragActive(false);
      const overId = event.over ? String(event.over.id) : undefined;
      const targetPath = overId ? canvasPlacePath(overId) : undefined;
      if (!targetPath) return;
      const block =
        paletteItem.kind === "leaf"
          ? newLeaf(paletteItem.leafKind)
          : newContainer(paletteItem.mode, PICKER_SPACES);
      const result = insertBlockAt(blocks, targetPath, block);
      if (!result.ok) {
        setRefusal(result.reason);
        return;
      }
      setRefusal(null);
      field.field.onChange(result.blocks);
      // A bare leaf landing at the page root is wrapped in a new one-place
      // `stack` by `insertBlockAt` itself — see that function's own TSDoc —
      // and `result.path` is still the WRAPPER's path, never the leaf's own
      // nested position. The old, now-deleted `addAt` handled this exact case
      // explicitly (`isContainer(block) ? [position] : [position, 0]`); this
      // mirrors it, so a freshly dropped leaf selects itself rather than the
      // stack it was wrapped in.
      const selectedPath =
        paletteItem.kind === "leaf" && targetPath.slice(0, -1).length === 0
          ? [...result.path, 0]
          : result.path;
      setSelection({ kind: "block", path: selectedPath });
      setTab("primary");
      return;
    }
    keyboardAt.current = undefined;
    const from = canvasPlacePath(activeId) ?? placePath(activeId);
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
   * **The inspector and the source dock keep their own Escape.** Both hold
   * controls that close themselves with it — the style popup, the icon
   * picker, the dock's own dialog — and closing one of those must not also
   * throw away what the author had selected.
   *
   * **The removed `AddBlockPicker` used to need naming here too, and that is
   * worth remembering rather than only deleting.** Its dialog was portalled
   * to `document.body`, outside the panel, so `properties-panel`'s own
   * selector could not reach it; leaving it off this list once let Escape
   * silently clear the current selection while closing the dialog,
   * retargeting the next Add at the page root instead of the container the
   * author had open. The Palette tab that replaced it needs no equivalent
   * entry: `AddPalette` renders as one of `PropertiesPanel`'s own panes, so
   * `[data-testid="properties-panel"]` already covers it.
   */
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest(
          '[data-testid="properties-panel"], [data-testid="page-source-dock"]',
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
   * **Its only caller now is the brand preset control** — see
   * `pageStartOptions` below — now that the palette's own `onDragEnd` branch
   * calls `insertBlockAt` directly rather than through this function. Both
   * still select what they added and reset the panel to its primary tab, so
   * a page built through either route behaves the same way afterwards.
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
  // **A palette-origin lift names the ITEM being lifted, not a place
  // (2026-09-06).** `active.id` for such a drag is a `paletteId(...)` string
  // — `"palette:leaf:text"`, say — which neither `canvasPlacePath` nor
  // `placePath` can resolve, so before this branch existed the callback fell
  // through to `placeName([])`: the empty string, announcing "Picked up ."
  // with nothing named at all. The exact fault this file's own `refusalOf`
  // paragraph already documents for a canvas grip's id, recurring on a
  // second id space nobody had checked yet — `over.id` during the same drag
  // is always a real canvas place (a palette item is only ever a draggable
  // SOURCE, never a droppable target), so only the lift needed this.
  const dragItemName = (id: string): string => {
    const item = palettePayload(id);
    if (!item) return placeName(canvasPlacePath(id) ?? placePath(id) ?? []);
    return item.kind === "leaf"
      ? labels.leaf.leafKinds[item.leafKind]
      : labels.modes[item.mode];
  };

  const accessibility = {
    announcements: dragAnnouncements(labels.drag, dragItemName, refusalOf),
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

  const pageStartOptions = (
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

  // **The persistent Palette tab's content.** Built once, reusing the exact
  // same catalogue values `pages/labels.ts` already resolves for the leaf
  // kinds and container modes — no separate translation keys for the group
  // headings or the per-kind/per-mode names. Each thumbnail is a real
  // `useDraggable` source by mouse and by keyboard (`AddPalette`'s own
  // TSDoc), and `insertTargetsRef`/`detectCollisionAt`'s palette branch/
  // `onDragEnd`'s palette branch above are what land a drop.
  // `insertTargetsFor` offers the append slot — one past a container's last
  // child, one past the page's own last section — as a valid target, and
  // BOTH are real, always-registered droppable targets now: a container's
  // own through the `appendSlot` member of the `editor` hook object below,
  // mounted by `blocks.tsx` calling `editor?.appendSlot?.(path)`; the
  // page's own root append slot through the `AppendSlot` this component
  // renders directly after the last top-level seat, further down — see
  // that element's own comment for why it needed a call site of its own.
  const palettePane = (
    <AddPalette
      labels={{
        contentGroup: labels.addContentGroup,
        layoutGroup: labels.addLayoutGroup,
        kindNames: labels.leaf.leafKinds,
        modeNames: labels.modes,
      }}
      page={page}
      locale={lang}
    />
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
    pageStartOptions,
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
      // **Tied to `controlsHidden` alone, not to `currentSelection`
      // (2026-09-05).** The Properties panel now renders whenever controls
      // show — its persistent Palette tab needs no selection at all — so
      // gating this on `currentSelection` would leave the panel covering the
      // canvas's own right edge, unaccommodated, the moment nothing is
      // selected. `controlsHidden` is exactly the condition under which the
      // panel is hidden by the CSS hide-controls rule (both are
      // `CHROME_SCOPE`), so the two now agree.
      className={`${controlsHidden ? "mt-8 grid gap-4" : "flex min-h-0 flex-1 flex-col gap-4"} transition-[padding-right] duration-210 ease-out ${controlsHidden ? "" : "md:pr-(--properties-panel-width)"}`}
    >
      {/* Inside the section, so the inspector's own accommodation padding
          moves it clear of the panel; outside the canvas, so it cannot
          scroll away from the person who just pressed Save. */}
      {banner}

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
          activeTab={tab}
          onTab={(next) => {
            setTab(next);
            if (next === "palette") setPaletteOpened(true);
          }}
          labels={panelLabels}
          onClose={() => setSelection(null)}
          primary={primaryContent}
          secondary={secondaryContent}
          palette={paletteOpened ? palettePane : null}
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
                                  // **No carried block to measure for a
                                  // canvas-move drag** — `null` is exactly
                                  // right there too, since dragging an
                                  // EXISTING block moves the rendered node
                                  // itself rather than a ghost of it. A
                                  // real height is a later task's job, once
                                  // the palette's own winner is published
                                  // through `activeTarget`.
                                  carriedHeight: null,
                                }}
                              >
                                {children}
                              </EditableBlockFrame>
                            ),
                            // **The palette's "append a new row" target
                            // (2026-09-05).** `containerPath` is the SAME
                            // hyphenated path `wrap` already received for
                            // this container; the append position itself —
                            // one past its own child count — is read fresh
                            // from `blocks` here rather than trusted to a
                            // caller, so a stale count can never reach
                            // `AppendSlot`.
                            appendSlot: (containerPath) => {
                              const parsedContainerPath =
                                parseBlockPath(containerPath) ?? [];
                              const containerBlock = blockAt(
                                blocks,
                                parsedContainerPath,
                              );
                              const childCount =
                                containerBlock && isContainer(containerBlock)
                                  ? containerBlock.children.length
                                  : 0;
                              return (
                                <AppendSlot
                                  path={formatBlockPath([
                                    ...parsedContainerPath,
                                    childCount,
                                  ])}
                                  insertTargets={insertTargetsRef.current}
                                />
                              );
                            },
                          } satisfies EditorRenderHook)
                    }
                  />
                </div>
              </div>
            );
          })}
          {/* **The page's own root append slot (2026-09-06).** See
              {@link pageRootAppendSlot}'s own TSDoc for the full account —
              extracted to a top-level helper rather than inlined here, both
              to keep this component's own cognitive complexity under budget
              and to keep its ref read out of `react-hooks/refs`' reach. */}
          {pageRootAppendSlot({
            controlsHidden,
            interactionsEnabled,
            blocksLength: blocks.length,
            insertTargetsRef,
          })}
        </div>
      </DndContext>
    </section>
  );
}
