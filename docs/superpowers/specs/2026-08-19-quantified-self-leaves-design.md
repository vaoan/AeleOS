# Leaves that quantify somebody — radar, scales, and a grid

**Status:** designed, **not scheduled**. Recorded 2026-08-19 so the reasoning
survives until somebody picks it up.
**Follows:** `2026-08-18-sections-of-spaces-design.md`.

## What was asked for

A way to show something **quantifiable** about an actor — a fursona or a person
— as a chart rather than as prose. The question was whether an existing free
widget could be embedded, of the personality-test kind.

## Why nothing is embedded

**No third-party widget, and no paid service.** Two reasons, and the first is
already settled policy here.

Anything of that kind arrives as a script or an iframe nobody here controls.
Provider "plugins" are scripts that build iframes, so running one means
executing third-party code on pages that render **other people's content** — a
strictly larger surface than the sandbox it replaces. The embed table exists
precisely to avoid that: parse an address, match an exact host, rebuild the URL
from a fixed template.

And result pages of that kind are designed to be linked rather than embedded,
so the sizing problem the embed frames already have would arrive with them.

**No charting library either.** These shapes are twenty lines of path
arithmetic. A library would be larger, client-side, and would drag these
renderers out of being server components to draw a pentagon.

## The three kinds, and what each does that no other can

The repo's standing bar is that a kind earns its place by a **mechanism** none
of the others has, not by another set of numbers.

| kind      | the mechanism nothing else has                                                                                                                                                            |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **radar** | several **related** values as one shape. `progress` draws one proportion and `stat` states one number; neither can show that five traits belong together.                                 |
| **scale** | a marker between **two named poles** — introvert ↔ extrovert, feral ↔ anthro, chaotic ↔ lawful. `progress` runs 0→100 in one direction, so a midpoint means "half" rather than "neither". |
| **grid**  | **two axes at once**, one marker. The alignment square. Nothing else places a thing in two dimensions.                                                                                    |

`scale` is the most native of the three to what this product is for: how feral a
character is, or how nocturnal, is a position between two things rather than a
percentage of one.

## What they are, and are not

These draw numbers **somebody types about themselves**. There is no
verification and there should not be — it is a profile, not a credential. That
is also why no external test needs to be involved: the interesting artefact is
the shape on the page, not the instrument that produced it.

## If the test itself were ever wanted

Hosting a questionnaire rather than displaying its answer is a much larger
piece of work and a separate question. The open source for it is **IPIP** — the
International Personality Item Pool, whose items are public domain and underlie
most Big Five questionnaires. Noted so that the search does not start from
scratch; not a recommendation to build it.

## What this inherits when it is picked up

All three are leaf kinds in the existing model, so they inherit what every leaf
already has: a place in a section, a style bag, container-query sizing, and the
editor's per-kind fields. The work is the geometry, the editor fields for
naming axes and poles, and the accessible text — **a chart that only exists as
a shape is unreadable to a screen reader**, so each needs a real textual
equivalent rather than an `aria-label` restating the title.

Bipolar scales and the radar are worth doing first. The grid is charming and
narrower.
