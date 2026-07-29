import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { admin, clientAs, closePool, newSub, withClaims } from "./helpers";

type Person = { sub: string; personRef: string; sonaId: string };

async function seed(visibility: "private" | "public"): Promise<Person> {
  const sub = newSub();
  const personRef = randomUUID();
  const a = admin();

  const { error: pErr } = await a.from("actors").insert({
    actor_ref: personRef,
    kind: "person",
    identity_sub: sub,
    handle: `p-${personRef.slice(0, 8)}`,
  });
  if (pErr) throw pErr;

  const { data: sona, error: sErr } = await a
    .from("actors")
    .insert({
      actor_ref: randomUUID(),
      kind: "fursona",
      owner_ref: personRef,
      handle: `s-${randomUUID().slice(0, 8)}`,
      display_name: "Test Sona",
      visibility,
    })
    .select("id")
    .single();
  if (sErr) throw sErr;

  return { sub, personRef, sonaId: sona.id as string };
}

let alice: Person;
let bob: Person;

beforeAll(async () => {
  alice = await seed("private");
  bob = await seed("public");
});

afterAll(async () => {
  await closePool();
});

describe("actors exposure boundary", () => {
  it("denies clients any access to the base actors table", async () => {
    const c = await clientAs(alice.sub);
    const { error } = await c.from("actors").select("id").limit(1);
    expect(error).not.toBeNull();
  });

  it("never exposes owner_ref through the public view", async () => {
    const c = await clientAs(alice.sub);
    const { error } = await c.from("actors_public").select("owner_ref");
    expect(error).not.toBeNull();
  });

  it("never exposes identity_sub through the public view", async () => {
    const c = await clientAs(alice.sub);
    const { error } = await c.from("actors_public").select("identity_sub");
    expect(error).not.toBeNull();
  });

  it("lets a person see their own private fursona", async () => {
    const c = await clientAs(alice.sub);
    const { data, error } = await c
      .from("actors_public")
      .select("id, display_name")
      .eq("id", alice.sonaId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("hides another person's private fursona", async () => {
    const c = await clientAs(bob.sub);
    const { data, error } = await c
      .from("actors_public")
      .select("id")
      .eq("id", alice.sonaId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("shows a public fursona to any authenticated caller", async () => {
    const c = await clientAs(alice.sub);
    const { data, error } = await c
      .from("actors_public")
      .select("id")
      .eq("id", bob.sonaId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("denies an anonymous caller the public view entirely", async () => {
    await expect(
      withClaims(null, async (c) =>
        c.query("select 1 from public.actors_public limit 1"),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});
