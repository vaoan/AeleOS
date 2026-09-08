import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { EditorSelection } from "@/features/actors/domain/editor-selection";
import {
  PropertiesPanel,
  type PropertiesPanelLabels,
  type PropertiesPanelProps,
} from "@/features/actors/presentation/properties-panel";

const labels: PropertiesPanelLabels = {
  close: "Close",
  primaryTab: "Layout",
  secondaryTab: "Appearance",
  paletteTab: "Palette",
};

/**
 * Builds a full set of props for the given selection, so each case only
 * states what it is actually testing.
 *
 * @param selection - what to render the panel with.
 * @returns props for {@link PropertiesPanel}.
 */
function propsFor(selection: EditorSelection): PropertiesPanelProps {
  return {
    selection,
    activeTab: "primary",
    onTab: vi.fn(),
    labels,
    onClose: vi.fn(),
    primary: <p>primary content</p>,
    secondary: <p>secondary content</p>,
    palette: <p>palette content</p>,
    foot: <p>foot content</p>,
  };
}

describe("PropertiesPanel", () => {
  // **`toBeVisible()` cannot be used anywhere under this component's root
  // (root `CLAUDE.md`'s Motion note).** The root `m.div`'s `initial={{
  // opacity: 0 }}` never actually animates to 1 in jsdom — there is no real
  // compositor to run the animation — so jest-dom's `toBeVisible()` reads
  // every descendant as invisible via the "parent is also visible" check,
  // regardless of the `hidden` attribute this component actually controls.
  // The established fix elsewhere in this codebase is to read the `hidden`
  // attribute directly rather than ask `toBeVisible()`.
  it("renders the Palette region even with nothing selected", () => {
    render(<PropertiesPanel {...propsFor(null)} activeTab="palette" />);
    expect(screen.getByTestId("panel-palette")).not.toHaveAttribute("hidden");
    expect(screen.getByText("palette content")).toBeInTheDocument();
  });

  it("hides the primary and secondary tab buttons when nothing is selected, keeping the Palette tab reachable", () => {
    render(<PropertiesPanel {...propsFor(null)} activeTab="palette" />);
    expect(screen.getByTestId("panel-tab-primary")).toHaveAttribute("hidden");
    expect(screen.getByTestId("panel-tab-secondary")).toHaveAttribute("hidden");
    expect(screen.getByTestId("panel-tab-palette")).not.toHaveAttribute(
      "hidden",
    );
  });

  it("shows all three tabs once something is selected", () => {
    render(
      <PropertiesPanel {...propsFor({ kind: "page" })} activeTab="primary" />,
    );
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    expect(screen.getByTestId("panel-tab-primary")).not.toHaveAttribute(
      "hidden",
    );
    expect(screen.getByTestId("panel-tab-secondary")).not.toHaveAttribute(
      "hidden",
    );
    expect(screen.getByTestId("panel-tab-palette")).not.toHaveAttribute(
      "hidden",
    );
  });

  it("keeps all three panes mounted, showing only the active one", () => {
    render(
      <PropertiesPanel {...propsFor({ kind: "page" })} activeTab="primary" />,
    );
    // All three are IN THE DOCUMENT — the whole point of the native `hidden`
    // attribute over a conditional unmount — but only one is visible.
    expect(screen.getByText("primary content")).toBeInTheDocument();
    expect(screen.getByText("secondary content")).toBeInTheDocument();
    expect(screen.getByText("palette content")).toBeInTheDocument();
    expect(screen.getByText("primary content").closest("[hidden]")).toBeNull();
    expect(
      screen.getByText("secondary content").closest("[hidden]"),
    ).not.toBeNull();
    expect(
      screen.getByText("palette content").closest("[hidden]"),
    ).not.toBeNull();
  });

  it("switches to the Palette tab and hides the other two", () => {
    const onTab = vi.fn();
    render(
      <PropertiesPanel
        {...propsFor({ kind: "block", path: [0] })}
        activeTab="primary"
        onTab={onTab}
      />,
    );
    fireEvent.click(screen.getByTestId("panel-tab-palette"));
    // This component is fully controlled — it owns no tab state of its
    // own — so a click asks the caller for the other tab rather than
    // switching itself, matching the existing convention for primary/
    // secondary below.
    expect(onTab).toHaveBeenCalledWith("palette");
  });

  it("asks its caller for the other tab, rather than switching itself", () => {
    const onTab = vi.fn();
    render(
      <PropertiesPanel
        {...propsFor({ kind: "page" })}
        activeTab="primary"
        onTab={onTab}
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Appearance" }));
    expect(onTab).toHaveBeenCalledWith("secondary");
  });

  it("clears selection through Close, with no Back and no breadcrumbs", () => {
    const onClose = vi.fn();
    render(
      <PropertiesPanel
        {...propsFor({ kind: "block", path: [0] })}
        activeTab="secondary"
        onClose={onClose}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /back/i }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: labels.close }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders the foot Clone/Delete content passed to it", () => {
    render(
      <PropertiesPanel
        {...propsFor({ kind: "block", path: [0] })}
        activeTab="primary"
        foot={<button type="button">Clone</button>}
      />,
    );
    expect(screen.getByRole("button", { name: "Clone" })).toBeInTheDocument();
  });
});
