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
