"use client";

import { Paintbrush } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { tid } from "@/shared/infrastructure/test-id";
import { SKINS, type SkinId } from "@/shared/domain/skins";
import type { BlockStyle } from "@/features/actors/domain/block-schema";

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
 * It offers `chrome`, `heading` and `text_align` beside the border, each with
 * an empty option that CLEARS the key rather than naming a value.
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
 * `atTop` is what decides whether the full-width and margins controls are
 * offered: this component sees a style bag and never knows where its block
 * sits.
 *
 * It offers `chrome`, `heading` and `text_align` beside the border, each with
 * an empty option that CLEARS the key rather than naming a value.
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
   * Whether this block carries a name.
   *
   * The name-style control is offered only where there is a name to draw: a
   * bar with nothing in it accepts a choice and changes nothing, which is the
   * shape this repo keeps trimming. It is a prop rather than `atTop` because a
   * NESTED container may be named too, and the idiom applies to it just as
   * well.
   */
  named: boolean;
  /**
   * Whether this block is a SECTION — a container at depth 0.
   *
   * Only a section may reach both edges of the window or drop page chrome, so
   * only a section is offered those controls. Passed in rather than derived
   * here: this component sees a style bag and never knows where its block sits.
   */
  atTop: boolean;
}

/**
 * A paintbrush button and the popup it opens: one section's own skin,
 * background picture, card size and border, apart from its layout.
 *
 * **Every field it offers is one every block renders**, which is why nothing
 * here is gated. Skin, background and border are arrangement-agnostic:
 * `nestedSkinVars` sets tokens every `rounded-xl surface` element reads, a
 * background paints the wrapper visible under any mode, and
 * `--skin-border-style` is read by that same `surface` utility everywhere. The
 * card-size field was the one exception and is gone rather than gated — no
 * page reads `--card-size` at all now, so there was no arrangement left for
 * which the control did anything.
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
 * It offers `chrome`, `heading` and `text_align` beside the border, each with
 * an empty option that CLEARS the key rather than naming a value.
 */
export function SectionStylePopup({
  value,
  onChange,
  labels,
  atTop,
  named,
}: SectionStylePopupProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const skinFieldRef = useRef<HTMLSelectElement>(null);
  const style = value ?? {};

  // Escape and an outside click both close the popup; opening moves focus to
  // the first field, and closing — by either of those, or by the trigger
  // itself — returns it to the trigger. The cleanup below is what returns
  // focus: it runs the moment `open` goes false however that happened,
  // rather than each closer calling a `close` helper of its own.
  useEffect(() => {
    if (!open) return;
    skinFieldRef.current?.focus();

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
        {...tid("section-style-open")}
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
          className="absolute top-full right-0 z-20 mt-1 grid w-72 max-w-[calc(100vw-2rem-49px)] gap-3 rounded-xl surface border-(--edge) bg-(--surface) p-3 shadow-lg"
        >
          <span className="text-xs font-medium">{labels.title}</span>

          <div className="grid gap-1.5">
            <label htmlFor={`${id}-skin`} className="text-xs font-medium">
              {labels.skin}
            </label>
            <select
              ref={skinFieldRef}
              id={`${id}-skin`}
              value={style.skin ?? ""}
              onChange={(event) => setField("skin", event.target.value)}
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

          <div className="grid gap-1.5">
            <label htmlFor={`${id}-background`} className="text-xs font-medium">
              {labels.backgroundUrl}
            </label>
            <input
              id={`${id}-background`}
              type="url"
              inputMode="url"
              value={style.background_url ?? ""}
              onChange={(event) =>
                setField("background_url", event.target.value)
              }
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
          {atTop ? (
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
              ask for its card back. */}
          <div className="grid gap-1.5">
            <label htmlFor={`${id}-chrome`} className="text-xs font-medium">
              {labels.chrome}
            </label>
            <select
              id={`${id}-chrome`}
              value={style.chrome ?? ""}
              onChange={(event) =>
                setField(
                  "chrome",
                  event.target.value as SectionStyle["chrome"] | "",
                )
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

          {/* **Offered only where there is a name to draw.** A bar with
              nothing in it is the control-that-does-nothing this repo keeps
              trimming, and the renderer already treats it as inert. */}
          {named ? (
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
              </select>
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

          <div className="grid gap-1.5">
            <label htmlFor={`${id}-border`} className="text-xs font-medium">
              {labels.border}
            </label>
            <select
              id={`${id}-border`}
              value={style.border ?? ""}
              onChange={(event) =>
                setField(
                  "border",
                  event.target.value as SectionStyle["border"] | "",
                )
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
        </div>
      ) : null}
    </div>
  );
}
