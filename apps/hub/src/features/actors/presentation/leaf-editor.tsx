"use client";

import { ImageOff, Plus, Trash2, X } from "lucide-react";
import { useId, type ReactNode } from "react";
import {
  BLOCK_LIMITS,
  type Block,
  type LeafBlock,
  type LeafKind,
} from "@/features/actors/domain/block-schema";
import {
  addTableCell,
  addTableRow,
  clearAt,
  patchLeaf,
  removeTableCell,
  removeTableRow,
  setLeafKind,
  setTableCell,
  setTableRowIcon,
  type BlockPath,
} from "@/features/actors/domain/block-edits";
import { leafFields } from "@/features/actors/domain/leaf-fields";
import {
  problemFields,
  type BlockProblem,
} from "@/features/actors/domain/block-problems";
import type { AuthoringLanguage } from "@/features/actors/application/use-language-toggle";
import {
  IconPicker,
  type IconPickerLabels,
} from "@/features/actors/presentation/icon-picker";
import { tid } from "@/shared/infrastructure/test-id";
import { CardKind } from "@/features/actors/presentation/card-kind";
import { styleGatesFor } from "@/features/actors/presentation/block-contract";
import {
  SectionStylePopup,
  type SectionStylePopupLabels,
} from "@/features/actors/presentation/section-style-popup";

/**
 * Translated strings {@link LeafEditor} renders.
 *
 * **The four records are keyed by content kind and are meant to be BUILT by
 * mapping the vocabulary**, never listed by hand — `pages/labels.ts` does
 * exactly that, so a kind added later either gets a catalogue entry or fails
 * `messages.test.ts`. The flat editor listed its equivalent by hand and the
 * reward for forgetting was a raw key rendering at somebody, at a width that
 * overflowed a phone.
 *
 * `leafDescription` and `leafHint` cover only the kinds that DRAW a
 * description — see `DESCRIBED_KINDS`. `social` is the one that does not: its
 * sub-line is the handle `resolveSocial` derived from the address, which is
 * all a branded chip has room for, so there is no description string to write
 * because there is no description field to name.
 *
 * **Every kind gets its own title and description wording rather than a shared
 * "Title"/"Description" pair**, because the pair genuinely means different
 * things: a `picture`'s title is its ALT TEXT, a `link`'s is the words on the
 * button, a `quote`'s is who said it, a `progress`'s is the label over a bar
 * whose value the description has to be a number for. A field whose meaning
 * changes silently between kinds is worse than a differently named one — the
 * rule the flat editor already carried for `progress` alone, applied to all of
 * them because all of them earn it.
 *
 * `linkUrl` carries two hints rather than one, and which is shown is decided
 * by `LeafFields.embeds`: `player` and `post` frame what they recognise, while
 * `link` and `social` always draw a button or a chip whatever host was pasted.
 * One hint vague enough to cover both would be true of neither.
 *
 * `problemTitle` and `problemGeneric` are the two marks a refused save leaves
 * on a block. They exist because a banner reading "fix what is marked" over a
 * page where nothing was marked is worse than no banner — and that was the
 * ordinary path, since a new piece of content starts untitled and the write
 * schema requires a heading.
 *
 * `contentEyebrow` and `leafKind` are two strings for what looks like one idea
 * and is not: the first names the card, the second labels the control choosing
 * WHICH kind it holds. The second used to read "Content" and do both, which
 * left the noun indistinguishable from every other field label in the row.
 *
 * `rowIcon` names a table row's own icon picker and has a POSITION appended by
 * the caller, because a page offering one per row would otherwise carry several
 * buttons a screen reader cannot tell apart.
 *
 * **`style` joined this bag on 2026-08-30**, the same `SectionStylePopupLabels`
 * `BlockCardLabels.style` carries — one popup opens for a leaf now as well as
 * a container, so it is one bag of strings built once in `pages/labels.ts`
 * (`stylePopupLabels`) and assigned to both, rather than a second copy free
 * to drift from the first.
 */
export interface LeafEditorLabels extends IconPickerLabels {
  /**
   * The word naming this card one piece of content, shown in its eyebrow.
   *
   * Distinct from {@link LeafEditorLabels.leafKind}, which labels the control
   * choosing WHICH kind. One says what the card is; the other says what the
   * select does, and letting one string do both is how the noun ended up
   * invisible in a row of field labels.
   */
  contentEyebrow: string;
  /** Field label for the control choosing what a piece of content is. */
  leafKind: string;
  /** One name per content kind, keyed by kind. */
  leafKinds: Record<string, string>;
  /** One title-field label per kind, keyed by kind. */
  leafTitle: Record<string, string>;
  /** One description-field label per kind that draws one, keyed by kind. */
  leafDescription: Record<string, string>;
  /** One description placeholder per kind that draws one, keyed by kind. */
  leafHint: Record<string, string>;
  /** Names the control that empties this place. */
  removeBlock: string;
  /** Field label for the address a leaf points at. */
  linkUrl: string;
  /** Says which addresses become a player or an embedded post. */
  linkUrlHint: string;
  /** Says the address becomes a button or a chip, and nothing embeds. */
  linkUrlPlainHint: string;
  /** Field label for a picture's address. */
  imageUrl: string;
  /** Says a picture is a link and nothing is stored. */
  imageUrlHint: string;
  /** Stands in for the preview until an address is written. */
  imageMissing: string;
  /** Names one row's icon picker, with its position appended. */
  rowIcon: string;
  /** Heading above a table's rows. */
  tableRows: string;
  /** Adds a row. */
  addRow: string;
  /** Names the control that removes one row. */
  removeRow: string;
  /** Adds a cell to one row. */
  addCell: string;
  /** Names the control that removes one cell. */
  removeCell: string;
  /** Names each cell's own input for a screen reader. */
  cellText: string;
  /**
   * Says a title is missing, beneath the field that is missing one.
   *
   * **The commonest refusal there is**, because a new piece of content starts
   * untitled — deliberately, since a seeded title would put words on somebody's
   * page they did not write — and the write schema requires a heading. Before
   * this existed the only thing a refused save produced was a banner saying
   * "fix what is marked" over a page where nothing was.
   */
  problemTitle: string;
  /**
   * Says something on this block was refused, when it is not the title.
   *
   * A catch-all rather than a message per field, and it earns its place by
   * what it prevents: a refusal on a field this component does not draw would
   * otherwise leave the block unmarked while the banner promised a marking.
   * Every such refusal is reachable only from a payload the controls cannot
   * produce, so naming each one would be words nobody reads.
   */
  problemGeneric: string;
  /**
   * The paintbrush popup's own strings, shared byte-for-byte with
   * `BlockCardLabels.style` — one popup, one bag of strings, whichever kind
   * of block it happens to be editing.
   */
  style: SectionStylePopupLabels;
}

/**
 * What {@link LeafEditor} needs.
 *
 * `dragHandle` is the newest: a leaf is dragged like anything else, and the
 * grip arrives already wired rather than as props to spread.
 *
 * `problems` is the whole page's, not this leaf's share, because the
 * components above pass one value down the tree; `problemFields` narrows it.
 *
 * `kinds` is newer still (2026-08-27): see its own note for why the kind
 * select stopped mapping over every `LEAF_KIND` unconditionally.
 */
export interface LeafEditorProps {
  /** The leaf being edited, as the form is holding it. */
  leaf: LeafBlock;
  /** Where it sits, which is how every edit names it. */
  path: BlockPath;
  /** Applies an edit to the whole page — see {@link BlockEditor}. */
  apply: (edit: (blocks: Block[]) => Block[]) => void;
  /** Which language's fields to bind to. */
  lang: AuthoringLanguage;
  /** Already-translated strings. */
  labels: LeafEditorLabels;
  /**
   * What the save schema refused, and where.
   *
   * The whole list rather than this leaf's own share, because the components
   * above pass one value down the tree; {@link problemFields} narrows it.
   */
  problems: readonly BlockProblem[];
  /**
   * The grip that lifts this piece of content, already wired.
   *
   * An element rather than a bag of props, for the reason `BlockCard` states:
   * the four things a drag needs belong in one component, and `BlockSlot` is
   * the only one in the editor that spreads them.
   */
  dragHandle: ReactNode;
  /**
   * The leaf kinds this page may hold, already narrowed to its actor kind.
   *
   * A list rather than an actor kind, so this component never learns what a
   * person or a fursona is — which of them a page refuses is
   * `required-blocks.ts`'s business and is pinned to the SQL there. Offering a
   * kind `set_actor_sections` refuses is a control that accepts a press and
   * produces an unexplained failure one save later, which is what this prop
   * exists to end.
   */
  kinds: readonly LeafKind[];
}

/** The class every text input in this editor wears. */
const INPUT =
  "rounded-lg surface border-(--edge)/60 bg-transparent px-3 py-1.5 text-sm";

/**
 * One piece of content: what it is, and only the fields it will draw.
 *
 * **The gating is the whole point of this component.** `leafFields` answers,
 * per kind, whether the renderer reads the address, the icon, the picture, the
 * rows and the description; anything it says no to is not offered. A control
 * that accepts what somebody types, stores it, refuses nothing and renders
 * nothing is the worst kind of control, because there is no way for them to
 * learn it did nothing — and that table is pinned to the renderer by
 * `leaf-fields.test.tsx` rather than trusted, because a table describing
 * another file's behaviour is exactly what `check:docs` cannot keep honest.
 *
 * **Gating hides the FIELD and never the value.** Every field is accepted on
 * every kind — see `LeafBlock` — so switching a kind to see what it looks like
 * and switching back finds what was typed still there. Nothing here clears
 * anything.
 *
 * **A kind this build does not know is shown as itself and kept, and the SAVE
 * is refused while it is there.** Both halves are true and the second used to
 * be missing from this note. The lenient read admits a name a newer deployment
 * wrote, so the block opens, renders its plain title-and-description pair —
 * which is what `LEAVES.get(kind) ?? PlainLeaf` draws — and appears here as a
 * disabled option carrying its own name rather than as a blank select whose
 * first change would silently retype it. But `blocksSchema` has no
 * `unknownKindSchema` fallback, deliberately: on the WRITE an unrecognised
 * kind is a typo somebody just made, and the one moment they can still fix it
 * is the save. So the whole page is refused for as long as the block is there.
 *
 * That is the safe direction — nothing is written, nothing is lost — and the
 * way out is to choose a kind this build knows, which retypes exactly that one
 * block and nothing else. **Do not weaken the strict schema to make the save
 * go through**; the honest trade is that a page carrying a block from a newer
 * deployment can be read here and not re-saved here.
 *
 * **The records are never indexed by the stored `kind`.** Every lookup below
 * goes through a value taken from `kinds` — itself built from `LEAF_KINDS` by
 * `offerableLeafKinds` — so a plain object indexed by text out of `jsonb` — the
 * shape that put `__proto__` through `TIDAL_KINDS` and shipped a Critical —
 * cannot arise here even though the labels are records rather than maps.
 *
 * **An unwritten Spanish field is an ordinary state.** No warning, no badge,
 * nothing marking it as missing: the app's own chrome is next-intl and fails a
 * build for a missing key, but a person's writing about their own character is
 * theirs to finish when they choose. The Spanish halves are written as absent
 * rather than as `""`, so a page reads back exactly as it was written.
 *
 * **It carries no viewport breakpoint, and its own padding is the reason
 * there is no container query in its place either.** A leaf editor sits in a
 * place of its parent card's grid, so an `@`-prefixed rule on its root asks
 * that CARD how wide it is rather than the place — the same wrong-box answer
 * `sm:` gave, one level in — because an element is never its own query
 * container. `block-card.test.tsx` renders this component inside a card and
 * fails on any `sm:`/`md:`/`lg:`/`xl:`/`2xl:` class, which is the guard that
 * was missing while five of them survived here and next door.
 *
 * Every colour it paints comes from a token — `--edge`, `--menu`, `--muted`,
 * `--surface` — and never from a literal, and its select is painted with
 * `--menu` rather than left transparent: a dropdown's list is drawn from the
 * control's own background, and a transparent one is painted on white.
 * `dropdown-legibility.test.ts` guards every select in the app.
 *
 * **Its grip comes from `BlockSlot` and it draws no grip of its own.** The
 * four things a drag needs are spread in exactly one component, because
 * dropping any of them leaves a control that renders, looks right and does
 * nothing at all — silently, by mouse as well as by keyboard.
 *
 * **`CardKind` sits on the kind field's LABEL line, not in the row holding
 * the select.** That row has no slack: the select is as wide as its longest
 * option — `Reproductor de música` in Spanish, 204px — and unlike the section
 * card's selects it has no `w-full` fallback to wrap onto a line of its own,
 * so anything placed beside it pushes a 320px screen sideways.
 *
 * **The card's own BORDER is the other half of that naming, and it is a
 * mechanism rather than a decoration.** A container says what it is with an
 * accent rail down one edge; content says it with a heavier perimeter — two
 * pixels of `--edge` at full strength where this card used to carry one at 40%
 * alpha. Three channels separate them and none is colour alone: a rail against
 * a perimeter, `--accent` against `--edge`, and thin against thick.
 *
 * **Weight is doing the work that colour cannot.** The chrome palette has ONE
 * accent and a neutral ramp — there is no second hue to reach for, and the
 * nearest candidate, `--ink-2`, is 45% lightness against `--accent`'s 46% in
 * light mode, which is invisible. `--edge` is the only token that separates
 * from the accent by lightness in both modes (66 against 46 light, 52 against
 * 74 dark), so this pairing survives greyscale.
 *
 * **A border adds to the BOX, which is why this is measured and not assumed.**
 * The paragraph above records what padding cost the last time; three more
 * pixels of border are the same arithmetic on a different property, and a
 * nested card pays them twice. Measured with a container inside a section so
 * the borders stack: no overflow at 320, 375, 568 or 640. See the feature
 * note for the survey those came from.
 *
 * **It mounts `SectionStylePopup` now (2026-08-30), the same component
 * `BlockCard` does.** A leaf may carry its own skin, border, corners and the
 * rest exactly as a container does — `blockStyle` has applied to a leaf's
 * wrapper `<div>` since the block model shipped — but until this, nothing in
 * the editor could reach any of it for a leaf: the popup existed and opened
 * for a `ContainerBlock` only. `styleGatesFor`
 * (`presentation/block-contract.ts`) computes what this particular leaf's
 * `kind` honours — `label` for a `text` or identity leaf, `image_fit` for one
 * that draws a picture, `portrait` for `avatar` alone — and the popup writes
 * through `patchLeaf` exactly as every other field here does.
 *
 * @returns the leaf's fields.
 */
export function LeafEditor({
  leaf,
  path,
  apply,
  lang,
  labels,
  problems,
  dragHandle,
  kinds,
}: LeafEditorProps) {
  // Ids rather than wrapping labels: a wrapping label takes its whole text
  // content as the field's accessible name, which is how the fursona editor's
  // handle once announced its hint as part of its name.
  const id = useId();
  const kind = leaf.kind;
  const known = kinds.includes(kind as LeafKind);
  const fields = leafFields(kind);
  // A leaf at the top level is legal — see `block-editor.tsx`'s own note on
  // why — so `atTop` is computed the same way `BlockCard` computes it, even
  // though `styleGatesFor` ignores it for a leaf: neither `bleed` nor
  // `margins` is read unless `isContainer` already agreed, before either key
  // is asked.
  const gates = styleGatesFor(leaf, path.length - 1 === 0);
  // **What the save refused ON THIS LEAF.** Both halves are marked: the title,
  // which is the refusal somebody will actually meet, and anything else, so a
  // refusal on a field this component does not draw still shows up here rather
  // than leaving the banner promising a marking nothing made.
  const wrong = new Set(problemFields(problems, path));
  const titleWrong = wrong.has("title_en") || wrong.has("title_es");
  const otherWrong = [...wrong].some((field) => !field.startsWith("title_"));
  // Position named once, for the reason the renderer names it: a row and a
  // cell have no identity but where they sit, and `react/no-array-index-key`
  // reads the map callback's index parameter.
  const rows = (leaf.rows ?? []).map((cells, row) => ({
    key: `row-${row}`,
    row,
    cells: cells.map((cell, index) => ({
      key: `cell-${row}-${index}`,
      cell,
      index,
    })),
  }));

  /**
   * Writes one of the two halves of a bilingual field.
   *
   * @param field - which pair.
   * @param value - what they typed.
   */
  const write = (field: "title" | "description", value: string): void => {
    apply((blocks) =>
      patchLeaf(
        blocks,
        path,
        lang === "en"
          ? { [`${field}_en`]: value }
          : { [`${field}_es`]: value || undefined },
      ),
    );
  };

  const titleValue = (lang === "en" ? leaf.title_en : leaf.title_es) ?? "";
  const descriptionValue =
    (lang === "en" ? leaf.description_en : leaf.description_es) ?? "";

  return (
    // Its padding is not responsive, for the reason {@link BlockCard}'s root
    // states: this element sits in a place of its parent's grid, so an
    // `@`-prefixed rule here would ask the parent CARD how wide it is rather
    // than this place — the same wrong-box answer `sm:` gave, one level in.
    <div
      {...tid("leaf-editor")}
      data-leaf-kind={kind}
      className="relative grid gap-2 rounded-lg surface border-4 border-(--edge) bg-(--surface) p-2.5"
    >
      <div className="flex flex-wrap items-end gap-2">
        {dragHandle}

        <div className="grid min-w-0 flex-1 gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <CardKind kind="content">{labels.contentEyebrow}</CardKind>
            <label htmlFor={`${id}-kind`} className="text-xs font-medium">
              {labels.leafKind}
            </label>
          </div>
          <select
            id={`${id}-kind`}
            {...tid("leaf-kind")}
            value={kind}
            onChange={(event) =>
              apply((blocks) =>
                setLeafKind(blocks, path, event.target.value as LeafKind),
              )
            }
            className="rounded-lg surface border-(--edge)/60 bg-(--menu) px-3 py-1.5 text-sm"
          >
            {/* A kind this build has no name for still has to be shown, or the
                select would render blank and the first change would retype
                somebody's block without them asking. Disabled, because
                choosing it back is not something this build can offer. */}
            {known ? null : (
              <option value={kind} disabled>
                {kind}
              </option>
            )}
            {kinds.map((one) => (
              <option key={one} value={one}>
                {labels.leafKinds[one]}
              </option>
            ))}
          </select>
        </div>

        <SectionStylePopup
          value={leaf.style}
          onChange={(style) =>
            apply((blocks) => patchLeaf(blocks, path, { style }))
          }
          labels={labels.style}
          // Computed from this leaf's own kind, the same function `BlockCard`
          // calls from its own kind of block — see `styleGatesFor`.
          gates={gates}
        />

        <button
          type="button"
          aria-label={labels.removeBlock}
          {...tid("remove-block")}
          onClick={() => apply((blocks) => clearAt(blocks, path))}
          className="rounded-lg p-1.5 text-(--muted)"
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      {/* A refusal on a field this component does not draw. Without it the
          banner would promise a marking that nothing made — which is the
          fault the whole `problems` thread exists to end, and it would come
          back one unmarked field at a time. */}
      {otherWrong ? (
        <p {...tid("leaf-problem")} className="text-xs text-(--accent)">
          {labels.problemGeneric}
        </p>
      ) : null}

      {fields.link ? (
        <div className="grid gap-1.5">
          <label htmlFor={`${id}-link`} className="text-xs font-medium">
            {labels.linkUrl}
          </label>
          <input
            id={`${id}-link`}
            type="url"
            inputMode="url"
            {...tid("leaf-link")}
            aria-describedby={`${id}-link-hint`}
            value={leaf.link_url ?? ""}
            onChange={(event) =>
              apply((blocks) =>
                patchLeaf(blocks, path, { link_url: event.target.value }),
              )
            }
            className={INPUT}
          />
          <p id={`${id}-link-hint`} className="text-xs text-(--muted)">
            {fields.embeds ? labels.linkUrlHint : labels.linkUrlPlainHint}
          </p>
        </div>
      ) : null}

      {fields.icon ? (
        <IconPicker
          value={leaf.icon ?? ""}
          onChange={(icon) =>
            apply((blocks) => patchLeaf(blocks, path, { icon }))
          }
          labels={labels}
        />
      ) : null}

      {fields.picture ? (
        <div className="flex items-start gap-3">
          {leaf.image_url ? (
            // The address is arbitrary and typed by hand, so next/image would
            // try to optimise a host it has never been configured for.
            // eslint-disable-next-line @next/next/no-img-element -- the address is arbitrary and typed by hand, so next/image would try to optimise a host it has never been configured for.
            <img
              src={leaf.image_url}
              alt={titleValue}
              className="size-16 shrink-0 rounded-lg surface border-(--edge)/60 object-cover"
            />
          ) : (
            <span
              {...tid("leaf-image-missing")}
              className="flex size-16 shrink-0 flex-col items-center justify-center gap-1 rounded-lg surface border-dashed border-(--edge)/60 text-[0.625rem] text-(--muted)"
            >
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
              {...tid("leaf-image")}
              aria-describedby={`${id}-image-hint`}
              value={leaf.image_url ?? ""}
              onChange={(event) =>
                apply((blocks) =>
                  patchLeaf(blocks, path, { image_url: event.target.value }),
                )
              }
              className={INPUT}
            />
            <p id={`${id}-image-hint`} className="text-xs text-(--muted)">
              {labels.imageUrlHint}
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-1.5">
        <label htmlFor={`${id}-title`} className="text-xs font-medium">
          {known ? labels.leafTitle[kind] : labels.leafTitle.text}
        </label>
        <input
          id={`${id}-title`}
          // Keyed by language so React swaps the input rather than reusing one
          // bound to the other field, which would carry the previous value
          // across a toggle.
          key={`title-${lang}`}
          {...tid("leaf-title")}
          value={titleValue}
          onChange={(event) => write("title", event.target.value)}
          aria-invalid={titleWrong}
          aria-describedby={titleWrong ? `${id}-title-problem` : undefined}
          className={INPUT}
        />
        {/* **The one refusal somebody actually meets.** A new piece of content
            starts untitled — deliberately, since a seeded title would put
            words on their page they did not write — and the write schema
            requires a heading, so this is what "Add content, then Save" hits.
            `aria-invalid` satisfies the letter of it; the sentence is what
            makes it usable, and it names ENGLISH because that is the half the
            schema requires whichever half is on screen. */}
        {titleWrong ? (
          <p
            id={`${id}-title-problem`}
            {...tid("leaf-title-problem")}
            className="text-xs text-(--accent)"
          >
            {labels.problemTitle}
          </p>
        ) : null}
      </div>

      {fields.description ? (
        <div className="grid gap-1.5">
          <label htmlFor={`${id}-description`} className="text-xs font-medium">
            {known ? labels.leafDescription[kind] : labels.leafDescription.text}
          </label>
          {/* **The prompt lives here, not in the stored value.** Templates used
              to seed this field with a guidance sentence, which meant a page
              published without editing read its own instructions out to
              strangers in its owner's voice. A placeholder helps while somebody
              writes, is never stored, and never has to be deleted. */}
          <textarea
            id={`${id}-description`}
            key={`description-${lang}`}
            rows={3}
            placeholder={known ? labels.leafHint[kind] : labels.leafHint.text}
            {...tid("leaf-description")}
            value={descriptionValue}
            onChange={(event) => write("description", event.target.value)}
            className={INPUT}
          />
        </div>
      ) : null}

      {fields.rows ? (
        <TableRows
          rows={rows}
          path={path}
          apply={apply}
          lang={lang}
          labels={labels}
        />
      ) : null}
    </div>
  );
}

/** One row of a `table` leaf, as this component holds it while editing. */
interface EditableRow {
  /** Its React key, which is its position. */
  key: string;
  /** Which row it is, counting from zero. */
  row: number;
  /** Its cells, each with the same. */
  cells: { key: string; cell: BlockTableCell; index: number }[];
}

/** One cell of a `table` leaf, in whichever languages have been written. */
interface BlockTableCell {
  /**
   * The mark drawn beside the row, stored on the row's FIRST cell.
   *
   * Restated here rather than imported because the schema's own cell type is
   * module-private by design — see its note. The cost of that is this field
   * having to be added twice, which is why it is written down.
   */
  icon?: string;
  /** What it says in English. */
  text_en: string;
  /** What it says in Spanish, which its author may not have written. */
  text_es?: string;
}

/** What {@link TableRows} needs. */
interface TableRowsProps {
  /** The rows, already paired with their positions. */
  rows: EditableRow[];
  /** Where the leaf sits. */
  path: BlockPath;
  /** Applies an edit to the whole page. */
  apply: (edit: (blocks: Block[]) => Block[]) => void;
  /** Which language's half of each cell to bind to. */
  lang: AuthoringLanguage;
  /** Already-translated strings. */
  labels: LeafEditorLabels;
}

/**
 * The rows of a `table` leaf: their cells, and the controls that shape them.
 *
 * **A component of its own rather than more of {@link LeafEditor}**, because a
 * grid of controls nested two deep is most of one function's branching on its
 * own — and the caps below are two more. Nothing about it is reusable; it is
 * separated for the reader.
 *
 * **Every control carries its POSITION in its name.** Eight inputs all called
 * "Cell" is eight controls a screen reader cannot tell apart, and axe cannot
 * flag it because each of them has a name. A numeral needs no catalogue entry
 * and reads the same in both languages — the same answer `Seat.ordinal` gives
 * in the renderer, for the same problem.
 *
 * **The add controls are withdrawn at their caps rather than left to refuse**,
 * matching every other add control in this editor: one that silently does
 * nothing reads as broken.
 *
 * @returns the rows.
 */
function TableRows({ rows, path, apply, lang, labels }: TableRowsProps) {
  return (
    <div className="grid gap-1.5" {...tid("leaf-rows")}>
      <span className="text-xs font-medium">{labels.tableRows}</span>
      {rows.map((row) => (
        <div key={row.key} className="flex flex-wrap items-center gap-1.5">
          {/* **Offered only where there is a cell to store it on.** The icon
              lives on the row's first cell, so a row emptied of every cell has
              nowhere to put one — and a control that stores nothing is the
              worst kind. */}
          {row.cells.length > 0 ? (
            <IconPicker
              value={row.cells[0]?.cell.icon ?? ""}
              label={`${labels.rowIcon} ${row.row + 1}`}
              onChange={(icon) =>
                apply((blocks) => setTableRowIcon(blocks, path, row.row, icon))
              }
              labels={labels}
            />
          ) : null}
          {row.cells.map((cell) => (
            <span key={cell.key} className="flex items-center gap-1">
              <input
                key={`${cell.key}-${lang}`}
                {...tid("table-cell")}
                // **A numeral, exactly as `Seat.ordinal` does it in the
                // renderer and for the same reason.** Eight inputs called
                // "Cell" is eight controls a screen reader cannot tell
                // apart, and axe cannot flag it because each of them HAS a
                // name. A position needs no catalogue entry and reads the
                // same in both languages.
                aria-label={`${labels.cellText} ${row.row + 1}.${cell.index + 1}`}
                value={
                  (lang === "en" ? cell.cell.text_en : cell.cell.text_es) ?? ""
                }
                onChange={(event) =>
                  apply((blocks) =>
                    setTableCell(
                      blocks,
                      path,
                      row.row,
                      cell.index,
                      lang,
                      event.target.value,
                    ),
                  )
                }
                className={`${INPUT} w-32`}
              />
              <button
                type="button"
                aria-label={`${labels.removeCell} ${row.row + 1}.${cell.index + 1}`}
                {...tid("remove-cell")}
                onClick={() =>
                  apply((blocks) =>
                    removeTableCell(blocks, path, row.row, cell.index),
                  )
                }
                className="rounded-lg p-1 text-(--muted)"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          {row.cells.length < BLOCK_LIMITS.cells ? (
            <button
              type="button"
              {...tid("add-cell")}
              onClick={() =>
                apply((blocks) => addTableCell(blocks, path, row.row))
              }
              className="rounded-lg surface border-(--edge)/60 px-2 py-1 text-xs text-(--muted)"
            >
              {labels.addCell}
            </button>
          ) : null}
          <button
            type="button"
            aria-label={`${labels.removeRow} ${row.row + 1}`}
            {...tid("remove-row")}
            onClick={() =>
              apply((blocks) => removeTableRow(blocks, path, row.row))
            }
            className="rounded-lg p-1 text-(--muted)"
          >
            <Trash2 className="size-3" />
          </button>
        </div>
      ))}
      {rows.length < BLOCK_LIMITS.rows ? (
        <button
          type="button"
          {...tid("add-row")}
          onClick={() => apply((blocks) => addTableRow(blocks, path))}
          className="flex w-fit items-center gap-1.5 rounded-lg surface border-(--edge)/60 px-3 py-1.5 text-sm text-(--muted)"
        >
          <Plus className="size-4" />
          {labels.addRow}
        </button>
      ) : null}
    </div>
  );
}
