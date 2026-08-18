"use client";

import type { DraggableProvidedDragHandleProps } from "@hello-pangea/dnd";
import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  Plus,
  Trash2,
} from "lucide-react";
import { useId, useState } from "react";
import { tid } from "@/shared/infrastructure/test-id";
import {
  useFieldArray,
  useWatch,
  type Control,
  type FieldValues,
  type ArrayPath,
  type FieldArray,
  type Path,
  type UseFormRegister,
  type UseFormSetValue,
} from "react-hook-form";
import { SECTION_TYPES } from "@/features/actors/domain/section-schema";
import type {
  FursonaSection,
  SectionType,
} from "@/features/actors/domain/section-schema";
import type { AuthoringLanguage } from "@/features/actors/application/use-language-toggle";
import {
  SectionItemFields,
  type SectionItemFieldsLabels,
} from "@/features/actors/presentation/section-item-fields";
import {
  SectionStylePopup,
  type SectionStylePopupLabels,
} from "@/features/actors/presentation/section-style-popup";
import { blockStyle } from "@/features/actors/presentation/block-style";

/**
 * Translated strings {@link SectionCard} renders.
 *
 * `dragSection` names the drag handle that now lives in this component's own
 * header row, beside the collapse chevron — `SectionEditor` used to wrap a
 * handle of its own around the card and owned this string; it hands the label
 * bag through unchanged, so nothing downstream of {@link SectionEditorLabels}
 * had to move.
 *
 * `style` carries the paintbrush popup's own strings, nested rather than
 * spread flat in — the popup has a `title` of its own, and a flat bag would
 * have it silently collide with this level's.
 */
export interface SectionCardLabels extends SectionItemFieldsLabels {
  /** Field label for the section's name. */
  sectionName: string;
  /** Field label for the layout selector. */
  sectionType: string;
  /** Adds an item to this section. */
  addItem: string;
  /** Removes this whole section. */
  removeSection: string;
  /** Collapses the section's items. */
  collapse: string;
  /** Expands them again. */
  expand: string;
  /** Names a section's drag handle. */
  dragSection: string;
  /** One label per layout. */
  types: Record<SectionType, string>;
  /** The paintbrush popup's own strings, nested to avoid a `title` collision. */
  style: SectionStylePopupLabels;
}

/**
 * What {@link SectionCard} needs.
 *
 * `dragHandleProps` is new: the card now renders its own drag handle in its
 * header row, so it needs the drag library's props for that button rather
 * than `SectionEditor` wrapping the card in a handle of its own.
 *
 * `setValue` is new too: adding an item renumbers every item's `sort_order`
 * to its position, and that write has to land through the form's own setter
 * rather than through `useFieldArray`'s `append` alone — see this
 * component's own TSDoc.
 *
 * Carries no `fursona` prop. A doc line for one survived here after images
 * became links rather than uploads — nothing in this interface ever read it.
 */
export interface SectionCardProps<T extends FieldValues> {
  /** The form's control, for this section's item array. */
  control: Control<T>;
  /** The form's register, so the fields join the surrounding form. */
  register: UseFormRegister<T>;
  /**
   * The form's own setter, used to renumber an item's `sort_order` after an
   * add — see this component's own TSDoc for why appending alone is not
   * enough once an earlier item has been removed.
   */
  setValue: UseFormSetValue<T>;
  /** Where this section lives, as in `sections.0`. */
  path: string;
  /** Its position, for the label a screen reader reads. */
  index: number;
  /** Which language's fields to bind to. */
  lang: AuthoringLanguage;
  /** Already-translated strings. */
  labels: SectionCardLabels;
  /**
   * The drag library's own props for this section's handle, spread onto the
   * button that moves into the header row here — `SectionEditor` no longer
   * wraps the card in a handle of its own. `null` while dragging is disabled,
   * matching what `@hello-pangea/dnd` hands a `Draggable`'s render prop.
   */
  dragHandleProps: DraggableProvidedDragHandleProps | null;
  /** Called when this section should go. */
  onRemove: () => void;
}

/** A new item, with only what the schema requires. */
const EMPTY_ITEM = {
  title_en: "",
  title_es: "",
  description_en: "",
  description_es: "",
  sort_order: 0,
};

/**
 * One section: its name, its layout, and the items inside it.
 *
 * Items live in their own `useFieldArray` keyed to this section's path, so
 * removing one removes **that** one. An index captured in a handler goes stale
 * the moment anything above it is removed, which is how a delete button ends up
 * dropping the wrong row — the kind of fault that only shows up with three
 * items and never with one.
 *
 * **Items are not draggable — there is no handle and no `Draggable` among
 * them, only add and remove.** So `onDragEnd`'s fault in `SectionEditor` (a
 * reorder that never reached `sort_order`) has no counterpart here: there is
 * no drag to lose. Adding one still renumbers every item's `sort_order` to
 * its position, for the same reason `SectionEditor` does it on a section add
 * — appending after an earlier item was removed can otherwise compute a
 * `sort_order` at or below a surviving item's, and the public page sorts
 * items by that field exactly as it sorts sections.
 *
 * Its layout decides what its items offer — the icon on `cards`, the image
 * address on `gallery` — and the value is watched rather than read once, so
 * changing the layout changes the fields without a save in between.
 *
 *
 * Collapsing hides the items and keeps the header, so a fursona with several
 * long sections stays navigable. It is local state rather than form state: it
 * is about looking, not about content, and it must not make the form dirty.
 *
 * **It carries test ids**, because the end-to-end suite runs in Spanish and may
 * not assert on translated text — so a control without one cannot be reached by
 * the only tests that drive a real browser. The whole sections editor had none,
 * which is why nothing had ever composed a section by hand: every test that
 * appeared to cover this used a template, and a template inserts its sections
 * as data without touching a single one of these controls.
 *
 * **Its `select` is painted with `--menu`, not left transparent.** A dropdown's
 * list is drawn from the control's own background, so a transparent one has
 * nothing to paint with and the browser paints it on white — near-white text on
 * white in dark mode. `dropdown-legibility.test.ts` guards every select in the
 * app against going back.
 *
 * **That same select is what made this row too wide for a phone.** A `select`
 * is as wide as its longest option whatever surrounds it, so the header row —
 * drag handle, chevron, name, a menu naming every layout, bin — together
 * forced the page 150px wider than a 320px screen. The row wraps, the menu
 * takes a line of its own there, and it rejoins the row as soon as there is
 * room. `responsive.spec.ts` fails by exactly that 150px when the row is put
 * back on one line. **The drag handle moved in from `SectionEditor` and the
 * wrap has to keep holding with it here** — `SectionEditor` no longer renders
 * one of its own, and this is the only header row left.
 *
 * **It carries its own skin and background picture, previewed live.** The
 * paintbrush button in the header opens `SectionStylePopup`, and the whole
 * card — this component's own root element — wears the chosen style at once,
 * through `blockStyle`, imported straight from `block-style.ts` rather
 * than a second copy of it: that is the SAME function the public page renders
 * with, not merely the same tokens it reads from, so what somebody judges
 * here is what a stranger will be shown — the same reasoning that has the
 * theme configurator share `themeCss`. Nothing is written until the ordinary
 * save: what has to be instant is SEEING the change, not storing it.
 *
 * **The skin's custom properties land on this root and the painted face is a
 * LAYER inside it**, rather than the root being the surface. `cutout` sets
 * `clip-path`, which clips its element's whole subtree — positioned
 * descendants at any `z-index` included — and the style popup renders inside
 * this card, so a surface on the root cut the popup away the moment somebody
 * chose that skin. A layer is a leaf with nothing to clip, and it holds for
 * whatever token does this next rather than for that one skin.
 *
 * The section's own background picture goes on the face too, for the reason
 * the split exists at all: it is a painted property, and painting it on the
 * root would put a square picture behind a rounded — or chamfered — face.
 * Only the inherited half belongs on an element whose job is to be an
 * ancestor. See the comment on the layer itself, and
 * `tests/e2e/section-card-face.spec.ts`, which measures both in a browser
 * because neither is visible to jsdom.
 *
 * **The popup is handed the same watched `type` `SectionItemFields` already
 * gets**, so it can hide its card-size field on every layout but `cards` —
 * the identical "a field a layout never renders must not be offered" rule
 * that already governs `LINKED`/`ICONED`/`PICTURED` there.
 *
 * * The card's FACE, its select and its item boxes are `surface`s — the class a skin styles, not Tailwind's `border`. The card's root element is deliberately not one; see the split described above.
 *
 * **The rows above that face paint their own `bg-(--surface)`, and that is
 * what keeps the editor readable over a background picture.** The face shows
 * the picture at full strength deliberately, which leaves every control on top
 * of it sitting on somebody's photograph: over a mid-grey `--ink` measures
 * 3.87:1 and `--muted` 1.55:1, against the 4.5:1 text needs. Dimming the face
 * again is the wrong end of the trade — the PUBLIC page keeps its picture at
 * full strength too and stays readable because its item cards paint
 * `bg-(--surface)` over it. So the header row here and `SectionItemFields`'
 * box do the same, and the picture reads between them exactly as it reads
 * between the public page's cards. Both halves are measured together in
 * `tests/e2e/section-card-face.spec.ts`, so restoring either at the other's
 * expense fails.
 *
 * Every colour it paints comes from a token — `--edge`, `--menu`, `--muted`, `--surface` — and never from a literal. That is what lets a person's theme reach it at all.
 *
 * @returns the section card.
 */
export function SectionCard<T extends FieldValues>({
  control,
  register,
  setValue,
  path,
  index,
  lang,
  labels,
  dragHandleProps,
  onRemove,
}: SectionCardProps<T>) {
  const id = useId();
  const [collapsed, setCollapsed] = useState(false);

  const { fields, append, remove } = useFieldArray({
    control,
    name: `${path}.items` as ArrayPath<T>,
  });

  /**
   * Rewrites every item's `sort_order` to its position among the first
   * `count` items, one-based to match {@link EMPTY_ITEM}'s own scheme —
   * called after an add, since `fields.length + 1` alone can land at or
   * below a surviving item's `sort_order` once an earlier item has been
   * removed. See this component's own TSDoc.
   *
   * @param count - how many items to renumber, starting from the first.
   */
  const renumberItems = (count: number): void => {
    for (let itemIndex = 0; itemIndex < count; itemIndex += 1) {
      setValue(
        `${path}.items.${itemIndex}.sort_order` as Path<T>,
        (itemIndex + 1) as unknown as never,
      );
    }
  };

  // Watched rather than read from the form's defaults, so switching the layout
  // changes what the items offer at once. Somebody changing it is looking to
  // see what it does; making them save first would answer the question far too
  // late.
  const type = useWatch({ control, name: `${path}.type` as Path<T> });

  // Watched separately from `SectionStylePopup`'s own controller on the same
  // field: this is a read-only need — painting the card's own root with the
  // chosen skin — and `useWatch` re-renders on every change the popup makes,
  // including the ones fired while somebody is still choosing.
  const style = useWatch({ control, name: `${path}.style` as Path<T> });

  // **What INHERITS goes on the root; what is PAINTED goes on the face.**
  //
  // `blockStyle` returns one object holding both — the skin's custom
  // properties, which every `surface` below this element reads, and the
  // background picture, which is an ordinary painted property. On the public
  // page they can share an element because that element is a bare
  // `<section>`. Here they cannot: the root is the ancestor the popup and the
  // item fields have to inherit from, and it is deliberately NOT the element
  // that paints, so a picture left on it would paint a square rect behind a
  // rounded face — four bright corner wedges, and triangular ones under
  // `cutout`, which is the shape the face exists to respect.
  //
  // Split by name rather than by naming the keys, because the rule is about
  // what a property DOES: a custom property is inherited by definition and a
  // painted one is not, so anything `blockStyle` grows later lands on the
  // right element without this having to be told about it.
  const chosen = blockStyle(style as FursonaSection["style"]);
  const inherited: Record<string, unknown> = {};
  const painted: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(chosen ?? {})) {
    if (name.startsWith("--")) inherited[name] = value;
    else painted[name] = value;
  }
  // `undefined` rather than an empty object on both, so a section nobody has
  // styled still renders with no `style` attribute at all — the shape
  // `blockStyle`'s own early return exists to give.
  const rootStyle =
    Object.keys(inherited).length > 0
      ? (inherited as React.CSSProperties)
      : undefined;
  const faceStyle =
    Object.keys(painted).length > 0
      ? (painted as React.CSSProperties)
      : undefined;

  return (
    <div
      {...tid("section-card")}
      style={rootStyle}
      className="relative grid gap-3 p-3 sm:p-4"
    >
      {/* **The card's own painted face, as a layer rather than as this
          element.** It carries `surface`, so it wears every form token the
          skin sets — including `clip-path`, which is the reason it is a
          separate element at all.

          `clip-path` clips an element's WHOLE SUBTREE, not merely its own
          paint, and it does so for absolutely- and fixed-positioned
          descendants alike. `SectionStylePopup`'s panel is a descendant of
          this card, so with `surface` on the card itself, choosing `cutout`
          in that popup cut the popup away — worst on a COLLAPSED card, which
          is about one control row tall, where what got cut included the skin
          select that would undo the choice. The same `clip-path` also makes
          its element a stacking context, so the panel's `z-20` stopped
          lifting it above anything outside the card.

          A layer fixes it for every such token at once rather than for this
          one: the painted face is a leaf with nothing inside it to clip, and
          the editor's own chrome is a SIBLING above it.
          `tests/e2e/section-card-face.spec.ts` drives the real popup in a
          real browser, which is the only surface that could have caught this
          — jsdom implements no `clip-path`, and the public-page spec never
          opens an editor.

          Positioned rather than `-z-10`: a negative z-index would paint this
          behind an ancestor's own background rather than behind its
          siblings. Absolutely-positioned siblings paint in document order, so
          this comes first and the rows below carry `relative` to sit above
          it.

          **The section's own background picture is painted HERE, not on the
          root**, so it is clipped by the same corners and the same chamfer as
          everything else the face draws — and, because it sits on the element
          carrying `backdrop-filter` rather than behind it, `glass` no longer
          blurs the picture it is meant to show through. It lands above
          `bg-(--surface)` on this one element, exactly as it did before the
          face was split out, which is what keeps it at full strength: a
          picture behind a 90%-alpha face would be a preview showing a tenth
          of what it previews.

          **What that leaves is the other half of the same job, and it is the
          rows ABOVE this element that do it.** A face showing the picture at
          full strength is a face the editor's own controls sit straight on
          top of, and text on somebody's photograph is text nobody can read —
          `--ink` over a mid-grey reaches 3.87:1 and `--muted` 1.55:1, both
          below the 4.5:1 a control needs. The answer is not to dim the face
          again, which is the trade this comment's first paragraph refuses;
          it is what the PUBLIC page already does with the same picture — its
          item cards paint `bg-(--surface)` over it and its content floats on
          those. So the header row and every item box below paint one too,
          and the picture reads between and around them exactly as it reads
          between the public page's cards. `section-card-face.spec.ts`
          measures both halves in one test, so neither can be restored at the
          other's expense. */}
      <div
        aria-hidden
        {...tid("section-card-face")}
        style={faceStyle}
        className="pointer-events-none absolute inset-0 rounded-xl surface border-(--edge) bg-(--surface)"
      />

      {/* Wraps, and the layout select is what wraps. This row is a drag
          handle, a chevron, a name, a menu naming every layout, a paintbrush
          that opens the style popup, and a bin — and a `select` is as wide as
          its longest option, which no amount of space around it changes. On a
          320px screen they together forced the page 150px wider than the
          phone, so the menu takes a line of its own below (`w-full` is what
          forces the break) and rejoins the row as soon as there is room for
          it. Measured, not guessed: `responsive.spec.ts` fails by exactly
          that 150px when this row is put back on one line.

          **It paints `bg-(--surface)`, like the public page's item cards and
          like the item boxes below it** — see the face's own comment for why.
          The `p-1 -m-1` pair is the whole of the styling beyond that colour:
          the padding gives the labels and the icon buttons four pixels of
          ground rather than a backing flush against their glyphs, and the
          equal negative margin cancels it, so this row's content sits exactly
          where it sat and the wrap point above is unchanged. It has to stay
          within the card's own `p-3`, because the corner probe in
          `section-card-face.spec.ts` reads the picture six pixels in and this
          row's backing begins at eight. */}
      <div
        {...tid("section-header")}
        className="relative -m-1 flex flex-wrap items-end gap-2 rounded-lg bg-(--surface) p-1 sm:gap-3"
      >
        <button
          type="button"
          aria-label={labels.dragSection}
          {...tid("drag-section")}
          {...(dragHandleProps ?? {})}
          className="cursor-grab rounded-lg p-1.5 text-(--muted)"
        >
          <GripVertical className="size-4" />
        </button>

        <button
          type="button"
          aria-label={collapsed ? labels.expand : labels.collapse}
          {...tid("collapse-section")}
          onClick={() => setCollapsed((was) => !was)}
          className="rounded-lg p-1.5 text-(--muted)"
        >
          {collapsed ? (
            <ChevronRight className="size-4" />
          ) : (
            <ChevronDown className="size-4" />
          )}
        </button>

        <div className="grid min-w-0 flex-1 gap-1.5">
          <label htmlFor={`${id}-name`} className="text-xs font-medium">
            {labels.sectionName}
          </label>
          <input
            {...tid("section-name")}
            id={`${id}-name`}
            key={`name-${lang}`}
            {...register(`${path}.name_${lang}` as Path<T>)}
            className="rounded-lg surface border-(--edge)/60 bg-(--surface) px-3 py-1.5 text-sm"
          />
        </div>

        <div className="order-last grid w-full min-w-0 gap-1.5 sm:order-0 sm:w-auto">
          <label htmlFor={`${id}-type`} className="text-xs font-medium">
            {labels.sectionType}
          </label>
          <select
            id={`${id}-type`}
            {...register(`${path}.type` as Path<T>)}
            className="rounded-lg surface border-(--edge)/60 bg-(--menu) px-3 py-1.5 text-sm"
          >
            {SECTION_TYPES.map((type) => (
              <option key={type} value={type}>
                {labels.types[type]}
              </option>
            ))}
          </select>
        </div>

        <SectionStylePopup
          control={control}
          path={path}
          type={(type ?? "cards") as SectionType}
          labels={labels.style}
        />

        <button
          type="button"
          aria-label={labels.removeSection}
          onClick={onRemove}
          className="rounded-lg p-1.5 text-(--muted)"
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      {collapsed ? null : (
        <div className="relative grid gap-2 pl-2 sm:pl-9">
          {fields.map((field, itemIndex) => (
            <SectionItemFields
              key={field.id}
              control={control}
              register={register}
              type={(type ?? "cards") as SectionType}
              path={`${path}.items.${itemIndex}`}
              lang={lang}
              labels={labels}
              onRemove={() => remove(itemIndex)}
            />
          ))}

          <button
            {...tid("add-item")}
            type="button"
            onClick={() => {
              append({
                ...EMPTY_ITEM,
                sort_order: fields.length + 1,
              } as FieldArray<T, ArrayPath<T>>);
              renumberItems(fields.length + 1);
            }}
            className="flex items-center gap-1.5 justify-self-start rounded-lg surface border-(--edge)/60 bg-(--surface) px-3 py-1.5 text-sm text-(--muted)"
          >
            <Plus className="size-4" />
            {labels.addItem}
          </button>
        </div>
      )}

      <span className="sr-only">{index + 1}</span>
    </div>
  );
}
