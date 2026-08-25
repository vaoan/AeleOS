/**
 * Types for the source-byte gate.
 *
 * The gate itself is plain `.mjs` so it can run as a CLI without a build step
 * or a TypeScript loader, matching `check-contrast.mjs` and
 * `check-doc-freshness.mjs`. This declaration exists so its tests can be
 * written in TypeScript and still typecheck.
 */

/**
 * Every text file that could reach a commit — tracked, plus untracked files
 * git would not ignore, minus anything git ignores.
 *
 * @param cwd - the repository to ask. Defaults to the process's directory.
 * @returns repository-relative paths that exist, slash-separated as git reports
 *   them.
 * @throws whatever `git` throws when it is absent or the directory is not a
 *   repository. A gate that cannot enumerate must not report success.
 */
export declare function textFiles(cwd?: string): string[];

/**
 * Whether a file's text carries a control character other than tab, newline or
 * carriage return.
 *
 * @param text - a file's contents.
 * @returns true when it holds one.
 */
export declare function hasControl(text: string): boolean;
