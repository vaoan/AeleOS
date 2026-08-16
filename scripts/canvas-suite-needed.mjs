/**
 * Reports whether this change needs the canvas frame-cost suite.
 *
 * Writes `run=true` or `run=false` on stdout in the `KEY=value` shape GitHub
 * Actions reads from `$GITHUB_OUTPUT`, plus a line of prose on stderr so the log
 * says which way it went and why. A job that silently does nothing is
 * indistinguishable from one that is broken.
 *
 * **Two triggers, because there are two ways a frame gets slower.** A canvas
 * ADDED to `CANVAS_SLOTS` is the first — every regression this suite was built
 * for arrived that way, as a batch written together. A change to the code that
 * DRAWS one is the second, and it is the half the first rule missed: an extra
 * pass in the aurora or a wider stroke in the honeycomb adds no key to the
 * table.
 *
 * **It fails OPEN.** Anything it cannot work out — no base commit, a file that
 * will not parse, a git invocation that errors — reports `true` and runs the
 * suite. The cost of being wrong that way is a few minutes of runner time; the
 * cost of being wrong the other way is a canvas shipped at two seconds a frame
 * with a green tick beside it.
 *
 * Usage: `node scripts/canvas-suite-needed.mjs <base-sha>`
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import process from "node:process";
import { addedCanvases, touchedCanvasSources } from "./canvas-additions.mjs";

/** Where the table lives, relative to the repository root. */
const TABLE = "apps/hub/src/shared/domain/canvas-slots.ts";

/**
 * Announces the decision and exits.
 *
 * @param run - whether the suite should run.
 * @param because - the reason, for the log.
 * @returns never; the process exits.
 */
function decide(run, because) {
  process.stdout.write(`run=${run}\n`);
  process.stderr.write(
    `${run ? "Running" : "Skipping"} the canvas frame-cost suite: ${because}\n`,
  );
  process.exit(0);
}

/**
 * Runs a git command, or throws with enough context to fail open on.
 *
 * @param args - the arguments after `git`.
 * @returns the command's stdout.
 */
function git(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
}

const base = process.argv[2]?.trim();
// A zero sha is what GitHub sends for the first push to a branch, and an empty
// string is what it sends when there is no base at all.
if (!base || /^0+$/.test(base)) {
  decide(true, "no base commit to compare against");
}

// The renderer first: it is one git call and it settles most real changes.
let touched;
try {
  touched = touchedCanvasSources(
    git(["diff", "--name-only", `${base}...HEAD`]).split("\n"),
  );
} catch (error) {
  decide(true, `the changed files could not be listed (${String(error)})`);
}
if (touched.length > 0) {
  decide(true, `these decide what a canvas costs: ${touched.join(", ")}`);
}

// Nothing that draws a canvas changed. A canvas can still have been added by a
// change to the table alone — which `isCanvasSource` matches, so reaching here
// means the table is untouched too. Compared anyway rather than assumed: this
// is the cheap half, and the assumption is the kind that quietly stops holding.
let before;
try {
  before = git(["show", `${base}:${TABLE}`]);
} catch {
  decide(true, `${TABLE} could not be read at ${base}`);
}

let added;
try {
  added = addedCanvases(before, readFileSync(TABLE, "utf8"));
} catch (error) {
  decide(true, `the table could not be parsed (${String(error)})`);
}

decide(
  added.length > 0,
  added.length > 0
    ? `added ${added.join(", ")}`
    : "nothing that draws a canvas changed, and no canvas was added",
);
