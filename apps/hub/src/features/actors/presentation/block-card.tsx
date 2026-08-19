"use client";

import type { DraggableProvidedDragHandleProps } from "@hello-pangea/dnd";
import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  Layers,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import {
  BLOCK_LIMITS,
  CONTAINER_MODES,
  isContainer,
  lenientBlockSchema,
  type Block,
  type ContainerBlock,
  type ContainerMode,
} from "@/features/actors/domain/block-schema";
import {
  appendPlace,
  clearAt,
  mayNest,
  newContainer,
  newLeaf,
  patchContainer,
  removeAt,
  setAt,
  SPACE_CHOICES,
  type BlockPath,
} from "@/features/actors/domain/block-edits";
import {
  problemFields,
  problemUnder,
  type BlockProblem,
} from "@/features/actors/domain/block-problems";
import type { AuthoringLanguage } from "@/features/actors/application/use-language-toggle";
import { blockStyle } from "@/features/actors/presentation/block-style";
import { Block as BlockView } from "@/features/actors/presentation/blocks";
import {
  LeafEditor,
  type LeafEditorLabels,
} from "@/features/actors/presentation/leaf-editor";
import {
  SectionStylePopup,
  type SectionStylePopupLabels,
} from "@/features/actors/presentation/section-style-popup";
import { tid } from "@/shared/infrastructure/test-id";

/**
 * Translated strings {@link BlockCard} renders.
 *
 * `style` carries the paintbrush popup's own strings, nested rather than
 * spread flat in — the popup has a `title` of its own, and a flat bag would
 * have it silently collide with this level's.
 */
export interface BlockCardLabels extends LeafEditorLabels {
  /** Field label for a section's name. */
  sectionName: string;
  /** Field label for the arrangement selector. */
  sectionMode: string;
  /** One name per arrangement, keyed by mode. */
  modes: Record<string, string>;
  /** Field label for the control choosing how many places across. */
  sectionSpaces: string;
  /**
   * Says what changing that number does, and what it does not do.
   *
   * The reassurance is the point: somebody narrowing a section has to know
   * before they do it that nothing in it is removed — see {@link BlockCard}
   * for why that is true rather than merely promised.
   */
  sectionSpacesHint: string;
  /** Removes this whole section. */
  removeSection: string;
  /** Collapses the section's places. */
  collapse: string;
  /** Expands them again. */
  expand: string;
  /** Names a section's drag handle. */
  dragSection: string;
  /** Puts a piece of content in an empty place. */
  addContent: string;
  /** Puts a section inside an empty place. */
  addNested: string;
  /** Says why an empty place offers no section of its own. */
  nestingAtLimit: string;
  /** Names the control that takes an empty place away. */
  removePlace: string;
  /** Adds one more empty place. */
  addPlace: string;
  /** Heading above the live preview. */
  previewTitle: string;
  /** The paintbrush popup's own strings, nested to avoid a `title` collision. */
  style: SectionStylePopupLabels;
}

/**
 * What {@link BlockCard} needs.
 *
 * `problems` is the newest, and it is passed whole rather than filtered per
 * card: a container has to know about refusals BELOW it as well as on it, so
 * that a collapsed card holding one opens itself.
 */
export interface BlockCardProps {
  /** The container being edited, as the form is holding it. */
  block: ContainerBlock;
  /** Where it sits, which is how every edit names it. */
  path: BlockPath;
  /** Applies an edit to the whole page — see `BlockEditor`. */
  apply: (edit: (blocks: Block[]) => Block[]) => void;
  /** Which language's fields to bind to. */
  lang: AuthoringLanguage;
  /** Already-translated strings. */
  labels: BlockCardLabels;
  /** This deployment's own hostname, threaded to the preview for Twitch. */
  parentHost: string;
  /**
   * Whether the page is already holding as many blocks as it may.
   *
   * Passed down rather than recomputed here, so one walk of the tree answers
   * it for every card — and so every add control in the editor withdraws at
   * the same moment, which is the number `blocksSchema` and `validate_block`
   * both enforce.
   */
  atBlockLimit: boolean;
  /**
   * What the save schema refused, and where.
   *
   * Two things read it: a card holding a refusal shows its places whatever its
   * collapse control says, and the leaf that is wrong marks the field. Passed
   * whole rather than filtered per card, because a container has to know about
   * refusals BELOW it as well as on it.
   */
  problems: readonly BlockProblem[];
  /**
   * The drag library's own props for a section's handle.
   *
   * Absent for a container nested inside one: dragging is phase 4, on
   * `@dnd-kit`, and `@hello-pangea/dnd` cannot express a nested drag at all —
   * its own README rules out dragging between a parent and a child list.
   */
  dragHandleProps?: DraggableProvidedDragHandleProps | null;
}

/**
 * The test ids a card exposes, which differ for a section and for a container
 * nested inside one.
 *
 * **Two sets rather than one, because the end-to-end suite COUNTS sections.**
 * A nested container carrying `section-card` would make every count in that
 * suite ambiguous the first time somebody nested one — the same reason
 * `blocks.tsx` marks `public-section` at depth 0 only.
 *
 * @param depth - how far the card sits from the top of the page.
 * @returns the ids for that depth.
 */
function idsFor(depth: number) {
  return depth === 0
    ? {
        card: "section-card",
        face: "section-card-face",
        header: "section-header",
        name: "section-name",
        mode: "section-mode",
        spaces: "section-spaces",
        collapse: "collapse-section",
        remove: "remove-section",
      }
    : {
        card: "nested-card",
        face: "nested-card-face",
        header: "nested-header",
        name: "nested-name",
        mode: "nested-mode",
        spaces: "nested-spaces",
        collapse: "collapse-nested",
        remove: "remove-block",
      };
}

/**
 * How many places the editor lays across, by the container's own space count.
 *
 * **The editor shows the shape rather than describing it**, so a person
 * choosing four places sees four. It is a `Map` for the reason every lookup in
 * this feature keyed by a stored value is: `spaces` arrives from `jsonb`, and
 * a plain object indexed by one answers `__proto__` with an inherited truthy
 * value.
 *
 * **Container queries, not viewport ones, and the correction is worth reading
 * rather than assuming.** These were `sm:`-prefixed, justified on the argument
 * that the editor's own chrome is app furniture sitting in the page's own
 * column rather than content adapting to a place somebody put it in. That is
 * true of a SECTION and false of everything below one: a nested card renders
 * inside a track of its parent card's own grid, so a six-place card in one of
 * six parent tracks laid six columns in roughly a sixth of the editor's width
 * at any viewport past `sm` — verbatim the mistake Task 4 exists to remove,
 * one level down, in the file explaining why it is not a mistake here.
 * {@link BlockCard}'s root declares `@container`, so each of these asks how
 * much room ITS OWN card has.
 *
 * **The thresholds are wider than the renderer's**, and deliberately: a place
 * here holds a whole editing form — a kind menu, a bilingual title, a
 * textarea — where a place on the public page holds a rendered card. Each is
 * set so a place clears roughly 220px before it is laid at all. One place
 * declares nothing, because a single column is the base every container
 * carries.
 */
const PLACES_CLASS = new Map<number, string>([
  [1, ""],
  [2, "@md:grid-cols-2"],
  [3, "@2xl:grid-cols-3"],
  [4, "@4xl:grid-cols-4"],
  [5, "@6xl:grid-cols-5"],
  [6, "@7xl:grid-cols-6"],
]);

/**
 * One container: its name, its arrangement, its shape, and what is in each of
 * its places.
 *
 * **A section is a container at depth 0 that carries a name, so this is one
 * component and not two.** A container nested inside another gets the same
 * controls, minus a drag handle it has no library to be dragged by, and its
 * removal empties the place it sat in rather than taking the place away.
 *
 * **Narrowing the shape cannot destroy anything, and that is the model rather
 * than a rescue.** `spaces` is how many places a container lays ACROSS;
 * children fill them row by row and the section grows downward. So a six-space
 * section holding six things, narrowed to two, re-wraps into three rows with
 * all six still there and still in order. Nothing here writes `children` when
 * `spaces` changes — see `patchContainer`, which cannot — and the hint under
 * the control says so, because somebody about to narrow a section has to know
 * before they do it rather than afterwards.
 *
 * **An empty place is drawn, and drawn as an invitation.** It keeps its width,
 * carries a dashed edge — this app's own "nothing here yet" — and offers the
 * two things that can go in it. Collapsing empty places would make a space
 * count meaningless the moment a section were partly filled, and the shape
 * somebody chose would change under them as they worked.
 *
 * **A place at the depth cap offers content and no section**, with a sentence
 * saying why. Offering one and then refusing the save is the fault class this
 * repo already paid for once, when a missing `nuqs` adapter was reported as
 * "we could not load your identity" — `mayNest` is the courtesy in front of
 * `validate_block`, which stays the authority.
 *
 * **The preview is the REAL renderer, not a drawing of it.** `Block` from
 * `blocks.tsx` is what a stranger's page is built from, handed the same tree
 * the save will send, parsed by the same lenient schema the read uses. A
 * second implementation would have looked identical the day it was written and
 * drifted the first time either changed, with no type error and no failing
 * test — which is exactly the argument that already has the live style preview
 * calling `blockStyle` rather than a copy of it.
 *
 * **The skin's custom properties land on the root and the painted face is a
 * LAYER inside it.** `cutout` sets `clip-path`, which clips its element's whole
 * subtree — positioned descendants at any `z-index` included — and the style
 * popup renders inside this card, so a surface on the root cut the popup away
 * the moment somebody chose that skin. A layer is a leaf with nothing to clip,
 * and it holds for whatever token does this next rather than for that one skin.
 *
 * **The rows above that face paint their own `bg-(--surface)`**, which is what
 * keeps the editor readable over a background picture: the face shows the
 * picture at full strength deliberately, and over a mid-grey `--ink` measures
 * 3.87:1 against the 4.5:1 text needs. The public page stays readable for the
 * same reason — its cards paint a surface and the picture reads between them.
 *
 * Collapsing hides the places and keeps the header, so a page with several
 * long sections stays navigable. It is local state rather than form state: it
 * is about looking, not about content, and it must not make the form dirty.
 *
 * **A card holding a refusal shows its places whatever that control says.**
 * The control is about looking; this is about being able to look at all. A
 * refusal three levels down inside a collapsed section is one somebody cannot
 * see, let alone act on, while the banner tells them it is marked.
 *
 * **The places grid is a CONTAINER query**, not a viewport one — see
 * {@link PLACES_CLASS} for the correction and why the argument that justified
 * a viewport query was true of a section and false of everything below one.
 *
 * **A refusal on the container's OWN fields is marked here**, both the name it
 * draws and the existence of anything else. It marked nothing until this, so a
 * save refused for an unknown `mode`, a `spaces` outside the vocabulary, an
 * over-long name or a style address past its cap raised a banner saying "what
 * needs fixing is marked below" over a page carrying no mark at all — and the
 * sentence it raised blamed a missing title, which was not the cause. Which
 * refusals reach a container rather than a leaf was settled by running zod
 * against its own issue paths rather than by reasoning about them.
 *
 * **`add-place` is not withdrawn at the block cap, and the two invitations
 * inside an empty place are.** An empty place is not a block: `countBlocks`
 * excludes them and `validate_block` counts them toward nothing, so adding one
 * at the cap is legal on both sides. A control withdrawn at a number that is
 * not its own is the same fault as one that silently does nothing, wearing an
 * alibi.
 *
 * **It carries test ids**, because the end-to-end suite runs in Spanish and may
 * not assert on translated text — so a control without one cannot be reached by
 * the only tests that drive a real browser.
 *
 * Its selects are painted with `--menu`, not left transparent: a dropdown's
 * list is drawn from the control's own background, and a transparent one is
 * painted on white. `dropdown-legibility.test.ts` guards every select in the
 * app.
 *
 * @returns the container's card.
 */
export function BlockCard({
  block,
  path,
  apply,
  lang,
  labels,
  parentHost,
  atBlockLimit,
  problems,
  dragHandleProps,
}: BlockCardProps) {
  const id = useId();
  const [hidden, setHidden] = useState(false);
  // **A card holding a refusal shows its places whatever its collapse control
  // says.** The control is about looking; this is about being able to look at
  // all. A block three levels down inside a collapsed section is a refusal
  // somebody cannot see, let alone act on — and the banner would be telling
  // them it is marked.
  const collapsed = hidden && !problemUnder(problems, path);
  const depth = path.length - 1;
  const ids = idsFor(depth);
  const known = (CONTAINER_MODES as readonly string[]).includes(block.mode);
  // **What the save refused ON THIS CONTAINER, and it has to be shown here or
  // nowhere.** `LeafEditor` marks a refused leaf; this component marked
  // nothing at all, so a refusal on a container's own field — an unknown
  // `mode` or `spaces` after a rollback, a name or a background address past
  // its cap — produced a banner reading "what needs fixing is marked below"
  // over a page with no mark on it, naming a cause (a missing title) that was
  // not the one. Both halves are marked for the same reason the leaf marks
  // both: the field this component draws, and the existence of anything else.
  const wrong = new Set(problemFields(problems, path));
  const nameWrong = wrong.has("name_en") || wrong.has("name_es");
  const otherWrong = [...wrong].some((field) => !field.startsWith("name_"));

  // **What INHERITS goes on the root; what is PAINTED goes on the face.**
  // Split by what a property DOES rather than by naming keys: a custom
  // property is inherited by definition and a painted one is not, so anything
  // `blockStyle` grows later lands on the right element without this having to
  // be told about it. See the face's own comment for what each half is for.
  const chosen = blockStyle(block.style);
  const inherited: Record<string, unknown> = {};
  const painted: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(chosen ?? {})) {
    if (name.startsWith("--")) inherited[name] = value;
    else painted[name] = value;
  }
  // `undefined` rather than an empty object on both, so a block nobody has
  // styled still renders with no `style` attribute at all.
  const rootStyle =
    Object.keys(inherited).length > 0
      ? (inherited as React.CSSProperties)
      : undefined;
  const faceStyle =
    Object.keys(painted).length > 0
      ? (painted as React.CSSProperties)
      : undefined;

  const across = PLACES_CLASS.get(block.spaces) ?? "";
  // Position named once, exactly as `seatsOf` does it in the renderer and for
  // the same reason: a place has no identity but where it sits, and
  // `react/no-array-index-key` reads the map callback's index parameter.
  const places = block.children.map((child, position) => ({
    child,
    key: `place-${position}`,
    path: [...path, position],
  }));
  // **Not gated on the block cap, because an empty place is not a block.**
  // `countBlocks` excludes them and `validate_block` counts them toward
  // nothing, so adding one at the cap is legal on both sides — and a control
  // withdrawn at a number that is not its own is the same fault as one that
  // silently does nothing, wearing an alibi.
  const canAddPlace = block.children.length < BLOCK_LIMITS.children;

  return (
    // **The root's own padding is not responsive, and cannot be.** An element
    // is never its own query container: `@container` here establishes the
    // context its DESCENDANTS ask, so an `@`-prefixed rule on this element
    // would ask whatever encloses the card — nothing at all for a section, and
    // the PARENT card's full width for a nested one, which is the same
    // wrong-box answer a viewport rule gives. Four pixels of padding is not
    // worth a wrapper element in a DOM this spec asks to shrink, so the dial
    // goes rather than lying. Everything below this element queries it
    // correctly.
    <div
      {...tid(ids.card)}
      style={rootStyle}
      className="@container relative grid gap-3 p-3"
    >
      {/* The card's own painted face, as a layer rather than as this element —
          `clip-path` clips a whole subtree, and the style popup is one. */}
      <div
        aria-hidden
        {...tid(ids.face)}
        style={faceStyle}
        className="pointer-events-none absolute inset-0 rounded-xl surface border-(--edge) bg-(--surface)"
      />

      {/* Wraps, and the selects are what wrap. A `select` is as wide as its
          longest option whatever surrounds it, so on a 320px screen the header
          would otherwise force the page wider than the phone. The menus take a
          line of their own below and rejoin the row as soon as there is room.

          It paints `bg-(--surface)`, like the public page's cards, so the
          controls stay readable over a section's own background picture. The
          `p-1 -m-1` pair gives the labels a little ground without moving the
          content, and it has to stay within the card's own padding. */}
      <div
        {...tid(ids.header)}
        className="relative -m-1 flex flex-wrap items-end gap-2 rounded-lg bg-(--surface) p-1 @xl:gap-3"
      >
        {dragHandleProps === undefined ? null : (
          <button
            type="button"
            aria-label={labels.dragSection}
            {...tid("drag-section")}
            {...(dragHandleProps ?? {})}
            className="cursor-grab rounded-lg p-1.5 text-(--muted)"
          >
            <GripVertical className="size-4" />
          </button>
        )}

        <button
          type="button"
          aria-label={collapsed ? labels.expand : labels.collapse}
          {...tid(ids.collapse)}
          onClick={() => setHidden((was) => !was)}
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
            {...tid(ids.name)}
            id={`${id}-name`}
            key={`name-${lang}`}
            aria-invalid={nameWrong}
            aria-describedby={nameWrong ? `${id}-name-problem` : undefined}
            value={(lang === "en" ? block.name_en : block.name_es) ?? ""}
            onChange={(event) =>
              apply((blocks) =>
                patchContainer(
                  blocks,
                  path,
                  lang === "en"
                    ? { name_en: event.target.value }
                    : { name_es: event.target.value || undefined },
                ),
              )
            }
            className="rounded-lg surface border-(--edge)/60 bg-(--surface) px-3 py-1.5 text-sm"
          />
          {/* `aria-invalid` alone satisfies the letter of the rule and tells
              nobody what to do about it; the sentence is what does. */}
          {nameWrong ? (
            <p
              id={`${id}-name-problem`}
              {...tid("section-name-problem")}
              className="text-xs text-(--accent)"
            >
              {labels.problemGeneric}
            </p>
          ) : null}
        </div>

        <div className="order-last grid w-full min-w-0 gap-1.5 @xl:order-0 @xl:w-auto">
          <label htmlFor={`${id}-mode`} className="text-xs font-medium">
            {labels.sectionMode}
          </label>
          <select
            id={`${id}-mode`}
            {...tid(ids.mode)}
            value={block.mode}
            onChange={(event) =>
              apply((blocks) =>
                patchContainer(blocks, path, {
                  mode: event.target.value as ContainerMode,
                }),
              )
            }
            className="rounded-lg surface border-(--edge)/60 bg-(--menu) px-3 py-1.5 text-sm"
          >
            {/* An arrangement this build has no name for still has to be
                shown, or the select would render blank and the first change
                would silently rearrange somebody's section. **The SAVE is
                refused while it is there**, exactly as it is for an unknown
                leaf kind — `blocksSchema` takes `z.enum(CONTAINER_MODES)` and
                has no fallback, because on the write an unrecognised mode is a
                typo and the save is the last moment to catch one. Choosing a
                known arrangement is the way out, and it changes only this
                container. */}
            {known ? null : (
              <option value={block.mode} disabled>
                {block.mode}
              </option>
            )}
            {CONTAINER_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {labels.modes[mode]}
              </option>
            ))}
          </select>
        </div>

        <div className="order-last grid w-full min-w-0 gap-1.5 @xl:order-0 @xl:w-auto">
          <label htmlFor={`${id}-spaces`} className="text-xs font-medium">
            {labels.sectionSpaces}
          </label>
          <select
            id={`${id}-spaces`}
            {...tid(ids.spaces)}
            value={String(block.spaces)}
            aria-describedby={`${id}-spaces-hint`}
            onChange={(event) =>
              apply((blocks) =>
                patchContainer(blocks, path, {
                  spaces: Number(event.target.value),
                }),
              )
            }
            className="rounded-lg surface border-(--edge)/60 bg-(--menu) px-3 py-1.5 text-sm"
          >
            {SPACE_CHOICES.map((count) => (
              <option key={count} value={count}>
                {count}
              </option>
            ))}
          </select>
        </div>

        <SectionStylePopup
          value={block.style}
          onChange={(style) =>
            apply((blocks) => patchContainer(blocks, path, { style }))
          }
          labels={labels.style}
        />

        <button
          type="button"
          aria-label={labels.removeSection}
          {...tid(ids.remove)}
          onClick={() =>
            apply((blocks) =>
              depth === 0 ? removeAt(blocks, path) : clearAt(blocks, path),
            )
          }
          className="rounded-lg p-1.5 text-(--muted)"
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      {/* A refusal on a field this card does not draw — an arrangement or a
          width from a newer deployment, a style address past its cap. Without
          it the banner would promise a marking nothing made, which is the
          fault the whole `problems` thread exists to end. */}
      {otherWrong ? (
        <p
          {...tid("section-problem")}
          className="relative text-xs text-(--accent)"
        >
          {labels.problemGeneric}
        </p>
      ) : null}

      {/* The hint sits under the header rather than beside the control, so it
          is on one line at every width — the row above already wraps. */}
      <p
        id={`${id}-spaces-hint`}
        className="relative text-xs text-(--muted)"
        {...tid("spaces-hint")}
      >
        {labels.sectionSpacesHint}
      </p>

      {collapsed ? null : (
        <div className="relative grid gap-3">
          <div
            className={`grid grid-cols-1 gap-3 ${across}`}
            {...tid("places")}
          >
            {places.map((place) => (
              <Place
                key={place.key}
                child={place.child}
                path={place.path}
                apply={apply}
                lang={lang}
                labels={labels}
                parentHost={parentHost}
                atBlockLimit={atBlockLimit}
                problems={problems}
              />
            ))}
          </div>

          {canAddPlace ? (
            <button
              type="button"
              {...tid("add-place")}
              onClick={() => apply((blocks) => appendPlace(blocks, path))}
              className="flex w-fit items-center gap-1.5 rounded-lg surface border-(--edge)/60 bg-(--surface) px-3 py-1.5 text-sm text-(--muted)"
            >
              <Plus className="size-4" />
              {labels.addPlace}
            </button>
          ) : null}
        </div>
      )}

      {depth === 0 ? (
        <div className="relative grid gap-1.5" {...tid("block-preview")}>
          <span className="text-xs font-medium text-(--muted)">
            {labels.previewTitle}
          </span>
          <Preview
            block={block}
            previewPath={`preview-${path[0]}`}
            lang={lang}
            parentHost={parentHost}
          />
        </div>
      ) : null}
    </div>
  );
}

/** What {@link Place} needs. */
interface PlaceProps {
  /** What is in the place, or nothing. */
  child: Block | null;
  /** Where the place sits. */
  path: BlockPath;
  /** Applies an edit to the whole page. */
  apply: (edit: (blocks: Block[]) => Block[]) => void;
  /** Which language's fields to bind to. */
  lang: AuthoringLanguage;
  /** Already-translated strings. */
  labels: BlockCardLabels;
  /** Threaded to the preview. */
  parentHost: string;
  /** Whether the page is already holding as many blocks as it may. */
  atBlockLimit: boolean;
  /** What the save schema refused, and where. */
  problems: readonly BlockProblem[];
}

/**
 * One place of a container: what is in it, or the invitation to fill it.
 *
 * @returns the place.
 */
function Place({
  child,
  path,
  apply,
  lang,
  labels,
  parentHost,
  atBlockLimit,
  problems,
}: PlaceProps): ReactNode {
  if (child && isContainer(child)) {
    return (
      <BlockCard
        block={child}
        path={path}
        apply={apply}
        lang={lang}
        labels={labels}
        parentHost={parentHost}
        atBlockLimit={atBlockLimit}
        problems={problems}
      />
    );
  }
  if (child) {
    return (
      <LeafEditor
        leaf={child}
        path={path}
        apply={apply}
        lang={lang}
        labels={labels}
        problems={problems}
      />
    );
  }
  return (
    <div
      {...tid("empty-place")}
      className="flex flex-wrap items-center justify-center gap-1.5 rounded-lg surface border-dashed border-(--edge)/60 bg-(--surface) p-3"
    >
      {atBlockLimit ? null : (
        <button
          type="button"
          {...tid("add-content")}
          onClick={() =>
            apply((blocks) => setAt(blocks, path, newLeaf("text")))
          }
          className="flex items-center gap-1.5 rounded-lg surface border-(--edge)/60 px-3 py-1.5 text-sm text-(--muted)"
        >
          <Plus className="size-4" />
          {labels.addContent}
        </button>
      )}
      {atBlockLimit || !mayNest(path) ? null : (
        <button
          type="button"
          {...tid("add-nested")}
          onClick={() =>
            apply((blocks) => setAt(blocks, path, newContainer("grid", 2)))
          }
          className="flex items-center gap-1.5 rounded-lg surface border-(--edge)/60 px-3 py-1.5 text-sm text-(--muted)"
        >
          <Layers className="size-4" />
          {labels.addNested}
        </button>
      )}
      {mayNest(path) ? null : (
        <span className="text-xs text-(--muted)" {...tid("nesting-at-limit")}>
          {labels.nestingAtLimit}
        </span>
      )}
      <button
        type="button"
        aria-label={labels.removePlace}
        {...tid("remove-place")}
        onClick={() => apply((blocks) => removeAt(blocks, path))}
        className="rounded-lg p-1.5 text-(--muted)"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

/**
 * One section as a stranger will see it, drawn by the renderer that will draw
 * it.
 *
 * **Nothing here is a second implementation of anything.** The tree is parsed
 * by `lenientBlockSchema` — the schema the READ path uses, so the preview
 * tolerates exactly what a stored page tolerates — and handed to `Block`,
 * which is what both public pages are built from. A preview that could drift
 * from the page is worse than none.
 *
 * It is parsed rather than passed straight through because the editor's tree
 * is mid-edit: an untitled leaf and an unwritten Spanish half are ordinary
 * states here, and the lenient schema is the one that accepts them. A tree it
 * cannot read at all draws nothing rather than throwing, which keeps a
 * malformed block from taking the whole editor down with it.
 *
 * `locale` is the AUTHORING language, not the app's: the preview has to show
 * the half somebody is writing, or switching to Spanish would show them the
 * English they are not editing.
 *
 * `previewPath` carries the SECTION's own position, because `path` is what
 * every `id` and every radio group inside the tree is built from — two
 * previews sharing one would give a `tabs` section in each the same group
 * name, so choosing a tab in one would switch the other.
 *
 * **It mounts third-party frames while somebody is EDITING, and that is a
 * decision rather than an oversight.** A page with a `player` or a `post` on
 * it loads YouTube, Instagram, Telegram or Mixcloud here, where the editor
 * previously made no third-party request at all; so an author's own address
 * and the fact that they are editing this page reach those providers, not only
 * their visitors'. It is kept, because the alternative is a preview that draws
 * embeds differently from the page — a second implementation, which is the one
 * thing this component exists to refuse — and because an embed is precisely
 * what somebody needs to SEE working before they publish it. Nothing is
 * widened by it: the same allowlist parses the address, the same rebuilt
 * `src` is what loads, and no provider reaches the editor that could not
 * already reach the page. The cost is unmeasured as well as accepted — the
 * dial budget's fixture deliberately holds no embedding kind, so what a frame
 * costs the editor is outside every number this repository has taken.
 *
 * @returns the rendered section, or nothing when it cannot be read.
 */
function Preview({
  block,
  previewPath,
  lang,
  parentHost,
}: {
  block: ContainerBlock;
  previewPath: string;
  lang: AuthoringLanguage;
  parentHost: string;
}): ReactNode {
  const parsed = lenientBlockSchema.safeParse(block);
  if (!parsed.success) return null;
  return (
    <BlockView
      block={parsed.data}
      locale={lang}
      depth={0}
      path={previewPath}
      parentHost={parentHost}
    />
  );
}
