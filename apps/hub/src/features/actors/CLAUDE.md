# The actors feature — how an actor is addressed

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

`domain/block-schema.ts` is the vocabulary and `presentation/blocks.tsx` is the
renderer. This note says what the model IS; their TSDoc says what each piece
does and does not do, and between them they are longer than this section, for a
reason.

### Nothing was thrown away — every old type is somewhere in here

The old list was a flattened cross-product, so unwelding it expands what is
expressible by more than another welded pair ever could while losing none of
the work. Somebody looking for `gallery` should find this table rather than
conclude it was dropped.

| the old `type`   | what it is now                                       |
| ---------------- | ---------------------------------------------------- |
| `cards`          | a `grid` container                                   |
| `gallery`        | a `grid` container holding `picture` leaves          |
| `masonry`        | a `masonry` container                                |
| `carousel`       | a `carousel` container                               |
| `tabs`           | a `tabs` container                                   |
| `accordion`      | an `accordion` container                             |
| `timeline`       | a `timeline` container                               |
| `links`          | any container holding `link` leaves                  |
| `socials`        | any container holding `social` leaves                |
| `posts`          | any container holding `post` leaves                  |
| `video`, `music` | `player` leaves                                      |
| `stats`          | `stat` leaves                                        |
| `quote`          | `quote` leaves                                       |
| `progress`       | `progress` leaves                                    |
| `two-column`     | a `table` leaf — or a `stat` leaf, for a single pair |

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

| kind       | what it holds        | `title_*`       | `description_*`   | also reads         |
| ---------- | -------------------- | --------------- | ----------------- | ------------------ |
| `text`     | a paragraph          | heading         | body              | —                  |
| `link`     | a button out         | button text     | subtitle          | `link_url`, `icon` |
| `picture`  | a picture            | alt text        | caption           | `image_url`        |
| `player`   | an embedded player   | frame title     | caption           | `link_url`         |
| `post`     | an embedded post     | frame title     | caption           | `link_url`         |
| `social`   | a branded chip       | chip label      | **not rendered**  | `link_url`, `icon` |
| `stat`     | one fact             | **the label**   | **the value**     | —                  |
| `quote`    | a quotation          | **who said it** | **what was said** | —                  |
| `progress` | one measured thing   | **the label**   | **the value**     | —                  |
| `table`    | rows of paired cells | the caption     | a note under it   | `rows`             |

**`stat`, `quote` and `progress` invert the pair**, and that is the one thing
here somebody will get wrong — it has been got wrong once already. Everywhere
else the title is the big text; in those the description is. The inversion is a
RENDERING fact and never a schema one: the fields keep their generic names on
the block, so switching a kind to look at it and switching back finds what was
typed still there.

`progress` is the kind that additionally tries to READ its value.
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
is not a property of the block at all. A wide thing is a container of one space
nested where it is wanted, which is the same recursion doing the work rather
than a second mechanism beside it.

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
shape, style, places, and the live preview) and `leaf-editor.tsx` (one piece of
content and only the fields its kind draws). `section-schema.ts` and
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

**The preview is the REAL renderer.** Each section's card draws itself with
`Block` from `blocks.tsx` — the component both public pages are built from —
handed the same tree the save will send, parsed by `lenientBlockSchema` because
the editor's tree is mid-edit. A second implementation would have looked
identical the day it was written and drifted the first time either changed,
with no type error and no failing test; it is the same argument that already
has the live style preview calling `blockStyle` rather than a copy of it.

### Dragging (2026-08-18) — anything, anywhere a place will hold it

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
to the side that does not — and, since `tests/e2e/block-drag.spec.ts`, against
rectangles a real layout engine measured. **The case that actually
discriminates nearest-centre is not the flagship one**: at the point the
flagship uses, nearest-centre happens to answer the innermost place as well.
The case below it, where the parent's centre is nearer than the child's, is
the one that would redden.

**That browser proof is newer than it looks, and the sentence it replaced was
the misleading kind.** This paragraph used to end "and again in a browser",
crediting `section-drag-reorder.spec.ts` — which drives the KEYBOARD, and the
keyboard branch of `detectCollision` hands back the place the coordinate getter
already chose without calling `placeUnderPointer` at all. So the collision
geometry had never met a rectangle Chromium produced. `block-drag.spec.ts` runs
FOUR of its cases by mouse and by keyboard both — the swap, the move in and out
of a nested place, the section reorder and the refusal one level past the
depth cap — and its pointer
half asserts the `data-over` highlight BEFORE releasing — `useDroppable`'s own `isOver`, which is
the collision's answer rendered. Swap the ranking for nearest-centre and the
pointer case reddens at the highlight while the keyboard case stays green.

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
`tests/e2e/support/drag.ts` now**, and that is not tidiness: the fix was
written inline in `block-drag.spec.ts` and the two specs the same phase ported
kept the unprotected lift, so the mechanism was diagnosed once and applied
once. A helper is the only version of "written down" that the next spec cannot
skip.

**The walk steps over places nothing is showing, and it did not.**
`placeOrder` walks the whole STORED tree while a collapsed card renders none of
its places — so those places register no droppable and dnd-kit has no rectangle
for them. Landing on one used to keep the new path and fall back to the current
coordinates, after which the collision named an unregistered id, `over`
resolved to **null**, and the drag announced "it stayed where it was" while it
was still running; a space bar pressed there dropped nothing, because
`onDragEnd` returns early on a null `over`. `coordinateGetter` keeps stepping
until it finds a place the library is measuring, so every place the keyboard
can reach is one a drop can land on. The guard is
`block-drag.spec.ts`'s collapsed-card walk, and its fixture collapses a card in
the MIDDLE of the walk on purpose — collapse the last one instead and the fault
looks like a walk that stopped, which is a legal answer at the end of a list.

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
are the two read paths and the template picker, and none is going away soon:
every page written before the block model is still FLAT in the column,
converted on the read by `readActorPage` and by the public pages' own
`parseBlocks`; and the shipped templates are still written in the flat
vocabulary, converted when the picker applies one. **A page stays flat in
storage until its owner next saves.**

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
for space counts where the leftover divides evenly — three places and five.
Both move where a block is DRAWN and neither moves anything stored.

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
- **Changes are live and use the SAME `themeCss` the public page uses**, so the
  preview cannot drift from the result. Persistence rides the ordinary save:
  what must be instant is seeing a colour, not storing it.
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
  that would undo the choice. A control able to disable its own undo. The fix
  is not an exemption for the popup: `block-card.tsx` paints the card's face
  on a **layer inside** the root, so the notch is still previewed and any later
  token that clips _or transforms_ inherits the same protection.
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
}
```

**Every key is optional, and absent means "inherit whatever encloses this."**
That is a real answer, not a gap: a block with no `style` at all gets no
`style` attribute in the markup either, so a page nobody has touched with this
feature is byte-for-byte what it was before the feature existed.
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

#### The section card's face is not the card

In the editor, `blockStyle`'s output is split across two elements by what
each property **does**, not by naming keys: a custom property is inherited by
definition and goes on the **root**, where the popup and the item fields read
it; a painted property goes on the **face**, the `absolute inset-0` layer that
carries `surface`. The public page needs no such split because its `<section>`
is bare.

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
(`domain/actor-theme.ts`) exists to get right. `body` is a descendant of
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
