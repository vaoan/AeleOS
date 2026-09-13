# The actors feature — application layer

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

**The addressing model lives in the feature root, `apps/hub/src/features/actors/CLAUDE.md`, not here.** This note covers only the application layer.

### The document is bound to the page live, in both directions (2026-08-28)

`application/use-page-source.ts` is `usePageSource`, the state machine behind
the source dock — a textarea showing `toDocument`'s output, editable, changing
the live page as it is typed. It takes `theme`/`blocks` the same way the rest
of the form holds them and an `apply` callback; it never touches
react-hook-form itself, which is what keeps it testable with no form mounted.

**The page holds the last good tree because a bad parse never writes anything,
not because a copy is kept anywhere.** There is no second "last good" variable
in the hook. A failed `parseDocument` sets `problems` and returns; `blocks`/
`theme` are exactly what they already were, because nothing ever called
`apply` to change them. A stored copy would be a second source of truth able
to disagree with the form that actually holds the page — the absence of a
write is the whole mechanism.

**Which direction wins is arbitrated by one `mirror` ref, read before every
write in both directions.** `mirror` holds the last serialisation this hook
itself produced or accepted — never the tree, only the string. Text → page is
a debounced valid parse (`onChange` records every keystroke and schedules a
parse `debounceMs` later, cleared and rescheduled on each one); on success
`mirror` becomes the CANONICAL form of what was accepted (never the raw
typed text — see the paragraph below this one for why) and `apply` is
called, and that is the
**only** place this hook ever writes to its caller. Page → text is a
`useEffect` on `[theme, blocks]` that re-serialises and compares the result
against `mirror` **by string, not by reference** — a caller's form very often
hands back a freshly built array for content that has not actually changed,
so comparing `blocks` by identity would treat that as a real change and
re-enter the loop. Past that guard, a genuine external change overwrites the
box while it is unfocused and is recorded as `drifted` while it is focused,
never both — naively re-serialising a focused box would destroy the author's
whitespace and jump their cursor mid-word, which is why `resync` exists as an
explicit choice instead. `focused` is tracked in a ref rather than state,
deliberately: nothing renders from it directly (only `drifted` does), and a
ref read inside the effect does not have to be a dependency the way a state
variable read the same way would.

**`mirror` is set to the CANONICAL `toDocument` output of what was accepted,
never to the raw text that was typed — a round 1 review caught this wrong in
the shipped version, and it is worth stating exactly how it was wrong, because
the wrong version passed its own test.** The first version set
`mirror.current = next` (the literal typed string), which only ever equals
`toDocument(theme, blocks)` when the person's typed text happens to BE
`toDocument`'s own canonical form — indentation, key order and envelope all
included. That is true of no ordinary hand edit: different whitespace,
different key order, the bare-array shorthand all break it. So the guard
worked for exactly one input, and the round-1 test happened to type that one
input (`toDocument(...)` itself) — a fixture that could not discriminate a
real guard from one that only works by coincidence, root rule 27 exactly. The
fix stores what the ACCEPTED PARSE re-serialises to,
`toDocument(parsed.theme ?? theme, parsed.blocks)`, so the round trip compares
like against like whatever the person actually typed. `onChange`'s
`useCallback` deps now include `theme` for the same reason: the fallback
`parsed.theme ?? theme` reads the CURRENT theme prop, and a stale closure over
an old one would silently compute the wrong mirror.

**The mirror guard is what stops a successful edit from immediately declaring
itself drifted.** The ordinary shape this hook is used in has `apply` call
`setValue`, which re-renders the form with new `theme`/`blocks` props on the
very next tick — while the box is very likely still focused, since the person
just finished typing. Without the guard, that round trip would flag `drifted`
on every accepted edit, because the props changed and the box is focused.
`use-page-source.test.ts`'s two "loop guard" cases are built around exactly
this, and deliberately type the bare-array shorthand rather than `toDocument`'s
own output — a NON-canonical valid document is what a real hand edit looks
like, and it is the only fixture that can tell the fixed guard apart from the
round-1 guard that merely happened to pass. One case asserts `drifted` stays
`false` after the round trip while focused; the other asserts `text` is not
silently reformatted into canonical JSON while unfocused. Sabotage-verified
against the fixed code: removing the `if (doc === mirror.current) return;`
line reddens both loop-guard cases and no others, 14 of 16 still passing.

**A successful `apply` also clears `drifted`.** Once the person's own edit has
been applied, the page IS what their text says, so a `drifted` banner
surviving their own change would be lying about a disagreement that no longer
exists.

**Blur does not self-heal a drift, and that is a consequence of the `focused`
ref worth naming rather than assuming away.** The page→text effect only
depends on `[theme, blocks]`, never on focus, so a box left `drifted` while
focused stays `drifted` after the person clicks out of it — until `resync`, or
until the next genuine page change arrives while the box happens to be
unfocused. A `useState` for focus would have made the effect re-run on blur
and could have cleared the flag there instead; the ref does not, and that is
kept deliberately: a blur is not the person accepting or declining the drift,
so silently healing it on blur would be a second, unannounced way for their
box to change under them — the exact thing this whole hook exists to prevent
in the other direction.

Sabotaging the focus branch itself (making the effect write `text`
unconditionally, regardless of `focused.current`) reddens **three** cases, not
one: the case built directly against it (`keeps the box and flags drift when
it is focused`), and two more whose SETUP reaches the same branch as a
precondition (`clears drift once the person's own edit is applied` and
`throws the box away and re-reads the page on resync`, both of which first
drive the page into a drifted state by rerendering while focused before
testing what happens next). Only the first of the three is independent
evidence of the fault — the other two fail on a precondition assertion before
reaching the behaviour they actually name, root rule 23's "corroborating, not
independent" exactly. Recorded here rather than only in the task report,
because whoever next changes this branch should know the true blast radius of
breaking it, not the undercount an earlier review round shipped.

Two more things worth knowing before touching it. `resync` cancels any
pending debounce timer before re-serialising — otherwise a parse scheduled
just before `resync` would still land 250ms later, applying an edit the
author asked to throw away right on top of the page `resync` just restored.
And the `theme: null` a parse returns for a document that carried none is
passed to `apply` **verbatim** — this hook does not resolve it to a real
theme, because the caller is the one holding the actual current theme in its
own form and is the one who gets to decide what "unchanged" means.

**The panel that shows it, `presentation/page-source-dock.tsx`, is a DOCK and
not a modal, and that is a design idea rather than a taste.** The editor's
document IS the page — the author's own theme paints it — so a modal backdrop
would put the very thing this panel exists to be watched against underneath
the panel itself. It opens with the native `<dialog>`'s `show()`, never
`showModal()`, driven by a `useEffect` on `open` that calls the imperative
methods; the `open` attribute is never written from JSX, because that would
open the dialog the browser's own way rather than this component's. **jsdom
26.1.0, the version installed here, implements none of `show`, `showModal` or
`close` on `HTMLDialogElement`** — confirmed by direct probe, not assumed —
so its own test stubs all three on the prototype before rendering, and a
component that guarded the calls instead would hide the exact mistake
(calling `showModal()`) it exists to refuse.

**`--menu` is a guarantee here, not a preference.** What sits behind this
panel is a colour the page's own author chose, and they may choose any colour
at all — a translucent panel has no guaranteed contrast against a page
somebody else designed, and no measurement can give it one. `--menu` is the
one token declared opaque in both modes, the same reason the editor toolbar
and the style popup's panel both take it.

**Tab is deliberately unhandled in the textarea.** Trapping it — swallowing
the keystroke to insert a literal tab character — strands a keyboard user
mid-escape, so the absence of an `onKeyDown` for Tab is the feature rather
than an oversight. Escape is the one key this component reads, to close
itself, since a non-modal dialog gets no native Escape handling at all (that
is `showModal()`'s job).

**It wears `CHROME_SCOPE`**, which is what lets the editor's existing
hide-controls rule remove this panel by CLASS — the rule that already strips
every `CHROME_SCOPE` island when the controls are hidden reaches this one with
nothing added, and nobody wiring that rule has to know this component exists.

**A first review round found the dock's own reasoning had shipped the
opposite of what it argued (2026-08-28), and the fixes are worth carrying
forward.** `--dock-width` was declared on the `<dialog>` and consumed with an
INLINE `style={{ width: "var(--dock-width)" }}` on the wrapper one element in
— which permanently beats a media-scoped class regardless of the query,
exactly the fault the surrounding comment warned against while committing it
on the neighbour instead. Consumption is `w-(--dock-width)` now, a real class
in the same `w-*` utility family as `max-md:w-full`, so the two genuinely
compete in the cascade rather than one silently winning by being inline —
confirmed by compiling this exact class list through the installed Tailwind
and reading where each rule landed, rather than assumed. **The always-on
`max-w-[min(48rem,80vw)]`/`min-w-[20rem]` also had to gain `max-md:` twins**:
at a narrow viewport `80vw` is frequently narrower than the viewport itself
(300px at 375px wide), so even a correctly-won `width: 100%` was still being
clamped down by `max-width` — sheet mode needs `max-md:max-w-none
max-md:min-w-0` alongside `max-md:w-full`, not that class alone. `resize()`
now clamps at both ends, mirroring the CSS bound in JS, so an arrow key
cannot walk `width` state past what the panel can ever render.

**A whole-branch review found collapsing did not shrink the panel at all
(2026-08-28).** `collapsed` gated only the body (`{!collapsed && …}`); the
dialog kept `bottom-0` regardless, which is exactly the half of the mechanism
above that stretches the box to the foot of the viewport. So collapsing left
a full-height, fully OPAQUE (`bg-(--menu)`) panel with nothing painted below
its header — the whole screen at 320px, against this component's own spec
saying collapsing on a narrow viewport has to be "the only way to see whether
what was typed did anything". `bottom` is conditional on `collapsed` now,
switching to `bottom-auto` so `height: auto` resolves to the header's own
content size. `tests/e2e/page-source-dock.spec.ts` measures the collapsed
height at a wide viewport and at 320, with BOTH an upper bound (under 100px,
nowhere near a viewport) and a lower one (over 16px, so "shrunk to its
header" cannot be confused with "shrunk to zero" or "scrolled off the
viewport") — the lower bound was itself a re-review finding, added after the
first draft of this fix shipped with only the upper one.

**The stale strip used to be MOUNTED by the same condition that populates
it**, which a screen reader commonly misses entirely — `aria-live` announces
a CHANGE inside a region already in the DOM, not a region that arrives
already carrying text. The wrapping `<div aria-live="polite">` is
unconditional now; only its children come and go. The regression test for
this has to rerender the SAME instance and assert the SAME node persisted —
"there is an aria-live ancestor while stale is true" cannot tell the fix from
the fault, since both produce that ancestor.

**jsdom 26.1.0 has no `PointerEvent` constructor at all**, confirmed the same
way the missing `<dialog>` methods were — `typeof window.PointerEvent` is
`"undefined"`. `fireEvent.pointerDown`/`pointerMove` degrade silently rather
than throwing, so a case built on them looks like it drove a real drag while
`clientX` never actually reaches the handler. The grip's own tests dispatch a
plain `MouseEvent` typed `"pointerdown"`/`"pointermove"` instead — React binds
by event type string, not by constructor, and `MouseEvent` supports `clientX`
where `PointerEvent` cannot even be constructed.

The copy control also reverts its own label after `COPIED_RESET_MS`, so a
second copy has feedback too — it used to read "Copied" permanently after the
first success.

**The reference block is capped at `max-h-80` and scrolls itself, and without
that the disclosure was unreachable rather than missing (2026-08-28, reported
by Heiner).** `pageReference` returns about seventeen thousand characters; the
`<pre>` had no height bound at all, so expanding it in a ~400px panel produced
a block thousands of pixels tall — and since `<summary>` sits at the TOP of the
`<details>`, the only control that closes it ended up far above the dock's
scroll position. **Nothing was broken in the DOM.** The toggle rendered, was
correct, and passed every unit case that clicks it; a `<details>` toggles
natively and no state was involved. To somebody trying to get their page back
that is indistinguishable from a control that does not exist, which is the
distinction worth carrying: **a control can be present, correct and unreachable,
and only the third of those is what a person experiences.**

Its browser case is honest about which half proves it. Sabotaged by removing
the cap, the FIRST failure is the overflow precondition — with no cap the block
grows instead of scrolling, so `scrollHeight` and `clientHeight` agree — and the
summary-position assertions beside it would very likely still pass, because
`boundingBox` is read at the dock's initial scroll offset, where the summary
sits regardless of how far the block runs on below it. A bounding box taken
before any scrolling cannot see "somebody would have to scroll to reach this".
Root rule 23: they are kept for what they document and not counted as proof.

**The dock is mounted now (2026-08-28), and this is the first change that
made any of the above reachable by a person rather than only by a test.**
`EditorToolbar` carries a `Braces` control, `openSource` in the catalogue,
beside `hideControls`. `FursonaEditor` holds the open/closed `useState` and
renders `PageSourceField` — a small component of its own, defined in the same
file — as a sibling of `EditorToolbar`, **inside** the element carrying
`data-controls`, so the dock is one more island the hide-controls rule
removes exactly like every other workbench control. That is not a styling
requirement — `PageSourceDock` wears `CHROME_SCOPE` on its own `<dialog>`
wherever it sits — it is a deliberate behavioural choice, and the more
tempting placement (a sibling of `ThemeScope`, outside `data-controls`, so
the dock would survive hiding the rest of the workbench) was tried first and
reddened `fursona-editor.test.tsx`'s hide-controls containment case: every
`CHROME_SCOPE` island has to be inside the armed element, or the ONE rule
that removes them by class cannot reach it, and the dock is not the
show-controls button — it has no argued reason to be the second exception.

**`PageSourceField` exists ONLY to keep `sections` out of `FursonaEditor`'s
own `useWatch`, and getting this wrong is silent.** `BlockEditor` already
proved the pattern: it holds its own `useController({ control, name:
"sections" })` rather than being handed the tree as a prop, so a change to
`sections` re-renders `BlockEditor` and nothing above it. The first version
of this wiring added `"sections"` to `FursonaEditor`'s existing
`useWatch(["handle", "displayName", "avatarUrl", "theme"])` call instead —
which reaches `FursonaEditor`'s own render on every keystroke in a leaf's
text, and from there every descendant that is not individually memoised,
`EditorToolbar` included. `fursona-editor.test.tsx`'s
"updates a leaf preview without rerendering the whole editor" case is the
regression test for exactly this: it counts `EditorToolbar`'s own renders
around a single leaf-description edit and failed at 4 against an expected 2
the moment `sections` joined that watch. `PageSourceField` takes `control`
and `setValue` as props and calls `useWatch({ control, name: "sections" })`
itself, so the subscription — and the re-render it causes — lives in a
component the toolbar is not a descendant of.

`apply`'s theme half is written exactly as the hook's own TSDoc requires:
`setValue("sections", blocks, { shouldDirty: true })` unconditionally, and
`setValue("theme", theme, …)` only when `theme` is non-null. Writing the
theme unconditionally — even to a value read as `null` — would reset an
author's theme to whatever `themeSchema`'s defaults resolve `null` to on the
next render, on every accepted parse of a document that never mentioned a
theme at all. `apply`'s own reference in `usePageSource`'s TSDoc is spelled
out precisely because this is the one place a careless `setValue(..., theme)`
would have shipped that fault silently — nothing renders differently for a
moment, and the loss only shows up the next time somebody opens the theme
panel.

**That guard was wired correctly from the start and exercised by NOTHING,
which the first review round caught.** `PageSourceField` sits under
`features/*/presentation/**/*.tsx`, excluded from the coverage gate, and the
one e2e case pasting a document always round-trips it through `toDocument`
first — which ALWAYS emits a `theme` key, so only the truthy arm of `if
(nextTheme)` ever ran. `fursona-editor.test.tsx`'s "leaves the author's
theme alone when a pasted document omits it" is the case that closes it: it
pastes a document with the `theme` key deleted outright, and asserts the
whole derived stylesheet — compared by IDENTITY, not by matching one hex
string, because the solved palette converts an author's accent to OKLCH
rather than repeating it verbatim — is byte-identical before and after.
Sabotage-verified by deleting the `if`: the unconditional `setValue("theme",
null, …)` crashes `FursonaEditor`'s own render outright
(`(liveTheme as ActorTheme).measure` reading a property off `null`), which is
a clean red rather than a silent one.

**The dock does not exist in the tree at all until it has been opened
once, which the same review round asked for BY CONSTRUCTION rather than by
measurement.** Before this, `PageSourceField` — and therefore
`usePageSource`'s `[theme, blocks]` effect, a full `toDocument`
serialisation of up to 500 blocks — mounted unconditionally alongside
`EditorToolbar`, so every keystroke in the editor paid that cost whether or
not anybody had ever pressed the control that opens the dock. `sourceMounted`
gates `PageSourceField`'s very presence now: set `true` the first time
`sourceOpen` is asked to become `true`, in the same click handler, and never
reset — so closing the dock does not tear down the text or the problems it
was showing. `fursona-editor.test.tsx`'s "does not mount the source dock
until it is opened, and keeps it once it has been" is the proof, and it is a
DOM-absence assertion rather than a timing one: nothing is mounted, so there
is no cost to have measured in the first place.

**Mounting the dock for the first time found three bugs in its class list,
all invisible to every suite that existed before this one, because all three
are about `<dialog>`'s USER-AGENT stylesheet — which jsdom implements none
of.** The hand check this task's brief asks for is what found them; the
regression test is `tests/e2e/page-source-dock.spec.ts`, sabotage-verified
against each of the three individually as well as together.

- **A bare, unconditional `flex` beat `dialog:not([open]) { display: none }`,
  so the dock was VISIBLE, full size, on every page, from the moment it was
  mounted — before anybody had ever pressed the control that is supposed to
  open it.** Author origin always wins over user-agent origin for a normal
  declaration, regardless of specificity or cascade layers — the same rule
  root rule 36 already names for the opposite direction (a Tailwind class
  compiling to nothing). Here a Tailwind class compiled to something, and
  what it beat was the ONE rule that keeps a closed dialog off the page. The
  class is `hidden open:flex` now: `hidden` is the author declaration that
  loses to nothing, and `open:flex` only ever adds `display: flex` back once
  the `[open]` attribute — which `dialog.show()`/`dialog.close()` write — is
  present.
- **The UA stylesheet also sets `left: 0` unconditionally**, and this
  component's own styles never named `left` at all. With that, `right: 0`,
  an explicit `width`, and `margin: 0` (`m-0`) all in force together, the box
  was over-constrained on the horizontal axis — and per the CSS 2 resolution
  rule for that case, the browser drops `right` in LTR and solves from `left`
  instead. So the panel rendered pinned to the LEFT edge of the window,
  420px wide, with `right: 0px` sitting uselessly in its own computed style.
  `left-auto` is the fix: it removes `left` from the over-constrained set, so
  `right: 0` is what actually decides where the box sits.
- **The UA default `height` is `fit-content`, a different value from
  `auto`**, and nothing here had ever declared `height` at all. With `top`
  and `bottom` both specified and `height: auto`, a fixed box stretches to
  fill between them — that is the whole mechanism `bottom-0` relies on to
  reach the foot of the viewport. `fit-content` instead sizes the box to its
  own content, so the panel stopped a few hundred pixels down rather than
  reaching the bottom. `h-auto` is the fix.

None of the three had ANY unit-test-visible symptom: jsdom 26 implements
neither `<dialog>`'s UA stylesheet nor real layout, so `getBoundingClientRect`
and `getComputedStyle` in a jsdom test cannot see any of this, and the
existing unit suite for this component was and remains 100% green throughout.
Only a real browser, actually mounting the real component, found it — the
same lesson root rule 36 already draws about a different property, landing
on `display`, `left` and `height` instead of `object-fit`.

**Task 8 (2026-08-28) is the dock's browser PROOF — `page-source-dock.spec.ts`
extended past the three cases task 7 left it with — and running a real axe
scan over it for the first time found two more faults, neither visible to
any suite before it either.** `a11y.spec.ts`'s new "the editor with the
source dock open" case is what found them, and both are fixed:

- **The resize grip failed `aria-required-attr`.** `role="separator"` with
  `tabIndex={0}` is the WAI-ARIA APG's window-splitter pattern — a FOCUSABLE
  separator, which the spec treats as a value widget rather than a static
  divider, and a value widget is required to carry `aria-valuenow`. It had
  none. `aria-valuenow={width}`, `aria-valuemin={MIN_WIDTH_PX}` and
  `aria-valuemax={MAX_WIDTH_REM_PX}` are on it now — the max is the fixed
  bound rather than the dynamic `min(768, 80vw)` `resize()` also clamps to,
  which is close enough for an announced range and costs no `window` read
  during a server render.
- **The reference panel's copy button failed `nested-interactive`.** It sat
  INSIDE `<summary>`, and `<summary>` is itself an implicit interactive
  control — it is what toggles the `<details>` — so a `<button>` nested
  inside it is invalid, the same class of fault as a link inside a link.
  `<summary>` still has to be `<details>`'s direct child for the native
  disclosure to work at all, so the fix moves the button OUT to be
  `<summary>`'s sibling instead, positioned over it, rather than trying to
  keep it a descendant with a different role.

Neither is a `wcag2a`/`21aa` corner case reachable only by an unusual
interaction: they are structural, and `TAGS`'s reasoning about which
`best-practice` rules stay off (`heading-order`, `scope-attr-valid`,
`empty-table-header`) does not apply to either — `aria-required-attr` and
`nested-interactive` are both in the tag sets this suite already runs. They
went uncaught for the same reason the three UA-stylesheet faults above did:
nothing had ever pointed a real accessibility scan at this panel OPEN before
task 8, because it did not exist as a reachable state to scan until task 7
mounted it and nothing after that opened it in `a11y.spec.ts` until now.

**A third, unrelated fault surfaced by the SAME new case, one layer down from
the dock itself.** `/pages/new` builds its `owner` block by reading
`readMyAddress()` and falling back to `""` if it answers `null` — which it
does for a person who has never been provisioned, because `ensurePersonActor()`
was called by `/me`, `/me/edit`, `/pages` and `/picker` and never by
`/pages/new`. A person arriving here as their genuinely first click — the
route this app hands a brand-new sign-in to from Puck or Libra — got an
`OwnerLeaf` linking to `/` with no text at all: a real `link-name` violation,
not a hypothetical one, since `/pages/new`'s own TSDoc already says "whoever
is signed in will own whatever this form makes" as if the person row already
existed. `ensurePersonActor()` is called first now, idempotently, matching
`/pages`'s own documented reason for the identical call.
`a11y.spec.ts`'s "a person's first visit ever is straight to `/pages/new`"
is the regression test, and it uses its OWN fresh identity rather than the
file's shared one — the shared identity is provisioned by an earlier test in
the same file by the time the dock's own a11y case runs, which is exactly why
that case could not have caught this on its own.

**Task 9's own photograph pass found the copy control a THIRD time, and this
one was geometry rather than markup (2026-08-28).** Round 1 moved the button
out of `<summary>` (`nested-interactive`); round 2 moved it out of `<details>`
so it renders while collapsed; and it was still **covering the summary it sits
over.** `pr-24` on that summary is the reserve — 96px — and the button
measured **227px** at 1440, 1100 and 320 alike, because its width came from a
translated string and not from the space set aside for it. So an absolutely
positioned control sat on the CENTRE of a full-width row styled
`cursor-pointer`: pressing the middle of a disclosure that invites a press
copied instead of expanding, and at 320 the button covered 227px of a 293px
row.

The idle button is the icon alone now, with `aria-label` and `title` carrying
its name and the visible label returning only for `copied` (~75px, inside the
reserve). Every unit case kept passing through the change and had to —
they address the control by ACCESSIBLE NAME, which `aria-label` supplies
whether or not any text is rendered, so the entire suite was blind to how wide
the thing actually was. `page-source-dock.spec.ts` asserts
`elementFromPoint` at the summary's own centre at 1440 and 320, sabotage-
verified: restoring the visible label reddens exactly those two cases and
nothing else.

**Three lessons, and the second is the one this note keeps re-learning.**
A fix aimed at one property of a control does not check the others — three
rounds each corrected where the button was in the DOM and none asked how big
it was. **A width that comes from a translated string cannot be reserved for
by a fixed padding**, which is the same fact the root note already records
about a `select` being as wide as its longest option in Spanish, arriving here
on a different control. And it was found because **Playwright refused to click
the summary** — a click failure reading as a flaky locator was a real control
landing on another, exactly what the read-the-pictures-back rule exists for,
except that the camera never got as far as taking the picture.
