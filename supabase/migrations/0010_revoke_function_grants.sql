-- 0010 — close the gap between "revoke from public" and what Supabase grants.
--
-- Every earlier migration used `revoke all on function … from public` before
-- granting deliberately, and 0007 §6 applied the same discipline to the trigger
-- functions. On a Supabase project that is not enough. The project ships with
--
--   alter default privileges in schema public
--     grant all on functions to anon, authenticated, service_role;
--
-- so every function created here is ALSO granted to those roles **by name** at
-- creation time. `PUBLIC` is a pseudo-role: revoking it does not touch a grant
-- held by a named role, so the revoke removed something that was never the
-- problem and left the real grants in place.
--
-- Measured on the hosted project before this migration: every function in
-- `public` carried `anon=X`. The clearest case is `person_actor_ref`, whose ACL
-- read `postgres=X | anon=X | service_role=X` — `authenticated` absent because
-- 0007 §7 revoked it *by name*, `anon` present because nothing ever did. That
-- function is the confirmation oracle 0007 §7 exists to close: it turns a
-- candidate `identity_sub` into that person's `actor_ref`, which then correlates
-- against `actors_public`. It was closed to signed-in callers and open to
-- everyone else.
--
-- The tables were never affected: 0003 says `revoke all on public.actors from
-- anon, authenticated`, naming the roles. Confirmed on the hosted project —
-- `actors` grants only `postgres` and `service_role`.
--
-- **The conformance suite cannot catch this.** The local CLI stack does not
-- apply those default privileges, so `anon` is correctly refused there whether
-- or not this migration exists, and any test asserting the refusal passes
-- locally while production stays open. The assertion therefore lives in
-- `tests/idp/`, which runs against the real project in the `idp-cloud` job.

-- Take EXECUTE away from both client roles on everything, then re-grant only
-- what each earlier migration meant to expose. Doing it wholesale rather than
-- function by function is deliberate: a list would need editing every time a
-- function is added, and the failure mode of forgetting is silent.
revoke execute on all functions in schema public from anon, authenticated;

-- Stop the same thing happening to the next function anyone writes. Without
-- this, a future migration re-creates the hole the moment it adds a function,
-- and nothing local would show it.
alter default privileges in schema public
  revoke execute on functions from anon, authenticated;

-- ── Re-grant exactly what was intended ──────────────────────────────────────
-- 0002: the caller's own identity, and the "may I act as this actor?" check.
grant execute on function public.current_person_ref() to authenticated;
grant execute on function public.can_act_as(uuid) to authenticated;

-- 0004: platform roles.
grant execute on function public.has_platform_role(text) to authenticated;

-- 0006: first-login provisioning.
grant execute on function public.ensure_person_actor() to authenticated;

-- 0008: introspection, used by the trust tests.
grant execute on function public.whoami_sub() to authenticated;
grant execute on function public.whoami_role() to authenticated;

-- 0009: the actor self-service surface.
grant execute on function public.my_actors() to authenticated;
grant execute on function public.create_fursona(text, text, text, text)
  to authenticated;
grant execute on function public.update_fursona(uuid, text, text, text)
  to authenticated;

-- 0007 §3: the view's WHERE clause resolves this with the caller's privileges,
-- so service_role needs it even though it carries no `sub`.
grant execute on function public.current_person_ref() to service_role;

-- Deliberately granted to NO client role, restated here so the list above is
-- readable as the complete client surface rather than as whatever is left over:
--   person_actor_ref(text)        — the oracle 0007 §7 closed
--   require_active_person_ref()   — called only by the two definer functions
--   actors_guard_identity()       — trigger
--   actors_touch_updated_at()     — trigger
--   comments_guard_snapshot()     — trigger
--   comments_derive_author_person_ref() — trigger
