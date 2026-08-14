-- 0013 — pictures an actor owns, in Supabase Storage.
--
-- One bucket. Somebody uploads instead of pasting a link, and the picture
-- belongs to the platform rather than to whatever host it was hotlinked from.
--
-- **The bucket is PUBLIC TO READ, and that has a consequence somebody must be
-- told rather than discover.** A private bucket would mean signed URLs, and
-- those expire — useless in a page meant to be shared, cached and indexed,
-- which a public fursona page is. So:
--
--   An uploaded image stays reachable by its URL even after the fursona is made
--   private. Visibility governs the PAGES; it cannot un-publish an address
--   somebody already holds.
--
-- The interface says so beside the upload control. Pretending otherwise would
-- be the bug — object paths are unguessable, but an URL that has been shared
-- has been shared.
--
-- Nothing in `actors` or `actor_profiles` changes. An upload produces a URL and
-- it goes in the same `avatar_url` or `image_url` a hand-typed one did, so
-- `docs/integrating.md` needs no change and **pasting a link to art hosted
-- elsewhere keeps working** — most furry art already lives on somebody else's
-- gallery, and forcing a re-upload would be hostile.

-- The limits are enforced here and mirrored in the client for a quick refusal.
-- **This is the authoritative copy**;
-- `apps/hub/tests/image-limits-match-migration.test.ts` reads these values out
-- of this file and fails if the client's stop matching. Changing one means
-- changing both, and that test will say so.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'actor-images',
  'actor-images',
  true,
  2097152, -- 2 MiB. At the 100-fursona quota with a full gallery each, one
           -- person is still a rounding error against the free tier's 1 GB.
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Who may write.
--
-- **The path IS the authorization, so its shape is part of the contract:**
--
--   actor/{actor_ref}/{random}.{ext}
--
-- `storage.foldername(name)` splits that, so `[1]` is the literal `actor` and
-- `[2]` is the ref the policy resolves. A file uploaded under any other shape
-- fails these policies rather than landing somewhere unowned.
--
-- Ownership goes through `owns_active_actor`, not `owns_active_fursona`: a
-- person's profile picture is the same operation as a fursona's, and 0009 split
-- those two tests precisely so this kind of thing could use the wider one. It
-- resolves through `current_person_ref()`, so a suspended person cannot upload
-- at all — the sanction travels here as it does everywhere else.
--
-- Read needs no policy: the bucket's own `public` flag covers it.
create policy actor_images_owner_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'actor-images'
    and (storage.foldername(name))[1] = 'actor'
    and public.owns_active_actor(((storage.foldername(name))[2])::uuid)
  );

create policy actor_images_owner_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'actor-images'
    and public.owns_active_actor(((storage.foldername(name))[2])::uuid)
  )
  with check (
    bucket_id = 'actor-images'
    and public.owns_active_actor(((storage.foldername(name))[2])::uuid)
  );

create policy actor_images_owner_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'actor-images'
    and public.owns_active_actor(((storage.foldername(name))[2])::uuid)
  );

-- ---------------------------------------------------------------------------
-- Deleting a fursona and its pictures: why that is NOT done here.
--
-- The intended design was for `delete_fursona` to remove the actor's objects
-- after marking the row. **It cannot, and the reason is stronger than a missing
-- grant.** Supabase installs `storage.protect_delete()`, a trigger that refuses
-- ANY direct deletion from the storage tables:
--
--   Direct deletion from storage tables is not allowed. Use the Storage API
--   instead. — hint: This prevents accidental data loss from orphaned objects.
--
-- It applies to every role, so no privilege change and no `security definer`
-- gets around it. Adding the delete broke every existing `fursona-delete` test
-- with `42501`, which is how this was found rather than assumed.
--
-- **So the app removes the images first, and then calls `delete_fursona`.**
-- That order is forced, not preferred: the delete policy above resolves through
-- `owns_active_actor`, which requires `status = 'active'` — the moment the
-- fursona is marked deleted its owner can no longer remove its pictures. Doing
-- it the other way round would strand them permanently.
--
-- The failure modes of that ordering, both deliberate:
--
--   * Removal fails → the fursona is NOT deleted and the person is told.
--     Nothing is lost and a second attempt is safe.
--   * Removal succeeds and the delete then fails → pictures are gone from a
--     fursona that still exists. Visible, rare, and preferable to silently
--     stranding storage nobody can ever reclaim.
--
-- `deleteFursona` in `fursona-arrangement.ts` owns that sequence and says so.
