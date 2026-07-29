import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { admin, clientAs, closePool, newSub, withSuperuser } from "./helpers";

const storedPersonRef = (id: string): Promise<string | undefined> =>
  withSuperuser(async (c) => {
    const r = await c.query<{ author_person_ref: string }>(
      "select author_person_ref from public.comments where id = $1",
      [id],
    );
    return r.rows[0]?.author_person_ref;
  });

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
    // The client never sends author_person_ref — 0007 derives it server-side.
    const c = await clientAs(alice.sub);
    const { error } = await c.from("comments").insert({
      body: "as my sona",
      author_actor_id: alice.sonaId,
    });
    expect(error).toBeNull();
  });

  it("allows commenting as the person themselves", async () => {
    const c = await clientAs(alice.sub);
    const { error } = await c.from("comments").insert({
      body: "as myself",
      author_actor_id: alice.personId,
    });
    expect(error).toBeNull();
  });

  it("refuses commenting as another person's fursona", async () => {
    const c = await clientAs(alice.sub);
    const { error } = await c.from("comments").insert({
      body: "impersonation",
      author_actor_id: bob.sonaId,
    });
    expect(error).not.toBeNull();
  });

  it("derives the accountability snapshot server-side", async () => {
    const c = await clientAs(alice.sub);
    const { data, error } = await c
      .from("comments")
      .insert({ body: "derived", author_actor_id: alice.sonaId })
      .select("id")
      .single();
    if (error) throw error;

    // Privileged read: author_person_ref is revoked from every client role.
    await expect(storedPersonRef(data.id as string)).resolves.toBe(
      alice.personRef,
    );
  });

  it("refuses a forged accountability snapshot", async () => {
    // 0007 removed author_person_ref from the client's INSERT column grant,
    // so a forged snapshot is now refused by privilege — before RLS, and
    // before the trigger would have corrected it.
    const c = await clientAs(alice.sub);
    const { error } = await c.from("comments").insert({
      body: "blame bob",
      author_actor_id: alice.sonaId,
      author_person_ref: bob.personRef,
    });
    expect(error).not.toBeNull();
  });

  it("overwrites a supplied author_person_ref rather than trusting it", async () => {
    // The privilege revoke above is the outer layer; this is the inner one.
    // Run as a role that CAN write the column while carrying alice's claims,
    // and prove the trigger discards the supplied value. An app that copies
    // the pattern and re-grants the column still cannot forge a snapshot.
    const stored = await withSuperuser(async (c) => {
      await c.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: alice.sub, role: "authenticated" }),
      ]);
      const r = await c.query<{ author_person_ref: string }>(
        `insert into public.comments (body, author_actor_id, author_person_ref)
         values ('trigger corrects me', $1, $2)
         returning author_person_ref`,
        [alice.sonaId, bob.personRef],
      );
      return r.rows[0]?.author_person_ref;
    });
    expect(stored).toBe(alice.personRef);
    expect(stored).not.toBe(bob.personRef);
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
    // service_role carries no `sub`, so the derive trigger has nothing to
    // derive and the explicit value stands — the import/backfill path.
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
      .insert({ body: "mine", author_actor_id: alice.sonaId })
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

  it("lets the author delete their own comment", async () => {
    const author = await clientAs(alice.sub);
    const { data, error: insErr } = await author
      .from("comments")
      .insert({ body: "delete me", author_actor_id: alice.sonaId })
      .select("id")
      .single();
    if (insErr) throw insErr;

    const { data: deleted, error } = await author
      .from("comments")
      .delete()
      .eq("id", data.id as string)
      .select("id");
    expect(error).toBeNull();
    expect(deleted).toHaveLength(1);
  });

  it("refuses to let another person delete the comment", async () => {
    const author = await clientAs(alice.sub);
    const { data, error: insErr } = await author
      .from("comments")
      .insert({ body: "not yours to delete", author_actor_id: alice.sonaId })
      .select("id")
      .single();
    if (insErr) throw insErr;

    const intruder = await clientAs(bob.sub);
    const { data: deleted, error } = await intruder
      .from("comments")
      .delete()
      .eq("id", data.id as string)
      .select("id");
    expect(error).toBeNull();
    expect(deleted).toHaveLength(0);

    // Still there.
    await expect(storedPersonRef(data.id as string)).resolves.toBe(
      alice.personRef,
    );
  });
});
