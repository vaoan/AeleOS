# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## What AeleOS is

**AeleOS is the central identity provider for the Furry Colombia platform — the
"auth-only" layer that every app shares.** One person = one identity, one login,
across every Furry Colombia app (Puck, Libra, and everything that comes
next), all served under subdomains of `furrycolombia.com`.

The name is the founder's fursona _Aeleos_ + `OS` — because identity is the
operating system the whole platform runs on. In the platform's celestial naming
scheme (apps are moons: **Puck** = a moon of Uranus, **Janus** = a moon of
Saturn), **AeleOS is the star at the center they orbit** — which is literally the
dependency graph: everything depends on identity.

## The goal

Kill two long-standing pains at once:

1. **User-facing SSO** — a user logs in once and is already logged in across every
   app (no re-login when moving between them).
2. **Config dedup** — social login providers (Google, Discord, …) are configured
   in **one** place, not re-wired in every app's repo.

For **one shared community** (the same people use all the apps), where a person
should be a single identity everywhere.

## What this repo IS (and is NOT)

> **We do NOT build an identity provider. We DO ship exactly one app: the hub.**

The identity provider itself is **[Clerk](https://clerk.com)** — a managed IdP.
We **configure** an IdP; we do not build one. People never visit a Clerk-branded
address: the hub renders Clerk's components in its own pages, so sign-in happens
at `me.furrycolombia.com/sign-in` and Clerk's Frontend API is plumbing at
`clerk.furrycolombia.com`. (`id.furrycolombia.com` was Logto's hosted login page
and is **retired** — see `2026-08-11-hub-deployment-design.md`.)

The **hub** lives here, at `apps/hub` — a Next.js app where a person signs in
and manages their fursonas. It was originally planned as its own repository
(`aeleos-hub`); that changed on 2026-08-10 because the schema it reads lives
here, and two repositories issuing `supabase db push` at one database is two
sources of truth. See
`docs/superpowers/specs/2026-08-10-hub-in-aeleos-design.md`.

This repo is also the **home for the cross-app identity concern** that belongs
to no single app:

| Lives here                                                                                                 | Path / status                                |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Design & specs (architecture, decisions)                                                                   | `docs/superpowers/specs/`                    |
| Implementation plans (phased rollout)                                                                      | `docs/superpowers/plans/`                    |
| The hub app (fursona/profile registry, ownership ledger, actor picker)                                     | `apps/hub/` — the only deployable thing here |
| The handoff contract every consuming app codes against                                                     | `docs/integrating.md`                        |
| The canonical actor-model schema every app copies                                                          | `supabase/migrations/` — the root owns it    |
| Clerk configuration-as-code (connectors, apps, branding), exported for version control & disaster recovery | _added during implementation_                |
| The shared integration package — the Supabase-client and actor plumbing every app repeats                  | `packages/identity/` — `@aeleos/identity`    |

**Per-app integration code** (the OIDC client + Supabase third-party-auth wiring)
for the _other_ apps lives in **each app's own repo** (`puck`, `libra`, …) —
**not** here.

**The YAGNI gate on that package has fired.** It was held open until 2+ apps
needed it; Puck (Phase 1) and Libra (Phase 3) both already have a `packages/auth`
slot waiting for exactly this, so `packages/identity` now exists and `apps/hub`
consumes it through `workspace:*`. It stays **private and unpublished** until
Puck actually integrates — an interface designed against a hypothetical consumer
is a guess, and the cost of a wrong guess rises the moment a second repository
pins a version. Its one hard rule: **the package imports no framework, and above
all no Clerk.** `getToken` is a parameter, so the code never learns which
provider issued the token — which is what keeps the escape hatch a one-column
`identity_sub` backfill rather than a change to every app on the platform. That
is enforced in `eslint.config.mjs`, not trusted. Spec:
`docs/superpowers/specs/2026-08-12-hub-layering-and-contract-seam-design.md`.

**`apps/hub` ships no migrations.** `supabase/migrations/` at the root is the
single schema for the one database; never copy migrations into the app.

## Architecture & the decisions behind it

The full design is the source of truth — **read it before doing any work**:
`docs/superpowers/specs/2026-07-26-aeleos-central-auth-design.md`.

Key choices and _why_:

- **IdP = Clerk (Logto was chosen first, then ruled out).** Supabase Third-Party
  Auth supports exactly Clerk, Firebase, Auth0, AWS Cognito and WorkOS — there is
  no Logto option and no generic OIDC one. Of those five, **Clerk alone has both
  Google and Discord as native connections**, which is what makes "configure
  social logins once" real. Free plan covers 50,000 monthly users at **$0**, and
  it is supported by the Supabase CLI so the conformance suite runs locally.
  The cost is real: **no self-host escape hatch** — none of the five is
  self-hostable. See `docs/superpowers/specs/2026-07-31-idp-decision-change.md`
  for the full reasoning, including why that loss is acceptable (the actor model
  already provides the exit: a one-column `identity_sub` backfill).
- **Each app keeps its own separate Supabase project/database.** Supabase couples
  Auth + DB in one project, and the existing apps already have their own
  production projects — so we do **not** merge databases. Instead each app's
  Supabase project uses **Supabase Third-Party Auth** to _trust_ Clerk; RLS keeps
  working, keyed to the Clerk identity (`auth.jwt()->>'sub'`).
- **The user ID is sacred (the most important rule).** The only genuinely
  expensive migration in any identity system is changing the ID that app data is
  keyed to. So every app stores a stable **`identity_sub`** column (Clerk's `sub`)
  and **never** lets its own data keys depend on the IdP — app-local tables keep
  their own local primary keys. Swapping the token issuer later is then a
  one-column backfill, not a data remap. **Never weaken this.**
- **SSO via the shared Clerk session**, not a hand-rolled shared cookie. All apps
  are subdomains of `furrycolombia.com`, so Clerk's session cookie covers them
  natively and additional apps sign the user in silently — no satellite-domain
  add-on required.
- **Social-login-first, no passwords** — consistent with the apps today, and it
  makes migration painless (no password hashes to move; users just re-link by
  email on next "Sign in with Google/Discord").

## Constraints (these shaped every decision — respect them)

- **Budget: $0. Not "low" — zero.** Confirmed 2026-08-09, superseding the
  earlier "~$20/year ceiling": **having to pay anything at all is a hard stop.**
  If a design needs a paid tier, a card on file, or a service that bills after a
  trial, that design is wrong — say so and find another way rather than
  proposing it and letting the cost surface later. GCP billing is switched off
  deliberately and permanently, so the GCP VM is not a deploy target any more
  (see `2026-08-05-repo-consolidation.md`, Task 5).
- **Near-zero ops.** Effectively one maintainer. Do not introduce fragile,
  self-run services without a strong reason; managed-and-boring beats clever.
- **Don't get trapped.** Every choice must keep a low-migration exit. Since no
  Supabase-supported IdP is self-hostable, the **sacred `identity_sub`** is now
  the _only_ thing carrying that guarantee — which makes it more important, not
  less.

## Phased rollout (do not skip Phase 0)

1. **Phase 0 — Stand up + de-risk.** Create the Clerk instance, configure Google +
   Discord connections, and **validate the Supabase⇄Clerk trust.** This was the
   one real technical unknown, and it is now **proven and continuously
   re-proven**: the `idp-cloud` CI job mints a real Clerk user, resolves it as
   `role=authenticated` against the AeleOS Supabase project, and runs
   `tests/idp/` on every pull request. (A Clerk development instance uses no
   custom domain; production DNS is Phase 1's job — `clerk.furrycolombia.com`,
   not `id.`.)
2. **Phase 1 — New / greenfield app (and Puck).** Integrate end-to-end to prove
   the pattern. Puck is safe to migrate early because it is **not yet in
   production**; note Puck's foundation `user_profiles` FKs to `auth.users(id)` and
   that FK must be reworked to the `identity_sub` model.
3. **Phase 3 — Libra (production — careful, its own plan).** Import users to
   Clerk by email, backfill `identity_sub` (no domain-data remap), switch to
   Third-Party Auth, verify in staging, keep a rollback path.

## References

- **Design spec (source of truth):**
  `docs/superpowers/specs/2026-07-26-aeleos-central-auth-design.md`
- **Integrating another app (the handoff contract):** `docs/integrating.md` —
  written for a developer in Puck's or Libra's repository who has never seen
  this one. When the endpoint or the picker's contract changes, that file is
  the change, not a note about it.
- **IdP decision change (Logto → Clerk):**
  `docs/superpowers/specs/2026-07-31-idp-decision-change.md`
- **Era looks — DESIGNED, NOT BUILT (2026-08-28):**
  `docs/superpowers/specs/2026-08-28-era-looks-design.md`. Five OS-era looks as
  page DOCUMENTS rather than skins, because two existing skins already carry
  the chrome of three of the five — `retro` is Windows 98's bevel and `aero` is
  Aero glass — and a look spans five vocabularies, so it belongs to none of
  them. Read it before adding a skin for a named product: the bar that removed
  `columns` applies. It also predicts, on the record and before building, that
  Windows 8 cannot be done, because Metro is per-block colour and per-block
  colour is refused by design.

  Its three phases ship independently and so get a plan each. Phase 1 is
  `docs/superpowers/plans/2026-08-28-era-looks-phase-1-template-seam.md`, and
  it locates the seam the spec implied without naming: `BlockEditor` holds the
  template picker and does NOT hold the theme, so "one path, not two" means
  lifting document application up to `FursonaEditor`, where the source dock
  already does it.

  **Read its correction banner first.** The plan was written against a
  `PageDocument` type that does not exist — `page-document.ts` is text-in and
  text-out — so a template carries the parsed `{ theme, blocks }` shape rather
  than JSON, and is not re-parsed at runtime. The guarantee re-parsing would
  have bought is taken at BUILD time instead: every shipped template is pushed
  through the real `toDocument`/`parseDocument` pair in its own test, so one
  the parser refuses fails the build rather than somebody's editor.

  Phase 2 is
  `docs/superpowers/plans/2026-08-28-era-looks-phase-2-the-five-looks.md`, and
  the captures it was planned against sharpen two of the spec's claims. **Vista
  and Windows 7 differ by PALETTE, not mechanism** — both are `aero`, one
  dark-tinted on green and one light-tinted on blue — where the spec called
  them near-identical. And **Windows 8 is confirmed unbuildable rather than
  predicted**: the Metro capture is flat solid tiles in seven different
  colours, and per-block colour is refused by design. Its ARRANGEMENT is
  reachable — `spaces` plus `weights` express the mixed tile sizes — so it is
  colour alone that is out of reach, which makes it a decision about a standing
  ruling rather than a gap to patch quietly.

  **Built and photographed on 2026-08-28, and the pictures found the biggest
  gap of all.** Five looks are seeded under `/137/era-*` and the findings sit
  with the eleven social ones. One missing mechanism explains most of the
  fidelity loss across three of the five: **a page cannot choose its SURFACE
  colour independently of its background**, so a panel is always a tint of the
  ground — Win98 wants silver on teal, XP near-white on blue, Metro coloured
  tiles on black. That is not the per-BLOCK colour already refused by design;
  it is per-page, and it is the more ordinary want. Vista and Windows 7, by
  contrast, needed nothing new at all.

  **Gap 8 is closed: a page chooses what its PANELS are painted with
  (2026-08-28).** `theme.surface` is a colour or null, null being the stepped
  panel every page had, so nothing stored moved. Windows 98 is silver on teal
  now and XP near-white on Luna blue — both unreachable before, because every
  derived colour stepped away from the background and a panel was always a tint
  of the ground behind it.

  **Choosing one gives the page TWO grounds**, and `derivePalette` solves ink,
  muted and edge against whichever leaves least room — the hardest-stop rule
  extended from one ground to two. What it guarantees is narrower than "both
  clear 4.5", and a failing test is what found the difference: `#008080` sits
  near mid-lightness and never cleared the minimum with or without this key, so
  the contract is that **a second ground costs the first nothing** — measured,
  the field stays at 4.05 exactly while the panel goes from 4.97 to 10.61.
  Weakening the assertion to make it pass would have been rule 7's forbidden
  move.

  It edits `set_actor_theme` in `0009`, so it carries the in-place-migration
  obligation: hand-apply to live, and do it LAST, immediately before merge, one
  pull request at a time — the push makes live the newer side and every other
  open pull request sees drift until yours merges.

  **The seeder reads a generated artefact rather than importing or copying.**
  `scripts/seed-pastiches.mjs` is plain JavaScript and cannot resolve the app's
  `@/` alias, so `scripts/era-looks.generated.json` is the seam and
  `apps/hub/tests/era-looks-json.test.ts` fails when it drifts from the module.
  That guard compares DATA and not text, because comparing text made it fight
  prettier forever — rule 6, with the formatter owning shape and the guard
  owning content.

- **Clerk:** https://clerk.com — docs: https://clerk.com/docs
- **Supabase Third-Party Auth:** the mechanism each app uses to trust Clerk.
- **Sister repos (shared toolchain & conventions):** `Z:\Github\puck`,
  `Z:\Github\libra`. Consult them for tooling/CI/convention decisions and
  mirror their approach; AeleOS follows the same pnpm + strict-TS + ESLint +
  Prettier + kebab-case-filenames discipline once it grows code.

> ⚠️ **Libra is in production. Never run anything against its database.**
> Each app has its own separate Supabase project; never cross credentials between
> them, and never point any AeleOS/Clerk config at a production data project
> except as explicitly designed in the migration plan.

## Conventions

- **Secrets never in git.** Real values live in `.secrets` / provider dashboards /
  CI secrets. `.env`, `.secrets`, and raw IdP config dumps are gitignored — only
  sanitized/example config is committed (`.secrets.example`).
- **Filenames:** kebab-case (matching the sister projects).
- **Specs & plans:** follow the `docs/superpowers/{specs,plans}/YYYY-MM-DD-*.md`
  convention used across the platform (brainstorm → spec → plan → implement).
- **Every export carries TSDoc, and it states the contract — not the types.**
  TypeScript already has the types; repeating them is drift waiting to happen.
  Say what a caller may assume, what throws, what is idempotent, what is
  security-relevant. `pnpm lint` fails without it, and fails again if a
  parameter is renamed without its `@param`.
- **Every export is tested on its happy path and on each failure mode.** Branch
  coverage gates this — an untested error branch fails the build. A test that
  guards already-correct behaviour must be **verified by sabotage**: break the
  code, watch it go red, restore. A test never seen red proves nothing.
- **Edge cases are owed at BOTH levels, and they are different questions at
  each.** Happy path plus failure modes is the floor, not the bar.

  A unit test's edges are the boundaries of a **value**: empty, one, many, the
  cap, one past the cap, absent against explicitly-default, the first position
  and the last, the palindrome that hides a reversal, the list whose last entry
  equals the constant you would pad with.

  An end-to-end test's edges are the boundaries of a **situation**: the
  narrowest viewport, the longest string in the longest language, the deepest
  nesting the model allows, the fullest page, the cold cache, the second drag
  in a suite where the first one's announcement is still on screen.

  **Neither level covers for the other, and that is measured rather than
  argued.** On 2026-08-27 an eyebrow added to the leaf editor's header row
  displaced a 204px `select` — as wide as `Reproductor de música`, its longest
  option in Spanish, which is this app's FALLBACK language — and pushed the
  editor 71px past a 320px viewport. 3023 unit tests at 100% branch coverage,
  `lint`, `typecheck` and `check:tools` were all green; `responsive.spec.ts` at
  portrait 320 was the only thing in the repository that failed, because "how
  wide is this control, in the longest language, on the smallest phone" is not
  a question any unit test has an opinion about. The converse holds just as
  hard: no browser case will tell you what `moveBlock` does at the depth cap,
  and `block-moves.test.ts` is where that lives.

  The practical form: when you add anything to a row that already holds a
  `select`, the select is as wide as its longest option **in Spanish**, and the
  row has no slack you have not measured.

  **An edge case still has to discriminate.** Rule 27 is at its sharpest here —
  the middle of a range is exactly where a right answer and a wrong one land on
  the same pixel, and the edge is where they part. So name the wrong behaviour
  the case excludes and ask whether this edge can tell it from the right one.
  If it cannot, that is a case to rewrite, not one to count.

- **Every bug gets a regression test. No exceptions.** Finding the cause is half
  the work; the other half is a test that fails on the unfixed code. Write it
  before the fix where you can, and **sabotage-verify it against the original
  fault** either way — a regression test that never reproduced the bug is a
  guess about it.

  The test belongs at the level the bug actually lived at, which is rarely
  where it was noticed. `/pages` (then `/fursonas`) once threw for every signed-in visitor
  because `nuqs` shipped without its adapter, and the signed-in error boundary
  reported that as "we could not load your identity" — a message about the
  database, which was never involved. The regression test is not a nicer error
  page. It is `app-providers.test.tsx`, the one suite that does **not** mock
  `nuqs`, because every other suite mocked away the very thing that was
  missing.

  That is the lesson worth carrying: **a mocked dependency hides its own setup
  requirements.** When a bug turns out to be wiring a mock stood in for, the
  regression test has to use the real thing, and it will usually be the only
  test that does.

  **A second instance, 2026-08-16.** A section's drag handle had never worked —
  not by mouse, not by keyboard — since it was first written in commit
  `fa9d3dc`. `@hello-pangea/dnd` refuses to start a drag whose source event
  targets a tag it treats as interactive; the handle is a `<button>`; nothing
  set `disableInteractiveElementBlocking` on its `Draggable`. Lifting a
  section did nothing at all, silently, for every input method. It survived
  because the flat section editor's only coverage — `section-editor.test.tsx`,
  deleted along with that editor when the block editor replaced it — mocked
  `@hello-pangea/dnd` entirely and counted buttons by `aria-label`, wiring
  that passes whether or not a lift ever begins. The guard is now
  `tests/e2e/section-drag-reorder.spec.ts`, which drives a real drag by
  keyboard and is sabotage-verified against the original fault: removing the
  prop leaves the library's own `aria-live` announcement empty, because the
  lift never starts. Same lesson, same shape: the suite that mocked the
  dependency away is the one that could not have caught this, and the one
  that used the real thing did on its first run.

  The fix landed first in the flat editor's own card alone, and this note
  recorded `fursona-list.tsx` as still carrying the identical fault rather than
  leaving the next person to rediscover it. **It was then fixed in `#154`.**

  **The prop is gone, and the LESSON is not, which is why this note now says
  where the guard moved rather than which line sets it.** `@hello-pangea/dnd`
  is no longer a dependency — see the dragging bullet below — and dnd-kit has
  no interactive-tag rule at all: a grip is whatever element carries
  `listeners`. So the original fault cannot recur in that form, and the one
  that replaces it is the same shape with a different cause — a grip that
  renders, looks right, and was never handed the four things `useDraggable`
  returns. `block-slot.test.tsx` is where that is caught now, driving the real
  hook inside a real `DndContext` and carrying a deliberately unwired grip
  beside it as a permanent control, because a suite where the negative case
  cannot fail is a suite that proves nothing about the positive one.

  Which makes this note's own history the smaller lesson beside the bug's: it
  went on asserting an open fault for a day after that fault was closed, and
  was believed, because a sentence naming a file and a line reads like a
  measurement. **A note recording something as unfixed has to be deleted by
  whoever fixes it**, or it becomes the confident, wrong instruction this file
  warns about everywhere else.

- **Change an implementation, move its documentation.** `pnpm check:docs`
  compares each exported symbol against the base branch — and against the index
  in pre-commit — failing when the code moved and the TSDoc did not. It is a
  heuristic and it is deliberate: under AI-driven development a stale comment is
  a confident, wrong instruction. There is no suppression flag. Its companion
  `pnpm check:agent-notes` asks the same question one level up, of the directory
  notes — see the bullet below for the three rulings that shape it.
- **Constraints about an export live in its TSDoc**, where they are enforced and
  freshness-checked. A `CLAUDE.md` beside the code is optional, for rules
  constraining code that does not exist yet. TSDoc constrains what exists; a
  directory note constrains what comes next.

  **A directory note is no longer unenforced (2026-08-27).**
  `pnpm check:agent-notes` fails when a file changed under a note and the note
  did not — the companion to `check:docs`, which is per exported symbol and so
  structurally blind to a note whose subject is a different file. It is generic:
  every `CLAUDE.md` and `AGENTS.md` governs its own directory, so a note written
  tomorrow is guarded on the day it lands, with nothing to register.

  Three rulings it is built on, each of which changes what it costs:

  - **Nearest note only, and a skipped note does not fall through.** A pointer
    (`apps/hub/CLAUDE.md` is the eleven bytes `@AGENTS.md`) and a wholly
    generated file (`apps/hub/AGENTS.md` is Next.js's own rules) govern nothing,
    and their subtree is then unguarded rather than handed up. Falling through
    would put every change under `apps/hub` on THIS file — 118KB of running
    record — and a gate that fires on a workflow tweak is one people satisfy
    with a blank line. So the run PRINTS what it skipped: the fix for an
    unguarded subtree is to write a real note in it, not to bend the rule.
  - **Both exemptions are mechanical, not a list.** A pointer is a file whose
    every non-blank line starts with `@`; a vendored file is one where stripping
    `BEGIN`/`END` blocks leaves nothing. Prose beside a generated block is
    prose. Rule 32's hand-maintained skip list is why neither is a list.
  - **No suppression flag**, matching `check:docs` and for its reason: a
    suppression flag becomes the thing everyone types. Restating something that
    still holds counts, and the failure message prints the three questions the
    actors note already asks rather than only naming a file.

  Gap 3 is closed too: `list` is a container mode that lays a stack with a
  hairline between its children and no gap, which is the shape every modern
  feed has and the one `stack` cannot be asked for. It is an arrangement and
  decides nothing about its children — a feed is `list` plus `chrome: "bare"`.

  The pastiche pages are rebuilt against real archived captures, and the one
  real thing that found was about USING an option rather than reasoning about
  one: a page-level typeface did not reach headings until it set the font
  TOKENS as well as the property. (The other, "an author cannot turn the
  backdrop off", was a false diagnosis twice over — see the findings, which now
  carry the correction rather than the claim.)

  It runs as a step in `conformance` beside `check:docs`, taking the base ref
  the same way, and in pre-commit as `--staged`. Both modes only see what is
  committed or staged — an edit sitting unstaged in the working tree is invisible
  to it, exactly as it is to its sibling.

- **What the block model CANNOT be pushed toward is written down, and it was
  found by trying.** `scripts/seed-pastiches.mjs` builds **eleven** pages aiming
  at eleven eras of somebody else's social network — the arrangement and
  palette, plus the site's own mark as the profile AVATAR and nothing else of
  theirs — because a pastiche fails visibly and in a way you can
  name, where "the editor feels limited" is not actionable. Findings:
  `docs/superpowers/specs/2026-08-27-pastiche-findings.md`, and the README's own
  showcase table links every page with what each one proves. Read the findings
  before designing a style key, and note the things in them that LOOKED like
  faults and are not.

  **Eight were rebuilt from real archived captures and three were not.** Fur
  Affinity, Fotolog and Facebook were built from knowledge, because
  web.archive.org would not answer and Fur Affinity refuses an unauthenticated
  fetch. That distinction is written into the findings, the README and the
  seeder itself rather than left implicit, because the eight and the three are
  not the same evidence and a reader cannot tell them apart by looking.

  **ARCHIVE.ORG ANSWERS AGAIN (2026-08-28), and that sentence was a dated claim
  believed past its date.** Probed directly: the availability API returns a
  2008 snapshot for every one of the three. Two of them are now evidence-backed
  — a real 2008 Fur Affinity capture and a real 2007 Facebook one — and the FA
  page was measurably wrong as a result: built from knowledge it had a
  near-black ground and saturated teal header bars, where the capture shows a
  slate BLUE-GREY ground and light silver bars carrying DARK text. Fotolog
  stays knowledge-built, because its snapshots render the logged-out homepage
  with broken styling rather than a profile.

  The general lesson is rule 25 with a different subject: **a claim about what
  an external service will do is dated the moment it is written**, and this one
  was load-bearing — it is the reason three pages were built from recall. Re-probe
  before believing it; the probe is one `curl` against
  `archive.org/wayback/available`.

  **Gap 12 is closed (2026-08-28) and the way it was nearly closed WRONG is
  the part worth carrying.** The 2007 Facebook capture is a navy bar over a
  lighter blue one, which one accent could not draw; `heading: "soft"` is a
  second, DERIVED tone. The obvious derivation — move the accent a fraction of
  the way toward the panel — is what anybody writes first, and it collapses on
  exactly the page the gap exists for: a dark page's panel is dark too, so a
  navy accent's tone landed within 1.2 of the accent and the second bar WAS the
  first one. It steps in LIGHTNESS toward whichever extreme has room instead,
  which is the rule `--on-accent` already uses to pick a label. **The
  discriminating fixture is a mid-grey accent**, because that is the colour
  with the least room to travel and therefore the first place a derivation that
  barely moves stops being visible.

  A fixture trap came with it, and it is rule 27 landing on a STRING rather
  than on a page shape: `bg-(--accent)` is a prefix of `bg-(--accent-soft)`, so
  a `toContain` on the class list passes both on a renderer that ignores the
  new value and on one that paints every bar with it. The cases split on
  whitespace and compare whole tokens. **Where one name is a prefix of another,
  a substring assertion cannot discriminate in either direction.**

  **A SUMMARY TABLE of what each page uses is root rule 30 in its purest form,
  and five of eleven rows were false (2026-08-28).** The findings document's
  "what landed, and what carried it" table named `retro` on MySpace, `candy`
  and `sticker` on hi5, `glass` on Sonico, `terminal` on GeoCities and
  `timeline` on the microblog board. **Not one of those five is in the file** —
  nine of the eleven pages are `skin: "default"` throughout and the board is a
  `list`. Nothing was broken: the rebuild against real captures took the
  decorative skins off _because the real sites were plain_, which is the pass
  working, and the table went on describing the pages as they had been.

  Two seeder headers had drifted the same way and each contradicted a note a
  few lines below it — hi5's said "Loud, yellow" directly above "hi5 was BLUE,
  not yellow", and claimed an orange "survives only as the accent" over an
  accent that is `#4a7ebb`; the board's said "`timeline` is the mode this
  exists to test" over a page that uses `list`, the mode that did not exist
  when the header was written.

  **The check is mechanical and nothing runs it: re-derive the table from the
  file.** A row naming a skin, a mode or a canvas is a claim about
  `seed-pastiches.mjs`, and `check:docs` cannot see it because no TypeScript
  symbol moved. Twenty lines of regex over the seeder answered all eleven rows
  at once — which is the general form worth keeping: **when a document
  summarises what another file contains, extract the summary rather than
  reading it.** It is faster than checking one claim by hand and it cannot
  agree with a sentence out of politeness.

  **A page whose subject is STILL RUNNING needs no archive, and that took a
  day to notice (2026-08-29).** The provenance gap had been framed entirely as
  an archive problem — `web.archive.org` unreachable, six pages unverifiable —
  and two of the six were never archive problems at all. Bluesky and Threads
  are live sites; `getComputedStyle` on the real page is stronger evidence than
  any capture, because it is a measurement rather than a photograph. Both
  moved when checked.

  Three things that generalise, each measured:

  - **A brand colour is not a measurement of a page.** Bluesky's accent is the
    `#0085ff` everybody quotes, and the application paints `#006aff` — read off
    the Follow button's own background. The official value and the rendered one
    are different claims and only one of them is about pixels.
  - **A live measurement carries the PROBER's environment into the result.**
    Threads served `#fafafa` to a probe with no colour-scheme preference; the
    page being imitated is the black one, so `colorScheme: "dark"` is what made
    the reading mean anything. State the environment or the number is unowned.
  - **A live site is evidence about TODAY, and today is not always the era
    being imitated.** Threads has since moved its profile into a rounded card
    on a grey field; the pastiche stays the 2023 edge-to-edge one it is dated
    to. This is the one way a running site is HARDER than a capture — a capture
    carries its date and a live page does not.

  **The last four were chased down on 2026-08-29, and the framing had been
  wrong the whole time.** "Six pages have no provenance and the archive is
  down" is one problem with one blocked source; it was four different problems.
  Two were live sites. One — **Windows Live Messenger — is a DESKTOP
  APPLICATION**, so a capture of it is a SCREENSHOT rather than an archived
  page, and `web.archive.org` was never the right place to look for it;
  Wikipedia had version 8.0, the exact release the page is dated to, and
  sampling it found the page measurably wrong in the same way Fur Affinity had
  been. Only the last two genuinely had nothing.

  **Searching and finding nothing is a FINISHED answer, not a deferred one**,
  and it is the half that gets skipped. Sonico has a logo and no screenshot on
  three separate wikis; the only GeoCities file is a 2009 Yahoo-era page, a
  different product wearing the same name. Those two are recalled and now SAY
  so — which is the difference between "we do not know" and "we looked, and
  there is nothing to know." A gap closes when every entry has an answer, not
  when every entry has evidence.

  **A palette can be evidence about a DATE.** The microblog board carries
  `#15202b` and `#1d9bf0` — recognisably Twitter's dark mode from about 2019 —
  while it was filed under 2012, which was a light page with a paler blue. The
  page was coherent and its label was not, so the label moved. Restyling it
  would have been the wrong repair: a pastiche of a real era is worth more than
  a pastiche of a date somebody typed.

  **And where fidelity and PURPOSE conflict, say which won.** The Messenger
  capture is near-white panels over blue chrome, and this page had it the other
  way round; the panels went to the measurement and the field deliberately did
  not, because `aero` is the whole reason that page exists and glass needs
  something behind it to show through. A correction that deletes the thing the
  page is a test of is not a correction.

  **`web.archive.org` HAD BEEN STANDING IN FOR "THE ARCHIVE", and that was the
  real mistake (2026-08-29).** With one host unreachable the provenance
  question looked closed; it was not, and two of the four pages were settled by
  going elsewhere. `arquivo.pt` — the Portuguese national web archive — replays
  Sonico at October 2008 with its stylesheet intact, which found the accent
  measurably wrong; `geocities.restorativland.org`, a fan-restored gallery of
  real archived personal pages, gave five GeoCities homepages that confirmed
  that page's design rather than changing it.

  **Ask what the SUBJECT is before asking which archive has it.** The four
  needed four different kinds of source, and naming the subject is what picks
  the source: a desktop application wants a SCREENSHOT (Messenger, from
  Wikipedia); a personal homepage wants a page archive rather than a PORTAL
  capture (`geocities.com` is the portal, and nobody's page); a defunct site
  wants an archive that is not the famous one; and a logged-in dark mode wants
  something **no crawler has ever seen** — a crawler arrives logged out and is
  served the light page, so no archive anywhere holds the board's palette, and
  that is a property rather than a gap in coverage.

  **A second archive can also CORROBORATE a negative.** Fotolog renders
  unstyled at `arquivo.pt` exactly as it does at the other — 126 links at the
  browser's own `#0000ee`, raw bullet lists — so "its captures do not render"
  is now two independent observations rather than one claim.

  **And "unreachable" is a claim about a host, not a network, until three
  clients agree.** `web.archive.org` fails from `curl` (~21s), from headless
  Chromium (`ERR_CONNECTION_TIMED_OUT`) and from the agent's own fetcher (which
  refuses the domain outright) — while `archive.org` answers 200 and
  `archive.ph` answers 429 in the same run. One hostname, not the connection.

  **A CAPTURE IS A HOT LINK, and that reopens what a pastiche page can show
  (2026-08-29).** `arquivo.pt/screenshot?url=<encoded replay URL>` renders an
  archived page and returns a PNG. Pointed at `noFrame/replay/<ts>/<url>`
  rather than `wayback/<ts>/<url>` it omits the archive's own banner and
  sidebar — the difference between a usable reference picture and one that is
  40% Portuguese navigation. So a reference can sit ON a page under the
  images-are-links-only rule, with nothing stored and no budget touched.

  Two things about it were measured rather than reasoned, and the second
  contradicts the reasoning. `img-src` already allows any https host. And
  **Chromium renders that response despite `nosniff`**: it is served as
  `application/octet-stream` with `X-Content-Type-Options: nosniff`, which
  reading the spec says should stop an `<img>` — driven in a real browser,
  `naturalWidth` is 1000 and the console is silent. Rule 10, on a header this
  time.

  What it costs is a published page depending on a research archive's
  rendering service, so **the section carries a `link` to the replay beside
  the picture**: when the picture dies the provenance does not.

  **`archive.org` ANSWERING IS NOT `web.archive.org` ANSWERING**, and
  conflating the two is what shaped the whole provenance story above. The
  availability API answers for every subject and hands back URLs on the host
  that does not respond — so a snapshot is findable and not fetchable, which
  looks like evidence right up until you try to open it. The question is never
  "is the archive up", it is **"which source holds this subject"**.

  **A PORTAL capture is not a PAGE capture — and that lesson, already learned
  for GeoCities, had been missed for MySpace the whole time.** `myspace.com`
  is the portal; `profile.myspace.com/<user>` is somebody's profile, and
  arquivo holds **43** of them. A real October 2008 one is a photo behind
  everything, boxes gone semi-transparent with thin bright borders, and text
  fighting the image — which is what that site WAS. **Ask what the subject is,
  then ask which URL is it**, because the site's own domain is usually
  neither.

  **The MySpace pastiche was built from the default white-box chrome instead
  of that subject, and this is the one place that was still true after it —
  closed 2026-08-29.** `myspaceTheme` now carries `profile.myspace.com/akioyang`
  at `20081024054301` as its own subject: a photograph background, `border:
"solid"` with `radius: "square"` on every section for the thin
  square-cornered edge the capture has in place of the old rounded default,
  and a `surface` sampled from the capture's own boxes. `heading_gap` —
  unused anywhere in this file until this landed — welds each bar flush to
  its content. **What did not come along is the translucency itself**: a
  block's fill is one opaque colour with no alpha channel, so the sampled
  tone stands in for the photograph showing through rather than being it —
  recorded as gap 13 in the pastiche findings rather than approximated past.

  **The first sampled surface made the page unreadable, and nothing in the
  build would have said so — closed in review, same day.** Averaging five
  patches of a translucent box blended with a photograph landed on
  `#555a6a`, OKLCH `L≈0.4691` — almost exactly mid-lightness, which is the
  one region `derivePalette` cannot serve text in either direction. Measured:
  ink read 2.86:1 against it, muted 3.06:1, edge 3.01:1, against floors of
  4.5, 4.5 and 3.0 — the same "no direction clears the minimum" hole this
  file already documents for `#008080`. The fix is `surface: "#737989"`, the
  nearest colour to the sample along the same lightness axis that clears
  4.5:1 both ways (found by sweeping, not guessing: darker does not recover
  legibility until `ΔL≈-0.28`, where the solved ink flips from dark to
  light text; lighter needs only `ΔL≈+0.11`). **`pnpm check:contrast` never
  caught this and structurally cannot**: it measures `globals.css`'s own
  fixed token pairs and never reads a stored theme, so an author's `surface`
  can sit on the one lightness a palette cannot serve and every gate stays
  green. Recorded as gap 14 in the pastiche findings, separate from gap 13 —
  naming the hole rather than proposing a general checker.

  **`corners` was tried alongside `radius: "square"` and removed.** A key
  named in the brief turned out to be a no-op there: `radius: "square"` drives
  `--skin-round` to `0`, and every corner `corners` names computes as a
  multiple of that same token — so a "rounded" corner and a square one are
  the identical `0`. `corners` says WHERE and `radius` says HOW MUCH, and
  where is meaningless once how-much is zero everywhere. A key that changes
  nothing is a dead letter that reads like a change in the diff, so it is
  absent from this page rather than decorative on it — its first real use
  belongs to a page that wants the window shape it actually draws: a bar
  rounded across its top over a body square at its foot, which needs
  `radius: "soft"` to mean anything.

  **An SPA replays as nothing, so "no archive" and "an archive of the wrong
  subject" are different claims.** Bluesky and Threads were written up as
  having no archive at all; both have years of captures. Bluesky's replays as
  the logged-out splash and Threads' replays **blank**, because a crawler
  stores markup and these pages are built after it. Only the sharper statement
  is true, and it is the one that tells the next person not to look again.

  **Fotolog is sharper too, in the other direction.** "Its captures do not
  render" holds for the nav — raw bullet lists, browser-default blue — and the
  page's table-and-inline-styled content panels DO render. So it is partial
  evidence: good for density and arrangement, none at all for anything the
  stylesheet governed. Neither "knowledge-built" nor "evidence-backed" is the
  right label, which is why it now carries the caveat instead of a label.

  **`ERA_LOOKS` ARE THE PICKER'S TEMPLATES, so nothing decorative may be added
  to them.** They are spread into `TEMPLATES` in `fursona-templates.ts`, which
  means anything put there lands on the page of every author who picks that
  look — a reference screenshot of somebody else's operating system included.
  Whatever a showcase page needs beyond the look itself is appended by
  `scripts/seed-pastiches.mjs`, which is also the only place the two sets can
  be kept consistent.

  **The seeder owns everything the pages depend on**, and that was learned the
  hard way twice in one session: the avatars had been set by hand outside it,
  so a re-run left the newest pages with an empty circle; and it went on
  writing `unlisted` after the pages had been made public by hand, silently
  undoing that on every run. **A seed that does not restore everything it
  depends on works exactly once.**

  **AND THE SEEDER BYPASSES `set_actor_sections` ENTIRELY, which nothing said
  out loud until 2026-08-29.** It writes `actor_profiles` with direct SQL, so
  the depth cap, the style-bag allowlist and the required-kind rule — every
  database-level guard the product has — are simply not applied to a seeded
  page. A seeded page can therefore be a shape the editor would refuse and a
  save would reject, and it will render anyway.

  So **the sixteen showcase pages had no validation of any kind**: not the
  database's, because it is bypassed, and not a test's, because
  `seed-pastiches.mjs` reads `SUPABASE_DB_PASSWORD` and calls `process.exit`
  at module top level and then `client.connect()`, so it cannot be imported at
  all — the only way to find out whether a page was valid was to write it to
  production and look. That is why the page definitions now live in
  `scripts/pastiche-pages.mjs`, the module the seeder imports — named here in
  the commit before that module existed, which is worth marking, since a note
  that runs ahead of its code reads exactly like one that has fallen behind
  it: **a thing that cannot be imported cannot be checked**, and moving it is
  usually cheaper than whatever the alternative gate would have been.

  **The gate landed and immediately paid for itself, same day.**
  `apps/hub/tests/pastiche-pages.test.ts` pushes all sixteen pages through the
  real `parseTheme`, `blocksSchema` and a walk against `REQUIRED_KINDS` — the
  three checks `set_actor_sections` would have made, reassembled outside the
  database because the seeder still cannot be imported. It found real defects
  on its first run, six of the sixteen pages, all the exact shape this note
  predicted: `board` and `geocities` had `speed: 0.2`, below
  `CANVAS_RANGE.min` of `0.25`, silently raised to it on every read rather than
  refused; `threads` and `geocities` each had an empty `title_en` on an
  otherwise-unlabelled text leaf, which the strict schema refuses outright;
  and `furaffinity`, `fotolog` and `facebook` were each missing at least one
  required kind — `owner` on all three, `avatar` on `fotolog` too, `handle` on
  `facebook` too. Every one had been rendering anyway, because nothing had
  ever asked. All seven are fixed now, minimally and idiomatically rather than
  restyled — an `owner` leaf appended to each page's own final section,
  `avatar`/`handle` added to the identity block at the top the same way every
  other page already does it, the two speeds raised to the floor, and the two
  empty titles given real text (`threads`' bio is titled "Bio", matching the
  identical content on `board` and `sky`; `geocities` gained "NOTICE" over its
  visitor-counter-and-browser-notice text). The restyle itself is still each
  page's own later task.

  **And it is rule 29 again, on the SABOTAGE rather than the page.** The first
  attempt to sabotage-verify the theme case matched `skin: "default"` inside
  the shared `theme()` factory's own default literal — the one every page
  overrides via its own `...over` spread — rather than inside `myspaceTheme`
  itself. The substitution landed and grep confirmed it, and the suite came
  back reporting the same 7 pre-existing failures it already had: a sabotage
  that applied and changed nothing observable, which reads exactly like a
  successful verification unless the failure COUNT is checked rather than the
  presence of the edit. Redone against the theme object's own line, it
  reddened exactly the one case it should and none of the other two.

  **A page can now show what it is imitating (2026-08-29), and "three" and
  "four" are both true statements about it.** `scripts/pastiche-references.mjs`
  is the registry — one entry per handle, each a hot link and never a stored
  file — and `inspirationSection` turns an entry into an appendix section, no
  colour or chrome of its own. **It is appended now**, in both of
  `seed-pastiches.mjs`'s loops, onto a local copy of each page's `blocks` —
  never stored in `PAGES` or `ERA_LOOKS` themselves, for the same reason
  those two arrays carry nothing decorative already: `ERA_LOOKS` is spread
  into the picker's own `TEMPLATES`, so a section stored there would land on
  the page of every author who picks that look.
  `absent` means "this page carries no picture," and it covers two different
  reasons rather than one. `board`, `sky` and `threads` are three where no
  archive can hold the SUBJECT — a crawler never sees the dark mode, the
  signed-in profile, or the client-rendered markup — matching the design
  spec's "three of sixteen have no capture of the right subject." `geocities`
  is a fourth, for a different reason, and it is not a counterexample to that
  sentence: `geocities.restorativland.org` **is** evidence of the right
  subject, a restored gallery of real archived personal pages. What it lacks
  is a single capture, because the subject was never one page. A reader who
  counts four `absent` entries against a spec that says three should read
  both as true rather than go looking for the bug that reconciles them.

  Two dated operational facts about sources a published page now hot-links at
  render time, measured 2026-08-29 and worth re-checking past that date
  rather than trusted: `arquivo.pt`'s screenshot endpoint connect-times-out
  (10s) on a request fired immediately after another to the same host, and
  the identical URL succeeds once spaced a few seconds apart or retried;
  `upload.wikimedia.org` answered `429` to two rapid requests and `200`
  moments later. Neither is a bad URL — both are load on somebody else's
  server, not a wrong timestamp — so a script that resolves several of these
  in a tight loop should expect a failure a respaced retry clears, and should
  not read one as evidence the reference itself is wrong.

- **A window is corners chosen one at a time (2026-08-29).** `corners` and
  `heading_corners` name which of a block's — and its bar's — corners are
  rounded, so a bar rounded across its top over content rounded across its foot
  draws the window shape a single `radius` could not. `radius` says how MUCH
  and these say WHERE.

  **The XP era look wears it**, which closes gap 10 of the pastiche findings —
  a bar rounded on top over a body rounded at its foot, join straight. That gap
  had been open since the era looks were built, and it closed **from the other
  end**: not by a look reaching for a key, but by somebody looking at the pages
  and naming what was missing.

  **Absence still emits nothing**, which is what keeps every stored page
  byte-identical.

  Two things it cost that generalise past this feature:

  - **jsdom dispatches a programmatic click to a DISABLED input where a browser
    would not.** The picker refuses to untick its last corner, and the
    `disabled` attribute alone made that a property of one control rather than
    an invariant about the value. The handler refuses it too — which is also
    what makes the guard reachable in a unit test at all.
  - **A CUSTOM PROPERTY substitutes its `var()`s where it is DECLARED, not
    where it is read.** Defaulting the corner tokens at `:root` to
    `var(--radius-xl)` looks like "the radius each card already had" and is
    not: the substitution happens at `:root`, freezing that scope's
    `--skin-round`, so every nested skin lost its own corner. And the fallback
    cannot reference `--radius-xl` either, because `@theme inline` makes a
    utility INLINE the token's expression rather than reference it — which is
    precisely why per-skin radius worked before. Both faults are invisible from
    a class string and were caught by a browser reading a computed style, with
    a full unit suite green at 100% throughout.
  - **A control can reach the wrong ELEMENT and every unit test still pass.**
    The first version wrote `border-radius` on the styled element — but a
    block's style bag lands on a WRAPPER, and the card that draws the corner is
    nested inside it. The class string was always right; the box it was written
    on drew nothing. Root rule 30's shape, and the same fault `--img-fit`
    already cost once. Only a computed style in a browser can see it.
  - **A `sed` sabotage that fails to apply looks exactly like a successful
    verification.** One here matched nothing, the suite stayed green, and the
    pin appeared proven. Rule 29 with the mutation step itself as the fixture:
    check the substitution LANDED before believing the run.

- **A claim about STORED data is checkable now — `pnpm check:page-shapes`.**
  It counts every page in the live database by the shape it is written in, so
  "can the flat-section shim go yet" has a number instead of an opinion. It is
  a REPORT and exits 0 whatever it finds: a stored shape is not a fault a pull
  request introduced. It deliberately does not reuse the app's own parser —
  that answers what we can still READ, and a shape we have stopped reading is
  exactly what a census has to be able to count. Rule 25 still applies to what
  it prints: the answer is a fact about the day it ran.

- **Squash the migrations, and squash them again.** Nothing is in production
  yet, so the schema is still allowed a clean start — and a clean start is
  worth keeping, because the migration set is the thing every consuming app
  will copy. **Every object is defined exactly once.** A change to an existing
  function is an edit to the file that already defines it, not a new file
  stacked on top: `0015` folded into `0012` and the section layouts folded into
  `0009` for exactly this reason. Applying a squash means resetting the live
  database, which is legitimate **only while no consuming app has copied the
  migrations**. When Puck copies them, this ends permanently and every change
  becomes additive forever.

  **An in-place edit never reaches the live database, and nothing tells you.**
  This is the trap the convention above creates, and it is measured rather than
  theorised. Supabase's migration history records a file as applied; `db push`
  will not re-run an applied file. So editing `0009` changes what a fresh
  database would build and changes **nothing** about the database the app
  actually runs against — silently, permanently, and in exactly the case the
  convention makes normal. Found 2026-08-16: `set_actor_sections()` on the live
  project was missing its **entire** per-section style-validation block, so
  `skin`, `background_url`, `background_fit` and `card_size` were unvalidated at
  the database level from the day `#150`–`#154` merged until this was found. The
  zod schema was the only thing checking them; the database backstop `0009`
  appears to provide was never there.

  Every check was green throughout. Unit tests at 100% cannot see a database.
  **`pnpm test:db` cannot see it either, by construction** — it resets to a
  **fresh** database built from the files, where drift cannot exist. And the
  `actor_profiles.sections` column comment, the one signal this convention asks
  to be kept in step, **was current**: truthful about the file and false about
  the database. So the designed signal pointed the wrong way.

  **THE ORDERING IS THE WHOLE RULE, AND IT WAS BROKEN ON 2026-08-29 BY THE
  AGENT WHO WROTE IT DOWN.** "Apply LAST, immediately before merge, one pull
  request at a time" is stated two paragraphs up; a heading-picture branch
  hand-applied `validate_block` while an unrelated pull request was still open
  and waiting on `e2e`. That request's `schema-drift` had already passed, so
  nothing went red — the check does not re-run on its own — and the breach was
  invisible rather than caught. Had anything re-triggered it, a green pull
  request would have turned red for a change that is not in it, which is the
  most confusing failure this repository can produce.

  **It happened AGAIN the same day, and worse.** The column comment on
  `actor_profiles.sections` was hand-applied to live before a pull request
  carrying it existed at all — so `main` went red on a change that was in
  nobody's branch. Twice in one session, by the same agent, on the same rule,
  minutes after writing the paragraph above. That is the measure of how strong
  the pull is: the edit and the apply feel like one act, and the note saying
  they are not does not stop it.

  **The trap is that applying feels like part of finishing the code**, because
  the edit and the apply are the same thought. They are not the same step: the
  apply belongs to the MERGE, and the test for whether it is safe is `gh pr
list --state open` returning nothing else.

  **A SEEDED page has the same shape, and the same branch tripped it too.**
  Running `seed-pastiches.mjs` from a feature branch makes live reflect
  whichever branch last ran it — so re-seeding from a branch cut before an
  avatar change silently wiped five avatars that a pull request not yet
  rebased onto had added. Nothing failed; the pages simply lost something, and only
  reading a screenshot found it. **The seeder writes production from whatever
  tree you are standing in**, so re-seed from `main` after a rebase, never from
  a branch that predates work already live.

  What guards it now is the `schema-drift` job below. Until it is a required
  check, the obligation is yours: **after editing an applied migration, apply
  the changed statements to the live project yourself** — a `create or replace`
  in its own transaction — and re-run the check.

  **A squash is not finished when the SQL is.** It is finished when every
  document, comment and test that named the old arrangement says the new one —
  the AI-facing notes (`CLAUDE.md`, `AGENTS.md`, the feature notes), the specs
  and plans under `docs/`, the TSDoc, the SQL comments that cross-reference a
  migration by number, and the tests that read a migration file by name. Under
  AI-driven development a stale pointer is a confident, wrong instruction, and
  a renumbered migration is the most confidently wrong kind: the file it names
  still exists and contains something else. `pnpm check:docs` does not catch
  this, because nothing about the TypeScript changed. Grep for the old number.

  The counterweight is that a number is a name other files use, and a stale
  pointer is worse than an untidy one. `0009` alone is cited by a dozen TSDoc
  comments, so renumbering around it is a change to all of them. **Fold what is
  genuinely a redefinition; do not renumber for tidiness.**

  A caution about the reasoning, learned the hard way: this paragraph used to
  say `0006` owned the UUIDv5 derivation other apps copy byte-identically, and
  that was **wrong** — `0002` owns it, and three other documents repeated the
  same error. A reason not to touch something is worth checking before it is
  believed, because a false one protects nothing and costs the work anyway.

- **Git:** work on branches, open PRs; do **not** commit unless the user
  explicitly asks. Never commit secrets. Every `git` and `gh` call in this
  repository uses the PAT in `.secrets` (`GH_TOKEN`) and takes commit
  identity from `gh api user` — never from `git config --global` and never
  from a hardcoded name or email. The procedure is
  [`docs/git-with-gh-token.md`](docs/git-with-gh-token.md).
- **Picture proof on the PR is part of the work, not a follow-up.** Opening a
  pull request, and every later commit that lands on a branch that already has
  one open, ends with photographs posted **as a comment on that PR** — so a
  human scrolling the thread and a bot reviewing the same thread can both see
  that the change is what the tests claimed. A green check is not the picture;
  a sentence in the PR body is not the picture; a screenshot that never left
  the working tree is not the picture.

  Photograph the thing that actually changed, the way a person would look at
  it: the editor, the public page, the signed-in chrome, before-and-after
  where the bug was visual. Caption each image with the claim it is supposed
  to prove. If the change has no user-facing surface, photograph the
  verification that would otherwise live only in a log (the passing run, the
  drift check, the schema probe) rather than skipping.

  **Post it on the PR. Do not commit it.** Temporary Playwright specs,
  `shot-*.png`, and crop files stay out of git; delete them after the comment
  is up. Uploading the images and posting the comment are `git`/`gh` actions
  like any other: they use the PAT in `.secrets` (`GH_TOKEN`) and the
  procedure in [`docs/git-with-gh-token.md`](docs/git-with-gh-token.md) —
  never `git config --global`, never a stored osxkeychain login, never
  `gh auth login` as somebody else, never a drag-drop in the browser as a
  different account. Confirm `gh api user` first, then `gh pr comment` with
  markdown that embeds the uploaded files. A picture that landed as a
  different GitHub user is not posted.

  **Photograph the branch, never `main` by accident.** `PLAYWRIGHT_BASE_URL`
  still pointing at production from an earlier live check is how a comment
  can prove the old site and look like proof of this one. Unset it, or point
  it at a preview of _this_ branch, before taking the pictures. A picture of
  the deployed site is only proof after that commit is what production is
  serving.

  **Then READ the pictures back, as a step of its own (2026-08-27).** Posting
  is not the end of the job. Open every image you just posted and say what it
  shows — including what it shows that you did not intend. A screenshot is
  evidence of **everything in its frame**, not only of the claim you took it
  for, and the claim is all you will see if checking the claim is all you do.

  Paid for immediately, on the pull request that added this line. A shot
  captioned "the way back to the controls sits at the top right, not over the
  page's foot" proved exactly that — and in the same frame the button was
  sitting **on top of** the language toggle, the light/dark toggle and the
  account menu, hiding all three. Both facts were in the picture. Only the one
  being argued for was read, and the reviewer saw the other in seconds.

  So it is a separate pass asking a different question: not "does this show
  what I claimed" but **"what else is in this frame, and is any of it wrong"**.
  Walk the whole frame rather than the subject — edges and corners, anything
  overlapping anything, anything clipped or cut off, a control that has landed
  on another, text that is a raw message key, a colour that did not apply. Do
  it before the comment goes up where you can, and immediately after where you
  cannot; and where a comment is already up, correct it **on the thread**
  rather than quietly, because the picture is there and somebody will read it.

- **Always branch from an explicit base — `git checkout -b <name> origin/main`.**
  Never bare `git checkout -b <name>`, which silently branches from whatever is
  currently checked out — and after a session's work that is usually the last
  feature branch, not `main`. (`main` is now the only branch on the remote:
  merged branches delete themselves, which means a leftover _local_ branch
  marked `[origin/…: gone]` is the trap to watch for.)

  This has gone wrong twice, both times the same way: PR #4 and PR #11 were cut
  from the Phase 0 branch, so each carried ~10 unrelated commits and a
  `CLAUDE.md`/plan copy predating what was already on `main`. Merging either
  would have **silently reverted** work that was already merged. Branch
  protection caught them — `BEHIND` and then `DIRTY` — but that is a backstop,
  not the fix.

  Before pushing a new branch, confirm the base:

  ```bash
  git log --oneline origin/main..HEAD   # should list only your commits
  ```

  If it lists commits you did not write, the base is wrong. Rebuild with
  `git checkout -B <name> origin/main` and cherry-pick your commit — **unless**
  the change belongs on the feature branch, which is the case when it edits a
  file that only exists there. Check which it is before rebasing.

## Current state

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
  only as it earns them. Rules in `eslint.config.mjs` keep the shape honest
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
  `no-restricted-imports` — they are module names rather than elements.

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
  than growing a per-block correction.

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
  in a browser (the page background's `background-attachment`).

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
  `2026-08-16-a-border-of-ones-own-design.md`.

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

  **Dragging is written, and `@hello-pangea/dnd` is gone (2026-08-18).**
  Anything may be dragged anywhere a place will hold it — content between
  sections, a section into a place, at the depth cap — by mouse and by
  keyboard. `@dnd-kit/core` + `@dnd-kit/sortable` replaced it because the old
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

  Two things carry the design and neither is in a component. `moveBlock`
  (`domain/block-moves.ts`) decides what a drop MEANS, with no library in
  sight; `domain/block-drag.ts` decides which two places a gesture NAMED, and
  that is where the phase's one real unknown was. **The collision resolves to
  the deepest place under the pointer** — places nest, so every enclosing place
  contains the pointer too, and a distance-to-centre ranking answers a leaf
  inside the container somebody is hovering, silently, one level in.
  "Innermost" and "longest path" are the same fact at any depth, which is what
  makes it hold at three rather than being the two-level special case the spike
  had. **A keyboard drag walks a list instead**, deliberately: a pointer cannot
  avoid the places inside the block it is carrying and a list can simply leave
  them out.

  **A pointer drag has now been driven in a browser, and it agrees with the
  unit fixtures.** Until `tests/e2e/block-drag.spec.ts` every browser-level
  proof was by KEYBOARD, which exercises a different branch: the keyboard side
  of `detectCollision` hands back the place the coordinate getter already chose
  and never calls `placeUnderPointer` at all, so the geometry was proved only
  against rectangles a unit test wrote for itself. **Four** of that spec's cases
  run by mouse AND by keyboard against a real layout — a swap inside one
  section, a move into a place at the depth cap and back out, a section reorder,
  and the refusal one level past the cap. The rest are single-gesture BY DESIGN,
  and this bullet claimed otherwise for a while: the cycle refusal and the plane
  rule have no keyboard gesture that expresses them, because the walk never
  offers those targets; the descendant-exclusion case IS the keyboard proof of
  that; and the save-and-reload, the abandoned drag and the collapsed-card walk
  each drive the one gesture their subject has. Its
  pointer half asserts the `data-over` highlight BEFORE it releases, which is
  `placeUnderPointer` ranking rectangles Chromium measured. Replacing
  deepest-wins with nearest-centre reddens it at the highlight and leaves the
  keyboard half green, which is the two paths being different said out loud.

  **Two of its fixtures are shaped by a trap rather than by taste**, and both
  are the "a case that passed because both orderings landed identically" shape.
  A swap and an insert-and-shift leave two ADJACENT places reading the same
  thing, so the swap is asserted across a place that is not adjacent to its
  source; and a shift and a swap leave the same page when there are only two
  sections, so the reorder gets a page of three. Each was verified by making
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
  parts worth knowing first:

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
  `apps/hub/src/features/actors/CLAUDE.md` for the numbers.

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
  stale the moment this lands.

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
  `apps/hub/src/features/actors/CLAUDE.md` for the account in full.

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

## The toolchain, and the rules it cost

Full account, with every measurement:
`docs/superpowers/specs/2026-08-15-toolchain-hardening-design.md`. Read it before
adding or disabling a linter. The short version, and the part that generalises:

**Everything the sister repos check, this repo now checks.** `stylelint`,
`eslint-plugin-boundaries`, `sherif`, `syncpack`,
`eslint-plugin-better-tailwindcss`, `eslint-plugin-sonarjs`,
`eslint-plugin-unicorn` — plus two the sisters do not have,
`@axe-core/playwright` and `fast-check`. AeleOS was the only one of the three
with **no CSS linting at all**, which is how `globals.css` grew a rule that beat
every Tailwind utility for months without anything noticing.

**Three findings were not style, and two of them were autofixes:**

- `unicorn/prefer-string-raw` rewrote the middleware `matcher` — the expression
  deciding which requests Clerk sees at all — into a `String.raw` template. Next
  reads that config **statically**, so the build failed naming no file. The rule
  is off.
- `stylelint --fix` deleted `-webkit-backdrop-filter` and left the standard
  property declared twice, three lines under a comment calling that line
  load-bearing. We have no autoprefixer, so a prefix in source is the only one
  that reaches a browser. `property-no-vendor-prefix` is off.
- The skin styled `[class~="border"]`, Tailwind's own generated class, from
  **outside every cascade layer** — where it beat every utility unconditionally.
  `@utility surface` replaced it across 74 class lists, and both hand-written
  `:not()` exclusions deleted themselves.

### The rules. Each was paid for.

1. **A newly adopted tool must be shown to fail before it is believed.** Three
   here were silently doing nothing: `better-tailwindcss` disabled all nine of
   its rules because `tailwindcss` resolved from `apps/hub` and not the root, and
   `boundaries` could not resolve the imports it was policing. Introduce a
   violation, watch it fail, restore.
2. **Never run an autofix over code a build tool parses rather than executes** —
   middleware matchers, route segment configs, `next.config.ts`. Review that diff
   every time.
3. **Do not style a class the framework generated.** It reaches the right
   elements and cannot see what they asked for. Own the class.
4. **Custom CSS belongs in a cascade layer.** Unlayered rules beat every layered
   one regardless of specificity — silently, and forever.
5. **When a rule disagrees with the code, decide which is wrong and write the
   answer down.** Every disable carries its reason; a silent one is a decision
   nobody can review.
6. **Two tools fighting is a configuration bug.** Prettier lowercases hex and a
   rule wanted upper — the fix ran, Prettier undid it, forever. Name the owner.
7. **A property test states a claim; it does not weaken until it passes.**
8. **A migration's cost is not the diff.** Try it, measure, revert with evidence.
9. **`check:docs` is per symbol and not a formality.** A mechanical rename still
   touched 33 exported contracts.
10. **An argument about cost is not a measurement of it.** The next-intl
    migration was refused on the reasoning that it traded a pre-paint guarantee
    for a weaker one. Sampling 184 frames across the change showed no frame ever
    painted wrong. Reason to decide what to measure; do not let it stand in for
    the measurement.
11. **A branch reached only by a random draw is not covered, and the coverage
    number lies about it at a low rate.** `embed-providers.ts`'s Mastodon
    resolver had no named case reaching the FALSE arm of its `&&` — every
    hand-written reject returned a line earlier, and the property test's own
    generator produced only valid pairs. The one thing that ever made it false
    was the unseeded hostile property _happening_ to draw a failing pair, so
    about one run in 42 came back `99.84% (654/655)` on a check that requires
    100, and the same shape sat unnoticed in the Twitch resolver beside it.
    Two things kept it invisible for weeks: the miss is rare enough to read as
    infrastructure noise rather than as a defect, and `test:coverage` is
    configured for `text-summary`, which reports the percentage and **never
    names the line**. So the diagnostic is worth remembering on its own —
    `--coverage.reporter=text` names it. **It finds the uncovered line and
    cannot confirm a clean file**, which is the half of the advice that was
    missing: measured 2026-08-19, `text` omits a fully-covered file from its
    table ENTIRELY — `block-tracks.ts` sat at 9/9 statements, 6/6 branches and
    3/3 functions in `coverage-final.json` and appeared nowhere in the printed
    table, and `--coverage.skipFull=false` did not bring it back. So absence
    from that table means "clean" or "not instrumented" and the reporter will
    not say which. Read `coverage-final.json` when the question is whether a
    file is covered, and use `text` when the question is which line is not.
    The rule generalises past coverage,
    because the shape recurs wherever a property test sits beside named cases:
    a property test states a claim about ALL inputs; it does not stand in for
    a case about ONE. If a branch is only entered when a generator happens to
    produce the right input, that branch is untested and the suite is telling
    you otherwise. The check that settles it is the suite run with the
    property files excluded: everything must still be at 100%.
12. **Never diagnose a browser failure against a server older than the code.**
    A `next dev` already running when the message catalogues change keeps
    serving the modules it started with, forever. New keys then render as raw
    keys, and because a `select` is as wide as its longest option,
    `fursonas.types.progress` at 155px where `Progreso` is eight characters
    overflows the 320px editor by a real 4px — so `responsive.spec.ts` fails
    honestly, about a page that genuinely was broken, for a reason that is not
    in any diff. **What makes it dangerous rather than annoying is that it
    disguises itself as a bad commit and survives the check you would use to
    rule that out.** An agent stashed its work, watched the failure persist,
    and correctly concluded "pre-existing" — because stashing does not restart
    a server. It cost a full bisect across twenty commits. Restart after
    touching the catalogues, and treat a server that predates the code as no
    evidence at all.
13. **A test can exercise a path the product never takes and look exactly like
    coverage.** `canvas-performance.spec.ts` set `--canvas` by name for every
    canvas, the default one included. The product never does that for the
    default — `themeVars` emits the property only for a canvas OTHER than the
    default, so that the untouched page stays byte-for-byte what it was — so
    the one caller exercising the nebula was the one caller that could not
    reproduce how the nebula is reached. It measured the half-resolution path
    while every page in the app served the full-resolution one: four times the
    pixels, 35.8ms a frame against 8.9, from the day `renderScale` was written.

    This is the repository's own "a mocked dependency hides its own setup
    requirements" with the TEST supplying what was missing instead of a mock,
    and it generalises the same way: **a suite that supplies setup the product
    does not is measuring a different program.** When a value has a fallback,
    the check has to reach it the way production does — by leaving it unset —
    and a fallback that each consumer applies for itself is a fallback each
    consumer gets a separate chance to disagree about. Both faults here were
    that: `renderScale("")` answered 1 where `renderScale("nebula")` answered
    0.5, and nothing owned the resolution until `resolveCanvas` did.

    **The other half is rule 10 at its sharpest.** Three of us reasoned
    confidently about which CSS was expensive — `backdrop-filter`,
    `background-attachment: fixed`, the comic halftone, `neon`'s spread,
    `cutout`'s `clip-path` — and every one of those arguments was wrong.
    Measured on a throttled phone, all of them together cost 4.0 points of the
    main thread and the canvas cost 65.6; the fixed attachment, the single
    measurement the feature notes flagged as highest-value, was zero three
    times over. The thing nobody had looked at was a one-line fallback. Suspect
    what is measured, not what is interesting.

14. **A budget is only real if it separates the two builds, and one reading of
    each does not establish that.** The dial-latency ceiling in
    `personalised-page-cost.spec.ts` was set from a single pair — 31ms fixed,
    557ms sabotaged — and it failed CI at 283ms on code that was correct. Read
    again, the same unmodified build measured a median of 17.6ms and 575.4ms at
    a 6x throttle in two runs minutes apart, against 836.1ms sabotaged. The
    distributions overlapped, so **no ceiling existed that could have been
    right**, and recalibrating it would only have moved which runs lied. It was
    replaced rather than relaxed, by a ratio of two counts taken in the same
    run — theme commits per delivered movement — which reads 0.006 fixed and
    1.000 sabotaged at throttles of 1x, 4x, 6x and 8x. The general form:
    **before trusting a performance budget, measure the good build twice and the
    bad build once, and check the gap is bigger than the spread.** A single
    green and a single red look identical to a real signal and to a coin toss.

    **The half of that which cost the most time is the sabotage.** An agent
    tried to check the budget by defeating the coalescing at RUNTIME —
    monkey-patching `requestAnimationFrame` — rather than in the source, saw the
    number barely move, and concluded the budget might be measuring nothing.
    Both halves of that were wrong and each on its own is enough. The patch does
    not reproduce the fault: the component's pending-frame flag still collapses
    a burst arriving in one task, so the keyboard burst reported 0.006 commits
    per movement WITH the patch applied — the coalescing intact. And the
    instrument is built out of the very thing being patched, `rAF` twice over,
    so it reported 2.6ms where the honest fixed build reports 27.0 and the truly
    sabotaged build 37.7: a page committing on every single event scoring ten
    times better than one that does not. **Never sabotage a mechanism your
    instrument is built on**; and when a runtime shortcut and a source edit
    disagree, the source edit is the measurement and the shortcut is a third
    program neither of you meant to run.

    A smaller finding from the same pass, worth keeping because it decides what
    a check CAN assert: **headless Chromium rasterises everything on the CPU.**
    Asked over CDP, it answers `2d_canvas: unavailable_software`,
    `gpu_compositing: disabled_software`, `rasterization: disabled_software` on
    a SwiftShader device, where the same browser headed on the same machine
    answers `enabled` to all three on the real adapter. Every canvas
    millisecond this repository has ever recorded is therefore software raster.
    That is the right regime for a CI budget — the runner has no GPU either, and
    it is the pessimistic side — and it leaves the resolution assertions
    untouched, since those compare integers. What it forbids is quoting those
    milliseconds as what a visitor's machine pays. The account is in
    `canvas-performance.spec.ts`'s own header.

15. **A name three consecutive authors cannot define the same way twice has no
    mechanism — it has a meaning each of them filled in from context.** The
    `columns` container mode was in the vocabulary, in the SQL and in the
    renderer, and each of those three said something different about it: the
    schema said it laid uniform tracks exactly as `grid` does, `0009` said
    `grid` fills them across and `columns` down, and the renderer shipped
    `grid` plus `items-start`. The middle one is a real mechanism, column-major
    fill order, which nothing else has — **and it was never implemented**, so
    the file whose comments are the readable index of the model was describing
    behaviour the product did not have, where `check:docs` cannot see it. The
    rule generalises past vocabularies, because it replaces an argument with an
    observation: this repo's standing bar is that a thing earns its place by a
    mechanism none of the others has, and "is there a mechanism" is arguable
    where "can three people who wrote it down agree" is not. It was removed
    before anything could store one.

16. **A summary wrong in the safe-sounding direction is worse than one that is
    simply wrong, because it closes the question.** A report said "the editor
    cannot save at all", which sounded like a limitation and read as settled.
    The truth was that the editor could not save a page WITH sections and saved
    perfectly well when it believed there were none — which, after the model
    changed under it, was every page. So opening any page and pressing Save
    erased it: the parse failed, the read answered `[]`, the mutation sent an
    empty tree, the RPC accepted it and reported success. Nobody looked,
    because the sentence had already told them nothing could be written. When
    writing down what a broken thing cannot do, state the failing input and the
    observed behaviour, not the conclusion — "it refuses a tree" and "it cannot
    save" are not the same claim, and only one of them is checkable.

17. **Being right for the wrong reason is the worse way to be right, because
    the reasoning is what the next person reuses.** The `min-w-0` fix was
    correct and its stated mechanism was false: a flex item is NOT floored at
    `min-width: auto` in a column container — per Flexbox §4.5 an automatic
    minimum size applies on the main axis, so it computes to `0` — and the
    guard that actually did the work everywhere except `timeline` was
    `minmax(0, 1fr)`. The credited sabotage was false too: removing the
    `min-w-0` guards left the whole suite green, because no fixture put a wide
    leaf in the one mode that lays `auto` tracks. A conclusion that survives a
    wrong explanation will be copied to the next place with the explanation
    attached, and there it will be wrong about the outcome as well. Measure
    which half of a fix is load-bearing before writing down why it worked.

18. **`check:docs` catches a symbol whose CODE moved. It cannot catch one whose
    WORLD moved.** `LEAF_KINDS`' TSDoc described an owed behaviour — the
    pairing debt inherited from `two-column`, including "the list disappears
    when no row survives" — and two leaves had by then paid that debt and
    deliberately INVERTED that half of it. The constant itself never changed a
    character, so nothing about the TypeScript moved and the freshness check
    had nothing to compare. The exposure is any TSDoc that describes something
    other than its own symbol: a debt, a plan, another file's behaviour, a
    guard that runs elsewhere. Those are the comments to grep for by hand when
    a phase closes, and the giveaway is the future or obligatory tense.

19. **A guard credited in REASONING is harder to catch than one credited in a
    comment, because there is nothing to read.** This file already says a
    sentence crediting a guard is not the guard. The new shape is a report or a
    review arguing "axe covers this" about `heading-order` and
    `scope-attr-valid` — both `best-practice` in `axe-core@4.13.0`, and
    `a11y.spec.ts` runs `wcag2a/2aa/21a/21aa` only, so neither ever fires. No
    file contained a false claim; the false claim was in the argument for why
    no file needed one. Settle it by reading `getRules()` out of the installed
    version rather than by recalling which tag a rule carries. And the naive
    fix is worse than the gap: `AxeBuilder` cannot mix `withTags` and
    `withRules`, so adding them means adopting the whole `best-practice`
    family — which would flag `empty-table-header`, a blank `<th>` beside a
    written value that `TableLeaf` renders **on purpose**. That is the second
    time "just turn the rule on" would have broken something deliberate; the
    first was `unicorn/prefer-string-raw` rewriting a middleware matcher Next
    reads statically.

20. **An agent that sabotages live state must restore it in the same run, and a
    session limit does not care.** One died mid-sabotage with its probe still
    on the live database — and worse, it had MOVED the probe from the end of a
    column comment to the front before dying, so the containment check somebody
    would reach for (`live.startsWith(file)`) answered false and the obvious
    "is the suffix still there" check would not have found it. Restoring meant
    executing the `comment on column` statement verbatim out of `0009` rather
    than retyping it, which is the idiom for every hand-applied migration edit
    here. The safer shape is to sabotage a COPY — the shadow database or a
    local stack, and `pnpm test:db` runs here now — and to reserve live probes
    for the one case that genuinely needs them. Where a live probe is
    unavoidable, write down where it is before making it, not after.

21. **A dormant guard names the conditions under which it wakes, and somebody
    has to READ them when that condition arrives.** The dial-latency half of
    `personalised-page-cost.spec.ts` was stood down with an exact note saying
    phase 3 would restore it, what else would have to move (nothing), and how
    to judge the result. Phase 3 was then built and merged and nobody opened
    the file; three of the note's stated reasons had gone false meanwhile, and
    it took a review to find it. This is not the "a sentence crediting a guard
    is not the guard" failure — the note was excellent and everything it said
    was checkable. What was missing was the step that reads it, so the
    obligation belongs to the phase rather than to the note: **when a phase
    closes, grep the suites for its own name.** A skip whose restore condition
    has arrived is a check that has quietly stopped existing, and it looks
    exactly like a check that is passing.

22. **One agent per working tree, or a worktree each.** Two were writing to this
    one at once — the second told to expect files to move under it rather than
    being made to wait — and a whole-tree `pnpm lint` came back red on four
    errors belonging to the other, which is precisely the state in which
    somebody "fixes" work that is not theirs. Nothing was lost only because the
    file sets happened to be nearly disjoint. The overlap rule that was being
    used, stage only your own files by name, protects the INDEX and protects
    nothing whatever about running a gate against a tree somebody else is
    editing. The cost of the rule is occasional serialisation; the cost of not
    having it is a red gate nobody owns.

23. **An assertion that cannot fail FIRST is corroborating, not independent, and
    counting it as proof is how a suite overstates itself.** Where several
    assertions sit in one path, an earlier sabotage reddens before the later
    ones are reached — so they never had the chance to be the thing that
    caught it, and a report saying "these are covered" is describing reach
    rather than evidence. The task that got this right named four of its own
    that way rather than adding them to a total, and it is the honest form of
    the discipline rules 11, 17 and 19 each found the dishonest form of. The
    test is mechanical: sabotage the code, and see which assertion is the one
    that goes red.

24. **A brief's premise can be wrong, and an implementation that says so is
    doing the job rather than refusing it.** Twice in one phase. A plan
    demanded `children.length === spaces` on a reading of "spaces" as a total,
    which made a fifty-picture gallery unrepresentable; the implementer hit the
    consequence and asked about the cause. And the editor brief asked what
    happens to a displaced occupant when a shape narrows — a question with no
    answer, because a width is not a capacity and nothing is displaced. Both
    were mine. The failure mode to guard against is the opposite one, an agent
    implementing an impossible instruction and writing tests that assert it, so
    say plainly which part of the instruction does not apply and why, and carry
    on. And note what the second cost when it was half-fixed: three places in
    the plan still stated the old rule after the constraint above them had been
    corrected. **A document that contradicts itself is worse than one that is
    simply wrong**, because whichever half a reader reaches first is the one
    they follow.

25. **A premise about the DATA is dated the moment it is written, and `main`
    moves.** A plan's migration ruling opened "every page in the database is
    flat-shaped", and every task after it reasoned from that sentence. It had
    been false for about an hour: a pull request merged that morning shipped a
    save boundary writing a shape nobody downstream knew about, so the branch
    read those pages, stripped the key it did not recognise, and answered a
    default — a three-across gallery as one full-width column, for its owner
    and for a stranger, with the next save storing the loss. Nothing failed,
    because a strip is not an error and no test owns the live database. Two
    habits follow, and the second is the one that was missing. **Date a claim
    about stored data and name what would falsify it**, rather than stating it
    as a standing fact. And **re-read what merged to `main` while the branch was
    open**, specifically for writes: a claim about the schema is checked by
    `check:schema-drift`, and a claim about what is IN the rows is checked by
    nobody at all.

26. **An event you can OBSERVE is not proof that the thing which acts on it is
    listening yet.** `@dnd-kit/core@6.3.1`'s `KeyboardSensor.attach()` starts
    the drag synchronously and then adds its own `keydown` listener inside a
    `setTimeout`. The lift is announced out of the state that synchronous call
    set — so the announcement, which is the only signal a browser test has, is
    rendered INSIDE the window where an arrow key reaches nothing at all. One
    run in three lost its first arrow, the walk then sat on the place it
    started from, and the poll timed out five seconds later quoting an
    announcement that was entirely correct. It reads as a slow machine and is
    not: the key was never delivered, so no timeout is large enough to fix it.

    Two things generalise past this library. **Waiting for a visible effect
    proves the effect and never the wiring behind it** — and where a dependency
    defers its own listeners, the wait has to be ORDERED against that deferral
    rather than made longer.

    **The ordering this rule originally prescribed was wrong, and measuring it
    is what showed that.** It said one macrotask closes the window "by
    construction, because the sensor's timer was queued first and timers of
    equal delay fire in the order they were queued". That argument assumes the
    sensor has already ATTACHED when the yield is queued — and attach happens
    in a React commit the scheduler may defer. On a page with one more section
    it does defer, and then our timer is queued first, fires first, and the
    first arrow is lost on EVERY run rather than one in three. Measured
    2026-08-20: one macrotask lost it every time, two lost it every time, a
    `requestAnimationFrame` with a `setTimeout` nested inside it lost it never.
    React commits before paint, so the frame callback runs after the commit
    that attached the sensor, and a timer queued from inside that frame is
    queued after the sensor's own. `support/drag.ts` does that now.

    The general form is the part to carry: **an ordering argument has a
    premise about WHEN the other side registered, and that premise is the thing
    to check.** A guard whose correctness rests on queue order is only as true
    as its assumption about what has already run — and the failure mode is not
    a flake that gets rarer on a faster machine, it is a deterministic loss on
    a heavier page. And **a
    "did it happen" check built on a signal that is already dirty is vacuous**:
    the second drag in a test begins with the first drag's own DROP
    announcement still on screen, so `expect(liveRegion).not.toBeEmpty()`
    passed before anything had been lifted — an assertion that could not fail,
    in the one place a dead grip would first be noticed. Wait for a CHANGE from
    what was there, not for presence.

27. **A FIXTURE can make a right answer and a wrong one identical, and then the
    assertion is perfect and proves nothing.** This is the failure that hides
    best, because everything a review looks at is correct: the case reads
    exactly like the behaviour it names, the sabotage is the honest one, and
    the suite stays green through it. The dragging phase sprang it on subject
    after subject. A swap and an insert-and-shift leave the same page when the
    two places are ADJACENT, so the case had to move a block across a place
    rather than beside one. A shift and a swap leave the same page when there
    are only two sections, so the reorder needed a page of three. And a
    write-order guard survived its own removal because the case
    removed a section AFTER the one holding the other half of the exchange,
    where both orders land identically — rewritten to remove the section
    BEFORE it, the same removal reddens.

    The diagnostic is cheap and belongs in the writing rather than the review:
    **name the wrong behaviour you are excluding and ask whether this fixture
    could tell it from the right one.** Two operations, one page, and the
    answer is often no. And where the answer is no and no fixture at that level
    can be built, say so — the dragging suite could not distinguish
    deepest-wins from first-match in a browser at all, because `useDroppable`
    registers children before parents and the first containing candidate simply
    IS the deepest one in that DOM. That was reported rather than added to a
    total, and the discriminating proof was found a level down where the
    candidate order is the test's to make hostile. Rule 23 is the same honesty
    about a different mechanism: there, the assertion never got the chance to
    fail; here, it got the chance and the fixture wasted it.

28. **Anything that ships file CONTENT to a server, rather than committing it,
    is exposed to the checkout's line endings — and in this repo
    `.gitattributes` closed that door, which is why this rule no longer tells
    you to convert anything.** The fault it was written for: `supabase db reset
--linked`, `db push` and any hand-applied `create or replace` send the
    files as they sit on disk, so a CRLF working tree puts a `\r` on every line
    of `prosrc` that the checked-out file does not have. `migra` compares
    function SOURCE, so all ten multi-line functions in `0009` were reported as
    drift at once, including four nobody had touched. **And every local check
    agreed it was fine** — `check:schema-drift` builds its shadow from the same
    files, so both sides matched and it printed "the live database matches",
    while CI checked out LF and was the only place the two sides differed.

    **The mechanism is gone and the instruction with it. Measured on
    2026-08-19:** `core.autocrlf` is still `true`, but `.gitattributes` —
    `bf8cd29`, 2026-07-29, long since on `main` — sets `* text=auto eol=lf` and
    `*.sql text eol=lf`, and **gitattributes beats `core.autocrlf`**.
    `0009_actor_profiles.sql` holds 0 CRLF pairs and 1056 bare LF on disk. So
    the conversion this rule used to mandate is a no-op, and its corollary —
    that a local drift green "is not evidence about CI" — is no longer true for
    line endings. This paragraph replaces the old instruction rather than
    softening it, because whoever fixes a thing deletes the note saying it is
    broken. What is still owed is the general form above: a NEW file type, a
    checkout on a machine without these attributes, or a paste through an
    editor that adds its own endings all reopen it, and the way to check is to
    count the bytes rather than to trust a setting.

    **And it was reopened, on 2026-08-19, by exactly that third route.** An
    agent editing SQL with Python's `pathlib.Path.write_text` re-wrote whole
    files as CRLF: that call applies the platform's newline translation on
    WRITE, so reading a pure-LF file and writing it back unchanged converts
    every line on Windows. Passing `newline="
"` is what stops it, measured
    rather than assumed. Nothing else said so — `git status` showed only the
    lines actually edited, because `.gitattributes` normalises on the way into
    the index, and the committed blobs were clean throughout.

    What it broke is the one thing that reads the WORKING TREE rather than the
    index: `supabase db reset` built the local and shadow databases from the
    CRLF file, so their `prosrc` carried a carriage return and the live
    project's did not. `check:schema-drift` then reported drift in
    **`public_person`, a function the branch never touched** — which reads as
    the live project having been tampered with, and sends you looking in the
    wrong place entirely. The branch's own function was the one that did NOT
    drift, because the apply script normalised before sending.

    Three things to take from it. **A drift report naming a function you did
    not touch is a line-endings report until proven otherwise** — check that
    before anything else, and check it by comparing the live body against the
    LOCAL database rather than against the file, since the local one is what
    was built from the tree. **A `git stash` round-trip silently launders the
    file back to LF**, which is a trap of its own: the evidence disappears the
    moment you try the obvious isolation step, and the next run comes back
    green for a reason unrelated to what you changed. And **count the bytes of
    any file a script has written before committing it** — the same session
    later committed a `CLAUDE.md` with every newline STRIPPED, 90KB on one
    line, and neither the pre-commit hook nor any check noticed. Prose has no
    compiler; only counting catches this.

    **The diagnostic lesson is the part that never expires.** A script written
    to answer "does live match the file" compared `prosrc` against the file and
    reported `same` for all six functions it checked — because it normalised
    line endings first, having been written by somebody who assumed whitespace
    was noise. **A comparison that normalises cannot see the fault it is
    looking for**, and this one normalised away exactly the byte in question.
    Rule 23's cousin: the assertion ran, it just could not fail.

29. **A SABOTAGE is a fixture too, and a green restore afterwards is
    indistinguishable from a real verification.** Rule 27 is about a fixture
    that cannot tell a right answer from a wrong one; this is the same failure
    landing on the step that was supposed to prove the fixture works. "Break it
    and watch it go red" is vacuous when the break you chose lands where the
    watched case cannot see it — and the trap is that the sequence looks
    identical to a successful one: you break, you run, you restore, everything
    is green, and you have learned nothing. The weighted-places branch hit this
    class **seven times in eight tasks**, three of them on sabotage steps
    rather than on test fixtures, which is what makes it a rule rather than an
    anecdote. All measured:

    - `<>` changed to `<` on a length check did not redden anything, because
      both agree on "too short" and diverge only on "too long", and every
      fixture was short.
    - Removing a class's `@lg:` prefix did not redden the "collapses to one
      track" case — and the prediction had been that the rule would then apply
      at EVERY width. It applies at no width: the unprefixed arbitrary-value
      class loses the cascade to `grid-cols-1`, so the grid collapsed
      everywhere and the collapse case passed trivially while three other cases
      reddened.
    - Lowering that threshold instead (`@lg:` → `@xs:`) did not redden it
      either. `@xs` is 20rem of CONTAINER, and the phone fixture's container is
      about 288px once page padding is priced in, so even the too-eager
      threshold leaves 320px collapsed.
    - A brief's order check selected `h3` elements where `PlainLeaf` renders a
      `<span>`. It would have compared `[]` to `[]` and passed forever.
    - A pad fixture `[1, 3, 1]` widened to five gives `[1, 3, 1, 1, 1]` whether
      the code pads with the constant `1` or with the LAST SHARE — because the
      last share is itself `1`. Rewritten to `[1, 3, 2]`, the pad-with-last-
      share sabotage reddens exactly.
    - Two more were caught before they were written, by choosing weights that
      are not a palindrome (`[1, 3, 1]` reversed is itself, so a renderer that
      reverses the array passes every test built on it) and by making a
      truncation (`[2, 5, 4]` → `[2, 5]`) that no preset lookup could have
      produced.

    The diagnostic is the same one and it costs nothing: **name the wrong
    behaviour you are excluding, and ask whether this fixture — or this
    sabotage — could tell it from the right one.** Where the answer is no and
    nothing at that level can discriminate, say so rather than writing
    something that looks like it does. That was the right answer twice here:
    the collapse case's own sabotage was reported as not discriminating rather
    than quietly counted, and the guard that actually pins the threshold was
    found a level down, in unit assertions that compare the class string
    verbatim.

30. **A comment describing what ANOTHER file does is a claim nothing checks,
    and it shipped two broken headline features on one branch.**
    `blocks.tsx` says three separate times that "the route asks the shell for a
    full-width `main`"; `page-shell.tsx` documents `COLUMN.full` as existing
    for exactly that; the prop's type admits it — and **no route ever passed
    it.** Both public pages asked for `"wide"`, so every page was laid inside a
    centred, padded `max-w-7xl` column, and three things were wrong at once: a
    second gutter inside the page's own (16px each side, which moved the
    container-query width at which a three-place section stops collapsing and
    reddened `weighted-places.spec.ts` on a viewport its own header had
    MEASURED), the two widest of the six measures silently capped at 80rem so
    two stops a person can pick did nothing, and a `bleed` section — this
    branch's own headline — unable to reach either edge.

    **Every unit test stayed green through all of it**, because they render
    `PublicBlocks` and assert `MEASURE_CLASS` as class STRINGS. The class was
    always right; the box it was laid in was not. This is rule 18 with the
    tense removed — `check:docs` compares a symbol against its own code, and
    none of those comments was about its own symbol — and it is the repository's
    own "a mocked dependency hides its own setup requirements", the suites that
    mocked the shell away being the ones that could not have caught it. The
    giveaway is a comment whose subject is a different file, and the check is
    one grep: **does the caller it describes exist?** `COLUMN.full` had no
    caller and no test mentioned it either, which is the same fact twice.

    **The same branch shipped the same shape one layer down.** `PAGE_MEASURES`
    gained six stops in TypeScript while `set_actor_theme`'s key allowlist
    never heard of `measure` — and that allowlist ends in
    `raise exception 'unknown theme key %'`, so picking a width did not merely
    fail to persist: it made the WHOLE theme save throw, every colour beside it
    included. `block-limits-match-migration.test.ts` exists to stop exactly
    this for `mode` and `kind`, and a seventh closed vocabulary was added
    beside it without being pinned to the SQL. **A vocabulary written down in
    two languages needs the test that says so in the same change**, and the
    cheap version is a regex over the migration — not because a regex is
    elegant but because nothing else in the build can see across the two.

    **The theme half of this is closed now (2026-08-27).** `PAGE_MEASURES`,
    `PAGE_FONTS` and `PAGE_SPACINGS` are compared against `set_actor_theme`'s
    own allowlist in `block-limits-match-migration.test.ts`, so the exact
    failure above — a seventh closed vocabulary added beside the pinned ones
    without being pinned itself — now reddens. Sabotaging the allowlist to
    forget one face reddens exactly that row. The block-level vocabularies were
    already pinned; the page-level ones were the gap this rule named and nobody
    had filled.

    A trap came with writing it, and it is the one this file already warns
    about two paragraphs down: the pattern was written as a plain template
    literal, so `[\s\S]` collapsed to `[sS]`, matched nothing, and would have
    passed forever. It was caught only because the file's convention is to
    assert the regex matched BEFORE comparing anything. Use `String.raw`.

    What found both was one browser test that seeded a REAL page through the
    product's own RPC and then measured boxes. Neither fault was reachable from
    any suite that mocked the shell or compared a class name, and the second
    was not reachable from any suite at all that did not write to a database.

31. **A SKIPPED test reports green, and a suite that skips most of itself when
    a secret is absent is the easiest way in this repository to believe work is
    verified when it is not.** `pnpm test:e2e` on a shell that has not sourced
    `.secrets` runs 48 of 136 cases and prints `48 passed` — no failures, no
    summary line anybody reads as a warning, and every suite that needs a
    Clerk identity quietly stood down by `global-setup.ts`. That skip is
    correct and must stay: a fork has no secrets and demanding them would turn
    a clean run into a hard failure. What is not correct is reading the result
    as a pass. Three shipped faults on one branch were invisible to every
    local run for exactly this reason, and CI would have caught all three —
    `e2e` is a required check and it HAS the secrets — so the cost was paid at
    the point where it is most expensive to diagnose rather than avoided.

    The habit: **before believing a browser run, check how many cases it
    skipped.** `set -a; . ./.secrets; set +a` in the same invocation is what
    makes the suite whole, and the number to compare against is the case count,
    not the word "passed". The same shape is worth suspecting anywhere a
    `test.skip` is conditioned on the environment rather than on the code.

32. **A test's cost is a property of the SUITE it lives in, and a flake there
    is fixed by moving it, never by widening its budget.** `source-bytes.test.ts`
    reads every text file in the repository — a gate on the repository, not a
    unit test of the hub — and it sat in `apps/hub/tests/`, where 128 jsdom
    worker files compete for one disk. It timed out once at 8618ms against
    vitest's 5000ms default, on the first run after a `git reset --hard` and a
    `pnpm install`: the one moment none of those files is in the OS cache, and
    the condition **every CI run starts in**. Measured afterwards it reads 67ms
    alone, 149ms with the Vite cache deleted, and 265ms under three sustained
    disk-load generators — so once a machine has run it the failure cannot be
    reproduced on demand, and that single observation is the whole of the
    evidence. Say so rather than implying a before-and-after nobody took.

    The tempting fix is a bigger timeout and it is wrong twice over: the number
    was never the fault, and a budget widened until a flake stops showing is
    rule 14's ceiling that lies about which runs are real. It moved to
    `tests/tools/` first — node environment, no jsdom — and then out of the test
    runner entirely: it is `scripts/check-source-bytes.mjs` now, a plain gate in
    `check:tools` beside `check-contrast`, `check-doc-freshness` and
    `check-schema-drift`, with `tests/tools/source-bytes.test.ts` covering its
    exported functions against fixtures. `check:tools` runs inside the required
    `conformance` job throughout, so nothing about the gating ever changed.

    **A warm-up phase was considered for this and refused, and the reason
    generalises past caches.** Reading the files once so the timed body hits a
    warm cache does not remove the cost, it moves it outside the assertion — and
    "the warm pass leaves the real pass fast enough" is a claim about wall-clock
    that only a cold run can settle. That is the same unmeasured claim in a
    different place, for twice the IO. The distinction worth keeping: **a
    failure mode eliminated by construction needs no observation, and a
    performance claim always does.** Bulk IO in a plain script is the first;
    bulk IO in a warmed test is the second wearing the first's clothes. Reach
    for the runner when you are testing logic and for a script when you are
    gating the repository — the three siblings above were already that shape and
    this was the odd one out.

    **The other half was a hand-maintained skip list, and that one was a
    correctness bug rather than a speed one.** The crawl carried eight directory
    names to skip, which is `.gitignore` restated by hand and free to drift from
    it. Measured, it read **204 files git does not list** — the local Claude
    settings and every `.superpowers/sdd/` brief and report — none of which
    exists on a runner and none of which can reach `main`. So the
    guard's file set was **machine-dependent** and a third of what it read was
    nobody's source. `git ls-files --cached --others --exclude-standard` is the
    set that can be committed, on every machine, with nothing to maintain.
    `--others` is what keeps a file written a moment ago and not yet staged
    inside the guard, which is exactly when a mangled escape is still catchable;
    `--cached` is why the list needs an existence filter, because a deletion
    that is not yet staged is a path git still reports with no bytes behind it.

    It narrows the guard — an ignored file is no longer read — so that hole is a
    **passing case** rather than a sentence, and the fixture is BUILT: the suite
    inits a throwaway repository holding one file of every kind the filter
    decides about. A checkout with no ignored text file in it would pass against
    a crawl and against git alike, which is rule 27 exactly.

    **That fixture then found a bug the real-tree assertion could not, and the
    shape is worth carrying.** `textFiles` returns repository-relative paths and
    its existence filter called `existsSync(path)` — resolved against the
    PROCESS, not the repository it was asked about. Invisible while the two
    agree, which they always did when the only caller was the repo's own root,
    and it drops every path the moment they do not. The instructive part is what
    that did to the cases beside it: with the list filtered to empty, the three
    negative assertions — ignores an ignored file, ignores a non-text extension,
    ignores a staged-then-deleted path — all went GREEN, vacuously. **A negative
    assertion passes for free when enumeration returns nothing**, so a suite of
    them needs a positive case proving the enumeration works at all, or it is
    rule 23 with better manners: the assertions ran and could not have failed.

    And the fix sprang the very trap the file exists for, which is worth knowing
    about the trap's reach: an escape in the new test collapsed into a literal
    newline on the way to disk, and what caught it was the parser, not the guard
    — a control character inside a string literal is a syntax error, whereas the
    NUL that started all this sat in a JSX attribute where nothing objects.

33. **ZERO TOLERANCE FOR FLAKINESS. A test that sometimes fails is a defect
    report, and the defect is usually not in the test.** Never retry it, never
    widen its timeout to make it stop, never mark it `skip` and move on. Find
    the mechanism, fix the mechanism, and write down what it was. A suite you
    have taught yourself to re-run is a suite that has stopped being evidence,
    and the day it goes red for a real reason is the day somebody re-runs it.

    **"Intermittent" is a description of what you observed, not of the cause,
    and treating it as the cause is the whole failure.** Measured 2026-08-26:
    `fursona-drag-reorder.spec.ts` failed about one run in three, then three
    runs in three, and both readings were of the same monotonic clock rather
    than of chance. The drop always landed — the live region announced it — and
    the list
    always reordered; it took **5985ms, 5974ms, 5973ms**, three readings inside
    12ms of each other, against `expect.poll`'s 5000ms default. Nothing was
    random. A fixed threshold was being crossed by a number that only ever goes
    up.

    What made it go up is the part worth carrying. `readArrangement` selects
    `actor_profiles` with **no filter**, because RLS is what narrows it — and
    the policy was `using (owns_active_actor(actor_ref))`, a `security definer`
    function, which Postgres cannot inline and therefore calls **once per row**.
    Every end-to-end run leaves its fixtures behind, so the table had reached
    6,206 rows, and one read of nine of them was:

    ```
    Seq Scan on actor_profiles (actual time=542..1383 rows=9 loops=1)
      Filter: owns_active_actor(actor_ref)
      Rows Removed by Filter: 6206
      Buffers: shared hit=56748
    Execution Time: 1383.579 ms
    ```

    Three concurrent copies of that is the six seconds. **So the flake was a
    performance regression that had been growing for months, and the test was
    the only thing in the repository telling anyone about it.** Widening the
    timeout — the obvious fix, and the one this rule exists to forbid — would
    have deleted the only signal that a person's own fursona list takes five
    seconds to settle.

    The fix is a set-returning `security definer` function, evaluated once as a
    hashed subplan, with the policy asking for membership rather than calling a
    predicate per row: **1387ms to 2.5ms, 56,869 buffers to 767.** Two things
    about doing that safely generalise. A policy expression runs as the CALLING
    role, so the obvious rewrite — inlining the subquery into the policy — fails
    with `permission denied for table actors`, which is exactly why the original
    used a definer function and is a good reason to keep one. And **speed is
    worthless on an RLS policy unless the visible set is provably identical**:
    that was checked across 61 callers, including one whose identity does not
    exist, with 59 of them able to see something, because a comparison where
    both sides return nothing is rule 27 wearing a security hat.

    **The one thing this rule does NOT forbid is naming a cost you have
    measured (2026-08-27).** A DEFAULT is not a budget anybody chose.
    `block-editor.test.tsx`'s cap case renders `BLOCK_LIMITS.blocks` — 500 —
    real leaf editors into jsdom, and sat against vitest's generic 5000ms:
    measured at 843/858ms with the card eyebrow rendering nothing and
    1048/1056ms with it, while CI ran the same case at 5314ms and timed out.
    At about 5x this machine the case was already inside 15% of the ceiling
    **before** the eyebrow existed, with no headroom for a loaded runner.

    So the forbidden move is raising a number until a red run goes green
    without knowing why. Naming an explicit ceiling, on a case that asserts no
    duration, with the readings and the mechanism written beside it, is the
    opposite act — and the giveaway is that it comes with numbers. A micro-fix
    was tried first and refused for the right reason: replacing the leaf's icon
    with a CSS box read 896–1043ms against 1048/1056, distributions that
    overlap, so rule 14 says there is no claim there to make.

34. **A SABOTAGE that restores with `git` restores to the last COMMIT, which is
    not where you were.** "Break it, run it, put it back" is the discipline this
    file is built on, and the putting-back has a trap: a `git checkout -- <file>`
    is the obvious way to undo a mutation, and it silently discards every
    uncommitted change in that file — including the work the sabotage was
    supposed to be verifying. It happened here. A hide-controls button was
    written, a sabotage script mutated the same file and "restored" it with
    `git checkout --`, and the button was gone. Nothing failed: the next run
    reported the case could not find its control, which reads exactly like a
    test that was written wrong.

    **Copy the file before the edit and copy it back**, and put the restore in a
    shell `trap` so a crash cannot leave the tree sabotaged — rule 20's
    requirement, met by a mechanism that cannot also delete your work.

    The general form is worth more than the git detail: **a restore step that
    is not the exact inverse of the mutation step is a second mutation.**
    `git checkout` inverts every change since the last commit, not the one you
    just made, and the difference is invisible in a green run.

35. **A test that passes in a suite and fails alone has an isolation defect,
    and the defect is evidence about the SUITE.** The two are not the same
    program: running the file gives every case the fixtures its neighbours
    built, running one gives it only its own. This is how a case that depends
    on a neighbour looks perfectly healthy for months.

    It is worth stating because the diagnostic instinct is backwards. A case
    failing alone reads as "the filter is wrong" or "the runner is flaky", and
    both were assumed here before the real answer — that the file under test
    had been reverted out from under it by rule 34's trap. **Check what the
    isolated run is actually missing before concluding the isolation is at
    fault**, because the same symptom covers a genuine dependency between cases
    and a source file that is no longer what you think it is.

36. **A Tailwind class that compiles to NOTHING is indistinguishable, in every
    test this repository has, from one that works.** `image_fit` was written as
    `object-(--img-fit)`, which reads exactly like the token utilities beside it
    — `bg-(--menu)`, `text-(--muted)`, `border-(--edge)` — and emits no CSS at
    all: the `(--var)` shorthand resolves against a utility's OWN namespace, and
    `object-`'s is `object-position`, not `object-fit`. Measured by compiling
    the candidate through the installed Tailwind directly, which is the cheap
    diagnostic and the one to reach for: `object-(--img-fit)` produced an empty
    rule set where `[object-fit:var(--img-fit)]` produced the property.

    **Every unit test was green and every one of them had to be.** They render
    the component and assert CLASS STRINGS, and the class string was always
    precisely what was intended — so the suite could confirm what the class is
    CALLED and had no way to ask what it MEANS. That is root rule 30 with the
    subject moved one step in: not a comment about another file, but a claim
    about another system's behaviour, checked by a test that never consults
    that system. The stylesheet is a dependency like any other, and this is
    "a mocked dependency hides its own setup requirements" with the mock being
    the assumption that a plausible class name resolves.

    Two things settle it and nothing cheaper does. **Compile the candidate**
    when a utility is being written for the first time in an unfamiliar shape;
    and where the class carries a feature rather than a decoration, **assert
    the COMPUTED property in a browser** — `blocks-render.spec.ts`'s fit case
    does, with a control block asserting that absence is still the crop every
    stored page has, because a stylesheet where both resolved the same way
    would otherwise pass. Restoring the shorthand reddens it and reddens
    nothing else.

37. **A write path's looseness is usually justified by a CONTROL, and the
    justification is void the moment a paste box exists.** `themeSchema` — the
    schema the editor's form validates against — is loose on `accent`,
    `cursor`, `backgroundUrl` and the three dials, and its own TSDoc gives the
    reason in two sentences: the colours are `#rrggbb` or null _"and nothing
    else is reachable through a colour input"_, and the dials are loose
    _"since a slider cannot produce anything else"_. Both are true. Both are
    statements about a **user interface** rather than about the data, and
    `canvasColours` is `z.array(z.string())` there with no length bound at
    all — a picker produces a handful, a paste can carry a hundred thousand.

    So an import must use the **READ** path's guards, never the write path's.
    `parseTheme` already existed and was already correct, because it was
    written for a `jsonb` column nobody controls: it normalises every colour,
    drops what is not `#rrggbb`, caps the list, clamps every dial and falls
    back per field. Nothing new had to be written; what had to be noticed was
    which of two functions was the right one.

    The giveaway is mechanical and worth grepping for: **a schema comment
    whose reason names a widget.** "A slider cannot", "nothing else is
    reachable through", "the picker only offers" — each is a guard credited to
    a control, and each becomes false the day a second way in exists. It is
    the repository's own "a mocked dependency hides its own setup
    requirements" one level up, with the thing being assumed upstream being a
    user interface rather than a module.

    Found designing `2026-08-27-page-source-and-sharing-design.md`, before any
    of it was built — which is the cheap way to find it and not the usual one.

38. **A responsive fault can live in a BAND a few dozen pixels wide, and the
    band starts at whichever breakpoint you just used.** Adding the writing
    switch to the editor's toolbar meant three things arrived at `sm` at once:
    the row going from two lines to one, Hide controls and Cancel getting their
    words back, and the switch swapping its two-letter codes for
    `English`/`Español`. Measured, the row then wanted **673px against a 640px
    viewport** — and overflowed from exactly 640 to about 672 **and nowhere
    else**. 320 was clean, 700 was clean, every desktop width was clean.

    **The habit that misses it is the obvious one**: check a phone width and a
    desktop width, see nothing, move on. Both of those readings are true and
    neither is anywhere near the fault. A breakpoint is a discontinuity, and a
    discontinuity is where a layout's cost jumps — so the width to look at is
    the one immediately at and above each breakpoint the change touches, not
    the sizes you happen to think in. Sweeping 360/500/600/639/640/700/767/768
    took one run and named the band to the pixel.

    The fix generalises too, and it is not "shave everything": **stagger the
    arrivals.** Deferring the endonyms one step to `md` left the single row
    61px of slack where it first appears and 95px where they arrive. Where a
    row genuinely cannot hold what is asked of it — this one wanted 345.1px
    against a 288px box at 320, and trimming every icon button and Save's
    padding gives back 32 — letting it WRAP keeps every control the size it was
    designed at, and here it also gave a phone the page title it had never
    shown at all.

    This is rule 30's shape with the subject moved: not a claim about another
    file, but a claim about a range of widths, verified at two points inside it
    and false in between.

39. **A containment boundary enumerated BY HAND is only as good as its list,
    and nothing static can see the list is short.** `CHROME_SCOPE` is the
    editor's promise that a control stays AeleOS's whatever the author does to
    their page, and it keeps that promise by re-declaring properties on the
    island. `color` was on the list because it leaked once; `font-family`
    because it leaked once. **`font-size` was never on it**, and a page's
    `spacing` writes one — so choosing `compact` shrank the workbench: 45 of 77
    marked controls, every island 16px to 13px, and the select that set it
    shrinking under the pointer. Nothing failed. No type, no linter and no unit
    test knows which inheritable properties a theme has learned to write, so
    the boundary silently narrows every time a theme gains a key and nobody
    thinks of the island.

    **The second leak is the one that generalises furthest, because the
    property WAS restated.** The island said `font-family: var(--font-sans)`,
    and the author's typeface writes `--font-sans` — so the declaration was
    present, correct, and resolved somebody else's value. **Restating a
    declaration is not enough when the declaration reads a token somebody else
    can write**; the token has to be restated too, or captured where they
    cannot reach it. This repo already knew the shape from `--surface` and
    `--bar` and had written it down for colours; it recurred on a property
    because the note named the two tokens rather than the class of hazard.

    Two smaller things fell out, both measured rather than reasoned. **A
    reset that must lose to a local override should read a TOKEN rather than
    win a cascade fight** — `font-size: var(--chrome-text, 1rem)` leaves an
    island's own `--chrome-text` free to differ, where a bare `1rem` in an
    unlayered rule beat a `text-sm` on the same element and silently resized a
    button. And **the guard for a "nothing changed" claim is the assertion that
    something DID** — `controls-stay-stable.spec.ts` asserts the author's page
    moved in the same breath as asserting no control did, because a fixture
    where the theme never applied reports "nothing changed" too. That half is
    proved capable of failing by choosing a value the control already holds.

**`@typescript-eslint/no-deprecated` is enabled, with no exceptions**, and it
is the only check that reads our DEPENDENCIES' deprecations rather than ours. It
found Clerk's warning that middleware path-matching "can leave protected
resources reachable", and next-intl's whole locale API.

Getting there cost a restructure worth knowing about. `next/root-params` only
exposes a segment belonging to the ROOT layout, so `[locale]/layout.tsx` owns
`<html>` now and `app/layout.tsx` is gone. **A language change therefore
REPLACES the document element** — proved with a marker attribute, not inferred —
so anything set imperatively on it is lost. `HtmlLang` puts back all three:
`lang`, `data-theme` recomputed from the same inputs the pre-paint script reads,
and `data-page-theme` from module memory, because `setPageTheme` persists
nothing by design.

This was refused once, on the argument that a layout effect is a weaker
guarantee than a script the browser cannot paint before. **That argument was
wrong and the way it was wrong is rule 10 below**: 184 frames were sampled across
a language change and none painted without the theme.

**A second finding is open.** `fast-check` refuted the claim that derived text
clears 4.5:1 wherever a colour could: on `#e21233` light text reaches 4.12 where
dark would reach 4.81, and none of the fifteen hand-picked backgrounds in
`palette.test.ts` is such a colour. Nothing asserts it, the reproduction is in
`palette-properties.test.ts`, and it is not a property to weaken until it
passes.

**CI gates on `main`:** six jobs are **required**, and a pull request cannot
merge until all six report green — `conformance` (schema suite), `hub` (hub and
`@aeleos/identity` unit tests, both at 100% coverage, plus the production build),
`idp-cloud` (real Clerk ⇄ Supabase trust), `e2e` (the Playwright suite against
a real Chromium — the only browser-level proof the signed-out app handoff works),
`schema-drift` (live database vs `supabase/migrations/`) and `canvas` (dial and
throttled-page cost). Branch protection is `strict`, so a branch must also be
up to date with `main` before it merges, and **admins are not exempt**: there is
no one who can push past a red check. Merges are **squash only** (merge commits
and rebases are off), history on `main` is linear, force-pushes and deleting
`main` are off, and unresolved review threads block merge. Same-repo PRs turn
**squash auto-merge on when they open** (`.github/workflows/auto-merge.yml`),
using `GH_TOKEN` so the merge is the PAT's user and still fires `deploy`.
Drafts wait until they are marked ready; fork PRs are left alone. The required-check
list still lives in repository settings, not in the workflow file — read it
from the API rather than inferring it from the YAML:

```bash
gh api repos/vaoan/AeleOS/branches/main/protection/required_status_checks --jq '.contexts'
```

Fork pull requests are the other catch. `e2e`, `idp-cloud`, `schema-drift` and
`canvas` all skip on forks because secrets are withheld there — on a fork they
cannot report green at all, so that route needs the owner.

`canvas` and `schema-drift` are on that required list (2026-08-20). `canvas`
measures every canvas at the top of both dials and then what a
personalised page costs on a throttled phone; both faults it guards against
shipped to `main` under a green tick. Its dial half was stood down while the
block model's first phases landed, because the fixture is built from mode and
kind pairs the flat editor of the day had no name for, so the route it measures
opened empty; the editor port restored it and both halves run. That guard's own
note is where rule 21 came from.

`schema-drift` runs `pnpm check:schema-drift`, and it exists because of the
in-place-migration hazard above:
it compares `supabase/migrations/` against the **live** project, which is the
one thing no other check looks at. It carries the same fork `if:` guard as
`idp-cloud`, because it needs the database password.

It runs `supabase db diff` under each of the engines it needs, and **no pass is
ever skipped because an earlier one was clean** — that ordering is the design
rather than belt-and-braces. `migra` reads structure with no noise and is
**blind to `COMMENT ON`**, proven by perturbing a live column comment and
watching it report nothing, so a `pg-delta` pass counting only `COMMENT ON`
runs first. That pass is also what makes a green verdict honest: given a wrong
password the CLI's migra engine exits 0 and prints "No schema changes found",
byte-identical to a clean project, so a migra-only job would have gone
permanently green the moment the secret rotated. Where it goes red for
something other than drift, it is still working: a pull request that **adds** a
migration stays red until it is pushed to live, which is how this repo already
works, and a new table stays red until it grants `service_role`.

Claude's role throughout: build and test the hub here, specify exactly what to
configure in Clerk, and write the per-app integration code in the respective app
repos.
