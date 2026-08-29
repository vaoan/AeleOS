# Sixteen pastiches, rebuilt against their captures — 2026-08-29

**Status: design, approved to plan.** It covers the eleven social pastiche pages
in `scripts/seed-pastiches.mjs` and the five era looks in
`apps/hub/src/features/actors/domain/era-looks.ts`.

Two things are being asked for, and they are separable:

1. **Rebuild each page against a real capture**, using the whole style
   vocabulary rather than the part that existed when the page was written.
2. **Put the capture ON the page**, so a reader can see the thing being
   imitated beside the imitation.

## Why now, measured rather than argued

The pages were written between 2026-08-27 and 2026-08-28. Most of the keys that
draw mid-2000s window chrome landed after them. Counting occurrences across the
two sources:

| key               | eleven social pages | five era looks |
| ----------------- | ------------------: | -------------: |
| `corners`         |               **0** |              7 |
| `heading_corners` |               **0** |              3 |
| `heading_image`   |               **0** |          **0** |
| `heading_fit`     |               **0** |          **0** |
| `heading_gap`     |               **0** |          **0** |
| `radius`          |               **0** |              8 |
| `heading_pad`     |                   3 |          **0** |
| `surface`         |                  10 |              6 |

So the social pages use **none** of six keys, four of which — `corners`,
`heading_corners`, `heading_image`, `heading_gap` — exist precisely to draw a
title bar and a window edge, which is the dominant idiom of every page in that
set. This is not a claim that the pages are bad; it is that they were built
before the vocabulary caught up, and nothing has re-read them since.

`corners` in particular closed **gap 10** of the pastiche findings one commit
ago (`0a29104`), and it closed from the era-looks end. The eleven pages that
gap was originally written about have never been revisited.

## The evidence situation on 2026-08-29

Rule 25 applies to every row: this is a fact about the day it was probed, and
the probe is one `curl`. What would falsify it is a host changing state.

| source                         | reachable | notes                                                             |
| ------------------------------ | --------- | ----------------------------------------------------------------- |
| `web.archive.org`              | **no**    | curl, headless Chromium and Node fetch all time out; DNS resolves |
| `archive.org`                  | yes       | `/wayback/available` answers, returning `web.archive.org` URLs    |
| `arquivo.pt`                   | yes       | replay, CDX and the screenshot API all answer                     |
| `geocities.restorativland.org` | yes       | restored real personal pages                                      |
| `upload.wikimedia.org`         | yes       | curated screenshots, permanent CDN                                |

**`archive.org` answering is not the same as `web.archive.org` answering**, and
conflating them is what made the earlier framing wrong. The availability API
finds snapshots and hands back URLs on the host that does not respond, so a
snapshot can be located and not fetched. That is the shape of the whole
provenance problem: **the question is never "is the archive up", it is "which
source holds this subject".**

## The mechanism: a capture is a URL

`arquivo.pt/screenshot?url=<encoded replay URL>` renders an archived page and
returns a PNG. Pointed at `noFrame/replay/<ts>/<url>` rather than
`wayback/<ts>/<url>`, it returns the page **without the archive's own banner and
sidebar**, which is the difference between a usable reference picture and one
that is 40% Portuguese navigation.

This is the whole reason the second half of this design is buildable at all:
**it is a hot link, so nothing is stored**, which is what
`external-media-is-links-only` and the $0 budget both require. No bucket comes
back.

Three things were measured rather than reasoned, and one of them contradicts
the reasoning:

- **`img-src` already allows it.** `csp.ts:148` is
  `["'self'", "data:", "blob:", "https:"]` — any https host, deliberately, for
  exactly this class of pasted picture.
- **Chromium renders it despite `nosniff`.** The endpoint declares
  `application/octet-stream` and sets `X-Content-Type-Options` to `nosniff`,
  and reading the spec says that pair should stop an `<img>`
  rendering. It does not: driven in a real Chromium, `naturalWidth` is 1000 and
  the console is silent. `nosniff` blocks sniffing into `script` and `style`
  and does not block an image whose declared type is not some _other_ known
  type. **The reasoning was wrong and the measurement is the answer** — rule 10.
- **The rate limit is per visitor, not per us.** `X-RateLimit-Policy: 84;w=60`,
  `X-RateLimit-Scope: ip`, `Cache-Control: max-age=300, public`. Each visitor
  triggers at most one render per page per five minutes, from their own
  address.

### What it costs, stated rather than buried

A published page ends up depending on a research archive's rendering service.
If arquivo.pt goes down, sixteen pages show a broken picture. That is a real
dependency and this design accepts it, for two reasons: the alternative is
storing files, which is refused on budget; and **the section carries a `link`
leaf to the replay URL beside the picture**, so when the picture dies the
provenance does not. A reader can still reach the thing.

The replay itself may also embed the archive's own "Não conseguimos encontrar a
página" placeholder where a sub-resource is missing — visible in the MySpace
homepage capture. That is a property of the capture, not a fault to hide.

## Where each page's reference comes from

Measured by fetching each one. **Three of sixteen have no capture of the right
subject, and that is a finding rather than a gap to paper over.**

| page          | source                                    | state                                                        |
| ------------- | ----------------------------------------- | ------------------------------------------------------------ |
| `myspace`     | arquivo, `profile.myspace.com/akioyang`   | **a real customised profile**, Oct 2008 — the right subject  |
| `hi5`         | arquivo, `hi5.com` homepage, Feb 2008     | renders fully                                                |
| `sonico`      | arquivo, `sonico.com`, Oct 2008           | renders fully                                                |
| `fotolog`     | arquivo, `fotolog.com`, Feb 2008          | **partial** — stylesheet missing, content panels render      |
| `facebook`    | arquivo, `facebook.com`, Feb 2008         | **partial** — stylesheet missing, `#3b5998` confirmed        |
| `furaffinity` | arquivo, `furaffinity.net`, Dec 2019      | renders fully; **2019, not the 2008 the page is dated to**   |
| `geocities`   | `geocities.restorativland.org`            | real personal pages; the portal was always the wrong subject |
| `messenger`   | Wikipedia, Messenger 8.0                  | a desktop application — a screenshot, never an archived page |
| `board`       | **none, and none can exist**              | a crawler arrives logged out and is served the light page    |
| `sky`         | **none of the right subject**             | the replay is the logged-out splash; measured live instead   |
| `threads`     | **none — renders blank**                  | an SPA the archive captured nothing renderable of            |
| `era-win98`   | Wikipedia, `Windows98.png`                | 640×480                                                      |
| `era-winxp`   | Wikipedia, `Windows XP Luna.png`          | 640×480 — Luna by name, which is the subject exactly         |
| `era-vista`   | Wikipedia, `Windows Vista.png`            | 640×480                                                      |
| `era-win7`    | Wikipedia, `Windows 7 SP1 screenshot.png` | 640×480                                                      |
| `era-win8`    | Wikipedia, `Windows 8 Start Screen.png`   | 683×384 — the Metro start screen, the subject exactly        |

Two rows sharpen the findings document rather than overturning it.

**Fotolog is neither knowledge-built nor evidence-backed**, and the existing
note is right as far as it goes: the nav does replay unstyled, raw bullet lists
at the browser's own blue. What it misses is that the page's content panels are
table-and-inline-styled and therefore **do** render. So the capture is partial
evidence — good for density and arrangement, none at all for anything the
stylesheet governed. The caveat is the honest label; neither of the two
existing ones is.

**Bluesky and Threads have archive history, and it is not of the right
subject.** They were written up as having none. Bluesky replays as the
logged-out splash and Threads replays blank, because a crawler stores markup
and both pages are built after it. That is a sharper claim than "there is no
archive", and it is the one that tells the next person not to look again.

Two rows are honest about a mismatch rather than quiet about it. Fur Affinity's
capture is 2019 and the page is dated 2008; FA kept its classic layout across
that span, so it is good evidence for the chrome and **not** for the date.
Facebook and Fotolog replay without their stylesheets, so anything the
stylesheet governed cannot be read off them.

## The inspiration section

Each page gains one section at its **foot**, named "The inspiration" /
"La inspiración", holding:

- a `picture` leaf carrying the capture, where one exists;
- a `link` leaf to the replay or file page, so the provenance outlives the
  picture;
- a `text` leaf naming the source, the capture date, and any mismatch — the
  2019/2008 gap on Fur Affinity, the missing stylesheet on Facebook and
  Fotolog.

Foot rather than head, so the first thing a visitor meets is still the
imitation.

**Where there is no capture, the section still exists and states why.** The
board, Bluesky and Threads each get the prose and the link with no picture.
This is the rule that keeps the feature honest: **every page carries either a
capture or a stated reason there can be none**, so the section is never empty
and never fabricated. A light-mode Twitter capture presented as the reference
for a dark-mode board would be worse than nothing.

### The one structural decision: the seeder owns it, never `ERA_LOOKS`

`ERA_LOOKS` is spread into `TEMPLATES` at `fursona-templates.ts:363` — the five
looks **are** the picker's templates. An inspiration section added there would
land on the page of every author who picks "Windows XP", carrying a screenshot
of somebody else's operating system into their own fursona's page.

So the section is appended **by `scripts/seed-pastiches.mjs`**, to both sets,
and no template carries one. That also keeps the two sets consistent — the
eleven social pages have no template to be confused with — and keeps
`era-looks.generated.json` a faithful copy of what the picker offers, which is
the entire reason `era-looks-json.test.ts` exists.

## Two rulings that will recur

**Fidelity loses to purpose when fidelity would delete the page's subject, and
the loss is stated.** This is the Messenger precedent: its capture is near-white
panels over blue chrome, the panels went to the measurement and the blue field
deliberately did not, because `aero` is the whole reason that page exists and
glass needs something behind it. Expect more of these — every page that wears a
skin for its own sake has the same tension. The requirement is not that
fidelity wins; it is that **which won is written on the page's own comment**,
not silently resolved.

**A pastiche aims at the era, not at the product as shipped.** MySpace is the
customised profile — a photo behind everything, boxes gone semi-transparent,
text fighting the image — and not the default white-box chrome, because what
that site was is what people did to it, and the page's own copy already says so
("this layout took me four hours and i am NOT taking it down"). Where a product
allowed no customisation — Facebook, Threads, Bluesky, the board — the product
as shipped **is** the era, and this ruling changes nothing.

## What must not change

- **Nothing is stored.** Every picture, capture and avatar is a hot link.
- **The seeder owns everything the pages depend on** — visibility, avatar, and
  now the inspiration section. A seed that does not restore everything it
  depends on works exactly once.
- **Colour stays page-level.** Per-block colour is refused by design and this
  design does not reopen it; `surface` is per page and is the key that closed
  the panel-versus-ground complaint.
- **The eleven remain `public` fursonas of `/137`**, and the five era looks
  with them.
- **No new skin, no new mode, no new leaf kind.** If a page cannot be reached
  with the current vocabulary, that is a finding for the findings document —
  the same bar that removed `columns`.

## How it is verified

Most of this is **data**, and data has no compiler. Being honest about that
decides the testing:

- **`era-looks-json.test.ts` already gates the generated artefact**, and it
  keeps working unchanged, because nothing is being added to `ERA_LOOKS`.
- **The summary tables get a mechanical check.** Root rule 30 was paid for here
  already: five of eleven rows in the findings document's "what landed" table
  were false, because the table described the pages as they had been. Any table
  in `README.md` or the findings that names a page's skin, mode, canvas or
  measure is a claim about `seed-pastiches.mjs`, and the plan re-derives it
  from the file with a script rather than by reading.
- **The pictures are the gate.** Each page is photographed after seeding and
  **read back** as a separate pass — walking the whole frame, not the claim —
  per the standing rule. A page whose capture failed to load is exactly the
  kind of thing only that pass catches.
- **The seeder is re-run from `main`, never from the branch**, after rebase.

## Risks

- **The screenshot service is a third-party dependency inside a published
  page.** Mitigated by the `link` leaf, not eliminated.
- **A capture URL is long**, and `background_url`/`image_url` cap at 500
  characters. Measured across the six archive-backed pages, the longest encoded
  URL is **140** — `myspace`, whose replay target carries a username. There is
  room, and the number is measured rather than estimated, because the first
  draft of this line guessed "about 120" and was wrong by a sixth.
- **Re-seeding from the wrong tree silently loses work**, which has happened
  here twice. The plan seeds from `main` after rebase.
