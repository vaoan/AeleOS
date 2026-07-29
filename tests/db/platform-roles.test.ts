import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  admin,
  clientAs,
  closePool,
  newSub,
  withClaims,
  withSuperuser,
} from "./helpers";

let modSub: string;
let plainSub: string;

beforeAll(async () => {
  modSub = newSub();
  plainSub = newSub();
  const a = admin();

  for (const sub of [modSub, plainSub]) {
    const ref = randomUUID();
    const { error } = await a.from("actors").insert({
      actor_ref: ref,
      kind: "person",
      identity_sub: sub,
      handle: `p-${ref.slice(0, 8)}`,
    });
    if (error) throw error;
  }

  const { error } = await a
    .from("platform_roles")
    .insert({ identity_sub: modSub, role: "moderator" });
  if (error) throw error;
});

afterAll(async () => {
  await closePool();
});

const hasRole = (sub: string, role: string): Promise<boolean | undefined> =>
  withClaims(sub, async (c) => {
    const r = await c.query<{ ok: boolean }>(
      "select public.has_platform_role($1) as ok",
      [role],
    );
    return r.rows[0]?.ok;
  });

describe("platform roles", () => {
  it("grants a held role", async () => {
    await expect(hasRole(modSub, "moderator")).resolves.toBe(true);
  });

  it("denies a role not held", async () => {
    await expect(hasRole(plainSub, "moderator")).resolves.toBe(false);
  });

  it("denies an unrelated role for a role-holder", async () => {
    await expect(hasRole(modSub, "admin")).resolves.toBe(false);
  });

  it("keeps the roles table unreadable by clients", async () => {
    const c = await clientAs(modSub);
    const { error } = await c.from("platform_roles").select("role").limit(1);
    expect(error).not.toBeNull();
  });

  it("has no column able to reference a fursona", async () => {
    // Privileged read: information_schema hides objects the current role has no
    // rights on, and clients have none on platform_roles.
    const cols = await withSuperuser(async (c) => {
      const r = await c.query<{ column_name: string }>(
        `select column_name from information_schema.columns
         where table_schema = 'public' and table_name = 'platform_roles'`,
      );
      return r.rows.map((x) => x.column_name);
    });
    expect(cols).toEqual(
      expect.arrayContaining(["identity_sub", "role", "synced_at"]),
    );
    expect(cols).not.toContain("actor_ref");
    expect(cols).not.toContain("actor_id");
  });
});
