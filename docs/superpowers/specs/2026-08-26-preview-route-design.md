# The preview route — design

**Status: COMPLETE — implemented and verified 2026-08-26.**

The complete-page preview becomes an `<iframe>` of a real route at a named
device size. This is the mechanism
`2026-08-24-atmosphere-and-page-fidelity-design.md` deferred, and what follows
is the evidence that it is now earned rather than the tidier option.

## The fault this closes, measured

Photographing a real production page against its own live preview, section by
section:

```
FURSONA /es/137/cacao: 10 public sections, 10 preview sections
  section 0: 72.579% differing   box 1232x219  vs 1232x219
  section 4: 16.056% differing   box 1232x1003.71875 vs 1232x1003.71875
  section 8: 11.438% differing   box 1232x971.875 vs 1232x971.875
```

**Every box is identical to the sub-pixel, on all sixteen sections of both
pages.** The layout is right; the paint is not. What differs is one thing:
`body` carries the author's background picture with
`background-attachment: fixed`, identically on both sides, and `fixed` anchors
to the WINDOW. Which slice of the photo shows behind a section is therefore
decided by where that section sits on screen.

The controlling measurement is not the comparison at all. Taking one section,
in ONE document, and scrolling 120px:

```
SAME section, SAME box, window moved 340 -> 220
  differing: 71.21%
```

Seventy-one percent from scrolling a little, against seventy-two from
comparing the two documents. The two documents are not disagreeing about
anything. An inline preview sits part way down a long editor, so the author is
shown their content over the scree while a visitor arriving at the top of the
page sees it over the sky.

**Nothing inline can fix that**, because `fixed` means "track this window" and
the editor's window has the workbench in it. A second viewport is the only
mechanism.

## Why every existing check was green

Two independent reasons, both ours:

1. **No fixture ever set `backgroundUrl`.** `preview-fidelity.spec.ts` themes
   its page with a gradient. The picture layer was never present to differ.
2. **`quietTheWindow` would not have hidden one anyway.**
   `bodyBackgroundVars` emits `background-image: url(photo), var(--field)`;
   the helper flattens `--field`, which is the SECOND layer. A fixture with a
   photo would have kept it while the helper claimed to have quieted the
   backdrop.

That is rule 27 for the third time on this subject, and the first two fixes
made this one more visible rather than less: before them the preview painted
an opaque field over the photo entirely.

## Decisions

**It REPLACES the inline complete preview.** One complete preview, and it is
actually the page. A second renderer looks identical the day it is written and
drifts the first time either changes.

**The route is `/[locale]/me/preview`.** Not `/[locale]/preview`: the
addressing note is explicit that a static segment under `[locale]` permanently
reserves that word against the person-address namespace, and this feature is
not worth a vanity. `me` is already reserved and has no dynamic sibling.
`/pages/preview` would have cost nothing new either but would shadow a fursona
whose handle is `preview`.

**It is a blank shell.** It renders an empty document until a message arrives:
no auth read, no actor read, no visibility decision. Three consequences, and
the second is the reason:

- Nothing to leak. **Measured rather than reasoned:** a stranger opening the
  URL is redirected to sign-in before the document is ever built, because
  `proxy.ts` protects everything `isPublicRoute` does not name and this route
  is not named. That is stronger than the "empty page" this section first
  claimed, and the claim was corrected only because the route was driven — it
  had been written from the shape of the code.
- **No second place decides what may be shown.** `PublicProfile`'s own note
  forbids re-deriving visibility in a component; a route that server-rendered
  the saved page would be exactly that.
- If the channel ever fails, the preview is visibly EMPTY rather than
  silently showing saved content the author would read as their draft. Stale
  content presented as current is the failure this repository keeps paying
  for.

**The device size is named, and that is the honest framing rather than a
feature.** An iframe is exactly as faithful as its viewport matches a real
one, so there is no longer a "just render it correctly" answer — the preview
is always at SOME size. Filling the editor's width with an invented height
would be faithful-looking and quietly wrong in the same class as the fault
above: a viewport no visitor has.

Sizes are phone 390x844, tablet 768x1024, desktop 1280x900. The default is the
size whose WIDTH is nearest the author's own window width, so a phone editor
opens on phone. Wider than the space available, the iframe is `transform: scale()`d
DOWN to fit and never up — layout inside is still computed at the true
viewport, since a transform does not change the box the page believes it is
in, so what scales is only the pixels being looked at.

**The surround wears the author's own `--field`**, so the iframe's edges
disappear and it reads as one surface. A small label states the size, because
a narrowed page must never be mistaken for the author's own measure. No
border, no rounding, no shadow.

**The document inside is OPAQUE**, and a transparent one was asked for and
declined. Transparency would give `fixed` and `cover` nothing to anchor to,
which is the fault this exists to close.

## The channel

Parent to iframe, one post per animation frame, carrying exactly what
`CompletePagePreview` takes today: `{ blocks, theme, page, locale }`.

**The iframe posts `ready` on mount and the parent sends nothing before it.**
The parent must NOT post on the iframe's `load` event: `load` says the
document loaded, not that React has committed the effect registering the
handler. Rule 26 is that exact shape — an ordering argument whose premise
about what has already run is the thing that fails. A handshake from inside
does not rest on a guess.

Both directions check `event.origin === window.location.origin` AND
`event.source`, the posture `EmbedFrame` already established: origin alone
lets any same-origin frame drive this one, source alone lets any document
claim anything.

`frame-src` already carries `'self'`, so the policy needs no change —
confirmed by reading `csp.ts` rather than assumed.

**`frame-ancestors` did NOT, and driving it is the only reason that was found.**
It was `'none'`, so the browser refused the embed outright: the frame rendered
blank and the violation appeared in the console, where nothing asserts. It is
`'self'` now. Clickjacking is a CROSS-origin attack and `'self'` prevents every
one; what `'none'` bought over it was stopping our own pages from framing each
other, which is now something this app does on purpose.

## What is deleted

`PreviewThemeHost`'s `atmosphere` prop and its `document` mode, the
`:not([data-preview-atmosphere])` split in `previewThemeCss`, and the complete
preview's `atmosphereCss` mount. All of it shipped on 2026-08-25 and all of it
is dead once the preview is a real document with a real `ThemeScope`, a real
`body` and its own canvas.

Removing it rather than leaving it uncalled is deliberate: `COLUMN.full`
existed, was documented in three places, had no caller, and two headline
features shipped broken behind it.

`ThemeConfigurator` keeps its own atmosphere trigger, untouched — an author
dialling a canvas still needs the document to wear it. Section trays are
unchanged.

## Testing

**The fixture gap is closed first, before any of this is built**: a page whose
theme carries a `backgroundUrl`. Without it the new guard would pass for the
same reason the old one did.

The comparison gets stronger rather than merely moving: the two sides can now
be photographed at the SAME viewport, so the background picture must match
exactly rather than being excused.

`quietTheWindow` splits in two as a result. The CANVAS is still hidden on both
sides — it animates and is seeded per load, which is nondeterminism unrelated
to the preview. The FIELD is no longer flattened: it was flattened to excuse a
window-anchoring difference, and there is no longer one to excuse. A fixture
carrying a background picture must therefore match on the photo itself, which
is the assertion this whole document exists to make possible.

What was sabotage-verified, each watched red and restored:

- the `ready` handshake removed — the preview never receives its first payload;
- the device size ignored, so the frame fills the width;
- the scale allowed to exceed 1;
- the origin check and the source check, each removed alone, in
  `preview-document.test.tsx` — where each reddens ONLY the case covering it.

**The origin check cannot be caught by the browser suite, and that is reported
rather than counted.** Removing it leaves every pixel identical, because the
only document sending in that suite is the legitimate parent. A security check
is invisible to a test that never plays the attacker; the unit case is what
holds it, and pretending otherwise would be a total with a hole in it.

## What must not change

- `themeCss`, `ThemeScope`, and the public routes.
- `Block` and `PublicBlocks` remain the only renderers, at any fidelity.
- Drag geometry: the preview stays outside `DndContext`, and an iframe is
  further isolated rather than less.
- The save boundary, the schema, and every stored shape.

## Known costs, stated rather than buried

The preview boots a route on open and every keystroke crosses a document
boundary. Both were measured rather than called negligible, and one of them
corrected a comment in the implementation.

**Route boot, click to first paint inside the frame: 798 ms unthrottled and
7569 ms at a 6x CPU throttle**, on a six-section page. Nearly eight seconds on
a throttled phone is a real cost and is stated as one. It is paid once per
opening, not per edit, and the disclosure starts closed.

**Posts per keystroke: 1.000** — 52 keystrokes at 12ms apart produced 52 posts.
The coalescing BOUNDS a burst and does not reduce typing: CPU throttling slows
JavaScript and not the frame cadence, so only somebody typing faster than 16ms
per key is collapsed, and nobody does. The implementation's comment claimed
otherwise until this was measured. What the frame still buys is a ceiling that
a programmatic burst cannot exceed.

If the per-keystroke cost ever matters, the change is a debounce with a stated
latency rather than a smaller frame — a decision about how stale an author will
tolerate their preview being, which belongs in a design rather than in a
constant.

Embeds inside the preview mount a second copy, as the inline preview already
did.
