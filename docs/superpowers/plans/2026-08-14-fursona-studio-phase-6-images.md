> **SUPERSEDED on 2026-08-14, the same day.** The Supabase Storage bucket
> this plan built was removed: AeleOS hosts no files, and every picture is an
> address somebody pasted. The reasoning is in the root `CLAUDE.md` under
> "Images are links". This document is kept as the record of what was built
> and why it was undone, not as a description of the code.

# Fursona studio, phase 6 — images

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Somebody can upload a picture instead of pasting a URL — for an avatar and for a gallery item — and the pictures belong to the platform rather than to whatever host they were hotlinked from.

**Architecture:** One public Supabase Storage bucket, written only through RLS policies that resolve ownership with `owns_active_actor`. Paths carry the actor's `actor_ref` and a random name. `avatar_url` and `image_url` keep holding a URL, so nothing in the schema or the contract changes shape.

**Tech Stack:** Supabase Storage, `@supabase/supabase-js`, Next 16 client components, Vitest, `tests/db/` conformance, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-13-fursona-studio-port-design.md`, phase 6 — "a bucket, upload, size limits, and what happens to an image when a fursona is soft-deleted."

## Global Constraints

- **Budget is $0.** Supabase's free tier gives 1 GB of storage and 5 GB of egress a month. The limits below are chosen so a single person cannot consume a meaningful fraction of that, and so a runaway client cannot either.
- **100% statements, branches, functions and lines** on the **measured** set (`src/features/**/*.ts` and `src/shared/**/*.ts`). `.tsx` is deliberately outside it.
- **Every export carries TSDoc stating the contract**; `pnpm check:docs` gates it.
- **Every bug found gets a regression test**, sabotage-verified against the original fault.
- **Both catalogues, always**, Spanish differing and accented; a file containing Spanish needs a `cspell.json` override.
- **The schema stays ten-plus files with every object defined exactly once.** `0013` is the next free number. A new object goes in a new file; replacing one means editing where it lives.
- **In-place schema editing has expired for anything already relied upon.** Live now holds real structure and the migrations are stable; from here on, changes are append-only `create or replace` unless nothing has depended on the object yet.
- **Every migration is applied to the live database by hand and verified by querying it.**
- **No `@param props`** on a destructured component; `@returns` alone.

## Five decisions this phase makes

### 1. The bucket is public, and the consequence is stated rather than hidden

A private bucket would mean signed URLs. Those expire, which makes them useless in a page that is meant to be shared, cached and indexed — and a public fursona page is exactly that.

So the bucket is **public to read**, and writes are governed by RLS. The consequence must be said plainly, in the interface and not only here:

> **An image you upload stays reachable by its URL even if you later make the fursona private.** Making a fursona private removes it from the pages; it does not un-publish a picture somebody already has the address of.

Paths are unguessable — `actor/{actor_ref}/{uuid}.{ext}` — so nobody browses their way to one. But `actor_ref` is not a secret (the picker puts it in a query string), and an URL that has been shared has been shared. Saying so is the honest design; pretending otherwise would be the bug.

### 2. `avatar_url` and `image_url` keep holding a URL

Nothing in `actors` or `actor_profiles` changes. An uploaded image simply produces a URL that goes in the same column a hand-typed one did.

That keeps three things true: `docs/integrating.md` needs no change, `0009`'s section validation needs no change, and **somebody can still paste a link to art hosted elsewhere** — which matters, because most furry art already lives on somebody else's gallery and forcing a re-upload would be hostile.

### 3. Limits are enforced twice, and the bucket is the one that counts

The bucket carries `file_size_limit` and `allowed_mime_types`. The client checks the same numbers before uploading so somebody hears about a too-large file immediately rather than after a slow upload.

**The bucket's limit is authoritative and the client's is a courtesy**, exactly as with the section limits — and it gets the same treatment: a test reads the numbers out of the migration and fails if the client's copy drifts.

Proposed: **2 MB** per file, `image/png`, `image/jpeg`, `image/webp`, `image/gif`. At 2 MB, one person hitting the fursona quota with a full gallery each is still a rounding error against 1 GB.

### 4. Deleting a fursona deletes its images

`delete_fursona` is soft: the row and its handle survive so nobody can register a retired character's name. Its **pictures** are a different question, and they should go.

Nothing restores a deleted fursona — there is no undelete — so the images are unreachable weight against a 1 GB budget from the moment the row is marked. Keeping them would mean paying storage forever for pages nobody can open.

`delete_fursona` therefore also removes that actor's objects. This is the one place the schema touches `storage.objects`, and it must be a `security definer` function so it works through the same authorization the delete already did.

**A person's own images are not deleted with a fursona, and a person cannot be deleted at all**, so there is no equivalent path for a profile picture.

### 5. Upload happens in the browser, not through a route handler

The client already holds a Supabase client bound to the person's Clerk token. Uploading directly means the file never passes through the Next server, which on a hobby-tier deployment is both the cheapest and the fastest path — and it means the storage RLS policy is the only thing that has to be right.

A route handler would add a second place to get authorization wrong.

---

## File Structure

| File                                                                         | Responsibility                                                      |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `supabase/migrations/0013_actor_images.sql`                                  | The bucket, its policies, its limits, and the delete cascade.       |
| `tests/db/actor-images.test.ts`                                              | Who may write where, and that deleting a fursona clears its images. |
| `apps/hub/src/features/actors/domain/image-limits.ts`                        | The mirrored size and type limits.                                  |
| `apps/hub/tests/image-limits-match-migration.test.ts`                        | The drift guard.                                                    |
| `apps/hub/src/features/actors/infrastructure/actor-images.ts`                | `uploadActorImage`, returning the public URL.                       |
| `apps/hub/src/features/actors/presentation/image-field.tsx`                  | Upload-or-paste, used by the avatar and by a gallery item.          |
| `apps/hub/tests/actor-images.test.ts`, `apps/hub/tests/image-field.test.tsx` | Their suites.                                                       |

---

### Task 0: Branch

- [ ] **Step 1: Cut from `origin/main` and confirm the base**

```bash
git fetch origin
git checkout -b feat/studio-phase-6-images origin/main
git log --oneline origin/main..HEAD
```

Expected: no output.

---

### Task 1: `0013` — the bucket

**Files:**

- Create: `supabase/migrations/0013_actor_images.sql`
- Test: `tests/db/actor-images.test.ts`

- [ ] **Step 1: Write the failing conformance tests**

- the bucket exists, is public, and carries the size and MIME limits;
- an owner may insert an object under `actor/{their fursona's ref}/…`;
- an owner may insert under **their own person ref** — a profile picture is the same operation;
- a stranger may **not** insert under somebody else's actor;
- a **suspended** person may not insert at all, because `owns_active_actor` resolves through `current_person_ref()`;
- `anon` may not insert anything;
- `anon` **may** select — the bucket is public to read, and that is decision 1;
- an owner may delete their own object and not a stranger's;
- **`delete_fursona` removes that fursona's objects** and leaves the owner's other actors' objects alone. This is decision 4 and the assertion the natural implementation forgets.

- [ ] **Step 2: Push and watch `conformance` fail**

- [ ] **Step 3: Write the migration**

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'actor-images', 'actor-images', true, 2097152,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
```

Then three policies on `storage.objects`, each scoped to `bucket_id = 'actor-images'` and resolving the actor from the path with
`public.owns_active_actor(((storage.foldername(name))[2])::uuid)` — insert, update and delete. Read is public and needs no policy beyond the bucket's own flag.

The path shape must be stated where the policy is, because the policy depends on it: `actor/{actor_ref}/{random}.{ext}`, so `foldername(name)[1]` is the literal `actor` and `[2]` is the ref.

Then `create or replace function public.delete_fursona(uuid)` — `0007`'s body unchanged except that after the update succeeds it deletes from `storage.objects` where `bucket_id = 'actor-images'` and the name is under that actor's folder. Say in the comment why the images go while the row and its handle stay.

- [ ] **Step 4: Push, green, apply to live, verify by querying**

```sql
select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'actor-images';
select polname from pg_policy where polrelid = 'storage.objects'::regclass;
```

- [ ] **Step 5: Commit**

---

### Task 2: The mirrored limits and the reader

**Files:**

- Create: `apps/hub/src/features/actors/domain/image-limits.ts`
- Create: `apps/hub/tests/image-limits-match-migration.test.ts`
- Create: `apps/hub/src/features/actors/infrastructure/actor-images.ts`
- Test: `apps/hub/tests/actor-images.test.ts`

- [ ] **Step 1: Write the failing tests**

The drift guard reads `0013` and asserts the byte limit and the MIME list match the client's — **and asserts each was actually found**, because a regex that matches nothing passes a comparison against nothing. That trap has already cost this repository once.

`uploadActorImage(client, actorRef, file)`: refuses a file over the limit and a type not on the list, **before** uploading; names the object `actor/{actorRef}/{uuid}.{ext}`; returns the public URL; and throws with the storage error's message when the upload fails rather than returning an empty string.

- [ ] **Step 2: Fail, implement, pass**

- [ ] **Step 3: Commit**

---

### Task 3: The field

**Files:**

- Create: `apps/hub/src/features/actors/presentation/image-field.tsx`
- Modify: `fursona-editor.tsx` (the avatar) and `section-item-fields.tsx` (a gallery item)
- Modify: both catalogues
- Test: `apps/hub/tests/image-field.test.tsx`

- [ ] **Step 1: Write the failing tests**

- it offers both: a file input and the text field that already existed, because pasting a link to art hosted elsewhere must keep working (decision 2);
- choosing a file uploads it and puts the returned URL in the form;
- a file over the limit is refused with a message naming the limit, and **nothing is uploaded**;
- a type not on the list is refused the same way;
- a failed upload reports it and leaves whatever was in the field alone.

- [ ] **Step 2: Fail, implement, pass**

The field must say, once and near the control, what decision 1 requires: an uploaded image stays reachable by its URL even if the fursona is later made private. Both catalogues.

- [ ] **Step 3: Commit**

---

### Task 4: The whole gate, and the pull request

- [ ] **Step 1: Run everything**

```bash
pnpm --filter hub test:coverage
pnpm --filter hub typecheck
pnpm --filter hub build
pnpm lint
pnpm check:docs
pnpm check:tools
pnpm check:contrast
pnpm --filter hub test:e2e
```

- [ ] **Step 2: Open the pull request**

The body must state decision 1's consequence plainly — a public bucket means an uploaded image outlives the fursona's visibility — and that **no end-to-end test uploads anything**, because the upload surface is signed-in and no signed-in e2e exists.

---

## What this phase does not do

- **No image processing.** No resizing, no format conversion, no thumbnails. Supabase's transformation API is a paid add-on, and the budget is $0.
- **No moderation.** There is no report flow and no scanning. Suspension already removes an actor's pages from public view, which is the lever that exists.
- **No migration of hand-typed URLs.** Existing `avatar_url` and `image_url` values keep working exactly as they are.
