import { describe, expect, it } from "vitest";
import { globSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Every source file a class list can live in. */
const SOURCES = globSync("src/**/*.{ts,tsx}", { cwd: process.cwd() });

/**
 * A quoted string, of any of the three kinds, newlines included.
 *
 * Class lists are wrapped by Prettier and by `better-tailwindcss`, so a
 * co-occurrence check reading one LINE would miss the wrapped case — which is
 * the case a long class list ends up in.
 */
const STRING_LITERAL =
  /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/gs;

/** The utility we own, as a whole word among other classes. */
const SURFACE = /(?:^|\s)surface(?:\s|$)/;

/**
 * An OUTWARD `outline-offset` utility, at any variant.
 *
 * The lookbehind refuses a leading `-`, which is how Tailwind spells a
 * negative: `-outline-offset-2` draws the ring inside and is exactly what
 * `@utility surface` already does, so it is not the thing being forbidden.
 */
const OUTWARD_OFFSET = /(?<![-\w])outline-offset-/;

/**
 * The source with its comments removed, tracked rather than pattern-matched.
 *
 * **This is not fastidiousness; the first version of this test failed on it.**
 * An apostrophe in ordinary prose — `element's` — opens a string literal to a
 * naive matcher, and the span it then swallows runs to the next apostrophe
 * several paragraphs away. In this repository, where the comments are long and
 * quote class names constantly, that reported a pairing in a file whose only
 * `outline-offset` is on an element carrying no `surface` at all. A regex
 * cannot know whether a quote is inside a comment; something that walks the
 * text can.
 *
 * @param source - a TypeScript or TSX file's contents.
 * @returns the same text with line and block comments removed and every
 * string literal left exactly as it was.
 */
function withoutComments(source: string): string {
  let out = "";
  let index = 0;
  let quote: string | undefined;
  while (index < source.length) {
    const character = source[index]!;
    if (quote !== undefined) {
      out += character;
      if (character === "\\") {
        out += source[index + 1] ?? "";
        index += 2;
        continue;
      }
      if (character === quote) quote = undefined;
      index += 1;
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      out += character;
      index += 1;
      continue;
    }
    if (character === "/" && source[index + 1] === "/") {
      while (index < source.length && source[index] !== "\n") index += 1;
      continue;
    }
    if (character === "/" && source[index + 1] === "*") {
      index += 2;
      while (
        index < source.length &&
        !(source[index] === "*" && source[index + 1] === "/")
      ) {
        index += 1;
      }
      index += 2;
      continue;
    }
    out += character;
    index += 1;
  }
  return out;
}

/** Every class list in a file, whitespace normalised. */
function classLists(file: string): string[] {
  const source = withoutComments(
    readFileSync(join(process.cwd(), file), "utf8"),
  );
  return [...source.matchAll(STRING_LITERAL)].map(([literal]) =>
    literal.replaceAll(/\s+/g, " "),
  );
}

describe("a surface's focus ring", () => {
  // **This is what makes `@utility surface`'s `outline-offset: -3px` hold, and
  // the cascade is NOT what makes it hold.** `focus-visible:outline-offset-2`
  // is a single-property utility with a variant, so it beats the utility on
  // both Tailwind's sort order and specificity — an element pairing the two
  // silently gets its ring back OUTSIDE its own border box, where `clip-path`
  // throws it away under any skin that cuts a shape, and a keyboard visitor
  // has no indicator at all there (WCAG 2.4.7).
  //
  // Four elements in this app carried exactly that pairing when the inset ring
  // was introduced — none of them reachable on a themed page, so the fault was
  // latent rather than live, and not one of them would ever have failed a
  // test. The offsets were removed and this is what keeps them removed.
  //
  // A source scan rather than a rendered assertion, in the spirit of
  // `html-sinks.test.ts`: what has to be true is a property of the CODEBASE —
  // that the pairing appears nowhere — and no amount of rendering the elements
  // that exist today says anything about the one somebody writes tomorrow.
  it("is never pushed back outside by an element's own utility", () => {
    const paired = SOURCES.flatMap((file) =>
      classLists(file)
        .filter(
          (literal) => SURFACE.test(literal) && OUTWARD_OFFSET.test(literal),
        )
        .map(() => file),
    );
    expect(paired).toEqual([]);
  });

  // Anti-vacuity, the shape `skins.test.ts` already uses. A scan that found no
  // files, or whose literal matcher stopped matching, would report an empty
  // list for the wrong reason — a filter over an empty set always passes.
  it("is checked against a codebase that actually has surfaces in it", () => {
    const withSurface = SOURCES.filter((file) =>
      classLists(file).some((literal) => SURFACE.test(literal)),
    );
    expect(withSurface.length).toBeGreaterThan(5);
  });

  // The other half of that: the matcher must still SEE an outward offset where
  // one exists. Several elements legitimately carry one — they are not
  // `surface`s, so the ring has nothing to be clipped by — and if the pattern
  // stopped matching, the pairing test above would go quietly green for ever.
  it("still recognises an outward offset where one is legitimate", () => {
    const outward = SOURCES.filter((file) =>
      classLists(file).some((literal) => OUTWARD_OFFSET.test(literal)),
    );
    expect(outward).not.toEqual([]);
  });
});
