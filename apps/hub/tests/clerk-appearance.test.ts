import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CLERK_PALETTE,
  clerkAppearanceFor,
  type ClerkTheme,
} from "@/lib/clerk-appearance";

// Read from disk rather than imported: the point is to compare against what
// the stylesheet actually declares, so a bundler transform must not sit in
// between.
const CSS = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

/**
 * Reads a custom property out of the stylesheet, per theme block.
 *
 * `:root` carries light and `[data-theme="dark"]` carries dark, so the block
 * has to be isolated before matching or the first definition always wins.
 *
 * @param token - the property name, without the leading dashes.
 * @param theme - which block to read it from.
 * @returns the declared value, trimmed.
 */
function tokenValue(token: string, theme: ClerkTheme): string {
  const start =
    theme === "dark"
      ? CSS.indexOf('[data-theme="dark"]')
      : CSS.indexOf(":root");
  const block = CSS.slice(start, CSS.indexOf("}", start));
  const match = new RegExp(`--${token}:\\s*([^;]+);`).exec(block);
  if (!match) throw new Error(`token --${token} not found for ${theme}`);
  return match[1]!.trim();
}

const THEMES: ClerkTheme[] = ["light", "dark"];

describe("clerkAppearanceFor", () => {
  // The bug this locks down: Clerk parses these strings to derive its own
  // hover, focus and overlay shades. A var() reference is not parseable, so it
  // silently produced an empty --clerk-color-primary, an invisible Continue
  // button and a black footer strip on a light page.
  it("gives Clerk literal colours rather than var() references", () => {
    for (const theme of THEMES) {
      for (const [key, value] of Object.entries(CLERK_PALETTE[theme])) {
        expect(value, `${theme}.${key}`).not.toMatch(/var\(/);
        expect(value, `${theme}.${key}`).toMatch(/^oklch\(/);
      }
    }
  });

  it("defines the same keys for both themes", () => {
    expect(Object.keys(CLERK_PALETTE.light).sort()).toEqual(
      Object.keys(CLERK_PALETTE.dark).sort(),
    );
  });

  // These literals duplicate globals.css because Clerk cannot read the
  // stylesheet. This is the check that keeps the duplicate honest: move a token
  // without moving Clerk's copy and the sign-in card silently drifts out of the
  // design.
  it.each(THEMES)("matches the %s tokens in globals.css", (theme) => {
    const palette = CLERK_PALETTE[theme];
    expect(palette.colorPrimary).toBe(tokenValue("accent", theme));
    expect(palette.colorForeground).toBe(tokenValue("ink", theme));
    expect(palette.colorMutedForeground).toBe(tokenValue("muted", theme));
    expect(palette.colorBorder).toBe(tokenValue("edge", theme));
  });

  // --surface carries an alpha channel that Clerk has no use for, so the
  // comparison is against the opaque colour underneath it.
  it.each(THEMES)("takes its %s background from --surface", (theme) => {
    const opaque = tokenValue("surface", theme).replace(
      /^oklch\(([^/)]+?)\s*\/[^)]*\)$/,
      (_, channels: string) => `oklch(${channels})`,
    );
    expect(CLERK_PALETTE[theme].colorBackground).toBe(opaque);
  });

  it("hides Clerk's header, since the page already has a heading", () => {
    expect(clerkAppearanceFor("light").elements.header).toBe("hidden!");
  });

  // Clerk styles its own elements with emotion, which outranks a plain utility
  // class. Without the `!` the class is present and simply loses — a `hidden`
  // header stayed visible at display:flex, which is how the card ended up with
  // two titles.
  it("marks every overriding class important", () => {
    const { elements } = clerkAppearanceFor("light");
    const overriding = [
      elements.header,
      elements.card,
      elements.cardBox,
      elements.footer,
      elements.formFieldInput,
    ];
    for (const value of overriding) {
      expect(value).toMatch(/!/);
    }
  });

  // Our own Card paints the surface; a second one behind it double-tints the
  // translucency and the nebula stops showing through.
  it("keeps Clerk's own surfaces transparent", () => {
    const { elements } = clerkAppearanceFor("dark");
    expect(elements.card).toMatch(/bg-transparent/);
    expect(elements.cardBox).toMatch(/bg-transparent/);
    expect(elements.footer).toMatch(/bg-transparent/);
  });

  // Classes are ordinary CSS on Clerk's DOM, so unlike `variables` they do
  // resolve custom properties — which is why the button belongs here.
  it("styles the primary button from the live accent token", () => {
    expect(clerkAppearanceFor("light").elements.formButtonPrimary).toMatch(
      /var\(--accent\)/,
    );
  });
});
