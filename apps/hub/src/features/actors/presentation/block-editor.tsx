"use client";

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
import { Plus, Sparkles } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
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
  type Block,
} from "@/features/actors/domain/block-schema";
import {
  newContainer,
  setAt,
  SPACE_CHOICES,
  type BlockPath,
} from "@/features/actors/domain/block-edits";
import {
  placeId,
  placeName,
  placeOrder,
  placePath,
  placeUnderPointer,
  stepPlace,
  type PlaceCandidate,
} from "@/features/actors/domain/block-drag";
import {
  moveBlock,
  type MoveRefusal,
} from "@/features/actors/domain/block-moves";
import type { BlockProblem } from "@/features/actors/domain/block-problems";
import { sectionsToBlocks } from "@/features/actors/domain/section-block-shim";
import {
  holdsNothingAuthored,
  lockedKinds,
  withRequiredBlocks,
} from "@/features/actors/domain/required-blocks";
import type { AuthoringLanguage } from "@/features/actors/application/use-language-toggle";
import {
  BlockCard,
  type BlockCardLabels,
} from "@/features/actors/presentation/block-card";
import { BlockSlot } from "@/features/actors/presentation/block-slot";
import {
  dragAnnouncements,
  type DragAnnouncementLabels,
} from "@/features/actors/presentation/drag-announcements";
import { LeafEditor } from "@/features/actors/presentation/leaf-editor";
import {
  SECTION_PRESETS,
  presetBlock,
} from "@/features/actors/presentation/section-presets";
import { SectionPreviewTray } from "@/features/actors/presentation/section-preview-tray";
import { CHROME_SCOPE } from "@/shared/domain/chrome";
import { WidePageColumn } from "@/shared/presentation/page-shell";
import {
  TemplatePicker,
  type TemplatePickerLabels,
} from "@/features/actors/presentation/template-picker";
import { tid } from "@/shared/infrastructure/test-id";

/**
 * What a drag says, plus the three ways a drop can be refused.
 *
 * **The refusals are `MoveRefusal` in words.** `moveBlock` answers why a drop
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
 * `previewTitle` lives here rather than in `BlockCardLabels` because this level
 * renders each top-level card and its sibling real-renderer tray together.
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
}

/**
 * What {@link BlockEditor} needs.
 *
 * `problems` is threaded from the form rather than recomputed here, so one
 * walk of react-hook-form's error tree answers it for every card — and so the
 * banner and the marks beneath it can never disagree about which blocks are
 * wrong. *
 * **It takes a `PageContext` and reads none of it**, threading it to the preview
 * trays so the real renderer sees the live actor. It takes no theme at all any
 * more: the DOCUMENT wears the page being built, so a section preview inherits
 * the author's palette, skin and field from `:root` the same way a stranger's
 * browser will. What keeps that off the workbench is `CHROME_SCOPE` on each
 * control island, not a boundary around each preview.
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
}

/** The shape a new section starts at, before anybody changes it. */
const NEW_SPACES = 2;

/** How far a pointer travels before a press becomes a drag rather than a click. */
const DRAG_THRESHOLD = 8;

/** Which arrow keys step towards the end of the list of places. */
const FORWARD_KEYS = new Set(["ArrowDown", "ArrowRight"]);

/** Which arrow keys step back towards its start. */
const BACK_KEYS = new Set(["ArrowUp", "ArrowLeft"]);

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
 * **Anything may be dragged anywhere a place will hold it**, which is what
 * `@dnd-kit` bought and `@hello-pangea/dnd` could not sell: its own README
 * rules out dragging between a parent list and a child list, and rules out
 * grids, and a grid of places nested three deep is exactly this. What a drop
 * MEANS is `moveBlock`'s, computed with no library in sight; this component
 * decides only which two places a gesture named.
 *
 * **The collision function resolves to the DEEPEST place under the pointer.**
 * Places nest, so every enclosing place contains the pointer too and a
 * distance-to-centre ranking answers a leaf inside the container somebody is
 * hovering — silently, one level in. Ranking by path length is the same fact
 * as "innermost" at any depth, which is what makes it hold at three rather
 * than being a two-level special case. See `placeUnderPointer`.
 *
 * **A keyboard drag walks a list rather than reading geometry**, and the two
 * differ on purpose: a pointer cannot avoid the places inside the block it is
 * carrying, while a list can simply leave them out — so arrowing a section
 * along lands on the next section rather than inside the one being moved. The
 * coordinate getter names the place and the collision function is told it
 * directly, because a keyboard drag is discrete navigation and inferring it
 * back from a synthesised rectangle would be a second, guessable answer.
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
 * **The add controls are withdrawn at the block cap, with a sentence saying
 * why.** A button that silently does nothing reads as broken, and the cap is
 * not a fault on the person's part — it is a number `blocksSchema` and
 * `validate_block` both enforce, mirrored here only so nobody discovers it
 * after a save. It is counted the way the schema counts it, empty places
 * excluded, rather than approximated by the length of the outermost array.
 *
 * **A template fills the whole page rather than adding to it**, which is why
 * the picker asks first when there is anything to lose. Templates are still
 * written in the flat vocabulary and are converted by `sectionsToBlocks` — the
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
 * @returns the page editor.
 */
export function BlockEditor<T extends FieldValues>({
  control,
  lang,
  labels,
  page,
  problems,
}: BlockEditorProps<T>) {
  const id = useId();
  const dndId = useId();
  const [spaces, setSpaces] = useState(NEW_SPACES);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [refusal, setRefusal] = useState<MoveRefusal | null>(null);

  const field = useController({ control, name: "sections" as Path<T> });
  // Memoized so an unwritten field — which answers a fresh `[]` each time —
  // does not give every effect below a new dependency on every render.
  const value: unknown = field.field.value;
  const blocks = useMemo(() => (value ?? []) as Block[], [value]);

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
  // Where a KEYBOARD drag is now. There is no pointer to infer it from, and a
  // rectangle synthesised from the last arrow key would be a second answer to
  // a question the coordinate getter already answered exactly.
  const keyboardAt = useRef<BlockPath | undefined>(undefined);

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
    field.field.onChange(edit(blocks));
  };

  /**
   * The place under the pointer, or the one a keyboard drag has stepped to.
   *
   * @param args - what the library is measuring, and where the pointer is.
   * @returns the one place a drop would land on, or none.
   */
  const detectCollision = useCallback<CollisionDetection>((args) => {
    const from = placePath(String(args.active.id));
    if (!from) return [];
    if (!args.pointerCoordinates) {
      const target = keyboardAt.current;
      return target ? [{ id: placeId(target) }] : [];
    }
    const candidates: PlaceCandidate[] = [];
    for (const container of args.droppableContainers) {
      const path = placePath(String(container.id));
      const rect = args.droppableRects.get(container.id);
      if (path && rect) {
        candidates.push({ id: String(container.id), path, rect });
      }
    }
    const hit = placeUnderPointer(
      candidates,
      args.pointerCoordinates.x,
      args.pointerCoordinates.y,
      from,
    );
    return hit ? [{ id: hit.id }] : [];
  }, []);

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
  const coordinateGetter = useCallback<KeyboardCoordinateGetter>(
    (event, args) => {
      const forward = FORWARD_KEYS.has(event.code);
      if (!forward && !BACK_KEYS.has(event.code)) return;
      const from = placePath(String(args.active));
      if (!from) return;
      const order = placeOrder(pageRef.current, from);
      let next = stepPlace(order, keyboardAt.current ?? from, forward);
      while (next) {
        const rect = args.context.droppableRects.get(placeId(next));
        if (rect) {
          keyboardAt.current = next;
          return { x: rect.left, y: rect.top };
        }
        next = stepPlace(order, next, forward);
      }
    },
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
  const refusalText = (why: MoveRefusal): string => {
    if (why === "into itself") return labels.drag.intoItself;
    if (why === "too deep") return labels.drag.tooDeep;
    return labels.drag.noSuchPlace;
  };

  /**
   * Remembers where a keyboard drag begins, and clears the last refusal.
   *
   * @param event - the lift.
   */
  const onDragStart = (event: DragStartEvent): void => {
    keyboardAt.current = placePath(String(event.active.id));
    setRefusal(null);
  };

  /**
   * Exchanges the two places a drag named, or says why it did not.
   *
   * A block carries no `sort_order` — the array IS the order, at every depth —
   * so there is nothing to renumber afterwards and nothing a save can send
   * stale. A no-op comes back as the very array it was given, which is why the
   * write is skipped by identity rather than by comparing trees.
   *
   * @param event - what was lifted, and what it was over.
   */
  const onDragEnd = (event: DragEndEvent): void => {
    keyboardAt.current = undefined;
    const from = placePath(String(event.active.id));
    const to = event.over ? placePath(String(event.over.id)) : undefined;
    if (!from || !to) return;
    const result = moveBlock(blocks, from, to);
    if (!result.ok) {
      setRefusal(result.refusal);
      return;
    }
    if (result.blocks !== blocks) apply(() => result.blocks);
  };

  /**
   * What a drop should be ANNOUNCED as, when it is not an ordinary move.
   *
   * It asks `moveBlock` again rather than reading what `onDragEnd` decided out
   * of a mutable box. That is not a second decision: the same pure function on
   * the same page answers the same thing, and there is no moment at which the
   * two could disagree — `@dnd-kit` dispatches to the accessibility monitor
   * inside the same batched update as the handler above, so `blocks` here is
   * still the page the drop was computed against.
   *
   * @param activeId - the drag id of what was lifted.
   * @param overId - the drag id of what it was dropped on.
   * @returns the refusal in words, or nothing when the drop succeeded.
   */
  const refusalOf = (activeId: string, overId: string): string | undefined => {
    const from = placePath(activeId);
    const to = placePath(overId);
    if (!from || !to) return;
    const result = moveBlock(blocks, from, to);
    return result.ok ? undefined : refusalText(result.refusal);
  };

  // Not memoized. It closes over the page, which changes on every edit, so a
  // `useMemo` over that buys nothing and costs the React Compiler its ability
  // to memoize the component at all. `useDndMonitor` re-registers a listener
  // when this changes, which is a set add and remove in an effect.
  const accessibility = {
    announcements: dragAnnouncements(
      labels.drag,
      (id) => placeName(placePath(id) ?? []),
      refusalOf,
    ),
    screenReaderInstructions: { draggable: labels.drag.instructions },
  };

  const atBlockLimit = countBlocks(blocks) >= BLOCK_LIMITS.blocks;
  // **One walk answers it for every card**, exactly as `atBlockLimit` does, so
  // every remove control in the editor locks at the same moment. A required
  // kind the page holds twice is not locked — the rule is at-least-one.
  const locked = lockedKinds(blocks, page.actorKind);
  // Position named once, exactly as `PublicBlocks` does it and for the same
  // reason: a block has no identity but where it sits, and
  // `react/no-array-index-key` reads the map callback's index parameter.
  const seats = blocks.map((block, position) => ({
    block,
    key: `seat-${position}`,
    position,
  }));

  return (
    // **The section is FULL WIDTH and its controls are columned, not the other
    // way round.** Every depth-0 preview below has to be able to apply the
    // author's own measure and to bleed to both browser edges, which it cannot
    // do inside a `max-w-7xl` box — that is the same inversion the public
    // routes already make, where the route asks the shell for a full-width
    // `main` and each section centres itself.
    <section data-editor-stack className="mt-8 grid gap-4">
      <WidePageColumn className={`${CHROME_SCOPE} py-0 sm:py-0`}>
        {/* **A workbench group PAINTS, because what is behind it is somebody
            else's page.** These used to be bare text and a ghost button on the
            app's own muted field. The document wears the author's theme now, so
            the ground under every control is a colour they chose — and a
            translucent control has no guaranteed contrast against a colour
            somebody else picks. */}
        <div className="grid gap-4 rounded-xl surface border-(--edge) bg-(--surface-solid) p-3 sm:p-4">
          <h2 className="font-display text-lg font-bold tracking-tight">
            {labels.sectionsTitle}
          </h2>

          {/* Replaces rather than appends: a template is a starting point, and
          merging one onto what somebody already wrote produces a page nobody
          asked for. The picker owns the confirmation that makes that safe. */}
          <TemplatePicker
            // **Has the AUTHOR written anything**, not "are there any sections".
            // Every page now opens carrying its required blocks, so the plain
            // count is true of a page nobody has touched — and the confirmation
            // this drives would then warn somebody about losing work they had not
            // done. See `holdsNothingAuthored`.
            hasSections={!holdsNothingAuthored(blocks, page.actorKind)}
            labels={labels}
            // **The shim runs on the converted template.** A template ships
            // structure in the flat vocabulary and names no identity block, and
            // applying one REPLACES the page — so without this, choosing a
            // template would silently strip somebody's portrait and handle and
            // leave a page the write then refuses. The templates themselves are
            // deliberately left alone: they are what the app suggests somebody
            // write, and the identity blocks are not that.
            onApply={(sections) =>
              apply(() =>
                withRequiredBlocks(sectionsToBlocks(sections), page.actorKind),
              )
            }
          />

          {/* A refused drop, in words. `moveBlock` names three of them, and a
          drag that quietly changed nothing would be indistinguishable from a
          broken grip. */}
          {refusal ? (
            <p
              role="status"
              {...tid("drag-refusal")}
              className="text-sm text-(--accent)"
            >
              {refusalText(refusal)}
            </p>
          ) : null}

          {blocks.length === 0 ? (
            <p className="text-sm text-(--muted)">{labels.empty}</p>
          ) : null}
        </div>
      </WidePageColumn>

      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={detectCollision}
        accessibility={accessibility}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <div data-editor-stack className="grid gap-6">
          {seats.map((seat) => (
            <div key={seat.key} data-editor-stack className="grid gap-2">
              <WidePageColumn className={`${CHROME_SCOPE} py-0 sm:py-0`}>
                <BlockSlot
                  path={[seat.position]}
                  filled
                  label={labels.dragSection}
                >
                  {(handle) =>
                    isContainer(seat.block) ? (
                      <BlockCard
                        block={seat.block}
                        path={[seat.position]}
                        apply={apply}
                        lang={lang}
                        labels={labels}
                        atBlockLimit={atBlockLimit}
                        locked={locked}
                        problems={problems}
                        dragHandle={handle}
                      />
                    ) : (
                      // **A page may hold a leaf at the top level**, and one this
                      // editor could not show would be content nobody can read or
                      // remove while every save kept writing it back. Nothing here
                      // builds one — the add control makes sections — but the
                      // schema admits one, and a drag can now make one: a section
                      // dropped into a place puts whatever was there at the top.
                      <LeafEditor
                        leaf={seat.block}
                        path={[seat.position]}
                        apply={apply}
                        lang={lang}
                        labels={labels}
                        problems={problems}
                        dragHandle={handle}
                      />
                    )
                  }
                </BlockSlot>
              </WidePageColumn>
              {isContainer(seat.block) ? (
                <SectionPreviewTray
                  block={seat.block}
                  position={seat.position}
                  count={blocks.length}
                  lang={lang}
                  page={page}
                />
              ) : null}
            </div>
          ))}
        </div>
      </DndContext>

      <WidePageColumn className={`${CHROME_SCOPE} grid gap-4 py-0 sm:py-0`}>
        {atBlockLimit ? (
          <p className="text-sm text-(--muted)">{labels.atLimit}</p>
        ) : (
          <>
            <div className="flex items-end gap-2">
              <div className="grid gap-1.5">
                <label
                  htmlFor={`${id}-new-spaces`}
                  className="text-xs font-medium"
                >
                  {labels.newSectionSpaces}
                </label>
                <select
                  id={`${id}-new-spaces`}
                  {...tid("new-section-spaces")}
                  value={String(spaces)}
                  onChange={(event) => setSpaces(Number(event.target.value))}
                  className="rounded-lg surface border-(--edge)/60 bg-(--menu) px-3 py-1.5 text-sm"
                >
                  {SPACE_CHOICES.map((count) => (
                    <option key={count} value={count}>
                      {count}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                {...tid("add-section")}
                onClick={() =>
                  apply((current) =>
                    setAt(
                      current,
                      [current.length],
                      newContainer("grid", spaces),
                    ),
                  )
                }
                className="flex items-center gap-1.5 rounded-lg surface border-(--edge)/60 px-3 py-1.5 text-sm"
              >
                <Plus className="size-4" />
                {labels.addSection}
              </button>
            </div>

            {/* Brand presets append at once — there is nothing to lose by adding
              a box, unlike the template picker's replace. */}
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
                        apply((current) =>
                          setAt(current, [current.length], presetBlock(preset)),
                        );
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
          </>
        )}
      </WidePageColumn>
    </section>
  );
}
