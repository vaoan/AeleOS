/**
 * Whether a change introduces a canvas the app did not have before.
 *
 * **The frame-cost suite is expensive and almost always answers the same
 * thing.** It drives a real browser through every canvas at the top of both
 * dials, twice each, which is minutes on a shared runner — paid on every pull
 * request, including ones that touch a migration or a translation. The
 * regressions it exists to catch have all arrived the same way: a batch of new
 * canvases, written together and reviewed by eye. So it runs when a canvas is
 * ADDED, and otherwise steps aside.
 *
 * **A new canvas is not the only way a frame gets slower, so it is not the only
 * trigger.** Adding one was the first rule here, and the gap it left was named
 * on the way in: an extra pass in the aurora or a wider stroke in the honeycomb
 * adds no key to the table and would have sailed past. The suite now also runs
 * when the code that DRAWS a canvas changes, which is the other half of the
 * same question and closes it.
 *
 * The names are read out of `CANVAS_SLOTS` rather than out of a list kept
 * beside it, for the reason that table exists: it is the one place a canvas is
 * declared, and anything else would need to be remembered. {@link isCanvasSource}
 * follows the same principle for the files — a pattern rather than a list, so a
 * module added next to the others is watched without anybody adding it here.
 */

/**
 * The canvas names declared in a copy of `canvas-slots.ts`.
 *
 * Parsed rather than imported, because the two sides being compared are two
 * VERSIONS of the same module — one of which is a string pulled out of git and
 * has no file to import. A regex is enough and stays enough: the table is an
 * object literal of `name: number` pairs by construction, and a name that
 * stopped matching would be reported as removed-and-added, which fails safe by
 * running the suite.
 *
 * @param source - the contents of `canvas-slots.ts`.
 * @returns the canvas names, in the order they appear, with none repeated.
 * @throws when the file has no `CANVAS_SLOTS` table, which means this parser
 * has been pointed at the wrong file or the table has been renamed — either
 * way, silently reporting "no canvases" would disable the suite for ever.
 */
export function canvasNames(source) {
  const start = source.indexOf("CANVAS_SLOTS");
  if (start === -1) {
    throw new Error("canvas-slots.ts has no CANVAS_SLOTS table to read");
  }
  const opening = source.indexOf("{", start);
  const closing = source.indexOf("} as const", opening);
  if (opening === -1 || closing === -1) {
    throw new Error("CANVAS_SLOTS is not the object literal this expects");
  }
  const table = source.slice(opening, closing);
  // `name: 3,` or `"name": 3,` — the count is not read, only the key. Comments
  // in the table are full lines or `/** … */` blocks and contain no such pair
  // followed by a digit, so they do not match.
  const found = table.matchAll(/^\s*"?([a-z][\w-]*)"?\s*:\s*\d+\s*,/gim);
  return [...new Set([...found].map((match) => match[1]))];
}

/**
 * The canvases present after a change and absent before it.
 *
 * @param before - `canvas-slots.ts` as it is on the base branch.
 * @param after - `canvas-slots.ts` as it is on this branch.
 * @returns the added names, empty when nothing was added. A REMOVED canvas is
 * not an addition and does not appear: deleting one cannot make the suite
 * slower, and the suite reads the table it is given.
 */
export function addedCanvases(before, after) {
  const had = new Set(canvasNames(before));
  return canvasNames(after).filter((name) => !had.has(name));
}

/**
 * Whether a changed file is one that decides what a canvas costs to draw.
 *
 * **A pattern rather than a list of paths**, and that is the point: every
 * module in this family is named for it — `nebula-canvas`, `canvas-field`,
 * `canvas-motion`, `canvas-raster`, `canvas-resolution`, `canvas-slots`,
 * `nebula-noise` — so a new one is watched the moment it is written. A list
 * would have to be edited by the same person who forgot to measure, which is
 * the failure this whole check exists to survive.
 *
 * Test files match too. Running the suite because its own spec changed is
 * correct, and running it because a unit test beside the renderer changed is a
 * few wasted minutes in the direction that cannot hide a regression.
 *
 * @param path - a repository-relative path, as `git diff --name-only` prints.
 * @returns whether a change to it should run the frame-cost suite.
 */
export function isCanvasSource(path) {
  const clean = path.trim().replaceAll("\\", "/");
  if (!clean.startsWith("apps/hub/")) return false;
  return /(^|\/)(canvas|nebula)[\w.-]*\.(ts|tsx)$/.test(clean);
}

/**
 * The changed files that decide what a canvas costs to draw.
 *
 * @param changed - every path the change touches.
 * @returns those worth re-measuring for, sorted, with blanks dropped.
 */
export function touchedCanvasSources(changed) {
  return changed.filter((path) => path.trim() && isCanvasSource(path)).sort();
}
