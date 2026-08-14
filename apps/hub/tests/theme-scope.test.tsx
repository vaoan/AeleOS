import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { ThemeScope } from "@/features/actors/presentation/theme-scope";
import {
  DEFAULT_THEME,
  THEME_SCOPE,
  themeCss,
} from "@/features/actors/domain/actor-theme";

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

describe("the scope the editor previews into", () => {
  // THE REGRESSION TEST. The configurator emitted its preview stylesheet scoped
  // to `.theme-preview`, and no element anywhere in the app ever wore that
  // class — so the rules matched nothing, and somebody dragging a colour slider
  // watched their page refuse to change. Nothing failed: the stylesheet was
  // there, it was correct, and it applied to no element.
  //
  // Asserting that the two agree is the level the fault lived at. A test of
  // `themeCss` passes either way, because the function was never wrong.
  it("uses the same class the page itself is scoped to", () => {
    const css = themeCss({ ...DEFAULT_THEME, accent: "#00ff88" }, THEME_SCOPE);
    // The accent rule is the scoped one; the backdrop lives at :root.
    expect(css).toContain(`.${THEME_SCOPE}{--accent`);
  });

  it("scopes the page and the preview to one name", () => {
    const { container } = render(
      <ThemeScope theme={{ ...DEFAULT_THEME, accent: "#00ff88" }}>
        <p>page</p>
      </ThemeScope>,
    );
    const styled = container.querySelector(`.${THEME_SCOPE}`);
    expect(styled).not.toBeNull();
    const css = container.querySelector("style")?.textContent ?? "";
    expect(css).toContain(`.${THEME_SCOPE}`);
  });
});
