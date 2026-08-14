import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const CSS = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

/**
 * The declarations inside one selector's block.
 *
 * @param selector - the block to read, as it appears in the file.
 * @returns its body.
 */
function block(selector: string): string {
  const start = CSS.indexOf(`${selector} {`);
  expect(start, `${selector} is missing from globals.css`).toBeGreaterThan(-1);
  return CSS.slice(start, CSS.indexOf("\n}", start));
}

describe("the browser's own colour scheme", () => {
  // **THE REGRESSION TEST for an unreadable dropdown.** `color-scheme` decides
  // what the browser paints the surfaces IT draws: the inside of a `select`'s
  // menu, scrollbars, the canvas behind the page. It was never declared, so
  // every one of those stayed light while `--ink` went near-white — and a
  // dropdown in dark mode was white text on a white menu.
  //
  // Nothing in the app was wrong, which is why nothing caught it: the menu is
  // drawn by the browser, out of reach of any component and of every test that
  // renders one. Measured in a real Chromium before and after — the used
  // `Canvas` went from rgb(255,255,255) to rgb(18,18,18) while `CanvasText`
  // went the other way.
  //
  // Asserted on the stylesheet because that is the level the fault lived at:
  // one missing declaration, in the one file that knows which scheme a page is
  // in.
  it("is declared for the light theme", () => {
    expect(block(":root")).toMatch(/color-scheme:\s*light/);
  });

  it("is declared for the dark theme", () => {
    expect(block('[data-theme="dark"]')).toMatch(/color-scheme:\s*dark/);
  });

  // The two must not agree. A single value at `:root` would look like a fix and
  // leave one of the two modes painting the browser's menus in the other's
  // colours — which is the bug, in the other direction.
  it("does not give both themes the same one", () => {
    const light = /color-scheme:\s*(\w+)/.exec(block(":root"))?.[1];
    const dark = /color-scheme:\s*(\w+)/.exec(
      block('[data-theme="dark"]'),
    )?.[1];
    expect(light).not.toBe(dark);
  });
});
