# What the block model CANNOT be pushed toward is written down, and it was found by trying.

- **What the block model CANNOT be pushed toward is written down, and it was
  found by trying.** `scripts/seed-pastiches.mjs` builds **eleven** pages aiming
  at eleven eras of somebody else's social network — the arrangement and
  palette, plus the site's own mark as the profile AVATAR and nothing else of
  theirs — because a pastiche fails visibly and in a way you can
  name, where "the editor feels limited" is not actionable. Findings:
  `docs/superpowers/specs/2026-08-27-pastiche-findings.md`, and the README's own
  showcase table links every page with what each one proves. Read the findings
  before designing a style key, and note the things in them that LOOKED like
  faults and are not.

  **Eight were rebuilt from real archived captures and three were not.** Fur
  Affinity, Fotolog and Facebook were built from knowledge, because
  web.archive.org would not answer and Fur Affinity refuses an unauthenticated
  fetch. That distinction is written into the findings, the README and the
  seeder itself rather than left implicit, because the eight and the three are
  not the same evidence and a reader cannot tell them apart by looking.

  **ARCHIVE.ORG ANSWERS AGAIN (2026-08-28), and that sentence was a dated claim
  believed past its date.** Probed directly: the availability API returns a
  2008 snapshot for every one of the three. Two of them are now evidence-backed
  — a real 2008 Fur Affinity capture and a real 2007 Facebook one — and the FA
  page was measurably wrong as a result: built from knowledge it had a
  near-black ground and saturated teal header bars, where the capture shows a
  slate BLUE-GREY ground and light silver bars carrying DARK text. Fotolog
  stays knowledge-built, because its snapshots render the logged-out homepage
  with broken styling rather than a profile.

  The general lesson is rule 25 with a different subject: **a claim about what
  an external service will do is dated the moment it is written**, and this one
  was load-bearing — it is the reason three pages were built from recall. Re-probe
  before believing it; the probe is one `curl` against
  `archive.org/wayback/available`.

  **Fotolog no longer "stays knowledge-built" (task 7, 2026-08-29).** A fresh
  render of Fotolog's own `20080215112915` capture shows the nav replaying
  without its stylesheet — raw links in the browser's own default blue — but
  the boxed panels underneath ARE table-and-inline styled and DO render, so
  its arrangement and density are measured (a `#f0f0f0` panel on a flat white
  field) while its accent stays recalled. That is a third label, PARTIAL, not
  a stronger reading of "knowledge-built".

  **There are TWO Facebook captures, not one, and a fix note is what it took
  to stop conflating them (2026-08-29).** Task 7 read "a real 2007 Facebook
  one" above beside a _different_ capture it had just fetched — arquivo.pt at
  February 2008, `20080215125110`, from `scripts/pastiche-references.mjs`
  (added on this branch) — and concluded the 2007 date was simply wrong.
  It was not: "2007" names the **web.archive.org** capture this section is
  about, confirmed on 2026-08-28 while that archive was answering; it is
  unreachable from this machine now, which is why nothing on this branch
  could re-verify it rather than why it was wrong. "February 2008" names a
  separate arquivo.pt capture, fetched _because_ web.archive.org does not
  answer here and arquivo has nothing earlier. Both dates are real and
  describe different things. The check that would have caught this the first
  time is `git log -S "March 2007"` — find where a claim about an external
  source _entered_ before deciding a different reading of a different source
  makes it false. See
  `docs/superpowers/specs/2026-08-27-pastiche-findings.md` for the full
  account of both captures.

  **Gap 12 is closed (2026-08-28) and the way it was nearly closed WRONG is
  the part worth carrying.** The 2007 Facebook capture is a navy bar over a
  lighter blue one, which one accent could not draw; `heading: "soft"` is a
  second, DERIVED tone. The obvious derivation — move the accent a fraction of
  the way toward the panel — is what anybody writes first, and it collapses on
  exactly the page the gap exists for: a dark page's panel is dark too, so a
  navy accent's tone landed within 1.2 of the accent and the second bar WAS the
  first one. It steps in LIGHTNESS toward whichever extreme has room instead,
  which is the rule `--on-accent` already uses to pick a label. **The
  discriminating fixture is a mid-grey accent**, because that is the colour
  with the least room to travel and therefore the first place a derivation that
  barely moves stops being visible.

  A fixture trap came with it, and it is rule 27 landing on a STRING rather
  than on a page shape: `bg-(--accent)` is a prefix of `bg-(--accent-soft)`, so
  a `toContain` on the class list passes both on a renderer that ignores the
  new value and on one that paints every bar with it. The cases split on
  whitespace and compare whole tokens. **Where one name is a prefix of another,
  a substring assertion cannot discriminate in either direction.**

  **A SUMMARY TABLE of what each page uses is root rule 30 in its purest form,
  and five of eleven rows were false (2026-08-28).** The findings document's
  "what landed, and what carried it" table named `retro` on MySpace, `candy`
  and `sticker` on hi5, `glass` on Sonico, `terminal` on GeoCities and
  `timeline` on the microblog board. **Not one of those five is in the file** —
  nine of the eleven pages are `skin: "default"` throughout and the board is a
  `list`. Nothing was broken: the rebuild against real captures took the
  decorative skins off _because the real sites were plain_, which is the pass
  working, and the table went on describing the pages as they had been.

  Two seeder headers had drifted the same way and each contradicted a note a
  few lines below it — hi5's said "Loud, yellow" directly above "hi5 was BLUE,
  not yellow", and claimed an orange "survives only as the accent" over an
  accent that is `#4a7ebb`; the board's said "`timeline` is the mode this
  exists to test" over a page that uses `list`, the mode that did not exist
  when the header was written.

  **The check is mechanical and nothing runs it: re-derive the table from the
  file.** A row naming a skin, a mode or a canvas is a claim about
  `seed-pastiches.mjs`, and `check:docs` cannot see it because no TypeScript
  symbol moved. Twenty lines of regex over the seeder answered all eleven rows
  at once — which is the general form worth keeping: **when a document
  summarises what another file contains, extract the summary rather than
  reading it.** It is faster than checking one claim by hand and it cannot
  agree with a sentence out of politeness.

  **A page whose subject is STILL RUNNING needs no archive, and that took a
  day to notice (2026-08-29).** The provenance gap had been framed entirely as
  an archive problem — `web.archive.org` unreachable, six pages unverifiable —
  and two of the six were never archive problems at all. Bluesky and Threads
  are live sites; `getComputedStyle` on the real page is stronger evidence than
  any capture, because it is a measurement rather than a photograph. Both
  moved when checked.

  Three things that generalise, each measured:

  - **A brand colour is not a measurement of a page.** Bluesky's accent is the
    `#0085ff` everybody quotes, and the application paints `#006aff` — read off
    the Follow button's own background. The official value and the rendered one
    are different claims and only one of them is about pixels.
  - **A live measurement carries the PROBER's environment into the result.**
    Threads served `#fafafa` to a probe with no colour-scheme preference; the
    page being imitated is the black one, so `colorScheme: "dark"` is what made
    the reading mean anything. State the environment or the number is unowned.
  - **A live site is evidence about TODAY, and today is not always the era
    being imitated.** Threads has since moved its profile into a rounded card
    on a grey field; the pastiche stays the 2023 edge-to-edge one it is dated
    to. This is the one way a running site is HARDER than a capture — a capture
    carries its date and a live page does not.

  **The last four were chased down on 2026-08-29, and the framing had been
  wrong the whole time.** "Six pages have no provenance and the archive is
  down" is one problem with one blocked source; it was four different problems.
  Two were live sites. One — **Windows Live Messenger — is a DESKTOP
  APPLICATION**, so a capture of it is a SCREENSHOT rather than an archived
  page, and `web.archive.org` was never the right place to look for it;
  Wikipedia had version 8.0, the exact release the page is dated to, and
  sampling it found the page measurably wrong in the same way Fur Affinity had
  been. Only the last two genuinely had nothing.

  **Searching and finding nothing is a FINISHED answer, not a deferred one**,
  and it is the half that gets skipped. Sonico has a logo and no screenshot on
  three separate wikis; the only GeoCities file is a 2009 Yahoo-era page, a
  different product wearing the same name. Those two are recalled and now SAY
  so — which is the difference between "we do not know" and "we looked, and
  there is nothing to know." A gap closes when every entry has an answer, not
  when every entry has evidence.

  **A palette can be evidence about a DATE.** The microblog board carries
  `#15202b` and `#1d9bf0` — recognisably Twitter's dark mode from about 2019 —
  while it was filed under 2012, which was a light page with a paler blue. The
  page was coherent and its label was not, so the label moved. Restyling it
  would have been the wrong repair: a pastiche of a real era is worth more than
  a pastiche of a date somebody typed.

  **And where fidelity and PURPOSE conflict, say which won.** The Messenger
  capture is near-white panels over blue chrome, and this page had it the other
  way round; the panels went to the measurement and the field deliberately did
  not, because `aero` is the whole reason that page exists and glass needs
  something behind it to show through. A correction that deletes the thing the
  page is a test of is not a correction.

  **`web.archive.org` HAD BEEN STANDING IN FOR "THE ARCHIVE", and that was the
  real mistake (2026-08-29).** With one host unreachable the provenance
  question looked closed; it was not, and two of the four pages were settled by
  going elsewhere. `arquivo.pt` — the Portuguese national web archive — replays
  Sonico at October 2008 with its stylesheet intact, which found the accent
  measurably wrong; `geocities.restorativland.org`, a fan-restored gallery of
  real archived personal pages, gave five GeoCities homepages that confirmed
  that page's design rather than changing it.

  **Ask what the SUBJECT is before asking which archive has it.** The four
  needed four different kinds of source, and naming the subject is what picks
  the source: a desktop application wants a SCREENSHOT (Messenger, from
  Wikipedia); a personal homepage wants a page archive rather than a PORTAL
  capture (`geocities.com` is the portal, and nobody's page); a defunct site
  wants an archive that is not the famous one; and a logged-in dark mode wants
  something **no crawler has ever seen** — a crawler arrives logged out and is
  served the light page, so no archive anywhere holds the board's palette, and
  that is a property rather than a gap in coverage.

  **A second archive can also CORROBORATE a negative.** Fotolog renders
  unstyled at `arquivo.pt` exactly as it does at the other — 126 links at the
  browser's own `#0000ee`, raw bullet lists — so "its captures do not render"
  is now two independent observations rather than one claim.

  **And "unreachable" is a claim about a host, not a network, until three
  clients agree.** `web.archive.org` fails from `curl` (~21s), from headless
  Chromium (`ERR_CONNECTION_TIMED_OUT`) and from the agent's own fetcher (which
  refuses the domain outright) — while `archive.org` answers 200 and
  `archive.ph` answers 429 in the same run. One hostname, not the connection.

  **A CAPTURE IS A HOT LINK, and that reopens what a pastiche page can show
  (2026-08-29).** `arquivo.pt/screenshot?url=<encoded replay URL>` renders an
  archived page and returns a PNG. Pointed at `noFrame/replay/<ts>/<url>`
  rather than `wayback/<ts>/<url>` it omits the archive's own banner and
  sidebar — the difference between a usable reference picture and one that is
  40% Portuguese navigation. So a reference can sit ON a page under the
  images-are-links-only rule, with nothing stored and no budget touched.

  Two things about it were measured rather than reasoned, and the second
  contradicts the reasoning. `img-src` already allows any https host. And
  **Chromium renders that response despite `nosniff`**: it is served as
  `application/octet-stream` with `X-Content-Type-Options: nosniff`, which
  reading the spec says should stop an `<img>` — driven in a real browser,
  `naturalWidth` is 1000 and the console is silent. Rule 10, on a header this
  time.

  What it costs is a published page depending on a research archive's
  rendering service, so **the section carries a `link` to the replay beside
  the picture**: when the picture dies the provenance does not.

  **`archive.org` ANSWERING IS NOT `web.archive.org` ANSWERING**, and
  conflating the two is what shaped the whole provenance story above. The
  availability API answers for every subject and hands back URLs on the host
  that does not respond — so a snapshot is findable and not fetchable, which
  looks like evidence right up until you try to open it. The question is never
  "is the archive up", it is **"which source holds this subject"**.

  **A PORTAL capture is not a PAGE capture — and that lesson, already learned
  for GeoCities, had been missed for MySpace the whole time.** `myspace.com`
  is the portal; `profile.myspace.com/<user>` is somebody's profile, and
  arquivo holds **43** of them. A real October 2008 one is a photo behind
  everything, boxes gone semi-transparent with thin bright borders, and text
  fighting the image — which is what that site WAS. **Ask what the subject is,
  then ask which URL is it**, because the site's own domain is usually
  neither.

  **The MySpace pastiche was built from the default white-box chrome instead
  of that subject, and this is the one place that was still true after it —
  closed 2026-08-29.** `myspaceTheme` now carries `profile.myspace.com/akioyang`
  at `20081024054301` as its own subject: a photograph background, `border:
"solid"` with `radius: "square"` on every section for the thin
  square-cornered edge the capture has in place of the old rounded default,
  and a `surface` sampled from the capture's own boxes. `heading_gap` was set
  here too, on the belief that it welded each bar flush to its content —
  removed in a later pass once `blocks.tsx` was read closely enough to show
  the barred default already does that with no key set at all (see the Task
  10 fix below). **What did not come along is the translucency itself**: a
  block's fill is one opaque colour with no alpha channel, so the sampled
  tone stands in for the photograph showing through rather than being it —
  recorded as gap 13 in the pastiche findings rather than approximated past.

  **The first sampled surface made the page unreadable, and nothing in the
  build would have said so — closed in review, same day.** Averaging five
  patches of a translucent box blended with a photograph landed on
  `#555a6a`, OKLCH `L≈0.4691` — almost exactly mid-lightness, which is the
  one region `derivePalette` cannot serve text in either direction. Measured:
  ink read 2.86:1 against it, muted 3.06:1, edge 3.01:1, against floors of
  4.5, 4.5 and 3.0 — the same "no direction clears the minimum" hole this
  file already documents for `#008080`. The fix is `surface: "#737989"`, the
  nearest colour to the sample along the same lightness axis that clears
  4.5:1 both ways (found by sweeping, not guessing: darker does not recover
  legibility until `ΔL≈-0.28`, where the solved ink flips from dark to
  light text; lighter needs only `ΔL≈+0.11`). **`pnpm check:contrast` never
  caught this and structurally cannot**: it measures `globals.css`'s own
  fixed token pairs and never reads a stored theme, so an author's `surface`
  can sit on the one lightness a palette cannot serve and every gate stays
  green. Recorded as gap 14 in the pastiche findings, separate from gap 13 —
  naming the hole rather than proposing a general checker.

  **`corners` was tried alongside `radius: "square"` and removed.** A key
  named in the brief turned out to be a no-op there: `radius: "square"` drives
  `--skin-round` to `0`, and every corner `corners` names computes as a
  multiple of that same token — so a "rounded" corner and a square one are
  the identical `0`. `corners` says WHERE and `radius` says HOW MUCH, and
  where is meaningless once how-much is zero everywhere. A key that changes
  nothing is a dead letter that reads like a change in the diff, so it is
  absent from this page rather than decorative on it — its first real use
  belonged to a page that wants the window shape it actually draws: a bar
  rounded across its top over a body square at its foot, which needs
  `radius: "soft"` to mean anything.

  **That page arrived the same day — hi5 and Sonico (2026-08-29).** Every
  section on both now carries `radius: "soft"` with `corners: "tl,tr"` and
  `heading_pad: "snug"`: the bar rounds across its top, the body squares off
  at its foot. (`heading_gap: "none"` was set alongside these too and removed
  in a later pass — both are `heading: "bar"` or `heading: "gradient"`,
  already barred, and a barred heading's gap already collapses with no key
  set at all; see the Task 10 fix below.) Which of the two keeps `heading:
"gradient"` was decided from a fresh sample of each capture rather than
  copied from the other — hi5's SIGN IN / SEARCH IN YOUR CITY / POPULAR
  VIDEOS bars read a real vertical sheen pixel by pixel (`#6d95b3` →
  `#80a0c8` → `#5481b6`), so it keeps `"gradient"`; Sonico's top nav
  (`#3366cc`) and footer (`#003399`) read flat at every scanline sampled, so
  it moves to `"bar"`. Sonico's `accent`/`surface` were re-sampled and held.

  **And hi5's own comment carried a wrong date, which is the same fault this
  file warns about under "Squash the migrations" and elsewhere: a confident
  sentence outliving the value that falsifies it.** It said "a 2007 capture";
  the timestamp actually fetched (`20080215082853`) is **February 2008**. The
  same wrong year was repeated in the README's evidence list and in the
  pastiche findings doc — fixed there too, because a wrong date left standing
  in two more places is not a smaller problem than the one in the seeder.

  **Three places corrected is where you check for a fourth, and there were
  two more — both inside `pastiche-pages.mjs` itself.** Review found the
  MySpace paragraph two entries up still read "belongs to" — future tense,
  even though hi5 and Sonico fulfil the prediction later in the very same
  file and commit — and found the boilerplate "No animation at all, which is
  what a flat 2007 page had" sentence surviving unchanged inside BOTH
  `hi5Theme` and `sonicoTheme`, six lines below the new date-correction
  comment in hi5's case and simply false in Sonico's, whose capture is
  October 2008 and which was already dated 2008 everywhere else. **The
  easiest place to miss a stale copy is the file you are actively editing**,
  because you are reading it for the change you meant to make, not grepping
  it for every other sentence the change might have made false. All four are
  fixed now: "belongs" → "belonged" with hi5 and Sonico named, and each
  boilerplate sentence carries its own page's real year.

  **An SPA replays as nothing, so "no archive" and "an archive of the wrong
  subject" are different claims.** Bluesky and Threads were written up as
  having no archive at all; both have years of captures. Bluesky's replays as
  the logged-out splash and Threads' replays **blank**, because a crawler
  stores markup and these pages are built after it. Only the sharper statement
  is true, and it is the one that tells the next person not to look again.

  **Fotolog is sharper too, in the other direction.** "Its captures do not
  render" holds for the nav — raw bullet lists, browser-default blue — and the
  page's table-and-inline-styled content panels DO render. So it is partial
  evidence: good for density and arrangement, none at all for anything the
  stylesheet governed. Neither "knowledge-built" nor "evidence-backed" is the
  right label, which is why it now carries the caveat instead of a label.

  **`ERA_LOOKS` ARE THE PICKER'S TEMPLATES, so nothing decorative may be added
  to them.** They are spread into `TEMPLATES` in `fursona-templates.ts`, which
  means anything put there lands on the page of every author who picks that
  look — a reference screenshot of somebody else's operating system included.
  Whatever a showcase page needs beyond the look itself is appended by
  `scripts/seed-pastiches.mjs`, which is also the only place the two sets can
  be kept consistent.

  **The seeder owns everything the pages depend on**, and that was learned the
  hard way twice in one session: the avatars had been set by hand outside it,
  so a re-run left the newest pages with an empty circle; and it went on
  writing `unlisted` after the pages had been made public by hand, silently
  undoing that on every run. **A seed that does not restore everything it
  depends on works exactly once.**

  **AND THE SEEDER BYPASSES `set_actor_sections` ENTIRELY, which nothing said
  out loud until 2026-08-29.** It writes `actor_profiles` with direct SQL, so
  the depth cap, the style-bag allowlist and the required-kind rule — every
  database-level guard the product has — are simply not applied to a seeded
  page. A seeded page can therefore be a shape the editor would refuse and a
  save would reject, and it will render anyway.

  So **the sixteen showcase pages had no validation of any kind**: not the
  database's, because it is bypassed, and not a test's, because
  `seed-pastiches.mjs` reads `SUPABASE_DB_PASSWORD` and calls `process.exit`
  at module top level and then `client.connect()`, so it cannot be imported at
  all — the only way to find out whether a page was valid was to write it to
  production and look. That is why the page definitions now live in
  `scripts/pastiche-pages.mjs`, the module the seeder imports — named here in
  the commit before that module existed, which is worth marking, since a note
  that runs ahead of its code reads exactly like one that has fallen behind
  it: **a thing that cannot be imported cannot be checked**, and moving it is
  usually cheaper than whatever the alternative gate would have been.

  **The gate landed and immediately paid for itself, same day.**
  `apps/hub/tests/pastiche-pages.test.ts` pushes all sixteen pages through the
  real `parseTheme`, `blocksSchema` and a walk against `REQUIRED_KINDS` — the
  three checks `set_actor_sections` would have made, reassembled outside the
  database because the seeder still cannot be imported. It found real defects
  on its first run, six of the sixteen pages, all the exact shape this note
  predicted: `board` and `geocities` had `speed: 0.2`, below
  `CANVAS_RANGE.min` of `0.25`, silently raised to it on every read rather than
  refused; `threads` and `geocities` each had an empty `title_en` on an
  otherwise-unlabelled text leaf, which the strict schema refuses outright;
  and `furaffinity`, `fotolog` and `facebook` were each missing at least one
  required kind — `owner` on all three, `avatar` on `fotolog` too, `handle` on
  `facebook` too. Every one had been rendering anyway, because nothing had
  ever asked. All seven are fixed now, minimally and idiomatically rather than
  restyled — an `owner` leaf appended to each page's own final section,
  `avatar`/`handle` added to the identity block at the top the same way every
  other page already does it, the two speeds raised to the floor, and the two
  empty titles given real text (`threads`' bio was titled "Bio", matching
  `board` and `sky`; `geocities` gained "NOTICE" over its
  visitor-counter-and-browser-notice text). The restyle itself is still each
  page's own later task — **and `threads`' own restyle later replaced "Bio"
  with its own text, so it no longer matches `board` and `sky`, which still
  carry the word.**

  **And it is rule 29 again, on the SABOTAGE rather than the page.** The first
  attempt to sabotage-verify the theme case matched `skin: "default"` inside
  the shared `theme()` factory's own default literal — the one every page
  overrides via its own `...over` spread — rather than inside `myspaceTheme`
  itself. The substitution landed and grep confirmed it, and the suite came
  back reporting the same 7 pre-existing failures it already had: a sabotage
  that applied and changed nothing observable, which reads exactly like a
  successful verification unless the failure COUNT is checked rather than the
  presence of the edit. Redone against the theme object's own line, it
  reddened exactly the one case it should and none of the other two.

  **A page can now show what it is imitating (2026-08-29), and "three" and
  "four" are both true statements about it.** `scripts/pastiche-references.mjs`
  is the registry — one entry per handle, each a hot link and never a stored
  file — and `inspirationSection` turns an entry into an appendix section, no
  colour or chrome of its own. **It is appended now**, in both of
  `seed-pastiches.mjs`'s loops, onto a local copy of each page's `blocks` —
  never stored in `PAGES` or `ERA_LOOKS` themselves, for the same reason
  those two arrays carry nothing decorative already: `ERA_LOOKS` is spread
  into the picker's own `TEMPLATES`, so a section stored there would land on
  the page of every author who picks that look.
  `absent` means "this page carries no picture," and it covers two different
  reasons rather than one. `board`, `sky` and `threads` are three where no
  archive can hold the SUBJECT — a crawler never sees the dark mode, the
  signed-in profile, or the client-rendered markup — matching the design
  spec's "three of sixteen have no capture of the right subject." `geocities`
  is a fourth, for a different reason, and it is not a counterexample to that
  sentence: `geocities.restorativland.org` **is** evidence of the right
  subject, a restored gallery of real archived personal pages. What it lacks
  is a single capture, because the subject was never one page. A reader who
  counts four `absent` entries against a spec that says three should read
  both as true rather than go looking for the bug that reconciles them.

  Two dated operational facts about sources a published page now hot-links at
  render time, measured 2026-08-29 and worth re-checking past that date
  rather than trusted: `arquivo.pt`'s screenshot endpoint connect-times-out
  (10s) on a request fired immediately after another to the same host, and
  the identical URL succeeds once spaced a few seconds apart or retried;
  `upload.wikimedia.org` answered `429` to two rapid requests and `200`
  moments later. Neither is a bad URL — both are load on somebody else's
  server, not a wrong timestamp — so a script that resolves several of these
  in a tight loop should expect a failure a respaced retry clears, and should
  not read one as evidence the reference itself is wrong.
