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

## Blocks: a container arranges, a leaf holds content

A page used to be a flat array of sections, each with a `type`, and **that type
decided two unrelated things at once**: how the section's children were
arranged, and what kind of thing each child was. `gallery` was a grid _of
pictures_ and `links` a list _of links_, so every new idea had to become
another welded pair — and "a player beside a paragraph beside a table" was not
merely unsupported but unrepresentable, because every item in a section
rendered identically.

A page is a **tree of blocks** now, and the two axes are separate.

- A **container** decides arrangement and nothing else. It holds children and
  lays them out in a `mode`.
- A **leaf** is one piece of content, rendered on its own `kind`'s terms. A
  container may hold leaves of different kinds side by side, which is exactly
  what the welded types could not express.
- **A section is a container at depth 0 that carries a name.** That is what
  collapses two parallel models into one — one style bag, one renderer, one
  validator, and one editor component when phase 3 writes it. A container
  further down may name itself too; an unnamed one is a group with no heading,
  which is the ordinary case for a container inside another and the only honest
  rendering, since inventing a heading would put words on somebody's page that
  they did not write.

`domain/block-schema.ts` is the vocabulary. The renderer is **four files now
(2026-08-27)**, and the split is worth knowing before you go looking:

- `presentation/block-contract.ts` — `PageContext`, `LeafProps`, `LeafRenderer`
  and the surfaces every kind shares. **Nothing here renders**, which is what
  lets a kind's module import it with no cycle.
- `presentation/blocks.tsx` — what ARRANGES blocks: the container modes, the
  page shell, and the `LEAVES` / `MODES` registries.
- `presentation/text-leaves.tsx` — the kinds made of an author's own WORDS:
  `text`, `quote`, `stat`, `progress`, `table`. None of them reaches a network.
- `presentation/media-leaves.tsx` — the kinds that show something hosted
  ELSEWHERE: `picture`, `embed`, `player`, `jukebox`. The provider allowlist and
  the frame tables are consumed here and nowhere else among the leaves.
- `presentation/link-leaves.tsx` — the two that POINT somewhere without showing
  it: `link` and `social`. They always draw a control, whatever host was pasted.
- `presentation/identity-leaves.tsx` — the five that draw the ACTOR.

It was one 2,333-line file until the kinds moved out; `blocks.tsx` is 1,367 now
and the largest leaf module is 449 lines.

**The grouping is by what a kind REACHES, not by what it looks like**, and that
is the line worth keeping: a change to the embed allowlist cannot reach
`text-leaves.tsx`, and nothing in `link-leaves.tsx` resolves a provider. Card
shape would have grouped `stat` with `link` and taught you nothing.

**Splitting them made two fallbacks visible that were three calls inside one
file.** `PictureLeaf` degrades to `PlainLeaf` when an address will not pass
`safeHttpUrl`, and `EmbedLeaf` degrades to `SocialLeaf` when no provider claims
it — so `media` imports `text` and `link`, and neither imports back. A DAG, and
`madge` says so.

Nothing about the enforcement changed: `satisfies Record<LeafKind, LeafRenderer>`
still sits on the registry, so a kind with no renderer is a build failure.

This note says what the model IS; their TSDoc says what each piece does and does
not do, and between them they are longer than this section, for a reason.

### Nothing was thrown away — every old type is somewhere in here

The old list was a flattened cross-product, so unwelding it expands what is
expressible by more than another welded pair ever could while losing none of
the work. Somebody looking for `gallery` should find this table rather than
conclude it was dropped.

| the old `type`   | what it is now                                                |
| ---------------- | ------------------------------------------------------------- |
| `cards`          | a `grid` container                                            |
| `gallery`        | a `grid` container holding `picture` leaves                   |
| `masonry`        | a `masonry` container                                         |
| `carousel`       | a `carousel` container                                        |
| `tabs`           | a `tabs` container                                            |
| `accordion`      | an `accordion` container                                      |
| `timeline`       | a `timeline` container                                        |
| `links`          | any container holding `link` leaves                           |
| `socials`        | any container holding `social` leaves                         |
| `posts`          | any container holding `embed` leaves                          |
| `video`, `music` | `embed` leaves — NOT `player`, which means something else now |
| `stats`          | `stat` leaves                                                 |
| `quote`          | `quote` leaves                                                |
| `progress`       | `progress` leaves                                             |
| `two-column`     | a `table` leaf — or a `stat` leaf, for a single pair          |

What the old list had no entry for at all, and the model now admits without a
new layout: a `text` leaf for a paragraph of prose, and a `table` leaf for the
thing the request actually asked for.

**`two-column` is the one row that changed shape rather than moving**, and it
is worth reading rather than skimming, because it is the row the decomposition
originally got wrong. It said "container, paired-column mode" — filing a
CONTENT concern as an arrangement. What made that layout worth having was never
the two columns: it was the PAIRING, a `<dl>` whose `dt` and `dd` a screen
reader announces together, dropping a whole row when its localised value is
empty rather than rendering half of one. That is a property of what an item IS,
so it belongs to `stat` (one pair) and `table` (many). Two columns of PROSE, if
anybody ever wants them, are a style key — `align: "stretch" | "start"` — which
composes with every mode instead of being welded to one.

**The drop rule came with the pairing, and one half of it deliberately
inverts.** A row whose localised value is empty still disappears entirely,
label and all: a `dt` with no `dd` is invalid markup, and because the value is
read AFTER `contentFor` has chosen a language, a row written in one language
only is a row for readers of that language. But where the flat layout then
dropped the whole list — correctly, since an item was one row among others and
dropping it closed the gap — **a leaf must not.** A block sits in a grid track
its author deliberately placed it in, so a leaf that vanished would leave a
hole nothing on the page explains. `stat` and `table` drop the pair or the row
and then fall back to the plain leaf, which shows the author's own words. Never
nothing, and never a bordered box with nothing in it either.

### The container modes

| mode        | the mechanism it earns its place by                                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stack`     | the resting state — children down the page, arranging nothing                                                                                     |
| `grid`      | uniform tracks: `repeat(<spaces>, minmax(0, 1fr))`, filled row by row                                                                             |
| `masonry`   | CSS multi-column, which has no rows at all, so a short item is followed by whatever comes next instead of waiting for the tallest one beside it   |
| `carousel`  | scrolls sideways, at every width                                                                                                                  |
| `tabs`      | one panel at a time — a radio group and `:checked`, so it stays a server component and every panel is reachable by keyboard with nothing hydrated |
| `accordion` | disclosures, every one openable at once, where `tabs` is a switcher                                                                               |
| `timeline`  | a sequence, marked and ordered                                                                                                                    |

**A mode earns its place by a mechanism none of the others has, not by another
set of numbers** — the same bar the layout list always set itself. What is new
is a way of applying that bar which does not depend on arguing about
mechanisms. `columns` was in this list and **was removed before anything could
store one**, and it failed in a way nobody had to debate: three consecutive
tasks wrote down three different meanings for it. `block-schema.ts` said it
laid uniform tracks exactly as `grid` does; `0009` said **`grid` fills them
across and `columns` down** — a real mechanism, column-major fill order, which
nothing else has and which was never implemented; and the renderer shipped the
same grid as `grid` with `items-start`. **A vocabulary entry whose meaning
three consecutive authors cannot state the same way twice does not have a
mechanism — it has a name each of them filled in from context.** That test is
better than "is there a mechanism" because it is observable. The track count is
already a PARAMETER of `grid`, so a second mode for it was the welded
cross-product this model exists to undo, one level down; and `items-start` is a
dial, which belongs in the style bag where it composes with every mode.

### The leaf kinds

| kind       | what it holds        | `title_*`       | `description_*`   | also reads                 |
| ---------- | -------------------- | --------------- | ----------------- | -------------------------- |
| `text`     | a paragraph          | heading         | body              | —                          |
| `link`     | a button out         | button text     | subtitle          | `link_url`, `icon`         |
| `picture`  | a picture            | alt text        | caption           | `image_url`                |
| `embed`    | anybody's embed      | frame title     | caption           | `link_url`, `icon`         |
| `player`   | a retro media player | player name     | caption           | `rows`, `icon`             |
| `jukebox`  | a retro music player | player name     | caption           | `rows`, `icon`, `link_url` |
| `social`   | a branded chip       | chip label      | **not rendered**  | `link_url`, `icon`         |
| `stat`     | one fact             | **the label**   | **the value**     | —                          |
| `quote`    | a quotation          | **who said it** | **what was said** | —                          |
| `progress` | one measured thing   | **the label**   | **the value**     | —                          |
| `table`    | rows of paired cells | the caption     | a note under it   | `rows`                     |
| `avatar`   | the actor's portrait | **alt text**    | —                 | the ACTOR                  |
| `handle`   | what names the actor | a label above   | —                 | the ACTOR                  |
| `name`     | the display name     | a label above   | —                 | the ACTOR                  |
| `owner`    | a link to the owner  | the heading     | —                 | the ACTOR                  |
| `fursonas` | the fursona list     | the heading     | —                 | the ACTOR                  |

**`stat`, `quote` and `progress` invert the pair**, and that is the one thing
here somebody will get wrong — it has been got wrong once already. Everywhere
else the title is the big text; in those the description is. The inversion is a
RENDERING fact and never a schema one: the fields keep their generic names on
the block, so switching a kind to look at it and switching back finds what was
typed still there.

`progress` is the kind that additionally tries to READ its value.

#### The identity leaves (2026-08-19) — content that is not typed

**The last five are a new CATEGORY, not five more entries.** Every kind above
draws what its author typed into the block; these draw the ACTOR, resolved by
the renderer out of `PageContext`. They live in
`presentation/identity-leaves.tsx` rather than beside the content kinds, because
they are a different thing to read.

**They stopped restating the props contract on 2026-08-27.** This module used
to declare its own `IdentityLeafProps` / `IdentityLeafRenderer`, with a comment
saying why: importing the real ones would have made it depend on the file that
registers it. A restated interface is a second copy free to drift, so the
contract moved to `block-contract.ts` instead and both leaf modules import it.

They exist because the page's furniture used to be welded. `public-profile.tsx`
rendered a portrait, a display name, a handle and a fursona list as chrome
above and below the blocks, and none of it could be moved, resized, styled,
repeated or placed anywhere else. It was the same mistake `gallery` and `links`
were — arrangement married to content — one level up.

Four things about them that are easy to get wrong:

- **They still carry a title, and it is not an oversight.** `title_en` is
  required and non-empty at the strict write AND in `validate_block`, so a
  fieldless leaf is unrepresentable. Each uses the field the model insists on
  rather than carrying a dead one: `avatar`'s is the portrait's ALT TEXT, which
  is the only place a screen reader learns whose picture it is; `handle` and
  `name` label their value the way `stat` labels its number; `owner` and
  `fursonas` name the heading over what follows, in the author's own words.
  Those two titles are **a person's writing, not next-intl** — a missing
  `title_es` is somebody who has not written the Spanish yet.
- **`handle` shows a person's ADDRESS, never their handle.** A person is minted
  as `u-<actor_ref with the hyphens out>`, which on a person is the `owner_ref`
  of every fursona they own — the exact column `/api/actors/mine` strips by
  name. It also carries the `public-actor-name` test id, which the end-to-end
  suite reads as "this page loaded and names its actor": that id belongs on
  this kind rather than on `name`, because `handle` is required on every page
  and a display name is optional.
- **`name` may render nothing, and that is the one kind allowed to.**
  `display_name` is nullable. It is safe because `handle` is required, so
  something always names an actor and the display name is decoration on top of
  a guarantee.
- **`owner` shows the address always and the owner's name and picture only
  sometimes**, and decides neither. A fursona's page is governed by the
  fursona's visibility rather than its owner's, so a public character routinely
  belongs to somebody whose own profile 404s — `public_fursona` withholds their
  name and portrait in that case. The address is safe unconditionally: it is
  already the first segment of the page's own URL.

**An EDITOR resolves all of this the same way a visitor does, and for a while
two of them did not.** The identity leaves render from `PageContext`, which
each editor route builds by hand — and two of those routes filled a field with
a constant rather than a read. `/pages/[handle]/edit` hardcoded the owner's
name and portrait to `null`, so every fursona's required `owner` block
previewed as the anonymous card even for an author whose profile is public:
304px on the page against 280px in the preview, with the name missing.
`/me/edit` hardcoded `fursonas: []`, so the required `fursonas` block previewed
as a heading over nothing while the page carried a grid of cards — 330px
against 72px. And `/pages/new` passed no `owner` key at all, which is not an
empty card but NO card: `OwnerLeaf` returns null without one, so a required
block rendered nothing on the one screen where somebody is choosing where to
put it.

All three ask `readPublicPerson` now — the same `public_person` a stranger
reads, so the visibility gate is asked rather than re-derived, and a private
profile answers nothing and keeps the anonymous card, which is what a visitor
genuinely gets there. The consequence to know: **a person whose own profile is
still `private` — the minted default — previews an empty fursona list**,
because there is no public page for them yet. That is honest and it is not
obviously the kindest answer; the alternative is filtering `listMyActors` by
visibility, which is `0012`'s rule copied into a route, free to drift.

`fursonas` keeps its heading when the list is empty. `FursonaCardList` answers
null for an empty list, which was right while it was chrome the page appended
and wrong for a block somebody deliberately placed: the grid track it sat in
would be a hole nothing on the page explains. `stat` and `table` already settle
this the same way.

#### At least one of each — and what that does NOT guarantee

A page must carry `avatar`, `handle`, and `fursonas` on a person or `owner` on
a fursona. **At least one, never exactly one**: any number of copies, at any
depth, in any container. `owner` is refused on a person's page and `fursonas`
on a fursona's, because neither has anything to render there.

Enforced in three places, and the duplication is deliberate:
`set_actor_sections` is what makes it a guarantee, the save boundary makes the
refusal legible without a round trip, and the editor withdraws the remove
control on the last copy. All three ask `missingRequiredKinds`, so they cannot
disagree about what a complete page is. The database side walks the tree with
`block_kinds_present`, which descends through `children` ONLY — a `$.**.kind`
jsonpath would find a `kind` key anywhere in the payload, so a crafted object
under an unvalidated key could satisfy the rule without ever being a block.

**The guarantee is that the block EXISTS IN THE TREE, not that a visitor sees
it, and that hole is accepted rather than overlooked.** `accordion` renders its
children collapsed and `tabs` shows one at a time, so a required block inside
either satisfies every layer while showing a stranger nothing; colour can hide
one just as completely, and deliberately, since an author's colours are
rendered exactly as picked. `tests/db/blocks.test.ts` asserts that hole is open
as a PASSING case, so nobody reads the enforcement and concludes it covers
visibility.

That was weighed against putting the ownership FACT in the page chrome —
outside `SKIN_SCOPE`, derived from the row, un-styleable — and declined: the
ruling is that every part of the page belongs to its owner. If accountability
ever has to be genuinely enforced, the chrome route is the design to revive,
and it composes with this rather than replacing it.

**Absence means the default POSITION, not deletion.** `withRequiredBlocks` runs
on every read path, so a page naming none of these — which is every page stored
before they existed — reads back with the header it always had. That is why no
page needed migrating. It applies to a PARSED page only: `readActorPage`
answers `null` for a shape it could not read, and supplying a header there
would turn "unreadable" into "here is a page" that the next save writes over
somebody's content.

A page missing only SOME of them gets exactly the leaves it lacks, never the
composed section — handing back the whole header would stand a second portrait
beside the one its owner kept.

It may be deleted once every stored page carries them explicitly, and **nothing
can tell you when that is** — the same condition `withSpacesFromColumns`
carries.

**A page being CREATED gets them too, and forgetting that made the product
unusable for a day.** "Every read path" was the rule, and the create page reads
nothing — there is no actor yet — so `FursonaEditor` defaulted its sections to
`[]`, which `set_actor_sections` refuses for naming none of the three. A
fursona built by hand could not be saved AT ALL: the banner said the sections
were refused, over a page whose author had done nothing wrong. Only the
template path worked, because applying one runs the shim over the result. The
default is `withRequiredBlocks([], kind)` now, so the rule is "every page holds
them from the moment it opens" rather than "every read applies them".

**That made every page non-empty, which broke a control that had been asking
the wrong question all along.** The template picker confirms before replacing,
and its gate was `blocks.length > 0` — true of a page nobody had touched, so a
brand-new fursona warned its owner about losing work they had not done. It asks
`holdsNothingAuthored` now: a page is the author's when it is neither empty nor
byte-for-byte what `withRequiredBlocks` seeds. It errs towards ASKING, which is
the safe direction — the costly mistake is replacing somebody's page without
one.

**It takes the THEME as well, since 2026-08-28, and the gap it closes is the
same shape one level along.** A chosen look is the author's work and the blocks
cannot see it: somebody who picked colours and touched nothing else has a page
that is still byte-for-byte the scaffold, so every question the predicate asked
answered "nothing here is theirs" while a palette they chose was about to go.
The parameter is optional, so a caller with no theme to hand keeps the old
behaviour rather than being made to invent one, and it asks `isCustomised`
rather than comparing against a default — that is already the question "has
this person chosen anything", and a second implementation of it would drift.
The discriminating case is the negative one: an untouched theme and a null one
must both still answer true, or an implementation reading `theme !== undefined`
satisfies the positive case and is wrong about every page that opens with a
default.

**A person's scaffold is two sections, not one**, and this is the part that
looks like a bug when a test is written against a fursona's. The composed
header carries `owner` for a fursona and nothing in its place for a person;
their third required kind, `fursonas`, is not part of that header at all, so it
is APPENDED in a section of its own — after everything the author has, not
beside the header.

**A page also REFUSES one kind, and the client knows it now.** `REFUSED_KIND`
is the mirror of `REQUIRED_KINDS` — `owner` is refused on a person's page and
`fursonas` on a fursona's, because neither has anything to render on the
other. It lived only in `set_actor_sections` until 2026-08-27, which is why
the kind select offered a choice the database rejected. It is pinned to `0009`
by `block-limits-match-migration.test.ts` like every other vocabulary written
down twice.

The kind select is narrowed by `offerableLeafKinds` and shows a stored kind
it cannot offer as a disabled option, so a page saved by a newer build is not
silently retyped. `leaf-kind-options.test.tsx` carries a positive assertion
beside each negative one, because an empty select satisfies every
`not.toContain` ever written.

`progressValue` (`domain/progress-value.ts`) accepts a fraction (`3/5`), a
percentage (`60%`) or a bare number (`60`), decimals allowed wherever a whole
number is, clamped to 0–100 because nothing stops somebody writing `150`.
**Anything it cannot read renders the plain row with no bar at all** — prose, a
unit it does not know, an empty description — and that refusal is the common
case rather than an edge, since a template's unedited placeholder is prose.
Read its TSDoc before touching the parse: a fraction whose sides both overflow
to `Infinity` once reached the DOM as `width: NaN%`, which CSSOM rejects, which
left the bar at its parent's full width — the "refuses nothing, shows nothing"
trap inverted into a bar reading 100% on nonsense, which is worse because it
looks like an answer.

**`social` renders no description and the editor must not offer it one.** Its
sub-line is the handle `resolveSocial` derived from the address, which is all a
chip has room for. A control that accepts what somebody types, stores it,
refuses nothing and renders nothing is the worst kind — there is no way for
them to learn it did nothing.

**`domain/leaf-fields.ts` is where that rule lives now**, one row per kind
saying whether the renderer reads the address, the icon, the picture, the rows
and the description; `LeafEditor` offers exactly what it says yes to. It
replaces the flat editor's `LINKED`/`ICONED`/`PICTURED` sets, and it is
**pinned to the renderer rather than trusted against it** —
`leaf-fields.test.tsx` draws each kind in every state its own renderer can
reach, with a field written and without, and fails when the markup differs for
a field the table calls unread or fails to differ for one it calls read. That
guard is not decoration: written from the table alone it disagreed with
`blocks.tsx` on three cases, all for the same reason. **`player` and `post`
read the ICON**, because an address neither can frame falls back to a link or
to a branded chip and both draw one — and a Bluesky `post` is ALWAYS the chip,
since `embed.bsky.app` hard-refuses the handle a shareable address carries. A
single-state measurement reports that as a field nobody reads.

### The players (2026-08-19) — and a name that was taken back

Three kinds where there were two, and one of the two changed meaning. Read this
before assuming `player` still means what it did.

| kind      | what it is                   | plays                               |
| --------- | ---------------------------- | ----------------------------------- |
| `embed`   | ANY provider's own embed     | whatever `resolveEmbed` recognises  |
| `player`  | a retro media player of OURS | audio and video files; a video pane |
| `jukebox` | a retro music player of OURS | audio files; no video pane          |

**`embed` is `post` renamed, and it absorbed `player`.** The two embed kinds
were one leaf under two names: `LEAF_FIELDS` gave them byte-identical entries,
both resolved through `EMBED_PROVIDERS` and both rendered `EmbedFrame`. Nothing
about an embed varies per leaf — the height, the shape and the aspect all come
from the provider table — which is why no per-embed option was ever needed and
why the merge cost nothing. It is called `embed` rather than `post` because it
holds YouTube, Spotify and Tidal as well as Instagram and Mastodon, and "post"
described about a third of what it does.

**The two kinds differed in exactly two ways, and one of them has been
misdescribed once already — do not repeat it.** `player` passed `parentHost` to
`resolveEmbed` and `post` did not, so the same Twitch address framed under one
and chipped under the other. That looks exactly like a bug and **it was
deliberate**, with the reason written above the case: Twitch is the only
provider reading `parentHost`, its player is a `video` shape rather than a post,
and a video did not belong in a post's 420px column. A review of this branch
called it "a latent bug nobody chose" in a commit message, a pull request and
the spec before anybody read the comment. The merged kind passes `parentHost`
now — but because the premise went away, not because the old behaviour was
wrong. There is no post's column, and a chipped Twitch beside a framed YouTube
would be the one arbitrary case.

**A `player` has a video pane and a `jukebox` does not, and that line is
LICENSING rather than technical.** A playlist can hold a YouTube address and
play it by driving the provider's own embed with `postMessage` over
`enablejsapi=1` — no third-party script, no `script-src` origin, and `frame-src`
already allows the host. But YouTube's terms forbid hiding or obscuring the
player, so only a chrome with somewhere to SHOW it may offer that. Winamp's
275x116 window, whose largest free area is a 76x16 visualiser, has nowhere.
Splitting by capability rather than by product is what makes the rule survive
the next chrome.

**Not one new field was added for any of it.** A playlist is `rows` — the same
field a `table` leaf uses — because that field is already capped by the live
database at 50 rows of 8 cells, with no migration written and no statement
hand-applied. `icon` names the CHROME, and `link_url` on a `jukebox` is the
`.wsz` skin. The whole database delta for the feature is the kind list in
`is_block_kind()`.

Two consequences that are easy to get wrong:

- **`icon` is not an icon for these two kinds.** `LEAF_FIELDS` says what the
  RENDERER reads, which is what `leaf-fields.test.tsx` measures; which control
  the EDITOR draws for it is a separate decision, and for these two it is a
  chrome picker rather than the glyph picker.
- **The skin is deliberately absent from `LEAF_FIELDS`.** Its sheets arrive from
  a fetch in an effect, so writing one changes no static markup and that table
  cannot honestly claim it is read. It gets a bespoke control with a live
  preview instead.

**A chrome is DATA — a token set over one component per kind** — which is what
makes a long roster cost a few hundred bytes rather than a chunk each.
`chromes.ts` holds it. Winamp is the ONE exception and carries a `sprites` flag:
it is a sprite engine reading a real `.wsz`, so it sits behind its own dynamic
import and a page wearing any other chrome never loads it.

**Winamp is deliberately NOT the default jukebox chrome**, and the reason is not
taste. Being behind a dynamic import it produces no server markup, so a public
page wearing it by default would render nothing for its player until hydration —
where every other leaf here paints something before script runs. `EmbedFrame`
sets that standard. `leaf-fields.test.tsx` is what caught it, by finding that a
`jukebox`'s claimed fields changed no static markup.

**No skin artwork is in the repository, and none should be added.** A control
whose sprite is missing draws itself from the chrome's tokens in the classic
layout's own box, so the unskinned window is this app's own look, a museum skin
makes it authentic, and there is ONE rendering path rather than a special
unskinned mode that would drift. It falls out of `controlStyle` answering the
BOX even with no picture — which is also why a skin supplying only some sheets
draws the rest of the window instead of piling it into the top-left corner.

### Depth is capped at three, and the database is what enforces it

A section, a container inside it, a container inside that, then leaves.
`MAX_DEPTH` says so in `block-schema.ts` and `validate_block` in `0009` says so
again, **with an explicit counter passed down its own recursion**.

The duplication is the design rather than belt-and-braces.
`actor_profiles.sections` is user-controlled `jsonb`, so an unbounded recursive
validator over it is a stack whose depth somebody else gets to choose; a cap in
the editor is a suggestion and a cap in `set_actor_sections` is the guarantee.

**And that is a guarantee only because the write grant on `actor_profiles`
names its columns.** `authenticated` may `update` exactly `sort_order` and
`featured`; `sections` and `theme` are reachable only through the two
`security definer` functions. Before that, PostgREST exposed the table and a
signed-in person could `PATCH` `sections` on their own row with no cap applied
at all — the sentence above was a convention wearing a guarantee's words.
`tests/db/blocks.test.ts` pins it in both directions: the direct write is
refused, and arranging still works.
The Zod side is not a walk anybody has to remember to run either — every
exported schema is built by a factory that threads depth through the recursion,
so a container at the cap meets an option that fails **by name**, and both
sides carry that same `TOO_DEEP_MESSAGE` string. Without it, a container one
level too far is refused for naming a `kind` no leaf has: the editor would tell
somebody their block kind is invalid and their title is missing, neither of
which they got wrong. That is the fault class this repo already paid for once,
when a missing `nuqs` adapter was reported as "we could not load your
identity".

Three is where two independent costs bite. Beyond it, "where am I" stops being
answerable at a glance on a phone. And style recalculation is linear in DOM
size — measured at 15.6 ms on the editor's own DOM, times roughly twelve under
CPU throttling — which nesting multiplies.

**The cap's arithmetic is the thing to be careful about, not the cap.** Two
people got it wrong independently and from opposite directions on the branch
that built this: a leaf's deepest seat is three containers down, and a test
that nests two and calls itself "at the deepest level" is sitting one level
above the only place the refusal it exists to prove can happen.

### A container is its SPACES, and there are no spans

**`columns` and `span` are gone and nothing replaced them.** A container
declares `spaces` — how many places it lays ACROSS, from one to six — and every
child takes exactly one of them, filling row by row so the section grows
downward. Where a block sits is entirely its parent's business, and its width
is not a property of the block at all.

**A wide thing is a place with a bigger SHARE, and this paragraph used to say
something else that was never true.** It said a wide thing was "a container of
one space nested where it is wanted, which is the same recursion doing the work
rather than a second mechanism beside it" — which reads like a mechanism and is
not one. A nested container still occupies exactly ONE place of its parent, so
inside a three-space section it is a third of the width whatever it declares
about itself: **nesting can make something narrower and can never make anything
wider.** Narrow sides with a wide middle was therefore not merely unbuilt, it
was unrepresentable. `weights` on the parent is what says it now — see below —
and nesting keeps the job it can actually do, which is making a place a COLUMN
rather than making it wide.

**Weights are not `span` under a new name, and the refusal above stands
unchanged.** The number is on the PARENT, and that is the whole difference. A
drop is an exchange of two places, so a `span` on the child asks what it means
to exchange a two-wide place with a one-wide one — a question with no answer,
which is why `span` went. Weights leave `moveBlock` untouched: the places keep
their widths and the contents trade seats. **Flexbox is the instructive
contrast**, because it is the model that puts the number on the child
(`flex-grow`) and `fr` IS `flex-grow` — literally the same algorithm sharing
out the same leftover space, differing only in who owns the number. It cannot be
adopted here for a second reason as well: a place holding nothing is not a
flex item, so flexbox cannot express an empty place at all, and the positional
empty place is what this whole model rests on.

If you are reading a document that still describes `BLOCK_LIMITS.tracks`,
`effectiveSpan`, `TRACK_CLASS` or `SPAN_CLASS`, this note is newer: none of
them exists.

**A place may be empty, and then it keeps its width and draws nothing.** That
is the decision the whole model rests on rather than a detail of it, because a
place is POSITIONAL: `[a, null, b]` has to mean that `b` is third, and a list
that merely happens to be shorter cannot say so. Collapsing was refused
deliberately. If an unfilled place closed up, a space count would mean nothing
the moment a section was partly filled — a three-space section holding two
things would read as two columns — and the shape somebody chose would change
under them as they worked, which is exactly the failure a flow of tracks had.
What a visitor sees is room: no border, no surface, no padding, so it reads as
space rather than as a broken box. A TRAILING empty place is kept for the same
reason and trimmed by nothing, since somebody is usually about to fill it and
trimming would move every entry after the next thing they add.

**`tabs` and `accordion` except themselves, and the exception is that ruling
rather than a breach of it.** Both drop an empty place, because there a
place is a CONTROL and not a box: an empty tab opens onto nothing and an empty
disclosure has nothing to disclose, which is a control that does not work and
is strictly worse than the gap it would have filled. `filledSeatsOf` is where
that lives, and every seat it keeps carries its true `path` and `ordinal`, so
dropping one renumbers nothing and the third place is still called the third.
Every mode that lays a BOX keeps the place, because there the empty box IS the
shape its author chose — and `timeline` keeps the step while drawing no marker
beside it, which is the same rule read from the other end: a bullet with
nothing next to it is chrome for content that is not there.

**A `spaces` a build does not know renders as one place rather than blanking
the page.** `SPACE_CLASS.get(n) ?? ""` is that fallback, and the LENIENT read
admits a count above the vocabulary for the same deploy-skew reason it admits
an unknown `mode` — see `spaceCount` in `block-schema.ts`. The write still
refuses one, and so does `validate_block`. The same asymmetry now covers
`children`'s length: capped on the write, unbounded on the read. **Both were
strict on both sides and that was a fault**, because a number a newer
deployment raised is not corruption, and refusing one on the read failed the
container, then the union, then the array, then the page — `null` to its owner
and `[]` to a stranger, over a value that was only ever going to cost a
container its shape.

**There are THREE stored shapes, not two, and the third loses its width
silently unless something reads it.** Flat sections are one; blocks carrying
`spaces` are another; and in between, for about a day, `#158` shipped an editor
that converted at the save boundary and wrote blocks carrying **`columns`** and
leaves carrying a materialised `span`. Those rows are in the database. The
lenient object strips a key it does not know, so without a fallback `spaces`
falls to its default and a three-across gallery reads back as one full-width
column — for its owner and for a stranger — after which the next save stores
that loss permanently, with nothing warning anybody, because a strip is not an
error. `withSpacesFromColumns` in `block-schema.ts` reads `columns` as `spaces`
where there is no `spaces`, on the LENIENT build only; the strict save refuses
the key and `validate_block` refuses it by name, so an owner who saves a
repaired page stores it in the new shape. **It can be deleted once no stored
page carries `columns`, and no test can tell you that** — it is a fact about
the live database rather than about the code.

**Free positioning — x, y, width, height on a canvas — is refused, and the
refusal is hard to walk back once shipped.** It cannot degrade to a narrow
viewport, and this project has already shipped one overflow at exactly 320px;
it makes the editor close to unusable on a phone, which is where most people
will build; and it is how the pages this product is inspired by became
unreadable.

**`minmax(0, 1fr)` is load-bearing wherever a track is laid**, and the
measurement that established it is worth not having to repeat. At 320px with an
eight-cell `table`, `document.scrollWidth` read 656 against a `clientWidth` of
320 — and the `overflow-x-auto` box round the table had itself resolved to
638px, so there was nothing left to scroll and the class was decoration. The
table was not overflowing the page: **the page had grown to fit the table**,
through a chain of `auto` tracks each floored at its content's min-content
contribution. Identical to a reader, opposite cause, and therefore a fix in the
opposite place. Two notes in `blocks.tsx` exist only because none of that is
visible without a browser — `tabs`' panel survives on `w-full` capping its
automatic minimum, and `min-w-0` on a leaf pairs with `@container` on the same
element, each individually sufficient because inline-size containment zeroes
the same min-content contribution `min-width: 0` does.

**Every responsive rule inside a block is a CONTAINER query, and that is a
correction rather than a preference.** A leaf in one place of a three-space
section is about a third of the page wide, while every `sm:`-prefixed rule
inside it would believe it had the whole window — and the error compounds with
depth. **A viewport breakpoint here is the wrong tool and not a weaker one**,
which is the distinction worth keeping: it answers a question about a box the
block does not live in, so it is not less accurate about the block's width —
it is not about the block's width at all, and no threshold can be picked that
makes it so. The editor's own cards ask the same way, for the same reason: a
nested card lays its places inside a track of its parent's grid, so a viewport
query there would be the identical mistake one level down. `blocks.test.tsx`
asserts that a page of every mode emits no `sm:`/`md:`/`lg:`/`xl:`/`2xl:` class
at all, built from `LEAF_KINDS` so a breakpoint added to any renderer fails it.

It also cost no dependency and no client boundary. `@container` compiles to
`container-type: inline-size` and the `@`-prefixed variants are plain CSS, so
every renderer here stays a **server component** — where the JavaScript
alternative would have meant a resize observer, a `"use client"` on the whole
tree, and a first paint measured after hydration rather than before it.

### A place can be a column — `addToPlace`

**A place holds one child, so a column is a `stack`, and there is no second
mechanism for it.** `addToPlace` (`domain/block-edits.ts`) is what the
shape control and the editor's own drag-and-drop both write through, and its
rule is a small case split rather than a tree the editor assembles by hand:

- An **empty place** takes the block directly — no wrapping at all.
- A place already holding **one block** gets wrapped: `addToPlace` builds a
  new `stack` container of one space, puts what was there and the new block
  in it as `[here, block]`, and writes the stack in the place's stead.
- A place already holding a **`stack`** gets an append — the new block joins
  the existing column's `children` rather than starting a second one.

That is what makes "sides and a middle" a shape somebody picks from a preset
rather than a tree they build by hand: the preset seeds each empty place with
a `stack`, and every block dropped into that place afterwards lands in the
column already there.

**The editor never removes a stack it made.** A column emptied back down to
nothing is not unwrapped back to a bare place — it is left as a `stack` with
no children, which renders exactly as an empty place already does (see
`clearAt`'s note above). Deleting the column itself, if that is what somebody
wants, is the same operation as deleting any other block.

**The wrap is refused where `mayNest` says a container may not sit, and the
page comes back as the very same array.** A place at the depth cap
(`MAX_DEPTH`) may hold content and nothing else — wrapping it in a `stack`
would build a tree `validate_block` refuses on save, so `addToPlace` checks
`mayNest(path)` before building one and returns the identical array, by
identity, when it is refused. That is what lets a caller compare by identity
and skip a write rather than diffing a tree to discover nothing happened — the
same convention `moveBlock`'s no-op return uses.

A column spends one of the three nesting levels, like any other container: a
`stack` seeded into a place at depth 1 leaves only leaves for depth 2, which is
the ordinary cost of the mechanism the SPACES section above describes — a wide
thing is a place with a bigger share, and a "sides and a middle" shape is a
place turned into a column, never a block made wider than the place it sits
in.

### A place may be wider than its neighbours — `weights`

A container may carry `weights`: **one whole share per place, 1 to 6**, so
`spaces: 3` with `weights: [1, 3, 1]` lays a narrow place, one three times as
wide, and a narrow place. The bound is `BLOCK_LIMITS.weight`, and `0009` is the
authority in two steps, each refusing **by name** as the depth cap does, so
somebody whose shares are wrong is told that rather than that their `mode` is
invalid: `is_weight_list` checks the SHAPE — absent, or one share per place —
and, once that has passed, `validate_block` checks inline what each share is
WORTH, a whole number from 1 to `c_max_weight`. The two are split because they
are not the same mistake: a wrong count and an out-of-range share each name a
different field, and one message for both would occasionally name the field
somebody got right.

**Absent means uniform, and it reaches uniform through a CSS fallback rather
than through a branch — one that has to be re-armed explicitly, because CSS
custom properties INHERIT.** `SPACE_CLASS` is no longer `@lg:grid-cols-3` but
`@lg:[grid-template-columns:var(--block-tracks,repeat(3,minmax(0,1fr)))]`, and
`Grid` sets `--block-tracks` on every grid, weighted or not — `"initial"` when
there is no ratio to state. That is a fix rather than a redundancy: `var()`
uses its fallback only when the property is UNSET on the element asking, and
an inherited value counts as set, so a plain conditional (`tracks ? {…} :
undefined`) once let an unweighted grid nested inside a weighted one resolve
the ANCESTOR's track list — a two-place grid dropped into the middle place of
a 1:3:1 section laid three tracks at that ratio instead of two equal ones,
which is the ordinary shape the preset seeding produces, not an exotic one.
`"initial"` resets the property at that element, which re-arms every `var()`
fallback beneath it. The class keeps the CONTAINER QUERY, because an inline
style cannot carry a query
of any kind and the collapse to one column would have nowhere to live; the
property carries the TRACKS, because weights are author data out of `jsonb` and
no build step can ever see them, so no class can be generated for them. The
consequence worth protecting: **an unweighted page emits the declaration it
always did**, `repeat(n, minmax(0, 1fr))`, byte for byte. `trackListFor`
answers `undefined` for no weights, for a length that is not `spaces`, AND for
shares that are all equal — that last on purpose, since uniform weights and no
weights are the same page and answering differently would let a test pin an
accident.

**A mismatched length is refused on the write and ignored on the read**, the
asymmetry this model uses everywhere: a strict save stores nothing it cannot
mean, and a lenient read treats a weights array a newer deployment wrote
against a larger `spaces` as a shape it does not know rather than as
corruption. It costs a container its proportions and never blanks a page.

**Only `grid` spends weights, and the database stores them for every mode
deliberately.** `masonry` is CSS multi-column, whose columns are uniform by
construction, and `stack`, `carousel`, `tabs`, `accordion` and `timeline` lay
nothing across at all — so the editor offers the control for `grid` alone,
because a control that stores what somebody types and renders nothing gives
them no way to learn it did nothing. Refusing to STORE it would be a different
and worse thing: somebody who sets a shape, flips to `carousel` to look and
flips back must find their proportions still there, which is the same reasoning
that keeps a leaf's fields when its kind changes.

**`LONE_CENTRE` does not apply to a weighted grid.** Centring a lone block on a
part-filled last row gives it one empty track each side — and "one each" cannot
be given out of tracks that are not the same width. A weighted grid leaves the
lone block where it is.

**Each weighted track is floored at `TRACK_FLOOR` (`8rem`,
`domain/block-tracks.ts`), and the floor is what makes growth
self-correcting.** The container-query thresholds were tuned for tracks that
are all the same size, so at the width where three places are first laid at all
a 1:6:1 split would give its sides about 3.75rem — a sliver a bounded weight
alone does not prevent. With the floor the sides take `8rem` and the middle
takes the remainder; as the container grows the shares overtake the floor and
the author's ratio asserts itself. So a weighted section is near-uniform when
there is little room, is the shape its author chose when there is room for it,
and is one column when there is not much room at all.

`8rem` was arithmetic — the largest value fitting inside every threshold with
its gutters — and it is a measurement now: `weighted-places.spec.ts` watched
all five in a browser and nothing overflowed, so the value did not move. What
DID move is the widths the browser needs to reach each threshold. The queried
box is the section, and the page's own padding sits outside it, so the viewport
widths that first lay 2/3/4/5/6 places are **352 / 544 / 720 / 944 / 1072px**
against the arithmetic's 320/512/672/896/1024 — each 32–48px larger. Anything
choosing a viewport width to prove a grid behaviour uses the measured numbers,
or it measures a collapsed grid and passes while proving nothing.

**Below its threshold a weighted grid is one column and the places stack in
STORED order**, exactly as an unweighted one does. Reordering on narrow screens
is refused: `order` and explicit placement both change what is SEEN without
changing what is READ, so focus order, screen-reader order and copy order would
all disagree with the page — and `a11y.spec.ts` would not necessarily catch it,
since nothing in the `wcag2a`/`wcag21aa` sets it runs measures that mismatch.
An author who wants the middle first on a phone puts it first; `[3, 1, 1]` is a
wide-left page that is honest at every width.

### Adding a mode or a kind — what is guarded, and what is not

`CONTAINER_MODES` and `LEAF_KINDS` in `block-schema.ts` are the vocabulary;
`is_container_mode()` and `is_block_kind()` in `0009` are the authority, and a
name the database does not know is refused whatever the array says.
`block-limits-match-migration.test.ts` reads those lists out of the SQL and
fails when the two sides disagree, so neither can be extended alone — and it
asserts its own regexes matched something before comparing anything, because a
pattern that quietly matches nothing makes every comparison after it pass
forever. `MODES` and `LEAVES` in `blocks.tsx` are `Map`s built from private
records carrying `satisfies Record<ContainerMode, …>` and
`satisfies Record<LeafKind, …>`, so a name with no renderer behind it fails to
compile.

**Those lookups are `Map`s rather than records because of a fault, not a style
rule.** `mode` and `kind` arrive from `jsonb`, and a plain object indexed by
user-controlled text answers `__proto__`, `constructor` and `toString` with
truthy inherited values. This repo shipped a Critical of exactly that shape
through `TIDAL_KINDS`, where the inherited value passed a `!entry` guard and
then threw during a public page render. A `Map` has no inherited entries to
find. The same argument covers `SPACE_CLASS`, `MASONRY_CLASS`, `LEAF_FIELDS`,
`PLACES_CLASS` in the editor and `SHAPE_OF` in the shim — every lookup whose
key arrives from `jsonb`. `SHAPE_OF` is the newest, and it was a plain object
until a review noticed: every caller passed a value `z.enum` had accepted, so
nothing was reachable — which is a property of three call sites rather than of
the table, and the guard has to be the structure rather than a discipline the
fourth caller has not read about.

One thing is **not** guarded and must not be assumed: nothing checks that a
mode is _good_. That part is still on you.

**Both vocabularies ARE named to a person now, and both are checked.**
`messages.test.ts` pins `CONTAINER_MODES` against `fursonas.modes` and
`LEAF_KINDS` against `fursonas.leafKinds`, in each catalogue separately — the
parity check beside it cannot see a name absent from both. It also pins
`fursonas.leafFields`, which is one title string per kind and a description and
a prompt for every kind that draws one: the pair genuinely means something
different per kind, so a `picture`'s title is its ALT TEXT and a `quote`'s is
who said it, and `DESCRIBED_KINDS` is what says which kinds owe the other two.
`pages/labels.ts` builds every one of those records by MAPPING the vocabulary,
so a kind added without a name fails the build instead of rendering its own id
at somebody.

**That catalogue guard is newer than the sentence that promised it**, which is
the part worth remembering rather than the guard. Four documents said a test
caught a missing name and none did: `skins.test.ts` imports no catalogue,
`messages.test.ts` compared en against es only — so a name absent from **both**
passed — and the `t()` call over an interpolated key is untyped, there being no
`IntlMessages` augmentation in this app. A layout added to neither catalogue
therefore rendered `fursonas.types.<id>` at somebody, which is not
hypothetical: it happened, at 155px, overflowing a 320px viewport. The lesson
generalises past this file — **a sentence crediting a guard is not the guard**,
and the ones most likely to be false are the ones nobody has watched go red.

### What a template ships, and what a title and a description mean

**A template ships structure, never prose.** Titles, arrangement, icons and
order are ours; every description is empty. They used to carry guidance
sentences in those descriptions, so a page created from a template and
published unedited read its own instructions out to strangers in its owner's
voice — "Say what your character is: one species, a hybrid, or something of
your own", presented as what that person had written. The prompt is the
description field's **placeholder** now: it helps while somebody writes, is
never stored, never published, and never has to be deleted. The templates
themselves are still flat and phase 3 rewrites them; the rule outlives them.

**A description may be empty and a title may not.** A block is a heading with
something under it: without the heading there is a blank box and nothing to
render, while without the description there is a perfectly good card — which is
exactly what a template hands somebody to fill in. Every kind leaves the
element out when the description is empty, or an empty `<p>` becomes a visible
hole in a gap-spaced grid.

**That rule is enforced on the WRITE and deliberately not on the read.**
`validate_block` refuses a zero-length `title_en` beside its type check, and so
does the strict schema. `min(1)` on the READ path made one leaf's empty title
fail the whole page, because a failed parse answers "nothing here yet" over a
page full of content — precisely the blast radius the lenient read exists to
prevent, and the leniency had only ever been extended to unknown keys. The read
is a floor now: one empty title costs that title, never the page, and every
renderer already handles it.

### The editor composes blocks, and the shim converts what is already stored

**The flat editor is gone**, and with it `section-editor.tsx`,
`section-card.tsx` and `section-item-fields.tsx`. What replaces it is
`block-editor.tsx` (the page: sections, the template picker, the brand presets,
the top-level drag), `block-card.tsx` (one container — its name, arrangement,
shape, style and places) and `leaf-editor.tsx` (one piece of content and only
the fields its kind draws). The live page is `editor-canvas` in
`block-editor.tsx` — each top-level seat rendered with `Block` inside
`pageBoxClass`, the same pairing a public route uses. `SectionPreviewTray`
still exists for tests that mount a single tray; the editor no longer uses it
as a sibling of each card.
`section-schema.ts` and
`fursona-templates.ts` survive, because the shim and the templates still speak
that vocabulary.

**The whole page is ONE form field, held by one `useController`, and that is
forced rather than preferred.** A place may hold nothing, and `useFieldArray`
keys every entry by an id it puts ON the entry — so it cannot represent a
`null`, which is the one thing this model turns on. Every edit is therefore a
pure function over the tree in `domain/block-edits.ts`, applied through one
`apply` callback and handed back whole. That is also why the editor's real
behaviour is measured at all: `src/features/*/presentation/**/*.tsx` is
coverage-excluded, and those functions are domain code.

**A block is addressed by its POSITION — a `BlockPath`, indices outermost
first — rebuilt from where each card is rendering on every render.** Never a
captured index: the flat editor documented that fault at length, and it is what
made a delete land on the wrong row.

**Changing a shape cannot destroy content, and that is the model rather than a
rescue.** `spaces` is how many places a container lays ACROSS and `children` is
the content; children fill the places row by row and the section grows
downward. So narrowing a six-space section to two re-wraps six things into
three rows with all six still there, in order. Nothing writes `children` when
`spaces` changes — `patchContainer` cannot, by its own type — and the control
carries a sentence saying so, because somebody about to narrow a section has to
know before they do it. The clamp somebody would write in good faith is
sabotage-verified against: adding one reddens four cases across the domain
suite and the card's own.

**A refusal is marked on the block that carries it, containers included.**
`LeafEditor` marks a leaf's title and says so in a sentence beside it;
`BlockCard` marks its name and, for a field it does not draw at all — an
arrangement or a width from a newer deployment, a style address past its cap —
says that something here was refused. It marked nothing for a while, and the
banner above said "what needs fixing is marked below" over a page with no mark
on it while naming a missing title, which was not the cause. The banner picks
between three sentences now (`sectionsCode`): the title one only when every
refusal IS a title, a neutral one when something is marked, and a different
one again when a page-level cap refused with no index to mark. Which refusals
land on a container rather than on a leaf was settled by running zod against
its own issue paths rather than by reasoning about them — a discriminated
union names the discriminator, so an unknown leaf `kind` marks the leaf.

**The editor's own cards carry no viewport breakpoint either, and the guard
for that is `block-card.test.tsx` rather than `blocks.test.tsx`.** The public
guard renders `PublicBlocks` only, so five `sm:` classes survived inside the
very file whose comment explains why a window query is the wrong question below
depth 0. Two of them decided whether the arrangement and width menus sat inline.
The editor's guard renders a card holding a nested card and every leaf kind, and
it is sabotage-verified by planting a breakpoint in each component. One thing it
cannot ask for: **an element is never its own query container**, so a card's own
padding and a leaf editor's own padding have no container-query form at all —
`@container` there establishes the context for DESCENDANTS, and an `@` rule on
the same element asks whatever encloses it. Those two dials were dropped rather
than converted into a rule that asks the wrong box quietly.

**Controls are AeleOS; the DOCUMENT is the author's page.** This inverted on
2026-08-27 and it is the single most important thing to understand about the
editor. It used to be the other way round: the app owned `:root` and each
preview was a boxed exception carrying the theme inside it. Now `FursonaEditor`
mounts `ThemeScope` with the live draft — the same component a public route
mounts with a stored one — so `:root` carries the author's palette, `body`
paints their field and background picture, and the `NebulaCanvas` in the root
layout is theirs.

**The canvas is why no arrangement of boxes could have done this.**
`NebulaCanvas` is `fixed inset-0 -z-10` in the root layout, so anything an
in-flow preview paints is simply in front of it. What is behind a page has to
be behind the DOCUMENT.

**Every control is an island wearing `CHROME_SCOPE`**, which re-declares
AeleOS's own tokens on the island itself. There is no cascade fight: the
cascade compares declarations on the same element, so a declaration on the
control always beats one inherited from `:root`. `shared/domain/chrome.ts` has
the mechanism, `chrome-tokens.test.ts` pins which rule declares what, and
`section-card-face.spec.ts` is the browser guard — that suite could not fail
before this change, because a control was safe from an author's palette for a
reason that had nothing to do with any containment.

**A workbench group PAINTS, and it must be opaque.** What is behind a control
is now a colour the author chose, and they may choose any colour — so a
translucent control has NO guaranteed contrast and no measurement can give it
one. The editor toolbar takes `--menu`, the one token declared opaque in both
modes and already guarded by `dropdown-legibility.test.ts`, rather than the
35%-alpha `--bar-solid` it wore when the app's own muted field was behind it.
The sections heading, the template control and the add-section controls each
sit on the same `--surface-solid` card every other workbench group has; they
were bare text and a ghost button, which is legible on the app's field and
illegible on hot pink.

**A section preview paints NOTHING and lays the real page box.**
`SectionPreviewTray` renders `Block` inside `pageBoxClass` — the same function
`PublicBlocks` uses — so a section carries the author's measure, bleeds when it
bleeds, and takes the same first/between/last spacing a public page gives it.
Its container queries answer to the page's width rather than the workbench's,
which is what `WidePageColumn` moving INSIDE `BlockEditor` buys: the control
card is columned and the preview is full width.

**The inspector drills one level at a time (corrected 2026-09-01).**
`BlockCard`, `LeafEditor`, `BlockSlot`, `add-content`, `add-nested`,
mode/spaces/weights, the style popup, identity, theme, templates and presets
remain the editing mechanisms. The page starts with no selection. Selecting
Page or a container offers **Items** and **Options**: Items shows only that
target's immediate positions, including empty ones, while Options mounts only
that selected target's existing editor with descendants suppressed. Selecting
a leaf opens its Options directly. `BlockPath` is the only selection identity;
breadcrumbs and Back derive parents from it, and a removed target repairs to
its closest surviving ancestor. That repair is persisted in state, so a later
document import cannot resurrect a stale path merely by filling the same
position again.

Only the immediate siblings visible in one Items scope register drag handles.
Pointer collision, keyboard navigation and the final drop boundary each reject
a different parent before `moveBlock` is called. Cross-level movement remains
expressible in the page-source document, but is deliberately not an inspector
gesture.

Empty canvas or Escape deselects; an Escape aimed inside the inspector belongs
to its own popup or field and leaves selection intact. The capture-phase
listener asks that question before `SectionStylePopup`'s bubble listener can
detach the focused field. Preview is still hide-controls (`CHROME_SCOPE`).
When nothing is selected the workbench is unmounted, never hidden or copied
off-screen; one mounted workbench remains the invariant.

The desktop panel is `min(36rem, 40vw)`, with the canvas padded by that same
expression, because the inherited nested card controls do not fit in 320px.
It starts `3.5rem` below the sticky editor toolbar: sharing the bar's own top
offset covered the Items tab or the writing switch depending on which one won
the z-index. Preview leaves selection intact, so the padding class remains;
the hide-controls rule explicitly zeroes inline padding with the other editor
furniture or a 1280px picture shifts by exactly 512px.

It used to be a card — a label, `p-3`, a rounded face carrying `--surface` at
90% alpha, a border, and the author's `--field` on an in-flow box. All of that
was furniture between the author and their page, and the field in particular
covered the canvas outright.

**`overflow` is not set on it, and must not be.** The host carried
`overflow-x-auto`, and a `visible` axis paired with a non-visible one computes
to `auto` — so the box clipped on all four edges. Ink overflow is not scrollable
overflow, so nothing scrolled and no scrollbar appeared: every `neon` glow and
`comic` shadow in a tray was simply gone. `responsive.spec.ts` had pinned that
property BY NAME, which is root rule 30's shape one level down — the suite was
asserting the fault. The document scrolls instead, exactly as it does for a
stranger on an over-wide page.

**Three faults the browser suite found after the inversion, and each is a
different shape.**

**`ThemeScope` remounted the whole editor on the first edit.** It returned
`children` bare when the theme overrode nothing and a fragment when it did, so
the first colour an author picked changed the element type at that position and
React threw the subtree away — taking the theme panel's open state with it, so
the next control they reached for was not in the document. A public page can
never see this: its theme is resolved once on the server and never moves. The
shape it returns is constant now, with an empty slot where the stylesheet goes.

**A chrome island has to CONSUME the tokens it re-declares.** `color` inherits,
and `globals.css` resolves it once on `body` against whatever `--ink` is at
`:root` — the author's, now — so every control that sets no colour of its own
inherited theirs, and re-declaring `--ink` on the island changed nothing because
nothing under it asked for the island's copy. Measured: an input painted
`oklch(0.97 0 89.88)` where AeleOS's ink is `lab(14.95 13.07 10.78)`.
`font-family` is the same one scope down, since a skin writes `--skin-font` at
`SKIN_SCOPE`. `PreviewThemeHost` carried both for this reason before the
inversion, pointing the other way; the hazard changed sides rather than going
away.

**And the list was short by two, found 2026-08-28 by somebody using the
editor.** Choosing a `spacing` shrank the workbench. `spacing` writes a raw
`font-size` into the SKIN rule — which encloses the controls — and the island
restated `color` and `font-family` and not `font-size`. Measured before the
fix: **45 of 77 marked controls changed**, every island's base type going 16px
to 13px, and the spacing select that caused it shrinking from 14px to 11.375px
and from 34px to 31px tall under the pointer that had just set it.

**The second leak is the more instructive one, because the property WAS
restated.** A page's typeface writes `--font-sans` and `--font-display`, so the
island's own `font-family: var(--font-sans)` resolved the AUTHOR's token — and
so did every `font-display` utility on a descendant, the editor toolbar's title
among them. That is the `--surface`/`--bar` trap met on a property instead of a
colour: **restating a declaration is not enough when the declaration reads a
token somebody else has written.** The app's faces are captured at `:root` as
`--chrome-font-sans`/`--chrome-font-display`, where an author writes nothing,
and put back on the island. That capture is declared at `:root` and NOWHERE
else on purpose — naming the chrome class on it too would make the island
resolve the capture from its own `--font-sans`, which is set from the capture: a
cycle, invalid at computed-value time, and both faces would fall back to
`system-ui` silently.

**The reset reads `var(--chrome-text, 1rem)` rather than `1rem`, and that is a
cascade fact worth keeping.** These declarations are deliberately UNLAYERED —
`chrome-tokens.test.ts` pins it, because a layered token would lose to any
unlayered rule that reached the island — and unlayered also beats every utility
ON the island. Measured: with a bare `font-size: 1rem`, the show-controls
button's own `text-sm` lost and it rendered 16px instead of 14px. Reading a
custom property sidesteps the fight instead of winning it, because the island
rule and an island's own `--chrome-text` are different properties with nothing
to outrank. An island wanting another size sets that token.

**`controls-stay-stable.spec.ts` is the guard, and its load-bearing assertion
is the anti-vacuity one.** "No control changed" is also what a broken fixture
reports — a wrong selector, a control that silently refused — so every case
asserts the author's PAGE did change in the same breath, and that half is
proved capable of failing by pointing the controls at a value they already
hold. The two fixes are sabotage-verified independently: removing `font-size`
reddens only the spacing case, removing the font-token restatement only the
typeface case.

**The general shape, and why no static check can replace that spec:** this list
is hand-maintained and nothing in the type system, the linter or any unit test
knows which inheritable properties a theme has learned to write. Whoever adds
one to a theme adds it to the island in the same change. `letter-spacing` and
`line-height` are watched by that spec already, being the next two a
page-level typography option would reach for.

**The light/dark toggle threw the page away.** It clears an author's theme as
well as setting a scheme, which is right on a public page — the switch beside it
offers the colours back. Its own comment said this "costs the signed-in pages
nothing", true while they had no theme and false the moment the editor grew one:
there is no page-theme switch in the signed-in bar, so an author pressing
light/dark lost the page they were building with no way to restore it. It clears
only where `PageShell` renders that switch, which is the app's existing signal
for "there is a way back".

**And a claim that turned out to be about the deleted face rather than the
product.** `section-card-face.spec.ts` required a section's background picture
to preview "at full strength" — which held only because the tray painted its own
element carrying the picture ABOVE a 90%-alpha surface, while the public page
showed it through that surface. The assertion was pinning the very difference
the face created. Measured on bare section background after the face went:
`[232, 245, 222]`, the picture at about a tenth, which is exactly what a visitor
sees. It asserts a CHANGE against the same probe with no picture now.

**A STICKY BAR STICKS ONLY WITHIN ITS PARENT'S BOX, and moving the previews out
of the control column shortened that box.** The toolbar and the language strip
lived inside the `WidePageColumn` that used to wrap the whole editor. When
`BlockEditor` moved out of it so section previews could own the page's full
width, that column came to end just after the strip — and both bars stopped
sticking a few hundred pixels down a page thousands of pixels long. Measured:
Save at `y = -511` after scrolling 1200, and `-1132` once the toolbar was
nested one level deeper.

**Nothing in any computed style says so**, which is why it needs a browser and a
scroll: `position` still reads `sticky` and the offset still reads
`--bar-top`. Only `getBoundingClientRect` after scrolling can tell you the bar
is above the viewport.

Both bars are direct children of the element carrying `data-controls`, which
spans the whole editor, and each puts a `WidePageColumn` INSIDE itself rather
than sitting in one. `EditorToolbar` carries `CHROME_SCOPE` on its own root for
the same reason — a wrapper would become its parent, and a wrapper the height of
one bar pins it for the height of one bar. `editor-bars-stay-pinned.spec.ts` is
the guard, and it scrolls a seeded eight-section page because a short one can be
scrolled to the bottom without ever passing the point where the bars came
unstuck.

**A bare `py-0` does not remove `sm:py-10`, and that is how the language strip
came to hang below the bar it belongs under.** `COLUMN.wide` is
`px-4 py-6 sm:px-6 sm:py-10`; tailwind-merge treats a responsive variant as its
own group, so a `className="py-0"` handed to `WidePageColumn` overrides the base
and leaves the `sm:` one standing. Measured at 1280: the strip's wrapper stuck
correctly at `--bar-top-2` = 120 while the card inside it started at 160, a 47px
drop below a save bar ending at 113. Every editor column that means "no vertical
padding" says `py-0 sm:py-0`.

`editor-bars-stay-pinned.spec.ts` asserts the gap as well as the pinning, and
measures it against the bar's own bottom rather than a literal — both heights
are composed from `--bar-h`, so a number in the test would be a second source of
truth. Being pinned is not the whole claim: a strip can stick at exactly the
right offset and still sit 47px too low.

**Hiding the controls leaves the page, and that is what replaced the framed
preview.** The toolbar carries a control that sets `data-controls="hidden"` on
the element wrapping the whole editor; two rules in `globals.css` do the rest.

The first removes every `CHROME_SCOPE` island. Hiding by CLASS rather than by a
list of components is the point: a control added tomorrow is hidden without
anybody remembering to add it anywhere.

The second flattens the editor's own stacking, and it is not tidiness.
`PublicBlocks` renders its sections in a grid with NO gap and lets
`pageBoxClass` own every margin between them; the editor interleaves a control
card with each preview and needs `gap-6` and `gap-2` to keep each pair legible.
Left in place with the cards hidden, those gaps push every section further down
the document than a visitor sees it — and because the author's field is fixed to
the WINDOW, a section at the wrong offset shows the wrong slice of their own
backdrop. Three elements carry `data-editor-stack` for that rule to reach.

**The control that brings the workbench back is rendered OUTSIDE the armed
element**, and that is why it cannot become an EDITOR-toolbar button however
much it reads like one: the rule removes islands by CLASS, so a button in that
bar would be hidden by the very press that summons it.

**The app HEADER is a different bar and is not armed**, which is what makes the
current arrangement legal: `PageShell` offers `EscapeSlotTarget` in its control
row and `FursonaEditor` portals into it through `useEscapeSlot`. A context
rather than a `document.querySelector`, because that call is restricted in this
app in favour of a ref and the rule is right — a string contract between two
components is untyped and silently wrong the day either side renames it. The
invariant now holds by WHERE the slot is rather than by anybody remembering. It needs no exception in the rule and
cannot be part of what the fidelity comparison photographs. Putting it inside
would let the rule hide the
only control that could undo it, stranding somebody on a page with no way back.
`fursona-editor.test.tsx` asserts both halves of that containment, and the
sabotage that moves it inside reddens.

**Its button is `type="button"`, and that is not a formality** — every button
inside a `<form>` submits by default, so an unspecified type would save the page
on the way to looking at it. The guard is asserted on the form's own `submit`
EVENT rather than on the save mock: the first version checked the mock straight
after the click and passed with the type removed, because react-hook-form
validates asynchronously and the assertion ran before anything could have called
it. Rule 29 — a sabotage that leaves the suite green has proved nothing.

**Nothing persists the choice.** It is a way of looking rather than a
preference; a remembered value would open the editor with no controls at all for
whoever did it once.

**`editor-is-the-page.spec.ts` is where "hiding the controls leaves the page"
stops being a claim.** It photographs ONE seeded page twice — at its public
address and in the editor with the controls hidden — at seven viewport widths,
and asserts both the section boxes and the pixels.

**The two halves catch different faults and neither stands in for the other.**
The box half reads `getBoundingClientRect` from the DOM, so it is exact and
immune to scroll; the pixel half pins the same section at the same VIEWPORT
offset in both documents and compares strips, which is the only instrument that
can see the author's field — anchored to the window, so which slice sits behind
a section is decided by where that section is on screen. Sabotaged by leaving
the editor's stack gaps in place, all four pixel cases redden between 40.2% and
46.1% and NOT ONE box case does: the sections are the same size, simply at a
different offset.

**The widths STRADDLE measured thresholds rather than sampling round numbers.**
A grid stops collapsing to one track at 352px for two places, 544px for three
and 720px for four; the stops sit either side of the second and third, because
those are the widths where a geometry difference flips a visible answer. A
doubled 16px gutter is what moved this threshold the last time it went wrong.

**Its `hide-controls` mechanism has one exception the camera needs.** The
restore control is `fixed` to a corner, so a viewport clip of a section pinned
there captures it — measured while it sat at the BOTTOM right, against a section
pinned low: 2.598% of the last section differing, AeleOS's near-white where the
page paints the photograph's gold. It is hidden for the photograph only, after
the suite has asserted it is there.

**It is IN the header's control row now (2026-08-27), and got there by being
wrong twice.** Bottom right covered the page's own foot, which is part of what
somebody hides the controls to look at. Top right, still `fixed`, then covered
the language and light/dark toggles by **88% each** — measured — putting both
out of reach. A control out of flow has no way to know what it lands on, so it
is portalled into `EscapeSlotTarget` and displaces its neighbours instead.

**The guard changed with it, and the old one could not have caught this.** `the
way back to the controls is drawn at the top` asserted `y < 100`, which the
broken placement satisfied perfectly — root rule 27. It now asserts the button
overlaps no other control in the header, which reddens naming
`language-toggle` at 901px² and `theme-toggle` at 795px² when the button is put
back out of flow.

**It is deliberately NOT `serial`.** The config already runs one worker, so
serial buys no isolation and costs the whole point of a responsive guard: the
first failing width would skip every other, and "1 failed" cannot tell you
whether the editor is wrong at every size or only below a threshold.

**THE FRAMED PREVIEW IS GONE (2026-08-27), AND SO IS EVERYTHING WRITTEN ABOUT
IT.** `/{locale}/me/preview`, `PreviewDocument`, the `postMessage` handshake and
draft contract, `CompletePagePreview`, the device table and the backdrop banding
were all deleted, together with the fidelity suite that photographed one against
the other and the seven wrong instruments recorded in its header. `git log` is
where that account lives now; leaving it here would be a page of measurements
about a mechanism nobody can run.

**Why it went, since it was six days old and correct.** It was buying back a
viewport the editor had given away. A preview needs its own document only while
the editor's document belongs to the app — and the editor themes its own `:root`
with the draft now, exactly as a public route does, so the page an author is
building IS the document they are looking at. `frame-ancestors` closed back to
`'none'` with it: the widening on 2026-08-26 had exactly one beneficiary.

**The section previews use the REAL renderers.** The editor's `editor-canvas`
draws each top-level seat with `Block` from `blocks.tsx` — the component both
public pages are built from — handed the same tree the save will send, parsed
by `lenientBlockSchema` because the editor's tree is mid-edit. A malformed
in-progress section disappears from the canvas rather than taking down the
editor or hiding its valid neighbours. `SectionPreviewTray` is the same pairing
for tests that mount a tray alone. A second renderer would have looked
identical the day it was written and drifted the first time either changed.

**A tray restates `--ink`.** It is a control token, so it never reaches the
document at all — a preview that did not restate it would carry the app's
writing colour over the author's page.

**Real previews mount real third-party frames while editing.** An author's own
request and the fact that they are editing therefore reach the same allowlisted
providers their visitors would reach. That privacy cost is accepted because an
embed is precisely what must be seen working before publication, and no
different source or provider is admitted.

**A tray does not participate in dragging.** It is a sibling of the top-level
`BlockSlot`, never its descendant, so changing its height cannot change
droppable geometry.

### Telling a section from content (2026-08-27)

**The two cards painted the same colour, and that is measured rather than
impressionistic.** `globals.css` declares `--surface: var(--surface-solid)` in
the one `:root, .aeleos-chrome` block, and the dark block below redeclares only
the raw pair — so the composed line still applies in both modes. The editor's
cards sit inside `CHROME_SCOPE`, so they wear exactly those tokens. A section
card's `bg-(--surface-solid)` and a leaf's `bg-(--surface)` were therefore the
same colour, and the whole distinction between a container and a piece of
content was one border-alpha step, four pixels of radius and two of padding.

**A nested section was worse: byte-for-byte identical to a top-level one.**
`idsFor` changes the test ids and the labels and nothing else, so depth was
legible only from position. Three things were conflated, not two.

`card-kind.tsx` holds both answers and neither is in a card:

- **`ContainerRail`** is drawn once per container at EVERY depth. Rails nest
  physically, so depth becomes countable instead of inferred — three stacked
  rails is a block at the cap.

  **Where it sits was measured twice, against two opposite faults, and the
  second one is the instructive half.** At `left-0.5` it sat 1px from the
  card's own border, read as part of it, and was invisible — present in the
  DOM, passing its test. **No unit test can see that**: the case asserts the
  element exists, and an element nobody can distinguish exists just as hard;
  photographing it is what found it.

  Widening the card to `py-3 pr-3 pl-4` to give it a gutter fixed that and cost
  **8px of the card's MIN-CONTENT width** — 4px per nesting level — because
  padding on a box whose contents cannot shrink below their own intrinsic width
  makes the box wider, not the contents narrower. That pushed the editor 6px
  past a 568px screen and is what `responsive.spec.ts` caught in CI.

  It sits at `left-1` inside the uniform `p-3` now: 4–7px, so 3px clear of the
  border and 1px clear of the header's `-m-1` bleed at 8px, and the card is
  **exactly as wide as it was before any of this** — measured at a squeezed
  280px, where the whole editor reports a `scrollWidth` of 293 with the rail
  and 293 without it, against 301 with the gutter.
  **Its test id is `container-rail`, not `section-rail`**: the end-to-end suite
  counts sections through `section-card`, which `idsFor` emits at depth 0 only,
  and a rail calling itself a section at every depth would make that vocabulary
  mean two things — the same ambiguity `idsFor`'s two sets exist to avoid.

- **`CardKind`** is the eyebrow: a mark and the noun, and it sits on the field
  LABEL's line — never in the row holding the control. Measured at 320px in
  Spanish: put beside the leaf's kind select it pushed a 204px `select` — as
  wide as `Reproductor de música`, and with no `w-full` fallback to wrap onto a
  line of its own the way the section's selects have — **71px past the
  viewport**, which `responsive.spec.ts` caught and no unit test could. Above
  the control it competes with a two-word label instead, so it costs no width
  in the tight row and no height anywhere.

  **The general shape is worth more than the fix.** A control row that fits is
  not a row with slack in it; the leaf header happened to fit and had no
  wrapping fallback, so the first thing added to it broke a screen size. Before
  putting anything in a row beside a `select`, remember the select is as wide
  as its longest option in the LONGEST language, and that Spanish is the
  fallback here.

  The caller names the kind rather than handing in a glyph, so a third kind is
  an edit in one file. The
  container's mark is `Layers`, the one its own "add a section here" button
  carries, so an action keeps its sign through the flow.

  **Content's tile is FILLED, and that is not decoration.** An outlined square
  beside a word is an unchecked checkbox to anybody who has used a form — it
  invites a click that does nothing. Also found by photographing it rather than
  by any check; the outline shipped through lint, typecheck and 3023 green
  tests.

- **Content is marked by its own BORDER**, and the short stub that shipped on
  2026-08-28 is gone the same day. The stub marked the card's head only; what
  was asked for was a mark over the whole card, the way a container's rail runs
  its full height. A leaf card carries **4px of full-strength `--edge`** now,
  where it wore 1px at 40% alpha.

  **It went 2px → 4px on 2026-08-29 because 2px was not doing the job**, and
  the reason is worth keeping: a content card sits among a section card's own
  border and six input outlines, so one step of weight is a difference you
  have to look for rather than one you notice. The alternative considered was
  quieting everything else — lightening the section card and the inputs so the
  content card wins by contrast — and it was declined in favour of making the
  one thing that carries meaning louder, rather than making five things that
  do not carry meaning quieter.

  **Three channels separate the two kinds, and none of them is colour alone:**
  a rail down one edge against a perimeter, `--accent` against `--edge`, and
  thin against thick.

  **Weight is doing the work colour cannot, and the palette is why.** There is
  ONE accent and a neutral ramp — no second hue exists to reach for. The
  nearest candidate, `--ink-2`, is 45% lightness against `--accent`'s 46% in
  light mode, which is invisible; and `--star`, the only genuinely different
  hue we own, is disqualified twice over — it is semantically the nebula
  toggle's star, and it is not the same hue across modes (32° light, 78° dark),
  so a pairing built on it would read as one thing in light and another in
  dark. `--edge` is the only token separating from the accent by lightness in
  BOTH modes: 66 against 46 light, 52 against 74 dark. Photographed in both
  rather than argued from the numbers.

  **A perimeter also cannot corrupt what the rail buys.** Rails nest
  physically, so three stacked ones is a block at the depth cap; giving leaves
  a second full-height rail would make that count answer a number nobody can
  act on, which is exactly why the first attempt hedged with a stub.

  **Two things measured rather than assumed.** `border-4` genuinely beats
  `@utility surface`'s `max(--skin-border, --skin-border-min)` — surveyed in a
  real browser, every element wearing `surface` in the editor resolves to
  1px except the leaf cards, which resolve to 4px, and that survey is what
  settles it rather than reading the class list: `surface` OWNS border width,
  so a plain utility beating it is the documented sort-order mechanism rather
  than an assumption.

  **And the extra weight costs the editor no width**, which is the assertion
  that matters, because a heavier border on a nested card is exactly the shape
  that broke 568px once before — the rail's own padding widened a card whose
  contents could not shrink. Measured with a container nested inside a section
  so the borders stack: `scrollWidth` equals `clientWidth` at **320, 375, 568
  and 640**. The same survey is also how the "only content is bold" claim is
  checked rather than argued — 5 elements at 4px, every one a `leaf-editor`,
  and an author skin as heavy as `neobrutalism` puts its 3px edges only on the
  PREVIEW, never on a control.

  **It does invert the visual weight**, and that is a ruling rather than an
  oversight: a leaf now carries more ink than the section enclosing it. The
  leaf cards are the things somebody types into, so making them the defined
  ones was judged right; if that is ever reversed, soften to `--edge/70` or
  thicken the rail rather than going back to a stub.

**Each eyebrow is set in its own bar's colour** — `TONES` in the same file,
accent for a container and muted for content. Before this both were `--muted`,
byte-identical, so the only thing separating them at a glance was a 14px glyph,
and a stack of sheets against a filled tile is a distinction you have to look
at rather than one you notice. The word and the bar now say the same thing
twice, so either answers on its own. **The pairing is the point, not the
accent**: whoever changes a bar's colour changes its word's in the same edit,
or the card starts telling a reader two different things about itself. Its case
asserts the two class names DIFFER as well as naming each, since asserting both
eyebrows exist passes whether or not anybody can tell them apart.

**A nested section answers `"container"` too, and says "Section".** A nested
section IS a section; a third noun would be something to learn for a difference
the rail already draws.

**Two field labels were reworded so the eyebrow is not saying it twice.**
`sectionName` is "Name" where it was "Section name", and `leafKind` is "Type"
where it was "Content" — the eyebrow is the noun, the field label is the field,
and a label that quietly did both is how the noun ended up invisible in a row of
four identical `text-xs font-medium` labels. The keys did not change, and the
test fixture uses real English for scalars, so both had to move together.

**The rail is what the nested fixture in `block-card.test.tsx` exists for.** One
rail on the outermost card and one rail per container are indistinguishable on a
flat page, so the case nests to the cap; rendering the rail only at depth 0
reddens that case and no other, which is the proof the fixture discriminates.

### Dragging (2026-08-18; inspector corrected 2026-09-01)

> **Correction:** The domain account below remains the contract for
> `moveBlock`, including cross-level exchanges and refusals. Its interaction
> and browser-proof paragraphs describe the superseded full-tree editor. The
> recursive inspector mounts only one level and offers only visible siblings;
> pointer collision, keyboard navigation and final drop handling each enforce
> that shared parent. The current browser proof is
> `section-drag-reorder.spec.ts`; see the recursive-inspector paragraph above.

`@hello-pangea/dnd` is **gone**. `@dnd-kit/core` and `@dnd-kit/sortable`
replaced it, in the editor and in the fursona list both, because the old
library's own README rules out dragging from a parent list into a child one and
rules out grids separately — and this model is nested grids and nothing else.
Measured on exactly what each is imported for — an entry importing those exact
symbols, React external, minified and gzipped — **13.9 kB min+gzip against
28.5**, so the migration is a net reduction. The spike had quoted 17 against
31, which was the right direction and the wrong pair; the measured one is the
one above, and it is written down here because the spike's number is what the
plan told the next person to confirm.

**The two halves of a drag live in `domain/`, not in a component.**
`moveBlock` (`block-moves.ts`) decides what a drop MEANS — an exchange of two
places, so a drop onto an empty place is a move, onto an occupied one a swap,
and between two top-level entries a shift — and refuses a cycle, a drop past
the cap and a stale path by name. `block-drag.ts` decides which two places a
gesture NAMED. `block-editor.tsx` only wires the library to those two.

**A drop is an EXCHANGE, and insert-and-shift was refused rather than
overlooked.** The flow semantics a list would give you — insert here, and
everything after it slides along — assume the gaps between things carry no
meaning, and here they carry the author's. A place is positional: place three
is place three whether or not anything sits in it, and an empty place keeps its
width and draws nothing. Sliding the row along to make room would therefore
move the empty places somebody deliberately left, which is the one thing a
rearrangement must not do to a shape they chose. So the drop onto an empty
place is a move and the source place is left empty, the drop onto an occupied
place is a swap and exactly two things change, and the top level shifts —
because the page's own list has no empty entries to disturb and cannot hold
one. That last is one operation and not a third code path: a top-level entry
whose place is taken by nothing is removed and the ones after it move up, which
is also how a leaf reaches depth 0. Three separate implementations of "a drop"
would be three chances to disagree with each other later.

**`moveBlock` answers; it never throws.** It returns
`{ ok: true; blocks } | { ok: false; refusal }`, because refusing a drop is an
ordinary outcome of dragging rather than a fault in its caller — the person
gets a sentence, not a stack. A no-op comes back `ok: true` carrying **the very
array it was handed**, so the drag layer compares by identity and skips the
write rather than diffing a tree to discover nothing happened. The refusals are
`into itself`, `too deep` and `no such place`. The first is checked in **both
directions**, and that is the half worth remembering: an exchange moves the
TARGET as well, so dropping a block onto its own ancestor is the same fault
mirrored, and the mirror is the one an implementation misses. Neither can hang
— the writes are immutable, so no reference cycle can form; what forms instead
is a duplicated subtree that the other half of the exchange then deletes, which
is a section silently lost. `too deep` measures the carried subtree's own reach
against the target's depth and the displaced block against the source's, and a
container counts a level for itself even when all its places are empty, because
the deepest level admits a leaf and refuses a container. `no such place` is for
the path a stale drag produces — an empty path, a negative index, one past the
end, a walk through a leaf or through an empty place — and it exists because
writing at one past the end extends an array with holes, which is not a page
any renderer or schema has a shape for. Returning the tree unchanged there
would be the "the control did nothing" fault this repository keeps paying for.

**The collision resolves to the DEEPEST place under the pointer**, and that is
the whole of the nesting problem rather than a heuristic about it. Places nest,
so every enclosing place contains the pointer too; a collision function that
ranks by distance to a rectangle's centre answers a leaf INSIDE the container
somebody is hovering — silently, one level in, which is what the spike hit on
its first run. Ranking by path length is the same fact as "innermost" at any
depth, which is why it holds at three where the spike's own detector was
two-level-specific. It is proved at the cap in `block-drag.test.ts`, on four
nested rectangles that all contain the same point, beside a fifth candidate off
to the side that does not — and, in
`tests/e2e/section-drag-reorder.spec.ts`'s pointer case, against rectangles a
real layout engine measured. **The case that actually
discriminates nearest-centre is not the flagship one**: at the point the
flagship uses, nearest-centre happens to answer the innermost place as well.
The case below it, where the parent's centre is nearer than the child's, is
the one that would redden.

**That browser proof is newer than it looks, and the sentence it replaced was
the misleading kind.** This paragraph used to end "and again in a browser",
crediting `section-drag-reorder.spec.ts` — which at the time drove only the
KEYBOARD, and the keyboard branch of `detectCollision` hands back the place the
coordinate getter already chose without calling `placeUnderPointer` at all. So
the collision geometry had never met a rectangle Chromium produced.
`block-drag.spec.ts` was written to close that, running four of its cases by
mouse and by keyboard both.

**It is gone (2026-09-01), and only one of its halves could be kept.** Every
case it ran by mouse was a CROSS-LEVEL drag, and the recursive inspector
withdrew that gesture by design — `siblingTarget` discards a non-sibling
candidate in pointer collision, keyboard collision and drop handling alike, so
there is no input left that expresses what those cases asserted. What survives
is `section-drag-reorder.spec.ts`'s own pointer case, which exchanges two
visible sibling places by mouse: it is now **the only thing in the repository
that asks Chromium for `placeUnderPointer`'s rectangles**, so reducing it to a
keyboard drag would silently return this paragraph to the state the sentence
above describes. That spec's header carries the full account of where each of
the seventeen deleted cases went, including the two — `onDragCancel` and the
collapsed-card walk — that are now proved at the unit level only.

**One sabotage of that ranking could not be made to fail, and it is written
down rather than counted.** Replacing deepest-wins with "the first candidate
containing the pointer" changes nothing at all in a browser, because
`useDroppable` registers from the inside out — children before parents — so the
first containing candidate happens to be the deepest one in this DOM. That is a
property of dnd-kit's registration order and not of our ranking, and it could
change under us without a word. What the browser proof actually defends is the
ranking against a WRONG one, which is the nearest-centre sabotage above. The
claim that the candidates' ORDER is not being leant on is proved a level down
instead, in `block-drag.test.ts`, where the same first-match sabotage does
redden — the rectangles there are written by the test rather than registered by
a hook, so their order is ours to make hostile.

Two of its fixtures are shaped against a trap this repository has sprung
before: a swap and an insert-and-shift leave two ADJACENT places reading the
same thing, and a shift and a swap leave the same page when there are only two
sections. So the swap is asserted across a place that is not adjacent to its
source, and the reorder has a three-section page of its own. And a section
dropped on its own SECOND place rather than on the deep one inside its nested
container, because `Dos` needs two levels and a drop two levels down is refused
by the DEPTH rule whether or not the cycle guard exists — the shallow place is
the only drop whose sole fault is the cycle. The same shape had already caught
`block-moves.test.ts`'s write-order case, which removed a section AFTER the one
holding the other half of the exchange, where both orders land identically and
the guard's removal changed nothing. See rule 27 in the root `CLAUDE.md`: the
assertion is fine in every one of these, and the fixture is what could not tell
a right answer from a wrong one.

**A keyboard drag in a browser must yield a macrotask after the lift.**
`KeyboardSensor.attach()` starts the drag synchronously and adds its own
`keydown` listener in a `setTimeout`, so the lift is announced inside a window
where the first arrow key reaches nothing — a flake in one run of three, wearing
the face of a slow machine. See rule 26 in the root `CLAUDE.md` for the general
shape. **Every lift in the browser suite goes through
`tests/e2e/support/drag.ts` now**, and that is not tidiness: the fix was first
written inline in one spec while the two the same phase ported kept the
unprotected lift, so the mechanism was diagnosed once and applied once. A
helper is the only version of "written down" that the next spec cannot skip —
and it is why deleting the spec that first carried it cost nothing.

**The walk steps over places nothing is showing, and it did not.**
`placeOrder` walks the whole STORED tree while a collapsed card renders none of
its places — so those places register no droppable and dnd-kit has no rectangle
for them. Landing on one used to keep the new path and fall back to the current
coordinates, after which the collision named an unregistered id, `over`
resolved to **null**, and the drag announced "it stayed where it was" while it
was still running; a space bar pressed there dropped nothing, because
`onDragEnd` returns early on a null `over`. `coordinateGetter` keeps stepping
until it finds a place the library is measuring, so every place the keyboard
can reach is one a drop can land on.

**Its browser guard went with `block-drag.spec.ts` (2026-09-01), and nothing
replaced it.** That guard's fixture collapsed a card in the MIDDLE of a walk
that crossed sections, which the recursive inspector no longer offers; rebuilt
inside one Items scope it could not tell the fault from a correct walk, so it
was reported rather than rewritten into something that looks like coverage.
`siblingTarget` also narrows the walk further than it was narrowed when the
fault was found, which makes the fault harder to reach and does not make it
impossible. What holds it now is the unit level alone.

**A refusal sentence is retired by the next EDIT, not by the next drag.** It
used to be cleared only in `onDragStart`, so a refused drop left its line on
the page through everything somebody did afterwards, describing a gesture they
had moved on from and blocks they may since have deleted. `apply` clears it,
which is every control in the editor.

**A keyboard drag walks a LIST and a mouse drag reads geometry**, and they
differ on purpose. A pointer cannot avoid the places inside the block it is
carrying — they are under it — while a list can simply not offer them, so
arrowing a section along lands on the next section rather than inside the very
thing being moved. The coordinate getter names the place and the collision
function is told it directly; inferring it back from a synthesised rectangle
would be a second, guessable answer to a question already settled.

**The top level is a plane of its own, and this is the ruling most likely to
look like a bug.** `moveBlock` SHIFTS two paths of length one and SWAPS a
length-one path against a nested one — so a nested block resolved onto a
section's own path would exchange with the whole section, putting the section
in the place the block left. Legal, and not what anybody dragging content
between two sections meant. So a section's own place is offered only to another
top-level entry; something from inside a section hovering a section's chrome
resolves to **nothing at all**, which is the deliberate answer rather than a
gap. A section dropped INTO a place still works, and is how a leaf reaches
depth 0.

**A refused drop says why.** `MoveRefusal`'s three values have words in both
catalogues — `dragRefusedIntoItself`, `dragRefusedTooDeep`,
`dragRefusedNoSuchPlace` — shown beside the heading and spoken to dnd-kit's own
live region. A drag that quietly changed nothing would be indistinguishable
from a broken grip, which is the fault this repository keeps paying for. Note
which refusals are reachable from which input: `too deep` and `no such place`
from both, `into itself` from the POINTER only, because the keyboard list
leaves a block's own descendants out.

**Every grip in the editor comes from `BlockSlot`, and that is the point of the
component.** `useDraggable` returns four things that have to land on two
elements: `setNodeRef` on the element the library measures and moves,
`listeners` and `attributes` on the grip, and `setActivatorNodeRef` on the grip
so focus returns to it after a keyboard drop. Drop `listeners` or the node ref
and the grip still renders, still looks right, and starts no drag at all — by
mouse OR keyboard, with no error. Drop `attributes` and only the keyboard dies.
**A mocked test hides all of it identically**, because the mock supplies what
the real hook would have and cannot observe whether the component passed it on;
`block-slot.test.tsx` drives the real hook inside a real `DndContext` and keeps
a deliberately unwired grip beside it as a permanent control.

**`<DndContext id={useId()}>` on both contexts.** dnd-kit's id generator is a
module-level counter, and that id reaches the DOM as `aria-describedby` on
every grip — so two server renders in one warm process emit different ids and
every request after the first hydrates mismatched, invisibly in development.

**The announcements are ours.** dnd-kit's defaults are hard-coded English built
out of raw drag ids, which here are place paths and actor refs.
`dragAnnouncements` (`presentation/drag-announcements.ts`) says the app's own
words with the thing's one-based position appended — appended rather than
interpolated, because these strings are resolved on the server and handed to a
client component as data, and a function cannot make that crossing.

**A grip's test id is its PATH** — `drag-0` is the first section, `drag-0.1.2`
is a block three levels down — and each place's wrapper carries `place-<path>`.
A block has no identity but where it sits, and a path-shaped id is what lets a
spec name a grip at the cap without counting.

**`domain/section-block-shim.ts` survives, converting ONE way.** It used to run
at the write as well, because the only editor there was composed flat sections
and `set_actor_sections` refuses that shape outright. The editor composes
blocks now, so the write sends what the form holds and `blocksToSections` — the
reverse direction, which turned a stored tree back into flat sections for that
editor to open — is gone with the editor that needed it. Its remaining callers
are the two read paths and `fursona-templates.ts`, and neither is going away
soon: every page written before the block model is still FLAT in the column,
converted on the read by `readActorPage` and by the public pages' own
`parseBlocks`; and the shipped starters are still AUTHORED in the flat
vocabulary. **A page stays flat in storage until its owner next saves.**

**The picker stopped being one of those callers on 2026-08-28.** A starter is
converted once at module scope now, where it is declared, rather than on every
application — so `FURSONA_TEMPLATES` holds blocks and `STARTER_LAYOUTS` holds
the flat form the starters are written in. The split is deliberate rather than
transitional: the guards in `fursona-templates.test.ts` — both languages, no
prose, icons only on cards, explicit `sort_order` — are rules about **our own
authorship**, and rewriting them against the converted blocks would assert the
shim's output instead. So the flat form stays as the thing we write and the
block form is what anything downstream ever sees.

**Every flat layout still gets a DISTINCT `mode`/`kind` pair.** Nothing reads
one back any more, so this is no longer a round-trip requirement — what it buys
now is that two flat layouts cannot become the same block, so a converted page
still looks like the layout its author picked.

The part to know before touching any of it: **`ActorPage.sections` is a
union** — `[]` means nothing is written and an editor may replace it; `null`
means a page IS stored and this build could read it as NEITHER shape, and the
save refuses outright, before the fields, before the page and before the theme.
The two states used to be one, and the consequence was that opening any
block-tree page and pressing Save erased it: the parse failed, the read
answered `[]`, the mutation sent an empty tree, `set_actor_sections` accepts an
empty tree and REPLACES. A page gone, no warning, and the RPC reporting
success.

`tests/e2e/editor-saves-page.spec.ts` is what proves all of this in a browser:
every template, applied through the real picker, saved, **reopened in the
editor and compared field by field**, saved again, and read as a stranger —
plus a page built by hand, whose empty places have to come back still empty and
still in their own positions, and the person's own editor at `/me/edit`. The
reopen is the assertion that matters; a one-way test passes on a save that
retypes a section.

**`--card-size` has no reader and no control any more.** It named the minimum
width a card in an `auto-fill` grid could shrink to, leaving the browser to
decide how many fit — and a container declares an explicit space count now, so
that sentence cannot become true again for `grid`. The style popup's field went
with the flat editor rather than being carried across: a control that accepts a
choice, stores it and changes nothing is the worst kind there is. **The KEY
stays in the schema**, so a value the flat editor stored survives untouched.
The meaning survives exactly in CSS multi-column's `column-width`, which is
`masonry`'s to read and the intended home; whoever wires it moves the comment
in `block-schema.ts` and `0009`'s column comment with it, and puts the control
back.

### Embedded media is allowlist-and-rebuild, never pass-through

`domain/embeds.ts` is the whole security model of the media leaves and its
TSDoc carries the argument in full. The short version, because it must not be
weakened by somebody who only read this file:

**What somebody pasted never reaches the page.** Every branch parses the
address, checks the host against an exact set on the parsed `hostname`,
extracts an id matching a strict pattern, and then BUILDS a new address from a
fixed template. A hostile value cannot become anything worse than no embed.

**The allowlist itself is a table, `shared/domain/embed-providers.ts`, not a
chain of branches in `embeds.ts`.** `EMBED_PROVIDERS` holds one entry per
service — its hosts, its player origin, its `resolve` and its `src` — and
`embeds.ts` is the lookup over it. `PLAYER_ORIGINS` (in `player-origins.ts`,
which feeds the CSP's `frame-src` below) is **derived** from that same table
rather than kept as a second list pinned to it by tests on both sides, so a
host cannot be allowed in the policy without a provider that builds on it, or
built without being allowed. Adding another service is one entry in
`EMBED_PROVIDERS`; nothing else has to be told about it.

A `fast-check` property test,
`apps/hub/tests/embed-providers-properties.test.ts`, asserts that no
provider's `resolve` throws, across hundreds of generated hostile paths per
provider. It exists because a named-case suite already had 100% branch
coverage on `tidalPath` and still missed a real fault: `TIDAL_KINDS` was a
plain object once, and indexing it with an untrusted path segment like
`__proto__` or `constructor` resolved to an inherited, truthy value that
passed the `!entry` guard and then had no `.id` to call `.test` on — a thrown
`TypeError` with no case anyone had written that chose such a key. Coverage
measures which branches ran, not which inputs were tried; the property test
tries the input nobody thought of, on every provider, so the next one that
makes the same mistake fails here rather than in production.

- Only `https:` survives, so `javascript:` and `data:` cannot reach a frame and
  run in this page's origin.
- Hosts are never matched by prefix or suffix. `youtube.com.evil.example`,
  `evil-youtube.com` and `https://www.youtube.com@evil.example` all fail — the
  last one only because the comparison is on the parsed authority. This is the
  same mistake `return_to` had to avoid in the picker, and it is the same fix.
- Every query parameter is discarded. Carrying them would let whoever pasted
  the link set whatever options the provider honours.
- Any provider whose player takes an address as a parameter rebuilds it from
  parsed path segments and then encodes it, so a `&` in what somebody pasted
  cannot add parameters to the widget. SoundCloud and Mixcloud both do —
  URL-inside-a-URL is not unique to one provider, and a third provider shaped
  this way inherits the same rule.
- Anchors go through `safeHttpUrl` and an address that fails renders as plain
  text. React escapes text, not URL schemes; nothing upstream is catching this.
- Public links carry `nofollow ugc` as well as `noopener noreferrer`. A page
  anybody can publish links on has to say so, or it becomes a way to buy
  ranking.
- **No frame is granted `autoplay`.** A profile that starts making noise at
  whoever opened it is the thing people remember most fondly and least
  accurately about the pages this borrows from.

**There is a second layer now.** `shared/domain/csp.ts` sets a
Content-Security-Policy on every route whose `frame-src` is built from
`PLAYER_ORIGINS` — so a frame can only ever point at a player this app can
produce, even if the resolver were made to build something else. As above,
that agreement is structural now rather than two lists kept in step by
tests: `PLAYER_ORIGINS` is derived from `EMBED_PROVIDERS`, so there is only
ever one list to have gotten wrong.

Read that file before editing the policy. Two things about it are easy to get
wrong and both fail quietly:

- **Cloudflare Turnstile must stay in `frame-src`.** Clerk frames it for bot
  protection, and without it the sign-in form renders with an empty box where
  the challenge should be.
- **`script-src` carries `'unsafe-inline'`**, because Next inlines its own
  bootstrap. So the policy is **not** a defence against injected inline script,
  and it must not be described as though it were. **A nonce was considered and
  declined**: it forces every page to render dynamically, and the public pages
  are the ones least worth giving that up for. What guards the surface instead
  is `html-sinks.test.ts`, which counts every way a string can become markup or
  script here and fails when a new one appears — there are two, both fed module
  constants, both asserted to interpolate nothing. The parts that protect
  something are `frame-src`, `object-src`, `base-uri`, `form-action` and
  `frame-ancestors`, none of which depend on `script-src`. A nonce is the
  upgrade, and its cost is that every page renders dynamically.

### `social` accepts anything; `post` and the media leaves do not

`resolveSocial` (`domain/social-links.ts`) is deliberately the opposite of
`resolveEmbed`. **It accepts any `http(s)` address.** A host in its brand
table becomes a chip carrying that brand's label, icon and the handle pulled
from the URL; a host outside the table still becomes a chip, labelled with its
own hostname rather than dropped. It returns `null` only for an address that
must not be linked at all — `javascript:`, `data:`, or nothing parseable as a
URL.

**This is the property that makes the kind worth having, and the one somebody
will look at and want to "fix" by refusing an unknown host. Do not.** A
`social` leaf exists precisely so FurAffinity, Toyhouse, Weasyl, Ko-fi,
itch.io, Bandcamp and ArtStation — and whatever a person links next — all have
somewhere to go, with no table entry required and nothing that can break.
Nothing here reaches a frame or executes anything, so tightening this to a
known-hosts allowlist would not be a security fix; it would just delete the
kind's reason for existing.

Some services give each person their own subdomain — `luna.itch.io`,
`luna.bandcamp.com` — which an exact-hostname table cannot brand, because the
hostname differs for every user. These fall through to the generic chip,
labelled with their own hostname, and that is a correct outcome, not a gap.
**Do not "fix" it with suffix matching.** Suffix matching is exactly the
mistake `resolveEmbed`'s allowlist already refuses, for exactly the same
reason `return_to` had to avoid it in the picker: `evil-itch.io` and
`itch.io.evil.example` both look plausible under a suffix rule, and a chip
that can be spoofed into wearing a brand's name is worse than one labelled
with its own honest hostname.

A `post` leaf whose address resolves to no provider — Bluesky, always;
anything else `resolveEmbed` cannot place — renders as a `social` chip, never
as nothing and never as a bare link. The two kinds share the same chip
component for exactly this reason: a page that already brands Bluesky as a
chip on one would be inconsistent showing it unbranded on the other.

### A frame is the height its provider actually paints (2026-08-19)

**`FRAME_SHAPE` used to decide a height and no longer does.** Four shapes meant
four numbers, each chosen by reasoning about how a provider designs its widget,
and the note that stood here said so and asked not to be read as measurement.
It has been measured now, in a real Chromium, **inside each provider's own
document**, and every one of the four was wrong: a short tweet painted **225px
of the 600px `post` box**, an Instagram photo left 156, Telegram overflowed by
181 and TikTok by 187, and an **Apple Music album needed 450px in a 168px
box**. The whole account, with screenshots, is
`.superpowers/sdd/embeds-that-fit/measurements.md`; the numbers that shipped are
in the TSDoc beside each of them.

There are three mechanisms now, and which one a provider gets is not a
preference:

- **It reports its own height.** X/Twitter, Instagram and Telegram post one
  unprompted and post a fresh one after every width change; every allowlisted
  Mastodon instance answers a request but volunteers nothing. `EmbedFrame`
  (`presentation/embed-frame.tsx`) listens, and `shared/domain/embed-fit.ts`
  parses — an object for Twitter, a **JSON string** for the other two, parsed
  defensively and never evaluated.
- **It was measured, and the number lives in the table.** Spotify (152 or 352,
  its own snap points), Apple Music (450 album or playlist, 175 song), a Tidal
  track (121), TikTok (756). `EmbedResolution.height` carries it, so it is
  server-rendered.
- **It fills whatever it is given, and must not be pinned.** YouTube, Vimeo,
  Dailymotion, Twitch, SoundCloud, Deezer, Mixcloud, a Tidal album or playlist.
  `height: null` says so, and a number there would crop a scrolling list nothing
  was wrong with.

**The height depends on the KIND, which is why it is threaded rather than
looked up.** Apple Music serves an album, a song and a music video from one
host; Spotify a track and a playlist; Tidal a track and an album. Each
resolver already parsed the kind to decide whether the address was playable at
all and then discarded it — one number per provider is exactly what put a
450px player in a 168px box. `resolve` answers an `EmbedResolution` now, and
the kind is spent in the same expression that accepts it. **Apple's
`music-video` overrides the SHAPE rather than the height**: measured at 320,
420, 640 and 900 wide it painted 180, 236, 360 and 506 — 16∶ 9 to the pixel —
so it is a video, and any fixed number would be right at one width.

**Only the frame is a client component, and the server render is the one that
works.** `blocks.tsx` stays server-rendered whole — the container-query work
depends on it — and `EmbedFrame` is the single leaf carrying `"use client"`,
because a `postMessage` listener needs one. The box is server-rendered at the
measured constant or the shape's own class, so a reader with no JavaScript, or
one looking before the message lands, sees a sensible frame; script only ever
refines it. That is also why the Mastodon measuring state starts OFF and is
turned on in an effect — rendering it on the server would put the collapsed
frame in the HTML, which is the one state a page must never fall back to.

**Mastodon has to be asked from a COLLAPSED frame.** It answers
`max(content, frame height)`, measured across four instances and four heights,
so asking from the resting 600px box returns 600 and proves nothing. The frame
inside the box drops to 1px, the ask goes out on `load` to the provider's exact
origin (never `*`), and the box holds the page still throughout so nothing
moves. It gives up after its last ask and restores the resting height, which is
what makes an instance that is down — or one serving a federated post —
degrade rather than stay one pixel tall.

**The height lands on the FRAME and the box takes `auto`, and getting that
backwards silently undoes the whole feature.** Everything here is `border-box`
and the box carries the border, so a height put on the box is the border's to
spend first and the frame inside gets two pixels less than the number measured
for it. Measured in the real app: Spotify picks its card from the viewport
height it is handed and **snaps DOWN** at every boundary, so a 152px box gave
it 150 and it drew the **80px** card — a feature that read as shipped and was
worse than what it replaced. Tidal, TikTok and Telegram were each cropped by
exactly two pixels by the same arithmetic. Sizing the frame and letting the box
follow holds for any border width a skin declares; adding two pixels back would
have held only for the width it was measured at.

**A height message is checked on BOTH its origin and its source.** Either alone
is not a check: origin alone lets one embedded post resize every other frame
from the same provider, and source alone lets any frame claim anything. The
claimed number is also bounded before it reaches a style — a frame is a third
party's script, and an unbounded height is a page a visitor cannot scroll off.

**A height never touches the `src`.** Every address still goes parse → exact
host match → strict id → rebuild from a fixed template; a reported number
reaches the box's `height` and nothing else.

**Pinterest cannot be made to fit, and that is measured rather than inferred.**
It posts nothing, answers nothing, and ignores every size parameter tried — and
six different pins measured **516, 638, 645, 750, 840 and 962** in the same
420px-wide frame. No constant is right for a second pin. It keeps the `post`
box, and whoever revisits this should be weighing "treat it as a link" rather
than looking for a better number.

**`player.mixcloud.com` does not exist, and had not for as long as the entry
had.** No A, no AAAA and no CNAME on either public resolver, so every Mixcloud
frame this app ever rendered landed on a browser error page, at any height. The
widget is on `player-widget.mixcloud.com` — named directly rather than reached
through `www.mixcloud.com`'s 301, because `frame-src` is derived from `origin`
and a redirect's destination is a second origin to have to allow.

**A federated Mastodon post cannot be framed and no parser can tell.** The
address an instance's own web UI shows for a post it received from elsewhere
answers its `/embed` with a 404 carrying `X-Frame-Options: DENY` and
`frame-ancestors 'none'`; a LOCAL post's `/embed` carries neither. The two are
the same shape. What happens is the frame renders the error page, answers no
height request, and the give-up leaves it at the resting height — so it
degrades to a blank frame rather than a collapsed one. Somebody wanting a
federated post has to paste its address on the originating instance.

**A frame narrower than its place is centred, and a lone block on a part-filled
last row is too.** `FRAME_BOX` caps the FIGURE rather than the frame, so a
caption is as wide as the thing it captions, and `mx-auto` splits the leftover
instead of pushing it all right. `LONE_CENTRE` handles the grid case, and only
for space counts where the leftover divides evenly — three places and five —
and never for a weighted grid, where the tracks either side are not the same
width and "one each" means nothing.
Both move where a block is DRAWN and neither moves anything stored.

### Era looks (2026-08-28) — five OPTIONS, and not one new skin

`domain/era-looks.ts` holds five looks aimed at five eras of somebody else's
operating system, as a second test of reach after the eleven social pastiches.
**Every one is an option and none is a default**; a page that picks none is
byte-for-byte what it was.

**Each look wears its release's own mark as an avatar, and is public and listed
(2026-08-29).** They carried no artwork and were seeded `unlisted` — the
opposite line from the eleven social pastiches beside them, recorded as a
deliberate difference rather than settled. It is settled towards consistency:
an empty circle where every neighbour has a mark reads as unfinished, and five
looks nobody browsing `/137` can find are five looks nobody sees. The marks are
hot-linked by the seeder and none is committed.

**Four of the five are WORDMARKS, so `identity()` sets `image_fit: "contain"`
on its avatar leaf.** The XP, Vista and 7 lockups are about five times as wide
as they are tall and the avatar renders `object-cover` on a circle, which crops
them to two meaningless fragments — the same fault `image_fit` was added for
when the social pastiches were first given their real logos. It reaches
somebody who PICKS one of these as a template too, which is the safe direction:
`contain` and `cover` are identical on a square portrait and differ only on one
that is not, where showing the whole of somebody's character beats cropping
it.

**Not one new skin was added, which is the finding that shaped the phase.**
`retro` already IS Windows 98's raised bevel and `aero` already IS Aero glass,
so three of the five needed no chrome written at all. Adding `win98` or `win7`
to `SKINS` would be the "another set of numbers" the bar forbids. What a look
adds is the PALETTE and the arrangement around an existing skin — which is
exactly why a look is a document rather than a vocabulary member.

**Vista and Windows 7 differ by PALETTE, not mechanism**, and that is a
refinement of the spec, which called them near-identical. The captures show one
dark-tinted on green and the other light-tinted on blue; both are `aero`. It is
the clearest single piece of evidence in the phase that a look is a document.

**A look is a FURSONA document and a person's page refuses it.** It names
`owner`, which has nothing to render on somebody's own profile, so
`set_actor_sections` refuses the save outright. The picker withholds what does
not fit — `fitsActorKind` — because offering one at `/me/edit` would hand
somebody a page that applies cleanly and then cannot be saved, which is the
"the control did nothing" fault wearing its worst face: it looks like it did
everything. A PASTED document needs no such filter, because `parseDocument`
already reports a refused kind as its own problem, naming the block; only the
picker, which does not parse, needed asking.

**A look carries its own identity section** rather than leaving it to
`withRequiredBlocks`. A look is pasted as well as picked, and a paste never
runs the read path that would add one.

**Windows 8 is a FINDING rather than a delivery, and it was predicted before it
was built.** Metro is flat solid tiles in DIFFERENT colours — the capture holds
seven in one screen — and per-block colour is refused by design. What IS
reachable is everything else, and it is worth knowing how much: `chrome:
"bare"` removes fill, edge, shadow and padding together, `radius: "square"`
squares the corners, `spacing: "compact"` closes the gaps, and the mixed tile
sizes are ordinary `spaces` and `weights`. So the arrangement lands and the
colour does not, which is the most useful shape a failure can have — it names
one mechanism rather than a feeling.

**Gap 8 is CLOSED (2026-08-28): `theme.surface` is a page-level panel
colour.** Null derives the stepped panel every page had, so nothing stored
moved. Choosing one gives the page TWO grounds, and `derivePalette` solves ink,
muted and edge against whichever leaves least room — the hardest-stop rule
extended from one ground to two, with the same reason: text has to clear its
minimum wherever it lands.

**What it guarantees is narrower than "both grounds clear 4.5", and a failing
test is what found the difference.** `#008080` sits near mid-lightness and
never cleared the minimum with or without this key; measured, choosing a
surface leaves the field at 4.05 exactly and takes the panel from 4.97 to
10.61. The contract is **a second ground costs the first nothing**. Weakening
the assertion to make it pass would have been rule 7's forbidden move.

**`--bar-solid` follows the surface's own HUE now**, not the background's. It
used to splice `bgH` onto the surface's lightness, which was harmless while a
surface was always a tint of the ground and wrong the moment it stopped being
one.

**What the photographs then found, which the plan could not.** One gap
explains most of the fidelity loss across three of the five: **a page cannot
choose its SURFACE colour independently of its background.** Every derived
colour comes from the background gradient, so a panel is always a tint of the
ground. Win98 wants silver on teal, XP near-white on blue, Metro coloured tiles
on black — one missing mechanism, three looks. It is NOT gap 6, which is
per-block colour; this is per-page, and it is the more ordinary want.

**`chrome: "bare"` was the wrong tool for Metro, and that is a trap rather than
a gap.** `bare` drops the FILL along with the edge, shadow and padding, so the
first attempt turned the tiles into floating labels on black. A tile is a
strong fill with no border and no corner — `card` plus `border: "none"` plus
`radius: "square"`. The key reads as if it meant "flat" and means "absent".

**A look must turn the canvas off if its ground is flat.** Windows 98, XP and 8
are flat desktops, and the default drifting nebula painted clouds across all
three until each said `canvas: "none"`. It reads as a bug in the look rather
than a default doing its job.

**Vista and Windows 7 needed nothing new at all**, which is the strongest
evidence here that a look belongs in a document: `aero` carries Aero glass
whole, and photographed, the Vista page reads as Aero without qualification.

**Windows XP reaches Luna's panel shape now, and this note recorded it as
unreachable until 2026-08-29.** `radius` was one value for all four corners,
so `soft` rounded the foot as well as the head and the strip could not sit
flush on the body. `corners` and `heading_corners` are the key that was not
invented on the way past — it arrived from the other end, from somebody
looking at these pages and naming what was missing, which is the outcome the
old sentence was holding the question open for.

The XP look wears it: the bar rounds its top and squares its foot, the body
squares its head and rounds its foot, and the join is straight.

**`heading_pad` reached Windows 98 and `heading_gap` deliberately did not
(2026-08-29).** Win98's two barred sections take `heading_pad: "snug"`,
sampled off the capture's own tight title-bar chrome. `heading_gap: "none"`
was tried on the same sections and on XP's, and reverted on both: a barred
heading's gap already collapses to `gap-0` with no key set at all
(`blocks.tsx`'s own fallback, `barred ? "gap-0" : "gap-3"`), so setting it to
`"none"` there reads the identical class — a key that shows as a change in
the diff and changes nothing, which `blocks.test.tsx`'s own heading-gap
comment names directly. That is the same trap the task adding these four keys
warned about for `heading_pad` on Vista and 7, just on `heading_gap` instead,
and on two looks the warning did not name.

Vista, 7 and 8 took no heading key at all, and not for the same reason as each
other. Vista and 7 because Aero's title bar is measurably translucent glass —
sampled off both captures — and turning it into a solid `bar` to reach
`heading_pad` would erase the one thing the era is. Windows 8 because its
capture shows real air between "Start" and its tiles: `heading_pad` is a dead
letter there regardless (no bar is drawn), but `heading_gap` is **not** gated
the same way — it reads from the table whenever a value is set, defaulting to
`gap-3` only when absent — so `heading_gap: "none"` there would have been a
real, wrong weld rather than the harmless no-op it is on a barred section.

### A template is a document too (2026-08-28)

**A template could not carry a look at all, and an era look is mostly look.**
`FursonaTemplate` was `{ id, sections }`, so the picker could hand over
structure and nothing else — no skin, no palette, no heading, no spacing. It is
`{ id, blocks, theme }` now, extending a named `ChosenPage` that is
deliberately the same shape `parseDocument` RETURNS, so a pasted document and a
picked template are indistinguishable by the time either reaches the form.

**One path applies both, and that is a function rather than a convention.**
`applyDocumentTo` in `fursona-editor.tsx` is called by the source dock and by
the picker. Two implementations would have looked identical the day they were
written and disagreed the first time either changed — and what they would
disagree about is destructive.

**The seam the spec implied but did not locate:** `BlockEditor` holds the
picker and does NOT hold the theme. `control` reaches one field, the page; a
look is a second field the editor above owns. So the picker's choice is
forwarded up through `onApplyDocument` rather than applied there, and
`BlockEditor` keeps having no opinion about a look and no field to put one in.
It still runs `withRequiredBlocks` on the way past, for the reason it always
did: a template names no identity block and applying one REPLACES the page.

**`if (chosen.theme)` is load-bearing and must never become unconditional.**
Null means leave the author's colours alone, and every shipped starter carries
null — so an unconditional write would reset somebody's palette on the ordinary
path rather than an exotic one. Two cases guard it and they are NOT the same
claim: the dock's proves the branch, the picker's proves the picker reaches it,
and the picker's route could drop the theme, invent one, or pass a resolved
default without reddening the dock's. Sabotaging the guard reddens both.

**The confirmation tells the truth about THIS template, which needed a second
string rather than a reworded one.** Applying a starter touches no colour —
every shipped one carries `theme: null` — so a single warning that mentioned
colours would be a lie on the ordinary path, and a warning somebody learns is
wrong is worse than no warning. `templateConfirm` names the page;
`templateConfirmLook` names the page and the colours; the picker chooses on
`pending.theme`. Both branches are asserted, and the PAIR is the point: either
alone passes on a component that shows one message unconditionally, and each
direction of sabotage reddens only its own case.

**`TemplatePicker` takes its list as a prop now, defaulting to the shipped
one.** Nothing in the app passes another — it exists so the themed branch can
be REACHED. No starter carries a look, so without it the only ways to guard
that branch were to mock the module for every case in the file or to leave it
unguarded until phase 2 ships something that reaches it. Leaving a destructive
branch unguarded until something reaches it is the fault this repository keeps
paying for.

**`BlockEditor` takes the live theme — asked about, never styled with — and
without it the whole guard was unreachable.** `holdsNothingAuthored` is a
question about the WHOLE page and that component holds only half: the blocks
are there, the palette is a field the editor above owns. For one commit the
call site simply did not pass it, so somebody who had chosen colours and
nothing else got no confirmation — the guard existed, was correct, and was
reached by nothing.

**Every unit test passed while that was true**, because the case meant to
cover it clicked the confirmation only `if` it was present. A tolerated
absence is not an assertion; it is root rule 23 wearing a conditional. What
found it was the browser suite, where the click had nothing to click and timed
out. The case asserts the confirmation now, and sabotaging the call site back
reddens it.

**A colour chosen before a template now triggers the confirmation**, which is
`holdsNothingAuthored`'s new argument reaching a real browser:
`editor-saves-page.spec.ts` picks a colour, applies every template, and asserts
the palette survives both the application and the round trip through the
database. A unit test structurally cannot check the second half.

**`holdsNothingAuthored` takes the theme for this feature's sake** — see its
own paragraph above. Applying a template now replaces colours as well as a
page, so somebody who chose only colours has to be asked first.

## A page has a document (2026-08-27)

`page-document.ts` owns `{ aeleos, theme, blocks }` — the two `jsonb` columns
of `actor_profiles`, with identity deliberately absent so an imported page
renders with the importer's own portrait and name. An imported theme goes
through `parseTheme` and never through `themeSchema`, because the form
schema's looseness is justified by controls a paste does not have; an explicit
`"theme": null` reads the same as an omitted key — both mean leave the current
theme alone, never reset it. The size is checked before `JSON.parse`, never
after. Read the spec `2026-08-27-page-source-and-sharing-design.md` before
changing any of it.

**A `theme` that is present but not a plain object — `[]`, a string, a
number — is refused as its own `envelope` problem too (2026-08-28), found by
a whole-branch review.** `parseTheme` coerces any non-object to `{}` and
answers an all-defaults theme, which is the exact destructive reset `null` is
already refused above for, on an input that is more clearly malformed rather
than less. `isMalformedTheme`/`resolveEnvelope` in `page-document.ts` are
where this lives, and the guard runs BEFORE `blocksSchema` ever sees the
blocks — so a document carrying both a malformed theme and bad blocks reports
only the theme problem, the same envelope-before-contents ordering every other
envelope-level refusal here already uses.

**A refusal is reported by WHERE it was found, not by re-walking the tree a
second time.** `blockProblemsFromIssues` (`block-problems.ts`, beside
`blockProblems`) reads a raw `ZodError`'s own flat `issues` array — there is
no react-hook-form tree here, because `parseDocument` has no resolver — and
shares `blockProblems`' rule exactly: the numeric steps in an issue's `path`
are the `BlockPath` and the final named step is the field, with every other
named step (`children`, `style`, or anything nested under it) simply not
counted rather than matched by name. That is what lets a refusal inside a
block's own `style` bag resolve to a path with no special case for `style` at
all, and it was measured against the installed zod rather than assumed —
verify any future zod upgrade still reports `[0, "children", 2, "children", 0,
"children", 0, "title_en"]` for a nested block before trusting this again. **A
tree nested past `MAX_DEPTH` surfaces the same way "too many blocks" does**,
as an `envelope` problem naming `"too deep"` rather than a `block` problem: its
own issue path ends in a number, not a field, so there is nothing for
`blockProblemsFromIssues` to mark.

**`JSON.parse` runs behind a reviver that refuses `__proto__`, `constructor`
and `prototype` at any depth, as defence in depth rather than a fix for a real
pollution.** `JSON.parse` does not itself put a `"__proto__"` key onto
`Object.prototype` — confirmed against the installed engine, not assumed — but
nothing downstream of a paste should have to prove that of every future
consumer, which is the same reasoning `TIDAL_KINDS` cost this codebase once
already. A document carrying one of these anywhere is refused as its own
`unsafe-key` problem, named rather than folded into `syntax` — telling
somebody their JSON has a syntax error at a position that is fine would be
worse than not checking at all.

**The reviver costs a much lower parser depth ceiling, and that is measured
rather than assumed.** A plain `JSON.parse` has no ceiling reachable within
`PASTE_LIMIT_BYTES` — 5,000,000 levels parsed fine. Handing it a reviver makes
the engine walk the result calling the reviver on every property, and THAT walk
recurses in JS: measured against the block model's own container shape,
2026-08-27, the first depth to throw `RangeError` is 857 in this repo's vitest
worker and 863 in plain Node (862 is the last depth still accepted there) —
reachable inside the byte cap, since 2,000 such containers serialise to about
120KB against a 128KB cap. It cannot escape as an uncaught throw: `RangeError`
is an `Error`, so the same `catch` that reports a genuine syntax error reports
this one too. **The test fixture covering this is coupled to the host's own
stack**, not a flake: its window is bounded below by that ~857-863 ceiling and
above by the byte cap (~2,180 levels), so a runner with a materially larger
stack would parse it cleanly and redden the case on `at: "envelope"` instead.

**The reference is generated, and its meanings are gated.** `page-reference.ts`
interpolates every list and cap from the constants; the one-line meaning of
each mode, kind and theme key is hand-written and `page-reference.test.ts`
fails the build when a vocabulary member has none. Its worked example is run
through the real `parseDocument`, **and is checked against
`missingRequiredKinds`** — `parseDocument` only ever checks refused kinds, so
an example missing a required one would still parse `ok: true` while
`set_actor_sections` refuses it. An example a model copies and this build
refuses is worse than no example.

**`table` was never the only kind that reads `rows`, and this file's own
TSDoc said otherwise until 2026-08-28.** `player` and `jukebox` read it too,
as their playlist (`leaf-fields.ts`'s `RETRO` entry has carried `rows: true`
since both existed) — and `page-reference.ts` had copied the identical false
claim into the generated reference. That is exactly why the spec forbids
generating the reference from this file's TSDoc: the TSDoc was not merely
differently toned, it was **wrong**. Both are corrected now, and the
reference's `ROWS_MEANINGS` is gated against `leafFields` — checked per kind
in `page-reference.test.ts` — rather than asserted by hand a second time.

**The identical sentence had a THIRD copy, in `text-leaves.tsx`'s own
`tableRows` TSDoc — "every kind stores them and only this one reads them" —
found and corrected 2026-08-28, one review round after the first two.** Three
independent authors (or the same author three times) wrote the same false
generalisation about the same field without any of them checking it against
`leafFields`, which had the true answer the entire time. The lesson from
`table` was "fix the origin, not the copy"; the lesson from a THIRD copy
surviving that fix is that a false sentence does not announce which other
files repeat it — grep for the claim, not only for the file you already know
about.

**And there was a FOURTH, found on 2026-08-28 by taking that last sentence
literally on the closing task of this branch.** `0009_actor_profiles.sql`'s
`is_block_kind` carried the identical claim as an inline comment above
`'table'` — "The only kind that reads `rows`. Every other kind ignores it" —
**sixteen lines below its own `'player', 'jukebox'` comment saying "Both read
`rows` as a playlist".** So the file the root note calls the readable index of
the block model contradicted itself inside one `select ... in (...)` list, and
the three rounds above had each grepped the TypeScript and stopped there.
Every correction they claim is real; what was wrong was reading "the third
copy" as "the last copy", three times running, on a sweep that had never left
one language.

Two things follow, and the second is the one that generalises. **Grep the
whole repository for the claim, not the language you were working in** — a
model documented in TypeScript and in SQL has two places to be wrong, and
neither of the mechanisms below this paragraph reads the second one: the
`/\bonly\b|\bevery other\b/i` gate runs over `page-reference.ts`'s records,
and `check:docs` compares a TypeScript symbol against its own code. A `.sql`
comment is outside both, so it is grep or nothing. And **a comment inside a function body
is `prosrc`, so correcting one is an edit to an applied migration**: it was
hand-applied to the live project the same day and `pnpm check:schema-drift`
re-run green either side of it. Root rule 28's own incident is the proof that
this matters rather than an assumption — CRLF inside these same function
bodies was reported as drift precisely because migra compares source text.

**The STYLE keys had no meanings at all until 2026-08-29, which is the gap
this whole mechanism existed to prevent.** `MODE_MEANINGS`, `KIND_MEANINGS`,
`THEME_KEY_MEANINGS` and `ROWS_MEANINGS` had been gated for months; the style
bag was generated from `BLOCK_STYLE_LIMITS` alone, so the reference told a
model that `heading_gap` accepts `none`, `snug` or `roomy` and **nothing
whatever about what any of them changes**. Every key added since inherited the
omission silently, because the generator was working exactly as written.

`STYLE_KEY_MEANINGS` closes it, gated the same way and covered by the same
exclusivity pattern. Two things it cost that are worth carrying:

- **The gate catches a SPELLING; a writer has to catch the shape.** A first
  draft said `heading_pad` is read where a bar is drawn "and nowhere else" —
  the exact claim `/\bonly\b|\bevery other\b/i` exists to refuse, phrased
  around the words it looks for. Rewritten to say why instead: a plain name has
  no strip to pad.
- **A defensive fallback became an untestable branch.** The first version read
  the meaning with `meaning ? … : ""`, and the coverage gate refused it: the
  record is `satisfies Record<keyof typeof BLOCK_STYLE_LIMITS, string>`, so
  there is no absent case to reach. Typing the parameter as
  `keyof typeof BLOCK_STYLE_LIMITS` and indexing directly removes the branch
  rather than testing it.

**`0009`'s own column comment was stale in the same breath**, and by more than
this branch: it still said `heading (plain/bar/gradient)` after `soft` shipped.
That comment is the readable index of the block model, so it now carries `soft`
and the three new keys — and, being `prosrc`-adjacent, it is an edit to an
applied migration that was hand-applied to live with `check:schema-drift` green
either side.

**An exclusivity claim belongs in a gated record, never in prose, and this
was learned by trying it twice.** Round 1's sabotage — restoring
`page-reference.ts`'s hand-written `table` meaning to claim exclusivity over
`rows` — reddened nothing, and the honest conclusion at the time was that a
prose falsehood is not mechanically catchable. **That conclusion was true of
arbitrary prose and false of this one CLASS of claim.** Round 2 then
introduced two MORE sentences of the identical shape while fixing other
things — "children still fill places row by row [...] whichever mode is in
charge" (false for `carousel`/`tabs`/`accordion`) and "an invalid value for
any other theme key... falls back to the design's own default" (false for
`density`/`speed`/`scale`, which clamp rather than reset) — each a true
statement about a SUBSET, generalised with "only", "every other" or "any
other" into a false one about the whole. `page-reference.test.ts` now asserts
`KIND_MEANINGS`, `MODE_MEANINGS` and `THEME_KEY_MEANINGS` contain neither
`/only/i` nor `/every other/i` anywhere — sabotage-verified to redden the
original `table` claim — which is what makes the rule enforceable rather than
merely stated: **the moment a meaning needs to say a kind is exclusive, that
claim has to move into a record checked against real data (the way
`ROWS_MEANINGS` is checked against `leafFields`), because the sentence beside
it is not proof of anything.**

**Round 2 SHARPENED a pre-existing falsehood into a more precise one by
naming a mode explicitly, without checking the mechanism (round 3).** Section
2's `spaces` prose already said the wrong thing about every mode when it said
"whichever mode is in charge, children fill rows"; fixing `carousel`/`tabs`/
`accordion` and then writing "for both of them [`grid` and `masonry`],
children fill places row by row" made the SAME underlying error concrete and
specific by naming `masonry` outright — which is false, because CSS
multi-column fills column-major (down the first column, not across the first
row), the exact fact `MODE_MEANINGS.masonry` two paragraphs above already
states ("packs children into columns by height"). The lesson: correcting an
adjacent falsehood is not the same as verifying the sentence you are writing,
and a self-contradiction inside the SAME generated document — one paragraph
naming the mechanism correctly, another getting it wrong — is a check worth
running on its own, not assumed to follow from fixing something else nearby.

**The gate's regex grew a word boundary (round 3): `/\bonly\b|\bevery
other\b/i`, not the bare `/only|every other/i` round 2 shipped.** A fragment
match snags "commonly", "monopoly" or any future word merely containing "only"
— harmless today, since nothing in these records happens to contain such a
word, but a future true sentence could lose a legitimate word to it for no
reason connected to what the gate exists to catch. Sabotage-verified again
after the change: restoring the original `table` claim still reddens it.

**Where the history of a correction belongs is not inside a `@param`
(round 3).** `text-leaves.tsx`'s `tableRows` carried five lines of
provenance — including the original false sentence, quoted verbatim — inside
its `@param leaf` description, which this repo reserves for the parameter's
own contract. A `@param` is read as an assertion about the parameter, not a
changelog; quoting a falsehood there plants a searchable copy of it exactly
where someone skimming mid-comment is most likely to read it as still true.
The fix moved the (now true) fact into the function's TSDoc body and cut the
provenance entirely, since this note already carries it.

**A known, accepted limit: the gate cannot catch a fourth inverting kind.**
`stat`, `quote` and `progress` each name the OTHER two in their own meaning
("the pair is inverted, the same as `quote` and `progress`", and so on) —
hand-maintained cross-references rather than a derived list, because nothing
in {@link LEAF_KINDS} or `LEAF_FIELDS` marks which kinds invert their
title/description pair (that fact lives only in `block-schema.ts`'s own
TSDoc). If a fourth kind is ever given the same inversion, these three
sentences would need a fourth name added by hand, and nothing here would
fail if that were forgotten — "the same as X and Y" contains no `only` or
`every other` for the gate to catch, so this is a real residual gap. Ruled
deliberately NOT worth a mechanism for: three members is not worth a second
gated record the way sixteen leaf kinds or eight container modes are, and
the cost of getting it wrong is a slightly incomplete cross-reference, not a
falsehood the shape `ROWS_MEANINGS` was built to prevent. Revisit this
ruling if a fourth inverting kind is ever added — that is the moment the
maintenance cost stops being hypothetical.

### The document is bound to the page live, in both directions (2026-08-28)

`application/use-page-source.ts` is `usePageSource`, the state machine behind
the source dock — a textarea showing `toDocument`'s output, editable, changing
the live page as it is typed. It takes `theme`/`blocks` the same way the rest
of the form holds them and an `apply` callback; it never touches
react-hook-form itself, which is what keeps it testable with no form mounted.

**The page holds the last good tree because a bad parse never writes anything,
not because a copy is kept anywhere.** There is no second "last good" variable
in the hook. A failed `parseDocument` sets `problems` and returns; `blocks`/
`theme` are exactly what they already were, because nothing ever called
`apply` to change them. A stored copy would be a second source of truth able
to disagree with the form that actually holds the page — the absence of a
write is the whole mechanism.

**Which direction wins is arbitrated by one `mirror` ref, read before every
write in both directions.** `mirror` holds the last serialisation this hook
itself produced or accepted — never the tree, only the string. Text → page is
a debounced valid parse (`onChange` records every keystroke and schedules a
parse `debounceMs` later, cleared and rescheduled on each one); on success
`mirror` becomes the CANONICAL form of what was accepted (never the raw
typed text — see the paragraph below this one for why) and `apply` is
called, and that is the
**only** place this hook ever writes to its caller. Page → text is a
`useEffect` on `[theme, blocks]` that re-serialises and compares the result
against `mirror` **by string, not by reference** — a caller's form very often
hands back a freshly built array for content that has not actually changed,
so comparing `blocks` by identity would treat that as a real change and
re-enter the loop. Past that guard, a genuine external change overwrites the
box while it is unfocused and is recorded as `drifted` while it is focused,
never both — naively re-serialising a focused box would destroy the author's
whitespace and jump their cursor mid-word, which is why `resync` exists as an
explicit choice instead. `focused` is tracked in a ref rather than state,
deliberately: nothing renders from it directly (only `drifted` does), and a
ref read inside the effect does not have to be a dependency the way a state
variable read the same way would.

**`mirror` is set to the CANONICAL `toDocument` output of what was accepted,
never to the raw text that was typed — a round 1 review caught this wrong in
the shipped version, and it is worth stating exactly how it was wrong, because
the wrong version passed its own test.** The first version set
`mirror.current = next` (the literal typed string), which only ever equals
`toDocument(theme, blocks)` when the person's typed text happens to BE
`toDocument`'s own canonical form — indentation, key order and envelope all
included. That is true of no ordinary hand edit: different whitespace,
different key order, the bare-array shorthand all break it. So the guard
worked for exactly one input, and the round-1 test happened to type that one
input (`toDocument(...)` itself) — a fixture that could not discriminate a
real guard from one that only works by coincidence, root rule 27 exactly. The
fix stores what the ACCEPTED PARSE re-serialises to,
`toDocument(parsed.theme ?? theme, parsed.blocks)`, so the round trip compares
like against like whatever the person actually typed. `onChange`'s
`useCallback` deps now include `theme` for the same reason: the fallback
`parsed.theme ?? theme` reads the CURRENT theme prop, and a stale closure over
an old one would silently compute the wrong mirror.

**The mirror guard is what stops a successful edit from immediately declaring
itself drifted.** The ordinary shape this hook is used in has `apply` call
`setValue`, which re-renders the form with new `theme`/`blocks` props on the
very next tick — while the box is very likely still focused, since the person
just finished typing. Without the guard, that round trip would flag `drifted`
on every accepted edit, because the props changed and the box is focused.
`use-page-source.test.ts`'s two "loop guard" cases are built around exactly
this, and deliberately type the bare-array shorthand rather than `toDocument`'s
own output — a NON-canonical valid document is what a real hand edit looks
like, and it is the only fixture that can tell the fixed guard apart from the
round-1 guard that merely happened to pass. One case asserts `drifted` stays
`false` after the round trip while focused; the other asserts `text` is not
silently reformatted into canonical JSON while unfocused. Sabotage-verified
against the fixed code: removing the `if (doc === mirror.current) return;`
line reddens both loop-guard cases and no others, 14 of 16 still passing.

**A successful `apply` also clears `drifted`.** Once the person's own edit has
been applied, the page IS what their text says, so a `drifted` banner
surviving their own change would be lying about a disagreement that no longer
exists.

**Blur does not self-heal a drift, and that is a consequence of the `focused`
ref worth naming rather than assuming away.** The page→text effect only
depends on `[theme, blocks]`, never on focus, so a box left `drifted` while
focused stays `drifted` after the person clicks out of it — until `resync`, or
until the next genuine page change arrives while the box happens to be
unfocused. A `useState` for focus would have made the effect re-run on blur
and could have cleared the flag there instead; the ref does not, and that is
kept deliberately: a blur is not the person accepting or declining the drift,
so silently healing it on blur would be a second, unannounced way for their
box to change under them — the exact thing this whole hook exists to prevent
in the other direction.

Sabotaging the focus branch itself (making the effect write `text`
unconditionally, regardless of `focused.current`) reddens **three** cases, not
one: the case built directly against it (`keeps the box and flags drift when
it is focused`), and two more whose SETUP reaches the same branch as a
precondition (`clears drift once the person's own edit is applied` and
`throws the box away and re-reads the page on resync`, both of which first
drive the page into a drifted state by rerendering while focused before
testing what happens next). Only the first of the three is independent
evidence of the fault — the other two fail on a precondition assertion before
reaching the behaviour they actually name, root rule 23's "corroborating, not
independent" exactly. Recorded here rather than only in the task report,
because whoever next changes this branch should know the true blast radius of
breaking it, not the undercount an earlier review round shipped.

Two more things worth knowing before touching it. `resync` cancels any
pending debounce timer before re-serialising — otherwise a parse scheduled
just before `resync` would still land 250ms later, applying an edit the
author asked to throw away right on top of the page `resync` just restored.
And the `theme: null` a parse returns for a document that carried none is
passed to `apply` **verbatim** — this hook does not resolve it to a real
theme, because the caller is the one holding the actual current theme in its
own form and is the one who gets to decide what "unchanged" means.

**The panel that shows it, `presentation/page-source-dock.tsx`, is a DOCK and
not a modal, and that is a design idea rather than a taste.** The editor's
document IS the page — the author's own theme paints it — so a modal backdrop
would put the very thing this panel exists to be watched against underneath
the panel itself. It opens with the native `<dialog>`'s `show()`, never
`showModal()`, driven by a `useEffect` on `open` that calls the imperative
methods; the `open` attribute is never written from JSX, because that would
open the dialog the browser's own way rather than this component's. **jsdom
26.1.0, the version installed here, implements none of `show`, `showModal` or
`close` on `HTMLDialogElement`** — confirmed by direct probe, not assumed —
so its own test stubs all three on the prototype before rendering, and a
component that guarded the calls instead would hide the exact mistake
(calling `showModal()`) it exists to refuse.

**`--menu` is a guarantee here, not a preference.** What sits behind this
panel is a colour the page's own author chose, and they may choose any colour
at all — a translucent panel has no guaranteed contrast against a page
somebody else designed, and no measurement can give it one. `--menu` is the
one token declared opaque in both modes, the same reason the editor toolbar
and the style popup's panel both take it.

**Tab is deliberately unhandled in the textarea.** Trapping it — swallowing
the keystroke to insert a literal tab character — strands a keyboard user
mid-escape, so the absence of an `onKeyDown` for Tab is the feature rather
than an oversight. Escape is the one key this component reads, to close
itself, since a non-modal dialog gets no native Escape handling at all (that
is `showModal()`'s job).

**It wears `CHROME_SCOPE`**, which is what lets the editor's existing
hide-controls rule remove this panel by CLASS — the rule that already strips
every `CHROME_SCOPE` island when the controls are hidden reaches this one with
nothing added, and nobody wiring that rule has to know this component exists.

**A first review round found the dock's own reasoning had shipped the
opposite of what it argued (2026-08-28), and the fixes are worth carrying
forward.** `--dock-width` was declared on the `<dialog>` and consumed with an
INLINE `style={{ width: "var(--dock-width)" }}` on the wrapper one element in
— which permanently beats a media-scoped class regardless of the query,
exactly the fault the surrounding comment warned against while committing it
on the neighbour instead. Consumption is `w-(--dock-width)` now, a real class
in the same `w-*` utility family as `max-md:w-full`, so the two genuinely
compete in the cascade rather than one silently winning by being inline —
confirmed by compiling this exact class list through the installed Tailwind
and reading where each rule landed, rather than assumed. **The always-on
`max-w-[min(48rem,80vw)]`/`min-w-[20rem]` also had to gain `max-md:` twins**:
at a narrow viewport `80vw` is frequently narrower than the viewport itself
(300px at 375px wide), so even a correctly-won `width: 100%` was still being
clamped down by `max-width` — sheet mode needs `max-md:max-w-none
max-md:min-w-0` alongside `max-md:w-full`, not that class alone. `resize()`
now clamps at both ends, mirroring the CSS bound in JS, so an arrow key
cannot walk `width` state past what the panel can ever render.

**A whole-branch review found collapsing did not shrink the panel at all
(2026-08-28).** `collapsed` gated only the body (`{!collapsed && …}`); the
dialog kept `bottom-0` regardless, which is exactly the half of the mechanism
above that stretches the box to the foot of the viewport. So collapsing left
a full-height, fully OPAQUE (`bg-(--menu)`) panel with nothing painted below
its header — the whole screen at 320px, against this component's own spec
saying collapsing on a narrow viewport has to be "the only way to see whether
what was typed did anything". `bottom` is conditional on `collapsed` now,
switching to `bottom-auto` so `height: auto` resolves to the header's own
content size. `tests/e2e/page-source-dock.spec.ts` measures the collapsed
height at a wide viewport and at 320, with BOTH an upper bound (under 100px,
nowhere near a viewport) and a lower one (over 16px, so "shrunk to its
header" cannot be confused with "shrunk to zero" or "scrolled off the
viewport") — the lower bound was itself a re-review finding, added after the
first draft of this fix shipped with only the upper one.

**The stale strip used to be MOUNTED by the same condition that populates
it**, which a screen reader commonly misses entirely — `aria-live` announces
a CHANGE inside a region already in the DOM, not a region that arrives
already carrying text. The wrapping `<div aria-live="polite">` is
unconditional now; only its children come and go. The regression test for
this has to rerender the SAME instance and assert the SAME node persisted —
"there is an aria-live ancestor while stale is true" cannot tell the fix from
the fault, since both produce that ancestor.

**jsdom 26.1.0 has no `PointerEvent` constructor at all**, confirmed the same
way the missing `<dialog>` methods were — `typeof window.PointerEvent` is
`"undefined"`. `fireEvent.pointerDown`/`pointerMove` degrade silently rather
than throwing, so a case built on them looks like it drove a real drag while
`clientX` never actually reaches the handler. The grip's own tests dispatch a
plain `MouseEvent` typed `"pointerdown"`/`"pointermove"` instead — React binds
by event type string, not by constructor, and `MouseEvent` supports `clientX`
where `PointerEvent` cannot even be constructed.

The copy control also reverts its own label after `COPIED_RESET_MS`, so a
second copy has feedback too — it used to read "Copied" permanently after the
first success.

**The reference block is capped at `max-h-80` and scrolls itself, and without
that the disclosure was unreachable rather than missing (2026-08-28, reported
by Heiner).** `pageReference` returns about seventeen thousand characters; the
`<pre>` had no height bound at all, so expanding it in a ~400px panel produced
a block thousands of pixels tall — and since `<summary>` sits at the TOP of the
`<details>`, the only control that closes it ended up far above the dock's
scroll position. **Nothing was broken in the DOM.** The toggle rendered, was
correct, and passed every unit case that clicks it; a `<details>` toggles
natively and no state was involved. To somebody trying to get their page back
that is indistinguishable from a control that does not exist, which is the
distinction worth carrying: **a control can be present, correct and unreachable,
and only the third of those is what a person experiences.**

Its browser case is honest about which half proves it. Sabotaged by removing
the cap, the FIRST failure is the overflow precondition — with no cap the block
grows instead of scrolling, so `scrollHeight` and `clientHeight` agree — and the
summary-position assertions beside it would very likely still pass, because
`boundingBox` is read at the dock's initial scroll offset, where the summary
sits regardless of how far the block runs on below it. A bounding box taken
before any scrolling cannot see "somebody would have to scroll to reach this".
Root rule 23: they are kept for what they document and not counted as proof.

**The dock is mounted now (2026-08-28), and this is the first change that
made any of the above reachable by a person rather than only by a test.**
`EditorToolbar` carries a `Braces` control, `openSource` in the catalogue,
beside `hideControls`. `FursonaEditor` holds the open/closed `useState` and
renders `PageSourceField` — a small component of its own, defined in the same
file — as a sibling of `EditorToolbar`, **inside** the element carrying
`data-controls`, so the dock is one more island the hide-controls rule
removes exactly like every other workbench control. That is not a styling
requirement — `PageSourceDock` wears `CHROME_SCOPE` on its own `<dialog>`
wherever it sits — it is a deliberate behavioural choice, and the more
tempting placement (a sibling of `ThemeScope`, outside `data-controls`, so
the dock would survive hiding the rest of the workbench) was tried first and
reddened `fursona-editor.test.tsx`'s hide-controls containment case: every
`CHROME_SCOPE` island has to be inside the armed element, or the ONE rule
that removes them by class cannot reach it, and the dock is not the
show-controls button — it has no argued reason to be the second exception.

**`PageSourceField` exists ONLY to keep `sections` out of `FursonaEditor`'s
own `useWatch`, and getting this wrong is silent.** `BlockEditor` already
proved the pattern: it holds its own `useController({ control, name:
"sections" })` rather than being handed the tree as a prop, so a change to
`sections` re-renders `BlockEditor` and nothing above it. The first version
of this wiring added `"sections"` to `FursonaEditor`'s existing
`useWatch(["handle", "displayName", "avatarUrl", "theme"])` call instead —
which reaches `FursonaEditor`'s own render on every keystroke in a leaf's
text, and from there every descendant that is not individually memoised,
`EditorToolbar` included. `fursona-editor.test.tsx`'s
"updates a leaf preview without rerendering the whole editor" case is the
regression test for exactly this: it counts `EditorToolbar`'s own renders
around a single leaf-description edit and failed at 4 against an expected 2
the moment `sections` joined that watch. `PageSourceField` takes `control`
and `setValue` as props and calls `useWatch({ control, name: "sections" })`
itself, so the subscription — and the re-render it causes — lives in a
component the toolbar is not a descendant of.

`apply`'s theme half is written exactly as the hook's own TSDoc requires:
`setValue("sections", blocks, { shouldDirty: true })` unconditionally, and
`setValue("theme", theme, …)` only when `theme` is non-null. Writing the
theme unconditionally — even to a value read as `null` — would reset an
author's theme to whatever `themeSchema`'s defaults resolve `null` to on the
next render, on every accepted parse of a document that never mentioned a
theme at all. `apply`'s own reference in `usePageSource`'s TSDoc is spelled
out precisely because this is the one place a careless `setValue(..., theme)`
would have shipped that fault silently — nothing renders differently for a
moment, and the loss only shows up the next time somebody opens the theme
panel.

**That guard was wired correctly from the start and exercised by NOTHING,
which the first review round caught.** `PageSourceField` sits under
`features/*/presentation/**/*.tsx`, excluded from the coverage gate, and the
one e2e case pasting a document always round-trips it through `toDocument`
first — which ALWAYS emits a `theme` key, so only the truthy arm of `if
(nextTheme)` ever ran. `fursona-editor.test.tsx`'s "leaves the author's
theme alone when a pasted document omits it" is the case that closes it: it
pastes a document with the `theme` key deleted outright, and asserts the
whole derived stylesheet — compared by IDENTITY, not by matching one hex
string, because the solved palette converts an author's accent to OKLCH
rather than repeating it verbatim — is byte-identical before and after.
Sabotage-verified by deleting the `if`: the unconditional `setValue("theme",
null, …)` crashes `FursonaEditor`'s own render outright
(`(liveTheme as ActorTheme).measure` reading a property off `null`), which is
a clean red rather than a silent one.

**The dock does not exist in the tree at all until it has been opened
once, which the same review round asked for BY CONSTRUCTION rather than by
measurement.** Before this, `PageSourceField` — and therefore
`usePageSource`'s `[theme, blocks]` effect, a full `toDocument`
serialisation of up to 500 blocks — mounted unconditionally alongside
`EditorToolbar`, so every keystroke in the editor paid that cost whether or
not anybody had ever pressed the control that opens the dock. `sourceMounted`
gates `PageSourceField`'s very presence now: set `true` the first time
`sourceOpen` is asked to become `true`, in the same click handler, and never
reset — so closing the dock does not tear down the text or the problems it
was showing. `fursona-editor.test.tsx`'s "does not mount the source dock
until it is opened, and keeps it once it has been" is the proof, and it is a
DOM-absence assertion rather than a timing one: nothing is mounted, so there
is no cost to have measured in the first place.

**Mounting the dock for the first time found three bugs in its class list,
all invisible to every suite that existed before this one, because all three
are about `<dialog>`'s USER-AGENT stylesheet — which jsdom implements none
of.** The hand check this task's brief asks for is what found them; the
regression test is `tests/e2e/page-source-dock.spec.ts`, sabotage-verified
against each of the three individually as well as together.

- **A bare, unconditional `flex` beat `dialog:not([open]) { display: none }`,
  so the dock was VISIBLE, full size, on every page, from the moment it was
  mounted — before anybody had ever pressed the control that is supposed to
  open it.** Author origin always wins over user-agent origin for a normal
  declaration, regardless of specificity or cascade layers — the same rule
  root rule 36 already names for the opposite direction (a Tailwind class
  compiling to nothing). Here a Tailwind class compiled to something, and
  what it beat was the ONE rule that keeps a closed dialog off the page. The
  class is `hidden open:flex` now: `hidden` is the author declaration that
  loses to nothing, and `open:flex` only ever adds `display: flex` back once
  the `[open]` attribute — which `dialog.show()`/`dialog.close()` write — is
  present.
- **The UA stylesheet also sets `left: 0` unconditionally**, and this
  component's own styles never named `left` at all. With that, `right: 0`,
  an explicit `width`, and `margin: 0` (`m-0`) all in force together, the box
  was over-constrained on the horizontal axis — and per the CSS 2 resolution
  rule for that case, the browser drops `right` in LTR and solves from `left`
  instead. So the panel rendered pinned to the LEFT edge of the window,
  420px wide, with `right: 0px` sitting uselessly in its own computed style.
  `left-auto` is the fix: it removes `left` from the over-constrained set, so
  `right: 0` is what actually decides where the box sits.
- **The UA default `height` is `fit-content`, a different value from
  `auto`**, and nothing here had ever declared `height` at all. With `top`
  and `bottom` both specified and `height: auto`, a fixed box stretches to
  fill between them — that is the whole mechanism `bottom-0` relies on to
  reach the foot of the viewport. `fit-content` instead sizes the box to its
  own content, so the panel stopped a few hundred pixels down rather than
  reaching the bottom. `h-auto` is the fix.

None of the three had ANY unit-test-visible symptom: jsdom 26 implements
neither `<dialog>`'s UA stylesheet nor real layout, so `getBoundingClientRect`
and `getComputedStyle` in a jsdom test cannot see any of this, and the
existing unit suite for this component was and remains 100% green throughout.
Only a real browser, actually mounting the real component, found it — the
same lesson root rule 36 already draws about a different property, landing
on `display`, `left` and `height` instead of `object-fit`.

**Task 8 (2026-08-28) is the dock's browser PROOF — `page-source-dock.spec.ts`
extended past the three cases task 7 left it with — and running a real axe
scan over it for the first time found two more faults, neither visible to
any suite before it either.** `a11y.spec.ts`'s new "the editor with the
source dock open" case is what found them, and both are fixed:

- **The resize grip failed `aria-required-attr`.** `role="separator"` with
  `tabIndex={0}` is the WAI-ARIA APG's window-splitter pattern — a FOCUSABLE
  separator, which the spec treats as a value widget rather than a static
  divider, and a value widget is required to carry `aria-valuenow`. It had
  none. `aria-valuenow={width}`, `aria-valuemin={MIN_WIDTH_PX}` and
  `aria-valuemax={MAX_WIDTH_REM_PX}` are on it now — the max is the fixed
  bound rather than the dynamic `min(768, 80vw)` `resize()` also clamps to,
  which is close enough for an announced range and costs no `window` read
  during a server render.
- **The reference panel's copy button failed `nested-interactive`.** It sat
  INSIDE `<summary>`, and `<summary>` is itself an implicit interactive
  control — it is what toggles the `<details>` — so a `<button>` nested
  inside it is invalid, the same class of fault as a link inside a link.
  `<summary>` still has to be `<details>`'s direct child for the native
  disclosure to work at all, so the fix moves the button OUT to be
  `<summary>`'s sibling instead, positioned over it, rather than trying to
  keep it a descendant with a different role.

Neither is a `wcag2a`/`21aa` corner case reachable only by an unusual
interaction: they are structural, and `TAGS`'s reasoning about which
`best-practice` rules stay off (`heading-order`, `scope-attr-valid`,
`empty-table-header`) does not apply to either — `aria-required-attr` and
`nested-interactive` are both in the tag sets this suite already runs. They
went uncaught for the same reason the three UA-stylesheet faults above did:
nothing had ever pointed a real accessibility scan at this panel OPEN before
task 8, because it did not exist as a reachable state to scan until task 7
mounted it and nothing after that opened it in `a11y.spec.ts` until now.

**A third, unrelated fault surfaced by the SAME new case, one layer down from
the dock itself.** `/pages/new` builds its `owner` block by reading
`readMyAddress()` and falling back to `""` if it answers `null` — which it
does for a person who has never been provisioned, because `ensurePersonActor()`
was called by `/me`, `/me/edit`, `/pages` and `/picker` and never by
`/pages/new`. A person arriving here as their genuinely first click — the
route this app hands a brand-new sign-in to from Puck or Libra — got an
`OwnerLeaf` linking to `/` with no text at all: a real `link-name` violation,
not a hypothetical one, since `/pages/new`'s own TSDoc already says "whoever
is signed in will own whatever this form makes" as if the person row already
existed. `ensurePersonActor()` is called first now, idempotently, matching
`/pages`'s own documented reason for the identical call.
`a11y.spec.ts`'s "a person's first visit ever is straight to `/pages/new`"
is the regression test, and it uses its OWN fresh identity rather than the
file's shared one — the shared identity is provisioned by an earlier test in
the same file by the time the dock's own a11y case runs, which is exactly why
that case could not have caught this on its own.

**Task 9's own photograph pass found the copy control a THIRD time, and this
one was geometry rather than markup (2026-08-28).** Round 1 moved the button
out of `<summary>` (`nested-interactive`); round 2 moved it out of `<details>`
so it renders while collapsed; and it was still **covering the summary it sits
over.** `pr-24` on that summary is the reserve — 96px — and the button
measured **227px** at 1440, 1100 and 320 alike, because its width came from a
translated string and not from the space set aside for it. So an absolutely
positioned control sat on the CENTRE of a full-width row styled
`cursor-pointer`: pressing the middle of a disclosure that invites a press
copied instead of expanding, and at 320 the button covered 227px of a 293px
row.

The idle button is the icon alone now, with `aria-label` and `title` carrying
its name and the visible label returning only for `copied` (~75px, inside the
reserve). Every unit case kept passing through the change and had to —
they address the control by ACCESSIBLE NAME, which `aria-label` supplies
whether or not any text is rendered, so the entire suite was blind to how wide
the thing actually was. `page-source-dock.spec.ts` asserts
`elementFromPoint` at the summary's own centre at 1440 and 320, sabotage-
verified: restoring the visible label reddens exactly those two cases and
nothing else.

**Three lessons, and the second is the one this note keeps re-learning.**
A fix aimed at one property of a control does not check the others — three
rounds each corrected where the button was in the DOM and none asked how big
it was. **A width that comes from a translated string cannot be reserved for
by a fixed padding**, which is the same fact the root note already records
about a `select` being as wide as its longest option in Spanish, arriving here
on a different control. And it was found because **Playwright refused to click
the summary** — a click failure reading as a flaky locator was a real control
landing on another, exactly what the read-the-pictures-back rule exists for,
except that the camera never got as far as taking the picture.

## Per-profile theming — built

A person themes their own page and a stranger sees it as they built it. The
decisions, so they are not quietly undone:

- **A theme is ONE palette, not a light and a dark variant.** It carries its own
  **background — a gradient of as many colours as somebody wants**, up to
  `MAX_STOPS`, because a fursona can carry more colours than any fixed set of
  pickers would allow. A flat background is simply a gradient with one stop.
  Everything the author does not pick — text, secondary
  text, muted text, borders — is derived from that by `derivePalette`. This is
  forced rather than chosen: an accent cannot clear 4.5:1 against both a
  near-white and a near-black surface, so an accent laid over the reader's
  scheme is two themes wearing one name.
- **The author's own colours are rendered exactly as picked. Nothing corrects
  them.** A page may be as garish or as unreadable as its owner likes. That
  rests on the visitor being able to switch to the default light or dark theme —
  **the escape hatch is what makes the freedom safe**, not a correction applied
  behind somebody's back. An earlier version pushed a background's lightness
  away from the middle and capped its chroma; that was given up deliberately,
  and `palette.test.ts` asserts the field is rendered **verbatim** so that
  reintroducing the correction fails loudly.

  A note that lived here claimed a mid-grey could not carry readable text and
  that a test pinned it below the minimum. **That was wrong.** It came from a
  2.97 measured when the field was still lifted toward the middle before being
  solved against; the gradient model lifts nothing, so text is solved against
  the raw colour and reaches 4.9 even on grey. The suite now asserts readable
  text on the field for every hostile background it tries, which is a stronger
  guarantee than the one it replaced.

- **`--menu` is derived like everything else, and it must be.** It is the
  colour a native dropdown's list is painted with, and `globals.css` declares
  it per MODE — so a themed page kept the design's menu while `--ink` became
  whatever the author's gradient derived. An author picking a dark background,
  read on a light screen, got near-white text on a near-white menu: the
  original dropdown bug, rebuilt by theming. It is solved against the surface,
  and it is **opaque by construction** — a translucent menu composites onto
  whatever the browser paints behind it, which is the white the whole thing
  exists to escape. Anything else `globals.css` declares per mode and the
  palette overrides the text of has the same trap waiting.

- **What the author does not pick is still solved.** Text takes whichever
  extreme measures better against the field, muted takes the dimmest value that
  still clears 4.5:1, borders clear 3:1 — or the best available, when the
  background allows none of it.
- **One measurement of "is this page dark", shared by every token.** Deciding it
  per token by `lightness < 0.5` put a white heading and near-black body text on
  the same blue field, each solver having reached its own answer. A saturated
  hue moves the crossover away from the midpoint, so it is measured.
- **Text is solved against the HARDEST stop** — the one nearest mid-lightness,
  which leaves the least room. Text crosses the whole gradient, so solving
  against the first stop, or against an average, makes a page readable at one
  end and not at the other.
- **All three CSS gradients are offered, because they are three shapes rather
  than three settings.** A linear runs along an axis, a radial outward from a
  point, and a conic around one; the radial carries both shapes and all four
  extent keywords, and each of the three may repeat. A background stored before
  any of this reads back as exactly the linear gradient it was — absence means
  the old shape, and no version marker is needed to say so.

  **Repetition ships with a length, and that pairing is the whole of why it
  works.** `repeating-linear-gradient` restates its stops BEYOND the last one,
  so stops spanning 0 to 100 — which is what every gradient here starts with —
  repeat outside what is drawn and render identically to the plain form.
  Shipping the switch alone would have given somebody a control that accepts a
  choice and changes nothing visible, with no way to learn the stops were the
  reason. `every` is the length of one repetition and the stops are scaled into
  it at emission, so the switch always does something.

  **The stop bar stays a left-to-right ramp for every kind, and the result gets
  its own tile.** A handle sits at its stop's position; painting the bar with
  the radial or conic form would put every handle somewhere other than the
  colour it carries, and the control would visibly disagree with itself. What a
  stop means does not change with the kind — 0 is the start of the run and 100
  the end, along an axis, outward, or around.

  **A control appears only for the kinds that have the thing it sets.** No
  direction on a radial, no centre on a linear, no length while repetition is
  off.

- **Stop order is an invariant, not a convention.** CSS renders stops in the
  order they are written, so an out-of-order list doubles back and produces
  bands nobody put there. Every function in `gradient.ts` returns a sorted list
  rather than trusting its caller — which means a dragged handle can change
  index, and a control tracking its selection by index would silently start
  editing the neighbour.
- **Changes are live through `previewThemeCss` on `PreviewThemeHost`.** It
  shares `themeVars`, `skinVars` and `bodyBackgroundVars` with the public
  page's `themeCss`, so values cannot drift while the editor-only selector
  keeps them out of the builder chrome. Its CSS is deliberately UNLAYERED so
  author values beat layered app defaults inside the host; selector containment
  is what protects the workbench. Every preview host intentionally shares one
  selector because one editor has one live theme. Side-by-side different draft
  themes are unsupported and would require unique host selectors. Persistence
  rides the ordinary save: what must be instant is seeing a colour, not storing
  it.
- **The page-scale atmosphere is live on the document while the theme panel is
  open.** `atmosphereCss` filters `themeVars` down to `--field`, `--canvas`,
  every canvas colour and dial, and `--nebula-blend`, then emits the same
  `bodyBackgroundVars` picture rule `themeCss` uses. It never derives or escapes
  a value twice. Closing the panel unmounts that rule and restores the app's
  exact atmosphere; palette controls, skin variables and `cursor` remain
  preview-only throughout.

  **Its second caller went with the framed preview on 2026-08-27**, and the
  finding that made the preview a caller at all is worth keeping because it is
  about the CANVAS rather than about that component. A preview painting its own
  opaque `--field` covers the canvas outright — `NebulaCanvas` is
  `fixed inset-0 -z-10` in the root layout, so an in-flow background is simply
  on top of it. Measured by photographing one seeded page twice: mottled with
  cloud at its public address, a perfectly smooth wash in the preview. The same
  opacity re-anchored the field, since `body` is `background-attachment: fixed`
  and the host's copy spanned the whole document rather than the window —
  1280×1696 against a 1280×900 viewport on an eight-section page. Opaque AeleOS
  backings on the workbench groups that carry bare text are the legibility
  boundary over that author field.

- **Picking any colour makes them all explicit.** Half a theme that follows the
  reader's scheme and half that does not is why an author's preview once
  depended on which mode they happened to be editing in.
- **The emitted CSS is three rules since `b158b66`, and the split is
  deliberate.** The COLOURS go to `:root`, because a palette is the whole
  page — the field the body paints and the canvas in the root layout are both
  outside anything a page could scope to, and scoping to a nested element is
  exactly why an earlier version reached neither. The SKIN goes to
  `SKIN_SCOPE`, the person's own content, because a skin only ever restyles
  surfaces and every surface is inside it. The page's own BACKGROUND PICTURE
  goes to `body` itself, because that is the element `--field` is consumed
  by — see "The page's own background picture" below for the full account of
  why that one cannot be folded into the `:root` rule the way it first was.
  All three carry the same gate on the visitor's choice, so leaving the theme
  leaves all of it. Do not tidy the colours into the skin's selector, and do
  not fold the picture back into `:root`.

### How a visitor gets out

**A page wears its owner's colours by default, and `PageThemeSwitch` is the way
out.** Both halves matter: a page nobody can leave the theme of is a page
somebody can be locked out of reading, and it is that control existing which
lets an author's colours be as unreadable as they like without it being anybody
else's problem.

- **Its own attribute, `data-page-theme`, not a third value of `data-theme`.**
  A visitor holds two answers at once — whether to wear this author's colours,
  and which default to fall back to otherwise. Folding them together loses the
  second the moment the first is turned on.
- **The rule is `:root:not([data-page-theme="default"])`**, matching the
  attribute's ABSENCE as well as "author". The attribute is written by a
  pre-paint script, so a visitor whose JavaScript never ran still sees the
  theme; only an explicit opt-out removes it.
- **Choosing a default writes both**: it takes the author's theme off and names
  which default replaces it. Doing only the first leaves the page on whichever
  scheme that visitor last happened to be in.
- **The switch renders only where there is a theme to leave.**
- **The choice is NOT remembered, and that is a fix rather than a shortcut.**
  It lived in `localStorage` under one key for the whole site, so a visitor who
  took one person's colours off never saw anybody else's again — they had
  silently opted out of every page on the platform by pressing a button on one
  of them. Every page starts on its author's theme now and the switch lasts the
  visit. Per-page storage was the other candidate and is worse: it would follow
  somebody around one page for ever with no way to discover why it looked wrong.
- **The light/dark toggle shows a QUESTION MARK on a themed page.** Neither
  light nor dark is in force there, so a sun or a moon would name a state the
  page is not in. It takes `themed` as a prop rather than reading the
  attribute, because the attribute is set on every page — reading it alone put
  a question mark on the signed-in pages, where the design's own colours are
  exactly what is in force.

### Skins — the half of a theme that is not colour

A **skin** decides FORM: corner radius, border weight, shadow, gloss, backdrop
blur and the body's face. It names **no colour of its own**, and that separation
is the whole design — every pairing of a style and a palette is somebody's page,
where a palette baked into each skin would have made as many colour schemes as
skins, no more.

`shared/domain/skins.ts` holds the table and `SKINS` is the list. Adding one is
a table entry and a name in both catalogues, and `messages.test.ts` fails if
either name is missing — it checks each catalogue against `SKINS` separately,
because the parity check beside it cannot see a name absent from both. See
"Adding a mode or a kind" above for why that distinction is written down
rather than assumed.

**What earns a place is a MECHANISM, not another set of numbers.** Each of these
reaches for something none of the others used: a surface that is not there
(`outline`, where `--surface: transparent` makes the author's gradient the card
itself), a tiled texture (`comic`'s halftone, which is what
`--skin-gloss-size` exists for — a `radial-gradient` with no size is one dot the
width of the panel), a ruled grid (`blueprint`), a surface pressed in rather
than raised (`inset`), a die-cut ring (`sticker`), a shadow with no offset at
all (`neon`, a glow rather than a cast), a corner cut off straight rather than
rounded (`cutout`), and concentric rings where every other edge is one line
(`frame`). Another radius-and-shadow pairing would read as a variant of
something already here.

An earlier version of this paragraph credited `pixel` with the stepped shadow.
**There is no `pixel` in `SKINS` and there never was** — the description
belonged to `retro`'s bevel, which is not a stepped shadow either. A note that
names something the code does not have is worse than no note; check the list
before adding to this one.

#### What `cutout` cost, which is the part worth reading before the next skin

`cutout` is the only skin that needed a token the others did not already have —
`--skin-clip`, declared in `globals.css`, read by `@utility surface`, defaulted
in `SKIN_DEFAULTS` so `nestedSkinVars` resets it — and the reason it is the only
one is that it is the only one that changes a surface's **shape**. What that
cost is worth knowing before the next skin reaches for a token of its own,
because neither consequence is visible from the declaration:

- **`clip-path` clips the element's whole subtree, positioned descendants
  included.** The editor's section card holds the style popup as a descendant,
  so a card that was itself the clipped surface cut the popup away. On a
  **collapsed** card that removed the panel entirely — including the select
  that would undo the choice. A control able to disable its own undo.
  `BlockCard` is now an opaque, unstyled workbench surface; the notch lives on
  `SectionPreviewTray`'s face outside that card and outside its droppable, so
  no author style can clip or transform a control.
  `section-card-face.spec.ts` drives the real popup on a collapsed card in a
  real browser, hit-tests the panel's centre with `elementFromPoint`, and
  compares its pixels against the same coordinates with the panel closed —
  neither of which `toBeVisible()` can tell you.
- **`clip-path` clips the element's own `outline` too**, which is a focus ring
  that does not exist rather than one that is merely dim. So `@utility surface`
  declares `outline-offset: -3px` and rings every surface on the inside. **That
  is global — every focusable surface in the app, for one skin's sake** — and
  it is not a guarantee: an element naming its own
  `focus-visible:outline-offset-2` is a single-property utility and beats the
  utility on both sort order and specificity. Kept anyway, because it degrades
  only by abutting the border on the 3–4px skins; recorded here accurately
  enough to reverse, since an earlier note claimed it was the version that could
  not be forgotten and that was false.

The notch is `min(10px, 25%)` and the bound is load-bearing rather than tidy: a
flat `10px` self-intersects on any surface under 20px, which `progress`' `h-2`
track is. The reasoning in full is in `skins.ts`'s TSDoc and `globals.css`'s own
declaration of the token.

Four things about it that a later change must not undo:

- **A skin reaches the author's colours only through `--surface-solid` and
  `--bar-solid`.** Those are the raw colours the palette writes;
  `globals.css` composes `--surface` and `--bar` from them, and a skin
  recomposes them at a lower **alpha**. That is why there are two names for one
  colour: a custom property cannot be defined in terms of itself, so glass
  needed something to be glass _of_. Never let the palette write `--surface`
  directly again — it would win over the skin and glass would silently be
  opaque.
- **A skin and a palette write disjoint properties, and `skins.test.ts` keeps
  them so.** They are spread into one object in `themeVars`, so a name in both
  would be won by whichever came second — and the loser would be a colour
  somebody picked. The order they are spread in looks like a guarantee and is
  not one; the disjointness test is.
- **The radius is a MULTIPLIER, not a length.** `@theme inline` redefines
  Tailwind's whole `--radius-*` scale as `calc(var(--skin-round) * …)`, which is
  what makes every `rounded-*` in the app follow the skin with **no component
  edit at all** — sixty-odd of them. Restating absolute sizes per skin would
  flatten the scale's proportions, which is how "square" and "very round" both
  end up looking like one radius applied everywhere. `rounded-full` is
  deliberately outside this: it compiles to `calc(infinity * 1px)` rather than
  to a token, so avatars stay circular in every skin.
- **`@utility surface` is where the edge, the shadow, the gloss and the
  backdrop land, and it is a class we own.** Every bordered surface carries it,
  in place of Tailwind's `border`.

  **It used to be `[class~="border"]`, and that is a mistake worth not
  repeating.** Tailwind's `border` utility is literally the class `border`, so
  selecting it reached exactly the right elements — and could not see what any
  of them was asking for. The rule sat outside every cascade layer, and
  unlayered CSS beats anything inside a layer whatever its specificity, so it
  won against every utility for the properties it set. The editor's language
  strip asked for `backdrop-blur` and silently got none; the one card that
  names its own `shadow-sm` had to be rescued by a hand-written `:not()`. That
  list of exclusions could only grow, one per collision somebody happened to
  see.

  A custom utility is sorted among the others by how many properties it
  declares, so a single-property utility on the same element wins by the
  ordinary rules — `shadow-sm` and `backdrop-blur` beat it with no exclusion to
  write and none to forget. `stylelint` now forbids selecting a `class`
  attribute at all, so the old shape cannot return by accident, and
  `skins.test.ts` asserts the absence rather than the exclusions.

  It sets `border-style` as well as the width: Preflight gives everything
  `border: 0 solid`, so a width alone renders, but naming the style keeps
  `border-dashed` working on a surface exactly as it does on `border`.

  **The utility is global and needs no scope**: the tokens it reads are only
  overridden inside `SKIN_SCOPE`, so everything above that element inherits the
  design's own values. Scoping it as well would be a second place to keep in
  step.

- **A skin stops at the person's own content, and that boundary is `SKIN_SCOPE`
  on `PageShell`'s `<main>`.** The bar above keeps the app's shape, because the
  language and theme toggles live there and a control that changes form on
  somebody else's page is harder to recognise as one. The class is set once, in
  the shell, so a new page cannot forget it — and it is pinned from both ends,
  by `skins.test.ts` reading the stylesheet and `page-shell.test.tsx` reading
  the element. That pair has drifted apart here once already, leaving an element
  wearing a class no rule matched, which is invisible to any test that only
  reads the rule.

  `THEME_SCOPE` was that casualty and is gone. It was a class on the editor's
  form that nothing had matched since the colours moved to `:root`.

A skin is **not** nullable, unlike every colour: `default` is a real skin whose
overrides are empty, so it expresses "nothing chosen" without a null. A colour
input always carries a value and needs the separate "default" mark; a select
carries the name of what was picked.

`isThemed` therefore stays **colour-only** — it drives those marks. `isCustomised`
is the wider question and is what Reset and the visitor's `PageThemeSwitch` ask,
because somebody who chose only a skin, a canvas or a cursor still has a page to
put back and a theme to leave.

### A block's own form (2026-08-16)

**Every block may carry its own `style`, apart from the page's** — a container
two levels down chooses a skin, a background picture and a border exactly as a
section does, because a section is only a container at depth 0. It shipped as a
per-SECTION bag and became per-block unchanged in meaning, which is the whole
argument for collapsing the two models into one: had a nested grid been a
second thing, it would have needed its own skin handling, its own background
and its own arrangement logic, and the two would have drifted.

```ts
style?: {
  skin?: SkinId;
  background_url?: string;
  background_fit?: "cover" | "tile";
  card_size?: "s" | "m" | "l";
  border?: "solid" | "dashed" | "dotted" | "double" | "none";
  bleed?: boolean;
  margins?: boolean;
}
```

**Every key is optional, and absent means the existing/default answer rather
than an empty value.** For visual form that is "inherit whatever encloses
this"; for `bleed` it keeps the page measure; for `margins` it keeps ordinary
page chrome. That is a real answer, not a gap: a block with no `style` at all
gets no `style` attribute in the markup either, so a page nobody has touched
with this feature is byte-for-byte what it was before the feature existed.
`SectionStylePopup` enforces this on write — it hands its caller the WHOLE bag
rather than one key, so clearing a field **deletes the key** instead of storing
`""`. A per-key writer cannot do that; it can only ever write a value, and an
empty string sitting in `style` would be a third state the schema does not
recognise, between "inherit" and "chosen."

**`background_fit`'s three options are three paints, and for a while two of
them were one.** The style function emitted `background-repeat` only for `tile`
and `background-size` only for `cover`, leaving the absent fit — the one a
person lands on, whose own label promises the browser's unscaled, **unrepeated**
placement — with neither. `background-repeat`'s initial value is `repeat`, so
"Default" and "Tile" were one behaviour under two names: measured, an 8px
picture over a 64x64 box darkened 2048 of its 4096 pixels either way, against
32 for a genuinely unrepeated copy. **Both properties are emitted for every
fit now**, exactly as `bodyBackgroundVars` already did for the page's own
picture, and `section-card-face.spec.ts` measures the three as three.

The `background-size` half fixed a second thing worth knowing: `@utility
surface` declares `background-size: var(--skin-gloss-size)` for the gloss, so
on the editor's face a section picture with no explicit size took the SKIN's
texture tile — `comic` sets `6px 6px` — and previewed as a mosaic of a picture
the public `<section>`, which carries no `surface`, renders at natural size.

**Colour is not one of these keys, and never will be.** The split is what
every skin in `SKINS` rests on: a skin names no colour of its own, and every
pairing of a style and a palette is somebody's page. A per-block colour would
collapse that into as many colour schemes as there are skins. Form is the
block's; colour is the page's. This was a decision, not an oversight — see the
section-personality spec's "What must not be undone."

#### `border` (2026-08-16), and the token it deliberately is not

A section chooses `solid`, `dashed`, `dotted`, `double` or `none`. This was
the literal thing the previous phase was asked for and answered with skins
instead; the correction, and why substituting one for the other was a near-miss
rather than a delivery, is in
`docs/superpowers/specs/2026-08-16-a-border-of-ones-own-design.md`. Until it
shipped nothing in the style bag could make a section's edge dashed at all.

**`none` is a choice and absent is inheritance**, the same distinction every
other key here keeps, and `""` is never stored for either.

**A choice also raises a FLOOR under the border's width, `--skin-border-min`,
and without it most of the choices did nothing.** Measured in a real Chromium
rather than reasoned from the spec: `double` is two lines and a gap summing to
the border width, so at 1px it paints one dark pixel and at 2px two —
byte-identical to `solid` at the same width — and only from 3px does the run
become line, gap, line. Every skin but `neobrutalism`, `comic` and `sticker`
sets a narrower edge than that. The
same fault one step down: `clay`, `paper`, `inset` and `frame` set
`--skin-border: 0px`, where `solid`, `dashed` and `dotted` are equally
invisible. So `double` floors at 3px, the other three at 1px, and `none` at
nothing — a floor under a style that paints nothing would be a width with
nothing to draw. `@utility surface` takes the `max()` of the skin's own width
and the floor, so `neobrutalism`, `comic` and `sticker` keep their heavier
edges.

Two things about that token a later change must not undo. **No skin sets it
and none should** — a skin that did would widen every edge on the page, and
`skins.test.ts` exempts it from the "every form token reaches a skin" guard on
exactly that basis. And **the floor cannot live on `--skin-border` itself**:
`--skin-border: max(var(--skin-border), 3px)` is a custom property defined in
terms of itself, which is a cycle, invalid at computed-value time, and would
delete the border rather than widen it.

**The token is `--skin-border-style`, declared in `globals.css` as
`var(--tw-border-style)` and read by `@utility surface`. It is deliberately not
a write to `--tw-border-style` itself**, which is Tailwind's own generated
variable — writing to it is the `[class~="border"]` mistake in its other form:
reaching exactly the right elements while unable to see what any of them asked
for. The indirection also buys the behaviour: a custom property inherits
**unresolved**, so a descendant re-resolves the reference against its own
`--tw-border-style` and Tailwind's `border-dashed` keeps working underneath a
section that chose something else.

**A scope's `--skin-border-style` does not override a descendant carrying its
own `border-dashed`, and that is correct.** It reads as a bug and somebody will
try to "fix" it. `.border-dashed` declares a literal `border-style`, Tailwind
sorts by declared-property count, and the shorter utility wins the property
outright — no variable is consulted at all. A dashed edge is this app's
semantic empty state, and it must survive a section's border choice. The
documentation that once claimed the override reached everything beneath it was
the thing that was wrong. `border-style-cascade.spec.ts` proves both directions
in a browser.

The control is **not gated on anything**, unlike `card_size`. Every block
renders a surface, so gating it would hide a control that does something — the
opposite of the fault the `card_size` gate exists to prevent, and the reason
the difference is stated rather than left to read as an inconsistency.

#### The section preview's face is not the control card

In the editor, `BlockCard` receives none of `blockStyle`'s output. The split
lives wholly in `SectionPreviewTray`, outside the top-level droppable: a custom
property is inherited by definition and goes on the preview wrapper, where the
real renderer reads it; a painted property goes on the **face**, the
`absolute inset-0` layer that carries `surface`. The public page needs no such
split because its `<section>` is bare.

Get the split backwards and it fails quietly in both directions. A picture
painted on the root shows as a square rect behind a rounded — or chamfered —
face: four bright corner wedges. A picture painted on the face sits **behind**
that face's own 90%/82% alpha and is roughly nine-tenths hidden, which is a
live preview barely showing what it previews. Both of those shipped on this
branch before `section-card-face.spec.ts` measured them. The picture belongs on
the face, **above** that element's own `bg-(--surface)` rather than behind it —
which is also what stops `glass` blurring the very picture it is meant to show
through, since the face is the element carrying the `backdrop-filter`. Note
that the layer the skin paints on is the layer nothing else drives: delete its
`surface` class and every unit test stays green while the preview goes blank.

**`card_size` is in the schema, in no popup, and read by no page.** Its whole
meaning was an `auto-fill` grid: the author picked a minimum card width and the
browser decided how many fit. A container declares an explicit space count now,
so that sentence cannot become true again for `grid`; the control went with the
flat editor rather than being carried across, because one that accepts a choice
and changes nothing is the worst kind there is. The KEY stays, so a value the
flat editor stored survives untouched. See "The editor composes blocks" above
for where the meaning does survive — CSS multi-column's `column-width`, which
is `masonry`'s to read.

What the `auto-fill` template cost is kept here because whoever wires
`column-width` will meet the same shape. It wrapped the minimum in
`min(var(--card-size), 100%)` **for every size, not only the large one**:
`minmax`'s lower bound is a floor rather than a suggestion, so a bare
`minmax(size, 1fr)` does not shrink below `size` even when the container is
narrower — `auto-fill` collapses the _count_ to one column, and that surviving
column still overflows. `l`'s 20rem produced 16px of real horizontal scroll at
a 320px phone width, measured on the live app. It is the same argument
`minmax(0, 1fr)` rests on everywhere a block lays a track.

**Gate the field, never the value**, and `card_size` is the extreme case of
it: the control is gone entirely and the stored value is untouched. This is
what resolves two rules that read as if they conflicted — "a kind that renders
no field must not offer it", and the schema's deliberate keeping of `icon`,
`image_url` and `link_url` on every block regardless of kind. `LeafEditor`
applies the same shape per kind through `leaf-fields.ts`: a field a kind does
not draw is not OFFERED, and nothing clears it, so switching a kind to look at
it and switching back finds what was typed still there. `card_size` was the
first key in the style bag that only ONE arrangement's CSS ever read — every
other style key is arrangement-agnostic — and it is the pattern for the next
key that is this narrow.

`carousel` keeps scrolling sideways **at every size**, and that remains the
honest difference between it and `grid`: a grid is a set of cards laid in
declared tracks, a carousel is a thing you swipe through regardless of size,
chosen by naming a different mode — not a setting on one of them.

#### The nesting fix, and why `skinVars` was left alone

A skin works by overriding custom properties an element and its descendants
read — `--skin-round`, `--skin-border`, `--skin-shadow`, and the rest.
`SKIN_VARS` (`shared/domain/skins.ts`) holds only each skin's **differences**
from what `globals.css` declares at `:root`. That is correct at exactly one
scope, where "not set" falls through to the design's own defaults. Nest a
second skin scope inside the first — a section wearing its own skin, inside a
page wearing another — and "not set" falls through to the **enclosing** skin
instead, silently: a `paper` section inside a `comic` page kept comic's
halftone, an `outline` page made every section transparent whatever it chose,
and a section set to `default` inside a `glass` page was still glass.

`nestedSkinVars` is the fix: it spreads a `SKIN_DEFAULTS` constant (the same
properties `globals.css` declares, pinned to the stylesheet by
`skins.test.ts` rather than trusted) underneath the chosen skin's own
overrides, so a nested scope always gets the complete set — never a partial
one that can fall through to whatever happens to be outside it. `blockStyle`
calls `nestedSkinVars`, never plain `skinVars`, for exactly this reason — and
it matters more now than when it was written for one level, because a block
tree can put three skin scopes inside each other.

**`skinVars` itself was deliberately left alone**, not widened to return the
complete set everywhere. `themeCss` keys the page-level skin rule on `skinVars`
being **empty** for the default skin (`skin ? … : ""`) — that is what lets an
untouched page emit no style element at all and stay byte-for-byte what it was
before theming existed. Widening `skinVars` to always return the full set
would make that check pass unconditionally and start emitting a `<style>`
element on every page, themed or not.

#### The preview and the public page share one function

`blockStyle` (`presentation/block-style.ts`) is the only place this
renders. `SectionStylePopup`'s live preview calls the same export, applied to
the card being edited on every keystroke, rather than a second copy — a
second implementation would have looked identical the day it was written and
drifted the first time this one changed, with no type error and no failing
test to catch it, because each file's tests would have exercised only its own
copy. This was found and fixed as review, not written correctly the first
time: the two bodies were briefly byte-for-byte identical, which defeated the
whole point of a live preview that is supposed to prove it cannot drift.

#### Readability keeps no per-block escape hatch

A block wearing `outline` over a busy background picture may be unreadable.
**It needs no per-block way out, and none should be added.** `PageThemeSwitch`
already drops all of it at once — colour and skin are gated on the same
`data-page-theme` attribute, so a visitor is never trapped by one author's
choice. That is the same argument that already lets an author's colours be as
garish as they like: the page-level escape hatch is what makes the freedom
safe, and correcting somebody's page behind their back — even one block of
it — is exactly what `palette.test.ts` asserts against. Do not read an
unreadable block as a gap to close; it is the freedom working as designed.

### The page's own background picture (Phase D)

A theme carries one page-level picture, `backgroundUrl`/`backgroundFit`,
distinct from a section's own — a link like every other picture here, nothing
stored. It renders as a **second `background-image` layer on `body`**, above
`var(--field)`, the gradient `globals.css` already paints there — never at
`:root`. That is not a stylistic choice; it is the one fact `bodyBackgroundVars`
(`presentation/theme-css.ts`) exists to get right. `body` is a descendant of
`:root` with its own OPAQUE background, and a browser always paints a
descendant's background over its ancestor's, regardless of property order or
specificity. An earlier version wrote the picture into the `:root` rule,
reasoning it would layer "over" `--field` the way two properties compete
within one cascade — they are not two properties in one cascade, they are the
backgrounds of two different elements, one entirely hidden behind the other,
so the picture painted on an element nothing ever shows through and never
appeared at all.

**The tests missed it because every one of them asserted the generated CSS as
a string.** Property order within one rule was correct; the order that
mattered — paint order across two elements, `body` over `:root` — was wrong,
and a string assertion cannot see which element a selector reaches. Any test
added for a similar layering bug has to look at the rendered DOM, not the
string `themeVars`/`themeCss` returns.

**`gradientCss` (`shared/domain/gradient.ts`) now emits
`linear-gradient(#rrggbb, #rrggbb)` for a one-stop gradient, never a bare
colour**, because a bare colour is not a valid CSS `<image>` and cannot sit in
a `background-image` list beside the picture. Visually identical to the flat
colour it replaces; required only so `--field` stays usable as a layer at
every stop count, including one.

**It reuses `backgroundImageValue` (`domain/embeds.ts`)**, the same function a
section's own background picture goes through, rather than a second escaping
path. That function refuses any address containing a `"` or a `\` outright,
and the reason is where the value lands: `themeCss` interpolates it into a raw
`<style>` block, where CSSOM offers no protection at all — unlike
`blockStyle`'s `style` object, which a browser's CSSOM happens to reject if
malformed. The refusal, not the sink, is what makes the value safe in that
context; trusting it only because of where it currently lands would be a trap
for whichever sink reuses it next.

**One residual — measured, not merely reasoned about.** `globals.css`'s
`body` rule keeps its own `background-attachment: fixed`, which
`bodyBackgroundVars`'s injected rule never restates — it sets only
`background-image`, `background-repeat` and `background-size`. That a single
`fixed` value applies to BOTH layers rather than only the first follows from
CSS's own value-cycling rule for multi-layer backgrounds — a
shorter-than-`background-image` list of any other `background-*` property
repeats its values across the remaining layers — and this was watched happen
in a real Chromium rather than left to that reasoning alone: `getComputedStyle(document.body).backgroundAttachment`
resolves to `fixed, fixed` on a themed page, and a real 137px scroll down a
3000px-tall page left a screenshot byte-identical before and after, while a
control built with `background-attachment: fixed, scroll` changed visibly
under the same scroll — proof the check has power to fail, not only pass. Do
not read the earlier draft of this paragraph, which called this unverified,
as still current.

`backgroundImageValue` itself **lives in `embeds.ts` (domain), not in the
presentation layer**, where it was written first. It moved because
`actor-theme.ts` is a domain file and `eslint-plugin-boundaries` forbids a
domain file importing presentation; its presentation-layer home was an accident
nobody had reason to notice until a domain caller needed it too. Every caller
imports it from there directly now — the re-export that stood in for that
lived in `public-sections.tsx`, which is deleted.

### Canvases

`CANVASES` holds **exactly the canvases that exist** — today the nebula, a
starfield, an aurora, a constellation, waves, bubbles, snow, a horizon grid,
drifting glows, orbits, a honeycomb, ribbons, confetti, a skyline, bokeh, four
retro screen savers — mystify, bouncing boxes, glyph rain and warp speed — a
plasma, cells, a current, fireflies, and stillness.

**The aurora was rebuilt, and what it got wrong is the general lesson.** It swung
each curtain with a sine, which is a PENDULUM: every point on a curtain shares
one offset, so the whole thing slid left and right as a rigid column. An aurora
folds, and folding means neighbouring points differ. `valueNoise` is what makes
that difference — cosine-interpolated between hashed lattice points, so the
ribbon has no creases at the integers. Value noise rather than gradient noise on
purpose: it is a dozen lines and the extra smoothness of Perlin is invisible at
the scale a curtain is drawn.

Two drawing faults were found the same way — by looking — and both are easy to
reproduce elsewhere:

- **Constant-alpha strips band.** The first rebuild drew each curtain as
  horizontal strips of one alpha each, and the seams between them were visible
  as stripes. A curtain is now one polygon down the left edge and back up the
  right, filled with a vertical gradient, so nothing has an edge to show.
- **Overlapping tiles composite twice.** Plasma and cells drew each tile at
  `step + 1` pixels to hide seams, with the alpha in the fill colour; every
  overlap composited two half-transparent fills and drew a GRID — the exact
  artefact the overlap was meant to prevent. The fix is integer-exact tiling
  with `ctx.globalAlpha` set once, so a pixel is painted exactly once.

**`bounced` is what every screen saver is built from**, and it is the one idea
worth keeping. A modulo WRAPS: the thing leaves one edge and reappears at the
other, which is a teleport. Folding the sawtooth back on itself is a reflection,
and a reflection is a bounce. It is also why none of them remembers a velocity —
and why mystify can draw its echoes as the same polygon at earlier TIMES rather
than as a history it keeps. As with the skins, what earns a place is a
MECHANISM rather than another arrangement of dots: points joined by fading
lines, filled bands stacked back to front, rings climbing and wrapping, a
perspective grid scrolled by the fractional part of time, and a few large
radial glows drifting past each other.

**The renderers are a record keyed by name, not a chain of branches.** A canvas
added to `CANVASES` without an entry there falls through to the nebula
silently — which is the "the control did nothing" fault this feature keeps
producing, wearing a different hat. It briefly listed two
more, named for animations nobody had written, and that is the worst kind of
control: it offers a choice, accepts it, stores it, and changes nothing, with no
way for the person to learn that it did nothing. **A canvas joins that list in
the same change that implements it.**

**The backdrop travels at `:root` scope and the accent does not**, and getting
this wrong once already shipped: the canvas is a fixed, full-viewport element
mounted in the root layout, and it reads its colours from
`document.documentElement`. Scoping its inputs to the page's content element
meant it never saw them — an author could pick two backdrop colours, and they
were stored, emitted, and read by nothing at all. The chosen canvas travels the
same way, as `--canvas`, because a client component mounted at the document
root cannot be handed a prop by a page nested inside it.

Nothing in that root scope varies by mode. An author picks two colours and those
are the colours in both schemes; what adapts is `--nebula-blend`, which stays in
`globals.css` — `screen` in dark because dust emits light, `multiply` in light
because it absorbs it. Same two colours, opposite physics.

**Three dials scale every canvas: how busy, how fast, and how big.** Density multiplies
how many of a thing a canvas draws; speed multiplies the clock, so no renderer
needs to know speed exists — one asked to go twice as fast is handed a time
twice as large. Size multiplies what each
thing measures. They are separate because they are separate complaints: a
starfield can be crowded and still, a single box can hurtle, and a sky of
enormous stars is a different sky rather than a fuller one.

**The nebula answers them too, and did not used to.** It read raw `elapsed` and
a fixed set of layers, so the one canvas a page gets by default was the one
canvas the sliders did not move. Density is its OPACITY rather than a count:
the clouds tile the whole viewport whatever happens, so busier means thicker.

Neither floor is zero. Zero density is an empty canvas, which `none` already
says better and reversibly; zero speed is a frozen one, which
`prefers-reduced-motion` already gives whoever asked for it. Neither wants a
second way to be reached by a slider dragged too far.

`many` caps what a density may produce, per canvas, and the cap is not
decoration: the constellation compares every PAIR of points, so its cost is the
square of its count.

**Each canvas declares how many colours it paints with**, in `CANVAS_SLOTS`,
and the editor renders that many pickers. The number has to be the truth in both
directions: a canvas claiming more than it uses gives somebody controls that
change nothing, and one claiming fewer makes some of its colours unreachable
with no way to find out why.

**`--canvas` is read through `resolveCanvas`, never raw, and that is a fault
rather than a style rule.** `themeVars` emits the property only for a canvas
other than the default — which is what keeps an untouched page byte-for-byte
what it was — so the empty string is what nearly every page in the app serves.
The renderer treated it as the nebula when deciding what to DRAW and as an
unknown name when deciding what resolution to draw it at, because
`renderScale("")` answers 1 where `renderScale("nebula")` answers 0.5. Every
page in the app drew the default canvas at four times its intended pixels:
35.8ms a frame at a device ratio of two against 8.9 named, a main thread 100%
busy at 28fps while nobody touched the page. `DEFAULT_CANVAS` and
`resolveCanvas` live in `shared/domain/canvas-slots.ts`, `DEFAULT_THEME.canvas`
is that same constant, and `canvas-performance.spec.ts` asserts the bitmap with
the property ABSENT — which is how production reaches it, and which the suite
had never done because it named every canvas including the default.

Colours travel as `--canvas-N`, indexed from one, falling back to the design's
own two when unset — so a page nobody has themed is unchanged. They used to be
two named fields, which made every canvas reuse the same pair rather than each animation inventing its
own palette. A new canvas that hard-codes colours is wrong. They must also
respect `prefers-reduced-motion` and stay off wherever the star toggle says off
— that toggle is the visitor's control over their own machine and the author's
choice may not overrule it.

### How wide a page is, and a section that ignores its chrome (2026-08-21)

A theme carries a **measure**: six named stops from the app's own reading width
out to `full`, which sets no maximum at all. Null is the design's own — the
80rem every public page had before this existed — so an untouched page is
unchanged.

**An enum rather than a number, and the reason is mechanical.** `weights` had
to become a custom property because they are author data out of `jsonb` and no
build step can generate a class for an arbitrary number. A fixed list has no
such problem: six named stops are six real Tailwind classes, with no `var()`
plumbing and no fallback chain.

**The measure is applied per SECTION, not to the page**, and that inversion is
the whole mechanism. The public route asks `PageShell` for a full-width `main`
— a third width, not a wider column — and each top-level block centres itself
in the chosen measure. `PageShell`'s full mode carries no vertical padding
either: every piece of public-page spacing belongs to the depth-0 section it
surrounds.

A section carrying `style.bleed` opts out of WIDTH only and reaches both edges.
`style.margins: false` is the independent opt-out from page chrome: no side
gutter, no gap to its neighbour, and no space beneath the bar or above the
floor when it is first or last. Absent or `true` preserves that chrome, and the
editor omits the key when the checkbox is on so every existing page keeps its
old answer without acquiring a choice nobody made.

**There is no `w-screen` here and there must not be.** `100vw` counts the
scrollbar that a centred column does not, so the breakout version gains a
horizontal scrollbar the moment a page is tall enough to need a vertical one.
Moving the measure per-section is what makes the honest version possible.

`bleed` and `margins` are read at depth 0 only — a nested block has a section
between it and the page — and the editor offers both controls only there. They
are STORED at any depth, because refusing either deeper would make moving a
section into another one fail on a style it carried legitimately a moment
earlier.

**Its SQL check reads the JSON TYPE, not the text.** `validate_block` walks the
style bag with `jsonb_each_text`, which renders `true` as the string `'true'` —
exactly the value the client schema refuses, and exactly what a form control
hands back when somebody forgets to convert it. A check against `v_value` would
accept both and silently disagree with the client while appearing to agree.

For `bleed`, `false` and absent are the same answer, so the editor stores
absence. For `margins`, absence and `true` are the same answer, so it stores
only the explicit `false` opt-out.

**One thing a browser test cannot pin.** At a chosen viewport, `wider` and
`widest` are indistinguishable unless the window happens to sit between them —
so the stops are asserted as class strings, verbatim. The null-equals-default
case pins the AGREEMENT and not the value, and cannot do better, because both
sides read the same entry; that is written into the test.

Each `data-page-gutter` owns its page chrome. An ordinary first section carries
`pt-6 sm:pt-10`, each ordinary non-first section carries `mt-10`, and an
ordinary last section carries `pb-6 sm:pb-10`; one ordinary section therefore
owns both edges. Measured sections also carry `px-4 sm:px-6`, while bled
sections remain `w-full`. With margins off, none of that section's horizontal
or vertical chrome is emitted. The parent has no `gap-10`, because a gap owned
by neither neighbour is one neither can opt out of.

That makes a banner an ordinary first section with `bleed: true` and
`margins: false`, and a footer the same combination on the genuinely last
section. The marker remains the one box in the block tree sized by the WINDOW
— it is outermost and has no container above it — and the
no-viewport-breakpoint guard excludes that one element while still scanning
its descendants.

### The theme switch is in the bar (2026-08-19)

Two controls, each asking one question: a palette toggle for "am I wearing this
author's colours", and the sun/moon for "and which default otherwise". A
visitor holds both answers at once, which is why `data-page-theme` was never
folded into `data-theme`.

It rode the public profile's header until that header became blocks. That was
the one row the app owned inside somebody's content, and there is no such row
any more — a control belonging to the app is exactly what should not sit among
an author's blocks.

**The question mark is gone.** The light/dark toggle showed one on a themed
page because neither light nor dark was in force; it now clears
`data-page-theme` as well as setting `data-theme`, so the press always changes
something a visitor can see and the icon is naming a direction again. That is
not new behaviour — it is what the old three-option group's light and dark
options did, moved with the question.

`PageShell` lost its `themed` prop with it. Passing `pageThemeSwitch` at all is
now the statement that there is a theme to leave.

**The EDITOR's toolbar carries the same switch now (2026-08-27), and it is the
same control rather than a second one.** Since the editor wears the page, a
busy theme is worn by the workbench too; this is the way out while building.
`EditorToolbar` takes a `pageThemeSwitch` node exactly as `PageShell` does, so
the bar never learns what a theme is, and `FursonaEditor` gates it on
`isCustomised(liveTheme)` — the LIVE form value, so it arrives with the first
colour somebody picks and leaves when they reset.

**It needed no new mechanism, which is the point.** `setPageTheme` writes
`data-page-theme` and persists nothing by design, and every rule `themeCss`
emits is already gated on `:not([data-page-theme="default"])` — so one attribute
takes the palette, the field, the skin, the background picture and the canvas
off together. Per-session falls out of that rather than being a decision taken
twice.

### The writing switch is in the bar too (2026-08-28)

**The language strip — `writingIn`, "Writing in" — is gone.** It was a
full-width card — a heading,
a hint sentence and the segmented switch — sitting between the theme panel and
the sections, sticky at its own `--bar-top-2`. The switch is a control in the
editor's toolbar now, and `WritingInToggle` is handed to `EditorToolbar` as a
NODE for the reason `pageThemeSwitch` is one: which languages somebody may
author in is a domain question and the bar owns no domain concept.

**The objection to moving it is real, and was accepted rather than argued
away.** `lang` reaches only `BlockEditor`, so the strip's old position was
deliberate — anywhere higher and it announced itself over the four top fields
it does not touch. It now sits above every one of them. What buys that is the
change in KIND rather than a change in the argument: a 67px switch beside the
title is a control, where a full-width card with a heading and a hint sentence
was a statement about whatever sat under it. The hint survives as the switch's
own `title` and its group `aria-label`, which is also what distinguishes it
from the app's own language button in the header directly above — a different
question with a confusingly similar answer.

**The bar's row WRAPS below `sm`, and that is arithmetic.** Measured at 320 in
Spanish, the controls wanted **345.1px against a 288px content box** with the
title already squeezed to 0. Nothing could be shaved to find 57px: the three
icon-only buttons and Save's padding together give back 32. So the row is
allowed a second line rather than every control being trimmed to the bone —
which the bar's own note already warns is how the NEXT control breaks a screen
size.

**It pays for itself.** The title read 0px at 320 in both languages before
this, so a phone never showed what was being edited at all; on its own line it
gets 212.8px and shows the whole name — 104.9px in Spanish, 90.2 in English.
`sm:flex-nowrap` keeps every wider screen byte-for-byte the single row it was,
and because `flex-wrap` wraps only on overflow, the second line appears **below
about 500px and nowhere else** — the bar measures 95px at 400–480 and 57px from
500 up.

**The switch sits OUTSIDE the action group, and that is what makes the wrap
work at all.** Inside it, the switch would wrap WITH the actions and the second
line would want the same 345.1px one line down. Outside, it stays with the
title — which is also where it belongs by meaning: what you are editing and
which language you are writing it in are both context, and everything right of
the `ml-auto` is an action.

**THE ENDONYMS STAGGER TO `md`, AND THE BAND THIS CLOSES IS THE PART WORTH
CARRYING.** Below `md` each side shrinks to `EN`/`ES`; at `md` it is
`English`/`Español`. Putting that swap at `sm` made three things arrive at one
width — the row going to a single line, Hide controls and Cancel getting their
words back, and the endonyms — and the row then wanted **673px against a 640px
viewport**. It overflowed from exactly 640 to about 672 **and nowhere else**:
320 was clean, 700 was clean, every desktop width was clean. A spot check at a
phone width and a desktop width sees nothing at all, which is the general
lesson — **a responsive fault can live in a band a few dozen pixels wide, and
the band starts at whichever breakpoint you just used.** Sweep the widths
either side of every breakpoint a change touches, rather than sampling the
sizes you happen to think in.

What the codes give up is only how fully each side names itself; both sides are
still shown and each still names ITSELF, which is the property that had to
survive. A single button that flips can only mean "the other one" — the
ambiguity `useLanguageToggle` carries two setters for, and `select` is the verb
here rather than `toggle`. `writing-in-toggle.test.tsx` has the only fixture
that can tell those two apart: pressing the side already ACTIVE, since both
verbs agree on the inactive one.

**`--bar-top-2` is deleted.** The strip was its only consumer, and a custom
property nothing reads is a value the next person has to work out is dead.
Anything still describing a third bar, or a `short:static` offset for one, is
describing an arrangement this editor no longer has.

**`editor-bars-stay-pinned.spec.ts` lost half of itself with the strip**, and
the half went rather than being repointed. Its two strip claims — pinned at
`--bar-top-2`, and sitting under the save bar rather than 47px below it — have
no subject now, and repointed at the toolbar they would be vacuous: everything
in the bar is pinned exactly when the bar is, so an assertion about the switch
could not fail first. What that gives up is the guarantee that the switch is
still IN the bar, and that is picked up in `fursona-editor.test.tsx` as
CONTAINMENT rather than position — the only question that can tell "in the bar"
from "in a strip above the theme panel", since a strip would satisfy every
ordering assertion that could be written. Sabotaging the switch out of the bar
reddens exactly that one case.

**One cost, stated because it is real.** Between about 640 and 900 the title
truncates a few pixels earlier than it did, because the switch takes 67px out
of the row the title was shrinking into. It is whole again by the widths most
authoring happens at, and it is strictly better than before below 500.

**Two guards, because neither is enough alone.** `fursona-editor.test.tsx`
proves the attribute is written and that the switch is ABSENT on a default
theme — a control offering to remove colours the page never had accepts a press
and does nothing. `editor-is-the-page.spec.ts` proves the attribute removes
something, reading `--canvas`, which `themeVars` emits only for a canvas other
than the design's: the empty string is a value the author's theme cannot
produce. jsdom resolves no custom property through a stylesheet, so the unit
case structurally cannot see the effect — root rule 30.

### The architecture pass (2026-08-27) — what moved and what deliberately did not

Four changes, each measured before it was made. Nothing about the model, the
vocabulary or the enforcement moved; this was all about where code lives.

**The renderer split, and then split again.** It went four ways on 2026-08-27
and the content module went three ways the same day — see the list at the top of
the blocks section for what each holds.
The seam that made it possible is `block-contract.ts`: while the contract lived
in `blocks.tsx`, any leaf module that spoke it would have depended on the file
that registers it, which is why `identity-leaves.tsx` had restated the
interface rather than import it.

**CSS emission left `domain/`.** `themeCss`, `themeVars`, `bodyBackgroundVars`
and `accentPreview` are `presentation/theme-css.ts` now; `domain/actor-theme.ts`
kept the vocabulary and went from 1,026 lines to 699. The split cost nothing
because it was already true — every consumer was a presentation module — and
what changed is that the boundary graph now ENFORCES it.

**A card's labels hold a leaf's rather than inheriting them.** Measured first:
of 23 `labels.*` references in `block-card.tsx`, exactly ONE reached a leaf
string. The other twenty-two were the card's own, and the relationship was
forwarding wearing inheritance. `labels.leaf` names the forward.

**The flat-section shim got a deletion condition, and the answer was a
surprise.** `pnpm check:page-shapes` counts what is STORED: 8,403 pages, **0
flat and 0 carrying `columns`**. But the shim is NOT dead code — templates are
authored in the flat vocabulary and every applied template runs through
`sectionsToBlocks`. Read that module's own header before removing anything: the
conversion is permanent and only the read fallback is retired-able, and it is
kept anyway because a census is a fact about one day.

**What was left alone, on purpose.** No application layer was added to "balance"
the layer sizes: the logic is pure functions in `domain/`, which is why
`leaf-editor.tsx` holds zero `useState` and `block-card.tsx` two. And the
`satisfies Record` tables were not replaced with a runtime registry — a registry
can silently miss a kind where the compiler cannot.

### `list` — the divided list (2026-08-27)

A container mode: a stack with a hairline between its children and **no gap at
all**. It is the shape every modern feed has and the one `stack` cannot make —
a gap between rows says "separate things", a rule says "one sequence", and the
three microblog pastiches had to borrow `timeline`'s dot-and-rail until this
existed.

**It is an ARRANGEMENT and decides nothing about its children.** A divided list
of cards is a legitimate thing to want; a feed is this mode PLUS
`chrome: "bare"` on the same block. Welding the two would repeat exactly the
mistake `gallery` and `links` were — an arrangement that also fixes what its
content looks like.

Its test compares against `stack` rather than asserting in isolation: both
render a column, so "the children are there" passes for either and proves
nothing about which ran. What separates them is the rule and the absent gap.

### Closing the pastiche gaps (2026-08-27) — five new OPTIONS

Every one of these is a choice an author may make and absence means exactly
what the page did before it existed. None of them changes a stored page.

**Three on a block's style bag.**

- **`chrome`** (`card` / `bare`). `bare` drops the fill, the edge, the shadow
  and the padding TOGETHER, which is what `border: "none"` could never do —
  that removes the border style and leaves a card. It is emitted as tokens
  (`--surface`, `--skin-border`, `--skin-border-min`, `--skin-shadow`,
  `--block-pad`), never as a rule on the card's class, because styling a
  generated class from outside a cascade layer is root rule 3.
- **`heading`** (`plain` / `bar` / `gradient`). A named container's name as a
  solid strip with its content squared off beneath — the dominant idiom of the
  mid-2000s social web, measured off real captures of MySpace and hi5. **It
  collapses the section's gap as well as filling the heading**: a bar that kept
  `gap-3` is a floating label with a background, which is not what either site
  did. `gradient` is the same bar with a vertical sheen; see the section below
  for why its ramp is symmetric.
- **`text_align`** (`start` / `center` / `end`).

**Two on the page's theme.**

- **`font`** — six faces, every one a stack the reader already has, so choosing
  one ships no file and adds no request. `casual` (Comic Sans) and `poster`
  (Impact) are the two that actually sign the era.
- **`spacing`** (`compact` / `roomy`) — card padding and text size together,
  because changing one alone makes a page look squeezed rather than dense.
  **Not to be confused with `density`, which is the CANVAS dial** and was
  already taken; that near-collision is why this key is called `spacing`.

**A face sets the TOKENS as well as the property, and nearly did not.**
Eighteen elements across the leaf modules carry `font-display` or `font-sans`,
which are explicit `font-family: var(--font-…)` declarations — and a
declaration on the element beats a family INHERITED from an ancestor. Setting
`font-family` alone changed body text and left every heading and display name
in the app's own face, which was found on a rebuilt page rather than reasoned
about. The general form is worth more than the fix: **an inherited property
cannot override an explicit one, so a page-level choice has to set whatever
tokens the elements actually read.**

**Both land in `SKIN_SCOPE`, never `:root`**, and a named test asserts WHICH
rule they land in. A `font-family` at `:root` would reset the app's bar, the
account menu and the language toggle to whatever a page chose; a test merely
asserting "the CSS contains Verdana" would pass on exactly that bug.

**`--block-pad` is why a leaf card's padding is a token now.** A literal `p-4`
cannot be overridden by a style bag, and the 26 `text-*` utilities in the leaf
modules became `em`-relative so `spacing` reaches type at all. That conversion
is behaviour-preserving and was MEASURED rather than assumed: the computed
`font-size` of every text element on a real page reads identically against
production, element for element.

**The theme vocabulary is pinned to the SQL now, and was not before.**
`PAGE_MEASURES`, `PAGE_FONTS` and `PAGE_SPACINGS` are compared against
`set_actor_theme`'s allowlist, whose final branch is
`raise exception 'unknown theme key %'` — the branch that made picking a width
throw the WHOLE theme save when `measure` shipped unpinned. Root rule 30.

### Closing the REST of the pastiche gaps (2026-08-27) — four more options

Same rule as the section above and it is the one to keep in mind here:
**every one is a key an author may set, and absence is exactly what a page did
before the key existed.** Nothing stored changed appearance and no migration
was needed.

- **`image_fit`** (`cover` / `contain`) on a block's style bag. It is emitted
  as `--img-fit` and read by the three renderers that draw an `<img>` —
  `AvatarLeaf`, the owner portrait and `PictureLeaf` — because the style bag
  lands on a wrapper the leaf's own image is nested inside and never reaches
  it. **The default lives at `:root`, and absence emits NOTHING rather than
  `cover`**: emitting the default would have every unstyled block overwrite an
  enclosing section's `contain`, which is inheritance defeated by the very
  mechanism meant to express it. Found by giving the pastiches their real
  logos, where hi5's 94×45 wordmark came through a circular avatar as two
  meaningless fragments.

- **`radius`** (`square` / `soft` / `round`). `--skin-round` is a MULTIPLIER on
  Tailwind's radius scale, so this is an absolute stop rather than a nudge, and
  it is written into the bag AFTER `nestedSkinVars` is spread — which is the
  whole mechanism: a later key in the same object wins, so a block may wear
  `comic` and still be round. `square` is a real `0` rather than a small
  number, because a nearly-square corner reads as a mistake. This is the same
  complaint `border` answered a fortnight earlier: square corners were
  reachable, but only by taking a whole skin's texture, shadow and edge along
  with them.

- **`heading: "gradient"`** — the bar with a vertical sheen, which is what both
  sites' title bars actually had. **The ramp is symmetric on purpose and that
  is the interesting part.** `--on-accent` is DERIVED from the accent somebody
  chose, so any lightness ramp moves half the bar toward the label and half
  away; a one-directional ramp would quietly spend contrast the palette had
  already budgeted. Mixing 12% white at the top and 12% black at the bottom
  keeps the accent itself as the midpoint, so the deviation is bounded and
  lands on both sides. `check:contrast` cannot measure this — it reads fixed
  token pairs and cannot read a colour a stranger picked — and the page-level
  readability escape hatch is what covers a marginal accent, here as everywhere.

- **An `icon` on a table cell**, read from each row's FIRST cell and drawn
  beside the label in the `<th>`. MySpace's contact box has a small mark on
  every line. It is stored on every cell because a cell is one shape, and read
  on the first: a second cell type differing by position is two shapes the row
  builder would have to keep in step with the markup. `setTableRowIcon` writes
  it, and **a row with no cells is left exactly as it was** — creating one would
  add a COLUMN to the table as a side effect of choosing a decoration.
  **An empty icon draws nothing rather than a fallback mark**, which is the
  opposite of `LinkLeaf` and a different question: there the mark says "this is
  a link", here it says whatever its author meant.

**`canvas: "none"` was never missing, and neither was the picker.** The
findings document recorded this as a gap twice over — first as "`none` is not a
canvas, it falls back to `nebula`", then as "the one absent thing was `\"none\"`
in `CANVASES`" — and BOTH were invented. `"none"` is the last entry of
`CANVASES` on `main` and has been throughout; adding it again produced a
duplicate React key that only a browser log reported, because a repeated entry
in a `readonly` array changes no type and fails no assertion. Root rule 16 (a
conclusion closes the question where an observation sends somebody to look) and
root rule 25 (a claim about what exists is dated the moment it is written).
Check the array before believing a sentence about it.

**Two things the browser found after all of this passed, and neither was
reachable from a unit test.**

- **The style popup's panel was TRANSLUCENT.** It took `--surface`, which
  carries `/.9` in the editor's chrome scope — measured on the live element,
  not inferred — so the author's page showed through a control floating over a
  colour they chose. That is the workbench opacity rule exactly, and the giveaway
  is that every select INSIDE the popup already used `--menu`: the group around
  them did not, so nothing looked wrong in the source. It takes `--menu` now,
  and `editor-is-the-page.spec.ts` asserts the computed ALPHA rather than the
  class — the class name was never what was wrong — with `--surface` asserted
  translucent in the same scope so the pair can tell the two tokens apart.
  **It was found by reading a screenshot**, which is the only reason it was
  found at all.
- **A new test id collided with an existing one.** `section-style-fit` is the
  BACKGROUND fit; the picture-fit select took the same string and four browser
  suites went red on a strict-mode violation. It is `section-style-image-fit`.
  Worth a line because the failure mode is invisible everywhere else: an id is
  a string, both selects were correct on their own, and no unit test asks a page
  for one. **Grep for a test id before minting it.**

### A bar can be given a QUIETER tone (2026-08-28)

`heading: "soft"` — the same strip in a second tone, so a page can stack a
strong bar and a quieter one under it. It is a fourth value on the existing
`heading` key rather than a key of its own, because it is the same question
answered differently and a second key would be a second thing to keep in step
with `BAR_FILL`.

**The tone is DERIVED, never picked, and that is the whole design.**
`--accent-soft` and `--on-accent-soft` come out of `derivePalette` beside the
accent's own pair. An author choosing a second colour outright would be a
second palette to keep readable, and every pairing of two chosen colours is
somebody's mistake to make; a sub-bar is a quieter version of the bar above it,
which is a derivation. Its LABEL is solved against the tone itself, exactly as
`--on-accent` is solved against the accent — nobody picked the tone, so nobody
can fix its label, which is the same argument the accent's label already rests
on.

**It travels in LIGHTNESS toward whichever extreme has room, and the obvious
alternative was measured failing.** Moving the accent a fraction of the way
toward the surface is the rule anybody writes first, and it collapses on the
exact page this exists for: a dark page's panel is dark too, so `#000080`'s
tone landed within 1.2 of the accent and the second bar was the first one. The
step is fixed in lightness, up from a dark accent and down from a light one —
the same shape `--on-accent` uses to pick a label — with chroma eased to 72% so
a tint does not read as a second accent. `palette.test.ts` keeps `#7f7f7f` in
its list on purpose: a mid-grey has the least room to travel, so it is where a
derivation that barely moves stops being visible first.

**`BAR_FILL` in `blocks.tsx` decides what counts as a bar**, and `barred` is
derived from it rather than from a second list of styles — so a style added to
that map draws a strip, collapses the section's gap and takes its padding with
nothing else being told about it. Each entry names its OWN label token, because
`soft` is a different colour from the accent and the label that reads on one
need not read on the other.

**A fixture here CANNOT use `toContain` on the class string.**
`bg-(--accent)` is a prefix of `bg-(--accent-soft)`, so a substring assertion
passes both on a renderer that ignores `soft` entirely and on one that paints
every bar soft. `blocks.test.tsx`'s two cases split the class list on
whitespace and compare whole tokens, in both directions — root rule 27, met on
a string rather than on a page shape.

It reaches the Facebook pastiche as the strong bar on the identity section and
the quieter one on everything subordinate to it, which is what the March 2007
capture shows — see `docs/superpowers/specs/2026-08-27-pastiche-findings.md`
for why there are two Facebook captures, at two different archives, and not
one corrected into the other — and what gap 12 of the pastiche findings
recorded as unreachable.

### A bar can be given room (2026-08-28)

`heading_pad` — `snug` or `roomy`, absent being the `px-3 py-2` every barred
page already had. **It is read only where the name is drawn as a bar**, and
that restriction is the design rather than an oversight: a plain name floats
with the page's own spacing around it and has no edge to be pressed against, so
padding it would move text with nothing behind it. A solid strip is the only
heading that can be crowded, and with `spacing: "compact"` shrinking the type
inside it, it was.

Two things a fixture here has to get right, both learned by writing them:

- **The default must be GONE when a value is chosen**, not joined to it. Two
  padding utilities on one element is a class list whose winner depends on
  Tailwind's ordering, so the cases assert `not.toContain("px-3 py-2")` as well
  as the new value — and sabotaging the renderer to emit both reddens exactly
  those two.
- **A plain name must read none of it**, which is easy to miss because every
  other fixture on the page has a bar. That case renders `heading_pad` with no
  `heading` at all and asserts the padding appears nowhere in the section.

### A title bar is a design surface (2026-08-29)

Three keys, and between them the bar stops being a colour and becomes
something an author can build with.

**`heading_image` paints a picture ON the bar, over the fill rather than
instead of it.** The fill stays underneath, so a picture that fails to load —
or one with transparency — leaves the author's own colour behind the strip
rather than letting the page show through something meant to be solid.
`heading_fit` lays it down, reusing `background_fit`'s own `cover`/`tile`
vocabulary because it is the same question about the same kind of value; absent
is `cover`, which is what "fill the strip" means.

**It is INDEPENDENT of `background_url`, deliberately.** A block may carry one
picture behind its content and a different one on its bar. Reusing the
section's would have shown whatever slice of it happened to fall across the
strip, which is not filling it.

**Nothing corrects the label over it, and that is a ruling rather than an
omission.** A photograph behind a title has no guaranteed contrast, and a scrim
would be the correction this codebase refuses everywhere else — an author's
colours render exactly as picked, and `PageThemeSwitch` is what makes that safe
for a reader. Confirmed with Heiner on 2026-08-29: _"If the author fucks up, is
on them."_

**`heading_gap` is the room UNDER the name, which had no control at all.** It
was one line in the renderer — `barred ? "gap-0" : "gap-3"` — so a bar always
welded to its content and a plain name always got the same fixed gap. **Absence
is therefore not one value**, and that shapes both the table and the tests:
`HEADING_GAP` holds only the three chosen values and the caller falls back to
whichever default applies, because putting a default in the table would make
one of those two pages change.

**Unlike `heading_pad`, it is offered on a PLAIN name too.** Padding needs an
edge to be pressed against and a floating name has none; a gap is real space
above the content whether or not a strip is drawn, so pulling a floating name
tight against what it names is a thing somebody can want.

**A fixture here has to depart from the right default, and the first one did
not.** Asked of a barred section, `none` asserts `gap-0` — exactly what a bar
already has — so it passed on a renderer ignoring the key entirely. Measured:
with the lookup removed, the table reddened on two of three. It tests `none` on
a plain name now and reddens on all three. Rule 27, on a default rather than on
a shape.

**And the address goes through `backgroundImageValue`, whose guard is not the
one it looks like.** That function refuses a raw `"` or `\` — but
`safeHttpUrl` parses through `new URL()` first and percent-encodes a quote in
the path, so the refusal never sees one and the value arrives as `%22`. Equally
safe by a different route. The test asserts the PROPERTY (no raw quote escapes
the `url("…")` wrapper) rather than the refusal, because asserting the refusal
would have pinned a path this input does not take.

### The window shape: corners chosen one at a time (2026-08-29)

`corners` on a block's box and `heading_corners` on its bar, each a
comma-separated list of `tl`, `tr`, `br` and `bl` naming which corners are
ROUNDED. Together they draw a window: a bar rounded across its top over content
rounded across its foot, with the join between them straight. That is Luna's
panel, and it was recorded as an open gap when the era looks were built —
"`radius` is one value for four corners".

**`radius` says how MUCH and this says WHERE**, which is what makes them
compose instead of compete. `radius: "soft"` with `corners: "tl,tr"` is a soft
top and a square foot; the skin still owns the number.

**It writes TOKENS rather than `border-radius`, and a browser is what forced
that.** The style bag lands on a WRAPPER — a leaf's own card is nested inside
`<Leaf>` and a section's children are cards of their own — so a radius written
on the styled element reaches nothing that draws a corner. The first version
did exactly that: every unit case passed, and the computed radius in a real
browser was 0 where the class said 12px. The cards read `--corner-tl` and its
three siblings now, defaulting at `:root` to the `--radius-xl` they already
resolved, so a page that sets nothing is byte-for-byte what it was. Same shape
as `--block-pad`, and the same reason `--img-fit` exists.

**When a list is present ALL FOUR are written**, which is the second thing the
browser corrected. Writing only the corners switched off looks tidier and is
wrong: custom properties INHERIT, and the bar sits inside the section, so a
section squaring its top gave a bar with square top corners however the bar's
own key was set. Naming all four makes each key self-contained. A rounded
corner is written as `var(--radius-xl)`, so `--skin-round` still owns the
number and `radius` still decides how MUCH.

`squareOffCorners` in `block-style.ts` is the one place that decides it, used
by the box and by the bar so the two cannot drift.

**`CORNER_CLASS` in `block-contract.ts` is the one class every shell reads them
through**, and it is there rather than in `blocks.tsx` because the leaf modules
need it too and `blocks.tsx` imports them — the same cycle argument that put
`LeafProps` in that file. It shipped as eight copies of a 180-character
literal, which is a shape nothing would have caught: a window is a bar whose
foot is square over a body whose head is square, so one shell drifting from
another opens the join and fails no type, no test and no assertion — the page
just stops being a window.

`corner-class-is-one-constant.test.ts` is what makes that mechanical. It reads
every source under the feature and asserts the literal appears in exactly one
file, with an anti-vacuity case beside it because a crawl that found nothing
would pass just as happily. Sabotage-verified by pasting a ninth copy back in.

**A CUSTOM PROPERTY SUBSTITUTES ITS `var()`s WHERE IT IS DECLARED, and that
broke every nested skin for one commit.** The tokens were declared at `:root`
defaulting to `var(--radius-xl)` — which looks like "the radius each card
already had" and is not: a custom property's computed value performs its
substitutions at the DECLARATION SITE, so `--corner-tl` froze root's
`--skin-round` and inherited that number into every scope below. A block
wearing `paper` inside a `comic` page drew comic's corner. Measured end to end
by `section-skin-nesting.spec.ts`: a styled block and an unstyled one both read
12px, where that case exists to prove they differ.

So the tokens are declared **nowhere**, and the card reads
`var(--corner-tl, calc(var(--skin-round) * 0.75rem))`. An unset token then
resolves `--skin-round` AT THE CARD.

**The fallback cannot be `var(--radius-xl)` either, and that is the second
half.** `@theme inline` means a utility INLINES the token's expression rather
than referencing it — `rounded-xl` compiles to
`border-radius: calc(var(--skin-round) * 0.75rem)`, which is exactly why per
skin radius ever worked. Referencing `--radius-xl` reads a value computed at
`:root`, so it is the same bug one step along. The written value for a ROUNDED
corner is the same expression, for the same reason.

**Neither of these is visible from a class string**, which is why both survived
a full unit suite at 100% and were caught by a browser measuring a computed
style.

**A browser case has to measure the CARD, not the section.** A section is a
transparent wrapper that draws no corner at all, so pointing the assertion at
it reads 0 whatever the key says — which is how the first version of that case
"failed" against working code, and then passed against the bar because the bar
carries the same class and comes first in the DOM. It is scoped through
`public-leaf` for that reason.

**There is deliberately no spelling for "no corners".** `radius: "square"`
already says that, and a second spelling for one answer is a thing to keep in
step. The editor enforces it by refusing to untick the last box — **in the
handler as well as through `disabled`**, because the rule is an invariant about
the value rather than a property of one control, and jsdom dispatches a
programmatic click to a disabled input where a browser would not. That is also
what makes the guard reachable in a unit test at all.

**An all-four list CLEARS the key rather than being stored.** Storing
`"tl,tr,br,bl"` would leave a page carrying a key that changes nothing, and two
authors who tick everything would store different-looking pages. The picker
writes `""` there, and `setField` removes the key.

**The control is SHAPED like the thing it sets** — four boxes in a 2×2 grid,
each rounding its own corner, so the picker is a picture of the result rather
than four lines of prose a reader has to assemble in their head. Its
`aria-label` per box is still the corner's name, so the shape is the
convenience and not the only way to read it.

**A `.style` read gives `"0"`, not `"0px"`.** Unit cases assert the inline
declaration verbatim; only a COMPUTED style normalises, and jsdom does no
layout. Each case also names the corners that must stay UNSET, because
asserting only that something is zero would pass on a renderer that squared all
four.

**Both keys carry a meaning in the generated reference**, and the gate added
the day before is what made sure of it: they were written on a branch cut
before `STYLE_KEY_MEANINGS` existed, and the rebase failed on them rather than
letting two keys ship with a shape and no explanation.

**The grammar is pinned to `0009` by its own case**, not by the table beside
it: `corners` is validated there by a REGEX rather than an `in (...)` list, so
it could not join `block-limits-match-migration.test.ts`'s enum table. The case
asserts the pattern MATCHED before comparing anything, then compares what the
two accept rather than their characters — and it is sabotage-verified, after a
first attempt whose `sed` silently failed to apply and proved nothing.

### A block may hide its own title as a label (2026-08-29)

`label` (`"show"` / `"hidden"`) on a block's style bag — gap 16 of
`docs/superpowers/specs/2026-08-27-pastiche-findings.md`. `AvatarLeaf`,
`HandleLeaf`, `NameLeaf` and `OwnerLeaf` each draw an optional label above
their own value — the leaf's own `title_en` — and none of the four knows the
other three exist. Stacked at the top of a page as the required-blocks shim
arranges them, the result reads as a column of label-value pairs rather than
one identity: the Threads pastiche is the example the gap names,
_aeleos / Aeleos: aeleos / aeleos: threads_ before any content its author
wrote. A real profile of that kind carries no label at all, and until this key
a page could not say so — `title_en` is required non-empty, and the
mode-derived suppression a `tabs` or `accordion` panel already applies was
never something an author could choose.

**`hidden` NARROWS what the enclosing mode already decided; it never
WIDENS it.** `showsLabel` (`presentation/block-contract.ts`) is the one place
the two compose: `labelled && style?.label !== "hidden"`. A mode that has
already suppressed a leaf's title — `tabs`/`accordion` passing
`labelled: false` — stays suppressed whatever the block's own key says, because
there is nowhere left on the leaf to put a title the mode already drew
elsewhere; `label: "show"` cannot undo that. `hidden` reaches the other
direction, suppressing a title the mode would otherwise have shown, which is
the whole reason the key exists. Absent (or `"show"`) behaves exactly as
`labelled` alone always has, so a page that never sets the key renders
byte-for-byte as it did before the key existed.

**Reaches five call sites, all through the one function.** The four identity
leaves and `PlainLeaf` (`text-leaves.tsx`, the `text` kind and the fallback
every unrecognised kind lands on) read `showsLabel` in place of `labelled`
alone. No other leaf kind reads it — `link`, `social`, the media leaves and
the rest of `text-leaves.tsx` keep reading `labelled` unchanged, which is a
deliberate scope limit rather than an oversight: the gap this key closes is
specifically the identity leaves stacking their own labels, and `PlainLeaf`
is the kind every unrecognised one falls back to.

**A leaf with no words can now be reached a second way.** `PlainLeaf`'s
"renders nothing at all" case used to be reachable only inside `tabs`/
`accordion`; `style.label: "hidden"` with an empty description reaches it
directly too, which its own TSDoc now says.

Pinned like every other closed vocabulary written down twice:
`block-limits-match-migration.test.ts` compares `BLOCK_STYLE_LIMITS.label`
against `0009`'s own `elsif v_key = 'label'` branch, added beside `chrome`'s in
`validate_block` in the exact same shape. `STYLE_KEY_MEANINGS` carries its
meaning, gated the same way `heading_gap`'s omission was found and closed.

**A review found the popup that carries this key shipped offering it on
every container, and no container is among the five call sites above — and a
second review, the same day, found the fix itself was still wrong
(2026-08-30).** `SectionStylePopup` had no gate on the "Own title" select at
all, so picking "Hide" on any section or nested container accepted a choice
and changed nothing — worse than an inert control, because it looked like it
worked. The first fix added `honoursLabel(kind)`
(`presentation/block-contract.ts`) and a `honoursLabel` prop gating the
select. **That gate was `false` by construction, not merely narrow.**
`SectionStylePopup` only ever opens for a `ContainerBlock` — `block-card.tsx`
is its only caller — and `ContainerBlock["kind"]` is always the literal
`"container"`, never one of the five leaf kinds `showsLabel` composes with.
So `honoursLabel(block.kind)` answered `false` at every call site there ever
was, and the control went from _visibly doing nothing_ to _unreachable by
construction_ — still wrong, just wrong in a way nobody could trigger by
clicking around. Both the prop and the helper are gone now
(`honoursLabel`, `LABEL_HONOURING_KINDS`), along with the select itself and
its two catalogue strings (`styleLabel`/`styleLabelHint` and their three
option siblings), in both `en.json` and `es.json`. The fix is not "open the
popup for leaves" — leaf editing lives in `leaf-editor.tsx`, and reworking it
is a product change nobody asked for.

**`label` did not lose its only way in.** It is reachable through the page
source dock (`page-document.ts`): an author pastes a document, the pasted
`blocks` array runs through this same schema, and `label` is a plain optional
enum in it like any other style key. What is gone is the ONE control that
never worked, not the mechanism — `showsLabel`, the five renderers, the SQL
validation and the seeded pages are all untouched. Be precise about which
half of "is this reachable" is true here, because this repository has shipped
the claim backwards before: `identity-leaves.tsx` once said a state was
"unreachable through the editor" when the write half was true and the
reachability half was false. Here the shape is the mirror image and the same
discipline applies — the popup path is gone, the dock path was never touched,
and neither sentence stands in for the other.

### A portrait's size, apart from the text beside it (2026-08-30)

`portrait` (`"s" | "m" | "l"`) on `AvatarLeaf`'s own style bag. `HandleLeaf`
and `NameLeaf` are `em`-relative, so their type shrinks and grows with a
page's `spacing`; `AvatarLeaf` was a fixed `size-24` on both its `<img>` and
its empty-state placeholder, so an author choosing `spacing: "compact"`
changed the relationship between a page's identity text and its portrait
without choosing to. This key is the way to ask for a different
relationship. It deliberately does **not** make the portrait itself
`em`-relative — that would be a default change on every existing page, where
every key in this bag is an option added on top of one. Absent and `"m"` are
the same size, `size-24`, by construction: `PORTRAIT_SIZE.get` misses on both
and the caller falls back to the same literal either way.

**It is read directly off the LEAF's own `style.portrait`, and that is a
deliberate difference from `image_fit`, not an oversight.** `image_fit` is
emitted as a token, `--img-fit`, which inherits — a container's own style bag
can set it and every picture nested beneath, `AvatarLeaf` and `OwnerLeaf`'s
own mini avatar alike, resolves it. A picture's CROP is safe to share that
way; its SIZE is not, because a container setting a bigger portrait would
silently resize any avatar nested anywhere beneath it, on a page that never
touched that leaf. So `portrait` skips the token mechanism entirely and reads
`leaf.style?.portrait` in the component, the same shape `showsLabel` already
reads `leaf.style?.label` through.

**`s` and `l` are measured against what a portrait actually sits beside, not
picked for being round numbers.** `s` is `size-12` (3rem, 48px) — exactly
half of `m`, and already the size a fursona's own avatar draws at elsewhere
on the same page, in the grid `FursonasLeaf` renders through
`FursonaCardList` — so choosing "small" does not invent a circle a visitor
has not already seen there. `l` is `size-32` (8rem, 128px) — the largest a
portrait can be while still fitting `TRACK_FLOOR` (`domain/block-tracks.ts`,
`8rem`), the narrowest place this model ever lays out. Anything larger would
guarantee horizontal overflow the moment a weighted grid floors a narrow
side.

**`OwnerLeaf`'s own inline avatar does not honour it, and that was a decision
rather than a gap.** It is a small mark beside a link — whose page you would
return to — never the page's own portrait, sized to sit in a
`flex items-center gap-3` row beside that owner's name and address. Letting
a fursona's `l` choice balloon that mark would fight the row it was built for
rather than serve the identity the row names, so it stays `size-10` whatever
the enclosing page's `portrait` says — which it never sees anyway, since the
key is never inherited.

**Reachable through a leaf's own style popup now (2026-08-30) — see "A leaf
reaches its own style popup" below — and through the page source dock.** A
container-level control is only meaningful for a key that inherits, and this
one deliberately does not; it is gated on the leaf's own `kind` rather than
offered unconditionally, since only `avatar` draws anything from it.

### A leaf reaches its own style popup (2026-08-30)

The owner asked for it directly, which is the circumstance the paragraph
above this section's neighbour was written against: two days earlier,
`SectionStylePopup` had briefly offered `label` behind a gate that was
`false` by construction for every caller, because the popup only ever opened
for a `ContainerBlock`. That control was removed as dead rather than
reworked into something a leaf could open — "reaching leaves is
`leaf-editor.tsx`'s job... and is a product change nobody asked for," as the
note above still says, accurately, of that day. It is asked for now, and
`leaf-editor.tsx` mounts `SectionStylePopup` exactly as `block-card.tsx`
does.

**Generalised from two ad-hoc booleans to one computed value, rather than
adding a third boolean beside them.** `SectionStylePopup` used to take
`named` and `atTop`, each worked out by its caller from the block by hand.
A leaf needed a third dimension — `label`, `image_fit` and `portrait` are
gated by the leaf's own `kind`, none of which `named`/`atTop` could express —
so the two booleans became one object, `StyleGates`, computed once by
`styleGatesFor(block, atTop)` in `presentation/block-contract.ts` from the
block itself:

- **`heading`** — the name-style controls. True for a NAMED container only;
  a leaf has no name field to draw one from.
- **`atTop`** — `bleed`/`margins`. True for a depth-0 CONTAINER only, and
  `styleGatesFor` ignores its own `atTop` argument for a leaf — neither key
  is read unless `isContainer` already agreed first, in both `bleeds()` and
  the page box's own margin test in `blocks.tsx`, so offering either control
  on a leaf would be the do-nothing control this feature keeps trimming. A
  page MAY hold a bare leaf at depth 0 (`block-editor.tsx`'s own note says
  so), which is why this needed spelling out rather than assumed away.
- **`label`** — reinstated as `honoursLabel(kind)`, the exact set
  `showsLabel` composes with (`text`, `avatar`, `handle`, `name`, `owner` —
  **not** `fursonas`, whose own title is never suppressible). Its TSDoc says
  it is back for a second time and why, so the next reader does not re-delete
  it reading the removal note alone.
- **`imageFit`** — always true for a container, because the token INHERITS
  to whatever draws a picture beneath it; gated by `honoursImageFit(kind)`
  for a leaf — `avatar`, `owner` (its own mini portrait) and `picture`, the
  three kinds whose `<img>` reads `--img-fit` directly. `handle`, `name` and
  `fursonas` draw no `<img>` of their own; `FursonaCardList`'s avatars are a
  fixed `object-cover` rather than a read of the token.
- **`portrait`** — `honoursPortrait(kind)`, `avatar` alone.
- **`card`** — gates `skin`, `border` and `chrome`, all three read only
  through `surface`. True for a container always; gated by `honoursCard(kind)`
  for a leaf, asking whether anything the leaf renders carries `surface` —
  not only its own box — since `surface`'s tokens are ordinary custom
  properties and inherit: `text`, `link`, `picture`, `embed`, `social`,
  `stat`, `quote`, `progress`, `table`, `avatar`, `owner` and `fursonas`
  (12 of 16, `fursonas` through `FursonaCardList`'s own cards rather than
  its own bare wrapper — see the third review below).
- **`corners`** — gates `radius` and the `corners` style key, both read only
  through `CORNER_CLASS`. NARROWER than `card`: `link`, `social`, `embed` and
  `avatar` all have a `surface`-bearing box but a fixed `rounded-xl`/
  `rounded-full` that never asks `--skin-round` anything, so `honoursCorners`
  answers `text`, `stat`, `quote`, `progress`, `table`, `picture`, `owner`
  alone (7 of 16) — the one dimension a container-only reading of "any
  block" could not have found, and did not, the first time this shipped. See
  the correction below.

**The popup mounts in the same header row as `block-card.tsx`'s, for the same
idiom.** `leaf-editor.tsx` patches through `patchLeaf` where `block-card.tsx`
patches through `patchContainer`; `LeafEditorLabels` gained a `style:
SectionStylePopupLabels` field, built once in `pages/labels.ts` as
`stylePopupLabels` and assigned to both the container's own `style` and the
leaf's `leaf.style` — one popup, one bag of strings, rather than two that
could quietly disagree.

**A page-wide `.last()` on `section-style-open` stopped meaning "the newest
SECTION's own popup" the moment a leaf could have one too**, and two e2e
suites were measuring the wrong element as a result:
`section-card-face.spec.ts`'s hostile-picture case and
`border-style-cascade.spec.ts`'s empty-place case each add content to a
section and then style it — via `.last()` — without collapsing the section
first, so the leaf's own trigger, added to the DOM after the section's, is
what `.last()` found. Both are scoped to `section-header` now, the one test
id that belongs to a depth-0 CONTAINER's header and nothing a leaf renders.

**That was two instances found by reading. A review asked about the other
eight `.last()`/`.first()` callers on this id across the same two files, and
whether "the suite stayed green" was proof or luck — root rule 23's
question asked of this exact shape.** Read one by one, each was ALREADY
protected by a real mechanism, not by chance: two open no popup on a fresh
`/pages/new` at all (`cutout clips…`'s first two calls, before either test
adds any content anywhere); the other six collapse the section immediately
after adding content and never re-expand it before the call, and
`{collapsed ? null : (…)}` in `block-card.tsx` unmounts the ENTIRE places
subtree when collapsed — the leaf and its popup included, not merely hidden
by CSS. Both claims were checked against the running suite rather than
believed from reading the code: `assertLastTriggerIsAContainers`
(`support/editor.ts`) now asserts, at every one of the eight sites plus the
two already scoped, that the resolved trigger sits inside a
`section-header`/`nested-header` rather than a leaf's card — and a combined
sabotage (reverting the id split below AND forcing `block-card.tsx` to
render places while "collapsed") reddened it exactly where reverting both
guards together should, restoring clean. Reverting the id split ALONE left
every case green, because collapse alone was already sufficient for all
eight — which is the honest report of a site protected by two independent
guards, not a discriminating fixture for either one in isolation.

**The id itself is split now too (2026-08-30), which is the fix that removes
the whole class rather than auditing it one caller at a time.**
`SectionStylePopupProps.triggerTestId` defaults to `section-style-open`
(`block-card.tsx` never overrides it) and `leaf-editor.tsx` passes
`"leaf-style-open"`, so the two controls can no longer share an id for a
future caller to trust by accident. Two ids sharing a name is what turned a
correct assumption into a silent one in the first place; a query for either
can never resolve to the other now, which is stronger than any amount of
per-site scoping.

**A second review found the map handed down for this task was wrong about
the half nobody was asked to verify, and it shipped once already
(2026-08-30).** The brief named `skin`, `background_url`, `background_fit`,
`border`, `chrome`, `radius`, `corners` and `text_align` as "any block" and
asked only that the GATED keys (`label`, `image_fit`, `portrait`) be checked
against the renderers. `background_url`, `background_fit` and `text_align`
really are kind-agnostic — `blockStyle` writes them as an inline style on
the wrapper `Block` itself renders, so they paint regardless of what a leaf
draws inside it. `skin`, `border`, `chrome`, `radius` and the `corners` style
key are not: each acts only through a per-kind renderer's OWN box (`surface`
for the first three, `CORNER_CLASS` for the last two), and a leaf may draw
neither. The popup offered the corner picker on 9 of 16 leaf kinds where it
could not change a pixel — every kind but the seven `honoursCorners`
answers — and offered `skin`/`border`/`chrome` on `handle`, `name`,
`player` and `jukebox`, none of which renders a `surface` anywhere; `handle`
and `name` draw no box whatsoever, a bare `@container min-w-0`. Exactly the
defect this whole branch exists to remove, reintroduced through the half of
the brief nobody had been asked to check. `card` and `corners`
above are the fix, derived from the renderers rather than taken on a second
telling — and `radius` landed in `corners`, not bundled with
`skin`/`border`/`chrome` as the review's own first guess had it: `radius`
shares NO mechanism with `surface` at all, only with `CORNER_CLASS`, which is
why `CORNERS_KINDS` is a strict subset of `CARD_KINDS` rather than a third,
independent list.

**A THIRD review found the second review's own fix still had one kind
backwards, and named the general rule the fix had missed (2026-08-30).**
`honoursCard` asked "does this leaf's own box carry `surface`", which is
narrower than the question the key actually needs answered: "does anything
this leaf renders carry `surface`", because `surface`'s tokens are ordinary
custom properties and INHERIT. `FursonasLeaf`'s own wrapper is bare — that
much the second review had right, and is why it excluded the kind — but it
renders `FursonaCardList`, whose cards ARE `rounded-xl surface
border-(--edge) bg-(--surface)` (`fursona-card-list.tsx`). Choosing a skin,
a border or `chrome` on a `fursonas` block reaches those cards exactly as it
reaches any other leaf's own, through the SAME inherited-token mechanism
`imageFit` and `portrait` already rely on elsewhere in this file — so the
gate was withdrawing a control that worked, the identical shape of defect
this whole branch exists to remove, running the other way. `fursonas` moved
into `CARD_KINDS`; `CORNERS_KINDS` did not change, because
`FursonaCardList`'s cards are a fixed `rounded-xl`/`rounded-full` that never
reads `CORNER_CLASS` either — which makes `fursonas` the sharpest
discriminator between the two gates the model has: `card` true and
`corners` false on the very same underlying element, pinned as its own
dedicated case in `leaf-editor.test.tsx` rather than folded into either
group either finding already had. Re-deriving the whole set against the
corrected question moved no OTHER kind: `player`/`jukebox` read only
`--chrome-*` tokens nowhere near a skin (confirmed by reading
`player-chrome.tsx` and `winamp-chrome.tsx` in full — neither file contains
the word `surface`), and `handle`/`name` are bare `<span>`s with no
descendants at all to carry anything.

**The focus-on-open effect moved with it.** It used to focus a ref pinned to
the skin select; `gates.card` can now remove that field entirely, which would
have left an opened popup focusing nothing. It queries the panel for its
first `input`/`select` instead, which `text_align` — offered on every kind
— always supplies.

**`assertLastTriggerIsAContainers` could not fail at any of its eight sites,
and a review measured that rather than taking the corroborating framing on
trust.** Reverting the id split alone left both audited specs green, 9
cases passing — collapse was doing all of the real protecting, at every
site the first pass had added the helper to. One site now discriminates
for real: `border-style-cascade.spec.ts`'s second test adds content and
never collapses, so its own leaf trigger is genuinely mounted, after the
section's own, when the assertion runs. Reverting the id split alone reddens
that ONE test and no other, sabotage-verified. The helper stays at the
remaining sites as documentation of a checked, true fact — corroborating
rather than discriminating, root rule 23's own distinction — and its own
TSDoc says so plainly rather than implying every call is equally load-bearing.

**Only the trigger id is split, and that is written down as the same trap
one layer in rather than fixed pre-emptively.** The panel and every field
inside it (`section-style-skin`, `section-style-border`, and the rest) stay
`section-style-*` whichever kind of block opened the popup, so two popups
open at once — nothing here prevents that — would make a query on any of
those ids ambiguous again. Nothing exercises this today; `triggerTestId`'s
own TSDoc names it so the next person who needs two popups open together
does not rediscover the shape from scratch.

**A browser test is the only thing that can prove a leaf's choice actually
paints**, matching `section-style-popup.spec.ts`'s own argument for why a
unit suite is not enough: the popup writes to the form field the preview
reads, live. `leaf-style-popup.spec.ts` drives `portrait` rather than
`label`, deliberately — its effect is a measured SIZE (`AvatarLeaf` writes
the same `size-*` class on its `<img>` and on its empty-state placeholder
alike), which needs no text assertion at all. That mattered mechanically as
well as by taste: this repo's lint config bans `toContainText`/`toHaveText`
outright (`no-restricted-syntax`, "Do not assert translated text — use
`toBeVisible()`"), and a first draft of this test asserting `label`'s effect
through a title's text tripped it immediately.

### A density that reaches OUTSIDE the card (2026-08-28)

`spacing` set a card's padding and its type size and stopped there. The page
box carried `mt-10` and `pt-6 sm:pt-10` — fixed classes no option could reach —
so **a `compact` page and a default page were measured differing in every
number except the 40px between every section.** The type was already tighter
than the sites being imitated while the page still read as airy: the air was
between the cards, not inside them.

`FIRST_MARGIN`, `BETWEEN_MARGIN` and `LAST_MARGIN` are `--page-edge` and
`--page-gap` now. Three things about that are load-bearing:

- **The defaults live at `:root` and are exactly what the classes were**, the
  edge's `sm` breakpoint included, as a media query on `:root`. So a page that
  chooses no spacing is byte-identical and no stored page moved.
- **A chosen spacing overrides them at every width**, carrying no breakpoint of
  its own — which is what makes it a choice rather than a suggestion the `sm`
  step outvotes.
- **`compact` is near-flush at `0.5rem`.** The arrangements it exists for
  stacked their boxes with a hairline between them, and a gap that merely
  halves still reads as modern.

The guard is a browser measurement, not a class assertion, because the class
string was never what was wrong: `blocks-render.spec.ts` seeds the SAME tree
twice under two themes and reads the gap — 40px plain, 8px compact. Removing
the two lines that emit the tokens puts the compact page back to 40 and leaves
the plain one green, which is the pair discriminating.

**Two gaps are left open deliberately** — per-block colour and overlap. Both
reverse a decision written down elsewhere (a skin names no colour; free
positioning is refused), so closing them belongs to a design pass rather than
to a gap sweep. The pastiche findings document says which and why.

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

### Page interaction locks by default while editing (2026-09-02, in progress)

The editor canvas renders the real page, real links and real embeds
included, so a click meant to select a block could navigate away or start
media. `domain/page-interaction.ts` is the first piece: `pageInteractionsEnabled`
is a pure function of two session-only inputs, `controlsHidden` and a
toolbar switch, taking neither from storage and writing neither back:

```text
page interactions enabled = controls hidden OR toolbar switch enabled
```

Preview (hide-controls) is not a second renderer, so hidden controls always
imply interaction; the toolbar switch is the only way to enable it while
controls stay visible, and it is designed to reset to off whenever controls
return.

**The DOM boundary is `lockCanvasInteraction`
(`presentation/canvas-interaction-lock.ts`), and it is the single enforcement
point rather than a branch in every interactive leaf renderer.** It marks
every {@link INTERACTIVE} descendant of an editor canvas `inert` — anchors,
buttons, form controls, disclosures, controlled media, frames, editable
content and an explicit tab stop — skipping anything inside `CHROME_SCOPE` so
the inspector, Add and the toolbar keep working while the page beneath them
does not. **It never marks the canvas element itself `inert`**: the click that
selects a block is read off that same element, and an inert ancestor would
swallow the click before it arrived.

**It restores each element's own PRIOR `inert` state on unlock, never a bare
"remove `inert` from everything it touched."** The public renderer may
already have disabled an element on its own terms — a `video` with no
`controls` sits outside {@link INTERACTIVE} entirely, but a future kind could
render something already `inert` — and unlocking must not make that
interactive again just because editing ended. A `Map<Element, boolean>`
records the very first sighting of each element and nothing after, which is
what a `MutationObserver` needs: **an already-locked element can be sighted a
second time** — moved to a new position by a reorder, which fires a fresh
`childList` mutation for the same node instance — and the second sighting
must not overwrite the recorded PRE-lock state with "already inert," which is
what the lock's own `setAttribute` just did to it a moment earlier. Getting
this backwards would leave a relocated element permanently inert after
unlock, silently, with no error and no failing type.

**The toolbar switch and the wiring into `BlockEditor` have landed.**
`EditorToolbar` gained `interact-with-page` — a pressed/unpressed switch
beside Preview, because both change how the live page can be used —
`aria-describedby` pointing at a visually-hidden sentence that swaps between
`interactWithPageHintOff`/`On`, stating the CONSEQUENCE rather than merely
the state. `FursonaEditor` owns the session `interactEnabled` state beside
`controlsHidden` and computes `pageInteractionsEnabled({ controlsHidden,
switchEnabled: interactEnabled })` once, passing the result into `BlockEditor`
as `pageInteractionsEnabled`.

**Show controls resets the switch; hiding controls does not touch it.**
`onHideControls` only sets `controlsHidden`, because Preview already implies
interaction through the effective rule; the `show-controls` handler sets
`controlsHidden(false)` AND `interactEnabled(false)` in the same click, which
is the session reset the spec requires and the one case a sabotage on this
branch actually caught — dropping the second call left the switch reading
"on" the next time controls returned, silently, with the canvas genuinely
unlocked to match.

**`BlockEditor` mounts the lock itself, in an effect keyed on the prop and on
`blocks`**, rather than `FursonaEditor` querying `data-editor-canvas` from
outside — a `canvasRef` lives where the canvas element already does, so
nothing here reaches for the restricted `document.querySelector` pattern.
`onCanvasClick` returns immediately when interactions are enabled, which is
the SECOND, independent layer against a click also changing selection: `inert`
is what stops a real browser from ever dispatching the click to a locked
element in the first place, and this guard is what stops the click from
reaching selection through the canvas's own ancestor handler once interaction
is genuinely on and the element is no longer inert. Both are needed —
`canvas-interaction-lock.test.ts` proves the first, `fursona-editor.test.tsx`
proves the second with a REAL `link` leaf and a real anchor click, since
jsdom implements no `inert` behaviour and cannot itself distinguish the two.

**The Add picker exists now, `presentation/add-block-picker.tsx`, though
nothing calls it yet — the flat add row and the drag-to-add path it replaces
are both still live.** It is not wired into `inspector-items.tsx` or
`block-editor.tsx` until the next task; this paragraph describes the
component in isolation.

`AddBlockPicker` is one control that draws its options with the REAL
renderer — `Block` from `blocks.tsx` — over fixed sample content from the
new `domain/add-samples.ts`, so a preview cannot disagree with the page the
same way the section style popup's live preview cannot. **Most kinds take one
generic English sample**; `table`, `progress`, `quote` and `stat` get a
shaped one, because those four invert or structure the title/description
pair and a generic sample would draw nothing at all for three of them
(`ProgressLeaf`/`QuoteLeaf`/`StatLeaf` all fall back to `PlainLeaf` on an
empty description). **The sample is never what gets added** — choosing an
option still calls `newLeaf(kind)` or `newContainer(mode, 2)`, exactly as
adding does today, and `add-samples.test.ts` pins that a sample's `title_en`
never equals what `newLeaf` produces for the same kind, so the two cannot be
silently confused.

**`targetPath` carries no placement logic in the picker itself.** It is
stamped onto the trigger as `data-target-path` (via `formatBlockPath`) so
more than one picker on one screen — an empty place beside a container
footer's — stays distinguishable to a test or to browser automation.
Deciding WHERE a chosen block lands is entirely the caller's job, through
`onAdd(block)`, which is why the picker's own discriminating test wires two
independent instances to two independent `onAdd` mocks rather than trying to
prove placement from inside a component that does not do any.

**Previews render inside `CHROME_SCOPE`, never `SKIN_SCOPE`.** `Block` is
mounted directly with no wrapping page-content element, so it inherits
nothing from an author's theme — the picker shows what the KIND is, not what
this page will make of it. Previews mount only while the dialog is open.

**A picker with every leaf kind reaches `RetroPlayer`, which needs
`NextIntlClientProvider`.** `player`/`jukebox` are two of the sixteen leaf
kinds, and their sample renders that component exactly as a real page would
— `add-block-picker.test.tsx` wraps every render in the real provider with
the real English catalogue, matching `blocks.test.tsx`'s own convention,
rather than mocking the dependency away and hiding the same setup
requirement this repository has already paid for once.

Renders nothing at all — no trigger, no dialog — at `BLOCK_LIMITS`, matching
the page-level Add control's existing rule.

**The picker is wired in everywhere now, and the two palettes it replaces are
gone.** `inspector-items.tsx` mounts one `AddBlockPicker` per empty position,
targeted at that exact path; `block-editor.tsx`'s `ItemsFooter` mounts one at
a container's own next child position for a scope whose places are all
filled; and the page-level `addPalette` mounts one targeted at `[]`. One
`addPickerLabels` bag, built once in `BlockEditor`, is threaded to all three
rather than each call site re-slicing `labels` its own way.

**"The nesting looked deleted" bug is what this closes, and it is proven by a
fixture the flat editor could not have discriminated with.** `add-nested`
used to exist ONLY on an empty place, so a two-place container with both
places filled offered no way to nest a section inside it at all — `mayNest`
still admitted one, but the control to reach it did not exist.
`block-editor.test.tsx`'s "still offers add-block from a full two-place
container" fixture is built with BOTH places occupied from the start, which
is the case a fixture with an empty place left over could never have caught.

**Drag-to-add is gone, deliberately, and may return later.** The flat
add row's buttons were `draggable`, with a matching HTML5 `onDragOver`/
`onDrop` pair on the canvas (`droppedKind`, `blockFromPayload`) — both
removed in the same change that removed the row, since the picker replaces
the row entirely and nothing else in the editor used HTML5 drag (`block-slot.tsx`
and `fursona-list.tsx` both use `@dnd-kit`, an unrelated mechanism with no
`dataTransfer` involved). The owner's own words: "we can work with menus for
now. We might think on drag to add later." Recording it here is what keeps a
removed capability from being rediscovered as a bug — see root rule 33's
neighbours on this exact shape.

**The page-level width selector went with `add-section`, and that is a
plan deviation worth naming.** The old flow let somebody choose a section's
spaces (1–6) BEFORE adding it, through a `new-section-spaces` select paired
with the `add-section` button. The picker's layout options all add
`newContainer(mode, 2)` — a fixed starting shape, exactly like `add-nested`
already did at every OTHER scope — so a section's width is chosen
AFTERWARDS, through its own shape control, uniformly with how nesting has
always worked. Keeping the select once its only button was gone would have
left it a control that accepts a choice and changes nothing, the fault this
whole repository refuses; it was removed along with the state (`spaces`/
`setSpaces`) and the `id` (`useId`) that only it consumed. `addSection` and
`newSectionSpaces` remain as unread catalogue strings in both languages,
left rather than chased through every consumer for a rename this task did
not ask for.

**`BlockCard`'s own legacy `showChildren=true` rendering lost its add UI
too**, per its own TSDoc's admission that no production caller reaches that
mode any more ("standalone card tests default to the legacy complete card").
An empty place there now offers only removal; filling one is the enclosing
Items scope's job. `block-card.test.tsx`'s cases that exercised the removed
buttons were rewritten to test what remains rather than deleted outright,
except where the assertion itself no longer had anything to discriminate.

**Motion is wired for editor chrome (2026-09-02).** `presentation/editor-motion.tsx`
exports `EditorMotion` (`LazyMotion` + `MotionConfig reducedMotion="user"`,
mounted once at `FursonaEditor`'s own root) and re-exports `m` — every `m.*`
usage in this feature imports it from there, never `motion` from
`motion/react` directly, which is what keeps the always-loaded core small.
`editor-motion.test.tsx`'s static grep enforces both: `"motion/react"` is
imported from exactly one file under this feature (itself), and no `m.*`
anywhere carries a `layout` prop.

Five places carry it, matching the spec:

1. **Inspector entry** (`canvas-inspector.tsx`) — the root becomes `m.div`,
   fading and sliding in from the left on desktop or up from the bottom on a
   phone. Which direction plays is read via `useSyncExternalStore` rather
   than a lazy `useState` initializer, because this tree can render during
   SSR where `window` does not exist and a `useState` initializer has no
   SSR-safe equivalent; the client snapshot calls `matchMedia` directly,
   unguarded, matching `nebula-canvas.tsx`'s own convention.
2. **Scope transitions** — the Items/Options pane's inner content is wrapped
   in an `m.div` keyed on `${tab}:${selection.kind}:${path}`, so entering a
   different block or switching tabs both remount it and re-play a short
   fade+translate. The `hidden` attribute deciding which PANE shows still
   owns that; the key only ever plays inside the one already visible.
3. **Canvas accommodation** — plain CSS
   (`transition-[padding-left] duration-210 ease-out`) on `data-editor-stack`,
   deliberately not Motion, so `@dnd-kit` and the page's own boxes never
   receive an inline `transform` from this.
4. **Selection outline** — plain CSS too: a static base rule gives every
   block a transparent outline at the selected one's offset, and only the
   colour transitions (`outline-color 150ms ease-out`). The base rule has to
   be unconditional — transitioning a property FROM nothing is not a
   transition, there is nothing to interpolate from.
5. **New inspector rows** (`inspector-items.tsx`) — an occupied row's label
   wrapper is `m.div` (opacity-only), kept a SIBLING of the drag handle
   rather than its ancestor, since `BlockSlot`'s own outer element is the
   actual `@dnd-kit` node and already writes its own `transform`; an empty
   place's whole content is `m.div` since it carries no handle at all.

**jsdom cannot run a Motion animation to completion, and that broke two
pre-existing tests before it broke none of the new ones.** No real
compositor means an `initial={{opacity:0}}` element never reaches
`animate={{opacity:1}}` in a unit test — `toBeVisible()` (which jest-dom
fails on `opacity:0`) on freshly-entered content stays red forever, not
merely late; `waitFor` does not help because the animation never runs at
all, only real time passing does nothing without real frames. The fix in
`block-editor.test.tsx`'s two affected cases is `closest("[hidden]")`
instead of `toBeVisible()` — the real invariant those cases care about is
"in the active pane, not the one `hidden` is hiding," which is exactly what
survives an animation this instrument cannot see. What Motion's animations
actually LOOK like is proved in `tests/e2e/` in Task 7, against a real
browser.

**jsdom also implements no `window.matchMedia` at all**, unrelated to
Motion but found by wiring the entrance direction — `tests/setup.ts` now
stubs it to always answer "no match," matching the `ResizeObserver` stub
beside it: constructed so the code under test can run, at the narrowest
default, with the real answer proved in `tests/e2e/`.

**A measured finding for whoever finishes the cost verification (Task 8):
Motion's own chunk currently reaches the fully public, signed-out profile
routes, and that is a PRE-EXISTING fact about this feature's barrel, not
something this wiring introduced.** `@/features/actors/index.ts` re-exports
`FursonaEditor` (which imports `EditorMotion`) from the same barrel
`/[locale]/[person]/page.tsx` imports `PublicProfile` from — so Turbopack's
per-route `firstLoadChunkPaths` already put the SAME shared bundle behind
both an editor route and a public one before Motion ever entered the
picture. Measured directly from `.next/diagnostics/route-bundle-stats.json`,
before and after this task, in uncompressed bytes:

| route (representative)                             |     before Motion | after Motion |    delta |
| -------------------------------------------------- | ----------------: | -----------: | -------: |
| `/[locale]/me` (+ 5 more editor routes, identical) |         1,841,658 |    1,950,514 | +108,856 |
| `/[locale]/[person]` (+ `/[handle]`, identical)    |         1,833,981 |    1,942,837 | +108,856 |
| `/[locale]/fursonas/[[...rest]]`                   |           778,889 |      778,889 |        0 |
| `/[locale]/sign-in/[[...sign-in]]`                 |           749,122 |      749,122 |        0 |
| `/[locale]` and `/_not-found`                      | 738,627 / 452,708 |    unchanged |        0 |

The four routes NOT already sharing the barrel's bundle show a byte-for-byte
**zero** change, which is what proves Motion's own import graph is properly
scoped to `editor-motion.tsx` and its three callers — it never leaks into
the true root-shared chunk on its own. Every route where it DOES appear
already carried the identical shared bundle (react-hook-form, zod,
`@dnd-kit`, the whole editor graph) before this task, at nearly the same
size. Motion's marginal cost is the same **+108,856 bytes** on every route
that has the barrel's bundle at all, editor or public — consistent, not
pathological.

**What this does not settle:** whether that pre-existing barrel coupling
itself is acceptable is a question this task did not create and cannot
answer by reverting Motion — a revert would leave `/[locale]/[person]`
loading the same ~1.8MB either way. Untangling it means splitting
`@/features/actors/index.ts` so editor-only exports (`FursonaEditor`,
`BlockEditor`, `AddBlockPicker`, and everything they pull in) are not
re-exported through the same barrel a public page's `PublicProfile` comes
from — a real fix, and out of this task's scope. The `canvas` job's own
throttled-page measurement is the number that actually decides whether
Motion stays: unused JS sitting in a downloaded chunk costs bytes and parse
time, not the runtime frame cost `canvas` measures, since no `m.*` component
ever mounts on a route that does not render editor chrome.

Nothing about Task 7's browser proof has landed yet; this section grows
with the branch rather than describing a finished feature. See
`docs/superpowers/specs/2026-09-02-editor-interaction-and-motion-design.md`.
