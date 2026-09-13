# The actors feature — how an actor is addressed

## Read this before you change anything here, and again before you finish

**Every change inside `features/actors/` ends by re-reading this note against
what you just did.** Not a skim for the paragraph you touched — a pass asking
whether anything here has become false, including the parts you did not go near.

Nothing automated can do this for you. `pnpm check:docs` is per exported symbol
and compares a symbol against its own code, so it is blind to a note whose
subject is a different file, a deleted prop, a mechanism that moved, or a debt
that was paid. Root rule 18 names that exposure and root rule 30 is what it
cost: three comments describing a caller that never existed, green through every
unit test, and two headline features shipped broken behind them.

The three questions, in order:

1. **Is anything here now false?** A component named that no longer exists, a
   prop that was deleted, a mechanism replaced, a file path that moved, a
   measured number taken before the code changed.
2. **Is anything here still true but no longer the way we work?** A pattern
   superseded, a constraint lifted, a decision reversed. Say the new one; do not
   leave both, because a document that contradicts itself is worse than one that
   is simply wrong — whichever half a reader reaches first is the one they
   follow.
3. **Did this change establish something the next person needs?** A trap you
   fell into, a mechanism that is not obvious from the code, a reason a tempting
   alternative is wrong. That is what this note is for.

**Whoever fixes a fault deletes the note saying it is open.** A sentence naming
a file and a line reads like a measurement and will be believed. A note left
asserting a closed fault is the confident, wrong instruction this repository
warns about everywhere else — and it has happened here three times in twelve
days: the `PreviewThemeHost` atmosphere prop documented after it was deleted,
the drag handle recorded as broken for a day after `#154` fixed it, and a
superseded spec's banner claiming unwritten phases that had already landed.

---

**This note is split by layer (2026-09-12).** `apps/hub/src/features/actors/CLAUDE.md`
(this file) held the addressing model and every layer's own account in one
7,770-line, 491,828-byte document, and `scripts/check-agent-notes.mjs` obliges
whoever changes a file under this feature to update whichever note is
**nearest** to it — walking up from the changed file's directory, and
deliberately not falling through. At that size the obligation was
unfollowable: it put roughly a 170,000-token floor under every task here,
however small, and it exhausted one agent's context outright this week. So the
note is now one per layer — `domain/CLAUDE.md`, `application/CLAUDE.md`,
`presentation/CLAUDE.md` — each holding only that layer's own account, and
this file keeps only the addressing model and the product rules no single
layer owns. A change under `presentation/` now obliges
`presentation/CLAUDE.md`, a few KB, rather than the whole thing.
`infrastructure/` gets no note of its own — nothing in the current file is
about it, and a note should exist because there is something to say — so its
changes fall up to this one.

---

This note constrains code that **does not exist yet**. Everything already
built states its own contract in TSDoc, where `pnpm check:docs` keeps it
honest; what follows is the addressing model the next migration and the public
page must implement, and the traps that model creates.

The schema itself is owned by `supabase/migrations/` at the repository root,
not by this app. Nothing here ships a migration. That schema is consolidated — **every object is defined exactly once** — and
squashed again whenever a change would otherwise stack a redefinition on top of
an existing file. The block model landed as an edit to `0009`, not as a new
file stacked on top. See the root `CLAUDE.md` for when that is legitimate and
what a squash obliges you to update afterwards — **including the part that
bites here specifically: an edit to an already-applied migration never reaches
the live database on its own**, and every style key in the block style bag was
unvalidated at the database level for days because of it.

## Why this feature holds both persons and fursonas

A person actor and a fursona actor are rows in the same `actors` table under
one ownership ledger, so splitting them would put `actor_ref` in two features'
domains and force the cross-feature import the boundary rules forbid. The
barrel is the only way in.

## A person is edited where their fursonas are

`/pages` lists every page somebody owns: their own profile pinned at the top,
then their fursonas. The pencil on any row opens **the same editor** — display
name, avatar, visibility, sections and the theme panel are identical, because a
person's public page is a page like any other and a second implementation of one
screen would drift.

What a person does not get follows from what a person actor IS, not from a rule
invented for the screen:

- **no handle to choose.** Theirs is the provisioned `u-<actor_ref>`, which
  appears in no address and which this app does not display anywhere. The field
  is absent rather than disabled: a locked input invites somebody to look for
  the key.
- **nothing to delete.** You cannot retire yourself.
- **no place in an order.** The row is always first, so there is nothing to pin
  it above.

Two traps this arrangement set, both of which cost real time:

- **The person's editor lives at `/me/edit`, not under `/pages`.** A static
  segment beside `/pages/[handle]/edit` would silently make a fursona with that
  handle uneditable — the reserved-word trap this file already documents — and
  `me` is reserved already, so it costs no new permanently-reserved word.
- **A person's form needs its own schema.** `fursonaSchema` caps a handle at 32
  characters and a person's is 34, so the resolver refused a form on a field
  that is not rendered: no message could appear, because there is no input to
  attach one to, and Save did nothing at all. `personEditorSchema` relaxes only
  that field. Nothing sends it — `update_my_profile` derives its target from the
  token, which is its authorization, and reads three fields, none of them the
  handle.

`/me` carries no editing at all now. What is left there is what only that page
can answer: which address is yours, which platform id every app knows you by,
and the way out.

## Two public pages, not one

```
me.furrycolombia.com/{person_address}            the person's profile
me.furrycolombia.com/{person_address}/{handle}   one of their fursonas
```

Both are locale-prefixed in the usual way (`/es/42`, `/es/42/luna`). The first
segment is a **person address**, which may be a number or text — see below.
Both forms of address resolve to the same profile.

Routes: `app/[locale]/[person]/page.tsx` and
`app/[locale]/[person]/[handle]/page.tsx`.

**A person's profile carries the same shape as a fursona's** — display name,
avatar, and sections — and additionally lists the fursonas they own. One
renderer serves both; the person page passes a list where the fursona page
passes none.

Two consequences for the schema, both of which must land with the first
migration rather than after it:

- **Sections stopped belonging to fursonas** (shipped 2026-08-13).
  `actor_profiles` holds them, and `owns_active_actor()` is the ownership test —
  a person's own row, or a fursona they own. `owns_active_fursona()` survives
  for ARRANGEMENT only: `sort_order` and `featured` are about a person's set of
  fursonas, and there is exactly one person row to order. The write is
  `set_actor_sections`.
- **A person actor becomes publicly readable**, subject to the same
  `visibility` and `status` rules as any other actor. It defaults to `private`,
  so a profile page is **opt-in**: until somebody publishes it, the bare address
  404s while their public fursonas keep working. That is coherent, not a bug.

**There is no reserved-word list, and that is deliberate.** Addresses are
assigned only by an admin, so nobody can squat `admin` or `furrycolombia`; a
list guarding against that would be protecting against ourselves.

What does still hold is a routing fact, not a policy. Next matches a static
segment before a dynamic one, so a few strings **cannot resolve as an address
at all**:

`me` · `picker` · `pages` · `fursonas` · `sign-in` · `api` · `trpc` · every
value in `routing.locales`

**`fursonas` is retired as a section and still reserved.** It was renamed to
`pages` when the person's own profile joined the list — every row there is one
public page — and its old addresses redirect. Freeing the word would let
somebody take it as a vanity, and every link anybody had shared to their own
list would begin resolving to that stranger's profile. That is the reasoning
that never frees a handle, applied to a segment.

Assign one of those and the profile is simply unreachable — `/pages` is the
signed-in list, so a stranger looking for that person gets bounced to sign-in
instead. Not dangerous, but confusing to diagnose, because nothing errors.

This is written down rather than enforced. If it ever bites, the fix is a check
constraint deriving the locales from `routing.locales` rather than repeating
them; until then, whoever assigns a vanity just needs to have read this.

An earlier draft of this used `/@handle`. It is superseded. If you are reading
a document that still says `@`, this note is newer. (Note for whoever revives
the idea: a directory literally named `@[handle]` would not work anyway —
`@folder` is Next's parallel-routes convention and such a segment contributes
nothing to the URL. Confirmed in `node_modules/next/dist/docs`.)

## The locale prefix stays, and not for the reason it looks like

Every address is locale-prefixed — `/es/42/luna`, `/en/42/luna` — because
`routing.ts` leaves `localePrefix` at next-intl's default of `always`.

**Do not enshrine the wrong reason for this.** What SEO needs is a _distinct URL
per language_; one URL serving two languages is what costs you. next-intl's
`as-needed` would satisfy that just as well — `/42/luna` for Spanish, the
default, and `/en/42/luna` for English — with `hreflang` working normally and
both indexing fine. Only `never` would actually hurt.

So the prefix is kept for **uniformity**, not for search: every URL has the same
shape, `public-routes.ts` keeps its simple `/${locale}/…` construction, and the
end-to-end suite does not churn. That is a modest, real gain, and it is the
whole of the argument.

Decided 2026-08-13, knowing the alternative was free. If the `/es` ever becomes
worth removing, `as-needed` is available and costs no traffic — reopen it on
those terms rather than believing SEO forbids it.

## Person addresses: the number, and the vanity

A person has **one permanent number** and **optionally a vanity**, and **both
resolve to the same profile, forever.**

- **The number** is sequential and assigned at provisioning. It is never
  replaced, never reused, and never stops working. #7 is genuinely the seventh
  person here, which is exactly what makes it worth awarding — a random value
  would carry no such meaning.
- **The vanity** is granted by an admin and may be **text or a different
  number**. It does not remove the number; it is an additional way in.

### They share one namespace, and that is the whole design

**A vanity may be a number, so two separate unique columns are wrong.** Person
#500 could take the vanity `7` while person #7 already exists, and `/7/luna`
would then address two different people. One unique index over one namespace is
the only thing that prevents this; two unique constraints look correct and are
not.

So addresses belong in **their own relation**, one row per address, with a
single `unique (lower(address))` covering both forms:

| column      | meaning                                                          |
| ----------- | ---------------------------------------------------------------- |
| `address`   | the URL segment. Unique across every person, case-insensitively. |
| `actor_ref` | the person it resolves to.                                       |
| `kind`      | `number` or `vanity`.                                            |

### Format

**Confirmed 2026-08-13.** An address matches `^[a-z0-9][a-z0-9_-]{0,31}$` and is
unique case-insensitively — the same grammar a fursona handle already follows,
so nobody has to learn two. A number satisfies it as its decimal digits.

A person's `number` row is written at provisioning and **must never be deleted
or updated**. A `vanity` row is added later. If a vanity is ever revoked its row
is removed and the number keeps working — which is why the number must never
be the thing that moves.

Prefer the vanity when rendering a link, and emit `rel="canonical"` to it, so
one page does not accumulate two indexed addresses. Both must keep resolving:
links already shared under the number cannot be allowed to rot.

### Three rules, each of which destroys the feature if broken

- **Only `service_role` writes an address.** A person who can choose their own
  number or vanity makes every badge worthless within a day, and lets somebody
  claim a reserved word or another person's number. There is no self-service
  write here and there must not be one.
- **No address is ever reused for a different person.** It is somebody's
  identity in the community, and recycling it onto a stranger is the same
  mistake as freeing a handle — see soft delete's reasoning in the studio port
  spec.
- **An address never replaces `actor_ref` anywhere.** `actor_ref` remains the
  key every consuming app stores and every RLS policy resolves. An address is a
  URL segment and a display value, nothing more. A route that looks one up must
  resolve it to `actor_ref` before it authorizes anything.

## Fursona handles are unique per owner, not globally

**Confirmed 2026-08-13.** `/42/luna` and `/57/luna` are two different characters
and both are valid.

**Shipped 2026-08-13.** `0001_actors.sql` carries `actors_person_handle_idx`
and `actors_fursona_handle_idx`; the single `actors_handle_lower_idx` it
replaced is gone.

**Two partial unique indexes, not one composite.** A person has
`owner_ref is null`, and Postgres treats NULLs as distinct in a unique index by
default, so `unique (owner_ref, lower(handle))` would silently let two people
share a person handle. Postgres 17 offers `nulls not distinct`, but the partial
pair states the intent instead of relying on a modifier somebody has to notice:

```sql
unique (lower(handle))             where kind = 'person'
unique (owner_ref, lower(handle))  where kind = 'fursona'
```

Person handles therefore stay globally unique — they are the opaque
`u-<actor_ref>` form and nobody competes for them.

Four consequences, all of which landed with it:

- **`create_fursona`'s conflict test** is per-owner, and it raises
  `handle already yours` rather than `handle already taken` — the only clash a
  caller can hit is their own, so the old wording would have told them something
  about a stranger's account that is not true.
- **The quota's justification changed and the quota stayed.** Handle scarcity
  is no longer a reason; sanction evasion and an unbounded client-reachable
  write on a free-tier database are. Soft delete's rationale narrowed the same
  way — a freed handle now returns only to its own owner — so what survives
  there is the quota and the fact that a handle is part of a public address.
- **`docs/integrating.md` says handles are unique per person only** — done, in
  its own section, "`handle` is unique per person, not globally". The contract
  already told apps to key off `actor_ref` and never the handle, so it held —
  but an app that quietly used `handle` as a key would begin colliding across
  users, silently, in a different repository. That section says so out loud
  rather than trusting the existing sentence to be read that way.
- **`/api/actors/mine` keeps returning `handle`** and keeps _not_ returning
  `identity_sub` or `owner_ref`. Nothing about this change relaxes that: the
  linkability columns are picked out by name, and a per-owner handle is not a
  reason to start sending one.

## The listing rule — the one most likely to be got wrong

A person's profile lists **only their `public` fursonas**. Never `unlisted`,
never `private`, never suspended or deleted.

The obvious implementation is "list the fursonas they own", and it silently
destroys the entire meaning of `unlisted`: a link somebody chose not to publish
would appear on a page anybody can read. Write the filter first and the query
second.

This is also what makes `unlisted` genuinely useful rather than a half-step
between the other two, and the distinction is worth stating to a person in
those terms:

| visibility | own page     | listed on the profile | indexable |
| ---------- | ------------ | --------------------- | --------- |
| `public`   | yes          | **yes**               | yes       |
| `unlisted` | yes, by link | **no**                | no        |
| `private`  | no           | no                    | no        |

So somebody who wants a shareable character that is **not** visibly one of
theirs uses `unlisted`. Publishing a fursona as `public` is the act of
associating it with the rest — which is a choice they make per character, and
the reason no separate "show on my profile" toggle is needed or wanted.

## What publishing under a number does and does not reveal

Two fursonas at `/42/` are **provably the same account**. That is intended: it
is what makes a community number worth having.

Know the limit. The person's `identity_sub`, `owner_ref`, email and account are
still never exposed — this is pseudonymous linkage, not identification. But it
is real linkage, and it bites hardest on an **unlisted** fursona: the moment
its link is shared, the recipient can associate it with every other character
under the same number.

So `unlisted` protects the address, not the association. A character that must
be genuinely unlinkable stays `private`. Do not describe `unlisted` to a user
as if it hid the connection.

## Things not to do

- **Never put the owner's handle or `actor_ref` in a URL.** The number exists
  precisely so neither has to be. Publishing `owner_ref` in an address bar
  would leak, permanently and to everybody, the exact column
  `/api/actors/mine` strips by name.
- **Never free a handle**, on delete or on rename. A retired character's name
  becoming available lets somebody register it to impersonate the character
  that wore it. Delete is soft for this reason.

  **Renaming is allowed and the old handle is retired, not released.** It goes
  into `retired_handles` (`0007`), which nothing routes through — its only job
  is to be in the way of `create_fursona` and `update_fursona`. So
  `/{address}/{old}` answers **404 forever**, which is the decision: identity is
  carried by `actor_ref`, no consuming app keys off a handle, and a broken link
  is honest.

  The distinction that matters is between retiring and freeing, and it is easy
  to collapse. Freeing also gives 404 — right up until the owner creates a new
  fursona under the old name, at which point every link anybody shared to the
  old character quietly resolves to a different one, under the same address.
  Retiring is what makes the 404 permanent rather than temporary.

  Retirement is scoped to the owner, because handles are: `luna` retired under
  one person says nothing about `luna` under another.

- **Never list a fursona a stranger could not otherwise find.** See the listing
  rule above; it is the single easiest thing here to get wrong, because the
  wrong version reads perfectly naturally.
- **Never make a hidden actor distinguishable from a missing one.** Private,
  suspended, deleted, owner-suspended and never-existed all answer 404, and the
  404 names nothing — no handle, no display name, no "this is private". A
  distinguishable response is an existence oracle on a page with no session and
  no rate limit in front of it.
- **Never let a public page outlive its owner's suspension**, the person's own
  profile included. A person
  carries the sanction and must not shed it by switching persona; a page that
  ignores the owner's status sheds it in the one place strangers look.

## Two operational traps, so nobody loses time to them a third time

- **Neither `pnpm test:e2e` nor a bare `npx playwright test` loads
  `apps/hub/.env.local`.** It has to be sourced manually, in the same shell
  invocation as the test command. Skip it and the failures look like broken
  Clerk auth or a missing Supabase project, not a missing environment
  variable — two separate agents already lost time chasing that instead.
- **Run `pnpm lint` from the repository root, never from `apps/hub`.** From the
  app, `tailwindcss` resolves from the wrong place and nine
  `better-tailwindcss` rules silently disable themselves — see rule 1 in the
  root `CLAUDE.md`'s toolchain section — so the run reports a false clean
  instead of failing.
- **A `next dev` webServer can crash mid-suite from a Turbopack internal
  panic that has nothing to do with anything under test, and the symptom is
  a wave of unrelated failures rather than one honest one.** Seen on Next
  16.3.0, task 8's round-1 fix pass: a `thread 'tokio-rt-worker' panicked at
turbopack/crates/turbo-tasks-backend/src/backend/operation/mod.rs:292:17`,
  reading `Restore of All for task TaskId … failed in another thread:
restoring failed`, followed by Turbopack's own `an internal panic occurred
outside the per-task panic boundary … please report it` and `Aborting.` —
  after which the dev server process is gone, Playwright's own webServer
  plumbing keeps sending requests to a dead port, and every remaining test
  in the run fails fast (2–4 seconds each, a "connection refused" shape
  rather than a timeout) until the runner gives up and reports a batch of
  specs as "did not run." It struck after only 3 of 174 cases on one run and
  did not recur on an immediate, unmodified re-run — so it is a `next dev`
  process fault, not a flake in any spec. **Recognise it by the panic line
  itself** (`turbo-tasks-backend`, `panicked at`, `Aborting.`) appearing in
  the `[WebServer]`-prefixed log before the first unrelated failure, and by
  the failures spanning many UNCONNECTED spec files rather than clustering
  in one feature. The fix is to re-run the suite against a fresh server, not
  to chase the individual failures as regressions — but confirm the panic
  line is actually there before assuming that; a real regression can still
  produce a wide failure spread for its own reasons.

### The public routes have their own barrel (2026-09-03)

`public.ts` is a second barrel over this feature, holding the six symbols
`/[locale]/[person]` and `/[locale]/[person]/[handle]` render and nothing
else — `PublicProfile`, `ThemeScope`, `publicName`, `isCustomised`,
`readPublicPerson`, `readPublicFursona`. Both public routes import it;
everything else keeps importing `index.ts`.

**It closes the coupling the Motion note above recorded and could not fix in
its own branch.** `index.ts` re-exports `FursonaEditor`, so a route reaching
for `PublicProfile` pulled the whole editor graph — react-hook-form, zod,
`@dnd-kit`, Motion — into its own chunk. Motion is what made that visible
(+109,155 bytes onto two signed-out pages) and was never the whole of it.

**Measured, uncompressed first-load JS from
`.next/diagnostics/route-bundle-stats.json`:**

| route                                      |    before |     after |    delta |
| ------------------------------------------ | --------: | --------: | -------: |
| `/[locale]/[person]` (+ `/[handle]`)       | 1,943,136 | 1,008,803 | −934,333 |
| the six editor routes                      | 1,950,813 | 1,950,989 |     +176 |
| `fursonas` / `sign-in` / `/[locale]` / 404 | unchanged | unchanged |        0 |

Four chunks as well as those bytes: a public route carries 18 where it
carried 22, and now sits three chunks beyond the shared `/[locale]` set
where an editor route sits seven. The +176 on the editor routes is this
file's own bytes. The four unrelated routes read 778,889 / 749,122 /
738,627 / 452,708 exactly as they always have, which is what says nothing
moved except what was meant to.

**Do not confirm the absence by grepping a chunk.** `LazyMotion`,
`hook-form` and `dnd-kit` are all minified out of every chunk on every
route, public and editor alike — probed, on this build, and the answer is
"absent" everywhere whether or not the library is there. The byte total and
the chunk SET are the readings that discriminate.

**Nothing in the boundary graph can hold this.** `eslint.config.mjs` types
`features/*/{index,public}.ts` as `feature-barrel` — both files, because
`boundaries` has no way to say "these two routes get the narrow one", and
leaving `public.ts` untyped would fail `no-unknown-files` instead.
`apps/hub/tests/public-route-imports.test.ts` is the guard: it reads the two
route sources and fails when one reaches `@/features/actors`, when either
deep-imports past a barrel, or when `public.ts` itself re-exports from the
wide barrel or names an editor module. Its anti-vacuity case asserts the
route list is two entries long and that each one imports something at all,
since every other case is about the contents of that list.

**That guard reads STRINGS and a required check is what covers the rest.**
It cannot tell whether a module named in the barrel exports the symbol
claimed from it: the first draft named `infrastructure/actor-page` for
`readPublicPerson`/`readPublicFursona`, which live in
`infrastructure/public-actors`, and all ten cases were green — `next build`
is what refused it, `pnpm typecheck` would have too. Root rule 40's shape,
on a re-export rather than a test file.
