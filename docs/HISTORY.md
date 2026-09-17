# AeleOS — the record

The root `CLAUDE.md`'s "Current state" section, moved verbatim on 2026-09-15. Dated, in the order it was written; read it for the account, not for a constraint on new code.

🌿 **Phases 1a, 0, 1b, the fursona studio and the public pages are done — the
hub is live, another app can hand a person over to it, somebody can build a
fursona's page with real pictures, and a stranger can read it.** The studio
port is complete through phase 6. Phase 1b-i's 🧑 steps are the only thing
still open.

- **Phase 1a (actor model seam) — done, and the schema is now consolidated.**
  `supabase/migrations/` holds the canonical schema, **every object defined
  exactly once** (2026-08-13). Before that consolidation, six objects had been
  redefined by `create or replace` — `actors_public` four
  times, `ensure_person_actor` three — so the newest body of a function could
  sit in a file named after something else, and restating the wrong ancestor
  silently reverted a fix. That nearly shipped. **Before replacing anything,
  note that the file names now tell you where it lives**; keep it that way.
  `tests/db/` is the conformance suite apps run against their own database, and
  it is what proved the consolidation changed no behaviour. Plan:
  `2026-07-29-phase-1a-actor-model-seam.md`.
- **Phase 0 (Clerk standup) — done and self-verifying.** The Clerk instance and
  the Supabase integration are live. `tests/idp/` runs against a real
  Clerk-issued token; the `idp-cloud` CI job re-proves the trust on every pull
  request. See `docs/phase-0-clerk-setup.md`.
- **Phase 1b-i (hub foundation) — done, including the verification.**
  `apps/hub` is a Next.js app with Clerk sign-in, a Supabase client bound to the
  Clerk token, and person provisioning on first sign-in. Its last 🧑 step — verifying a real sign-in provisions exactly one actor row —
  **is no longer manual**. `clerk-actor-model.test.ts` calls
  `ensure_person_actor` twice as a real Clerk-authenticated caller and then
  COUNTS the rows through the Management API, which the previous assertion did
  not: returning the same `actor_ref` twice does not establish that only one row
  exists, because a second could be written and the first still be the one
  resolved. It runs in `idp-cloud` on every pull request.

  Confirmed against the live project on 2026-08-14 in a browser as well: a run
  of `signed-in.spec.ts`, which signs in repeatedly across several contexts,
  added exactly one person row and one address.
  Plan: `2026-08-02-phase-1b-i-hub-foundation.md`.

- **Visual identity — shipped.** The hub carries the design: OKLCH tokens for
  both modes, self-hosted fonts, and a drifting nebula canvas behind every page
  with the star beside the wordmark switching it off. `pnpm check:contrast`
  measures the token pairs so "measure, do not eyeball" is a command rather than
  a rule. Spec: `2026-08-12-aeleos-visual-identity-design.md`; the four things
  the design got wrong about itself are recorded in `docs/design/README.md`.
- **The hub is bilingual.** next-intl in the same shape as Libra's
  `shared/i18n`, in-app because AeleOS ships one app. Routes carry a `[locale]`
  segment; the browser's language wins where supported and **Spanish is the
  fallback** (Libra defaults to English — AeleOS deliberately does not). Both
  catalogues are key-checked in `apps/hub/tests/messages.test.ts`, so a message
  added to one language and not the other fails the build rather than rendering
  a raw key at somebody.
- **The hub is layered, and the layers are enforced.** `apps/hub/src` is
  `app/` (Next's routes — thin wrappers that import only from feature
  barrels), `proxy.ts`, `features/session/`, `features/actors/` and `shared/`
  — two features because `/me`, fursonas and the picker are one domain, and
  the chrome (nebula, toggles, page shell) owns no domain concept and so lives
  in `shared/presentation`. Each feature exposes an `index.ts` barrel and
  grows `domain` / `application` / `infrastructure` / `presentation` layers
  only as it earns them. **`actors` exposes a SECOND barrel, `public.ts`**,
  holding the six symbols the two signed-out routes render — because
  `index.ts` re-exports `FursonaEditor`, and a public route importing
  `PublicProfile` from it pulled the whole editor graph into that route's
  chunk: 1,943,136 bytes against 1,008,803 once split, measured. The graph
  types `features/*/{index,public}.ts` alike, so **`boundaries` cannot tell
  the two apart and does not hold this** — a route is free to import either.
  `apps/hub/tests/public-route-imports.test.ts` is what does, and
  `apps/hub/src/features/actors/CLAUDE.md` carries the account. Rules in
  `eslint.config.mjs` keep the rest of the shape honest
  rather than aspirational: a feature is reached through its barrel, no
  feature imports another, no `../` chains, `shared/` never depends on a
  feature, layers point inward only, and `packages/identity` must not import
  an app or a framework — Clerk, Next or React — so swapping the token issuer
  stays a one-column backfill rather than a change to every app on the
  platform. **Those rules are `eslint-plugin-boundaries` now, declared once as
  a graph over named element types**, matching the sister repos' tool — though
  not their graph, which is looser and lets features import each other. They
  were ~390 lines of `no-restricted-imports` blocks, one per feature per layer,
  each restating every pattern that still bound its files: flat config
  **replaces** that rule for overlapping globs instead of merging it, so a
  block that forgot a pattern it still owed was a silently disabled rule, and a
  fourth feature meant editing nine blocks correctly or quietly losing a
  boundary. Two properties are new rather than preserved: the graph denies by
  **default**, where the old blocks listed what was forbidden and so failed
  OPEN; and `no-unknown-files` fails a file that declares no home at all. Only
  the `../` ban and the package's framework ban are still
  `no-restricted-imports` — they are module names rather than elements. The
  account named here moved to `apps/hub/src/features/actors/HISTORY.md` on
  2026-09-15.

  **The graph is only as real as its resolver.** `boundaries` asks
  `import/resolver` where a specifier points, and an import it cannot place is
  one it cannot police; the TypeScript resolver is configured for exactly that
  reason. `sabotage.py`-style verification is not optional here — nine
  violations were introduced one at a time and each was watched to fail before
  this was believed. Spec:
  `2026-08-12-hub-layering-and-contract-seam-design.md`.

- **`@aeleos/identity` is the cross-repo seam.** `packages/identity` holds
  `createIdentityClient` and the actor accessors — the code every app would
  otherwise copy — with `@supabase/supabase-js` as its only, peer, dependency.
  The hub is its first consumer so that the design is found wrong here before
  another repository pins a version of it. Phase 1b-ii builds fursonas onto this
  shape rather than writing it flat and moving it later.
- **Phase 1b-ii (fursonas and the picker) — done.** Fursona management shipped
  first (`2026-08-12-phase-1b-ii-fursonas.md`); the handoff followed. Another
  app can now ask which identity somebody wants to be. Two surfaces, and the
  reasoning behind each is the part worth keeping:
  - **`GET /api/actors/mine`** returns the caller's own actor list, authorized
    by the person's **own Clerk token** in an `Authorization: Bearer` header —
    no shared secret and no service account, so a caller can only ever read
    what its own signed-in user could already see. It carries **no CORS header
    and never will**: the payload is a complete actor list including private
    fursonas, so making it browser-readable would turn an XSS in any one
    consuming app into a disclosure of every user's fursonas from every app.
    `identity_sub` and `owner_ref` are picked out of the response by name
    rather than trusted to be absent — the linkability columns are the whole
    point of the actor model, and a column added upstream must not reach a
    caller by default.
  - **`/picker?return_to=…&app=…`** is where somebody chooses. `return_to` is
    matched on the **parsed origin** against an exact allowlist, never by
    string prefix or suffix — both of which are trivially defeated
    (`…furrycolombia.com.evil.example`, `evil.puck.furrycolombia.com`). The
    allowlist is **empty in production on purpose**, so no handoff completes
    until a maintainer adds an origin.
  - **The rule the consuming apps must not get wrong:** `actor_ref` comes back
    in a query string, so it is a _suggestion_, never an authorization. Every
    app looks it up in its own mirror, confirms ownership and `active` status,
    and uses its local row. `docs/integrating.md` says this in its own section
    because it is the one mistake that turns the whole model into "act as
    anybody".
  - **Declining is part of the protocol, not an omission.** Every branch of the
    picker offers a way out, because a page reached by a redirect that offers
    only choices is a trap — the back button lands on the link that sent the
    person there and bounces them forward again. Where `return_to` was
    accepted, declining returns to it with **no** `actor_ref`, and `declineUrl`
    strips any the caller planted, so a decline can never arrive looking like a
    choice. A consuming app must read an absent `actor_ref` as "they declined"
    and leave the current identity alone — never substitute a default, which
    turns "no thanks" into "yes, as somebody".
  - **The hub owns no mirror schema, and must not grow one by accident.**
    `supabase/migrations/` is the registry's own authoritative schema; it is not
    a drop-in mirror and cannot be (`actors_person_shape` needs `identity_sub`,
    which the endpoint deliberately never sends). `docs/integrating.md` names
    the columns it suggests as suggestions.

  Plan: `2026-08-12-phase-1b-ii-picker.md`. Contract: `docs/integrating.md`.

- **The fursona studio — done.** Libra's product editor, ported whole and
  without its theme: a filterable, drag-reorderable list; a full-page editor on
  react-hook-form with a sticky toolbar; sections in several layouts with
  bilingual, per-item fields; an icon picker; and starting templates
  shipped in code rather than in a table. **That editor is the flat one and is
  now superseded** — see the blocks bullet at the end of this list. Spec:
  `2026-08-13-fursona-studio-port-design.md`; plans
  `2026-08-13-fursona-studio-phase-*.md`.

  The line that phase drew and that later work must not blur: **a person's own
  writing is not next-intl.** The catalogues are the app's chrome and a missing
  key fails the build; `name_es` on somebody's section is a person who has not
  written the Spanish yet, and must never be reported as a fault.

- **Public pages (phase 5) — done.** `/{address}` is a person's profile and
  `/{address}/{handle}` is one of their fursonas, readable by anybody. Read
  **`apps/hub/src/features/actors/CLAUDE.md`** before touching anything in the
  actors feature. It is authoritative for addressing and newer than the spec.
  In short:

  - `/{person_address}` is a person's public profile and
    `/{person_address}/{handle}` is one of their fursonas. Both are readable by
    anybody.
  - A person has **one permanent number**, assigned in sequence, and may be
    granted a **vanity** — text or a different number. Both resolve forever, so
    a shared link never rots. The number is meant to be awardable: #7 really is
    the seventh person here.
  - **Both forms live in one namespace with one unique index.** A vanity may
    _be_ a number, so a constraint per form would let person #500 take the
    vanity `7` while person #7 exists.
  - **Fursona handles become unique per owner**, not globally, which is the
    point of putting the person in the path. Consuming apps are unaffected —
    they key off `actor_ref` and never the handle — but `docs/integrating.md`
    has to say so out loud rather than implying it.
  - **A profile lists only `public` fursonas.** "List the fursonas they own" is
    the natural implementation and it destroys what `unlisted` means.
  - **A suspension travels to every public page**, the person's own included.
    That rule exists nowhere in the schema today: a fursona whose _owner_ is
    suspended is still `active` itself, so its page would keep serving.

  Two things that phase established beyond the pages themselves. **The schema
  was consolidated so that every object is defined exactly once** — six had
  been redefined by `create or
replace`, so the newest body of a function could sit in a file named after
  something unrelated and restating the wrong ancestor silently reverted a fix.
  Keep that property. And **`0012` is the only thing `anon` may execute**;
  `0010_client_grants.sql` is the readable index of the client surface and says
  where that exception lives.

  Plan: `2026-08-13-fursona-studio-phase-5-public-page.md`.

- **Images are links, and nothing is stored (2026-08-14).** Every picture on a
  page is an address somebody pasted, exactly like the video and music players
  — see `embeds.ts`. **AeleOS hosts no files at all.**

  This replaced a working Supabase Storage bucket. The reason is the $0 budget
  rather than a technical one: hosting other people's images is the single cost
  on a profile builder that grows with how much people enjoy it, and it is the
  one that can be avoided outright. Storage on the free plan is 1 GB at no
  charge, so this was a deliberate choice made with that known, not a reaction
  to a bill.

  What went with the bucket is worth recording, because each was load-bearing
  and none of it is needed now:

  - The **public-read caveat** — an uploaded picture stayed reachable by its
    address even after its fursona was made private, so the editor had to say
    so beside the upload control. A pasted address never had that property,
    because the file was never ours to un-publish.
  - The **path-as-authorization** contract, `actor/{actor_ref}/{random}.{ext}`.
  - The **forced delete order**. `deleteFursona` had to sweep the bucket before
    marking the row, because the storage delete policy resolved through
    `owns_active_actor` and a deleted actor could no longer reclaim its own
    files. A delete is one write again.

  **Do not reintroduce an upload without reopening the budget question**, and if
  it is ever reopened, the three constraints above come back with it.

- **A block may carry its own form (2026-08-16).** A skin, a background
  picture and a fit, apart from the page's — edited in a paintbrush popup with
  a live preview, using the same `blockStyle` the public page renders with
  so the two cannot drift. It shipped per SECTION and is per BLOCK now,
  unchanged in meaning, which is the whole payoff of a section being only a
  container at depth 0. **Absent means "inherit whatever encloses this,"** a
  real answer rather than a gap. **Colour stays page-level and always will** —
  a skin names no colour of its own, and every pairing of a style and a palette
  is somebody's page; a per-block colour would collapse that. Read
  `apps/hub/src/features/actors/CLAUDE.md` for what a block may set, the
  nesting fix a skin needed to apply twice without falling through to the
  wrong scope, and why the readability escape hatch stays page-level rather
  than growing a per-block correction. The account named here moved to
  `apps/hub/src/features/actors/HISTORY.md` on 2026-09-15.

  The same pass fixed a section's drag handle, dead since it was first
  written and invisible to the only test that covered it — see "Every bug
  gets a regression test" above for the fault, the fix, and the lesson it is
  the second instance of.

- **The section-personality design is delivered end to end (2026-08-16).** The
  embed provider table, with the Content-Security-Policy's `frame-src`
  derived from it rather than kept as a second list somebody has to remember
  to update; embedded posts and branded social chips; the per-section form
  (skin, background picture, card size); the `cards` grid the size dial fed;
  and a background picture behind the whole page, layered correctly
  over the author's own gradient. The layouts named there are container modes
  and leaf kinds now — the blocks bullet below carries the mapping — and
  `card_size` lost its reader with the `auto-fill` grid it was a minimum width
  for. Read
  `apps/hub/src/features/actors/CLAUDE.md` and
  `docs/superpowers/specs/2026-08-15-section-personality-design.md` — the
  latter is now marked complete — for what each piece does and does not do,
  including the parts still resting on somebody else's undocumented behaviour
  (`posts`) and the one thing reasoned from the CSS spec rather than watched
  in a browser (the page background's `background-attachment`). The account
  named here moved to `apps/hub/src/features/actors/HISTORY.md` on
  2026-09-15.

- **A border of one's own (2026-08-16) — done.** A section picks its own
  border style, which is the literal thing the phase above was asked for and
  answered with skins instead. A skin is a whole aesthetic — choosing `comic`
  for a heavy edge also brings a halftone, a radius and a hard shadow — where
  what was asked for composes with whatever skin is already worn; and it was
  not merely bundled but **unreachable**, since nothing in the style bag could
  make a section dashed. The same phase took the feature note's own "this list
  is a floor, not a ceiling" at its word: `masonry`, `progress` and `tabs`
  arrived — as layouts then, as two modes and a leaf kind now — and `neon`,
  `cutout` and `frame` joined the skins, each earning its place by a mechanism
  nothing else uses. Read
  `apps/hub/src/features/actors/CLAUDE.md` for what `progress` reads as a
  value (and that it inverts the title/description pair), why the border token
  is `--skin-border-style` rather than a write to Tailwind's own variable, and
  what `cutout` cost — `clip-path` clips overlay UI and focus rings alike,
  which is why the editor's card paints its face on a layer of its own and why
  every surface in the app now rings on the inside. Spec:
  `2026-08-16-a-border-of-ones-own-design.md`. The account named here moved
  to `apps/hub/src/features/actors/HISTORY.md` on 2026-09-15.

- **Blocks, then spaces, then dragging (2026-08-18) — the model, the renderer,
  the editor and the drag are all done.** A page was a flat array of sections
  whose `type` **welded arrangement to content** — `gallery` was a grid _of
  pictures_, `links` a list _of links_ — so heterogeneity was not merely
  unsupported but unrepresentable. A page is a recursive tree of **blocks**
  now: a **container** arranges its children in a mode, a **leaf** holds one
  piece of content, and **a section is a container at depth 0 that carries a
  name.**

  **The arrangement was then a FLOW for a week, and that was the second half of
  the same correction.** A container declared a track count and its children
  streamed into it declaring spans, which means there is no such thing as an
  empty place — so the shape somebody chose disappeared the moment their
  content stopped filling it. A section declares how many places it lays
  **across** now; children fill them row by row and the section grows downward;
  and **a place may be empty, keeps its width, and draws nothing.** Collapsing
  it was refused deliberately, because a space count that means nothing
  whenever a section is partly filled is a shape that changes under its author
  as they work.

  Read `apps/hub/src/features/actors/CLAUDE.md` before touching any of it — it
  carries the container modes, the leaf kinds, and **the table saying where
  every old `type` went**, which is the thing to check before concluding that
  `gallery` was dropped. Nothing was.

  The parts worth knowing before reading the code:

  - **Depth is capped at three and the DATABASE enforces it**, with an explicit
    counter passed down `validate_block`'s own recursion. `sections` is
    user-controlled `jsonb`, so an unbounded recursive validator is a stack
    somebody else chooses the depth of; a cap in the editor is a suggestion.
    Both sides also refuse a too-deep tree **by name**, because a container one
    level too far is otherwise refused for naming a `kind` no leaf has — which
    tells somebody their block kind is invalid and their title is missing,
    neither of which they got wrong.
  - **A space is a WIDTH and never a capacity, which is what makes narrowing
    safe.** `spaces` says how many places a container lays across; `children`
    is what is in them; the two are not tied, so narrowing a six-space section
    to two re-wraps six things into three rows with all six still there and in
    order. Nothing is displaced, so nothing needs rescuing — and
    `patchContainer` takes `Partial<Omit<ContainerBlock, "kind" | "children">>`,
    which makes the clamp somebody would add in good faith **impossible to
    express through the function the control uses.** A type saying it cannot
    be written tomorrow is stronger than a test saying it is absent today.
  - **Content adapts to its parent, not to the window.** Every responsive rule
    inside a block is a container query, and a viewport breakpoint here is the
    **wrong tool rather than a weaker one**: a card in one place of a
    three-space section is about a third of the page wide while every `sm:`
    rule inside it believes it has the whole screen, and the error worsens with
    depth. It needed no library and no client boundary either — `@container` is
    native CSS, so these renderers stay server components.
  - **Free positioning — coordinates on a canvas — is refused, and the refusal
    is hard to walk back once shipped.** It cannot degrade to a narrow
    viewport; it makes the editor close to unusable on a phone, which is where
    most people will build; and it is how the pages this product is inspired by
    became unreadable.
  - **`columns` was a mode and was removed before anything could store one**,
    for a reason worth reusing: three consecutive tasks wrote down three
    different meanings for it. See rule 15 below.
  - **There are THREE stored page shapes, and the third is a migration with a
    deletion condition.** Flat sections; blocks carrying `spaces`; and, for
    about a day, blocks carrying `columns`, written by the save boundary `#158`
    shipped. `withSpacesFromColumns` reads the third on the lenient path only,
    because stripping the key it does not know turned a three-across gallery
    into one full-width column and the next save stored that. The feature note
    carries the rest, including when it may be deleted and why nothing can tell
    you that.

  **The editor composes blocks now** — `block-editor.tsx`, `block-card.tsx`
  and `leaf-editor.tsx`, with the flat editor deleted. Somebody chooses a
  section's shape, fills a place with content or with another section to the
  cap of three, picks a content kind, edits only the fields that kind draws,
  removes what is there, and sees the section drawn by the renderer a
  stranger's page uses rather than by a preview that could drift from it.

  **Dragging is written, and `@hello-pangea/dnd` is gone (corrected
  2026-09-01).** `moveBlock` can exchange anything with any place the model
  admits, but the recursive inspector deliberately offers only the visible
  siblings in its current Items scope, by mouse and by keyboard.
  `@dnd-kit/core` + `@dnd-kit/sortable` replaced the old library because the old
  library's own README rules out dragging from a parent list into a child one
  and rules out grids separately, and this model is nested grids and nothing
  else. Measured on what each is actually imported for: 13.9 kB min+gzip
  against 28.5 kB, so the migration is a net reduction as the spike said,
  though not at the numbers it quoted.

  **A drop is an exchange of two places, and the flow semantics a list would
  give you were refused rather than overlooked.** Insert here and everything
  after slides along — which assumes the gaps between things mean nothing, and
  here they are the author's. A place is positional and an empty one keeps its
  width, so sliding the row along to make room would move the empty places
  somebody deliberately left, which is the one thing a rearrangement must not
  do to a shape they chose. Onto an empty place is a move, onto an occupied one
  a swap, and the top level shifts because the page's own list has no empty
  entries and cannot hold one. If swapping ever feels wrong in use, the fix is
  a ruling rather than a change to the model — the positions are stored either
  way.

  **Corrected 2026-09-04: that refusal held everywhere until the Carrd-style
  page builder, and now holds only for POSITIONAL modes.** `stack`, `list`
  and `timeline` insert-and-shift now, through `domain/block-drops.ts`'s
  `applyLinearDrop` and `LINEAR_MODES` — see
  `apps/hub/src/features/actors/CLAUDE.md`'s dragging section for the
  mechanism. The reasoning above is unchanged and still current for `grid`,
  `masonry`, `carousel`, `tabs` and `accordion`, where a place is still
  positional and shifting one would still move a shape somebody deliberately
  left. That dragging section moved to
  `apps/hub/src/features/actors/HISTORY.md` on 2026-09-15.

  Two domain boundaries carry the current design. `moveBlock`
  (`domain/block-moves.ts`) still decides what any valid exchange MEANS, with
  no library in sight; `moveSiblingBlock` admits that operation only when both
  paths share one parent. The inspector applies that sibling rule in pointer
  collision, keyboard navigation and final drop handling, so a stale synthetic
  target cannot recover the withdrawn cross-level gesture.

  **Sibling dragging is driven both ways in a browser.**
  `section-drag-reorder.spec.ts` reorders top-level siblings by keyboard,
  exchanges nested sibling places by keyboard, and exchanges them by pointer
  while proving the grip's following click did not enter either row. Broader
  cross-level, cycle, depth and plane semantics remain domain proofs for
  `moveBlock`; the recursive inspector no longer offers those gestures.
  `block-drag.spec.ts`, whose browser cases all depended on those withdrawn
  cross-level gestures, is deleted; its surviving browser-level pointer proof
  lives in `section-drag-reorder.spec.ts`, while `block-moves.test.ts` and
  `block-drag.test.ts` retain the domain semantics.

  **The drag fixtures are shaped by a trap rather than by taste.**
  They are the "a case that passed because both orderings landed identically"
  shape.
  A swap and an insert-and-shift leave two ADJACENT places reading the same
  thing, so the swap is asserted across a place that is not adjacent to its
  source; and a shift and a swap leave the same page when there are only two
  authored sections, so the reorder gets three. Each was verified by making
  the code do the other thing and watching it go red. Rule 27 is that trap
  written out, along with the third instance the same phase found and the one
  case where no fixture could have discriminated at all.

  **The cycle guard is checked in BOTH directions**, and only one of the two is
  the easy miss. An exchange moves the target as well as the source, so
  dropping a block onto its own ancestor is the same fault mirrored — and
  neither can hang, because the writes are immutable and no reference cycle can
  form: what forms is a duplicated subtree that the other half of the exchange
  then deletes, which is a section silently lost. `moveBlock` answers this and
  every other bad drop rather than throwing, because a refused drop is an
  ordinary outcome of dragging and the person is owed a sentence.

  The feature note carries the rest — the plane rule that keeps a nested block
  from being swapped with a whole section, what each of the three refusals says
  and which input can reach it, why a no-op comes back as the very array it was
  given, why every grip in the editor comes from one component, and the
  hydration mismatch dnd-kit's module-level id counter causes on every request
  after the first unless the context is given a `useId()`.

  Specs: `docs/superpowers/specs/2026-08-18-sections-of-spaces-design.md`,
  complete and the current word on the model;
  `docs/superpowers/specs/2026-08-18-dragging-design.md`, complete, and where
  the traps, the corrected bundle measurement and what dragging still owes are
  written down; and
  `docs/superpowers/specs/2026-08-17-blocks-and-grids-design.md`, which the
  first of those supersedes on tracks and spans and which still describes them.
  Its banner is what to read before anything under it: it is kept current, and
  the body is left as delivered. **Do not take that arrangement on trust** —
  the banner spent a day claiming phases 3–5 were unwritten and that the
  dnd-kit findings were "still what phase 4 inherits", after this branch had
  closed them, and this bullet vouched for it. A banner is only a banner while
  somebody updates it; whoever closes one of a superseded spec's phases updates
  the banner in the same change.
  Plans: `docs/superpowers/plans/2026-08-18-dragging.md`,
  `docs/superpowers/plans/2026-08-18-sections-of-spaces.md` and
  `docs/superpowers/plans/2026-08-17-blocks-and-grids-phase-1-model-and-renderer.md`.

- **Weighted places (2026-08-19) — done.** A section's places need not all be
  the same width: a container may declare `weights`, one whole share per place,
  so `[1, 3, 1]` is a narrow side, a wide middle and a narrow side. **The
  number is on the PARENT and that is the whole structural decision** — a drop
  is an exchange of two places, and an exchange between a two-wide place and a
  one-wide one has no meaning, which is why `span` was removed and why this is
  not `span` returning under a new name. `moveBlock` is untouched.

  It also closes a sentence in the feature note that was **false when
  written**: that a wide thing was a nested container of one space. Nesting can
  make something narrower and can never make anything wider, so the page this
  feature exists for was not unbuilt, it was unrepresentable.

  Two mechanisms are worth knowing before touching it, and the feature note
  carries the rest. **The class keeps the container query and the property
  carries the tracks** — weights are author data out of `jsonb`, so no build
  step can generate a class for them, while an inline `grid-template-columns`
  would carry no query and flatten the collapse every narrow screen depends on;
  the uniform list is the `var()` FALLBACK, so an unweighted page emits what it
  always did with no branch anywhere. And **every weighted track is floored at
  `8rem`**, which is what makes a lopsided ratio even out when there is little
  room and assert itself as the container grows. Only `grid` spends weights;
  the database stores them for every mode on purpose, so flipping to `carousel`
  to look and flipping back does not lose somebody's shape.

  Spec: `docs/superpowers/specs/2026-08-19-weighted-places-design.md`, complete,
  and where the measured threshold widths live. Plan:
  `docs/superpowers/plans/2026-08-19-weighted-places.md`, whose own corrections
  banner is the one to read first — three of its instructions were wrong and
  each was measured wrong rather than argued wrong. Rule 29 above is what the
  branch cost.

- **A page of one's own (2026-08-19) — done.** The last three pieces of
  furniture the app rendered on somebody's public page are gone: the identity
  header, the fursona list and the page's width. A public page is now entirely
  its owner's tree, and **nothing the app owns renders inside `SKIN_SCOPE`
  there any more.**

  Five leaf kinds — `avatar`, `handle`, `name`, `owner`, `fursonas` — draw the
  ACTOR rather than what somebody typed, which is a new CATEGORY in the model
  rather than five more entries. Read
  `apps/hub/src/features/actors/CLAUDE.md` before touching any of it. The
  account named here moved to `apps/hub/src/features/actors/HISTORY.md` on
  2026-09-15. The parts worth knowing first:

  - **A fursona's page shows its owner, and that is new content.**
    `public_fursona` resolved `owner_address` for the canonical URL and never
    rendered it, so a stranger arriving from a shared link had no way back.
    The owner's NAME and PORTRAIT are gated on that person's own profile being
    readable — a fursona's page is governed by the fursona's visibility, so a
    public character routinely belongs to somebody whose profile 404s. The
    gate is in `0012`, never in a renderer.
  - **A page must carry at least one of each required kind**, enforced in the
    database, at the save boundary and in the editor. **The guarantee is that
    the block EXISTS, not that a visitor sees it** — a required block inside a
    collapsed `accordion` satisfies every layer and shows nothing, and
    `tests/db/blocks.test.ts` asserts that hole is open as a passing case so
    nobody reads the enforcement and concludes otherwise. Putting the
    ownership fact in un-styleable chrome was weighed and declined: every part
    of the page belongs to its owner.
  - **Absence means the default POSITION, not deletion**, which is why no
    stored page needed migrating and why the rule cannot be defeated by
    stripping the blocks: `withRequiredBlocks` puts them back on every read.
  - **A page chooses its own width**, six named stops from the reading measure
    out to `full`, and **a section may independently opt out of width and page
    chrome**. `bleed` reaches both edges; `margins: false` removes that
    depth-0 section's side gutter and first/between/last spacing. The full
    `PageShell` owns none of that spacing and the parent owns no gap, so a first
    bled section without margins is an ordinary banner and a genuinely last
    one is an ordinary footer. The measure remains per SECTION; `w-screen` is
    refused because `100vw` counts the scrollbar a centred column does not.
  - **The theme switch is in the bar** and the light/dark toggle's question
    mark is gone — it clears the author's theme as well as setting a default,
    so the press always changes something a visitor can see.

  **Three faults shipped with it and were found only when the branch's own
  browser suite was run with credentials, which is the part worth carrying.**
  The plan closed, every local gate was green, and `e2e` — a REQUIRED check —
  had never actually run the half of itself that needs Clerk, because
  `global-setup.ts` skips those suites without a key and the branch was
  verified on a machine that had not exported one. All three were in the
  headline features:

  - **Both public routes asked the shell for `width="wide"`**, so the
    per-section measure was laid inside a centred, padded `max-w-7xl` column:
    a doubled gutter, the two widest stops capped at 80rem, and a `bleed`
    section unable to reach either edge. `COLUMN.full` existed, was documented
    for exactly this, and had no caller. See rule 30.
  - **`set_actor_theme` had never heard of `measure`**, whose allowlist ends in
    `unknown theme key` — so picking a width made the whole theme save throw.
    Fixed in `0009`, hand-applied to live, and pinned by `tests/db/actor-theme.test.ts`.
  - **`fursonas.fursonas` was in neither catalogue**, so three editor routes
    drew their own key path where a heading belonged. They read
    `publicProfile.fursonas` now — the same string the public page uses, so the
    preview cannot disagree with the page — and
    `apps/hub/tests/message-keys-exist.test.ts` reads the SOURCE for every
    literal key asked of a literal namespace, which is the first guard here
    that can catch a hand-written key rather than a generated one.

  - **A fursona built by hand could not be saved AT ALL.** `readActorPage`
    answers `withRequiredBlocks([], kind)` for an actor with nothing stored,
    but the CREATE page has no actor to read yet and `FursonaEditor` defaulted
    to `[]` — a tree `set_actor_sections` refuses for naming no `avatar`,
    `handle` or `owner`. So Save produced "your sections were refused" on a
    page whose author had done nothing wrong, and only the template path
    worked, because applying one runs the shim. The default is the shim's
    output now. Seeding it made every page non-empty, which broke the template
    picker's confirmation the other way — that gate asked "are there any
    sections" and now asks `holdsNothingAuthored`, which is the question it
    always meant.

  A fifth thing was owed rather than broken: **every page fixture must now
  carry the required blocks**, so `seedPage` appends an identity section to
  every tree it writes and the specs that count sections say
  `+ SEEDED_IDENTITY_SECTIONS` rather than a bare number. Two spec-level traps
  came with it and are worth knowing before writing another editor test: the
  card a test builds is the LAST one, because the identity section opens first
  and `add-section` appends; and a page-wide locator for `nested-card` or
  `block-grid` now matches the identity section too, so those have to be
  scoped to the section under test.

  Spec: `docs/superpowers/specs/2026-08-19-a-page-of-ones-own-design.md`,
  complete. Plan: `docs/superpowers/plans/2026-08-19-a-page-of-ones-own.md`,
  whose corrections banner is the one to read first — six of its instructions
  were wrong, and the two worth carrying are that a leaf CANNOT have no fields
  (`title_en` is required everywhere) and that the vocabulary and the
  renderers cannot land separately, because `satisfies Record<LeafKind, …>`
  refuses to compile.

- **The editor wears the page (2026-08-27) — done, and it replaces the three
  bullets that were here.** They described the builder borrowing the page's
  atmosphere (2026-08-24), the preview learning to show what is BEHIND a page
  (2026-08-25), and the complete preview becoming a route in an iframe
  (2026-08-26). Each was a step toward the same thing and each is superseded;
  `git log` holds their measurements, and both specs carry a banner naming this
  one.

  **The inversion.** The editor used to own its document and contain each
  preview in a box. It mounts `ThemeScope` with the live draft now — the same
  component a public route mounts with a stored theme — so `:root` carries the
  author's palette, `body` paints their field and background picture, and the
  `NebulaCanvas` in the root layout is theirs. Every control is an island
  wearing `CHROME_SCOPE`, which re-declares AeleOS's tokens on the island
  itself; there is no cascade fight, because the cascade only compares
  declarations on the same element.

  **The canvas is why no arrangement of boxes could ever have worked.** It is
  `fixed inset-0 -z-10`, so anything an in-flow preview paints is in front of
  it. What is behind a page has to be behind the DOCUMENT — which is also why
  the iframe existed, and why it stopped being needed the moment the editor
  stopped containing the theme.

  **Hiding the controls leaves the page, and that is the whole feature.** One
  rule removes every `CHROME_SCOPE` island — hiding by CLASS, so a control
  added tomorrow is hidden without anybody remembering — and a second flattens
  the editor's own stacking, because `PublicBlocks` has no gaps between
  sections and lets `pageBoxClass` own every margin. What is left is not a
  picture of the published page; it is the same document, viewport, scroll,
  `body` and canvas.

  `editor-is-the-page.spec.ts` is what makes that a measurement rather than a
  claim: one seeded page photographed twice, at seven widths straddling the
  measured container-query thresholds. Its two halves catch different faults
  and neither substitutes for the other — sabotaging the stack-flattening rule
  reddens all four pixel cases between 40.2% and 46.1% and not one box case,
  because the sections are the same size and simply at a different offset.

  **A workbench group must be OPAQUE, and that is a guarantee rather than a
  measurement.** What is behind a control is now a colour the author chose, and
  they may choose any colour — so a translucent control has no guaranteed
  contrast and nothing can give it one. The toolbar takes `--menu`, the one
  token declared opaque in both modes.

  `frame-ancestors` closed back to `'none'`: the 2026-08-26 widening had
  exactly one beneficiary and it is gone.

  Read `apps/hub/src/features/actors/CLAUDE.md` before touching any of it —
  and note that it now opens with a standing rule requiring it to be re-read
  against every change made inside that folder, because `check:docs` is per
  exported symbol and structurally cannot see a feature note going stale.

  Spec: `docs/superpowers/specs/2026-08-27-the-editor-wears-the-page-design.md`.
  Plan: `docs/superpowers/plans/2026-08-27-the-editor-wears-the-page.md`.

- **The editor is canvas-first (corrected 2026-09-01).** This is a UI migration over
  the editor above, not a replacement for its functions or document. The live
  page is the canvas; selecting it or one of its positional
  `data-block-path`s opens a hideable recursive inspector. `BlockCard`,
  `LeafEditor`, `BlockSlot`, `moveBlock`, nested add, style controls, identity,
  theme, templates, presets, the JSON dock and hide-controls Preview remain
  the same mechanisms.

  Nothing starts selected. Page and containers offer Items and Options; Items
  lists only immediate positions, including empty ones, and Options mounts only
  the selected target. A leaf opens Options directly. Back and breadcrumbs
  derive from `BlockPath`, deleted selections persistently repair to the nearest
  surviving ancestor, and only the visible siblings in one Items scope may be
  dragged. A leaf added at page level is wrapped in an unnamed one-place stack
  so depth 0 remains containers; no stored schema changed.

  Spec:
  `docs/superpowers/specs/2026-09-01-recursive-inspector-drill-down-design.md`.
  Plan:
  `docs/superpowers/plans/2026-08-31-canvas-inspector-builder.md`.

- **Carrd-style builder migration — PARTIAL CHECKPOINT (2026-09-04).** The
  approved design supersedes the recursive Items list and sibling-only drag
  surface while preserving the stored document and public renderer. The first
  slice is implemented: the live renderer accepts editor-only instrumentation,
  selected blocks expose accessible grips, and direct canvas drops insert in
  `stack`/`list`/`timeline` while positional layouts keep place semantics.
  Public pages, Preview and interact mode omit the instrumentation.

  The compact builder menu, focused Properties panel, unified Add placement,
  removal of superseded inspector paths and full browser/picture proof are
  deliberately NOT complete in this checkpoint. Continue from
  `docs/superpowers/specs/2026-09-04-carrd-style-page-builder-design.md`;
  `apps/hub/src/features/actors/CLAUDE.md` owns the implementation details.
  The account named here moved to
  `apps/hub/src/features/actors/HISTORY.md` on 2026-09-15.

- **Editor interaction, adding and motion — DESIGNED, NOT BUILT
  (2026-09-02).** Page links, players and embeds are real inside the canvas
  today, so a click meant to select a block can act on its content. The
  approved design makes interaction safe by default while controls show, adds
  an explicit session-only **Interact with page** switch, makes hide-controls
  Preview interactive, and resets to locked whenever controls return. The
  boundary is editor-only and leaves the public renderer untouched.

  **Adding becomes one control at every scope, and the premise that sent it
  there was wrong in the instructive direction.** Nesting a section inside a
  section was reported as removed by the recursive inspector and is not:
  `add-nested` is offered on an EMPTY place and nowhere else, so a section
  whose places are full has no route to it, which is indistinguishable from a
  deleted feature. `mayNest` and `MAX_DEPTH` never moved. The fix is
  uniformity — every scope that admits a block gets one Add button opening a
  picker whose options are drawn by the REAL renderer with fixed sample
  content, replacing the flat row of sixteen leaf-kind buttons that made an
  author add a block to find out what it was.

  **An animation library is adopted after all, and the first version of this
  bullet said the opposite.** Motion for React (`motion`), as `LazyMotion`
  plus `m`, with one `MotionConfig reducedMotion="user"` at the editor root.
  What decided it against `@formkit/auto-animate`, which is smaller and
  handles lists automatically, is that the list in question is `@dnd-kit`'s:
  two libraries writing `transform` on one element is this repository's own
  cascade fight arriving through a dependency. So the standing rule is that
  Motion renders only inside `CHROME_SCOPE`, is never a dnd-kit draggable or
  an ancestor writing its transform, and does not use layout animation —
  because Motion writes INLINE styles, which beat every layered utility
  unconditionally. There is no shadcn installation to be compatible with
  (`components.json`, Radix, `class-variance-authority` and
  `tailwindcss-animate` are all absent; the `cn` helper is the convention, not
  the library), and Motion generates no classes, so nothing in Tailwind
  contends with it. Its cost is measured against the build and the `canvas`
  budget before it is kept. Spec:
  `docs/superpowers/specs/2026-09-02-editor-interaction-and-motion-design.md`.
  Plan:
  `docs/superpowers/plans/2026-09-02-editor-interaction-and-motion.md`.
  One agent runs that plan end to end on `editor-interaction-motion`; it is
  not a queue of subagent tasks.

- **A page has a source (2026-08-28) — done.** The editor carries a live,
  two-way JSON dock: a page can be inspected, copied out, pasted
  in, and authored by a language model against a reference the dock publishes.
  The document is `{ aeleos, theme, blocks }` — the two `jsonb` columns of
  `actor_profiles` and nothing from `actors`, so an imported page renders with
  the importer's own portrait and name and **a template and somebody's real
  page are the same artefact**. `visibility` is excluded on a safety argument
  rather than a tidiness one: a document carrying it would publish a page by
  paste.

  Two findings came out of DESIGNING it, before a line was written, and both
  are recorded rather than left in the branch. Rule 37 below is the first. The
  second is a bug: **the leaf-kind select offers every kind on every page**,
  so a person can pick `owner` on `/me/edit` and `set_actor_sections` refuses
  the save with no block marked — and `identity-leaves.tsx` documents that
  state as _"unreachable through the editor"_. The write half of that sentence
  is true and the reachability half was false. It is fixed on this branch,
  because its fix is the constant the import path needed anyway.

  **Task 3 (the document envelope, export and parse) landed, and its own
  review found the spec's paste-safety section understated itself.** The
  design said the `__proto__`/`constructor` guards were "believed clean" and
  measured parser depth without noticing the call it measures is not the call
  the code makes. Both are corrected now: a `JSON.parse` reviver refuses all
  three unsafe keys, sabotage-verified rather than believed, reported as its
  own `unsafe-key` problem; and the reviver's own recursive invocation has a
  real, much lower depth ceiling than a bare parse — 857, measured
  2026-08-27, reachable inside `PASTE_LIMIT_BYTES` — caught as an ordinary
  `syntax` problem rather than an uncaught `RangeError`, since `RangeError` is
  an `Error`. See `page-document.ts` and
  `apps/hub/src/features/actors/CLAUDE.md` for the numbers. The account
  named here moved to `apps/hub/src/features/actors/HISTORY.md` on
  2026-09-15.

  **Task 7 wired it in (2026-08-28) — the dock is reachable by a person for
  the first time.** A `Braces` control in the editor toolbar opens it;
  `FursonaEditor` holds the open/closed state and mounts a small isolated
  component, `PageSourceField`, that watches `sections` itself so the dock's
  own live binding never re-renders the toolbar on every keystroke in a leaf
  — see `apps/hub/src/features/actors/CLAUDE.md` for why that isolation is
  load-bearing rather than tidiness. The hand check this task's brief asked
  for found three real bugs in the dock's own class list, all invisible to
  every suite that existed before it because they are about `<dialog>`'s
  user-agent stylesheet, which jsdom implements none of: an unconditional
  `flex` beat the UA's `dialog:not([open]) { display: none }`, so the dock
  was visible on every page before anyone pressed the control that opens it;
  the UA's own `left: 0` over-constrained the box against this component's
  `right: 0`, pinning it to the wrong edge; and the UA's `height:
fit-content` (not `auto`) kept it from ever reaching the foot of the
  viewport. Fixed and sabotage-verified in
  `apps/hub/tests/e2e/page-source-dock.spec.ts`, which Task 8 extends rather
  than creates — its plan step still says "Create," and that instruction is
  stale the moment this lands. The account named here moved to
  `apps/hub/src/features/actors/HISTORY.md` on 2026-09-15.

  **Review round 1 found two more.** The full `pnpm --filter hub test:e2e`
  suite had never actually been run against this wiring — only the one new
  spec had — and `editor-toolbar.tsx`'s new button is exactly what
  `responsive.spec.ts` exists to catch at portrait 320; run in full, 165
  cases passed and none skipped, `responsive.spec.ts` included. The other two
  were real gaps rather than a missing run: the dock mounted unconditionally
  alongside the toolbar, so `usePageSource`'s full-page `toDocument` effect
  fired on every keystroke for an author who never opened it — closed now by
  gating `PageSourceField`'s very existence on having been opened once,
  proved by DOM absence rather than by a timing measurement; and `apply`'s
  `if (nextTheme)` guard, the one branch standing between a stray paste and a
  reset author palette, was wired correctly and reached by nothing — every
  e2e case pastes a document round-tripped through `toDocument`, which always
  carries a `theme` key. Both are pinned in `fursona-editor.test.tsx` now, see
  `apps/hub/src/features/actors/CLAUDE.md` for the account in full. The
  account named here moved to `apps/hub/src/features/actors/HISTORY.md` on
  2026-09-15.

  **Task 8 pointed a real axe scan at the dock OPEN for the first time and
  found two more, both structural rather than corner cases.** The resize grip
  was `role="separator"` with `tabIndex={0}` and no `aria-valuenow` — the APG's
  window-splitter is a FOCUSABLE separator, which is a value widget and owes a
  value — and the reference panel's copy button sat INSIDE `<summary>`, which
  is itself the control that toggles the `<details>`, so it was a
  `nested-interactive` failure of the same class as a link inside a link. The
  button is `<summary>`'s sibling now, positioned over it, because `<summary>`
  must stay a direct child for the native disclosure to work at all.

  **The same new case surfaced a third fault a layer down, and it is the one
  that had the widest blast radius.** `/pages/new` never called
  `ensurePersonActor()` — `/me`, `/me/edit`, `/pages` and `/picker` all did —
  so a person arriving on their genuinely first click, which is the route this
  app hands a brand-new sign-in to from Puck or Libra, got an `owner` block
  with no text and a real `link-name` violation. Its regression test uses its
  OWN fresh identity, because the file's shared one is already provisioned by
  an earlier case: the shared identity is exactly why nothing caught this.

  **And the branch's own closing sweep found a FOURTH copy of a false sentence
  it had already fixed three times.** "`table` is the only kind that reads
  `rows`" is false — `player` and `jukebox` read it as their playlist — and
  after the TSDoc, the generated reference and `text-leaves.tsx` were each
  corrected in turn, the claim was still sitting in
  `0009_actor_profiles.sql`'s `is_block_kind`, **sixteen lines below that same
  file's comment saying `player` and `jukebox` both read `rows`.** Three
  rounds had each grepped the TypeScript and stopped there. Two things
  generalise: **grep the whole repository for a false claim rather than the
  language you happen to be working in**, since a model written down in
  TypeScript and in SQL has two places to be wrong and `check:docs` reads only
  one of them; and **a comment inside a function body is `prosrc`**, so
  correcting one is an edit to an applied migration and was hand-applied to
  live with `check:schema-drift` re-run green either side of it.

  Spec: `docs/superpowers/specs/2026-08-27-page-source-and-sharing-design.md`.
  Plan: `docs/superpowers/plans/2026-08-27-page-source-and-sharing.md`.

- **A block may hide its own title as a label (2026-08-29).** `label`
  (`"show"` / `"hidden"`) on a block's style bag closes gap 16 of the pastiche
  findings — `AvatarLeaf`, `HandleLeaf`, `NameLeaf` and `OwnerLeaf` each draw
  an optional label above their own value with no way to turn it off, so a
  page stacking them at the top, as the required-blocks shim arranges them,
  reads as a column of label-value pairs rather than one identity.

  **`hidden` composes with the enclosing mode's own suppression by narrowing
  it, never widening it.** `showsLabel`
  (`apps/hub/src/features/actors/presentation/block-contract.ts`) is the one
  place the two meet: `labelled && style?.label !== "hidden"`. A `tabs` or
  `accordion` panel that has already shown a leaf's title elsewhere
  (`labelled: false`) stays that way whatever the block's own key says —
  `label: "show"` cannot put a title back where the mode has already drawn
  it. Absent (or `"show"`) is exactly what `labelled` alone always meant, so
  no stored page, template or author's page changes.

  Reached by the four identity leaves and by `PlainLeaf` — the `text` kind and
  the fallback every unrecognised kind lands on — through the one shared
  function; no other leaf kind reads it. Pinned like every other closed
  vocabulary written down twice: `block-limits-match-migration.test.ts`
  compares `BLOCK_STYLE_LIMITS.label` against `0009`'s own `elsif v_key =
'label'` branch, added beside `chrome`'s in `validate_block` in the same
  shape, with the column comment and `STYLE_KEY_MEANINGS` updated in the same
  change. See `apps/hub/src/features/actors/CLAUDE.md` for the account in
  full. The account named here moved to
  `apps/hub/src/features/actors/HISTORY.md` on 2026-09-15.

  **Applied across the eleven seeded social pages the same day, and the rule
  is: an identity label says what the thing is called on the site being
  imitated, and is hidden where that site shows no label at all.** The five
  era looks are generated picker templates and were correctly left alone —
  they still render `handle="Handle"` and `owner="Owner"`. That
  turns "should this page show a label here" from taste into a question
  about the capture already sitting in `scripts/pastiche-pages.mjs`'s own
  comments. Three findings fell out, checked page by page rather than
  assumed:

  - **`name` is hidden on every page that has one.** Its title always
    restates `displayName` verbatim (`"Aeleos"` over `"Aeleos"`, `"aeleos"`
    over `"aeleos"`), and no captured site ever captions a display name with
    the word "Name" — it is only ever shown once. That is true independent
    of era: MySpace's and Fur Affinity's own dense labelled UIs still never
    label a NAME field, which is what makes this the one leaf hidden
    everywhere rather than judged per page.
  - **`owner` is hidden on ten of the eleven social pages.** It names a
    person behind the fursona — an AeleOS concept with no equivalent on any
    of these sites — so the rule hides it by default. Fotolog is the one
    keep: `"Este Fotolog es de"` is the site's own guestbook convention, not
    an invented label, so it stays exactly as it already read.
  - **`handle` is a real per-page judgement, not a blanket move.** MySpace,
    hi5, Sonico, GeoCities, Fur Affinity, Fotolog and Messenger each show
    enough of a labelled-panel convention on their own capture to keep the
    word already chosen — a dense box-and-table UI, a properties-style info
    card. The board, Bluesky and Threads are live, unlabelled modern
    profiles; Facebook's `"Profile ID"` names a fact the real 2008 page
    never printed anywhere on itself, the numeric id having lived in the
    address bar alone — those four are hidden.

  **`avatar`'s title is untouched everywhere.** It is alt text rather than a
  visible label — `AvatarLeaf` never draws a `<Label>` at all — so this gap,
  which is about what RENDERS, has nothing to say about it; hiding it would
  only have deleted a screen reader's one source for whose portrait this is,
  for no visual gain.

  **The Threads page is gap 16's own worked example, and hiding the label
  was not the whole fix.** Its header comment already named the fault by
  hand — "aeleos" appearing three times, the section name, the name leaf's
  value and the handle leaf's label — and hiding the LABEL only silenced the
  third repeat: the page still rendered "aeleos" (the section heading),
  "aeleos" (the name, unlabelled) and "threads" (the handle, unlabelled),
  and the first two are the same word, adjacent, because nothing about a
  leaf's own caption touches a CONTAINER's `name_en`. That half is closed
  now too (same day): the section's own heading duplicated an identity
  leaf's value on seven of the sixteen pages — `messenger`, `board`, `sky`,
  `threads`, `hi5`, `sonico` and `facebook` — found by deriving what each
  page renders top to bottom rather than by reading the style bag. Each was
  resolved per page, judged against its own capture note, by dropping
  whichever of the two — the section's heading or the leaf's value — is not
  the authentic line: Messenger, hi5 and Sonico keep a genuinely captured
  title-bar convention and lose the redundant `name` leaf (`name` is
  optional, never in `REQUIRED_KINDS`); the board, Bluesky, Threads and
  Facebook have no such convention on their real subject, so the section's
  invented heading goes (an unnamed `group` in place of a named `section`)
  and the leaf is what a stranger reads. Threads now renders "aeleos" (the
  name, unlabelled) then "threads" (the handle, unlabelled) — no two
  adjacent lines say the same word.

  **What this does not settle, on purpose.** Whether the four identity
  leaves belong in one composed block rather than four independent ones is
  untouched — hiding a caption, and choosing which of a section's heading or
  a leaf's value survives, are both per-instance fixes rather than a
  mechanism that makes the four read as a single unit, and they still know
  nothing of each other. And "what should a handle's title say" still has no
  shared convention across the eleven; this closes only whether a title is
  ever SHOWN on a given page, not what it should read when it is. Findings:
  `docs/superpowers/specs/2026-08-27-pastiche-findings.md`, gap 16.

  **A blocking review defect, and then a second one the fix itself
  introduced, both closed the same day (2026-08-30).** The "Own title"
  select this key rides in on offered itself on every container, whatever
  kind it held: `showsLabel` composes `style.label` for exactly five leaf
  kinds — the four identity leaves and `PlainLeaf` (`text`) — and no
  container ever reads it (a container's own name draws from `labelled`
  alone, `blocks.tsx`). The first fix added a `honoursLabel(kind)` helper and
  a `SectionStylePopup` prop gating the select on it. **That gate was `false`
  by construction, not merely narrow**: `SectionStylePopup` only ever opens
  for a `ContainerBlock` — `block-card.tsx` is its only caller — and a
  container's `kind` is always the literal `"container"`, never one of the
  five. So the control went from _visibly doing nothing_ to _unreachable by
  construction_, which is still wrong, just wrong where nobody could trigger
  it by clicking around. It was removed rather than reworked into something
  that opens for a leaf — that is `leaf-editor.tsx`'s job — along with
  `honoursLabel` and its two catalogue strings, from both `en.json` and
  `es.json`. `label` itself is untouched and still reachable, just not
  through this popup: an author reaches it through the page source dock
  (`page-document.ts`), which validates a pasted `blocks` array through the
  same schema this key lives in. See
  `apps/hub/src/features/actors/CLAUDE.md` for the account in full, and
  `domain/block-schema.ts`'s TSDoc on `label` for where the two paths — the
  one that's gone and the one that was never touched — are told apart. The
  account named here moved to `apps/hub/src/features/actors/HISTORY.md` on
  2026-09-15.

- **A portrait's size, apart from the text beside it (2026-08-30).** `portrait`
  (`"s" | "m" | "l"`) on `AvatarLeaf`'s own style bag closes an asymmetry that
  sat beside `label`'s the whole time: `HandleLeaf`/`NameLeaf` are
  `em`-relative and scale with a page's `spacing`, where the portrait stayed a
  fixed `size-24` regardless. Absent and `"m"` both render exactly `size-24`;
  `s` is `size-12`, already the size a fursona's own avatar draws at
  elsewhere on the same page; `l` is `size-32`, the largest that still fits
  `TRACK_FLOOR` — the narrowest place the block model ever lays out — without
  guaranteeing horizontal overflow.

  **Read directly off the LEAF's own style, unlike `image_fit`, and that is a
  deliberate difference rather than an inconsistency.** `image_fit` is
  emitted as a token, `--img-fit`, which inherits — safe for a CROP, which a
  container may reasonably want for every picture beneath it. A SIZE is not:
  a container setting a bigger portrait would silently resize any avatar
  nested anywhere beneath it, on a page that never touched that leaf. So
  `portrait` skips the token mechanism and reads `leaf.style?.portrait`
  directly, the same shape `showsLabel` already reads `leaf.style?.label`
  through — which also settles reachability the same way `label`'s did:
  unreachable through `SectionStylePopup` (a container-typed popup has no
  leaf to read from) and through `leaf-editor.tsx` (no style-bag control
  exists there for any key today), reachable only through the page source
  dock. `OwnerLeaf`'s own inline avatar deliberately does not honour it — it
  is a small mark beside a link, not the page's own portrait, and has no size
  relationship to keep in step with one.

  It edits `validate_block` and the `actor_profiles.sections` column comment
  in `0009`, so it carries the same in-place-migration obligation every style
  key here does: hand-apply the new `portrait` branch of `validate_block` and
  the extended column comment to the live project, one pull request at a
  time, immediately before merge. See `apps/hub/src/features/actors/CLAUDE.md`
  for the account in full. The account named here moved to
  `apps/hub/src/features/actors/HISTORY.md` on 2026-09-15.

- **Editor interaction lock, one Add picker, and Motion for editor chrome
  (2026-09-02) — done.** The editor canvas is locked by default so a
  click selects a block rather than following a real link, with a
  session-only toolbar switch and Preview both able to make it interactive;
  every scope that can hold a block offers one Add picker, drawn with the
  real renderer over fixed sample content, replacing the flat add row and
  the HTML5 drag-to-add path it carried (removed deliberately, and may
  return later); and editor chrome — the inspector, its scope transitions,
  new inspector rows — carries restrained Motion (`LazyMotion` + `m`,
  `MotionConfig reducedMotion="user"`), never the public renderer, never a
  `@dnd-kit` node — a real review found the last of those three actually
  breached (the inspector's own root and Items-pane entrances wrote `x`/`y`
  while ancestors of the real draggable), fixed to opacity-only and pinned
  by a named regression case rather than left as a claim nothing checked.
  `motion` is a new dependency of `apps/hub` for this. See
  `apps/hub/src/features/actors/CLAUDE.md` for the full account, including
  the closed-out cost verification: the barrel COUPLING that carries Motion
  onto `/[locale]/[person]` and its fursona-page sibling is pre-existing,
  from before this work, but the +109KB of Motion itself on those routes is
  new, added by this branch — both true, neither collapsing into the other —
  and the owner's own ruling is to merge as-is with the barrel split
  deferred to a follow-up, the measured numbers left as its baseline. The
  `canvas` job's own throttled-page measurement, run with the full stack
  mounted, did not move (0.006 commits per delivered movement, the same
  reading this file's own toolchain section already treats as healthy) —
  the number that decides whether Motion stays, and it says keep it. The
  account named here moved to `apps/hub/src/features/actors/HISTORY.md` on
  2026-09-15.

- **Preview clears selection and edit mode scrolls only its canvas
  (2026-09-03) — done.** Hide controls unmounts the inspector before paint and
  clears its `BlockEditor`-owned selection, so Show controls cannot resurrect
  one; the inspector also has a direct Close at every depth, separate from
  parent-selecting Back. While controls show, the form fills the viewport below
  the app header and `editor-canvas` is the sole vertical scroller — the
  toolbar and the independently scrolling inspector stay put, while the Page
  control rides inside the canvas with the page it names. Preview
  removes that bound and returns scrolling to the document, the same owner the
  public page uses, with both transitions reset to the top. The renderer and
  page document remain one mechanism in both modes. A browser guard drives both
  `window` and the canvas at 1280 and 320 so “neither scrolls” cannot pass as
  canvas ownership. Spec:
  `docs/superpowers/specs/2026-09-03-editor-preview-selection-and-canvas-scroll-design.md`.

  **It shipped a visible fault, and the lesson generalises past this editor: a
  NEW SCROLL CONTAINER RE-BASES EVERY STICKY OFFSET INSIDE IT.** A sticky
  offset is measured from the scrollport, not from the viewport. The editor's
  toolbar had `top: var(--bar-top)` — right for as long as its scrollport was
  the document, whose first 56px the header occupies. Bounding the form made
  the FORM that scrollport, and the form already begins below the header, so
  the declaration counted the header twice: measured at 1280×900, header 0–56,
  bar 112–171, canvas top 277 — a 56px strip of the author's own page between
  the two bars, with everything below pushed down by the same amount. The bar
  is `top-0` now (bar 56–115, canvas top 245), and `--bar-top` is left to the
  inspector and the source dock, whose offsets are genuinely viewport-measured
  because both are `fixed`. The general question to ask when confining a
  scroll: **which boxes inside the new container declared an offset against
  the old one?**

  **It happened twice more, and the general question is wider than offsets:
  which decisions inside the new container were only invisible because it
  scrolled?** Measured at 1280×900, 80 of the 114px between the bar and the
  first section were reserved for things that rendered nothing — a page column
  holding `pt-6 sm:pt-10` for an error banner that returns null when there is
  nothing wrong, and a zero-height `div` of `<style>` elements that still cost
  its parent's `gap-4`. Both had scrolled away for as long as the document was
  the scroller. The column moved inside the banner so one null check governs
  both (it could not be gated at the call site: the banner's own rule is
  stricter than "there are errors"), and the stylesheet holder is
  `display: contents` so it is not a flex item at all.

  **Photographing that fix found the fault it was sitting beside, and it was
  the worse one: the save-refusal summary was BEHIND the inspector.** The
  panel is `fixed` and the canvas section pads itself to make room; the banner
  was a sibling of that section, so at 1280 its heading sat at x=41 with the
  panel's right edge at x=512 — unreadable in the normal case, since the
  inspector is open exactly when somebody presses Save. **A rect comparison
  would have passed**, because two boxes overlapping is not the claim and
  which one a person can read is; `elementFromPoint` is the only instrument
  that answers it, and no unit test can, which is why 3661 of them passed
  through it. This is rule 30's shape again — the guard has to consult the
  system that decides, and here that system is the compositor.

  **The guard for that bar passed through the whole fault, which is rule 27
  and not an oversight.** `editor-bars-stay-pinned.spec.ts` reads Save's own
  starting offset and asserts canvas scrolling never moves it — true of a bar
  under the header and equally true of one 56px lower, since both are outside
  the scroller and neither moves. **Pinned and in the right place are two
  claims**, and confining the scroll made the first one nearly free while
  silently breaking the second. The case that asks it compares the bar's top
  against the header's foot in both directions, and it must run TALL:
  `--bar-top` is `0px` under `@media (height <= 600px)`, so the faulty offset
  resolves to zero on a phone in landscape and the band cannot appear there —
  a short fixture would have passed against the exact code it exists to
  refuse.

  **A fourth instance closed it (2026-09-04), and it was the bar's own
  `mb-6`.** A margin on the bar is outside the scroller by construction, so
  24px of the author's backdrop sat under the chrome at every offset. The
  canvas begins exactly at the bar's foot now — both 115 at 1280×900 — and the
  breath above the Page pill is that column's own `pt-3` INSIDE the scroller,
  which travels with the pill and is gone the moment anybody scrolls. **The
  same guard admitted it**: its canvas assertion was a 160px window
  (`> barBottom`, `< barBottom + 160`), wide enough to pass on a flush canvas,
  on the 24px margin and on the 56px band alike — rule 27 landing on an
  assertion's TOLERANCE rather than on a fixture, and the reason it is
  equality now.

  **And the occlusion guard above was racy from the day it was written, which
  removing that margin exposed.** The room the section makes for the panel is
  animated (`transition-[padding-left] duration-210`), so a hit test fired the
  instant the banner appears asks about a banner still travelling out from
  under the panel: the pad read 440.553px and 218.792px of its settled 512 in
  two runs. It passed alone and failed in the file, and **that pairing is the
  signature of a question asked too early rather than of a slow machine** —
  rule 26's lesson with a CSS transition in place of a deferred listener, and
  no timeout is long enough for either. The wait is stated as the relationship
  (the pad equals the panel's own width, both being `min(36rem,40vw)`) rather
  than as 512, and the case was re-sabotaged after it, because a wait that
  turns a red green is the first thing to suspect of making it vacuous.

- **The carrd-style page builder (2026-09-04) — PARTIALLY BUILT.**
  `docs/superpowers/specs/2026-09-04-carrd-style-page-builder-design.md`
  supersedes the recursive Items/Options inspector: click the rendered block
  to select it, one focused Properties panel per selection, a single global
  Add, and dragging directly on the live canvas rather than through the
  inspector's own sibling-only grips. **PR #67 (`carrd-style-builder`)
  merged to `main` on 2026-09-05**, all six required checks green — direct
  dragging on the live renderer via `EditableBlockFrame`, linear-insertion
  drop planning in `block-drops.ts` for `stack`/`list`/`timeline` alongside
  `moveBlock`'s existing positional swap for the grid-shaped modes, the
  focused Properties panel (two fixed tabs per selection kind), and the
  single global `AddBlockPicker` modal. The four `e2e` failures this bullet
  once named as still-red on that PR are fixed and merged with it — read
  `docs/superpowers/plans/2026-09-04-carrd-style-page-builder-phase-1-checkpoint-blockers.md`'s
  own "Phase 1 status" section for that account rather than trusting this
  sentence past today, per rule 18 below. The remaining phase documents
  (compact builder menu, drop-semantics audit against the spec's full table,
  completing interaction, retiring superseded inspector paths, full
  browser/accessibility/responsive proof) have not started; **the modal Add
  path phase 2 would have replaced is itself now superseded** — see the next
  bullet — so phase 2 as written no longer describes the plan.
  **2026-09-16:** of that list, the compact builder menu and the retirement
  of the inspector paths landed on 2026-09-04 (feature `HISTORY.md`, "The
  compact builder menu, and one Add for one selection" and "The Properties
  panel replaces the recursive inspector"), and interaction shipped under
  its own spec on 2026-09-02. Still not started: the drop-semantics audit
  against the spec's full table, and the responsive proof pass.

- **Drag-to-add from a palette tab (2026-09-05) — DESIGNED, not built;
  DELIVERED 2026-09-06, per the dated paragraph closing this bullet.**
  `docs/superpowers/specs/2026-09-05-palette-drag-to-add-design.md`
  supersedes the single global `AddBlockPicker` modal above: adding content
  moves to a persistent **Palette tab** in the Properties panel (always
  present, not a content tab but a mode switch — clicking it clears
  selection), listing the same `add-samples.ts` templates as compact
  mini-preview thumbnails you drag from. Picking one up highlights **every**
  valid drop target on the whole page at once — every empty place, every
  occupied place (which now accepts a drop everywhere by push-and-shift, not
  only in the linear containers that already shift on reorder), and a
  virtual append-a-new-row spot at the foot of every container, filtered by
  `mayNest`/the depth cap for section-kind drags. Drop auto-selects the new
  block and switches the panel to its own tabs. A keyboard path (Enter/Space
  to pick up, arrows between targets, Tab to skip a section, Enter/Space to
  drop, Escape to cancel) is required, not optional, since this replaces the
  modal entirely rather than sitting beside it. `AddBlockPicker`,
  `add-slot.tsx` and `add-target.ts` are slated for removal once this lands.
  Dragging an **already-placed** block by its own grip is untouched — this
  is a second, additive kind of drag for content that does not exist on the
  page yet, sharing the same `DndContext`. Rollout is unattended: each slice
  is its own branch, PR, full required-check run and auto-merge, with the
  next slice starting only once the previous one has actually merged —
  intermediate states may be incomplete but must never be broken.

  **The implementation plan is written:**
  `docs/superpowers/plans/2026-09-05-palette-drag-to-add.md`, nine tasks —
  two domain functions (every valid insertion target for a palette item;
  inserting a fresh block at one, wrapping a page-root leaf exactly as
  `wrapLeafOnPage` already does), a keyboard-ordering pair mirroring
  `block-drag.ts`'s own `placeOrder`/`stepPlace`, the Palette tab itself,
  pointer wiring as a second `@dnd-kit` draggable kind in the SAME
  `DndContext`, the virtual append-slot (a new optional `appendSlot` method
  on `EditorRenderHook`, threaded through `blocks.tsx` at zero cost when
  absent — the exact shape `wrap` already proves safe for public routes),
  the keyboard equivalent, removing the superseded modal, and a closing
  browser/accessibility/picture-proof pass. Nothing in it is built yet.
  Two of its own sentences hit `check:tools`' cspell gate on the first push
  — a coined adjective for "cannot take focus" (reworded, prose used once)
  and `args.droppableRects`, a real dnd-kit property this plan's code will
  reference (added to `cspell.json`) — the same class of
  coined-word-vs-real-identifier judgement rule 41/42
  already describe, still holding here.

  **2026-09-16: delivered.** All nine tasks shipped between 2026-09-05 and
  2026-09-06, one branch and PR each: the three domain functions, the
  Palette tab, pointer and keyboard lifts from a thumbnail, the virtual
  append slot, the modal Add's removal, and the closing browser and
  accessibility sweep. Task 8 also rendered an append slot for the page's
  own root, which Task 5 had found unrendered, so a palette drag can add a
  whole new top-level section. Account, task by task:
  `apps/hub/src/features/actors/HISTORY.md`, from "Every valid drop target
  for a palette drag" to "The closing sweep".

- **Drop-target legibility — DELIVERED (2026-09-07/11).** The editor used to
  draw every possible landing alike, draw nothing under the cursor, and for a
  palette insert draw **the wrong element entirely**: an insert target's last
  segment is a splice index meaning "before this position", so the gap it
  named was drawn as the BLOCK at that position — the one that gets pushed
  down. It read correct at an empty place, where a gap and a place coincide,
  and was wrong at every filled one, which was exactly the "some layouts" in
  the original report.

  **The canvas-move path already solved this and the palette now shares it.**
  `insertMarkFor` (`domain/palette-targets.ts`) is the one pure translation
  from a splice index to a gap — `before`/`after` an existing sibling, or
  `place` for an empty position or an occupied one being swapped with — and
  both drag origins publish through the same `activeTarget` field
  `EditableBlockFrame` and `AppendSlot` read. Only the winner a drag's own
  collision has resolved is ever drawn; nothing lights up a whole set of
  candidates any more, on either path.

  **The mark is drawn OUT OF FLOW, and that is the load-bearing constraint.**
  `@dnd-kit` caches every droppable's rectangle when a drag begins, so a
  canvas that reflows mid-drag makes the collision answer about where things
  WERE — a fresh instance of the very fault being removed. Letting the gap
  genuinely open was weighed and refused on that, not on taste.

  **One deliberate exception: an `AppendSlot` reserves real height for the
  WHOLE drag, once, at its own start.** A `DropMark` contributes nothing to
  its own parent's box by design, so an append slot with no mark drawn yet
  has no rectangle for a real pointer to land on — a worse fault than the
  one this feature fixes, since a droppable `@dnd-kit` cannot measure
  cannot be hit at all. The reservation is computed once, before `@dnd-kit`
  caches its rectangles, and never changes again for that drag's
  duration — it is the WINNER changing mid-drag that the out-of-flow rule
  forbids, not a single size change at the drag's own start.

  **Task 5 shipped a fault the out-of-flow constraint exists to name, and it
  reached this branch's own final review before it was caught.** `useDraggable`'s
  `transform` still moved the SOURCE frame once `<DragOverlay>` gave the drag
  its own floating preview, so the source flew with the cursor alongside the
  overlay rather than dimming in place — and a swap's own returning mark,
  drawn inside that same frame, flew with it too. Fixed by reading
  `isDragging` for the source's own opacity alone and never its `transform`;
  see `editable-block-frame.tsx`'s own TSDoc.

  **The ghost's own named cost materialised, and it is recorded rather than
  patched.** With real, titled content in every neighbour, the `before` mark
  visibly overlaps the block above and below instead of pushing either one —
  confirmed twice, once by the browser proof and once by photograph. That is
  not a defect: the design named this cost before anything was built and
  chose it anyway, and the fallback (a plain insertion bar, which is what the
  canvas path already draws) is written down for whoever decides the trade no
  longer holds.

  A swap draws a second, muted, dotted mark at the displaced block's own
  return position, beside the accent mark naming where the carried block is
  going. A floating preview beside the cursor names what is being carried,
  for both drag origins.

  Spec: `docs/superpowers/specs/2026-09-07-drop-target-legibility-design.md`,
  marked delivered. Plan:
  `docs/superpowers/plans/2026-09-08-drop-target-legibility.md`. Full
  account, task by task: `apps/hub/src/features/actors/HISTORY.md`'s own
  "drop-target-legibility" entries.

  **The trade no longer held, and the ghost's own fallback replaced it
  (2026-09-13).** With real content on both sides of a boundary the `before`
  mark read as landing ON a neighbour, which is the more damaging misread of
  the two, so `before`/`after` are a plain insertion bar now — full width,
  fixed thickness, still out of flow — and only `place` still draws the
  ghost sized from the carried block, because there the landing IS the
  place. The spec's §4 carries the dated addendum beside the original
  reasoning rather than in place of it.

  **`place` followed (2026-09-16).** The argument for keeping its ghost was
  right and the code had not done what it said: an inline height overrides
  `bottom-0`, so the mark was the carried block's silhouette over the host
  and spilled past a shorter host onto the neighbour — the gap ghost's own
  cost, in the kind meant to be immune. No mark sizes itself now; a `place`
  mark is its host's box, and `carriedHeight` is gone from every interface.
  Account: `apps/hub/src/features/actors/HISTORY.md`, "A place mark is its
  host's box (2026-09-16)".

- **The mark follows the pointer across a block's midline, and the scrolled
  canvas is proved (2026-09-17).** The dragging spec's last open engineering
  gap — nothing dragged on a page taller than the viewport — is closed by
  `tests/e2e/drag-on-a-scrolled-canvas.spec.ts`, one case per drag origin,
  each scrolling the canvas by wheel mid-drag onto a leaf that was below the
  fold at the lift. dnd-kit's rectangles were never stale: their getters
  follow the droppable's own scroll container. What the case found instead
  was a fault the drop-target-legibility comparison had a hole for: the mark
  was published from `onDragOver` only, which dnd-kit fires only when the
  `over` id changes, while the `before`/`after` edge inside one block
  changes without it and the drop reads the fresh edge — enter a block's top
  half, slide to its bottom half, and the mark says `before` while the block
  lands `after`. Fixed by re-publishing from `onDragMove`; regression case
  is the midline case in `drop-mark-matches-landing.spec.ts`, red against
  the unfixed editor at the second mark read. Account:
  `apps/hub/src/features/actors/HISTORY.md`, "The mark follows the pointer
  across a block's midline (2026-09-17)".
