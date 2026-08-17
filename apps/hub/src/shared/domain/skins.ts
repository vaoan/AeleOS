/**
 * The styles a page can be built in.
 *
 * **A skin decides FORM, never colour.** Corners, border weight, shadow, gloss,
 * blur and the body's face — the things that make a surface read as glass or as
 * a sticker or as a window from 1995. Which colours those surfaces are is the
 * gradient's business, and the two are chosen separately on purpose: every
 * combination of a skin and a palette is somebody's page, and tying them
 * together would collapse every style into a colour scheme of its own.
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
 *
 * The ones worth adding were the ones reaching for a MECHANISM none of the
 * others used — a surface that is not there, a tiled texture, a shadow that
 * steps instead of fading, a shadow with no offset at all, a corner cut off
 * rather than rounded, concentric rings instead of one edge. Another set of
 * radius and shadow numbers would have read as a variant of something already
 * here.
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
  "outline",
  "blueprint",
  "comic",
  "inset",
  "sticker",
  "neon",
  "cutout",
  "frame",
] as const;

/**
 * The class marking the part of a page a skin may restyle.
 *
 * **A skin stops at the person's own content.** The AeleOS bar above it — the
 * wordmark, the language and theme toggles, the star — keeps the app's own
 * shape, because those are the visitor's controls and a control that changes
 * form on somebody else's page is harder to recognise as one.
 *
 * That boundary is available to a skin and was NOT available to the colours,
 * which is why the two are emitted at different scopes rather than together.
 * Colour has to reach the canvas and the field, both mounted outside anything a
 * page can wrap; corners and shadows only ever apply to surfaces, and every
 * surface is inside this element.
 *
 * It lives here rather than in the actors feature because `PageShell` puts it
 * on the page and `shared/` may not import a feature. One constant, used by the
 * element and by the rule — the pair drifted apart once already, leaving a
 * class on an element that no rule matched.
 */
export const SKIN_SCOPE = "actor-skin";

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
    "--skin-backdrop": "blur(14px)",
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
    "--skin-backdrop": "blur(8px)",
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
    // **Black, not white, and not faint.** The first version was white at 0.05,
    // which is invisible on a light page and nearly so on a dark one — a gloss
    // that changes nothing, which is the fault this feature keeps being trimmed
    // for. Black reads as a darker line against either.
    "--skin-gloss":
      "repeating-linear-gradient(to bottom, rgb(0 0 0 / 0.16) 0 1px, transparent 1px 3px)",
  },

  /** The bevelled grey box: a lit top-left, a shaded bottom-right, no curve. */
  retro: {
    "--skin-round": "0",
    "--skin-border": "2px",
    "--skin-blur": "0px",
    "--skin-shadow":
      "inset 1px 1px 0 rgb(255 255 255 / 0.55), inset -1px -1px 0 rgb(0 0 0 / 0.35), 2px 2px 0 rgb(0 0 0 / 0.4)",
  },
  /**
   * No surface at all: the page's own background shows through every panel.
   *
   * `transparent` rather than a very low alpha, because the point is that there
   * is nothing there — a wash would be a fourth translucent skin beside glass,
   * aero and the rest. It is the one skin where the author's gradient IS the
   * card, which makes their choice of background and canvas matter more here
   * than anywhere else.
   *
   * Text stays readable without any special handling: the palette already
   * solves it against the gradient's hardest stop, which is exactly what these
   * panels now show.
   */
  outline: {
    "--skin-round": "1.5",
    "--skin-shadow": "none",
    "--surface": "transparent",
    "--bar": "transparent",
  },

  /** Ruled drafting paper: a fine grid across every surface, and no curve. */
  blueprint: {
    "--skin-round": "0",
    "--skin-blur": "0px",
    "--skin-shadow": "none",
    // Two rulings crossed, black so they read on a pale page and a dark one
    // alike. `auto` is deliberate here — a repeating gradient tiles itself, so
    // the spacing is in the stops rather than in the size.
    "--skin-gloss":
      "repeating-linear-gradient(to right, rgb(0 0 0 / 0.1) 0 1px, transparent 1px 24px), repeating-linear-gradient(to bottom, rgb(0 0 0 / 0.1) 0 1px, transparent 1px 24px)",
  },

  /**
   * Printed, not rendered: a heavy line and a halftone dot field.
   *
   * This is the skin `--skin-gloss-size` exists for. A `radial-gradient` with
   * no size is one dot the width of the panel; tiled at six pixels it is
   * newsprint.
   */
  comic: {
    "--skin-round": "0.6",
    "--skin-border": "3px",
    "--skin-blur": "0px",
    "--skin-gloss": "radial-gradient(rgb(0 0 0 / 0.16) 22%, transparent 23%)",
    "--skin-gloss-size": "6px 6px",
  },

  /** Pressed into the page rather than raised off it — clay, inverted. */
  inset: {
    "--skin-round": "1.5",
    "--skin-border": "0px",
    "--skin-shadow": `inset 0 3px 6px ${SHADE}, inset 0 -1px 0 ${SHEEN}`,
  },

  /** Die-cut: a thick ring all the way round, and a shadow beneath it. */
  sticker: {
    "--skin-round": "2.5",
    "--skin-border": "4px",
    "--skin-shadow": "0 6px 14px rgb(0 0 0 / 0.3)",
  },

  /**
   * A halo, not a cast shadow: spread with no offset in either axis.
   *
   * Every other shadow here is displaced — glass falls 8px, neobrutalism 5 and
   * 5, retro 2 and 2 — so each reads as a light source somewhere off the page.
   * A shadow at `0 0` cannot be read that way: nothing is casting it, so the
   * surface itself is emitting, which is the only glow `box-shadow` can make.
   * `frame` also writes a spread, but a hard one with no blur, which is an
   * edge; a spread blurred and centred is a light.
   *
   * **The glow is `--ink`, and that is what keeps it a skin rather than a
   * colour scheme.** On a light page ink is dark and the halo reads as a
   * bloom of shade; on a dark page it is near-white and the sign is lit.
   * Same gesture in both directions — the reasoning neobrutalism's offset
   * already rests on. This is the skin most likely to be "fixed" with a
   * literal cyan, and that would be the skin overruling a colour its author
   * picked somewhere else.
   */
  neon: {
    "--skin-round": "1.5",
    "--skin-shadow":
      "0 0 16px 2px color-mix(in oklab, var(--ink) 34%, transparent), inset 0 0 12px color-mix(in oklab, var(--ink) 14%, transparent)",
  },

  /**
   * Cut from paper: every corner sliced off straight rather than rounded.
   *
   * **The only skin that changes a surface's SHAPE**, which is the thing a
   * radius cannot express however far it is turned — a curve and a chamfer are
   * different cuts, not two settings of one. `--skin-clip` exists for it, and
   * `@utility surface` reads it; see that token's declaration in `globals.css`.
   *
   * `--skin-round` goes to `0` because the two cuts fight: a rounded border
   * arcs inward and the clip then takes a straight chord across the arc,
   * leaving a nub at every corner that looks like a rendering fault rather
   * than a style.
   *
   * **It sets no shadow, and must not.** `clip-path` clips an element's whole
   * paint, `box-shadow` included, so a shadow here would be stored, emitted
   * and invisible — the control that does nothing. The default is `none`
   * already; `nestedSkinVars` restores it, so a `cutout` section inside a
   * shadowed page does not acquire one by inheritance either.
   *
   * **The notch is `min(10px, 25%)` and the bound is load-bearing, not
   * tidiness.** A percentage inside `polygon()` resolves against the reference
   * box's WIDTH on an x coordinate and its HEIGHT on a y one, so one
   * expression clamps each axis by itself. A flat `10px` self-intersects the
   * moment a surface is under 20px in either direction: the `progress`
   * layout's track is `h-2`, so its vertical vertices resolved to `10px` and
   * `-2px`, the path crossed itself, and what a browser paints for that is a
   * winding-rule artefact rather than a chamfer. Bounded, a short surface
   * simply gets a shallower notch — the gesture degrades instead of
   * inverting. This is the same class of failure as a skin that offers a
   * choice and changes nothing, one step worse: it changes something nobody
   * asked for.
   */
  cutout: {
    "--skin-round": "0",
    "--skin-border": "2px",
    "--skin-clip":
      "polygon(min(10px, 25%) 0, calc(100% - min(10px, 25%)) 0, 100% min(10px, 25%), 100% calc(100% - min(10px, 25%)), calc(100% - min(10px, 25%)) 100%, min(10px, 25%) 100%, 0 calc(100% - min(10px, 25%)), 0 min(10px, 25%))",
  },

  /**
   * Matted and hung: a hairline, a mount board, and the moulding round it.
   *
   * **Depth from concentric edges rather than from one border.** Its
   * `box-shadow` layers sit at `0 0 0 Npx` — no offset, no blur, only a
   * growing spread — and draw as rings one outside the next, because every
   * layer is clipped to outside the same border box and the earlier one is
   * painted over the later. A hairline, then the mount board, then the
   * moulding; a last, ordinary drop shadow hangs the result on the wall. Every
   * other edge here is a single line whose weight is `--skin-border`, which is
   * the setting this cannot be expressed as: one line cannot have a gap in it.
   *
   * The mat is `--surface-solid`, the raw panel colour the palette writes, so
   * the mount board is the author's own — a skin reaching their colours the
   * one sanctioned way rather than naming one. `--skin-border` goes to `0`
   * because the innermost ring IS the edge; leaving it would put a second line
   * immediately inside the first.
   */
  frame: {
    "--skin-round": "0.25",
    "--skin-border": "0px",
    "--skin-shadow": `0 0 0 1px color-mix(in oklab, var(--edge) 60%, transparent), 0 0 0 6px var(--surface-solid), 0 0 0 8px var(--edge), 0 8px 18px ${SHADE}`,
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

/**
 * What `globals.css` declares for every property a skin can override.
 *
 * **This duplicates values from a stylesheet, which this repo would normally
 * refuse.** It is pinned rather than trusted: `skins.test.ts` parses
 * `globals.css` and fails when the two disagree, the same idiom that file
 * already uses. The duplication buys the only thing that makes a skin nest —
 * see {@link nestedSkinVars}.
 *
 * `--surface` and `--bar` are the composed forms, not the raw colours. A skin
 * changes their ALPHA and never their hue, so the reset has to restore the
 * composition rather than a literal — and `--surface-solid`/`--bar-solid` vary
 * by light and dark mode, which is exactly why this indirection exists.
 *
 * `--skin-border-style` is the one entry whose default is itself a reference,
 * `var(--tw-border-style)`, rather than a resolved value — and that has to be
 * copied byte for byte, not merely equal in effect. A custom property inherits
 * UNRESOLVED, so restating the reference here (instead of the keyword it
 * currently resolves to) is what keeps a PLAIN `surface` — one naming no
 * border-style utility of its own — in step with Tailwind's own
 * `--tw-border-style` rather than a keyword frozen at declaration time; a
 * scope that overrides this entry with a literal governs those plain
 * surfaces the same way. It does **not** reach an element that carries its
 * own border-style utility (`border-dashed` and friends): Tailwind sorts
 * that shorter utility above `surface` in the cascade and it wins
 * `border-style` outright, in the default case and the overridden one alike
 * — see `globals.css`'s own declaration for the full reasoning and
 * `tests/e2e/border-style-cascade.spec.ts` for the proof against a real
 * browser. No skin sets this property yet; the entry exists so
 * {@link nestedSkinVars} still resets to it for every skin, exactly like
 * every other property here.
 *
 * `--skin-clip` is the entry whose reset matters most and is easiest to
 * forget. It changes a surface's SHAPE, so a nested scope that failed to
 * restore it would inherit an enclosing skin's chamfered corners onto a style
 * that never asked for one — the `paper`-inside-`comic` fault, in the one
 * property where it is not a texture but the outline of the box. It also
 * suppresses `--skin-shadow`, since `clip-path` clips an element's whole paint:
 * resetting it here is what lets a shadowed skin nested inside `cutout` cast
 * its shadow at all.
 */
export const SKIN_DEFAULTS: Record<string, string> = {
  "--skin-round": "1",
  "--skin-clip": "none",
  "--skin-border": "1px",
  // Deliberately the unresolved reference `var(--tw-border-style)`, not a
  // baked-in "solid" — see the token's own declaration in globals.css. A
  // scope that overrides this with a literal governs every PLAIN surface
  // beneath it; an element carrying its own border-style utility
  // (`border-dashed` and friends) keeps it regardless, because Tailwind's
  // utility sort order — not this token — is what decides that.
  "--skin-border-style": "var(--tw-border-style)",
  "--skin-shadow": "none",
  "--skin-gloss": "none",
  "--skin-gloss-size": "auto",
  "--skin-blur": "12px",
  "--skin-backdrop": "none",
  "--skin-font": "var(--font-sans)",
  "--surface": "var(--surface-solid)",
  "--bar": "var(--bar-solid)",
};

/**
 * A skin's properties in FULL, for a scope nested inside another skin.
 *
 * **{@link skinVars} holds differences; this holds the whole set.** At one
 * scope "not set" falls through to `globals.css`, which is right. Nested, "not
 * set" falls through to the ENCLOSING skin — so a `paper` section inside a
 * `comic` page kept comic's halftone, an `outline` page made every section
 * transparent whatever it chose, and a section set to `default` inside a
 * `glass` page was still glass. All three are silent.
 *
 * `skinVars` is deliberately left alone rather than widened: `themeCss` keys
 * the page-level rule on it being empty, so widening it would make an unthemed
 * page start emitting a style element and lose the byte-for-byte guarantee
 * that page carries today.
 *
 * @param skin - the chosen skin.
 * @returns every property a skin can set, the chosen skin's values over the defaults.
 */
export function nestedSkinVars(skin: SkinId): Record<string, string> {
  return { ...SKIN_DEFAULTS, ...skinVars(skin) };
}
