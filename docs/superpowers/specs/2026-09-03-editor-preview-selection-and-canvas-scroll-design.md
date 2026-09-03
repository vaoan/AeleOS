# Editor Preview, selection, and canvas scroll

- **Date:** 2026-09-03
- **Status:** Approved
- **Scope:** The signed-in person and fursona page editors (`FursonaEditor`,
  `BlockEditor`, `CanvasInspector`, and the hide-controls stylesheet). The
  stored page document, public renderer, public routes, and Preview's
  hide-controls mechanism do not change their jobs — only how selection and
  scrolling behave around them.
- **Corrects:** The recursive inspector's claim that Preview hides the
  inspector without clearing selection
  (`2026-09-01-recursive-inspector-drill-down-design.md`). That claim is why
  the canvas still reserves the inspector's desktop width while controls are
  hidden, and why `globals.css` has to zero that padding by name.

## Problem

Three workbench behaviours fight the goal that edit and view should become the
same page.

1. **Preview with a live selection.** Hide controls removes every
   `CHROME_SCOPE` island by class, inspector included, but selection stays.
   Returning from Preview therefore reopens whichever block was selected, and
   while Preview is on the canvas still wears the inspector's reserved
   `md:pl-[min(36rem,40vw)]` until a CSS special-case zeroes it. A way of
   looking at the page is carrying editing state the page itself does not have.
2. **No Close on the inspector.** Empty canvas and Escape already deselect.
   Back at Page already deselects. There is no control on the panel itself that
   does that from an arbitrary depth without walking Back to Page first.
3. **The document scrolls the workbench.** With controls showing, a tall page
   scrolls the whole editor — header, toolbar, Page control, and canvas —
   because nothing owns a viewport except the document. The inspector is
   `fixed`, so it stays, and the page slides under and past the chrome. A
   public page has no such chrome; Preview already wants document scroll. The
   mismatch is only in edit mode.

## Goal

Hiding controls is looking at the page, not pausing the inspector. The
inspector can dismiss itself. While editing, only the canvas scrolls. Preview
scrolls the document, from the top, as a visitor's page does.

This change is a step toward view and edit being the same document, not a
second renderer, an iframe, or a cloned tree.

## Invariants

- The public renderer, public routes, block model, schemas, `moveBlock`,
  source dock, templates, and theme application stay as they are.
- Preview remains hide-controls: one `data-controls` attribute, the existing
  `CHROME_SCOPE` rule, the existing stack-flattening rule. No second preview
  state.
- Selection still lives in `BlockEditor`. It is not lifted into
  `FursonaEditor`.
- The inspector is in the DOM only while a page or block is selected **and**
  controls are showing. Hide-controls therefore unmounts it by clearing
  selection, not only by hiding it.
- Empty canvas and an unclaimed Escape still deselect. They are not replaced
  by Close.
- Interact-with-page is unchanged: default locked, Preview implies
  interaction, Show controls resets the switch.
- Hide controls and Close are `type="button"`. Neither submits the form.
- No new dependency.

## Selection

### Hide controls clears selection

Pressing Hide controls sets `controlsHidden` and selection to `null` in the
same update, before the next paint.

`FursonaEditor` already owns `controlsHidden`. It threads that boolean into
`BlockEditor`. `BlockEditor` clears selection when the flag becomes true, in
a layout effect so the hidden workbench never paints one frame with a live
selection (and therefore never paints the inspector's reserved padding for
that frame). Selection is not copied up into the parent.

Consequences, all required:

- The inspector unmounts (`CanvasInspector` already returns null on a null
  selection). Hide-controls CSS is no longer the only thing taking it off
  screen.
- The canvas loses `md:pl-[min(36rem,40vw)]`, because that class is gated on
  `currentSelection`. The old hide-controls rule that zeroed
  `padding-inline-start` on `[data-editor-stack]` is deleted rather than kept
  as an unreachable second mechanism.
- Show controls restores the workbench with **no** selection. The inspector
  stays closed until Page or a block is chosen again. Preview is not a pause.
- Interact-with-page still resets to off when controls return, as today.

Hide controls from a leaf, a nested container, or Page all clear the same way.
There is no "remember this path across Preview."

### Close on the inspector

The inspector header grows a dedicated Close control, beside Back, at the
trailing end of the header row.

- It is a button. Its accessible name is the ordinary-language equivalent of
  “Close” in each catalogue. Icon-only on screen is acceptable if the name is
  on the button; it must not rely on a tooltip alone.
- Test id: `inspector-close`.
- Pressing it sets selection to `null` from any depth. It does not walk Back.
  It does not change the document. It does not hide controls.
- Back remains Back. At Page, Back may still deselect — that existing
  behaviour is not removed — but Close is the control whose job is "put the
  panel away." A suite that only presses Back has not proved Close.

Close is absent when nothing is selected, because the inspector itself is
absent.

## Scroll

Two modes, and they must not leak into each other.

### Controls showing — canvas is the scroller

The app header and the editor toolbar stay in the viewport. The Page control
and the error banner stay with the workbench, not inside the scrolling page.
The inspector keeps its own independent overflow, as it already does on its
pane.

Only `[data-testid="editor-canvas"]` scrolls the page content.

The document does not: `document.documentElement.scrollHeight` minus
`clientHeight` is within 2px of 0 on a page that is taller than the window.
The canvas's own `scrollHeight` exceeds its `clientHeight`.

How that is built:

- The editor, while `data-controls="shown"`, fills the remaining viewport
  under the app header and does not grow the document. `min-h-0` on the flex
  chain is load-bearing; without it the canvas cannot shrink and the document
  becomes the scroller again.
- The canvas is `min-h-0 overflow-y-auto overflow-x-clip`. A vertical scroll
  container cannot keep its other axis `visible`: CSS computes that axis to
  `auto`. Clipping therefore happens only at the canvas's viewport boundary,
  exactly where a browser viewport clips a public page. No section, tray, or
  block gains `overflow`; neon glow and comic shadow remain free to cross
  their own boxes until they reach that outer viewport boundary.
- The inspector stays `fixed`. On desktop it still starts below the toolbar
  and still reserves `min(36rem, 40vw)` as canvas padding while selected. On
  a phone it is still the existing bottom sheet at `max-h-[70vh]`. This change
  does not redesign that overlay: measured at 320×720, its top is 216px while
  the canvas begins at 297px below the workbench, so no canvas content can be
  placed above it without shrinking the inspector or changing the mobile
  composition. Canvas scrolling at phone width is still required and tested;
  simultaneous canvas visibility behind an open sheet is out of scope.
- The toolbar no longer depends on `position: sticky` inside a tall
  document. It is simply outside the scrolling box. `editor-bars-stay-pinned`
  must be rewritten against **canvas** scroll: after scrolling the canvas a
  long way, Save's viewport `y` is still the toolbar's, not a negative
  number.

Do not use a second `position: fixed` canvas. The canvas stays in flow inside
the editor so later unifying view and edit is a matter of removing chrome,
not of unscrewing a second layout.

### Preview — the document is the scroller

Hiding controls:

1. Clears selection (above).
2. Removes the edit-mode viewport lock, so the document can grow.
3. Resets both the canvas's `scrollTop` and `window.scrollY` to `0`. A
   scrolled canvas must not become a scrolled document at an invented offset,
   and must not leave Preview starting mid-page.

With controls hidden, the canvas has no inner scroll: its `scrollHeight`
equals its `clientHeight`, and a tall page makes `document.documentElement`
the scroller, the way a public route already does.

Show controls re-applies the canvas lock. The canvas starts at its top. There
is still no selection.

`editor-is-the-page` keeps photographing Preview against the public page with
`window.scrollTo`. That is still the right instrument, because Preview is
document scroll. A case that scrolled the canvas in Preview would be
measuring the wrong program.

### Short viewports

`short:static` still lets the app header yield on a short landscape screen,
and `--bar-top` still becomes `0`. The canvas then fills under the editor
toolbar alone. The document still must not become the scroller while controls
are showing.

## View and edit as the same page

This spec does not merge the public route and the editor. It forbids work that
would make that merge harder:

- Do not introduce an iframe, a second renderer, or a preview host that is
  not the live `PublicBlock` tree.
- Do not clip the canvas on all four edges.
- Do not keep editing chrome in the layout once controls are hidden: no
  reserved inspector width, no leftover `CHROME_SCOPE` island except the
  portalled Show-controls button, which already sits in the header.
- Do not persist selection, canvas scroll, or Interact-with-page across
  Preview. Preview is the page. The page has none of those.

The canvas in edit mode is the same blocks a visitor sees, laid with
`pageBoxClass`, inside a box that happens to scroll. Preview removes the box's
role as a scroller and lets the document be that box.

## Copy

Add `inspectorClose` beside `inspectorBack` in both catalogues, translated as
ordinary “Close”, in `pages/labels.ts`, on `BlockEditorLabels` /
`CanvasInspectorLabels`, and in every label fixture the new tests render. A key
in one language and not the other fails the build.

## Testing

This is easy to get wrong: a class assertion cannot see which box scrolls, a
hidden inspector is not an unmounted one, and Preview that keeps selection
looks identical to Preview that clears it until controls return. Tests have
to discriminate those.

### Unit — `fursona-editor.test.tsx` and `block-editor.test.tsx`

Each case names the wrong behaviour it excludes.

- Hide controls with Page selected: inspector gone from the DOM
  (`queryByTestId("canvas-inspector")` is null, not merely not visible).
- Hide controls with a nested leaf selected: same unmount.
- Hide controls then Show controls: inspector still absent; Page must be
  pressed again to bring it back. A build that only hid the inspector would
  show it the moment chrome returned.
- Hide controls does not fire the form's `submit` event.
- Interact-with-page remains independent: pressing it does not clear
  selection; Hide controls still does.
- Close is in the inspector header, named, `type="button"`.
- Close from Page, from a container, and from a leaf: inspector unmounts,
  canvas remains, controls remain shown, form does not submit.
- Close does not walk Back: after entering a nested child, Close leaves
  nothing selected rather than the parent.
- Back still exists and still selects the parent; Close is a different
  button.
- The hide-controls attribute still arms `data-controls="hidden"`; Show
  controls still lives outside that region.

jsdom cannot prove which element scrolls. It can prove the canvas carries the
overflow class while controls are shown and does not while they are hidden,
and that is corroborating — the discriminating proof is in the browser.

### Browser — new cases on the existing canvas-inspector and editor-is-the-page

fixtures, plus a dedicated scroll spec

Do not hang new geometry claims only on class names.

**Selection**

- Hide controls with the inspector open: inspector count is 0; Show controls
  does not bring it back until Page or a block is selected.
- Hide controls from a nested leaf, then Show controls: still no inspector.
- Close from Page, container, and leaf: inspector count is 0; Save and the
  canvas stay visible.
- Close does not hide controls.
- Existing empty-canvas and Escape cases still pass.
- The current Preview case that only asserts `toBeHidden()` is insufficient
  once selection must clear: change it, or add a sibling that asserts count
  0 and that Show controls does not restore the inspector.

**Canvas scroll, controls showing**

Drive a page taller than the viewport (the eight-section fixture
`editor-bars-stay-pinned` already uses is the right shape).

At desktop (1280) and at phone (320):

- `document.documentElement.scrollHeight - clientHeight` is within 2px of 0.
- The canvas's `scrollHeight` is greater than its `clientHeight`.
- Scrolling the **document** does not move a section; scrolling the
  **canvas** does. Both halves are required: a build that still scrolls the
  document would move the section on the first assertion if that assertion
  were omitted, and a build that scrolls neither would pass a canvas-only
  check that never asked the document.
- After a long canvas scroll, Save's `getBoundingClientRect().y` is still in
  the toolbar band (below the header, not negative). Rewrite
  `editor-bars-stay-pinned` to scroll the canvas, or it will go green on a
  document that cannot scroll and prove nothing.
- Inspector pane scroll is independent: scrolling Items does not change the
  canvas's `scrollTop`, and scrolling the canvas does not change the pane's.
- With the inspector open on desktop, canvas content is not hidden under the
  panel: a selected section's `left` is at least the reserved padding.

**Preview scroll**

- After a scrolled canvas, Hide controls: `window.scrollY` is 0, canvas
  `scrollTop` is 0, document `scrollHeight` exceeds `clientHeight`, canvas
  `scrollHeight` equals `clientHeight` (no inner scroller).
- A tall Preview can be scrolled with `window.scrollTo` the way
  `editor-is-the-page` already pins a section.
- Show controls: document no longer scrolls; canvas is at `scrollTop` 0.

**Fidelity**

- `editor-is-the-page` stays required. Sabotaging the stack-flattening rule
  or leaving inspector padding in Preview must still redden it. Clearing
  selection is what makes the padding class absent; if a future change hides
  without clearing, the photograph must fail rather than the CSS backstop
  being trusted in prose.

**Responsive**

- At 320, with controls showing and the inspector open (bottom sheet), the
  editor must not scroll sideways (`document.scrollWidth - clientWidth < 2`).
- At the `short` breakpoint (height ≤ 600), canvas is still the scroller.

**Axe**

- Inspector open with Close present still passes the existing signed-in axe
  tags. Close is a named button, not a nested interactive inside Back or a
  breadcrumb.

### Discrimination (rule 27)

Name these wrong implementations in the cases that exclude them:

| Wrong behaviour                                                       | Why a naive fixture would pass                                                      |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Hide controls only sets `display: none` on the inspector              | `toBeHidden()` is true; Show controls brings it back                                |
| Close calls Back until Page                                           | Parent inspector still open after one press at a leaf                               |
| Close is Back relabelled at Page only                                 | Nested Close does nothing or walks                                                  |
| Canvas `overflow-y-auto` but the document still grows                 | Class is right; `document.scrollHeight` still exceeds the window                    |
| `overflow` on a wrapper that also clips x                             | Neon/comic ink disappears; `scrollWidth` of the wrapper is not the page             |
| Preview keeps canvas as the scroller                                  | Inner `scrollTop` moves; `window.scrollY` stays 0; photographs pin the wrong offset |
| Preview starts at the previous canvas offset mapped onto the document | `window.scrollY !== 0` after Hide controls                                          |
| Sticky toolbar still inside a document scroller                       | `position: sticky` reads sticky; `y` after scroll is the only signal                |

## Out of scope

- Merging `/[person]` and `/pages/.../edit` into one route.
- Changing how Interact-with-page or the Add picker work.
- Persisting selection or scroll in `sessionStorage`.
- Making the inspector un-fixed or docking it in flow (a later unification
  may want that; this spec keeps `fixed` so the canvas padding rule stays).
- Applying the canvas lock to any route that is not the editor.
