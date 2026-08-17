/**
 * Which Supabase project the scripts in this directory are allowed to touch.
 *
 * **One home for the constant that must never be wrong.** Libra is in
 * production and has its own project; every rule in this repository about not
 * crossing credentials between them comes down to a single reference string
 * being right. It was written out in more than one script before this file
 * existed, and the next script would have copied it again.
 *
 * Nothing here reads the environment. A script importing {@link poolerUrl} can
 * supply a password and nothing else — not a host, not a reference, not a
 * whole DSN — so no variable, argument or stale shell can repoint it. That is
 * also why `--linked` is not used anywhere: it resolves the target through
 * `supabase/.temp/project-ref`, which is gitignored, absent on a runner, and
 * locally is mutable state a stray `supabase link` could aim elsewhere.
 */

/** The AeleOS project. Libra's production ref must never appear here. */
export const PROJECT_REF = "vmmpssydbrtkgvrlkijh";

/** What the Management API calls it, for scripts that verify before acting. */
export const PROJECT_NAME = "AeleOS";

/** Free-plan projects have no IPv4 on the direct host, so use the pooler. */
const POOLER_HOST = "aws-0-ca-central-1.pooler.supabase.com";
const POOLER_PORT = 5432;

/** Named separately so a log line can say where it went without the password. */
export const POOLER_DESCRIPTION = `${POOLER_HOST}:${POOLER_PORT}`;

/**
 * Builds the session-pooler connection string for AeleOS.
 *
 * The password is percent-encoded, so it may contain anything. Never log the
 * result: it carries the password whole.
 *
 * @param password - the project's database password.
 * @returns a `postgresql://` DSN for the AeleOS project and no other.
 */
export function poolerUrl(password) {
  return (
    `postgresql://postgres.${PROJECT_REF}:${encodeURIComponent(password)}` +
    `@${POOLER_HOST}:${POOLER_PORT}/postgres`
  );
}
