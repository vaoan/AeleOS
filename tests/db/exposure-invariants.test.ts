import { afterAll, describe, expect, it } from "vitest";
import { closePool, withSuperuser } from "./helpers";

afterAll(async () => {
  await closePool();
});

/**
 * Catalog-level, not fixture-level.
 *
 * Every other exposure test names a specific relation, so it only proves the
 * relations that existed when it was written. This one asks the catalog
 * directly: does ANY relation in `public` let a client role read a linkability
 * column? It therefore keeps holding as a copying app adds its own tables —
 * which is exactly where the next leak comes from.
 */
const LINKABILITY_COLUMNS = ["owner_ref", "identity_sub", "author_person_ref"];
const CLIENT_ROLES = ["anon", "authenticated"];

type Leak = { relation: string; column: string; role: string };

const findLeaks = (): Promise<Leak[]> =>
  withSuperuser(async (c) => {
    const r = await c.query<Leak>(
      `select n.nspname || '.' || c.relname as relation,
              a.attname                     as column,
              r.rolname                     as role
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
         join pg_attribute a on a.attrelid = c.oid
        cross join unnest($2::text[]) as r(rolname)
        where n.nspname = 'public'
          and c.relkind in ('r', 'p', 'v', 'm', 'f')
          and a.attnum > 0
          and not a.attisdropped
          and a.attname = any($1::text[])
          and has_column_privilege(r.rolname, c.oid, a.attnum, 'SELECT')
        order by 1, 2, 3`,
      [LINKABILITY_COLUMNS, CLIENT_ROLES],
    );
    return r.rows;
  });

describe("linkability columns are unreachable by any client role", () => {
  it("finds no relation in `public` granting SELECT on them", async () => {
    await expect(findLeaks()).resolves.toEqual([]);
  });

  it("is actually looking at something", async () => {
    // Guards the test itself: if the query stopped matching any candidate
    // column the assertion above would pass vacuously forever.
    const candidates = await withSuperuser(async (c) => {
      const r = await c.query<{ n: string }>(
        `select count(*)::text as n
           from pg_class c
           join pg_namespace n on n.oid = c.relnamespace
           join pg_attribute a on a.attrelid = c.oid
          where n.nspname = 'public'
            and c.relkind in ('r', 'p', 'v', 'm', 'f')
            and a.attnum > 0
            and not a.attisdropped
            and a.attname = any($1::text[])`,
        [LINKABILITY_COLUMNS],
      );
      return Number(r.rows[0]?.n);
    });
    // actors.owner_ref, actors.identity_sub, comments.author_person_ref.
    expect(candidates).toBeGreaterThanOrEqual(3);
  });
});

/**
 * Every function in `public` that `anon` may execute.
 *
 * Catalog-level for the same reason as the leak query above: a test naming the
 * three functions it expects proves only what was true when it was written,
 * and the way this invariant breaks is a NEW function picking up execute by
 * default — which is what `public` grants unless a migration takes it away.
 *
 * @returns the function names, sorted.
 */
const anonExecutable = (): Promise<string[]> =>
  withSuperuser(async (c) => {
    const r = await c.query<{ proname: string }>(
      `select p.proname
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and has_function_privilege('anon', p.oid, 'execute')
        order by 1`,
    );
    return r.rows.map((row) => row.proname);
  });

describe("what anon may execute", () => {
  // `0010_client_grants.sql` is the readable index of the client surface and it
  // says 0012's two readers are the only exception. That sentence was true when
  // written and then quietly stopped being: a lookup function was added to 0009
  // without a revoke, and Postgres grants execute to `public` by default — so a
  // new function is exposed unless somebody remembers, and nothing complained.
  // 0009 has grown more of them since — `is_block_kind`, `is_container_mode`,
  // `is_space_count`, `validate_block` — and each had to remember separately.
  //
  // The list is exact rather than a subset check. A subset check passes when a
  // function is ADDED, which is the direction the mistake actually goes.
  it("is exactly the two public readers", async () => {
    expect(await anonExecutable()).toEqual(["public_fursona", "public_person"]);
  });
});
