# The editor wears the page

**Status: designed, 2026-08-27.**

This supersedes two specs whose banners say complete, and both banners are
updated in the same change rather than left to be discovered:

- `2026-08-24-atmosphere-and-page-fidelity-design.md`, which put a chosen few
  properties on the editor document while a page-scale surface was open.
- `2026-08-26-preview-route-design.md`, which framed a real route in an iframe
  to give a draft its own viewport.

Both were answers to the same question. This replaces the question.

## What is wrong today

An author builds a page in a workbench and judges it in a preview. The preview
has been made steadily more faithful — a shared renderer, then a shared
atmosphere, then a whole second document — and it is still not the page,
because a preview is a picture of a page and the editor is where the person
actually is.

The per-section trays are the visible half of that. A tray calls `Block`
directly rather than `PublicBlocks`, so it never applies `pageBoxClass` at all:
no measure, no bleed, no margins, no first, between or last spacing. Then it
adds what a page has none of — a label, `p-3`, a rounded face, a border, and a
`--surface` fill at 90% alpha. Behind it, `PreviewThemeHost` paints `--field`
on an in-flow box, so the author's gradient is anchored to that box rather than
to the window, the nebula canvas is not behind it at all, and a block with no
background of its own shows a card where a page would show the sky.

The complete preview closed most of that by being a document. It could not
close the rest, and its own spec says why: a framed preview is exactly as
faithful as its viewport matches a real one, so it is always at some invented
size.

## The decision

**The editor document wears the author's theme, and the controls are
contained instead.**

This is an inversion rather than an improvement. Today the app owns the
document and each preview is a boxed exception. Tomorrow the page owns the
document — through `ThemeScope`, the same component a public route uses — and
each control is a boxed exception wearing the app's own light or dark tokens.

Three things follow, and the third is the point.

**The canvas comes for free.** `NebulaCanvas` is mounted in
`[locale]/layout.tsx` for every route and reads its dials from `:root`. Once the
author's theme is at `:root`, the author's canvas is behind the editor without
anything being written to put it there.

**A transparent block becomes possible to judge.** What is behind a page has to
be behind the document; there is no arrangement of boxes that puts a window's
backdrop inside one of them.

**Hiding the controls yields the page.** Not a picture of it: the same
document, the same window, the same scroll, the same canvas. The iframe existed
to buy back a viewport the editor had given away by containing the theme; once
the editor stops containing it, there is nothing left to buy.

## What is deleted

- `app/[locale]/(preview)/me/preview/` — the route.
- `presentation/preview-document.tsx` — the framed document and its backdrop
  banding.
- `presentation/preview-message.ts` — the handshake and the draft contract.
- `presentation/complete-page-preview.tsx` — the disclosure, the device
  switcher, the scaling and the height measurement.
- `domain/preview-devices.ts` — the device table.
- `presentation/preview-theme-host.tsx` — the boxed theme.
- `atmosphereCss` in `domain/actor-theme.ts`, and its two callers' use of it.
- `tests/e2e/preview-fidelity.spec.ts` and
  `tests/e2e/complete-page-fidelity.spec.ts`, replaced by the suite in
  "The proof" below.

`frame-ancestors` returns to `none`. It was widened to `self` on 2026-08-26 for
exactly one reason — this app framing its own preview — and that reason is gone.
The narrower value is stricter and was the original.

## The mechanism

### Chrome tokens

`globals.css` declares the app's tokens in a `:root` block and a
`[data-theme="dark"]` block. Those selectors widen to name a chrome class
alongside the root, so a control island wearing that class resolves the app
palette whatever the author wrote at `:root`. One edit, no values duplicated,
nothing to keep in step.

**The trap, and it is the one this repository has already paid for twice.**
`ThemeScope` injects its stylesheet unlayered, and an unlayered rule beats every
layered one regardless of specificity — silently, and forever. A chrome block
sitting inside a Tailwind layer loses, controls wear the author's palette, and
nothing fails. The chrome declarations must therefore be unlayered too, and the
claim is not believed until a hostile palette is put on a fixture and a control
is watched going red without it.

### The tray becomes a page slot

Everything that makes a tray a card is chrome and moves into the control card:
the label, the padding, the rounded face, the border, the surface fill. What
remains renders through `pageBoxClass`, so a section in the editor is laid in
the author's measure, bleeds when it bleeds, and carries the same first,
between and last spacing a public page gives it.

`overflow-x-auto` is removed. It is the 2026-08-25 fault still in place: a
`visible` axis paired with a non-visible one computes to `auto`, so the box
clips on all four edges, and ink overflow is not scrollable overflow — so
nothing scrolls, no scrollbar appears, and every `neon` glow and `comic` shadow
in a tray is silently cut off.

The editor's `main` goes full width, as the public routes already do, and the
control cards keep their own column. A section owning its own measure is what
makes one able to bleed without `w-screen`.

### Hiding the controls

One toggle removes the control cards, the editor bars and the tray chrome,
leaving `PageContent` at full width and the sections — which is the live page's
own stack. The affordance that brings them back is a floating control
positioned outside `page-content`, so it cannot enter the comparison below.

## The proof

A Playwright suite photographs `page-content` in hide-controls mode against the
same region on the live page, at the same real viewport and the same pinned
scroll offset, and requires the existing budget of a tenth of a percent.
`sectionBoxes` equality is asserted alongside it, because a size difference
should report a height against a height rather than a percentage.

### The fixture is built to discriminate

Rule 27 is what went wrong the first time this was looked at: a fixture simple
enough to be tidy makes a right answer and a wrong one photograph identically.
This one carries, deliberately:

- a nebula canvas actually running, quieted identically on both sides;
- a background photograph with four quadrants and a diagonal, so every crop has
  a different average;
- a gradient field and the widest measure;
- a bare section with no style of its own, which can only look right if the
  document's backdrop reaches it;
- a weighted three-place grid whose shares are not a palindrome, and not a
  shape any preset could produce;
- a bleeding, margin-less banner;
- a `neon` section, for ink that overflows its box;
- a `cutout` section, for `clip-path`;
- a three-deep nest, at the depth cap;
- a carousel;
- an owner who is named and pictured, because a nameless one photographs the
  same whether the identity data was read or hardcoded.

### The responsive matrix

The container-query thresholds are already measured in this repository — the
viewport width at which a grid stops collapsing to one track. Two places is
352px, three is 544px, four is 720px, five is 944px and six is 1072px.

The matrix straddles them rather than sampling round numbers, because that is
where a geometry difference flips a visible answer. A doubled gutter of 16px a
side is what moved this threshold before.

| Stop     | Why                                                       |
| -------- | --------------------------------------------------------- |
| 320, 390 | phones, below every threshold; everything collapsed       |
| 536, 552 | either side of the three-place threshold                  |
| 712, 728 | either side of the four-place threshold                   |
| 1280     | desktop, above everything; measure and bleed at full size |

Both windows are real, so nothing is simulated and no device is invented.

Each stop is held to the sabotage question explicitly: name the wrong behaviour
it excludes, and confirm this fixture at this width could tell it from the right
one. A stop that cannot discriminate is reported as such rather than counted.

### On budgets

If a stop is slow the suite is split, never given a wider budget. A timeout
raised until a flake stops appearing is a check that has stopped being evidence.
The suite's runtime is measured and reported rather than assumed, because `e2e`
is a required check.

## What this does not claim

**With the controls visible, the page is faithful in everything except vertical
position.** The control cards sit between the sections, so a section is further
down the document than it is on the page — and the body's field is fixed to the
window, so which slice of a gradient or photograph sits behind a section is
decided by where that section is on screen. Everything else matches; that one
thing is approximate until the controls are hidden, where it becomes exact.

This is stated rather than fixed. Fixing it would mean laying the controls over
the sections instead of between them, which is a much larger change and walks
into the 2026-08-16 hazard: `cutout`'s `clip-path` clips overlay UI and focus
rings, and every control would then be inside `SKIN_SCOPE` where a hostile skin
can reach it.

## Bugs swept in

- The tray's four-edge ink clipping, above.
- `features/actors/CLAUDE.md` documents a `PreviewThemeHost` atmosphere prop
  with two modes; that prop no longer exists, and the component's own TSDoc says
  so. A note describing another file is a claim nothing checks.
- Whatever the hostile fixture finds once it can discriminate. Those are fixed
  on this branch rather than deferred.
