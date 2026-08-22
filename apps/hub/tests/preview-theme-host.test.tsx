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
});
