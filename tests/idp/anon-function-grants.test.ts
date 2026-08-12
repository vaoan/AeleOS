import { describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Whether the hosted project's coordinates are available.
 *
 * @returns true when this suite can reach a real project.
 */
const hasCreds = (): boolean =>
  Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);

/**
 * A client carrying only the publishable key, so PostgREST resolves it as
 * `anon`. No `Authorization` override, unlike the other suites in this folder.
 *
 * @returns the anonymous client.
 */
function anonClient(): SupabaseClient {
  return createClient(
    process.env.SUPABASE_URL as string,
    process.env.SUPABASE_ANON_KEY as string,
    { auth: { persistSession: false } },
  );
}

/**
 * These assertions live here, against the **hosted** project, because
 * `tests/db/` cannot make them.
 *
 * A Supabase project ships with default privileges that grant EXECUTE on
 * functions in `public` to `anon`, `authenticated` and `service_role`, so every
 * function created by a migration is granted to those roles **by name** at
 * creation. The schema's
 * `revoke all on function … from public` does not touch that: `PUBLIC` is a
 * pseudo-role, not the `anon` role. `0010` closes it.
 *
 * The local CLI stack does not apply those default privileges. So on a local
 * database `anon` is refused whether or not `0010` exists, and the same
 * assertion in `tests/db/` would pass while production stayed open — which is
 * exactly what happened: `person_actor_ref` was measured on the hosted project
 * with `anon=X` still present, months after `0007 §7` revoked it from
 * `authenticated` for being a confirmation oracle.
 *
 * Anything asserting a **grant** rather than a refusal still belongs in
 * `tests/db/`; this file is only for the gap between the two environments.
 */
describe.skipIf(!hasCreds())("the hosted project refuses anon", () => {
  // The oracle 0007 §7 named: it turns a candidate identity_sub into that
  // person's actor_ref, which then correlates against actors_public. It takes
  // the subject as a parameter, so unlike the other definer functions it does
  // not fail closed for a caller with no token — the grant is the only control.
  it("cannot execute person_actor_ref", async () => {
    const { error } = await anonClient().rpc("person_actor_ref", {
      p_identity_sub: "user_probe",
    });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/permission denied|could not find/i);
  });

  it("cannot execute require_active_person_ref", async () => {
    const { error } = await anonClient().rpc("require_active_person_ref");
    expect(error).not.toBeNull();
  });

  // These gate on auth.jwt() ->> 'sub' and so fail closed for anon anyway. The
  // point is the grant, not the body: a function reachable by anon is one whose
  // safety rests on its own logic rather than on privilege.
  it("cannot execute the actor self-service functions", async () => {
    for (const fn of [
      "my_actors",
      "ensure_person_actor",
      "current_person_ref",
    ]) {
      const { error } = await anonClient().rpc(fn);
      expect(error, `${fn} answered anon`).not.toBeNull();
    }
  });

  // 0003 grants the safe projection to `authenticated` only. Tables were never
  // hit by the default-privileges gap — 0003 names the roles it revokes — so
  // this asserts the half that was already right, to catch a regression that
  // widened it.
  //
  // That signed-in callers still work is proved by the sibling suites, which
  // hold a real Clerk token: `clerk-trust` asserts the role resolves to
  // `authenticated`, and `clerk-actor-model` reads through this same view.
  it("cannot read actors_public", async () => {
    const { error } = await anonClient()
      .from("actors_public")
      .select("actor_ref")
      .limit(1);
    expect(error).not.toBeNull();
  });
});
