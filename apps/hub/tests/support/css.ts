import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * `globals.css`, read once for every suite that asks the stylesheet a question.
 *
 * Several do, and each used to read the file itself. That was harmless until
 * the selectors changed shape.
 */
export const GLOBALS_CSS = readFileSync(
  join(process.cwd(), "src", "app", "globals.css"),
  "utf8",
);

/**
 * The body of the rule whose selector list STARTS with the given selector.
 *
 * **This exists because `indexOf(":root {")` stopped being true.** The app's
 * tokens are declared for `:root` and for `.aeleos-chrome` in one rule, so the
 * editor can theme its own document without the controls inheriting an author's
 * palette — see `shared/domain/chrome.ts`. Three suites were each searching for
 * the literal `:root {`, and all three went red at once when that became
 * `:root,\n.aeleos-chrome {`.
 *
 * They went red rather than quiet, which is the good case: a parser looking for
 * a selector that no longer exists finds nothing and says so. The bad case is
 * the one this helper is meant to prevent next time — a search loose enough to
 * match the wrong rule and stay green while measuring something else.
 *
 * The match is anchored at a line start and admits either the end of the
 * selector list or a comma, so `:root` finds `:root,\n.aeleos-chrome` and does
 * not find `:root:not([data-page-theme="default"])`.
 *
 * @param selector - the first selector of the rule, as written.
 * @returns everything between that rule's braces.
 * @throws if no rule begins with that selector, because a caller asking about a
 *   block that is not there has already lost the thing it meant to assert.
 */
export function ruleBody(selector: string): string {
  const escaped = selector.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
  const found = new RegExp(`^${escaped}\\s*(,|\\{)`, "m").exec(GLOBALS_CSS);
  if (!found) {
    throw new Error(`no rule in globals.css begins with ${selector}`);
  }
  const opensAt = GLOBALS_CSS.indexOf("{", found.index);
  return GLOBALS_CSS.slice(opensAt, GLOBALS_CSS.indexOf("\n}", opensAt));
}
