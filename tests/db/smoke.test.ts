import { describe, expect, it } from "vitest";
import { Client } from "pg";

describe("local test bed", () => {
  it("exposes connection details from supabase status", () => {
    expect(process.env.SUPABASE_URL).toBeTruthy();
    expect(process.env.SUPABASE_DB_URL).toBeTruthy();
    expect(process.env.SUPABASE_JWT_SECRET?.length ?? 0).toBeGreaterThanOrEqual(
      32,
    );
  });

  it("accepts a direct postgres connection", async () => {
    const client = new Client({
      connectionString: process.env.SUPABASE_DB_URL,
    });
    await client.connect();
    const res = await client.query<{ one: number }>("select 1 as one");
    await client.end();
    expect(res.rows[0]?.one).toBe(1);
  });
});
