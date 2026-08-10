import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import pg from "pg";

const token = (): string => process.env.CLERK_SESSION_TOKEN ?? "";
const hasCreds = (): boolean => token().length > 0;

const clerkSub = (): string =>
  (
    JSON.parse(
      Buffer.from(token().split(".")[1] as string, "base64url").toString(
        "utf8",
      ),
    ) as { sub: string }
  ).sub;

function clerkClient(): SupabaseClient {
  return createClient(
    process.env.SUPABASE_URL as string,
    process.env.SUPABASE_ANON_KEY as string,
    {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token()}` } },
    },
  );
}

const admin = (): SupabaseClient =>
  createClient(
    process.env.SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } },
  );

describe.skipIf(!hasCreds())(
  "actor model against a real Clerk identity",
  () => {
    let pool: pg.Pool;
    beforeAll(() => {
      pool = new pg.Pool({ connectionString: process.env.SUPABASE_DB_URL });
    });
    afterAll(async () => {
      await admin().from("actors").delete().eq("identity_sub", clerkSub());
      await pool.end();
    });

    it("provisions a person actor from the Clerk subject", async () => {
      const c = clerkClient();
      const { data, error } = await c.rpc("ensure_person_actor");
      expect(error).toBeNull();
      expect(data).toBeTruthy();

      const { data: rows } = await admin()
        .from("actors")
        .select("actor_ref, kind")
        .eq("identity_sub", clerkSub());
      expect(rows).toHaveLength(1);
      expect(rows?.[0]?.kind).toBe("person");
      expect(rows?.[0]?.actor_ref).toBe(data);
    });

    it("is idempotent for the same Clerk subject", async () => {
      const c = clerkClient();
      const first = await c.rpc("ensure_person_actor");
      const second = await c.rpc("ensure_person_actor");
      expect(second.data).toBe(first.data);
    });

    it("resolves current_person_ref from the Clerk token", async () => {
      const c = clerkClient();
      await c.rpc("ensure_person_actor");
      const { data, error } = await c.rpc("current_person_ref");
      expect(error).toBeNull();

      const { data: rows } = await admin()
        .from("actors")
        .select("actor_ref")
        .eq("identity_sub", clerkSub())
        .single();
      expect(data).toBe(rows?.actor_ref);
    });

    it("lets the Clerk user author as an owned fursona", async () => {
      const c = clerkClient();
      const personRef = (await c.rpc("ensure_person_actor")).data as string;

      const { data: sona, error: sErr } = await admin()
        .from("actors")
        .insert({
          actor_ref: randomUUID(),
          kind: "fursona",
          owner_ref: personRef,
          handle: `clerk-sona-${randomUUID().slice(0, 8)}`,
        })
        .select("id")
        .single();
      if (sErr) throw sErr;

      const { error } = await c.from("comments").insert({
        body: "authored via Clerk",
        author_actor_id: sona.id as string,
      });
      expect(error).toBeNull();

      // The accountability snapshot must have been derived server-side.
      const r = await pool.query<{ author_person_ref: string }>(
        "select author_person_ref from public.comments where author_actor_id = $1",
        [sona.id as string],
      );
      expect(r.rows[0]?.author_person_ref).toBe(personRef);

      await admin()
        .from("comments")
        .delete()
        .eq("author_actor_id", sona.id as string);
      await admin()
        .from("actors")
        .delete()
        .eq("id", sona.id as string);
    });

    it("still hides the linkability columns from a Clerk-authenticated caller", async () => {
      const c = clerkClient();
      const viaActors = await c.from("actors_public").select("owner_ref");
      expect(viaActors.error).not.toBeNull();
      const viaComments = await c.from("comments").select("author_person_ref");
      expect(viaComments.error).not.toBeNull();
    });
  },
);
