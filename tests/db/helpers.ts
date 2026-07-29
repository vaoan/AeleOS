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
  return `logto_${Date.now()}_${seq}`;
}

export async function mintToken(sub: string): Promise<string> {
  return new SignJWT({ role: "authenticated" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setAudience("authenticated")
    .setIssuer("https://id.furrycolombia.com/oidc")
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

/** Runs fn as role `authenticated` with the given sub, then rolls back. */
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
    await client.query("set local role authenticated");
    return await fn(client);
  } finally {
    await client.query("rollback").catch(() => undefined);
    client.release();
  }
}
