import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  admin,
  clientAs,
  closePool,
  newSub,
  withClaims,
  withSuperuser,
} from "./helpers";

afterAll(async () => {
  await closePool();
});

const BUCKET = "actor-images";

/**
 * Provisions a person and gives them one active fursona.
 *
 * @returns the identity, the person's ref, and the fursona's ref.
 */
async function seed(): Promise<{
  sub: string;
  personRef: string;
  sonaRef: string;
}> {
  const sub = newSub();
  const c = await clientAs(sub);
  const { data: personRef, error } = await c.rpc("ensure_person_actor");
  if (error) throw error;

  const sonaRef = randomUUID();
  const { error: sErr } = await admin()
    .from("actors")
    .insert({
      actor_ref: sonaRef,
      kind: "fursona",
      owner_ref: personRef as string,
      handle: `s-${sonaRef.slice(0, 8)}`,
    });
  if (sErr) throw sErr;

  return { sub, personRef: personRef as string, sonaRef };
}

/** The object path an upload would use. */
const pathFor = (actorRef: string) => `actor/${actorRef}/${randomUUID()}.png`;

/**
 * Attempts an insert as the given caller, then rolls back.
 *
 * `withClaims` is transactional, which is exactly right for asking "would the
 * policy allow this?" — nothing it writes survives, and nothing here needs it
 * to. An earlier draft arranged objects this way and then measured an empty
 * bucket, which read as the policies being broken when they were fine.
 *
 * @param sub - whose token to act as, or null for anon.
 * @param name - the object path.
 * @returns nothing; it rejects when the policy refuses.
 */
const tryInsert = (sub: string | null, name: string) =>
  withClaims(sub, async (c) =>
    c.query("insert into storage.objects (bucket_id, name) values ($1, $2)", [
      BUCKET,
      name,
    ]),
  );

describe("the actor-images bucket", () => {
  it("exists, is public, and carries its limits", async () => {
    const bucket = await withSuperuser(async (c) => {
      const r = await c.query<{
        public: boolean;
        file_size_limit: string;
        allowed_mime_types: string[];
      }>(
        "select public, file_size_limit::text, allowed_mime_types from storage.buckets where id = $1",
        [BUCKET],
      );
      return r.rows[0];
    });

    // Public to READ, deliberately: a private bucket means signed URLs, and
    // those expire — useless in a page meant to be shared and indexed.
    expect(bucket?.public).toBe(true);
    expect(Number(bucket?.file_size_limit)).toBe(2_097_152);
    expect(bucket?.allowed_mime_types).toEqual(
      expect.arrayContaining(["image/png", "image/jpeg", "image/webp"]),
    );
  });

  describe("who may write", () => {
    it("lets an owner write under their own fursona", async () => {
      const { sub, sonaRef } = await seed();
      await expect(tryInsert(sub, pathFor(sonaRef))).resolves.toBeDefined();
    });

    // A profile picture is the same operation as a fursona's, which is why
    // owns_active_actor rather than owns_active_fursona governs this.
    it("lets a person write under their own person row", async () => {
      const { sub, personRef } = await seed();
      await expect(tryInsert(sub, pathFor(personRef))).resolves.toBeDefined();
    });

    it("refuses a stranger's actor", async () => {
      const alice = await seed();
      const mallory = await seed();
      await expect(
        tryInsert(mallory.sub, pathFor(alice.sonaRef)),
      ).rejects.toThrow(/row-level security|permission denied/i);
    });

    // Suspension travels here too: owns_active_actor resolves through
    // current_person_ref(), which filters to active people.
    it("refuses a suspended person their own actor", async () => {
      const { sub, sonaRef, personRef } = await seed();
      const { error } = await admin()
        .from("actors")
        .update({ status: "suspended" })
        .eq("actor_ref", personRef);
      expect(error).toBeNull();

      await expect(tryInsert(sub, pathFor(sonaRef))).rejects.toThrow(
        /row-level security|permission denied/i,
      );
    });

    it("refuses an anonymous caller entirely", async () => {
      const { sonaRef } = await seed();
      await expect(tryInsert(null, pathFor(sonaRef))).rejects.toThrow(
        /row-level security|permission denied/i,
      );
    });

    it("refuses a path that names no actor", async () => {
      const { sub } = await seed();
      await expect(
        tryInsert(sub, `actor/${randomUUID()}/x.png`),
      ).rejects.toThrow(/row-level security|permission denied/i);
    });
  });

  // WHO MAY REMOVE IS NOT ASSERTED HERE, AND CANNOT BE.
  //
  // Supabase installs `storage.protect_delete()`, a trigger that refuses any
  // direct deletion from the storage tables — "Direct deletion from storage
  // tables is not allowed. Use the Storage API instead." It applies to every
  // role, so a SQL test of the delete policy is testing something the platform
  // forbids for everybody rather than something this schema decides.
  //
  // That is also why the migration does not delete images from
  // `delete_fursona`, and why the app removes them through the Storage API
  // before marking the row. The delete policy is therefore exercised by
  // `removeActorImages` and its callers:
  // `apps/hub/tests/actor-images.test.ts` and
  // `apps/hub/tests/fursona-arrangement.test.ts`, which assert the ordering.
  //
  // **The gap is real and worth naming**: nothing here proves the delete POLICY
  // refuses a stranger against a live Storage API. The insert policies below
  // share the same `owns_active_actor` expression, so a mistake in the
  // ownership test would show up there — but a mistake in the delete policy
  // alone would not.
});
