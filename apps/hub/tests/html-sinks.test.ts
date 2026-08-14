import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * Every source file under `src`.
 *
 * @param dir - where to start.
 * @returns absolute paths.
 */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(entry) ? [path] : [];
  });
}

/**
 * Every way a string can become markup or script in this app.
 *
 * `dangerouslySetInnerHTML` is React's; the rest are the DOM's own, and they
 * are listed because reaching for one is exactly how a sink appears in a
 * codebase that had none.
 */
const SINKS = [
  "dangerouslySetInnerHTML",
  "innerHTML",
  "outerHTML",
  "insertAdjacentHTML",
  "document.write",
  "eval(",
  "new Function(",
];

/** The sinks that exist on purpose, and the file each lives in. */
const ALLOWED = new Map([["src/app/layout.tsx", 2]]);

describe("the app's HTML and script sinks", () => {
  // **This is the guard a content security policy would otherwise be standing
  // in for.** The policy's `script-src` carries `'unsafe-inline'`, because the
  // alternative is a per-request nonce that forces every page to render
  // dynamically — and the public pages are exactly the ones worth caching. So
  // the policy does not defend against injected inline script, and this does:
  // there are two sinks, both fed module constants with no interpolation, and a
  // third cannot appear without somebody deciding to add it here.
  //
  // A count rather than a ban, because the two that exist are load-bearing: they
  // set the theme before first paint, and doing that after hydration shows every
  // visitor a frame of the wrong palette.
  it("has only the sinks it is supposed to have", () => {
    const found = new Map<string, number>();
    for (const path of sources(join(process.cwd(), "src"))) {
      const body = readFileSync(path, "utf8");
      // Comments discuss these by name — including the ones explaining why the
      // two below are safe — so prose is stripped before counting.
      const code = body
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      const hits = SINKS.reduce(
        (total, sink) => total + code.split(sink).length - 1,
        0,
      );
      if (hits > 0) {
        found.set(relative(process.cwd(), path).split(sep).join("/"), hits);
      }
    }
    expect(Object.fromEntries(found)).toEqual(Object.fromEntries(ALLOWED));
  });
});
