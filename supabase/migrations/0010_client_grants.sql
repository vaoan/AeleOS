-- 0010 — the complete client surface, in one place.
--
-- Every earlier migration revoked from PUBLIC and granted nothing. This file is
-- the whole list of what `anon` and `authenticated` may execute, so the answer
-- to "what can a signed-in caller reach?" is one file rather than a search.
--
-- **`anon` appears nowhere below, and that is deliberate.** Nothing granted
-- HERE is reachable without a session.
--
-- There is exactly one exception in the schema, and it is not in this file
-- because it cannot be: `0012_public_actor_reads.sql` grants `public_person`
-- and `public_fursona` to `anon`, and those functions do not exist yet when
-- this runs. They are the whole of the anonymous surface — two functions, each
-- taking an address a caller already holds, neither able to be walked. If you
-- are auditing what a stranger can reach, read that file and this one.
--
-- Two belts, deliberately. 0001 set
--
--   alter default privileges in schema public
--     revoke execute on functions from anon, authenticated;
--
-- so nothing is granted at creation; the wholesale revoke below then covers any
-- function created outside that default's reach — a different owning role, a
-- restore, a hand-run statement. Doing it wholesale rather than function by
-- function is deliberate: a list would need editing every time a function is
-- added, and the failure mode of forgetting is silent.
revoke execute on all functions in schema public from anon, authenticated;

-- Sequences as well. A sequence is not a function and was missed on the first
-- pass: `person_number_seq` reached the live project granted `anon=rwU`, which
-- let an anonymous caller call `nextval()` and burn the numbers people are
-- meant to be awarded. This sweep covers anything already created; 0001's
-- default privileges stop new ones being granted at all.
revoke all on all sequences in schema public from anon, authenticated;

-- ── Identity ────────────────────────────────────────────────────────────────
grant execute on function public.current_person_ref() to authenticated;
grant execute on function public.can_act_as(uuid) to authenticated;
grant execute on function public.ensure_person_actor() to authenticated;

-- The view's WHERE clause resolves `current_person_ref()` with the CALLER's
-- privileges even though the view itself runs as its owner, so `service_role`
-- needs EXECUTE for its SELECT grant to be usable. It carries no `sub`, so the
-- call returns null and the view degrades to the public/unlisted rows — the
-- grant does not widen what it can see.
grant execute on function public.current_person_ref() to service_role;

-- ── Platform roles ──────────────────────────────────────────────────────────
grant execute on function public.has_platform_role(text) to authenticated;

-- ── Introspection, for the trust tests ──────────────────────────────────────
grant execute on function public.whoami_sub() to authenticated;
grant execute on function public.whoami_role() to authenticated;

-- ── The actor self-service surface ──────────────────────────────────────────
grant execute on function public.my_actors() to authenticated;
grant execute on function public.create_fursona(text, text, text, text)
  to authenticated;
grant execute on function public.update_fursona(uuid, text, text, text)
  to authenticated;
grant execute on function public.delete_fursona(uuid) to authenticated;

-- ── Arranging and writing an actor's page ──────────────────────────────────
grant execute on function public.owns_active_actor(uuid) to authenticated;
grant execute on function public.owns_active_fursona(uuid) to authenticated;
grant execute on function public.set_fursona_order(uuid, int) to authenticated;
grant execute on function public.set_fursona_featured(uuid, boolean)
  to authenticated;
grant execute on function public.set_actor_sections(uuid, jsonb)
  to authenticated;
-- Its own write rather than part of set_actor_sections: a theme changes while
-- somebody drags a colour, and sending the whole section document on every
-- frame of that would be absurd. Same ownership test, different cadence.
grant execute on function public.set_actor_theme(uuid, jsonb)
  to authenticated;

-- ── Granted to NO client role ───────────────────────────────────────────────
-- Restated so the list above reads as the complete client surface rather than
-- as whatever happens to be left over:
--
--   person_actor_ref(text)              — a confirmation oracle: it turns a
--                                         candidate identity_sub into that
--                                         person's actor_ref, which then
--                                         correlates against actors_public
--   require_active_person_ref()         — called only by the definer functions
--   actors_guard_identity()             — trigger
--   actors_touch_updated_at()           — trigger
--   comments_guard_snapshot()           — trigger
--   comments_derive_author_person_ref() — trigger
