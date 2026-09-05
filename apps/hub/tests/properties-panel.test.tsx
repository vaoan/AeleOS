import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  PropertiesPanel,
  type PropertiesPanelLabels,
} from "@/features/actors/presentation/properties-panel";

const labels: PropertiesPanelLabels = {
  close: "Close",
  primaryTab: "Layout",
  secondaryTab: "Appearance",
};

describe("PropertiesPanel", () => {
  it("renders nothing when nothing is selected", () => {
    const { container } = render(
      <PropertiesPanel
        selection={null}
        tab="primary"
        onTab={vi.fn()}
        labels={labels}
        onClose={vi.fn()}
        primary={<p>primary content</p>}
        secondary={<p>secondary content</p>}
        foot={<p>foot content</p>}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("always renders exactly two tabs, named for the current selection kind", () => {
    render(
      <PropertiesPanel
        selection={{ kind: "page" }}
        tab="primary"
        onTab={vi.fn()}
        labels={labels}
        onClose={vi.fn()}
        primary={<p>primary content</p>}
        secondary={<p>secondary content</p>}
        foot={<p>foot content</p>}
      />,
    );
    expect(screen.getAllByRole("tab")).toHaveLength(2);
    expect(screen.getByRole("tab", { name: "Layout" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Appearance" })).toBeInTheDocument();
  });

  it("keeps both panes mounted, showing only the active one", () => {
    render(
      <PropertiesPanel
        selection={{ kind: "page" }}
        tab="primary"
        onTab={vi.fn()}
        labels={labels}
        onClose={vi.fn()}
        primary={<p>primary content</p>}
        secondary={<p>secondary content</p>}
        foot={<p>foot content</p>}
      />,
    );
    // Both are IN THE DOCUMENT — the whole point of the native `hidden`
    // attribute over a conditional unmount — but only one is visible.
    expect(screen.getByText("primary content")).toBeInTheDocument();
    expect(screen.getByText("secondary content")).toBeInTheDocument();
    expect(screen.getByText("primary content").closest("[hidden]")).toBeNull();
    expect(
      screen.getByText("secondary content").closest("[hidden]"),
    ).not.toBeNull();
  });

  it("asks its caller for the other tab, rather than switching itself", () => {
    const onTab = vi.fn();
    render(
      <PropertiesPanel
        selection={{ kind: "page" }}
        tab="primary"
        onTab={onTab}
        labels={labels}
        onClose={vi.fn()}
        primary={<p>primary content</p>}
        secondary={<p>secondary content</p>}
        foot={<p>foot content</p>}
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Appearance" }));
    expect(onTab).toHaveBeenCalledWith("secondary");
  });

  it("clears selection through Close, with no Back and no breadcrumbs", () => {
    const onClose = vi.fn();
    render(
      <PropertiesPanel
        selection={{ kind: "block", path: [0] }}
        tab="secondary"
        onTab={vi.fn()}
        labels={labels}
        onClose={onClose}
        primary={<p>primary content</p>}
        secondary={<p>secondary content</p>}
        foot={<p>foot content</p>}
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
        selection={{ kind: "block", path: [0] }}
        tab="primary"
        onTab={vi.fn()}
        labels={labels}
        onClose={vi.fn()}
        primary={<p>primary content</p>}
        secondary={<p>secondary content</p>}
        foot={<button type="button">Clone</button>}
      />,
    );
    expect(screen.getByRole("button", { name: "Clone" })).toBeInTheDocument();
  });
});
