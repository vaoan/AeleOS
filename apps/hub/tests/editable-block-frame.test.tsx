import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DndContext } from "@dnd-kit/core";
import type { ReactNode } from "react";
import {
  AppendSlot,
  EditableBlockFrame,
  type EditableBlockInstrumentation,
} from "@/features/actors/presentation/editable-block-frame";

// THE PALETTE-HIGHLIGHT HALF OF THIS COMPONENT NEEDS NO DRAG AT ALL TO PROVE.
// `insertTargets` is a plain prop driving a plain boolean, so this file
// renders the component directly — inside a real `DndContext` only because
// `useDraggable`/`useDroppable` require one as an ancestor, never because a
// drag is actually driven here. The pointer-driven collision that COMPUTES
// `insertTargets` during a real palette drag is `block-editor.test.tsx`'s own
// job; this file is only about what the frame draws once it has one.

/** Builds an {@link EditableBlockInstrumentation}, with overrides. */
function editor(
  overrides: Partial<EditableBlockInstrumentation> = {},
): EditableBlockInstrumentation {
  return {
    selectedPath: undefined,
    activeTarget: null,
    dragLabel: "Move this",
    insertTargets: null,
    ...overrides,
  };
}

/**
 * What {@link renderFrame} needs.
 *
 * A named interface rather than an inline literal, so `jsdoc/check-param-names`
 * does not expand it into dotted `@param` entries `tsdoc/syntax` then refuses
 * as invalid identifiers.
 */
interface RenderFrameProps {
  /** The encoded block path to render at. */
  path: string;
  /** Whether the place holds a block, defaulting to `true`. */
  filled?: boolean;
  /** Overrides for the frame's own {@link EditableBlockInstrumentation}. */
  editorProps?: Partial<EditableBlockInstrumentation>;
  /** What the frame wraps, defaulting to a plain span. */
  children?: ReactNode;
}

/**
 * Renders one frame inside a real `DndContext`.
 *
 * @param props - see {@link RenderFrameProps}.
 * @returns what `render` returned.
 */
function renderFrame(props: RenderFrameProps) {
  return render(
    <DndContext id="t">
      <EditableBlockFrame
        path={props.path}
        filled={props.filled ?? true}
        editor={editor(props.editorProps)}
      >
        {props.children ?? <span>content</span>}
      </EditableBlockFrame>
    </DndContext>,
  );
}

describe("EditableBlockFrame", () => {
  it("returns its children bare at the page root, wrapping nothing", () => {
    const { container } = renderFrame({ path: "" });
    // No wrapper div, no `data-canvas-path`: the page itself is not a place.
    expect(container.querySelector("[data-canvas-path]")).toBeNull();
    expect(screen.getByText("content")).toBeInTheDocument();
  });

  it("highlights a block named in insertTargets, exactly like the place highlight", () => {
    renderFrame({
      path: "0-1",
      editorProps: { insertTargets: [{ path: [0, 1] }] },
    });
    expect(screen.getByTestId("canvas-drag-node")).toHaveAttribute(
      "data-canvas-drop",
      "place",
    );
  });

  it("does not highlight a block insertTargets never named", () => {
    renderFrame({
      path: "0-1",
      editorProps: { insertTargets: [{ path: [0, 0] }] },
    });
    expect(screen.getByTestId("canvas-drag-node")).not.toHaveAttribute(
      "data-canvas-drop",
    );
  });

  it("highlights nothing while no palette drag is in progress", () => {
    renderFrame({ path: "0-1", editorProps: { insertTargets: null } });
    expect(screen.getByTestId("canvas-drag-node")).not.toHaveAttribute(
      "data-canvas-drop",
    );
  });

  // EVERY MATCHING TARGET LIGHTS UP AT ONCE — the whole point of this
  // feature over the single-`activeTarget` canvas-move highlight, which can
  // only ever name one place at a time.
  it("highlights every matching place simultaneously, not only the first", () => {
    const insertTargets = [{ path: [0, 0] }, { path: [0, 1] }, { path: [1] }];
    renderFrame({ path: "0-0", editorProps: { insertTargets } });
    expect(screen.getByTestId("canvas-drag-node")).toHaveAttribute(
      "data-canvas-drop",
      "place",
    );
  });

  it("still highlights when a palette target is also under the pointer", () => {
    // `isOver` from `useDroppable` is false with no active drag registered
    // here, so this asserts the OR does not require both, and that the
    // combination still resolves to the same single "place" value rather
    // than something a class selector would fail to match.
    renderFrame({
      path: "0-1",
      editorProps: {
        activeTarget: { kind: "place", path: [0, 1] },
        insertTargets: [{ path: [0, 1] }],
      },
    });
    expect(screen.getByTestId("canvas-drag-node")).toHaveAttribute(
      "data-canvas-drop",
      "place",
    );
  });

  // A palette drop targets the place itself — never a before/after linear
  // insert — so an insert target must never draw the insertion-bar spans
  // `activeTarget`'s "before"/"after" kinds draw.
  it("draws no insertion bar for a place that is only an insert target", () => {
    renderFrame({
      path: "0-1",
      editorProps: { insertTargets: [{ path: [0, 1] }] },
    });
    expect(screen.queryByTestId("canvas-drop-before")).toBeNull();
    expect(screen.queryByTestId("canvas-drop-after")).toBeNull();
  });
});

// THE PALETTE'S "APPEND A NEW ROW" DROPPABLE.
//
// `AppendSlot` shares `EditableBlockFrame`'s exact `insertTargets`
// membership check and reuses its class list — see that component's own
// tests above for the case this one mirrors. It is always mounted (a real
// `DndContext` is needed for the same reason `renderFrame` above needs one),
// so what changes between cases here is only whether the highlight applies.
describe("AppendSlot", () => {
  /**
   * Renders one append slot inside a real `DndContext`.
   *
   * @param path - the append target's own renderer path.
   * @param insertTargets - every insertion target a palette drag in
   * progress would accept, or `null` while none is.
   * @returns what `render` returned.
   */
  function renderAppendSlot(
    path: string,
    insertTargets: EditableBlockInstrumentation["insertTargets"] = null,
  ) {
    return render(
      <DndContext id="t">
        <AppendSlot path={path} insertTargets={insertTargets} />
      </DndContext>,
    );
  }

  it("carries the exact renderer path it was given", () => {
    renderAppendSlot("0-2");
    expect(screen.getByTestId("canvas-append-slot")).toHaveAttribute(
      "data-canvas-path",
      "0-2",
    );
  });

  it("highlights nothing while no palette drag is in progress", () => {
    renderAppendSlot("0-2", null);
    expect(screen.getByTestId("canvas-append-slot")).not.toHaveAttribute(
      "data-canvas-drop",
    );
  });

  it("highlights nothing when insertTargets never names this exact path", () => {
    renderAppendSlot("0-2", [{ path: [0, 1] }]);
    expect(screen.getByTestId("canvas-append-slot")).not.toHaveAttribute(
      "data-canvas-drop",
    );
  });

  it("highlights, exactly like a filled place's own insert-target highlight, when named", () => {
    renderAppendSlot("0-2", [{ path: [0, 2] }]);
    expect(screen.getByTestId("canvas-append-slot")).toHaveAttribute(
      "data-canvas-drop",
      "place",
    );
  });
});
