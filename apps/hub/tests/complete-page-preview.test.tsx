import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DEFAULT_THEME } from "@/features/actors/domain/actor-theme";
import type { Block } from "@/features/actors/domain/block-schema";
import { pageContext } from "./helpers/page-context";
import { CompletePagePreview } from "@/features/actors/presentation/complete-page-preview";

const blocks: Block[] = [
  {
    kind: "container",
    mode: "stack",
    spaces: 1,
    name_en: "First section",
    children: [
      {
        kind: "text",
        title_en: "Live title",
        description_en: "Live words",
      },
    ],
  },
  {
    kind: "container",
    mode: "stack",
    spaces: 1,
    name_en: "Second section",
    children: [],
  },
];

const labels = {
  title: "Complete page preview",
  expand: "Show complete page",
  collapse: "Hide complete page",
};

describe("CompletePagePreview", () => {
  it("starts collapsed and renders the real full page only when opened", () => {
    render(
      <CompletePagePreview
        blocks={blocks}
        theme={DEFAULT_THEME}
        lang="en"
        page={pageContext()}
        labels={labels}
      />,
    );

    expect(screen.queryByTestId("complete-page-preview-content")).toBeNull();

    const toggle = screen.getByRole("button", { name: labels.expand });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);

    expect(screen.getAllByTestId("public-section")).toHaveLength(blocks.length);
    expect(screen.getByText("Live words")).toBeInTheDocument();
    expect(
      screen
        .getByTestId("complete-page-preview-content")
        .closest("[data-preview-theme]"),
    ).not.toBeNull();
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveAccessibleName(labels.collapse);
  });
});
