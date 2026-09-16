# The pastiches were rebuilt against their captures, one task at a time (2026-08-29), and the `corners`/`radius: "square"` no-op above shipped in a brief a third time before it was caught.

- **The pastiches were rebuilt against their captures, one task at a time
  (2026-08-29), and the `corners`/`radius: "square"` no-op above shipped in a
  brief a third time before it was caught.** MySpace, hi5, Sonico, Facebook,
  Fotolog, Fur Affinity and GeoCities were each re-sampled from a real
  archived (or, for two, live) capture; `docs/superpowers/specs/2026-08-27-pastiche-findings.md`
  and this file's own pastiche entries above carry each page's account.
  **Fur Affinity gained the window-shape keys** — `heading: "bar"`,
  `heading_pad: "roomy"` and `radius: "square"` on its three named sections —
  confirmed from a _second_, newer arquivo.pt capture
  (`20191214070143`, December 2019) whose date does not match the page's own
  (2008, from a `web.archive.org` capture unreachable now): kept at 2008 and
  the mismatch stated in the comment, the same shape already recorded for
  Facebook's two captures above. (`heading_gap: "none"` was set alongside
  these too and removed in a later pass — the sections are already barred,
  which already welds the bar flush to its content with no key set at all;
  see the Task 10 fix below.) **GeoCities changed once, narrowly**: every
  section now carries `radius: "square"`, which nothing had set before —
  a 1998 personal homepage rounds nothing, where the default skin rounds at
  `--skin-round: 1`. Neither page took a `corners` key: a task brief asked for
  `corners: "tl,tr"` paired with `radius: "square"` a third time (after
  MySpace and the audit that followed it), and a third writer had to
  re-confirm the same no-op — `radius: "square"` already zeroes
  `--skin-round`, so `squareOffCorners` resolves every named corner through it
  to the same zero.

  **The last four had no capture of the right subject to rebuild against, and
  three of them barely moved (2026-08-29).** Messenger's measurements were
  already right — `#f8f8f8` over `#193c74`, from the Wikipedia 8.0 screenshot
  — and gained only the window shape: `radius: "soft"` with `corners:
"tl,tr"` on all three sections, and `heading: "bar"` on the first one, whose
  own name — "Aeleos (Available)" — is the literal text a real Messenger
  title bar carries, so the measured navy accent finally renders as a bar
  instead of sitting unused. `heading_corners: "tl,tr"` matches its own bar's
  corners to the section's. (`heading_gap: "none"` was set alongside it and
  removed in a later pass — the section is already barred, which already
  welds it flush to Aeleos's own info beneath it with no key at all; see the
  Task 10 fix below.) The board changed nothing at all: `chrome: "bare"` and
  a dark mode no crawler
  will ever see are both already right. Bluesky and Threads were re-measured
  live rather than re-derived — both confirmed unmoved, Threads across four
  readings with one transient outlier that read the CARD colour rather than
  the ground and did not reproduce. **A live reading that does not move is
  still worth dating**, so both comments now carry their own re-confirmation
  date rather than resting on the original one silently.

  **Threads' "Bio" label was a small stale decision, and the first fix for it
  was wrong too.** An earlier task filled its empty `title_en` with "Bio" to
  satisfy strict validation, matching board and sky — but this page's whole
  design is that nothing is labelled, and "Bio" is a field name no real
  Threads profile shows. The first replacement was "aeleos", reasoned from the
  `post()` idiom below it (a bold handle line over a paragraph) without
  reading what the SURROUNDING leaves actually render. **Review traced the
  real output and found it was worse than a label: the section is itself
  named "aeleos"; `NameLeaf` labels its own `title_en` — "Aeleos" — over
  `page.displayName`, which is "aeleos"; `HandleLeaf` labels ITS `title_en` —
  "aeleos" — over `page.handle`, "threads".** So "aeleos" was already three
  plain-text occurrences deep before the bio, and retitling it to the same
  word made four, stacked with no separation — a different visual context
  from the same word prefacing several separated posts in a feed. The bio is
  `title_en: "building in public"` / `description_en: "posting in private"`
  now: its own two clauses, split so `PlainLeaf` renders bold-then-plain — no
  invented word, no label, no repetition.

  **The grep that should have caught the stale "Bio" sentence two paragraphs
  above searched the wrong axis.** It searched `messenger`, `no capture`,
  `no archive` — terms for the TOPIC being worked on — and missed the one
  two paragraphs above this that names `Bio` as threads' title, which the
  retitle made false: it still read "`threads`' bio is titled 'Bio', matching
  the identical content on `board` and `sky`" after the bio no longer was.
  **Grep for the strings you edited, not the topic you worked on** — a stale
  sentence is falsified by what changed, not by what the change was about.

  **Task 10 closed the era looks (2026-08-29), and found the SAME no-op one
  level up from `corners`/`radius: "square"` — on `heading_gap`, not on the
  keys the brief warned about.** `era-win98` gained `heading_pad: "snug"` (a
  real change: `px-2 py-0.5` against the default `px-3 py-2`, sampled off
  `Windows98.png`'s own tight title-bar chrome) and deliberately did NOT gain
  `heading_gap: "none"`: a barred heading's gap already collapses to `gap-0`
  with no key set at all, so `"none"` there reads the identical class —
  `blocks.test.tsx`'s own heading-gap comment names this exact case ("would
  pass on a renderer that ignored the key entirely"). `era-winxp` was left
  alone for the same reason; its `corners`/`heading_corners` already express
  Luna's window shape from a prior commit on this same branch, which made the
  dispatched task's own premise that "`heading_corners` is unset on all five
  looks" stale before the task began. `era-vista` and `era-win7` kept plain
  headings — both captures show visibly translucent Aero glass, and a solid
  `bar` fill would have painted over the one thing the era is — and
  `era-win8` kept its plain heading too, though for a DIFFERENT reason than
  `heading_pad`'s genuine dead-letterness there: `heading_gap` is not gated
  to a bar the way `heading_pad` is, so `"none"` on a plain "Start" heading
  would have been a real, wrong weld, not the harmless no-op it is on an
  already-barred section.

  **The same no-op had already shipped 13 times, from the same author's own
  briefs, before this was caught (2026-08-29).** `heading_gap: "none"` sat on
  every `heading: "bar"`/`"gradient"` section MySpace, Messenger, hi5, Sonico
  and Fur Affinity's Tasks 5, 6, 8 and 9 added — enumerated through the real
  `PAGES` module rather than by pattern-matching text, which is what makes
  the count exact: 13 dead, 0 live. That contradicted two rulings already on
  the record for this exact principle — `heading_pad` stripped from
  Vista/7/8 above, and `corners: "tl,tr"` stripped from MySpace for pairing
  with `radius: "square"` — so all 13 came out, and the five stale comments
  that credited the key with "welding" a bar were corrected to say what
  actually welded it: the barred default, which was there regardless.
  **A survey is a claim about the day it ran**, and the day this one ran was
  before `blocks.tsx`'s own fallback had been read for what it does on a bar
  specifically, not only on a plain heading.

  **Task 11 re-derived both README tables and the findings document from the
  file rather than from memory, and found a SECOND instance of the exact
  failure this branch already paid for once.** The findings document's own
  "what landed, and what carried it" table — the one whose header already
  confesses that five of eleven rows went stale after a rebuild — had drifted
  again in the same direction: it still called MySpace's backdrop "tiled"
  after task 5 replaced it with a photograph, and named no window shape at all
  for hi5, Sonico, Messenger or Fur Affinity after tasks 6, 8 and 9 added one.
  A genuine self-contradiction sat twenty lines below its own correction too —
  "**Fotolog stays recalled**" survived after "Fotolog is genuinely PARTIAL,
  not knowledge-built" had already replaced that reading higher up the same
  document. Also corrected: Fur Affinity's two-capture pattern stated to match
  Facebook's (a December 2008 palette capture, unreachable now, plus a
  December 2019 chrome capture at a different archive); MySpace's stale
  "2007 profile" claim replaced with the October 2008 `arquivo.pt` capture and
  the portal-vs-page (43 real profiles) finding, which had reached this file
  but not the findings document itself; Bluesky and Threads' "no archive"
  framing sharpened to "archive history of the wrong subject" (a logged-out
  splash, a blank client-rendered replay); and gap 10 (the window shape) noted
  as closed for the social pastiches too, not only the era looks. A
  corrections banner naming six wrong plan instructions — each traced to the
  brief or dispatcher ruling that stated it, not reconstructed from memory —
  was added atop the plan rather than rewriting its body.

  **Task 12 closed the branch: all sixteen pages were seeded to production and
  photographed, the first time anyone had looked at any of them rendered
  rather than merely validated.** Every gate on this branch passes with a
  broken reference capture — the URL is a string and nothing fetches it at
  build time — so a look was the only way to find out. All sixteen reference
  captures loaded, none showed an archive-error placeholder, and every page
  read back as its subject. One new limitation came out of that look rather
  than a bug: **gap 15 in the pastiche findings**, arquivo.pt's screenshot
  endpoint returning a fixed canvas regardless of the archived page's real
  height, on four of the six pages it backs.

  **The photography method itself had a bug first, and it is the same
  instrument-versus-subject failure this file already names from the other
  direction.** Playwright's `fullPage: true` does not recompute layout for
  `background-attachment: fixed`, which the body's own gradient uses —
  Chromium keeps the original viewport for layout purposes during a
  full-page capture, so a fixed-attachment background stays anchored to
  that one rectangle rather than extending into the captured overflow. A
  dark-themed page taller than the viewport therefore photographed with a
  false white band below the fold, on the first pass. A normal scrolled
  screenshot, and one taken after resizing the viewport to the page's true
  `scrollHeight` before capturing, both show the gradient correctly the
  whole way down — proving no visitor ever sees it. The fix is to resize to
  `scrollHeight` before capturing, not to distrust the theme. Worth
  carrying past this branch: **picture proof on a pull request is required
  in this repository**, so anyone photographing a themed page will hit this
  exact artifact and can file it as a rendering bug that does not exist — an
  instrument reporting its own behaviour as the world's, the same shape as
  this file's warning never to sabotage a mechanism your instrument is
  built on.
