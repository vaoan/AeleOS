"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { useQueryStates } from "nuqs";
import { useId } from "react";
import {
  applyFursonaFilters,
  isFiltering,
} from "@/features/actors/domain/fursona-filters";
import { useFursonas } from "@/features/actors/application/use-fursonas";
import { useFursonaMutations } from "@/features/actors/application/use-fursona-mutations";
import {
  FursonaFiltersBar,
  fursonaSearchParams,
  type FursonaFiltersBarLabels,
} from "@/features/actors/presentation/fursona-filters-bar";
import {
  dragAnnouncements,
  type DragAnnouncementLabels,
} from "@/features/actors/presentation/drag-announcements";
import {
  FursonaRow,
  type FursonaRowActor,
  type FursonaRowLabels,
} from "@/features/actors/presentation/fursona-row";
import type { Arrangement } from "@/features/actors/infrastructure/fursona-arrangement";
import type { Actor } from "@/features/actors/infrastructure/fursonas";
import { tid } from "@/shared/infrastructure/test-id";

/**
 * Translated strings the list and everything inside it needs.
 *
 * `drag` is what a drag says out loud, nested for the reason the editor's bag
 * nests its own: `dropped` and `cancelled` would collide flat with words this
 * bag already has.
 */
export interface FursonaListLabels
  extends FursonaRowLabels, FursonaFiltersBarLabels {
  /** Shown when the person owns no fursonas at all. */
  empty: string;
  /** Shown when a filter matches nothing — deliberately not the same. */
  noMatches: string;
  /**
   * What a drag says out loud.
   *
   * Nested for the same reason the editor's is: these are the same five words
   * in both places and they carry a `dropped` and a `cancelled` that would
   * collide with this bag's own vocabulary if they were flat.
   */
  drag: DragAnnouncementLabels;
}

/**
 * What {@link FursonaList} needs.
 *
 * `address` is passed straight through to each row, which uses it to link out
 * to the page a stranger would see.
 */
export interface FursonaListProps {
  /** The owner's public address, passed to each row so it can link out. */
  address?: string;
  /** The rows the server rendered with, used to seed the query. */
  initial: Actor[];
  /** Already-translated strings. */
  labels: FursonaListLabels;
}

/**
 * Orders fursonas: pinned first, then whatever the owner arranged, then handle.
 *
 * A fursona with no arrangement row sorts after every arranged one rather than
 * first. Absent means never arranged, and treating that as position zero would
 * shuffle somebody's untouched fursonas above the ones they deliberately placed.
 *
 * @param rows - the fursonas to order; the person row is not among them.
 * @param arrangement - the owner's arrangement rows.
 * @returns the fursonas in display order.
 */
function inArrangedOrder(
  rows: FursonaRowActor[],
  arrangement: Arrangement[],
): FursonaRowActor[] {
  const by = new Map(arrangement.map((a) => [a.actorRef, a]));
  return rows.toSorted((a, b) => {
    const left = by.get(a.actorRef);
    const right = by.get(b.actorRef);
    if (Boolean(left?.featured) !== Boolean(right?.featured))
      return left?.featured ? -1 : 1;
    const l = left?.sortOrder ?? Number.POSITIVE_INFINITY;
    const r = right?.sortOrder ?? Number.POSITIVE_INFINITY;
    if (l !== r) return l - r;
    return a.handle.localeCompare(b.handle);
  });
}

/**
 * What to say above the list when it has nothing in it, if anything.
 *
 * **Two different silences, and saying the wrong one is the fault this
 * prevents.** "You have no fursonas" is untrue when the truth is "none match
 * what you typed", and it invites somebody to create a duplicate of one they
 * already have. Written as two guards rather than nested ternaries, because
 * which case a reader is in was the part that had gone hard to see.
 *
 * @param ownsNone - whether they own none at all.
 * @param shown - how many survive the current filter.
 * @param empty - shown when they own none at all.
 * @param noMatches - shown when a filter hid the ones they own.
 * @returns the sentence, or null when there is a list to show.
 */
function emptyNote(
  ownsNone: boolean,
  shown: number,
  empty: string,
  noMatches: string,
): string | null {
  if (ownsNone) return empty;
  if (shown === 0) return noMatches;
  return null;
}

/** How far a pointer travels before a press becomes a drag rather than a click. */
const DRAG_THRESHOLD = 8;

/**
 * How the keyboard steps a row through the list.
 *
 * Hoisted so its identity is stable: `useSensor` memoizes on the options
 * object, and one built inline would rebuild the sensor on every render.
 */
const KEYBOARD_OPTIONS = { coordinateGetter: sortableKeyboardCoordinates };

/**
 * One row, wired to be sorted.
 *
 * A component of its own because `useSortable` is a hook and a row is one of
 * many: calling it in a loop is not allowed, and calling it inside
 * `FursonaRow` would make that component know which library moves it.
 *
 * **The four things it returns land on two elements**, and dropping any of
 * them fails silently. `setNodeRef` goes on the row, so the library has
 * something to measure and move; `listeners` and `attributes` go on the grip,
 * so a press or a space bar starts a drag at all; and `setActivatorNodeRef`
 * goes on the grip too, so focus returns to it after a keyboard drop rather
 * than to the top of the page.
 *
 * @returns the row.
 */
function SortableFursonaRow({
  actor,
  address,
  labels,
  featured,
  canArrange,
  onPin,
  onDelete,
}: {
  /** The fursona this row is for. */
  actor: FursonaRowActor;
  /** The owner's public address, when they have one. */
  address?: string;
  /** Already-translated strings. */
  labels: FursonaListLabels;
  /** Whether this fursona is pinned first. */
  featured: boolean;
  /** False while the list is filtered, when reordering has no meaning. */
  canArrange: boolean;
  /** Called with the actor ref and the pin state being asked for. */
  onPin: (actorRef: string, featured: boolean) => void;
  /** Called with the actor ref once a delete is confirmed. */
  onDelete: (actorRef: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: actor.actorRef, disabled: !canArrange });

  return (
    <FursonaRow
      address={address}
      actor={actor}
      labels={labels}
      featured={featured}
      canArrange={canArrange}
      drag={{
        ref: setNodeRef,
        style: {
          transform: CSS.Translate.toString(transform),
          transition,
          zIndex: isDragging ? 1 : undefined,
        },
        handle: (
          <button
            type="button"
            ref={setActivatorNodeRef}
            aria-label={labels.dragToReorder}
            {...tid("drag-fursona")}
            {...attributes}
            {...listeners}
            className="cursor-grab touch-none text-(--muted)"
          >
            <GripVertical className="size-4" />
          </button>
        ),
      }}
      onPin={onPin}
      onDelete={onDelete}
    />
  );
}

/**
 * The fursona list: filters, rows, and the three writes.
 *
 * The person's own row is pinned to the top and never sorted, filtered or
 * dragged — it is the account rather than a character, and it is the one row
 * that must always be findable.
 *
 * **Dragging is offered only when nothing is filtered** and there is more than
 * one fursona. A reorder computed from a narrowed view would move rows the
 * person cannot see, and one fursona has nothing to be ordered against.
 *
 * **The grip is the handle and the row is not.** `useSortable`'s listeners go
 * on the grip alone — `setActivatorNodeRef` is exactly that seam — so a
 * keyboard Space on Edit, Pin or Delete stays that control's own action, and a
 * press anywhere on the row does not begin a drag.
 *
 * **`<DndContext id={useId()}>`, and it is not decoration.** dnd-kit generates
 * ids from a module-level counter, and that id reaches the DOM as
 * `aria-describedby` on every grip — so two server renders in one warm process
 * emit different ids and every request after the first hydrates mismatched.
 * React's own id is stable across the pair.
 *
 * **The announcements are ours rather than the library's.** dnd-kit's defaults
 * are hard-coded English built out of raw drag ids, which here are actor
 * refs — a UUID read out at somebody in the wrong language. `dragAnnouncements`
 * names a row by its position instead.
 *
 * **The write happens on drop, not on a later save.** `onDragEnd` calls
 * `reorder.mutate` for every row whose position changed, which is
 * `setFursonaOrder` → `set_fursona_order` — so unlike the section editor,
 * there is no client-only reorder step that a save could silently fail to
 * persist: the drop itself is the write.
 *
 * The `ul` owns the border and the surface, and the rows own neither. Every row
 * carrying its own card gave a list of twenty the same visual weight twenty
 * times over — this is a table, which is what a list of fursonas is.
 *
 * It passes `address` down untouched — see the row for what it does with it.
 *
 * Its empty state is a `surface`, so the page looks skinned even with nothing on it.
 *
 * Every colour it paints comes from a token — `--edge`, `--muted`, `--surface` — and never from a literal. That is what lets a person's theme reach it at all.
 *
 * Its two empty states are decided in `emptyNote` rather than in nested ternaries — saying "you have no fursonas" when the truth is "none match your filter" invites somebody to create a duplicate of one they own, so which case is in force has to be legible.
 *
 * @returns the list.
 */
export function FursonaList({ initial, labels, address }: FursonaListProps) {
  const dndId = useId();
  const [filters] = useQueryStates(fursonaSearchParams);
  const { rows, arrangement } = useFursonas(initial);
  const { remove, reorder, pin } = useFursonaMutations();

  const visible = applyFursonaFilters(rows as FursonaRowActor[], filters);
  const person = visible.find((row) => row.kind === "person");
  const fursonas = inArrangedOrder(
    visible.filter((row) => row.kind === "fursona"),
    arrangement,
  );

  const filtering = isFiltering(filters);
  const canArrange = !filtering && fursonas.length > 1;
  const ownsNone = rows.filter((row) => row.kind === "fursona").length === 0;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: DRAG_THRESHOLD },
    }),
    useSensor(KeyboardSensor, KEYBOARD_OPTIONS),
  );

  // Not memoized: the list's own order is what a position is read from, and
  // that changes with every filter and every write, so a `useMemo` over it
  // buys nothing and costs the React Compiler its ability to memoize the
  // component at all. `useDndMonitor` re-registers a listener when this
  // changes, which is a set add and remove in an effect.
  const accessibility = {
    announcements: dragAnnouncements(labels.drag, (id) =>
      String(fursonas.findIndex((row) => row.actorRef === id) + 1),
    ),
    screenReaderInstructions: { draggable: labels.drag.instructions },
  };

  /**
   * Writes the new position of every row the drop moved.
   *
   * Only the moved rows are written, not the whole list: each call is a
   * round trip, and rewriting positions that did not change would multiply
   * them for no gain.
   *
   * @param event - what was lifted, and what it was dropped on.
   */
  const onDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event;
    if (!over || over.id === active.id) return;
    const from = fursonas.findIndex((row) => row.actorRef === active.id);
    const to = fursonas.findIndex((row) => row.actorRef === over.id);
    if (from === -1 || to === -1) return;
    const next = [...fursonas];
    const [moved] = next.splice(from, 1);
    if (moved) next.splice(to, 0, moved);
    for (const [index, row] of next.entries()) {
      const before = fursonas[index];
      if (before?.actorRef !== row.actorRef)
        reorder.mutate({ actorRef: row.actorRef, sortOrder: index + 1 });
    }
  };

  const note = emptyNote(
    ownsNone,
    fursonas.length,
    labels.empty,
    labels.noMatches,
  );

  return (
    <div className="mt-8 grid gap-6">
      <FursonaFiltersBar labels={labels} />

      {note ? <p className="text-sm text-(--muted)">{note}</p> : null}

      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={closestCenter}
        accessibility={accessibility}
        onDragEnd={onDragEnd}
      >
        <ul className="overflow-hidden rounded-xl surface border-(--edge) bg-(--surface)">
          {person ? (
            <FursonaRow
              address={address}
              key={person.actorRef}
              actor={person}
              labels={labels}
              featured={false}
              canArrange={false}
              drag={null}
              onPin={() => {}}
              onDelete={() => {}}
            />
          ) : null}

          <SortableContext
            items={fursonas.map((row) => row.actorRef)}
            strategy={verticalListSortingStrategy}
          >
            {fursonas.map((row) => (
              <SortableFursonaRow
                key={row.actorRef}
                address={address}
                actor={row}
                labels={labels}
                featured={Boolean(
                  arrangement.find((a) => a.actorRef === row.actorRef)
                    ?.featured,
                )}
                canArrange={canArrange}
                onPin={(actorRef, featured) =>
                  pin.mutate({ actorRef, featured })
                }
                onDelete={(actorRef) => remove.mutate(actorRef)}
              />
            ))}
          </SortableContext>
        </ul>
      </DndContext>
    </div>
  );
}
