import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { admin, clientAs, closePool, newSub, withClaims } from "./helpers";

type Person = { sub: string; personRef: string; sonaId: string };

type Visibility = "private" | "unlisted" | "public";
type Status = "active" | "suspended";

/**
 * Inserts a fursona owned by the given person, as the service role.
 *
 * @param ownerRef - the owning person's actor ref.
 * @param visibility - the fursona's visibility.
 * @param status - the fursona's moderation status.
 * @returns the new row's id.
 */
async function seedSona(
  ownerRef: string,
  visibility: Visibility,
  status: Status = "active",
): Promise<string> {
  const { data, error } = await admin()
    .from("actors")
    .insert({
      actor_ref: randomUUID(),
      kind: "fursona",
      owner_ref: ownerRef,
      handle: `s-${randomUUID().slice(0, 8)}`,
      display_name: "Test Sona",
      visibility,
      status,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

/**
 * Seeds a person actor and one fursona they own, as the service role.
 *
 * @param visibility - the fursona's visibility.
 * @returns the seeded identity, its actor ref, and the fursona's row id.
 */
async function seed(visibility: Visibility): Promise<Person> {
  const sub = newSub();
  const personRef = randomUUID();

  const { error: pErr } = await admin()
    .from("actors")
    .insert({
      actor_ref: personRef,
      kind: "person",
      identity_sub: sub,
      handle: `p-${personRef.slice(0, 8)}`,
    });
  if (pErr) throw pErr;

  return { sub, personRef, sonaId: await seedSona(personRef, visibility) };
}

/**
 * Suspends an already-seeded actor, as a moderator would.
 *
 * @param actorRef - the actor to suspend.
 */
async function suspend(actorRef: string): Promise<void> {
  const { error } = await admin()
    .from("actors")
    .update({ status: "suspended" })
    .eq("actor_ref", actorRef);
  if (error) throw error;
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

  it("denies clients write access to the base actors table", async () => {
    const c = await clientAs(alice.sub);

    const ins = await c.from("actors").insert({
      actor_ref: randomUUID(),
      kind: "person",
      identity_sub: newSub(),
      handle: `evil-${randomUUID().slice(0, 8)}`,
    });
    expect(ins.error).not.toBeNull();

    const upd = await c
      .from("actors")
      .update({ display_name: "hijacked" })
      .eq("id", alice.sonaId);
    expect(upd.error).not.toBeNull();

    const del = await c.from("actors").delete().eq("id", alice.sonaId);
    expect(del.error).not.toBeNull();
  });

  it("shows an unlisted fursona to any authenticated caller", async () => {
    const { data: sona, error: seedErr } = await admin()
      .from("actors")
      .insert({
        actor_ref: randomUUID(),
        kind: "fursona",
        owner_ref: bob.personRef,
        handle: `unl-${randomUUID().slice(0, 8)}`,
        visibility: "unlisted",
      })
      .select("id")
      .single();
    if (seedErr) throw seedErr;

    const c = await clientAs(alice.sub);
    const { data, error } = await c
      .from("actors_public")
      .select("id")
      .eq("id", sona.id as string);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
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

  it("still lets the service role read the public view", async () => {
    // 0003's blanket `revoke ... from public` also stripped service_role's
    // default SELECT; 0007 grants it back. Server-side jobs read here.
    const { error } = await admin().from("actors_public").select("id").limit(1);
    expect(error).toBeNull();
  });

  it("denies an anonymous caller the public view entirely", async () => {
    await expect(
      withClaims(null, async (c) =>
        c.query("select 1 from public.actors_public limit 1"),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});

// 0011. 0003 filtered on `visibility` alone, so a suspended fursona whose
// visibility was 'public' stayed listed to everyone — a sanction that publishing
// (0009) made routinely reachable could simply be ignored. The filter belongs on
// the public/unlisted branch ONLY: a blanket `status = 'active'` would also hide
// a suspended PERSON's own row, blanking the /me page for the one person who
// most needs a truthful one.
describe("suspension and the public view", () => {
  let owner: Person;
  let suspendedSonaId: string;
  let stranger: Person;
  let suspendedPerson: Person;

  beforeAll(async () => {
    owner = await seed("public");
    suspendedSonaId = await seedSona(owner.personRef, "public", "suspended");
    stranger = await seed("private");
    suspendedPerson = await seed("private");
    await suspend(suspendedPerson.personRef);
  });

  // The control. This row differs from the suspended one below in `status` and
  // nothing else, so the pair proves the status filter rather than merely
  // proving that some row is invisible.
  it("shows a stranger a public fursona while it is active", async () => {
    const c = await clientAs(stranger.sub);
    const { data, error } = await c
      .from("actors_public")
      .select("id")
      .eq("id", owner.sonaId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("hides a suspended public fursona from a stranger", async () => {
    const c = await clientAs(stranger.sub);
    const { data, error } = await c
      .from("actors_public")
      .select("id")
      .eq("id", suspendedSonaId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("still shows an owner their own suspended fursona", async () => {
    const c = await clientAs(owner.sub);
    const { data, error } = await c
      .from("actors_public")
      .select("id, status")
      .eq("id", suspendedSonaId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]?.status).toBe("suspended");
  });

  // The /me regression the surgical fix exists to avoid.
  it("still shows a suspended person their own row", async () => {
    const c = await clientAs(suspendedPerson.sub);
    const { data, error } = await c
      .from("actors_public")
      .select("actor_ref")
      .eq("actor_ref", suspendedPerson.personRef);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });
});
