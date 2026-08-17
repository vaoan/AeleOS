"use client";

import { DragDropContext, Draggable, Droppable } from "@hello-pangea/dnd";
import type { DropResult } from "@hello-pangea/dnd";
import { useQueryStates } from "nuqs";
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
  FursonaRow,
  type FursonaRowActor,
  type FursonaRowLabels,
} from "@/features/actors/presentation/fursona-row";
import type { Arrangement } from "@/features/actors/infrastructure/fursona-arrangement";
import type { Actor } from "@/features/actors/infrastructure/fursonas";

/** Translated strings the list and everything inside it needs. */
export interface FursonaListLabels
  extends FursonaRowLabels, FursonaFiltersBarLabels {
  /** Shown when the person owns no fursonas at all. */
  empty: string;
  /** Shown when a filter matches nothing — deliberately not the same. */
  noMatches: string;
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
 * **Its `Draggable` carries `disableInteractiveElementBlocking`, and the grip
 * is the handle rather than the row.** `FursonaRow`'s grip is a real
 * `<button>`, and `@hello-pangea/dnd` refuses to start a drag — by mouse or
 * keyboard — whose source event targets a tag it treats as interactive,
 * unless told otherwise; without this the grip was focusable, announced
 * itself as "drag to reorder", and could not start a drag by any input. The
 * handle is scoped to the grip alone, not the whole row: a row-wide handle
 * would also need the same opt-out, which lifts the interactive-tag block off
 * every button and link the row carries too, turning a keyboard Space on
 * Edit, Pin or Delete into a drag lift instead of that control's own action.
 * Matches the fix already shipped in `SectionEditor`/`SectionCard`.
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

  /**
   * Writes the new position of every row the drop moved.
   *
   * Only the moved rows are written, not the whole list: each call is a
   * round trip, and rewriting positions that did not change would multiply
   * them for no gain.
   *
   * @param result - where the drag started and ended.
   */
  const onDragEnd = (result: DropResult): void => {
    const to = result.destination?.index;
    if (to === undefined || to === result.source.index) return;
    const next = [...fursonas];
    const [moved] = next.splice(result.source.index, 1);
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

      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="fursonas">
          {(dropProvided) => (
            <ul
              ref={dropProvided.innerRef}
              {...dropProvided.droppableProps}
              className="overflow-hidden rounded-xl surface border-(--edge) bg-(--surface)"
            >
              {person ? (
                <FursonaRow
                  address={address}
                  key={person.actorRef}
                  actor={person}
                  labels={labels}
                  featured={false}
                  canArrange={false}
                  dragHandleProps={null}
                  onPin={() => {}}
                  onDelete={() => {}}
                />
              ) : null}

              {fursonas.map((row, index) => (
                <Draggable
                  key={row.actorRef}
                  draggableId={row.actorRef}
                  index={index}
                  isDragDisabled={!canArrange}
                  // The handle is a real `<button>` (the grip in `FursonaRow`),
                  // and `@hello-pangea/dnd` refuses to start ANY drag — mouse
                  // or keyboard — whose source event targets a tag it treats
                  // as interactive, unless the `Draggable` opts out. Matches
                  // `SectionEditor`'s `Draggable`, which needed the same fix
                  // for the same reason.
                  disableInteractiveElementBlocking
                >
                  {(dragProvided) => (
                    <div
                      ref={dragProvided.innerRef}
                      {...dragProvided.draggableProps}
                    >
                      <FursonaRow
                        address={address}
                        actor={row}
                        labels={labels}
                        featured={Boolean(
                          arrangement.find((a) => a.actorRef === row.actorRef)
                            ?.featured,
                        )}
                        canArrange={canArrange}
                        dragHandleProps={dragProvided.dragHandleProps}
                        onPin={(actorRef, featured) =>
                          pin.mutate({ actorRef, featured })
                        }
                        onDelete={(actorRef) => remove.mutate(actorRef)}
                      />
                    </div>
                  )}
                </Draggable>
              ))}
              {dropProvided.placeholder}
            </ul>
          )}
        </Droppable>
      </DragDropContext>
    </div>
  );
}
