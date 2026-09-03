import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { EditorMotion, m } from "@/features/actors/presentation/editor-motion";

/**
 * Every source file under `src`, `.tsx`/`.ts` only.
 *
 * @param dir - where to start.
 * @returns each file's path.
 */
function sourcesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourcesUnder(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const SRC = resolve(import.meta.dirname, "../src");
const ACTORS = resolve(SRC, "features/actors");
const ALL_SOURCES = sourcesUnder(SRC);

/** Files allowed to import from `motion/react` directly. */
const MOTION_IMPORT_HOME = resolve(ACTORS, "presentation/editor-motion.tsx");

describe("EditorMotion", () => {
  it("renders its children", () => {
    render(
      <EditorMotion>
        <span data-testid="chrome-child">chrome</span>
      </EditorMotion>,
    );
    expect(screen.getByTestId("chrome-child")).toHaveTextContent("chrome");
  });

  it("re-exports the m namespace usable as a component", () => {
    render(
      <EditorMotion>
        <m.div data-testid="m-div">hi</m.div>
      </EditorMotion>,
    );
    expect(screen.getByTestId("m-div")).toHaveTextContent("hi");
  });
});

describe("the motion/react import boundary", () => {
  it("is imported from motion/react in exactly one file", () => {
    const carriers = ALL_SOURCES.filter((path) => {
      if (path.endsWith(".test.tsx") || path.endsWith(".test.ts")) {
        return false;
      }
      return /from ["']motion\/react["']/.test(readFileSync(path, "utf8"));
    });
    expect(carriers).toEqual([MOTION_IMPORT_HOME]);
  });

  // Anti-vacuity: a crawl that found nothing, or a pattern matching nothing,
  // would pass the case above for the wrong reason.
  it("is found by that pattern at all", () => {
    expect(ALL_SOURCES.length).toBeGreaterThan(50);
    expect(readFileSync(MOTION_IMPORT_HOME, "utf8")).toMatch(
      /from ["']motion\/react["']/,
    );
  });

  it("never appears in the public renderer, the public profile, or the theme scope", () => {
    const forbidden = [
      resolve(ACTORS, "presentation/blocks.tsx"),
      resolve(ACTORS, "presentation/public-profile.tsx"),
      resolve(ACTORS, "presentation/theme-scope.tsx"),
    ];
    for (const path of forbidden) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toMatch(/from ["']motion\/react["']/);
      expect(source).not.toMatch(
        /from ["']@\/features\/actors\/presentation\/editor-motion["']/,
      );
    }
  });

  it("never passes a layout prop to any m.* component anywhere under the feature", () => {
    const withLayout = ALL_SOURCES.filter((path) =>
      /<m\.[A-Za-z]+[^>]*\blayout(?:Id)?\s*[={]/.test(
        readFileSync(path, "utf8"),
      ),
    );
    expect(withLayout).toEqual([]);
  });
});

describe("the @dnd-kit ancestry boundary", () => {
  // **Why this is a SEPARATE check from the import-boundary ones above.**
  // Those prove `motion/react` never reaches a file that could hold a
  // `@dnd-kit` node; they say nothing about whether a Motion component that
  // legitimately shares a file with one is positioned as its ANCESTOR. The
  // spec forbids exactly that — "no Motion ancestor of a `@dnd-kit`
  // draggable/droppable" — and nothing checked it: a real review found
  // `canvas-inspector.tsx`'s root `m.div` and its Items-pane `m.div` both
  // writing `x`/`y` while wrapping `{items}`, which resolves through
  // `InspectorItems` to `BlockSlot`, the real draggable/droppable. Both are
  // opacity-only now (canvas-inspector.tsx's own TSDoc carries the account).
  // This is what keeps that a fact the suite checks rather than a fact
  // someone remembers.
  const CANVAS_INSPECTOR = resolve(ACTORS, "presentation/canvas-inspector.tsx");
  const source = readFileSync(CANVAS_INSPECTOR, "utf8");

  /**
   * One JSX tag's own attribute text, given where the tag's own name
   * starts — up to its first unescaped `>`, which every attribute this
   * component's `m.div`s carry (`initial=`, `animate=`, `transition=`,
   * `className=`, a spread `tid()` call) closes before, the same
   * up-to-first-`>` reading the `layout` prop check above already relies
   * on.
   *
   * @param tagStart - index of the tag's own `"<m.div"`.
   * @returns that tag's own attributes, none of its children.
   */
  function ownAttributes(tagStart: number): string {
    expect(tagStart, "<m.div not found").toBeGreaterThan(-1);
    const end = source.indexOf(">", tagStart);
    return source.slice(tagStart, end);
  }

  const TRANSFORM_KEY = /\b(?:x|y|scale)\s*:/;

  const rootTagStart = source.indexOf("<m.div");
  const itemsMarker = source.indexOf("{items}");
  const itemsTagStart = source.lastIndexOf("<m.div", itemsMarker);
  const optionsMarker = source.indexOf("{options}");
  const optionsTagStart = source.lastIndexOf("<m.div", optionsMarker);
  // The outermost element closes LAST — proving `rootTagStart`'s own
  // `m.div` really does enclose both panes, rather than merely being
  // whichever tag happens to appear first in the file.
  const lastClose = source.lastIndexOf("</m.div>");

  it("finds the root, Items-pane and Options-pane m.div in the shape this check assumes", () => {
    // Anti-vacuity: every position resolved, and the root genuinely
    // encloses both `{items}` and `{options}` — before the ancestry claims
    // below are trusted.
    expect(rootTagStart).toBeGreaterThan(-1);
    expect(itemsTagStart).toBeGreaterThan(rootTagStart);
    expect(optionsTagStart).toBeGreaterThan(itemsTagStart);
    expect(itemsMarker).toBeLessThan(lastClose);
    expect(optionsMarker).toBeLessThan(lastClose);
  });

  it("the root m.div — an ancestor of both panes — writes no x, y or scale", () => {
    expect(ownAttributes(rootTagStart)).not.toMatch(TRANSFORM_KEY);
  });

  it("the Items pane's own m.div — an ancestor of BlockSlot — writes no x, y or scale", () => {
    expect(ownAttributes(itemsTagStart)).not.toMatch(TRANSFORM_KEY);
  });

  it("the Options pane's own m.div still writes y — the discriminating case", () => {
    // **This is the case that proves the two checks above could actually
    // fail.** Options renders `SelectedOptions` — fields, never a `@dnd-kit`
    // draggable — so it is allowed to keep its slide, and it still has one.
    // A version of this test that flagged every `m.div` in the file
    // regardless of position would pass here for the wrong reason; reading
    // it as still-transformed is what tells the two `not.toMatch` cases
    // above apart from a check that could never fail.
    expect(ownAttributes(optionsTagStart)).toMatch(TRANSFORM_KEY);
  });
});
