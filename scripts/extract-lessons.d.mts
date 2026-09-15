// scripts/extract-lessons.d.mts
/** Types for the one-shot lessons extraction. */

/** A convention bullet: its bold lead and its whole text. */
export interface Bullet {
  readonly lead: string;
  readonly body: string;
}

/** A numbered rule: its number, its bold lead and its whole text. */
export interface Rule {
  readonly number: number;
  readonly lead: string;
  readonly body: string;
}

/** The root note cut at its own headings. */
export interface RootParts {
  readonly overview: string;
  readonly conventions: readonly Bullet[];
  readonly history: string;
  readonly toolchainIntro: string;
  readonly rules: readonly Rule[];
  readonly afterRules: string;
}

/**
 * The root note cut into the parts the spec routes to different homes.
 *
 * @param text - the whole pre-move root `CLAUDE.md`.
 * @returns the parts; together they hold every line except the preamble and
 *   the boundary headings.
 * @throws when a boundary heading is missing.
 */
export declare function splitRoot(text: string): RootParts;

/**
 * A kebab-case filename stem for a lead sentence, at most 60 characters.
 *
 * @param lead - the bold lead.
 * @returns the stem.
 */
export declare function slug(lead: string): string;

/**
 * Writes every part to its home under `cwd`.
 *
 * @param parts - as {@link splitRoot} cut them.
 * @param cwd - the repository root.
 * @returns the files written, in order.
 */
export declare function writeParts(parts: RootParts, cwd: string): string[];
