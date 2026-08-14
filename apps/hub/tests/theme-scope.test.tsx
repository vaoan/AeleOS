import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { ThemeScope } from "@/features/actors/presentation/theme-scope";
import { DEFAULT_THEME } from "@/features/actors/domain/actor-theme";

describe("ThemeScope", () => {
  it("emits a stylesheet carrying the owner's colour", () => {
    const { container } = render(
      <ThemeScope theme={{ ...DEFAULT_THEME, background: "#1a1a2e" }}>
        <p>page</p>
      </ThemeScope>,
    );
    expect(container.querySelector("style")?.textContent).toContain("--accent");
  });

  // A page nobody has themed must be byte-for-byte what it was before theming
  // existed — no element, no empty rules shipped on every request.
  it("emits nothing at all for a theme that overrides nothing", () => {
    const { container } = render(
      <ThemeScope theme={DEFAULT_THEME}>
        <p>page</p>
      </ThemeScope>,
    );
    expect(container.querySelector("style")).toBeNull();
    expect(container.textContent).toBe("page");
  });

  // One palette, so one rule and no media queries. A custom theme reads the
  // same for everybody — it used to emit two accents and pick between them by
  // the reader's scheme, which made it two themes rather than one.
  it("emits one rule, with no scheme to pick between", () => {
    const { container } = render(
      <ThemeScope theme={{ ...DEFAULT_THEME, background: "#1a1a2e" }}>
        <p>page</p>
      </ThemeScope>,
    );
    const css = container.querySelector("style")?.textContent ?? "";
    expect(css).toContain(':root:not([data-page-theme="default"])');
    expect(css).not.toContain("prefers-color-scheme");
  });
});
