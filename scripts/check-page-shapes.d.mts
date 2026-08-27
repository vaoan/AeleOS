/**
 * Types for the stored-page-shape census.
 *
 * The script itself is plain `.mjs` so it can run as a CLI without a build step
 * or a TypeScript loader, matching `check-schema-drift.mjs` and
 * `check-source-bytes.mjs`. This declaration exists so its tests can be written
 * in TypeScript and still typecheck.
 */

/** The shapes a stored page can be in. */
export type PageShape = "flat" | "columns" | "blocks" | "empty" | "unknown";

/** How many pages are in each shape, plus how many were read. */
export type ShapeCounts = Record<PageShape, number> & { total: number };

/** The shapes, in the order a report lists them. */
export declare const SHAPES: readonly PageShape[];

/**
 * Which shape one stored `sections` value is in.
 *
 * Shallow and structural on purpose: it must keep working after the parser it
 * audits has been deleted, which is the day this script matters most.
 *
 * @param sections - the raw `actor_profiles.sections` value, of any shape.
 * @returns the shape. `unknown` is never folded into another count.
 */
export declare function classifyPage(sections: unknown): PageShape;

/**
 * How many pages are in each shape.
 *
 * @param pages - every stored `sections` value.
 * @returns a count per shape plus the total, with every shape present at zero.
 */
export declare function tally(pages: readonly unknown[]): ShapeCounts;

/**
 * Reads every stored page and prints the census.
 *
 * @param password - the project's database password.
 * @returns the exit code, which is 0 whatever it finds: a stored shape is not
 *   a fault a pull request introduced.
 * @throws whatever `pg` throws when the database is unreachable. A census that
 *   cannot read must not print a total.
 */
export declare function run(password: string): Promise<number>;
