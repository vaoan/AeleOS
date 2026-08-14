import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ensurePersonActor, getPersonActor } from "../src/actors";

/** What a stubbed `rpc` call resolves to. */
type RpcResult = {
  data?: unknown;
  error?: { message: string } | null;
};

/** What a stubbed `.single()` call resolves to. */
type RowResult = {
  data?: unknown;
  error?: { code?: string; message: string } | null;
};

/**
 * A Supabase client stub that answers one `rpc` call.
 *
 * @param result - what `rpc` resolves to.
 * @returns a stub typed as a client.
 */
const rpcClient = (result: RpcResult) =>
  ({
    rpc: async () => ({ data: null, error: null, ...result }),
  }) as unknown as SupabaseClient;

/**
 * The query a `rowClient` was actually asked to run.
 *
 * Recorded rather than discarded: the mapped result is identical whether the
 * read hit the safe view or the base table, so nothing else can observe it.
 */
type RecordedQuery = {
  table?: string;
  projection?: string;
  filterColumn?: string;
  filterValue?: unknown;
};

/**
 * A Supabase client stub that answers one `.from().select().eq().single()`.
 *
 * @param result - what `single` resolves to.
 * @param query - filled in with the query the caller built, for assertion.
 * @returns a stub typed as a client.
 */
const rowClient = (result: RowResult, query: RecordedQuery = {}) =>
  ({
    from: (table: string) => {
      query.table = table;
      return {
        select: (projection: string) => {
          query.projection = projection;
          return {
            eq: (column: string, value: unknown) => {
              query.filterColumn = column;
              query.filterValue = value;
              return {
                single: async () => ({ data: null, error: null, ...result }),
              };
            },
          };
        },
      };
    },
  }) as unknown as SupabaseClient;

describe("ensurePersonActor", () => {
  it("returns the actor_ref the database derived", async () => {
    expect(await ensurePersonActor(rpcClient({ data: "act_abc" }))).toBe(
      "act_abc",
    );
  });

  it("throws when provisioning fails, naming the cause", async () => {
    await expect(
      ensurePersonActor(rpcClient({ error: { message: "RLS denied" } })),
    ).rejects.toThrow(/RLS denied/);
  });

  // Casting instead would hand the caller null typed as a string, and /me
  // would render an empty platform ID as though provisioning had succeeded.
  it("throws when neither a ref nor an error comes back", async () => {
    await expect(ensurePersonActor(rpcClient({ data: null }))).rejects.toThrow(
      /no actor_ref/i,
    );
    await expect(ensurePersonActor(rpcClient({ data: "" }))).rejects.toThrow(
      /no actor_ref/i,
    );
  });
});

describe("getPersonActor", () => {
  const row = {
    id: "11111111-1111-1111-1111-111111111111",
    actor_ref: "act_abc",
    handle: "aeleos",
    display_name: "Aeleos",
    avatar_url: null,
    visibility: "public",
  };

  it("maps the row into the client-safe shape", async () => {
    expect(await getPersonActor(rowClient({ data: row }), "act_abc")).toEqual({
      id: row.id,
      actorRef: "act_abc",
      handle: "aeleos",
      displayName: "Aeleos",
      avatarUrl: null,
      visibility: "public",
    });
  });

  // `actors_public` is the exposure boundary: `owner_ref` and `identity_sub`
  // are absent from it by construction. A read retargeted at the base table, or
  // a projection widened to name those columns, produces exactly the same
  // mapped object — so without this the leak is invisible to every other test
  // here. Migration 0003 revokes `actors` from `authenticated`, which makes the
  // retarget fail at runtime; the widened projection has no such backstop.
  it("reads the safe projection from the view, never the base table", async () => {
    const query: RecordedQuery = {};
    await getPersonActor(rowClient({ data: row }, query), "act_abc");
    expect(query.table).toBe("actors_public");
    expect(query.projection).toBe(
      "id, actor_ref, handle, display_name, avatar_url, visibility",
    );

    // Stated as a rule rather than only as a fixed string, so that widening the
    // projection again fails on WHAT was added rather than merely on the fact
    // that something was. `visibility` was added deliberately — a consuming app
    // needs it before offering a link to a page that might answer 404 — and it
    // is not a linkability column: it says nothing about which fursonas
    // somebody owns.
    expect(query.projection).not.toMatch(/owner_ref|identity_sub/);
  });

  // The column is NOT NULL in the view, so an absent value means the view
  // changed shape rather than that the data is missing. The safe reading of
  // "we do not know who may see this" is the most private one.
  it("falls back to private when the view answers without a visibility", async () => {
    const { visibility, ...withoutVisibility } = row;
    void visibility;
    const actor = await getPersonActor(
      rowClient({ data: withoutVisibility }),
      "act_abc",
    );
    expect(actor?.visibility).toBe("private");
  });

  // The filter is the only thing standing between a caller and somebody else's
  // actor. A hardcoded ref returns the wrong person with no error at all, and
  // no migration revokes anything that would stop it. Asserted with a ref that
  // differs from the stubbed row's, so pinning it to any constant fails.
  it("filters by the actor_ref it was given, not a fixed one", async () => {
    const query: RecordedQuery = {};
    await getPersonActor(rowClient({ data: row }, query), "act_zzz");
    expect(query.filterColumn).toBe("actor_ref");
    expect(query.filterValue).toBe("act_zzz");
  });

  it("defaults the nullable columns rather than yielding undefined", async () => {
    const sparse = { ...row, display_name: null, avatar_url: null };
    const actor = await getPersonActor(rowClient({ data: sparse }), "act_abc");
    expect(actor?.displayName).toBeNull();
    expect(actor?.avatarUrl).toBeNull();
  });

  // Absence and failure are different answers. Only "no rows" is absence.
  it("returns null when no row matches", async () => {
    expect(
      await getPersonActor(
        rowClient({ error: { code: "PGRST116", message: "no rows" } }),
        "act_abc",
      ),
    ).toBeNull();
  });

  it("throws on any error that is not no-rows", async () => {
    await expect(
      getPersonActor(
        rowClient({ error: { code: "42501", message: "permission denied" } }),
        "act_abc",
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("returns null when the row is absent without an error", async () => {
    expect(
      await getPersonActor(rowClient({ data: null }), "act_abc"),
    ).toBeNull();
  });

  // A truncated projection type-checks and renders blank. These three are
  // NOT NULL in the schema, so their absence means the view changed.
  it("throws when a NOT NULL column is missing from the projection", async () => {
    const truncated = { actor_ref: "act_abc", handle: "aeleos" };
    await expect(
      getPersonActor(rowClient({ data: truncated }), "act_abc"),
    ).rejects.toThrow(/incomplete/i);
  });
});
