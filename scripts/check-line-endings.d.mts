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
   * Git's own `i/` value — `lf`, `crlf`, `mixed`, `none` for a file with no
   * line ending at all, or `-text` for a blob it classes as binary.
   */
  readonly index: string;
  /**
   * The `attr/` column verbatim — `text eol=lf`, `text=auto eol=lf`, `-text`
   * — or empty when no attribute applies to the path. Read beside `index`,
   * because `-text` means one thing under `text=auto` (git detected a binary)
   * and another under an explicit `text` (a text file with lone-CR endings).
   */
  readonly attr: string;
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
 * `crlf` and `mixed` are refused outright. `-text` is refused only when the
 * path carries an explicit `text` attribute — git was told the file is text
 * and still found no LF in it, which is a lone-CR file. Under `text=auto`,
 * `-text`, or no attribute at all, `-text` is git's own verdict on a real
 * binary and is deliberately NOT a finding.
 *
 * @param entries - as {@link eolReport} answers them.
 * @returns the refused entries, in the order given.
 */
export declare function offenders(entries: readonly EolEntry[]): EolEntry[];
