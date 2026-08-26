import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_THEME,
  previewThemeCss,
} from "@/features/actors/domain/actor-theme";
import { PreviewThemeHost } from "@/features/actors/presentation/preview-theme-host";
import { DEFAULT_GRADIENT } from "@/shared/domain/gradient";
import { SKIN_SCOPE } from "@/shared/domain/skins";

describe("PreviewThemeHost", () => {
  it("contains the live theme inside the preview boundary", () => {
    const theme = {
      ...DEFAULT_THEME,
      background: {
        ...DEFAULT_GRADIENT,
        stops: [{ color: "#24152f", at: 0 }],
      },
      accent: "#f04f91",
      skin: "comic" as const,
      backgroundUrl: "https://example.test/background.png",
    };
    const { container } = render(
      <PreviewThemeHost theme={theme}>
        <div data-testid="child" />
      </PreviewThemeHost>,
    );

    expect(screen.getByTestId("preview-theme-host")).toHaveAttribute(
      "data-preview-theme",
      "",
    );
    expect(screen.getByTestId("preview-theme-host")).toHaveClass(SKIN_SCOPE);
    expect(screen.getByTestId("preview-theme-host")).toContainElement(
      screen.getByTestId("child"),
    );
    expect(container.querySelector("style")?.textContent).toBe(
      previewThemeCss(theme),
    );
  });

  it("emits no stylesheet for the default theme", () => {
    const { container } = render(
      <PreviewThemeHost theme={DEFAULT_THEME}>
        <div />
      </PreviewThemeHost>,
    );

    expect(container.querySelector("style")).toBeNull();
  });

  // **A TRAY ALWAYS PAINTS ITS OWN FIELD.** There was briefly a second mode
  // that painted nothing, so the inline complete preview could show the
  // document's canvas and window-anchored field through itself. The complete
  // preview is a real document now, so that mode has no caller and is gone —
  // and an option with no caller is what `COLUMN.full` cost this app twice.
  it("paints its own field, because a tray has no page-scale backdrop to sit on", () => {
    render(
      <PreviewThemeHost theme={DEFAULT_THEME}>
        <div />
      </PreviewThemeHost>,
    );

    const host = screen.getByTestId("preview-theme-host");
    expect(host).toHaveClass("[background:var(--field)]");
    // `--ink` is a control token and never reaches the document, so a preview
    // that did not restate it would carry the app's writing colour over the
    // author's page.
    expect(host).toHaveClass("text-(--ink)");
    expect(host).not.toHaveAttribute("data-preview-atmosphere");
  });

  it("preserves a supplied class name on the preview boundary", () => {
    render(
      <PreviewThemeHost theme={DEFAULT_THEME} className="custom-preview-class">
        <div />
      </PreviewThemeHost>,
    );

    expect(screen.getByTestId("preview-theme-host")).toHaveClass(
      "custom-preview-class",
    );
  });
});
