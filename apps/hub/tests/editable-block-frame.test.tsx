import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DndContext } from "@dnd-kit/core";
import type { ReactNode } from "react";
import {
  AppendSlot,
  EditableBlockFrame,
  type EditableBlockInstrumentation,
  type AppendSlotProps,
} from "@/features/actors/presentation/editable-block-frame";

// **`EditableBlockFrame` draws exactly ONE landing mark now, driven solely
// by `editor.activeTarget` — the single winner a drag's own collision has
// already resolved.** It used to also light up every entry in a separate
// `insertTargets` field at once, for a palette-origin drag; that field is
// gone (see `apps/hub/src/features/actors/CLAUDE.md`'s
// "drop-target-legibility" account), and this file's own coverage moved
// with it. `AppendSlot` below draws exactly one mark too now (2026-09-11) —
// it used to keep its own, separate `insertTargets` membership check; its
// tests build `activeTarget`/`carriedHeight` directly now, the same two
// fields {@link EditableBlockInstrumentation} carries, passed as their own
// props rather than that whole interface since this component has no
// `selectedPath` or `dragLabel` to instrument.

/** Builds an {@link EditableBlockInstrumentation}, with overrides. */
function editor(
  overrides: Partial<EditableBlockInstrumentation> = {},
): EditableBlockInstrumentation {
  return {
    selectedPath: undefined,
    activeTarget: null,
    dragLabel: "Move this",
    carriedHeight: null,
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

  it("marks only the winning target, never every candidate", () => {
    // Two frames, one active target. Exactly one mark may exist on the page.
    const editorProps = {
      selectedPath: undefined,
      activeTarget: { kind: "before" as const, path: [0, 1] },
      dragLabel: "Move",
      carriedHeight: 96,
    };
    render(
      <>
        <EditableBlockFrame path="0-0" filled editor={editorProps}>
          <div />
        </EditableBlockFrame>
        <EditableBlockFrame path="0-1" filled editor={editorProps}>
          <div />
        </EditableBlockFrame>
      </>,
    );
    expect(screen.getAllByTestId("canvas-drop-before")).toHaveLength(1);
  });

  it("draws a place mark, with the drop attribute, when activeTarget names this exact path", () => {
    renderFrame({
      path: "0-1",
      editorProps: { activeTarget: { kind: "place", path: [0, 1] } },
    });
    expect(screen.getByTestId("canvas-drag-node")).toHaveAttribute(
      "data-canvas-drop",
      "place",
    );
    expect(screen.getByTestId("canvas-drop-place")).toBeInTheDocument();
  });

  it("draws a before mark, with no drop attribute, when activeTarget names a before landing here", () => {
    renderFrame({
      path: "0-1",
      editorProps: { activeTarget: { kind: "before", path: [0, 1] } },
    });
    expect(screen.getByTestId("canvas-drag-node")).not.toHaveAttribute(
      "data-canvas-drop",
    );
    expect(screen.getByTestId("canvas-drop-before")).toBeInTheDocument();
    expect(screen.queryByTestId("canvas-drop-after")).toBeNull();
    expect(screen.queryByTestId("canvas-drop-place")).toBeNull();
  });

  it("draws an after mark when activeTarget names an after landing here", () => {
    renderFrame({
      path: "0-1",
      editorProps: { activeTarget: { kind: "after", path: [0, 1] } },
    });
    expect(screen.getByTestId("canvas-drop-after")).toBeInTheDocument();
  });

  it("draws nothing when activeTarget names a different path", () => {
    renderFrame({
      path: "0-1",
      editorProps: { activeTarget: { kind: "place", path: [0, 0] } },
    });
    expect(screen.getByTestId("canvas-drag-node")).not.toHaveAttribute(
      "data-canvas-drop",
    );
    expect(screen.queryByTestId("canvas-drop-before")).toBeNull();
    expect(screen.queryByTestId("canvas-drop-after")).toBeNull();
    expect(screen.queryByTestId("canvas-drop-place")).toBeNull();
  });

  it("draws nothing while no drag is in progress", () => {
    renderFrame({ path: "0-1", editorProps: { activeTarget: null } });
    expect(screen.getByTestId("canvas-drag-node")).not.toHaveAttribute(
      "data-canvas-drop",
    );
    expect(screen.queryByTestId("canvas-drop-before")).toBeNull();
    expect(screen.queryByTestId("canvas-drop-after")).toBeNull();
    expect(screen.queryByTestId("canvas-drop-place")).toBeNull();
  });

  it("sizes the mark from carriedHeight when a real block is being carried", () => {
    renderFrame({
      path: "0-1",
      editorProps: {
        activeTarget: { kind: "before", path: [0, 1] },
        carriedHeight: 64,
      },
    });
    expect(screen.getByTestId("canvas-drop-before")).toHaveStyle({
      height: "64px",
    });
  });

  it("leaves the mark unsized when nothing can be measured, as for a palette drag", () => {
    renderFrame({
      path: "0-1",
      editorProps: {
        activeTarget: { kind: "before", path: [0, 1] },
        carriedHeight: null,
      },
    });
    expect(screen.getByTestId("canvas-drop-before")).not.toHaveAttribute(
      "style",
    );
  });
});

// THE PALETTE'S "APPEND A NEW ROW" DROPPABLE.
//
// `AppendSlot` draws exactly one mark now too (2026-09-11), matching
// `EditableBlockFrame` above — it used to carry its own, separate
// `insertTargets` prop and light up every matching entry at once. It reads
// `activeTarget`/`carriedHeight` now, the same two fields
// `EditableBlockInstrumentation` carries, so this file's own cases mirror
// `EditableBlockFrame`'s shape rather than testing membership. It is always
// mounted (a real `DndContext` is needed for the same reason `renderFrame`
// above needs one), so what changes between cases here is only whether the
// mark is drawn.
describe("AppendSlot", () => {
  /**
   * Renders one append slot inside a real `DndContext`.
   *
   * @param path - the append target's own renderer path.
   * @param activeTarget - the destination currently advertised by dnd-kit,
   * or `null` while none is.
   * @param carriedHeight - how tall the carried block is, or `null`.
   * @returns what `render` returned.
   */
  function renderAppendSlot(
    path: string,
    activeTarget: AppendSlotProps["activeTarget"] = null,
    carriedHeight: AppendSlotProps["carriedHeight"] = null,
  ) {
    return render(
      <DndContext id="t">
        <AppendSlot
          path={path}
          activeTarget={activeTarget}
          carriedHeight={carriedHeight}
        />
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

  it("draws nothing while no palette drag is in progress", () => {
    renderAppendSlot("0-2", null);
    expect(screen.queryByTestId("canvas-drop-place")).toBeNull();
  });

  it("draws nothing when activeTarget names a different path", () => {
    renderAppendSlot("0-2", { kind: "before", path: [0, 1] });
    expect(screen.queryByTestId("canvas-drop-before")).toBeNull();
    expect(screen.queryByTestId("canvas-drop-place")).toBeNull();
  });

  it("draws a place mark when activeTarget names this exact path — the only kind insertMarkFor ever produces for an append slot's own position", () => {
    renderAppendSlot("0-2", { kind: "place", path: [0, 2] });
    expect(screen.getByTestId("canvas-drop-place")).toBeInTheDocument();
  });

  it("sizes the mark from carriedHeight when a real block is being carried", () => {
    renderAppendSlot("0-2", { kind: "place", path: [0, 2] }, 64);
    expect(screen.getByTestId("canvas-drop-place")).toHaveStyle({
      height: "64px",
    });
  });

  it('still draws whatever kind activeTarget carries, verifying the value is not hardcoded to "place"', () => {
    renderAppendSlot("0-2", { kind: "before", path: [0, 2] });
    expect(screen.getByTestId("canvas-drop-before")).toBeInTheDocument();
    expect(screen.queryByTestId("canvas-drop-place")).toBeNull();
  });
});
