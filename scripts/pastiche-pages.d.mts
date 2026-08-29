/**
 * Types for the pastiche page data.
 *
 * The implementation is plain `.mjs`, matching `seed-pastiches.mjs` itself and
 * every other CLI-facing script in this directory: it runs as `node
 * scripts/seed-pastiches.mjs` with no build step, so it cannot be TypeScript.
 * This declaration exists so a test can import `PAGES` and typecheck it. The
 * block and theme shapes below are structural rather than imported from the
 * app, because `scripts/` may not depend on `apps/hub`.
 */

/** One seeded page: what it is called, what it holds, and how it looks. */
export interface PastichePage {
  /** The handle it is served at, under `/137/`. */
  handle: string;
  /** The display name the actor row carries. */
  displayName: string;
  /** The page's block tree, as `actor_profiles.sections` stores it. */
  blocks: unknown[];
  /** The page's theme, as `actor_profiles.theme` stores it. */
  theme: Record<string, unknown>;
  /** A hot-linked mark, never committed. */
  avatar: string;
}

/** The eleven social pastiches, in the order they are seeded. */
export declare const PAGES: PastichePage[];

/** One era look, as `era-looks.generated.json` stores it. */
export interface EraLook {
  /** The look's id, also used as its seeded handle. */
  id: string;
  /** The look's block tree, as `actor_profiles.sections` stores it. */
  blocks: unknown[];
  /** The look's theme, as `actor_profiles.theme` stores it. */
  theme: Record<string, unknown>;
}

/**
 * The five OS-era looks, read from `era-looks.generated.json` rather than
 * restated — see that file and `era-looks.ts` for why.
 */
export declare const ERA_LOOKS: EraLook[];

/** What each look is called on the page, and the mark it wears as an avatar. */
export declare const ERA_LOOKS_META: Record<
  string,
  { name: string; avatar: string }
>;
