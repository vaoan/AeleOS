/**
 * Summarises `.claude/instructions-log/*.jsonl` into the numbers the
 * instruction-architecture spec is judged by: instruction tokens per session,
 * split by load reason and by file.
 *
 * Tokens are `ceil(bytes / 3)`, the factor the installed CLI uses for this
 * model when it decides whether a memory file is large. It is an estimate of
 * the same shape the warning uses, not a tokenizer.
 *
 * Usage:
 *   node scripts/instructions-report.mjs [logDir]
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/** The CLI's own characters-per-token factor for this model family. */
const CHARS_PER_TOKEN = 3;

/**
 * Turns log entries into the report's numbers.
 *
 * @param entries - every line of every session's log.
 * @returns totals; an empty log answers zeros rather than NaN.
 */
export function summarise(entries) {
  const sessions = new Set(entries.map((entry) => entry.session));
  const byReason = {};
  const byFileMap = new Map();
  let total = 0;
  for (const entry of entries) {
    const tokens =
      entry.bytes < 0 ? 0 : Math.ceil(entry.bytes / CHARS_PER_TOKEN);
    total += tokens;
    byReason[entry.reason] = (byReason[entry.reason] ?? 0) + tokens;
    const held = byFileMap.get(entry.file) ?? {
      file: entry.file,
      tokens: 0,
      sessions: new Set(),
    };
    held.tokens += tokens;
    held.sessions.add(entry.session);
    byFileMap.set(entry.file, held);
  }
  const byFile = [...byFileMap.values()]
    .map((held) => ({
      file: held.file,
      tokens: held.tokens,
      sessions: held.sessions.size,
    }))
    .sort((a, b) => b.tokens - a.tokens || a.file.localeCompare(b.file));
  return {
    sessions: sessions.size,
    tokensPerSession:
      sessions.size === 0 ? 0 : Math.round(total / sessions.size),
    byReason,
    byFile,
  };
}

/**
 * Reads every `.jsonl` in a directory, tolerating a malformed line or a
 * directory that does not exist yet.
 *
 * @param dir - the log directory.
 * @returns every entry that parsed as JSON, in file then line order, and how
 *   many lines were present but failed to parse.
 * @throws whatever `readdirSync` throws other than `ENOENT` — for instance
 *   `ENOTDIR` when `dir` names a file rather than a directory. A gate that
 *   cannot enumerate its input must not silently report zero.
 */
function readLogInternal(dir) {
  let names;
  try {
    names = readdirSync(dir);
  } catch (error) {
    if (error?.code === "ENOENT") return { entries: [], skipped: 0 };
    throw error;
  }
  const entries = [];
  let skipped = 0;
  for (const name of names.filter((n) => n.endsWith(".jsonl")).sort()) {
    for (const line of readFileSync(path.join(dir, name), "utf8").split("\n")) {
      if (line.trim() === "") continue;
      try {
        entries.push(JSON.parse(line));
      } catch {
        skipped += 1;
      }
    }
  }
  return { entries, skipped };
}

/**
 * Reads every `.jsonl` in a directory.
 *
 * @param dir - the log directory.
 * @returns every entry that parsed, in file then line order; `[]` when `dir`
 *   does not exist. A line that fails to parse as JSON is silently skipped —
 *   see {@link readLogReport} to also learn how many were.
 * @throws whatever `readdirSync` throws other than `ENOENT` (see
 *   {@link readLogReport}).
 */
export function readLog(dir) {
  return readLogInternal(dir).entries;
}

/**
 * Reads every `.jsonl` in a directory, also reporting how much was skipped.
 *
 * @param dir - the log directory.
 * @returns the entries {@link readLog} would answer, plus `skipped`: the
 *   count of lines that were present but did not parse as JSON.
 * @throws whatever `readdirSync` throws other than `ENOENT` — for instance
 *   `ENOTDIR` when `dir` names a file rather than a directory.
 */
export function readLogReport(dir) {
  return readLogInternal(dir);
}

/**
 * Lays the summary out as the table the CLI prints.
 *
 * Kept apart from `main` so the one branch that is otherwise unreachable by
 * a test — the skipped-lines footer — is a pure function of its inputs.
 *
 * @param summary - what {@link summarise} answered.
 * @param skipped - how many log lines failed to parse; the footer is printed
 *   only when it is above zero, so a clean log prints nothing about it.
 * @returns the report text, newline-terminated.
 */
export function render(summary, skipped = 0) {
  const lines = [
    `sessions: ${summary.sessions}`,
    `instruction tokens per session: ${summary.tokensPerSession}`,
    "",
    "by reason:",
    ...Object.entries(summary.byReason).map(
      ([reason, tokens]) => `  ${tokens}\t${reason}`,
    ),
    "",
    "by file (tokens, sessions):",
    ...summary.byFile.map(
      (row) => `  ${row.tokens}\t${row.sessions}\t${row.file}`,
    ),
  ];
  if (skipped > 0) lines.push("", `skipped malformed lines: ${skipped}`);
  return lines.join("\n") + "\n";
}

/** Prints the summary as a table. */
function main() {
  const dir =
    process.argv[2] ?? path.join(process.cwd(), ".claude", "instructions-log");
  const { entries, skipped } = readLogReport(dir);
  process.stdout.write(render(summarise(entries), skipped));
}

if (process.argv[1]?.endsWith("instructions-report.mjs")) main();
