import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const SRC = join(process.cwd(), "src");
const CSS = readFileSync(join(SRC, "app", "globals.css"), "utf8");

/**
 * Every component file.
 *
 * @param dir - where to start.
 * @returns absolute paths.
 */
function components(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return components(path);
    return entry.endsWith(".tsx") ? [path] : [];
  });
}

/**
 * The class list of every `select` in a file.
 *
 * The FIRST `className` after the tag opens is the element's own. Matching by
 * value instead would find an identical string on a nearby input — which is not
 * hypothetical: the first attempt at this fix did exactly that and moved four
 * inputs while leaving three selects alone.
 *
 * @param source - a component's text.
 * @returns one class list per select.
 */
function selectClasses(source: string): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(/<select\b/g)) {
    const at = source.indexOf('className="', match.index);
    if (at === -1) continue;
    found.push(source.slice(at + 11, source.indexOf('"', at + 11)));
  }
  return found;
}

describe("a dropdown's menu", () => {
  // **THE REGRESSION TEST for white text on a white menu.** Reported twice.
  //
  // A `select`'s list is painted from the CONTROL's own background, not the
  // page's. Every select here was `bg-transparent`, so the list had nothing to
  // paint with and came out on the browser's white while `--ink` was near-white.
  //
  // `color-scheme` was the first fix and was NOT enough — it says which scheme
  // the page is in, which reaches scrollbars and the canvas, and it leaves a
  // transparent control transparent. `color-scheme.test.ts` still guards that;
  // this guards the other half. Both are needed and they fix different things.
  //
  // Asserted on the source because the menu is drawn by the browser, outside
  // the document: no rendered test can reach it, and no screenshot can show it.
  // The nearest thing to the fault that a test CAN see is a select with nothing
  // to paint its menu with.
  it("is never left for the browser to paint", () => {
    const transparent = components(SRC).flatMap((path) =>
      selectClasses(readFileSync(path, "utf8"))
        .filter((classes) => classes.includes("bg-transparent"))
        .map(() => relative(SRC, path).split(sep).join("/")),
    );
    expect(transparent).toEqual([]);
  });

  it("is painted with a colour every select actually uses", () => {
    const painted = components(SRC).flatMap((path) =>
      selectClasses(readFileSync(path, "utf8")),
    );
    expect(painted.length).toBeGreaterThan(0);
    expect(
      painted.every((classes) => classes.includes("bg-[var(--menu)]")),
    ).toBe(true);
  });

  // **Opaque in both themes, or it is the same bug with an extra step.**
  // `--surface` cannot serve here for exactly that reason: it carries an alpha,
  // and a translucent menu composites onto whatever the browser is painting
  // behind it, which is the white this exists to escape.
  it.each([":root", '[data-theme="dark"]'])(
    "declares an opaque menu colour for %s",
    (selector) => {
      const start = CSS.indexOf(`${selector} {`);
      expect(start).toBeGreaterThan(-1);
      const value = /--menu:\s*([^;]+);/.exec(
        CSS.slice(start, CSS.indexOf("\n}", start)),
      )?.[1];
      expect(value).toBeTruthy();
      expect(value).not.toMatch(/\//);
    },
  );
});
