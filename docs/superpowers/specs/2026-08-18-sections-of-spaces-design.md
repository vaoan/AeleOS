# Sections of spaces — the shape an author chooses, and the editor that builds it

**Status:** COMPLETE for phases 1, 2 and 3, 2026-08-18 — the model, the
renderer and the editor shipped in `feat/sections-of-spaces`. **Phase 4,
dragging, is unwritten**: sections reorder at the top level and nothing else
does, and moving a block between places is not implemented anywhere. Its traps
are recorded below and in the spec this one follows; every one of them fails
silently, so treat that section as the brief rather than as background.
**Follows:** `2026-08-17-blocks-and-grids-design.md`, delivered in `#157`–`#158`,
and **supersedes it** on tracks and spans — that spec carries a note at its top
saying so, and is otherwise left as it was delivered.

## Why this exists

The blocks work separated arrangement from content, which was right. It then
expressed the arrangement as a **flow**: a container declares a track count and
its children stream into those tracks, each spanning some number of them.

That is not what was asked for. The request, restated by its author:

> _"A section is a layout where you show ways to display content. Then inside
> you put content were it can be another layout or content itself. […] a space
> for 1 whole page, 1 for two spaces, 1 for 3 spaces and it keeps extending down
> and so on."_

That is a **slot** model. A section is defined by **how many spaces it has**;
each space holds exactly one thing; that thing is either another section or a
piece of content. The difference from a flow is not cosmetic — in a flow there
is no such thing as an empty space, because children collapse together, and the
author's chosen shape disappears the moment the content does not fill it.

Two further requirements came with it, and one of them contradicts what shipped:

> _"all layouts must be responsive and all content must adapt to its parent"_

Everything currently adapts to the **viewport**. In a nested model that is
actively wrong, and the reason is stated below.

<!-- cspell:ignore dont — the quotation below is verbatim, typo and all -->

The naming is explicitly not the point: _"can be called section instead of
layout, I dont mind it. But it must work as I said."_ So **section** stays as
the word, and the behaviour changes.

## 1. A section is its spaces

A section declares a **space count**. One space is the full width; two sit side
by side; three across; and the vocabulary keeps going upward, with rows
continuing downward as content is added.

**Each space holds exactly one thing** — another section, or one piece of
content. There is no second way to put two things in a space: you put a section
there, and it has spaces of its own. That is the whole recursion, and its
uniformity is the point the author asked for.

### An empty space keeps its width

A three-space section holding two things still reads as three columns. The
third space draws nothing.

**Ruled deliberately**, because the alternative is worse: if unfilled spaces
collapsed, "three spaces" would mean nothing whenever a section was partly
filled, and the shape an author chose would change under them as they worked. A
visitor sees room rather than a broken box; the editor shows that same space as
where the next thing goes.

The consequence for the schema is that a space is **positional**. A section's
children are exactly as many entries as it has spaces, and an entry may be
empty. A list that merely happens to be shorter cannot express "the middle one
is empty".

### What this replaces

`columns` and `span` both go. A container declaring a track count and children
declaring how many tracks they take is the flow model; a space count with one
occupant per space says the same thing about the common case and says it in the
authoring vocabulary rather than in the rendering one. **Fewer concepts, not
more.**

A wide thing is expressed by putting it in a section whose space count is one,
nested where it is wanted — which is the same recursion doing the work, rather
than a second mechanism beside it.

## 2. Content adapts to its parent, not to the window

Every responsive rule in the renderer today is a viewport breakpoint. In a
nested model that is wrong in a way that gets worse the deeper you go: a card in
one space of a three-space section is roughly a third of the page wide, while
every `sm:`-prefixed rule inside it believes it has the whole window.

**The fix is CSS container queries, and no library is needed** — `@container`
with `cqw`/`cqi` units is native, and Tailwind v4 has first-class support. It is
better than any JavaScript alternative here for reasons that matter to this
codebase: no resize observers, no layout thrash, and it works in **server
components**, which these pages are.

So: **every section declares itself a containment context, and every piece of
content sizes itself against its own box.** A leaf asks "how wide am I", never
"how wide is the screen".

This is a correction to shipped code, not an addition. The existing 320px
overflow guards assert against a narrow **window**; they do not cover a narrow
**space** in a wide window, which is the case this model makes ordinary.

## 3. The editor, which is the part that does not exist

The model has been storable and renderable since `#157` and reachable by nobody:
the only writer is the flat editor behind a conversion shim, and that shim
produces exactly one level. **No page in the database is nested, and no person
can make one.** That was the state this was written against; the editor
described below shipped in the same branch, so somebody can nest one now, and
what follows is a requirement that was met rather than one outstanding.

The editor must let somebody:

- **choose a section's shape** — its space count — and change it later;
- **put something in a space**: a piece of content, or another section;
- **pick what a piece of content is**, from the kinds the renderer already draws;
- **edit, move and remove** what is there;
- see it as it will look, without a preview mode that can drift from the page.

**Changing a shape must not destroy what is in it.** Narrowing a three-space
section to two leaves the third space's occupant somewhere recoverable rather
than deleting it — the same principle the span decision already rests on, where
a stored value wider than its parent is kept as typed and narrowed only at
render.

**What was built answers that requirement by dissolving it, and the paragraph
above is left standing as the question it was.** There is no displaced occupant
to recover, because a space count is a WIDTH and not a capacity: `spaces` says
how many places a container lays across, `children` is what is in them, and
narrowing a six-space section to two re-wraps six things into three rows with
all six still there and in order. Better than a rescue, the clamp somebody
would write in good faith **cannot be expressed at all** — `patchContainer` takes
`Partial<Omit<ContainerBlock, "kind" | "children">>`, so the one function the
shape control uses cannot touch the content at all. A type saying it cannot be
written tomorrow, rather than a test saying it is absent today.

### Placement before dragging

Dragging is how a page gets rearranged pleasantly; it is not how one gets built.
An editor that can add, fill, nest, edit and remove is usable without it, and
`@hello-pangea/dnd` cannot express nested drag at all — its own README rules out
both dragging between a parent and a child list, and grid layouts.

So the first cut places things explicitly, and dragging follows as its own
piece, on `@dnd-kit`. That ordering also keeps the largest unknown out of the
critical path: the spike proved two levels of nested drag and **did not** prove
three.

## What this does not change

- **The content vocabulary.** Every leaf kind the renderer draws stays as it is,
  and the embed provider table already covers Instagram, Pinterest, TikTok,
  Twitter, Telegram, Spotify, YouTube and the rest. Adding a content block is
  wiring, not new security surface.
- **The refusals.** No server-side fetch, no pasted embed markup, no file
  hosting. Every address is parsed, matched against an exact host, checked
  against a strict id pattern, and rebuilt from a fixed template.
- **The depth cap.** Three, enforced in the database with an explicit counter,
  because `sections` is user-controlled `jsonb`.
- **Colour.** Form belongs to the section; colour belongs to the page.

## Phasing

1. **The model — DONE.** Spaces replace tracks and spans, positional and
   possibly empty. Schema, database guard, conversion of what is stored.
2. **The renderer — DONE.** Spaces drawn at their width whether or not they are
   filled, and container queries throughout, replacing viewport breakpoints.
3. **The editor — DONE.** Shape, placement, nesting, content kinds, editing,
   removal — `block-editor.tsx`, `block-card.tsx` and `leaf-editor.tsx`, with
   the flat editor deleted and the public renderer drawing the preview.
4. **Dragging — NOT WRITTEN.** `@dnd-kit`, nested, keyboard-operable, with the
   traps the spike recorded: four props that must not be dropped, and an id
   generator that causes a hydration mismatch unless given `useId()`.

Phases 1 and 2 were a correction and were small. Phase 3 was the work. Phase 4
is the refinement that makes it pleasant, and it carries the only genuine
unknown — so what is shipped is a page somebody builds by filling and emptying
places explicitly, which is enough to build one with and is not enough to
rearrange one comfortably. `apps/hub/src/features/actors/CLAUDE.md` is where
the traps are written out at length, and it is the file to read before starting
that phase rather than this one.
