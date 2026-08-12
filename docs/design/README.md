# AeleOS design journal

A running record of how the look of AeleOS was arrived at — including the
directions that were rejected, and why. Kept because the reasoning is worth more
than the result: the next person to touch this (or the next app that inherits it)
should be able to see what was already considered.

Iterations live in [`iterations/`](iterations/) as standalone HTML. Open any of
them directly in a browser.

| #   | Iteration                                                                  | Question it was answering                         |
| --- | -------------------------------------------------------------------------- | ------------------------------------------------- |
| 01  | [Three nebula directions](iterations/01-palettes-dark.html)                | What palette, judged against fursona colours?     |
| 02  | [Dark and light](iterations/02-palettes-light.html)                        | What does light mode even mean for a space theme? |
| 03  | [Nebula inversion](iterations/03-nebula-inversion.html)                    | Both modes as positions inside the same nebula    |
| 04  | [How far to push it](iterations/04-nebula-canvas.html)                     | Gradient, cloud structure, or animated drift?     |
| 05  | [Clouds in both modes](iterations/05-clouds-both-modes.html)               | Does the cloud look survive light mode?           |
| 06  | [Four bright spaces](iterations/06-light-mode-explorations.html)           | Negative plate, atlas, corona, or rose dust?      |
| 07  | [Full page, light](iterations/07-full-page-corona.html)                    | Does "close to the star" hold at page scale?      |
| 08  | [Typography](iterations/08-typography.html)                                | Which voice, judged on a UUID rather than a logo? |
| 09  | [Full page, dark](iterations/09-full-page-dark.html)                       | Dark with the chosen type                         |
| 10  | [Provider marks fixed](iterations/10-full-page-dark-v2.html)               | Bug: tofu glyphs                                  |
| 11  | [Star threshold fixed](iterations/11-full-page-dark-v3.html)               | Bug: star field was 60% white noise               |
| 12  | [One shell everywhere](iterations/12-one-shell-v4.html)                    | Sign-in adopts the signed-in composition          |
| 13  | [Clouds vs gradient](iterations/13-shell-v5-clouds-vs-gradient.html)       | Bug: SVG sizing. The chosen A/B comparison        |
| 14  | [Canvas nebula + toggle](iterations/14-nebula-canvas-toggle.html)          | Explored, **not adopted** — wrong texture         |
| 15  | [Canvas clouds + star toggle](iterations/15-cloud-canvas-star-toggle.html) | **Adopted.** The final design, still interactive  |

> These were produced with the brainstorming companion, which serves content
> fragments and supplies the page shell at runtime. The archived copies are
> wrapped in a minimal frame (`iterations/frame.css`) so they still render years
> later, and the live-session click handlers are stripped — they were never part
> of the design.

## Where it started

Nothing existed. `apps/hub/src/app/globals.css` was one line — `@import "tailwindcss"` —
and the layout used default Tailwind greys with the system font stack. The
sign-in page rendered a bare Clerk `<SignIn />` with no `appearance` prop, which
is why a white card sat on a black page. That mismatch is what started this.

## Decisions, in the order they were made

### 1. Same bones as Libra, own personality

Libra already has a full design system — "Neobrutalist Libra", bubblegum pink
`oklch(0.65 0.22 350)`, mint/lilac/lemon/sky/peach accents, DM Sans + Syne, hard
black borders, OKLCH tokens under Tailwind v4 `@theme inline`.

AeleOS shares the _structure_ — OKLCH tokens, the same shape of light/dark
system — but not the palette.

**Why:** Libra is a bright object; AeleOS is the field those objects sit in.
Identity infrastructure wearing a storefront's brand would be wrong, and every
future app would inherit Libra's aesthetic by accident rather than choice.

**Rejected:** matching Libra closely (one visible brand, least work — but locks
Puck and Janus to a shop's look), and going deliberately neutral (reads as
unfinished, and wrong for a furry community).

### 2. The star metaphor, not the fursona

The name comes from the founder's fursona, so drawing the palette from that
character was on the table. It was rejected in favour of deriving the look from
AeleOS being _the star the moons orbit_.

**Why:** it stays legible to people who do not know the reference, and keeps the
fursona personal rather than making it the platform's face.

### 3. The characters are the star — AeleOS is the space

The pivotal idea, and it came from the maintainer rather than the design process.

AeleOS is the **field**; the fursona is the **star**, and it is interchangeable.

**Why it is more than a metaphor:** fursona avatars are every colour imaginable —
neon green dragons, pastel bunnies, monochrome wolves. Any loud brand colour
AeleOS picks will fight them. A deep nebula field is the one backdrop that
flatters all of them, because it is dark, desaturated in its mid-tones, and
carries no single hue that clashes.

It also makes the actor picker (Phase 1b-ii) the emotional centre of the product:
choosing which star you are right now. The visual metaphor and the architecture
become the same thing.

**Consequence, adopted as a rule:** saturation belongs to the user. Their avatar
is the brightest thing on screen, always.

### 4. Palette plus restrained atmosphere

Flat surfaces, but the page has depth — faint nebula haze, a sparse star field
that never competes with an avatar.

**Rejected:** palette-only (metaphor told rather than felt), and fully
atmospheric (parallax, animated transitions — drowns the avatars it exists to
showcase, and costs motion-sensitivity and performance).

### 5. Both modes are positions inside the same nebula

Not light-versus-dark. **Dark** = in the void, pink dust glowing at the edges.
**Light** = inside the bright dust, deep violet space beyond. Referenced against
FTL's nebula sectors.

**No pure white anywhere.** The lightest surface is rose dust,
`oklch(0.965 0.022 350)`. White broke the fiction immediately.

**The pink is not decoration.** H-alpha emission from ionised hydrogen is why
Orion and Carina photograph pink. The palette is astronomically honest rather
than "we liked purple".

### 6. Bold, and one shell everywhere

The bold reading of the inversion won over the restrained one. Sign-in then
adopted the signed-in page's composition — header bar, left-aligned title,
content column, same cards — rather than being a centred hero (iteration 12).
The observation that drove it: the signed-in page reads as the flipped version
of its light counterpart, and that is what the whole product should feel like.

Dark and light now differ **only by the token block**. Same markup, same layout.

### 7. Typography

**Space Grotesk** display, **DM Sans** body, **JetBrains Mono** for IDs.

DM Sans is deliberately shared with Libra — that is the skeleton. The display
face and the mono are AeleOS's own.

Chosen on the ID rather than the wordmark: every option looks fine at 26px, but
`45242b95-3aed-5bf1-8f67-fd8c8b8c17e6` is read aloud, pasted into tickets and
compared across apps. JetBrains Mono is engineered to disambiguate 0/O and 1/l;
Space Mono is styled for display and gets tiring at length.

### 8. The star field was dropped

Cut entirely (iteration 12). The gradient and one cloud layer carry the
atmosphere, and the star layer was the source of two separate bugs.

## Things the mockups exposed

Findings that became rules regardless of which palette wins:

1. **Accents must change value between modes, not just flip.** The gold and teal
   that glow on black are washed out on white; they have to be darkened for light
   mode. The tokens must encode two values, not reuse one.
2. **Avatars need a contrast ring that flips with the mode.** A white fursona
   disappears on a light field; a black one disappears on a dark field. For a
   product whose job is displaying other people's characters, this is not a
   detail.
3. **Light mode still has to be light.** A violet vignette is fine and beautiful,
   but if it creeps inward, "light mode" stops being lighter and the setting
   loses its purpose.

### 9. The nebula is an animated canvas over the gradient

Three layers: the gradient underneath (always), the cloud texture on canvas
above it, the content on top. The canvas is `pointer-events: none` and sits
between them — the pattern moonfest already uses, so the platform is
consistent.

Turning the nebula off leaves exactly the gradient, which is why the layers are
split this way rather than baked into one background.

Iteration 14 built this with soft radial blobs and was rejected: it was not the
_cloud_ texture. Iteration 15 renders real fractal noise — five octaves of value
noise, the same structure the SVG filter produced — **once** into two offscreen
tiles, then animates by drifting those tiles past each other. No noise is
recalculated per frame, so it moves for the price of two `drawImage` calls.

### 10. Light dust is solar, dark dust is interstellar

Dark clouds are hydrogen pink and magenta. Light clouds are **orange** — the
sun's atmosphere, because light mode is close to the star.

This only worked after the light gradient was cooled from amber-gold to
**rose-gold**. Orange dust over the original gold field was mush, and the same
orange over rose reads as structure. Measured: hue ≈ 24 (a chromosphere's
red-orange) at luminance 0.85+.

The cooling also fixed something unplanned — the two modes now share a hue
family. Before, dark was violet and light was gold, related only by layout.

### 11. The star is the switch

The dot beside the wordmark toggles the nebula. It dims, shrinks and loses its
glow when off, so it reads as the light source being switched rather than a
control changing state — the star lighting the dust is the real physical
relationship, so the control needs no label.

It is a real `<button>` with `aria-pressed` and an accessible name, wrapped to a
30×30 hit area because the 11px dot alone fails the 24×24 target-size minimum.

## Bugs found along the way

Kept because each one is a rule for the real build, not just an anecdote.

1. **Tofu glyphs** (iteration 10). `✦` was used as a placeholder provider icon
   and no loaded font contained it, so browsers drew the missing-character box.
   **Rule: no glyph-font icons.** Anything decorative is an SVG or a real
   element, or it fails silently on someone else's machine.
2. **The star field was 60% white noise** (iteration 11). The `feColorMatrix`
   alpha row had a _negative_ multiplier, inverting the threshold: instead of
   "only the brightest noise becomes a star", nearly everything rendered opaque.
   Measured at 59.7% of values visible; a star field wants 1–2%.
3. **The cloud SVG never covered the page** (iteration 13). An inline `<svg>` is
   a replaced element, so `position:absolute; inset:0` does **not** stretch it —
   it stayed at its intrinsic 300×150 in the corner. It looked fine in ~300px
   preview cards and became an obvious square at full width. **Rule: any
   full-bleed SVG or canvas needs explicit `width`/`height`.** Reported three
   times before being correctly diagnosed; the first two explanations were
   wrong.

## Deliberately explored and not adopted

**Radial-blob clouds** (iteration 14). The first canvas attempt drew soft
radial gradients, which look like glows rather than cloud structure — it was not
the texture that had been chosen. Kept because the surrounding scaffolding
(device-pixel sizing, reduced-motion handling, the toggle) carried forward
into iteration 15 unchanged.

**A labelled pill toggle** (iterations 14, and 15 before revision). Replaced by
the star itself, which says the same thing without words.

## Shipped

Implemented on 2026-08-12 from
`docs/superpowers/plans/2026-08-12-aeleos-visual-identity.md`. Four things
changed on contact with a real browser, and each is worth recording because the
design as drawn was wrong about them.

**The tiles seamed.** fBm does not repeat, so a tile drawn edge to edge put hard
vertical and horizontal bands across the page. The design never showed this
because the preview never tiled. The noise now runs on a lattice that closes on
itself, and `tilePixels` refuses any size that cannot close.

**It was far too heavy.** The first build painted at full strength and covered
81% of the viewport — a fog, not a nebula, and it competed with the content that
the design's own first rule says it must never compete with. It now sits at 44%
in dark and 37% in light, with the opacity a theme token beside the tints.

**The tint parser was silently wrong.** It split on commas while the tokens are
space-separated, so every frame used the grey fallback. It was caught only
because that fallback is visible by design; a transparent one would have looked
exactly like working code.

**Clerk cannot be themed with `var()`.** It parses `appearance.variables` to
derive its own scale, so a custom property leaves it empty — which gave an
invisible "Continue" button and a black footer strip on a light page. Its
palette is now literal OKLCH per theme, kept in step with the tokens by a test
that parses `globals.css`.

The `Math.imul` note in the journal was also overstated: swapping it for `*`
produces a byte-identical field at these sizes. It stays as the correct explicit
32-bit multiply, not as a fix for a bug it does not fix.

## Resolved

- **Spanish.** Settled by implementing it rather than choosing: the app is
  bilingual through next-intl, using Libra's system. The browser's language
  wins where it is supported and Spanish is the fallback, so `lang` is now the
  negotiated locale instead of a hardcoded `es` above English copy.
- **The nebula preference.** Stored under `aeleos-nebula`, defaulting to on.
  Reduced motion stops the drift but keeps the layer — someone asking for less
  movement has not asked for a plainer product.
- **Keyboard focus on the star.** It is a real `<button>` with a
  `focus-visible` ring, asserted in the unit suite and measured at 30x30 in a
  browser.

## Open

- Drift speed. The cycle is ~90 seconds, deliberately subtle. Nobody has yet
  judged whether it reads as alive or as static on a real page.
- The avatar ring. `--ring` ships with no consumer; whoever adds avatars must
  check it against a pure-white and a pure-black image in both modes, since it
  is translucent and `check:contrast` cannot measure it.
