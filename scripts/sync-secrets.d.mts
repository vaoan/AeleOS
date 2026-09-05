/**
 * Types for the secrets-sync script's pure helpers.
 *
 * The script itself is plain `.mjs` so it can run as a CLI with no build
 * step, matching `check-source-bytes.mjs` and `check-contrast.mjs`. This
 * declaration exists so its tests can be written in TypeScript and still
 * typecheck.
 */

/**
 * Parses a `.secrets`- or `.env`-shaped text into a flat key/value map.
 *
 * Blank lines and lines starting with `#` are skipped. A line is split on its
 * FIRST `=` only, so a base64 value carrying its own `=` padding survives
 * intact. A key repeated later in the text overrides its earlier value, the
 * same behaviour `source`/dotenv give a file with a duplicate assignment.
 *
 * @param text - the file's contents.
 * @returns every assignment found.
 */
export declare function parseEnvAssignments(
  text: string,
): Record<string, string>;

/**
 * Builds `apps/hub/.env.local`'s text from `.env.example`'s own template,
 * with the four Clerk/Supabase values `.secrets` holds substituted in.
 *
 * Only the four mapped keys are ever touched — every comment, blank line and
 * other key (`AELEOS_ALLOWED_RETURN_ORIGINS`, `NEXT_PUBLIC_HUB_HOST`) passes
 * through from the example verbatim, so this can never clobber a deliberate
 * override such as the example's own documented "local stack instead" values.
 * A mapped key absent from `secrets` is left as the example's own placeholder
 * line, so a partial `.secrets` still produces a file that names exactly what
 * is missing rather than a half-written line.
 *
 * @param exampleText - `apps/hub/.env.example`'s own contents.
 * @param secrets - parsed `.secrets` content, from {@link parseEnvAssignments}.
 * @returns the full `.env.local` text.
 */
export declare function buildHubEnvLocal(
  exampleText: string,
  secrets: Record<string, string>,
): string;
