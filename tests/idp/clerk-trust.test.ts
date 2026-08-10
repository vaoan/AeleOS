import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import pg from "pg";

const token = (): string => process.env.CLERK_SESSION_TOKEN ?? "";
const hasCreds = (): boolean => token().length > 0;

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

describe.skipIf(!hasCreds())("supabase trusts clerk", () => {
  let pool: pg.Pool;
  beforeAll(() => {
    pool = new pg.Pool({ connectionString: process.env.SUPABASE_DB_URL });
  });
  afterAll(async () => {
    await pool.end();
  });

  it("the captured token is a real asymmetric Clerk JWT", () => {
    const [rawHeader, rawPayload] = token().split(".");
    const header = JSON.parse(
      Buffer.from(rawHeader as string, "base64url").toString("utf8"),
    ) as { alg: string; kid?: string };
    const payload = JSON.parse(
      Buffer.from(rawPayload as string, "base64url").toString("utf8"),
    ) as { sub: string; role?: string; iss: string; exp: number };

    // Supabase requires asymmetric signing with a kid header.
    expect(header.alg).not.toBe("HS256");
    expect(header.kid).toBeTruthy();
    // The Supabase integration must be activated in Clerk for this claim.
    expect(payload.role).toBe("authenticated");
    expect(payload.sub).toMatch(/^user_/);
    expect(payload.iss).toContain(process.env.CLERK_DOMAIN as string);
    expect(payload.exp * 1000).toBeGreaterThan(Date.now());
  });

  it("PostgREST accepts the Clerk token and resolves its sub", async () => {
    const c = clerkClient();
    const { data, error } = await c.rpc("whoami_sub");
    expect(error).toBeNull();

    const payload = JSON.parse(
      Buffer.from(token().split(".")[1] as string, "base64url").toString(
        "utf8",
      ),
    ) as { sub: string };
    expect(data).toBe(payload.sub);
  });

  it("assigns the authenticated role, not anon", async () => {
    const c = clerkClient();
    const { data, error } = await c.rpc("whoami_role");
    expect(error).toBeNull();
    expect(data).toBe("authenticated");
  });

  it("rejects a token signed with the wrong key", async () => {
    const [h, p] = token().split(".");
    const forged = `${h}.${p}.${"A".repeat(64)}`;
    const c = createClient(
      process.env.SUPABASE_URL as string,
      process.env.SUPABASE_ANON_KEY as string,
      {
        auth: { persistSession: false },
        global: { headers: { Authorization: `Bearer ${forged}` } },
      },
    );
    const { error } = await c.rpc("whoami_sub");
    expect(error).not.toBeNull();
  });
});
