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
 * Every address row a person holds.
 *
 * Read with `admin()` because no client role may select this table at all —
 * which is itself asserted below.
 *
 * @param personRef - whose addresses to read.
 * @returns the rows, newest last.
 */
async function addressesOf(
  personRef: string,
): Promise<{ address: string; kind: string }[]> {
  const { data, error } = await admin()
    .from("person_addresses")
    .select("address, kind")
    .eq("actor_ref", personRef)
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as { address: string; kind: string }[];
}

/**
 * Inserts an address as the service role, returning the error rather than
 * raising, so a test can assert *which* constraint refused it.
 *
 * @param actorRef - the person it belongs to.
 * @param address - the address to write.
 * @param kind - `number` or `vanity`.
 * @returns the PostgREST error, or null when it was accepted.
 */
async function insertAddress(
  actorRef: string,
  address: string,
  kind = "vanity",
): Promise<{ message: string } | null> {
  const { error } = await admin()
    .from("person_addresses")
    .insert({ actor_ref: actorRef, address, kind });
  return error;
}

describe("person_addresses", () => {
  describe("provisioning", () => {
    it("gives a new person exactly one number", async () => {
      const { personRef } = await provision();
      const rows = await addressesOf(personRef);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.kind).toBe("number");
      expect(rows[0]?.address).toMatch(/^\d+$/);
    });

    it("gives two people different numbers", async () => {
      const a = await provision();
      const b = await provision();
      const [aRow] = await addressesOf(a.personRef);
      const [bRow] = await addressesOf(b.personRef);
      expect(aRow?.address).not.toBe(bRow?.address);
    });

    // ensure_person_actor is idempotent today and every later sign-in calls it.
    // An address written unconditionally would either fail the second call or
    // hand somebody a second permanent address on their second visit.
    it("writes no second address when called again", async () => {
      const sub = newSub();
      const c = await clientAs(sub);
      const first = await c.rpc("ensure_person_actor");
      const second = await c.rpc("ensure_person_actor");
      expect(second.error).toBeNull();
      expect(second.data).toBe(first.data);

      expect(await addressesOf(first.data as string)).toHaveLength(1);
    });

    it("keeps a person to one number", async () => {
      const { personRef } = await provision();
      const error = await insertAddress(personRef, "999999999", "number");
      expect(error?.message).toMatch(/person_addresses_one_number_idx/i);
    });
  });

  // The most important block in this file. A vanity may BE a number, so a
  // unique constraint per kind — or a column per form on `actors` — would let
  // person #500 take the vanity `7` while person #7 already exists, and
  // `/7/luna` would then address two different people. Two constraints look
  // correct here and are not.
  describe("one namespace across both kinds", () => {
    it("refuses a vanity that is somebody else's number", async () => {
      const owner = await provision();
      const [number] = await addressesOf(owner.personRef);
      const other = await provision();

      const error = await insertAddress(other.personRef, number!.address);
      expect(error).not.toBeNull();
    });

    it("refuses a vanity that is somebody else's vanity", async () => {
      const first = await provision();
      const second = await provision();
      const taken = `v-${randomUUID().slice(0, 8)}`;

      expect(await insertAddress(first.personRef, taken)).toBeNull();
      expect(await insertAddress(second.personRef, taken)).not.toBeNull();
    });

    // The format check lowercases nothing, so uniqueness has to be
    // case-insensitive on its own or `Luna` and `luna` become two addresses
    // that a URL cannot tell apart.
    it("refuses an address differing only in case", async () => {
      const first = await provision();
      const second = await provision();
      const taken = `case-${randomUUID().slice(0, 6)}`;

      expect(await insertAddress(first.personRef, taken)).toBeNull();
      expect(
        await insertAddress(second.personRef, taken.toUpperCase()),
      ).not.toBeNull();
    });
  });

  describe("the format", () => {
    it.each([
      ["luna", "plain"],
      ["luna-wolf", "a dash"],
      ["luna_wolf", "an underscore"],
      // Deliberately not a low number. By the time this runs the sequence has
      // handed `7` to a real person, and inserting it as a vanity fails with
      // 23505 — which is the one-namespace rule working, not a format problem.
      // That collision is the whole design, so this case tests the format with
      // a value the sequence will not reach.
      ["999999999999", "a bare number"],
      ["a".repeat(32), "thirty-two characters"],
    ])("accepts %s (%s)", async (address) => {
      const { personRef } = await provision();
      expect(await insertAddress(personRef, address)).toBeNull();
    });

    // Uppercase is checked separately, with a value nothing else has taken.
    // The obvious `["Luna", "uppercase"]` in the table below proved NOTHING: the
    // accepts block inserts `luna`, so `Luna` was refused by the unique index
    // rather than by the format, and the case passed with the CHECK constraint
    // removed entirely. Found by sabotage.
    it("rejects an uppercase address nobody else holds", async () => {
      const { personRef } = await provision();
      const error = await insertAddress(
        personRef,
        `Zebra${randomUUID().slice(0, 8)}`,
      );
      expect(error).not.toBeNull();
    });

    it.each([
      ["-luna", "a leading dash"],
      ["_luna", "a leading underscore"],
      ["lu na", "a space"],
      ["luna!", "punctuation"],
      ["", "empty"],
      ["a".repeat(33), "thirty-three characters"],
    ])("rejects %s (%s)", async (address) => {
      const { personRef } = await provision();
      const error = await insertAddress(personRef, address);
      expect(error).not.toBeNull();
    });
  });

  // Every read goes through 0017's functions, which answer with one row for an
  // address the caller already has. A direct select would hand anon an
  // enumerator over every person on the platform, which is exactly what
  // `unlisted` exists to prevent.
  describe("what a client may do with it", () => {
    it("denies an anonymous caller entirely", async () => {
      await expect(
        withClaims(null, async (c) =>
          c.query("select 1 from public.person_addresses limit 1"),
        ),
      ).rejects.toThrow(/permission denied/i);
    });

    it("denies a signed-in caller too, including their own row", async () => {
      const { sub } = await provision();
      await expect(
        withClaims(sub, async (c) =>
          c.query("select 1 from public.person_addresses limit 1"),
        ),
      ).rejects.toThrow(/permission denied/i);
    });

    it("denies a signed-in caller any write", async () => {
      const { sub, personRef } = await provision();
      await expect(
        withClaims(sub, async (c) =>
          c.query(
            "insert into public.person_addresses (address, actor_ref, kind) values ($1, $2, 'vanity')",
            [`x-${randomUUID().slice(0, 8)}`, personRef],
          ),
        ),
      ).rejects.toThrow(/permission denied/i);
    });
  });

  it("takes a person's addresses with them when the row goes", async () => {
    const { personRef } = await provision();
    expect(await addressesOf(personRef)).toHaveLength(1);

    const { error } = await admin()
      .from("actors")
      .delete()
      .eq("actor_ref", personRef);
    expect(error).toBeNull();

    expect(await addressesOf(personRef)).toHaveLength(0);
  });
});
