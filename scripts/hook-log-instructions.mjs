/**
 * `InstructionsLoaded` hook: one JSON line per instruction file Claude Code
 * loads, so the cost of the instruction architecture is measured rather than
 * estimated.
 *
 * Claude Code runs this with the event payload on stdin (`session_id`,
 * `reason`, `file_path`, …) — see code.claude.com/docs/en/hooks. Output is
 * ignored for this event, so the hook only writes to
 * `.claude/instructions-log/<session_id>.jsonl`, which is gitignored.
 * `scripts/instructions-report.mjs` reads it back.
 *
 * It never fails the load: a hook that throws would turn a logging problem
 * into a missing instruction file, which is the opposite of its job.
 *
 * Usage (registered in `.claude/settings.json`):
 *   node scripts/hook-log-instructions.mjs < payload.json
 */
import { appendFileSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * One log line from one hook payload.
 *
 * @param payload - the event as Claude Code sends it on stdin.
 * @param now - the timestamp to record.
 * @param sizeOf - how to measure a file, given its path. Defaults to `statSync`.
 * @returns the entry to append. `bytes` is `-1` when `sizeOf` throws, because
 *   the load happened whether or not the file could be measured.
 */
export function logEntry(payload, now, sizeOf = (file) => statSync(file).size) {
  let bytes = -1;
  try {
    bytes = sizeOf(payload.file_path);
  } catch {
    bytes = -1;
  }
  return {
    at: now.toISOString(),
    session: payload.session_id,
    reason: payload.reason,
    file: payload.file_path,
    bytes,
  };
}

/**
 * Appends an entry to its session's log file, creating the directory on
 * first use.
 *
 * @param dir - the log directory.
 * @param entry - as {@link logEntry} built it.
 * @returns the path of the file written.
 */
export function appendEntry(dir, entry) {
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${entry.session}.jsonl`);
  appendFileSync(file, `${JSON.stringify(entry)}\n`);
  return file;
}

/** Reads the payload from stdin and logs it; never exits non-zero. */
async function main() {
  try {
    let raw = "";
    for await (const chunk of process.stdin) raw += chunk;
    const payload = JSON.parse(raw);
    const dir = path.join(
      payload.cwd ?? process.cwd(),
      ".claude",
      "instructions-log",
    );
    appendEntry(dir, logEntry(payload, new Date()));
  } catch (error) {
    console.error(
      `hook-log-instructions: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

if (process.argv[1]?.endsWith("hook-log-instructions.mjs")) await main();
