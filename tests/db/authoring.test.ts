import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { admin, clientAs, closePool, newSub } from "./helpers";

type Person = {
  sub: string;
  personRef: string;
  personId: string;
  sonaId: string;
};

async function seed(): Promise<Person> {
  const sub = newSub();
  const personRef = randomUUID();
  const a = admin();

  const { data: p, error: pErr } = await a
    .from("actors")
    .insert({
      actor_ref: personRef,
      kind: "person",
      identity_sub: sub,
      handle: `p-${personRef.slice(0, 8)}`,
    })
    .select("id")
    .single();
  if (pErr) throw pErr;

  const { data: s, error: sErr } = await a
    .from("actors")
    .insert({
      actor_ref: randomUUID(),
      kind: "fursona",
      owner_ref: personRef,
      handle: `s-${randomUUID().slice(0, 8)}`,
    })
    .select("id")
    .single();
  if (sErr) throw sErr;

  return {
    sub,
    personRef,
    personId: p.id as string,
    sonaId: s.id as string,
  };
}

let alice: Person;
let bob: Person;

beforeAll(async () => {
  alice = await seed();
  bob = await seed();
});

afterAll(async () => {
  await closePool();
});

describe("authoring as an actor", () => {
  it("allows commenting as an owned fursona", async () => {
    const c = await clientAs(alice.sub);
    const { error } = await c.from("comments").insert({
      body: "as my sona",
      author_actor_id: alice.sonaId,
      author_person_ref: alice.personRef,
    });
    expect(error).toBeNull();
  });

  it("allows commenting as the person themselves", async () => {
    const c = await clientAs(alice.sub);
    const { error } = await c.from("comments").insert({
      body: "as myself",
      author_actor_id: alice.personId,
      author_person_ref: alice.personRef,
    });
    expect(error).toBeNull();
  });

  it("refuses commenting as another person's fursona", async () => {
    const c = await clientAs(alice.sub);
    const { error } = await c.from("comments").insert({
      body: "impersonation",
      author_actor_id: bob.sonaId,
      author_person_ref: alice.personRef,
    });
    expect(error).not.toBeNull();
  });

  it("refuses a forged accountability snapshot", async () => {
    const c = await clientAs(alice.sub);
    const { error } = await c.from("comments").insert({
      body: "blame bob",
      author_actor_id: alice.sonaId,
      author_person_ref: bob.personRef,
    });
    expect(error).not.toBeNull();
  });

  it("never returns author_person_ref to a client", async () => {
    const c = await clientAs(alice.sub);
    const { error } = await c.from("comments").select("author_person_ref");
    expect(error).not.toBeNull();
  });

  it("returns display columns to a client", async () => {
    const c = await clientAs(alice.sub);
    const { data, error } = await c
      .from("comments")
      .select("id, body, author_actor_id")
      .limit(1);
    expect(error).toBeNull();
    expect(data).not.toBeNull();
  });

  it("forbids mutating the accountability snapshot", async () => {
    const a = admin();
    const { data, error: insErr } = await a
      .from("comments")
      .insert({
        body: "snapshot target",
        author_actor_id: alice.sonaId,
        author_person_ref: alice.personRef,
      })
      .select("id")
      .single();
    if (insErr) throw insErr;

    const { error } = await a
      .from("comments")
      .update({ author_person_ref: bob.personRef })
      .eq("id", data.id as string);
    expect(error?.message).toContain("author_person_ref is immutable");
  });

  it("refuses to let another person edit the comment", async () => {
    const author = await clientAs(alice.sub);
    const { data, error: insErr } = await author
      .from("comments")
      .insert({
        body: "mine",
        author_actor_id: alice.sonaId,
        author_person_ref: alice.personRef,
      })
      .select("id")
      .single();
    if (insErr) throw insErr;

    const intruder = await clientAs(bob.sub);
    const { data: updated, error } = await intruder
      .from("comments")
      .update({ body: "hijacked" })
      .eq("id", data.id as string)
      .select("id");
    expect(error).toBeNull();
    expect(updated).toHaveLength(0);
  });
});
