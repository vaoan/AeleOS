# The page has a source, and the source is shareable

**Status: designed, 2026-08-27.**

## What is missing today

A page is built entirely through controls. That is the right primary way to
build one, and it has three consequences nobody has a way around.

**A page cannot leave.** Two people who both use this app have no way to hand
each other a page. The pastiche pages exist precisely because reproducing
somebody else's arrangement is the interesting thing this editor can do, and
the only way to reproduce one today is to rebuild it by hand, block by block,
from a screenshot.

**A page cannot be authored by anything but a person clicking.** The block
model is a small, closed, well-documented vocabulary — eight container modes, a
fixed list of leaf kinds, a depth cap of three, a bounded style bag. That is
exactly the shape a language model authors well, and there is no way to get a
model's output into a page.

**A page cannot be inspected.** When a section behaves unexpectedly there is no
way to see what is actually stored. The renderer, the schema and the database
all agree on a tree, and the person who owns it has never seen one.

## What this is

A **dock**: a resizable panel in the editor showing the page as JSON, bound
live in both directions, with a reference describing the format.

Editing the text changes the page as you type. Editing the page through the
ordinary controls updates the text. Copying the text out and pasting it in
somewhere else is how a page is shared, and the same box is where a
model-authored page arrives.

## The document

```json
{ "aeleos": 1, "theme": {}, "blocks": [] }
```

**Two keys, because the database has two columns.** `actor_profiles` stores
`sections jsonb` and `theme jsonb` on one row, written by two RPCs with two
different validators — `validate_block`'s recursive depth-capped walk, and
`set_actor_theme`'s key allowlist. The document mirrors that split rather than
inventing a flatter one, so there is one obvious answer to "what part of this
is my page" at every layer.

The key is named `blocks` and the column is named `sections`, and that is a
deliberate mismatch. The column predates the block model; the vocabulary the
reference teaches is blocks, containers and leaves, and the reference is the
document's main reader.

### What is excluded, and why each

**`handle`, `display_name`, `avatar_url`** live in `public.actors`, a different
table. They are who a fursona is rather than what its page looks like.

Excluding them is also what makes sharing work at all. `avatar`, `handle`,
`name`, `owner` and `fursonas` are leaf **kinds** that draw the actor rather
than what somebody typed, so an imported page renders with the importer's own
portrait and name in the places the author put theirs. **A template and
somebody's real page are therefore the same artefact**, with no separate
templating concept, no placeholder syntax and no substitution step.

**`visibility`** is excluded on a safety argument rather than a tidiness one. A
document carrying `visibility: "public"` would **publish a page by paste**:
somebody imports a shared page to try it, presses Save, and a page they believe
is private is being read by strangers. Nothing about a pasted document may
decide who can read the page it lands in.

**`sort_order` and `featured`** are in `actor_profiles`, so they are the one
exclusion drawn by judgement rather than by a table boundary. They describe
where a fursona's card sits in its **owner's own list**, are edited on a
different screen by dragging, and mean nothing when they arrive from a
stranger.

### The version marker

`"aeleos": 1` is a required key, and an unrecognised value is refused with a
sentence rather than read leniently.

This repository has already shipped **three** stored page shapes, and the third
one caused precisely the damage a shared document is exposed to: code that met
a key it did not recognise stripped it, turned a three-across gallery into one
full-width column, and the next save stored the loss — silently, for the owner
and for every stranger reading the page. A document posted somewhere public
will be imported after a format change, by a build that has never seen it. The
marker is what turns that into a refusal somebody can read instead of a page
that quietly becomes something else.

### Two lenient readings, both deliberate

**A bare array is accepted as shorthand for `{ "blocks": [] }`.** A model asked
for a page very often emits the array alone. Refusing the most common output of
the flow this feature exists to serve teaches people to paste harder rather
than to paste correctly. This is leniency about the **envelope's shape**, never
about validation: the array still goes through `blocksSchema` and
`validate_block` unchanged.

The shorthand and the marker are not in tension, and the rule is stated here so
nobody has to infer it: **the marker is required of the object form and absent
by definition from the array form**, which is read as version 1 because a bare
array is the only shape it can be. **Export always emits the object form**, so
every document this app produces carries a marker; the shorthand exists only to
read what something else wrote.

**An absent `theme` means "leave mine alone", not "reset to the default".**
Absence means inherit everywhere else in this model, and a person pasting a
tree somebody sent them has not asked for their colours to be thrown away.

## The live binding

The text and the page are bound in both directions. The rules below are the
whole feature; everything else is presentation.

### While the text is invalid, the page holds the last good tree

The text is invalid for most of the time anybody is typing in it — every
half-typed brace, every moment part-way through a paste. Emptying the page on
every keystroke is unusable, so the page keeps rendering the last text that
parsed.

**The disagreement is made visible rather than hidden.** The dock carries a
state saying the page is showing the last valid version, and an error strip
naming what is wrong.

**There are two classes of wrong and the strip must tell them apart**, because
they are found by different machinery and only one of them has a path. A
**syntax** failure — an unclosed brace, a trailing comma — comes from
`JSON.parse` and has no tree to point into, only a position in the text; the
strip reports the position and nothing more, because inventing a block path for
a document that never parsed would be a lie. A **schema** refusal has a real
location, and the strip names it as a path into the tree —
`blocks[2].children[0].kind` — built from the same `BlockPath` machinery
`blockProblems` already uses to mark the wrong block on a refused save.

The page holds the last good tree in both cases. The distinction is only in
what the person is told, which is the difference between "you have a typo here"
and "this block is not allowed".

### Which direction wins

Binding two views to one state loops: the form changes, serialises into the
text, the text change parses back into the form, forever. Re-serialising also
destroys the author's own whitespace and moves their cursor mid-word.

- **Text to page**, on a debounced valid parse, through
  `setValue(..., { shouldDirty: true })` so Save lights up and the
  unsaved-changes guard works. Guarded by comparing serialisations before
  writing, so an identical value never re-enters the loop.
- **Page to text**, only while **the textarea does not have focus**. Editing
  through the ordinary controls refreshes the text; typing in the text means
  nothing reaches in and rewrites what is being written. A control edit landing
  while the textarea has focus sets a "the page moved" state offering a
  re-sync, and never clobbers.

That asymmetry is why this is a dock rather than a modal. Both halves stay
usable at once, so the arbitration has to be stated rather than made impossible
by a backdrop.

### Every editor gets it, and a document carries no kind

`FursonaEditor` is mounted by three routes — `/pages/new`, `/pages/[handle]/edit`
and **`/me/edit`, the person's own profile** — so the dock lands on all three
without a decision. A person's profile is a page like any other and there is no
reason it would not share.

That makes **cross-kind import** an ordinary case rather than an exotic one:
somebody will paste a fursona's document into their profile. The document
carries no actor kind and must not, because the kind of a page is a property of
the actor it belongs to and is immutable in the column. **The destination's kind
decides.**

Deciding it is not symmetrical with what already exists, and the gap is the
reason this section is here. `set_actor_sections` enforces **two** rules per
kind — a required list and a **refused** kind:

| Actor kind | Must carry               | Refuses    |
| ---------- | ------------------------ | ---------- |
| `person`   | `avatar handle fursonas` | `owner`    |
| `fursona`  | `avatar handle owner`    | `fursonas` |

The client knows only the first. `withRequiredBlocks` fills what the
destination is missing, so that half of a cross-kind import is already handled.
**Nothing in the client knows about the refused kind at all** — it exists in
`0009` and nowhere else — so a fursona's document imported into a profile
carries an `owner` leaf, saves, and is refused by the database with no marked
block and no path, on a page whose author did nothing wrong.

So this feature owes a client-side `refusedKind`, beside `REQUIRED_KINDS` and
pinned to the SQL by `block-limits-match-migration.test.ts` like every other
vocabulary written down in two languages. The import then reports it the way it
reports any other refusal — by path, on the block — and the person deletes it
with the ordinary controls.

**The forbidden leaf is reported, never silently stripped.** Stripping a key
because we know better is the exact shape of the `columns` loss: quiet,
plausible, and stored on the next save. The person pasted a document and is
owed the truth about it.

### Nothing reaches a stranger until Save

An import writes into the **form's draft**. Cancel is a complete undo, the
strict `blocksSchema` sits between the draft and the RPC, and `validate_block`
sits between the RPC and the column. A pasted document — hostile, malformed or
merely somebody else's — has three separate refusals ahead of it before any
visitor sees anything.

## The dock

**Non-modal.** A `<dialog>` opened with `show()` rather than `showModal()`. No
backdrop, no focus trap, the page behind it stays scrollable and interactive.
Escape closes it, focus returns to the control that opened it, the region is
labelled. A modal would make the live binding pointless — the thing being
watched would be underneath the thing being typed into.

**Opaque, and that is a guarantee rather than a preference.** What is behind a
control in this editor is a colour the author chose, and they may choose any
colour, so a translucent panel has no guaranteed contrast against a page
somebody else designed. It takes `--menu`, the one token declared opaque in
both modes, and wears `CHROME_SCOPE` like every other island so the author's
palette does not reach it — which also means the existing hide-controls rule
removes it by class, with nothing to remember.

**Resizable, with a first-class collapse.** Drag its edge to resize. On a
narrow viewport there is no "beside": at 320px the dock becomes a full-height
sheet, and the collapse control stops being a convenience and becomes the only
way to see whether what was typed did anything. It is designed as a control in
its own right rather than a corner affordance.

**A plain `<textarea>`, monospace, and Tab moves focus.** No syntax
highlighting: it would mean a dependency and an overlay-alignment problem, and
the error strip naming a path does the work highlighting would, honestly and
for nothing. Trapping Tab inside a textarea is a real accessibility failure and
`a11y.spec.ts` would be right to catch it.

## The reference

The dock carries a **reference** describing the format — not a prompt. An agent
is given its task by the person using it; what it needs from us is an accurate
description of what it may emit. One copy control. The page's own JSON is
already in the box beside it, so there is no second "copy my page" control to
build.

**Hand-written meanings, generated vocabularies.** Every list, cap and
enumeration is interpolated from the constants that are already the source of
truth — `CONTAINER_MODES`, `LEAF_KINDS`, `MAX_DEPTH`, `BLOCK_LIMITS`,
`BLOCK_STYLE_LIMITS`, the skins, `PAGE_MEASURES`, `PAGE_FONTS`,
`PAGE_SPACINGS`, the required kinds. The one-line explanation of what each
member **means** is written by a person, because "packs by height" and "a place
may be empty and keeps its width" cannot be derived from a type.

**The join is gated.** A unit test requires a description for every member of
every vocabulary the reference publishes, so adding a container mode without
writing its line fails the build. A reference that goes stale is worse than one
that does not exist, because the thing reading it believes it completely —
`columns` was in the vocabulary and was removed, and a hand-written reference
would still be telling models to emit it and users would be getting refusals
they could not diagnose from a document we handed them.

**Generating it from the existing TSDoc is rejected**, tempting as the
single-source argument is. That TSDoc is written for maintainers: it carries
history, corrections and several accounts of things that were wrong for a day.
As material for a model it is actively harmful.

**The reference body is English only, and it is not a next-intl message.** Both
catalogues are key-checked, so adding it as a message would demand a Spanish
translation of a technical specification that would then drift in one language
only. It is a generated string. The chrome around it — buttons, headings, the
error strip — stays bilingual like everything else.

## Security

### The blocks are already safe, and durably so

Every dangerous field in the block model defers to a guard at the point of
**use** rather than the point of entry: `image_url` and `link_url` to
`safeHttpUrl`, `background_url` to `backgroundImageValue` (which refuses `"`
and `\` outright, so a CSS `url()` cannot be escaped), `icon` to lucide's own
name list, embeds to a provider allowlist that **builds** an address rather
than trusting one. None of those guards cares where the value came from, so
import does not weaken any of them. Nothing renders author data through
`dangerouslySetInnerHTML`.

### The theme is not, and the code says why in its own words

`themeSchema` — the schema the editor's form uses — is loose on `accent`,
`cursor`, `backgroundUrl`, the three dials and `canvasColours`, and its own
documentation gives the reason: the colours are loose _"because they are
`#rrggbb` or null and nothing else is reachable through a colour input"_, and
the dials are loose _"since a slider cannot produce anything else"_.

**Import is precisely the removal of that premise.** Both sentences are
statements about controls, and this feature deletes the controls.
`canvasColours` is `z.array(z.string())` with no length bound in that schema at
all — a pasted theme could carry a hundred thousand strings where the picker
produces a handful.

**The ruling: an imported theme goes through `parseTheme`, never through
`themeSchema`.** `parseTheme` is the read path, written for a `jsonb` column
nobody controls. It normalises every colour through `parseHex`/`toHex`, drops
anything that is not `#rrggbb`, caps the list at `MAX_CANVAS_COLOURS`, clamps
all three dials, and falls back per field on every vocabulary. An imported
theme is stored data arriving from a stranger, which is what that function
exists for.

**The general rule this feature is the first instance of:** where a write
path's looseness is justified by a control, an import must use the **read**
path's guards instead. It is this repository's own "a mocked dependency hides
its own setup requirements" one level up — the thing being assumed upstream is
a user interface, and this feature is where that assumption stops holding.

### The paste path, which is genuinely new surface

**Size is checked before parse, never after.** Live binding parses after every
burst of typing; a very large paste parsed repeatedly is a frozen tab, and the
size cannot be learned from a parse that cannot be afforded. The string's byte
length is measured against `PASTE_LIMIT_BYTES` first — twice `BLOCK_LIMITS.bytes`,
derived rather than a second written number, so the theme's own headroom
cannot make a legal document read as oversized — refused with a sentence, and
`JSON.parse` is never reached.

**Parser depth is measured rather than assumed, and the first measurement
answered the wrong question.** A plain `JSON.parse` has no ceiling reachable
within `PASTE_LIMIT_BYTES` — 5,000,000 levels parsed in 604ms. But the call
this module actually makes hands `JSON.parse` a reviver (below), and a
reviver's own invocation walks the parsed value recursively in JS rather than
in native code — which has an ordinary stack limit a native parse does not.
Measured against the block model's own container shape, 2026-08-27: the first
depth to throw `RangeError: Maximum call stack size exceeded` is 857, reachable
within the byte cap (2,000 such containers serialise to about 120KB). It
cannot escape as an uncaught throw — `RangeError` is an `Error`, so the same
`catch` that reports a genuine syntax error reports this one too, as an
ordinary `syntax` problem. Both ceilings are what the engine actually does,
written down rather than recalled; see `page-document.ts` for the exact
numbers and the date they were taken.

**`__proto__`, `constructor` and `prototype` keys are refused by a `JSON.parse`
reviver, not merely believed absent.** `JSON.parse` does not itself put
`__proto__` onto `Object.prototype` — it becomes an ordinary own property —
so this is defence in depth rather than a fix for a real pollution:
`refuseUnsafeKeys` throws on any of the three, at any depth, and
`parseDocument` reports that as its own `unsafe-key` problem rather than
folding it into a generic syntax failure, so a person is told which key rather
than shown a position that is not actually wrong. `blocksSchema` is strict and
would refuse an unsafe key placed on a BLOCK regardless of the reviver; the
reviver is what actually closes the gap `parseTheme` leaves open, since it
reads named fields off the theme object and would let an unrelated key through
unnoticed. `page-document.test.ts` is sabotage-verified against both shapes:
removing the reviver flips a top-level `__proto__` key and a `constructor` key
nested inside `theme` from refused to accepted, which is what makes the second
case discriminating — a `constructor` key placed on a block instead would have
been refused by `blocksSchema`'s own strictness whether or not the reviver
existed.

**Parsing is debounced and never blocks a keystroke.**

### What is deliberately out of scope, and why saying so matters

Bidirectional-override characters, zero-width joiners and long combining-mark
stacks in a title are display-integrity attacks, and they are what "poisonous
to the page" most naturally means.

They are **not import-specific**: a person can type every one of them today.
Defending against them only at this door would create a false guarantee — the
dock would be safe and the ordinary editor would not — and the defence, if it
is wanted, belongs at render, applying to all authored text, as its own change.

What this feature owes is to **prove the containment holds**: that the length
caps and overflow rules mean a hostile string is ugly rather than
page-breaking. The decision is recorded here rather than left as a gap nobody
named.

## Testing

**Unit.** Round-trip fidelity; every refusal path with its `BlockPath`;
`parseTheme` against hostile themes; size-checked-before-parse; the version
marker refusing an unrecognised value; the bare-array shorthand; an absent
theme leaving the current one alone; the reference's vocabulary-completeness
gate.

**End to end.** The dock opens non-modally and the page stays interactive
behind it; editing the text moves the real page; broken text holds the last
good tree and names the path; a hostile document imports without breaking the
page and is still refused at Save; the copy control; `a11y.spec.ts` extended
for the new region (Tab not trapped, focus returned, Escape, labelling); the
narrow-viewport sheet and its collapse.

**Sabotage, and this is where the care goes.** Two fixtures in this repository
have already passed while proving nothing, and both failure shapes apply
directly here.

**A round-trip test on a default page passes whether or not the parse does
anything.** So the fixture is deliberately asymmetric: `weights` that are not a
palindrome, because a renderer that reverses the array passes on `[1, 3, 1]`;
at least three sections, because a shift and a swap leave the same page when
there are two; a container at the depth cap; and a `spaces` count that is not
the default.

**The last-good-tree case has to break the JSON in a way that would visibly
change the page if it were applied.** Otherwise "held the last good tree" and
"applied it anyway" render identically, and the assertion cannot fail.

Every sabotage names the wrong behaviour it excludes, and any that cannot
discriminate is reported as such rather than counted.

## A pre-existing bug this design found

Verifying the cross-kind claim above turned up a fault that has nothing to do
with import and is reachable today.

**The leaf-kind select offers every kind on every page.**
`leaf-editor.tsx` maps over all of `LEAF_KINDS` with no filter by actor kind.
So on `/me/edit` a person can pick `owner` from the dropdown, and on a fursona's
page anybody can pick `fursonas` — and `set_actor_sections` refuses both. The
save fails with a database exception, no block is marked, and the message names
neither the block nor the reason.

**The renderer's own documentation says this cannot happen.**
`identity-leaves.tsx` states that a page with an `owner` leaf and no owner is
_"unreachable through the editor — `owner` is refused on a person's page at the
write — so this is a belt rather than a case anybody sees"_. The second half is
true and the first half is false: the write does refuse it, and the editor
offers it anyway. A sentence naming a guard reads like a measurement, which is
the failure this repository has written down more than once.

It is folded into this work rather than deferred, because the fix is the same
`refusedKind` the import path needs: one constant, pinned to the SQL, read by
the select to withdraw the option and by the import to report it. Fixing it
separately would mean building the same thing twice. It gets its own regression
test at the level the bug lives at — the select's options for each actor kind —
sabotage-verified by restoring the unfiltered list, and the stale sentence in
`identity-leaves.tsx` is corrected in the same change rather than left to be
believed.

## What this does not do

- **No file upload or download of a page.** The text is copied and pasted.
  Adding a file picker would be the first thing in this app that reads a file
  from a person's machine, for no gain over the clipboard.
- **No import of part of a document.** Theme-without-tree and tree-without-theme
  are plausible wants, and they need an apply step to hang the choice on, which
  a live binding does not have. If they are wanted they are a second feature.
- **No sharing infrastructure.** No gallery, no links, no server-side store of
  shared pages. A document is text; where people put it is their business.
- **No syntax highlighting, and no editor dependency.**

## Files

| Path                                         | What                                        |
| -------------------------------------------- | ------------------------------------------- |
| `domain/page-document.ts`                    | The envelope, `toDocument`, `parseDocument` |
| `domain/page-reference.ts`                   | The generated reference                     |
| `application/use-page-source.ts`             | The live binding                            |
| `presentation/page-source-dock.tsx`          | The dock                                    |
| `presentation/editor-toolbar.tsx`            | The control that opens it                   |
| `presentation/fursona-editor.tsx`            | Wiring                                      |
| `shared/infrastructure/i18n/messages/*.json` | The dock's chrome, both languages           |
