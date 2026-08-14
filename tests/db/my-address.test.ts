import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { admin, clientAs, closePool, newSub, withClaims } from "./helpers";

afterAll(async () => {
  await closePool();
});

/**
 * Provisions a person the way a first sign-in does.
 *
 * @returns the identity and the actor_ref it resolved to.
 */
async function provision(): Promise<{ sub: string; personRef: string }> {
  const sub = newSub();
  const c = await clientAs(sub);
  const { data, error } = await c.rpc("ensure_person_actor");
  if (error) throw error;
  return { sub, personRef: data as string };
}

/**
 * Asks for the caller's own address.
 *
 * @param sub - whose token to use.
 * @returns what the function answered.
 */
async function myAddress(sub: string): Promise<string | null> {
  const c = await clientAs(sub);
  const { data, error } = await c.rpc("my_address");
  if (error) throw error;
  return data as string | null;
}

describe("my_address", () => {
  it("gives a person the number they were provisioned with", async () => {
    const { sub, personRef } = await provision();

    const { data } = await admin()
      .from("person_addresses")
      .select("address")
      .eq("actor_ref", personRef)
      .single();

    expect(await myAddress(sub)).toBe((data as { address: string }).address);
  });

  // The one to show somebody and the one to put in a link, matching what
  // public_person reports as canonical. The number keeps resolving too.
  it("prefers a vanity once one is granted", async () => {
    const { sub, personRef } = await provision();
    const vanity = `v-${randomUUID().slice(0, 8)}`;
    const { error } = await admin()
      .from("person_addresses")
      .insert({ address: vanity, actor_ref: personRef, kind: "vanity" });
    expect(error).toBeNull();

    expect(await myAddress(sub)).toBe(vanity);
  });

  it("tells one person nothing about another", async () => {
    const alice = await provision();
    const mallory = await provision();
    expect(await myAddress(mallory.sub)).not.toBe(await myAddress(alice.sub));
  });

  // It resolves through current_person_ref(), which filters to active people,
  // so the sanction travels: a suspended person is told nothing rather than
  // handed a link to a page that no longer serves.
  it("tells a suspended person nothing", async () => {
    const { sub, personRef } = await provision();
    const { error } = await admin()
      .from("actors")
      .update({ status: "suspended" })
      .eq("actor_ref", personRef);
    expect(error).toBeNull();

    expect(await myAddress(sub)).toBeNull();
  });

  it("refuses an anonymous caller", async () => {
    await expect(
      withClaims(null, async (c) => c.query("select public.my_address()")),
    ).rejects.toThrow(/permission denied/i);
  });

  // The table itself stays closed. Opening it would hand any signed-in caller
  // an enumerator over every person on the platform, which is exactly what this
  // function exists to avoid needing.
  it("does not make person_addresses readable", async () => {
    const { sub } = await provision();
    await expect(
      withClaims(sub, async (c) =>
        c.query("select 1 from public.person_addresses limit 1"),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});
