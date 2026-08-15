# The actors feature — how an actor is addressed

This note constrains code that **does not exist yet**. Everything already
built states its own contract in TSDoc, where `pnpm check:docs` keeps it
honest; what follows is the addressing model the next migration and the public
page must implement, and the traps that model creates.

The schema itself is owned by `supabase/migrations/` at the repository root,
not by this app. Nothing here ships a migration. That schema is consolidated — **every object is defined exactly once** — and
squashed again whenever a change would otherwise stack a redefinition on top of
an existing file. The section layouts landed as an edit to `0009`, not as an
`0017`. See the root `CLAUDE.md` for when that is legitimate and what a squash
obliges you to update afterwards.

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
- **`docs/integrating.md` must say handles are unique per person only** — still
  outstanding. The
  contract already tells apps to key off `actor_ref` and never the handle, so it
  holds — but an app that quietly used `handle` as a key would begin colliding
  across users, silently, in a different repository. Say it there rather than
  trusting the existing sentence to be read that way.
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

## The layouts, and what the two text fields mean in each

A page is sections, a section has a layout, and a layout decides what its items
look like. There are eleven. The first four came from Libra; the rest exist
because **a fursona page is somebody's character, not a product listing** — the
layouts that serve a catalogue do not stretch to a page whose whole job is to
be theirs. More are wanted; this list is a floor, not a ceiling.

| layout       | what an item is      | `title`         | `description`     | uses               |
| ------------ | -------------------- | --------------- | ----------------- | ------------------ |
| `cards`      | a card               | heading         | body              | `icon`             |
| `accordion`  | a disclosure         | summary         | the answer        | —                  |
| `two-column` | a row of a table     | label           | value             | —                  |
| `gallery`    | a picture            | alt text        | caption           | `image_url`        |
| `carousel`   | a picture on one row | alt text        | caption           | `image_url`        |
| `video`      | an embedded player   | frame title     | caption           | `link_url`         |
| `music`      | an embedded player   | track name      | note              | `link_url`         |
| `links`      | a button out         | button text     | subtitle          | `link_url`, `icon` |
| `stats`      | one fact             | **the label**   | **the value**     | —                  |
| `quote`      | a quotation          | **who said it** | **what was said** | —                  |
| `timeline`   | an entry in order    | heading         | the story         | —                  |

**`stats` and `quote` invert the pair**, and that is the one thing here somebody
will get wrong. Everywhere else the title is the big text; in those two the
description is. The editor names its fields per layout for this reason — a
field whose meaning changes silently between layouts is worse than a field that
does not exist.

**A template ships structure, never prose.** Titles, layouts, icons and order
are ours; every description is empty. They used to carry guidance sentences in
those descriptions, so a page created from a template and published unedited
read its own instructions out to strangers in its owner's voice — "Say what your
character is: one species, a hybrid, or something of your own", presented as
what that person had written. The prompt is the description field's
**placeholder** now: it helps while somebody writes, is never stored, never
published, and never has to be deleted.

Two consequences that must not be undone:

- **A description may be empty and a title may not.** An item is a heading with
  something under it — without the heading there is a blank box, without the
  description there is a perfectly good card. `0009` always accepted an empty
  description; only `sectionItemSchema` forbade it.
- **Every layout leaves the element out when the description is empty**, or an
  empty `<p>` becomes a visible hole in a gap-spaced grid. A test walks all
  eleven.
- **`two-column` drops the whole ROW, and the whole list when no row is left.**
  It is the only layout that hides an item rather than one element of one, and
  the reason is what the layout is: a table of label and value. A `dt` without
  its `dd` is invalid markup, so the answer is to drop both — not to render half
  a row. The list goes too when nothing survives, because `dl` carries the
  border and the surface and would otherwise be a bordered box with nothing in
  it. Everywhere else a title with no description is a perfectly good card;
  here it is half a pair.

  The filter reads the LOCALISED value, so a row written in one language only
  appears for readers of that language. That follows `contentFor`, which falls
  back to English — it is the same behaviour every other layout already has,
  made visible because here it decides a whole row.

**Adding a layout is four edits and a guard will catch you missing one.**
`SECTION_TYPES`, `is_section_type()` in `0009`, a renderer in the `LAYOUTS`
record, and a name in both catalogues. The record is typed
`Record<SectionType, …>` so the compiler refuses a missing renderer, and
`section-limits-match-migration.test.ts` reads the SQL and fails when the two
lists disagree. Nothing checks that a layout is _good_; that part is still on
you.

**A layout that renders no field must not offer it.** `LINKED`, `ICONED` and
`PICTURED` in `section-item-fields.tsx` decide what the editor shows. A control
that accepts what somebody types, stores it, refuses nothing and renders
nothing is the worst kind — there is no way for them to learn it did nothing.

### Embedded media is allowlist-and-rebuild, never pass-through

`domain/embeds.ts` is the whole security model of the media layouts and its
TSDoc carries the argument in full. The short version, because it must not be
weakened by somebody who only read this file:

**What somebody pasted never reaches the page.** Every branch parses the
address, checks the host against an exact set on the parsed `hostname`,
extracts an id matching a strict pattern, and then BUILDS a new address from a
fixed template. A hostile value cannot become anything worse than no embed.

- Only `https:` survives, so `javascript:` and `data:` cannot reach a frame and
  run in this page's origin.
- Hosts are never matched by prefix or suffix. `youtube.com.evil.example`,
  `evil-youtube.com` and `https://www.youtube.com@evil.example` all fail — the
  last one only because the comparison is on the parsed authority. This is the
  same mistake `return_to` had to avoid in the picker, and it is the same fix.
- Every query parameter is discarded. Carrying them would let whoever pasted
  the link set whatever options the provider honours.
- SoundCloud's widget takes an address as a parameter — the one URL-inside-a-URL
  here. It is rebuilt from parsed path segments and then encoded, so a `&` in
  what somebody pasted cannot add parameters to the widget.
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
produce, even if the resolver were made to build something else. The two lists
are pinned to each other by tests on both sides.

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
- **The emitted CSS is two rules, and the split is deliberate.** The COLOURS go
  to `:root`, because a palette is the whole page — the field the body paints
  and the canvas in the root layout are both outside anything a page could
  scope to, and scoping to a nested element is exactly why an earlier version
  reached neither. The SKIN goes to `SKIN_SCOPE`, the person's own content,
  because a skin only ever restyles surfaces and every surface is inside it.
  Both carry the same gate on the visitor's choice, so leaving the theme leaves
  all of it. Do not tidy the colours into the skin's selector.

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
where nine themed presets would have been nine colour schemes.

`shared/domain/skins.ts` holds the table and `SKINS` is the list — fifteen of
them. Adding one is a table entry and a name in both catalogues; a test fails if
either is missing.

**What earns a place is a MECHANISM, not another set of numbers.** The six added
last each reach for something none of the others used: a surface that is not
there (`outline`, where `--surface: transparent` makes the author's gradient the
card itself), a tiled texture (`comic`'s halftone, which is what
`--skin-gloss-size` exists for — a `radial-gradient` with no size is one dot the
width of the panel), a shadow that steps instead of fading (`pixel`), a ruled
grid (`blueprint`), a surface pressed in rather than raised (`inset`), and a
die-cut ring (`sticker`). Another radius-and-shadow pairing would read as a
variant of something already here.

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
- **`[class~="border"]` is where the edge, the shadow and the gloss land.**
  Tailwind's `border` utility is literally the class `border`, and every
  bordered surface here carries it. `~=` matches whole words, so `border-b` and
  `border-2` are untouched — the header's underline stays an underline. The
  companion `:not([class*="shadow"])` leaves alone the one card that names its
  own shadow, without which shipping skins would have restyled a page nobody
  skinned. **The rule itself is global and needs no scope**: the tokens it reads
  are only overridden inside `SKIN_SCOPE`, so everything above that element
  inherits the design's own values. Scoping the rule as well would be a second
  place to keep in step.

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

### Canvases

`CANVASES` holds **exactly the canvases that exist** — today the nebula, a
starfield, an aurora, a constellation, waves, bubbles, snow, a horizon grid,
drifting glows, orbits, a honeycomb, ribbons, confetti, a skyline, bokeh, and
four retro screen savers — mystify, bouncing boxes, glyph rain and warp speed —
and stillness.

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

**Two dials scale every canvas: how busy, and how fast.** Density multiplies
how many of a thing a canvas draws; speed multiplies the clock, so no renderer
needs to know speed exists — one asked to go twice as fast is handed a time
twice as large. They are separate because they are separate complaints: a
starfield can be crowded and still, and a single box can hurtle.

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
