import { afterAll, describe, expect, it } from "vitest";
import {
  closePool,
  mintToken,
  newSub,
  withClaims,
  withSuperuser,
} from "./helpers";

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

  it("rolls back writes made inside a transaction helper", async () => {
    await withSuperuser(async (c) => {
      await c.query("create temp table probe(x int)");
      await c.query("insert into probe values (1)");
    });
    const survived = await withSuperuser(async (c) => {
      const r = await c.query<{ n: string }>(
        "select count(*)::text as n from pg_tables where tablename = 'probe'",
      );
      return r.rows[0]?.n;
    });
    expect(survived).toBe("0");
  });

  it("runs as anon when no sub is given", async () => {
    const role = await withClaims(null, async (c) => {
      const r = await c.query<{ role: string }>("select current_user as role");
      return r.rows[0]?.role;
    });
    expect(role).toBe("anon");
  });

  it("runs as authenticated when a sub is given", async () => {
    const role = await withClaims(newSub(), async (c) => {
      const r = await c.query<{ role: string }>("select current_user as role");
      return r.rows[0]?.role;
    });
    expect(role).toBe("authenticated");
  });

  it("does not switch role under withSuperuser", async () => {
    const role = await withSuperuser(async (c) => {
      const r = await c.query<{ role: string }>("select current_user as role");
      return r.rows[0]?.role;
    });
    expect(role).not.toBe("anon");
    expect(role).not.toBe("authenticated");
  });
});
