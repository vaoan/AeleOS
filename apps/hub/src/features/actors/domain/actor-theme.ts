import { z } from "zod";
import { parseHex, toHex } from "@/shared/domain/color";
import { safeHttpUrl } from "@/features/actors/domain/embeds";
import { MAX_CANVAS_COLOURS } from "@/shared/domain/canvas-slots";
import { CANVAS_RANGE, dial } from "@/shared/domain/canvas-motion";
import {
  DEFAULT_SKIN,
  SKINS,
  SKIN_SCOPE,
  skinVars,
  type SkinId,
} from "@/shared/domain/skins";
import {
  DEFAULT_GRADIENT,
  parseGradient,
  type Gradient,
} from "@/shared/domain/gradient";
import { derivePalette } from "@/shared/domain/palette";

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
 * — mystify, bouncing boxes, glyph rain and warp speed — and stillness.
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
  "none",
] as const;

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
 * is what nine skins times any palette buys that nine themed presets would not.
 *
 * A theme may also carry a **cursor**: a link to a picture, like every other
 * picture here. What a browser will accept is narrower than people expect —
 * see `CURSOR_MAX_PX` — and what may be written into a stylesheet is narrower
 * still; see `cursorUrl`.
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
 * Includes the background, which is nullable like the rest: a page nobody has
 * themed follows the design and switches with the reader, exactly as it did
 * before any of this existed.
 *
 * Not a copy of the shipped colours — the absence of them. A copy would have to
 * pick one accent for two modes that deliberately use different hues, and would
 * restyle every unthemed page the day it landed.
 */
export const DEFAULT_THEME: ActorTheme = {
  background: null,
  accent: null,
  canvasColours: null,
  canvas: "nebula",
  cursor: null,
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
 * @returns a theme every field of which is usable.
 */
export function parseTheme(value: unknown): ActorTheme {
  const stored =
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const canvas = stored.canvas;
  const skin = stored.skin;
  return {
    background: parseGradient(stored.background),
    accent: colour(stored.accent),
    canvasColours: colourList(stored.canvasColours),
    cursor: cursorUrl(
      typeof stored.cursor === "string" ? stored.cursor : undefined,
    ),
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
 * used.
 *
 * The background is the gradient's shape rather than a string. Loose on the
 * colours by design — they are `#rrggbb` or null and nothing else
 * is reachable through a colour input, and the database checks the format
 * anyway. What this pins is the SHAPE, so the form cannot submit a theme with a
 * canvas the renderer has no implementation for. The skin is pinned the same
 * way and for the same reason. The three dials are loose numbers here and
 * clamped where they are read, since a slider cannot produce anything else.
 */
export const themeSchema = z.object({
  canvasColours: z.array(z.string()).nullable(),
  background: z
    .object({
      angle: z.number(),
      stops: z.array(z.object({ color: z.string(), at: z.number() })).min(1),
    })
    .nullable(),
  accent: z.string().nullable(),
  canvas: z.enum(CANVASES),
  cursor: z.string().nullable(),
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
 * @param theme - the theme.
 * @returns true when the theme differs from the default in any way.
 */
export function isCustomised(theme: ActorTheme): boolean {
  return (
    isThemed(theme) ||
    Boolean(theme.cursor) ||
    theme.canvas !== DEFAULT_THEME.canvas ||
    theme.skin !== DEFAULT_THEME.skin ||
    theme.density !== DEFAULT_THEME.density ||
    theme.speed !== DEFAULT_THEME.speed ||
    theme.scale !== DEFAULT_THEME.scale
  );
}

/**
 * A hex colour as the space-separated channels a `rgb()` token wants.
 *
 * At module scope because it closes over nothing: inside `themeVars` it was
 * rebuilt on every call, and this runs on every render of every themed page.
 *
 * @param hex - the colour somebody picked.
 * @returns the channels, or null when the value does not parse.
 */
function rgb(hex: string): string | null {
  const parsed = parseHex(hex);
  return parsed ? parsed.map((ch) => Math.round(ch * 255)).join(" ") : null;
}

/**
 * Custom properties, written out as the body of a CSS rule.
 *
 * @param properties - the properties to write.
 * @returns the declarations, semicolon-separated.
 */
function declarations(properties: Record<string, string>): string {
  return Object.entries(properties)
    .map(([name, value]) => `${name}:${value}`)
    .join(";");
}

/**
 * Every custom property a theme sets.
 *
 * **No mode parameter, and that is the whole point of the redesign.** A theme
 * used to emit one accent for light and another for dark, because an accent
 * cannot be legible on both a near-white and a near-black surface. That made a
 * custom theme two themes, which is not what anybody was choosing.
 *
 * A theme now brings its own background, so it is **one palette that reads the
 * same for everybody** — text, borders and accent all solved against that
 * background by `derivePalette`, none of them against the reader's scheme.
 *
 * **One function serves the live preview and the public page**, which is what
 * keeps the editor honest: what somebody sees while choosing is produced by the
 * code that will render the page for a stranger.
 *
 * A cursor travels as a real `cursor` declaration rather than a custom
 * property, with the hotspot pinned to the corner and the mandatory fallback
 * keyword appended.
 *
 * Each of the canvas's colours travels as `--canvas-N`, indexed from one, so a
 * canvas asks for the slot it wants rather than for a letter that meant
 * something only while there were two of them. A slot whose value cannot be read
 * emits nothing rather than a property full of `NaN`.
 *
 * The three canvas dials are emitted ONLY when moved, like everything else here:
 * a page nobody has turned up carries no property at all and the canvas reads
 * its own default.
 *
 * **The skin is NOT here.** `themeCss` emits it separately, scoped to the
 * person's own content — see `SKIN_SCOPE`. Everything this returns belongs at
 * the document root, because it has to reach the canvas and the field, which
 * are mounted outside any element a page can wrap.
 *
 * A skin and a palette write disjoint properties, and `skins.test.ts` keeps
 * them so. That mattered more when the two shared a rule and matters still: a
 * name in both would now be split across two scopes, where the inner one wins
 * for everything inside it and the outer one for the canvas — the same value
 * rendering differently in two halves of one page.
 *
 * `none` travels as the canvas's NAME rather than as an opacity of zero. The
 * opacity route silently did nothing — the canvas rejects a non-positive value
 * as unset and draws the default — and a name is reversible without any state
 * to reset.
 *
 * A theme with no background emits only the cloud colours and the canvas, since
 * there is nothing to solve the rest against. In practice that state is
 * unreachable from the editor — `withChosenColour` fills every colour the
 * moment one is picked — but the column predates all of this and may hold it.
 *
 * Its hex conversion is a module-level function now, not a closure rebuilt on every call: this runs for every render of every themed page.
 *
 * @param theme - the chosen theme.
 * @returns the custom properties, ready for a rule.
 */
export function themeVars(theme: ActorTheme): Record<string, string> {
  // One property per colour, indexed from one, so a canvas asks for the slot it
  // wants rather than for a letter that meant something only while there were
  // two of them.
  const canvas: Record<string, string> = {};
  for (const [i, chosen] of (theme.canvasColours ?? []).entries()) {
    const channels = rgb(chosen);
    if (channels) canvas[`--canvas-${i + 1}`] = channels;
  }

  return {
    ...canvas,
    ...(theme.background
      ? derivePalette(theme.background, theme.accent ?? THEME_SEEDS.accent)
      : {}),
    ...(theme.canvas === DEFAULT_THEME.canvas
      ? {}
      : { "--canvas": theme.canvas }),
    // Emitted only when moved, like everything else here: a page nobody has
    // turned up carries no property at all and the canvas reads its own
    // default.
    ...(theme.density === DEFAULT_THEME.density
      ? {}
      : { "--canvas-density": String(theme.density) }),
    ...(theme.speed === DEFAULT_THEME.speed
      ? {}
      : { "--canvas-speed": String(theme.speed) }),
    ...(theme.scale === DEFAULT_THEME.scale
      ? {}
      : { "--canvas-scale": String(theme.scale) }),
    // **The hotspot is fixed at `0 0` and is not the author's to choose.** It
    // decides where a click actually lands relative to the picture, so an offset
    // one makes the arrow somebody sees disagree with the point they hit — a
    // clickjacking primitive on a page anybody can publish.
    //
    // The trailing `auto` is mandatory: a `cursor` carrying a url and no
    // fallback keyword is an invalid declaration and the whole rule is dropped.
    //
    // It does not reach buttons, which `globals.css` gives `cursor: pointer` on
    // a more specific selector. That is the right outcome rather than an
    // oversight: a control should still say it is one.
    ...(theme.cursor ? { cursor: `url("${theme.cursor}") 0 0, auto` } : {}),
  };
}

/**
 * What a chosen accent actually renders as.
 *
 * One value, not two. It used to report a light and a dark rendering side by
 * side, which was honest while a theme was two themes and became misleading the
 * moment it became one: an author picks a colour and there is now exactly one
 * colour their visitors see.
 *
 * It is the colour that was picked, unchanged. The swatch is still worth
 * showing: it is where somebody sees their accent against their own background
 * rather than against the editor's chrome, which is the only place the pairing
 * can actually be judged.
 *
 * @param accentHex - the accent somebody picked.
 * @param background - the gradient it sits on.
 * @returns the colour as rendered, as `#rrggbb`.
 */
export function accentPreview(accentHex: string, background: Gradient): string {
  return derivePalette(background, accentHex)["--accent"] ?? accentHex;
}

/**
 * A theme as CSS.
 *
 * **Two rules, and no media queries at all.** The media queries went when a
 * theme became one palette: it used to emit three selectors per scope so the
 * reader's light or dark choice could pick between two renderings, and there is
 * only one rendering now.
 *
 * The two rules are the colours and the skin, and they are separate because
 * they reach different things — the comment on the return says which and why.
 * Both carry the same gate on the visitor's choice, so leaving the theme leaves
 * all of it. Either may be empty, and a theme overriding nothing produces the
 * empty string, which is what lets `ThemeScope` render no element at all.
 *
 * **The rule is gated on the visitor's own choice.** A page wears its owner's
 * colours by default and a visitor may take them off — see `page-theme.ts` for
 * why that lives on its own attribute rather than as a third value of the
 * light/dark one.
 *
 * `:root` for the COLOURS rather than a scoped class, because those are the
 * whole page: the field the body paints, and the canvas mounted in the root
 * layout, are both outside anything a page could scope to. Scoping an earlier
 * version to a nested element is exactly why its colours reached neither — so
 * do not "tidy" the colours into the skin's selector.
 *
 * **Every value interpolated here is generated, never stored.** `themeVars`
 * builds them out of numbers, and the canvas name comes from a fixed list, so
 * nothing a person typed reaches this string. That is what makes emitting a
 * stylesheet safe; a raw stored value would let a `}` close the rule and
 * everything after it would be CSS somebody else wrote.
 *
 * Its declaration writer is a module-level function now rather than a closure, for the same reason `themeVars` has one — both run on every render of a themed page.
 *
 * @param theme - the chosen theme.
 * @returns the CSS text, or empty when the theme overrides nothing.
 */
export function themeCss(theme: ActorTheme): string {
  // `:not([data-page-theme="default"])` rather than `[data-page-theme="author"]`,
  // and the difference is what a visitor with no JavaScript sees. The attribute
  // is written by a pre-paint script; matching on its ABSENCE as well as on
  // "author" means a page still wears its owner's colours when that script
  // never ran, and only an explicit opt-out takes them off.
  const gate = `:root:not([data-page-theme="default"])`;
  const root = declarations(themeVars(theme));
  const skin = declarations(skinVars(theme.skin));
  return [
    root ? `${gate}{${root}}` : "",
    // **Two selectors, because the two halves reach different things.** Colour
    // has to reach the canvas and the field, which are mounted outside anything
    // a page can wrap, so it goes to the root. A skin only ever restyles
    // surfaces, and every surface is inside the person's own content — so it
    // stops there, and the bar above keeps the app's own shape. The visitor's
    // language and theme controls live in that bar, and a control that changes
    // form on somebody else's page is harder to recognise as one.
    //
    // Both carry the same gate, so taking the theme off takes the style with
    // it rather than leaving a page half in each.
    skin ? `${gate} .${SKIN_SCOPE}{${skin}}` : "",
  ].join("");
}
