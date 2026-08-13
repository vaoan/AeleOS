import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { admin, clientAs, closePool, newSub } from "./helpers";

type Person = { sub: string; personRef: string; sonaRef: string };

/**
 * Seeds a person and one active PUBLIC fursona they own.
 *
 * Public rather than private, unlike the fixture in fursona-profiles: the
 * assertions below turn on what `actors_public` shows once the fursona is
 * deleted, and a private one would be hidden from strangers already, proving
 * nothing about the deletion.
 *
 * @returns the identity, its person ref, and the fursona's actor ref.
 */
async function seedOwnerWithPublicFursona(): Promise<Person> {
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
    visibility: "public",
  });
  if (sErr) throw sErr;

  return { sub, personRef, sonaRef };
}

let alice: Person;
let mallory: Person;

beforeAll(async () => {
  alice = await seedOwnerWithPublicFursona();
  mallory = await seedOwnerWithPublicFursona();
});

afterAll(async () => {
  await closePool();
});

describe("delete_fursona", () => {
  it("refuses to delete a fursona somebody else owns", async () => {
    const c = await clientAs(mallory.sub);
    const { error } = await c.rpc("delete_fursona", {
      p_actor_ref: alice.sonaRef,
    });
    expect(error?.message).toMatch(/fursona not found/i);
    // The same message a missing row gets. A distinct one would make this an
    // oracle for which actor_refs are real.
    expect(error?.message).not.toMatch(/owner|permission|belongs/i);
  });

  it("marks the caller's own fursona deleted, keeping the handle", async () => {
    const c = await clientAs(alice.sub);
    const { error } = await c.rpc("delete_fursona", {
      p_actor_ref: alice.sonaRef,
    });
    expect(error).toBeNull();

    const { data } = await admin()
      .from("actors")
      .select("status, handle")
      .eq("actor_ref", alice.sonaRef)
      .single();
    expect(data?.status).toBe("deleted");
    // The row and its handle survive. That is the whole reason delete is soft:
    // freeing the handle would let somebody register a retired fursona's name.
    expect(data?.handle).toBeTruthy();
  });

  // Consequence 1 of Decision 3. 0011 already hides it from strangers, because
  // its public branch requires status = 'active'. The owner branches did not.
  it("stops the owner seeing it through actors_public", async () => {
    const c = await clientAs(alice.sub);
    const { data, error } = await c
      .from("actors_public")
      .select("actor_ref")
      .eq("actor_ref", alice.sonaRef);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  // A suspended fursona must still be visible to its owner. Deleting is a
  // choice; being sanctioned is not, and somebody has to be able to see it.
  it("still shows the owner a suspended fursona", async () => {
    const other = await seedOwnerWithPublicFursona();
    const { error: upErr } = await admin()
      .from("actors")
      .update({ status: "suspended" })
      .eq("actor_ref", other.sonaRef);
    if (upErr) throw upErr;

    const c = await clientAs(other.sub);
    const { data } = await c
      .from("actors_public")
      .select("actor_ref")
      .eq("actor_ref", other.sonaRef);
    expect(data).toHaveLength(1);
  });

  // Consequence 2. This is what /api/actors/mine serves, so it is the one place
  // this phase changes something a consuming app can observe.
  it("stops it arriving in my_actors", async () => {
    const c = await clientAs(alice.sub);
    const { data, error } = await c.rpc("my_actors");
    expect(error).toBeNull();
    const refs = (data as { actor_ref: string }[]).map((r) => r.actor_ref);
    expect(refs).not.toContain(alice.sonaRef);
    // The person's own row still arrives; only the deleted fursona left.
    expect(refs).toContain(alice.personRef);
  });

  // Consequence 3, which 0011 already gets right and must not be "fixed": a
  // deleted fursona keeps consuming quota, or deleting becomes a way to buy
  // allowance back and the sanction-evasion path reopens.
  it("keeps occupying its owner's quota", async () => {
    const { data } = await admin()
      .from("actors")
      .select("actor_ref")
      .eq("owner_ref", alice.personRef)
      .eq("kind", "fursona");
    expect(data).toHaveLength(1);
  });

  // Should pass without new code: 0007's can_act_as already tests
  // status = 'active'. Here to catch a future edit that loosens it.
  it("cannot be acted as", async () => {
    const c = await clientAs(alice.sub);
    const { data, error } = await c.rpc("can_act_as", {
      target: alice.sonaRef,
    });
    expect(error).toBeNull();
    expect(data).toBe(false);
  });

  it("cannot be edited afterwards", async () => {
    const c = await clientAs(alice.sub);
    const { error } = await c.rpc("update_fursona", {
      p_actor_ref: alice.sonaRef,
      p_display_name: "after",
      p_avatar_url: null,
      p_visibility: "private",
    });
    expect(error?.message).toMatch(/fursona not found/i);
  });

  it("cannot be deleted twice", async () => {
    const c = await clientAs(alice.sub);
    const { error } = await c.rpc("delete_fursona", {
      p_actor_ref: alice.sonaRef,
    });
    expect(error?.message).toMatch(/fursona not found/i);
  });
});
