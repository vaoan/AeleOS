import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { ThemeScope } from "@/features/actors/presentation/theme-scope";
import { DEFAULT_THEME } from "@/features/actors/domain/actor-theme";

describe("ThemeScope", () => {
  it("emits a stylesheet carrying the owner's colour", () => {
    const { container } = render(
      <ThemeScope theme={{ ...DEFAULT_THEME, accent: "#00ff88" }}>
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

  // Both schemes have to be in the markup, because the server cannot know which
  // one the reader is in and the reader's own toggle has to keep working.
  it("carries both schemes so the visitor's choice still decides", () => {
    const { container } = render(
      <ThemeScope theme={{ ...DEFAULT_THEME, accent: "#00ff88" }}>
        <p>page</p>
      </ThemeScope>,
    );
    const css = container.querySelector("style")?.textContent ?? "";
    expect(css).toContain("prefers-color-scheme:dark");
    expect(css).toContain(':root[data-theme="dark"]');
  });
});
