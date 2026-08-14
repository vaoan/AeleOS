import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { admin, clientAs, closePool, newSub } from "./helpers";

type Person = { sub: string; personRef: string; sonaRef: string };

/**
 * Seeds a person and one private fursona they own, as the service role.
 *
 * Private on purpose: nothing in this file asserts anything about who else can
 * see the fursona, so the least-visible setting keeps the fixture from
 * implying otherwise.
 *
 * @returns the identity, its person ref, and the fursona's actor ref.
 */
async function seedPerson(): Promise<Person> {
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

let alice: Person;
let mallory: Person;

beforeAll(async () => {
  alice = await seedPerson();
  mallory = await seedPerson();
});

afterAll(async () => {
  await closePool();
});

describe("actor_profiles", () => {
  it("lets an owner read the profile row of a fursona they own", async () => {
    const { error } = await admin()
      .from("actor_profiles")
      .insert({ actor_ref: alice.sonaRef, sort_order: 1 });
    if (error) throw error;

    const c = await clientAs(alice.sub);
    const { data, error: readErr } = await c
      .from("actor_profiles")
      .select("actor_ref, sort_order, featured")
      .eq("actor_ref", alice.sonaRef);
    expect(readErr).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]?.featured).toBe(false);
  });

  // The whole point of the RLS. Ordering reveals which fursonas somebody has
  // and how they rank them, so it is not readable by every signed-in caller.
  it("hides another person's profile row", async () => {
    const c = await clientAs(mallory.sub);
    const { data, error } = await c
      .from("actor_profiles")
      .select("actor_ref")
      .eq("actor_ref", alice.sonaRef);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  // Asserted by re-reading as the owner rather than by the error, because a
  // policy that filters the row out reports success with zero rows affected.
  // What matters is that the value did not move.
  it("refuses a write to another person's profile row", async () => {
    const c = await clientAs(mallory.sub);
    await c
      .from("actor_profiles")
      .update({ featured: true })
      .eq("actor_ref", alice.sonaRef);

    const owner = await clientAs(alice.sub);
    const { data } = await owner
      .from("actor_profiles")
      .select("featured")
      .eq("actor_ref", alice.sonaRef);
    expect(data?.[0]?.featured).toBe(false);
  });
});

describe("ordering and pinning", () => {
  it("lets an owner set the order of their own fursona", async () => {
    const c = await clientAs(alice.sub);
    const { error } = await c.rpc("set_fursona_order", {
      p_actor_ref: alice.sonaRef,
      p_sort_order: 3,
    });
    expect(error).toBeNull();

    const { data } = await c
      .from("actor_profiles")
      .select("sort_order")
      .eq("actor_ref", alice.sonaRef);
    expect(data?.[0]?.sort_order).toBe(3);
  });

  // No profile row exists until somebody arranges something, so both functions
  // upsert. Requiring a row up front would mean a second write on every create
  // and a row for the majority who never reorder anything.
  it("creates the profile row on first use rather than requiring one", async () => {
    const fresh = await seedPerson();
    const c = await clientAs(fresh.sub);
    const { error } = await c.rpc("set_fursona_featured", {
      p_actor_ref: fresh.sonaRef,
      p_featured: true,
    });
    expect(error).toBeNull();

    const { data } = await c
      .from("actor_profiles")
      .select("featured")
      .eq("actor_ref", fresh.sonaRef);
    expect(data?.[0]?.featured).toBe(true);
  });

  it("refuses to order a fursona somebody else owns", async () => {
    const c = await clientAs(mallory.sub);
    const { error } = await c.rpc("set_fursona_order", {
      p_actor_ref: alice.sonaRef,
      p_sort_order: 99,
    });
    expect(error?.message).toMatch(/fursona not found/i);
  });

  it("refuses to pin a fursona somebody else owns", async () => {
    const c = await clientAs(mallory.sub);
    const { error } = await c.rpc("set_fursona_featured", {
      p_actor_ref: alice.sonaRef,
      p_featured: true,
    });
    expect(error?.message).toMatch(/fursona not found/i);
  });
});
