import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_THEME,
  previewThemeCss,
} from "@/features/actors/domain/actor-theme";
import type { Block } from "@/features/actors/domain/block-schema";
import { DEFAULT_GRADIENT } from "@/shared/domain/gradient";
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
  it("starts collapsed, renders the real full page when opened, and unmounts it when closed", () => {
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

    const region = screen.getByTestId("complete-page-preview");
    const toggle = screen.getByTestId("complete-page-preview-toggle");
    expect(region).toContainElement(toggle);
    expect(toggle).toHaveAccessibleName(labels.expand);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).not.toHaveAttribute("aria-controls");
    fireEvent.click(toggle);

    expect(screen.getAllByTestId("public-section")).toHaveLength(blocks.length);
    expect(screen.getByText("Live words")).toBeInTheDocument();
    expect(
      screen
        .getByTestId("complete-page-preview-content")
        .closest("[data-preview-theme]"),
    ).not.toBeNull();
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveAttribute("aria-controls");
    expect(toggle).toHaveAccessibleName(labels.collapse);

    fireEvent.click(toggle);

    expect(screen.queryByTestId("complete-page-preview-content")).toBeNull();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).not.toHaveAttribute("aria-controls");
    expect(toggle).toHaveAccessibleName(labels.expand);
  });

  it("keeps valid draft sections when a malformed in-progress block cannot render", () => {
    const malformed = {
      kind: "container",
      mode: "grid",
      spaces: "not-a-number",
      name_en: "Malformed",
      children: [],
    } as unknown as Block;
    render(
      <CompletePagePreview
        blocks={[blocks[0]!, malformed, blocks[1]!]}
        theme={DEFAULT_THEME}
        lang="en"
        page={pageContext()}
        labels={labels}
      />,
    );

    fireEvent.click(screen.getByTestId("complete-page-preview-toggle"));

    expect(screen.getAllByTestId("public-section")).toHaveLength(2);
    expect(screen.getByText("Live words")).toBeInTheDocument();
    expect(screen.queryByText("Malformed")).toBeNull();
  });

  // cspell:ignore Sección Título Palabras -- authored Spanish fixture text
  it("renders the supplied custom theme and Spanish authoring language", () => {
    const customTheme = {
      ...DEFAULT_THEME,
      background: {
        ...DEFAULT_GRADIENT,
        stops: [{ color: "#24152f", at: 0 }],
      },
      accent: "#f04f91",
      skin: "comic" as const,
    };
    const spanishBlocks: Block[] = [
      {
        kind: "container",
        mode: "stack",
        spaces: 1,
        name_en: "",
        name_es: "Sección solo en español",
        children: [
          {
            kind: "text",
            title_en: "",
            title_es: "Título solo en español",
            description_en: "",
            description_es: "Palabras solo en español",
          },
        ],
      },
    ];
    const { container } = render(
      <CompletePagePreview
        blocks={spanishBlocks}
        theme={customTheme}
        lang="es"
        page={pageContext()}
        labels={labels}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: labels.expand }));

    expect(container.querySelector("style")?.textContent).toBe(
      previewThemeCss(customTheme),
    );
    expect(screen.getByText("Sección solo en español")).toBeInTheDocument();
    expect(screen.getByText("Título solo en español")).toBeInTheDocument();
    expect(screen.getByText("Palabras solo en español")).toBeInTheDocument();
  });
});
