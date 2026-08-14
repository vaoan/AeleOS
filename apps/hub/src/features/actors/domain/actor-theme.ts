import { z } from "zod";
import { parseHex, toHex } from "@/shared/domain/color";
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
 * palette. Today that is the drifting nebula, a starfield, an aurora, and
 * stillness.
 */
export const CANVASES = ["nebula", "stars", "aurora", "none"] as const;

/** One of the canvases. */
export type CanvasId = (typeof CANVASES)[number];

/**
 * How somebody chose their page to look.
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
  background: string | null;
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
  backdropA: null,
  backdropB: null,
  canvas: "nebula",
};

/**
 * What the colour inputs start on before somebody has chosen.
 *
 * The background is here too, because it is now the first colour anybody picks
 * and a picker opening on black would be a poor start.
 *
 * The design's own light-mode values, so a picker opens showing the colour the
 * page is actually wearing rather than black. They are seeds for a control, NOT
 * defaults for a page — {@link DEFAULT_THEME} overrides nothing, and these are
 * what a person sees the moment they decide to start overriding.
 */
export const THEME_SEEDS = {
  background: "#fbf4ec",
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
 * The background is read the same way as the other colours; a theme that has
 * one and nothing else still derives a whole palette from it.
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
    background: colour(stored.background),
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
 * The class an actor's theme is scoped to.
 *
 * **One constant, used by both the public page and the editor's live preview.**
 * They were two separate strings, and the editor's was a class NO element in
 * the tree ever wore — so the preview emitted a stylesheet that matched nothing
 * and a person dragging a colour saw their page not change. A shared name is
 * the only version of this that cannot drift into that state again.
 */
export const THEME_SCOPE = "actor-theme";

/**
 * The theme, as the editor's form holds it.
 *
 * The background joins the other colours. Loose on all of them by design — they are `#rrggbb` or null and nothing else
 * is reachable through a colour input, and the database checks the format
 * anyway. What this pins is the SHAPE, so the form cannot submit a theme with a
 * canvas the renderer has no implementation for.
 */
export const themeSchema = z.object({
  background: z.string().nullable(),
  accent: z.string().nullable(),
  backdropA: z.string().nullable(),
  backdropB: z.string().nullable(),
  canvas: z.enum(CANVASES),
});

/**
 * Sets one colour, and makes every other colour explicit with it.
 *
 * The background is promoted along with the rest, and it matters most: it is
 * the colour every derived one is built from, so a theme with an accent and no
 * background would have nothing to derive against.
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
  key: "background" | "accent" | "backdropA" | "backdropB",
  value: string,
): ActorTheme {
  return {
    ...theme,
    background: theme.background ?? THEME_SEEDS.background,
    accent: theme.accent ?? THEME_SEEDS.accent,
    backdropA: theme.backdropA ?? THEME_SEEDS.backdropA,
    backdropB: theme.backdropB ?? THEME_SEEDS.backdropB,
    [key]: value,
  };
}

/**
 * Whether an author has chosen anything at all.
 *
 * True once ANY colour is the author's own, the background included.
 *
 * The configurator shows "default" until this is true, because a colour input
 * always carries a value and would otherwise present the design's own colour as
 * though somebody had picked it.
 *
 * @param theme - the theme.
 * @returns true when any colour is the author's own.
 */
export function isThemed(theme: ActorTheme): boolean {
  return Boolean(
    theme.background ?? theme.accent ?? theme.backdropA ?? theme.backdropB,
  );
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
 * @param theme - the chosen theme.
 * @returns the custom properties, ready for a rule.
 */
export function themeVars(theme: ActorTheme): Record<string, string> {
  const rgb = (hex: string | null) => {
    const parsed = hex ? parseHex(hex) : null;
    return parsed ? parsed.map((ch) => Math.round(ch * 255)).join(" ") : null;
  };
  const cloudA = rgb(theme.backdropA);
  const cloudB = rgb(theme.backdropB);

  return {
    ...(theme.background
      ? derivePalette(theme.background, theme.accent ?? THEME_SEEDS.accent)
      : {}),
    ...(cloudA ? { "--nebula-a": cloudA } : {}),
    ...(cloudB ? { "--nebula-b": cloudB } : {}),
    ...(theme.canvas === DEFAULT_THEME.canvas
      ? {}
      : { "--canvas": theme.canvas }),
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
 * @param backgroundHex - the background it has to be readable on.
 * @returns the colour as rendered, as `#rrggbb`.
 */
export function accentPreview(
  accentHex: string,
  backgroundHex: string,
): string {
  return derivePalette(backgroundHex, accentHex)["--accent"] ?? accentHex;
}

/**
 * A theme as CSS.
 *
 * **One rule at `:root`, and no media queries at all.** Both of those are
 * consequences of a theme being one palette. It used to emit three selectors
 * per scope so the reader's light or dark choice could pick between two
 * renderings; there is only one rendering now, so there is nothing to pick
 * between.
 *
 * **The rule is gated on the visitor's own choice.** A page wears its owner's
 * colours by default and a visitor may take them off — see `page-theme.ts` for
 * why that lives on its own attribute rather than as a third value of the
 * light/dark one.
 *
 * `:root` rather than a scoped class because a theme is the whole page: the
 * field the body paints, and the canvas mounted in the root layout, are both
 * outside anything a page could scope to. Scoping the earlier version to a
 * nested element is exactly why its colours reached neither.
 *
 * **Every value interpolated here is generated, never stored.** `themeVars`
 * builds them out of numbers, and the canvas name comes from a fixed list, so
 * nothing a person typed reaches this string. That is what makes emitting a
 * stylesheet safe; a raw stored value would let a `}` close the rule and
 * everything after it would be CSS somebody else wrote.
 *
 * @param theme - the chosen theme.
 * @returns the CSS text, or empty when the theme overrides nothing.
 */
export function themeCss(theme: ActorTheme): string {
  const body = Object.entries(themeVars(theme))
    .map(([name, value]) => `${name}:${value}`)
    .join(";");
  // `:not([data-page-theme="default"])` rather than `[data-page-theme="author"]`,
  // and the difference is what a visitor with no JavaScript sees. The attribute
  // is written by a pre-paint script; matching on its ABSENCE as well as on
  // "author" means a page still wears its owner's colours when that script
  // never ran, and only an explicit opt-out takes them off.
  return body ? `:root:not([data-page-theme="default"]){${body}}` : "";
}
