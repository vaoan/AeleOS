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
 * Edits the caller's own profile.
 *
 * Three scalars rather than an options object: an inline object parameter makes
 * the lint rules demand `@param values.name`, which the TSDoc syntax rule then
 * rejects for the dot. The repository resolves that collision this way
 * everywhere it appears.
 *
 * @param sub - whose token to use.
 * @param visibility - who may see the profile.
 * @param name - the display name, or null.
 * @param avatar - the picture address, or null.
 * @returns the error, or null.
 */
async function update(
  sub: string,
  visibility: string | null = "private",
  name: string | null = null,
  avatar: string | null = null,
): Promise<{ message: string } | null> {
  const c = await clientAs(sub);
  const { error } = await c.rpc("update_my_profile", {
    p_display_name: name,
    p_avatar_url: avatar,
    p_visibility: visibility,
  });
  return error;
}

/**
 * Reads a person row privileged, so the assertion sees what was stored.
 *
 * @param personRef - whose row.
 * @returns the columns this function may write.
 */
async function rowOf(personRef: string) {
  const { data } = await admin()
    .from("actors")
    .select("display_name, avatar_url, visibility, handle")
    .eq("actor_ref", personRef)
    .single();
  return data as {
    display_name: string | null;
    avatar_url: string | null;
    visibility: string;
    handle: string;
  };
}

describe("update_my_profile", () => {
  it("sets the name, the picture and the visibility", async () => {
    const { sub, personRef } = await provision();
    expect(
      await update(sub, "public", "Aeleos", "https://example.test/a.png"),
    ).toBeNull();

    const row = await rowOf(personRef);
    expect(row.display_name).toBe("Aeleos");
    expect(row.avatar_url).toBe("https://example.test/a.png");
    expect(row.visibility).toBe("public");
  });

  // Publishing is the whole point: a person is provisioned private and could
  // not change it, so their profile page 404'd for everybody, permanently.
  it("makes the profile readable by a stranger", async () => {
    const { sub, personRef } = await provision();
    const { data: address } = await admin()
      .from("person_addresses")
      .select("address")
      .eq("actor_ref", personRef)
      .single();

    const before = await withClaims(null, async (c) =>
      c.query("select * from public.public_person($1)", [
        (address as { address: string }).address,
      ]),
    );
    expect(before.rows).toHaveLength(0);

    await update(sub, "public", "Aeleos");

    const after = await withClaims(null, async (c) =>
      c.query("select * from public.public_person($1)", [
        (address as { address: string }).address,
      ]),
    );
    expect(after.rows).toHaveLength(1);
    expect(after.rows[0].display_name).toBe("Aeleos");
  });

  it("empties a name rather than storing blanks", async () => {
    const { sub, personRef } = await provision();
    await update(sub, "private", "   ", "  ");
    const row = await rowOf(personRef);
    expect(row.display_name).toBeNull();
    expect(row.avatar_url).toBeNull();
  });

  // The handle is derived from actor_ref and create_fursona reserves the whole
  // `u-…` namespace against squatting. Nothing here may touch it.
  it("never changes the handle", async () => {
    const { sub, personRef } = await provision();
    const before = (await rowOf(personRef)).handle;
    await update(sub, "public", "Aeleos");
    expect((await rowOf(personRef)).handle).toBe(before);
  });

  it("refuses a visibility that is not one of the three", async () => {
    const { sub } = await provision();
    expect((await update(sub, "everyone"))?.message).toMatch(
      /invalid visibility/i,
    );
  });

  it("refuses a null visibility", async () => {
    const { sub } = await provision();
    expect((await update(sub, null))?.message).toMatch(/invalid visibility/i);
  });

  // It resolves through require_active_person_ref, so the sanction travels and
  // the caller is told which of the two reasons applies.
  it("refuses a suspended person", async () => {
    const { sub, personRef } = await provision();
    await admin()
      .from("actors")
      .update({ status: "suspended" })
      .eq("actor_ref", personRef);

    expect((await update(sub, "public"))?.message).toMatch(/suspended/i);
  });

  // There is no p_actor_ref, so there is nothing to point at somebody else —
  // the target is derived from the token and cannot be named by the caller.
  it("touches nobody else's row", async () => {
    const alice = await provision();
    const mallory = await provision();
    await update(mallory.sub, "public", "Mallory");

    const row = await rowOf(alice.personRef);
    expect(row.display_name).toBeNull();
    expect(row.visibility).toBe("private");
  });

  it("refuses an anonymous caller", async () => {
    await expect(
      withClaims(null, async (c) =>
        c.query("select public.update_my_profile('x', null, 'public')"),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  // A fursona is edited through update_fursona, which checks ownership. This
  // one addresses the caller's PERSON row only, and a fursona of theirs must
  // not be reachable through it by any route.
  it("leaves the caller's fursonas alone", async () => {
    const { sub, personRef } = await provision();
    const sonaRef = randomUUID();
    await admin()
      .from("actors")
      .insert({
        actor_ref: sonaRef,
        kind: "fursona",
        owner_ref: personRef,
        handle: `s-${sonaRef.slice(0, 8)}`,
      });

    await update(sub, "public", "Aeleos");
    expect((await rowOf(sonaRef)).visibility).toBe("private");
  });
});
