# Recursive inspector drill-down

- **Date:** 2026-09-01
- **Status:** Approved
- **Scope:** The signed-in person and fursona page editors. The stored page
  document, public renderer, block depth, and move semantics do not change.
- **Supersedes:** The inspector navigation and initial-selection portions of
  `2026-08-31-canvas-inspector-builder-design.md`.

## Problem

The canvas-first editor moved the workbench into a hideable inspector, but its
Options pane still mounts every top-level card and every descendant beneath
them. Selecting one object therefore reveals the whole page's editing tree.
The inspector is spatially separate from the canvas while preserving the same
information density as the old workbench.

The inspector must instead reveal one level at a time. A person should enter a
page, section, nested layout, or content block and see only what belongs
directly to that scope.

## Invariants

- The editor starts with no selection and no inspector.
- The inspector is visible only while editing controls are visible and a page
  or block is selected.
- Empty canvas and an unclaimed Escape clear selection.
- Preview keeps using hide-controls and hides the inspector with every other
  `CHROME_SCOPE` island.
- A `BlockPath` remains the sole identity of a selected block. No stored id or
  second navigation stack is introduced.
- The page document, schemas, `moveBlock`, depth cap, public rendering, source
  dock, templates, and theme application remain unchanged.

## Navigation

The Page toolbar control selects the page root. Clicking a rendered block on
the canvas selects that block directly; the nearest `data-block-path` wins, as
it does today.

For a block path, its parent is derived by removing the final position. Back
therefore needs no history stack and cannot become stale independently of the
tree. Breadcrumbs begin at Page and expose each ancestor as a button. A
breadcrumb selects its target; Back selects the immediate parent, or clears
selection when the current target is Page.

Clicking a child row selects and enters that child in one action:

- A container opens on Items.
- A leaf opens directly on Options because it has no children.

If the selected path stops resolving after an edit, selection repairs to the
closest surviving ancestor. If none survives, it returns to Page. Deleting the
selected target explicitly selects its parent.

## Inspector

The page and every container expose two tabs:

- **Items** lists only immediate children and owns adding to that scope.
- **Options** edits only the selected page or container.

A leaf exposes Options only. It never renders an empty Items tab.

The page's Items are its top-level blocks. A container's Items are its places,
including empty places. Empty places are not omitted: `[a, null, b]` is an
authored three-place shape, and hiding the middle place would make its position
uneditable. An empty row offers the existing add-content and add-layout
actions.

Each occupied row carries:

- its position within the current scope;
- the ordinary-language type and useful authored name;
- a dedicated drag handle;
- row activation that enters the item.

The Items tab also carries the existing page/container additions. Page-only
templates and presets stay at Page. Adding a child selects the new child.

Options never mounts descendants:

- Page Options contains identity and theme.
- Container Options contains that container's name, arrangement, spaces,
  weights, style, and removal controls.
- Leaf Options contains that leaf's kind, fields, style, and removal controls.

The existing `BlockCard` split is refactored rather than copied: one component
owns a selected block's controls, another owns the shallow list of its direct
places. There remains one implementation of each field and mutation.

## Dragging

Only siblings visible in the current Items tab participate in a drag:

- Page children retain top-level reorder semantics.
- Container places retain move/swap semantics, including swaps with empty
  places.
- Cross-level dragging is not offered in this inspector.

The row and its grip have different gestures. A row click enters the child. A
pointer or keyboard gesture that starts on the grip is drag intent and must
never activate the row. The grip stops row activation, and a completed or
cancelled drag suppresses the browser's following click. The pointer activation
distance remains a guard against small motion, not the only protection.

The current parent remains selected after sibling reordering. Because the
selection names the parent rather than a moved child, a reorder cannot make the
inspector jump into whichever object took an old position.

## Accessibility and responsive behavior

The inspector remains a left panel on desktop and a bottom sheet on phones.
Breadcrumbs and Back are real buttons. Items are a labelled list; row
activation and drag handles are separate focusable controls with separate
accessible names. The active tab follows the existing tab pattern, and a leaf
has no misleading two-tab tablist.

The panel remains absent from the DOM while nothing is selected. Hiding
controls removes it by the existing class rule rather than by a second preview
state.

## Proof

Unit coverage must establish:

- page/block parent derivation and closest-surviving selection repair;
- direct children and empty places for each scope;
- sibling-only drop acceptance;
- page, container, and leaf tab choice.

Browser coverage must establish:

- no inspector on initial load;
- Page → child → nested child → Back/breadcrumb navigation;
- a leaf opens directly on Options;
- empty canvas, Escape, and Preview hide the inspector;
- an empty positional place remains visible and fillable;
- clicking a row enters it, while dragging that row's grip reorders without
  entering it;
- phone and desktop layouts do not overflow;
- the recursive inspector state passes the existing axe rule set.

The click-versus-drag fixture must use at least three siblings and move a
non-adjacent item, so reorder and swap/shift implementations cannot land on the
same visible result.
