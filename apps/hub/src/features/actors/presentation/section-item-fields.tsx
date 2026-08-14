"use client";

import { ImageOff, Trash2 } from "lucide-react";
import { useId } from "react";
import {
  useController,
  useWatch,
  type Control,
  type FieldValues,
  type Path,
  type UseFormRegister,
} from "react-hook-form";
import type { AuthoringLanguage } from "@/features/actors/application/use-language-toggle";
import type { SectionType } from "@/features/actors/domain/section-schema";
import {
  IconPicker,
  type IconPickerLabels,
} from "@/features/actors/presentation/icon-picker";

/**
 * Translated strings {@link SectionItemFields} renders.
 *
 * Extends the icon picker's and carries the upload control's, because the item
 * owns one label bag and hands slices of it down rather than each level
 * resolving its own — a component that resolved its own would need the
 * catalogue in the browser.
 *
 * The upload's strings are gone with the bucket it needed. A picture is a
 * pasted address now, so `imageUrl` carries a hint saying so — a field named
 * for an image reads as a place to put a file until somebody is told it is not.
 *
 * It carries a label for every optional field an item can hold, including the
 * ones most layouts never show. The bag is per-component and not per-layout on
 * purpose: which fields appear is decided by `LINKED`, `ICONED` and `PICTURED`
 * below, and splitting the labels the same way would mean two places to keep in
 * step and one of them silently winning.
 */
export interface SectionItemFieldsLabels extends IconPickerLabels {
  /** Field label for the item's title. */
  itemTitle: string;
  /** Field label for the item's description. */
  itemDescription: string;
  /** Names the remove control for a screen reader. */
  removeItem: string;
  /** Field label for a gallery item's image address. */
  imageUrl: string;
  /** Says that a picture is a link and nothing is stored. */
  imageUrlHint: string;
  /** Field label for the address a media or link item points at. */
  linkUrl: string;
  /** Says which addresses become a player and what happens to the rest. */
  linkUrlHint: string;
  /** Stands in for the preview until an address is written. */
  imageMissing: string;
}

/**
 * What {@link SectionItemFields} needs.
 *
 * `type` is the section's layout, not the item's: an item has no layout of its
 * own, and this is what decides which of the optional columns it offers.
 * `control` joins `register` because neither the icon nor the image address is
 * typed into a plain input any more — one is chosen by a picker and the other
 * can be written by an upload.
 *
 */
export interface SectionItemFieldsProps<T extends FieldValues> {
  /** The form's control, for the fields no plain input can drive. */
  control: Control<T>;
  /** The form's register, so the fields join the surrounding form. */
  register: UseFormRegister<T>;
  /** Where this item lives, as in `sections.0.items.2`. */
  path: string;
  /** Its section's layout, which decides what is offered. */
  type: SectionType;
  /**
   * The fursona being edited, absent while creating one.
   *
   * Threaded down from the editor because an uploaded object's path carries the
   * actor's ref, and there is no ref until the fursona exists. Absent simply
   * means the upload control is not offered yet.
   */
  /** Which language's fields to bind to. */
  lang: AuthoringLanguage;
  /** Already-translated strings. */
  labels: SectionItemFieldsLabels;
  /** Called when this item should go. */
  onRemove: () => void;
}

/**
 * The layouts whose items carry an address.
 *
 * `music` and `video` play theirs; `links` turns theirs into a button. Every
 * other layout would accept the field, store it, and render nothing — which is
 * the worst kind of control, because it refuses nothing and shows nothing and
 * gives somebody no way to learn it did nothing.
 */
const LINKED = new Set<SectionType>(["video", "music", "links"]);

/** The layouts that render an item's icon. */
const ICONED = new Set<SectionType>(["cards", "links"]);

/** The layouts that render an item's picture. */
const PICTURED = new Set<SectionType>(["gallery", "carousel"]);

/**
 * One item's fields, in whichever language is being written.
 *
 * The two languages share one pair of text inputs and swap which fields they
 * are bound to, rather than showing four inputs at once — a section of eight
 * text fields would otherwise put sixteen on the screen.
 *
 * **An unwritten Spanish value renders as an empty field and nothing else.** No
 * warning, no placeholder nagging about it, no badge. The Spanish is the
 * author's to write when they choose, and `0009` accepts its absence.
 *
 * `linkUrl` and `linkUrlHint` name the address field the media and link
 * layouts carry. The hint says which addresses become a player and what happens
 * to the rest, because "paste a link" is otherwise a promise the page cannot
 * keep for every host.
 *
 * **What is offered depends on the section's layout**, matching what the public
 * page will render: an icon on `cards`, an image address on `gallery`, neither
 * elsewhere. A field a layout never renders is the worst kind of control — it
 * accepts what somebody types, refuses nothing, and shows nothing, with no way
 * for them to learn that it did nothing.
 *
 * The three sets above the component — `LINKED`, `ICONED`, `PICTURED` — are
 * what decide that, one per optional field. They are sets rather than a chain
 * of comparisons because each field is now wanted by more than one layout, and
 * `type === "cards" || type === "links"` repeated three times is the shape that
 * quietly loses a layout when a fourth is added.
 *
 * **A picture is an address somebody pasted, and nothing here stores a file.**
 * That is the platform's rule for every piece of external media — see
 * `embeds.ts` for the same shape applied to players — and it is a budget
 * decision before it is a technical one: hosting other people's images is the
 * one cost on a profile builder that grows with how much people enjoy it.
 *
 * There was an upload control here, backed by a Supabase Storage bucket. It is
 * gone, and with it the warning it needed about an uploaded picture outliving
 * the visibility of the fursona that carried it — a pasted address has never
 * had that property, because the file was never ours.
 *
 * Nothing is erased when the layout changes. `0009` accepts both columns on any
 * item, so switching a section to `gallery` to look at it and switching back
 * finds the icon still there.
 *
 * @returns the item's fields.
 */
export function SectionItemFields<T extends FieldValues>({
  control,
  register,
  path,
  type,
  lang,
  labels,
  onRemove,
}: SectionItemFieldsProps<T>) {
  // Ids rather than wrapping labels: a wrapping label takes its whole text
  // content as the field's accessible name, which is how the fursona editor's
  // handle ended up announcing its hint as part of its name.
  const id = useId();

  // The icon is chosen by a control rather than typed, so it cannot be a plain
  // register. The image address can be, but the preview has to follow what is
  // being typed — a value read once at mount would leave somebody entering a
  // URL into a box that never shows them anything.
  const icon = useController({ control, name: `${path}.icon` as Path<T> });
  // Still a controller rather than a register: the preview has to follow what
  // is being typed, and a value read once at mount would leave somebody
  // entering an address into a box that never shows them anything.
  const image = useController({
    control,
    name: `${path}.image_url` as Path<T>,
  });
  const imageUrl = image.field.value;
  const title = useWatch({ control, name: `${path}.title_${lang}` as Path<T> });

  return (
    <div className="grid gap-2 rounded-lg border border-[var(--edge)]/40 p-3">
      {LINKED.has(type) ? (
        <div className="grid gap-1.5">
          <label htmlFor={`${id}-link`} className="text-xs font-medium">
            {labels.linkUrl}
          </label>
          <input
            id={`${id}-link`}
            type="url"
            inputMode="url"
            aria-describedby={`${id}-link-hint`}
            {...register(`${path}.link_url` as Path<T>)}
            className="rounded-lg border border-[var(--edge)]/60 bg-transparent px-3 py-1.5 text-sm"
          />
          <p id={`${id}-link-hint`} className="text-xs text-[var(--muted)]">
            {labels.linkUrlHint}
          </p>
        </div>
      ) : null}

      {ICONED.has(type) ? (
        <IconPicker
          value={String(icon.field.value ?? "")}
          onChange={icon.field.onChange}
          labels={labels}
        />
      ) : null}

      {PICTURED.has(type) ? (
        <div className="flex items-start gap-3">
          {imageUrl ? (
            // The address is arbitrary and typed by hand, so next/image would
            // try to optimise a host it has never been configured for.
            // eslint-disable-next-line @next/next/no-img-element -- see above
            <img
              src={String(imageUrl)}
              alt={String(title ?? "")}
              className="size-16 shrink-0 rounded-lg border border-[var(--edge)]/60 object-cover"
            />
          ) : (
            <span className="flex size-16 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-[var(--edge)]/60 text-[0.625rem] text-[var(--muted)]">
              <ImageOff className="size-4" />
              {labels.imageMissing}
            </span>
          )}
          <div className="grid flex-1 gap-1.5">
            <label htmlFor={`${id}-image`} className="text-xs font-medium">
              {labels.imageUrl}
            </label>
            <input
              id={`${id}-image`}
              type="url"
              inputMode="url"
              value={String(imageUrl ?? "")}
              onChange={(event) => image.field.onChange(event.target.value)}
              aria-describedby={`${id}-image-hint`}
              className="rounded-lg border border-[var(--edge)]/60 bg-transparent px-3 py-1.5 text-sm"
            />
            <p id={`${id}-image-hint`} className="text-xs text-[var(--muted)]">
              {labels.imageUrlHint}
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-1.5">
        <label htmlFor={`${id}-title`} className="text-xs font-medium">
          {labels.itemTitle}
        </label>
        <input
          id={`${id}-title`}
          // Keyed by language so React swaps the input rather than reusing one
          // bound to the other field, which would carry the previous value
          // across a toggle.
          key={`title-${lang}`}
          {...register(`${path}.title_${lang}` as Path<T>)}
          className="rounded-lg border border-[var(--edge)]/60 bg-transparent px-3 py-1.5 text-sm"
        />
      </div>

      <div className="grid gap-1.5">
        <label htmlFor={`${id}-description`} className="text-xs font-medium">
          {labels.itemDescription}
        </label>
        <textarea
          id={`${id}-description`}
          key={`description-${lang}`}
          rows={3}
          {...register(`${path}.description_${lang}` as Path<T>)}
          className="rounded-lg border border-[var(--edge)]/60 bg-transparent px-3 py-1.5 text-sm"
        />
      </div>

      <button
        type="button"
        aria-label={labels.removeItem}
        onClick={onRemove}
        className="justify-self-end rounded-lg p-1.5 text-[var(--muted)]"
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}
