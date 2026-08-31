"use client";

import { Paintbrush } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactElement } from "react";
import { tid } from "@/shared/infrastructure/test-id";
import { SKINS, type SkinId } from "@/shared/domain/skins";
import {
  CORNERS,
  type BlockStyle,
} from "@/features/actors/domain/block-schema";
import type { StyleGates } from "@/features/actors/presentation/block-contract";

/**
 * One block's own look — `blockStyleShape`'s bag (see
 * `domain/block-schema.ts`), which every block may carry whether it is a
 * section or a container three levels down.
 *
 * Every key is optional: **absence means "inherit whatever encloses this"**,
 * which is the whole contract this popup exists to respect rather than quietly
 * replace with an empty string.
 */
export type SectionStyle = BlockStyle;

/**
 * Translated strings {@link SectionStylePopup} renders.
 *
 * `skins` is the SAME record the page-level theme configurator resolves, built
 * by mapping `SKINS` over the same `skins.*` catalogue keys — reused rather
 * than given its own names, because a style is a style whether it is chosen
 * for the whole page or for one section of it.
 *
 * `inheritSkin` names the option that clears `style.skin`, distinct from
 * `skins.default`: choosing `default` explicitly opts a section OUT of
 * whatever the page is wearing, into the design's own vanilla skin, while
 * `inheritSkin` leaves the key unset so the section keeps following the page,
 * whatever it is set to later. Collapsing the two into one option would make
 * the second choice unreachable from this popup.
 *
 * `fitDefault` names the option that clears `style.background_fit`, which is
 * not "inherit" in the same sense — a page has no background picture of its
 * own for a section to inherit. It is the browser's own unscaled, unrepeated
 * placement, offered as a third option beside `fitCover` and `fitTile`.
 *
 * **That sentence used to be false and is worth the note.** `blockStyle`
 * emitted `background-repeat` only for `tile`, and the property's INITIAL
 * value is `repeat` — so "Default" and "Tile" painted the same tiled picture
 * and this doc promised a placement no option produced. `blockStyle` now
 * emits both `background-repeat` and `background-size` for every fit, which
 * is what makes the three options three paints.
 *
 * **There is no card-size string here any more, and the control went with
 * it.** `style.card_size` named the minimum width a card in an `auto-fill`
 * grid could shrink to, leaving the browser to decide how many fit — and a
 * container declares an explicit space count now, so nothing on any page reads
 * the token. A control that accepts a choice, stores it and changes nothing is
 * the worst kind, so the field is gone while the KEY stays in the schema: a
 * value the flat editor stored survives untouched, ready for the
 * `column-width` reader `masonry` is the intended home for.
 *
 * `borderInherit` names the option that clears `style.border`, and here the
 * "not inherit" caveat that applies to `fitDefault`
 * does NOT apply: a border genuinely has a page (or enclosing section) to
 * inherit from, the same way `inheritSkin` does. `borderNone` is a separate,
 * explicit choice — "no edge here regardless of what surrounds it" — and
 * collapsing it into `borderInherit` would make that choice unreachable, the
 * same trap `inheritSkin`'s own doc names for `skins.default`.
 *
 * `bleed` names the full-width checkbox, which appears on a section only.
 * `margins` names the chrome checkbox beside it: default checked, storing
 * nothing, with `false` the only persisted opt-out.
 *
 * **The panel takes `--menu`, the one token declared opaque in both modes**,
 * and this was found by READING a screenshot rather than by any check. It took
 * `--surface`, which carries `/.9` in the editor's chrome scope — measured, not
 * inferred — so the page behind it showed through a control floating over
 * whatever colour its author chose, which is the exact thing the workbench's
 * opacity rule exists to forbid. Every select INSIDE it already used `--menu`;
 * the group around them did not.
 *
 * It offers `chrome`, `heading`, `heading_pad`, `text_align`, `image_fit` and
 * `radius` beside the border, each with an empty option that CLEARS the key
 * rather than naming a value. `heading_pad` sits under the name-style select
 * and behind the same condition: both are offered on a NAMED block only.
 *
 * **It offers `label` and `portrait` now, and only where the block being
 * edited honours them (2026-08-30).** This popup opens for a `ContainerBlock`
 * (from `block-card.tsx`) and for a `LeafBlock` (from `leaf-editor.tsx`)
 * both, and a container's `kind` is always the literal `"container"` — never
 * one of the five leaf kinds `showsLabel` composes with, and never `avatar`
 * — so those two controls are gated on {@link SectionStylePopupProps.gates},
 * computed once by `styleGatesFor` (`presentation/block-contract.ts`) from
 * the actual block rather than from a prop that was `false` for every caller
 * there ever was. An "Own title" control briefly lived here behind exactly
 * that dead gate, and was removed as dead on 2026-08-30 rather than reworked
 * — reaching a leaf was `leaf-editor.tsx`'s job, and it does that now instead
 * of this popup growing a second, leaf-shaped copy of itself.
 *
 * `label` and `portrait` are also reachable through the page source dock,
 * which pastes a document validated by the same block schema — see
 * `domain/block-schema.ts`'s TSDoc on each key. That is a second path in,
 * not the only one.
 *
 * The name-style select carries a fourth option, `soft` — the same strip in a
 * quieter tone. It needs no label of its own beyond a name: the tone is
 * derived from the accent already chosen, so there is nothing further to pick.
 *
 * Four more sit under it: a picture for the bar, how that picture lies, the
 * room under the name, and one name per corner for the bar's corner picker. The first two are offered only where a bar is
 * drawn; the gap is offered for a plain name as well, because there is space
 * above the content either way.
 */
export interface SectionStylePopupLabels {
  /** Names the button that opens the popup, which carries no visible text. */
  open: string;
  /** Heading inside the open popup. */
  title: string;
  /** Field label for the skin select. */
  skin: string;
  /** One label per skin, shared with the page-level theme configurator. */
  skins: Record<SkinId, string>;
  /** The skin select's option that clears `style.skin`. */
  inheritSkin: string;
  /** Field label for the background picture's address. */
  backgroundUrl: string;
  /** Says a picture is a pasted address and nothing is stored. */
  backgroundUrlHint: string;
  /** Field label for the fit select. */
  fit: string;
  /** The fit select's option that clears `style.background_fit`. */
  fitDefault: string;
  /** The fit select's option for `"cover"`. */
  fitCover: string;
  /** The fit select's option for `"tile"`. */
  fitTile: string;
  /**
   * Label for the full-width checkbox, shown on a section only.
   *
   * A section may reach both edges of the window; a nested block cannot, so
   * the control is not offered there at all.
   */
  bleed: string;
  /** Toggles the page chrome around a top-level section. */
  margins: string;
  /** Field label for the card select. */
  chrome: string;
  /** The card select's option that clears `style.chrome`. */
  chromeInherit: string;
  /** The card select's option for a block that keeps its card. */
  chromeCard: string;
  /** The card select's option for a block drawn straight on the page. */
  chromeBare: string;
  /** Says what taking the card away removes. */
  chromeHint: string;
  /** Field label for the name-style select, offered for a named block only. */
  heading: string;
  /** The name-style option that clears `style.heading`. */
  headingPlain: string;
  /** The name-style option that welds the name to its content as a bar. */
  headingBar: string;
  /** The same bar with a vertical sheen. */
  headingGradient: string;
  headingSoft: string;
  headingGap: string;
  headingGapDefault: string;
  headingGapNone: string;
  headingGapSnug: string;
  headingGapRoomy: string;
  headingImage: string;
  headingImageHint: string;
  headingFit: string;
  headingFitCover: string;
  headingFitTile: string;
  corners: string;
  headingCorners: string;
  corner: Record<(typeof CORNERS)[number], string>;
  /** Field label for how much room a bar gives its name. */
  headingPad: string;
  /** The room option that keeps the ordinary strip. */
  headingPadDefault: string;
  /** A tighter strip. */
  headingPadSnug: string;
  /** A strip with room to breathe. */
  headingPadRoomy: string;
  /**
   * Field label for the "own title" select — offered only for a leaf whose
   * kind honours `style.label`. See `honoursLabel` in
   * `presentation/block-contract.ts`.
   */
  label: string;
  /** The label select's option that clears `style.label`. */
  labelDefault: string;
  /** The label select's option for `"show"`. */
  labelShow: string;
  /** The label select's option for `"hidden"`. */
  labelHidden: string;
  /**
   * Says what hiding a leaf's own title does and does not undo — it never
   * brings back a title an enclosing `tabs` or `accordion` panel already
   * suppressed. See `showsLabel` in `presentation/block-contract.ts`.
   */
  labelHint: string;
  /** Field label for the text-alignment select. */
  textAlign: string;
  /** The alignment option that clears `style.text_align`. */
  textAlignInherit: string;
  /** Text set against the reading edge. */
  textAlignStart: string;
  /** Text centred. */
  textAlignCenter: string;
  /** Text set against the far edge. */
  textAlignEnd: string;
  /** Field label for the picture-fit select. */
  imageFit: string;
  /** The fit option that clears `style.image_fit`. */
  imageFitInherit: string;
  /** A picture cropped to fill its box. */
  imageFitCover: string;
  /** A picture shown whole, letterboxed in its box. */
  imageFitContain: string;
  /**
   * Field label for the portrait-size select — offered only for an `avatar`
   * leaf. See `honoursPortrait` in `presentation/block-contract.ts`.
   */
  portrait: string;
  /** The portrait select's option that clears `style.portrait` — the same
   * size as `"m"`, which is the whole point of offering it. */
  portraitDefault: string;
  /** The portrait select's option for `"s"`. */
  portraitSmall: string;
  /** The portrait select's option for `"m"`. */
  portraitMedium: string;
  /** The portrait select's option for `"l"`. */
  portraitLarge: string;
  /** Field label for the corner select. */
  radius: string;
  /** The corner option that keeps whatever the skin chose. */
  radiusInherit: string;
  /** Corners with no rounding at all. */
  radiusSquare: string;
  /** Ordinary rounding. */
  radiusSoft: string;
  /** Heavily rounded corners. */
  radiusRound: string;
  /** Field label for the border select. */
  border: string;
  /**
   * What the border field sets, beneath the select: this block's own cards
   * and panels, not the popup's own frame. Said once here rather than on every
   * option, which would otherwise each have to restate it.
   */
  borderHint: string;
  /** The border select's option that clears `style.border`. */
  borderInherit: string;
  /**
   * The border select's option for `"none"` — an explicit "no edge here",
   * distinct from {@link borderInherit}. See this interface's own doc for
   * why the two cannot collapse into one option.
   */
  borderNone: string;
  /** The border select's option for `"solid"`. */
  borderSolid: string;
  /** The border select's option for `"dashed"`. */
  borderDashed: string;
  /** The border select's option for `"dotted"`. */
  borderDotted: string;
  /** The border select's option for `"double"`. */
  borderDouble: string;
}

/**
 * What {@link SectionStylePopup} needs.
 *
 * **Controlled by value rather than bound to a form path**, which is what lets
 * one popup serve every block in a recursive tree: the editor holds the whole
 * page in a single field and addresses a block by its position, so there is no
 * per-block form path for a `useController` to name.
 *
 * **`gates` replaced two ad-hoc booleans, `named` and `atTop`, on 2026-08-30.**
 * This component sees a style bag and never knows what kind of block it
 * belongs to or where it sits, so something has to tell it — and once a leaf
 * could open this popup too, that "something" grew a third dimension
 * (`label`, `imageFit`, `portrait`) that has nothing to do with `named` or
 * `atTop` and everything to do with the leaf's own `kind`. Rather than adding
 * a third boolean the caller computes by hand, `styleGatesFor`
 * (`presentation/block-contract.ts`) computes it from the block itself, in
 * the one place that already held this knowledge for `label` — `showsLabel`.
 *
 * **`card` and `corners` joined the same object a review-round later, for
 * the reason the other three did.** `gates` was believed to cover every
 * leaf-only dimension once `label`/`imageFit`/`portrait` existed, and
 * `skin`/`border`/`chrome`/`radius`/the `corners` style key went on being
 * offered ungated — arrangement-agnostic for a CONTAINER, which is true, and
 * assumed kind-agnostic for a LEAF without checking, which was not. See this
 * file's own top-of-file TSDoc for the renderers that found it.
 *
 * It offers `skin`, `chrome`, `heading`, `text_align`, `image_fit`, `radius`
 * and `border` beside the corner picker, each with an empty option that
 * CLEARS the key rather than naming a value — `skin`, `chrome` and `border`
 * behind `gates.card`, `radius` and the corner picker behind the narrower
 * `gates.corners`, see this interface's own TSDoc for why the two differ.
 *
 * **`triggerTestId` joined the props on 2026-08-30, alongside `gates`.**
 * `BlockCard` and `leaf-editor.tsx` both mount this component now, and the
 * trigger button used to carry one hard-coded id regardless — which a
 * page-wide `.last()` in two e2e suites had silently started reaching a
 * LEAF's copy of instead of a section's, once a leaf could have one. See
 * this prop's own entry for why a distinct id per caller, not more careful
 * scoping, is the fix.
 */
export interface SectionStylePopupProps {
  /** The block's own style bag, absent when it has none. */
  value: SectionStyle | undefined;
  /**
   * Called with the whole bag, or `undefined` once nothing is left in it.
   *
   * The WHOLE bag rather than one key, because clearing a field has to REMOVE
   * that key — an empty string sitting in `style` would be a third state
   * between "inherit" and "chosen", which the schema does not recognise.
   */
  onChange: (style: SectionStyle | undefined) => void;
  /** Already-translated strings. */
  labels: SectionStylePopupLabels;
  /**
   * Which of this block's own controls apply — see {@link StyleGates} for
   * what each one gates and `styleGatesFor` for how it is computed.
   */
  gates: StyleGates;
  /**
   * The trigger button's own test id — `section-style-open` unless a caller
   * says otherwise.
   *
   * **Distinct ids for a container's popup and a leaf's, on purpose
   * (2026-08-30).** Both used to share this one name, and `SectionStylePopup`
   * opening for a `LeafBlock` as well as a `ContainerBlock` turned that into a
   * real ambiguity: a leaf's trigger renders inside its section's places,
   * after the section's own header in DOM order, so a page-wide `.last()`
   * that meant "the newest SECTION's own popup" silently started reaching the
   * newest LEAF's instead the moment one existed. Two existing e2e suites
   * were fixed by scoping to `section-header`, which still works — but a
   * caller has to remember to do that, and one already forgot once. A
   * distinct id removes the chance to forget: `block-card.tsx` never passes
   * this prop, so its trigger stays `section-style-open`; `leaf-editor.tsx`
   * passes `"leaf-style-open"`, so the two ids can never collide and a query
   * for either can never resolve to the other.
   *
   * **Only the TRIGGER is split — the panel and every field inside it
   * (`section-style-skin`, `section-style-border`, and the rest) are still
   * `section-style-*` whichever kind of block opened them, and that is the
   * same trap one layer in.** Two popups CAN be open at once — nothing in
   * this component closes one when another opens — so a page with a
   * section's popup and a leaf's popup both open has two elements answering
   * `page.getByTestId("section-style-skin")`, ambiguous by construction in
   * exactly the way the trigger used to be. Nothing exercises this today: no
   * suite opens two popups at once. Noted here rather than split, because
   * splitting every field id is a second migration this finding does not
   * yet pay for — do that if a test ever needs two popups open together, not
   * before.
   */
  triggerTestId?: string;
}

/** What {@link CornerPicker} needs to draw one set of corners. */
interface CornerPickerProps {
  /** The test-id stem; each corner's own box carries it plus the corner. */
  id: string;
  /** What this set of corners is called. */
  label: string;
  /** The stored list, or undefined meaning every corner. */
  value: string | undefined;
  /** The translated strings, for each corner's own name. */
  labels: SectionStylePopupLabels;
  /** Given the new list, or `""` to clear the key entirely. */
  onChange: (next: string) => void;
}

/**
 * A corner's own position in the 2x2 grid, so the control is SHAPED like what
 * it sets.
 *
 * A list of four checkboxes reading "top left, top right…" makes somebody hold
 * the square in their head; laid out as the square, the control is the
 * picture. `order` is the reading order a keyboard walks — the same order CSS
 * names them — and the grid places each one where it actually is.
 */
/** Which corner each little square rounds, so it looks like what it sets. */
const CORNER_ROUND = {
  tl: "rounded-tl-md",
  tr: "rounded-tr-md",
  br: "rounded-br-md",
  bl: "rounded-bl-md",
} as const satisfies Record<(typeof CORNERS)[number], string>;

const CORNER_CELL = {
  tl: "col-start-1 row-start-1",
  tr: "col-start-2 row-start-1",
  br: "col-start-2 row-start-2",
  bl: "col-start-1 row-start-2",
} as const satisfies Record<(typeof CORNERS)[number], string>;

/**
 * The corner picker: four boxes arranged as a square, each rounding its own
 * corner.
 *
 * **Absent means every corner**, so the control shows all four ticked when
 * nothing is stored and writes nothing back until somebody unticks one. The
 * last tick cannot be removed — an empty list is not a value this key has, and
 * `radius: "square"` is how a page says "no corners at all", so the control
 * refuses the state rather than storing a spelling the schema would reject.
 *
 * @param props - see {@link CornerPickerProps}.
 * @returns the picker.
 */
function CornerPicker(props: CornerPickerProps): ReactElement {
  // Taken whole and unpacked here rather than in the signature: `jsdoc` wants
  // a `@param` per destructured field and `tsdoc` refuses the `props.id`
  // spelling that would name one, so the two rules only agree on a single
  // parameter. Rule 6 — the owner is named rather than either disabled.
  const { id, label, value, labels, onChange } = props;
  const rounded = new Set(value ? value.split(",") : CORNERS);
  return (
    <div className="grid gap-1.5">
      <span className="text-xs font-medium">{label}</span>
      <div
        className="grid w-fit grid-cols-2 gap-1 rounded-lg surface border-(--edge)/60 bg-(--surface) p-1.5"
        role="group"
        aria-label={label}
      >
        {CORNERS.map((corner) => {
          const on = rounded.has(corner);
          return (
            <label
              key={corner}
              className={`${CORNER_CELL[corner]} flex size-7 cursor-pointer items-center justify-center`}
              title={labels.corner[corner]}
            >
              <input
                type="checkbox"
                checked={on}
                // The last tick stays: an empty list is not a value.
                disabled={on && rounded.size === 1}
                onChange={() => {
                  // **The handler refuses it too, not only the attribute.** A
                  // real browser ignores a click on a disabled input, so this
                  // looks redundant — but the rule is an invariant about the
                  // value rather than a property of one control, and jsdom
                  // dispatches a programmatic click to a disabled box quite
                  // happily. Without this the guard would hold only where the
                  // browser enforces it.
                  if (on && rounded.size === 1) return;
                  const next = new Set(rounded);
                  if (on) next.delete(corner);
                  else next.add(corner);
                  const kept = CORNERS.filter((each) => next.has(each));
                  onChange(
                    kept.length === CORNERS.length ? "" : kept.join(","),
                  );
                }}
                {...tid(`${id}-${corner}`)}
                className="peer sr-only"
              />
              {/* The little square: it rounds the corner it stands for, so
                  the control shows the shape rather than describing it. */}
              <span
                aria-hidden
                className={`size-5 border-2 border-(--edge) peer-checked:border-(--accent) peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-(--accent) ${
                  on ? CORNER_ROUND[corner] : ""
                }`}
              />
            </label>
          );
        })}
      </div>
    </div>
  );
}

/** What every field gated on `gates.card` or `gates.corners` shares. */
interface GatedFieldProps {
  /** The popup's own id stem, so each field's own id stays unique. */
  id: string;
  /** Already-translated strings. */
  labels: SectionStylePopupLabels;
}

/** What {@link SkinField} needs, beyond {@link GatedFieldProps}. */
interface SkinFieldProps extends GatedFieldProps {
  /** The stored skin, or absent to inherit. */
  value: string | undefined;
  /** Called with the new value, or `""` to clear it. */
  onChange: (value: string) => void;
}

/**
 * The skin select — offered only where `gates.card` is true, since a skin
 * sets tokens `surface` consumes and a leaf with no `surface`-bearing box of
 * its own has nowhere for any of that to land. Pulled out of
 * {@link SectionStylePopup}'s own body so a fourth gated field did not push
 * that function's cognitive complexity past this repo's limit.
 *
 * @param props - see {@link SkinFieldProps}.
 * @returns the field.
 */
function SkinField(props: SkinFieldProps): ReactElement {
  // Taken whole and unpacked here rather than in the signature, matching
  // `CornerPicker`'s own comment on why: `jsdoc` wants a `@param` per
  // destructured field and `tsdoc` refuses the `props.id` spelling that
  // would name one, so the two rules only agree on a single parameter.
  const { id, value, labels, onChange } = props;
  return (
    <div className="grid gap-1.5">
      <label htmlFor={`${id}-skin`} className="text-xs font-medium">
        {labels.skin}
      </label>
      <select
        id={`${id}-skin`}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        {...tid("section-style-skin")}
        className="rounded-lg surface border-(--edge)/60 bg-(--menu) px-3 py-1.5 text-sm"
      >
        <option value="">{labels.inheritSkin}</option>
        {SKINS.map((skin) => (
          <option key={skin} value={skin}>
            {labels.skins[skin]}
          </option>
        ))}
      </select>
    </div>
  );
}

/** What {@link ChromeField} needs, beyond {@link GatedFieldProps}. */
interface ChromeFieldProps extends GatedFieldProps {
  /** The stored choice, or absent to inherit. */
  value: SectionStyle["chrome"] | undefined;
  /** Called with the new value, or `""` to clear it. */
  onChange: (value: SectionStyle["chrome"] | "") => void;
}

/**
 * The card/bare select — offered only where `gates.card` is true, the same
 * reason {@link SkinField} is: `bare` zeroes tokens `surface` reads, which
 * does nothing where a kind draws no `surface`-bearing box at all.
 *
 * @param props - see {@link ChromeFieldProps}.
 * @returns the field.
 */
function ChromeField(props: ChromeFieldProps): ReactElement {
  const { id, value, labels, onChange } = props;
  return (
    <div className="grid gap-1.5">
      <label htmlFor={`${id}-chrome`} className="text-xs font-medium">
        {labels.chrome}
      </label>
      <select
        id={`${id}-chrome`}
        value={value ?? ""}
        onChange={(event) =>
          onChange(event.target.value as SectionStyle["chrome"] | "")
        }
        aria-describedby={`${id}-chrome-hint`}
        {...tid("section-style-chrome")}
        className="rounded-lg surface border-(--edge)/60 bg-(--menu) px-3 py-1.5 text-sm"
      >
        <option value="">{labels.chromeInherit}</option>
        <option value="card">{labels.chromeCard}</option>
        <option value="bare">{labels.chromeBare}</option>
      </select>
      <p id={`${id}-chrome-hint`} className="text-xs text-(--muted)">
        {labels.chromeHint}
      </p>
    </div>
  );
}

/** What {@link BorderField} needs, beyond {@link GatedFieldProps}. */
interface BorderFieldProps extends GatedFieldProps {
  /** The stored choice, or absent to inherit. */
  value: SectionStyle["border"] | undefined;
  /** Called with the new value, or `""` to clear it. */
  onChange: (value: SectionStyle["border"] | "") => void;
}

/**
 * The border select — offered only where `gates.card` is true, alongside
 * {@link SkinField} and {@link ChromeField}: the same `surface` utility
 * reads `--skin-border-style`/`--skin-border`.
 *
 * @param props - see {@link BorderFieldProps}.
 * @returns the field.
 */
function BorderField(props: BorderFieldProps): ReactElement {
  const { id, value, labels, onChange } = props;
  return (
    <div className="grid gap-1.5">
      <label htmlFor={`${id}-border`} className="text-xs font-medium">
        {labels.border}
      </label>
      <select
        id={`${id}-border`}
        value={value ?? ""}
        onChange={(event) =>
          onChange(event.target.value as SectionStyle["border"] | "")
        }
        aria-describedby={`${id}-border-hint`}
        {...tid("section-style-border")}
        className="rounded-lg surface border-(--edge)/60 bg-(--menu) px-3 py-1.5 text-sm"
      >
        <option value="">{labels.borderInherit}</option>
        <option value="solid">{labels.borderSolid}</option>
        <option value="dashed">{labels.borderDashed}</option>
        <option value="dotted">{labels.borderDotted}</option>
        <option value="double">{labels.borderDouble}</option>
        <option value="none">{labels.borderNone}</option>
      </select>
      <p id={`${id}-border-hint`} className="text-xs text-(--muted)">
        {labels.borderHint}
      </p>
    </div>
  );
}

/** What {@link RadiusAndCorners} needs, beyond {@link GatedFieldProps}. */
interface RadiusAndCornersProps extends GatedFieldProps {
  /** The stored roundness, or absent to inherit the skin's own. */
  radiusValue: SectionStyle["radius"] | undefined;
  /** Called with the new roundness, or `""` to clear it. */
  onRadiusChange: (value: SectionStyle["radius"] | "") => void;
  /** The stored corner list, or absent meaning every corner. */
  cornersValue: string | undefined;
  /** Called with the new list, or `""` to clear it. */
  onCornersChange: (value: string) => void;
}

/**
 * `radius` and the block's own {@link CornerPicker}, together — offered only
 * where `gates.corners` is true. Both read `--skin-round`/`--corner-*`
 * through `CORNER_CLASS` alone, which is narrower than `gates.card`: `link`,
 * `social`, `embed` and `avatar` all have a `surface`-bearing box (so
 * `SkinField`/`ChromeField`/`BorderField` still apply to them) but draw a
 * fixed `rounded-xl`/`rounded-full` that never asks `--skin-round` anything.
 *
 * @param props - see {@link RadiusAndCornersProps}.
 * @returns both fields.
 */
function RadiusAndCorners(props: RadiusAndCornersProps): ReactElement {
  const {
    id,
    labels,
    radiusValue,
    onRadiusChange,
    cornersValue,
    onCornersChange,
  } = props;
  return (
    <>
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-radius`} className="text-xs font-medium">
          {labels.radius}
        </label>
        <select
          id={`${id}-radius`}
          value={radiusValue ?? ""}
          onChange={(event) =>
            onRadiusChange(event.target.value as SectionStyle["radius"] | "")
          }
          {...tid("section-style-radius")}
          className="rounded-lg surface border-(--edge)/60 bg-(--menu) px-3 py-1.5 text-sm"
        >
          <option value="">{labels.radiusInherit}</option>
          <option value="square">{labels.radiusSquare}</option>
          <option value="soft">{labels.radiusSoft}</option>
          <option value="round">{labels.radiusRound}</option>
        </select>
      </div>

      {/* Beside `radius` on purpose: that one says how much and this says
          where, and reading them together is how somebody works out that
          they compose. */}
      <CornerPicker
        id="section-style-corner"
        label={labels.corners}
        value={cornersValue}
        labels={labels}
        onChange={onCornersChange}
      />
    </>
  );
}

/** What {@link ImageFitField} needs, beyond {@link GatedFieldProps}. */
interface ImageFitFieldProps extends GatedFieldProps {
  /** The stored fit, or absent to inherit. */
  value: SectionStyle["image_fit"] | undefined;
  /** Called with the new value, or `""` to clear it. */
  onChange: (value: SectionStyle["image_fit"] | "") => void;
}

/**
 * The picture-fit select — offered on a container unconditionally (the
 * token inherits to whatever draws a picture beneath it) and gated by kind
 * on a leaf, through `gates.imageFit` (`honoursImageFit`,
 * `presentation/block-contract.ts`). Pulled out of {@link SectionStylePopup}
 * alongside the other gated fields, for the same cognitive-complexity
 * reason.
 *
 * @param props - see {@link ImageFitFieldProps}.
 * @returns the field.
 */
function ImageFitField(props: ImageFitFieldProps): ReactElement {
  const { id, value, labels, onChange } = props;
  return (
    <div className="grid gap-1.5">
      <label htmlFor={`${id}-image-fit`} className="text-xs font-medium">
        {labels.imageFit}
      </label>
      <select
        id={`${id}-image-fit`}
        value={value ?? ""}
        onChange={(event) =>
          onChange(event.target.value as SectionStyle["image_fit"] | "")
        }
        {...tid("section-style-image-fit")}
        className="rounded-lg surface border-(--edge)/60 bg-(--menu) px-3 py-1.5 text-sm"
      >
        <option value="">{labels.imageFitInherit}</option>
        <option value="cover">{labels.imageFitCover}</option>
        <option value="contain">{labels.imageFitContain}</option>
      </select>
    </div>
  );
}

/** What {@link PortraitField} needs, beyond {@link GatedFieldProps}. */
interface PortraitFieldProps extends GatedFieldProps {
  /** The stored size, or absent meaning the same as `"m"`. */
  value: SectionStyle["portrait"] | undefined;
  /** Called with the new value, or `""` to clear it. */
  onChange: (value: SectionStyle["portrait"] | "") => void;
}

/**
 * The portrait-size select — offered only where `gates.portrait` is true,
 * `avatar` alone (`honoursPortrait`, `presentation/block-contract.ts`): the
 * key is read directly off the leaf's own style bag rather than emitted as
 * an inheriting token, so a container never carries this control.
 *
 * @param props - see {@link PortraitFieldProps}.
 * @returns the field.
 */
function PortraitField(props: PortraitFieldProps): ReactElement {
  const { id, value, labels, onChange } = props;
  return (
    <div className="grid gap-1.5">
      <label htmlFor={`${id}-portrait`} className="text-xs font-medium">
        {labels.portrait}
      </label>
      <select
        id={`${id}-portrait`}
        value={value ?? ""}
        onChange={(event) =>
          onChange(event.target.value as SectionStyle["portrait"] | "")
        }
        {...tid("section-style-portrait")}
        className="rounded-lg surface border-(--edge)/60 bg-(--menu) px-3 py-1.5 text-sm"
      >
        <option value="">{labels.portraitDefault}</option>
        <option value="s">{labels.portraitSmall}</option>
        <option value="m">{labels.portraitMedium}</option>
        <option value="l">{labels.portraitLarge}</option>
      </select>
    </div>
  );
}

/** What {@link StylePopupFields} needs. */
interface StylePopupFieldsProps {
  /** The popup's own id stem. */
  id: string;
  /** Already-translated strings. */
  labels: SectionStylePopupLabels;
  /** Which of this block's own controls apply. */
  gates: StyleGates;
  /** The block's own style bag, defaulted to `{}` by the caller. */
  style: SectionStyle;
  /**
   * Writes one key of the style bag, or removes it — see
   * {@link SectionStylePopup}'s own `setField` for the contract.
   */
  setField: <K extends keyof SectionStyle>(
    key: K,
    value: SectionStyle[K] | "",
  ) => void;
}

/**
 * Every field the panel offers, gated or not — pulled out of
 * {@link SectionStylePopup}'s own body so that function is left holding only
 * the popup MECHANICS (open state, focus, Escape, outside-click). Splitting
 * "which fields to show" from "how the popup behaves" is what brought
 * `SectionStylePopup`'s own cognitive complexity back under this repo's
 * limit once `card` and `corners` joined the four gates already there —
 * extracting each field's own JSX (`SkinField` and the rest) trims line
 * count but not branch count, since the ternary choosing whether to render
 * one stays in whichever function holds it either way.
 *
 * @param props - see {@link StylePopupFieldsProps}.
 * @returns every field in the panel, in the order an author sees them.
 */
function StylePopupFields(props: StylePopupFieldsProps): ReactElement {
  const { id, labels, gates, style, setField } = props;
  return (
    <>
      {/* **Offered only where the block's own box reads `surface` —
              see `honoursCard` in `presentation/block-contract.ts`.** A skin
              sets tokens `surface` consumes (border style/width, gloss,
              shadow, backdrop, clip); a leaf with no `surface`-bearing box of
              its own (`handle`, `name`, `player`, `jukebox`, `fursonas`) has
              nowhere for any of that to land. */}
      {gates.card ? (
        <SkinField
          id={id}
          value={style.skin}
          labels={labels}
          onChange={(value) => setField("skin", value)}
        />
      ) : null}

      <div className="grid gap-1.5">
        <label htmlFor={`${id}-background`} className="text-xs font-medium">
          {labels.backgroundUrl}
        </label>
        <input
          id={`${id}-background`}
          type="url"
          inputMode="url"
          value={style.background_url ?? ""}
          onChange={(event) => setField("background_url", event.target.value)}
          aria-describedby={`${id}-background-hint`}
          {...tid("section-style-background-url")}
          className="rounded-lg surface border-(--edge)/60 bg-transparent px-3 py-1.5 text-sm"
        />
        <p id={`${id}-background-hint`} className="text-xs text-(--muted)">
          {labels.backgroundUrlHint}
        </p>
      </div>

      {style.background_url ? (
        <div className="grid gap-1.5">
          <label htmlFor={`${id}-fit`} className="text-xs font-medium">
            {labels.fit}
          </label>
          <select
            id={`${id}-fit`}
            value={style.background_fit ?? ""}
            onChange={(event) =>
              setField(
                "background_fit",
                event.target.value as SectionStyle["background_fit"] | "",
              )
            }
            {...tid("section-style-fit")}
            className="rounded-lg surface border-(--edge)/60 bg-(--menu) px-3 py-1.5 text-sm"
          >
            <option value="">{labels.fitDefault}</option>
            <option value="cover">{labels.fitCover}</option>
            <option value="tile">{labels.fitTile}</option>
          </select>
        </div>
      ) : null}

      {/* **Depth 0 only.** A section reaches both edges of the window; a
              block nested inside one has a section between it and the page and
              cannot escape it. Offering the control where it does nothing is
              the failure this repository keeps catching, so the caller says
              whether this block is a section and the control appears only
              there. */}
      {gates.atTop ? (
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-xs font-medium">
            <input
              type="checkbox"
              checked={style.bleed === true}
              onChange={(event) =>
                // Absent rather than `false`, which is what `setField`'s
                // empty string already means here: the bag's rule everywhere
                // is that a key it does not carry means "inherit the page",
                // and storing `false` would be a second way to say it.
                setField("bleed", event.target.checked ? true : "")
              }
              {...tid("section-style-bleed")}
              className="size-4 rounded-sm surface border-(--edge)/60"
            />
            {labels.bleed}
          </label>
          <label className="flex items-center gap-2 text-xs font-medium">
            <input
              type="checkbox"
              checked={style.margins !== false}
              onChange={(event) =>
                setField("margins", event.target.checked ? "" : false)
              }
              {...tid("section-style-margins")}
              className="size-4 rounded-sm surface border-(--edge)/60"
            />
            {labels.margins}
          </label>
        </div>
      ) : null}

      {/* **Three states, like the border below it.** The empty option
              clears the key, which is inheritance; `card` and `bare` are both
              explicit, because a block inside a bare section has to be able to
              ask for its card back. **Gated on `gates.card` for the same
              reason the skin select above is** — `bare` zeroes tokens
              `surface` reads, which does nothing where a kind draws no
              `surface`-bearing box at all. */}
      {gates.card ? (
        <ChromeField
          id={id}
          value={style.chrome}
          labels={labels}
          onChange={(value) => setField("chrome", value)}
        />
      ) : null}

      {/* **Offered only where there is a name to draw.** A bar with
              nothing in it is the control-that-does-nothing this repo keeps
              trimming, and the renderer already treats it as inert. */}
      {gates.heading ? (
        <div className="grid gap-1.5">
          <label htmlFor={`${id}-heading`} className="text-xs font-medium">
            {labels.heading}
          </label>
          <select
            id={`${id}-heading`}
            value={style.heading ?? ""}
            onChange={(event) =>
              setField(
                "heading",
                event.target.value as SectionStyle["heading"] | "",
              )
            }
            {...tid("section-style-heading")}
            className="rounded-lg surface border-(--edge)/60 bg-(--menu) px-3 py-1.5 text-sm"
          >
            <option value="">{labels.headingPlain}</option>
            <option value="bar">{labels.headingBar}</option>
            <option value="gradient">{labels.headingGradient}</option>
            <option value="soft">{labels.headingSoft}</option>
          </select>

          {/* **Offered beside the name style, and only where a name
                  exists** — the same condition the select above carries. A
                  bar is the only heading that can be crowded: a plain name
                  floats with the page's own spacing around it and has no edge
                  to be pressed against. */}
          <label htmlFor={`${id}-heading-pad`} className="text-xs font-medium">
            {labels.headingPad}
          </label>
          <select
            id={`${id}-heading-pad`}
            value={style.heading_pad ?? ""}
            onChange={(event) =>
              setField(
                "heading_pad",
                event.target.value as SectionStyle["heading_pad"] | "",
              )
            }
            {...tid("section-style-heading-pad")}
            className="rounded-lg surface border-(--edge)/60 bg-(--menu) px-3 py-1.5 text-sm"
          >
            <option value="">{labels.headingPadDefault}</option>
            <option value="snug">{labels.headingPadSnug}</option>
            <option value="roomy">{labels.headingPadRoomy}</option>
          </select>

          {/* **The room UNDER the name, which had no control at all.** A
                  bar welds to its content and a plain name floats above it, so
                  the empty option is not one value — it is whichever of those
                  applies. Offered for a plain name as well as a bar, unlike
                  the padding above: there is real space above the content
                  either way, so pulling a floating name tight against what it
                  names is a thing somebody can want. */}
          <label htmlFor={`${id}-heading-gap`} className="text-xs font-medium">
            {labels.headingGap}
          </label>
          <select
            id={`${id}-heading-gap`}
            value={style.heading_gap ?? ""}
            onChange={(event) =>
              setField(
                "heading_gap",
                event.target.value as SectionStyle["heading_gap"] | "",
              )
            }
            {...tid("section-style-heading-gap")}
            className="rounded-lg surface border-(--edge)/60 bg-(--menu) px-3 py-1.5 text-sm"
          >
            <option value="">{labels.headingGapDefault}</option>
            <option value="none">{labels.headingGapNone}</option>
            <option value="snug">{labels.headingGapSnug}</option>
            <option value="roomy">{labels.headingGapRoomy}</option>
          </select>

          {/* **A picture ON the bar.** Read only where a bar is drawn —
                  there is no strip to paint on otherwise — so it sits inside
                  the same condition rather than beside the section's own
                  background field, which paints behind the CONTENT and is a
                  different picture entirely. */}
          <label
            htmlFor={`${id}-heading-image`}
            className="text-xs font-medium"
          >
            {labels.headingImage}
          </label>
          <input
            id={`${id}-heading-image`}
            type="url"
            inputMode="url"
            value={style.heading_image ?? ""}
            onChange={(event) => setField("heading_image", event.target.value)}
            placeholder="https://"
            {...tid("section-style-heading-image")}
            className="rounded-lg surface border-(--edge)/60 bg-(--surface) px-3 py-1.5 text-sm"
          />
          <p className="text-xs text-(--muted)">{labels.headingImageHint}</p>

          <label htmlFor={`${id}-heading-fit`} className="text-xs font-medium">
            {labels.headingFit}
          </label>
          <select
            id={`${id}-heading-fit`}
            value={style.heading_fit ?? ""}
            onChange={(event) =>
              setField(
                "heading_fit",
                event.target.value as SectionStyle["heading_fit"] | "",
              )
            }
            {...tid("section-style-heading-fit")}
            className="rounded-lg surface border-(--edge)/60 bg-(--menu) px-3 py-1.5 text-sm"
          >
            <option value="">{labels.headingFitCover}</option>
            <option value="tile">{labels.headingFitTile}</option>
          </select>

          <CornerPicker
            id="section-style-heading-corner"
            label={labels.headingCorners}
            value={style.heading_corners}
            labels={labels}
            onChange={(next) => setField("heading_corners", next)}
          />
        </div>
      ) : null}

      {/* **Offered only where the leaf's own kind honours the key** — a
              `text`, `avatar`, `handle`, `name` or `owner` leaf, the exact
              set `showsLabel` composes with. A container never carries this,
              since its `kind` is always the literal `"container"`. */}
      {gates.label ? (
        <div className="grid gap-1.5">
          <label htmlFor={`${id}-label`} className="text-xs font-medium">
            {labels.label}
          </label>
          <select
            id={`${id}-label`}
            value={style.label ?? ""}
            onChange={(event) =>
              setField(
                "label",
                event.target.value as SectionStyle["label"] | "",
              )
            }
            aria-describedby={`${id}-label-hint`}
            {...tid("section-style-label")}
            className="rounded-lg surface border-(--edge)/60 bg-(--menu) px-3 py-1.5 text-sm"
          >
            <option value="">{labels.labelDefault}</option>
            <option value="show">{labels.labelShow}</option>
            <option value="hidden">{labels.labelHidden}</option>
          </select>
          <p id={`${id}-label-hint`} className="text-xs text-(--muted)">
            {labels.labelHint}
          </p>
        </div>
      ) : null}

      <div className="grid gap-1.5">
        <label htmlFor={`${id}-align`} className="text-xs font-medium">
          {labels.textAlign}
        </label>
        <select
          id={`${id}-align`}
          value={style.text_align ?? ""}
          onChange={(event) =>
            setField(
              "text_align",
              event.target.value as SectionStyle["text_align"] | "",
            )
          }
          {...tid("section-style-align")}
          className="rounded-lg surface border-(--edge)/60 bg-(--menu) px-3 py-1.5 text-sm"
        >
          <option value="">{labels.textAlignInherit}</option>
          <option value="start">{labels.textAlignStart}</option>
          <option value="center">{labels.textAlignCenter}</option>
          <option value="end">{labels.textAlignEnd}</option>
        </select>
      </div>

      {/* **Always offered on a container** — the key is a token that
              INHERITS to whatever draws a picture beneath it, whether or not
              the container itself has one. **Gated by kind on a leaf** — see
              `honoursImageFit` in `presentation/block-contract.ts`. */}
      {gates.imageFit ? (
        <ImageFitField
          id={id}
          value={style.image_fit}
          labels={labels}
          onChange={(value) => setField("image_fit", value)}
        />
      ) : null}

      {/* **`avatar` only** — `portrait` is read directly off the LEAF's
              own style bag rather than emitted as an inheriting token, so a
              container never carries this control. See `honoursPortrait` in
              `presentation/block-contract.ts`. */}
      {gates.portrait ? (
        <PortraitField
          id={id}
          value={style.portrait}
          labels={labels}
          onChange={(value) => setField("portrait", value)}
        />
      ) : null}

      {/* **`radius` and the corner picker below it both read
              `--skin-round`/`--corner-*` through `CORNER_CLASS` alone —
              see `honoursCorners` in `presentation/block-contract.ts`.**
              Narrower than `gates.card`: `link`, `social`, `embed` and
              `avatar` all have a `surface`-bearing box (so `skin`/`border`/
              `chrome` above still apply to them) but draw a fixed corner —
              `rounded-xl`/`rounded-full` — that never asks `--skin-round`
              anything, so offering either control there would be exactly the
              do-nothing control this repo keeps trimming. */}
      {gates.corners ? (
        <RadiusAndCorners
          id={id}
          labels={labels}
          radiusValue={style.radius}
          onRadiusChange={(value) => setField("radius", value)}
          cornersValue={style.corners}
          onCornersChange={(value) => setField("corners", value)}
        />
      ) : null}

      {/* **Offered wherever `gates.card` is, alongside `skin` and
              `chrome`** — the same `surface` utility reads
              `--skin-border-style`/`--skin-border`. */}
      {gates.card ? (
        <BorderField
          id={id}
          value={style.border}
          labels={labels}
          onChange={(value) => setField("border", value)}
        />
      ) : null}
    </>
  );
}

/**
 * A paintbrush button and the popup it opens: one section's own skin,
 * background picture, card size and border, apart from its layout.
 *
 * **Only `background_url`, `background_fit` and `text_align` are genuinely
 * kind-agnostic, and a review found the rest were being claimed as such
 * without having been checked against a LEAF's own renderer (2026-08-30).**
 * Those three are written as an inline style on the wrapper `Block` itself
 * renders — a background paints that element directly and `text_align` is an
 * ordinary inheriting CSS property — so they act on every block whatever it
 * contains. `skin`, `border` and `chrome` act through `surface`, which a leaf
 * may or may not draw at all: `handle`, `name`, `player`, `jukebox` and
 * `fursonas` render no `surface`-bearing box, so those three keys change
 * nothing on them and are gated on `gates.card` ({@link StyleGates},
 * `presentation/block-contract.ts`, computed by `honoursCard`). `radius` and
 * the `corners` style key are narrower still — they act through
 * `CORNER_CLASS` alone, which four more kinds (`link`, `social`, `embed`,
 * `avatar`) do not carry even though they DO have a `surface`-bearing box —
 * so those two are gated separately, on `gates.corners` (`honoursCorners`).
 * A container never carries either gate as false: every one of these keys
 * sets a token that cascades to whatever the container's children draw, so
 * offering the control is meaningful regardless of what is nested, the same
 * reasoning `image_fit` already followed. `bleed`/`margins` and the
 * `heading`-family keys are gated too, for unrelated reasons — the first two
 * only a depth-0 container, the heading keys only a named one — and `label`,
 * `image_fit` and `portrait` only particular LEAF kinds. The card-size field
 * was the one key that could not be gated into relevance at all and is gone
 * rather than gated — no page reads `--card-size` at all now, so there was no
 * arrangement left for which the control did anything.
 *
 * **It hands back the whole bag rather than one key**, because clearing a
 * field has to REMOVE that key from the object — see `setField` below. A
 * per-key writer can only ever write a value, including `""`, which is exactly
 * the third state the "absent means inherit" contract forbids.
 *
 * **It is controlled by value, and the block it belongs to is addressed by
 * its caller.** The editor holds the whole page in one field and names a block
 * by its position, so a stale captured index is the fault to avoid — and the
 * caller avoids it by rebuilding the path from where it is rendering on every
 * render, never by capturing one in a handler.
 *
 * **The fit select appears only once there is a picture to fit.** An address
 * of `""` gives `background_fit` nothing to describe, so offering the field
 * anyway would be the "control that accepts input and changes nothing" fault
 * this project keeps catching.
 *
 * Every colour it paints comes from a token — `--edge`, `--menu`, `--muted`,
 * `--surface` — and never from a literal, and its select is painted with
 * `--menu` rather than left transparent, matching every other select in the
 * app — `dropdown-legibility.test.ts` guards all of them.
 *
 * **A real overlay, unlike `IconPicker`'s inline panel** — it sits on top of
 * whatever is beneath it rather than pushing content aside, so it needs the
 * things an inline panel does not: Escape closes it, a click outside it
 * closes it too, opening moves focus INTO the panel rather than leaving it on
 * a trigger now hidden behind an overlay, and closing returns focus to that
 * trigger rather than wherever the browser guesses. `a11y.spec.ts` opens this
 * panel for exactly that reason — a control axe never sees is a control it
 * cannot fail on, which is not the same as one that passes.
 *
 *
 * **The full-width and margins checkboxes are shown on a SECTION only.** Bleed
 * stores absence rather than `false`; margins stores `false` when unchecked
 * and omits the key when checked, because absence already means today's chrome.
 *
 * @returns the button and, while open, the popup.
 *
 * It offers `skin`, `chrome`, `heading`, `text_align`, `image_fit`, `radius`,
 * `label`, `portrait` and `border` beside the corner picker, each with an
 * empty option that CLEARS the key rather than naming a value — every one but
 * `text_align` behind its own gate in `gates`, see this component's own
 * top-of-file TSDoc for why `skin`/`chrome`/`border` and `radius`/corners are
 * two different gates rather than one.
 *
 * **The panel itself takes `--menu`, the one token declared opaque in both
 * modes**, where every select inside it already did. It took `--surface`,
 * which carries `/.9` in the chrome scope, so the page behind it showed
 * through a control floating over a colour its author chose — the exact thing
 * the workbench opacity rule forbids. Guarded in `editor-is-the-page.spec.ts`
 * on the computed alpha, because the class name was never what was wrong.
 *
 * **The picture-fit select's test id is `section-style-image-fit`**, not
 * `section-style-fit`, which the BACKGROUND fit above it already owns. The two
 * collided for one commit and four browser suites went red on it; nothing
 * short of a browser could have seen it.
 *
 * **The trigger's own id is `triggerTestId`, not a literal, since this popup
 * opens for a leaf now as well as a container (2026-08-30).** It used to be
 * one hard-coded string regardless of caller; two e2e suites' page-wide
 * `.last()` calls on it silently started resolving to a leaf's copy instead
 * of a section's the moment a leaf could open one too, and stayed green
 * doing it — a distinct id per caller is what makes that impossible now
 * rather than merely unlikely.
 *
 * **`heading_pad` is offered on a NAMED block only**, behind the same
 * condition as the name-style select it sits under — which is the honest
 * shape, since the renderer reads it only where a bar is drawn and a control
 * that stores what somebody picks and changes nothing is the worst kind.
 *
 * The name-style select gained `soft` beside `bar` and `gradient`; every one
 * of them is offered under the same condition, since all three draw a strip
 * and a block with no name has none. The bar's picture and its fit sit behind
 * that same condition; `heading_gap` sits beside them but applies to a plain
 * name too, so an author can pull a floating name tight against what it names.
 *
 * Two {@link CornerPicker}s choose which corners are rounded — one for the
 * block's own box, beside `radius` because that one says how much and this
 * says where, and one for the bar, behind the same named condition.
 */
export function SectionStylePopup({
  value,
  onChange,
  labels,
  gates,
  triggerTestId = "section-style-open",
}: SectionStylePopupProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const style = value ?? {};

  // Escape and an outside click both close the popup; opening moves focus to
  // the first field, and closing — by either of those, or by the trigger
  // itself — returns it to the trigger. The cleanup below is what returns
  // focus: it runs the moment `open` goes false however that happened,
  // rather than each closer calling a `close` helper of its own.
  //
  // **The first field is found by QUERY now, not by a ref pinned to the skin
  // select (2026-08-30).** `gates.card` can be false for a leaf whose kind
  // draws no `surface` (`handle`, `name`, `player`, `jukebox`, `fursonas`),
  // which removes the skin select entirely — a ref that only ever pointed at
  // that one field would then focus nothing at all on open. `text_align` is
  // offered on every kind, so a query always finds something.
  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>("input, select")?.focus();

    const onPointerDown = (event: MouseEvent): void => {
      const target = event.target as Node;
      if (
        panelRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    // Captured now rather than read from the ref inside the cleanup: by the
    // time this runs the trigger may have re-rendered, and the node this
    // effect actually opened for is the one focus should return to.
    const trigger = triggerRef.current;
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      trigger?.focus();
    };
  }, [open]);

  /**
   * Writes one key of the style bag, or removes it.
   *
   * `""` — an empty select option or a cleared text field — deletes the key
   * rather than storing it, because an empty string sitting in `style` would
   * be a third state between "inherit the page" and "chosen", which is not a
   * state `sectionStyleSchema` recognises. The whole bag collapses to
   * `undefined` once nothing is left in it, so clearing every field returns
   * the section to carrying no `style` at all — the same shape it starts
   * with.
   *
   * @param key - which field of the style bag.
   * @param value - the new value, or `""` to remove the key.
   */
  const setField = <K extends keyof SectionStyle>(
    key: K,
    value: SectionStyle[K] | "",
  ) => {
    const next: SectionStyle = { ...style };
    if (value === "") delete next[key];
    else next[key] = value;
    onChange(Object.keys(next).length > 0 ? next : undefined);
  };

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label={labels.open}
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
        {...tid(triggerTestId)}
        className="rounded-lg p-1.5 text-(--muted)"
      >
        <Paintbrush className="size-4" />
      </button>

      {open ? (
        // The panel is anchored `right-0` to THIS button's own wrapper, not
        // to the card's edge — it sits behind the remove-section button, its
        // gap, and the card's own right padding, roughly 49px of chrome the
        // `right-0` anchor does not account for. `max-w-[calc(100vw-2rem)]`
        // alone budgets only for a flush anchor at the viewport's edge, which
        // this is not: at 320px it overflowed the LEFT edge of the screen by
        // about 33px, invisibly, because overflow in that direction creates
        // no scrollbar for `responsive.spec.ts` to catch. Subtracting that
        // chrome here keeps the panel on screen without needing the popup to
        // know the card's own padding.
        <div
          ref={panelRef}
          {...tid("section-style-panel")}
          className="absolute top-full right-0 z-20 mt-1 grid w-72 max-w-[calc(100vw-2rem-49px)] gap-3 rounded-xl surface border-(--edge) bg-(--menu) p-3 shadow-lg"
        >
          <span className="text-xs font-medium">{labels.title}</span>
          <StylePopupFields
            id={id}
            labels={labels}
            gates={gates}
            style={style}
            setField={setField}
          />
        </div>
      ) : null}
    </div>
  );
}
