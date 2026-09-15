/** Types for the instruction-log report. */
import type { LogEntry } from "./hook-log-instructions.d.mts";

/** What the report answers. */
export interface Summary {
  readonly sessions: number;
  /** Mean instruction tokens per session, rounded; 0 for an empty log. */
  readonly tokensPerSession: number;
  /** Total tokens by load reason across every session. */
  readonly byReason: Record<string, number>;
  /** Files by total tokens, descending, with how many sessions loaded each. */
  readonly byFile: ReadonlyArray<{
    file: string;
    tokens: number;
    sessions: number;
  }>;
}

/**
 * Turns log entries into the report's numbers.
 *
 * @param entries - every line of every session's log.
 * @returns totals; an empty log answers zeros rather than NaN.
 */
export declare function summarise(entries: readonly LogEntry[]): Summary;

/** What {@link readLogReport} answers. */
export interface LogReport {
  /** Every entry that parsed as JSON, in file then line order. */
  readonly entries: LogEntry[];
  /** How many lines were present but failed to parse as JSON. */
  readonly skipped: number;
}

/**
 * Reads every `.jsonl` in a directory.
 *
 * @param dir - the log directory.
 * @returns every entry that parsed, in file then line order; `[]` when `dir`
 *   does not exist. A line that fails to parse as JSON is silently skipped —
 *   see {@link readLogReport} to also learn how many were.
 * @throws whatever `readdirSync` throws other than `ENOENT` — for instance
 *   `ENOTDIR` when `dir` names a file rather than a directory.
 */
export declare function readLog(dir: string): LogEntry[];

/**
 * Reads every `.jsonl` in a directory, also reporting how much was skipped.
 *
 * @param dir - the log directory.
 * @returns the entries {@link readLog} would answer, plus `skipped`: the
 *   count of lines that were present but did not parse as JSON.
 * @throws whatever `readdirSync` throws other than `ENOENT`.
 */
export declare function readLogReport(dir: string): LogReport;
