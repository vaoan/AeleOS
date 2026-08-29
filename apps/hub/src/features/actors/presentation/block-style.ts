import type { CSSProperties } from "react";
import {
  CORNERS,
  type BlockStyle,
} from "@/features/actors/domain/block-schema";
import { backgroundImageValue } from "@/features/actors/domain/embeds";
import { nestedSkinVars, type SkinId } from "@/shared/domain/skins";

/**
 * The minimum a card may shrink to, by the size an author chose.
 *
 * **Nothing on the public page reads `--card-size` today**, and that is
 * recorded rather than quietly true: the flat `cards` layout it was written
 * for laid `repeat(auto-fill, minmax(min(var(--card-size), 100%), 1fr))` and
 * let the browser decide how many fit, which a container declaring an explicit
 * track count cannot mean any more. The values survive because the meaning
 * does — CSS multi-column's `column-width` is exactly "a minimum width, the
 * browser decides how many fit", which is `masonry`'s to read and the intended
 * home. The editor's own preview still applies what {@link blockStyle} emits,
 * so the property is set and simply not consumed.
 *
 * **Two shapes, and neither is redundant.** The record below is the
 * completeness check — `satisfies Record<…, string>` fails to compile the
 * moment the schema gains a size with no width here, which is exactly the gap
 * nothing would notice while `--card-size` has no reader. The `Map` is what a
 * STORED value is looked up in, because that value arrives from `jsonb` and
 * indexing a plain object with one is the shape that put a `__proto__` through
 * `TIDAL_KINDS`; a `Map` has no inherited entries to find. The `Map` is derived
 * from the record rather than typed again, so there is one number per size to
 * have gotten wrong.
 *
 * **The record went missing when this moved out of `public-sections.tsx` and
 * the `Map` came alone.** Nothing failed, and nothing would have — a fourth
 * size would have compiled and emitted nothing.
 */
const CARD_SIZES = {
  s: "12rem",
  m: "16rem",
  l: "20rem",
} satisfies Record<NonNullable<BlockStyle["card_size"]>, string>;

/**
 * The same widths, by a size that arrived from stored data.
 *
 * See {@link CARD_SIZES} for why there are two shapes and which one a caller
 * wants.
 */
const CARD_SIZE_MIN = new Map<string, string>(Object.entries(CARD_SIZES));

/**
 * The `--skin-round` multiplier each corner stop asks for.
 *
 * A `Map` for the same reason {@link CARD_SIZE_MIN} is one: the key arrives
 * from `jsonb`, and indexing a plain object with stored data is the shape that
 * put a `__proto__` through a lookup once already.
 *
 * `square` is `0` and not a small number — a corner that is nearly square
 * reads as a mistake rather than a choice. `soft` is `1`, which is Tailwind's
 * own scale unmodified, and `round` is `2.5`, chosen to sit between `candy`'s
 * `1.8` and `pill`-like `3.5` so it is visibly a stop of its own.
 */
/** The token each corner name drives. */
const CORNER_PROPERTY = {
  tl: "--corner-tl",
  tr: "--corner-tr",
  br: "--corner-br",
  bl: "--corner-bl",
} as const satisfies Record<(typeof CORNERS)[number], string>;

/**
 * Squares off every corner a list does NOT name.
 *
 * **It writes TOKENS rather than `border-radius`, and that is forced.** This
 * object lands on a WRAPPER — a leaf's own card is nested inside `<Leaf>` and
 * a section's children are cards of their own — so a radius written here
 * reaches nothing that draws a corner. The cards read `--corner-*`, whose
 * default is the `--radius-xl` they already resolved. Same shape as
 * `--block-pad`, and found the same way: by measuring a computed style in a
 * browser and getting 0 where the class said otherwise.
 *
 * **When a list is present all FOUR are written, and that is a correction a
 * browser forced.** Writing only the corners switched off looks tidier and is
 * wrong: these are custom properties, so they INHERIT, and a bar sits inside
 * the section whose own `corners` it would then pick up. Measured — a section
 * squaring its top and a bar rounding its top gave a bar with square top
 * corners, because the two zeroes flowed straight through. Naming all four
 * makes each key self-contained.
 *
 * A rounded corner is written as `var(--radius-xl)`, which is the token the
 * cards already resolved and is itself `calc(var(--skin-round) * …)` — so
 * `radius` still decides how MUCH and this decides WHERE, and the two compose
 * rather than compete.
 *
 * An absent list writes nothing at all, so a page that never set this is
 * byte-for-byte what it was.
 *
 * @param vars - the style object to write into.
 * @param list - the comma-separated corner names, or undefined.
 */
export function squareOffCorners(
  vars: CSSProperties & Record<`--${string}`, string>,
  list: string | undefined,
): void {
  if (!list) return;
  const rounded = new Set(list.split(","));
  for (const corner of CORNERS) {
    vars[CORNER_PROPERTY[corner]] = rounded.has(corner)
      ? "var(--radius-xl)"
      : "0";
  }
}

const ROUNDNESS = new Map<string, string>([
  ["square", "0"],
  ["soft", "1"],
  ["round", "2.5"],
]);

/**
 * The narrowest edge each border style can be drawn on and still be that
 * style, as `--skin-border-min`.
 *
 * **`double` is the reason this exists, and the number was measured rather
 * than reasoned.** CSS defines `double` as two lines and a gap summing to the
 * border width, so below 3px there is nothing to divide: sampling the pixel
 * run across a border in a real Chromium gives `[0]` at 1px and `[0 0]` at
 * 2px, byte-identical to `solid` at the same width, and `[0 gap 0]` only from
 * 3px up. Every skin but `neobrutalism`, `comic` and `sticker` sets a narrower
 * edge than that, so an author picking "Double line" on almost any page saw
 * nothing change at all — a control that accepts a choice and does nothing,
 * with no way to learn why.
 *
 * It is a floor and not a width: `@utility surface` takes the `max()` of the
 * skin's own `--skin-border` and this, so `neobrutalism` and `comic` (3px) and
 * `sticker` (4px) keep their own weight.
 *
 * The other styles carry 1px for the same reason one step down: four skins —
 * `clay`, `paper`, `inset` and `frame` — set `--skin-border: 0px`, where
 * `solid`, `dashed` and `dotted` are equally invisible. Choosing a border is
 * asking for one; **`none` is how somebody asks for no edge**, and it is
 * absent from this map because a floor under a style that paints nothing would
 * be a width with nothing to draw.
 *
 * A `Map` for the same reason {@link CARD_SIZE_MIN} is one.
 */
const BORDER_MIN_WIDTH = new Map<string, string>([
  ["solid", "1px"],
  ["dashed", "1px"],
  ["dotted", "1px"],
  ["double", "3px"],
]);

/**
 * One block's own inline style — its chosen skin, its background picture,
 * both, or neither.
 *
 * **It applies at EVERY level of the tree, which is why it is no longer called
 * `sectionStyle`.** A section is a container at depth 0; a container two levels
 * down chooses a skin exactly as it does, and so does a leaf. The old name
 * described the only place the flat model could put a style bag, and went on
 * describing it after that stopped being true.
 *
 * **It lives in its own module so that one function serves the public page and
 * the editor's live preview.** `SectionPreviewTray` calls it on every
 * keystroke, before anything is saved, and `splitStyle` separates inherited
 * custom properties from paint placed on the preview face. A second style body
 * would have looked identical the day it was written and drifted the first
 * time either changed, with no type error and no failing test, because each
 * file's tests exercise only its own copy.
 *
 * **This returns `undefined`, never `{}`, for a block carrying no `style`** —
 * but that is this function's own contract ("is there anything to override"
 * answered honestly), not the reason an unstyled page stays byte-for-byte what
 * it was. React's SSR serializer drops an empty `style={{}}` exactly as it
 * drops no `style` prop at all, so the DOM-level guarantee is React's; what
 * `undefined` earns here is a caller that can rely on the RETURN VALUE itself,
 * which is where the sabotage of an early return swapped for `return {}` goes
 * red.
 *
 * The skin comes from {@link nestedSkinVars}, never `skinVars` — and it matters
 * more here than it ever did on a flat page, because a skin scope may now sit
 * inside a skin scope inside a skin scope. Only the complete property set stops
 * whatever a block does not override from falling through to the ENCLOSING skin
 * instead of the design's own default. `skin` is never checked against `SKINS`
 * either: an unrecognised name resolves to the same fallback `nestedSkinVars`
 * already gives one, matching the page-level skin's own behaviour.
 *
 * The background address goes through {@link backgroundImageValue}, which
 * carries its own argument for why an address that fails is refused rather than
 * rendered: nothing is painted, never something built from what was typed.
 * `background-repeat` and `background-size` are then BOTH emitted for every
 * fit, the absent one included, so that "Default", "Tile" and "Cover" are three
 * paints rather than two — see the comment at the emission for the measurement
 * that showed the first two were one.
 *
 * `card_size` becomes `--card-size`, which no renderer reads today — see
 * {@link CARD_SIZE_MIN} for why the value is still emitted and where it is
 * going.
 *
 * `border` becomes `--skin-border-style` **and a `--skin-border-min` floor
 * under the width**, both read by `@utility surface` on every plain surface
 * beneath this scope. Without the floor the choice was measurably invisible on
 * most pages: `double` needs 3px to be two lines and a gap, and almost every
 * skin's own edge is narrower than that. `"none"` is a CHOICE and is emitted
 * exactly like `"solid"`; leaving the KEY out of `style` entirely is the
 * separate state, INHERITANCE — the scope then carries no `--skin-border-style`
 * of its own and falls through to whatever the page or an enclosing block
 * already set. An element naming its own Tailwind border-style utility
 * (`border-dashed` and its siblings) keeps that utility regardless of what this
 * emits, by Tailwind's own class ordering.
 *
 * @param style - the block's own style bag, or `undefined` when the author left
 *   it unset.
 * @returns inline styles to spread onto the block's own element, or `undefined`
 *   when nothing about this block overrides what contains it.
 *
 * `chrome` and `text_align` join the bag it emits: `bare` neutralises the card
 * by token rather than by a rule on a generated class.
 *
 * `corners` joins them, squaring off every corner a block does NOT name — see
 * {@link squareOffCorners} for why only the corners switched off emit
 * anything, and why that is what lets `radius` keep deciding how much.
 *
 * `image_fit` and `radius` join it too, and both are emitted as TOKENS for
 * reasons worth keeping. `--img-fit` because the `<img>` that reads it sits
 * inside a leaf this bag never reaches, and it is emitted only when the key is
 * present: the default lives at `:root`, so an unstyled block emitting `cover`
 * would overwrite an enclosing section's `contain`. `--skin-round` because it
 * is a multiplier the skins already spend, which is what lets a block wear
 * `comic` and still be round — and it is written AFTER the skin's own vars are
 * spread into this same object, so the later key wins.
 */
export function blockStyle(
  style: BlockStyle | undefined,
): CSSProperties | undefined {
  if (!style) return undefined;

  const vars: CSSProperties & Record<`--${string}`, string> = {};
  if (style.skin) Object.assign(vars, nestedSkinVars(style.skin as SkinId));

  const backgroundImage = backgroundImageValue(style.background_url);
  if (backgroundImage) {
    vars.backgroundImage = backgroundImage;
    // **Both properties are always emitted, for every fit including the
    // absent one**, exactly as `bodyBackgroundVars` already does for the
    // page's own picture. Emitting only the difference from the initial value
    // left two of the three options painting the same picture, and it was
    // measured rather than argued: `background-repeat`'s initial value is
    // `repeat`, so an 8px tile covering a 64x64 box darkened 2048 of its 4096
    // pixels with the property unset and 2048 with `repeat` — the same
    // screenshot — where a genuinely unrepeated copy darkens 32. "Default"
    // and "Tile" were two names for one behaviour.
    //
    // `background-size` is the same shape one step further: `@utility surface`
    // declares `background-size: var(--skin-gloss-size)` for the gloss, so on
    // the editor's face a picture with no explicit size fell through to
    // whatever the skin's TEXTURE tile is — `comic` sets `6px 6px`, so the
    // preview showed a 6px mosaic of a picture the public page renders at
    // natural size. `auto` here is what the public element, which carries no
    // `surface`, was already getting.
    vars.backgroundRepeat =
      style.background_fit === "tile" ? "repeat" : "no-repeat";
    vars.backgroundSize = style.background_fit === "cover" ? "cover" : "auto";
  }

  const cardSize = CARD_SIZE_MIN.get(style.card_size ?? "");
  if (cardSize) vars["--card-size"] = cardSize;

  // `none` is a CHOICE and absence of the KEY is INHERITANCE — see this
  // function's own doc for why those are different states.
  if (style.border) {
    vars["--skin-border-style"] = style.border;
    // …and a floor under the WIDTH, because a style with no room to be drawn
    // is the same do-nothing control as no style at all. See
    // {@link BORDER_MIN_WIDTH} for the pixels. `none` is absent from that map
    // on purpose, so it emits no floor.
    const floor = BORDER_MIN_WIDTH.get(style.border);
    if (floor) vars["--skin-border-min"] = floor;
  }

  // **`bare` neutralises the card by TOKEN, not by a rule on a class.**
  // Every surface beneath this scope already reads these four, so turning the
  // card off is the same mechanism a skin uses to turn it on — and styling
  // `.surface` from outside a cascade layer is the fault root rule 3 exists
  // for. `card` is the explicit way back, which a block inside a `bare`
  // section needs; absence is inheritance, as everywhere in this bag.
  if (style.chrome === "bare") {
    vars["--surface"] = "transparent";
    vars["--skin-border"] = "0px";
    vars["--skin-border-min"] = "0px";
    vars["--skin-shadow"] = "none";
    vars["--block-pad"] = "0px";
  } else if (style.chrome === "card") {
    vars["--block-pad"] = "1rem";
  }

  // **A token, because the image is inside a leaf this bag never reaches.**
  // The kinds that draw a picture read `--img-fit`; absent leaves the default
  // `cover` declared at `:root`, so an existing page is untouched.
  if (style.image_fit) vars["--img-fit"] = style.image_fit;

  // **Written AFTER the skin, which is what makes it compose.**
  // `nestedSkinVars` is spread into this same object above, so a later key
  // wins — a block may wear `comic` and still be round, which is the whole
  // point of separating the corner from the aesthetic. `--skin-round` is a
  // MULTIPLIER on Tailwind's radius scale, so these are absolute stops rather
  // than nudges, and absence leaves the skin's own number untouched.
  const round = ROUNDNESS.get(style.radius ?? "");
  if (round) vars["--skin-round"] = round;

  squareOffCorners(vars, style.corners);

  // Inherited, so a section set to `center` centres every leaf beneath it
  // without each one carrying the key. A block may still set its own.
  if (style.text_align) vars.textAlign = style.text_align;

  return Object.keys(vars).length > 0 ? vars : undefined;
}
