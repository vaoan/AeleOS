/**
 * Types for the cloud identity runner's exported pieces.
 *
 * The script itself is plain `.mjs` so it runs as a CLI with no build step,
 * like `sync-secrets.mjs`. This declaration exists so its tests can be
 * written in TypeScript and still typecheck. The contracts are stated in the
 * script's own TSDoc; these signatures only name the shapes.
 */

/** A Third-Party Auth entry as Supabase's Management API lists it. */
export interface ThirdPartyAuthProvider {
  type: string;
  oidc_issuer_url: string;
  [key: string]: unknown;
}

/** A Clerk user as the Backend API returns it. Only the id is relied on. */
export interface ClerkUser {
  id: string;
  [key: string]: unknown;
}

/**
 * The value of `KEY=value` in a `.secrets` text, trimmed, or `null` when the
 * key is absent. Only a line that STARTS with the key counts.
 */
export declare function readSecret(secrets: string, key: string): string | null;

/**
 * The Third-Party Auth entry the run must be checked against, or `undefined`:
 * by issuer when a domain is given, else the first Clerk-typed entry.
 */
export declare function findTrust(
  providers: ThirdPartyAuthProvider[],
  clerkDomain: string | null | undefined,
): ThirdPartyAuthProvider | undefined;

/**
 * A session token for `userId`, minted the way the instance allows — the
 * Backend API on development, a sign-in token consumed through the Frontend
 * API's native mode on production. Throws on every failure; never exits.
 */
export declare function mintSessionToken(
  secretKey: string,
  domain: string | null | undefined,
  userId: string,
): Promise<string>;

/**
 * Create a Clerk user for one run, hand it to `body`, and delete it however
 * `body` ends. Resolves to the status the run should report: the body's own,
 * or `1` when it threw. A failed delete is reported and changes nothing.
 * A failed creation throws, since nothing is owned yet.
 */
export declare function withTestUser(
  secretKey: string,
  email: string,
  body: (user: ClerkUser) => Promise<number>,
): Promise<number>;
