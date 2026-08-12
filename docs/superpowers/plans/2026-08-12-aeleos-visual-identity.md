# AeleOS Visual Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The hub looks like the design — nebula field, rose-gold light and hydrogen-pink dark, the star that switches the nebula — with the Clerk card themed to match instead of a white box on a dark page.

**Architecture:** OKLCH tokens in `[data-theme]` blocks, mapped once through Tailwind v4's `@theme inline`. Three page layers: a CSS gradient that is always present, a canvas cloud overlay that can be switched off, and content above both. The canvas keeps its logic in pure, tested modules and its imperative drawing thin.

**Tech Stack:** Tailwind v4, `next/font` (self-hosted Space Grotesk, DM Sans, JetBrains Mono), Canvas 2D, Clerk's `appearance` prop, Vitest, Playwright.

## Global Constraints

- **This plan follows `docs/superpowers/specs/2026-08-12-aeleos-visual-identity-design.md`.** Read it, and `docs/design/README.md` for what was already rejected.
- **Saturation belongs to the user.** The fursona avatar is the brightest thing on screen, always. Any change that competes with an avatar is wrong regardless of how good it looks alone. This outranks every other rule here.
- **The documentation and test standards apply.** Every export carries TSDoc stating its contract; every export is tested on its happy path and each failure mode; `pnpm check:docs` must stay green. See `2026-08-12-documentation-and-test-standards-design.md`.
- **No glyph-font icons.** A placeholder `✦` shipped as a tofu box during design. Anything decorative is an SVG or a real element.
- **Any full-bleed `<svg>` or `<canvas>` needs explicit `width`/`height`.** They are replaced elements — `position: absolute; inset: 0` does not stretch them. This cost four iterations to find.
- **Contrast is measured, never eyeballed.** Text 4.5:1, non-text 3:1. `scripts/check-contrast.mjs` (Task 1) exists so this is a command, not a judgement.
- **Filter and noise maths fails silently**, producing nothing or everything with no error. Assert on the output distribution.
- **This is not the Next.js you know.** `apps/hub/AGENTS.md` is explicit: read the relevant guide in `apps/hub/node_modules/next/dist/docs/` before writing code against a Next API. That applies directly here — `next/font` and the root layout are both touched.
- **Branch from an explicit base:** `git checkout -b <name> origin/main`.
- **Budget: $0.** All three fonts are Google Fonts, self-hosted at build time — no runtime request, no service.
- Steps marked 🧑 are human-only.

## What this plan does NOT cover

- **Radix / shadcn primitives.** Spec §10 adopts them, but nothing here needs a dialog, dropdown or avatar — those arrive with the picker. Adding fourteen dependencies before a consumer exists is speculative; **deferred to the Phase 1b-ii plan**, which is where the spec's own justification applies.
- Whether the hub is in Spanish (`lang="es"` with English copy). A product decision.
- A logo beyond the star.
- Motion beyond the nebula drift.

## File structure

| File                                        | Responsibility                               |
| ------------------------------------------- | -------------------------------------------- |
| `apps/hub/src/app/globals.css`              | tokens, both themes, `@theme inline` mapping |
| `apps/hub/src/lib/fonts.ts`                 | the three self-hosted faces                  |
| `apps/hub/src/lib/theme.ts`                 | resolving stored + system preference — pure  |
| `apps/hub/src/lib/nebula-noise.ts`          | fBm value noise and tile pixels — pure       |
| `apps/hub/src/components/nebula-canvas.tsx` | the canvas layer, thin                       |
| `apps/hub/src/components/star-toggle.tsx`   | the star that switches it                    |
| `apps/hub/src/components/page-shell.tsx`    | header, content column                       |
| `scripts/check-contrast.mjs`                | contrast as a command                        |

---

### Task 1: Contrast as a command, not a judgement

Built first because every later task needs it, and because "measure, do not eyeball" is unenforceable without it.

**Files:**

- Create: `scripts/check-contrast.mjs`, `scripts/check-contrast.d.mts`
- Test: `tests/tools/contrast.test.ts`

**Interfaces:**

- Produces: `oklchToSrgb(l, c, h)`, `contrastRatio(fg, bg)`, and a CLI that checks the token pairs from spec §5 and exits non-zero on a regression.

- [ ] **Step 1: Write the failing test**

`tests/tools/contrast.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { contrastRatio, oklchToSrgb } from "../../scripts/check-contrast.mjs";

describe("oklchToSrgb", () => {
  it("converts white", () => {
    const [r, g, b] = oklchToSrgb(1, 0, 0);
    expect(r).toBeCloseTo(1, 2);
    expect(g).toBeCloseTo(1, 2);
    expect(b).toBeCloseTo(1, 2);
  });

  it("converts black", () => {
    expect(oklchToSrgb(0, 0, 0).every((c) => c < 0.01)).toBe(true);
  });

  it("clamps values outside the sRGB gamut rather than returning them", () => {
    // A very saturated colour at high lightness is not representable.
    expect(oklchToSrgb(0.99, 0.4, 150).every((c) => c >= 0 && c <= 1)).toBe(
      true,
    );
  });
});

describe("contrastRatio", () => {
  it("gives 21:1 for black on white", () => {
    expect(contrastRatio([0, 0, 0], [1, 0, 0])).toBeCloseTo(21, 0);
  });

  it("gives 1:1 for a colour against itself", () => {
    expect(contrastRatio([0.5, 0.1, 30], [0.5, 0.1, 30])).toBeCloseTo(1, 2);
  });

  it("is order-independent", () => {
    const a = [0.27, 0.045, 35];
    const b = [0.99, 0.01, 40];
    expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 4);
  });

  // The figure the design actually depends on.
  it("reproduces the measured light body-text ratio", () => {
    expect(contrastRatio([0.45, 0.045, 30], [0.99, 0.01, 40])).toBeGreaterThan(
      7,
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test:tools`
Expected: FAIL — cannot resolve `../../scripts/check-contrast.mjs`.

- [ ] **Step 3: Implement**

`scripts/check-contrast.mjs`. The conversion is the standard OKLab matrix; the gamut clamp is what stops an out-of-range colour producing a nonsense ratio.

```js
/**
 * Contrast checking for the OKLCH tokens, so "measure, do not eyeball" is a
 * command rather than an instruction.
 *
 * Two of the design's borders originally failed the 3:1 non-text minimum at
 * 1.59:1 and 1.60:1 — both looked correct. This exists so that class of mistake
 * fails a build instead of shipping.
 */

/**
 * Converts an OKLCH colour to gamma-encoded sRGB.
 *
 * @param l - lightness, 0 to 1.
 * @param c - chroma.
 * @param h - hue in degrees.
 * @returns the sRGB channels, each clamped to 0..1.
 */
export function oklchToSrgb(l, c, h) {
  const rad = (h * Math.PI) / 180;
  const a = c * Math.cos(rad);
  const b2 = c * Math.sin(rad);
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b2;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b2;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b2;
  const L = l_ ** 3;
  const M = m_ ** 3;
  const S = s_ ** 3;
  const lin = [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ];
  return lin.map((v) => {
    const clamped = Math.max(0, Math.min(1, v));
    return clamped <= 0.0031308
      ? 12.92 * clamped
      : 1.055 * clamped ** (1 / 2.4) - 0.055;
  });
}

/**
 * Relative luminance of a gamma-encoded sRGB triple, per WCAG.
 *
 * @param rgb - the sRGB channels, 0..1.
 * @returns the relative luminance.
 */
function luminance(rgb) {
  const [r, g, b] = rgb.map((ch) =>
    ch <= 0.04045 ? ch / 12.92 : ((ch + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * WCAG contrast ratio between two OKLCH colours.
 *
 * @param fg - foreground as `[l, c, h]`.
 * @param bg - background as `[l, c, h]`.
 * @returns the ratio, from 1 to 21.
 */
export function contrastRatio(fg, bg) {
  const a = luminance(oklchToSrgb(...fg));
  const b = luminance(oklchToSrgb(...bg));
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/** The pairs the design depends on, with the minimum each must clear. */
const PAIRS = [
  ["dark: heading on card", [0.96, 0.012, 340], [0.16, 0.04, 305], 4.5],
  ["dark: body on card", [0.8, 0.03, 330], [0.16, 0.04, 305], 4.5],
  ["dark: card border", [0.52, 0.09, 325], [0.16, 0.04, 305], 3],
  ["dark: accent label", [0.16, 0.04, 350], [0.74, 0.18, 350], 4.5],
  ["light: heading on card", [0.27, 0.045, 35], [0.99, 0.01, 40], 4.5],
  ["light: body on card", [0.45, 0.045, 30], [0.99, 0.01, 40], 4.5],
  ["light: card border", [0.66, 0.075, 35], [0.99, 0.01, 40], 3],
  ["light: accent label", [0.98, 0.01, 40], [0.46, 0.15, 25], 4.5],
];

/**
 * Checks every pair and reports failures.
 *
 * @returns nothing; exits non-zero when any pair is below its minimum.
 */
function main() {
  let failed = 0;
  for (const [label, fg, bg, min] of PAIRS) {
    const ratio = contrastRatio(fg, bg);
    const ok = ratio >= min;
    if (!ok) failed += 1;
    console.log(
      `${ok ? "  " : "✗ "}${label.padEnd(28)} ${ratio.toFixed(2)}:1 (needs ${min})`,
    );
  }
  if (failed) {
    console.error(`\n${failed} pair(s) below the minimum.`);
    process.exit(1);
  }
  console.log("\nAll token pairs clear their minimum.");
}

if (process.argv[1]?.endsWith("check-contrast.mjs")) main();
```

Write `scripts/check-contrast.d.mts` declaring both exports, mirroring `check-doc-freshness.d.mts`.

- [ ] **Step 4: Run the tests**

Run: `pnpm test:tools`
Expected: PASS — 16 tests (9 existing plus 7).

- [ ] **Step 5: Prove the CLI bites**

```bash
node scripts/check-contrast.mjs
```

Expected: every pair listed, exit 0.

Then temporarily change the light card border in `PAIRS` from `0.66` to `0.84` — the value that originally failed — and re-run.
Expected: `✗ light: card border 1.60:1 (needs 3)`, exit 1. Restore.

- [ ] **Step 6: Wire in and commit**

Add `"check:contrast": "node scripts/check-contrast.mjs"` and append it to `check:tools`.

```bash
git add scripts/check-contrast.mjs scripts/check-contrast.d.mts tests/tools/contrast.test.ts package.json
git commit -m "feat(tools): check token contrast as a command"
```

---

### Task 2: Tokens and fonts

**Files:**

- Modify: `apps/hub/src/app/globals.css`, `apps/hub/src/app/layout.tsx`
- Create: `apps/hub/src/lib/fonts.ts`

**Interfaces:**

- Produces: `--color-ink`, `--color-surface`, `--color-edge`, `--color-accent`, `--color-star`, `--font-display`, `--font-sans`, `--font-mono` as Tailwind utilities; `[data-theme="dark"]` swapping the values.

- [ ] **Step 1: The fonts**

`apps/hub/src/lib/fonts.ts`:

```ts
import { DM_Sans, JetBrains_Mono, Space_Grotesk } from "next/font/google";

/**
 * The display face, used for the wordmark and headings.
 *
 * Self-hosted by `next/font` at build time: no runtime request to Google, which
 * keeps the $0 constraint and removes a third-party dependency from page load.
 */
export const display = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-display",
  display: "swap",
});

/**
 * The body face, deliberately shared with Libra — it is the platform's
 * skeleton, while the display and mono faces are AeleOS's own.
 */
export const sans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-sans",
  display: "swap",
});

/**
 * The monospace face, used for every platform ID and handle.
 *
 * Chosen for disambiguating `0`/`O` and `1`/`l`: these strings are read aloud,
 * pasted into tickets and compared across apps, so legibility at length matters
 * more than character.
 */
export const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});
```

- [ ] **Step 2: The tokens**

Replace `apps/hub/src/app/globals.css`. Light is `:root`; dark is `[data-theme="dark"]`; the mapping is written once.

```css
@import "tailwindcss";

/*
 * Light is the default and dark is the override, matching Libra's file shape.
 * Values are OKLCH so lightness is perceptually even — which is what let the
 * contrast figures in the design be reasoned about rather than guessed.
 *
 * Accents carry a different lightness per theme, not one hue flipped: the
 * accent that glows on black is washed out on white.
 */
:root {
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
}

[data-theme="dark"] {
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
}

@theme inline {
  --color-ink: var(--ink);
  --color-ink-2: var(--ink-2);
  --color-muted: var(--muted);
  --color-surface: var(--surface);
  --color-bar: var(--bar);
  --color-edge: var(--edge);
  --color-accent: var(--accent);
  --color-on-accent: var(--on-accent);
  --color-star: var(--star);
  --font-display: var(--font-display);
  --font-sans: var(--font-sans);
  --font-mono: var(--font-mono);
}

body {
  background: var(--field);
  background-attachment: fixed;
  color: var(--ink);
  font-family: var(--font-sans), system-ui, sans-serif;
}
```

Note the two rules the tokens encode, both already reflected above: the accent's **lightness differs per mode** (`0.74` dark, `0.46` light) rather than being one hue flipped, and `--ring` **flips with the mode** — light on dark, dark on light. The ring exists now, unused, because a white fursona vanishes on the light field and a black one vanishes on the dark field, and the component that needs it arrives in Phase 1b-ii. Leave a comment in `globals.css` saying so, or it will read as a dead token and get deleted.

`--ring` is semi-transparent, so `check:contrast` cannot measure it — the checker compares opaque colours and would need alpha compositing to be honest about a translucent overlay. **Its verification is a manual one against a pure-white and a pure-black avatar, and it belongs to the task that introduces avatars.** Do not add it to `PAIRS` and pretend it was measured.

- [ ] **Step 3: Apply the fonts in the root layout**

In `apps/hub/src/app/layout.tsx`, put the three variables on `<html>` (which already carries `lang="es"`) and drop the hardcoded `bg-neutral-950 text-neutral-100` from `<body>` — the tokens own that now.

```tsx
<html
  lang="es"
  className={`${display.variable} ${sans.variable} ${mono.variable}`}
>
  <body className="min-h-screen antialiased">{children}</body>
</html>
```

Update the layout's TSDoc: it must now record that the font variables live on `<html>` because `body` reads them.

- [ ] **Step 4: Verify**

```bash
pnpm --filter hub build && pnpm check:contrast && pnpm lint && pnpm typecheck
```

Expected: all exit 0. The build must not warn about fonts.

- [ ] **Step 5: Commit**

```bash
git add apps/hub/src/app/globals.css apps/hub/src/lib/fonts.ts apps/hub/src/app/layout.tsx
git commit -m "feat(hub): design tokens and self-hosted fonts"
```

---

### Task 3: Theme resolution, without a flash

The theme must be on `<html>` before first paint. Getting this wrong shows a white page for one frame on every load, which is worse than having no light theme at all.

**Files:**

- Create: `apps/hub/src/lib/theme.ts`
- Test: `apps/hub/tests/theme.test.ts`
- Modify: `apps/hub/src/app/layout.tsx`

**Interfaces:**

- Produces: `resolveTheme(stored: string | null, prefersDark: boolean): "light" | "dark"` and `THEME_SCRIPT`, a string injected before paint.

- [ ] **Step 1: Write the failing test**

`apps/hub/tests/theme.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveTheme, THEME_SCRIPT } from "@/lib/theme";

describe("resolveTheme", () => {
  it("uses a stored choice over the system preference", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("falls back to the system preference when nothing is stored", () => {
    expect(resolveTheme(null, true)).toBe("dark");
    expect(resolveTheme(null, false)).toBe("light");
  });

  // Storage is user-writable and survives deploys, so a value that is no longer
  // valid must not produce `data-theme="garbage"` and an unstyled page.
  it("ignores a stored value that is not a theme", () => {
    expect(resolveTheme("neon", true)).toBe("dark");
    expect(resolveTheme("", false)).toBe("light");
  });
});

describe("THEME_SCRIPT", () => {
  it("sets the attribute before paint rather than after hydration", () => {
    expect(THEME_SCRIPT).toContain("documentElement");
    expect(THEME_SCRIPT).toContain("data-theme");
  });

  it("cannot throw, because a failure here leaves the page unstyled", () => {
    expect(THEME_SCRIPT).toContain("try");
    expect(THEME_SCRIPT).toContain("catch");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter hub test`
Expected: FAIL — cannot resolve `@/lib/theme`.

- [ ] **Step 3: Implement**

```ts
/** The themes this app has. Anything else stored is treated as absent. */
const THEMES = ["light", "dark"] as const;

/** A theme this app can render. */
export type Theme = (typeof THEMES)[number];

/**
 * Decides which theme to render.
 *
 * A stored choice wins over the system preference, because it is the more
 * specific signal. Anything stored that is not a known theme is treated as
 * absent rather than trusted — the value is user-writable and outlives
 * deploys, so a stale one must not leave the page unstyled.
 *
 * @param stored - the persisted choice, or null when there is none.
 * @param prefersDark - whether the system asks for dark.
 * @returns the theme to put on the document element.
 */
export function resolveTheme(
  stored: string | null,
  prefersDark: boolean,
): Theme {
  if (stored && (THEMES as readonly string[]).includes(stored)) {
    return stored as Theme;
  }
  return prefersDark ? "dark" : "light";
}

/**
 * The script that sets `data-theme` before first paint.
 *
 * Injected synchronously in `<head>`: doing this after hydration shows a
 * light-themed frame to every dark-mode visitor on every load. It is wrapped in
 * try/catch because storage throws in some privacy modes, and an exception here
 * would leave the document with no theme at all.
 */
export const THEME_SCRIPT = `
try {
  var s = localStorage.getItem("aeleos-theme");
  var d = window.matchMedia("(prefers-color-scheme: dark)").matches;
  var t = s === "light" || s === "dark" ? s : (d ? "dark" : "light");
  document.documentElement.setAttribute("data-theme", t);
} catch (e) {
  document.documentElement.setAttribute("data-theme", "light");
}
`.trim();
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter hub test`
Expected: PASS.

- [ ] **Step 5: Inject before paint**

In `layout.tsx`, inside `<head>`:

```tsx
<head>
  <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
</head>
```

Record in the layout's TSDoc why the script is inline and synchronous.

- [ ] **Step 6: Prove there is no flash** 🧑

`pnpm dev`, set the OS to dark, hard-reload, and watch the first frame. Expected: no white flash. Repeat with a stored light preference while the OS is dark.

- [ ] **Step 7: Commit**

```bash
git add apps/hub/src/lib/theme.ts apps/hub/tests/theme.test.ts apps/hub/src/app/layout.tsx
git commit -m "feat(hub): resolve the theme before first paint"
```

---

### Task 4: The nebula's pure core

The noise and the preference logic are pure and therefore testable. The canvas work in Task 5 stays thin on top of them, which is what keeps the standards satisfiable.

**Files:**

- Create: `apps/hub/src/lib/nebula-noise.ts`, `apps/hub/src/lib/nebula-preference.ts`
- Test: `apps/hub/tests/nebula-noise.test.ts`, `apps/hub/tests/nebula-preference.test.ts`

**Interfaces:**

- Produces: `fbm(x, y, seed)`, `tilePixels(width, height, options)`, and `resolveNebula(stored, prefersReducedMotion)`.

- [ ] **Step 1: Write the failing noise test**

`apps/hub/tests/nebula-noise.test.ts`. The distribution assertions matter most: this exact maths has failed twice, once producing nothing and once producing everything, with no error either time.

```ts
import { describe, expect, it } from "vitest";
import { fbm, tilePixels } from "@/lib/nebula-noise";

describe("fbm", () => {
  it("stays within 0 and 1", () => {
    for (let i = 0; i < 200; i++) {
      const v = fbm(i * 0.37, i * 0.11, 7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("is deterministic for the same seed", () => {
    expect(fbm(3.5, 2.5, 7)).toBe(fbm(3.5, 2.5, 7));
  });

  it("differs between seeds, or every layer would be identical", () => {
    expect(fbm(3.5, 2.5, 7)).not.toBe(fbm(3.5, 2.5, 23));
  });

  // The bug this catches: a hash biased low made fbm average 0.24 against a
  // 0.42 threshold, so every pixel clamped to zero and the canvas was blank.
  it("has a median near the middle of its range", () => {
    const values = [];
    for (let y = 0; y < 60; y++) {
      for (let x = 0; x < 60; x++) values.push(fbm(x / 26, y / 26, 7));
    }
    values.sort((a, b) => a - b);
    const median = values[Math.floor(values.length / 2)];
    expect(median).toBeGreaterThan(0.35);
    expect(median).toBeLessThan(0.65);
  });
});

describe("tilePixels", () => {
  const opts = {
    seed: 7,
    rgb: [200, 80, 160] as [number, number, number],
    gain: 2.4,
    bias: 0.44,
  };

  it("returns four channels per pixel", () => {
    expect(tilePixels(8, 4, opts).length).toBe(8 * 4 * 4);
  });

  it("paints the requested colour", () => {
    const px = tilePixels(4, 4, opts);
    expect(px[0]).toBe(200);
    expect(px[1]).toBe(80);
    expect(px[2]).toBe(160);
  });

  // Cloud coverage: neither blank nor a solid sheet. Both have shipped.
  it("produces partial coverage rather than nothing or everything", () => {
    const px = tilePixels(60, 60, opts);
    let visible = 0;
    for (let i = 3; i < px.length; i += 4) if (px[i] > 8) visible++;
    const pct = (visible / (px.length / 4)) * 100;
    expect(pct).toBeGreaterThan(20);
    expect(pct).toBeLessThan(95);
  });

  it("rejects a non-positive size rather than returning an empty buffer", () => {
    expect(() => tilePixels(0, 10, opts)).toThrow(/positive/i);
    expect(() => tilePixels(10, -1, opts)).toThrow(/positive/i);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter hub test`
Expected: FAIL — cannot resolve `@/lib/nebula-noise`.

- [ ] **Step 3: Implement the noise**

```ts
/**
 * A 32-bit integer hash.
 *
 * `Math.imul` keeps every step in 32 bits. A plain `*` overflows the double and
 * skews the distribution low, which once made the whole canvas transparent
 * because fbm never crossed its threshold.
 *
 * @param x - grid x.
 * @param y - grid y.
 * @param seed - layer seed.
 * @returns a value in [0, 1).
 */
function hash(x: number, y: number, seed: number): number {
  let n =
    Math.imul(x | 0, 374761393) ^
    Math.imul(y | 0, 668265263) ^
    Math.imul(seed | 0, 1274126177);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}

/**
 * Smoothstep, so noise cells blend instead of showing a grid.
 *
 * @param t - position within a cell, 0 to 1.
 * @returns the eased position.
 */
const smooth = (t: number): number => t * t * (3 - 2 * t);

/**
 * Bilinearly interpolated value noise.
 *
 * @param x - sample x.
 * @param y - sample y.
 * @param seed - layer seed.
 * @returns a value in [0, 1].
 */
function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = smooth(x - xi);
  const yf = smooth(y - yi);
  const a = hash(xi, yi, seed);
  const b = hash(xi + 1, yi, seed);
  const c = hash(xi, yi + 1, seed);
  const d = hash(xi + 1, yi + 1, seed);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}

/**
 * Fractional Brownian motion — five octaves of value noise.
 *
 * This is the cloud structure; a single octave reads as blur rather than dust.
 *
 * @param x - sample x.
 * @param y - sample y.
 * @param seed - layer seed.
 * @returns a value in [0, 1], with a median near 0.5.
 */
export function fbm(x: number, y: number, seed: number): number {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  for (let octave = 0; octave < 5; octave++) {
    value +=
      valueNoise(x * frequency, y * frequency, seed + octave * 17) * amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return Math.min(1, value);
}

/** How a cloud tile is tinted and thresholded. */
export interface TileOptions {
  /** Layer seed, so two tiles differ. */
  seed: number;
  /** The tint, as 0–255 channels. */
  rgb: [number, number, number];
  /** Multiplier applied after the bias; higher means harder edges. */
  gain: number;
  /** Noise below this becomes fully transparent. */
  bias: number;
}

/**
 * RGBA pixels for one cloud tile.
 *
 * Rendered once and then drifted, so the cost is paid at setup rather than per
 * frame.
 *
 * @param width - tile width in pixels.
 * @param height - tile height in pixels.
 * @param options - tint and threshold.
 * @returns RGBA bytes, four per pixel.
 * @throws when width or height is not positive — a zero-sized tile would
 * silently produce an invisible layer rather than an error.
 */
export function tilePixels(
  width: number,
  height: number,
  options: TileOptions,
): Uint8ClampedArray {
  if (width <= 0 || height <= 0) {
    throw new Error("tilePixels needs a positive width and height");
  }
  const { seed, rgb, gain, bias } = options;
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const n = fbm(x / 26, y / 26, seed);
      const alpha = Math.max(0, Math.min(1, (n - bias) * gain));
      const i = (y * width + x) * 4;
      out[i] = rgb[0];
      out[i + 1] = rgb[1];
      out[i + 2] = rgb[2];
      out[i + 3] = alpha * 255;
    }
  }
  return out;
}
```

- [ ] **Step 4: Write the failing preference test**

`apps/hub/tests/nebula-preference.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveNebula } from "@/lib/nebula-preference";

describe("resolveNebula", () => {
  it("is on by default, so nobody must find a setting to see the design", () => {
    expect(resolveNebula(null, false)).toEqual({
      enabled: true,
      animated: true,
    });
  });

  it("honours an explicit off", () => {
    expect(resolveNebula("off", false)).toEqual({
      enabled: false,
      animated: false,
    });
  });

  it("honours an explicit on", () => {
    expect(resolveNebula("on", false)).toEqual({
      enabled: true,
      animated: true,
    });
  });

  // Reduced motion keeps the nebula and stops the drift: removing it entirely
  // would give a plainer product to people who asked only for less movement.
  it("keeps the nebula but stops the motion under reduced motion", () => {
    expect(resolveNebula(null, true)).toEqual({
      enabled: true,
      animated: false,
    });
    expect(resolveNebula("on", true)).toEqual({
      enabled: true,
      animated: false,
    });
  });

  it("still respects off under reduced motion", () => {
    expect(resolveNebula("off", true)).toEqual({
      enabled: false,
      animated: false,
    });
  });

  it("treats an unrecognised stored value as unset", () => {
    expect(resolveNebula("maybe", false)).toEqual({
      enabled: true,
      animated: true,
    });
  });
});
```

- [ ] **Step 5: Run it to verify it fails, then implement**

```ts
/** Whether the nebula renders, and whether it moves. */
export interface NebulaState {
  /** Whether the cloud layer renders at all. */
  enabled: boolean;
  /** Whether it drifts. False under reduced motion. */
  animated: boolean;
}

/**
 * Decides whether the nebula renders and whether it moves.
 *
 * On by default: the nebula is the design, and nobody should have to find a
 * setting to see it. Reduced motion stops the drift but keeps the layer —
 * someone asking for less movement has not asked for a plainer product.
 *
 * @param stored - the persisted choice, or null when there is none.
 * @param prefersReducedMotion - whether the system asks for reduced motion.
 * @returns whether to render the layer, and whether to animate it.
 */
export function resolveNebula(
  stored: string | null,
  prefersReducedMotion: boolean,
): NebulaState {
  const enabled = stored === "off" ? false : true;
  return { enabled, animated: enabled && !prefersReducedMotion };
}
```

- [ ] **Step 6: Verify and commit**

```bash
pnpm --filter hub test:coverage && pnpm lint && pnpm typecheck
```

Expected: all exit 0, coverage still above its thresholds. **If branch coverage has risen, raise the threshold to the new floor in the same commit** — the ratchet only works if it is turned.

```bash
git add apps/hub/src/lib/nebula-noise.ts apps/hub/src/lib/nebula-preference.ts apps/hub/tests/nebula-*.test.ts apps/hub/vitest.config.ts
git commit -m "feat(hub): the nebula's pure core, with its distribution asserted"
```

---

### Task 5: The canvas layer and the star

**Files:**

- Create: `apps/hub/src/components/nebula-canvas.tsx`, `apps/hub/src/components/star-toggle.tsx`
- Test: `apps/hub/tests/star-toggle.test.tsx`

**Interfaces:**

- Consumes: Task 4's `tilePixels` and `resolveNebula`.
- Produces: `<NebulaCanvas />` and `<StarToggle pressed onToggle />`.

- [ ] **Step 1: Write the failing toggle test**

`apps/hub/tests/star-toggle.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { StarToggle } from "@/components/star-toggle";

describe("StarToggle", () => {
  it("exposes its state to assistive technology", () => {
    render(<StarToggle pressed onToggle={vi.fn()} />);
    expect(screen.getByRole("button", { pressed: true })).toBeInTheDocument();
  });

  it("has an accessible name, since it is an unlabelled dot", () => {
    render(<StarToggle pressed onToggle={vi.fn()} />);
    expect(screen.getByRole("button", { name: /nebula/i })).toBeInTheDocument();
  });

  it("reports pressed=false when the nebula is off", () => {
    render(<StarToggle pressed={false} onToggle={vi.fn()} />);
    expect(screen.getByRole("button", { pressed: false })).toBeInTheDocument();
  });

  it("calls back on click", () => {
    const onToggle = vi.fn();
    render(<StarToggle pressed onToggle={onToggle} />);
    screen.getByRole("button").click();
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  // The 11px dot alone is below the 24x24 target minimum, so the hit area is
  // the button around it. A class assertion is a proxy — the real check is the
  // e2e measurement in Task 7.
  it("puts the hit area on the button, not the dot", () => {
    render(<StarToggle pressed onToggle={vi.fn()} />);
    expect(screen.getByRole("button").className).toMatch(
      /h-\[30px\]|size-\[30px\]/,
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails, then implement the toggle**

```tsx
"use client";

/** What the star needs to render and report. */
export interface StarToggleProps {
  /** Whether the nebula is currently on. */
  pressed: boolean;
  /** Called when the star is activated. */
  onToggle: () => void;
}

/**
 * The star beside the wordmark, which switches the nebula.
 *
 * It dims, shrinks and loses its glow when off, so it reads as the light source
 * going out rather than a control changing state — the star lighting the dust
 * is the real relationship, which is why this needs no visible label.
 *
 * The 11px dot sits inside a 30px button because the dot alone is below the
 * 24×24 minimum target size.
 */
export function StarToggle({ pressed, onToggle }: StarToggleProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label="Nebula background"
      onClick={onToggle}
      className="grid size-[30px] -ml-2 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <span
        className={`size-[11px] rounded-full transition-all duration-300 ${
          pressed
            ? "bg-star shadow-[0_0_16px_4px_var(--star-glow)]"
            : "scale-75 bg-muted"
        }`}
      />
    </button>
  );
}
```

- [ ] **Step 3: Implement the canvas**

`nebula-canvas.tsx`. The width and height attributes are set explicitly in an effect — a canvas is a replaced element, and `inset-0` alone leaves it at its intrinsic 300×150.

Key requirements, each traceable to the design:

- `position: fixed; inset: 0; pointer-events: none;` under the content, as moonfest does, with `isolate` on the parent so the layer stacks inside its own context rather than against whatever the page happens to contain
- `width`/`height` set in device pixels, capped at DPR 2, recomputed on resize
- two tiles from `tilePixels`, built once per size and drifted with `drawImage`
- `globalCompositeOperation`: `screen` in dark, `multiply` in light
- one static frame when `animated` is false, rather than nothing

Read the theme from `document.documentElement.dataset.theme` and observe it, since the tint must flip with the theme.

- [ ] **Step 4: Run the tests and verify coverage**

```bash
pnpm --filter hub test:coverage
```

Expected: PASS. Raise the coverage floor if it has risen.

- [ ] **Step 5: Prove the canvas actually paints**

A canvas that renders nothing is the failure that has happened twice, and it produces no error. In the browser at `pnpm dev`, run in the console:

```js
const c = document.querySelector("canvas");
const g = c.getContext("2d");
const d = g.getImageData(0, 0, 400, 400).data;
let painted = 0;
for (let i = 3; i < d.length; i += 4) if (d[i] > 6) painted++;
console.log(
  "painted %",
  ((painted / (d.length / 4)) * 100).toFixed(1),
  c.width + "x" + c.height,
);
```

Expected: between 20% and 95%, and `c.width` matching the viewport times DPR — not `300x150`.

- [ ] **Step 6: Commit**

```bash
git add apps/hub/src/components apps/hub/tests/star-toggle.test.tsx
git commit -m "feat(hub): the nebula canvas and the star that switches it"
```

---

### Task 6: The shell, and theming Clerk

**Files:**

- Create: `apps/hub/src/components/page-shell.tsx`
- Modify: `apps/hub/src/app/(app)/layout.tsx`, `apps/hub/src/app/(app)/me/page.tsx`, `apps/hub/src/app/page.tsx`, `apps/hub/src/app/sign-in/[[...sign-in]]/page.tsx`, `apps/hub/src/app/(app)/error.tsx`

**Interfaces:**

- Produces: `<PageShell>` — header with star and wordmark, 620px content column.

- [ ] **Step 1: Build the shell**

One composition for every page. Sign-in is not a centred hero: it uses the same header, the same column and the same cards, so dark and light differ only by the token block.

- [ ] **Step 2: Apply it to all four pages**

Home, sign-in, `/me` and the error boundary. The error boundary keeps its current behaviour — it must still not leak the raw message.

- [ ] **Step 3: Theme Clerk**

In `sign-in/[[...sign-in]]/page.tsx`, pass `appearance` to `<SignIn />`:

- `variables`: `colorPrimary` from `--accent`, `colorForeground` from `--ink`, `fontFamily` from `--font-sans`, `borderRadius`
- `elements`: `card` and **`footer`** — the footer sits outside `card` but inside `cardBox` and stays grey unless given the same background
- `options.logoImageUrl` for the star

Clerk renders the provider logos; **do not add glyph icons**.

The dev instance currently shows Google, Discord and Facebook. **Production launches with Discord only** — so the sign-in page will show _fewer_ buttons after the production swap, not more. Do not hard-code a three-button layout, and do not treat the reduction as a regression when it happens.

- [ ] **Step 4: Verify by eye and by suite** 🧑

`pnpm dev`, then check both themes on `/`, `/sign-in`, `/me`:

- the Clerk card matches the surface rather than sitting white on the field
- avatars remain the brightest thing on screen
- the star switches the nebula, and the page still reads with it off

```bash
pnpm --filter hub test:e2e
```

Expected: 3 passed. Fix the suite if the shell changed what it asserts.

- [ ] **Step 5: Commit**

```bash
git add apps/hub/src
git commit -m "feat(hub): one shell everywhere, and Clerk themed to match"
```

---

### Task 7: Prove it in a browser, and record it

**Files:**

- Modify: `apps/hub/tests/e2e/auth.spec.ts`
- Modify: `CLAUDE.md`, `docs/design/README.md`

- [ ] **Step 1: Add the e2e assertions the design depends on**

```ts
test("the star meets the minimum target size", async ({ page }) => {
  await page.goto("/");
  const box = await page.getByRole("button", { name: /nebula/i }).boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(24);
  expect(box!.height).toBeGreaterThanOrEqual(24);
});

test("the nebula canvas fills the viewport rather than its intrinsic size", async ({
  page,
}) => {
  await page.goto("/");
  const size = await page.evaluate(() => {
    const c = document.querySelector("canvas");
    return c ? { w: c.width, h: c.height } : null;
  });
  // 300x150 is the intrinsic default of a replaced element — the bug this guards.
  expect(size).not.toEqual({ w: 300, h: 150 });
  expect(size!.w).toBeGreaterThan(400);
});

test("switching the star off leaves the page readable", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /nebula/i }).click();
  await expect(page.getByRole("button", { name: /nebula/i })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(page.getByRole("heading", { name: "AeleOS" })).toBeVisible();
});
```

- [ ] **Step 2: Run against local and against production**

```bash
pnpm --filter hub test:e2e
PLAYWRIGHT_BASE_URL=https://me.furrycolombia.com pnpm --filter hub test:e2e
```

The second only after the change is deployed.

- [ ] **Step 3: Verify every gate**

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm secretlint && pnpm check:tools
pnpm check:docs origin/main && pnpm check:contrast
pnpm --filter hub test:coverage && pnpm --filter hub build
```

Expected: all exit 0.

- [ ] **Step 4: Record the outcome**

Update `CLAUDE.md`'s current state to say the hub carries the visual identity, and add a closing entry to `docs/design/README.md` noting that the design shipped, with anything that changed during implementation.

- [ ] **Step 5: Commit**

```bash
git add apps/hub/tests/e2e/auth.spec.ts CLAUDE.md docs/design/README.md
git commit -m "test: assert the design's load-bearing properties in a browser"
```

---

## Verification checklist

- [ ] `pnpm check:contrast` passes, and fails when a token is moved below its minimum.
- [ ] No pure white anywhere: the lightest surface is `oklch(0.99 0.01 40)`.
- [ ] Dark and light differ only by the token block — same markup, same layout.
- [ ] No flash of the wrong theme on a hard reload in either mode.
- [ ] The canvas paints between 20% and 95% coverage, at viewport size rather than 300×150.
- [ ] The star reports `aria-pressed`, has an accessible name, and measures at least 24×24.
- [ ] Reduced motion renders a static nebula rather than removing it.
- [ ] With the nebula off, every page still reads.
- [ ] `--ring` is defined in both modes and commented as awaiting its consumer.
- [ ] Fursona avatars are the brightest thing on screen on both themes.
- [ ] The Clerk card matches the surface; no glyph icons anywhere.
- [ ] Coverage thresholds were raised if the floor rose.

## Follow-on work

- **Radix primitives**, with the picker that needs them (Phase 1b-ii).
- **The avatar ring, measured.** `--ring` ships unused here. Whoever adds avatars must check it against a pure-white and a pure-black image in both modes — the spec calls a vanishing fursona unacceptable, and that is the only check that proves it doesn't.
- **A directory note under `components/`** for constraints that cannot attach to an export — "the nebula must never compete with an avatar" being the obvious first entry.
- **Spanish or English.** `lang="es"` with English copy is still wrong either way.
- **Drift speed.** ~90 seconds, never judged by a human on a real page.
- **A component registry**, when a second app consumes these components.
