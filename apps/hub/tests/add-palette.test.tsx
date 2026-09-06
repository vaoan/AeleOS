import { describe, expect, it } from "vitest";
import { useEffect } from "react";
import { act, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { DndContext, useDndContext } from "@dnd-kit/core";
import messages from "@/shared/infrastructure/i18n/messages/en.json";
import {
  CONTAINER_MODES,
  LEAF_KINDS,
  type ContainerMode,
  type LeafKind,
} from "@/features/actors/domain/block-schema";
import { paletteId } from "@/features/actors/domain/block-drag";
import { AddPalette } from "@/features/actors/presentation/add-palette";
import { pageContext } from "./helpers/page-context";

// `player`/`jukebox` previews reach `useTranslations` through `RetroPlayer`,
// exactly as `add-block-picker.test.tsx` and `blocks.test.tsx` document —
// every page in this app renders inside `NextIntlClientProvider`, and this
// component renders every leaf kind, so it must too.

// **THE DRAG LIBRARY IS NOT MOCKED**, matching this repository's own
// standing convention (`block-slot.test.tsx`, `block-editor.test.tsx`): a
// mock supplies what the real hook would have and cannot observe whether a
// thumbnail actually passed it on, which is precisely the shape that let a
// grip ship dead by every input method once already. So this file renders
// inside a real `DndContext` and reads the library's own registries, or
// dispatches a real pointer-typed event, rather than asserting on markup a
// mock could produce regardless of whether anything is really wired.

const labels = {
  contentGroup: "Content",
  layoutGroup: "Layout",
  kindNames: Object.fromEntries(
    LEAF_KINDS.map((kind) => [kind, kind]),
  ) as Record<LeafKind, string>,
  modeNames: Object.fromEntries(
    CONTAINER_MODES.map((mode) => [mode, mode]),
  ) as Record<ContainerMode, string>,
};

/**
 * Renders {@link AddPalette} with overrides, inside a real `DndContext` —
 * required by `useDraggable`, which every thumbnail now calls.
 *
 * @param props - what to override.
 * @param onDragStart - forwarded to the context, for the activation cases.
 * @returns what `render` returned.
 */
function renderPalette(
  props: Record<string, unknown> = {},
  onDragStart?: (id: string) => void,
) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <DndContext
        id="t"
        onDragStart={(event) => onDragStart?.(String(event.active.id))}
      >
        <AddPalette
          labels={labels}
          page={pageContext()}
          locale="en"
          {...props}
        />
      </DndContext>
    </NextIntlClientProvider>,
  );
}

/** What a probe reads out of the live dnd-kit context. */
let seen: { node: Element | null } = { node: null };

/** What {@link Probe} needs. */
interface ProbeProps {
  /** The drag id to look up. */
  id: string;
}

/**
 * Reads the library's own draggable registry for one id, so a test can ask
 * what a thumbnail REGISTERED rather than what it rendered — the same
 * convention `block-slot.test.tsx`'s own `Probe` uses.
 *
 * A named {@link ProbeProps} rather than an inline literal, for the same
 * reason `editable-block-frame.test.tsx`'s own `RenderFrameProps` is one —
 * see that file's comment for the `jsdoc`/`tsdoc` conflict it avoids.
 *
 * @param props - see {@link ProbeProps}.
 * @returns nothing; it draws no markup.
 */
function Probe(props: ProbeProps): null {
  const { draggableNodes } = useDndContext();
  useEffect(() => {
    seen = { node: draggableNodes.get(props.id)?.node.current ?? null };
  });
  return null;
}

/**
 * Dispatches a pointer-typed event dnd-kit's own `PointerSensor` will
 * activate on.
 *
 * jsdom 26 implements no `PointerEvent` constructor at all — confirmed
 * elsewhere in this codebase (`page-source-dock.tsx`'s own account) — and
 * Testing Library's `fireEvent.pointerDown` falls back to a bare `Event`
 * that carries none of `clientX`/`button`/`isPrimary`, so `PointerSensor`'s
 * own activator (`!event.isPrimary || event.button !== 0`) always refuses
 * it. A plain `MouseEvent` DOES support `clientX`/`button` as constructor
 * options — React binds by event type string, not by constructor, so a
 * `MouseEvent` dispatched as `"pointerdown"`/`"pointermove"` reaches
 * `onPointerDown`/`onPointerMove` exactly as a real `PointerEvent` would —
 * and `isPrimary`/`pointerType` are added afterwards since `MouseEvent`'s
 * own constructor does not accept either.
 *
 * @param target - the element (for `pointerdown`) or `document` (for every
 * later event in the same drag, matching where `PointerSensor` itself
 * listens).
 * @param type - the event type.
 * @param x - `clientX`, the only coordinate this file's fixtures need.
 */
function firePointerEvent(
  target: Element | Document,
  type: "pointerdown" | "pointermove" | "pointerup",
  x: number,
): void {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: x,
    button: 0,
  });
  Object.defineProperty(event, "isPrimary", {
    value: true,
    configurable: true,
  });
  Object.defineProperty(event, "pointerType", {
    value: "mouse",
    configurable: true,
  });
  Object.defineProperty(event, "pointerId", { value: 1, configurable: true });
  target.dispatchEvent(event);
}

describe("AddPalette", () => {
  it("shows both group headings", () => {
    renderPalette();
    expect(screen.getByText("Content")).toBeInTheDocument();
    expect(screen.getByText("Layout")).toBeInTheDocument();
  });

  it("offers exactly one thumbnail per leaf kind, captioned by name", () => {
    renderPalette();
    const kindItems = screen
      .getAllByTestId("palette-item")
      .filter((item) => item.hasAttribute("data-palette-kind"));
    expect(kindItems).toHaveLength(LEAF_KINDS.length);
    const kinds = kindItems
      .map((item) => item.getAttribute("data-palette-kind"))
      .sort();
    expect(kinds).toEqual([...LEAF_KINDS].sort());
    for (const kind of LEAF_KINDS) {
      const item = kindItems.find(
        (candidate) => candidate.getAttribute("data-palette-kind") === kind,
      )!;
      expect(within(item).getByText(kind)).toBeInTheDocument();
    }
  });

  it("offers exactly one thumbnail per container mode, captioned by name", () => {
    renderPalette();
    const modeItems = screen
      .getAllByTestId("palette-item")
      .filter((item) => item.hasAttribute("data-palette-mode"));
    expect(modeItems).toHaveLength(CONTAINER_MODES.length);
    const modes = modeItems
      .map((item) => item.getAttribute("data-palette-mode"))
      .sort();
    expect(modes).toEqual([...CONTAINER_MODES].sort());
  });

  // A preview mounts `Block` from `blocks.tsx` directly — not a mock — so a
  // stranger's page and this palette cannot disagree about what a kind or a
  // mode draws.
  it("draws each leaf preview with the real renderer, carrying the real kind", () => {
    renderPalette();
    const item = screen
      .getAllByTestId("palette-item")
      .find(
        (candidate) => candidate.getAttribute("data-palette-kind") === "text",
      )!;
    expect(within(item).getByTestId("public-leaf")).toHaveAttribute(
      "data-block-kind",
      "text",
    );
  });

  it("draws each container preview with the real renderer", () => {
    renderPalette();
    const item = screen
      .getAllByTestId("palette-item")
      .find(
        (candidate) => candidate.getAttribute("data-palette-mode") === "grid",
      )!;
    // A container preview holds two generic sample leaves — see
    // `sampleContainer`'s own TSDoc — so the real renderer is confirmed the
    // same way: two real `public-leaf` elements inside it.
    expect(within(item).getAllByTestId("public-leaf")).toHaveLength(2);
  });

  // `inert` is what keeps a `player`/`jukebox` sample's real transport
  // buttons from making this a clickable ancestor containing interactive
  // content — see this component's own TSDoc for the full `nested-interactive`
  // reasoning, the same shape the now-deleted `AddBlockPicker` used to need.
  it("wraps every preview in an inert, chrome-scoped box", () => {
    renderPalette();
    const items = screen.getAllByTestId("palette-item");
    expect(items).toHaveLength(LEAF_KINDS.length + CONTAINER_MODES.length);
    for (const item of items) {
      const wrapper = item.querySelector(".aeleos-chrome");
      expect(wrapper).not.toBeNull();
      expect(wrapper).toHaveAttribute("inert");
    }
  });

  it("carries CHROME_SCOPE on its own root, not SKIN_SCOPE", () => {
    const { container } = renderPalette();
    expect(container.querySelector(".aeleos-chrome")).not.toBeNull();
  });

  // **A thumbnail is a real drag source now (2026-09-05), not a static
  // preview.** Every one carries `role="button"` and an `aria-label` naming
  // the item, the same non-native `<button>` convention the now-deleted
  // `AddBlockPicker` used for exactly the same reason — a `player`/`jukebox`
  // preview draws real transport buttons, which an actual `<button>` may not
  // contain at all.
  it("carries role=button and an aria-label naming the item, for a leaf and a mode alike", () => {
    renderPalette();
    expect(screen.getByRole("button", { name: "text" })).toHaveAttribute(
      "data-palette-kind",
      "text",
    );
    expect(screen.getByRole("button", { name: "grid" })).toHaveAttribute(
      "data-palette-mode",
      "grid",
    );
  });

  // THE ONE TEST A MOCK STRUCTURALLY CANNOT WRITE — see `block-slot.test.tsx`'s
  // own header for the full account of why. A mock hands a component a
  // `useDraggable` return value and cannot observe whether the component
  // passed the node ref on; only the library's own registry can.
  it("registers each thumbnail as a real useDraggable source, by id", () => {
    const textId = paletteId({ kind: "leaf", leafKind: "text" });
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <DndContext id="t">
          <Probe id={textId} />
          <AddPalette labels={labels} page={pageContext()} locale="en" />
        </DndContext>
      </NextIntlClientProvider>,
    );
    const item = screen
      .getAllByTestId("palette-item")
      .find(
        (candidate) => candidate.getAttribute("data-palette-kind") === "text",
      )!;
    expect(seen.node).toBe(item);
  });

  it("registers a container-mode thumbnail too", () => {
    const gridId = paletteId({ kind: "container", mode: "grid" });
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <DndContext id="t">
          <Probe id={gridId} />
          <AddPalette labels={labels} page={pageContext()} locale="en" />
        </DndContext>
      </NextIntlClientProvider>,
    );
    const item = screen
      .getAllByTestId("palette-item")
      .find(
        (candidate) => candidate.getAttribute("data-palette-mode") === "grid",
      )!;
    expect(seen.node).toBe(item);
  });

  // **Begins a drag from a mouse press, and only a mouse press (2026-09-05).**
  // Touch and keyboard are a later task in this feature; wiring
  // `onPointerDown` through a handler gated on `event.pointerType === "mouse"`
  // — rather than spreading `{...listeners}` wholesale — is what keeps this
  // checkpoint pointer-only, mirroring `EditableBlockFrame`'s own mouse-gated
  // `beginDesktopDrag`.
  it("starts a real drag from a mouse-typed pointerdown", async () => {
    const started: string[] = [];
    renderPalette({}, (id) => started.push(id));
    const item = screen.getByRole("button", { name: "text" });
    await act(async () => {
      firePointerEvent(item, "pointerdown", 0);
    });
    await act(async () => {
      firePointerEvent(document, "pointermove", 40);
    });
    expect(started).toEqual([paletteId({ kind: "leaf", leafKind: "text" })]);
  });

  it("does not start a drag from a touch-typed pointerdown", async () => {
    const started: string[] = [];
    renderPalette({}, (id) => started.push(id));
    const item = screen.getByRole("button", { name: "text" });
    const event = new MouseEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      clientX: 0,
      button: 0,
    });
    Object.defineProperty(event, "isPrimary", { value: true });
    Object.defineProperty(event, "pointerType", { value: "touch" });
    await act(async () => {
      item.dispatchEvent(event);
    });
    await act(async () => {
      firePointerEvent(document, "pointermove", 40);
    });
    expect(started).toEqual([]);
  });
});
