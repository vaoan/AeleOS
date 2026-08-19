# Retro players — a jukebox somebody dressed themselves

**Status:** DESIGN, 2026-08-19. Not started.
**Follows:** `2026-08-15-section-personality-design.md` for what a skin is here,
and `2026-08-18-sections-of-spaces-design.md` for the block a player sits in.

## Why this exists

Every player this hub can put on a page today is **somebody else's chrome**.
`resolveEmbed` builds an address on an allowlisted origin and `EmbedFrame` puts
it in an iframe, so a Spotify embed looks like Spotify on every page that has
one. That is the correct design for a service you do not own, and it is why the
`player` leaf stays exactly as it is.

But it means a fursona page cannot have **a player that belongs to the person
whose page it is.** The request that started this was two links — a Winamp
reimplementation and a Windows Media Player 7 clone — and underneath both was
one idea: _the player is part of how the page looks, and I choose how it looks,
and a stranger who finds my page sees the choice I made._

That is not an embed. An embed is a window onto a host. This is furniture.

## 1. What plays what, and a claim this document got WRONG

An earlier draft of this section said: _"A Winamp-style player cannot play
YouTube, and no amount of work here changes that."_ **The first half is true and
the second half is false**, and the correction is left visible because the wrong
version is the intuitive one and somebody will arrive at it again.

**True:** YouTube's audio stream cannot be fed into a Winamp playlist. The
classic chrome draws from an `<audio>` element and a Web Audio graph; putting
YouTube into either means extracting the stream, which needs a server and breaks
their terms. Same for Spotify. So a chrome that IS the audio source can only
ever play files.

**False:** that this is the only way to build a player. A player UI does not
have to be the audio source — it can be a **remote control** for the provider's
own embedded player. Load `youtube.com/embed/<id>?enablejsapi=1` and drive it
with `postMessage`. Verified against the WMP7 clone's own source, which contains
exactly that and thirteen `postMessage` calls, and loads **no YouTube library at
all** — so it costs no `script-src` origin, and `frame-src` already allows the
host through `PLAYER_ORIGINS`.

**What actually divides the two is a video surface**, for a licensing reason
rather than a technical one: YouTube's terms forbid hiding or obscuring the
player. A chrome with a video pane has somewhere compliant to put it; Winamp's
275x116 window, whose largest free area is a 76x16 visualiser, does not. That
line is what §4's two kinds are drawn along.

**How far it generalises**, because somebody will assume it covers everything:

| provider   | control mechanism                            | cost to us                                                         |
| ---------- | -------------------------------------------- | ------------------------------------------------------------------ |
| YouTube    | raw `postMessage`, `enablejsapi=1`           | **none** — no script, no CSP edit                                  |
| Vimeo      | raw `postMessage`                            | **none**                                                           |
| Spotify    | needs `open.spotify.com/embed/iframe-api/v1` | a `script-src` origin, and full tracks need the VISITOR on Premium |
| SoundCloud | needs `w.soundcloud.com/player/api.js`       | a `script-src` origin                                              |

So YouTube and Vimeo are free and the rest each cost a third-party script in the
policy. This phase takes the free two and leaves the rest as a later ruling.

**None of this displaces the existing embed leaf.** `post` stays what it is: ONE
embed, no playlist, no chrome of ours. The split is between wanting a video on a
page and wanting a player somebody built.

## 2. What was measured before any of this was designed

Five facts, each checked rather than reasoned about, because four of them
would have changed the design if they had come out the other way.

**Webamp is adoptable and we are not adopting it.** `webamp@2.3.1` is MIT and
real. Measured rather than trusting the badge: the lazy entry is **187 kB gzip**
(577 kB minified), the default entry **290 kB gzip**. For scale, this
repository's entire dnd-kit stack is 13.9 kB. It also bundles its own copy of
React, which is why it is that size and why it could never share ours. It is a
fine library and the reason we are writing our own is in §3.

**A `.wsz` needs no dependency to open.** The archive is an ordinary ZIP and its
entries are raw DEFLATE. The central directory of a real museum skin was parsed
by hand and every one of its 20 entries inflated through the platform's own
`DecompressionStream("deflate-raw")` to its exact recorded byte length, with
valid `BM` headers. That is roughly 60 lines of our own code where JSZip is
28 kB, using an API present in every browser this app targets since Safari 16.4.

**A skin needs no image decoding either.** Every sprite in that skin is a 24-bit
Windows 3.x BMP, which browsers render natively in `<img>` and in CSS
`background-image`. `main.bmp` is 275×116, `cbuttons.bmp` 136×36, `volume.bmp`
68×433, `numbers.bmp` 99×13. So drawing a skin is blob URLs and
`background-position`, and there is no pixel loop anywhere in this design.

**There is a free, public, CORS-open source of ~100,000 skins.**
`api.webamp.org/graphql` answers unauthenticated with
`Access-Control-Allow-Origin` reflecting the caller, and skin files come from
`r2.webampskins.org/skins/<md5>.wsz` with `Access-Control-Allow-Origin: *`. One
was downloaded end to end: 31,432 bytes, a valid archive. The Internet Archive's
`winampskins` collection was checked as an alternative and **rejected on
evidence** — it lists 102,972 items, but every item sampled has had its payload
stripped and retains only metadata. The museum's own CDN is the live source.

## 3. Why we write the player rather than importing one

Not for the reason it looks like. 187 kB in a lazily-imported chunk that only
loads on pages which actually contain the leaf is a payable cost, and "too big"
alone would not have settled it.

It is settled by what the measurements in §2 revealed: **the expensive part of
Webamp is fidelity we are not buying.** Once unzipping is free and BMP decoding
is free, what remains of a classic skin is a sprite atlas — a table of
rectangles — and CSS. Webamp is 187 kB because it faithfully reproduces window
docking, shade modes, double-size, the equalizer's spline curve, Milkdrop, ID3
parsing, `region.txt` non-rectangular windows and a decade of skin quirks. On a
fursona page inside a block place a third of the screen wide, most of that is
unreachable.

There is also a thing our own player does that the library **cannot** do, and it
is not a small thing — see §6.

The Windows Media Player 7 clone was evaluated on the same terms and rejected on
three independent grounds, any one of which is sufficient:

- **GPL-2.0.** Vendoring it relicenses the hub. That is a permanent trap in a
  repository whose founding constraint is "don't get trapped".
- **No embed surface at all.** No package, no module, no way to hand it a track
  or a skin; the install instruction is "open `index.html`". It is one 143 kB
  unminified `script.js`, a 109 kB `index.html` and an 80 kB `style.css`.
- **It pulls a 32 MB `ffmpeg-core.wasm`** for in-browser video remuxing, which
  is not a feature of this product.

Its "12+ skins" are CSS themes over its own markup — not files, not portable,
and with no public library behind them. So there is nothing to import: what we
want from it is the _look_, and the look is ours to draw.

## 4. Two kinds split by CAPABILITY, and not one new field

**Ruled 2026-08-19.** The vocabulary is not one kind per product, and not one
kind with a chrome switch. It is **two kinds divided by what a chrome can
physically hold**, with the specific player as a value inside each.

| kind      | what it can play                         | chromes                       |
| --------- | ---------------------------------------- | ----------------------------- |
| `player`  | audio files, video files, YouTube, Vimeo | `wmp7`, `wmp8`, `wmp9`, `vlc` |
| `jukebox` | audio files                              | `winamp`, and any we draw     |
| `post`    | ONE embed, no playlist                   | —                             |

**The dividing line is a video surface, and it is a LICENSING line rather than
a technical one.** This is the part most likely to be mistaken for an arbitrary
split. A YouTube video can be played from a playlist by loading the provider's
own embed with `enablejsapi=1` and driving it with `postMessage` — no
third-party script, no `script-src` change, and `frame-src` already allows the
origin through `PLAYER_ORIGINS`. Verified against the WMP7 clone's own source,
which contains `youtube.com/embed/`, `enablejsapi` and thirteen `postMessage`
calls and loads no YouTube library at all.

What stops a Winamp window doing the same is that **YouTube's terms forbid
hiding or obscuring the player.** The classic main window is 275x116 with a
76x16 visualiser and no video surface anywhere, so there is no compliant place
to put one. A chrome with a video pane has one by construction. So:

- a `player` offers YouTube because it can show it;
- a `jukebox` does not offer it, and **says so** rather than accepting the
  address and playing nothing.

That is also why the split is by capability rather than by brand: it survives
the next chrome. Anything with a video pane joins `player`; anything without
joins `jukebox`; nobody has to remember which product is which.

### Still not one new field

A page is one `jsonb` column holding a tree of blocks, and the leaf object
already carries fields with the right shape and the right caps:

| what a chrome needs     | the field       | what already bounds it       |
| ----------------------- | --------------- | ---------------------------- |
| the playlist            | `rows`          | 50 rows x 8 cells, per block |
| which chrome to draw    | `icon`          | 2000 characters              |
| the Winamp `.wsz` skin  | `link_url`      | 2000 characters              |
| what to call the player | `title_*`       | 2000 characters              |
| a caption under it      | `description_*` | 2000 characters              |

`icon` holding a chrome name is closer than it looks: `icon` already means "a
short identifier from a fixed set", which is exactly what `wmp9` is.

**The drawn chromes have no separate skin field, because they ARE the skins.**
WMP7, WMP8 and WMP9 are three distinct visual languages, not three settings of
one; a silver and a blue WMP9 would simply be two chrome names. Only Winamp has
a skin FORMAT — `.wsz`, a real file with ~100,000 of them published — and that
is the one case `link_url` serves.

One song is one row, its cells positional:

```jsonc
{
  "kind": "jukebox",
  "icon": "winamp",
  "title_en": "Night drives",
  "link_url": "https://r2.webampskins.org/skins/<md5>.wsz",
  "rows": [
    [
      { "text_en": "https://files.example/howl.mp3" },
      { "text_en": "Howl", "text_es": "Aullido" },
      { "text_en": "Luna" },
    ],
  ],
}
```

**A playlist is capped at 50 songs, and the cap is the point rather than a
limitation accepted for it.** That cap is enforced by the live database TODAY,
with no statement written and no in-place edit to an applied migration. A new
`playlist` array would have arrived with no cap until somebody wrote one, which
is the shape `validate_block`'s own comment calls "the thing this block exists
to prevent". Reusing a validated field is the stronger guarantee, not a
shortcut.

**The bilingual cell is a real gain.** A cell is `{text_en?, text_es?}`, so a
song title can carry both languages and `contentFor` picks — for free, through
the path every other piece of a page uses. A purpose-built `{url, title, artist}`
would have been monolingual unless somebody remembered otherwise.

**What it costs, stated rather than discovered later.** Cell positions are
opaque: cell 0 is the address, 1 the title, 2 the artist, and nothing in the
data says so. The mapping lives in one function each way with its TSDoc, and
`playlist.test.ts` pins it — but it is a convention, which is what rule 15
warns about. And switching a `table` leaf to `player` reinterprets its rows;
that is the same field-keeping behaviour every kind already has, and it is
reversible in one click rather than data loss.

### `player` is taken back from the embeds

`player` and `post` were the same leaf under two names. `LEAF_FIELDS` gave them
byte-identical entries and both resolved through one provider table into one
`EmbedFrame`. Nothing about an embed varies per leaf — height, shape and aspect
all come from `EMBED_PROVIDERS` — which is why no per-embed option is needed
and the merge costs nothing.

They differed twice, and **one was a latent bug**: `PlayerLeaf` passed
`parentHost` to `resolveEmbed` and `PostLeaf` did not, so the same Twitch
address was a working player in one kind and a dead chip in the other. The
merged kind always passes it. The other difference — a link button against a
branded chip on failure — was deliberate, and the merged rule takes the better
of both: the chip when `resolveSocial` recognises the host, the button
otherwise.

**Measured before deciding**, read-only against the live project on
2026-08-19: 1,378 pages carry content, and **627 `player` blocks across 243
pages** mean "embed this video", beside 196 `post` blocks on 158 pages. So the
name is converted rather than inferred about — the embed merge lands FIRST, as
its own change, carrying a one-statement rewrite of every stored `player` block
to `post`. After it runs, `player` means the video-capable chrome and nothing
else, with no heuristic anywhere deciding which sense a stored block meant.
Inferring from "does it have `rows`" would have worked the day it was written
and rotted the first time somebody saved an empty playlist.

### What existing web clones do and do not give us

Searched 2026-08-19. There is **no WMP10 web clone**; the `rmellis` set is 7, 8
and 9, plus a VLC one, all GPL-2.0 from one author. There is **no GOM,
foobar2000, AIMP or MusicBee** web clone at all. Winamp has Webamp and a couple
of unlicensed toys.

So the pool is tiny — and it does not constrain this design, because none of it
is being adopted. **What limits the chrome list is what we are willing to
draw**, which means any era look is available and the list can grow by a table
entry plus a CSS block. A chrome joins that list in the change that implements
it, exactly as `CANVASES` and `SKINS` already require.

## 4b. Every chrome ships, and a visitor loads one

**The point of this feature is personal expression, so the roster is long on
purpose.** Ruled 2026-08-19: we are not picking two chromes and calling it
done. A person choosing between WMP9 and Sonique and Winamp is the product.

That creates the one real engineering constraint of the whole feature: **a
stranger opening a page with one player must not download the other twenty.**
It is stated here as a budget rather than an intention, because "we will be
careful" is not a mechanism.

### What a chrome IS, and why that makes the roster nearly free

A chrome is **not** an arbitrary component. Every media player of that era draws
the same handful of things — a transport row, a seek bar, a volume control, a
title readout, a playlist, and (for a `player`) a video pane. What differs is
ornament: bevels, gradients, corner shapes, colours, and where the controls sit
relative to the pane.

So a chrome is:

1. **a shared component per KIND** — one for `player`, one for `jukebox`; and
2. **a token set**, exactly the shape `SKINS` already uses in
   `shared/domain/skins.ts`, plus a few structural flags.

That is what makes twenty chromes cost almost nothing: they are DATA. Shipping
every entry of a table of custom properties is a few hundred bytes, where
twenty bespoke components would be twenty chunks.

**Winamp is the exception and must stay one.** It is not a token set — it is a
sprite engine reading a real file format, and it carries `wsz.ts`, the atlas and
the sprite CSS. It is therefore the one chrome behind its own dynamic import,
loaded only when a page actually holds a `jukebox` drawing with it.

### The budget

- **A page with no player leaf loads none of this.** Both kind components are
  dynamically imported from the leaf renderer, so a page without one ships no
  player code at all.
- **A page with a player loads its KIND, not the roster.** One component plus
  the token table.
- **Only a Winamp leaf loads the sprite engine**, and only a Winamp leaf with a
  chosen skin fetches a `.wsz` (~31 kB, from the museum's CDN, cached by the
  browser).
- **Nothing loads a provider's script.** YouTube and Vimeo are driven by
  `postMessage`; the providers that need a script are not in this phase.

**This is to be MEASURED and not asserted.** The repository's own rule is that
an argument about cost is not a measurement of it, and this document has already
been wrong once about what a player can do. When the chromes exist, the check is
a production build with the chunk sizes for: a page with no player, a page with
a `player`, and a page with a Winamp `jukebox` — and the numbers go in this
section. Until they are here, the paragraph above is a design intention with no
evidence behind it, and should be read that way.

### The roster

The pool of existing web clones does not constrain this, because none is being
adopted — see the end of §4. What limits it is what we are willing to draw, and
each is a table entry plus a block of tokens once the two kind components exist.

**`player` — has a video pane:** WMP7, WMP8, WMP9, WMP10/11, VLC, QuickTime 4
(the brushed metal), RealPlayer, Media Player Classic, KMPlayer, GOM.

**`jukebox` — audio only:** Winamp, WMP 6.4 (the tiny grey one), foobar2000,
XMPlay, AIMP, MusicBee, Sonique, iTunes 6, Zune.

Each joins its list **in the change that implements it**, exactly as `CANVASES`
and `SKINS` already require here — a name in a table with nothing behind it is
a control that accepts a choice and changes nothing, which is the fault this
feature refuses everywhere else.

A note on naming, recorded once so it is a decision rather than an oversight:
these are named after real products, which goes further than this app's existing
`aero` or `retro`. The same looks can ship under era names — `silver`, `bubble`,
`cone`, `metal` — with no change to any code, if that is ever preferred.

## 5. Reading a skin: `wsz.ts` and the atlas

Two modules, and the split matters because one of them needs a browser and the
other emphatically does not.

**`wsz.ts` — archive to blobs.** Reads the ZIP end-of-central-directory, walks
the entries, inflates each through `DecompressionStream("deflate-raw")`, and
returns a lookup from canonical sprite name to `Blob`. Two properties are not
optional, and both come from the _first_ museum skin opened rather than from
imagination:

- **Depth-tolerant.** That skin's files were nested inside a `3DNow/` folder
  rather than at the archive root. A reader that only looks at the root fails on
  an unknown but certainly large share of 100,000 skins.
- **Case-insensitive.** The same skin contained `shufrep.BMP`, `Eqmain.bmp` and
  `PLEDIT.TXT` beside `main.bmp`. One archive, three conventions.

A skin that omits a sprite falls back **per file**, not wholesale, so a skin
missing one button draws the rest.

**`skin-sprites.ts` — the atlas.** Pure data: the rectangle of every button,
digit, slider frame and toggle state within each sheet. Being data, it is
testable with no browser and no DOM, which is where the majority of this
feature's correctness lives.

**The fallback skin is ours, drawn from scratch.** The obvious move is to ship
Winamp's classic `base-2.91.wsz`, and it is refused: that is Nullsoft's artwork,
and inheriting somebody else's licence question for a _default_ is the trap this
repository's third constraint exists to avoid. Ours is legally clean, it doubles
as the AeleOS house skin, and it is what fills in per-file above.

Rendering is a client component behind a dynamic import, so a page with neither
leaf ships none of this.

## 6. Playback, and the one place we beat the library

**Webamp requires CORS on every track. We must not, and need not.**

Webamp always routes audio through the Web Audio API, which requires the media
resource to be CORS-readable — so its documentation states plainly that
`initialTracks[].url` must be same-origin or CORS-permissive. On a platform
that hosts no files, where every track is a link somebody pasted at a host that
was never ours, that constraint would make the feature fail for most real
inputs. And it would fail in the way this feature note calls the worst kind: a
control that accepts what somebody types, stores it, refuses nothing and renders
nothing.

A plain `<audio>` element plays a cross-origin file **with no CORS headers at
all.** The resource is merely _tainted_ — you cannot read its samples — which
costs the spectrum analyser and costs nothing else.

So:

- **Playback is unconditional.** Any https audio URL plays.
- **The visualiser is opportunistic.** We attempt `crossOrigin="anonymous"`
  first; on the error event we drop the attribute and reload once. That costs
  one extra request on a host without CORS and gains a real analyser on a host
  with one.

`media-src` is already `'self' https:`, so **audio requires no CSP change
whatsoever.**

Both chromes drive one player: a single `<audio>` per leaf, one hook, two
skins over it.

## 7. Making failure visible instead of silent

The editor probes each pasted URL and reports one of three states:

| state                | means                                        |
| -------------------- | -------------------------------------------- |
| plays                | reachable, CORS-readable, analyser available |
| plays, no visualiser | reachable, not CORS-readable                 |
| cannot be reached    | 404, wrong host, not audio                   |

**It still saves either way.** The link is the person's responsibility, and a
host that sends CORS today may not tomorrow, so a hard refusal would be a lie
about a fact we cannot hold. What is not acceptable is silence: on the public
page a track that fails to load renders as a struck-through row with a reason,
never as a play button that does nothing.

The same applies to the skin: the editor previews it live, the way the embeds
preview, so nobody commits to a skin they have not seen.

## 8. Skins: three sources, and the trade one of them costs

All three, because the requirement is that people choose:

1. **The museum picker** — search over ~100,000 skins via
   `api.webamp.org/graphql`, files from `r2.webampskins.org`. Free, public,
   CORS-open, needs nothing of ours.
2. **A pasted `.wsz` URL from anywhere** — hosting and CORS are the person's
   responsibility, stated in the hint and reported by the probe.
3. **Our own built-in set**, including the fallback skin from §5.

Plus the WMP7 set, which is ours, needs no network, and cannot fail.

**Source 2 costs `connect-src https:`.** A skin is fetched, so it is governed by
`connect-src`, and an arbitrary host cannot be allowlisted in advance.

The cost is real and it is **smaller than it first appears**, which is stated
here so nobody re-litigates it from the scary version. This policy already
carries `script-src 'unsafe-inline'` — Next inlines its hydration payload — and
`img-src https:`. An injected script can therefore already exfiltrate one-way
today via an image beacon. What `connect-src https:` adds is the ability to
**read a response back**, not the ability to leak. That is a genuine narrowing
to give up and the reason goes in `csp.ts`'s TSDoc under the "every disable
carries its reason" rule, but it is not the cliff.

The alternative considered and rejected: proxying arbitrary skins through a
same-origin route. It keeps `connect-src` tight and buys an SSRF surface, egress
filtering nobody will maintain, and bandwidth on a free tier — three new
problems for one directive.

## 9. What this touches that is dangerous

**`is_block_kind()` lives in an applied migration, and it is the ONLY SQL this
feature touches.** Adding two leaf kinds edits `0009`, and this repository has
already paid for what that means: an in-place edit **never reaches the live
database**, silently, because Supabase will not re-run a file it has recorded as
applied. The changed `create or replace` must be applied to the live project by
hand in the same change, and `pnpm check:schema-drift` re-run. `pnpm test:db`
cannot catch this by construction — it resets to a fresh database built from the
files, where drift cannot exist.

The blast radius is as small as it gets: a `select p_kind in (...)` gaining two
strings, additive, and reversible by restating the previous list. Nothing else
in `0009` changes, so `BLOCK_LIMITS` gains no entry and
`block-limits-match-migration.test.ts` has nothing new to pin — see §4 for why
that is a stronger position than adding a cap of our own.

**`LEAF_KINDS`' TSDoc describes a debt inherited from `two-column`.** Rule 18
is precisely about this comment: it describes something other than its own
symbol, so `check:docs` cannot see it go stale. Adding two kinds is the moment
to re-read it.

**Both catalogues, or the build fails.** `fursonas.leafKinds.winamp`,
`fursonas.leafKinds.wmp7`, the field labels and hints, and every skin name —
`messages.test.ts` compares the catalogues key by key. And per rule 12, a
`next dev` already running when the catalogues change keeps serving the old
modules forever; restart before diagnosing anything visual.

**`wsz.ts` must never touch `Blob`, and this was measured rather than
reasoned.** The unit suite runs in jsdom, and the obvious way to write the
inflater — `new Blob([bytes]).stream().pipeThrough(new
DecompressionStream("deflate-raw"))` — fails there with
`(intermediate value).stream is not a function`. jsdom supplies its own `Blob`,
which has no `.stream()`, and it shadows Node's. `DecompressionStream` itself is
present and fine; it was `Blob` that was missing a method, which is the more
annoying diagnosis of the two because the error names the wrong subject.

The shape that works, verified against the same real museum skin inside the
hub's actual vitest environment — every deflated entry inflating to its exact
recorded length — feeds a `ReadableStream` directly:

```ts
const source = new ReadableStream<Uint8Array>({
  start(c) {
    c.enqueue(bytes);
    c.close();
  },
});
const out = await new Response(
  source.pipeThrough(new DecompressionStream("deflate-raw")),
).arrayBuffer();
```

This is also the better implementation on its own merits — it allocates no
intermediate `Blob` — so the constraint costs nothing. But it is a constraint:
a later refactor that "simplifies" it back to a `Blob` will pass review, pass
in a browser, and fail only in the unit suite.

## 10. Testing

- **`wsz.ts` against synthetic archives built in the test.** Not against
  checked-in museum skins: a synthetic archive is more hostile than a real one
  (it can be made to nest three deep, mix casing arbitrarily, omit sprites and
  carry a stored-not-deflated entry) and it sidesteps the question of whose
  artwork is in the repository. One real skin is fetched in an e2e test, where
  it belongs.
- **The atlas as data**, with no DOM.
- **`leaf-fields.test.tsx`** already forces both kinds to declare what they
  draw.
- **e2e**: a page carrying each leaf, a skin applied from each source, play and
  pause driven for real. Rule 27 applies with force here — a fixture where the
  right skin and the fallback skin would render identically proves nothing, so
  the fixture skin must differ visibly from the fallback in an asserted way.
- **Every guard sabotage-verified.** A test never seen red proves nothing.

## 11. Phases

1. **The archive and the atlas.** `wsz.ts`, `skin-sprites.ts`. No UI. Pure
   functions, fully tested. **First because it carried the only genuine
   unknown**, on the same reasoning that put the Supabase⇄Clerk trust in
   Phase 0: if a museum skin cannot be opened, nothing after this matters. That
   unknown is now closed — see §9 — so this phase begins knowing both that it
   works and which construction to avoid.
2. **The Winamp chrome** (`jukebox`) — main window (275×116) rendered from a
   skin, over a real `<audio>`: transport, seek, volume, balance, the bitmap
   title and clock, shuffle/repeat, and the opportunistic visualiser.
3. **The playlist window** — `pledit.bmp` and `pledit.txt`, the visible track
   list, which on a profile page is arguably the point.
4. **The model and the database** — the two kinds in `LEAF_KINDS` and in
   `is_block_kind()`, the `rows` mapping, `LEAF_FIELDS`, both catalogues, and
   the renderer wiring. **It comes after the chrome rather than before it**,
   because `blocks.tsx` builds its lookup with `satisfies Record<LeafKind, …>`:
   a kind added first would need a placeholder renderer, and a control that
   accepts a choice and changes nothing is what this feature refuses everywhere
   else. A kind joins the list in the change that implements it.
5. **The editor** — the playlist control, the three skin sources, the live
   preview, the probe and its three states.
6. **One `player` chrome** — WMP9 first, our own drawing, with a video pane and the YouTube/Vimeo `postMessage` path. WMP7, WMP8 and VLC follow as table entries once the second one has proved the shape.
7. **CSP, docs, the feature note.**

The equalizer (`eqmain.bmp`, `eq_ex.bmp`) is **deliberately not here.** It is
real work, it is the least used surface, and on a profile page it is decoration.
The model leaves room for it; this phase does not spend on it.

## 12. Fitting a fixed-size thing into a grid of places

Winamp is 275×116 pixel art. It **cannot reflow** — Winamp itself only ever
offered 1× and 2×. A container query picks the scale from the _place's_ width,
per this feature's rule that content adapts to its parent rather than the
viewport, with `image-rendering: pixelated` so 2× is crisp rather than smeared.

Below 275px the only honest options are to scale down and accept softness or to
overflow, and this design scales down. That is stated rather than hidden because
it is the one place the retro chrome is knowingly worse than the rest of the
page, and somebody will notice.

## 13. What this adds to `package.json`

Nothing.
