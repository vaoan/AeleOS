import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SignJWT } from "jose";
import pg from "pg";

const url = (): string => process.env.SUPABASE_URL as string;
const anon = (): string => process.env.SUPABASE_ANON_KEY as string;
const service = (): string => process.env.SUPABASE_SERVICE_ROLE_KEY as string;
const secret = (): Uint8Array =>
  new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET as string);

export const admin = (): SupabaseClient =>
  createClient(url(), service(), { auth: { persistSession: false } });

let seq = 0;
export function newSub(): string {
  seq += 1;
  return `test_${Date.now()}_${seq}`;
}

/**
 * Mints a local HS256 token signed with the local Supabase JWT secret.
 *
 * The issuer is deliberately a non-existent test hostname. Nothing validates
 * it — no policy reads the `iss` claim — and naming a real one would be a lie
 * in either direction: these tokens are not Clerk's, and real Third-Party Auth
 * validates asymmetrically against Clerk's JWKS. What this suite proves is
 * claim shape and policy behaviour; proving the Clerk trust is `tests/idp/`.
 *
 * This suite is copied into consuming apps, so a hostname here travels.
 */
export async function mintToken(sub: string): Promise<string> {
  return new SignJWT({ role: "authenticated" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setAudience("authenticated")
    .setIssuer("https://conformance.aeleos.test")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secret());
}

export async function clientAs(sub: string): Promise<SupabaseClient> {
  const token = await mintToken(sub);
  return createClient(url(), anon(), {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

let poolRef: pg.Pool | undefined;
const pool = (): pg.Pool => {
  poolRef ??= new pg.Pool({ connectionString: process.env.SUPABASE_DB_URL });
  return poolRef;
};

export async function closePool(): Promise<void> {
  await poolRef?.end();
  poolRef = undefined;
}

/**
 * Runs fn as the role a real request would produce, then rolls back:
 * `anon` with no claims when sub is null, `authenticated` carrying sub
 * otherwise. Never use this for privileged reads — see withSuperuser.
 */
export async function withClaims<T>(
  sub: string | null,
  fn: (c: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("begin");
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      sub === null ? null : JSON.stringify({ sub, role: "authenticated" }),
    ]);
    // Role names cannot be parameterised, hence the literal branch.
    await client.query(
      sub === null ? "set local role anon" : "set local role authenticated",
    );
    return await fn(client);
  } finally {
    await client.query("rollback").catch(() => undefined);
    client.release();
  }
}

/**
 * Rolled-back transaction with no role switch and no claims. For deliberately
 * privileged inspection of columns and catalogs that clients cannot read.
 */
export async function withSuperuser<T>(
  fn: (c: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("begin");
    return await fn(client);
  } finally {
    await client.query("rollback").catch(() => undefined);
    client.release();
  }
}
