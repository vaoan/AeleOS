# Section personality — embeds, per-section form, and an editor that admits what it governs

**Status:** design, approved 2026-08-15.
**Supersedes nothing.** Extends `2026-08-13-fursona-studio-port-design.md` and the
per-profile theming recorded in `apps/hub/src/features/actors/CLAUDE.md`.

## What this is for

A fursona page is somebody's character. The layouts shipped so far give it
structure; this gives it **personality** — the thing MySpace, Sonico and Hi5 had
and that every profile builder since has sanded off. Three moves:

1. **Embed what people actually use.** Seventeen providers instead of four, so a
   page can play the things its owner made or loves.
2. **Let each section carry its own form.** A skin, a background picture and a
   card size, per section, so a page is not one uniform texture top to bottom.
3. **Fix the editor's geography** so the controls sit beside what they govern.

Colour is deliberately **not** in scope per section. The page's palette stays the
page's, chosen once in the theme configurator. That line is not an omission — it
is the same split `skins.ts` already rests on: **a skin names no colour of its
own.** Form is individual; colour is the page.

## Decisions taken before the design, and their reasons

### No server-side fetch. Ever, for this feature.

The hub makes no outbound request to a third party today, and this feature does
not introduce one. If a service publishes an embeddable address we build it from
a URL; if it does not, the link becomes a chip. No scraping, no manufactured
preview cards, no OpenGraph cache table.

The engineering reason is that a fetch triggered by a stranger's URL, on a page
anybody can load, is an open proxy unless it refuses private addresses and
redirect chains, and it needs a cache or it hammers other people's servers on
every page view.

The **platform** reason is stronger and is the one to keep: a scraped preview
stored in our database is us hosting somebody else's content, which is the
decision the Supabase Storage bucket already lost on. See "Images are links, and
nothing is stored" in the root `CLAUDE.md`. This is that rule, worn by a
different feature.

**Cost, stated plainly:** Bandcamp is lost. Its player needs a numeric album id
that appears only in the page's `<meta>`, never in the shareable URL. Tumblr and
DeviantArt are the same shape. All three become link chips.

### No pasted embed snippets.

Considered and **rejected 2026-08-15**. The proposal was to accept a provider's
"copy embed code" HTML, extract only the `src`, and run it through the same
allowlist — an extraction, never a pass-through, with the markup discarded. That
would have recovered Bandcamp.

Rejected on the grounds that a field accepting HTML is a class of risk not worth
one provider, and that maintaining a table is preferable to inviting paste. **Do
not reintroduce this without reopening that decision explicitly.** The refusal is
the design, not an oversight.

### Section types name shapes, and the picker names brands.

The request was for a YouTube section, a Vimeo section, a Twitter section. The
schema does **not** do that, and the picker **does**.

Seventeen provider-named types would be seventeen entries each in `SECTION_TYPES`,
`is_section_type()`, the `LAYOUTS` record and both catalogues — sixty-eight edits
that a guard would catch you missing four of. Worse as a product: a "YouTube
section" that refuses a Vimeo link is a worse section than "Videos" that takes
both, and people mix.

But the instinct behind the request is right and was nearly argued away. On the
sites this borrows from you added _an Instagram box_, and seeing the brand is the
connectedness. Naming brands only in a field hint is too late — a hint is found
after the choice is made.

So: **the add-section control offers brand-named presets.** Choosing "Instagram"
appends a `posts` section already named Instagram. Seventeen entries in a presets
array in `presentation`, none in the schema, none in SQL.

## 1. The provider table

`resolveEmbed` is seven `if (host === …)` blocks, and `PLAYER_ORIGINS` is a
separate list in `shared/domain/` pinned to it by tests on both sides. At seventeen
providers that shape stops working: the branches stop being readable, and the
two lists become a thing to remember rather than a thing that is true.

It becomes **one table**, one entry per provider, each declaring:

| field     | meaning                                                     |
| --------- | ----------------------------------------------------------- |
| `id`      | the provider name, as `EmbedProvider`                       |
| `hosts`   | exact hostnames, matched on the parsed `hostname`           |
| `origin`  | the origin its player is framed from                        |
| `shape`   | how tall the frame wants to be                              |
| `resolve` | `(url: URL) => string \| null` — the id or path it extracts |
| `src`     | a template the resolved value is interpolated into          |

**`PLAYER_ORIGINS` is derived from that table**, not maintained beside it. This
is the point of the refactor as much as the readability is: `frame-src` can no
longer name a host the resolver cannot build, or omit one it can. The two
cross-pinning tests collapse into one invariant — _every `src` this table can
produce has an origin in the derived list_ — which is a property test rather than
two lists somebody compares by eye.

`player-origins.ts` keeps its home in `shared/domain/` and its TSDoc's argument
(two unrelated things depend on it and neither owns it; `shared/` may not import
a feature). It re-exports the derivation instead of holding a literal.

### The security model does not change, and must not

Every entry still: refuses anything but `https:`, compares the **parsed
hostname** against an exact set, extracts an identifier matching a strict
pattern, discards every query parameter, and **builds a new address from a fixed
template**. What somebody pasted never reaches the page. The full argument lives
in `embeds.ts`'s TSDoc and stays there.

Three traps the table shape introduces that the branch chain did not have:

- **A template with an unvalidated interpolation is a hole in every provider at
  once.** Each `resolve` returns a value that must already match its pattern; the
  template does no checking. That is the same contract the branches had, but it
  is now stated in one place and depended on seventeen times.
- **`hosts` is matched exactly, never by suffix.** `youtube.com.evil.example`,
  `evil-youtube.com` and `https://www.youtube.com@evil.example` all fail. The
  last one only fails because the comparison is on the parsed authority. This is
  the same mistake `return_to` had to avoid in the picker.
- **A provider whose player takes an address as a parameter must encode it.**
  SoundCloud and Mixcloud both do. The inner address is rebuilt from parsed path
  segments and then encoded, so a `&` in what somebody pasted cannot add
  parameters to the widget.

### The roster

**Video** — YouTube · Vimeo · Dailymotion · TikTok · Twitch
**Music** — Spotify · SoundCloud · Apple Music · Deezer · Tidal · Mixcloud
**Posts** — Twitter/X · Instagram · Telegram · Pinterest · Bluesky · Mastodon

`EmbedShape` grows past `video | audio`. A tweet and a pin are neither, and the
renderer cannot ask a cross-origin frame how tall it wants to be — so the shape
travels with the resolution, exactly as it does today.

### What is uncertain, stated as uncertain

The design must not claim these all work equally. They do not.

- **Twitter/X (`platform.twitter.com/embed/Tweet.html?id=`) and Pinterest
  (`assets.pinterest.com/ext/embed.html?id=`) run on undocumented endpoints.**
  They work today. Nobody promised they will tomorrow, and the officially
  supported path for both is a third-party `<script>` in our page, which
  `script-src` does not allow and which this design will not add.
- **Instagram's `/p/{id}/embed` degrades for logged-out visitors.** Meta has
  been progressively restricting it. It may render a login wall instead of the
  post.
- **Bluesky's official embed is keyed by DID**
  (`embed.bsky.app/embed/{did}/app.bsky.feed.post/{rkey}`) while the shareable
  URL carries a **handle** (`bsky.app/profile/{handle}/post/{rkey}`). Resolving
  handle→DID is a fetch, which is out of scope. **Verify during Phase A**: if the
  embed endpoint does not accept a handle, Bluesky becomes a link chip and that
  is the correct outcome, not a shortfall to work around.
- **Twitch requires `parent=` naming the embedding domain.** So a Twitch embed
  works on `me.furrycolombia.com` and on localhost, and **not on a preview
  deployment**. That is a property of Twitch, and the parameter is built from
  configuration rather than from anything an author typed.
- **Mastodon and PeerTube are federated**, so the host is not knowable in
  advance. They get a **named list of instances** — `mastodon.social`,
  `mstdn.social`, and the furry ones (`meow.social`, `furry.engineer`,
  `pawb.social`) — and any other instance falls back to a link chip.
  **`frame-src` must never be opened to `https:` for this.** That directive is
  the entire second layer under the media layouts, and trading it for one feature
  would be trading the guarantee for the thing it guards.

### The failure this design cannot close, and does not pretend to

`resolveEmbed` returning null already falls back to a link chip, and that covers
an address the table cannot resolve. It does **not** cover a frame that loads and
then shows something useless — Instagram's login wall, or an undocumented
endpoint that starts returning an error page. The frame is cross-origin; we
cannot see inside it.

So a broken provider looks broken on a stranger's page, and no test we can write
will catch it. The honest mitigations are the only ones available: the fallback
chip for anything unresolvable, and the knowledge — written here — that three of
the seventeen are load-bearing on somebody else's goodwill. **Do not describe the
`posts` layout to anybody as reliable in the way `video` is.**

## 2. `posts` and `socials`

Two new layouts, not seventeen.

- **`posts`** frames a social post: Twitter/X, Instagram, Telegram, Pinterest,
  Bluesky, Mastodon.
- **`socials`** is proudly a wall of links — a brand icon and the handle pulled
  out of the pasted URL, so `instagram.com/luna.fox` reads "Instagram ·
  @luna.fox" rather than as an address. It covers everything with no embed at
  all: FurAffinity, Toyhouse, Weasyl, Ko-fi, itch.io, Bandcamp, Artstation.
  **It needs no fetch and cannot break**, which is what makes it the right home
  for the long tail.

Adding a layout is the four edits `apps/hub/src/features/actors/CLAUDE.md`
already names — `SECTION_TYPES`, `is_section_type()` in `0009`, a renderer in
`LAYOUTS`, a name in both catalogues — plus an entry in `LINKED` in
`section-item-fields.tsx`, since both new layouts carry an address.

Both are `LINKED`. `socials` is also `ICONED` — but the icon is **derived from
the host** and shown as a preview rather than picked, because a person pasting a
FurAffinity link should not then have to go and find a FurAffinity icon. The
picker remains available to override it.

## 3. Per-section form

### The shape

`sectionSchema` gains one optional key:

```ts
style?: {
  skin?: SkinId;
  background_url?: string;
  background_fit?: "cover" | "tile";
  card_size?: "s" | "m" | "l";
}
```

All four optional. **Absent means "inherit the page"**, which is the same resting
state the theme's own keys have and for the same reason: absence is a real answer
and must not be stored as a default.

`0009`'s `set_actor_sections` gains a matching validation block, written
key-by-key with an **`unknown style key` fallthrough**, the way `set_actor_theme`
already does it — so a typo is refused at the write rather than stored and
silently ignored. Lengths follow the precedents already in that function:
`background_url` ≤ 500 like `cursor`, `skin` ≤ 32 like the theme's skin. Neither
is checked against a list, for the reason that file already gives: a skin is a
set of CSS the app either implements or does not, the renderer falls back for a
name it does not know, and a list in SQL would be a migration every time one is
added.

**This is an edit to `0009_actor_profiles.sql`, not a new migration.** A change
to an existing function is an edit to the file that already defines it — see the
squash rule in the root `CLAUDE.md`. The column comment on
`actor_profiles.sections` documents the item shape and must be updated in the
same change.

`SECTION_LIMITS` needs no new entry: the serialised byte cap already backstops
the whole document, and it is checked last on the serialised value exactly as
`0009` does.

### How it renders — and the bug the spike found

A skin works by overriding custom properties. `@utility surface` reads
`var(--skin-border)`, `var(--skin-gloss)`, `var(--skin-shadow)`,
`var(--skin-backdrop)` at the element, and `@theme inline` compiles the radius
scale to `calc(var(--skin-round) * 0.75rem)` **inside the utility itself**. So a
`<section>` that redeclares those properties genuinely does get its own corners,
edge and shadow, and every `rounded-*` on its children re-resolves to the nearer
value.

**The mechanism nests. The table does not.**

`SKIN_VARS` holds only each skin's **differences from the `:root` defaults**.
That is correct at one scope, where "not set" falls through to `globals.css`.
Nested, "not set" falls through to **the enclosing skin**. Three consequences,
all of which would have shipped as "the styling popup sort of works":

- A `comic` page with a `paper` section **keeps comic's halftone dots**, because
  `paper` never mentions `--skin-gloss`.
- An `outline` page makes **every** section transparent whatever skin it picks,
  since only `outline` sets `--surface` and `--bar`.
- A section set to `default` inside a `glass` page **is still glass**, because
  `default: {}` overrides nothing. A control that accepts a choice, stores it,
  and changes nothing — the exact fault this feature has already been trimmed for
  three times (the two phantom canvases, the repetition switch shipped without a
  length, the nine silently-disabled lint rules).

**The fix is a second function, not a change to `skinVars`.** The obvious
correction — make `skinVars` always return the complete set — breaks something
else: `themeCss` keys the skin rule on that record being _empty_
(`skin ? … : ""`), so an unthemed page would begin emitting a style block and
lose the "byte-for-byte what it was before any of this existed" property that is
documented and tested.

So `skinVars` is unchanged for the page scope, and a nested variant spreads a
`SKIN_DEFAULTS` constant under the overrides. That constant duplicates nine
values from `globals.css`, which this repo would normally refuse — but the guard
already exists in the idiom: `skins.test.ts` parses the stylesheet, the way
`section-limits-match-migration.test.ts` parses the SQL. **Pinned, not trusted.**

The background picture is `background-image` on the section with
`background-size: cover` or `background-repeat: repeat` — the tiled form being
the actual thing the era is remembered for, and one CSS property.

### Readability, and why it needs no new escape hatch

A section wearing `outline` over a busy background picture may be unreadable, and
there is no per-section way out. It needs none: **`PageThemeSwitch` drops all of
it at once** — the rule is `:root:not([data-page-theme="default"])`, and the skin
half is gated on the same attribute as the colour half. A visitor is never
trapped, so per-section form inherits the guarantee that already makes an
author's colours allowed to be as garish as they like.

That is the whole argument, and it is the existing one. **Do not add a
per-section correction**; the page-level escape hatch is what makes the freedom
safe, and correcting somebody's page behind their back is the thing
`palette.test.ts` asserts against.

## 4. The editor

### The grip moves inside the card

`SectionEditor` currently wraps each row in a flex pair — a handle button, then
the card — which is where the empty gutter down the left comes from. The handle
moves **into `SectionCard`'s header row**, beside the collapse chevron.
`SectionCard` grows a `dragHandleProps` prop; `SectionEditor` stops wrapping.

The header row already wraps deliberately (the layout `select` is as wide as its
longest option and forced a 320px screen 150px wider). Adding the grip and the
new style button to that row must not undo that: `responsive.spec.ts` fails by
exactly that margin when the row is put back on one line, and it is the guard.

### A style button, and a live preview

A paintbrush beside the bin opens the style popup — skin, background picture,
fit, card size. **The card behind it renders with the style applied while it is
being edited**, using the same nested token-scoping the public page uses, so the
preview cannot drift from the result. That is the rule the theme configurator
already follows (`themeCss` is shared with the public page) and it is why the
nesting fix above is a prerequisite rather than a polish item.

Persistence rides the ordinary save. What must be instant is _seeing_ it.

### The language strip moves below the theme panel

Today the order is: fursona fields → **language strip** → theme panel →
sections.

`lang` appears **exactly once** in `fursona-editor.tsx` — passed to
`SectionEditor`. `fursona-schema.ts` has no `_en`/`_es` fields at all. So the
strip governs **only the sections**, and it currently announces itself above four
fields it does not touch, separated from the ones it does by the entire theme
panel — which, expanded, is tall.

New order: fursona fields → theme panel → **language strip** → sections.

Its sticky behaviour becomes correct as a side effect rather than by accident: it
is `sticky top-(--bar-top-2)` so it stays in view while you work, and below the
theme panel it comes into force exactly when the sections are on screen instead
of hovering over somebody picking colours.

`writingInHint` must be re-read in both catalogues after the move. If it names
"the fields below" it is now true; if it names the fursona's own fields it was
never true and this is when that is fixed.

## 5. Cards

`Cards` today is a fixed `w-56` tile in a row that scrolls sideways from `sm`,
becoming a three-column grid at `lg`. Its own TSDoc argues for the scroll row at
length and then apologises for it on phones.

It becomes `repeat(auto-fill, minmax(var(--card-size), 1fr))`, the size coming
from the section's `card_size`. The author picks how big a card is; the browser
picks how many fit. That is "the amount and the size change with the screen"
without a breakpoint guess anywhere.

`carousel` keeps scrolling sideways at every size, and that remains the honest
difference between the two: one is a set of cards, the other is a thing you swipe
through, and somebody who wants the second picks it by name. That sentence is
already in the actors `CLAUDE.md` and stays true.

Every card keeps its icon tile including the ones with no icon set — a row of
cards where only some are anchored is ragged, which was half of why these did not
read as cards.

## 6. A page-level background picture

A `theme` key, set in the configurator where page-level things live, tiled or
cover, behind everything. It is the single most recognisable thing about the era
being borrowed from and it is a handful of lines.

Validated in `set_actor_theme` alongside `cursor`, with the same length-only rule
and the same reasoning: which addresses exist is not a question the database
answers.

`img-src` already allows any https host — a picture is a pasted address by design
— so this costs nothing in the content security policy.

## Testing

The bar is the repo's, not a lower one: every export tested on its happy path and
each failure mode, branch coverage gating, and **sabotage verification** for
anything guarding already-correct behaviour.

- **Per provider**, a hostile-URL case: `youtube.com.evil.example`,
  `evil-youtube.com`, the `@`-authority form, `javascript:`, and a plausible id
  of the wrong length. This is the existing suite's shape, extended seventeen ways.
- **A property test** that every `src` the provider table can build has an origin
  in the derived `PLAYER_ORIGINS`. This replaces the two hand-maintained
  cross-pinning tests and is strictly stronger.
- **`SKIN_DEFAULTS` against `globals.css`**, parsed from the stylesheet, in
  `skins.test.ts` where the stylesheet is already read.
- **One Playwright assertion that nesting actually computes** — a section inside
  a differently-skinned page resolving a different `border-radius`. The cascade
  argument in this document is from reading, not from running, and
  `[class~="border"]` survived months here on reasoning that also sounded fine.
- **`section-limits-match-migration.test.ts`** extended to the new style keys, so
  the client's mirror of `0009` cannot drift.
- **A regression test for the nesting bug**, sabotage-verified against the
  original fault: a `paper` section inside a `comic` page must not inherit the
  halftone. Written to fail on the unfixed code.
- **`responsive.spec.ts`** re-run against the new header row at 320px.

## Phasing

**A — the provider table.** The table itself, the derivation of
`PLAYER_ORIGINS`, and the **seven** new video and music providers — Dailymotion,
TikTok, Twitch, Apple Music, Deezer, Tidal, Mixcloud — including Twitch's
`parent` verification. No UI change; `video` and `music` simply accept more.
Shippable alone and valuable alone.

The six `posts` providers land in **B**, with the layout that gives them
somewhere to live. Adding them here would mean seven providers the resolver
knows and no section that renders them — the "control that does nothing" fault
in a new place. Bluesky's handle→DID verification therefore belongs to B, not A.

**B — `posts` and `socials`.** The two layouts, the brand presets in the
add-section control, host-derived icons.

**C — per-section form.** The nesting fix first (it is a prerequisite, not a
detail), then the schema, the `0009` edit, the grip move, the style popup with
its live preview, and the language-strip move.

**D — cards and the page background.** The `auto-fill` grid, the `card_size`
dial, the page-level background picture.

## What must not be undone

- **No outbound fetch.** The moment one appears, reopen this document.
- **No pasted HTML**, and no `frame-src https:`.
- **The provider table's origins stay derived**, never restated beside it.
- **Colour stays page-level.** A per-section colour would collapse the skin /
  palette split that fourteen skins rest on.
- **Nested skins emit the complete token set.** The differences-only table is
  correct at one scope and wrong at two, and the failure is silent.
- **`posts` is not described as reliable.** Three of its providers depend on
  endpoints nobody documented.
