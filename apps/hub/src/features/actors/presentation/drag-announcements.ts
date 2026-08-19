import type { Announcements } from "@dnd-kit/core";

/**
 * The words a drag says out loud, to somebody who cannot see it happening.
 *
 * **The words are the app's and the position is not.** Each of these is a
 * whole phrase, and the thing being spoken about is appended by
 * {@link dragAnnouncements} rather than interpolated into a message — these
 * strings are resolved on the server and handed to a client component as
 * data, and a function cannot make that crossing, so a message carrying a
 * runtime value has to be assembled where the value is. A position is digits
 * in every language this app speaks.
 *
 * They exist because dnd-kit's own defaults are hard-coded English built out
 * of raw drag ids — "Draggable item place:0.1 was moved over droppable area
 * place:1.0." — which is neither of this app's languages and names nothing a
 * person would recognise.
 */
export interface DragAnnouncementLabels {
  /** Read when a grip takes focus, saying which keys do what. */
  instructions: string;
  /** Said when something is picked up. */
  lifted: string;
  /** Said each time the drag moves over something different. */
  over: string;
  /** Said when it lands. */
  dropped: string;
  /** Said when a drag ends with nothing under it, or is cancelled. */
  cancelled: string;
}

/**
 * What a drag announces at each of its four moments.
 *
 * **The drop's wording may be overridden, and that is what a refusal needs.**
 * The library's own end event knows only that something was dropped somewhere,
 * where `moveBlock` knows whether the drop was refused and why — so a caller
 * that can tell supplies `outcome`, and saying "dropped on 2" over a page
 * where nothing moved is exactly the silent-refusal fault this repository
 * keeps paying for.
 *
 * **`outcome` is asked rather than told**, taking the two ids and answering a
 * sentence or nothing. A caller that instead handed over a value it had
 * already computed would be handing over something written during its own
 * `onDragEnd`, which is a mutable box holding the result of an event — and
 * this way the caller can answer with a pure function of the page it is
 * rendering, which is what `BlockEditor` does.
 *
 * @param labels - the app's own words.
 * @param name - what to call the thing at a drag id, for a person.
 * @param outcome - given the two ids, what the drop actually turned out to be;
 * nothing when the ordinary wording is right.
 * @returns the announcements, for `DndContext`'s `accessibility` prop.
 */
export function dragAnnouncements(
  labels: DragAnnouncementLabels,
  name: (id: string) => string,
  outcome?: (activeId: string, overId: string) => string | undefined,
): Announcements {
  return {
    onDragStart: ({ active }) => `${labels.lifted} ${name(String(active.id))}.`,
    onDragOver: ({ over }) =>
      over ? `${labels.over} ${name(String(over.id))}.` : labels.cancelled,
    onDragEnd: ({ active, over }) => {
      if (!over) return labels.cancelled;
      const refused = outcome?.(String(active.id), String(over.id));
      return refused ?? `${labels.dropped} ${name(String(over.id))}.`;
    },
    onDragCancel: () => labels.cancelled,
  };
}
