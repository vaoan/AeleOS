import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { admin, clientAs, closePool, newSub, withClaims } from "./helpers";

type Seed = { sub: string; personRef: string; sonaRef: string };

/**
 * Inserts a person with one owned fursona, as the service role.
 *
 * @returns the seeded identity and both actor refs.
 */
async function seed(): Promise<Seed> {
  const sub = newSub();
  const personRef = randomUUID();
  const sonaRef = randomUUID();
  const a = admin();

  const { error: pErr } = await a.from("actors").insert({
    actor_ref: personRef,
    kind: "person",
    identity_sub: sub,
    handle: `p-${personRef.slice(0, 8)}`,
  });
  if (pErr) throw pErr;

  const { error: sErr } = await a.from("actors").insert({
    actor_ref: sonaRef,
    kind: "fursona",
    owner_ref: personRef,
    handle: `s-${sonaRef.slice(0, 8)}`,
    visibility: "private",
  });
  if (sErr) throw sErr;

  return { sub, personRef, sonaRef };
}

let alice: Seed;
let bob: Seed;

beforeAll(async () => {
  alice = await seed();
  bob = await seed();
});

afterAll(async () => {
  await closePool();
});

describe("my_actors", () => {
  it("returns the caller's person and owned fursonas", async () => {
    const c = await clientAs(alice.sub);
    const { data, error } = await c.rpc("my_actors");
    expect(error).toBeNull();
    const refs = (data as { actor_ref: string }[]).map((r) => r.actor_ref);
    expect(refs).toContain(alice.personRef);
    expect(refs).toContain(alice.sonaRef);
  });

  it("lists the person row first", async () => {
    const c = await clientAs(alice.sub);
    const { data } = await c.rpc("my_actors");
    expect((data as { kind: string }[])[0]?.kind).toBe("person");
  });

  // The whole point of the function. A caller must never see another person's
  // actors, and a fursona is often the thing someone most wants kept separate.
  it("never returns another person's actors", async () => {
    const c = await clientAs(alice.sub);
    const { data } = await c.rpc("my_actors");
    const refs = (data as { actor_ref: string }[]).map((r) => r.actor_ref);
    expect(refs).not.toContain(bob.personRef);
    expect(refs).not.toContain(bob.sonaRef);
  });

  // The exposure boundary, restated at every new surface. A column absent from
  // the return type cannot leak through it.
  it("never exposes ownership columns", async () => {
    const c = await clientAs(alice.sub);
    const { data } = await c.rpc("my_actors");
    for (const row of data as Record<string, unknown>[]) {
      expect(row).not.toHaveProperty("owner_ref");
      expect(row).not.toHaveProperty("identity_sub");
    }
  });

  it("returns an empty list for a caller with no actors", async () => {
    const c = await clientAs(newSub());
    const { data, error } = await c.rpc("my_actors");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  // The sanction, carried without a rule of its own. The owner branch resolves
  // through current_person_ref(), which 0007 filters to active, so a suspended
  // person's fursonas match nothing; the person row still matches on
  // identity_sub, so they are told who they are rather than nothing at all.
  //
  // Written down because the whole design depends on an indirection: rewriting
  // the owner branch as an inline `select actor_ref from actors where
  // identity_sub = ... and kind = 'person'` — a plausible optimisation that
  // removes a function call — restores sanction evasion and breaks no other
  // test in this suite.
  it("returns only the person row for a suspended person, not their fursonas", async () => {
    const carol = await seed();
    const { error: sErr } = await admin()
      .from("actors")
      .update({ status: "suspended" })
      .eq("actor_ref", carol.personRef);
    expect(sErr).toBeNull();

    const c = await clientAs(carol.sub);
    const { data, error } = await c.rpc("my_actors");
    expect(error).toBeNull();
    const refs = (data as { actor_ref: string }[]).map((r) => r.actor_ref);
    expect(refs).toEqual([carol.personRef]);
    expect(refs).not.toContain(carol.sonaRef);
  });

  // Every security definer function in this schema revokes from PUBLIC before
  // granting, because Postgres grants EXECUTE to PUBLIC by default and on a
  // definer function that hands `anon` the definer's privileges. Asserted at
  // this surface too, in the same shape as actors-exposure and provisioning.
  it("denies an anonymous caller entirely", async () => {
    await expect(
      withClaims(null, async (c) =>
        c.query("select 1 from public.my_actors() limit 1"),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});
