/** Types for the temporary lessons-preserved gate. */

/** Where the pre-move files are kept. */
export declare const SNAPSHOT_DIR: string;

/**
 * A text's paragraphs, normalised for comparison. A paragraph is a
 * blank-line-separated block, or — within such a block — one list item
 * (a marker line plus its continuation lines); list markers, indentation
 * and wrapping are removed, whitespace collapsed, blank paragraphs dropped.
 * A marker counts only when whitespace follows it, so a decimal or a bold
 * lead at a line start is left alone and stays a continuation.
 *
 * @param text - Markdown.
 * @returns the normalised paragraphs, in order.
 */
export declare function paragraphs(text: string): string[];

/**
 * The snapshot paragraphs the corpus no longer holds, whitespace-insensitively.
 *
 * @param snapshot - the pre-move text.
 * @param corpus - every current Markdown file, concatenated.
 * @returns the missing paragraphs, normalised, in snapshot order.
 */
export declare function missingParagraphs(
  snapshot: string,
  corpus: string,
): string[];

/**
 * Every tracked or unignored Markdown file, concatenated.
 *
 * @param cwd - the repository.
 * @param exclude - which paths to leave out.
 * @returns the corpus.
 * @throws whatever `git` throws when it is absent.
 */
export declare function markdownCorpus(
  cwd: string,
  exclude: (path: string) => boolean,
): string;
