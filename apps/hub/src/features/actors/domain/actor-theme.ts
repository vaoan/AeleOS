import { z } from "zod";
import {
  legibleAccent,
  oklchToSrgb,
  parseHex,
  toHex,
  type ThemeMode,
} from "@/shared/domain/color";

/**
 * The canvases somebody may put behind their page.
 *
 * Animations are code rather than colour, so unlike the accent this IS a fixed
 * list — a picker cannot invent a motion the canvas has no implementation for.
 * `none` is a first-class choice and not an absence: some pages want to be
 * still.
 *
 * **It holds exactly the canvases that exist.** It briefly listed two more,
 * named for animations nobody had written, and that is the worst kind of
 * control: it offers a choice, accepts it, stores it, and changes nothing, with
 * no way for the person to learn that it did nothing. A canvas joins this list
 * in the same change that implements it.
 *
 * Whatever is added reads `--nebula-a` and `--nebula-b`, so an author's two
 * colours travel to every canvas rather than each one inventing its own
 * palette. Today that is the drifting nebula, a starfield, an aurora, and
 * stillness.
 */
export const CANVASES = ["nebula", "stars", "aurora", "none"] as const;

/** One of the canvases. */
export type CanvasId = (typeof CANVASES)[number];

/**
 * How somebody chose their page to look.
 *
 * **Every colour is nullable, and null means "the design's own".** A theme is a
 * set of OVERRIDES rather than a complete palette, which is not a convenience:
 * `globals.css` gives light and dark accents at different HUES on purpose — 25
 * against 350, with a comment saying an accent that glows on black is washed
 * out on white — and no single stored colour reproduces both. A theme that
 * always emitted an accent would therefore change the look of every page nobody
 * has themed, in dark mode, on the day it shipped.
 *
 * So an untouched page emits no accent at all and `globals.css` stays entirely
 * in charge of it. Only a page whose owner actually picked something overrides.
 */
export interface ActorTheme {
  /** The accent colour as `#rrggbb`, or null for the design's own. */
  accent: string | null;
  /** One of the two clouds behind the page, or null for the design's own. */
  backdropA: string | null;
  /** The other cloud, or null for the design's own. */
  backdropB: string | null;
  /** Which canvas moves behind it. */
  canvas: CanvasId;
}

/**
 * What a page looks like when nobody has chosen: nothing overridden.
 *
 * Not a copy of the shipped colours — the absence of them. A copy would have to
 * pick one accent for two modes that deliberately use different hues, and would
 * restyle every unthemed page the day it landed.
 */
export const DEFAULT_THEME: ActorTheme = {
  accent: null,
  backdropA: null,
  backdropB: null,
  canvas: "nebula",
};

/**
 * What the colour inputs start on before somebody has chosen.
 *
 * The design's own light-mode values, so a picker opens showing the colour the
 * page is actually wearing rather than black. They are seeds for a control, NOT
 * defaults for a page — {@link DEFAULT_THEME} overrides nothing, and these are
 * what a person sees the moment they decide to start overriding.
 */
export const THEME_SEEDS = {
  accent: "#9a2929",
  backdropA: "#ec8e4a",
  backdropB: "#d66a60",
} as const;

/**
 * Reads a stored colour, or gives a fallback back.
 *
 * @param value - whatever was stored.
 * @returns a value that is certainly `#rrggbb`, or null to override nothing.
 */
function colour(value: unknown): string | null {
  const rgb = typeof value === "string" ? parseHex(value) : null;
  return rgb ? toHex(rgb) : null;
}

/**
 * Turns whatever is stored into a theme that certainly renders.
 *
 * **Every branch falls back rather than throwing, and that is the contract.**
 * The value arrives from a `jsonb` column that predates theming, so `null` is
 * the ordinary case rather than a fault, and a page whose stored value is
 * nonsense must still render — the alternative is somebody's public page going
 * blank for a reason they can neither see nor fix.
 *
 * It falls back **per field**, so a theme with one good half keeps that half.
 *
 * The canvas is matched against the list with `includes` and never with `in`.
 * An `in` test accepts every inherited key — `toString`, `constructor`,
 * `__proto__` — and each would then be treated as the name of a canvas.
 *
 * @param value - the stored theme, or anything at all.
 * @returns a theme every field of which is usable.
 */
export function parseTheme(value: unknown): ActorTheme {
  const stored =
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const canvas = stored.canvas;
  return {
    accent: colour(stored.accent),
    backdropA: colour(stored.backdropA),
    backdropB: colour(stored.backdropB),
    canvas:
      typeof canvas === "string" &&
      (CANVASES as readonly string[]).includes(canvas)
        ? (canvas as CanvasId)
        : DEFAULT_THEME.canvas,
  };
}

/**
 * The theme, as the editor's form holds it.
 *
 * Loose on the colours by design — they are `#rrggbb` or null and nothing else
 * is reachable through a colour input, and the database checks the format
 * anyway. What this pins is the SHAPE, so the form cannot submit a theme with a
 * canvas the renderer has no implementation for.
 */
export const themeSchema = z.object({
  accent: z.string().nullable(),
  backdropA: z.string().nullable(),
  backdropB: z.string().nullable(),
  canvas: z.enum(CANVASES),
});

/**
 * The custom properties a theme sets, for one mode.
 *
 * **One function serves the live preview and the public page.** That is what
 * keeps the editor honest: what somebody sees while choosing is produced by the
 * code that will render the page for a stranger, rather than by a second
 * approximation of it that drifts away over time.
 *
 * The accent is passed through `legibleAccent`, so **the colour rendered is not
 * always the colour stored** — hue and chroma are kept and lightness is solved
 * against the mode's surface. This is deliberate and it is the reason a free
 * colour picker is safe: somebody's own colour survives, in a form their
 * visitors can read, in whichever scheme those visitors are using. The two
 * modes therefore render one stored colour differently, which is correct — an
 * accent that glows on black is washed out on white.
 *
 * **A value that does not parse emits nothing**, exactly as an unset one does.
 * Black was the obvious fallback and it is wrong for the same reason: the
 * resting state of every override here is absence, and a string nobody can read
 * as a colour is not a choice somebody made.
 *
 * **The cloud tints and the canvas name are root-scoped, the accent is not** —
 * see `themeCss`. The canvas reads its colours from `document.documentElement`,
 * so a value scoped to the page's content element would be read by nothing.
 *
 * It returns only the tokens a theme OWNS. Everything else about light and dark
 * stays in `globals.css` under the reader's own control, which is what lets a
 * visitor switch a themed page to their preferred scheme and still have it look
 * deliberate rather than broken.
 *
 * @param theme - the chosen theme.
 * @param mode - the scheme the reader is in.
 * @returns the custom properties, ready for a style attribute.
 */
export function themeVars(
  theme: ActorTheme,
  mode: ThemeMode,
): Record<string, string> {
  const oklch = ([l, c, h]: number[]) =>
    `oklch(${l.toFixed(4)} ${c.toFixed(4)} ${h.toFixed(2)})`;
  // A value that does not parse emits NOTHING, rather than falling back to a
  // colour. Black was the obvious fallback and it is wrong for the same reason
  // an unset value is not written: the resting state of every override here is
  // absence, and a colour nobody can read as a colour is not a choice somebody
  // made. `themeVars` is exported and its input is only typed as a string, so
  // this is reachable rather than defensive.
  const rgb = (hex: string | null) => {
    const parsed = hex ? parseHex(hex) : null;
    return parsed ? parsed.map((ch) => Math.round(ch * 255)).join(" ") : null;
  };

  // Each override is emitted only when it was chosen. An unset value must not
  // appear at all — a custom property set to the design's own value would look
  // identical today and then silently stop tracking it the next time the design
  // moves.
  const accent =
    theme.accent && parseHex(theme.accent)
      ? legibleAccent(theme.accent, mode)
      : null;
  const cloudA = rgb(theme.backdropA);
  const cloudB = rgb(theme.backdropB);
  return {
    ...(accent
      ? {
          "--accent": oklch(accent.accent),
          "--on-accent": oklch(accent.onAccent),
        }
      : {}),
    ...(cloudA ? { "--nebula-a": cloudA } : {}),
    ...(cloudB ? { "--nebula-b": cloudB } : {}),
    // The canvas reads this to decide which animation to draw. A string custom
    // property is the same channel `--nebula-blend` already travels on, so this
    // is the file's existing idiom rather than a new mechanism.
    //
    // Emitted only when it differs from the default, like every other value
    // here: an unthemed page must emit nothing at all, and a property set to
    // the default looks identical today and stops tracking it tomorrow.
    ...(theme.canvas === DEFAULT_THEME.canvas
      ? {}
      : { "--canvas": theme.canvas }),
    // `none` is expressed as a transparent cloud rather than as an absent one,
    // so a page can be still without touching the visitor's own star toggle.
    // The two controls answer different questions: one is how the author wants
    // their page to look, the other is what this machine should spend on
    // animation, and neither may overrule the other.
    ...(theme.canvas === "none" ? { "--nebula-opacity": "0" } : {}),
  };
}

/**
 * What a chosen colour actually renders as, in each mode.
 *
 * The configurator shows **both swatches side by side**, which is how the
 * adjustment is disclosed. An earlier version returned an `adjusted` flag
 * instead and it was incoherent: a colour cannot be simultaneously too light
 * for a light page and too dark for a dark one, so the flag was false for
 * nearly every input and would have told somebody nothing on the occasions it
 * mattered.
 *
 * Two swatches cannot be got wrong in that way. They show exactly what a
 * visitor sees in either scheme, they need no wording, and they make the fact
 * that one colour has two renderings self-evident rather than something a
 * notice has to explain.
 *
 * @param hex - the colour somebody picked.
 * @returns the colour as rendered in each mode.
 */
export function accentPreview(hex: string): { light: string; dark: string } {
  const rendered = (mode: ThemeMode) =>
    toHex(oklchToSrgb(...legibleAccent(hex, mode).accent));
  return { light: rendered("light"), dark: rendered("dark") };
}

/**
 * Which custom properties belong to the page's content, and which to the page.
 *
 * **This split is a bug fix, and the bug was invisible.** The canvas is a fixed,
 * full-viewport element mounted at the ROOT of the document, and it reads its
 * colours from `document.documentElement`. Scoping its inputs to a nested
 * element meant it never saw them: an author could pick two backdrop colours,
 * the values were stored, emitted, and read by nothing at all.
 *
 * So the cloud tints and the canvas name go on `:root`, where the thing that
 * reads them can find them, and the accent stays scoped so the site's own
 * chrome keeps the site's own colour.
 *
 * @param vars - every custom property a theme sets.
 * @returns the ones that belong to each scope.
 */
function byScope(vars: Record<string, string>) {
  const rooted = ["--nebula-a", "--nebula-b", "--nebula-opacity", "--canvas"];
  const entries = Object.entries(vars);
  const pick = (wanted: boolean) =>
    entries
      .filter(([name]) => rooted.includes(name) === wanted)
      .map(([name, value]) => `${name}:${value}`)
      .join(";");
  return { root: pick(true), scoped: pick(false) };
}

/**
 * A theme as CSS, covering both schemes.
 *
 * **This exists because the reader's scheme is the reader's, and the page is
 * rendered on a server that cannot know it.** Inline styles would force a
 * choice of mode at render time and get it wrong for half the visitors; setting
 * them from JavaScript after hydration would flash the wrong accent first. So
 * both renderings are emitted as rules and the browser picks, exactly as
 * `globals.css` already does for every other token.
 *
 * The three selectors per scope match that file's own structure, and the order
 * matters:
 *
 *  1. the bare selector carries light, which is the default;
 *  2. `prefers-color-scheme: dark` applies dark, guarded by
 *     `:not([data-theme="light"])` so an explicit light choice still wins;
 *  3. `[data-theme="dark"]` applies dark again, so the toggle wins in the other
 *     direction too.
 *
 * A rule defined only inside the media query would leave a visitor who has
 * chosen dark on a light-preferring system with the light accent.
 *
 * **Two scopes, not one** — see {@link byScope}. The backdrop belongs to the
 * document because the canvas that reads it is mounted there; the accent
 * belongs to the page's own content.
 *
 * **Every value interpolated here is generated, never stored.** `themeVars`
 * builds them out of numbers — `toFixed` and `Math.round` — and the canvas name
 * comes from a fixed list, so nothing a person typed reaches this string. That
 * is what makes emitting a stylesheet safe; were a raw stored value ever passed
 * through, a `}` in it would close the rule and everything after would be
 * attacker-authored CSS.
 *
 * @param theme - the chosen theme.
 * @param className - the class the content-scoped rules attach to.
 * @returns the CSS text.
 */
export function themeCss(theme: ActorTheme, className: string): string {
  const light = byScope(themeVars(theme, "light"));
  const dark = byScope(themeVars(theme, "dark"));

  const rules = (selector: string, from: "root" | "scoped") =>
    [
      light[from] && `${selector}{${light[from]}}`,
      dark[from] &&
        `@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) ${selector}{${dark[from]}}}`,
      dark[from] && `:root[data-theme="dark"] ${selector}{${dark[from]}}`,
    ]
      .filter(Boolean)
      .join("");

  // **The root scope is emitted ONCE, with no dark variant, because nothing in
  // it varies by mode.** An author picks two cloud colours and a canvas; those
  // are the same colours whichever scheme a visitor reads in. What adapts is
  // `--nebula-blend`, which stays in `globals.css` — `screen` in dark because
  // dust emits light, `multiply` in light because it absorbs it. Same two
  // colours, opposite physics, which is why one pair works in both.
  //
  // Writing the three-selector form here anyway produced branches no input
  // could reach, which is how this was noticed.
  //
  // `:root` also takes no descendant selector; giving it one would stop it
  // matching anything at all.
  const rooted = light.root ? `:root{${light.root}}` : "";

  return rooted + rules(`.${className}`, "scoped");
}
