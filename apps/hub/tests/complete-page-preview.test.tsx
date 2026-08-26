import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  atmosphereCss,
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
    const host = screen
      .getByTestId("complete-page-preview-content")
      .closest("[data-preview-theme]");
    expect(host).toHaveClass("w-full", "min-w-0");
    expect(host).not.toHaveClass(
      "max-w-full",
      "rounded-xl",
      "surface",
      "border-(--edge)",
      // **Not a scroll container**, because `overflow-x: auto` computes the
      // visible axis to `auto` as well and the box then clips outward ink on
      // all four edges — where the public route's `main` clips none. The
      // browser guards measure the computed value; this only keeps the class
      // from coming back.
      "overflow-x-auto",
    );
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveAttribute("aria-controls");
    expect(toggle).toHaveAccessibleName(labels.collapse);

    fireEvent.click(toggle);

    expect(screen.queryByTestId("complete-page-preview-content")).toBeNull();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).not.toHaveAttribute("aria-controls");
    expect(toggle).toHaveAccessibleName(labels.expand);
  });

  // THE REGRESSION TEST for a page's own backdrop, and the fault it guards
  // was found by photographing one seeded page twice: at its public address
  // the nebula's clouds show through every gutter, and in the complete
  // preview the same page was a perfectly smooth wash. The host painted an
  // opaque `--field` on an in-flow element, and the canvas is `-z-10`.
  //
  // The two halves are one mechanism and neither works alone: the document
  // has to WEAR the atmosphere, and the host has to decline to paint over it.
  it("puts the atmosphere on the document while open and takes it back when closed", () => {
    const themed = {
      ...DEFAULT_THEME,
      background: {
        ...DEFAULT_GRADIENT,
        stops: [{ color: "#24152f", at: 0 }],
      },
      canvas: "nebula" as const,
    };
    const { container } = render(
      <CompletePagePreview
        blocks={blocks}
        theme={themed}
        lang="en"
        page={pageContext()}
        labels={labels}
      />,
    );
    const sheets = () =>
      [...container.querySelectorAll("style")].map((s) => s.textContent);

    // Closed, the workbench's resting state is the app's own atmosphere.
    expect(sheets()).not.toContain(atmosphereCss(themed));

    fireEvent.click(screen.getByTestId("complete-page-preview-toggle"));

    const atmosphere = atmosphereCss(themed);
    expect(atmosphere).not.toBe("");
    expect(sheets()).toContain(atmosphere);
    // It reaches the DOCUMENT — that is the whole point, and a rule scoped to
    // the host instead would be the fault this replaced.
    expect(atmosphere).toContain(":root{");
    expect(
      screen
        .getByTestId("complete-page-preview-content")
        .closest("[data-preview-theme]"),
    ).toHaveAttribute("data-preview-atmosphere", "document");

    fireEvent.click(screen.getByTestId("complete-page-preview-toggle"));

    expect(sheets()).not.toContain(atmosphere);
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

  it("does not inspect draft blocks until the disclosure opens", () => {
    let reads = 0;
    const observed = {
      get kind() {
        reads += 1;
        return "container";
      },
      mode: "stack",
      spaces: 1,
      children: [],
    } as unknown as Block;

    render(
      <CompletePagePreview
        blocks={[observed]}
        theme={DEFAULT_THEME}
        lang="en"
        page={pageContext()}
        labels={labels}
      />,
    );

    expect(reads).toBe(0);
    fireEvent.click(screen.getByTestId("complete-page-preview-toggle"));
    expect(reads).toBeGreaterThan(0);
    expect(screen.getByTestId("public-section")).toBeInTheDocument();
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

    // Two stylesheets now, and which is which matters: the atmosphere is
    // document-scoped and the theme is host-scoped. Read by content rather
    // than by position, so reordering them is not a failure and swapping their
    // scopes is.
    const sheets = [...container.querySelectorAll("style")].map(
      (style) => style.textContent,
    );
    expect(sheets).toContain(previewThemeCss(customTheme));
    expect(sheets).toContain(atmosphereCss(customTheme));
    expect(screen.getByText("Sección solo en español")).toBeInTheDocument();
    expect(screen.getByText("Título solo en español")).toBeInTheDocument();
    expect(screen.getByText("Palabras solo en español")).toBeInTheDocument();
  });
});
