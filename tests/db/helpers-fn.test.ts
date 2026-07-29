import { afterAll, describe, expect, it } from "vitest";
import { closePool, mintToken, newSub, withClaims } from "./helpers";

afterAll(async () => {
  await closePool();
});

describe("test harness", () => {
  it("mints a token carrying sub and the authenticated role", async () => {
    const sub = newSub();
    const token = await mintToken(sub);
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1] as string, "base64url").toString("utf8"),
    ) as { sub: string; role: string };
    expect(payload.sub).toBe(sub);
    expect(payload.role).toBe("authenticated");
  });

  it("exposes the sub to SQL via auth.jwt()", async () => {
    const sub = newSub();
    const got = await withClaims(sub, async (c) => {
      const r = await c.query<{ sub: string }>(
        "select auth.jwt()->>'sub' as sub",
      );
      return r.rows[0]?.sub;
    });
    expect(got).toBe(sub);
  });

  it("rolls back writes made inside withClaims", async () => {
    await withClaims(null, async (c) => {
      await c.query("create temp table probe(x int)");
      await c.query("insert into probe values (1)");
    });
    const survived = await withClaims(null, async (c) => {
      const r = await c.query<{ n: string }>(
        "select count(*)::text as n from pg_tables where tablename = 'probe'",
      );
      return r.rows[0]?.n;
    });
    expect(survived).toBe("0");
  });
});
