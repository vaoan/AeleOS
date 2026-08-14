import { describe, expect, it } from "vitest";

/**
 * Whether this suite can reach the hosted project.
 *
 * @returns true when the project reference and an access token are present.
 */
const hasCreds = (): boolean =>
  Boolean(
    process.env.SUPABASE_PROJECT_REF && process.env.SUPABASE_ACCESS_TOKEN,
  );

/**
 * Runs a read-only statement against the hosted project.
 *
 * Deliberately the **Management API** rather than a direct Postgres connection.
 * The pooler presents a self-signed chain, so connecting would mean either
 * pinning a CA this repository would have to keep current, or disabling
 * verification — and the credential that would travel over that unverified
 * channel is the database password. This endpoint is ordinary HTTPS with a
 * public certificate, authenticated by an access token, so nothing about the
 * test weakens the thing it is testing.
 *
 * @param sql - the statement to run.
 * @returns the rows it answered with.
 */
async function query<T>(sql: string): Promise<T[]> {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${process.env.SUPABASE_PROJECT_REF}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN as string}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    },
  );
  if (!response.ok) {
    throw new Error(
      `management API ${response.status}: ${await response.text()}`,
    );
  }
  return (await response.json()) as T[];
}

/**
 * These assertions live here, against the **hosted** project, for the same
 * reason `anon-function-grants.test.ts` does: `tests/db/` cannot make them.
 *
 * A Supabase project ships with default privileges granting `anon` and
 * `authenticated` everything on tables, sequences **and** functions in
 * `public`. The local CLI stack does not apply them, so a sequence is correctly
 * closed on a local database whether or not the schema revokes anything — and
 * the same assertion in `tests/db/` would pass while production stayed open.
 *
 * **This is a regression test for a real defect.** `person_number_seq` (0011)
 * was the first sequence this schema created, and it reached the live project
 * with `anon=rwU`. Measured, not theorised: as `anon`,
 * `select nextval('public.person_number_seq')` succeeded and returned 4.
 *
 * USAGE on that sequence lets anybody **burn person numbers**, and a number is
 * meant to mean something — #7 is the seventh person here, and low ones are to
 * be awarded for events and participation. A script advancing it a million
 * times destroys the feature rather than inconveniencing it. SELECT alone
 * publishes the signup count.
 *
 * The fix was three statements — the default privileges in `0001`, an explicit
 * revoke in `0011`, and a sweep in `0010`. This is what proves they are still
 * there.
 */
describe.skipIf(!hasCreds())(
  "the hosted project refuses anon a sequence",
  () => {
    // The whole class, not the one instance. A sequence added by a later
    // migration without a revoke is the same bug, and asserting the category is
    // what makes this survive the next one.
    it("grants no sequence in public to anon or authenticated", async () => {
      const rows = await query<{ relname: string; relacl: string | null }>(
        `select c.relname, c.relacl::text as relacl
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'S'`,
      );

      // If this is empty the schema changed shape and the test below proves
      // nothing — fail rather than pass vacuously.
      expect(rows.length).toBeGreaterThan(0);

      const leaked = rows
        .filter((row) => /(^|,)(anon|authenticated)=/.test(row.relacl ?? ""))
        .map((row) => row.relname);
      expect(leaked).toEqual([]);
    });

    it("refuses anon nextval on the person number sequence", async () => {
      const [row] = await query<{ refused: boolean }>(
        `select (
         not has_sequence_privilege('anon', 'public.person_number_seq', 'USAGE')
         and not has_sequence_privilege('anon', 'public.person_number_seq', 'SELECT')
       ) as refused`,
      );
      expect(row?.refused).toBe(true);
    });
  },
);
