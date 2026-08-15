/**
 * Reports whether this change adds a canvas, for the `canvas` CI job.
 *
 * Writes `added=true` or `added=false` on stdout in the `KEY=value` shape
 * GitHub Actions reads from `$GITHUB_OUTPUT`, plus a line of prose on stderr so
 * the log says which way it went and why. A job that silently does nothing is
 * indistinguishable from one that is broken.
 *
 * **It fails OPEN.** Anything it cannot work out — no base commit, a file that
 * will not parse, a git invocation that errors — reports `true` and runs the
 * suite. The cost of being wrong that way is a few minutes of runner time; the
 * cost of being wrong the other way is a canvas shipped at two seconds a frame
 * with a green tick beside it.
 *
 * Usage: `node scripts/canvas-added.mjs <base-sha>`
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import process from "node:process";
import { addedCanvases } from "./canvas-additions.mjs";

/** Where the table lives, relative to the repository root. */
const TABLE = "apps/hub/src/shared/domain/canvas-slots.ts";

/**
 * Announces the decision and exits.
 *
 * @param added - whether the suite should run.
 * @param because - the reason, for the log.
 * @returns never; the process exits.
 */
function decide(added, because) {
  process.stdout.write(`added=${added}\n`);
  process.stderr.write(
    `${added ? "Running" : "Skipping"} the canvas frame-cost suite: ${because}\n`,
  );
  process.exit(0);
}

const base = process.argv[2]?.trim();
// A zero sha is what GitHub sends for the first push to a branch, and an empty
// string is what it sends when there is no base at all.
if (!base || /^0+$/.test(base)) {
  decide(true, "no base commit to compare against");
}

let before;
try {
  before = execFileSync("git", ["show", `${base}:${TABLE}`], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
} catch {
  // The table did not exist at the base, or the commit is unreachable. Either
  // way every canvas is new as far as this can tell.
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
    : "no canvas was added by this change",
);
