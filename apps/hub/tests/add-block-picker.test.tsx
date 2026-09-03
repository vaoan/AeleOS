import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/shared/infrastructure/i18n/messages/en.json";
import {
  CONTAINER_MODES,
  LEAF_KINDS,
  type Block,
  type ContainerMode,
  type LeafKind,
} from "@/features/actors/domain/block-schema";
import { newLeaf } from "@/features/actors/domain/block-edits";
import { AddBlockPicker } from "@/features/actors/presentation/add-block-picker";
import { pageContext } from "./helpers/page-context";

// The `player`/`jukebox` previews reach `useTranslations` through
// `RetroPlayer`, exactly as `blocks.test.tsx` documents — every page in this
// app renders inside `NextIntlClientProvider`, so the picker's previews must
// too, with the real catalogue rather than a stub that would measure a
// different program.

const labels = {
  add: "Add",
  title: "Add to this section",
  contentGroup: "Content",
  layoutGroup: "Layout",
  nestingAtLimit: "Sections cannot be nested any deeper.",
  leafKinds: Object.fromEntries(
    LEAF_KINDS.map((kind) => [kind, kind]),
  ) as Record<LeafKind, string>,
  modes: Object.fromEntries(
    CONTAINER_MODES.map((mode) => [mode, mode]),
  ) as Record<ContainerMode, string>,
};

/**
 * Renders the picker with overrides.
 *
 * @param props - what to override.
 * @returns what `render` returned.
 */
function renderPicker(props: Record<string, unknown> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AddBlockPicker
        targetPath={[]}
        kinds={LEAF_KINDS}
        mayAddLayout
        atBlockLimit={false}
        labels={labels}
        page={pageContext()}
        locale="en"
        onAdd={() => {}}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

describe("AddBlockPicker", () => {
  it("renders no popup until the trigger is pressed", () => {
    renderPicker();
    expect(screen.queryByTestId("add-block-picker")).toBeNull();
  });

  it("renders nothing at all at the block limit", () => {
    renderPicker({ atBlockLimit: true });
    expect(screen.queryByTestId("add-block")).toBeNull();
    expect(screen.queryByTestId("add-block-picker")).toBeNull();
  });

  it("opens on press, with the dialog labelled by its own title", () => {
    renderPicker();
    fireEvent.click(screen.getByTestId("add-block"));
    const dialog = screen.getByTestId("add-block-picker");
    expect(dialog).toBeInTheDocument();
    expect(
      within(dialog).getByRole("heading", { name: "Add to this section" }),
    ).toBeInTheDocument();
  });

  it("offers exactly the forwarded kinds, never the whole vocabulary", () => {
    renderPicker({ kinds: ["text", "link"] });
    fireEvent.click(screen.getByTestId("add-block"));
    const options = screen.getAllByTestId("add-block-option");
    const kinds = options
      .map((option) => option.getAttribute("data-add-kind"))
      .filter((kind) => kind !== null);
    expect(kinds.sort()).toEqual(["link", "text"]);
    expect(kinds).not.toContain("owner");
  });

  it("offers one layout option per container mode when nesting is allowed", () => {
    renderPicker({ mayAddLayout: true });
    fireEvent.click(screen.getByTestId("add-block"));
    const modeOptions = screen
      .getAllByTestId("add-block-option")
      .filter((option) => option.hasAttribute("data-add-mode"));
    expect(modeOptions).toHaveLength(CONTAINER_MODES.length);
    expect(screen.queryByTestId("nesting-at-limit")).toBeNull();
  });

  it("omits the layout group and shows the at-limit sentence when nesting is refused", () => {
    renderPicker({ mayAddLayout: false });
    fireEvent.click(screen.getByTestId("add-block"));
    expect(screen.queryByText("Layout")).toBeNull();
    expect(
      screen
        .getAllByTestId("add-block-option")
        .every((option) => !option.hasAttribute("data-add-mode")),
    ).toBe(true);
    expect(screen.getByTestId("nesting-at-limit")).toHaveTextContent(
      "Sections cannot be nested any deeper.",
    );
  });

  it("adds exactly what newLeaf produces, never the sample the preview drew", () => {
    const onAdd = vi.fn<(block: Block) => void>();
    renderPicker({ onAdd });
    fireEvent.click(screen.getByTestId("add-block"));
    fireEvent.click(
      screen
        .getAllByTestId("add-block-option")
        .find((option) => option.getAttribute("data-add-kind") === "link")!,
    );
    expect(onAdd).toHaveBeenCalledExactlyOnceWith(newLeaf("link"));
  });

  it("closes and adds nothing on Escape", () => {
    const onAdd = vi.fn();
    renderPicker({ onAdd });
    fireEvent.click(screen.getByTestId("add-block"));
    fireEvent.keyDown(screen.getByTestId("add-block-picker"), {
      key: "Escape",
    });
    expect(screen.queryByTestId("add-block-picker")).toBeNull();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("closes and adds nothing on an outside press", () => {
    const onAdd = vi.fn();
    renderPicker({ onAdd });
    fireEvent.click(screen.getByTestId("add-block"));
    fireEvent.click(screen.getByTestId("add-block-picker"));
    expect(screen.queryByTestId("add-block-picker")).toBeNull();
    expect(onAdd).not.toHaveBeenCalled();
  });

  // A preview mounts `Block` from `blocks.tsx` directly — not a mock — so a
  // stranger's page and the picker cannot disagree about what a kind draws.
  it("draws the text preview with the real renderer, carrying the real leaf kind", () => {
    renderPicker({ kinds: ["text"], mayAddLayout: false });
    fireEvent.click(screen.getByTestId("add-block"));
    const option = screen.getByTestId("add-block-option");
    expect(within(option).getByTestId("public-leaf")).toHaveAttribute(
      "data-block-kind",
      "text",
    );
  });

  // **The discriminating fixture.** Two pickers, each targeted at a
  // different place, each with its own `onAdd`. A picker that always fills
  // the first place regardless of `targetPath` would still pass a
  // single-picker fixture; it cannot pass this one, because the second
  // picker's own `onAdd` — the one bound to the SECOND place — is the one
  // that must fire.
  it("stays wired to its own target: choosing from the second of two pickers reaches only its own onAdd", () => {
    const onAddFirst = vi.fn();
    const onAddSecond = vi.fn();
    render(
      <>
        <AddBlockPicker
          targetPath={[0, 0]}
          kinds={["text"]}
          mayAddLayout={false}
          atBlockLimit={false}
          labels={labels}
          page={pageContext()}
          locale="en"
          onAdd={onAddFirst}
        />
        <AddBlockPicker
          targetPath={[0, 1]}
          kinds={["text"]}
          mayAddLayout={false}
          atBlockLimit={false}
          labels={labels}
          page={pageContext()}
          locale="en"
          onAdd={onAddSecond}
        />
      </>,
    );

    const triggers = screen.getAllByTestId("add-block");
    expect(triggers[0]).toHaveAttribute("data-target-path", "0-0");
    expect(triggers[1]).toHaveAttribute("data-target-path", "0-1");

    fireEvent.click(triggers[1]);
    // Only one picker is open at a time, and each carries one option
    // (`kinds={["text"]}`), so this is unambiguous.
    fireEvent.click(screen.getByTestId("add-block-option"));

    expect(onAddSecond).toHaveBeenCalledOnce();
    expect(onAddFirst).not.toHaveBeenCalled();
  });
});
