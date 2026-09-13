# The actors feature — presentation layer, history

This is the per-task account of completed work in the presentation layer,
moved out of `CLAUDE.md` on 2026-09-12 so that note stops obliging a 344KB
read on every change under `features/actors/presentation/`. It carries no
gate obligation: `scripts/check-agent-notes.mjs` looks only for files named
`CLAUDE.md` or `AGENTS.md`, and this is neither.

Any standing rule this narrative used to carry has been lifted into
`CLAUDE.md`'s own "Standing rules lifted from the history" section, each with
a pointer back to the section below it came from. What remains here is
history: what was tried, what broke, what was measured, and why — read it for
the account, not for a constraint on new code.

---

### Page interaction locks by default while editing (2026-09-02) — done

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
does not. **The standing rule this makes possible: no leaf or container
renderer in `blocks.tsx` may grow an `editing`/`isEditor` branch of its own
to decide whether a link navigates or a player plays.** Every renderer stays
the one thing that draws both a stranger's page and the editor's canvas —
`INTERACTIVE`'s own selector list is the one place that changes when a new
kind needs locking, not a conditional threaded through every leaf that
already exists. **It never marks the canvas element itself `inert`**: the click that
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

**The Add picker is wired in, `presentation/add-block-picker.tsx` reached
from both `inspector-items.tsx` and `block-editor.tsx`'s own Items footer —
the sentence that used to stand here said "nothing calls it yet" and named
Task 4's own moment, not the branch's finished one.** The flat add row
(`add-content`/`add-nested`) and the drag-to-add HTML5 path it replaced are
both gone, removed in the task that did the wiring — see the drag-to-add
removal note below for what that took with it.

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

**The picker was wired in everywhere as of this task, and the two palettes it
replaced were gone even then.** `inspector-items.tsx` mounted one
`AddBlockPicker` per empty position, targeted at that exact path;
`block-editor.tsx`'s `ItemsFooter` mounted one at a container's own next
child position for a scope whose places were all filled; and the page-level
`addPalette` mounted one targeted at `[]`. One `addPickerLabels` bag, built
once in `BlockEditor`, was threaded to all three rather than each call site
re-slicing `labels` its own way. **One task later, in the same day, "The
Properties panel replaces the recursive inspector" removed `inspector-items.tsx`
and `ItemsFooter` outright, along with every OTHER mount site this picker
had but one** — see that section, further down this file, for the shape as
of that day: a single `AddBlockPicker`, portalled once into the toolbar, was
the only way to add a BLOCK. **That was superseded in its turn on
2026-09-06 — see "The modal Add is retired; the palette is the only way in"
at the end of this file — and `AddBlockPicker` itself, along with
`add-target.ts` and `add-slot.tsx`, is deleted.** `BlockCard`'s own
`add-place` button — appends an empty POSITION, never a block — is the one
container-footer control that survived both changes, unchanged in meaning,
inside the panel's Layout tab.

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

Five places carried it, matching the spec, and four still do (2026-09-04:
item 5 retired without a replacement — see its own entry below). **Two of
the five named
`canvas-inspector.tsx`/`inspector-items.tsx` as their home, and both files
are deleted now — see "The Properties panel replaces the recursive
inspector" above.** The mechanisms did not go with them; they carried
forward into whatever replaced each file, which is what the corrections
below each item say.

1. **Panel entry** (`properties-panel.tsx`, was `canvas-inspector.tsx`) — the
   root becomes `m.div`, fading and sliding in from the left on desktop or up
   from the bottom on a phone. Which direction plays is read via
   `useSyncExternalStore` rather than a lazy `useState` initializer, because
   this tree can render during SSR where `window` does not exist and a
   `useState` initializer has no SSR-safe equivalent; the client snapshot
   calls `matchMedia` directly, unguarded, matching `nebula-canvas.tsx`'s own
   convention.
2. **Scope transitions** — each pane's inner content is wrapped in an
   `m.div` keyed on `${selection.kind}:${path}` (2026-09-02; the key was
   `${tab}:${selection.kind}:${path}` and that was a bug, not a broader
   feature — see below), so entering a different block remounts it and
   re-plays a short fade+translate. The `hidden` attribute deciding which
   PANE shows still owns that. **This described the recursive inspector's
   Items/Options pair when it was written; `properties-panel.tsx` carries
   the identical fixed key forward for its own two tabs**, which is why the
   fix below survived the file being deleted and rewritten rather than
   needing to be rediscovered.

   **The `tab`-inclusive key remounted BOTH panes on every tab flip, hidden
   one included, and a real browser caught it losing state.** Both panes'
   `m.div`s computed the identical string from the same `tab` value, so
   switching Items↔Options with no selection change still changed both
   keys — a "switching tabs also replays" nicety, but it meant the pane you
   just LEFT remounted too, discarding any local `useState` inside it.
   `theme-configurator.tsx`'s own open/closed flag is exactly that kind of
   state, and `editor-saves-page.spec.ts`'s template round-trip opens the
   theme panel, switches tabs for the template picker, applies one, and
   switches back — landing squarely in the window this closed. Selection
   changing is still what "entering a different block" means, so dropping
   `tab` costs only the tab-switch replay.

3. **Canvas accommodation** — plain CSS
   (`transition-[padding-left] duration-210 ease-out`) on `data-editor-stack`,
   deliberately not Motion, so `@dnd-kit` and the page's own boxes never
   receive an inline `transform` from this.
4. **Selection outline** — plain CSS too: a static base rule gives every
   block a transparent outline at the selected one's offset, and only the
   colour transitions (`outline-color 150ms ease-out`). The base rule has to
   be unconditional — transitioning a property FROM nothing is not a
   transition, there is nothing to interpolate from.
5. **Occupied-row labels and empty places** — this named `inspector-items.tsx`
   when it was written, and that file no longer exists: there is no Items
   list at all any more, so this place is GONE rather than moved, and no
   replacement owes it. It is left in the numbered list rather than
   renumbered away, so a reader checking "five places" against the code does
   not conclude a place was silently added back uncredited.

**The standing rule for a SIXTH place, and every one after it: Motion
renders only inside `CHROME_SCOPE`, and never on a `@dnd-kit` node.** Both
halves are load-bearing and for different reasons. `CHROME_SCOPE` is what
keeps an author's own page — its skinned content, its own animations if a
skin ever grows one — untouched by this feature's chrome; an `m.*` wrapping
real page content would be authored-content motion wearing this feature's
name. And `@dnd-kit` already writes its own inline `transform` on the
element it measures and moves (`BlockSlot`'s outer element, every drag
target), so a SECOND `transform` source on the same element — Motion's own,
from an `x`/`y`/`scale` animation — is two systems fighting over one CSS
property; item 3 and item 5 above are both this rule applied, not two
separate carve-outs. A new `m.*` usage that cannot honestly satisfy both
halves does not belong in this feature.

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

**`reducedMotion="user"` does not make an opacity fade instant, and a Task 7
test's first draft believed it did.** Motion's own docs are explicit —
`reducedMotion` "automatically disables transform and layout animations...
while preserving non-motion properties like opacity and backgroundColor" —
and a real Chromium run under `page.emulateMedia({reducedMotion: "reduce"})`
confirms it exactly: `canvas-inspector.tsx`'s entrance samples `transform` as
`none` on every one of twenty consecutive animation frames, where `opacity`
climbs from about 0.22 to 1 over the same ~200ms the ordinary-mode entrance
takes. So reduced motion removes the SLIDE and leaves the FADE untouched, on
purpose — this is root rule 1 (a newly adopted tool believed only once shown
to fail) landing on a config option's NAME rather than on the tool itself.
`editor-interaction.spec.ts`'s reduced-motion case asserts `transform` at
rest with no poll — the genuinely instant half — and polls `opacity` to `1`
exactly as the ordinary-mode case beside it does.

**A measured finding, closed out at Task 8 (2026-09-02): Motion's own
chunk reaches the fully public, signed-out profile and fursona-page
routes, and that sentence has TWO halves that must not be collapsed into
one.** The COUPLING is pre-existing: `@/features/actors/index.ts`
re-exports `FursonaEditor` (which imports `EditorMotion`) from the same
barrel `/[locale]/[person]/page.tsx` imports `PublicProfile` from, so
Turbopack's per-route `firstLoadChunkPaths` already put the SAME shared
bundle behind both an editor route and a public one before Motion ever
entered the picture — this branch did not create that barrel. The PAYLOAD
is not pre-existing: **+109,155 bytes of Motion itself now ship on
`/[locale]/[person]`, `/[locale]/[person]/[handle]` and every editor
route, added by this branch**, because whatever the barrel already carried,
it did not carry Motion until this feature imported it. "The coupling is
old, the bytes are new" is the accurate sentence; a review caught an
earlier draft of this note collapsing both into "not something this wiring
introduced," which is false about the second half. The owner's own
decision on what followed: **merge as-is, split the barrel in a
follow-up** — and that follow-up has landed, so the table below is the
BASELINE it was measured against rather than a description of the app
today. See "The public routes have their own barrel" at the end of this
file for what the split actually cost. Measured
directly from `.next/diagnostics/route-bundle-stats.json`, before and
after this task, in uncompressed bytes — the baseline the follow-up
inherits:

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

**Re-measured after Task 7's own fixes (2026-09-02):** editor routes read
1,950,813 bytes, `/[locale]/[person]` (+`/[handle]`) reads 1,943,136 —
+109,155 over the SAME pre-Motion baseline this table's own "before Motion"
column recorded, a further +299 bytes from this task's own code (the
`inert` attributes, the `role="button"` conversion, `CHROME_SCOPE` on
`block-card.tsx`). The four unrelated routes read the identical
778,889 / 749,122 / 738,627 / 452,708 they always have — **byte-for-byte
zero change, confirmed again** — which is the explicit form of the same
evidence this table already carried: Motion's import graph stayed scoped
to the barrel it was always going to share, and nothing Task 7 fixed moved
that boundary.

**What this task did not settle, and what has settled it since:** whether
that pre-existing barrel coupling itself is acceptable is a question this
task did not create and could not have answered by reverting Motion — a
revert would have left `/[locale]/[person]` loading the same ~1.8MB either
way. The owner's ruling was to merge as-is and split
`@/features/actors/index.ts` in a follow-up, with the numbers above as its
baseline. **That follow-up is done** — `public.ts` is the narrow barrel and
both public routes import it; the section at the end of this file carries
the measurement. The `canvas` job's own
throttled-page measurement is the number that actually decides whether
Motion stays: unused JS sitting in a downloaded chunk costs bytes and parse
time, not the runtime frame cost `canvas` measures, since no `m.*` component
ever mounts on a route that does not render editor chrome.

**Task 8 ran that measurement, with the editor mounted, and Motion did not
move it — kept, on the numbers, not because it was already wired.** The
gate in the spec is TWO-PART: which chunk Motion lands in (settled above —
it never reaches a route that renders no editor chrome, the shared/barrel
routes excepted, which already carried that bundle before Motion existed)
and whether the throttled-page frame cost moves. `personalised-page-cost.spec.ts`'s
"dragging a theme dial in its editor" case, against the same 20-heavy-section
seeded page the spec was written against, on a real Chromium throttled to a
phone: **`theme commits: 1 over 175 delivered movements (0.006 each)`** —
the identical healthy ratio root rule 14 already documents (`0.006` fixed,
`1.000` sabotaged), measured with the full Task 1–7 stack — the interaction
lock, the Add picker and Motion's own five entrance animations — all
mounted and live. Style recalc read 23.3ms per input event across 20 events
and 183 preview leaves, in the same run. Both are the same order of
magnitude the spec's own reference numbers already carry. Every canvas's
own frame cost, checked in the same `canvas` job run, also cleared its
budget — `hexagons` highest at 53.0ms against the "order of magnitude"
threshold, nothing new about that list. **Verdict: keep Motion.** All 6
cases in the `canvas` project passed.

**Task 7's browser proof landed (2026-09-02), and it found five real defects
none of the earlier tasks' unit suites could have — every one of them a
mechanism jsdom does not implement or a timing window only a real compositor
has.** Two new specs, `editor-interaction.spec.ts` and
`add-block-picker.spec.ts`, plus the mechanical `add-content`/`add-nested`/
`add-section` substitution across ten existing ones (this feature note's own
list of what changed, above). What running them for real found:

- **The Add-block picker's own preview nested a real `<button>` inside its
  option's `<button>`** — `player`/`jukebox` render real transport controls
  through the same renderer a public page uses, and a `<button>` may not
  contain interactive content at all. React warned on every open; axe then
  refused it as `nested-interactive` even after the option became a
  `role="button"` `<div>`, because the rule is about interactive content
  nesting, not about which tag is outermost. The preview is `inert` now —
  removed from the accessibility tree, from focus, and from hit-testing, so a
  click anywhere inside it (a transport button included) falls through to the
  option behind it, the same mechanism `canvas-interaction-lock.ts` already
  relies on for the editor canvas.
- **The picker's own dialog never moved focus into itself**, so Escape — sent
  to whatever still held focus, the trigger BUTTON outside the dialog —
  never reached the `onKeyDown` listening for it. A `useEffect` focusing the
  dialog (`tabIndex={-1}`) on open is what makes "closes through Escape once
  focus is inside" — a sentence the component's own comment already
  asserted — actually true.
- **A container's own `CardKind` eyebrow, and the whole card around it,
  painted with tokens no fixed background pairing ever promised.**
  `text-(--accent)` is the author's own arbitrary theme colour with no
  contrast guarantee against `.aeleos-chrome`'s fixed surfaces; `block-card.tsx`
  had never been wrapped in `CHROME_SCOPE` at all, so `--ink`/`--muted` read
  the PAGE's derived palette while the card's own `--surface-solid`
  background compounded its 90%-alpha translucency with every level of
  nesting, letting more of the page's own background bleed through than any
  single-layer check accounts for. Both are fixed now — `CHROME_SCOPE` on the
  card, `--menu` (genuinely opaque, no alpha) in place of `--surface-solid`,
  `--ink` in place of `--accent` on the eyebrow — and a real axe scan found
  the difference: 15 `color-contrast` violations on a nested card, sharing
  the same fixed background as their own measured foreground, down to zero.
- **`reducedMotion="user"` does not make an opacity fade instant**, which the
  library's own docs say plainly and this branch's first draft did not
  believe until a real `prefers-reduced-motion: reduce` run measured it: the
  entrance's `transform` reads `none` from the first frame, its `opacity`
  climbs over the same ~200ms ordinary mode takes. See the account above,
  under the Motion bullet.
- **Switching Items↔Options remounted BOTH panes, not only the one becoming
  visible**, because `canvas-inspector.tsx`'s scope-transition key carried
  `tab` and both panes computed the identical string from it — so a tab flip
  alone, with no selection change, destroyed and recreated the pane you just
  LEFT along with the one you were headed to. `theme-configurator.tsx`'s own
  `open` flag is exactly the kind of local state that remount threw away, and
  `editor-saves-page.spec.ts`'s template round-trip (open the theme panel,
  switch to Items for the template picker, apply one, switch back) landed
  squarely in the window. The key no longer carries `tab`; entering a
  different block is still what triggers the replay.

Two more were test-side rather than app-side, and are recorded here because
each is a small instance of a rule this file already states: `addSection`
narrows or widens a container's WIDTH through `section-spaces`, never its
CAPACITY — the picker's own layout options always start at two children
(`PICKER_SPACES` in `add-block-picker.tsx`) — so a test wanting a genuine
third, explicitly empty place needs its own `add-place` press; several
specs, including one pre-existing test, assumed spaces and children were the
same number. And a raw pointer drag in `section-drag-reorder.spec.ts` raced
`@dnd-kit/core@6.3.1`'s own `PointerSensor.detach()`, which keeps a
document-level capturing `click` listener alive for exactly 50ms after a
drop specifically to swallow the synthetic click a mouseup-after-drag
produces — a genuinely independent click landing in that window is silently
lost too, whoever it targets. Both are documented at their call sites rather
than only here.

### The five real defects, sorted by whose fault they were (2026-09-02)

The paragraph above lists what Task 7 found; it does not say which of them
were bugs IN this feature and which were bugs this feature's own testing
happened to uncover somewhere else. That distinction matters to a future
reader deciding whether a fix is protecting old, shipped behaviour or new
behaviour this branch is still shaping — so it is checked against `git log`
rather than asserted:

- **Pre-existing, shipped, unrelated to this branch.** `block-card.tsx`
  (`#159`, "Sections of spaces") predates `editor-interaction-motion`
  entirely, and so does `card-kind.tsx` — created in `#24`, though the
  specific `text-(--accent)` tone on its container eyebrow is a day
  younger than that: `git log -S` places it in `#34`, the pull request
  that first told the two eyebrows apart by colour rather than glyph
  alone. Both dates are pre-branch either way, which is the fact that
  matters here — the credit is corrected because a review checked it, not
  because it changes which list this belongs on. Neither file had ever
  been driven by a real accessibility scan reaching a NESTED card before
  Task 7's — the card's own `bg-(--surface-solid)` translucency compounding
  with nesting depth, and `CardKind`'s container eyebrow reading the
  author's own `--accent` with no contrast guarantee against a fixed
  background, are
  defects that have been live in production-shaped code since those two
  pull requests, not artefacts of anything this branch designed. Fixed here
  because Task 7's own new coverage is what finally exercised the state
  that exposes them, not because they were ever this feature's to begin
  with.
- **New to this branch, but not to Task 7 — introduced by Task 6.**
  `canvas-inspector.tsx` itself predates this branch (`#58`), but the
  `tab`-inclusive scope key that remounted both inspector panes on every
  tab flip was written by this branch's OWN Motion commit (`2ae8c5a`),
  three tasks before the browser run that caught it. It is a real bug this
  branch shipped internally between tasks, not a design Task 7 is
  correcting after the fact — Task 6's own commit is where "correct" ends
  and "buggy" begins.
- **New to this branch, and to the same task that wrote the buggy code.**
  `add-block-picker.tsx` did not exist before this branch's own Task 4
  commit (`e7bf9f3`); the nested `<button>` and the dialog never moving
  focus into itself are defects in code that was new and unexercised in a
  real browser from the moment it was written, found by the first task
  that actually opened it in one.

The `reducedMotion="user"` opacity finding is not on this list: nothing in
the app was ever wrong there, `MotionConfig` behaves exactly as its own docs
say, and what changed was a TEST's assumption, not shipped code — see the
account above.

See `docs/superpowers/specs/2026-09-02-editor-interaction-and-motion-design.md`.

### The compact builder menu, and one Add for one selection (2026-09-04)

The Carrd-style page builder's Phase 2
(`docs/superpowers/plans/2026-09-04-carrd-style-page-builder-phase-2-compact-menu-and-add.md`)
replaced the editor's separate `AddBlockPicker` mounts — the page-level
palette, a container's own Items footer, and every empty place in
`InspectorItems` — with one global Add in the toolbar, driven by exactly one
selection.

`domain/add-target.ts`'s `addTargetFor(blocks, selection)` answers where the
ONE Add control's next choice would be added — the page root for nothing
selected or Page, a container's own path for a container selection, and a
leaf's PARENT for a leaf selection, since "after" has no positional meaning
for a grid/masonry/tabs/etc. place. **It asks `mayNest` of the position a new
CHILD of the target would occupy, one segment longer than the target itself**
— not of the target's own path — because the depth cap is a fact about the
new block's own depth, not about the block already selected. Getting this
backwards (`mayNest(targetPath)` rather than `mayNest([...targetPath, 0])`)
answers `true` one level too late: selecting the innermost of three nested
containers — a section, a container inside it, a container inside that, the
deepest a container may sit — has a `targetPath` whose own length (3) still
clears `MAX_DEPTH`, so the wrong formula would still offer a layout there,
where a fourth container is exactly what the cap refuses.

**Wiring it into the toolbar is not a straightforward prop, and the reason is
worth keeping.** `EditorToolbar` is mounted by `FursonaEditor` as a SIBLING of
`BlockEditor`, and `BlockEditor` alone owns `blocks` and `selection` —
deliberately: `FursonaEditor` does not watch `sections` at all, because doing
so would re-render `EditorToolbar` on every keystroke in a leaf, which is
exactly what `PageSourceField`'s own isolated `useWatch` exists to avoid one
level over. So the toolbar's Add control could not be built by handing
`addTargetFor`'s output up through `FursonaEditor` as data — that would
reintroduce the render-count fault `fursona-editor.test.tsx` already guards
against. `presentation/add-slot.tsx` is the fix: an `AddSlotProvider` wraps
the whole `data-controls` element in `FursonaEditor`, `AddSlotTarget` renders
an empty portal-host `<div>` inside `EditorToolbar`'s own action group, and
`BlockEditor` computes `addTargetFor`'s result itself and portals a single
`AddBlockPicker` into that host — the same context-and-portal shape
`EscapeSlotProvider`/`EscapeSlotTarget` already use for the "show controls"
button, scoped to this feature rather than shared with it, because the two
slots serve unrelated controls.

**Manual verification (Task 4) found a real, visible duplication, and it was
checked against a genuinely signed-in browser rather than assumed from
reading the code.** Before this branch, selecting a container and opening its
Items tab showed TWO Add buttons at once, both labelled identically in
Spanish — the toolbar's own, `data-target-path` equal to the container's own
path, and `ItemsFooter`'s own mount one segment longer, both resolving to the
identical `addAt` call.
`ItemsFooter` carried no `AddBlockPicker` of its own as of this task; only
its `add-place` button remained, because appending an empty POSITION is a
different operation from adding a block and the toolbar's Add has no way to
ask for it. **`ItemsFooter` itself, and the Items tab this paragraph
describes opening, are both gone one task later** — see "The Properties
panel replaces the recursive inspector," further down this file; the
surviving `add-place` button now lives inside `BlockCard`, reached through
the panel's Layout tab rather than through Items.

**The check that found this was a real Clerk-authenticated `next dev` session,
not a static read.** A throwaway script (deleted after use, never committed)
created a real Clerk test identity via the Management API, signed in through
the same `@clerk/testing/playwright` ticket mechanism `tests/e2e/support/clerk-session.ts`
uses, opened `/es/me/edit`, selected a section's own container through the
breadcrumb, and counted `data-testid="add-block"` elements: two, with
`data-target-path` of `0` and `0-2` respectively, before this fix — one,
`0`, after it. The identity was deleted again in the same run.

**The row's remaining shape — Add, the page-theme switch, Preview, Save,
More — landed the same day.** The spec names "Add, desktop/mobile canvas
width, Preview, Save, More"; Phase 2 builds no canvas-width control, so that
stop is simply absent rather than stubbed with a placeholder comment that
controls nothing. `More` is a native `<details>`/`<summary>` disclosure —
matching this codebase's own convention (`page-source-dock.tsx`'s reference
panel) rather than introducing a third idiom — grouping the source-JSON
trigger, Interact with page and Cancel, none of which is reached often
enough to earn a permanent seat in a row that already wraps at `sm`.
`pageThemeSwitch` keeps its place beside Add: the spec's own list does not
name it, and moving a control the spec never mentioned was not this task's
job.

**jsdom applies none of `<details>`'s native open/closed behaviour, which
`page-source-dock.tsx`'s own account already names for a different
component — this is the same gap on a second one.** Every existing unit
case asserting on the controls now inside `More` (`getByRole("button", {
name: "Page source" })`, and the rest) kept passing completely unmodified,
because jsdom neither hides a closed `<details>`'s non-`<summary>` children
from the DOM nor from `getComputedStyle` — there is no CSS engine to apply
the browser's own default stylesheet rule. So the new case this task added,
"groups source JSON, Interact with page and Cancel under More", cannot
assert VISIBILITY the way a browser could; it asserts CONTAINMENT instead —
all three sit inside the same `<details>` the `More` trigger owns — which is
the fact a browser's hiding rests on. Sabotage-verified: moving Cancel to a
sibling of `</details>` reddens exactly that one case and none of the
others, proving the fixture discriminates rather than merely existing.

### The Properties panel replaces the recursive inspector (2026-09-04)

Phase 3 of the Carrd-style page builder
(`docs/superpowers/plans/2026-09-04-carrd-style-page-builder-phase-3-properties-panel.md`,
design in `docs/superpowers/specs/2026-09-04-carrd-style-page-builder-design.md`)
removes the recursive Items/Options inspector entirely.
`presentation/canvas-inspector.tsx` and `presentation/inspector-items.tsx` are
both **deleted**; `presentation/properties-panel.tsx` (`PropertiesPanel`) is
what replaced them. There is no Items tab, no tree navigation, no
breadcrumbs and no Back any more — click-to-select on the live canvas
(`onCanvasClick`, unchanged from the prior phase) is now the ONLY way into a
block, because there is no Items list left to also drill through it.

**Exactly two tabs, fixed per selection kind, never a variable number.** A
leaf's pair is Content/Appearance, a container's is Layout/Appearance,
Page's is Page/Theme. `panelContentFor` and `panelFootFor` — top-level
functions in `block-editor.tsx`, pulled out of `BlockEditor`'s own body for
the same cognitive-complexity-budget reason `detectCollisionAt` and
`coordinateGetterAt` already were — build the `{ primary, secondary,
panelLabels }` triple and the Clone/Delete foot from the current selection.
A container's Layout tab is `BlockCard` with `showChildren={false}`; its
Appearance tab is `StyleFields` fed the same `value`/`gates` the card already
computed for its own (now suppressed) popup. A leaf's Content tab is
`LeafEditor`; its Appearance tab is the same `StyleFields`. Both `BlockCard`
and `LeafEditor` gained `hideStylePopup`/`hideRemove` props (default
`false`, so every standalone test of either component is unaffected) so the
panel's production call sites can suppress the now-redundant inline trigger
and bin — the panel's own foot carries the one Delete, and the Appearance
tab carries the fields the popup would have shown, inline rather than
behind a second control nobody would open.

**Both panes stay mounted, switched by the native `hidden` attribute — never
by conditional rendering — so a tab flip does not remount the pane just
left.** The scope key that re-triggers each pane's own entrance animation is
`${selection.kind}:${path.join("-") || ""}` and **deliberately excludes the
tab**: an earlier phase's inspector shipped a key that included it, which
remounted BOTH panes (the hidden one included) on every tab flip and cost a
mounted `<details>`/`useState` its own open/closed state — see the account
above this section, under the Motion bullet, for the full incident.
`properties-panel.tsx` carries the fixed shape forward verbatim rather than
reintroducing the bug in a new file.

**Clone is new; Delete moved.** `domain/block-clone.ts`'s `cloneAt`
duplicates the selected block and inserts the copy immediately after it, in
the same parent — never a different depth, since a sibling insert shares its
source's path length — refusing by name rather than silently: `too deep`
reuses `block-drops.ts`'s own `reach`/`fitsAt`, now exported for exactly
this so the depth arithmetic exists in one place, and `too many` is
`BLOCK_LIMITS.children` for a clone landing inside a container or
`BLOCK_LIMITS.blocks` for one landing at the page root — the two caps a real
subtree can actually cross. Delete is the same removal `BlockCard`'s own
`RemoveSectionButton` and `LeafEditor`'s own bin always did, gated by the
identical `removalLocked` check, just relocated to the panel's foot so there
is one Delete for the whole selection rather than one per component that
happened to render it.

**The panel sits on the desktop RIGHT now, a phone bottom sheet below
`md`** — `min(36rem, 40vw)` wide, `3.5rem` below the sticky toolbar,
`max-h-[70vh]` as a sheet. This is a reversal of where the recursive
inspector sat; the canvas's own accommodating right-padding
(`md:pl-[min(36rem,40vw)]`, already documented above under "The desktop
panel is...") is unchanged in mechanism — it is still keyed to the exact
same width expression, just now padding the side the panel actually
occupies.

**Test ids changed and some have no replacement at all, because the thing
they named no longer exists.** `canvas-inspector` → `properties-panel`;
`inspector-close` → `panel-close`; `inspector-tab-items` /
`inspector-tab-options` → `panel-tab-primary` / `panel-tab-secondary`.
`inspector-item-row`, `inspector-item-open`, `inspector-empty-place`,
`inspector-breadcrumb` and `inspector-back` are simply gone — there is no
Items list, no breadcrumb and no Back to name any more. A canvas grip's own
id is untouched by any of this: `canvas-drag-<dot.joined.path>`, still
rendered only for the currently selected block.

**A block whose own fields fail even `lenientBlockSchema` is now
UNSELECTABLE, and this is a real gap rather than a hypothetical one.** The
canvas's own per-seat `lenientBlockSchema.safeParse(seat.block)`
(`block-editor.tsx`) answers a failure for such a block and renders nothing
for it at all — no `data-block-path`, nothing to click. The Items-based
inspector this phase removed did not have this gap: its rows read the RAW
form tree directly, never the canvas's own parsed render, so a person could
always drill into a malformed section to fix it even while its live preview
showed nothing beside it. Found while updating
`fursona-editor.test.tsx`'s "marks a section whose own name was refused" and
"...whose style was refused, on a field it does not draw": both fixtures
loaded a section already past a cap (`name_en` past `BLOCK_LIMITS.text`, a
style address past `BLOCK_STYLE_LIMITS.background_url`) — the exact same
cap the STRICT write refuses on, since strict and lenient share one
`z.string().max(...)` per field — so the container could never render and
`selectPath` had nothing to find. Both were rewritten to select the
container **while it was still valid** and then drive the refusing field
live through the panel, which happens to be the more faithful shape anyway:
the strict write already refuses this exact tree, so a page can never be
_loaded_ already past either cap, only typed into that state while its
author is still editing it with the block already selected. The underlying
reachability gap is real independent of that rewrite, though, and is
recorded here rather than patched, because closing it is a product
question — does Delete need to reach a block the canvas cannot render at
all, does the error banner need its own click-to-select affordance
independent of the canvas — and not a test-fitting exercise. A page saved by
an older build and reopened by a newer one with a tightened cap is the
ordinary way this could occur outside a test.

### Two stacking bugs and two selection bugs, closed by running the checkpoint's own e2e suite for real (2026-09-05)

None of these four were caught locally before this pass, because the
checkpoint's `hub`/`canvas` gates run no browser and the e2e-repair task
that rewrote most of `tests/e2e/` for the Properties panel never actually
ran the rewritten specs against real Clerk credentials — root rule 31's
exact shape, on a suite this branch itself had just rewritten rather than
on a suite left alone.

- **The Add picker's dialog resolved `fixed inset-0` against the toolbar,
  not the viewport.** `EditorToolbar`'s sticky bar carries
  `backdrop-blur-md`, and `backdrop-filter` other than `none` establishes a
  containing block for `position: fixed` descendants exactly as `filter`
  and `transform` do — invisible to every unit test, since jsdom does no
  layout. `AddBlockPicker`'s dialog is portalled to `document.body` now; the
  trigger stays where its caller mounts it.
- **The toolbar's own stacking context sat below the Properties panel's.**
  `sticky` plus a `z-index` makes an element its own stacking context, so
  the "More" disclosure's `absolute` panel only ever competed within the
  bar's `z-20`, and the bar as a whole painted behind the panel's `z-30`
  whenever both were open, however high the disclosure's own `z-index` was
  set. The bar is `z-40` now, matching `page-source-dock.tsx` and the Add
  picker's own dialog.
- **Escape closing the Add picker silently cleared the current selection.**
  The capture-phase, canvas-owned Escape-deselect handler in
  `block-editor.tsx` (see "Dragging" above for its own account of WHY it is
  capture-phase) exempted `properties-panel` and `page-source-dock` but not
  `add-block-picker` — which is portalled to `document.body` rather than
  nested inside the panel, so it needed naming rather than being reached
  through the panel's own selector. Closing the picker with Escape cleared
  `selection` before the picker's own bubble-phase handler ever closed the
  dialog, retargeting the next Add at the page root instead of the
  container that had been open — found by a depth-cap browser test failing
  with 8 layout options offered where the cap should have refused all of
  them. `add-block-picker` joined the exemption list.
- **`onCanvasClick`'s `CHROME_SCOPE` exemption also matched an EMPTY
  place's own wrapper, swallowing a click meant for its enclosing
  container.** The exemption exists for a genuine chrome control with no
  block underneath it — the Page pill, which rides inside the canvas — and
  it was checked BEFORE the `data-block-path` lookup. `EditableBlockFrame`'s
  empty-place wrapper also carries `CHROME_SCOPE`, so Preview can hide its
  dashed placeholder box the same way every other editor-only island is
  hidden; an empty place has no `data-block-path` of its own, only
  `data-canvas-path`. So a click landing on an empty place — reachable
  simply by clicking near the top-left corner of a container that has one,
  which is exactly where `selectBlock`'s own convention aims — matched
  `CHROME_SCOPE` on itself and returned before `closest("[data-block-path]")`
  ever ran, never walking up to find the container a few ancestors above.
  The two checks are reordered: `data-block-path` first, `CHROME_SCOPE`
  only once that has failed. The Page-control case this guard exists for is
  unaffected, because the pill is not nested inside any block's own
  `data-block-path` subtree. Both live in `onCanvasClick`, and
  `BlockEditor`'s own TSDoc carries a matching line — `check:docs` compares
  a symbol against its own code and would have refused a fix landing here
  without one.

**A fifth failure in the same sweep, `editor-saves-page.spec.ts`'s template
round trip, is a DIFFERENT and still-open bug — confirmed pre-existing by
running it against the branch before any of the four fixes above, where it
fails earlier for an unrelated reason (the toolbar fix above is what let it
progress far enough to reach this one).** Applying a template, then
switching the Properties panel from its primary tab back to Theme without
reselecting Page, finds `theme-accent` gone — `ThemeConfigurator`'s own
`open` state did not survive the round trip, though nothing here found why:
both panes are meant to stay mounted throughout, switched by the `hidden`
attribute rather than remounted, which should have left local state alone.
Not fixed on this pass; recorded here rather than left to be rediscovered
as a mystery next time somebody runs this spec.

### A third, persistent Properties panel tab — visible, not yet draggable (2026-09-05) — Task 4 of 9, presentation

`presentation/add-palette.tsx` ships `AddPalette`: the first user-visible
piece of the Palette tab itself, a grouped list of compact thumbnails — one
per `LeafKind`, one per `ContainerMode` — drawn by the REAL renderer
(`Block` from `blocks.tsx`) over `domain/add-samples.ts`'s fixed sample
content, mirroring `AddBlockPicker`'s own preview mechanism exactly, `inert`
wrap included. **It is a deliberately incomplete-but-not-broken increment:
nothing here is draggable yet.** Each thumbnail is a plain `<div>` that
cannot take focus; the modal `AddBlockPicker` remains the only way to actually add a
block until a later task in this same feature wires a real
`useDraggable`.

**The brief's own `AddPaletteProps` omitted `page`/`locale`, and that was a
real gap rather than a stylistic choice — closed rather than reproduced**,
per root rule 24. The real renderer's own signature needs a `PageContext`
and a locale to resolve an owner link, a fursona list and every other
actor-aware leaf a sample might draw; both are threaded exactly as
`AddBlockPickerProps` already threads them, and `AddPalette`'s own TSDoc
says so explicitly rather than leaving the deviation implicit.

**`PropertiesPanel` renders unconditionally now.** It used to return `null`
outright with nothing selected; `PropertiesActiveTab` (`"primary" |
"secondary" | "palette"`) replaces `PropertiesTab`, and the panel's three
regions are ALWAYS mounted, switched by the native `hidden` attribute — the
existing "hidden, never omitted" convention its two selection panes already
used, extended to the panel itself. With nothing selected, the two
selection-dependent tab BUTTONS carry `hidden`, never removed, while the
Palette tab's own button stays reachable. `PropertiesPanelProps` gained
`palette: ReactNode`, built once by the caller and shown whatever is or is
not selected.

**A real, pre-existing naming collision was resolved rather than left to
collide further.** `block-editor.tsx` already had a lowercase local
`addPalette` — JSX for the section-presets button and `TemplatePicker`,
shown only alongside Page's own fields, a wholly different thing from the
new `AddPalette` component. It is `pageStartOptions` now, throughout
(`PanelContentInputs`'s field, `panelContentFor`'s parameter, and the local
const), with its own TSDoc explaining exactly why the rename was necessary
rather than cosmetic.

**A real deferred-mount trap was found and closed, not hypothesised.**
`AddPalette` is a persistent tab's content, not a dialog's — there is no
`open` state to gate its previews behind the way `AddBlockPicker` gates its
own. Passing it to `PropertiesPanel`'s `palette` prop unconditionally would
mount all sixteen leaf-kind and eight container-mode previews, through the
real renderer, on every render of `BlockEditor`, `player`/`jukebox` included
— both of which reach `useTranslations` through `RetroPlayer` and crash
outright without a real `NextIntlClientProvider`. This is exactly what
happened first: every one of `fursona-editor.test.tsx`'s 46 cases crashed,
because that file's `renderEditor()` harness — unlike `block-editor.test.tsx`'s
own — does not wrap with the provider. `paletteOpened`, set once the
Palette tab is first asked for and never reset, is the fix — the identical
shape `PageSourceField`'s own `sourceMounted` guard already uses for the
source dock, cited by name in both the state's own inline comment and
`BlockEditor`'s function-level TSDoc.

**The canvas accommodation padding needed retying, and this is the kind of
consequence that is easy to miss when a component that "does not render
without a selection" starts rendering unconditionally.** It was
`currentSelection ? "md:pr-[...]" : ""`; left that way, the panel would cover
the canvas's own right edge, unaccommodated, the instant nothing is
selected — because the panel itself no longer agrees with that condition. It
is tied to `controlsHidden` alone now, matching the CSS hide-controls rule
that actually removes the panel (both are `CHROME_SCOPE`), with the
reasoning stated inline at the class list and in the function's own TSDoc.

**A real jsdom/Motion trap, already documented elsewhere in this feature,
recurred here rather than being a new discovery — worth a second citation
because it cost real debugging time before the existing note was found.**
`toBeVisible()` cannot be used on anything under `PropertiesPanel`'s root:
its `initial={{opacity:0}}` never animates to 1 in jsdom, so jest-dom reads
every descendant as invisible via the "parent is also visible" check
regardless of the `hidden` attribute a case actually cares about. Every new
and modified test in `properties-panel.test.tsx`, `block-editor.test.tsx`
and `fursona-editor.test.tsx` reads `.toHaveAttribute("hidden")` /
`.not.toHaveAttribute("hidden")` directly instead.

**Cascading test breakage across two files was fixed by discriminating
harder, not by weakening assertions.** Both `block-editor.test.tsx` (6
cases) and `fursona-editor.test.tsx` (4 cases, once the crash above was
fixed) had asserted `queryByTestId("properties-panel")` was `null` as proof
of "nothing selected" — now false unconditionally. Each was rewritten to
assert what actually changed: `panel-tab-primary`'s `hidden` attribute, or
selection-specific content (`leaf-editor` presence) — never the panel's own
presence, which no longer discriminates anything.

**The three standing questions, answered explicitly and separately, as this
file's own opening rule requires:**

1. **Is anything now false?** Yes, and it was corrected in the code's own
   TSDoc in the same change rather than left for this note to flag from the
   outside. `properties-panel.tsx`'s prior TSDoc said the component "does not
   render when nothing is selected" and returned `@returns the panel, or
nothing when deselected" — both rewritten. `block-editor.tsx`'s
`BlockEditor`-level TSDoc said "The Properties panel starts deselected and
   mounts only after a canvas or Page selection (2026-09-04)" — rewritten to
   say it renders unconditionally and starts deselected showing only the
   Palette tab.
2. **Is anything still true but no longer quite how we work?** The claim "the
   tablist always renders exactly two tabs, never a variable number" is now
   imprecise rather than false: it is still exactly two SELECTION tabs per
   selection kind, but the tablist itself always renders three buttons, the
   third being the persistent, selection-independent Palette tab.
   `properties-panel.tsx`'s own TSDoc now says "two SELECTION tabs... the
   Palette tab is a third, fixed one beside them" rather than leaving the
   older, now-imprecise sentence to stand alone.
3. **Did this establish something the next person needs?** Three things,
   none obvious from the code alone: first, a component whose previous
   contract was "absent without a selection" can have that inverted to
   "always present, selectively hidden" without every caller needing new
   logic — `hidden` on the tab BUTTON and on the pane both already existed
   as the pattern, and extending "unconditional" to the panel's own root
   was the one remaining piece. Second, a persistent tab's content —
   anything with no dialog `open` state to gate behind — needs its OWN
   deferred-mount flag if mounting it unconditionally would be expensive or
   would need setup (a provider, a real backend) a caller might not supply;
   `paletteOpened` is that flag, and the next persistent-tab content this
   feature grows should ask the same question before assuming
   `PropertiesPanel`'s "hidden, never omitted" convention is free. Third,
   changing what a component renders when its own gating condition (here,
   `currentSelection`) is null is not contained to that component — anything
   ELSE in the same file keyed to the same condition (here, the canvas's own
   accommodation padding) needs re-examining in the same change, not
   assumed to still agree.

This tab renders and is reachable. Dragging a thumbnail onto the canvas is
Task 5, immediately below.

### Palette thumbnails are real pointer drag sources onto the canvas (2026-09-05) — Task 5 of 9, presentation

The header above this one — "visible, not yet draggable" — is corrected by
this section rather than left standing: every thumbnail is a real
`useDraggable` source now, mouse-only, wired exactly as
`EditableBlockFrame`'s own `beginDesktopDrag` demonstrates
(`event.pointerType !== "mouse"` returns early rather than spreading
`{...listeners}` wholesale, which would also wire a keyboard lift this
checkpoint does not support). `role="button"` and `aria-label` name each
item, matching `AddBlockPicker`'s own non-native-button convention.

**`onDragStart` branches on `palettePayload` first, and a palette id never
falls through to the canvas-move logic below it.** The branch computes
`insertTargetsFor(blocks, paletteItem)` once and stores it on a new ref,
`insertTargetsRef` — recomputing it on every pointer move would be
`insertTargetsFor` walking the whole page on every frame, and nothing reads
it during render, so a ref rather than state is the right shape.
`onDragCancel` clears the same ref, and `onDragEnd`'s palette branch clears
it before anything else, mirroring the canvas-move branches' own
housekeeping.

**`detectCollisionAt` gained an early, mutually exclusive palette branch,
proven to be genuinely mutually exclusive and not merely written to look
that way.** It ranks every `insertTargetsRef` entry whose registered
droppable rect contains the pointer, deepest-path-first — the identical
"innermost place wins" rule the canvas-move branch below it already uses for
nested containers, because a place nested inside another place is nested
inside its own rectangle too, and any ranking by rectangle proximity would
answer the wrong depth silently. It calls `insertBlockAt`, never `applyDrop`:
inserting a freshly built leaf or container is not a move, and the move
planner has nothing to say about content that does not exist on the page
yet.

**`onDragEnd`'s palette branch builds the fresh block and calls
`insertBlockAt` itself, independently of whatever `insertTargetsFor` offered
a moment earlier at `onDragStart`.** That is not redundant: a target can go
stale between the two calls (an intervening edit, or — see the append-slot
account in Task 4's own section above — a target `insertTargetsFor` names
that has no rendered droppable to have been dragged onto in the first place,
which `detectCollisionAt`'s own `if (!rect) continue` already filters
before a drop is ever attempted). Success selects the new block and switches
the panel to its primary tab; a refusal sets the same `refusal` state the
canvas-move branch already renders through `drag-refusal`, so a palette
drop and a canvas-move refusal share one feedback mechanism rather than two.
A drop with no `over` at all — the pointer never crossed a registered
target — returns without writing anything, matching the canvas-move
branch's own `!event.over` guard.

**The brief asked for a "container past the depth cap refuses" case, and
that shape is unreachable through this pipeline — found rather than
silently substituted.** `fitsAt` (`domain/block-drops.ts`), which
`insertBlockAt` calls, is a function of the TARGET PATH'S LENGTH alone; a
container target that would be too deep can never reach the real collision
pipeline at all, because `insertTargetsFor` already filters every container
target through the identical `mayNest` check before ever offering it as
draggable-onto — the same fact Task 1's own TSDoc states about the domain
layer, now confirmed true of the wired pipeline as well. The reachable
refusal through this exact path is `BLOCK_LIMITS.children` ("too many"),
which exercises the identical `onDragEnd` branch and the identical
`drag-refusal` feedback the depth-cap case would have. Per root rule 24,
this is said here rather than worked around silently: the test named
"refuses a drop onto a container already at its child cap" is the
`BLOCK_LIMITS.children` case, not the depth cap the brief's own wording
named.

**`PALETTE_PREFIX` (`domain/block-drag.ts`) stayed private, a deliberate
deviation from the brief's literal `export const`.** It matches the sibling
constants already in that file (`PLACE_PREFIX`, `CANVAS_PLACE_PREFIX`, both
private too), and nothing outside that module needs it — every caller reads
`paletteId`/`palettePayload`, never the prefix itself. Exporting a constant
nothing imports is the "control that does nothing" shape this repository
already refuses elsewhere, just on a constant rather than a UI control.

**Both new component tests were sabotage-verified, and each reddens exactly
what it names.** Ranking: comparing `target.path.length <` rather than `>`
reddens the two cases that resolve to a real nested target ("drops a leaf
onto an empty place" and "refuses a drop onto a container already at its
child cap") and leaves "does nothing when a palette drag ends over no
target" green, since that case's pointer never lands on any target at all —
ranking has nothing to rank. Refusal-swallowing: disabling the `if
(!result.ok)` branch in `onDragEnd`'s palette case reddens only "refuses a
drop onto a container already at its child cap, and shows the message,"
which is the one case built specifically to watch for that message.

**`AddPalette`'s own click-swallow trap is `@dnd-kit/core`'s documented
50ms post-drop window, met here at the unit level for the first time.**
`PointerSensor.detach()` keeps a document-level capturing `click` listener
alive for exactly 50ms after any drop, to swallow the synthetic click a
mouseup-after-drag produces — root rule 41 already names this for a browser
suite, and it recurs here because jsdom shares one global `document` across
cases in a file: a prior case's completed drag leaves that listener
live into the very next case, silently eating the click that opens the
Palette tab. `openPalette()` in `block-editor.test.tsx` awaits a real 60ms
timer before firing that click, past `no-restricted-syntax`'s ban on a
hand-rolled sleep — that ban is scoped to `**/e2e/**` in
`eslint.config.mjs`, not to this unit test file.

This closes the checkpoint the header above opened: a palette thumbnail is a
real drag source and a real drop lands a real block. What is still not
built, for a later task in this same feature: touch and keyboard lifts from
a thumbnail.

**A container's own append slot is rendered and draggable-onto now
(2026-09-05), which closes half of what the paragraph above once named as
still missing.** `EditorRenderHook.appendSlot` (see the `wrap`/`appendSlot`
account earlier in this file) is the second, independent optional member
`blocks.tsx` calls once per container, right after that container's own
children; `block-editor.tsx` answers it with a real, always-mounted
`useDroppable` marker (`AppendSlot`, `presentation/editable-block-frame.tsx`)
at the position one past the container's own current child count, so
`insertTargetsFor`'s own append target — real since Task 1, unreachable by
pointer until now — has a registered rect for `detectCollisionAt`'s palette
branch to find. **What remains open is narrower than the paragraph above
used to say: the PAGE's own root append slot — one past the last top-level
section, letting a palette drag add a whole new section — has no rendered
marker of its own**, because `PublicBlocks` and `BlockEditor`'s top-level
seat list are not themselves wrapped in a call to `Block()`, and `appendSlot`
is only ever invoked from inside that function. Every top-level SECTION's
own append slot (its own children, one past the last) is rendered exactly
like any nested container's, since a section is a container at depth 0.

### A palette drag also lifts by keyboard now (2026-09-05) — Task 7 of 9, presentation

Task 5's own header above ended "what is still not built... touch and
keyboard lifts from a thumbnail." The keyboard half is built now: Enter or
Space on a focused thumbnail lifts it, the arrow keys step through
`orderedInsertTargets`, Tab and Shift+Tab skip a whole top-level section, and
Enter/Space drops — the identical gesture set `coordinateGetterAt` already
gives a canvas-move drag, on a second kind of drag entirely.

**Step 1's own genuine unknown, settled by reading the installed
`@dnd-kit/core@6.3.1` rather than guessing: `KeyboardSensorOptions.keyboardCodes`
has exactly three buckets (`start`/`cancel`/`end`), no fourth "step" bucket
exists, and the library's own DEFAULT `end` bucket already includes Tab**
(`[Space, Enter, Tab]`) — so a bare `KeyboardSensor` would end ANY keyboard
drag, canvas-move included, the moment somebody presses Tab, before the
sensor ever calls a `coordinateGetter` at all. The fix is a plain
`keyboardCodes` override on the sensor — `end: [Space, Enter]`, Tab dropped —
which is fully within supported configuration and needs no fallback
`onKeyDown` listener racing the sensor's own. Confirmed safe for the
canvas-move branch beside it: `FORWARD_KEYS`/`BACK_KEYS` never named Tab, and
nothing in this file or its tests relies on Tab ending a canvas-move drag.

**`paletteCoordinateAt` is the new function, and `paletteKeyboardTarget` is
its own ref, parallel to `keyboardTarget` and cleared everywhere that one
is.** It branches on `palettePayload(activeId)` first inside
`coordinateGetterAt` — the same mutually-exclusive-per-drag shape
`onDragStart`, `detectCollisionAt` and `onDragEnd` already keep between a
palette-origin drag and a canvas-move one. Arrow keys call
`stepInsertTarget`, Tab calls `stepInsertSection`, and it keeps stepping
within the SAME keydown until it finds a target with a registered droppable
rect — the identical "skip what nothing is showing" loop
`coordinateGetterAt` already runs for `placeOrder`, for the identical
reason: a target `insertTargetsFor` names is real in the domain sense from
the moment the drag begins, but nothing guarantees a mounted, measured
droppable at the instant a key is pressed. `detectCollisionAt`'s own
keyboard branch reads `paletteKeyboardTarget.current` for a palette-origin
drag, mirroring how it already read `keyboardTarget.current` for a
canvas-move one.

**A deliberate, documented departure from the brief's own wording (root rule
24): it reads `insertTargetsRef.current` rather than recomputing
`orderedInsertTargets(pageRef.current, item)` on every key press.** That ref
is computed exactly once, at `onDragStart`, and `detectCollisionAt`'s palette
branch and `onDragEnd`'s already read that same, frozen computation —
recomputing only for the keyboard path would let a page edited mid-drag make
the pointer-highlighted target set and the keyboard-stepped one silently
disagree about which targets exist.

**`AddPalette`'s thumbnails wire `onKeyDown` UNCONDITIONALLY, unlike
`onPointerDown`'s mouse-only gate.** `KeyboardSensor`'s own activator only
reacts to `keyboardCodes.start` (Space and Enter), so spreading
`listeners.onKeyDown` costs nothing on every other keypress — a thumbnail
still types nothing, navigates nothing, and does nothing on Tab, Escape or
any letter key pressed while focused and not yet lifted. `attributes`
already carries `tabIndex={0}`, from the day the pointer wiring shipped; a
SECOND, explicit `tabIndex={0}` sits beside the spread now, changing nothing
at runtime, because `eslint-plugin-jsx-a11y`'s `interactive-supports-focus`
cannot see through a spread to confirm a `role="button"` element is
focusable and refuses the file without an attribute it can read directly.

**The unit fixture's own off-by-one is worth carrying past this task,
because the underlying gap is more general than the paragraph above (still
above this section) states it.** That paragraph names ONE unrendered gap —
"the page's own root append slot, one past the last top-level section." The
truth, confirmed by tracing `paletteCoordinateAt`'s own stepping against a
real fixture: **every top-level splice `insertTargetsFor` offers is
unrendered**, not only the trailing one — `PublicBlocks`/`BlockEditor`'s
top-level seat list is never itself wrapped in a call to `Block()`, so
`appendSlot` is never invoked for the page's own root at ANY position, before
the first section, between two sections, or after the last. A keyboard step
walking FORWARD from a fresh lift on a page of `N` sections therefore skips
past all `N + 1` top-level splices in the very first successful key press,
landing inside the FIRST section's own rendered targets — never on a
top-level splice itself.

**That single fact is what broke this task's own first e2e draft, and the
fix generalises past this one test.** `/pages/new` seeds a REAL identity
section at path `"0"` (`ensurePersonActor`'s own required blocks) before any
section a test adds, so a test that adds ITS OWN section second and steps
FORWARD from a fresh lift lands inside the identity section's targets first —
however many arrow presses are counted, because the identity section's own
content is walked, and rendered, before the test's section ever is. Stepping
BACKWARD is the robust fix, not a coincidence of this fixture:
`insertTargetsFor`'s depth-first walk visits the LAST top-level section
LAST, so that section's own targets — however many it has — sit at the
absolute end of the whole `order` array regardless of what came before it on
the page. `ArrowUp`/`ArrowLeft` (`BACK_KEYS`) from a fresh lift lands
`order.at(-1)` first, which is always inside whichever section is added
last, never inside a section added earlier.

**Two `ArrowUp` presses were needed in the browser, not one, and the first
carries no announced change — recognisable as the SAME "sensor hasn't
attached yet" window root rule 26 already names, on a palette-origin drag
rather than a canvas-move one.** `liftByKeyboard`'s rAF-then-setTimeout
sequencing closes that window reliably for the LIFT itself; what was not
obvious ahead of running this in a real Chromium is that the window can
still cost the very first ARROW press its effect even after the lift
sequencing is correct — this task did not diagnose exactly which of dnd-kit's
own internal timings (rect measurement, sensor attach) accounts for the
first press producing no `onDragOver` announcement, only that it is
reproducible and that the SECOND press always succeeds. **The test does not
pin an exact press count or an exact landing place for this reason — it
asserts a block lands somewhere under the section it targeted
(`[data-block-path^="1-"]`), never at one hard-coded position**, which is
also immune to `PICKER_SPACES` ever changing how many places a freshly added
section opens with.

**`stepInsertSection`'s WIRING was sabotage-verified, not the pure function
again** (Task 3 already sabotage-verified that). Swapping the Tab branch's
`step` from `stepInsertSection` to `stepInsertTarget` in `paletteCoordinateAt`
reddened exactly one of 44 cases in `block-editor.test.tsx` — "steps to the
boundary between sections on Tab, skipping every target nested inside the
current one" — and none of the other 43, including the two other new
keyboard cases beside it. Restored by copying the file before mutating and
copying it back (root rule 34), confirmed byte-identical to the pre-sabotage
version, and re-run clean.

### The page-source dock shares the Properties panel's own width token (2026-09-05)

Making the Properties panel render unconditionally, above, had a direct
consequence its own task report first left open rather than fixed: the panel
now occupies the page's right edge WHENEVER controls show, selection or not,
which is exactly the situation `page-source-dock.tsx`'s fixed positioning had
never had to share space with before. The dock's own default width (420px)
sat entirely inside the panel's `min(36rem, 40vw)` reservation at 1280px wide
(the dock's box at `x=[860,1280]`, inside the panel's `x=[768,1280]`), so the
dock no longer reached any real page content at that viewport at all.

**`--properties-panel-width` is the fix, declared once in `globals.css` as
`min(36rem, 40vw)` rather than repeated as a literal in three files.**
`properties-panel.tsx`'s own `md:w-[...]` and `block-editor.tsx`'s canvas
accommodation (`md:pr-[...]`) both read it now, in place of the
`min(36rem,40vw)` literal each used to carry independently; `page-source-dock.tsx`
gained a new required prop, `panelOpen: boolean`, and shifts its own
`right-0` left by the same token at `md` and up when it is true —
`panelOpen ? "md:right-(--properties-panel-width)" : ""`. `FursonaEditor`
threads `panelOpen={!controlsHidden}` into `PageSourceDock` through
`PageSourceField`, the same condition `BlockEditor`'s own accommodation is
already keyed to, so the two can never disagree about whether the panel is
showing.

**A stale test assertion, not a design question, is what running the fix
actually found.** `page-source-dock.spec.ts`'s "opens beside the page,
reaching the right edge and the foot of the window" asserted the dock
reaches the WINDOW's own right edge with nothing selected — a premise this
same task's own unconditional-panel change had already made false on its own
terms, fix or no fix, since the panel is now always present too. The
assertion was rewritten to check the dock's right edge against the panel's
own left edge (`viewport.width - panelWidth`) rather than the window's, and
its companion "not pinned to the left edge" check — which compared `box.x`
against `viewport.width / 2`, a comparison that stopped discriminating
anything once the dock's box moved left of that midpoint — was replaced with
a small viewport-independent margin that still isolates the fault it exists
to catch (the over-constrained `left`/`right` bug, `box.x === 0`).
Sabotage-verified both ways: reverting `left-auto` reddens the rewritten
assertion exactly as it reddened the original, and removing the `panelOpen`
class conditional reddens the "sits at the panel's own left edge" assertion
while leaving every other case in the file green.

Fixing this also closed the OTHER e2e finding the same task report had
recorded — "collapsing shrinks the dock... at 1280," left failing
deliberately pending this exact decision — without touching that spec at
all: the dock's box moving out from inside the panel's reserved region is
the same geometry fix either assertion needed.

### The modal Add is retired; the palette is the only way in (2026-09-06) — Task 8 of 9

`AddBlockPicker` (`presentation/add-block-picker.tsx`), `presentation/add-slot.tsx`
and `domain/add-target.ts` are **deleted**, along with their tests
(`add-block-picker.test.tsx`, `add-slot.test.tsx`, `add-target.test.tsx`)
and every mount site — the one that survived Task 4's own consolidation,
portalled into the toolbar through `AddSlotProvider`/`AddSlotTarget`. The
persistent Palette tab Tasks 4–7 built (`presentation/add-palette.tsx`,
`domain/palette-targets.ts`, `domain/palette-insert.ts`) is now the **only**
way to add a block — by pointer or by keyboard, dragged onto the live
canvas — closing the modal path this whole feature was built to replace.

**A real semantic gap between the two mechanisms, found while adapting the
e2e suite rather than assumed away.** `AddBlockPicker`'s own placement — the
line this note used to credit to `nextChildPosition`
(`block-editor.tsx`) — filled a container's FIRST EXISTING EMPTY PLACE **in
place, with no growth**: dropping a leaf into a two-place section with one
empty place left it a two-place section, one leaf and one still-empty
place. The palette's `insertBlockAt` (`domain/palette-insert.ts`) cannot do
this and was never asked to: it always calls `insertAt`, a pure splice, so
dropping onto an existing null inserts BEFORE it — the null survives,
shifted one position later, and the container GROWS by one. There is no
production-reachable control left that fills an existing empty place
without growing its container; that capability is gone rather than merely
relocated. `support/editor.ts`'s new `firstOpenPlace` helper (below) is the
closest available approximation — it targets the first still-empty
EXISTING place, so content still lands at increasing indices in the order
it is added — but every container a fresh palette drag creates starts with
`PICKER_SPACES` (two) empty places, and those two survive every insertion
that follows, shifted to the end. A section that receives two dropped
pieces of content therefore ends with **four** real places, not two, and
every e2e fixture built against the old "N adds, N places" arithmetic had
to be re-derived rather than mechanically substituted.

**`tests/e2e/support/editor.ts` carries the new API.** `dragPaletteOnto(page,
choice, targetCanvasPath)` is the primitive — drags a palette thumbnail
(named by `{ kind }` or `{ mode }`) onto an exact `data-canvas-path`, with
the `@dnd-kit/core@6.3.1` 50ms post-drop click-swallow window (root rule 41)
awaited past on every call. `addBlock(page, choice, containerPath)` wraps
it with `firstOpenPlace`, so most call sites read almost like the deleted
`addBlock(page, choice)` they replace, with one required addition: a
container path, because a drag has no notion of "whatever is currently
selected" the way a modal targeted at the selection did. `addSection(page,
spaces)` keeps its old signature unchanged — it drags a `{ mode: "grid" }`
layout onto the page root and then reshapes it through `section-spaces`,
exactly as before.

**Nine e2e files were adapted, none rewritten from scratch.** `a11y.spec.ts`,
`border-style-cascade.spec.ts`, `editor-interaction.spec.ts`,
`editor-is-the-page.spec.ts`, `leaf-style-popup.spec.ts`,
`properties-panel.spec.ts`, `section-card-face.spec.ts`,
`section-drag-reorder.spec.ts` and `editor-saves-page.spec.ts` each needed
their `addBlock`/`addSection` calls given a `containerPath`, and a smaller
number needed a COUNT assertion corrected for the new splice-insert
arithmetic — most position-specific assertions (which path holds which
title) survive unchanged, because content still lands in the order it was
added; only assertions counting TOTAL empty places had to move. The most
extensive of these, `editor-saves-page.spec.ts`'s "sections built by hand"
test, no longer needs a manual `add-place` press at all — the palette's own
`PICKER_SPACES` supplies the extra places that press used to add by hand —
and its stranger-side empty-place count moved from 1 to 3 (the gap the test
is actually about, plus the section's own two original places, shifted past
by three successive inserts). `nested-page-build.spec.ts` needed the same
treatment at two levels — an outer section reshaped to `ACROSS = 4` (two
added pieces of content plus the two it started with) and a nested
container left at its un-reshaped `PICKER_SPACES` of two — with its
trailing-empty-place geometry check widened from one column to two.

**A page-root `AppendSlot` was added, and it is a genuine scope expansion
beyond removing the modal — recorded here rather than folded silently into
"adapting the tests."** Before this task, `blocks.tsx` never wrapped the
page's own top-level seat list in a call to `Block()`, so the `editor?.appendSlot?.(path)`
mechanism Task 6 built (see the `appendSlot` account earlier in this file)
was never invoked for the page root at all — a palette drag could add
nested content or reshape an existing section, but could not add a brand
NEW top-level section at all, since there was no rendered append slot to
drop one onto. `block-editor.tsx` now renders one directly, as a sibling of
`{seats.map(...)}` rather than through the render-prop `blocks.tsx` calls
for every OTHER container, because the page's own list is not itself a
`Block()` call. This is what makes `addSection`'s continued existence
possible at all now that the modal it used to drive through `add-section`
is gone: dragging a `{ mode: "grid" }` layout onto the page root is now how
a new section is added, full stop, and that needed a real droppable target
to exist.

**A real, only-in-a-browser fault, found by the first full e2e run against
this branch rather than by any static check.** `dragPaletteOnto`'s first
draft read `boundingBox()` off the palette thumbnail and the canvas target
with neither scrolled into view first. `boundingBox()` answers an
element's LAID-OUT position whether or not it currently sits within the
visible scrollport — the Palette tab lists all sixteen leaf kinds and eight
container modes in one scrollable pane, and a container-mode thumbnail
(`grid`, the one every `addSection` call drags) sits well below the fold on
an ordinary viewport. Moving the mouse to that off-screen position starts
no drag at all: a real browser does not dispatch a pointer event to a point
outside the current viewport, so `page.mouse.down()`/`move()`/`up()`
completed without error and the drop landed nowhere — no thrown assertion,
no console error, nothing for `dragPaletteOnto`'s own null-checks to catch,
since both bounding boxes were real, non-null rectangles. **This broke
`addSection` for every caller across the whole suite at once**, because
every one of them adds its first section through a `{ mode: "grid" }`
palette drag onto the page root — measured: 20 failures across nine files
touched by this task plus `palette-drag-to-add.spec.ts` and
`section-style-popup.spec.ts`, neither of which this task edited, all
failing at the identical assertion inside `addSection` itself
(`section-spaces` never becoming visible), which is what made this a
single shared-helper fault rather than twenty independent ones. Confirmed
by direct reproduction against a real signed-in session outside the test
runner: the identical drag against the identical target succeeded once
`scrollIntoViewIfNeeded()` was called on both the thumbnail and the target
before reading either bounding box, and failed, silently, without it. Both
ends are scrolled into view now, and the comment beside the fix in
`support/editor.ts` carries the account so the next person touching this
helper does not remove the call reading it as redundant.

**A second full e2e run — needed because the first one only exercised the
fix above — found two more faults, and only one of them was in the
product.** Both are the kind root rule 31 warns about: neither was
reachable from any unit suite, because both concern what a real drag
actually lands on rather than what a pure function returns.

- **A TEST bug in `nested-page-build.spec.ts`'s own place count.**
  `[data-canvas-path^="1-"]` matches every DESCENDANT under section "1", not
  only its direct children — a nested grid built two levels down carries its
  own two starting empty places at `"1-1-0"`/`"1-1-1"`, which also start
  with `"1-"` and were silently counted alongside the outer section's own
  four, reporting 6 where the outer section's own shape is 4. The fix
  filters to paths exactly one segment past the prefix
  (`data-canvas-path.split("-").length === 2`), which is what "the outer
  section's own real places" actually means. A second, adjacent comment in
  the same file had drifted the same way it warned against elsewhere in this
  note: it implied the nested container's own place count STAYED at two,
  which is false — it grows from two to four by the identical
  splice-insert-always-grows mechanism the outer section does; only its
  `spaces` FIELD stays at two, because nothing ever reshaped it. Both are
  corrected in the file's own comments now rather than left for the next
  reader to re-derive.
- **A genuine product-code regression in `onDragEnd`'s palette branch,
  caught by `properties-panel.spec.ts`'s "Escape aimed at a field inside the
  panel keeps the selection" — the case expects `leaf-kind` to be visible
  immediately after dropping a leaf at the page root, and it was not.**
  `insertBlockAt` wraps a bare leaf landing at the page root in a new
  one-place `stack` first (see that function's own TSDoc) and returns
  `path` as the WRAPPER's own position, never the leaf's nested one. The
  old, now-deleted `addAt` handled this exact case explicitly —
  `isContainer(block) ? [position] : [position, 0]` — and the new palette
  mechanism's `onDragEnd` simply carried `result.path` straight into
  `setSelection`, selecting the stack rather than the leaf inside it. The
  Properties panel then showed the wrapper's Layout tab (a container's
  fields) instead of the leaf's Content tab, so `leaf-kind` was never
  rendered at all. Fixed by mirroring the deleted `addAt`'s own logic: when
  the palette item is a leaf and its target's parent path is empty — the
  exact condition `insertBlockAt` uses to decide whether to wrap —
  `setSelection` is handed `[...result.path, 0]` instead of bare
  `result.path`. This is a real behavioural fault this branch introduced
  and its own required e2e run is what caught it, not a test needing
  adaptation to a mechanical rename.

**Verified.** `pnpm --filter hub test` — 3,781 tests, 100% branch coverage,
zero regressions from this branch's own edits to production code beyond the
three named above — `block-card.tsx`'s comment, `block-editor.tsx`'s new
page-root `AppendSlot` (plus the extraction of `pageRootAppendSlot` as its
own top-level helper, needed to keep `BlockEditor` under the
cognitive-complexity budget and to keep its ref read out of
`react-hooks/refs`' reach), and `onDragEnd`'s selection-path fix above — and
everything else changed outside `tests/e2e/`. `pnpm lint` (root), `pnpm
typecheck`, `pnpm --filter hub build`, `pnpm check:docs`, `pnpm
check:agent-notes` and `pnpm check:tools` all clean. `pnpm --filter hub
test:e2e`, run with `.secrets` sourced in the same shell invocation (root
rule 31), reports the full case count rather than a partial one — see this
section's own account above for the two real faults the second full run
found and the fixes that closed them.

**Confirmed via `grep -rn "AddSlotProvider\|AddSlotTarget\|AddBlockPicker\|addTargetFor" apps/hub/src apps/hub/tests`:**
every remaining hit is prose — a past-tense account in this file, in a TSDoc
paragraph explaining what a mechanism replaced, or in a code comment naming
what something is NOT any more — never a live import, a live component
usage, or a live test target. `presentation/add-palette.tsx`'s own TSDoc
(Task 4) still names `AddBlockPicker` twice as the thing its preview
mechanism and its props mirror — read those as history, the same as every
other "used to be X" sentence in this file; `add-palette.tsx` itself is
untouched by this task; there is no code left for either name to resolve
against.

### The closing sweep (2026-09-06) — Task 9 of 9

The feature's last task adds no mechanism of its own. It fills three
coverage gaps Tasks 5–7 named and left for later, points a real
accessibility scan at the palette DRAGGING rather than merely open, and is
the occasion for this note's own standing re-read obligation.

**A real bug: a palette-origin lift announced "Picked up ." naming
nothing, on a THIRD id space nobody had checked.** `block-editor.tsx`'s
`accessibility.announcements` built its spoken name from
`placeName(canvasPlacePath(id) ?? placePath(id) ?? [])`, which understands
the inspector's `"place:"` prefix and the canvas's `"canvas-place:"` prefix
— the same two the file's own account above already documents fixing for
`refusalOf` and this exact callback, on 2026-09-04. A palette-origin drag
id (`"palette:leaf:text"`, `"palette:container:grid"`) matches neither, so
it fell through to `placeName([])`, an empty designation, on every palette
lift since Task 5 shipped pointer wiring. `dragItemName(id)` is the fix: it
checks `palettePayload(id)` first, naming the leaf kind or container mode
through the same `labels.leaf.leafKinds`/`labels.modes` records the
catalogue guard already parity-checks, and falls back to the existing
`placeName` resolution for every other id. **No new catalogue strings were
needed** — `over.id` during a palette drag is always a real canvas place,
never a palette id, so only the LIFT side of the announcement needed the
new branch; `lifted`/`over`/`dropped`/`cancelled` are unchanged. Pinned in
`block-editor.test.tsx` and sabotage-verified: reverting `dragItemName` to
the old bare `placeName` call reddens exactly that one case with the
predicted message, and nothing else.

**Three browser cases close what Tasks 5–7 left as coverage gaps rather
than defects.** `palette-drag-to-add.spec.ts` gained:

- **A keyboard lift onto a fully occupied container's own append slot adds
  a place rather than displacing the one already there.** Fills a
  one-space section by pointer first, reopens the palette, lifts by
  keyboard, steps twice (the same defensive margin `liftByKeyboard`'s own
  rAF-then-timer sequencing exists for — root rule 26 — proven safe here by
  tracing which of the reachable `order` entries two presses can land on),
  drops, and asserts the section's own place count grows from one to two
  without pinning which exact place received it — root rule 27's own
  discipline against a fixture that cannot discriminate a right landing
  from a wrong one when several are equally acceptable.
- **A container-kind drag past the depth cap shows no highlight, by
  pointer.** Builds a three-deep container tree — a section, a container
  inside it, a container inside that, the deepest a container may sit —
  and asserts `data-canvas-drop="place"` is ABSENT from every place inside
  the deepest container while present on a shallower one. This is the
  domain-level finding `insertTargetsFor` already states restated as a
  browser fact: a container target past the cap is never OFFERED at all, so
  there is no refusal to show — the correct proof is an absence of
  highlight, never a refused-drop banner, and a case built expecting the
  banner would assert something this pipeline cannot produce.
- **The same drag never lands inside that container by keyboard either.**
  Same tree, keyboard lift, two `ArrowUp` presses (the identical bounded
  margin), drop, and asserts the too-deep container's own places are
  unchanged in count while its PARENT's own child count grew by one — proof
  the drag landed somewhere real rather than merely failing to land
  anywhere.

**The a11y scan of the palette OPEN already existed; what this task added
is the scan of a drag IN PROGRESS, and the distinction is worth keeping
precise.** `a11y.spec.ts` already had a static "the editor with the
Palette tab open" case, added incidentally by an earlier task's own
comment referencing the deleted `AddBlockPicker` — so the closed-tab state
was covered before this task touched the file. What was missing, and is
the actual instance of root rule 19's own "a scan of a closed state cannot
catch what only exists open" (already proven twice in this file, by the
page-source dock's resize grip and its copy button), is a scan of the
DRAGGING state itself: a real pointer press-and-move onto an empty place,
held open long enough to run `isAccessible` while `data-canvas-drop="place"`
is genuinely active, then released safely. **The axe scan itself found no
defect** — both the resize grip and the copy button were structural faults
in PERSISTENT markup, where a drag's own accessibility surface here is
transient and newly built — but the absence of an axe finding is not the
same claim as the absence of a scan, and this closes the second one.
**Building this exact case is what found the two real bugs below**,
neither of them an accessibility fault: `isAccessible` never ran against a
genuinely broken page, because the highlight the case exists to scan
never existed until the first of the two was fixed.

**A real, previously-undiscovered product bug: a palette-origin drag never
showed its highlight to a real pointer at all, and `data-canvas-drop="place"`
had been silently dead since Task 5.** `insertTargetsRef`
(`block-editor.tsx`) is a `useRef`, written in `onDragStart`'s palette
branch and read by every `EditableBlockFrame`/`AppendSlot` on the page
through `wrap`/`appendSlot`'s own closures — but a ref write triggers no
re-render, and `onDragOver`'s own `setAdvertisedTarget(keyboardTarget.current
?? pointerTarget.current)` is a no-op for a palette-origin drag
specifically, since those two refs are written only by canvas-move code
paths and both read `null` throughout one. React bails out of a `setState`
call whose value is `Object.is`-identical to the current one, so nothing
after `onDragStart` ever forced the render that would let a fresh
`insertTargetsRef.current` reach the DOM. The highlight this whole feature
is built around — "every valid target lights up at once" — had never
actually lit anything, in any browser, since the day pointer wiring
shipped; nothing caught it because no case before this one asserted the
attribute's VALUE, only the drop's eventual outcome, which `insertBlockAt`
reaches independently of any highlight. Fixed with a second `useState`,
`paletteDragActive`, toggled `true` in `onDragStart`'s palette branch and
`false` in `onDragCancel` and `onDragEnd`'s palette branch — its own value
is never read; it exists purely to force the render `insertTargetsRef`'s
own fresh write needs. `a11y.spec.ts`'s "a palette-origin drag in
progress" case is what caught it, at the exact assertion this section
already documents (`toHaveAttribute("data-canvas-drop", "place")`), and it
is sabotage-verified: removing either `setPaletteDragActive` call reddens
that one assertion and nothing else in the unit suite, because every other
case reaches the drop through the ref directly rather than through a
render.

**A second, previously-undiscovered bug came out from behind the first:
lighting up every insert target at once can grow the page, and a test's
own drag geometry — read once, before the lift — goes stale the instant
that happens.** `AppendSlot`'s class carries `min-h-12` ONLY while
`data-canvas-drop="place"` is set (`editable-block-frame.tsx`) — by design,
since its own TSDoc already says it draws "visually nothing at all unless
a palette drag currently offers it." An ordinary empty PLACE already
reserves that height unconditionally, so nothing there moves; an append
slot does not, so the moment any container's own append slot becomes a
valid target — which happens for nearly every drag, since `insertTargetsFor`
offers a leaf unconditionally at every append slot and a container
wherever `mayNest` admits one — that slot's box grows from zero to 48px,
pushing everything below it down by exactly that amount. On a page whose
identity section (path `"0"`) sits above the section a test is dragging
into, two such append slots growing (its own, and its nested container's)
shifted everything below by 96px mid-drag — measured directly with
`getBoundingClientRect()` before and after the threshold-crossing move.
Because this highlight had never actually appeared before the fix above,
no test had ever exercised the reflow it causes, and `dragPaletteOnto`
(`tests/e2e/support/editor.ts`), the one shared helper nine spec files
drive every palette drag through, read the drop target's `boundingBox()`
**before** the lift and never again — a real person tracking the highlight
visually would re-aim; a single scripted `mouse.move()` to a
pre-computed coordinate cannot. The fix lives in that one helper rather
than in each caller: after crossing `DRAG_THRESHOLD`, it now waits for at
least one `[data-canvas-drop="place"]` to be attached — proof the
highlight-driven reflow has already happened, not merely that time has
passed, matching root rule 26's "wait for a CHANGE, not for presence" on a
layout reflow rather than a listener attach — and only then re-reads the
target's box before moving the mouse the rest of the way. Every caller of
`dragPaletteOnto`/`addBlock`/`addSection` across the suite is protected by
this single change; none needed its own fix.

**A third bug, this session's own and not the product's: the keyboard
depth-cap case's tree-building calls had been dropped entirely during an
earlier rewrite of its own comment**, leaving `addSection`/`addBlock`
missing before the container-path assertions that depend on them —
`"1-0-0"` never existed, so every `data-canvas-path="1-0-0-*"` assertion
read a count of zero rather than one. Restored; the case passes with the
same relative-count assertions this file's own account of Task 9's earlier
work already describes.

**The full required suite ran clean.** `pnpm --filter hub test` (3,782
tests, 100% coverage), `pnpm lint`, `pnpm typecheck`, `pnpm --filter hub
build`, `pnpm check:tools` and `pnpm --filter hub exec playwright test
--project=chromium tests/e2e/a11y.spec.ts tests/e2e/palette-drag-to-add.spec.ts`
(6 + 6 cases) all pass against the fixes above. An earlier run in this same
session had also shown a batch of failures carrying
`net::ERR_INTERNET_DISCONNECTED`/`net::ERR_NETWORK_CHANGED` across
unrelated spec files, which root rule 41 already names as a network fault
rather than a flaky test — that failure mode is real and was confirmed
separately, but it is not what the two bugs above are, and the two must not
be conflated: a network blip explains a batch of unrelated navigations
failing together, and does not explain one specific highlight attribute
never appearing or one specific tree never being built.

### One ghost-slot mark for every drop landing (2026-09-08) — component only

`presentation/drop-mark.tsx` adds `DropMark({ kind, height })`, the one
component meant to replace the three inline fragments `EditableBlockFrame`
currently draws by hand for `before`/`after`/`place`. It is absolutely
positioned and `pointer-events-none` so it never reflows the canvas mid-drag
— `@dnd-kit` caches droppable rectangles at drag start, and a layout shift
under those rectangles is exactly the palette-drag reflow bug this file
already documents above. `height` is `null` for a palette drag, since the
carried block does not exist yet and has nothing to measure; the mark still
stands at its own `min-h-12` rather than collapsing to nothing.

**Nothing renders it yet.** No caller has been rewired to use it —
`EditableBlockFrame` still draws its own three fragments — so this is the
component and its own six-case test suite only, the same incremental shape
as the palette-targets entry just above it. Wiring it into the two real
callers is a later task.

**Review fix, same day: `drop-mark.test.tsx`'s kind-specific cases now assert
whole class tokens (`top-0`/`-translate-y-1/2` for `before`, `bottom-0`/
`translate-y-1/2` for `after`, `inset-0` for `place`), and each excludes the
tokens that would place a DIFFERENT kind's box.** That is narrower than "the
other kinds' tokens" stated as a blanket claim — corrected here rather than
left overstating what the suite checks (2026-09-11): only the `place` case
excludes all four positioning tokens; `before` excludes `inset-0`/`bottom-0`
but not `translate-y-1/2` (a token `before` never carries, since it only ever
carries `-translate-y-1/2`), and `after` excludes `inset-0`/`top-0` but not
`-translate-y-1/2` for the mirrored reason. The original suite asserted only
test id and height, so swapping the `before` and `place` entries in
`PLACEMENT` left it green — rule 27 exactly. Sabotage-verified: that swap
reddens precisely the `before` and `place` cases and nothing else; restored
from a copy taken before the edit, not `git checkout --`.

### The frame draws one mark, and stops lighting everything (2026-09-11) — Task 3 of the feature

`EditableBlockFrame` draws exactly one `DropMark` now, driven solely by
`editor.activeTarget` — the single winner a drag's own collision has
already resolved — rather than a separate `insertTargets` field that lit up
every palette candidate at once. That field, its TSDoc, its
`isInsertTarget` membership check and the two hand-drawn `before`/`after`
`<span>` fragments are gone; the `data-canvas-drop="place"` attribute is
now written from `activeTarget` alone, with no `&& isOver` gate — `isOver`
is never set in jsdom, which is exactly what made the old mark
unobservable there, so it is dropped from the `useDroppable` destructure
entirely rather than kept unused. `EditableBlockInstrumentation` gained
`carriedHeight: number | null` in the field's place, threaded straight into
`DropMark`'s own `height` prop.

**Superseded by Task 8, same day: the attribute itself is gone.** Once
every mark is located by its own `canvas-drop-before`/`-after`/`-place`
test id, `data-canvas-drop` was a second vocabulary for the identical fact
— see "Task 8" below for the close-out.

**The palette's own winner is NOT published through `activeTarget` yet —
that is still a later task, exactly as this task's own brief says.**
`advertisedTarget` (`block-editor.tsx`) stays `null` for the whole course of
a palette-origin drag, unchanged by this task, so `EditableBlockFrame` now
draws no mark at all during a palette drag rather than lighting up every
valid target as it used to. `block-editor.tsx`'s one call site passes
`carriedHeight: null` for a canvas-move drag too — there is no carried
block for `DropMark` to measure there either, since a canvas-move drag
moves the rendered node itself rather than a ghost of it.

**`AppendSlot` is untouched, on purpose, and is now the one place in the
canvas that still lights up every valid palette target at once.** It reads
its own, separate `insertTargets` prop — fed from the same
`insertTargetsRef` block-editor.tsx already threads, never from
`EditableBlockInstrumentation` — and its membership-based highlight is
exactly what it was before this task. That asymmetry is real, not an
oversight: this task's file list names `editable-block-frame.tsx`'s
`EditableBlockFrame` function and interface alone, not `AppendSlot`.

**Two e2e specs were updated to keep the suite honest, per the brief's own
correction 2, and one of them needed more than a comment fix.**
`tests/e2e/support/editor.ts`'s two bare `insertTargets` mentions in
`dragPaletteOnto`'s own comments now say the highlight they describe comes
through `AppendSlot` alone — the underlying mechanism they document
(waiting for `[data-canvas-drop="place"]` to appear before re-reading a
drop target's geometry) is unaffected, because it was always `AppendSlot`'s
own `min-h-12` growth being waited for, not anything `EditableBlockFrame`
did. `tests/e2e/palette-drag-to-add.spec.ts`'s "shows no highlight for a
container-kind drag past the depth cap, while a shallower target still
lights up" test had asserted `data-canvas-drop="place"` on THREE existing,
`EditableBlockFrame`-rendered places (`"1-0-0-0"`, `"1-0-0-1"`, `"1-0-1"`)
— none of which can carry that attribute any more, valid target or not, so
the "still lights up" half would have failed outright and the "no
highlight" half would have passed for a reason that no longer discriminates
anything. Both checks were moved onto each container's own APPEND SLOT
instead (`"1-0-0-2"`, refused — a fourth level down; `"1-0-3"`, admitted —
`"1-0"`'s own append slot, one level shallower), which is the one mechanism
in this exact tree still driven by unchanged code. The append-slot indices
are derived from `insertAt`'s own splice-before-null arithmetic, traced by
hand against `firstOpenPlace`'s and `insertBlockAt`'s own documented
contracts rather than run against a live browser — this task did not run
the Playwright suite, per its own instructions, so that trace is worth
re-checking the first time this spec is actually run again.

**Verified:** `pnpm --filter hub test` (3,806 tests, all passing, no
regressions), `pnpm typecheck` and `pnpm lint` (repository root) both
clean. The Playwright suite was not run, per this task's own instructions.

### A palette drag publishes the gap it will land in, and AppendSlot draws only the winner (2026-09-11) — Task 4 of the feature

Task 3's own entry above left two things true that are false now: a palette
drag marked nothing on an existing block, because nothing published its
winning target through `activeTarget`; and `AppendSlot` still lit up every
valid insertion target at once, through its own separate `insertTargets`
membership check. Both are closed. **A palette drag now marks its landing
exactly like a canvas-move drag does, and every mark in the canvas — on an
existing block or on an append slot — is the single winner, never a set.**

**`block-editor.tsx`'s `onDragOver` now branches on `palettePayload` first,
mirroring `onDragStart`'s own branch.** For a palette-origin drag it reads
`event.over`, finds the matching `InsertTarget` in `insertTargetsRef.current`
by comparing `canvasPlaceId`s, and translates it through `insertMarkFor`
(Task 1's own pure function, wired to a caller for the first time) into a
`DropTarget`. The result is published through the SAME `advertisedTarget`
state a canvas-move drag already used — there is one field now, not two —
so `EditableBlockFrame`'s existing `activeTarget: advertisedTarget` needed
no change at all to start drawing a palette drag's mark. A new ref,
`paletteTarget`, holds the value between renders for the same reason
`pointerTarget` does; it and a second new ref, `carriedHeightRef`
(measured once at `onDragStart` from `event.active.rect.current.initial`
for a canvas-move drag, `null` for a palette one), are both cleared
alongside the existing `insertTargetsRef.current = null` lines in
`onDragStart`'s canvas branch, `onDragCancel`, and `onDragEnd`'s palette
branch.

**`AppendSlot` (`editable-block-frame.tsx`) reads `activeTarget`/
`carriedHeight` now, the same two fields `EditableBlockInstrumentation`
carries, passed as their own props rather than that whole interface since
this component has no `selectedPath`/`dragLabel` to instrument. The
`insertTargets` field and its membership check are gone.** It draws a
`DropMark` when `activeTarget`'s own path equals this slot's exact encoded
path — mirroring `EditableBlockFrame`'s identical check — and that
condition is narrower than it looks: `insertMarkFor` only ever answers
`{ kind: "place", path: [...parent, 0] }` for a container with NO EXISTING
CHILDREN, which is exactly when the append slot's own position (index 0)
IS that container's only place. Every other append target `insertMarkFor`
names resolves to `after` the container's own LAST CHILD — a different
element's path, drawn by that child's own `EditableBlockFrame` instead, not
by the append slot at all. So an append slot only ever draws a mark for a
container that starts out completely empty (including the page root, when
`blocks.length === 0`); dragging onto the trailing append slot of an
ordinary, already-populated container marks the last child's own frame with
an `after` gap, and the append slot beside it draws nothing.

**The wrapper's own box no longer changes size, marked or not — closing the
"second half nobody noticed" the dispatching task named.** Before this
task, `AppendSlot`'s class carried `min-h-12` (and a border/outline) ONLY
while its old membership check matched, so an ordinary palette drag —
which lights up several containers' append slots as valid targets at
once — grew each one from zero height to 48px the instant the drag began,
reflowing the canvas under `@dnd-kit`'s own cached droppable rectangles:
exactly the fault the design's out-of-flow constraint exists to forbid,
and a second instance of it beyond the "lights up everything" defect the
brief opened with. The wrapper carries no size-changing class at all now —
just `relative ${CHROME_SCOPE}`, always. The mark itself, a `DropMark`, is
`position: absolute` with its own `min-h-12`; per CSS, an absolutely
positioned box's `min-height` still floors its computed height even when
`top`/`bottom` (or here, no insets at all governing height) would otherwise
resolve it against a zero-height positioned ancestor — so the visible
48px comes from the mark itself, out of flow, and the wrapper's own
box never moves.

**A real, deliberate consequence of removing that growth: `AppendSlot` no
longer ever carries a `data-canvas-drop` attribute, of any value.** The
attribute was the growth's own trigger (`data-[canvas-drop=place]:min-h-12`
and its neighbours); removing the growth removed the attribute along with
it, since nothing else read it. Task 3's own entry above says
`tests/e2e/support/editor.ts`'s `dragPaletteOnto` waits for
`[data-canvas-drop="place"]` to appear as proof the highlight-driven reflow
has settled before re-reading a drop target's geometry, reasoning "it was
always `AppendSlot`'s own `min-h-12` growth being waited for, not anything
`EditableBlockFrame` did." That reasoning is exactly right about which
mechanism the wait depended on, and this task removes that mechanism: for
an ordinary, already-populated container — which is the common case, and
what most e2e fixtures build — `insertMarkFor` never answers `place` at
all during a palette drag, so the attribute this helper waits for will not
appear and the wait will time out. **This is not fixed here.** It is out
of this task's own stated scope (`task-4-brief.md` names only
`block-editor.tsx` and its own test; controller correction 2 adds
`editable-block-frame.tsx`'s `AppendSlot`, not the e2e support helpers),
and Task 7, "The browser proof — the mark is where it lands," is
explicitly where `tests/e2e/palette-drag-to-add.spec.ts` and its shared
helpers get rewritten for the new mark vocabulary. Flagged here in full
rather than left to be rediscovered as a mysterious timeout.

**A unit test drives this through the real sensor rather than through a
hand-built prop, and it had to solve a real discrimination problem to do
so.** jsdom's `getBoundingClientRect` answers an all-zero rect for every
element, so `detectCollisionAt`'s POINTER branch cannot tell "hovering the
first child" from "hovering the second" — every registered droppable
"contains" the same `(0, 0)` point, and ties always resolve to the first
depth-maximal candidate `insertTargetsFor`'s own walk visits, which for any
container is always its OWN first splice. The new case in
`block-editor.test.tsx`, "publishes a gap mark while a palette drag hovers
a filled position," drives the KEYBOARD branch instead: `paletteCoordinateAt`
resolves a step purely from `stepInsertTarget`'s ordered list, with no
geometry involved at all, so the exact landing is predictable from the
page's own shape. For a single two-child section the order is `[0]`
(before the section), `[1]` (the page's own trailing append slot), then
`[0,0]`, `[0,1]`, `[0,2]` — four `ArrowDown` presses from a fresh lift lands
on `[0,1]`, which `insertMarkFor` translates to a `before` mark on the
SECOND child's own path. The case cancels rather than drops, so it makes no
claim about where the block lands — only about what is drawn while it
hovers.

`editable-block-frame.test.tsx`'s `AppendSlot` describe block was rewritten
to match `EditableBlockFrame`'s own shape: path-equality cases (draws
nothing with no target, draws nothing when the path differs, draws the mark
when it matches), a `carriedHeight` sizing case, and one case proving the
kind drawn is whatever `activeTarget.kind` actually carries rather than a
hardcoded `"place"` — the component's own logic never branches on the kind
beyond passing it to `DropMark`, so nothing forces this to redden without
naming it directly.

**Every module-level and function-level TSDoc paragraph this task's own
diff touches was re-read and corrected in the same change**, not left
pointing at "a later task" that had by then become this one:
`EditableBlockInstrumentation`'s own interface doc, `EditableBlockFrame`'s
function doc, `AppendSlotProps`'s doc, `AppendSlot`'s function doc,
`paletteCoordinateAt`'s doc (which used to credit `AppendSlot` as "the one
place still lighting up every candidate at once"), and `BlockEditor`'s own
top-level doc paragraph naming `carriedHeight: null` as a fixed literal
rather than the now-live `carriedHeightRef.current` read.

**Verified:** `pnpm --filter hub test` (3,809 tests, all passing, no
regressions outside this task's own edits), `pnpm typecheck` and
`pnpm lint` (repository root) both clean. The Playwright suite was not
run, per this task's own instructions — see the flagged consequence above
for what the first real run against this branch will hit.

**The consequence above is fixed now, same day, by owner's ruling
overriding the deferral.** All four sites that depended on
`data-canvas-drop="place"` as a membership signal are corrected rather than
left for Task 7 — the ruling was that `dragPaletteOnto` is load-bearing
for Task 7's own browser proof, and this branch has already paid once for
leaving a suite red across several tasks. `data-canvas-drop` itself stays
on `EditableBlockFrame` (still the only place that writes it, at this
task's own moment), deferred to a later coherence pass rather than removed
here — it is redundant with the mark's own test id now, not wrong. **That
coherence pass is Task 8**, which removes the attribute outright — see its
own entry below for what that cost in the tests that had been asserting it.

**One of the four sites turned out to need more than a selector swap, and
finding that is the actual content of this addendum.**
`tests/e2e/support/editor.ts`'s `dragPaletteOnto` used to wait for
`[data-canvas-drop="place"]` to appear immediately after crossing the drag
threshold — BEFORE moving the pointer anywhere near the real target. That
was safe under the old membership-based highlight, which lit up every
valid target the instant the drag began, independent of pointer position.
It is not safe under the single-winner design this task shipped: a mark
now only exists once the pointer is actually over a valid landing, which
this function's own code order did not reach until AFTER the wait. A
literal "swap the attribute for the test id, keep everything else"
edit — which is what a first reading of the fix suggested — would have
made every caller of `dragPaletteOnto` (and therefore `addBlock` and
`addSection`, which both route through it) wait for something that cannot
exist yet, timing out on every call. Given how many e2e specs depend on
those three functions, that would have been a large, confusing regression
introduced by the very fix meant to prevent one.

The corrected function moves the pointer onto the real target FIRST, then
waits for whichever of `canvas-drop-before`/`-after`/`-place` the drop
answers — unscoped to `targetLocator`, because `insertMarkFor` marks an
already-populated container's trailing append slot by drawing `after` on
its LAST CHILD rather than on the append slot's own element (see that
function's own TSDoc, and the "second half" account above), so a valid
drop's mark is not always the target locator's own descendant. The
now-obsolete "wait for the reflow, then re-read geometry a second time"
framing is corrected too: THE WINNER changing mid-drag never reflows the
canvas any more, on any target, so the second geometry read that remains
is a general safety margin rather than a fix for that specific known
reflow. **This is narrower than it reads, and the paragraphs below name
the exception: an `AppendSlot` target's own box still grows once, from its
reservation, at the drag's own start — a size change that happens WHILE a
drag is in progress, just never again for the rest of it.** (final review,
2026-09-11 — the sentence above predates the third round further down this
same task's entry, which reinstated that reservation and never came back
to correct this sentence.)

`tests/e2e/palette-drag-to-add.spec.ts`'s depth-cap test
("shows no highlight for a container-kind drag past the depth cap, while a
shallower target still lights up") needed the same reckoning, worked
through by hand against `insertTargetsFor`/`mayNest`/`insertMarkFor`
rather than assumed: its two `data-canvas-path` targets, `"1-0-0-2"` (the
depth-capped container's own append slot, refused) and `"1-0-3"` (a
shallower container's own append slot, admitted), used to carry the
attribute simultaneously with the pointer never having moved near either —
the same membership artefact `dragPaletteOnto` depended on. Tracing the
exact tree this test builds (`addSection` then two `addBlock` calls, each
of which INSERTS-before rather than replacing, per `firstOpenPlace`'s own
documented growth) confirmed the tree has "1" holding 3 children, "1-0"
holding 3, and "1-0-0" holding 2 — which is what makes "1-0-0-2" and
"1-0-3" the correct append-slot names Task 4's own author had already
worked out; that part of the old test was right. What changed is WHERE
each hover has to land and what mark it actually produces:

- Hovering "1-0-0" itself (not its own nested places, all refused by the
  depth cap) resolves to the shallower target BEFORE it — the nearest
  landing `insertTargetsFor` still offers — and draws a `before` mark on
  "1-0-0" itself. The refusal is now asserted directly: nothing carrying
  any `canvas-drop-*` test id exists anywhere under `"1-0-0-*"`.
- Hovering "1-0-3", "1-0"'s own append slot, resolves to exactly that
  target (its own registered droppable id, unambiguous) — but
  `insertMarkFor` answers `{ kind: "after", path: [1,0,2] }` for it, since
  "1-0" is already populated, so the VISIBLE mark renders on "1-0-2" (its
  last existing empty child), never on "1-0-3" itself. The assertion reads
  the mark off "1-0-2", not off the element the pointer is actually over.

`tests/e2e/a11y.spec.ts`'s drag-in-progress scan had the identical fault
in miniature — asserting `data-canvas-drop="place"` on "1-0" (section
"1"'s own first empty place) with the pointer still at the palette
thumbnail. Fixed the same way: the pointer now moves onto "1-0" before the
scan, and the assertion reads `canvas-drop-before` (an existing empty
child gets a `before` mark from `insertMarkFor`, never `place` — that
kind is reserved for a genuinely empty container's own position).

**All three comments were rewritten in the same change, not left
describing the deleted membership behaviour** — the coordinator's own
caution, paid for concretely: a comment saying "every valid target lights
up at once" next to code that no longer does that is exactly the kind of
confident, wrong instruction this file warns about everywhere else.

**How this was verified without a browser run**, since Playwright was not
executed: the fix rests on tracing `detectCollisionAt`'s palette branch
(`block-editor.tsx`), `insertTargetsFor`, `mayNest`, and `insertMarkFor`
(`domain/palette-targets.ts`) by hand against the exact tree each test
builds, cross-checked against `firstOpenPlace`'s own documented
insert-before-grows-the-container behaviour (`support/editor.ts`) rather
than assumed. The one thing this could not settle by reading code is
whether real pixel geometry ever makes an unrelated candidate's rect
ALSO contain a hover point meant for a different target — considered and
set aside for the "1-0-0-2" case specifically by choosing to hover "1-0-0"
itself (a normally sized, real block) rather than its own nested,
zero-height append slot, which sidesteps the ambiguity rather than resolves
it by measurement. This is the one place in this whole task where "I
satisfied myself it is right" is weaker than a browser run would make it —
flagged rather than asserted as certain.

**Verified again:** `pnpm --filter hub test` (3,809 tests, unchanged —
none of these four files is part of the vitest suite), `pnpm typecheck`
and `pnpm lint` (repository root) both clean, `pnpm check:tools` clean
(cspell: 0 issues across 544 files). The Playwright suite was still not
run.

**A third round the same day found the reasoning above was wrong about
something more basic than any e2e selector, and it was found by measuring
rather than by re-reading the CSS.** The coordinator compared `AppendSlot`
against `main` directly: before this task, its own wrapper carried
`data-[canvas-drop=place]:min-h-12` — height on the SLOT ITSELF, triggered
by membership; after, the wrapper carries no size-changing class at all,
and the mark is `DropMark`, which is absolutely positioned and contributes
nothing to its parent's box. If that reading were right, an append slot
would be zero-height whether marked or not — and there is a chicken-and-egg
in that: the slot needs height for a pointer to land inside its rectangle,
and it is only marked once the pointer already has. That is a WORSE bug
than the light-everything fault this whole feature exists to fix, and it
would have been caused by this design's own "draw out of flow" rule,
applied to the one component whose only height ever came from its own
mark.

**Measured directly rather than taken on the coordinator's word.** A
throwaway Playwright spec (never committed, deleted after use) signed in,
opened `/es/pages/new`, started a real palette drag, held the pointer well
away from the canvas, and read `boundingBox()` on the page's own root
append slot. **Before this fix: `{"height":0}`, identically before the
drag and during it.** `getComputedStyle` agreed: `height: "0px"`. The
reasoning was correct. An append slot had been genuinely unreachable by a
real pointer since this task's own first commit — worse than illegible,
since illegible at least LANDS somewhere.

**The fix separates two questions `insertTargets` used to answer
together and one field cannot answer alone.** `activeTarget` still decides
which ONE valid landing draws an actual `DropMark` — that half is
untouched. `insertTargets` came back as `AppendSlotProps`' third field,
answering a different question: whether THIS position needs a real,
hittable rectangle for the duration of the drag, regardless of whether it
is the current winner. `AppendSlot` computes `reserved` from it — the
identical membership check the deleted `isInsertTarget` used to make — and
applies `min-h-12` when `reserved` is true, with no border, no background,
no outline: nothing is DRAWN by this, only reserved. `activeTarget` and
`insertTargets` can now disagree in either direction: a slot can be
reserved and unmarked (every valid target except the one under the
pointer), or — for the one case `insertMarkFor` ever produces a `place`
kind on an append slot's own path, a container starting with no children
at all — reserved AND marked at once. All four cases are pinned in
`editable-block-frame.test.tsx`.

**Why this is safe against the exact reflow this design forbids, and the
coordinator's own reasoning for that is what this fix relies on rather
than re-deriving.** `insertTargets` — `insertTargetsRef.current` — is
computed exactly once, at `onDragStart`, and does not change for the rest
of the drag; every reservation therefore happens in the SAME render as the
drag's own start, before `@dnd-kit` measures and caches its droppable
rectangles. What the out-of-flow rule forbids is the canvas reflowing as
the WINNER changes mid-drag — the fault Task 4's own first version
introduced and this file's earlier entries already document at length.
Reserving space once, at the start, for every valid target at once, and
never again for the rest of that same drag, is a different event
entirely: measured again with the fix applied, the same append slot reads
`{"height":0}` before the drag and `{"height":48}` during it, unchanged for
as long as the drag continues with the pointer held in the same place.

**"Before `@dnd-kit` measures" was corrected by the branch's own final
review (2026-09-11) — the reasoning above claims a render-ordering race
that turns out not to exist, and the fix it defends is safe for a
different reason than the one written down.** `MeasuringStrategy` is
`WhileDragging` by default, which does not settle the question by itself:
the only way to know whether the SPECIFIC rect used for the FIRST
collision after `onDragStart` is fresh or stale is to compare `@dnd-kit`'s
own cached rect against a live `getBoundingClientRect()`, not to read more
source. Measured, twice, against a real running page:

- A droppable ("2-0") sitting below a container whose own append slot gets
  reserved on this drag reads `{"y":534.78}` before the drag and
  `{"y":647}` once `onDragStart` has fired — a real 112.2px reflow, not the
  48px the reservation alone accounts for (the rest is spacing the two
  newly-real empty places above it also carry; both numbers are real, not
  a measurement error).
- **The pointer's own threshold-crossing move never produces an
  `onDragOver` at all** — a temporary `console.log` of `event.over` from
  inside it logged nothing on that first move, in either pass. `@dnd-kit`'s sensor
  consumes the activating move to transition into "dragging" and does not
  perform its first collision check until a SUBSEQUENT pointer event. A
  probe drag whose activating move landed EXACTLY on "2-0"'s own live,
  post-reservation coordinates — so there was no second move left for a
  continuous re-measure to correct anything from — logged no `onDragOver`
  at all for that move, and the very next `onDragOver` (from a second,
  otherwise pointless move to the same spot) already read
  `over.rect.top === 647`, matching the live DOM exactly.

**So the two readings agree, and the practical claim — a drop is never
resolved against a stale, pre-reservation rect — holds.** But not for the
reason written down. There is no race between the reservation's render and
`@dnd-kit`'s measurement to win, because `@dnd-kit` never attempts a
measurement on the activating event in the first place; its first REAL
collision check is structurally deferred to the next event, by which point
React has already committed whatever `onDragStart` triggered, reservation
included. "In the SAME render... before `@dnd-kit` measures" implies a
timing contest that was won; what actually happens is that no contest is
run until after the render has landed. The distinction matters for anyone
extending this: a future change that made `@dnd-kit` collide on the
activating move itself (or that moved the reservation into a later effect
rather than the same `setState` batch `onDragStart` already writes) would
not be protected by "the render is faster" the way this paragraph implies
— it would depend on `@dnd-kit`'s sensor still deferring its first
collision to a second event, which is the actual guarantee here.

**Re-verified with the fix in place:** `pnpm --filter hub test` (3,813
tests, the four new reservation cases included, all passing), `pnpm
typecheck` and `pnpm lint` (repository root) both clean. The throwaway
measurement spec was deleted immediately after use and never committed —
confirmed absent from `git status` and from the working tree. Playwright's
full suite was still not run; only the one throwaway file was, twice, by
hand, for this specific measurement.

### The carried block follows the cursor (2026-09-11) — Task 5 of drop-target-legibility

A drag now shows a floating preview naming what is being carried, closing
the third of this feature's three complaints: the mark answers WHERE a
block will land, the frame answers WHICH element it lands on, and this
answers WHAT is being carried, since none of the two existing mechanisms
said so and a person otherwise had to infer a drag was in progress from the
mark alone.

`presentation/drag-preview.tsx`'s `DragPreview` is the whole component — a
label beside a grip glyph, wearing `CHROME_SCOPE` and painted with
`bg-(--menu)`, the one token declared opaque in both modes, for the same
reason every other workbench group in this feature is: what sits behind it
is a colour the page's own author chose, and no measurement can promise
contrast against a colour that is free to be anything. It carries no Motion
of any kind, because `@dnd-kit` already writes this element's own
`transform` to follow the pointer, and a second system writing the same
property is the cascade fight the feature note already forbids elsewhere in
this file.

**It is mounted inside `<DragOverlay dropAnimation={null}>`, the last child
of `<DndContext>` in `block-editor.tsx`.** `dropAnimation={null}` is not
decoration: the default animation flies the overlay back toward the
DRAGGED element's own source rectangle, and by the time a drop lands the
insert has already moved that rectangle — sometimes to a different parent
entirely — so the default would animate toward a place that no longer
means what it did a moment earlier.

**One piece of state, `activeLabel`, answers both drag origins through the
function already built to say the right name out loud.** `onDragStart` sets
it from `dragItemName(activeId)` — the exact function `accessibility.announcements`
already uses to resolve a palette item's own name or `placeName(path)` for
a canvas grip — so the overlay and the live-region announcement can never
name two different things for the same lift. It is cleared unconditionally
at the top of `onDragEnd`, before either branch runs, and in `onDragCancel`
alongside every other piece of transient drag chrome that function already
resets.

Verified: `pnpm --filter hub test` (3,815 tests, all passing, two new for
`DragPreview` itself), `pnpm typecheck` and `pnpm lint` (repository root)
both clean, `pnpm check:docs` clean. The Playwright suite was not run, per
this task's own instructions.

### A swap is marked at both ends (2026-09-11) — Task 6 of drop-target-legibility

Dragging onto an OCCUPIED place exchanges the two blocks — the one already
there returns to wherever the carried one came from — and nothing on screen
said so, which is what made a swap read as an overwrite about to happen.
`EditableBlockInstrumentation` gained `returningPath: string | null`;
`EditableBlockFrame` draws a second mark, dotted and muted rather than
dashed and accent, on whichever frame's own `encodedPath` matches it —
beside, never instead of, the existing landing mark — so the two ends of a
swap are told apart at a glance: accent is where the carried block is
going, muted is where the displaced one is coming back to.

**The frame itself does no gating — it draws the mark purely from
`editor.returningPath === encodedPath`.** All of the "is this actually a
swap" judgement lives in `block-editor.tsx`'s `onDragOver`, in the
canvas-move branch only: `returningPath` is set to the drag's own SOURCE
path (`canvasPlacePath(activeId) ?? placePath(activeId)`, the same
resolution `onDragStart`/`onDragEnd` already use) exactly when the winning
target is `kind === "place"` **and** `blockAt(blocks, winner.path)` finds a
real block already sitting there. A `place` target over an EMPTY position
is a move, not a swap, so `returningPath` stays `null` there — marking a
return would name a block that never moves. The palette branch always
publishes `null`: an insert displaces nothing, so there is no source to
return to. It is reset alongside `advertisedTarget` everywhere that field
already is — `onDragStart` (both branches), `onDragOver`'s palette branch,
`onDragCancel` and `onDragEnd` (both branches) — so it never survives past
the drag that set it.

**A fixture asserting a testid exists anywhere on the page passes whether
it landed on the right element or on every element (root rule 27).** The
brief's own two-frame swap case shares one `editor` object between both
frames, which by itself does not prove WHICH frame drew which mark; the
shipped test scopes each assertion with `within()` against the frame whose
own `data-canvas-path` it names, and a second case drives a `place` target
over an empty position with `returningPath: null` to prove a plain move
draws no returning mark at all — a suite that only ever exercised the swap
case could not tell a correct implementation from one that always marks a
return.

Verified: `pnpm --filter hub test` (3,818 tests, all passing), `pnpm
typecheck` and `pnpm lint` (repository root) both clean, `pnpm check:docs`
clean. The Playwright suite was not run, per this task's own instructions.

**Review round (2026-09-11): the computation itself was untested, and a
self-swap stacked both marks on one element.** Every case above lived in
`editable-block-frame.test.tsx` and proved the frame draws correctly GIVEN
a `returningPath` — nothing drove a real `onDragOver` collision to prove
`block-editor.tsx` COMPUTES the right one. That is the whole judgement this
task added, and a suite that only supplies the answer and checks the
drawing cannot tell a correct computation from one that always answers
"swap".

Two real cases now drive a real keyboard drag through `block-editor.test.tsx`,
matching that file's own idiom (`fireEvent.keyDown` on the grip, then on
`document`, `await settle()` between steps) rather than inventing one:
`"computes returningPath from a real collision when a canvas-move drag
lands on an occupied place"` lifts A in a fully-occupied three-place grid,
steps onto B, and asserts `canvas-drop-returning` lands on the SOURCE
element (`within(...)`, not a page-wide query) while the landing element
carries none. The pre-existing empty-place case
(`"highlights an empty positional place..."`) gained the negative half:
asserting `canvas-drop-returning` is absent anywhere on the page. **That
negative assertion is the one that answers the review's own question** —
sabotage-verified by widening the computation to `winner?.kind === "place"
&& from`, dropping both the `blockAt` occupancy check and the self-path
check: the empty-place case reddens (a move erroneously marked as a swap),
which is exactly "would this catch an implementation that always sets
`returningPath`" answered yes.

**The Minor — hovering a drag back over its own source stacked both marks
on one element.** `winner.path === from` still resolves to an occupied
`place` target, because nothing has moved yet and `blockAt` finds the
dragged block sitting at its own starting place. Without a self-check, the
source frame drew the landing mark (correctly — a no-op is still a legal,
highlighted target) AND the returning mark (wrong — a no-op displaces
nothing) on the same element. `onDragOver`'s `isSwap` now also requires
`formatBlockPath(from) !== formatBlockPath(winner.path)`, and a new case,
`"does not mark a return when a canvas-move drag hovers back over its own
source"`, lifts A, steps to B, then steps back to A (`ArrowDown` then
`ArrowUp`, landing exactly back on the source per `placeOrder`'s own
inclusion of the source in its list) and asserts the place mark still shows
while the returning mark does not, anywhere.

**Each guard clause is pinned by a case that dies without it, checked by
sabotage rather than assumed from the fixture's shape (root rule 29):**
dropping only the self-check reddens exactly the self-swap case and
nothing else; dropping only the occupancy check reddens exactly the
empty-place case and nothing else; dropping both reddens both. All three
sabotages were applied, watched red, and restored from a copy of the file
rather than `git checkout --`, per this file's own rule 34.

Verified again: `pnpm --filter hub test` (3,820 tests, all passing — two
new), `pnpm typecheck` and `pnpm lint` (repository root) both clean, `pnpm
check:docs` clean. The Playwright suite was not run, per this task's own
instructions.

### The branch closes: one gap vocabulary, out of flow, one winner (2026-09-11) — Task 8 of drop-target-legibility

Task 7's own browser proof (`drop-mark-matches-landing.spec.ts`, not
appended to this file at the time — its brief named no file list entry for
this note, and it is not one) confirmed the design's own predicted cost:
with real, titled content, the ghost mark visibly overlaps the block above
and below rather than pushing either one. That is not a bug this task
fixes; it is the fallback the design already named (the plain insertion
bar) and a decision the owner made knowing the cost, recorded as measured
fact in the design spec's own status line rather than left as a prediction.

**The whole feature, restated in one place now that every task has
landed.** A palette drag and a canvas-move drag share one gap vocabulary,
`insertMarkFor` (`domain/palette-targets.ts`): `before`/`after` an existing
sibling, or `place` for an empty position or an occupied one being swapped
with. It exists because an `InsertTarget`'s own path carries `insertAt`'s
splice contract — the last segment means "insert BEFORE whatever sits at
this index" — so drawing the BLOCK at that index marks the sibling about to
be pushed down rather than the space the dragged item will actually take;
translating a splice index into a gap is the entire reason this module was
worth writing. The mark itself, `DropMark`, is drawn absolutely positioned
and out of flow — never a real space that opens — because `@dnd-kit` caches
every droppable's rectangle at drag start, and a page that reflows mid-drag
leaves those rectangles stale, which is a fresh instance of the exact
lying-mark fault this whole feature exists to remove. And only the winner
is ever drawn: `EditableBlockFrame` and `AppendSlot` both read the single
`activeTarget` a drag's own collision has already resolved, never a set of
candidates lit up at once — which is what finally, completely supersedes
the "light-everything" comment `EditableBlockFrame` carried into this
branch, since `data-canvas-drop` (below) was its last surviving remnant.

**Debt 1 — `data-canvas-drop` is gone.** It was emitted in exactly one
place, `EditableBlockFrame`, only when the target kind is `place` — and it
was doing two jobs at once, both now redundant. As a TEST hook, every mark
is already located by its own `canvas-drop-before`/`-after`/`-place` test
id, so nothing needed the attribute to find a mark. As CSS, it drove a
second, independent "place" highlight — `data-[canvas-drop=place]:outline-2
outline-offset-2 outline-(--accent)`, an accent ring drawn OUTSIDE the
frame's own border — that predates `DropMark` entirely (confirmed with
`git log -p`, not assumed) and had become a second decoration doubled on
top of `DropMark`'s own `inset-0` dashed-border-and-tint fill for the exact
same landing. Both the attribute and the outline classes are removed from
`editable-block-frame.tsx`; nothing else in `apps/hub/src` or `apps/hub/tests`
read it (confirmed by grep before removing, per the debt's own instruction),
except the unit tests that asserted its presence or absence directly —
`editable-block-frame.test.tsx` and `block-editor.test.tsx` — which lose
those specific assertions while keeping every test-id-based assertion
beside them, since those already prove the same fact through the surviving
vocabulary. `tests/e2e/support/editor.ts`'s own comment mentioning the
attribute is left untouched: it is already past-tense, historical prose
about what `dragPaletteOnto` used to wait for before this branch's Task 4
corrected it, not a claim about current behaviour.

**Debt 2 — a task 2 sentence claimed more discrimination than the suite
has.** "Each `DropMark` case excludes the other kinds' tokens" is true only
of the `place` case, which excludes all four positioning tokens
(`top-0`/`bottom-0`/`-translate-y-1/2`/`translate-y-1/2`). The `before` case
excludes `inset-0`/`bottom-0` but never asserts `not.toContain("translate-y-1/2")`
— the token `after` carries — and `after` excludes `inset-0`/`top-0` but
never asserts against `-translate-y-1/2`, `before`'s own token. Corrected in
place above rather than left standing next to a suite that does not do what
it claims; sabotage discrimination is unaffected, as the debt itself said it
would be.

**Debt 3 — the `height: null` case now asserts `toBeVisible()`.** `min-h-12`
being present and the inline height not being `0px` do not rule out the
element being hidden a different way — `display: none`, `visibility: hidden`,
zero opacity — and none of those was excluded before this. One line.

**Debt 7 — "only the winner is marked" is a named assertion now.**
`drop-mark-matches-landing.spec.ts` asserts
`(await page.getByTestId(/^canvas-drop-/).count()) === 1` before reading
the mark's geometry — a regex `getByTestId`, not a raw attribute selector,
to satisfy this repository's own `no-restricted-syntax` rule preferring test
ids over CSS attribute selectors. Uniqueness of one exact test id was
already implicit in Playwright's strict-mode resolution; this is the
central branch claim asked for explicitly rather than left emergent.

**Photographs.** Three, taken with a throwaway spec (never committed,
deleted after use, the same idiom Task 7's own report used): a palette drag
hovering a filled mid-list position, a canvas-move drag over an empty
place, and a swap over an occupied place. The first CONFIRMS the overlap
risk visually — the dashed accent box straddles the boundary between the
first and second of three real, titled leaves, legible as landing on the
seam rather than cleanly between the two. The second and third show the `place`
mark behaving differently and without that cost: over an empty position it
fills the whole target cleanly, and over an occupied one (the swap) it
deliberately covers the whole displaced block, with a second, muted, dotted
mark on the block's own return position — both readable as "the whole box
is the landing," which is the correct reading for a `place` target rather
than a gap between two things. **Reading the frames back rather than only
the claim they were taken for**: all three carry a small red "1 Issue"
badge in the bottom-left corner, a Next.js dev-mode overlay unrelated to
this feature — traced to a pre-existing `ClerkRuntimeError` console warning
from `useSupabaseBrowserClient` during server-side rendering
(`clerk_runtime_not_browser`), present on every route this session visited
and not something this task introduced or is in scope to fix. Named here
so a future reader comparing a screenshot against production does not read
it as a regression this branch shipped.

**Gates, all from the repository root.** `pnpm typecheck` clean across the
root, `hub` and `@aeleos/identity`. `pnpm --filter hub build` clean, all
twelve routes compiling. `pnpm lint` clean (one violation surfaced and was
fixed in the new count assertion itself — a raw attribute selector, moved to
a regex `getByTestId`). `pnpm --filter hub test:coverage`: 3,820 tests,
100% on all four axes (statements 2426/2426, branches 1595/1595, functions
658/658, lines 2096/2096). `pnpm test:tools`: 141 tests, all passing.
`pnpm check:tools`: clean — cspell 0 issues across 547 files, `ls-lint`,
`check:style`, `sherif`, `syncpack lint` and `madge --circular` all clean;
`knip` and `jscpd` report informationally (`--no-exit-code`) and do not
gate. The Playwright suite was not re-run in full — Task 7 already proved
it clean at 205/0 — but the throwaway photograph spec exercised the palette
mid-list drag, a canvas-move drag onto an empty place, and a canvas-move
swap, all three against a freshly started dev server, all three passing.
