# Editor interaction and motion

- **Date:** 2026-09-02
- **Status:** Approved
- **Scope:** The signed-in person and fursona page editors. Public pages, the
  stored page document, block semantics, and author-selected canvas motion do
  not change.
- **Builds on:** `2026-09-01-recursive-inspector-drill-down-design.md` and
  `2026-08-27-the-editor-wears-the-page-design.md`.

## Problem

The editor canvas is the real page, including real links, media controls and
third-party frames. That fidelity currently has two costs.

First, interactive content remains live while somebody is arranging the page.
A click intended to select a block can navigate away, start media or activate
an embedded control. The editor needs a safe default without giving up the
ability to test the page in place.

Second, editor state changes arrive abruptly. The recursive inspector appears,
its scope changes, canvas room is reserved, and new editing surfaces mount with
no visual continuity. The authored page must stay truthful, but the editor
chrome can explain those changes through restrained motion.

## Interaction contract

The editor has one session-only choice: **Interact with page**.

- With controls visible, page interaction starts **off**.
- The toolbar switch can turn interaction on while controls remain visible.
- Hiding controls always makes the page interactive.
- Showing controls again always resets interaction to off.
- The choice is not stored in the page document, browser storage, account or
  database.

The effective rule is:

```text
page interactions enabled = controls hidden OR toolbar switch enabled
```

The switch changes page behavior, not editing chrome. The inspector, source
dock, Save, Cancel and every other AeleOS control remain interactive in both
states.

When page interaction is off:

- links do not navigate or open a tab;
- buttons, disclosures and media controls do not activate;
- embedded frames cannot receive pointer or keyboard focus;
- interactive page content is absent from the tab order;
- clicking the visual content still selects the nearest block;
- clicking empty canvas still clears selection.

When page interaction is on:

- page content behaves exactly as it does for a visitor;
- canvas clicks do not select or clear blocks;
- the current selection and inspector may remain visible when the toolbar
  switch enabled interaction; the mode does not silently discard editing
  context.

Preview remains hide-controls, not a second rendering path. It therefore gets
interaction through the same effective rule rather than through special cases
inside leaf renderers.

## Interaction boundary

`FursonaEditor` owns the session state beside `controlsHidden`. It passes the
effective interaction state into `BlockEditor` and resets the explicit switch
whenever controls return.

The public renderer receives no editing prop and no client context. An
editor-only interaction boundary acts on the DOM beneath
`data-editor-canvas`:

1. While locked, it marks interactive descendants inert. The selector includes
   anchors, buttons, form controls, disclosures, controlled audio/video,
   frames, editable content and explicit tab stops.
2. It observes the canvas for interactive descendants mounted after an edit,
   including a newly selected player or embed.
3. It remembers and restores each element's prior inert state. Unlocking must
   not make something interactive that the renderer deliberately disabled.
4. It is removed with the editor. Nothing on a public route runs this boundary.

Inert descendants retarget pointer hit-testing to their non-inert block
wrapper. The existing `data-block-path` lookup can therefore select the block
without allowing the enclosed control to act. The canvas click handler is
disabled when interactions are enabled, so a real link click cannot also
change editor selection.

The interaction boundary is the single enforcement point. Individual leaf
renderers do not each grow an `editing` branch; that would duplicate a
security-relevant default across every present and future interactive kind.

## Toolbar

The interaction switch sits with Preview because both change how the live page
can be used:

- **Interact with page** is a pressed/unpressed switch and remains visible
  while controls are visible.
- **Preview** hides controls and implies interaction on.
- **Show controls** returns to safe editing and therefore interaction off.

The label is translated in English and Spanish with the rest of the editor
chrome. Its accessible description states the consequence, not merely the
state: page links and controls are locked or available.

At narrow widths the switch follows the toolbar's existing compact-label
rules. It must not introduce a new overflow band at `sm` or `md`.

## Motion contract

Motion belongs to editor feedback, never to somebody's authored design.
No animation library is added.

The editor adds native CSS motion in five places:

1. **Inspector entry:** desktop slides a short distance from the left while
   fading in; the phone sheet rises a short distance from the bottom.
2. **Scope changes:** Items, Options and drill-down content fade and translate
   a few pixels so a new scope reads as navigation rather than replacement.
3. **Canvas accommodation:** the inline space reserved for the desktop
   inspector transitions instead of jumping.
4. **Selection feedback:** the selected outline changes smoothly without
   animating authored colours or geometry.
5. **New editor content:** newly mounted inspector rows and newly authored
   preview blocks receive one editor-only entrance. A public page does not
   animate those blocks on load.

Motion is short and subordinate:

- opacity/selection feedback: about 140–160 ms;
- panel, scope and canvas movement: about 200–220 ms;
- movement distance: no more than 12 px;
- easing: decelerating on entry, standard ease on state changes;
- no spring, bounce, stagger or continuous editor animation.

The inspector remains absent from the DOM with no selection. Clearing selection
therefore unmounts it immediately; this phase deliberately animates appearance,
not a delayed exit that would weaken the absence invariant.

`prefers-reduced-motion: reduce` removes every new animation and transition.
Author-selected nebula motion keeps its existing, separate reduced-motion
contract.

## Fidelity and input safety

The interaction lock changes input handling only. It must not add a painted
overlay, opacity, cursor veil or wrapper that changes container-query size,
stacking, clipping, skin scope or screenshot pixels.

Editor-only entrance motion must settle to the exact boxes and pixels the
public renderer produces. The existing editor-is-the-page comparison remains
the fidelity backstop and runs after motion has settled.

The source dock, inspector drag handles and editor toolbar are outside the
locked canvas. Sibling drag behavior is unchanged. Enabling page interaction
does not turn inspector rows into page content and does not enable cross-level
dragging.

## Proof

Unit coverage must establish:

- effective interaction state for controls shown, switch enabled, Preview and
  Show controls;
- Show controls resets the explicit switch;
- the interaction boundary marks existing and newly mounted interactive
  descendants inert;
- unlock and unmount restore prior inert state;
- canvas selection is active only while page interaction is locked;
- all exported contracts and every state branch are covered.

Browser coverage must establish:

- a real link cannot navigate or open a tab by default, and its block is
  selected instead;
- the toolbar switch makes that same link work while controls remain visible;
- keyboard focus skips page links, buttons and frames while locked and reaches
  them when enabled;
- media/embed controls are inert while locked;
- Preview makes content interactive, and Show controls locks it again;
- inspector entry, scope transition and canvas accommodation use the intended
  motion in ordinary mode;
- every new duration becomes zero under reduced motion;
- 320 px and the exact toolbar breakpoints do not overflow;
- editor/public geometry and settled pixels remain equal.

The interaction cases use the real renderer. Mocking a link, frame or player
would remove the setup requirement this feature exists to enforce.

## Operational follow-up

Picture proof for the recursive-inspector pull request was captured but not
posted before its automatic merge. It should be added to that merged thread if
the authenticated GitHub surface accepts local attachments. The repository's
picture-proof instructions must name a mechanism that is actually available;
they must not claim that `gh pr comment` uploads files, because it only posts
Markdown after an image already has a reachable URL.
