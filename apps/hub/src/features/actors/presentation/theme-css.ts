/**
 * How a theme becomes CSS.
 *
 * **Split out of `domain/actor-theme.ts` (2026-08-27), and the layer is the
 * point.** Everything here writes CSS — custom-property names, declaration
 * blocks, selectors and a `background-image` list — and CSS is what a page is
 * DRAWN with, not what an actor IS. The domain module keeps the vocabulary: the
 * {@link ActorTheme} shape, its parser and schema, the defaults, and the
 * questions `isThemed` and `isCustomised` answer.
 *
 * The split cost nothing to make because it was already true: every consumer of
 * these four functions was a presentation module — `theme-scope.tsx`,
 * `theme-configurator.tsx` — and none of them is reachable from `domain/`,
 * which the boundary graph forbids. What changes is that the graph now ENFORCES
 * it: a future domain module that wanted to emit a colour cannot import this.
 */

import { parseHex } from "@/shared/domain/color";
import { SKIN_SCOPE, skinVars } from "@/shared/domain/skins";
import { derivePalette } from "@/shared/domain/palette";
import type { Gradient } from "@/shared/domain/gradient";
import { backgroundImageValue } from "@/features/actors/domain/embeds";
import {
  DEFAULT_THEME,
  THEME_SEEDS,
  type ActorTheme,
  type PageFont,
  type PageSpacing,
} from "@/features/actors/domain/actor-theme";

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
 * The page's own background picture, as a `body` rule's declarations.
 *
 * **On `body`, never at `:root`, and that is the one fact this function
 * exists to get right.** `--field` — the author's gradient — is consumed by
 * `body { background: var(--field) }` in `globals.css`. `body` is a
 * descendant of `<html>` (`:root`) and its own background is OPAQUE, painted
 * on top of whatever `<html>` shows beneath it — a browser paints an
 * ancestor's background first and a descendant's over it, always, regardless
 * of property order or specificity. An earlier version of this function
 * wrote `background-image` into the `:root` rule instead, reasoning that
 * spreading it in alongside `derivePalette`'s output would layer it "over"
 * `--field` the way two properties compete within one cascade. They are not
 * two properties in one cascade; they are backgrounds of two different
 * elements, one entirely hidden behind the other, so the picture painted on
 * an element nothing ever shows through. It rendered in every unit test that
 * read the generated CSS **string** and in no browser.
 *
 * **The fix is to paint both layers on the SAME element `--field` already
 * targets.** `background-image` accepts a comma-separated list where the
 * FIRST layer paints on top, so this returns
 * `background-image: url(picture), var(--field)` for `body`, gated on the
 * visitor's own choice exactly like the `:root` rule — a page nobody has
 * customised, or one whose picture is refused, gets no `body` rule at all
 * and keeps the single-layer `background: var(--field)` `globals.css`
 * already declares.
 *
 * **`--field` had to stop being a bare colour for one stop, for this to be
 * sound.** A layer that is not a valid CSS `<image>` makes the WHOLE
 * `background-image` list invalid — see `gradientCss` in `shared/domain/gradient.ts`,
 * which now returns a degenerate gradient (a colour to itself) rather than a
 * bare `#rrggbb`, precisely so `--field` stays usable here at every stop
 * count.
 *
 * `background-repeat` and `background-size` are written as TWO values each,
 * one per layer, because a shorter list would cycle across both and give the
 * gradient the picture's own tiling. The picture gets the author's chosen
 * fit; `--field` gets `no-repeat`/`cover` explicitly, matching what it
 * already rendered as a single layer — a CSS gradient has no intrinsic size,
 * so `cover` and the browser's own default resolve to the same fill either
 * way, but leaving it implicit here would mean trusting that equivalence
 * silently rather than saying it.
 *
 * **Reuses `backgroundImageValue`, the same function `blockStyle` calls for
 * a section's own background picture, rather than a second escaping path.**
 * {@link themeCss} interpolates its result into
 * raw `<style>` blocks, where CSSOM offers no protection at all — those sinks
 * are exactly why `backgroundImageValue` refuses a `"` or a `\` outright
 * rather than trusting `safeHttpUrl`'s own normalisation, which leaves both
 * untouched in a URL's host or query. An address it refuses paints nothing
 * through either emitter, precisely as it does for a section.
 *
 * `tile` and `cover` are the only two fits `ActorTheme` can hold, so the
 * `else` branch below is `cover` for anything else that reaches this
 * function directly — it is exported and its input is only typed, not
 * proven.
 *
 * @param theme - the chosen theme.
 * @returns the declarations for a `body` rule, or an empty object when there
 *   is no picture or the address is refused.
 */
export function bodyBackgroundVars(theme: ActorTheme): Record<string, string> {
  const image = backgroundImageValue(theme.backgroundUrl ?? undefined);
  if (!image) return {};
  const [repeat, size] =
    theme.backgroundFit === "tile"
      ? ["repeat", "auto"]
      : ["no-repeat", "cover"];
  return {
    "background-image": `${image}, var(--field)`,
    "background-repeat": `${repeat}, no-repeat`,
    "background-size": `${size}, cover`,
  };
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
 * **One declaration source serves every emitter**, which is what keeps the
 * editor honest: preview hosts receive this complete set, while the live
 * document atmosphere filters it down to the field and canvas properties.
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
 * person's own content — see `SKIN_SCOPE`. The public page may put this whole
 * return at the document root; the editor's atmosphere emitter must not,
 * because its palette entries would restyle AeleOS controls.
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
 * **The background PICTURE is NOT here**, and that is a correction rather
 * than a design choice carried over from the start: `bodyBackgroundVars`
 * emits it separately, on `body`, because that is the element `--field`
 * actually paints. This return value belongs at `:root`, which `body` sits
 * BENEATH — an opaque descendant background always paints over an ancestor's,
 * so a `background-image` written here would be hidden behind `body`'s own
 * and never render. See `bodyBackgroundVars`'s own doc for the full account.
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
 * The face each named typeface resolves to.
 *
 * **Every stack is faces the reader already has**, so choosing one ships no
 * font file and adds no request — which is what keeps a typeface picker inside
 * the $0 constraint, and why the set is what it is rather than what a type
 * designer would pick. `casual` and `poster` are the two that actually SIGN
 * the era this exists for: a personal page of 2003 in Comic Sans, a banner in
 * Impact.
 *
 * **`satisfies Record<PageFont, …>` rather than a plain record**, so a face
 * added to {@link PAGE_FONTS} with no stack behind it is a build failure
 * rather than a control that offers a name and changes nothing.
 */
const FONT_STACKS = {
  system:
    'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  classic: "Verdana, Tahoma, Geneva, sans-serif",
  serif: '"Times New Roman", Times, Georgia, serif',
  mono: 'ui-monospace, "Cascadia Mono", Consolas, "Courier New", monospace',
  casual: '"Comic Sans MS", "Comic Sans", cursive',
  poster: 'Impact, "Arial Narrow", Haettenschweiler, sans-serif',
} satisfies Record<PageFont, string>;

/**
 * The padding and text size each spacing sets, as ONE pair.
 *
 * Changing either alone is what makes a page look squeezed rather than dense,
 * so the key sets both or neither. Exhaustive over {@link PAGE_SPACINGS} for
 * the reason above.
 */
const SPACINGS = {
  compact: { pad: "0.5rem", text: "0.8125rem" },
  roomy: { pad: "1.5rem", text: "1.0625rem" },
} satisfies Record<PageSpacing, { pad: string; text: string }>;

/**
 * What a page sets on its own CONTENT: the typeface and the spacing.
 *
 * **Separate from `themeVars` because the scope is different**, not because the
 * values are. Colour has to reach the canvas and the field, which sit outside
 * anything a page can wrap, so it goes to `:root`; a face and a padding belong
 * to the author's content and must not touch the app's own bar.
 *
 * Both keys are OPTIONS: absent emits nothing at all, so a page that chose
 * neither is byte-for-byte what it was before either existed.
 *
 * @param theme - the chosen theme.
 * @returns the properties, empty when the page chose neither.
 */
function contentVars(theme: ActorTheme): Record<string, string> {
  const vars: Record<string, string> = {};
  const stack = theme.font ? FONT_STACKS[theme.font] : undefined;
  if (stack) vars["font-family"] = stack;
  const spacing = theme.spacing ? SPACINGS[theme.spacing] : undefined;
  if (spacing) {
    vars["--block-pad"] = spacing.pad;
    vars["font-size"] = spacing.text;
  }
  return vars;
}

/**
 * A theme as CSS.
 *
 * **Three rules, and no media queries at all.** The media queries went when a
 * theme became one palette: it used to emit three selectors per scope so the
 * reader's light or dark choice could pick between two renderings, and there is
 * only one rendering now.
 *
 * The three rules are the colours, the skin and the body's own background
 * picture, and each is separate because each reaches a different element —
 * the comment on the return says which and why. All three carry the same gate
 * on the visitor's choice, so leaving the theme leaves all of it. Any of them
 * may be empty, and a theme overriding nothing produces the empty string,
 * which is what lets `ThemeScope` render no element at all.
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
 * **`body`, for the background picture, is its own rule and not folded into
 * the `:root` one — this is load-bearing, not a style choice.** `--field`,
 * the colour rule writes at `:root`, is consumed by `body`'s own
 * `background`; `body` is a descendant of `:root` with an OPAQUE background
 * of its own, and a descendant's background always paints over an ancestor's.
 * A `background-image` written into the `:root` rule would sit on an element
 * nothing ever shows — which is exactly what an earlier version of this did,
 * and it rendered correctly in every test that read this function's return
 * value as a **string** and in no browser at all, because a string assertion
 * cannot see which element a selector reaches. `bodyBackgroundVars` writes
 * `background-image: url(picture), var(--field)` on `body` itself instead,
 * so the picture and the gradient are two LAYERS of one element's background
 * rather than two elements stacked wrong. See its own doc for the account in
 * full, including why `--field` can no longer be a bare colour.
 *
 * **Every value interpolated here is either generated or refused first, never
 * stored raw.** Most of `themeVars` is built out of numbers, and the canvas
 * and skin names come from fixed lists, so most of what reaches this string
 * is not something a person typed at all. The two exceptions — the cursor and
 * the background picture, both addresses somebody pasted — go through their
 * own escaping (`cursorUrl`, `backgroundImageValue`) before this ever sees
 * them, and each refuses anything that could close the rule rather than
 * writing it verbatim. That is what makes emitting a stylesheet safe; a raw
 * stored value would let a `}` close the rule and everything after it would
 * be CSS somebody else wrote.
 *
 * Its declaration writer is a module-level function now rather than a closure, for the same reason `themeVars` has one — both run on every render of a themed page.
 *
 * @param theme - the chosen theme.
 * @returns the CSS text, or empty when the theme overrides nothing.
 *
 * A page's own typeface and spacing are emitted into the SKIN scope beside the
 * skin, never at `:root`, so a page cannot restyle the app's own bar.
 */
export function themeCss(theme: ActorTheme): string {
  // `:not([data-page-theme="default"])` rather than `[data-page-theme="author"]`,
  // and the difference is what a visitor with no JavaScript sees. The attribute
  // is written by a pre-paint script; matching on its ABSENCE as well as on
  // "author" means a page still wears its owner's colours when that script
  // never ran, and only an explicit opt-out takes them off.
  const gate = `:root:not([data-page-theme="default"])`;
  const root = declarations(themeVars(theme));
  // **The face and the spacing join the SKIN rule, not the `:root` one.** Both
  // are the author's content and neither is the app's: a font-family at
  // `:root` would reset the bar, the account menu and the language toggle to
  // whatever a page chose, which is the same mistake scoping a skin to `:root`
  // would be. `SKIN_SCOPE` is exactly the author's own content.
  const skin = declarations({
    ...skinVars(theme.skin),
    ...contentVars(theme),
  });
  const body = declarations(bodyBackgroundVars(theme));
  return [
    root ? `${gate}{${root}}` : "",
    // **Three selectors, because the three halves reach different elements.**
    // Colour has to reach the canvas and the field, which are mounted outside
    // anything a page can wrap, so it goes to the root. A skin only ever
    // restyles surfaces, and every surface is inside the person's own
    // content — so it stops there, and the bar above keeps the app's own
    // shape. The visitor's language and theme controls live in that bar, and
    // a control that changes form on somebody else's page is harder to
    // recognise as one. The background picture reaches `body`, because that
    // is the element `--field` is consumed by — see the doc above for why
    // this cannot be folded into the `:root` rule.
    //
    // All three carry the same gate, so taking the theme off takes the style
    // with it rather than leaving a page split between them.
    skin ? `${gate} .${SKIN_SCOPE}{${skin}}` : "",
    body ? `${gate} body{${body}}` : "",
  ].join("");
}
