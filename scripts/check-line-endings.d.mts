/**
 * Types for the line-endings gate.
 *
 * The gate itself is plain `.mjs` so it can run as a CLI without a build step
 * or a TypeScript loader, matching `check-source-bytes.mjs` and
 * `check-contrast.mjs`. This declaration exists so its tests can be written in
 * TypeScript and still typecheck.
 */

/** One tracked file, and the line endings git holds for it in the index. */
export interface EolEntry {
  /** Repository-relative path, slash-separated as git reports it. */
  readonly path: string;
  /**
   * Git's own `i/` value — `lf`, `crlf`, `mixed`, or `-text` for something it
   * treats as binary.
   */
  readonly index: string;
}

/**
 * What git reports about every tracked file's line endings.
 *
 * Asked of git rather than measured from bytes, because a shell pipeline may
 * convert line endings before any byte check sees them — see this gate's own
 * header for the measurement that established it.
 *
 * @param cwd - the repository to ask. Defaults to the process's directory.
 * @returns one entry per tracked file.
 * @throws whatever `git` throws when it is absent or the directory is not a
 *   repository.
 */
export declare function eolReport(cwd?: string): EolEntry[];

/**
 * The entries a commit must not carry.
 *
 * A binary file reports `-text` and is deliberately NOT a finding; only `crlf`
 * and `mixed` are refused.
 *
 * @param entries - as {@link eolReport} answers them.
 * @returns those whose index copy is `crlf` or `mixed`, in the order given.
 */
export declare function offenders(entries: readonly EolEntry[]): EolEntry[];
