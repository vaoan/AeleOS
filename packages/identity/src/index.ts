/**
 * The identity contract every Furry Colombia app depends on.
 *
 * This package deliberately imports no framework — not Next, not React, and
 * above all not Clerk. The caller supplies a `getToken` function, so the code
 * here never learns which provider issued the token it forwards. That is what
 * keeps swapping the issuer a one-column `identity_sub` backfill rather than a
 * change to every app on the platform.
 */
export {
  createIdentityClient,
  type GetToken,
  type IdentityClientOptions,
} from "./client";
export { ensurePersonActor, getPersonActor, type PersonActor } from "./actors";
