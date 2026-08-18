"use client";

import { Paintbrush } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import {
  useController,
  type Control,
  type FieldValues,
  type Path,
} from "react-hook-form";
import { tid } from "@/shared/infrastructure/test-id";
import { SKINS, type SkinId } from "@/shared/domain/skins";
import type { FursonaSection } from "@/features/actors/domain/section-schema";

/**
 * A section's own look — `sectionStyleSchema`'s shape (see
 * `domain/section-schema.ts`), with the optional wrapper stripped off.
 *
 * Every key stays optional here too: **absence still means "inherit the
 * page"**, which is the whole contract this popup exists to respect rather
 * than quietly replace with an empty string.
 */
export type SectionStyle = NonNullable<FursonaSection["style"]>;

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
 * `cardSizeDefault` names the option that clears `style.card_size`, and it
 * carries the same "not inherit" caveat as `fitDefault`: the page has no
 * card size of its own either, only `Cards`' own literal fallback. It is
 * kept distinct from `cardSizeM` even though both resolve to the identical
 * `--card-size` today — `CARD_SIZE_MIN`'s own `m` entry — because choosing
 * `m` pins that width regardless of what the fallback becomes later, where
 * clearing the key means "whatever `Cards` falls back to," which only
 * happens to be `m` right now.
 *
 * `borderInherit` names the option that clears `style.border`, and here the
 * "not inherit" caveat that applies to `fitDefault` and `cardSizeDefault`
 * does NOT apply: a border genuinely has a page (or enclosing section) to
 * inherit from, the same way `inheritSkin` does. `borderNone` is a separate,
 * explicit choice — "no edge here regardless of what surrounds it" — and
 * collapsing it into `borderInherit` would make that choice unreachable, the
 * same trap `inheritSkin`'s own doc names for `skins.default`.
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
  /** Field label for the card-size select. */
  cardSize: string;
  /**
   * What the card-size field sets, beneath the select. The enum's own
   * values read `s`/`m`/`l` on the wire and must never appear on screen —
   * see {@link cardSizeS}'s own doc — so this is where the actual mechanism
   * (a MINIMUM width; the browser decides how many cards fit at it) is said
   * once, rather than folded into every option label, each of which would
   * otherwise have to repeat it.
   */
  cardSizeHint: string;
  /** The card-size select's option that clears `style.card_size`. */
  cardSizeDefault: string;
  /**
   * The card-size select's option for `"s"` — never the letter itself.
   * `s`/`m`/`l` are this schema's own wire values, not words a person reads;
   * the label says what choosing it changes (more, narrower cards per row).
   */
  cardSizeS: string;
  /** The card-size select's option for `"m"`. */
  cardSizeM: string;
  /** The card-size select's option for `"l"`. */
  cardSizeL: string;
  /** Field label for the border select. */
  border: string;
  /**
   * What the border field sets, beneath the select: this section's own
   * cards and panels, not the popup's own frame. Said once here rather than
   * on every option, the same shape {@link cardSizeHint} uses.
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
 * `type` is new: it is what lets the popup gate its card-size field on
 * `"cards"` — see that field's own doc, and the component's own TSDoc for
 * why skin and background need no equivalent gate.
 */
export interface SectionStylePopupProps<T extends FieldValues> {
  /** The form's control, for this section's own `style` field. */
  control: Control<T>;
  /** Where this section lives, as in `sections.0` — `.style` is appended. */
  path: string;
  /**
   * This section's own layout, watched by the caller — `SectionCard`
   * already does, for `SectionItemFields`' identical need. Decides only
   * whether the card-size FIELD is offered; the stored `style.card_size`
   * itself is untouched whatever this is, so switching away and back finds
   * the choice still there.
   */
  type: string;
  /** Already-translated strings. */
  labels: SectionStylePopupLabels;
}

/**
 * A paintbrush button and the popup it opens: one section's own skin,
 * background picture, card size and border, apart from its layout.
 *
 * **The card-size field is gated on `type === "cards"`, unlike skin,
 * background and border.** Those three are genuinely layout-agnostic —
 * `nestedSkinVars` sets tokens every layout's `rounded-xl surface` elements
 * read, a background paints the wrapper visible under any of them, and
 * `--skin-border-style` is read by that same `surface` utility on every
 * layout's own surfaces — but `card_size` is the first key in this bag that
 * only ONE layout's CSS ever reads (`Cards`, via `--card-size`). Offering it
 * on every OTHER layout would be exactly the fault `section-item-fields.tsx`'s
 * own TSDoc names: "a field a layout never renders … accepts what somebody
 * types, refuses nothing, and shows nothing, with no way for them to learn
 * that it did nothing." `blockStyle`'s own note that every other layout
 * "ignores" `--card-size` is a statement about the DATA plumbing — it is
 * harmless to leave the key set — not a claim that the editor should offer
 * the choice regardless of layout; those are different questions.
 *
 * **The border field is offered unconditionally, and that is deliberate
 * rather than an oversight this consistency later "fixes."** Every layout
 * renders at least one `surface` element, so there is no layout for which
 * this control would do nothing — the one condition that gates `card_size`
 * simply never arises here.
 *
 * **Gating hides the FIELD, never the stored value** — the same shape
 * `LINKED`/`ICONED`/`PICTURED` already use for item fields. Switching a
 * section's layout away from `cards` and back finds `style.card_size`
 * exactly as it was: nothing here ever writes to it except a change on the
 * select itself, so hiding the control changes what is offered, not what is
 * held.
 *
 * **It owns the whole `style` field through one `useController`**, rather
 * than one per key, because clearing a field has to REMOVE that key from the
 * object — see `setField` below — and a per-key `register` has no way to do
 * that: it can only ever write a value, including `""`, which is exactly the
 * third state `sectionStyleSchema`'s "absent means inherit" contract
 * forbids.
 *
 * **Bound by `path`, never by a captured index.** `SectionCard`'s own TSDoc
 * documents the fault this avoids: an index captured in a handler goes stale
 * the moment a section above it is removed, and a delete or a write then
 * lands on the wrong row. `path` is threaded through as the string it always
 * is — `sections.2`, say — so `${path}.style` always names THIS section's own
 * field, however the array around it has changed since the last render.
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
 * @returns the button and, while open, the popup.
 */
export function SectionStylePopup<T extends FieldValues>({
  control,
  path,
  type,
  labels,
}: SectionStylePopupProps<T>) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const skinFieldRef = useRef<HTMLSelectElement>(null);
  const field = useController({ control, name: `${path}.style` as Path<T> });
  const style = (field.field.value ?? {}) as SectionStyle;

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
    field.field.onChange(Object.keys(next).length > 0 ? next : undefined);
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

          {type === "cards" ? (
            <div className="grid gap-1.5">
              <label
                htmlFor={`${id}-card-size`}
                className="text-xs font-medium"
              >
                {labels.cardSize}
              </label>
              <select
                id={`${id}-card-size`}
                value={style.card_size ?? ""}
                onChange={(event) =>
                  setField(
                    "card_size",
                    event.target.value as SectionStyle["card_size"] | "",
                  )
                }
                aria-describedby={`${id}-card-size-hint`}
                {...tid("section-style-card-size")}
                className="rounded-lg surface border-(--edge)/60 bg-(--menu) px-3 py-1.5 text-sm"
              >
                <option value="">{labels.cardSizeDefault}</option>
                <option value="s">{labels.cardSizeS}</option>
                <option value="m">{labels.cardSizeM}</option>
                <option value="l">{labels.cardSizeL}</option>
              </select>
              <p id={`${id}-card-size-hint`} className="text-xs text-(--muted)">
                {labels.cardSizeHint}
              </p>
            </div>
          ) : null}

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
