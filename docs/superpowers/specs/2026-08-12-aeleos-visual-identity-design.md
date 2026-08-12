# AeleOS — Visual Identity — Design

- **Date:** 2026-08-12
- **Status:** Approved for implementation planning
- **Scope:** The look of `apps/hub` — colour, type, layout shell, the nebula
  layer, and how Clerk's components are themed to match. Platform-wide in
  effect: Puck and Janus inherit this system rather than Libra's.
- **Author:** Heiner Angarita (with Claude)
- **Related:** `docs/design/README.md` is the journal — fifteen iterations with
  what was rejected and why. Read it before reopening a settled decision.

---

## 1. The idea

**AeleOS is the space. The fursona is the star.**

This is not decoration. Fursona avatars are every colour imaginable — neon green
dragons, pastel bunnies, monochrome wolves — so any loud brand colour AeleOS
picks will fight them. A deep nebula field is the one backdrop that flatters all
of them: dark, desaturated in its mid-tones, carrying no single hue that clashes.

It also makes the actor picker (Phase 1b-ii) the emotional centre of the
product: choosing which star you are right now.

**The rule that follows, and it outranks everything below:** saturation belongs
to the user. Their avatar is the brightest thing on screen, always. Any change
that competes with an avatar is wrong regardless of how good it looks alone.

## 2. Relationship to Libra

Same bones, different personality.

**Shared:** OKLCH tokens, Tailwind v4 `@theme inline`, the light/dark structure
of `packages/ui/src/styles/colors.css`, and **DM Sans** as the body face.

**Not shared:** the palette, the display face, the components. Libra is
neobrutalist bubblegum — a bright object. AeleOS is the field those objects sit
in.

## 3. Both modes are positions inside one nebula

Not light-versus-dark.

|           | Where you are     | Dust                                            |
| --------- | ----------------- | ----------------------------------------------- |
| **Dark**  | out in the void   | hydrogen pink and magenta, glowing at the edges |
| **Light** | close to the star | solar orange, the sun's atmosphere              |

**No pure white anywhere.** The lightest surface is `oklch(0.99 0.010 40)` —
warm rose, not paper. White broke the fiction immediately when tried.

The pink is astronomically honest: H-alpha emission from ionised hydrogen is why
Orion and Carina photograph pink.

## 4. Tokens

Mirrors Libra's file shape: raw values in `colors.css`, mapped to utilities in a
`@theme inline` block.

### Dark

```css
--ink: oklch(0.96 0.012 340);
--ink-2: oklch(0.8 0.03 330);
--muted: oklch(0.66 0.03 330);
--surface: oklch(0.16 0.04 305 / 0.82);
--bar: oklch(0.14 0.03 305 / 0.55);
--edge: oklch(0.52 0.09 325);
--accent: oklch(0.74 0.18 350);
--on-accent: oklch(0.16 0.04 350);
--ring: oklch(0.99 0 0 / 0.24);
--star: oklch(0.86 0.15 78);
--star-glow: oklch(0.8 0.16 60 / 0.65);
--field: radial-gradient(
  130% 100% at 50% 26%,
  oklch(0.12 0.03 305) 32%,
  oklch(0.22 0.08 332) 68%,
  oklch(0.34 0.12 350) 100%
);
```

### Light

```css
--ink: oklch(0.27 0.045 35);
--ink-2: oklch(0.45 0.045 30);
--muted: oklch(0.5 0.045 30);
--surface: oklch(0.99 0.01 40 / 0.9);
--bar: oklch(1 0 0 / 0.35);
--edge: oklch(0.66 0.075 35);
--accent: oklch(0.46 0.15 25);
--on-accent: oklch(0.98 0.01 40);
--ring: oklch(0.3 0.055 30 / 0.32);
--star: oklch(0.62 0.16 32);
--star-glow: oklch(0.8 0.15 34 / 0.45);
--field: radial-gradient(
  115% 85% at 50% 30%,
  oklch(0.98 0.016 45) 14%,
  oklch(0.93 0.055 35) 40%,
  oklch(0.76 0.1 20) 70%,
  oklch(0.45 0.13 320) 100%
);
```

### Two rules the tokens must encode

1. **Accents carry a different value per mode, not one hue flipped.** The accent
   that glows on black is washed out on white. `0.74` dark versus `0.46` light is
   deliberate.
2. **The avatar ring flips with the mode.** Light ring on dark, dark ring on
   light. Without it a white fursona vanishes on the light field and a black one
   vanishes on the dark field — unacceptable for a product whose job is showing
   other people's characters.

## 5. Measured contrast

Computed, not eyeballed. Every pair passes; most reach AAA.

| Pair                                  | Dark       | Light      |
| ------------------------------------- | ---------- | ---------- |
| heading on card                       | 18.17:1    | 14.73:1    |
| body on card                          | 10.84:1    | 7.32:1     |
| mono ID on card                       | 15.10:1    | —          |
| accent button label                   | 7.78:1     | 7.25:1     |
| **card border** (non-text, needs 3:1) | **3.26:1** | **3.09:1** |

The border row is the one to watch. Both modes originally failed it — 1.59:1 and
1.60:1 — because a hairline that merely _looks_ right is usually invisible to
low vision. **Any new surface must be checked against 3:1, not chosen by eye.**

Dark-on-dark fills cannot be separated by luminance: at those levels the WCAG
formula's flare term dominates, and darkening the card moved 1.14 → 1.21. The
border is the only lever.

## 6. Typography

| Role    | Face               | Why                                                           |
| ------- | ------------------ | ------------------------------------------------------------- |
| Display | **Space Grotesk**  | quirky letterforms give the wordmark character without a logo |
| Body    | **DM Sans**        | shared with Libra — the skeleton                              |
| Mono    | **JetBrains Mono** | engineered to disambiguate `0/O` and `1/l`                    |

Chosen on the platform ID, not the wordmark. Everything looks fine at 26px;
`45242b95-3aed-5bf1-8f67-fd8c8b8c17e6` gets read aloud, pasted into tickets and
compared across apps.

All three are on Google Fonts and **must be self-hosted through `next/font`** —
no runtime request to Google.

## 7. Layout: one shell everywhere

Every page is header bar → content column (max 620px) → cards. Sign-in included:
it is not a centred hero.

Dark and light differ **only by the token block**. Same markup, same layout. A
new page cannot invent a third look without deliberately breaking this.

## 8. The nebula

Three layers:

| z   | Layer              | Notes                                                |
| --- | ------------------ | ---------------------------------------------------- |
| 0   | `--field` gradient | CSS. Always present. This alone is a complete design |
| 1   | cloud canvas       | `pointer-events: none`, toggleable                   |
| 2   | content            |                                                      |

The parent creates its own stacking context (`isolate`), as moonfest does.

**Rendering.** Five octaves of value-noise fBm, computed **once** into two
offscreen tiles, then animated by drifting those tiles past each other at
different speeds. No noise is recalculated per frame — the animation costs two
`drawImage` calls. Tiles are rendered small and scaled up; the blur is intended.

**Tints.** Dark blends `screen` (dust emits light); light blends `multiply`
(dust absorbs it). Same texture, inverted physics.

**Motion.** ~90-second cycle. Under `prefers-reduced-motion` it renders one
static frame rather than disappearing — the nebula is the design, not an
embellishment.

**The toggle is the star.** The dot beside the wordmark switches it: it dims,
shrinks and loses its glow, so it reads as the light source going out. A real
`<button>` with `aria-pressed` and an accessible name, wrapped to a 30×30 hit
area — the 11px dot alone fails the 24×24 target-size minimum.

The preference persists per person and defaults to on. `prefers-reduced-motion`
forces motion off regardless of what is stored.

## 9. Clerk

Sign-in is Clerk's component inside our shell. We own the page — header,
gradient, canvas, column — and theme the card through `appearance`:

- `appearance.variables` for `colorPrimary`, `colorForeground`, fonts, radius
- `appearance.elements` for `card` and `footer` (the footer sits outside `card`
  but inside `cardBox`, and needs the same background or it shows grey)
- `appearance.options.logoImageUrl` for the star

Provider logos come from Clerk. **Production launches with Discord only** —
Google and Facebook follow, so the sign-in page will show fewer options after
the production swap, not more.

## 10. Component foundation

Adopt Radix primitives with `class-variance-authority`, `clsx`, `tailwind-merge`
and `lucide-react` — the same stack as Libra's `packages/ui`, since Phase 1b-ii
needs avatar, dialog and dropdown, and hand-rolling an accessible dropdown is
the wrong place to save dependencies. Components themselves are AeleOS's own,
not copies of Libra's.

## 11. Two rules learned by shipping the bug

Both are in the journal with the failure that produced them.

1. **No glyph-font icons.** A placeholder `✦` rendered as a tofu box because no
   loaded font contained it. Anything decorative is an SVG or a real element.
2. **Any full-bleed `<svg>` or `<canvas>` needs explicit `width`/`height`.**
   They are replaced elements: `position: absolute; inset: 0` does **not**
   stretch them. An inline SVG stayed at its intrinsic 300×150 in the corner,
   looked fine in preview cards, and was an obvious square at full width. It was
   reported three times and misdiagnosed twice.

A third is worth stating as a habit rather than a rule: **filter and noise maths
fails silently.** Two separate bugs produced either nothing (0% painted) or
everything (59.7% coverage) with no error. Measure the output distribution; do
not trust that it looks plausible.

## 12. Not covered

- Whether the hub is in Spanish. `layout.tsx` sets `lang="es"` while every
  string is English — one of them is wrong, and it is a product decision.
- A logo. The star currently does that job and may be enough.
- Motion beyond the nebula drift — transitions, page changes, the picker's
  animation.
- Puck and Janus adopting the system. This spec is the source they would take
  it from.
