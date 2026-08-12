import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { admin, clientAs, closePool, newSub, withSuperuser } from "./helpers";

type Person = { sub: string; personRef: string };

/**
 * Inserts a person actor as the service role.
 *
 * @returns the seeded identity and its actor ref.
 */
async function seedPerson(): Promise<Person> {
  const sub = newSub();
  const personRef = randomUUID();
  const { error } = await admin()
    .from("actors")
    .insert({
      actor_ref: personRef,
      kind: "person",
      identity_sub: sub,
      handle: `p-${personRef.slice(0, 8)}`,
    });
  if (error) throw error;
  return { sub, personRef };
}

/**
 * Seeds a person actor and immediately suspends it as the service role.
 *
 * @returns the seeded identity and its actor ref, already suspended.
 */
async function seedSuspendedPerson(): Promise<Person> {
  const person = await seedPerson();
  const { error } = await admin()
    .from("actors")
    .update({ status: "suspended" })
    .eq("actor_ref", person.personRef);
  if (error) throw error;
  return person;
}

/**
 * Derives the actor_ref a given identity_sub would get from
 * `person_actor_ref` — the same derivation `ensure_person_actor` (0006) uses
 * to provision a person's row and handle. Reads through a privileged
 * connection because clients cannot call this function directly (see
 * tests/db/provisioning.test.ts).
 *
 * @param sub - the identity subject to derive for.
 * @returns the derived actor_ref.
 */
async function derivePersonActorRef(sub: string): Promise<string> {
  const ref = await withSuperuser(async (pc) => {
    const r = await pc.query<{ ref: string }>(
      "select public.person_actor_ref($1) as ref",
      [sub],
    );
    return r.rows[0]?.ref;
  });
  if (!ref) throw new Error("person_actor_ref returned no row");
  return ref;
}

let alice: Person;
let bob: Person;

beforeAll(async () => {
  alice = await seedPerson();
  bob = await seedPerson();
});

afterAll(async () => {
  await closePool();
});

/** A handle unique to this run. @returns the handle. */
const handle = (): string => `sona-${randomUUID().slice(0, 8)}`;

describe("create_fursona", () => {
  it("creates a fursona owned by the caller", async () => {
    const c = await clientAs(alice.sub);
    const h = handle();
    const { data, error } = await c.rpc("create_fursona", {
      p_handle: h,
      p_display_name: "Test Sona",
      p_avatar_url: null,
      p_visibility: "private",
    });
    expect(error).toBeNull();

    const owner = await withSuperuser(async (pc) => {
      const r = await pc.query<{ owner_ref: string }>(
        "select owner_ref from public.actors where actor_ref = $1",
        [data as string],
      );
      return r.rows[0]?.owner_ref;
    });
    expect(owner).toBe(alice.personRef);
  });

  it("rejects a duplicate handle regardless of case", async () => {
    const c = await clientAs(alice.sub);
    const h = handle();
    await c.rpc("create_fursona", {
      p_handle: h,
      p_display_name: null,
      p_avatar_url: null,
      p_visibility: "private",
    });
    const { error } = await c.rpc("create_fursona", {
      p_handle: h.toUpperCase(),
      p_display_name: null,
      p_avatar_url: null,
      p_visibility: "private",
    });
    expect(error?.message).toMatch(/handle already taken/i);
  });

  it("rejects a blank handle", async () => {
    const c = await clientAs(alice.sub);
    const { error } = await c.rpc("create_fursona", {
      p_handle: "   ",
      p_display_name: null,
      p_avatar_url: null,
      p_visibility: "private",
    });
    expect(error?.message).toMatch(/handle is required/i);
  });

  it("rejects a handle containing spaces", async () => {
    const c = await clientAs(alice.sub);
    const { error } = await c.rpc("create_fursona", {
      p_handle: "sona name",
      p_display_name: null,
      p_avatar_url: null,
      p_visibility: "private",
    });
    expect(error?.message).toMatch(/invalid characters or length/i);
  });

  it("rejects a handle attempting path traversal", async () => {
    const c = await clientAs(alice.sub);
    const { error } = await c.rpc("create_fursona", {
      p_handle: "../admin-sona",
      p_display_name: null,
      p_avatar_url: null,
      p_visibility: "private",
    });
    expect(error?.message).toMatch(/invalid characters or length/i);
  });

  it("rejects a handle containing a script tag", async () => {
    const c = await clientAs(alice.sub);
    const { error } = await c.rpc("create_fursona", {
      p_handle: "<script>alert(1)</script>",
      p_display_name: null,
      p_avatar_url: null,
      p_visibility: "private",
    });
    expect(error?.message).toMatch(/invalid characters or length/i);
  });

  it("rejects a handle containing an embedded newline", async () => {
    const c = await clientAs(alice.sub);
    const { error } = await c.rpc("create_fursona", {
      p_handle: "sona\nname",
      p_display_name: null,
      p_avatar_url: null,
      p_visibility: "private",
    });
    expect(error?.message).toMatch(/invalid characters or length/i);
  });

  it("rejects a handle over the maximum length", async () => {
    const c = await clientAs(alice.sub);
    const { error } = await c.rpc("create_fursona", {
      p_handle: "a".repeat(1000),
      p_display_name: null,
      p_avatar_url: null,
      p_visibility: "private",
    });
    expect(error?.message).toMatch(/invalid characters or length/i);
  });

  it("rejects a handle matching the reserved person namespace", async () => {
    const c = await clientAs(alice.sub);
    const { error } = await c.rpc("create_fursona", {
      // Shape of a real person handle (ensure_person_actor, 0006), but this
      // exact one belongs to nobody — the reservation is on the shape, not
      // any specific existing row.
      p_handle: "u-00000000000000000000000000000000",
      p_display_name: null,
      p_avatar_url: null,
      p_visibility: "private",
    });
    expect(error?.message).toMatch(/reserved/i);
  });

  it("rejects the reserved namespace regardless of case, matching the case-insensitive unique index", async () => {
    const c = await clientAs(alice.sub);
    const { error } = await c.rpc("create_fursona", {
      p_handle: "U-00000000000000000000000000000000",
      p_display_name: null,
      p_avatar_url: null,
      p_visibility: "private",
    });
    expect(error?.message).toMatch(/reserved/i);
  });

  // The reproduced exploit: attacker computes a not-yet-provisioned person's
  // future handle from their actor_ref (shared and visible across apps, see
  // CLAUDE.md), squats it, and the victim's first sign-in used to fail
  // permanently with a raw duplicate-key error and no self-service repair.
  // create_fursona must refuse the squat, and the victim's real first
  // sign-in must then succeed normally.
  it("closes the reserved-handle account-lockout exploit end to end", async () => {
    const victimSub = newSub();
    const victimRef = await derivePersonActorRef(victimSub);
    const victimHandle = `u-${victimRef.replace(/-/g, "")}`;

    const attacker = await clientAs(alice.sub);
    const { error: squatError } = await attacker.rpc("create_fursona", {
      p_handle: victimHandle,
      p_display_name: null,
      p_avatar_url: null,
      p_visibility: "private",
    });
    expect(squatError?.message).toMatch(/reserved/i);

    const victim = await clientAs(victimSub);
    const { data, error } = await victim.rpc("ensure_person_actor");
    expect(error).toBeNull();
    expect(data).toBe(victimRef);
  });

  it("rejects a visibility outside the allowed set", async () => {
    const c = await clientAs(alice.sub);
    const { error } = await c.rpc("create_fursona", {
      p_handle: handle(),
      p_display_name: null,
      p_avatar_url: null,
      p_visibility: "everyone",
    });
    expect(error?.message).toMatch(/invalid visibility/i);
  });

  it("rejects a null visibility instead of falling through to the write", async () => {
    const c = await clientAs(alice.sub);
    const { error } = await c.rpc("create_fursona", {
      p_handle: handle(),
      p_display_name: null,
      p_avatar_url: null,
      p_visibility: null,
    });
    expect(error?.message).toMatch(/invalid visibility/i);
  });

  it("refuses a caller with no person actor", async () => {
    const c = await clientAs(newSub());
    const { error } = await c.rpc("create_fursona", {
      p_handle: handle(),
      p_display_name: null,
      p_avatar_url: null,
      p_visibility: "private",
    });
    expect(error?.message).toMatch(/no person actor/i);
  });

  // A suspended person has a person actor — they should not be told they
  // have none, or Task 5 has no true thing to say to them.
  it("refuses a suspended caller with a distinct message", async () => {
    const suspended = await seedSuspendedPerson();
    const c = await clientAs(suspended.sub);
    const { error } = await c.rpc("create_fursona", {
      p_handle: handle(),
      p_display_name: null,
      p_avatar_url: null,
      p_visibility: "private",
    });
    expect(error?.message).toMatch(/suspended/i);
    expect(error?.message).not.toMatch(/no person actor/i);
  });

  it("stores blank optional fields as null rather than empty strings", async () => {
    const c = await clientAs(alice.sub);
    const { data } = await c.rpc("create_fursona", {
      p_handle: handle(),
      p_display_name: "   ",
      p_avatar_url: "",
      p_visibility: "private",
    });
    const row = await withSuperuser(async (pc) => {
      const r = await pc.query<{
        display_name: string | null;
        avatar_url: string | null;
      }>(
        "select display_name, avatar_url from public.actors where actor_ref = $1",
        [data as string],
      );
      return r.rows[0];
    });
    expect(row?.display_name).toBeNull();
    expect(row?.avatar_url).toBeNull();
  });
});

describe("update_fursona", () => {
  /**
   * Creates a fursona owned by the given person.
   *
   * @param sub - the owner's identity subject.
   * @returns the new actor ref.
   */
  async function makeSona(sub: string): Promise<string> {
    const c = await clientAs(sub);
    const { data, error } = await c.rpc("create_fursona", {
      p_handle: handle(),
      p_display_name: "Before",
      p_avatar_url: null,
      p_visibility: "private",
    });
    if (error) throw error;
    return data as string;
  }

  it("updates a fursona the caller owns", async () => {
    const ref = await makeSona(alice.sub);
    const c = await clientAs(alice.sub);
    const { error } = await c.rpc("update_fursona", {
      p_actor_ref: ref,
      p_display_name: "After",
      p_avatar_url: "https://img.example/a.png",
      p_visibility: "public",
    });
    expect(error).toBeNull();

    const row = await withSuperuser(async (pc) => {
      const r = await pc.query<{ display_name: string; visibility: string }>(
        "select display_name, visibility from public.actors where actor_ref = $1",
        [ref],
      );
      return r.rows[0];
    });
    expect(row?.display_name).toBe("After");
    expect(row?.visibility).toBe("public");
  });

  // The authorization test. Bob must not be able to edit Alice's fursona even
  // though he holds a valid session and a real actor_ref.
  it("refuses to update a fursona owned by someone else", async () => {
    const ref = await makeSona(alice.sub);
    const c = await clientAs(bob.sub);
    const { error } = await c.rpc("update_fursona", {
      p_actor_ref: ref,
      p_display_name: "Hijacked",
      p_avatar_url: null,
      p_visibility: "public",
    });
    expect(error?.message).toMatch(/fursona not found/i);

    const name = await withSuperuser(async (pc) => {
      const r = await pc.query<{ display_name: string }>(
        "select display_name from public.actors where actor_ref = $1",
        [ref],
      );
      return r.rows[0]?.display_name;
    });
    expect(name).toBe("Before");
  });

  // Not-found and not-yours must be indistinguishable, or the error becomes an
  // oracle for probing which actor_refs exist.
  it("reports a missing fursona the same way as one it does not own", async () => {
    const ref = await makeSona(alice.sub);
    const c = await clientAs(bob.sub);
    const notOurs = await c.rpc("update_fursona", {
      p_actor_ref: ref,
      p_display_name: "x",
      p_avatar_url: null,
      p_visibility: "private",
    });
    const missing = await c.rpc("update_fursona", {
      p_actor_ref: randomUUID(),
      p_display_name: "x",
      p_avatar_url: null,
      p_visibility: "private",
    });
    expect(missing.error?.message).toBe(notOurs.error?.message);
  });

  it("rejects a visibility outside the allowed set", async () => {
    const ref = await makeSona(alice.sub);
    const c = await clientAs(alice.sub);
    const { error } = await c.rpc("update_fursona", {
      p_actor_ref: ref,
      p_display_name: null,
      p_avatar_url: null,
      p_visibility: "everyone",
    });
    expect(error?.message).toMatch(/invalid visibility/i);
  });

  it("rejects a null visibility instead of falling through to the write", async () => {
    const ref = await makeSona(alice.sub);
    const c = await clientAs(alice.sub);
    const { error } = await c.rpc("update_fursona", {
      p_actor_ref: ref,
      p_display_name: null,
      p_avatar_url: null,
      p_visibility: null,
    });
    expect(error?.message).toMatch(/invalid visibility/i);

    const row = await withSuperuser(async (pc) => {
      const r = await pc.query<{ visibility: string }>(
        "select visibility from public.actors where actor_ref = $1",
        [ref],
      );
      return r.rows[0]?.visibility;
    });
    expect(row).toBe("private");
  });

  // A person row is not a fursona. What actually blocks this is
  // actors_person_shape (0001): it forces owner_ref to be NULL on every
  // person row, so `owner_ref = v_owner` can never match one, regardless of
  // the kind conjunct — this test cannot exercise that conjunct for that
  // reason. It stays in the WHERE clause as defence-in-depth against a
  // future third `kind` where owner_ref might not be NULL.
  it("refuses to update a person actor", async () => {
    const c = await clientAs(alice.sub);
    const { error } = await c.rpc("update_fursona", {
      p_actor_ref: alice.personRef,
      p_display_name: "Not a sona",
      p_avatar_url: null,
      p_visibility: "public",
    });
    expect(error?.message).toMatch(/fursona not found/i);
  });

  // Per-fursona suspension is a modelled moderation action (can_act_as checks
  // status = 'active' on the target, 0002/0007). Letting the owner keep
  // editing — and re-publishing — a suspended fursona through this door would
  // be sanction evasion, which 0007's entire premise says must not happen.
  it("refuses to update a suspended fursona, with the same not-found error", async () => {
    const ref = await makeSona(alice.sub);
    const { error: suspendError } = await admin()
      .from("actors")
      .update({ status: "suspended" })
      .eq("actor_ref", ref);
    if (suspendError) throw suspendError;

    const c = await clientAs(alice.sub);
    const { error } = await c.rpc("update_fursona", {
      p_actor_ref: ref,
      p_display_name: "Should not land",
      p_avatar_url: null,
      p_visibility: "public",
    });
    expect(error?.message).toMatch(/fursona not found/i);

    const row = await withSuperuser(async (pc) => {
      const r = await pc.query<{ display_name: string; visibility: string }>(
        "select display_name, visibility from public.actors where actor_ref = $1",
        [ref],
      );
      return r.rows[0];
    });
    expect(row?.display_name).toBe("Before");
    expect(row?.visibility).toBe("private");
  });

  // A suspended person has a person actor — they should not be told they
  // have none, or Task 5 has no true thing to say to them.
  it("refuses a suspended caller with a distinct message", async () => {
    const suspended = await seedSuspendedPerson();
    const c = await clientAs(suspended.sub);
    const { error } = await c.rpc("update_fursona", {
      p_actor_ref: randomUUID(),
      p_display_name: "x",
      p_avatar_url: null,
      p_visibility: "private",
    });
    expect(error?.message).toMatch(/suspended/i);
    expect(error?.message).not.toMatch(/no person actor/i);
  });
});
