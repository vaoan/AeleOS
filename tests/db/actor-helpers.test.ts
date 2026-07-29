import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { admin, closePool, newSub, withClaims } from "./helpers";

type Fixture = {
  sub: string;
  personId: string;
  personRef: string;
  sonaId: string;
  suspendedSonaId: string;
};

async function seedPerson(): Promise<Fixture> {
  const sub = newSub();
  const personRef = randomUUID();
  const a = admin();

  const { data: person, error: pErr } = await a
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

  const { data: sona, error: sErr } = await a
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

  const { data: susp, error: xErr } = await a
    .from("actors")
    .insert({
      actor_ref: randomUUID(),
      kind: "fursona",
      owner_ref: personRef,
      handle: `x-${randomUUID().slice(0, 8)}`,
      status: "suspended",
    })
    .select("id")
    .single();
  if (xErr) throw xErr;

  return {
    sub,
    personId: person.id as string,
    personRef,
    sonaId: sona.id as string,
    suspendedSonaId: susp.id as string,
  };
}

let alice: Fixture;
let bob: Fixture;

beforeAll(async () => {
  alice = await seedPerson();
  bob = await seedPerson();
});

afterAll(async () => {
  await closePool();
});

const personRefFor = (sub: string): Promise<string | null | undefined> =>
  withClaims(sub, async (c) => {
    const r = await c.query<{ ref: string | null }>(
      "select public.current_person_ref() as ref",
    );
    return r.rows[0]?.ref;
  });

const canActAs = (sub: string, target: string): Promise<boolean | undefined> =>
  withClaims(sub, async (c) => {
    const r = await c.query<{ ok: boolean }>(
      "select public.can_act_as($1::uuid) as ok",
      [target],
    );
    return r.rows[0]?.ok;
  });

describe("current_person_ref", () => {
  it("resolves the caller's person actor_ref", async () => {
    await expect(personRefFor(alice.sub)).resolves.toBe(alice.personRef);
  });

  it("returns null for an unknown sub", async () => {
    await expect(personRefFor(newSub())).resolves.toBeNull();
  });
});

describe("can_act_as", () => {
  it("allows acting as own person actor", async () => {
    await expect(canActAs(alice.sub, alice.personId)).resolves.toBe(true);
  });

  it("allows acting as an owned fursona", async () => {
    await expect(canActAs(alice.sub, alice.sonaId)).resolves.toBe(true);
  });

  it("refuses another person's fursona", async () => {
    await expect(canActAs(alice.sub, bob.sonaId)).resolves.toBe(false);
  });

  it("refuses another person's person actor", async () => {
    await expect(canActAs(alice.sub, bob.personId)).resolves.toBe(false);
  });

  it("refuses a suspended fursona the caller owns", async () => {
    await expect(canActAs(alice.sub, alice.suspendedSonaId)).resolves.toBe(
      false,
    );
  });
});
