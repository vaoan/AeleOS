import { z } from "zod";
import { parseHex, toHex } from "@/shared/domain/color";
import { safeHttpUrl } from "@/features/actors/domain/embeds";
import {
  DEFAULT_CANVAS,
  MAX_CANVAS_COLOURS,
} from "@/shared/domain/canvas-slots";
import { CANVAS_RANGE, dial } from "@/shared/domain/canvas-motion";
import { DEFAULT_SKIN, SKINS, type SkinId } from "@/shared/domain/skins";
import {
  DEFAULT_GRADIENT,
  GRADIENT_KINDS,
  RADIAL_EXTENTS,
  RADIAL_SHAPES,
  parseGradient,
  type Gradient,
} from "@/shared/domain/gradient";

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
 * palette. Today that is the drifting nebula, a starfield, an aurora, a
 * constellation, waves, bubbles, snow, a horizon grid, drifting glows, orbits,
 * a honeycomb, ribbons, confetti, a skyline, bokeh, four retro screen savers
 * — mystify, bouncing boxes, glyph rain and warp speed — a plasma, cells, a
 * current, fireflies, and stillness.
 *
 * `none` sits last because it is the way out rather than a choice among the
 * rest, and a select opens on its first option.
 */
export const CANVASES = [
  "nebula",
  "stars",
  "aurora",
  "constellation",
  "waves",
  "bubbles",
  "snow",
  "grid",
  "blobs",
  "orbits",
  "hexagons",
  "ribbons",
  "confetti",
  "skyline",
  "bokeh",
  "mystify",
  "bounce",
  "rain",
  "warp",
  "plasma",
  "cells",
  "flow",
  "fireflies",
  "none",
] as const;

/**
 * How wide a public page's content column is.
 *
 * **An enum rather than a free number**, and the reason is mechanical rather
 * than aesthetic. `weights` had to become a custom property because they are
 * author data out of `jsonb` and no build step can generate a class for an
 * arbitrary number; a fixed list has no such problem, so these are six real
 * Tailwind classes with no `var()` plumbing and no fallback chain. It also
 * keeps the property that three people asked what a stop means give the same
 * answer.
 *
 * `narrow` is the app's own reading measure, `wider` is what every public page
 * had before this existed, and `full` sets no maximum at all.
 *
 * **`full` and readable are in tension and nothing corrects it.** A paragraph
 * at `full` on a wide display is a very long line. That is the author's choice
 * to make, and the same freedom that governs colour governs this.
 */
export const PAGE_MEASURES = [
  "narrow",
  "medium",
  "wide",
  "wider",
  "widest",
  "full",
] as const;

/**
 * The typefaces a page may be set in.
 *
 * **Every one is a stack of faces the reader already has**, which is what keeps
 * this inside the $0 constraint: choosing one ships no font file and adds no
 * request. `null` is the design's own face and is what every page written
 * before this key carries.
 *
 * Each entry earns its place by an era it makes reachable rather than by being
 * a typographic category: `system` is the reader's own UI face that every
 * modern feed uses, `classic` is the Verdana/Tahoma the 2000s web was set in,
 * `serif` is what a GeoCities page used, `mono` is a terminal, and `casual`
 * and `poster` are the two that actually SIGN that era — a personal page of
 * 2003 set in Comic Sans, a banner set in Impact. See the pastiche findings for
 * why the face is the single biggest thing between a page and the era it is
 * imitating.
 */
export const PAGE_FONTS = [
  "system",
  "classic",
  "serif",
  "mono",
  "casual",
  "poster",
] as const;

/** One of the page typefaces. */
export type PageFont = (typeof PAGE_FONTS)[number];

/**
 * How tightly a page sets its own content.
 *
 * **Not to be confused with `density`, which is the CANVAS dial** — that one
 * says how busy the moving backdrop is and has nothing to do with type. This
 * sets the padding inside a card and the size of the text in it, together,
 * because changing one without the other is what makes a page look squeezed
 * rather than dense.
 *
 * `null` is the design's own spacing. Real mid-2000s pages set body text around
 * 11px with almost no padding, which is why a pastiche with the right colours
 * and the wrong size still reads as a modern site.
 */
export const PAGE_SPACINGS = ["compact", "roomy"] as const;

/** One of the page spacings. */
export type PageSpacing = (typeof PAGE_SPACINGS)[number];

/** One of the page measures. */
export type PageMeasure = (typeof PAGE_MEASURES)[number];

/** One of the canvases. */
export type CanvasId = (typeof CANVASES)[number];

/**
 * How somebody chose their page to look.
 *
 * A theme carries **three dials for the canvas** as well: how busy it is, how
 * fast, and how big. They are separate because they are separate complaints —
 * a starfield can be crowded and still, a single box can hurtle, and a sky of
 * enormous stars is a different sky rather than a fuller one.
 *
 * A theme carries a **skin** as well as its colours, and the two are separate
 * on purpose. A skin decides FORM — corners, border weight, shadow, gloss, the
 * body's face — and names no colour of its own; the gradient decides colour and
 * knows nothing about form. Every pairing of the two is somebody's page, which
 * is what a skin times any palette buys that a shelf of themed presets would not.
 *
 * A theme may also carry a **cursor**: a link to a picture, like every other
 * picture here. What a browser will accept is narrower than people expect —
 * see `CURSOR_MAX_PX` — and what may be written into a stylesheet is narrower
 * still; see `cursorUrl`.
 *
 * A theme may also carry a **background picture** — `backgroundUrl` and
 * `backgroundFit` — a link like the cursor, and like every other picture here:
 * nothing is stored. It sits OVER the gradient as a second `background-image`
 * LAYER on the same element the gradient paints on — see `bodyBackgroundVars`
 * for why that has to be `body` rather than `:root` — so a transparent or
 * partial picture still shows the author's own colours, and a page with a
 * picture and no gradient still has the design's own field beneath it. See
 * `backgroundImageValue` (`domain/embeds.ts`) for what may safely reach a
 * stylesheet — an address it refuses paints nothing, the same rule the
 * cursor follows.
 *
 * The canvas's colours are a **list, one per part it paints with**, because how
 * many a canvas takes is the canvas's business — three cloud layers, three star
 * layers, four aurora curtains. Two named fields made every canvas reuse the
 * same pair and left the ones with more parts unable to say so.
 *
 * The background is a **gradient of as many colours as somebody wants**, not
 * one colour — a fursona can carry more than any fixed set of pickers would
 * allow. A flat background is simply a gradient with one stop.
 *
 * A theme carries a **background** now, and that is what makes it one palette
 * rather than two. Every colour the author does not pick is derived from it —
 * see `derivePalette` — so a custom theme is a complete scheme in its own right
 * instead of an accent laid over whichever default the reader happens to be in.
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
 *
 * **The page's own picture and one block's are the same address, turned into
 * CSS by the same function.** `backgroundUrl` here and `background_url` on a
 * block both go through `backgroundImageValue`, so an address that cannot be
 * safely quoted paints nothing at either level rather than being escaped at one
 * and built at the other. That is stated here because the two live in different
 * layers and the shared guard is the only thing keeping them in step.
 *
 * A theme also carries a **measure**: how wide the content column is, from the
 * app's own reading width out to no maximum at all. Null is the design's own.
 *
 * A theme also carries an optional `font` and `spacing`; both fall back to the
 * design's own for a value this build does not know.
 */
export interface ActorTheme {
  /**
   * The page's own background as `#rrggbb`, or null for the design's own.
   *
   * **This is what makes the theme one palette rather than two.** Every other
   * colour is solved against it — see `derivePalette` — so a custom theme is a
   * complete scheme in its own right instead of an accent laid over whichever
   * of the default schemes the reader happens to be in.
   */
  background: Gradient | null;
  /** The accent colour as `#rrggbb`, or null for the design's own. */
  accent: string | null;
  /**
   * The canvas's own colours, one per slot, or null for the design's own.
   *
   * **A list rather than two named fields**, because how many a canvas takes is
   * the canvas's business — three cloud layers, three star layers, four aurora
   * curtains. Two fixed fields made every canvas reuse the same pair and left
   * the ones with more parts unable to say so.
   *
   * Longer than the chosen canvas needs is harmless: the extra entries are
   * ignored and kept, so switching canvas and back does not lose colours.
   */
  canvasColours: string[] | null;
  /** Which canvas moves behind it. */
  canvas: CanvasId;
  /**
   * How much of the canvas to draw, as a multiplier.
   *
   * **Two dials rather than one**, because busy and fast are different
   * complaints with different fixes: a starfield can be crowded and still, and
   * a single box can hurtle. A combined "intensity" would move both and be
   * wrong for one of them every time.
   */
  density: number;
  /** How fast it moves, as a multiplier on the clock. */
  speed: number;
  /**
   * How large the things it draws are, as a multiplier.
   *
   * The third of the three, and the one that changes what a canvas IS rather
   * than how much of it there is: a starfield at three times the size is a
   * different sky, not a fuller one.
   */
  scale: number;
  /**
   * How wide the content column is, or null for the design's own.
   *
   * Null means the design's own — `wider`, the 80rem every public page had
   * before this existed — consistent with every other nullable field here.
   */
  measure: PageMeasure | null;
  /**
   * The typeface the page's own content is set in, or null for the design's.
   *
   * Applied to the author's content alone — the app's bar keeps its own face,
   * for the reason a skin does.
   */
  font: PageFont | null;
  /**
   * How tightly the page sets its content, or null for the design's own.
   *
   * Sets the padding inside a card and the size of its text together.
   */
  spacing: PageSpacing | null;
  /**
   * Which style the page's surfaces are built in.
   *
   * Not nullable, and unlike the colours it needs no "default means the
   * design's own" dance: `default` IS a skin, and the one whose overrides are
   * empty. A colour input always carries a value and so needs a separate way to
   * say nobody picked; a select carries the name of what was picked.
   */
  skin: SkinId;
  /**
   * A picture to use as the mouse cursor, as an address, or null for the
   * ordinary one.
   *
   * A link like every other picture here — nothing is stored. See
   * {@link cursorUrl} for what may safely be written into a stylesheet, and
   * `CURSOR_MAX_PX` for the size a browser will actually accept, which is
   * smaller than people expect.
   */
  cursor: string | null;
  /**
   * A picture behind the whole page, as an address, or null for none.
   *
   * A link like every other picture here — nothing is stored, and the address
   * is stored as pasted rather than pre-sanitised: `bodyBackgroundVars`,
   * called from {@link themeCss}, is the one place it is turned into CSS,
   * through `backgroundImageValue` (`domain/embeds.ts`), the same function
   * `blockStyle` uses for a block's own background picture. An address
   * that function refuses paints nothing rather than throwing, exactly like
   * every other field here.
   */
  backgroundUrl: string | null;
  /**
   * How the background picture is placed: tiled, or scaled to cover the page.
   *
   * Meaningless while {@link ActorTheme.backgroundUrl} is null, and not
   * nullable itself — like `skin` and `canvas`, and unlike the cursor and the
   * background picture's own address, there is no "nobody chose" state to
   * express: a select always carries the name of what is picked, and
   * `DEFAULT_THEME`'s value here is never rendered until there is a picture to
   * place.
   */
  backgroundFit: "cover" | "tile";
}

/**
 * The largest cursor a browser will use.
 *
 * **Past this the declaration is ignored in silence** — no error, no warning,
 * the cursor simply does not change. Chrome and Firefox both refuse above
 * 128×128, and Safari is no more generous. It is stated here so the editor can
 * measure a picture and say so, because "nothing happened" is the worst thing a
 * control can tell somebody.
 */
export const CURSOR_MAX_PX = 128;

/**
 * Characters that must never reach a `url("…")` inside a stylesheet.
 *
 * Parentheses and apostrophes are the ones that matter: they survive `new URL`
 * untouched and either ends the function. Quotes, whitespace and backslashes are
 * listed too even though parsing already handles them, because a guard that
 * depends on somebody else's normalisation changes the day they change theirs.
 */
const CURSOR_UNSAFE = /["'()\\\s]/;

/**
 * An address safe to write into a stylesheet as a cursor.
 *
 * **This is a CSS injection sink**, and the dangerous characters are not the
 * ones people expect. The address is interpolated into a declaration this app
 * emits, so anything that closes the `url("…")` early leaves the rest to be read
 * as CSS somebody else wrote.
 *
 * `new URL` already neutralises a quote (`%22`), a space (`%20`) and a backslash
 * (normalised to `/`). What it leaves verbatim is a **parenthesis or an
 * apostrophe in a path** — either of which ends the function — so those are what
 * this refuses. The list is wider than strictly needed because a rule that
 * refuses a character parsing would have encoded costs an author nothing, while
 * one that misses a survivor costs the page.
 *
 * Control characters need no check of their own: parsing percent-encodes them
 * as well. A loop that walked the string looking for them lived here briefly and
 * was unreachable — a guard that cannot fire is not a guard, and this file has
 * caught enough of those to know better.
 *
 * `javascript:` and `data:` are refused by `safeHttpUrl`, the same guard the
 * link layouts use.
 *
 * @param raw - the address somebody pasted.
 * @returns the address, or null when it must not be written into CSS.
 */
export function cursorUrl(raw: string | undefined): string | null {
  const url = safeHttpUrl(raw);
  return url && !CURSOR_UNSAFE.test(url) ? url : null;
}

/**
 * What a page looks like when nobody has chosen: nothing overridden.
 *
 * Includes all three canvas dials at 1, which is "as the canvas was drawn". They are
 * numbers rather than nullable, because there is no such thing as an absent
 * multiplier — one IS the absence.
 *
 * Includes the cursor and the canvas's colours, both nullable like the rest,
 * and the skin, which is not: `default` is a real skin whose overrides happen
 * to be empty, so it expresses "nothing chosen" without needing null.
 *
 * **Its canvas is `DEFAULT_CANVAS`, the same constant the renderer resolves an
 * absent `--canvas` to, and it must stay that constant rather than a name
 * spelled out here.** `themeVars` emits the property only when the theme's
 * canvas differs from this one, so the two are the two ends of the same
 * agreement — and while they were two separate spellings of it the renderer
 * drew the default canvas at four times its intended resolution on every page
 * in the app. `canvas-slots.test.ts` pins them together.
 *
 * Includes the background picture's address, nullable like the cursor, and
 * its fit, which is not — for the same reason the skin is not: a select
 * always carries the name of what is picked, and the value renders nothing
 * until there is a picture to place.
 *
 * Includes the background, which is nullable like the rest: a page nobody has
 * themed follows the design and switches with the reader, exactly as it did
 * before any of this existed.
 *
 * Not a copy of the shipped colours — the absence of them. A copy would have to
 * pick one accent for two modes that deliberately use different hues, and would
 * restyle every unthemed page the day it landed.
 *
 * Its `measure` is null — the design's own — so a page that never chose one is
 * laid out exactly as every public page was before the field existed.
 *
 * A theme also carries an optional `font` and `spacing`; both fall back to the
 * design's own for a value this build does not know.
 */
export const DEFAULT_THEME: ActorTheme = {
  background: null,
  accent: null,
  canvasColours: null,
  canvas: DEFAULT_CANVAS,
  cursor: null,
  backgroundUrl: null,
  backgroundFit: "cover",
  measure: null,
  font: null,
  spacing: null,
  skin: DEFAULT_SKIN,
  density: CANVAS_RANGE.default,
  speed: CANVAS_RANGE.default,
  scale: CANVAS_RANGE.default,
};

/**
 * What the colour inputs start on before somebody has chosen.
 *
 * The background is NOT here: it is a gradient rather than a colour, and its
 * own default lives in `gradient.ts` beside the code that reads it.
 *
 * The canvas list carries **one seed per slot the greediest canvas uses**, and
 * `withCanvasColour` depends on that being true — it is what lets the list grow
 * to reach a slot without a fallback nobody could reach. A test pins it.
 *
 * These are the accent and the canvas, because each is the first colour anybody picks
 * and a picker opening on black would be a poor start.
 *
 * The design's own light-mode values, so a picker opens showing the colour the
 * page is actually wearing rather than black. They are seeds for a control, NOT
 * defaults for a page — {@link DEFAULT_THEME} overrides nothing, and these are
 * what a person sees the moment they decide to start overriding.
 */
export const THEME_SEEDS = {
  accent: "#9a2929",
  /** One per slot, for the canvas that takes the most. */
  canvasColours: ["#ec8e4a", "#d66a60", "#c9587a", "#a25ec8"],
} as const;

/**
 * Reads a stored colour, or gives a fallback back.
 *
 * @param value - whatever was stored.
 * @returns a value that is certainly `#rrggbb`, or null to override nothing.
 */
function colourList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  // A stop that is not a colour is dropped rather than defaulted, exactly as a
  // gradient stop is: inventing one puts a colour on the page nobody picked.
  const colours = value
    .map((each) => colour(each))
    .filter((each): each is string => each !== null)
    .slice(0, MAX_CANVAS_COLOURS);
  return colours.length > 0 ? colours : null;
}

/**
 * Reads a stored colour, or gives nothing back.
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
 * The cursor goes through `cursorUrl`, which refuses anything that could close
 * the `url("…")` it will be written into.
 *
 * The background picture's address is kept as pasted — a plain string check
 * only, deferring safety to `themeCss`/`themeVars` through
 * `backgroundImageValue`, exactly as `blockStyle` defers a block's own
 * background picture. Its fit falls back to {@link DEFAULT_THEME}'s when the
 * stored value is not one of the two known ones.
 *
 * The canvas colours go through the same rule as a gradient's stops: an entry
 * that is not a colour is dropped rather than defaulted, and a list left with
 * none is treated as absent.
 *
 * The background goes through `parseGradient`, which drops any stop it cannot
 * read rather than inventing one — a theme left with no readable stop at all is
 * treated as having no background, and derives no palette.
 *
 * The three dials are CLAMPED rather than validated. A value out of range is a
 * slider from an older build or a hand-edited row, and the nearest usable
 * number is a better answer than a page that will not render.
 *
 * The skin is matched the same way the canvas is, and against the same kind of
 * list, so a style that was renamed or removed leaves a page on the default
 * rather than on a name nothing implements.
 *
 * The canvas is matched against the list with `includes` and never with `in`.
 * An `in` test accepts every inherited key — `toString`, `constructor`,
 * `__proto__` — and each would then be treated as the name of a canvas.
 *
 * @param value - the stored theme, or anything at all.
 *
 * A `measure` outside the vocabulary falls back to null, the same way an
 * unknown canvas or skin does: a page written by a newer deployment must still
 * render.
 *
 * @returns a theme every field of which is usable.
 *
 * A theme also carries an optional `font` and `spacing`; both fall back to the
 * design's own for a value this build does not know.
 */
export function parseTheme(value: unknown): ActorTheme {
  const stored =
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const canvas = stored.canvas;
  const skin = stored.skin;
  const backgroundFit = stored.backgroundFit;
  const measure = stored.measure;
  return {
    background: parseGradient(stored.background),
    accent: colour(stored.accent),
    canvasColours: colourList(stored.canvasColours),
    cursor: cursorUrl(
      typeof stored.cursor === "string" ? stored.cursor : undefined,
    ),
    backgroundUrl:
      typeof stored.backgroundUrl === "string" ? stored.backgroundUrl : null,
    backgroundFit:
      backgroundFit === "cover" || backgroundFit === "tile"
        ? backgroundFit
        : DEFAULT_THEME.backgroundFit,
    measure:
      typeof measure === "string" &&
      (PAGE_MEASURES as readonly string[]).includes(measure)
        ? (measure as PageMeasure)
        : null,
    // Outside the vocabulary falls back to null — the design's own — exactly
    // as the measure above does, so a value this build has never heard of
    // renders the page rather than refusing it.
    font:
      typeof stored.font === "string" &&
      (PAGE_FONTS as readonly string[]).includes(stored.font)
        ? (stored.font as PageFont)
        : null,
    spacing:
      typeof stored.spacing === "string" &&
      (PAGE_SPACINGS as readonly string[]).includes(stored.spacing)
        ? (stored.spacing as PageSpacing)
        : null,
    canvas:
      typeof canvas === "string" &&
      (CANVASES as readonly string[]).includes(canvas)
        ? (canvas as CanvasId)
        : DEFAULT_THEME.canvas,
    skin:
      typeof skin === "string" && (SKINS as readonly string[]).includes(skin)
        ? (skin as SkinId)
        : DEFAULT_SKIN,
    // Clamped rather than validated: a value out of range is a slider from an
    // older build or a hand-edited row, and the nearest usable number is a
    // better answer than refusing to render somebody's page.
    density: dial(stored.density),
    speed: dial(stored.speed),
    scale: dial(stored.scale),
  };
}

/**
 * The theme, as the editor's form holds it.
 *
 * The canvas colours are a list of strings, and the cursor a string, both
 * checked for shape only — the rules that matter are enforced where each is
 * used. The background picture's address is pinned the same loose way, for
 * the same reason: what may reach a stylesheet is `backgroundImageValue`'s
 * decision, not this schema's. Its fit IS pinned to the two known values,
 * like the gradient's own enums below, so the form cannot submit a fit the
 * renderer has no branch for.
 *
 * The background is the gradient's shape rather than a string. Loose on the
 * colours by design — they are `#rrggbb` or null and nothing else
 * is reachable through a colour input, and the database checks the format
 * anyway. What this pins is the SHAPE, so the form cannot submit a theme with a
 * canvas the renderer has no implementation for. The skin is pinned the same
 * way and for the same reason — and so are the gradient's kind, radial shape
 * and extent, which the emitter branches on: a value outside those lists would
 * be accepted, stored, and rendered as whichever branch it fell through to. The three dials are loose numbers here and
 * clamped where they are read, since a slider cannot produce anything else.
 *
 * The measure is pinned to its vocabulary like the canvas and the skin, so the
 * form cannot submit a width the renderer has no class for.
 *
 * The measure is pinned to its vocabulary like the canvas and the skin, so the
 * form cannot submit a width the renderer has no class for.
 *
 * A theme also carries an optional `font` and `spacing`; both fall back to the
 * design's own for a value this build does not know.
 */
export const themeSchema = z.object({
  canvasColours: z.array(z.string()).nullable(),
  background: z
    .object({
      // The three kinds and the radial's two lists are pinned exactly as the
      // canvas is, and for exactly the reason: the emitter has a branch per
      // kind, so a value outside these would be stored, accepted, and rendered
      // as whichever branch it fell through to.
      kind: z.enum(GRADIENT_KINDS),
      repeating: z.boolean(),
      every: z.number(),
      angle: z.number(),
      shape: z.enum(RADIAL_SHAPES),
      extent: z.enum(RADIAL_EXTENTS),
      x: z.number(),
      y: z.number(),
      stops: z.array(z.object({ color: z.string(), at: z.number() })).min(1),
    })
    .nullable(),
  accent: z.string().nullable(),
  canvas: z.enum(CANVASES),
  cursor: z.string().nullable(),
  backgroundUrl: z.string().nullable(),
  backgroundFit: z.enum(["cover", "tile"]),
  measure: z.enum(PAGE_MEASURES).nullable(),
  font: z.enum(PAGE_FONTS).nullable(),
  spacing: z.enum(PAGE_SPACINGS).nullable(),
  skin: z.enum(SKINS),
  density: z.number(),
  speed: z.number(),
  scale: z.number(),
});

/**
 * Sets one colour, and makes every other colour explicit with it.
 *
 * The canvas colours are promoted along with the rest — all of them, not the
 * one being edited, for the same reason.
 *
 * The background is promoted along with the rest, and it matters most: it is
 * what every derived colour is built from, so a theme with an accent and no
 * background would have nothing to derive against. It is promoted to
 * `DEFAULT_GRADIENT` rather than to a flat colour, because the control that
 * edits it is a gradient picker and opening it on a single stop hides the
 * feature.
 *
 * **A theme is all-default or all-chosen, never half of each.** Picking only an
 * accent used to leave the two cloud colours following the design, which meant
 * they flipped with the reader's light or dark scheme while the accent did not
 * — so what an author saw while editing depended on the mode they happened to
 * be in, and was not what a visitor in the other mode would get.
 *
 * Promoting the rest to their current values on the first pick removes that
 * entirely. Nothing changes visually at the moment of promotion, because the
 * values written are exactly the ones the page was already showing; what
 * changes is that they stop moving afterwards.
 *
 * {@link DEFAULT_THEME} is the way back, and it clears all three together for
 * the same reason.
 *
 * @param theme - the theme as it stands.
 * @param key - which colour was chosen.
 * @param value - the colour, as `#rrggbb`.
 * @returns the theme with every colour explicit.
 */
export function withChosenColour(
  theme: ActorTheme,
  key: "accent",
  value: string,
): ActorTheme {
  return {
    ...theme,
    background: theme.background ?? DEFAULT_GRADIENT,
    canvasColours: theme.canvasColours ?? [...THEME_SEEDS.canvasColours],
    [key]: value,
  };
}

/**
 * Sets one of the canvas's colours, making the rest explicit with it.
 *
 * The same all-or-nothing rule the other colours follow, and for the same
 * reason: a theme half following the design and half not is a theme whose
 * preview depends on which half somebody is looking at.
 *
 * The list is grown to reach the slot being set, so a canvas that takes four
 * colours can have its fourth chosen before its third.
 *
 * @param theme - the theme as it stands.
 * @param slot - which colour, from zero.
 * @param value - the colour, as `#rrggbb`.
 * @returns the theme with every colour explicit.
 */
export function withCanvasColour(
  theme: ActorTheme,
  slot: number,
  value: string,
): ActorTheme {
  const seeds = THEME_SEEDS.canvasColours;
  // Clamped first, so the loop below can only ever reach into the seeds — which
  // carry exactly one entry per slot the greediest canvas uses. `actor-theme.test.ts`
  // pins that, and it is what makes this total without a fallback nobody can reach.
  const at = Math.max(0, Math.min(MAX_CANVAS_COLOURS - 1, slot));
  const colours = [...(theme.canvasColours ?? seeds)];
  while (colours.length <= at) colours.push(seeds[colours.length]!);
  colours[at] = value;
  return {
    ...theme,
    background: theme.background ?? DEFAULT_GRADIENT,
    accent: theme.accent ?? THEME_SEEDS.accent,
    canvasColours: colours.slice(0, MAX_CANVAS_COLOURS),
  };
}

/**
 * Whether an author has chosen any COLOUR.
 *
 * True once the background, the accent or any of the canvas's is the author's
 * own. Deliberately narrower than {@link isCustomised}: this exists for the
 * "default" marks beside the colour inputs, and a colour input always carries a
 * value, so without one the design's own colour reads as a choice somebody made.
 * A skin, a canvas and a cursor each say what they are, so none of them needs
 * the mark — and including them here would take it off the colour that still
 * does.
 *
 * @param theme - the theme.
 * @returns true when any colour is the author's own.
 */
export function isThemed(theme: ActorTheme): boolean {
  return Boolean(theme.background ?? theme.accent ?? theme.canvasColours);
}

/**
 * Whether there is anything at all to put back.
 *
 * Everything a theme carries, colour or not — the three canvas dials included,
 * since turning one up is a change to put back like any other. This is what Reset asks, and it
 * used to ask {@link isThemed} instead — so somebody who had chosen only a
 * canvas, a cursor or a skin faced a disabled button with nothing telling them
 * why, which is the same "control that does nothing" fault this feature has
 * already been trimmed for twice.
 *
 * `backgroundFit` is deliberately absent from this test, for the same reason
 * it is absent from {@link isThemed}: it renders nothing on its own while
 * `backgroundUrl` is null, so a stray change to it with no picture set would
 * be a "customised" flag for a change nobody can see — the exact control that
 * does nothing this project keeps trimming. Only the address is checked, like
 * the cursor.
 *
 * @param theme - the theme.
 * @returns true when the theme differs from the default in any way.
 */
export function isCustomised(theme: ActorTheme): boolean {
  return (
    isThemed(theme) ||
    Boolean(theme.cursor) ||
    Boolean(theme.backgroundUrl) ||
    theme.canvas !== DEFAULT_THEME.canvas ||
    theme.skin !== DEFAULT_THEME.skin ||
    theme.density !== DEFAULT_THEME.density ||
    theme.speed !== DEFAULT_THEME.speed ||
    theme.scale !== DEFAULT_THEME.scale
  );
}
