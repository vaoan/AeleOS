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

/**
 * Reads every `.jsonl` in a directory.
 *
 * @param dir - the log directory.
 * @returns every entry, in file then line order.
 * @throws when the directory does not exist.
 */
export declare function readLog(dir: string): LogEntry[];
