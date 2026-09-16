# The actors feature — presentation layer

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

**The addressing model lives in the feature root, `apps/hub/src/features/actors/CLAUDE.md`, not here.** This note covers only the presentation layer: everything about what is DRAWN and how the editor behaves.

## Standing rules lifted from the history

`HISTORY.md`, beside this file, holds the per-task account of the
2026-09-02→09-11 editor-interaction, Carrd-style-builder and
drop-target-legibility work. Moving that narrative out lost nothing binding —
every imperative it carried is restated here, short, with a pointer to the
moved section for the full account.

- **No leaf or container renderer in `blocks.tsx` may grow an
  `editing`/`isEditor` branch of its own** to decide whether a link navigates
  or a player plays. `lockCanvasInteraction`'s `INTERACTIVE` selector list is
  the one enforcement point; a new interactive kind is added there, not as a
  conditional threaded through an existing renderer. See "Page interaction
  locks by default while editing" in `HISTORY.md`.
- **`lockCanvasInteraction` never marks the canvas element itself `inert`.**
  The click that selects a block is read off that same element; an inert
  ancestor would swallow it before selection ever saw it. Same section.
- **Unlocking restores each element's own PRIOR `inert` state, never a bare
  "remove `inert` from everything this touched."** An already-locked element
  can be re-sighted (a reorder fires a fresh mutation for the same node), and
  the second sighting must not overwrite the recorded pre-lock state with
  "already inert" — that is what the lock's own `setAttribute` just wrote.
  Same section.
- **A block-preview surface (the Add picker, the Palette tab's thumbnails)
  renders inside `CHROME_SCOPE`, never `SKIN_SCOPE`, and mounts only once
  opened.** It shows what a KIND is, not what a page's own theme would make of
  it. See "Page interaction locks..." and "A third, persistent Properties
  panel tab" in `HISTORY.md`.
- **A preview's sample content is never what gets inserted.** Choosing a
  thumbnail still calls `newLeaf(kind)`/`newContainer(mode, 2)`, exactly as
  every other add path does; a sample's own `title_en` must never equal what
  `newLeaf` produces for the same kind, or the two could be silently confused.
  Same sections.
- **Any test that renders every leaf kind must wrap with a real
  `NextIntlClientProvider`, never mock it away.** `player`/`jukebox` reach
  `RetroPlayer`, which needs the real provider to avoid crashing outright.
  Same sections.
- **Testing: never assert `toBeVisible()` on Motion-animated content in
  jsdom.** jsdom runs no compositor, so an `initial`→`animate` transition
  never resolves and jest-dom reads the element as invisible regardless of
  reality. Assert the `hidden` attribute (or another real DOM invariant)
  instead, and leave what the animation actually looks like to `tests/e2e/`.
  See "Page interaction locks..." in `HISTORY.md`.
- **Testing: `reducedMotion="user"` disables transform/layout animation only —
  it does not make an opacity fade instant.** Don't assert an instant opacity
  change under reduced motion; poll `opacity` as usual and assert `transform`
  alone is static at rest. Same section.
- **`@dnd-kit`'s default `KeyboardSensor` `end` bucket includes Tab.** Wiring
  Tab as a step/skip gesture on any keyboard drag requires overriding
  `keyboardCodes` to drop Tab from `end` explicitly, or the sensor ends the
  drag on the very first Tab press. See "A palette drag also lifts by
  keyboard now" in `HISTORY.md`.
- **A drop-target mark renders out of flow and never resizes the slot it
  marks.** `@dnd-kit` caches every droppable's rectangle at drag start; a slot
  that grows or shrinks mid-drag stales that cache and reflows the canvas
  under it. A reservation made once, at drag start, for every valid target at
  once is safe; growing/shrinking a slot as the WINNER changes is the fault
  this design forbids. See "The frame draws one mark..." and "The branch
  closes..." in `HISTORY.md`.
- **Only the single winning drop target is ever marked.** `EditableBlockFrame`
  and `AppendSlot` both read one `activeTarget`; a new drag mechanism follows
  the same one-winner rule rather than lighting up every valid candidate at
  once. Same section.
- **The gap vocabulary is `before`/`after`/`place`
  (`insertMarkFor`, `domain/palette-targets.ts`), shared by every drag
  origin.** A new drag mechanism marks through this vocabulary and locates a
  mark by its own `canvas-drop-before`/`-after`/`-place` test id — not a
  bespoke `data-*` attribute; the one that used to exist for this
  (`data-canvas-drop`) was removed as redundant. Same section.
- **A persistent (non-dialog) panel tab whose content is expensive or needs
  setup (a provider, a backend) needs its own deferred-mount flag** — the
  `paletteOpened`/`sourceMounted` pattern — rather than assuming
  `PropertiesPanel`'s "hidden, never omitted" convention is free. See "A
  third, persistent Properties panel tab" in `HISTORY.md`.
- **A scope-transition remount key must never include the active tab.**
  `properties-panel.tsx`'s pane key is `${selection.kind}:${path}` only;
  including `tab` remounts the pane you just LEFT on every tab flip and
  discards any local state it held. See "The Properties panel replaces the
  recursive inspector" in `HISTORY.md`.

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

**The live renderer is directly draggable now (2026-09-04).** `Block` accepts
an optional `editor` prop and threads it through the same recursion the
public route renders. When absent — every public route, Preview, and the
session's Interact-with-page mode — it emits no wrapper, grip, listener, or
feedback at all.

**Corrected the same day: `editor` is a render-prop
(`EditorRenderHook`), not a data object `blocks.tsx` interprets itself.**
The checkpoint version had `blocks.tsx` import `EditableBlockFrame` directly
and construct it from the instrumentation data — which, because `blocks.tsx`
is imported by both public routes and the editor, pulled `@dnd-kit` into
every public route's bundle whether or not any instrumentation ever mounted.
Measured: `/[locale]/[person]` (+ `[handle]`) dropped from 1,342,756 to
1,008,869 bytes once fixed — the exact shape the "public routes have their
own barrel" account below already fixed once for Motion, this time on
dnd-kit. `blocks.tsx` calls `editor.wrap({ path, filled, children })` on
every rendered block and empty place and never imports
`editable-block-frame.tsx`; `block-editor.tsx` — the file that already only
exists on editor routes — is the one place in the app allowed to import it,
and builds the hook that wraps with `EditableBlockFrame`: a mouse press may
lift the rendered block itself, while touch and keyboard listeners live only
on the selected block's accessible grip so a finger can still scroll the
canvas without accidentally starting a drag.

The wrapper is the dnd-kit node and may write its own transform; Motion remains
inside `CHROME_SCOPE` and never wraps it or an ancestor. The grip and
insertion bars are also `CHROME_SCOPE`, so hiding controls removes the entire
editing seam before Preview paints.

**`appendSlot` is a second, independent optional member of the same hook
(2026-09-05), for the same reason and by the same mechanism as `wrap`.** A
palette drag may target the position one past a container's own last
child — `insertTargetsFor` (`domain/palette-targets.ts`) already computed
that position as a valid domain target from the day it shipped — but
nothing rendered a droppable element there, so `detectCollisionAt`'s own
loop, which only ever ranks a target whose id has a registered rect, could
never find it: the position was real and unreachable by pointer.
`blocks.tsx` calls `editor?.appendSlot?.(path)` once per container,
immediately after that container's own children, with the container's own
`path` and never a child index appended to it — the caller building the
hook is the one place that knows the container's current child count, never
`blocks.tsx` itself. It never imports or references anything about what the
returned node IS beyond `ReactNode`. `block-editor.tsx` is where the
concrete answer is built, exactly as it already builds `wrap`: `AppendSlot`
(`presentation/editable-block-frame.tsx`) is an always-mounted `useDroppable`
marker — always mounted, deliberately, because dnd-kit measures whatever
rectangle already exists in the DOM, and an element that only appeared once
a drag had begun would reopen the identical "no rect to rank" gap this
member exists to close. Visually it is nothing at all unless the current
`insertTargets` names its own exact path, in which case it reuses
`EditableBlockFrame`'s own "place" highlight class list verbatim. Measured
zero-byte-cost on both public routes before and after wiring the real
`AppendSlot` behind it, the identical guarantee `wrap` already carries.

**Two more call sites had to learn the canvas prefix too (2026-09-04).**
`refusalOf` and the `announcements` object's own `name` callback both
resolved a drag id with bare `placePath`, which understands only the
inspector's `"place:"` prefix — every OTHER canvas-aware site in this file
(`onDragStart`, `onDragEnd`, `coordinateGetter`, `detectCollision`) already
tried `canvasPlacePath(id) ?? placePath(id)` first. So a canvas lift
announced `"Picked up ."` — `placeName([])`, an empty designation — and a
refused canvas drop never spoke, silently, on every canvas drag since the
live renderer became draggable. Both now match the pattern the rest of the
file already used.

**`refusalOf`'s half of the fix has no reachable discriminating test, and
that is recorded rather than concealed.** `dropTargetForSibling` requires
`areSiblingPaths(from, to)`, which by definition makes every call
`applySiblingDrop` makes into `applyLinearDrop` have `sameParent: true` — so
the `"too many"` refusal (gated on `!sameParent`) can never fire through
this path, and `"into itself"`/`"too deep"` both need a depth change a
same-parent before/after target cannot produce from an already-valid tree.
The one refusal left, `"no such place"`, needs a target gone stale between
the keyboard's last step and the drop; a test forcing exactly that (mutating
the page mid-drag, then dropping onto the removed place) did not redden,
and sabotaging `refusalOf` alone back to bare `placePath` — leaving the
`name` fix in place — left the whole file's suite green, 41/41. The fix is
still correct, for consistency with every other site in the file and against
a refusal type or a stale-target path this file's own tests could not
construct rather than one proven impossible.

**Linear parents insert-and-shift; positional parents still exchange.**
`applyDrop` in `domain/block-drops.ts` is the planner: `before` / `after` on
the page, `stack`, `list` and `timeline`; `place` is still `moveBlock` on
`grid`, `masonry`, `carousel`, `tabs` and `accordion`. Pointer collision ranks
the nested renderer rectangles deepest first and turns the pointer's upper or
lower half into an insertion bar for a linear parent. Keyboard navigation
walks rendered places in drawing order. Both paths call `applyDrop` before
advertising a destination, so cycles, stale places, depth overflow and child
overflow never light up; the final call remains authoritative. A successful
result selects the exact destination path the planner returned.

The recursive inspector remains in this canvas-only task; replacing it with
the compact menu and focused Properties panel is deliberately deferred. Its
old sibling grips temporarily coexist under a separate dnd-kit id prefix, so
an inspector registration cannot replace a renderer registration for the same
path. Inspector drags remain sibling-only, while the canvas admits
domain-valid cross-container drops.

Empty canvas or Escape deselects; an Escape aimed inside the inspector belongs
to its own popup or field and leaves selection intact. The capture-phase
listener asks that question before `SectionStylePopup`'s bubble listener can
detach the focused field. The panel also carries a dedicated Close button:
Back derives and selects the parent, while Close clears selection at any depth.
Preview is still hide-controls (`CHROME_SCOPE`), and it clears selection before
paint rather than pausing the inspector. Show controls therefore returns to a
canvas with no selection. When nothing is selected the workbench is unmounted,
never hidden or copied off-screen; one mounted workbench remains the invariant.

The desktop panel is `min(36rem, 40vw)`, with the canvas padded by that same
expression, because the inherited nested card controls do not fit in 320px.
It starts `3.5rem` below the sticky editor toolbar: sharing the bar's own top
offset covered the Items tab or the writing switch depending on which one won
the z-index. That padding is conditional on the live selection, so clearing
selection for Preview removes it at its source; there is no hide-controls CSS
exception for inspector width.

**Only the canvas scrolls while controls show (2026-09-03).** The form fills
the viewport below the app header through one `min-h-0` flex chain; the toolbar
and the error banner sit outside `editor-canvas`, and that canvas owns
`overflow-y-auto`.

**TWO MORE THINGS BOUNDING THE CANVAS MADE PERMANENT, both found by looking at
the top 340px of the editor rather than by any check (2026-09-03).** This is the
third and fourth instance of the same lesson on one branch, after the sticky
band and the Page control: **a decision that was invisible while the document
scrolled becomes furniture once a box is bounded.**

Measured at 1280×900, the bar ended at y=115 and the first section began at
y=229 — and **80 of those 114px were reserved for things that rendered
nothing**: a `WidePageColumn` at y=139..179 carrying `pt-6 sm:pt-10` for a
`FormErrorBanner` that returns null when there is nothing wrong, and a
zero-height `div` holding two `<style>` elements that still cost the section's
`gap-4`. The gap was 58px after that, and every pixel of it was the bar's own
`mb-6`.

**That margin came off too (2026-09-04), and it is the same lesson one element
further up.** A margin on the bar is outside the scroller by construction, so
it held 24px of the author's backdrop under the chrome at every scroll offset —
furniture, not spacing. The canvas begins exactly AT the bar's foot now, both
115 at 1280×900, and content passes under an opaque bar instead of emerging
from behind a strip of page. The breath above the Page pill is that column's
own `pt-3` INSIDE the scroller: 12px that travels with the pill it belongs to
and is gone the moment anybody scrolls, which is the whole distinction this
section keeps paying to learn.

**Its guard was a 160px WINDOW, and a window that admits the fault it refuses
proves nothing.** `editor-bars-stay-pinned.spec.ts` asked for a canvas
`> barBottom` and `< barBottom + 160` — true of a flush canvas, true of the
24px margin, and true of the 56px band as well, so it went green on all three.
It asserts equality now, which is honest only because no spacing lives between
the two boxes any more. Sabotage-verified: restoring `mb-6` reddens it with
`the canvas begins 24px below the bar's foot`.

- **The column moved INSIDE the banner**, so one null check governs both. It
  could not be gated at the call site: the banner's rule is stricter than
  "there are errors" — a code whose message is missing counts as nothing to
  say — so `Object.keys(errors).length` is a second answer, wrong in exactly
  the case the component was careful about.
- **The stylesheet holder is `display: contents`.** As an ordinary flex child
  it generated no box and still drew a gap on both sides. Its children are
  `<style>`, which lay out nothing, so the gap has nothing to apply to.

**And photographing that fix found a worse fault it was sitting next to: the
save-refusal summary was BEHIND the inspector.** The panel is `fixed` from `md`
up and the canvas section pads itself by `md:pl-[min(36rem,40vw)]` to make room;
the banner was a SIBLING of that section, so it got no padding and the panel
sat on top of it. At 1280 its heading was at x=41 with the panel's right edge at
x=512, and `elementFromPoint` over the heading answered
`editor-identity-fields`. The inspector is open exactly when somebody presses
Save, so the message explaining why nothing happened was unreadable in the
normal case. It is handed to `BlockEditor` as `banner` now and renders inside
the padded section — still outside `editor-canvas`, because a summary that
scrolls away solves nothing.

**A rect comparison would have passed.** Two boxes overlapping is not the
claim; which one a person can read is, and only `elementFromPoint` answers
that — no unit test can, which is why all 3661 passed through the whole fault.
The guard asserts the banner has text BEFORE hit-testing it, because a hit test
over an element that never rendered reports "not covered" for the worst reason.
Sabotage-verified by cancelling the accommodation with a negative margin, which
reddens it with the panel named.

**The restore step in that verification is what rule 34 exists for, and it
caught nobody: `git checkout -- fursona-editor.tsx` reverted four uncommitted
edits in the middle of the sabotage**, and the run that followed reddened for
absence rather than occlusion — a red that looks like proof. Copy the file,
restore from the copy, and check the number the sabotage claims to have
changed.

**That guard was also RACY from the day it was written, and taking the bar's
margin off is what exposed it (2026-09-04).** The room the section makes is
ANIMATED — `transition-[padding-left] duration-210` — so a hit test fired the
instant the banner appears asks about a banner still travelling out from under
the panel. Measured while chasing it, the pad read **440.553px** and
**218.792px** of its settled 512 in two runs of this file, and the panel
genuinely was on top of the heading at the moment asked. It passed alone and
failed in the file, which is the giveaway for a question asked too early rather
than for a slow machine: no timeout is long enough for that. It waits for the
pad to equal the PANEL'S OWN WIDTH now — both are `min(36rem,40vw)`, one as
`pl-` and one as `w-`, so the wait states the relationship instead of copying
512, and a divergence between the two is something the poll reports rather than
hides. Re-sabotaged afterwards, because a wait that makes a case pass is the
first thing to suspect of making it vacuous.

The general form is worth more than the fix: **a hit test against a
transitioning layout measures a moment, not a layout**, and in this editor
there is an animated pad between every geometry question and its answer.

**The Page control rides INSIDE the canvas**, which is a reversal of this
section's first version and the same lesson as the sticky band below it: a
placement that was invisible while the document scrolled becomes permanent
furniture once a box is bounded. Above the canvas it scrolled away with the
sections like anything else on the page; above a bounded canvas it is one pill
holding a band of the author's backdrop at every offset. So it sits in the
scroller with the page it names, still chrome and still gone in Preview. What
that costs is reach — scroll far enough and it is out of view, exactly as
before — and the inspector's Page breadcrumb is the route back from a
selection rather than from nothing.

**Being in the canvas puts it inside `onCanvasClick`, and that needed a
guard.** The handler selects the nearest `data-block-path` and clears the
selection when it finds none, so the press that opens the inspector bubbled up
and closed it in the same click — a button that visibly does nothing. It
exempts `CHROME_SCOPE` rather than that one button, so a control placed in the
canvas tomorrow does not re-open it. Both directions are pinned, because one
assertion cannot see both: removing the exemption reddens "the Page control
still opens the inspector", and widening it to every click reddens "a click on
the page itself still clears the selection". Containment alone discriminates
nothing here — the control is in the right box in the working and the broken
version alike. A class name alone cannot establish this: the browser guard
proves the document has at most 2px of vertical overflow while the canvas is
hundreds of pixels taller than its own client box, then drives both candidates
and watches only the canvas move. The inspector's pane keeps its independent
scroll.

Preview removes the bounded flex chain and the canvas overflow, resets both
possible offsets to the top, and gives scrolling back to the document — the
same owner a public route has. Show controls bounds it again, still at the top
and with no selection. This is a route toward view and edit sharing the same
document: the renderer never changes, only which outer box owns scrolling.

**A NEW SCROLL CONTAINER CHANGES WHAT EVERY STICKY OFFSET INSIDE IT MEANS, and
that shipped a 56px band of somebody's page between the two bars (fixed the
same day).** A sticky offset is measured from the SCROLLPORT, never from the
viewport. `EditorToolbar` had `top: var(--bar-top)` — correct for years, since
its scrollport was the document, whose top edge is the header's top and whose
first 56px the header occupies. Bounding the form made the form the bar's
nearest scrollport, and that box already begins BELOW the header, so the same
declaration counted the header a second time: measured at 1280×900, header
0–56, bar 112–171, canvas top 277. The bar is `top-0` now — bar 56–115, canvas
top 245 — and `--bar-top` belongs to the two controls whose offsets really are
viewport-measured, the inspector and the source dock, both `fixed`.

**Its own guard passed through the whole fault, and that is rule 27 rather than
an oversight.** `editor-bars-stay-pinned.spec.ts` reads Save's starting offset
and asserts canvas scrolling never moves it — equally true of a bar resting
under the header and of one resting 56px lower, since both sit outside the
scroller and neither moves. Pinned and in the right place are two claims, and
only the second one was missing. The case that asks it compares the bar's top
against the header's foot in both directions, and it needs a TALL viewport:
`--bar-top` is `0px` under `@media (height <= 600px)`, so the faulty offset
resolves to zero on a phone in landscape and the band never appears there.
Sabotage-verified — restoring `--bar-top` reddens the new case and leaves the
pinning case green.

The stack's own `mt-8` came off in edit mode with it. It was written for a
document that scrolled, where 32px above the first section scrolls away; above
a bounded canvas it is permanent furniture, and it was doubled by the bar's own
`mb-6` until that came off the next day as well.
Preview keeps it and is byte-identical, because
`[data-controls="hidden"] [data-editor-stack]` already zeroes every margin
there.

At 320×720 the existing bottom sheet begins at y=216 while the canvas begins at
y=297 below the workbench. No canvas content can be made visible above a panel
whose top is already above the canvas itself; changing that would mean
redesigning the mobile inspector, not adding scroll padding. Phone canvas
scroll ownership is covered here, while that separate composition stays as-is.

It used to be a card — a label, `p-3`, a rounded face carrying `--surface` at
90% alpha, a border, and the author's `--field` on an in-flow box. All of that
was furniture between the author and their page, and the field in particular
covered the canvas outright.

**`overflow` is not set on each tray, and must not be.** The host carried
`overflow-x-auto`, and a `visible` axis paired with a non-visible one computes
to `auto` — so the box clipped on all four edges. Ink overflow is not scrollable
overflow, so nothing scrolled and no scrollbar appeared: every `neon` glow and
`comic` shadow in a tray was simply gone. `responsive.spec.ts` had pinned that
property BY NAME, which is root rule 30's shape one level down — the suite was
asserting the fault. Ink remains free across each block and tray. Its outermost
viewport is now the editor canvas while controls show, and the document in
Preview and on a public route; clipping at that viewport edge is the browser's
ordinary page boundary, not an intermediate card cutting off its child.

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
scroll: `position` still reads `sticky` and the offset still reads whatever was
declared. Only `getBoundingClientRect` after scrolling can tell you the bar is
above the viewport. (That offset is `0` rather than `--bar-top` since the canvas
became the scroller — see the scroll-ownership section above for why, and for
the band it left when it did not.)

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

**`insertAt`'s own three edges are pinned now (2026-09-04), and the "too
many" cross-container guard in `applyLinearDrop` turned out to carry a
redundant early check — REMOVED, not left as-is, once `pnpm --filter hub
test:coverage` forced the question.** An empty path drops the block silently
rather than inserting it, a top-level index one past the last entry appends,
and a negative top-level index reaches `Array.prototype.splice` unchanged —
which inserts before the LAST entry, not the first. None of the three is a
rule this domain chose; each is `insertEntry`'s own body, now pinned in
`block-edits.test.ts` and named in `insertAt`'s own TSDoc rather than left to
be rediscovered. Sabotage-verifying the "too many" refusal on a
cross-container linear insert found that `applyLinearDrop`'s EARLY exit
(`!sameParent && destParent.length > 0 && destLength + 1 >
BLOCK_LIMITS.children`) is fully subsumed by its later one
(`parent.length > 0 && nextLength >= BLOCK_LIMITS.children`): removing the
source from an unrelated subtree never changes the destination container's
own child count, so `nextLength` always equals `destLength` for a
cross-parent drop and the later check always refuses whatever the earlier
one would have. Sabotaging the early check alone did not redden
`block-drops.test.ts`'s new case; sabotaging both together did.

**A first pass called that "left as-is", reasoning removing it was a
refactor nobody asked for — and a coverage run on the very next task proved
that reasoning wrong.** A dead branch is not neutral: it is a statement and a
branch nothing can ever exercise, so `pnpm --filter hub test:coverage`
refuses it exactly as it refuses an untested live one, with no way to tell
the two apart from the report alone. The redundant early check and its
companion dead `else if` (`from.length === 1 && parent.length === 0 &&
fromIndex < insert`) are both gone now, folded into one ternary computing
`parent`'s own first-segment adjustment directly.

**The same coverage run then found a SECOND instance of the identical shape
one function over, in `listLength` — proof that the first one was not a
one-off.** `listLength`'s `!parent || !isContainer(parent)` branch, and
`applyLinearDrop`'s own `destLength === undefined` check that consumed it,
were both dead for the same underlying reason: `listLength`'s only caller
reaches it after `placeExists(blocks, target.path)` has already confirmed
`destParent` (`target.path`'s own parent) is a valid container whenever
`destParent.length > 0` — `placeExists` cannot answer `true` for a
`target.path` of more than one segment without `blockAt` on its parent
already resolving to a container. `listLength` returns a plain `number` now,
asserting rather than re-checking what its caller already proved.

**Six more coverage lines came from genuine gaps rather than dead code, and
all six are drawn from paths this domain's own callers never happen to
construct rather than from paths it refuses.** `dropTargetForSibling` and
`applySiblingDrop` both repeat `areSiblingPaths` defensively — every real
caller already checks it at the sensor — so nothing had called either
directly with two paths that cross parents; both now have a case that does.
`placeExists` guards `applyLinearDrop` at both `from` and `target.path`, and
three of its own arms had never been reached through a raw literal: an empty
path, a negative top-level index, and a path walking through a leaf as
though it were a container. A fourth gap was `applyDrop`'s own `place`-kind
hand-off to `moveBlock` — every existing `place` case in `block-drops.test.ts`
succeeds, so nothing had exercised `!moved.ok` returning straight through.
And the last was dragging FROM an empty place under a linear target:
`placeExists` reports an occupied INDEX as existing whether or not anything
sits there, so `applyLinearDrop` still has to notice, after fetching `held`
with `blockAt`, that what it fetched is `null` before treating it as the
block being moved.

**A drop was an EXCHANGE everywhere, and insert-and-shift was refused
rather than overlooked — until 2026-09-04, and only for POSITIONAL modes
now.** The Carrd-style page builder
(`docs/superpowers/specs/2026-09-04-carrd-style-page-builder-design.md`)
gave `stack`, `list` and `timeline` exactly the insert-and-shift model this
paragraph used to say was refused everywhere — see `domain/block-drops.ts`'s
`applyLinearDrop` and `LINEAR_MODES`, and "Linear parents insert-and-shift;
positional parents still exchange" above. What follows is still the correct
and current account for `grid`, `masonry`, `carousel`, `tabs` and
`accordion`, where a place is still positional and the argument below (an
empty place keeps its width; shifting one would move a shape somebody
deliberately left) still holds exactly as written. The flow semantics a
list would give you — insert here, and
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

### A gap mark is a bar, not a ghost (2026-09-13) — the drop-target-legibility reversal

`before`/`after` — the two GAP kinds `DropMark` (`drop-mark.tsx`) draws — are a
plain insertion bar now, not a ghost of the carried block. This reverses the
"ghost slot" option the drop-target-legibility design chose deliberately over
a plain bar, having weighed and accepted its known cost in advance: the owner
has since seen that cost photographed and chosen the fallback the design's
own §4 already named for exactly this. `place` is untouched — see below.

**The cost was exactly what §4 predicted and it is what changed the
decision, not a new argument.** A ghost is an overlay; an overlay takes up no
space; a mark that takes up no space does not part its neighbours, so it sat
OVER whichever block was nearest the boundary and read as "this lands ON
that block" rather than "this lands BETWEEN the two". A bar has no interior
to read as landing on anything — it cannot overlap because it draws nothing
between its own thin edges.

**Only `before`/`after` moved. `place` is unchanged, and that split is the
whole point of keeping two kinds in the vocabulary at all.** A `place` mark's
landing genuinely IS the place — an empty positional slot, or the block a
swap will exchange with — so filling that box was always the correct
answer, never the cost this reversal is about. It still reads
{@link DropMarkProps.height} exactly as before: a real `carriedHeight`
sizes it to what the block will actually occupy, floored at `min-h-12` only
when `height` is `null` (every palette drag, which carries no block that
exists yet to measure).

**`carriedHeight` survives the reversal, and very nearly did not.** It was
threaded solely to size the ghost, so a bar with a fixed thickness has no
use for it at all — and `before`/`after` genuinely stopped reading it. But
`place` still needs it for the reason above, and `EditableBlockInstrumentation.carriedHeight`,
`AppendSlotProps.carriedHeight` and `block-editor.tsx`'s `carriedHeightRef`
all serve `place` as much as they ever served the two gap kinds — dropping
any of them would have changed `place`'s behaviour, which nothing here was
asked to touch. What changed is narrower and is stated where each field is
declared now: `height` is read only for `place`.

**The bar keeps every invariant the ghost had, because nothing about being
an overlay changed.** `pointer-events-none`, `absolute`, `z-20`,
`CHROME_SCOPE`, and the same `-translate-y-1/2`/`translate-y-1/2` straddling
the boundary rather than sitting inside either neighbour — all of it stays,
because the reason for each was never about the ghost's shape. It is still
drawn only for the single winning target, and the append-slot's own
`min-h-12` HITTABILITY reservation (`AppendSlot`, computed once at drag
start from `insertTargets` membership) is untouched — that is a real,
in-flow box guaranteeing a rectangle for dnd-kit to land a pointer on, a
question independent of what gets drawn inside it.

**The e2e boundary-straddle math (`drop-mark-matches-landing.spec.ts`) holds
with a 6px bar exactly as it did with a ~48px ghost**, because it was never
about the mark's size — `-translate-y-1/2` puts the mark's own top edge at
half ITS OWN height above the neighbour, whatever that height is, so the
assertion `Math.abs(straddle - mark.height / 2) < 2` is dimension-agnostic
by construction. Verified against a real run rather than assumed, per this
branch's own instruction to check rather than reason about it.

See `docs/superpowers/specs/2026-09-07-drop-target-legibility-design.md` §4
for the full record of both decisions — the original acceptance of the
ghost's cost, and the dated addendum recording the reversal and why the
original reasoning is kept rather than deleted.
