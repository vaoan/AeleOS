import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { admin, closePool, newSub } from "./helpers";

afterAll(async () => {
  await closePool();
});

async function makePerson(): Promise<{ id: string; actorRef: string }> {
  const actorRef = randomUUID();
  const { data, error } = await admin()
    .from("actors")
    .insert({
      actor_ref: actorRef,
      kind: "person",
      identity_sub: newSub(),
      handle: `person-${actorRef.slice(0, 8)}`,
    })
    .select("id")
    .single();
  if (error) throw error;
  return { id: data.id as string, actorRef };
}

describe("actors shape", () => {
  it("accepts a well-formed person", async () => {
    const person = await makePerson();
    expect(person.id).toBeTruthy();
  });

  it("rejects a person carrying an owner_ref", async () => {
    const owner = await makePerson();
    const { error } = await admin()
      .from("actors")
      .insert({
        actor_ref: randomUUID(),
        kind: "person",
        identity_sub: newSub(),
        owner_ref: owner.actorRef,
        handle: `bad-${randomUUID().slice(0, 8)}`,
      });
    expect(error?.message).toContain("actors_person_shape");
  });

  it("rejects a person without an identity_sub", async () => {
    const { error } = await admin()
      .from("actors")
      .insert({
        actor_ref: randomUUID(),
        kind: "person",
        handle: `nosub-${randomUUID().slice(0, 8)}`,
      });
    expect(error?.message).toContain("actors_person_shape");
  });

  it("rejects a fursona without an owner_ref", async () => {
    const { error } = await admin()
      .from("actors")
      .insert({
        actor_ref: randomUUID(),
        kind: "fursona",
        handle: `orphan-${randomUUID().slice(0, 8)}`,
      });
    expect(error?.message).toContain("actors_fursona_shape");
  });

  it("rejects a fursona carrying an identity_sub", async () => {
    const owner = await makePerson();
    const { error } = await admin()
      .from("actors")
      .insert({
        actor_ref: randomUUID(),
        kind: "fursona",
        owner_ref: owner.actorRef,
        identity_sub: newSub(),
        handle: `bad2-${randomUUID().slice(0, 8)}`,
      });
    expect(error?.message).toContain("actors_fursona_shape");
  });

  // Within ONE OWNER. Handles are per-owner now, so the same two inserts under
  // two different people are both legal — `per-owner-handles.test.ts` asserts
  // that half.
  it("enforces case-insensitive handle uniqueness within an owner", async () => {
    const owner = await makePerson();
    const handle = `Sona-${randomUUID().slice(0, 8)}`;
    const first = await admin().from("actors").insert({
      actor_ref: randomUUID(),
      kind: "fursona",
      owner_ref: owner.actorRef,
      handle,
    });
    expect(first.error).toBeNull();

    const { error } = await admin().from("actors").insert({
      actor_ref: randomUUID(),
      kind: "fursona",
      owner_ref: owner.actorRef,
      handle: handle.toUpperCase(),
    });
    expect(error?.message).toContain("actors_fursona_handle_idx");
  });

  it("forbids changing kind", async () => {
    const person = await makePerson();
    const { error } = await admin()
      .from("actors")
      .update({ kind: "fursona" })
      .eq("id", person.id);
    expect(error?.message).toContain("actor kind is immutable");
  });

  it("forbids changing identity_sub", async () => {
    const person = await makePerson();
    const { error } = await admin()
      .from("actors")
      .update({ identity_sub: newSub() })
      .eq("id", person.id);
    expect(error?.message).toContain("identity_sub is immutable");
  });

  it("forbids giving a person an owner (non-transferable)", async () => {
    const person = await makePerson();
    const other = await makePerson();
    const { error } = await admin()
      .from("actors")
      .update({ owner_ref: other.actorRef })
      .eq("id", person.id);
    expect(error?.message).toContain("person actors are not transferable");
  });
});
