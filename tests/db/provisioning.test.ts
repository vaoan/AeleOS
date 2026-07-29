import { afterAll, describe, expect, it } from "vitest";
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

describe("first-login provisioning", () => {
  it("creates a person actor on first call", async () => {
    const sub = newSub();
    const c = await clientAs(sub);
    const { data, error } = await c.rpc("ensure_person_actor");
    expect(error).toBeNull();
    expect(data).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );

    const { data: rows, error: qErr } = await admin()
      .from("actors")
      .select("actor_ref, kind")
      .eq("identity_sub", sub);
    expect(qErr).toBeNull();
    expect(rows).toHaveLength(1);
    expect(rows?.[0]?.kind).toBe("person");
    expect(rows?.[0]?.actor_ref).toBe(data);
  });

  it("is idempotent across repeated calls", async () => {
    const sub = newSub();
    const c = await clientAs(sub);
    const first = await c.rpc("ensure_person_actor");
    const second = await c.rpc("ensure_person_actor");
    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
    expect(second.data).toBe(first.data);

    const { data: rows } = await admin()
      .from("actors")
      .select("id")
      .eq("identity_sub", sub);
    expect(rows).toHaveLength(1);
  });

  it("derives the same actor_ref for the same sub in any app", async () => {
    const sub = newSub();
    const c = await clientAs(sub);
    const a = await c.rpc("person_actor_ref", { p_identity_sub: sub });
    const b = await c.rpc("person_actor_ref", { p_identity_sub: sub });
    expect(a.error).toBeNull();
    expect(a.data).toBe(b.data);

    const provisioned = await c.rpc("ensure_person_actor");
    expect(provisioned.data).toBe(a.data);
  });

  it("matches the fixed cross-app derivation vector", async () => {
    // The golden vector. This is the ONLY assertion that can catch the
    // namespace constant drifting between app repos — every other derivation
    // test would still pass if two apps used different namespaces, because
    // each is internally consistent. If this fails, do not update the
    // expected value: a changed namespace forks every person's platform
    // identity and is a breaking change.
    const c = await clientAs(newSub());
    const { data, error } = await c.rpc("person_actor_ref", {
      p_identity_sub: "aeleos-golden-vector",
    });
    expect(error).toBeNull();
    expect(data).toBe("ea573748-66ea-5413-a843-6e7068f19da6");
  });

  it("derives different actor_refs for different subs", async () => {
    const c = await clientAs(newSub());
    const one = await c.rpc("person_actor_ref", { p_identity_sub: "sub-a" });
    const two = await c.rpc("person_actor_ref", { p_identity_sub: "sub-b" });
    expect(one.data).not.toBe(two.data);
  });

  it("refuses to provision without an authenticated subject", async () => {
    // Privileged call: execute is granted only to `authenticated`, so an anon
    // caller would fail on permissions before reaching the guard we're testing.
    await expect(
      withSuperuser(async (c) => c.query("select public.ensure_person_actor()")),
    ).rejects.toThrow(/no authenticated subject/);
  });

  it("produces an actor the caller can immediately act as", async () => {
    const sub = newSub();
    const c = await clientAs(sub);
    await c.rpc("ensure_person_actor");

    const { data: rows } = await admin()
      .from("actors")
      .select("id")
      .eq("identity_sub", sub)
      .single();

    const ok = await withClaims(sub, async (pc) => {
      const r = await pc.query<{ ok: boolean }>(
        "select public.can_act_as($1::uuid) as ok",
        [rows?.id as string],
      );
      return r.rows[0]?.ok;
    });
    expect(ok).toBe(true);
  });
});
