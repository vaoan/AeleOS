import { describe, expect, it } from "vitest";
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeScope } from "@/features/actors/presentation/theme-scope";
import { DEFAULT_THEME } from "@/features/actors/domain/actor-theme";
import { DEFAULT_GRADIENT } from "@/shared/domain/gradient";

describe("ThemeScope", () => {
  it("emits a stylesheet carrying the owner's colour", () => {
    const { container } = render(
      <ThemeScope
        theme={{
          ...DEFAULT_THEME,
          background: {
            ...DEFAULT_GRADIENT,
            angle: 90,
            stops: [{ color: "#1a1a2e", at: 0 }],
          },
        }}
      >
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
      <ThemeScope
        theme={{
          ...DEFAULT_THEME,
          background: {
            ...DEFAULT_GRADIENT,
            angle: 90,
            stops: [{ color: "#1a1a2e", at: 0 }],
          },
        }}
      >
        <p>page</p>
      </ThemeScope>,
    );
    const css = container.querySelector("style")?.textContent ?? "";
    expect(css).toContain(':root:not([data-page-theme="default"])');
    expect(css).not.toContain("prefers-color-scheme");
  });

  // **THE REGRESSION TEST for an editor that reset itself on the first colour.**
  //
  // This returned `children` bare when the theme overrode nothing and a
  // fragment when it did — so the first edit changed the element type at this
  // position and React unmounted and remounted the whole subtree. A public page
  // could never see it: the theme is resolved once on the server and never
  // moves. The EDITOR sees it on the first edit, and it took the workbench's
  // state with it — the theme panel closed the moment somebody picked a colour,
  // so the next control they reached for was not in the document.
  //
  // The subject is STATE SURVIVAL rather than markup, because that is what a
  // remount destroys and what an author actually loses. A child holding state
  // is the smallest thing that can tell a re-render from a remount.
  it("keeps its children mounted when a theme first becomes themed", () => {
    /** A child whose state survives a re-render and not a remount. */
    function Counter() {
      const [count, setCount] = useState(0);
      return (
        <button type="button" onClick={() => setCount(count + 1)}>
          {`count ${count}`}
        </button>
      );
    }

    /** The scope, with a theme that starts overriding nothing. */
    function Harness() {
      const [themed, setThemed] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setThemed(true)}>
            theme it
          </button>
          <ThemeScope
            theme={
              themed
                ? {
                    ...DEFAULT_THEME,
                    background: {
                      ...DEFAULT_GRADIENT,
                      stops: [{ color: "#1a1a2e", at: 0 }],
                    },
                  }
                : DEFAULT_THEME
            }
          >
            <Counter />
          </ThemeScope>
        </>
      );
    }

    const { container } = render(<Harness />);
    // The default theme overrides nothing, so there is no stylesheet yet —
    // which is the state the old shape returned `children` bare from.
    expect(container.querySelector("style")).toBeNull();

    fireEvent.click(screen.getByText("count 0"));
    expect(screen.getByText("count 1")).toBeInTheDocument();

    fireEvent.click(screen.getByText("theme it"));

    expect(container.querySelector("style")).not.toBeNull();
    // Remounted, the counter would be back at zero.
    expect(screen.getByText("count 1")).toBeInTheDocument();
  });
});
