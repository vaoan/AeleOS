import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
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
    returningPath: null,
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
      returningPath: null,
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

  it("marks both ends of a swap, each on its own element and not the other's", () => {
    // A swap: the carried block is landing at 0-1 (the accent `place` mark)
    // and the block already there is going back to 0-0 (the muted, dotted
    // `canvas-drop-returning` mark). Asserting a testid exists anywhere on
    // the page would pass whether it landed on the right element or on
    // every element — root `CLAUDE.md` rule 27 — so each assertion is
    // scoped to its own frame.
    const editorProps = {
      selectedPath: undefined,
      activeTarget: { kind: "place" as const, path: [0, 1] },
      dragLabel: "Move",
      carriedHeight: 96,
      returningPath: "0-0",
    };
    const { container } = render(
      <>
        <EditableBlockFrame path="0-0" filled editor={editorProps}>
          <div />
        </EditableBlockFrame>
        <EditableBlockFrame path="0-1" filled editor={editorProps}>
          <div />
        </EditableBlockFrame>
      </>,
    );
    const source = container.querySelector<HTMLElement>(
      '[data-canvas-path="0-0"]',
    );
    const landing = container.querySelector<HTMLElement>(
      '[data-canvas-path="0-1"]',
    );
    if (!source || !landing) throw new Error("both frames must render");

    expect(
      within(landing).getByTestId("canvas-drop-place"),
    ).toBeInTheDocument();
    expect(within(landing).queryByTestId("canvas-drop-returning")).toBeNull();

    expect(
      within(source).getByTestId("canvas-drop-returning"),
    ).toBeInTheDocument();
    expect(within(source).queryByTestId("canvas-drop-place")).toBeNull();
  });

  it("draws no returning mark for a plain move onto an empty place", () => {
    // A move — nothing displaced, so nothing returns, even though the
    // landing itself is still a `place` mark. A fixture that only ever
    // exercises the swap case could not tell a correct implementation
    // from one that always draws a returning mark.
    renderFrame({
      path: "0-1",
      editorProps: {
        activeTarget: { kind: "place", path: [0, 1] },
        returningPath: null,
      },
    });
    expect(screen.getByTestId("canvas-drop-place")).toBeInTheDocument();
    expect(screen.queryByTestId("canvas-drop-returning")).toBeNull();
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
    expect(screen.queryByTestId("canvas-drop-returning")).toBeNull();
  });

  it("draws nothing when returningPath names a different path", () => {
    renderFrame({
      path: "0-1",
      editorProps: { returningPath: "0-0" },
    });
    expect(screen.queryByTestId("canvas-drop-returning")).toBeNull();
  });

  it("draws nothing while no drag is in progress", () => {
    renderFrame({ path: "0-1", editorProps: { activeTarget: null } });
    expect(screen.getByTestId("canvas-drag-node")).not.toHaveAttribute(
      "data-canvas-drop",
    );
    expect(screen.queryByTestId("canvas-drop-before")).toBeNull();
    expect(screen.queryByTestId("canvas-drop-after")).toBeNull();
    expect(screen.queryByTestId("canvas-drop-place")).toBeNull();
    expect(screen.queryByTestId("canvas-drop-returning")).toBeNull();
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
// `AppendSlot` draws exactly one mark, matching `EditableBlockFrame` above
// — it used to carry only `insertTargets` and light up every matching
// entry at once. It reads `activeTarget`/`carriedHeight` for DRAWING now,
// the same two fields `EditableBlockInstrumentation` carries. `insertTargets`
// came back the same day for a SECOND, unrelated purpose — see
// `AppendSlot`'s own TSDoc — reserving real height for the whole drag
// whenever this position is a valid landing, regardless of which one is
// currently marked. It is always mounted (a real `DndContext` is needed
// for the same reason `renderFrame` above needs one).
describe("AppendSlot", () => {
  /**
   * Renders one append slot inside a real `DndContext`.
   *
   * @param path - the append target's own renderer path.
   * @param activeTarget - the destination currently advertised by dnd-kit,
   * or `null` while none is.
   * @param carriedHeight - how tall the carried block is, or `null`.
   * @param insertTargets - every insertion target a palette drag in
   * progress would accept, or `null` while none is.
   * @returns what `render` returned.
   */
  function renderAppendSlot(
    path: string,
    activeTarget: AppendSlotProps["activeTarget"] = null,
    carriedHeight: AppendSlotProps["carriedHeight"] = null,
    insertTargets: AppendSlotProps["insertTargets"] = null,
  ) {
    return render(
      <DndContext id="t">
        <AppendSlot
          path={path}
          activeTarget={activeTarget}
          carriedHeight={carriedHeight}
          insertTargets={insertTargets}
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

  // **Reservation is a SEPARATE question from drawing, found by measuring a
  // real browser: without it, `AppendSlot`'s own wrapper is 0px tall
  // whether or not it is marked, because `DropMark` is absolutely
  // positioned and contributes nothing to its parent's box.** These four
  // cases pin the reservation independently of every drawing case above.
  it("reserves no height while no palette drag is in progress", () => {
    renderAppendSlot("0-2", null, null, null);
    expect(screen.getByTestId("canvas-append-slot")).not.toHaveClass(
      "min-h-12",
    );
  });

  it("reserves no height when insertTargets never names this exact path", () => {
    renderAppendSlot("0-2", null, null, [{ path: [0, 1] }]);
    expect(screen.getByTestId("canvas-append-slot")).not.toHaveClass(
      "min-h-12",
    );
  });

  it("reserves height when insertTargets names this exact path, even though nothing is drawn", () => {
    renderAppendSlot("0-2", null, null, [{ path: [0, 2] }]);
    const slot = screen.getByTestId("canvas-append-slot");
    expect(slot).toHaveClass("min-h-12");
    expect(screen.queryByTestId("canvas-drop-place")).toBeNull();
  });

  it("reserves height AND draws the mark together when both name this exact path", () => {
    renderAppendSlot("0-2", { kind: "place", path: [0, 2] }, null, [
      { path: [0, 2] },
    ]);
    const slot = screen.getByTestId("canvas-append-slot");
    expect(slot).toHaveClass("min-h-12");
    expect(screen.getByTestId("canvas-drop-place")).toBeInTheDocument();
  });
});
