import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CHROME_SCOPE } from "@/shared/domain/chrome";

// WHAT THIS CAN AND CANNOT PROVE.
//
// It reads `globals.css` as text, so it proves the selectors were WRITTEN. It
// cannot prove they win — a stylesheet assertion cannot see a cascade, which is
// the limit `previewThemeCss` was caught by when a `background-image` on the
// wrong element passed every string test and rendered in no browser at all.
//
// `tests/e2e/chrome-tokens.spec.ts` is the half that reads a computed colour
// out of a real browser under a hostile author theme. Neither stands in for the
// other: this one names the mechanism, that one proves it reaches an element.
//
// EVERY ASSERTION HERE ASKS "WHICH RULE DECLARES THIS PROPERTY", AND THE FIRST
// TWO DRAFTS DID NOT.
//
// The first asked whether the selector list appeared anywhere in the file. It
// passed with the palette block stripped back to a bare `:root`, because the
// FORM block further down carries the same selector list and satisfied the
// search. The second asked `lastIndexOf(selector, indexOf("--skin-round"))`,
// which found the PALETTE block sitting earlier in the file and passed while
// the form block had lost its chrome class outright.
//
// Both are rule 29's shape: the sabotage ran, the suite stayed green, and the
// step that was meant to prove the guard proved nothing. Asking which selector
// encloses a given declaration is the question that cannot be satisfied by a
// different block, and each case below is verified against a sabotage of its
// own block.

const GLOBALS = readFileSync(
  join(process.cwd(), "src", "app", "globals.css"),
  "utf8",
);

/**
 * The selector list of the rule that declares a given property.
 *
 * Scans back from the declaration to its own opening brace, then back again to
 * whatever ended the text before it — a previous rule's brace, or a comment's
 * close. What is left is the selector list as written, newlines included, so an
 * assertion can ask whether THIS rule names the chrome class rather than
 * whether some rule somewhere does.
 *
 * @param property - the custom property, without its trailing colon.
 * @returns the selector list, trimmed.
 */
function selectorDeclaring(property: string): string {
  const declaredAt = GLOBALS.indexOf(`  ${property}:`);
  expect(declaredAt, `${property} is not declared at all`).toBeGreaterThan(-1);
  const opensAt = GLOBALS.lastIndexOf("{", declaredAt);
  const before = GLOBALS.slice(0, opensAt);
  // Each candidate carries its own length: `*/` is two characters, and slicing
  // one past it leaves a stray slash on the front of every selector.
  const ends = [
    { at: before.lastIndexOf("}"), length: 1 },
    { at: before.lastIndexOf("*/"), length: 2 },
  ];
  const previous = ends.reduce((best, end) => (end.at > best.at ? end : best));
  return GLOBALS.slice(previous.at + previous.length, opensAt).trim();
}

const CHROME = `.${CHROME_SCOPE}`;

describe("chrome tokens", () => {
  it("declares the app palette on a chrome island as well as the root", () => {
    expect(selectorDeclaring("--ink")).toBe(`:root,\n${CHROME}`);
    expect(selectorDeclaring("--field")).toBe(`:root,\n${CHROME}`);
  });

  it("carries the dark palette across to an island inside a dark document", () => {
    // The DESCENDANT form, because an island is never the root itself: without
    // it a control in a dark editor takes its raw colours from the light block
    // while the page around it is dark. `--surface-solid` is asked for rather
    // than `--ink` because both blocks declare `--ink`, and the first match
    // would be the light one.
    expect(selectorDeclaring("--surface-solid")).toBe(`:root,\n${CHROME}`);
    const dark = GLOBALS.slice(GLOBALS.indexOf('[data-theme="dark"]'));
    const opensAt = dark.indexOf("{");
    expect(dark.slice(0, opensAt).trim()).toBe(
      `[data-theme="dark"],\n[data-theme="dark"] ${CHROME}`,
    );
  });

  it("restates the composed properties, which a descendant cannot re-derive", () => {
    // THE ONE THAT MATTERS. `--surface` and `--bar` are composed from raw
    // values, and a descendant inherits the resolved result — so an island
    // restating only the raws goes on wearing whatever surface the author's
    // theme resolved at `:root`. These must be declared by the same rule that
    // names the chrome class, which is what makes them re-resolve on the
    // island. `ROOT_COMPOSED` in the actors feature is the same hazard from the
    // other side, and a third composed property has to appear in both places.
    expect(selectorDeclaring("--surface")).toBe(`:root,\n${CHROME}`);
    expect(selectorDeclaring("--bar")).toBe(`:root,\n${CHROME}`);
  });

  it("gives an island the design's own form tokens, not the author's skin", () => {
    // A skin writes its form tokens at `SKIN_SCOPE`, which encloses the
    // controls in the editor. Without the chrome class on the block declaring
    // these, an author choosing `comic` would put a heavy edge and a hard
    // shadow on every button in the workbench.
    expect(selectorDeclaring("--skin-round")).toBe(`:root,\n${CHROME}`);
    expect(selectorDeclaring("--skin-border-style")).toBe(`:root,\n${CHROME}`);
  });

  it("keeps the chrome declarations unlayered", () => {
    // An unlayered rule beats every layered one regardless of specificity. The
    // author's theme arrives unlayered, and although it targets `:root` — a
    // different element, so it cannot fight these — putting the chrome tokens
    // inside a Tailwind layer would lose them to any unlayered rule that DID
    // reach the island. `globals.css` declares no `@layer` blocks of its own;
    // this asserts that stays true rather than trusting it.
    expect(GLOBALS).not.toMatch(/^@layer\s/m);
  });
});
