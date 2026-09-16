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
page must implement, and the traps that model creates. The feature's dated
account lives in `HISTORY.md` beside this file (moved 2026-09-15), and its
standing rules in `.claude/rules/editor-*.md`. The drop-target-legibility
work (2026-09-07 → 09-13) is the last eight sections of that history: a
drop is marked by one `before`/`after`/`place` mark for the single winning
target, drawn out of flow, and the gap kinds are a bar rather than a ghost.

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
