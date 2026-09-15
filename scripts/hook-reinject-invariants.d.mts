/** Types for the compaction re-inject hook. */

/**
 * The invariants block of a root note: the text strictly between
 * `<!-- invariants:start -->` and `<!-- invariants:end -->`, trimmed.
 *
 * @param text - the whole `CLAUDE.md`.
 * @returns the block, or `""` when either marker is absent or out of order.
 */
export declare function invariantsFrom(text: string): string;
