import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/** The repository root, from `apps/hub` where the suite runs. */
const ROOT = join(process.cwd(), "..", "..");

/** Directories that hold nobody's source. */
const SKIP = new Set([
  "node_modules",
  ".git",
  ".next",
  ".turbo",
  "dist",
  "coverage",
  "test-results",
  "playwright-report",
]);

/** The extensions worth reading. Anything else may legitimately be binary. */
const TEXT = /\.(ts|tsx|js|mjs|cjs|css|json|sql|md|ya?ml)$/;

/**
 * Every text file in the repository.
 *
 * @param dir - where to start.
 * @returns absolute paths.
 */
function textFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    if (SKIP.has(entry)) return [];
    const path = join(dir, entry);
    return statSync(path).isDirectory()
      ? textFiles(path)
      : TEXT.test(entry)
        ? [path]
        : [];
  });
}

/** Tab, newline, carriage return — the three a text file legitimately holds. */
const ALLOWED_CONTROL = new Set([9, 10, 13]);

/**
 * Whether a file's text carries a control character.
 *
 * **Compared by code point rather than matched by an escaped character class**,
 * which is not a style choice: the first version of this guard was written as
 * `/[\x00-\x08…]/` and the editing tool turned every escape into the byte it
 * named, so the file that was supposed to ban control characters contained six
 * of them. A number cannot be mangled that way.
 *
 * @param text - a file's contents.
 * @returns true when it holds one.
 */
function hasControl(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 32 && !ALLOWED_CONTROL.has(code)) return true;
  }
  return false;
}

describe("the repository's source bytes", () => {
  // **This is a regression test for a NUL byte that reached `main`.**
  //
  // `public-sections.tsx` carried `before:content-['—\00a0']` — an em dash and
  // a CSS-escaped non-breaking space. The `\00` was written as a literal NUL by
  // an editing tool that processed the escape, leaving `content: "—<NUL>a0"`.
  // Browsers substitute U+FFFD for a NUL in CSS, so every quote attribution on
  // a public page rendered a replacement glyph and the text `a0`.
  //
  // Nothing caught it, and nothing was ever going to. TypeScript is happy: a
  // JSX attribute is literal text and a NUL is a valid character in one.
  // Prettier reformats around it, ESLint parses it, and the rendered-output
  // tests assert on text content, which generated content is not part of. The
  // only visible symptom was `grep` calling the file binary — in the output of
  // an unrelated search, which is not a test.
  //
  // So the guard sits at the level the fault actually lived at: the bytes of
  // the file, across the whole repository rather than one app, because the same
  // tool writes the SQL and the Markdown and the same escape lands there too.
  it("contains no control characters", () => {
    const offenders = textFiles(ROOT)
      .filter((path) => hasControl(readFileSync(path, "utf8")))
      .map((path) => relative(ROOT, path).split(sep).join("/"));
    expect(offenders).toEqual([]);
  });
});
