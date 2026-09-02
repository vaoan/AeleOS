import { describe, expect, it, vi } from "vitest";
import { useEffect } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  DndContext,
  KeyboardSensor,
  useDndContext,
  useDraggable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { ReactNode } from "react";
import { BlockSlot } from "@/features/actors/presentation/block-slot";
import { placeId } from "@/features/actors/domain/block-drag";

// THE ONE TEST A MOCK STRUCTURALLY CANNOT WRITE.
//
// `useDraggable` returns four things and every one of them has to be spread
// onto the right element. Drop `listeners` or the node ref and the grip still
// renders, still looks right, and starts no drag at all — by mouse OR by
// keyboard, with no error anywhere. Drop `attributes` and only the keyboard
// dies, and only because the grip happens to be focusable already.
//
// **Every other suite in this repository mocked the drag library away**, and a
// mock supplies what the real hook would have: it hands the component a
// `dragHandleProps` object and cannot observe whether the component passed it
// on. That is not a weaker test of the same thing, it is a test of something
// else — and it is why a grip in this repository was dead by both input
// methods from the commit that introduced it, under a green suite that counted
// buttons by `aria-label`.
//
// So this file drives the REAL hook, inside a REAL `DndContext`, with the real
// `KeyboardSensor`, and asserts that a space bar on the grip actually begins a
// drag. `UnwiredHandle` below is the permanent control: the same markup with
// `listeners` deliberately not spread, asserted to start nothing. Without it
// the positive test could be passing for a reason nobody checked.

/** What a probe reads out of the live context. */
let seen: { node: Element | null; droppable: boolean } = {
  node: null,
  droppable: false,
};

/**
 * Reads the library's own registries, so a test can ask what the slot
 * registered rather than what it rendered.
 *
 * @returns nothing; it draws no markup.
 */
function Probe(): null {
  const { draggableNodes, droppableContainers } = useDndContext();
  const id = placeId([0]);
  // In an effect rather than during render: the registries are filled by the
  // slot's own layout effects, so reading them here is both the only correct
  // moment and the only one React allows a write to an outer variable.
  useEffect(() => {
    seen = {
      node: draggableNodes.get(id)?.node.current ?? null,
      droppable: droppableContainers.get(id) !== undefined,
    };
  });
  return null;
}

/**
 * A grip built the way a careless port would build one — the hook called, the
 * button drawn, and the listeners never spread.
 *
 * It exists so the positive case below has a control: a suite where both
 * assertions pass is a suite where the assertion has power.
 *
 * @returns the unwired grip.
 */
function UnwiredHandle(): ReactNode {
  const { attributes, setNodeRef } = useDraggable({ id: "unwired" });
  return (
    <div ref={setNodeRef}>
      <button type="button" aria-label="unwired" {...attributes}>
        grip
      </button>
    </div>
  );
}

/**
 * The context, the sensor and one slot, with a spy on the lift.
 *
 * @param children - what to put in the context beside the slot.
 * @returns the spy.
 */
function harness(children?: ReactNode) {
  const onDragStart = vi.fn();
  /**
   * The tree under test.
   *
   * @returns the element.
   */
  function Harness() {
    const sensors = useSensors(useSensor(KeyboardSensor));
    return (
      <DndContext id="t" sensors={sensors} onDragStart={onDragStart}>
        <Probe />
        <BlockSlot path={[0]} filled label="lift this">
          {(handle) => <div>{handle}</div>}
        </BlockSlot>
        {children}
      </DndContext>
    );
  }
  render(<Harness />);
  return onDragStart;
}

describe("BlockSlot", () => {
  it("starts a real drag from its grip, by keyboard", () => {
    const onDragStart = harness();
    const grip = screen.getByRole("button", { name: "lift this" });
    fireEvent.keyDown(grip, { code: "Space", key: " " });
    expect(onDragStart).toHaveBeenCalledTimes(1);
    expect(String(onDragStart.mock.calls[0]?.[0].active.id)).toBe(placeId([0]));
  });

  // THE CONTROL. Same markup, same hook, `listeners` not spread — and the
  // space bar does nothing at all. This is what the positive test above would
  // look like if `BlockSlot` ever stopped spreading them, and it is the shape
  // no amount of mocking could have told the two apart.
  it("starts nothing from a grip whose listeners were never spread", () => {
    const onDragStart = harness(<UnwiredHandle />);
    const grip = screen.getByRole("button", { name: "unwired" });
    fireEvent.keyDown(grip, { code: "Space", key: " " });
    expect(onDragStart).not.toHaveBeenCalled();
  });

  // `attributes` is the half that kills only the keyboard, and only because
  // the grip is already a `<button>` — which is exactly the kind of loss that
  // never shows up in a screenshot.
  it("puts the library's own aria attributes on the grip", () => {
    harness();
    const grip = screen.getByRole("button", { name: "lift this" });
    expect(grip).toHaveAttribute("aria-roledescription", "draggable");
    // The context's own id, verbatim — `useUniqueId(prefix, value)` answers
    // the value it was given. That is the whole mechanism behind
    // `<DndContext id={useId()}>`: without it this attribute would be
    // `DndDescribedBy-<n>` off a module-level counter, which differs between
    // two server renders in one warm process and hydrates mismatched.
    expect(grip).toHaveAttribute("aria-describedby", "t");
  });

  // `setNodeRef` is the loss with no symptom at the moment of the lift: the
  // drag starts, the library has nothing to measure, and every drop lands on
  // nothing. So the assertion is on the registry rather than on the markup.
  it("registers its own element as both the source and the target", () => {
    harness();
    expect(seen.node).toBe(screen.getByTestId("place-0"));
    expect(seen.droppable).toBe(true);
  });

  // An empty place is a target and not a source. It must not draw a grip for
  // something that is not there.
  it("offers no grip for a place holding nothing", () => {
    render(
      <DndContext id="t">
        <BlockSlot path={[0, 1]} filled={false} label="lift this">
          {(handle) => <div>{handle}</div>}
        </BlockSlot>
      </DndContext>,
    );
    expect(screen.queryByRole("button", { name: "lift this" })).toBeNull();
    expect(screen.getByTestId("place-0.1")).toBeInTheDocument();
  });

  it("keeps the grip's following click from activating its row", () => {
    const onRowClick = vi.fn();
    render(
      <DndContext id="t">
        <BlockSlot path={[0]} filled label="lift this">
          {(handle) => <div onClick={onRowClick}>{handle}</div>}
        </BlockSlot>
      </DndContext>,
    );

    fireEvent.click(screen.getByRole("button", { name: "lift this" }));
    expect(onRowClick).not.toHaveBeenCalled();
  });
});
