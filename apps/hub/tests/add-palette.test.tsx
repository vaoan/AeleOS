import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/shared/infrastructure/i18n/messages/en.json";
import {
  CONTAINER_MODES,
  LEAF_KINDS,
  type ContainerMode,
  type LeafKind,
} from "@/features/actors/domain/block-schema";
import { AddPalette } from "@/features/actors/presentation/add-palette";
import { pageContext } from "./helpers/page-context";

// `player`/`jukebox` previews reach `useTranslations` through `RetroPlayer`,
// exactly as `add-block-picker.test.tsx` and `blocks.test.tsx` document —
// every page in this app renders inside `NextIntlClientProvider`, and this
// component renders every leaf kind, so it must too.

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
 * Renders {@link AddPalette} with overrides.
 *
 * @param props - what to override.
 * @returns what `render` returned.
 */
function renderPalette(props: Record<string, unknown> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AddPalette labels={labels} page={pageContext()} locale="en" {...props} />
    </NextIntlClientProvider>,
  );
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
  // reasoning it mirrors from `AddBlockPicker`.
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

  it("renders no interactive role on a thumbnail — static for this checkpoint", () => {
    renderPalette();
    for (const item of screen.getAllByTestId("palette-item")) {
      expect(item).not.toHaveAttribute("role");
      expect(item).not.toHaveAttribute("tabindex");
    }
  });

  it("carries CHROME_SCOPE on its own root, not SKIN_SCOPE", () => {
    const { container } = renderPalette();
    expect(container.querySelector(".aeleos-chrome")).not.toBeNull();
  });
});
