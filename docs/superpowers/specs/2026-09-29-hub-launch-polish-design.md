# Hub launch polish — Design

<!-- cspell:words básico está línea Crea tuyo propia — Spanish interface copy quoted verbatim -->

- **Date:** 2026-09-29
- **Status:** Designed, not built.
- **Scope:** Everything a person meets before and around the editor: the
  landing page, sign-in, `/me`, `/pages`, a new first-run flow at
  `/pages/new`, a new share screen, the public person and fursona pages, the
  brand mark and icons, and the hub's own launch on `me.furrycolombia.com`.
  The editor's building mechanics (selection, palette, dragging, the source
  dock) keep their jobs.
- **Does not supersede:** `2026-08-27-the-editor-wears-the-page-design.md`
  (this design leans on it: the gallery is a page wearing a look, exactly as
  the editor is), `2026-09-04-carrd-style-page-builder-design.md`,
  `2026-09-05-palette-drag-to-add-design.md`,
  `2026-09-02-editor-interaction-and-motion-design.md` (Motion stays in
  `CHROME_SCOPE`, never in the public renderer).
- **Continues:** `docs/superpowers/plans/2026-08-11-hub-deployment.md`, whose
  Tasks 5–7 were deferred "to the hub's own launch" on 2026-09-27. This is
  that launch.

## 1. Context

The owner, 2026-09-29, with Libra and the production Clerk instance live:
the hub "feels amateur when I use it. It doesn't have that easy and
comfortable way like carrd.co." A walkthrough as a brand-new person the same
day (throwaway development identity, since deleted) found the engine capable
and the experience around it unfinished:

- The editor opened on a dashed circle, two labels and the number `12576`,
  beside a side panel reading "Palette" over empty space.
- Name, handle, avatar and "Start from a template" sat behind a small
  "Page" button; templates were a text list below the fold.
- Seventeen skins and twenty-three backdrops sat in `<select>` elements at
  the foot of a collapsed disclosure inside the Theme tab. Switching one
  page to `sticker` over `confetti` transformed it; nobody would find that.
- A public page read like a record: "Name", "Handle" and "Owner" captions,
  the owner as a bare number in a box, an empty dashed avatar.
- Saving a new page returned to the list: no link, no share, no moment. New
  pages start Private.
- The landing page was one card with a Sign in button. The hub has no
  `public/` directory, no favicon (`/favicon.ico` 404s) and no imagery.
- The pages list showed "R" for "Ember the Fox", because
  `fursona-row.tsx:240` takes the initial from the handle.
- Sign-in offered Discord, Google and Facebook
  (`features/session/infrastructure/providers.ts`); production offers
  Discord, Google and email code, so the Facebook button would fail there and
  email had no way in.
- The Spanish reference-sheet template says "Lo basico".

## 2. Decisions taken with the owner (2026-09-29)

1. **The hub lives at `me.furrycolombia.com`.** The apex `furrycolombia.com`
   is never touched by this work: no link, QR, canonical or DNS record names
   it.
2. **Keep the member number; make it a badge.** The addressing rules in
   `apps/hub/src/features/actors/CLAUDE.md` stand unchanged: a permanent
   sequential number per person, vanity addresses granted only by
   `service_role`, no self-service write. The number is shown as
   "Member #12576" rather than as a bare `12576`.
3. **Phone first to start, desktop to fine-tune.** The first-run flow is
   designed at phone width and widens; the full editor stays desktop-first.
4. **Two rows of looks, Fresh and Throwback,** with brand names removed from
   everything a person reads.
5. **Applying a look copies structure, never prose** — the rule
   `fursona-templates.ts` already states for templates.
6. **Publish is the primary action of the first run;** "keep it private for
   now" is the secondary one.
7. **Empty cards stay visible on public pages.** A text block with a title
   and no body is rendered as it is today. (Proposed and declined: hiding
   them.)
8. **No mascot yet.** A geometric mark carries the brand, and the landing
   hero and empty states keep a place a mascot can move into.
9. **Never an iframe.** A per-card iframe gallery was proposed and refused:
   "It makes it harder to integrate." `frame-ancestors` stays `'none'`
   (`shared/domain/csp.ts`, pinned by `tests/csp.test.ts`). The gallery is
   instead the document wearing one look at a time (§5.3).

## 3. Invariants

- The page document stays `{ theme, blocks }`; one public renderer
  (`PublicProfile` over `presentation/blocks.tsx`); no x/y positioning;
  colour stays page-level; required identity leaves stay undeletable.
- `identity_sub` and `actor_ref` are untouched. An address, and now a member
  number, is a display value and a URL segment, never a key.
- $0: no paid service, font, icon set or QR API. Every new dependency is
  open source and runs in the browser or at build time.
- Every string a person reads is in both catalogues
  (`shared/infrastructure/i18n/messages/{es,en}.json`), Spanish written first.
- Every animation honours `prefers-reduced-motion`; Motion is imported only
  inside `CHROME_SCOPE`.
- Every bug named in §1 gets a regression test, sabotage-verified against the
  original fault, at the level the bug lived.

## 4. Part A — launch fixes

1. **The empty side panel.** With nothing selected the panel renders its tab
   strip with no tab selected and no tab panel. The cause is diagnosed at the
   plan's first task, not assumed here. The required behaviour: whenever
   nothing is selected, the panel shows the Page tab, whose form is what a
   new page needs first. Regression test at browser level: open
   `/pages/new`, press Escape, the Page form is visible.
2. **Sign-in matches production.** `PROVIDERS` becomes Discord and Google;
   Facebook, its mark and its tests go. Below them, **email code**: an email
   field, then a six-digit code field, driven by Clerk's `signIn` with the
   `email_code` strategy and styled as the existing buttons. The development
   instance must offer email code as well, or the path cannot be tested; if
   it does not, it is enabled in the Clerk dashboard through the Playwright
   browser the owner signs into, and `docs/deployment.md` records who did
   which step.
3. **One initial, from the name.** A single `initialOf(displayName)` feeds the
   pages list and the avatar placeholder (§6). Regression test: a row for
   "Ember the Fox" with handle `review-fox` shows "E".
4. **`/me` becomes a profile card.** Avatar, display name and the member badge
   at the top; an **Edit profile** button to `/me/edit`, which nothing links
   to today; the address as a copyable link; the platform ID moves into a
   collapsed "Technical details" disclosure with its existing explanation.
5. **An empty `/pages` is an invitation.** With no fursonas, the search field
   and filter pills are not rendered; a card says, in both languages, "Make
   your first fursona" and links to `/pages/new`. With one or more, today's
   list is unchanged.
6. **"Lo básico".** The catalogue string is corrected.
7. **The favicon** ships with the mark in Part E, so the icon is designed
   once.

## 5. Part B — looks, the gallery and the first run

### 5.1 One model for everything pickable

```ts
interface Look extends FursonaTemplate {
  // { id, blocks, theme }
  row: "fresh" | "throwback";
}
```

`blocks` is the **preview page**: complete, with sample prose and pictures,
authored by us. The applied page is derived from it by one pure function,
`toStructure(blocks)`, which keeps titles, layout, icons, styles and the
theme's own pictures, and empties every description, body, link and block
picture. One source, so a preview can never show a structure that applying
would not produce. Names and mood lines live in the catalogues under
`looks.<id>.name` / `looks.<id>.mood`, so a missing Spanish one fails the
build as template names do today. Home: `features/actors/domain/looks/`.

- **Throwback (16).** The eleven pastiches move from
  `scripts/pastiche-pages.mjs` into TypeScript, every measurement comment
  carried unchanged; the five era looks join them. The seeder reads a
  generated JSON file, exactly the arrangement `era-looks.ts` already has
  with `scripts/era-looks.generated.json`, so the showcase pages and the
  gallery have one source. A person reads names by feel — "2008 profile",
  "Night skyline", "Messenger window", "Photolog" — and brand names survive
  only in code comments.
- **Fresh (8).** New looks, each one of the four starter layouts (reference
  sheet, character story, art gallery, fursuit) dressed in a skin, backdrop,
  typeface, accent and gradient chosen together: Sticker, Candy, Soft clay,
  Neon glow, Frosted glass, Paper, Comic and Neobrutalism. The four starter
  layouts stop being a separate picker; they are what the Fresh looks are
  made of.

### 5.2 The sample fursona

Previews render a fixed sample actor, "Ember", with a sample owner. The
sample never reaches a saved page: `toStructure` removes its prose, and the
identity leaves are the person's own the moment the name sheet (§5.4) is
filled.

### 5.3 The gallery is the page

The gallery renders **one** look at a time as the whole document: the real
`PublicProfile` for the sample, wearing the look through the same document
theming the editor uses, backdrop animating. Nothing is framed and nothing
is scaled.

- **Phone.** A swipe anywhere on the page (horizontal pointer movement past a
  threshold; the page region is `touch-action: pan-y`, so vertical scrolling
  stays native) changes the document to the next or previous look. A chrome
  bar pinned to the bottom, an `.aeleos-chrome` island so it keeps the hub's
  palette whatever the look, carries the look's name and mood line, position
  dots, previous and next buttons, the **Fresh | Throwback** switch, **Use
  this look**, and a quiet "Start blank".
- **Desktop.** A narrow chrome list of looks on the left, each with a swatch
  chip drawn in chrome from the look's accent, gradient and skin corners; the
  page wearing the selected look fills the rest. The chip is an
  approximation and is labelled as the look's name, never presented as a
  preview.
- **Keyboard.** Left and right arrows move between looks; the list is a
  listbox; the current look is announced.

The chosen look is kept in the URL (`?look=<id>`), so reload and back
restore it.

### 5.4 The first run

`/pages/new` stops opening the editor and becomes three steps:

1. **Pick a look** — the gallery.
2. **Who is this?** — a sheet over the chosen look, which updates live behind
   it: **Name** (the one required field); **Handle**, suggested from the name
   (NFD-folded, lower-cased, runs of anything outside `[a-z0-9_-]` become one
   dash, trimmed to 32, matching the handle grammar) and editable, with its
   availability shown as it is typed; **Picture**, an optional pasted link.
   The full address is written out: `me.furrycolombia.com/12576/ember-the-fox`.
   **Publish** saves with visibility public; "Keep it private for now" saves
   private.
3. **Live** — the share screen (§6.1) with the celebration on.

"Start blank" leads to today's editor with the required blocks. How
availability is checked is settled at planning: handles are unique per
owner and never freed, so the check is against the owner's own live and
retired handles; if no read exposes retired ones, the save's refusal is
surfaced inline on the Handle field instead of being pre-checked.

### 5.5 Change look

The editor gains **Change look**, opening the gallery over the page being
edited. On a page with content it applies the look's **theme only**, never
its blocks, so nothing a person wrote is replaced. The Theme tab's skin and
backdrop `<select>`s become swatch grids: each skin a small chrome tile in
its own corners and border, each backdrop a tile with its name. The gradient
editor moves under an "Advanced" disclosure below them.

## 6. Part C — the share screen and the public page

### 6.1 `/pages/[handle]/share`

The destination of a first-run Publish (`?new=1`), of any editor save that
takes a page from private or unlisted to public, and of a new share button on
every `/pages` row.

- **"Ember is live!"** / "¡Ember ya está en línea!" with `?new=1`; a plain
  title without it. One confetti burst on `?new=1`, Motion, chrome scope,
  absent under reduced motion.
- **The link written out:** `me.furrycolombia.com/{address}/{handle}`, the
  vanity address when there is one (the `rel="canonical"` rule), without a
  locale prefix, provided a prefix-less path redirects to the visitor's
  language; if planning finds it does not, the link keeps the prefix.
- **Share** (Web Share API; hidden where unsupported), **Copy link**
  ("Copied ✓"), **Show QR** (full-screen, high contrast, tap to close,
  generated in the browser by an open-source encoder chosen and size-checked
  at planning), **View page**, **Customise**.
- A private page's share screen says it is private and offers **Publish**
  in place of Share.

### 6.2 Public pages that look finished

- **Identity without captions.** The display name is the heading; the
  handle reads `@ember-the-fox`; the owner becomes a chip, "by Luna ·
  Member #12576", linking to the owner's address. When the owner's name is
  gated (`public_fursona` returns null for a private owner), the chip reads
  "Member #12576" alone. The editor shows the same, since it wears the page.
- **An empty avatar** is the name's initial on a disc tinted from the page's
  accent, not a dashed circle.
- **"Made with AeleOS · Make yours"** / "Hecho con AeleOS · Crea el tuyo": a
  static footer line in the page's own colours on every public page, linking
  to the landing page. No Motion.

### 6.3 The member number reaches the renderer

The public reads return the _canonical_ address, which is the vanity when
one exists, so a vanity holder's number is not available today.
`public_person`, `public_fursona` and `my_address` each gain the owner's
number (`kind = 'number'` row) as a separate column. The number already
resolves publicly to the same profile, so returning it discloses nothing
the canonical address does not. This is an **edited migration**, applied to
live last, immediately before merge, one PR at a time
(`docs/lessons/conventions/squash-the-migrations-and-squash-them-again.md`;
the owner runs `/apply-migration-edit`). `pnpm test:db` covers each read
with and without a vanity.

## 7. Part D — voice

- **The mark.** One geometric SVG from the theme's own idea — a small star
  held in a soft swirl — legible at 16 px. From it: `app/icon.svg`,
  `app/icon.png`, `app/apple-icon.png`, and an Open Graph image, via Next's
  file conventions (confirmed against `node_modules/next/dist/docs` at
  planning). Public pages get a generated share image with the fursona's name
  over their accent and gradient.
- **The landing page.** The hero is a small sample page, and the landing
  document itself changes into the next look every few seconds (still under
  reduced motion). Headline "Tu fursona, con casa propia" / "Your fursona's
  home on the web"; primary action **Make yours, free** to sign-in and then
  the gallery. A Throwback strip links the showcase pages by their new
  names. Below, in a supporting role, "One account for every Furry Colombia
  app". A signed-in visitor goes to `/pages`. The hero keeps a marked place
  for a future mascot.
- **Copy.** Warm and a little playful, Colombian Spanish with _tú_, English
  matched to it, for the surfaces this design touches: landing, sign-in,
  first run, share, `/me`, `/pages`, empty states. The editor's other strings
  are out of scope.
- **Motion.** Look changes cross-fade; buttons answer a press; the confetti
  runs once. All in chrome, all off under reduced motion.

## 8. Part E — launch

Once Parts A–D are merged: `2026-08-11-hub-deployment.md` Tasks 5–7 — the
e2e suite against a deployed URL, the Vercel project on the production Clerk
keys, and `me.furrycolombia.com` proved. The plan gets a dated re-scope box
if its steps have moved since 2026-08-11.

## 9. Order

Each part is its own PR, in order, each with picture proof:

1. **A** — launch fixes (no migration).
2. **B** — looks, gallery, first run, change look, swatches.
3. **C** — share screen, public identity, footer, the member-number
   migration (applied last, with nothing else open).
4. **D** — mark, icons, landing, copy.
5. **E** — launch.

PR #93 (`scrolled-drag`) is open and touches the editor; Part B avoids its
files where it can and rebases onto it if it merges first.

## 10. Proof

- **Unit:** every look passes the block schema and the theme parser, has
  both catalogue entries, and `toStructure` leaves no description, body,
  link or block picture; `initialOf`; the handle suggestion; the share link
  (vanity over number, no prefix).
- **Database:** the three reads return the number with and without a vanity.
- **Browser, phone viewport:** swipe → Use this look → name → Publish →
  share screen with the right link; Copy writes it; the rendered QR decodes
  to it; no confetti under reduced motion; `/pages/new` then Escape shows
  the Page form; email-code sign-in reaches `/me`; a public page shows no
  identity captions and the member chip.
- **Performance:** a gallery case inside the existing canvas-performance
  budget, switching looks repeatedly.
- **Accessibility:** the existing axe suite extended to the gallery, the
  share screen and the landing page.

## 11. Settled at planning, not here

- Why the side panel renders no tab when nothing is selected.
- Whether the development Clerk instance offers email code.
- Whether a prefix-less public path redirects to a locale.
- Which read, if any, exposes an owner's retired handles.
- The QR encoder, its licence and its size.
- Next's icon and Open Graph file conventions in the installed version.

## 12. Out of scope

Self-service vanity addresses (refused by the addressing rules); a mascot
illustration; uploads of any kind (media stays pasted links); rewriting the
editor's remaining strings; a mobile-first rebuild of the full editor.
