import { ExternalLink, Plus, Quote as QuoteMark } from "lucide-react";
import { Fragment } from "react";
import { contentFor } from "@/features/actors/domain/actor-content";
import {
  backgroundImageValue,
  resolveEmbed,
  safeHttpUrl,
  type EmbedShape,
} from "@/features/actors/domain/embeds";

// Re-exported so this stays the one place `sectionStyle`'s tests and callers
// import it from — it moved to `embeds.ts` so `themeVars` in
// `domain/actor-theme.ts` could reuse the identical function without a
// domain file importing this presentation one; see its own doc there for why.
export { backgroundImageValue } from "@/features/actors/domain/embeds";
import type {
  FursonaSection,
  FursonaSectionItem,
  SectionType,
} from "@/features/actors/domain/section-schema";
import { resolveSocial } from "@/features/actors/domain/social-links";
import { PublicSectionIcon } from "@/features/actors/presentation/public-section-icon";
import { nestedSkinVars, type SkinId } from "@/shared/domain/skins";
import { tid } from "@/shared/infrastructure/test-id";

/**
 * What {@link PublicSections} needs.
 *
 * `parentHost` is route-resolved config, not something this component reads
 * for itself — see its own doc below.
 */
export interface PublicSectionsProps {
  /** What the author wrote. */
  sections: FursonaSection[];
  /** The locale being read, which decides which language is preferred. */
  locale: string;
  /**
   * This deployment's own hostname, for Twitch's `parent=`.
   *
   * **Resolved by the route, not read here.** This component renders on both
   * public pages and neither is the thing that knows its own deployment
   * configuration — the same reason `locale`, `fursonasTitle` and
   * `emptyMessage` are route-resolved props on {@link PublicProfileProps}
   * rather than something a presentation component reaches for itself. Empty
   * means Twitch resolves to nothing and renders as a link; see
   * `domain/embeds.ts`.
   */
  parentHost: string;
}

/**
 * One item's words in the language being read.
 *
 * @param item - the item.
 * @param locale - the locale being read.
 * @returns its title and description, each falling back to English.
 */
const wordsOf = (item: FursonaSectionItem, locale: string) => ({
  title: contentFor(item, "title", locale),
  description: contentFor(item, "description", locale),
});

/**
 * A key derived from what the author stored, rather than from array position.
 *
 * Index keys would in fact be safe here — nothing on this page reorders, adds
 * or removes anything — but a key that survives a future where something does
 * costs nothing now, and `sort_order` is the value `0009` actually stores.
 *
 * @param order - the entry's stored order.
 * @param label - its English name or title, which is required by the schema.
 * @returns a stable key.
 */
const keyOf = (order: number, label: string) => `${order}-${label}`;

/**
 * The `card_size` an author may choose, derived from the schema's own enum
 * rather than restated — so a value {@link CARD_SIZE_MIN} does not cover is a
 * compile error here, not a silent `undefined`.
 */
type CardSize = NonNullable<NonNullable<FursonaSection["style"]>["card_size"]>;

/**
 * The minimum a card in {@link Cards}'s grid may shrink to, by the size an
 * author chose.
 *
 * **The one place these values are written.** `sectionStyle` reads `s`, `m`
 * or `l` from here to fill `--card-size`, and `Cards`'s own template — what
 * `var()` falls back to when a section chose none — interpolates `m`'s entry
 * directly rather than restating it, so there is exactly one number to have
 * gotten wrong per size, not two kept in step by hand.
 *
 * **Chosen so a minimum wider than the viewport is the SMALL screen's
 * behaviour — one column, not an overflow.** A bare `auto-fill`/`minmax`
 * collapses to one column the moment the minimum exceeds what is
 * available, but the collapsed column does **not** shrink below that
 * minimum — the lower bound of `minmax` is a floor, not a suggestion, so
 * that one column overflows its container by exactly the difference. `l`'s
 * 20rem (320px) is wider than the ~288px a 320px phone has left after the
 * page's own padding — `responsive.spec.ts`'s narrowest supported width —
 * so `l` alone would overflow by 16px there, real horizontal scroll on a
 * phone. `Cards` wraps every size's minimum in CSS's own `min()` against
 * `100%` for exactly this reason: that clamps the floor to the container's
 * own width, uniformly, so no size — not `l` today, not a wider one added
 * later — can ever push past it, on any container this ever renders
 * inside. On a laptop-width page (roughly 1200px of content, where every
 * size already fits) the clamp changes nothing: `s` still spreads across
 * several columns and `l` still gives a clean row of its own, confirmed
 * against a real layout engine in `card-size-grid.spec.ts`, because what
 * `auto-fill` actually resolves to is the browser's decision, not this
 * file's.
 */
const CARD_SIZE_MIN: Record<CardSize, string> = {
  s: "12rem",
  m: "16rem",
  l: "20rem",
};

/**
 * The narrowest edge each border style can be drawn on and still be that
 * style, as `--skin-border-min`.
 *
 * **`double` is the reason this exists, and the number was measured rather
 * than reasoned.** CSS defines `double` as two lines and a gap summing to the
 * border width, so below 3px there is nothing to divide: sampling the pixel
 * run across a border in a real Chromium gives `[0]` at 1px and `[0 0]` at
 * 2px, byte-identical to `solid` at the same width, and `[0 gap 0]` only from
 * 3px up. Every skin but `neobrutalism`, `comic` and `sticker` sets a
 * narrower edge than that, so an author picking "Double line" on almost any
 * page saw nothing change at all — a control that accepts a choice and does
 * nothing, with no way to learn why.
 *
 * It is a floor and not a width: `@utility surface` takes the `max()` of the
 * skin's own `--skin-border` and this, so `neobrutalism` and `comic` (3px)
 * and `sticker` (4px) keep their own weight.
 *
 * The other styles carry 1px for the same reason one step down: four skins —
 * `clay`, `paper`, `inset` and `frame` — set `--skin-border: 0px`, where
 * `solid`, `dashed` and `dotted` are equally invisible. Choosing a border is
 * asking for one; **`none` is how somebody asks for no edge**, and it is
 * absent from this map because a floor under a style that paints nothing
 * would be a width with nothing to draw.
 *
 * A `Map` rather than a record because the key arrives from stored data. The
 * enum on both the read and the write path already bounds it, but indexing a
 * plain object with a value that came from a database is the shape that put a
 * `__proto__` through `TIDAL_KINDS`.
 */
const BORDER_MIN_WIDTH = new Map<string, string>([
  ["solid", "1px"],
  ["dashed", "1px"],
  ["dotted", "1px"],
  ["double", "3px"],
]);

/**
 * A section wrapper's own inline style — its chosen skin, its background
 * picture, both, or neither.
 *
 * **Exported so `SectionStylePopup`'s live preview can call this SAME
 * function**, rather than a second copy of it — the popup applies this to the
 * card it is editing, watched on every keystroke, before anything is saved.
 * A second implementation would have looked identical on the day it was
 * written and drifted silently the first time this one changed: no type
 * error and no failing test, because each file's tests exercise only its own
 * copy. `section-style-popup.test.tsx` imports this export directly for
 * exactly that reason.
 *
 * **This returns `undefined`, never `{}`, for a section carrying no
 * `style`** — but that is this function's own contract ("is there anything
 * to override" answered honestly), not the reason an unthemed page stays
 * byte-for-byte what it was before this feature existed. React's SSR
 * serializer drops an empty `style={{}}` exactly as it drops no `style` prop
 * at all — confirmed directly, `renderToStaticMarkup` emits identical markup
 * either way — so the DOM-level guarantee actually comes from React, and a
 * test that only reads the rendered attribute cannot tell the two apart. What
 * `undefined` earns here is a caller that can rely on the RETURN VALUE
 * itself: `sectionStyle`'s own suite in `public-sections.test.tsx` asserts
 * that directly, because it is the one place this can still go red if the
 * early return were ever swapped for `return {}`.
 *
 * The skin comes from {@link nestedSkinVars}, never `skinVars` — this scope
 * is nested inside the page's own skin, so only the full property set stops
 * whatever this section does not override from falling through to the
 * enclosing skin instead of the design's own default. `skin` is never
 * checked against `SKINS` here either: an unrecognised name resolves to the
 * same fallback `nestedSkinVars` already gives one, matching the page-level
 * skin's own behaviour.
 *
 * The background address goes through {@link backgroundImageValue}, which
 * carries its own argument for why an address that fails is refused rather
 * than rendered: nothing is painted, never something built from what was
 * typed. `background-repeat` and `background-size` are then BOTH emitted for
 * every fit, the absent one included, so that "Default", "Tile" and "Cover"
 * are three paints rather than two — see the comment at the emission for the
 * measurement that showed the first two were one.
 *
 * `card_size` becomes `--card-size` through {@link CARD_SIZE_MIN}, read only
 * by `Cards` — every other layout ignores a property it never declares an
 * interest in, which is what lets this live on the same wrapper as the skin
 * and the background rather than needing a layout-specific style path. Left
 * out of the returned object when the author chose none, so `Cards` falls
 * through to its own literal default — sections are SIBLINGS under one grid
 * container, never ancestor and descendant, so there is no other section's
 * value to inherit in the first place.
 *
 * `border` becomes `--skin-border-style` **and a `--skin-border-min` floor
 * under the width**, both read by `@utility surface` on every plain surface
 * beneath this scope — the token Task 1 made reachable and this
 * function is the only thing that sets per section. Without the floor the
 * choice was measurably invisible on most pages: `double` needs 3px to be two
 * lines and a gap, and almost every skin's own edge is narrower than
 * that. `"none"` is a CHOICE and
 * is emitted exactly like `"solid"` or any other member; leaving the KEY out
 * of `style` entirely is the separate state, INHERITANCE — the scope then
 * carries no `--skin-border-style` of its own and falls through to whatever
 * the page or an enclosing section already set. An element naming its own
 * Tailwind border-style utility (`border-dashed` and its siblings) keeps that
 * utility regardless of what this emits, by Tailwind's own class ordering —
 * see `sectionStyleSchema`'s `border` key in `domain/section-schema.ts` for
 * the same distinction stated at the write.
 *
 * @param style - the section's own style bag, or `undefined` when the author
 *   left it unset.
 * @returns inline styles to spread onto the wrapper, or `undefined` when
 *   nothing about this section overrides the page.
 */
export function sectionStyle(
  style: FursonaSection["style"],
): React.CSSProperties | undefined {
  if (!style) return undefined;

  const vars: React.CSSProperties & Record<`--${string}`, string> = {};
  if (style.skin) Object.assign(vars, nestedSkinVars(style.skin as SkinId));

  const backgroundImage = backgroundImageValue(style.background_url);
  if (backgroundImage) {
    vars.backgroundImage = backgroundImage;
    // **Both properties are always emitted, for every fit including the
    // absent one**, exactly as `bodyBackgroundVars` already does for the
    // page's own picture. Emitting only the difference from the initial
    // value left two of the three options painting the same picture, and it
    // was measured rather than argued: `background-repeat`'s initial value
    // is `repeat`, so an 8px tile covering a 64x64 box darkened 2048 of its
    // 4096 pixels with the property unset and 2048 with `repeat` — the same
    // screenshot — where a genuinely unrepeated copy darkens 32. "Default"
    // and "Tile" were two names for one behaviour, and `fitDefault`'s own
    // label promised the one nobody could get.
    //
    // `background-size` is the same shape one step further: `@utility
    // surface` declares `background-size: var(--skin-gloss-size)` for the
    // gloss, so on the editor's face a section picture with no explicit size
    // fell through to whatever the skin's TEXTURE tile is — `comic` sets
    // `6px 6px`, so the preview showed a 6px mosaic of a picture the public
    // page renders at natural size. `auto` here is what the public
    // `<section>`, which carries no `surface`, was already getting.
    vars.backgroundRepeat =
      style.background_fit === "tile" ? "repeat" : "no-repeat";
    vars.backgroundSize = style.background_fit === "cover" ? "cover" : "auto";
  }

  // `--card-size` is read by `Cards`, several elements further down the
  // tree, exactly the way `--skin-round` and the rest already are — a
  // custom property set here and left to inherit, rather than a value
  // threaded through `LAYOUTS` as a prop. Absent when the author chose none,
  // so the grid falls through to its own literal default. Sections are
  // SIBLINGS under one grid container, not ancestor and descendant, so one
  // section's custom property was never reachable from another's in the
  // first place — the fallback is not preventing a leak between them; it is
  // simply what a `var()` with no value set on this element and nothing to
  // inherit resolves to.
  if (style.card_size) vars["--card-size"] = CARD_SIZE_MIN[style.card_size];

  // `--skin-border-style` is read by `@utility surface` on every plain
  // surface beneath this scope — Task 1 made the token reachable; this is
  // the only place a section's own choice reaches it. `none` is a CHOICE
  // ("solid"|…|"none" are all real, equally-valid values) and is emitted
  // like any other; absence of the KEY is what leaves the token unset here,
  // so the scope inherits whatever `--skin-border-style` the page (or an
  // enclosing section) already set — see {@link sectionStyleSchema}'s
  // `border` doc for why those are different states.
  if (style.border) {
    vars["--skin-border-style"] = style.border;
    // …and a floor under the WIDTH, because a style with no room to be drawn
    // is the same do-nothing control as no style at all. See
    // {@link BORDER_MIN_WIDTH} for the pixels. `none` is absent from that map
    // on purpose, so it emits no floor.
    const floor = BORDER_MIN_WIDTH.get(style.border);
    if (floor) vars["--skin-border-min"] = floor;
  }

  return Object.keys(vars).length > 0 ? vars : undefined;
}

/**
 * What a card shows when its author chose no icon.
 *
 * A card without one is a ragged box in a row of anchored ones, so the tile is
 * never empty. Deliberately neutral: it has to stand in for anything somebody
 * might have written about, and a shape that means something would be wrong
 * more often than it was right.
 */
const CARD_ICON = "circle-dot";

/**
 * A section laid out as cards.
 *
 * **The author says how big a card is; the browser says how many fit.** The
 * grid's `grid-template-columns` reads `repeat(auto-fill, minmax(min(var(--card-size, DEFAULT), 100%), 1fr))`,
 * where `DEFAULT` is {@link CARD_SIZE_MIN}'s `m` entry, interpolated in
 * directly rather than typed out again. `--card-size` is an author-chosen
 * minimum set by {@link sectionStyle} on the wrapping `<section>` and read
 * here purely through CSS inheritance, exactly the way `--skin-round`
 * already reaches every `rounded-xl` beneath it. No breakpoint is guessed
 * anywhere: the grid places as many columns as fit at that width and gives
 * each an equal share of what is left, at every viewport, with no
 * `sm:`/`lg:` step between them.
 *
 * **The `min(…, 100%)` wrapper is load-bearing, not decoration.** Bare
 * `minmax(size, 1fr)` does not shrink its floor when the container is
 * narrower than `size` — the collapsed single column stays exactly `size`
 * wide and overflows. `min(size, 100%)` clamps that floor to the
 * container's own width, so no chosen size can ever push a card wider than
 * the space it has, on any container this renders inside — see
 * {@link CARD_SIZE_MIN} for the measured case this closes and
 * `card-size-grid.spec.ts` for the browser-level guard against it
 * regressing.
 *
 * **This replaced a row that scrolled sideways until it was wide enough to be
 * a grid** — fixed `w-56` tiles below `lg`, three fixed columns above it. That
 * design's own doc argued for the scroll row at length and then apologised
 * for it on phones, because a fixed tile width and a fluid viewport are
 * fighting each other from the start: the row was there to hide that a
 * breakpoint-stepped grid cannot make every width look intentional.
 * `auto-fill` does not have that problem, because it is never guessing a
 * breakpoint in the first place — it is asked for a minimum and it lays out
 * however many of them the current width actually holds.
 *
 * **`carousel` is untouched, and it is the honest difference now.** It keeps
 * scrolling sideways at every size — a thing you swipe through, on purpose,
 * chosen by name. `Cards` is no longer that at any width; it is a set of
 * cards that wraps, full stop.
 *
 * **Every card carries an icon tile, including the ones with no icon set.**
 * The tile is what gives a card its anchor, and rendering it only sometimes
 * makes a row of them ragged — which was the other half of why these did not
 * look like cards. An item with no icon, or with a name lucide does not have,
 * gets the default rather than a hole.
 *
 * @returns the cards.
 */
function Cards({
  items,
  locale,
}: {
  items: FursonaSectionItem[];
  locale: string;
}) {
  return (
    <div
      className="grid gap-4"
      style={{
        gridTemplateColumns: `repeat(auto-fill, minmax(min(var(--card-size, ${CARD_SIZE_MIN.m}), 100%), 1fr))`,
      }}
      {...tid("public-cards")}
    >
      {items.map((item) => {
        const { title, description } = wordsOf(item, locale);
        return (
          <div
            key={keyOf(item.sort_order, item.title_en)}
            className="flex flex-col gap-3 rounded-xl surface border-(--edge) bg-(--surface) p-5"
          >
            <span className="grid size-11 w-fit place-items-center rounded-lg surface border-(--edge) bg-(--bar)">
              <PublicSectionIcon name={item.icon} fallback={CARD_ICON} />
            </span>
            <h3 className="font-display text-sm/tight font-bold">{title}</h3>
            {description ? (
              <p className="text-xs/relaxed text-(--muted)">{description}</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/**
 * A section laid out as disclosures.
 *
 * `<details>` and `<summary>`, deliberately: this is the one page in the app a
 * stranger might reach on a hostile network or an old browser, and a disclosure
 * that needs no script is free.
 *
 * **It shows a marker that flips open, and the items share one container.** The
 * first version had neither — a bare `<summary>` with the browser's triangle
 * suppressed by the reset, each item in its own box. Nothing said it opened,
 * and a stack of separate boxes is not an accordion. The plus rotates into a
 * cross on open, which needs no JavaScript either.
 *
 * @returns the disclosures.
 */
function Accordion({
  items,
  locale,
}: {
  items: FursonaSectionItem[];
  locale: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl surface border-(--edge) bg-(--surface)">
      {items.map((item) => {
        const { title, description } = wordsOf(item, locale);
        return (
          <details
            key={keyOf(item.sort_order, item.title_en)}
            className="group border-b border-(--edge)/25 last:border-b-0"
          >
            <summary className="flex cursor-pointer items-center justify-between gap-4 p-5 font-display font-bold [&::-webkit-details-marker]:hidden">
              {title}
              <Plus className="size-5 shrink-0 text-(--muted) transition-transform group-open:rotate-45" />
            </summary>
            {description ? (
              <p className="border-t border-(--edge)/25 bg-(--bar) px-5 py-4 text-sm/relaxed text-(--muted)">
                {description}
              </p>
            ) : null}
          </details>
        );
      })}
    </div>
  );
}

/**
 * A section laid out in two columns.
 *
 * **This is a table of label and value, not a two-column grid of items** — the
 * distinction the first version missed entirely. "Two columns" names the shape
 * of each ROW: the label on the left against a rule, its value on the right.
 * A grid of title-and-paragraph blocks is a different layout that happened to
 * have two of them per row.
 *
 * A description list, because that is exactly what it is: `dt` is the label and
 * `dd` is the value, which a screen reader announces as a pair.
 *
 * **A row with no value does not render, and neither does a list with no rows.**
 * That pairing is the reason: a `dt` without its `dd` is invalid markup, and the
 * answer is to drop both rather than to render half a row. An earlier version
 * kept the blank cell and called it "a row still to be filled in" — but a label
 * with nothing beside it is noise on a page strangers read, and the label comes
 * back the moment its owner writes the value.
 *
 * The empty list matters as much as the empty row: `dl` carries the border and
 * the surface, so a section whose every value is unwritten would otherwise be a
 * bordered box with nothing in it — the same blank cell, one level up.
 *
 * This is the only layout that drops a whole ITEM rather than one element of
 * one. Everywhere else a title with no description is a perfectly good card;
 * here it is half a pair.
 *
 * @returns the table, or nothing when no row has a value.
 */
function TwoColumn({
  items,
  locale,
}: {
  items: FursonaSectionItem[];
  locale: string;
}) {
  const rows = items.filter((item) => wordsOf(item, locale).description);
  if (rows.length === 0) return null;
  return (
    <dl className="grid overflow-hidden rounded-xl surface border-(--edge) bg-(--surface)">
      {rows.map((item) => {
        const { title, description } = wordsOf(item, locale);
        return (
          <div
            key={keyOf(item.sort_order, item.title_en)}
            className="flex items-stretch border-b border-(--edge)/25 last:border-b-0 even:bg-(--bar)"
          >
            <dt className="w-1/3 shrink-0 border-r border-(--edge)/25 px-5 py-3.5 font-display text-sm font-bold">
              {title}
            </dt>
            <dd className="flex-1 px-5 py-3.5 text-sm/relaxed">
              {description}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/**
 * A section laid out as pictures.
 *
 * **An item with no image address is skipped entirely**, rather than rendering a
 * broken image with a caption under it. Somebody who added a slot and has not
 * filled it in yet should see nothing there, not a failure.
 *
 * @returns the gallery.
 */
function Gallery({
  items,
  locale,
}: {
  items: FursonaSectionItem[];
  locale: string;
}) {
  const shown = items.filter((item) => Boolean(item.image_url));
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {shown.map((item) => {
        const { title, description } = wordsOf(item, locale);
        return (
          <figure
            key={keyOf(item.sort_order, item.title_en)}
            className="grid gap-2"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- the address is arbitrary and typed by hand, so next/image would try to optimise a host it has never been configured for. */}
            <img
              src={item.image_url}
              alt={title}
              className="w-full rounded-xl surface border-(--edge) object-cover"
            />
            {description ? (
              <figcaption className="text-xs text-(--muted)">
                {description}
              </figcaption>
            ) : null}
          </figure>
        );
      })}
    </div>
  );
}

/**
 * A section packed into columns of unequal height.
 *
 * **Variable-height packing, not another uniform grid.** `Cards` and
 * `Gallery` both lay out a CSS `grid`, and a grid's ROWS all take the
 * height of the tallest item in them — a long entry beside a short one
 * leaves a gap under the short one for every row they share. CSS
 * multi-column layout (`columns-*`) does not have rows at all: it flows
 * items down one column before starting the next, so a short item is simply
 * followed by whatever comes after it, regardless of how tall the item
 * beside it in a neighbouring column happens to be. That is the one thing
 * neither `Cards` nor `Gallery` can do, which is what earns this its own
 * layout rather than a variant of one of them.
 *
 * **Every item keeps its icon tile, exactly as `Cards` does — including an
 * item with no icon, which gets {@link CARD_ICON}.** A column where only
 * some items are anchored by a tile reads as ragged for the same reason a
 * grid of them did before `Cards` stopped rendering the tile conditionally;
 * the fix carries over unchanged rather than being rediscovered here.
 *
 * `break-inside-avoid` is load-bearing: without it, a browser is free to
 * split one card across a column break, leaving its last line stranded at
 * the top of the next column. Column layout has no row gap to lean on
 * either, so the vertical space between stacked items is a literal margin
 * rather than the `gap` a grid gets for free.
 *
 * @returns the packed items.
 */
function Masonry({
  items,
  locale,
}: {
  items: FursonaSectionItem[];
  locale: string;
}) {
  return (
    <div
      className="columns-1 gap-4 sm:columns-2 lg:columns-3"
      {...tid("public-masonry")}
    >
      {items.map((item) => {
        const { title, description } = wordsOf(item, locale);
        return (
          <div
            key={keyOf(item.sort_order, item.title_en)}
            className="mb-4 grid break-inside-avoid gap-3 rounded-xl surface border-(--edge) bg-(--surface) p-5"
          >
            <span className="grid size-11 w-fit place-items-center rounded-lg surface border-(--edge) bg-(--bar)">
              <PublicSectionIcon name={item.icon} fallback={CARD_ICON} />
            </span>
            <h3 className="font-display text-sm/tight font-bold">{title}</h3>
            {description ? (
              <p className="text-xs/relaxed text-(--muted)">{description}</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Clamps a percentage to what a bar can actually draw.
 *
 * @param value - a percentage, from any of the forms {@link progressValue}
 *   reads — none of which refuses a value outside 0–100 on its own.
 * @returns `value` clamped to the range a bar can render, `[0, 100]`.
 */
function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/**
 * A whole number or a decimal, as the pattern fragment shared by every form
 * {@link progressValue} reads.
 *
 * **Written as an alternation, `(\d+|\d+\.\d+)`, rather than `\d+(?:\.\d+)?`
 * — the two accept the same strings, but only the alternation is
 * star-height 1.** The optional-group form puts a `+` inside a `?`, which
 * `security/detect-unsafe-regex` flags on principle when it can see a
 * pattern at all — regardless of whether the input is actually attacker-
 * controlled or the pattern can actually backtrack catastrophically (it
 * cannot: there is nothing here for two quantifiers to disagree about).
 * Verified directly against the `safe-regex` package the rule is built on:
 * the optional form is rejected, the alternation is accepted.
 *
 * **The rule cannot actually see either form here, and that is worth
 * saying plainly rather than leaving the sentence above to imply
 * otherwise.** `detect-unsafe-regex` only inspects a regex `Literal` or
 * `new RegExp(<Literal>)` — {@link FRACTION_PATTERN} and its siblings below
 * are `new RegExp` calls over a template literal WITH an interpolation, a
 * node shape the rule does not evaluate at all, so `\d+(?:\.\d+)?` would
 * lint clean if it were substituted in today. The alternation stays anyway,
 * on its own merits: it is still the genuinely simpler, linear shape, and
 * keeping it is what lets these ever become literals again — say, if
 * `NUMBER`'s indirection is later found not to be worth it — without
 * silently reintroducing the pattern the rule exists to catch.
 */
const NUMBER = String.raw`\d+|\d+\.\d+`;

/**
 * The patterns {@link progressValue} tries, in the order it tries them,
 * each built from {@link NUMBER} once at module load rather than compiled
 * fresh on every call — none carries the `g`/`y` flags that would make
 * reusing a compiled `RegExp` across calls unsafe.
 */
const FRACTION_PATTERN = new RegExp(`^(${NUMBER})\\s*/\\s*(${NUMBER})$`);
const PERCENT_PATTERN = new RegExp(`^(${NUMBER})\\s*%$`);
const BARE_NUMBER_PATTERN = new RegExp(`^(?:${NUMBER})$`);

/**
 * Reads `progress`'s description as a percentage, or refuses it.
 *
 * A fraction ("3/5", or "7.5/10" — divided and scaled; a zero denominator is
 * refused rather than producing `Infinity`), a percentage ("60%" or
 * "7.5%"), and a bare number ("60" or "7.5", read directly as a
 * percentage) — tried in that order, and nothing else is read. Every form
 * is clamped to `[0, 100]` by {@link clampPercent}, since nothing stops
 * somebody writing "150" or "150%" and a bar has no way to draw past its
 * own edge.
 *
 * **Anything else returns `null`, and that is the point.** Prose, an empty
 * string, or a unit this does not recognise all refuse gracefully rather
 * than producing a broken bar — the same "refuses nothing, shows nothing"
 * trap the embed layouts already avoid by falling back to a link. This is
 * also the common case: a template's unedited placeholder is prose, not a
 * number, and `Progress` reads a refusal as "render the plain label/value
 * row `Stats` already renders, and draw no bar" — never as an error.
 *
 * @param description - the item's description, already resolved to the
 *   locale being read.
 * @returns a percentage from 0 to 100, or `null` when it cannot be read as
 *   one.
 */
function progressValue(description: string): number | null {
  const trimmed = description.trim();

  const fraction = FRACTION_PATTERN.exec(trimmed);
  if (fraction) {
    const denominator = Number(fraction[2]);
    if (denominator === 0) return null;
    const ratio = (Number(fraction[1]) / denominator) * 100;
    // A numerator AND denominator that both overflow `Number` (roughly 309+
    // digits each — reachable, since the text cap is 2000) read as
    // `Infinity / Infinity`, which is `NaN`. Neither side being zero, the
    // guard above does not catch it, and `NaN` is not `null` — so without
    // this, the bar rendered anyway: `aria-valuenow="NaN"` and a
    // `width: "NaN%"` style CSSOM rejects outright, leaving the bar at its
    // block parent's full width. This same check ALSO refuses a NUMERATOR-
    // only overflow (`Infinity / 5` is `Infinity`, not finite) — the right
    // answer for the same reason: nobody could read either as a genuine
    // proportion. Only a DENOMINATOR-only overflow survives it, and not as
    // a special case — `5 / Infinity` is a real, finite `0`, which is
    // exactly what an unreadably large total should draw. Checked after the
    // divide rather than by rejecting a long digit run up front, so this one
    // finite outcome is not thrown away along with the two that are not.
    if (!Number.isFinite(ratio)) return null;
    return clampPercent(ratio);
  }

  const percent = PERCENT_PATTERN.exec(trimmed);
  if (percent) return clampPercent(Number(percent[1]));

  if (BARE_NUMBER_PATTERN.test(trimmed)) return clampPercent(Number(trimmed));

  return null;
}

/**
 * A section of measured proportions, each drawn as a bar.
 *
 * **The title is the label and the description is the value** — the same
 * inversion `Stats` and `Quotes` already carry, because this is one more
 * layout whose two fields do not mean "heading" and "body". Unlike those
 * two, this layout ALSO tries to read the value as a number, through
 * {@link progressValue}: a commission queue, a ref sheet's completion, a
 * species trait on a scale.
 *
 * **A description `progressValue` cannot read renders as a plain row, never
 * a broken bar.** That is `progressValue` returning `null` — see its own
 * doc for the "refuses nothing, shows nothing" trap this avoids and for
 * which forms it does read. A description it CAN read still renders
 * verbatim beside the bar, so nothing an author wrote is hidden behind a
 * rounded percentage it was turned into.
 *
 * @returns the bars.
 */
function Progress({
  items,
  locale,
}: {
  items: FursonaSectionItem[];
  locale: string;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2" {...tid("public-progress")}>
      {items.map((item) => {
        const { title, description } = wordsOf(item, locale);
        const value = progressValue(description);
        return (
          <div
            key={keyOf(item.sort_order, item.title_en)}
            className="grid gap-2 rounded-xl surface border-(--edge) bg-(--surface) p-4"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs tracking-wide text-(--muted) uppercase">
                {title}
              </span>
              {description ? (
                <span className="font-display text-sm font-bold">
                  {description}
                </span>
              ) : null}
            </div>
            {value === null ? null : (
              <div
                role="progressbar"
                aria-label={title}
                aria-valuenow={Math.round(value)}
                aria-valuemin={0}
                aria-valuemax={100}
                className="h-2 overflow-hidden rounded-full surface border-(--edge) bg-(--bar)"
              >
                <div
                  className="h-full rounded-full bg-(--accent)"
                  style={{ width: `${value}%` }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * A section switched one panel at a time, horizontally.
 *
 * **The distinction from `Accordion` that keeps the two from reading as
 * duplicates: `accordion` is vertical and every `<details>` opens
 * independently of every other; this shows exactly ONE panel at a time,
 * chosen from a row of tabs.** A `<details>` element cannot do that on its
 * own, because each one only knows its own open state — nothing coordinates
 * them into a group where opening one closes the rest.
 *
 * **A native radio group and CSS's `:has()`/`:checked` decide which panel
 * shows, so this stays a server component with no script of its own.** Every
 * tab is a real, focusable `<input type="radio">`; arrow keys move between
 * them exactly as they do in any other native radio group, and a screen
 * reader announces each as one choice among the others — all of it free,
 * where a hand-rolled `role="tablist"` needs a script managing focus to get
 * the same thing.
 *
 * **A tab's radio and its own panel are interleaved in the DOM, each pair a
 * `Fragment`, not grouped into two separate lists.** `label:has(:checked)+&`
 * — one fixed selector, identical for every item — selects a panel by its
 * ONE immediately preceding sibling, so no item needs an index-specific class
 * name Tailwind's build-time scan could never see anyway, since these render
 * from a list whose length is not known until a page is requested. The tab
 * row still sits visually above every panel: `order-1`/`order-2` reorders the
 * two kinds of element for LAYOUT without moving them in the document, and a
 * CSS combinator reads document order, never the painted one.
 *
 * `sectionKey` names the radio group's own `name` attribute, so two `tabs`
 * sections on the same page do not fight over which of their own tabs is
 * selected — an HTML radio group's `name` is unique to the whole document,
 * not scoped to the component that renders it. `PublicSections` prefixes it
 * with the section's own array index for exactly this, since `sort_order`/
 * `name_en` alone do not guarantee two sections cannot collide. A `name`
 * tolerates whatever an author typed, including whitespace — HTML places no
 * character restriction on it — which is NOT true of the id built below.
 *
 * **Each radio carries `aria-controls`, pointing at its own panel's `id` —
 * built from `sectionId` and the item's own array index, never from
 * `sectionKey`.** `sectionKey` carries `name_en`, an author's free text, and
 * an HTML `id` must not contain whitespace; `aria-controls` is worse than
 * merely fussy about it, because it takes a space-separated ID-reference
 * LIST, so a single id containing a space tokenises into pieces that
 * resolve to nothing. A dangling `aria-controls` is worse than none at
 * all — it tells a screen reader a relationship exists and then fails to
 * deliver it — so `panelId` is built only from values that cannot carry
 * whitespace: `sectionId` (see `PublicSections`'s own doc) and a plain
 * array index.
 *
 * **The panel is a plain rounded card, not visually joined to its tab.** An
 * earlier version pulled the panel up over the label's own bottom border
 * with `-mb-px`, meant to merge the two into one continuous edge — but nothing
 * here has a container bottom rule for that negative margin to disappear
 * into, the arrangement `-mb-px` normally relies on, so it instead ate half
 * of the active tab's own underline where the two met. Rounding every corner
 * and adding a small gap reads correctly regardless of which tab is
 * selected, where the previous square top-left corner read as "the panel
 * belongs to the first tab" the moment any other one was chosen.
 *
 * **Reading order is not painted order, and that is a known cost of this
 * mechanism rather than an oversight.** DOM order is tab, panel, tab, panel
 * — a screen reader or a linear reader reaches panel 1 before tab 2, even
 * though panel 1 paints BELOW tab 2 once `order-1`/`order-2` place every tab
 * above every panel. This is what buys the whole layout being a server
 * component with no script managing focus; the trade is accepted, not
 * hidden.
 *
 * @returns the tabs.
 */
function Tabs({
  items,
  locale,
  sectionKey,
  sectionId,
}: {
  items: FursonaSectionItem[];
  locale: string;
  sectionKey: string;
  sectionId: string;
}) {
  return (
    <div className="flex flex-wrap" {...tid("public-tabs")}>
      {items.map((item, index) => {
        const { title, description } = wordsOf(item, locale);
        // Built from `sectionId` and this item's own array index — both
        // plain numbers — never from `sectionKey`, which carries the
        // section's `name_en` and can contain whitespace or anything else
        // an author typed. An HTML `id` must not contain whitespace, and
        // `aria-controls` takes a space-separated ID-reference LIST, so a
        // single id with a space in it tokenises into pieces that resolve
        // to nothing — a dangling reference, which is worse than no
        // `aria-controls` at all rather than merely useless.
        const panelId = `${sectionId}-panel-${index}`;
        return (
          <Fragment key={keyOf(item.sort_order, item.title_en)}>
            <label className="order-1 cursor-pointer border-b-2 border-transparent px-4 py-2 text-sm font-medium text-(--muted) has-checked:border-(--accent) has-checked:text-(--ink) has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-(--accent)">
              <input
                type="radio"
                name={sectionKey}
                defaultChecked={index === 0}
                aria-controls={panelId}
                className="sr-only"
              />
              {title}
            </label>
            <div
              id={panelId}
              className="order-2 mt-2 hidden w-full rounded-xl surface border-(--edge) bg-(--surface) p-5 [label:has(:checked)+&]:block"
            >
              {description ? (
                <p className="text-sm/relaxed text-(--muted)">{description}</p>
              ) : null}
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

/**
 * The frame classes for each {@link EmbedShape}.
 *
 * A `Record<EmbedShape, …>` rather than a chain of ternaries, and the type is
 * the point: it fails to compile the moment `EmbedShape` grows a member with
 * no class behind it, where a ternary would compile happily and send an
 * unrecognised shape down whichever branch it fell into by accident — exactly
 * the trap `LAYOUTS` above this exists to avoid for section types.
 */
const FRAME_SHAPE: Record<EmbedShape, string> = {
  video: "aspect-video w-full rounded-xl surface border-(--edge)",
  portrait: "aspect-9/16 w-full max-w-80 rounded-xl surface border-(--edge)",
  audio: "h-42 w-full rounded-xl surface border-(--edge)",
  // A post's height is whatever its author wrote, not a ratio, so it is a
  // fixed-height column that scrolls its own content — a narrow one, because
  // every provider's own widget (Telegram, Instagram, a tweet, a Mastodon
  // status) is designed to sit in a sidebar rather than span a page. 600px
  // tall, 420px wide — chosen by that reasoning, not measured against any
  // provider's real rendered content. The frame scrolls its own content, so a
  // wrong guess costs dead space rather than a broken render; that is why
  // this is a deliberate, proportionate exception to "measure, do not
  // eyeball" rather than an oversight of it.
  post: "h-150 w-full max-w-105 rounded-xl surface border-(--edge)",
};

/**
 * One embedded player, or the link it could not resolve to one.
 *
 * **`resolveEmbed` decides the address, never the author.** What it returns is
 * built from a template on an allowlisted host, so the value stored on the item
 * cannot reach the frame — see that function's TSDoc for the whole argument.
 *
 * Anything it refuses renders as a plain link rather than as nothing. Silence
 * would leave somebody looking at a gap on their own page with no way to learn
 * that the address they pasted is not one this hub can play.
 *
 * The frame is sandboxed, lazy, and asks for no autoplay permission. A profile
 * that starts making noise at whoever opened it is the thing people remember
 * most fondly and least accurately about the pages this is modelled on; the
 * layouts are welcome back, that part is not.
 *
 * Its aspect comes from {@link FRAME_SHAPE}, keyed on `embed.shape` — never
 * guessed from the provider here, and never a ternary: a two-way test on
 * `shape === "video"` sent every future shape down the `audio` branch, which
 * is exactly the mistake TikTok's `portrait` shape would have made silent.
 *
 * @returns the player, the link, or nothing when the author left it empty.
 */
function Player({
  url,
  title,
  fallback,
  parentHost,
}: {
  url: string | undefined;
  title: string;
  fallback: string;
  parentHost: string;
}) {
  const embed = resolveEmbed(url, { parentHost });
  if (!embed) {
    const href = safeHttpUrl(url);
    return href ? (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer nofollow ugc"
        className="inline-flex items-center gap-2 text-sm text-(--accent) underline underline-offset-4"
      >
        <ExternalLink className="size-4 shrink-0" />
        {fallback}
      </a>
    ) : null;
  }

  return (
    <iframe
      src={embed.src}
      title={title}
      loading="lazy"
      referrerPolicy="strict-origin-when-cross-origin"
      // No `autoplay`. Everything else is what a player legitimately needs.
      allow="clipboard-write; encrypted-media; picture-in-picture; fullscreen"
      sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"
      className={FRAME_SHAPE[embed.shape]}
    />
  );
}

/**
 * A section of embedded videos.
 *
 * @returns the videos.
 */
function Video({
  items,
  locale,
  parentHost,
}: {
  items: FursonaSectionItem[];
  locale: string;
  parentHost: string;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {items.map((item) => {
        const { title, description } = wordsOf(item, locale);
        return (
          <figure
            key={keyOf(item.sort_order, item.title_en)}
            className="grid gap-2"
          >
            <Player
              url={item.link_url}
              title={title}
              fallback={title}
              parentHost={parentHost}
            />
            <figcaption className="grid gap-1">
              <h3 className="font-display font-bold">{title}</h3>
              {description ? (
                <p className="text-sm/relaxed text-(--muted)">{description}</p>
              ) : null}
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}

/**
 * A section of embedded music.
 *
 * One column rather than a grid: a player is a wide, short thing, and two side
 * by side leaves each too narrow to show a track name.
 *
 * @returns the players.
 */
function Music({
  items,
  locale,
  parentHost,
}: {
  items: FursonaSectionItem[];
  locale: string;
  parentHost: string;
}) {
  return (
    <div className="grid gap-5">
      {items.map((item) => {
        const { title, description } = wordsOf(item, locale);
        return (
          <div
            key={keyOf(item.sort_order, item.title_en)}
            className="grid gap-2"
          >
            <div className="flex flex-wrap items-baseline gap-x-3">
              <h3 className="font-display font-bold">{title}</h3>
              {description ? (
                <p className="text-sm text-(--muted)">{description}</p>
              ) : null}
            </div>
            <Player
              url={item.link_url}
              title={title}
              fallback={title}
              parentHost={parentHost}
            />
          </div>
        );
      })}
    </div>
  );
}

/**
 * A section of pictures on one swipeable row.
 *
 * **Scroll snapping rather than JavaScript.** A carousel is the layout most
 * often built as a client component with a timer and two arrow buttons; CSS
 * does the same job here, so this file stays a server component, every picture
 * is reachable in order by keyboard and by a screen reader, and nothing moves
 * on its own while somebody is reading.
 *
 * Items with no picture are dropped, exactly as the gallery drops them.
 *
 * @returns the carousel.
 */
function Carousel({
  items,
  locale,
}: {
  items: FursonaSectionItem[];
  locale: string;
}) {
  const shown = items.filter((item) => Boolean(item.image_url));
  return (
    <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-3">
      {shown.map((item) => {
        const { title, description } = wordsOf(item, locale);
        return (
          <figure
            key={keyOf(item.sort_order, item.title_en)}
            className="grid w-[85%] shrink-0 snap-center gap-2 sm:w-96"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- the address is arbitrary and typed by hand, so next/image would try to optimise a host it has never been configured for. */}
            <img
              src={item.image_url}
              alt={title}
              className="aspect-4/3 w-full rounded-xl surface border-(--edge) object-cover"
            />
            <figcaption className="text-xs text-(--muted)">
              <span className="font-medium text-(--ink)">{title}</span>
              {description ? ` ${description}` : null}
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}

/**
 * A section of links out.
 *
 * **Every address goes through `safeHttpUrl`, and one that fails renders as
 * plain text rather than as a link.** React escapes text and not URL schemes,
 * so an anchor is the one place on this page where what somebody pasted would
 * otherwise become script running in the reader's session.
 *
 * They carry `nofollow ugc` as well as `noopener noreferrer`. The second pair
 * is about the reader's tab; the first is about this being a page anybody can
 * publish links on, which is a thing search engines are entitled to know before
 * a fursona page becomes a way to buy ranking.
 *
 * @returns the links.
 */
function Links({
  items,
  locale,
}: {
  items: FursonaSectionItem[];
  locale: string;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => {
        const { title, description } = wordsOf(item, locale);
        const href = safeHttpUrl(item.link_url);
        const inside = (
          <>
            {item.icon ? (
              <span className="grid size-9 shrink-0 place-items-center rounded-lg surface border-(--edge) bg-(--bar)">
                <PublicSectionIcon name={item.icon} />
              </span>
            ) : null}
            <span className="grid gap-0.5">
              <span className="font-display text-sm font-bold">{title}</span>
              {description ? (
                <span className="text-xs text-(--muted)">{description}</span>
              ) : null}
            </span>
          </>
        );
        const shape =
          "flex items-center gap-3 rounded-xl surface border-[var(--edge)] bg-[var(--surface)] p-4";
        return href ? (
          <a
            key={keyOf(item.sort_order, item.title_en)}
            href={href}
            target="_blank"
            rel="noopener noreferrer nofollow ugc"
            className={`${shape} transition-colors hover:border-(--accent)`}
          >
            {inside}
          </a>
        ) : (
          <div key={keyOf(item.sort_order, item.title_en)} className={shape}>
            {inside}
          </div>
        );
      })}
    </div>
  );
}

/**
 * What a chip shows when it carries neither an author's icon nor a
 * recognised brand's.
 *
 * `resolveSocial` returns `icon: undefined` for a host it does not know, by
 * design — see its own TSDoc. Leaving the tile empty then would make it
 * ragged beside chips that do have one, the same fault {@link CARD_ICON}
 * exists to avoid for cards. A globe reads as "somewhere on the web" for any
 * host at all, which is exactly what a chip with no other information is.
 */
const SOCIAL_ICON = "globe";

/**
 * One branded link chip — an anchor when `resolveSocial` can build one, a
 * plain `span` otherwise.
 *
 * **Extracted from `Socials` so `Posts` can render the identical chip** as
 * its fallback for an address that resolves to no post provider — reusing
 * this rather than growing a second copy is what keeps the two from
 * quietly disagreeing about how an unrecognised or unsafe address looks. An
 * address `resolveSocial` refuses — `javascript:`, `data:`, anything that
 * fails to parse — must never reach an `href`; React escapes text, not URL
 * schemes, and this is a page strangers read. The item still renders as
 * text so its author can see what they typed.
 *
 * **The item's own icon wins over the derived one.** An author who picked an
 * icon meant it; only an empty selection falls through to what `resolveSocial`
 * derived from the address, and then to {@link SOCIAL_ICON} when neither
 * exists.
 *
 * **The authored title is the chip's main text**, falling back to the brand's
 * own label only when the title is empty — which the schema does not allow in
 * practice, but this file never trusts a caller's validation over its own
 * rendering. The handle sits beneath it, and only appears at all when
 * `resolveSocial` found one in the address.
 *
 * Every anchor carries `nofollow ugc` alongside `noopener noreferrer`, the
 * same pairing `Links` carries and for the same reason: the second pair is
 * about the reader's own tab, and the first is about this being a page
 * anybody can publish links on.
 *
 * @returns the chip.
 */
function SocialChip({
  item,
  locale,
}: {
  item: FursonaSectionItem;
  locale: string;
}) {
  const { title } = wordsOf(item, locale);
  const social = resolveSocial(item.link_url);
  const label = title || social?.label || "";
  const shape =
    "flex items-center gap-3 rounded-xl surface border-(--edge) bg-(--surface) p-4";
  const inside = (
    <>
      <span className="grid size-9 shrink-0 place-items-center rounded-lg surface border-(--edge) bg-(--bar)">
        <PublicSectionIcon
          name={item.icon || social?.icon}
          fallback={SOCIAL_ICON}
        />
      </span>
      <span className="grid gap-0.5">
        <span className="font-display text-sm font-bold">{label}</span>
        {social?.handle ? (
          <span className="text-xs text-(--muted)">{social.handle}</span>
        ) : null}
      </span>
    </>
  );
  return social ? (
    <a
      href={social.href}
      target="_blank"
      rel="noopener noreferrer nofollow ugc"
      className={`${shape} transition-colors hover:border-(--accent)`}
    >
      {inside}
    </a>
  ) : (
    <span className={shape}>{inside}</span>
  );
}

/**
 * A wall of branded link chips, one per address the author pasted.
 *
 * **This is the layout that carries the whole "as connected as possible"
 * promise on its own, and it needs no third-party cooperation to do it.**
 * Where `Links` turns an address into a plain button, this one names the
 * service — `resolveSocial` brands a known host with its own label, icon and
 * handle, and still turns an unknown host into a usable chip labelled with
 * its own hostname. There is no "is this host known" branch here: that
 * decision already happened in `resolveSocial`, and repeating it here would
 * only give the two a chance to disagree.
 *
 * Every item renders through {@link SocialChip}; see that component for the
 * anchor-vs-text and icon-precedence rules.
 *
 * @returns the chips.
 */
function Socials({
  items,
  locale,
}: {
  items: FursonaSectionItem[];
  locale: string;
}) {
  return (
    <div className="flex flex-wrap gap-3" {...tid("public-socials")}>
      {items.map((item) => (
        <SocialChip
          key={keyOf(item.sort_order, item.title_en)}
          item={item}
          locale={locale}
        />
      ))}
    </div>
  );
}

/**
 * A section of embedded social posts.
 *
 * **An address that resolves to no post provider renders as a `SocialChip`,
 * never as nothing and never as a bare link.** Telegram, Instagram,
 * X/Twitter, Pinterest and a named list of Mastodon instances cover only a
 * slice of "as connected as possible"; Bluesky is the case this fallback
 * exists for, since `embed.bsky.app` hard-refuses the handle a pasted Bluesky
 * address carries (see `embed-providers.ts`) and so never resolves here. The
 * chip still names the service and links to it, which is strictly better than
 * an author's post silently not appearing.
 *
 * Unlike `Player`, which the video and music layouts use, this never falls
 * back to a plain link: a fursona page that already brands Bluesky as a chip
 * on the `socials` layout would be inconsistent showing it as an unbranded
 * button here instead.
 *
 * @returns the posts.
 */
function Posts({
  items,
  locale,
}: {
  items: FursonaSectionItem[];
  locale: string;
}) {
  return (
    <div
      className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
      {...tid("public-posts")}
    >
      {items.map((item) => {
        const embed = resolveEmbed(item.link_url);
        if (!embed) {
          return (
            <SocialChip
              key={keyOf(item.sort_order, item.title_en)}
              item={item}
              locale={locale}
            />
          );
        }
        const { title, description } = wordsOf(item, locale);
        return (
          <figure
            key={keyOf(item.sort_order, item.title_en)}
            className="grid gap-2"
          >
            <iframe
              src={embed.src}
              title={title}
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
              // No `autoplay`. Everything else is what a player legitimately
              // needs — see `Player`'s own doc for the same rule.
              allow="clipboard-write; encrypted-media; picture-in-picture; fullscreen"
              sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"
              className={FRAME_SHAPE[embed.shape]}
            />
            {description ? (
              <figcaption className="text-xs text-(--muted)">
                {description}
              </figcaption>
            ) : null}
          </figure>
        );
      })}
    </div>
  );
}

/**
 * A section of short facts.
 *
 * The title is the LABEL and the description is the VALUE, which is the reverse
 * of how the two read on every other layout — a stat is "Species: arctic fox",
 * and the half worth setting large is the answer. **This is a claim about
 * RENDERING only** — the editor's own title/description fields keep their
 * generic names here; `progress` is the one layout whose editor fields are
 * actually renamed, through `FIELD_NAMES` in `section-item-fields.tsx`, and
 * that file's own doc says why only that one earns it.
 *
 * @returns the stats.
 */
function Stats({
  items,
  locale,
}: {
  items: FursonaSectionItem[];
  locale: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((item) => {
        const { title, description } = wordsOf(item, locale);
        return (
          <div
            key={keyOf(item.sort_order, item.title_en)}
            className="grid gap-1 rounded-xl surface border-(--edge) bg-(--surface) p-4"
          >
            <span className="text-xs tracking-wide text-(--muted) uppercase">
              {title}
            </span>
            {description ? (
              <span className="font-display text-lg/tight font-bold">
                {description}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/**
 * A section of quotations.
 *
 * The description is what was said and the title is who said it, so this is the
 * other layout whose two fields do not mean what they mean elsewhere.
 *
 * @returns the quotations.
 */
function Quotes({
  items,
  locale,
}: {
  items: FursonaSectionItem[];
  locale: string;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {items.map((item) => {
        const { title, description } = wordsOf(item, locale);
        return (
          <figure
            key={keyOf(item.sort_order, item.title_en)}
            className="grid gap-3 rounded-xl surface border-(--edge) bg-(--surface) p-5"
          >
            <QuoteMark className="size-5 text-(--accent)" />
            {description ? (
              <blockquote className="font-display text-lg/snug text-balance">
                {description}
              </blockquote>
            ) : null}
            <figcaption className="text-xs text-(--muted) before:mr-1 before:content-['—']">
              {title}
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}

/**
 * A section of entries in order.
 *
 * The rule down the left is a border on the list rather than an element per
 * row, so nothing decorative lands in the accessibility tree — a screen reader
 * gets an ordinary ordered list of headings and paragraphs.
 *
 * @returns the timeline.
 */
function Timeline({
  items,
  locale,
}: {
  items: FursonaSectionItem[];
  locale: string;
}) {
  return (
    <ol className="grid gap-6 border-l border-(--edge) pl-6">
      {items.map((item) => {
        const { title, description } = wordsOf(item, locale);
        return (
          <li
            key={keyOf(item.sort_order, item.title_en)}
            className="relative grid gap-1"
          >
            <span
              aria-hidden
              className="absolute top-1.5 -left-7.5 size-3 rounded-full border-2 border-(--surface) bg-(--accent)"
            />
            <h3 className="font-display font-bold">{title}</h3>
            {description ? (
              <p className="text-sm/relaxed text-(--muted)">{description}</p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Every layout, by the name stored on the section.
 *
 * A lookup rather than a chain of tests, and the TYPE is what makes it safe:
 * `Record<SectionType, …>` fails to compile the moment `SECTION_TYPES` gains a
 * name with no renderer behind it. The chain of ternaries this replaced would
 * have compiled happily and rendered a heading with nothing underneath it.
 *
 * **Every layout is handed `parentHost`, `sectionKey` and `sectionId`, and
 * only `Tabs` reads `sectionKey` or `sectionId`.** `Video` and `Music` read
 * `parentHost`. `Tabs` reads `sectionKey` to name its radio group, so two
 * `tabs` sections on the same page do not fight over each other's
 * selection, and `sectionId` to build each panel's `id` — a SEPARATE value
 * from `sectionKey` because `sectionKey` carries the section's own
 * `name_en`, free text that can contain whitespace, which an HTML `id` must
 * not. The props type is widened rather than giving any of them a different
 * signature: a `Record` whose entries disagree on signature stops being the
 * compile-time guard that makes a missing renderer impossible, which is the
 * whole reason this is a `Record` and not a chain of tests.
 *
 * @returns nothing — this is the table, not a function.
 */
const LAYOUTS: Record<
  SectionType,
  (props: {
    items: FursonaSectionItem[];
    locale: string;
    parentHost: string;
    sectionKey: string;
    sectionId: string;
  }) => React.ReactNode
> = {
  cards: Cards,
  accordion: Accordion,
  "two-column": TwoColumn,
  gallery: Gallery,
  video: Video,
  music: Music,
  carousel: Carousel,
  links: Links,
  stats: Stats,
  quote: Quotes,
  timeline: Timeline,
  socials: Socials,
  posts: Posts,
  masonry: Masonry,
  progress: Progress,
  tabs: Tabs,
};

/**
 * Everything an actor wrote about themselves, laid out as they chose.
 *
 * A **server component**, and the whole file is written to stay one. The only
 * client code on a public page is `PublicSectionIcon`, because lazy-loading a
 * glyph needs it — see that file for why the boundary is drawn there.
 *
 * Every string comes through `contentFor`, so the locale's language is
 * preferred and English is the fallback. An actor with nothing written renders
 * **nothing at all** rather than an empty-state message: a page with no sections
 * is a page somebody has not finished, and a stranger has no use for being told
 * so.
 *
 * **The layout is chosen from the `LAYOUTS` record, not by a chain of tests.**
 * That record is typed `Record<SectionType, …>`, so a layout added to
 * `SECTION_TYPES` with no renderer behind it fails to compile — where the chain
 * of ternaries this replaced would have compiled happily and rendered a heading
 * with nothing underneath it.
 *
 * Three of the layouts frame third-party players, and **none of them frames an
 * address an author supplied.** `resolveEmbed` builds every `src` from a
 * template on an allowlisted host, and `safeHttpUrl` guards every `href`; see
 * `domain/embeds.ts` for the whole argument. This file must never grow a branch
 * that puts a stored value into either attribute directly.
 *
 * **A section may carry its own look, entirely separate from its layout.**
 * `sectionStyle` turns the author's `style` bag into the wrapper's own inline
 * properties — a skin's full property set from `nestedSkinVars`, a background
 * picture guarded by `safeHttpUrl`, or nothing at all when the author left it
 * unset, which is the case that must keep emitting no `style` attribute.
 *
 * Each section heading carries the `public-section` test id, so the end-to-end
 * suite can assert that what somebody wrote in the editor reached a stranger's
 * browser — without depending on the author's own words, which are data, or on
 * a translation, which the e2e rules forbid asserting.
 *
 * Sections are spaced further apart than the items inside them, and a section
 * heading outweighs an item title. Without that the page is one flat list of
 * everything somebody wrote, which is how it read before.
 *
 * Sorts with `toSorted`, which cannot mutate the sections a caller handed in even by accident.
 *
 * **`parentHost` is the only configuration this component is handed**, and it
 * exists for exactly one provider: Twitch's player refuses to load without a
 * `parent=` naming the embedding domain. It is resolved by the route from
 * `env.hubHost`, not read here — see the prop. An empty value degrades Twitch
 * to a plain link rather than breaking the page; see `domain/embeds.ts`.
 *
 * **Each section's `sectionKey` is computed once here and handed to its
 * `Layout`, reusing the same value as the `<section>` wrapper's own React
 * `key`.** Only `Tabs` reads it, to name its radio group so two `tabs`
 * sections on one page cannot fight over each other's selection — see
 * `LAYOUTS`'s own doc for why every layout is handed it regardless.
 * **Prefixed with the section's own array index**, which `sort_order`/
 * `name_en` alone do not guarantee is unique — two sections sharing both
 * would otherwise collide, as a React key and, worse, as two `tabs`
 * sections' shared radio-group `name`.
 *
 * **`sectionId` is a SEPARATE value, computed alongside `sectionKey` and
 * carrying none of `name_en`.** `sectionKey` is safe as a `name` attribute,
 * which tolerates any text an author typed, but not as the seed of an HTML
 * `id` — `id`s must not contain whitespace, and `Tabs`' own `aria-controls`
 * takes a space-separated ID-reference list, so a single id built from a
 * multi-word section name silently tokenises into pieces that resolve to
 * nothing. `sectionId` is built only from the section's own array index and
 * `sort_order`, both plain numbers, for exactly the callers — `Tabs`, today
 * — that need an identifier rather than a display value.
 *
 * @returns the sections, in the order the author put them.
 */
export function PublicSections({
  sections,
  locale,
  parentHost,
}: PublicSectionsProps) {
  if (sections.length === 0) return null;

  const ordered = sections.toSorted((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="grid gap-10">
      {ordered.map((section, index) => {
        const items = section.items.toSorted(
          (a, b) => a.sort_order - b.sort_order,
        );
        const Layout = LAYOUTS[section.type];
        // Prefixed with the section's own position in THIS render, which is
        // always unique, unlike `sort_order`/`name_en` alone — two sections
        // sharing both would otherwise collide, both as a React key and
        // (worse) as `Tabs`' own radio-group `name`, letting two `tabs`
        // sections fight over one selection. See this component's own doc.
        const sectionKey = `${index}-${keyOf(section.sort_order, section.name_en)}`;
        // Whitespace-free, unlike `sectionKey` above — carries no `name_en`,
        // so it is safe to build an HTML `id` from. See this component's own
        // doc and `Tabs`'s.
        const sectionId = `${index}-${section.sort_order}`;
        return (
          <section
            key={sectionKey}
            className="grid gap-3"
            style={sectionStyle(section.style)}
          >
            <h2
              className="font-display text-2xl font-bold tracking-tight"
              {...tid("public-section")}
            >
              {contentFor(section, "name", locale)}
            </h2>
            <Layout
              items={items}
              locale={locale}
              parentHost={parentHost}
              sectionKey={sectionKey}
              sectionId={sectionId}
            />
          </section>
        );
      })}
    </div>
  );
}
