# Editor interaction, adding, and motion

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

Second, adding is inconsistent between scopes and unreadable at every scope.
Adding is offered by two unrelated surfaces: an empty positional place renders
`add-content` and `add-nested`, while a scope's footer renders one flat button
per leaf kind — sixteen of them — plus `add-place`. Two consequences follow,
and only the first has been noticed.

The scopes disagree about layout. `add-nested` exists **only** on an empty
place, so a section whose places are all filled offers no way to add a section
inside it: somebody must add a place, then use a control that appears on the
place. Nesting was never removed — `mayNest` still admits a container up to
`MAX_DEPTH`, which is three — but it is reachable by one route out of two, and
that reads as a deleted feature.

And a flat row of every kind is not a choice anybody can make. The kind names
are the only information offered, so an author has to add a block to find out
what it is, then remove it. That is worse in Spanish, where the longest names
are the ones a narrow toolbar already has no room for.

Third, editor state changes arrive abruptly. The recursive inspector appears,
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

## Adding contract

**One control adds, and it is the same control everywhere.** Every scope that
can hold a block — the page, and every container the inspector can select —
offers a single **Add** button. A leaf offers none, because a leaf holds no
places. An empty positional place offers the same control targeted at that
exact place rather than a second vocabulary of its own.

**Content and layout are offered together, and the depth cap is the only thing
that removes either.** A section inside a section is an ordinary choice at
every scope where `mayNest` admits one. Where it does not — a place at
`MAX_DEPTH` may hold content and nothing else — the layout group is absent and
the existing `nestingAtLimit` sentence says why. The editor keeps asking
`mayNest` to decide what to OFFER; `validate_block` in `0009` stays the
authority on what may be stored.

The picker is a popup, not a page. Pressing Add opens it over the inspector;
choosing an option adds that block at the target place and closes it, leaving
the new block selected exactly as adding does today. Escape and an outside
press close it, adding nothing.

### What an option shows

Each option is drawn by the **real renderer** with fixed sample content: a
content option mounts the leaf renderer for its kind, a layout option mounts a
container in that mode holding placeholder children. There is no second
drawing of a block anywhere in the repository, so a preview cannot disagree
with the page — the same argument that made the section style popup preview
with `blockStyle` rather than with an illustration.

Two constraints follow from that decision rather than from taste:

- **A preview is not the page and must not be mistaken for it.** Previews
  render outside `SKIN_SCOPE` with the workbench's own tokens, so an author's
  palette does not repaint the picker and the picker does not claim the page
  looks like this once added. It shows what the KIND is, not what this page
  will make of it.
- **Sample content is fixed and translated with the editor chrome.** It is not
  somebody's writing and never becomes part of the added block: adding still
  produces exactly what `newLeaf` and `newContainer` produce today, so no
  stored shape changes and no page arrives pre-filled with placeholder text.

Preview mounting is bounded. The picker mounts previews only while it is open,
and the identity kinds it offers are the same set the scope already admits —
`kinds` is forwarded, so `owner` remains unofferable on a person's own page,
which is the constant the page source dock already needed.

### What does not change

Section presets keep their existing control and their existing behaviour;
they compose a shape rather than add one block, and folding them into the
picker would conflate the two. `add-place` also stays its own control: growing
a container by one place adds no block, and the picker is about what goes in
one.

`BLOCK_LIMITS` is unchanged, and a scope at the block limit offers no Add
button rather than a picker that refuses every option.

## Motion contract

Motion belongs to editor feedback, never to somebody's authored design.

The editor adds motion in five places:

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

## The animation library

**Motion for React (`motion`) is adopted**, imported as `LazyMotion` plus the
`m` components rather than the full `motion` namespace, so the always-loaded
core stays small and the feature set is fetched once the editor mounts. The
alternatives were weighed and rejected for reasons that are about this
repository rather than about the libraries:

- **Native CSS alone**, which the first version of this spec chose, expresses
  entry and state transitions but not the exit of a row that is being removed,
  because the element is already gone. It also gives no single place to switch
  reduced motion; every rule restates the query.
- **`@formkit/auto-animate`** is the smallest option and handles list
  add/remove/move automatically, and that list is the one surface it must not
  touch: the inspector's Items rows are driven by `@dnd-kit`'s own transforms,
  and two libraries writing `transform` on one element is the cascade fight
  this repository has already paid for twice.

### What it may touch, and what it may not

**Motion writes inline styles, which beat every layered utility
unconditionally** — the same mechanism as rules 3 and 4, arriving through a
dependency instead of through a stylesheet. So the boundary is a rule, not a
convention:

- Motion components render **only inside `CHROME_SCOPE`**. No block wrapper,
  no `SKIN_SCOPE` descendant, and nothing on a public route is a Motion
  component. The public renderer gains no dependency and no client boundary.
- **No Motion component is a `@dnd-kit` draggable, droppable, or an ancestor
  that writes `transform` on one.** Sibling drag keeps exactly the transforms
  it has today.
- Layout animation (`layout`) is not used in this phase. It measures and
  writes geometry, which is the one thing the editor-is-the-page fidelity
  comparison exists to hold fixed.

### Accessibility

`MotionConfig` is mounted once at the editor root with `reducedMotion="user"`,
so the preference is honoured in one place rather than restated per component,
and it covers animations expressed in JavaScript that a media query in CSS
cannot reach. `useReducedMotion` is available for the few cases where reduced
motion should change the shape of a transition rather than remove it.

That satisfies the reduced-motion contract above by construction, and it is
not evidence: rule 1 applies to a newly adopted tool, so the reduced-motion
proof below drives the real preference in a real browser rather than trusting
the option's name.

Motion does not participate in Tailwind at all — it neither generates classes
nor reads them — so it cannot conflict with a utility, with `tailwind-merge`,
or with the `cn` helper. There is no shadcn installation in this repository to
be compatible with: `components.json`, Radix, `class-variance-authority` and
`tailwindcss-animate` are all absent, and what exists is the `cn` convention
over hand-written Tailwind v4. That absence is what leaves no competing
animation system for this one to fight.

### Cost

The adoption is not final until measured. `hub`'s production build is
compared before and after, and the `canvas` job's throttled-page cost must
stay inside its existing budget with the editor mounted — an animation library
that moves either is reverted with the numbers rather than kept because it is
already wired. Rule 8: a migration's cost is not the diff.

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
- every scope that admits a block offers exactly one Add control, and a leaf
  offers none;
- the picker offers layout at a scope `mayNest` admits and omits it at
  `MAX_DEPTH`, where the at-limit sentence appears instead;
- choosing an option adds the block `newLeaf`/`newContainer` produces, at the
  targeted place, and selects it;
- the picker forwards `kinds`, so a kind the scope refuses is not offered;
- Escape and an outside press close the picker without adding;
- a scope at `BLOCK_LIMITS` offers no Add control;
- all exported contracts and every state branch are covered.

The adding cases must discriminate the wrong behaviour they exclude, and one
is easy to get wrong: a picker that adds the correct kind at the WRONG place
and a picker that adds it at the right one land identically when the scope has
a single empty place. The fixtures use a scope with more than one, and target
a place that is not the first.

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
- every new duration becomes zero under `prefers-reduced-motion: reduce`,
  driven as a real browser preference rather than inferred from
  `MotionConfig`'s option;
- a sibling drag by pointer and by keyboard is unchanged with Motion mounted,
  which is what pins the "no Motion component writes a `@dnd-kit` transform"
  rule to something that can fail;
- a section inside a section can be added from a full scope, by picker, at
  every depth `mayNest` admits;
- a picker preview draws the same thing the canvas draws for that kind;
- 320 px and the exact toolbar breakpoints do not overflow, with the Add
  control and the open picker both measured — the picker is a new surface at
  the width where the toolbar already had none to spare;
- editor/public geometry and settled pixels remain equal.

The interaction cases use the real renderer. Mocking a link, frame or player
would remove the setup requirement this feature exists to enforce. The same
applies to the picker previews, which are the real renderer by design and must
not be stubbed in the test that checks they agree with the canvas.

The build and throttled-page measurements named under **Cost** are recorded on
the pull request, before and after, as the evidence the library is affordable.

## Operational follow-up

Picture proof for the recursive-inspector pull request was captured but not
posted before its automatic merge. It should be added to that merged thread if
the authenticated GitHub surface accepts local attachments. The repository's
picture-proof instructions must name a mechanism that is actually available;
they must not claim that `gh pr comment` uploads files, because it only posts
Markdown after an image already has a reachable URL.
