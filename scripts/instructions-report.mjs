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
 * Reads every `.jsonl` in a directory.
 *
 * @param dir - the log directory.
 * @returns every entry, in file then line order.
 */
export function readLog(dir) {
  const entries = [];
  for (const name of readdirSync(dir)
    .filter((n) => n.endsWith(".jsonl"))
    .sort()) {
    for (const line of readFileSync(path.join(dir, name), "utf8").split("\n")) {
      if (line.trim() !== "") entries.push(JSON.parse(line));
    }
  }
  return entries;
}

/** Prints the summary as a table. */
function main() {
  const dir =
    process.argv[2] ?? path.join(process.cwd(), ".claude", "instructions-log");
  const summary = summarise(readLog(dir));
  console.log(`sessions: ${summary.sessions}`);
  console.log(`instruction tokens per session: ${summary.tokensPerSession}`);
  console.log("\nby reason:");
  for (const [reason, tokens] of Object.entries(summary.byReason))
    console.log(`  ${tokens}\t${reason}`);
  console.log("\nby file (tokens, sessions):");
  for (const row of summary.byFile)
    console.log(`  ${row.tokens}\t${row.sessions}\t${row.file}`);
}

if (process.argv[1]?.endsWith("instructions-report.mjs")) main();
