# The fursona studio — porting Libra's product studio to AeleOS

**Status:** design, approved 2026-08-13. Not yet implemented.

Fursonas today are four fields on a card: handle, display name, avatar URL,
visibility. The ask is that they become what Libra's studio makes a product —
something composed, arranged and shown, because a fursona is a piece of art
somebody wants seen rather than a row in a registry.

The target is **the studio's `products` feature at full functional parity**,
translated to the fursona domain, on Libra's client stack, in AeleOS's visual
identity.

## Why now

`/fursonas` is a list of tiles with one action. The person who owns a fursona
can set four fields and nothing else, and nobody else can look at the result —
there is no page anywhere in AeleOS that shows a fursona to a visitor. The hub
holds the art and does not display it.

Libra already solved the composing-and-showing problem for products, and the
same person maintains both repositories. Porting is cheaper than designing, and
the two apps staying structurally alike is worth something on its own.

## What this is not

- **Not a copy-paste.** The studio imports five of Libra's workspace packages —
  `ui`, `shared`, `api`, `auth`, `@monorepo/app-components` — and every query is
  typed against Libra's `products` table. The hardest of those is `auth`:
  `useCurrentUserPermissions` and `ProtectedRoute` are Libra's own auth model,
  which is precisely what AeleOS exists to replace. Pasted in, almost none of it
  compiles.
- **Not the theme.** Libra's studio is neo-brutalist: 3px borders, hard offset
  shadows, uppercase extrabold headings, grid-dot surfaces. AeleOS keeps its own
  OKLCH tokens, its nebula and its `check:contrast` gate. Structure and
  behaviour port; the skin does not.
- **Not orders.** Libra's pending-order badge is commerce. A fursona is not
  sold; there is no order to be pending.
- **Not delegates.** Letting a second person co-manage a fursona is a real idea
  and a new one — the ownership ledger has no notion of it. It is not a port,
  so it is not here.

## Decision 1 — Port the client stack wholesale

Three architectures were weighed: server-first (keep the hub's shape), a hybrid
(studio structure, server data), and porting Libra's client stack. **The client
stack was chosen deliberately**, over the recommendation, and the reason is
worth recording: the point is not this feature, it is that the next thing ported
from Libra should be near-mechanical. A hybrid buys less machinery today and
pays for it at every future port.

New dependencies: `@tanstack/react-query`, `nuqs`, `@hello-pangea/dnd`,
`react-hook-form`, `@hookform/resolvers`, `lucide-react`, `clsx`,
`tailwind-merge`. Zod is already a dependency.

`cn` becomes a small helper in `shared/`, not a vendored design system. That is
the whole of "without the theme" in code terms.

### The browser client, and the seam

This is the first time the hub needs a Supabase client in the browser.
`createIdentityClient` in `@aeleos/identity` already takes `getToken` as a
parameter, so a browser client is built by passing Clerk's token getter in — the
package still never learns which provider issued the token. The escape hatch
stays a one-column `identity_sub` backfill. **This must not be weakened**: if a
future edit makes the package import Clerk to get a token in the browser, the
seam is gone and `eslint.config.mjs` should stop it.

## Decision 2 — Rich content lives in `fursona_profiles`, not on `actors`

`actors` is the canonical actor-model schema every app copies, and
`/api/actors/mine` feeds it to Puck and Libra under a contract written down in
`docs/integrating.md`. A `sections` blob on `actors` would push a fursona's
entire art page into the cross-app identity contract, where no consuming app
wants it and every consuming app would have to mirror it.

So the rich content goes in a **new table keyed by `actor_ref`**:

```
fursona_profiles
  actor_ref   uuid primary key references actors(actor_ref)
  sort_order  int                              -- phase 2
  featured    boolean not null default false   -- phase 2
  updated_at  timestamptz                      -- phase 2
  sections    jsonb not null default '[]'      -- phase 3
```

The phase markers are load-bearing. The table arrives in phase 2 because
reordering needs it; `sections` waits for phase 3 rather than shipping as a
column nothing writes.

`actors` stays exactly what it is, and `/api/actors/mine` gains no field —
which is the test of whether this decision is right. (Decision 3 does add one
clarifying sentence to `docs/integrating.md` about deleted fursonas no longer
arriving. That is a change to what an existing response _means_, not to its
shape; see the closing section for why the distinction is the line.)

RLS mirrors the existing pattern: a person reads and writes rows whose
`actor_ref` they own, resolved through `current_person_ref()`, which 0007
already filters to active people so a suspended person cannot edit.

### The section shape

Libra's shape, adopted unchanged, because divergence here is what would make a
future port stop being mechanical:

```
section: { name_en, name_es, type, sort_order, items[] }
item:    { title_en, title_es, description_en, description_es,
           icon?, image_url?, sort_order }
type:    cards | accordion | two-column | gallery
```

Content is authored in both languages by the owner. This is **not** next-intl:
next-intl translates the app's own chrome, and these are a person's own words
about their own character. The two must not be confused — a missing `title_es`
is a person who has not written one yet, not a missing catalogue key, and it
must never fail a build.

## Decision 3 — Delete is soft

The studio hard-deletes a product. Here that would be wrong.

Every handle comes from a global unique namespace, and there is no reclamation —
0011's quota exists partly because nothing frees a handle. A hard delete frees
one, and a freed handle can be registered by somebody else, so a retired
fursona's name becomes available to impersonate the character that used to wear
it. In an identity product that is the wrong default.

Delete therefore sets `actors.status = 'deleted'`, keeping the row and its
handle reserved. The quota counts it, for the same reason 0011 counts suspended
ones: otherwise deleting becomes a way to buy allowance back, and the
sanction-evasion path reopens.

Naming the mechanism as a `status` value rather than a `deleted_at` column is
what makes its consequences checkable, and there are three. Whoever implements
this must handle all of them or the delete is a half-delete:

- **`actors_public`** — 0011's public branch already requires `status =
'active'`, so a deleted fursona is invisible to strangers for free. But the
  owner branches (`identity_sub`, `owner_ref`) have no status test, so the owner
  would keep seeing it. That is correct for `suspended` — somebody must be able
  to see that they were sanctioned — and wrong for `deleted`, which they chose.
- **`my_actors()`** (0009) filters on ownership and nothing else, so a deleted
  fursona would keep appearing in the owner's own list and in
  `/api/actors/mine`. It must be excluded — and that is the one place this work
  touches something the cross-app contract can observe, so `docs/integrating.md`
  gets a sentence saying a deleted fursona stops arriving, which is behaviour
  its sync section already describes for suspension.
- **`create_fursona`'s quota** (0011) counts every fursona a person owns
  regardless of status, so deleted rows keep consuming allowance with no change
  needed. This is the one that is already right; do not "fix" it.

## Decision 4 — Templates in code, toggles with honest meanings

Libra has a `product_templates` table. A static set of starting layouts in code
costs no database, no migration and no rows, and the budget is $0. If templates
ever need to be authored rather than shipped, that is a later change with a
clear trigger.

The studio's two row toggles map unevenly and are treated differently:

- **`featured`** becomes "pin this fursona first" — a real thing somebody wants
  when they have several and one is the one they mean.
- **`is_active`** is dropped. `visibility` already decides who sees a fursona,
  and `status` is moderation. A third state overlapping both would be a control
  whose meaning nobody could state.

## Parity checklist

What "every single functionality" resolves to, so a later phase can be checked
against it rather than against memory:

| Studio                         | Fursona port                                                  |
| ------------------------------ | ------------------------------------------------------------- |
| product table, zebra rows      | fursona rows                                                  |
| filter by type + category      | filter by visibility                                          |
| debounced search (300ms)       | debounced search over handle and display name                 |
| filters in the URL             | same, via `nuqs`                                              |
| drag to reorder                | same, `sort_order` in `fursona_profiles`                      |
| reorder disabled when filtered | same — the studio is right, order is ambiguous under a filter |
| toggle `featured`              | pin first                                                     |
| toggle `is_active`             | dropped — see Decision 4                                      |
| delete with inline confirm     | soft delete with inline confirm                               |
| delegate count badge           | dropped — no delegates                                        |
| pending orders badge           | dropped — no orders                                           |
| permission gating              | dropped — you own yours; the `(app)` layout protects          |
| inline editor, live preview    | same                                                          |
| mix-and-match sections         | same, four section types                                      |
| per-item bilingual fields      | same                                                          |
| section + item drag-reorder    | same                                                          |
| templates                      | same, from code                                               |
| icon picker, image bar         | same; images are URLs until phase 6                           |
| sticky save toolbar            | same                                                          |
| form error banner              | same                                                          |

## Phases

Each is one pull request.

1. **Foundation.** Dependencies, the query provider, the browser Supabase
   client through `createIdentityClient`, `cn`, and a `width` prop on
   `PageShell` so a page can leave the 620px column.
2. **List parity.** Rows, filters, search, drag-reorder, featured, soft delete.
   Creates `fursona_profiles` with `sort_order` and `featured` only — the table
   arrives here because ordering needs it, and `sections` is deliberately left
   out until phase 3 rather than shipped as an unused column. Also carries the
   `status = 'deleted'` work and its three consequences from Decision 3.
3. **Content model.** Adds `sections` to that table, with its RLS and
   conformance tests in `tests/db/` alongside the existing suite.
4. **Editor parity.** The `InlineEditor` port — sections, bilingual fields,
   templates, toolbar, error banner.
5. **The public fursona page.** Where the art is finally shown. Interacts with
   `actors_public` and its rule that a suspended fursona is not publicly listed
   — a suspended fursona's page must not be publicly readable either.

   > **Superseded in part, 2026-08-13.** This phase turned out to be two pages,
   > not one: a person's profile as well. And addressing changed underneath it —
   > a fursona is reached at `/{person_address}/{handle}`, handles are unique
   > per owner rather than globally, and a person carries a permanent number
   > plus an optional vanity. **`apps/hub/src/features/actors/CLAUDE.md` is
   > authoritative** and newer than this document; where they disagree it wins.

6. **Images.** Supabase Storage: a bucket, upload, size limits, and what
   happens to an image when a fursona is soft-deleted.

## Testing

The hub gates at 100% branch coverage and that does not move. Every hook,
mutation and component in phases 1–4 is tested, and the database work in phases
2, 3 and 6 extends `tests/db/` — which runs against a real Postgres in the
`conformance` job.

Two things deserve naming as risk rather than being discovered later:

- **No signed-in end-to-end test exists in this repository.** `tests/e2e/` is
  entirely anonymous because driving a real social login is outside our control.
  Everything in phases 1–4 renders only for a signed-in person, so none of it
  gets browser-level proof. Phase 5's public page is the first part of this work
  an end-to-end test can actually reach, and it should get one.
- **Phases 2, 3 and 6 add migrations to a live database.** The schema is applied
  by hand — no workflow does it — so each of those phases ends with an applied
  migration verified by querying the database, not by trusting the CLI's exit.

## What this does not cover

- Delegates, orders, and any permission model beyond "you own your fursonas".
- Any new **shape** in the cross-app contract. Decision 2 keeps every new column
  out of it: no consuming app learns what a section is. The single exception is
  the sentence Decision 3 adds to `docs/integrating.md` saying a deleted fursona
  stops arriving — behaviour that file already documents for suspension, not a
  new field. That is the line: a phase may clarify what an existing response
  means, and a phase that finds itself adding a **field** to
  `/api/actors/mine` has broken a decision and should stop.
- Moderation tooling for sections. A moderator can suspend a fursona today, and
  suspension will hide its page; reviewing or removing individual sections is a
  separate concern with no current owner.
