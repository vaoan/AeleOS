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
import { tid } from "@/shared/infrastructure/test-id";
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
 * `itemDescriptionHint` is the description field's placeholder, and it is where
 * a template's guidance moved to. The app's own words belong in the catalogue;
 * whatever somebody types into the field does not.
 *
 * It carries a label for every optional field an item can hold, including the
 * ones most layouts never show. The bag is per-component and not per-layout on
 * purpose: which fields appear is decided by `LINKED`, `ICONED` and `PICTURED`
 * below, and splitting the labels the same way would mean two places to keep in
 * step and one of them silently winning.
 *
 * `linkUrl` carries TWO hints rather than one, for the same reason: what a
 * pasted address becomes genuinely differs by layout — the layouts in
 * `EMBEDS` can embed it, the remaining `LINKED` layouts never do — and one
 * hint worded vague enough to cover both would be true of neither. `EMBEDS`
 * decides which of {@link SectionItemFieldsLabels.linkUrlHint} and
 * {@link SectionItemFieldsLabels.linkUrlPlainHint} is shown.
 */
export interface SectionItemFieldsLabels extends IconPickerLabels {
  /** Field label for the item's title. */
  itemTitle: string;
  /** Field label for the item's description. */
  itemDescription: string;
  /**
   * The description field's placeholder.
   *
   * Where a template's guidance went. It is the app's own words, so it belongs
   * in the catalogue — unlike whatever somebody types into the field, which is
   * theirs.
   */
  itemDescriptionHint: string;
  /** Names the remove control for a screen reader. */
  removeItem: string;
  /** Field label for a gallery item's image address. */
  imageUrl: string;
  /** Says that a picture is a link and nothing is stored. */
  imageUrlHint: string;
  /** Field label for the address a media or link item points at. */
  linkUrl: string;
  /**
   * Says which addresses become a player and what happens to the rest.
   *
   * Shown only for the layouts that can embed — `video`, `music`, `posts` —
   * see {@link EMBEDS}. It must never claim embedding for a layout that
   * cannot: `links` always renders a button and `socials` always renders a
   * chip, whatever host was pasted, which is what {@link linkUrlPlainHint}
   * exists to say instead.
   */
  linkUrlHint: string;
  /**
   * Says the address becomes a button or a chip, with no mention of playing
   * or embedding.
   *
   * Shown for `links` and `socials` — see {@link EMBEDS} — neither of which
   * ever embeds anything regardless of the host pasted, so a hint borrowed
   * from {@link linkUrlHint} would promise behaviour they do not have.
   */
  linkUrlPlainHint: string;
  /** Stands in for the preview until an address is written. */
  imageMissing: string;
}

/**
 * What {@link SectionItemFields} needs.
 *
 * `type` is the section's layout, not the item's: an item has no layout of its
 * own, and this is what decides which of the optional columns it offers.
 * `control` joins `register` because the icon is not typed into a plain
 * input — it is chosen by a picker.
 *
 * Carries no `fursona` prop. A doc line for one survived here from when an
 * image address could be written by an upload, threaded down for the actor
 * ref its storage path needed. Images are pasted links now — see
 * `domain/embeds.ts` — and nothing in this interface has needed an actor ref
 * since.
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
 * `music` and `video` play theirs; `links` turns theirs into a button;
 * `socials` is what `resolveSocial` brands into a chip; `posts` frames it as
 * an embedded social post where a provider allows it, and falls back to the
 * same branded chip `socials` uses otherwise — the address is the whole point
 * of the layout either way. Every other layout would accept the field, store
 * it, and render nothing — which is the worst kind of control, because it
 * refuses nothing and shows nothing and gives somebody no way to learn it did
 * nothing.
 */
const LINKED = new Set<SectionType>([
  "video",
  "music",
  "links",
  "socials",
  "posts",
]);

/**
 * The layouts that render an item's icon.
 *
 * `socials` offers it so an author can override the icon `resolveSocial`
 * would otherwise derive from the address — an author who picked one meant
 * it.
 */
const ICONED = new Set<SectionType>(["cards", "links", "socials"]);

/** The layouts that render an item's picture. */
const PICTURED = new Set<SectionType>(["gallery", "carousel"]);

/**
 * The `LINKED` layouts that can actually turn an address into a player.
 *
 * `links` and `socials` are `LINKED` but never embed anything — `links`
 * always renders a button and `socials` always renders a chip, whatever host
 * was pasted. The layouts in `EMBEDS` put the address in a frame and show
 * {@link SectionItemFieldsLabels.linkUrlHint}; the remaining `LINKED` layouts
 * always render a button or a chip and show
 * {@link SectionItemFieldsLabels.linkUrlPlainHint} instead, which says
 * nothing about embedding because there is nothing to say.
 */
const EMBEDS = new Set<SectionType>(["video", "music", "posts"]);

/**
 * One item's fields, in whichever language is being written.
 *
 * The two languages share one pair of text inputs and swap which fields they
 * are bound to, rather than showing four inputs at once — a section of eight
 * text fields would otherwise put sixteen on the screen.
 *
 * **An unwritten Spanish value renders as an empty field and nothing else.** No
 * warning, no badge, nothing marking it as missing. The Spanish is the author's
 * to write when they choose, and `0009` accepts its absence.
 *
 * The description field now carries a placeholder, and that rule survives it
 * because the placeholder is the SAME in both languages: it prompts anybody
 * looking at an empty field, and says nothing about which language is unwritten.
 * A hint that appeared only on the Spanish side would be exactly the nagging
 * this refuses. It is where a template's guidance went — see
 * `FURSONA_TEMPLATES`, which used to ship that guidance as content and so
 * published it.
 *
 * `linkUrl` names the address field the media, link and post layouts carry.
 * Which of its two hints is shown — {@link SectionItemFieldsLabels.linkUrlHint}
 * or {@link SectionItemFieldsLabels.linkUrlPlainHint} — is decided by
 * {@link EMBEDS}, because "paste a link" is otherwise a promise this field
 * cannot keep the same way for every layout that shows it: some embed, some
 * only ever link or chip.
 *
 * **What is offered depends on the section's layout**, matching what the public
 * page will render: an icon on `cards`, an image address on `gallery`, neither
 * elsewhere. A field a layout never renders is the worst kind of control — it
 * accepts what somebody types, refuses nothing, and shows nothing, with no way
 * for them to learn that it did nothing.
 *
 * The sets above the component — `LINKED`, `ICONED`, `PICTURED`, `EMBEDS` —
 * are what decide that, one per optional field or per wrinkle within one.
 * They are sets rather than a chain of comparisons because each field or hint
 * is wanted by more than one layout, and repeating
 * `type === "cards" || type === "links"` for every layout is the shape that
 * quietly loses one when another is added.
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
 * **It carries test ids**, because the end-to-end suite runs in Spanish and may
 * not assert on translated text — so a control without one cannot be reached by
 * the only tests that drive a real browser. The whole sections editor had none,
 * which is why nothing had ever composed a section by hand: every test that
 * appeared to cover this used a template, and a template inserts its sections
 * as data without touching a single one of these controls.
 *
 * Its box is slightly tighter below `sm`. It is the innermost of three nested
 * paddings — column, card, item — which together came to 88px of a 360px screen
 * and were half of why the editor did not fit on a phone.
 *
 * Every field here is a `surface`, which is why a skin's edge weight reaches the innermost box of the editor.
 *
 * Every colour it paints comes from a token — `--edge`, `--muted` — and never from a literal. That is what lets a person's theme reach it at all.
 *
 * Its image preview is a plain `img`, and its disable says why rather than pointing at another file: "see above" survives only until somebody moves one of the two.
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
    <div className="grid gap-2 rounded-lg surface border-(--edge)/40 p-2.5 sm:p-3">
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
            className="rounded-lg surface border-(--edge)/60 bg-transparent px-3 py-1.5 text-sm"
          />
          <p id={`${id}-link-hint`} className="text-xs text-(--muted)">
            {EMBEDS.has(type) ? labels.linkUrlHint : labels.linkUrlPlainHint}
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
            // eslint-disable-next-line @next/next/no-img-element -- the address is arbitrary and typed by hand, so next/image would try to optimise a host it has never been configured for.
            <img
              src={String(imageUrl)}
              alt={String(title ?? "")}
              className="size-16 shrink-0 rounded-lg surface border-(--edge)/60 object-cover"
            />
          ) : (
            <span className="flex size-16 shrink-0 flex-col items-center justify-center gap-1 rounded-lg surface border-dashed border-(--edge)/60 text-[0.625rem] text-(--muted)">
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
              className="rounded-lg surface border-(--edge)/60 bg-transparent px-3 py-1.5 text-sm"
            />
            <p id={`${id}-image-hint`} className="text-xs text-(--muted)">
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
          {...tid("item-title")}
          {...register(`${path}.title_${lang}` as Path<T>)}
          className="rounded-lg surface border-(--edge)/60 bg-transparent px-3 py-1.5 text-sm"
        />
      </div>

      <div className="grid gap-1.5">
        <label htmlFor={`${id}-description`} className="text-xs font-medium">
          {labels.itemDescription}
        </label>
        {/* **The prompt lives here, not in the stored value.** Templates
            used to seed this field with a guidance sentence, which meant a page
            published without editing read its own instructions out to
            strangers in its owner's voice. A placeholder helps while somebody
            writes, is never stored, and never has to be deleted. */}
        <textarea
          id={`${id}-description`}
          key={`description-${lang}`}
          rows={3}
          placeholder={labels.itemDescriptionHint}
          {...tid("item-description")}
          {...register(`${path}.description_${lang}` as Path<T>)}
          className="rounded-lg surface border-(--edge)/60 bg-transparent px-3 py-1.5 text-sm"
        />
      </div>

      <button
        type="button"
        aria-label={labels.removeItem}
        onClick={onRemove}
        className="justify-self-end rounded-lg p-1.5 text-(--muted)"
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}
