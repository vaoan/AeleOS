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
  // draggable/droppable" — and a real review once found `canvas-inspector.tsx`'s
  // root `m.div` and its Items-pane `m.div` both writing `x`/`y` while
  // wrapping `{items}`, which resolved through `InspectorItems` to
  // `BlockSlot`, the real draggable/droppable.
  //
  // **`properties-panel.tsx` (2026-09-04) removed the hazard by removing the
  // mechanism, not by fixing the two positions above a second time.** It is
  // `CanvasInspector` renamed with the whole Items/Options split gone: its
  // two panes are `primary`/`secondary`, built by `block-editor.tsx` from
  // `BlockCard`, `LeafEditor` and `StyleFields` — forms, never a `@dnd-kit`
  // draggable row — so there is no ancestor position left in this file that
  // could ever enclose one. The check that follows asserts that absence
  // structurally, by import, rather than repeating the position-by-position
  // reading above against a file with nothing left for it to find.
  const PROPERTIES_PANEL = resolve(ACTORS, "presentation/properties-panel.tsx");
  const source = readFileSync(PROPERTIES_PANEL, "utf8");

  it("imports no @dnd-kit module and no BlockSlot at all", () => {
    // Anti-vacuity: the file is read and is non-trivial, before its absence
    // of these imports is trusted as meaningful rather than as an empty file
    // passing for free. The pattern looks for an actual `import … from`
    // statement rather than any occurrence of the words — this file's own
    // TSDoc names both while explaining why neither is imported any more.
    expect(source.length).toBeGreaterThan(500);
    expect(source).not.toMatch(/from ["'].*@dnd-kit/);
    expect(source).not.toMatch(/from ["'].*block-slot/);
  });

  it("both panes' own m.div still carry a slide, since neither can be a @dnd-kit ancestor", () => {
    // The discriminating half: a version of this file that went back to
    // opacity-only "to be safe" would still pass the import check above,
    // which is why this asserts the slide is PRESENT rather than merely
    // that nothing forbidden is imported.
    const transforms = source.match(/y:\s*6/g) ?? [];
    expect(transforms.length).toBe(2);
  });
});
