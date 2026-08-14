/**
 * The styles a page can be built in.
 *
 * **A skin decides FORM, never colour.** Corners, border weight, shadow, gloss,
 * blur and the body's face — the things that make a surface read as glass or as
 * a sticker or as a window from 1995. Which colours those surfaces are is the
 * gradient's business, and the two are chosen separately on purpose: every
 * combination of a skin and a palette is somebody's page, and tying them
 * together would collapse nine styles into nine colour schemes.
 *
 * The two rules that keep that true, and that a new skin must not break:
 *
 *  * **A skin names no colour of its own.** Where one is needed — a hard drop
 *    shadow, a raised bevel — it reaches for a token the theme already set
 *    (`--ink`, `--edge`) or for a neutral black or white at low alpha, which
 *    reads as light and shade rather than as a hue. A literal `#ff69b4` here
 *    would override a choice its author made elsewhere.
 *  * **A skin is a set of overrides, exactly like the colours.** `default`
 *    holds nothing, so a page nobody has styled emits no form properties at all
 *    and `globals.css` stays entirely in charge.
 *
 * `default` is first because a select opens on its first option, and the list's
 * order is the order somebody reads.
 */
export const SKINS = [
  "default",
  "glass",
  "neobrutalism",
  "aero",
  "candy",
  "clay",
  "paper",
  "terminal",
  "retro",
] as const;

/** One of the skins. */
export type SkinId = (typeof SKINS)[number];

/** The style a page is in when nobody has chosen one. */
export const DEFAULT_SKIN: SkinId = "default";

/**
 * How much of a shadow a skin may cast before it is a colour choice.
 *
 * Black and white at low alpha read as light and shade against any hue, which
 * is what lets a skin have depth without picking a colour. Anything saturated
 * would be the skin overruling the palette.
 */
const SHADE = "rgb(0 0 0 / 0.18)";

/** The same, as a highlight. */
const SHEEN = "rgb(255 255 255 / 0.35)";

/**
 * What each skin overrides.
 *
 * The tokens themselves are declared in `globals.css`, where their defaults
 * reproduce the design exactly — so this table holds only differences and
 * `default` is legitimately empty.
 *
 *  * `--skin-round` is a **multiplier** on Tailwind's radius scale rather than a
 *    length, so a skin says "square" or "twice as round" once instead of
 *    restating five sizes and quietly flattening the relationship between them.
 *  * `--skin-border`, `--skin-shadow` and `--skin-gloss` are applied to every
 *    element carrying Tailwind's `border` utility — see `globals.css`. That is
 *    what makes the edge and the shadow travel together, which is true of all
 *    of these styles: a hard offset shadow with a hairline border is neither
 *    brutalist nor anything else.
 *  * `--surface` and `--bar` are set from `--surface-solid` and `--bar-solid`,
 *    the raw colours the palette produces. **A skin changes their ALPHA and
 *    never their hue**, which is the whole distinction this file rests on:
 *    glass is the author's colour seen through, not a different colour.
 */
const SKIN_VARS: Record<SkinId, Record<string, string>> = {
  /** The design's own. Overrides nothing, exactly as an unchosen colour does. */
  default: {},

  /** Frosted panels over the field, which is what the blur is actually for. */
  glass: {
    "--skin-round": "2",
    "--skin-shadow": `0 8px 32px ${SHADE}`,
    "--skin-blur": "22px",
    "--skin-gloss": `linear-gradient(150deg, ${SHEEN}, transparent 55%)`,
    "--surface": "color-mix(in oklab, var(--surface-solid) 40%, transparent)",
    "--bar": "color-mix(in oklab, var(--bar-solid) 45%, transparent)",
  },

  /**
   * Square, heavy-bordered, with a hard shadow in the ink colour.
   *
   * The shadow is `--ink` rather than black because on a dark page a black
   * offset is invisible, which is the whole gesture gone.
   */
  neobrutalism: {
    "--skin-round": "0",
    "--skin-border": "3px",
    "--skin-shadow": "5px 5px 0 var(--ink)",
    "--skin-blur": "0px",
  },

  /** The glossy, over-lit window: a bright top half falling to a dark one. */
  aero: {
    "--skin-round": "1.8",
    "--skin-shadow": `0 3px 12px ${SHADE}, inset 0 1px 0 ${SHEEN}`,
    "--skin-blur": "16px",
    "--skin-gloss":
      "linear-gradient(to bottom, rgb(255 255 255 / 0.3), rgb(255 255 255 / 0.05) 48%, rgb(0 0 0 / 0.06) 52%, transparent)",
    "--surface": "color-mix(in oklab, var(--surface-solid) 72%, transparent)",
    "--bar": "color-mix(in oklab, var(--bar-solid) 70%, transparent)",
  },

  /** Round to the point of being edible, sitting on a flat colour block. */
  candy: {
    "--skin-round": "3",
    "--skin-border": "2px",
    "--skin-shadow":
      "0 5px 0 color-mix(in oklab, var(--edge) 70%, transparent)",
    "--skin-gloss":
      "linear-gradient(to bottom, rgb(255 255 255 / 0.2), transparent 60%)",
  },

  /** Pillowy and borderless: shape comes entirely from light on the surface. */
  clay: {
    "--skin-round": "3.5",
    "--skin-border": "0px",
    "--skin-shadow": `inset 0 2px 4px ${SHEEN}, inset 0 -3px 6px ${SHADE}, 0 10px 24px ${SHADE}`,
  },

  /** Flat sheets with almost no corner and a shadow instead of an edge. */
  paper: {
    "--skin-round": "0.4",
    "--skin-border": "0px",
    "--skin-shadow": `0 1px 2px ${SHADE}, 0 10px 22px rgb(0 0 0 / 0.1)`,
  },

  /** Monospaced and square, with scanlines across every surface. */
  terminal: {
    "--skin-round": "0",
    "--skin-blur": "0px",
    "--skin-font": "var(--font-mono)",
    "--skin-gloss":
      "repeating-linear-gradient(to bottom, rgb(255 255 255 / 0.05) 0 1px, transparent 1px 3px)",
  },

  /** The bevelled grey box: a lit top-left, a shaded bottom-right, no curve. */
  retro: {
    "--skin-round": "0",
    "--skin-border": "2px",
    "--skin-blur": "0px",
    "--skin-shadow":
      "inset 1px 1px 0 rgb(255 255 255 / 0.55), inset -1px -1px 0 rgb(0 0 0 / 0.35), 2px 2px 0 rgb(0 0 0 / 0.4)",
  },
};

/**
 * The custom properties a skin sets.
 *
 * Returns a fresh object each call, so a caller may spread it and then override
 * an entry without editing the table every later page would read.
 *
 * An unknown name gives the default's — nothing — rather than throwing, for the
 * same reason `parseTheme` falls back per field: the value arrives from a
 * `jsonb` column and a page whose stored skin was renamed must still render.
 *
 * @param skin - the chosen skin.
 * @returns its overrides, which are empty for the default.
 */
export function skinVars(skin: SkinId): Record<string, string> {
  return { ...(SKIN_VARS[skin] ?? SKIN_VARS[DEFAULT_SKIN]) };
}
