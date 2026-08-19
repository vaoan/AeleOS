import { describe, expect, it, vi } from "vitest";
import { dragAnnouncements } from "@/features/actors/presentation/drag-announcements";

// WHAT A DRAG SAYS TO SOMEBODY WHO CANNOT SEE IT.
//
// dnd-kit's own defaults are hard-coded English built out of raw drag ids —
// "Draggable item place:0.1 was moved over droppable area place:1.0." — which
// is neither of this app's languages and names nothing a person would
// recognise. This is the replacement, and it is a `.ts` in a presentation
// directory precisely so it is MEASURED: a coverage number on JSX measures
// rendering, but this is data in and a sentence out.

const labels = {
  instructions: "Space to pick up.",
  lifted: "Picked up",
  over: "Moved over",
  dropped: "Dropped on",
  cancelled: "Left where it was.",
};

/** Names a drag id the way a person would hear it. */
const name = (id: string) => id.replace("place:", "");

/**
 * The library's event shape, as far as an announcement reads it.
 *
 * @param id - the drag id.
 * @returns something with that id.
 */
const thing = (id: string) => ({ id, data: { current: undefined } });

describe("dragAnnouncements", () => {
  it("names what was lifted", () => {
    const said = dragAnnouncements(labels, name);
    expect(said.onDragStart({ active: thing("place:1") } as never)).toBe(
      "Picked up 1.",
    );
  });

  it("names what the drag is over", () => {
    const said = dragAnnouncements(labels, name);
    expect(
      said.onDragOver({
        active: thing("place:1"),
        over: thing("place:2"),
      } as never),
    ).toBe("Moved over 2.");
  });

  // OVER NOTHING IS ITS OWN SENTENCE. "Moved over" with nothing after it would
  // be the announcement claiming a target that is not there.
  it("says so when the drag is over nothing", () => {
    const said = dragAnnouncements(labels, name);
    expect(
      said.onDragOver({ active: thing("place:1"), over: null } as never),
    ).toBe("Left where it was.");
  });

  it("names where a drop landed", () => {
    const said = dragAnnouncements(labels, name);
    expect(
      said.onDragEnd({
        active: thing("place:1"),
        over: thing("place:2"),
      } as never),
    ).toBe("Dropped on 2.");
  });

  it("says so when a drop landed on nothing", () => {
    const said = dragAnnouncements(labels, name);
    expect(
      said.onDragEnd({ active: thing("place:1"), over: null } as never),
    ).toBe("Left where it was.");
  });

  it("says so when a drag is cancelled", () => {
    const said = dragAnnouncements(labels, name);
    expect(
      said.onDragCancel({ active: thing("place:1"), over: null } as never),
    ).toBe("Left where it was.");
  });

  // THE OVERRIDE IS WHAT A REFUSAL NEEDS. Saying "dropped on 2" over a page
  // where nothing moved is the silent-refusal fault wearing a sentence.
  it("says the caller's own wording when a drop was refused", () => {
    const outcome = vi.fn(() => "That is one level too deep.");
    const said = dragAnnouncements(labels, name, outcome);
    expect(
      said.onDragEnd({
        active: thing("place:1"),
        over: thing("place:2.0"),
      } as never),
    ).toBe("That is one level too deep.");
    expect(outcome).toHaveBeenCalledWith("place:1", "place:2.0");
  });

  it("falls back to the ordinary wording when the caller has nothing to add", () => {
    const said = dragAnnouncements(labels, name, () => undefined);
    expect(
      said.onDragEnd({
        active: thing("place:1"),
        over: thing("place:2"),
      } as never),
    ).toBe("Dropped on 2.");
  });

  // A drop that landed on nothing never asks the caller: there is no target to
  // ask about, and `moveBlock` has no pair of places to answer for.
  it("never asks the caller about a drop that landed on nothing", () => {
    const outcome = vi.fn(() => "unreachable");
    const said = dragAnnouncements(labels, name, outcome);
    expect(
      said.onDragEnd({ active: thing("place:1"), over: null } as never),
    ).toBe("Left where it was.");
    expect(outcome).not.toHaveBeenCalled();
  });
});
