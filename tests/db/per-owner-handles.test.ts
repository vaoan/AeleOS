import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { admin, clientAs, closePool, newSub } from "./helpers";

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
 * Inserts a fursona row directly, returning the error rather than raising.
 *
 * Written with `admin()` on purpose: this suite is about the INDEX, and going
 * through `create_fursona` would test its own conflict handling instead.
 *
 * @param ownerRef - the person who owns it.
 * @param handle - the handle to claim.
 * @returns the error, or null when it was accepted.
 */
async function insertFursona(
  ownerRef: string,
  handle: string,
): Promise<{ message: string } | null> {
  const { error } = await admin().from("actors").insert({
    actor_ref: randomUUID(),
    kind: "fursona",
    owner_ref: ownerRef,
    handle,
  });
  return error;
}

/** A handle nothing else in the suite will claim. */
const uniqueHandle = () => `h-${randomUUID().slice(0, 8)}`;

describe("handles are unique per owner", () => {
  it("lets two different people each own the same handle", async () => {
    const a = await provision();
    const b = await provision();
    const handle = uniqueHandle();

    expect(await insertFursona(a.personRef, handle)).toBeNull();
    expect(await insertFursona(b.personRef, handle)).toBeNull();
  });

  it("stops one person owning the same handle twice", async () => {
    const { personRef } = await provision();
    const handle = uniqueHandle();

    expect(await insertFursona(personRef, handle)).toBeNull();
    expect(await insertFursona(personRef, handle)).not.toBeNull();
  });

  it("stops one person owning it in another case", async () => {
    const { personRef } = await provision();
    const handle = uniqueHandle();

    expect(await insertFursona(personRef, handle)).toBeNull();
    expect(await insertFursona(personRef, handle.toUpperCase())).not.toBeNull();
  });

  // THE NULL TRAP, and the reason this schema uses two partial indexes rather
  // than one composite. A person has `owner_ref IS NULL`, and Postgres treats
  // NULLs as distinct in a unique index by default — so
  // `unique (owner_ref, lower(handle))` alone would silently let two people
  // share a person handle, and nothing else in the suite would notice.
  it("still stops two PEOPLE sharing a handle", async () => {
    const handle = `u-${randomUUID().replace(/-/g, "")}`;

    const first = await admin().from("actors").insert({
      actor_ref: randomUUID(),
      kind: "person",
      identity_sub: newSub(),
      handle,
    });
    expect(first.error).toBeNull();

    const second = await admin().from("actors").insert({
      actor_ref: randomUUID(),
      kind: "person",
      identity_sub: newSub(),
      handle,
    });
    expect(second.error).not.toBeNull();
  });

  it("lets a person and a fursona hold the same handle", async () => {
    // Not a collision worth preventing: they are in separate namespaces now,
    // and the reserved-prefix rule below is what keeps a fursona from
    // impersonating the SHAPE of a person handle.
    const { personRef } = await provision();
    const { data } = await admin()
      .from("actors")
      .select("handle")
      .eq("actor_ref", personRef)
      .single();

    expect(
      await insertFursona(personRef, (data as { handle: string }).handle),
    ).toBeNull();
  });
});

describe("create_fursona under per-owner handles", () => {
  /**
   * Calls `create_fursona` as somebody.
   *
   * @param sub - whose token to use.
   * @param handle - the handle to claim.
   * @returns the error, or null.
   */
  async function create(
    sub: string,
    handle: string,
  ): Promise<{ message: string } | null> {
    const c = await clientAs(sub);
    const { error } = await c.rpc("create_fursona", {
      p_handle: handle,
      p_display_name: null,
      p_avatar_url: null,
      p_visibility: "private",
    });
    return error;
  }

  it("accepts a handle a stranger already uses", async () => {
    const a = await provision();
    const b = await provision();
    const handle = uniqueHandle();

    expect(await create(a.sub, handle)).toBeNull();
    expect(await create(b.sub, handle)).toBeNull();
  });

  it("refuses a handle the caller already uses", async () => {
    const { sub } = await provision();
    const handle = uniqueHandle();

    expect(await create(sub, handle)).toBeNull();
    expect((await create(sub, handle))?.message).toMatch(/already yours/i);
  });

  it("refuses a case variant of the caller's own", async () => {
    const { sub } = await provision();
    const handle = uniqueHandle();

    expect(await create(sub, handle)).toBeNull();
    expect((await create(sub, handle.toUpperCase()))?.message).toMatch(
      /already yours/i,
    );
  });

  // The message must not describe anybody else's account. Under the old global
  // namespace "already taken" was true and said nothing about whom; now the
  // only clash the caller can hit is their own, so wording that implies a
  // stranger holds it would be a statement about somebody else's data.
  it("says nothing about anybody else's account", async () => {
    const { sub } = await provision();
    const handle = uniqueHandle();
    await create(sub, handle);

    const message = (await create(sub, handle))?.message ?? "";
    expect(message).not.toMatch(/taken|someone|somebody|another|else/i);
  });

  // The reserved namespace survives the change, but its REASON is new. It used
  // to exist because a squatted `u-…` handle broke the real owner's first
  // sign-in through the global index — which per-owner handles have now made
  // impossible. It stays because `docs/integrating.md` documents the `u-`
  // prefix as how a consuming app recognises a person row, so a fursona
  // wearing that shape would be mistaken for one.
  it("still refuses the reserved person-handle namespace", async () => {
    const { sub } = await provision();
    const reserved = `u-${randomUUID().replace(/-/g, "")}`;

    expect((await create(sub, reserved))?.message).toMatch(/reserved/i);
  });
});
