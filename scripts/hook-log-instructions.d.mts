/**
 * Types for the `InstructionsLoaded` logging hook.
 *
 * The hook is plain `.mjs` so Claude Code can run it with no build step; this
 * declaration lets its test be TypeScript and still typecheck.
 */

/** The fields of the hook payload this script reads. */
export interface InstructionsLoadedPayload {
  readonly session_id: string;
  readonly cwd?: string;
  readonly hook_event_name?: string;
  /**
   * `session_start`, `nested_traversal`, `path_glob_match`, `include` or
   * `compact`. This is the field the CLI actually sends (measured 2026-09-15
   * on 2.1.272); the docs name it `reason` instead, which is read as a
   * fallback below.
   */
  readonly load_reason?: string;
  /** The documented spelling of {@link load_reason}. Read when it is absent. */
  readonly reason?: string;
  readonly memory_type?: string;
  readonly globs?: readonly string[];
  readonly trigger_file_path?: string;
  readonly parent_file_path?: string;
  readonly file_path: string;
}

/** One line of the log. */
export interface LogEntry {
  readonly at: string;
  readonly session: string;
  readonly reason: string;
  readonly file: string;
  /** Size in bytes, or `-1` when the file could not be measured. */
  readonly bytes: number;
}

/**
 * One log line from one hook payload.
 *
 * @param payload - the event as Claude Code sends it.
 * @param now - the timestamp to record.
 * @param sizeOf - how to measure a file. Defaults to `statSync(file).size`.
 * @returns the entry; `bytes` is `-1` when `sizeOf` throws.
 */
export declare function logEntry(
  payload: InstructionsLoadedPayload,
  now: Date,
  sizeOf?: (file: string) => number,
): LogEntry;

/**
 * Appends an entry to `<dir>/<session>.jsonl`, creating `dir` if needed.
 *
 * The session id is sanitised into a single path segment first — any
 * directory component is dropped and anything outside `[A-Za-z0-9._-]` is
 * replaced with `_` — so a crafted `session_id` can never write outside
 * `dir`.
 *
 * @param dir - the log directory.
 * @param entry - as {@link logEntry} built it.
 * @returns the path of the file written.
 */
export declare function appendEntry(dir: string, entry: LogEntry): string;
