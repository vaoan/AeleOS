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
import { ImageField } from "@/features/actors/presentation/image-field";

/**
 * Translated strings {@link SectionItemFields} renders.
 *
 * Extends the icon picker's and carries the upload control's, because the item
 * owns one label bag and hands slices of it down rather than each level
 * resolving its own — a component that resolved its own would need the
 * catalogue in the browser.
 */
export interface SectionItemFieldsLabels extends IconPickerLabels {
  /** Names the upload control. */
  imageUpload: string;
  /** Shown while a file is going up. */
  imageUploading: string;
  /** Shown when a file is too large. */
  imageTooLarge: string;
  /** Shown when a file is the wrong kind. */
  imageWrongType: string;
  /** Shown when the upload itself failed. */
  imageFailed: string;
  /** Warns that an uploaded picture outlives the fursona's visibility. */
  imageStaysPublic: string;
  /** Field label for the item's title. */
  itemTitle: string;
  /** Field label for the item's description. */
  itemDescription: string;
  /** Names the remove control for a screen reader. */
  removeItem: string;
  /** Field label for a gallery item's image address. */
  imageUrl: string;
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
 * `actorRef` is what makes the upload possible: an object's path carries it, so
 * while a fursona is being created the field takes a pasted address only.
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
  actorRef?: string;
  /** Which language's fields to bind to. */
  lang: AuthoringLanguage;
  /** Already-translated strings. */
  labels: SectionItemFieldsLabels;
  /** Called when this item should go. */
  onRemove: () => void;
}

/**
 * One item's fields, in whichever language is being written.
 *
 * The two languages share one pair of text inputs and swap which fields they
 * are bound to, rather than showing four inputs at once — a section of eight
 * text fields would otherwise put sixteen on the screen.
 *
 * **An unwritten Spanish value renders as an empty field and nothing else.** No
 * warning, no placeholder nagging about it, no badge. The Spanish is the
 * author's to write when they choose, and `0013` accepts its absence.
 *
 * **What is offered depends on the section's layout**, matching what the public
 * page will render: an icon on `cards`, an image address on `gallery`, neither
 * elsewhere. A field a layout never renders is the worst kind of control — it
 * accepts what somebody types, refuses nothing, and shows nothing, with no way
 * for them to learn that it did nothing.
 *
 * A gallery item's address can now be uploaded as well as pasted, and both go
 * to the same field — see `ImageField`, which owns that choice and the warning
 * that comes with it.
 *
 * Nothing is erased when the layout changes. `0013` accepts both columns on any
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
  actorRef,
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
  // A controller rather than a register, because an upload writes the value
  // rather than somebody typing it.
  const image = useController({
    control,
    name: `${path}.image_url` as Path<T>,
  });
  const imageUrl = image.field.value;
  const title = useWatch({ control, name: `${path}.title_${lang}` as Path<T> });

  return (
    <div className="grid gap-2 rounded-lg border border-[var(--edge)]/40 p-3">
      {type === "cards" ? (
        <IconPicker
          value={String(icon.field.value ?? "")}
          onChange={icon.field.onChange}
          labels={labels}
        />
      ) : null}

      {type === "gallery" ? (
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
          <div className="flex-1">
            <ImageField
              actorRef={actorRef}
              value={String(imageUrl ?? "")}
              onChange={(url) => image.field.onChange(url)}
              labels={{
                address: labels.imageUrl,
                upload: labels.imageUpload,
                uploading: labels.imageUploading,
                tooLarge: labels.imageTooLarge,
                wrongType: labels.imageWrongType,
                failed: labels.imageFailed,
                staysPublic: labels.imageStaysPublic,
              }}
            />
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
