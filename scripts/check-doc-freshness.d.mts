/**
 * Types for the documentation freshness checker.
 *
 * The checker itself is plain `.mjs` so it can run as a CLI from a git hook
 * without a build step or a TypeScript loader. This declaration exists so its
 * tests can be written in TypeScript and still typecheck.
 */

/** An exported symbol's normalised implementation and documentation. */
export interface SymbolInfo {
  /** The symbol's source text, whitespace-collapsed. */
  code: string;
  /** The doc comment above it, whitespace-collapsed; empty when absent. */
  doc: string;
}

/** A symbol whose implementation moved while its documentation did not. */
export interface StaleFinding {
  /** The exported symbol's name. */
  name: string;
}

/**
 * Every exported top-level symbol, paired with its normalised implementation
 * and documentation.
 *
 * @param code - the file's source text.
 * @param fileName - the path, used only for TypeScript's diagnostics.
 * @returns a map of symbol name to its normalised code and doc text.
 */
export declare function extractSymbols(
  code: string,
  fileName: string,
): Map<string, SymbolInfo>;

/**
 * Symbols present in both versions whose code moved while their doc stood
 * still.
 *
 * @param before - symbols extracted from the earlier version.
 * @param after - symbols extracted from the current version.
 * @returns one entry per stale symbol.
 */
export declare function findStale(
  before: Map<string, SymbolInfo>,
  after: Map<string, SymbolInfo>,
): StaleFinding[];
