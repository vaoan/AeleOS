"use client";

import { ChevronDown, ChevronRight, Plus, Trash2, X } from "lucide-react";
import { removalLocked } from "@/features/actors/domain/required-blocks";
import { useId, useState, type ReactNode } from "react";
import {
  BLOCK_LIMITS,
  CONTAINER_MODES,
  isContainer,
  type Block,
  type ContainerBlock,
  type ContainerMode,
  type LeafKind,
} from "@/features/actors/domain/block-schema";
import {
  addToPlace,
  appendPlace,
  clearAt,
  newContainer,
  patchContainer,
  removeAt,
  setSpaces,
  SPACE_CHOICES,
  type BlockPath,
} from "@/features/actors/domain/block-edits";
import {
  problemFields,
  problemUnder,
  type BlockProblem,
} from "@/features/actors/domain/block-problems";
import type { AuthoringLanguage } from "@/features/actors/application/use-language-toggle";
import { BlockSlot } from "@/features/actors/presentation/block-slot";
import {
  LeafEditor,
  type LeafEditorLabels,
} from "@/features/actors/presentation/leaf-editor";
import { SECTION_SHAPES } from "@/features/actors/presentation/section-shapes";
import {
  SectionStylePopup,
  type SectionStylePopupLabels,
} from "@/features/actors/presentation/section-style-popup";
import { styleGatesFor } from "@/features/actors/presentation/block-contract";
import { tid } from "@/shared/infrastructure/test-id";
import {
  CardKind,
  ContainerRail,
} from "@/features/actors/presentation/card-kind";
import { CHROME_SCOPE } from "@/shared/domain/chrome";

/**
 * Already-translated strings a card renders.
 *
 * **What it renders ITSELF, plus one bag it forwards.** It no longer extends
 * `LeafEditorLabels`; `leaf` holds those, so this interface names only the
 * card's own vocabulary.
 *
 * `removeLocked` is the newest and explains a WITHDRAWN control rather than
 * naming an action — a disabled bin with no reason is one somebody presses
 * twice and then gives up on.
 *
 * `sectionEyebrow` is the noun the card wears, and it is not `sectionName`:
 * one says what the card IS, the other labels the field naming this particular
 * one. Letting a single string do both is how the noun ended up invisible in a
 * row of identically-set field labels.
 *
 * This bag deliberately has no preview heading: a card renders controls only.
 * `BlockEditorLabels` owns the title for the sibling `SectionPreviewTray`.
 */
export interface BlockCardLabels {
  /**
   * What a leaf editor needs, forwarded to every leaf this card renders.
   *
   * **Held rather than inherited (2026-08-27).** This interface used to
   * `extends LeafEditorLabels`, which made a card's bag structurally a leaf's
   * bag — 21 strings a card cannot render, indistinguishable from the 22 it
   * can. Measured before the change: of 23 `labels.*` references in this file
   * exactly ONE reached a leaf string, and the other twenty were the card's
   * own; the rest of the relationship was pure forwarding wearing inheritance.
   * Naming the forward makes the card's own vocabulary the thing you see, and
   * a leaf string added tomorrow no longer widens this interface.
   */
  leaf: LeafEditorLabels;
  /**
   * The word naming this card a section, shown in its eyebrow.
   *
   * The same noun at every depth. A nested section IS a section, and giving
   * the nested case a name of its own would be a second thing to learn for a
   * difference the rail already draws.
   */
  sectionEyebrow: string;
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
  /**
   * Field label for the shape control, offered only for a `grid` container —
   * see {@link BlockCard} for why the other arrangements do not get one.
   */
  sectionShape: string;
  /** One name per {@link SECTION_SHAPES} entry, keyed by its `id`. */
  shapes: Record<string, string>;
  /**
   * The option shown, and picked, when the current `spaces`/`weights` pair
   * matches no listed {@link SECTION_SHAPES} entry. Never itself choosable —
   * it names the state rather than offering it, exactly as an arrangement
   * this build does not know does for `sectionMode`.
   */
  sectionShapeCustom: string;
  /**
   * One place's own dial label, keyed by its one-based position.
   *
   * A precomputed record, like `modes` and `leafKinds`, rather than a
   * function — **labels cross a server/client boundary**: `fursonaEditorLabels`
   * runs on the server and hands its result to `FursonaEditor`, a client
   * component, as props. React can serialise a plain object across that
   * boundary but not a function, so a function here breaks the WHOLE editor
   * page at runtime — "Functions cannot be passed directly to Client
   * Components" — rather than merely mis-rendering one control. Keyed 1
   * through {@link SPACE_CHOICES}'s widest entry, which covers every place a
   * container may ever lay.
   */
  sectionWeight: Record<number, string>;
  /** Says what the per-place shares do, and that they even out when there is
   * little room. */
  sectionWeightsHint: string;
  /** Removes this whole section. */
  removeSection: string;
  /**
   * Why the remove control is withdrawn.
   *
   * Shown as the button's title when this block holds the last copy of a kind
   * the page must carry. A disabled control with no explanation is a control
   * somebody presses twice and then gives up on.
   */
  removeLocked: string;
  /** Collapses the section's places. */
  collapse: string;
  /** Expands them again. */
  expand: string;
  /**
   * Names the grip on a block sitting in a place.
   *
   * A section's own grip is named by `BlockEditorLabels.dragSection`, because
   * the two are different things to somebody who cannot see them: one moves a
   * whole section among the sections, the other moves one piece of a page
   * between places.
   */
  dragBlock: string;
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
  /** The paintbrush popup's own strings, nested to avoid a `title` collision. */
  style: SectionStylePopupLabels;
}

/**
 * What {@link BlockCard} needs.
 *
 * `problems` is passed whole rather than filtered per card: a container has to
 * know about refusals BELOW it as well as on it, so that a collapsed card
 * holding one opens itself.
 *
 * `dragHandle` is `null` from the Properties panel's Layout tab
 * (2026-09-04): a sibling drag is driven from the canvas's own accessible
 * grip on the selected block (see `EditableBlockFrame`), not from a second
 * grip inside the panel. `showChildren=false` accompanies it, so the
 * selected container keeps its existing controls without mounting a second
 * copy of its descendants.
 *
 * **Two of these are facts about the WHOLE page, threaded down rather than
 * recomputed per card**: `atBlockLimit` and `locked`. One walk in
 * `BlockEditor` answers both, which is what makes every control in the editor
 * change state at the same moment rather than card by card.
 *
 * **`kinds` joins them (2026-08-27), and this card never reads it.** It is
 * `offerableLeafKinds(page.actorKind)`, computed once in `BlockEditor` and
 * threaded through every nested card so a leaf at any depth gets the same
 * narrowed list — see `LeafEditorProps.kinds` for what it prevents.
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
   * The required kinds this page holds exactly one of.
   *
   * Removing the last copy would leave a page that cannot be saved, so the
   * control is withdrawn rather than letting somebody find out at the save.
   * Computed once over the whole tree — see `lockedKinds`.
   */
  locked: ReadonlySet<string>;
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
   * The grip that lifts this card, already wired.
   *
   * An element rather than a bag of props, because the four things a drag
   * needs belong in one component — see `BlockSlot`, which is the only place
   * in the editor that spreads them. The card decides only where in its header
   * the grip sits.
   */
  dragHandle: ReactNode;
  /**
   * The leaf kinds this page may hold, already narrowed to its actor kind.
   *
   * Passed straight to `LeafEditor` — see its own note. `BlockCard` never
   * reads it.
   */
  kinds: readonly LeafKind[];
  /**
   * Whether to mount immediate places and their descendant editors.
   *
   * The Properties panel's Layout tab (2026-09-04) passes `false` so one
   * selected container's controls never mount the subtree beneath it.
   * Standalone card tests default to the legacy complete card.
   */
  showChildren?: boolean;
  /**
   * Suppresses this card's own `SectionStylePopup` mount (2026-09-04).
   *
   * The Properties panel builds a container's Appearance tab from
   * `StyleFields` directly, fed the same `value`/`onChange`/`gates` this
   * card already computes for its own popup — so its production call site
   * passes `true` here to avoid mounting the identical fields twice, once
   * inline in Layout and once behind a paintbrush trigger nobody opens.
   * Defaults to `false` so every existing standalone test, which still
   * exercises the trigger-and-popup mount, is unaffected.
   */
  hideStylePopup?: boolean;
  /**
   * Suppresses this card's own {@link RemoveSectionButton} mount (2026-09-04).
   *
   * The Properties panel's foot carries one Delete for the whole selection,
   * gated by `removalLocked` exactly as this card's own button already is —
   * so its production call site passes `true` here rather than mounting a
   * second, redundant bin. Defaults to `false` so every existing standalone
   * test is unaffected.
   */
  hideRemove?: boolean;
  /** Runs after this container removes itself from the page. */
  onRemove?: () => void;
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
        header: "section-header",
        name: "section-name",
        mode: "section-mode",
        spaces: "section-spaces",
        shape: "section-shape",
        collapse: "collapse-section",
        remove: "remove-section",
      }
    : {
        card: "nested-card",
        header: "nested-header",
        name: "nested-name",
        mode: "nested-mode",
        spaces: "nested-spaces",
        shape: "nested-shape",
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
 * Whether two weight lists are the same list, absence included.
 *
 * Absence is its own value here and not merely "no answer": two containers
 * with no weights at all are the same shape, so this is `true` for
 * `undefined`/`undefined`, never for `undefined` beside an actual list — an
 * even container and a `[1, 1, 1]` one are two different rows even though
 * they render alike, exactly as {@link SECTION_SHAPES}'s own TSDoc explains.
 *
 * @param a - one list, or absent.
 * @param b - the other, or absent.
 * @returns whether they carry the same shares in the same order.
 */
function sameWeights(
  a: number[] | undefined,
  b: number[] | undefined,
): boolean {
  if (!a || !b) return a === b;
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/** What {@link RemoveSectionButton} needs. */
interface RemoveSectionButtonProps {
  /** Whether removing this block would leave the page incomplete. */
  locked: boolean;
  /** Which test id to expose; a section and a nested container differ. */
  testId: string;
  /** Already-translated strings. */
  labels: BlockCardLabels;
  /** What to do when it is pressed. */
  onRemove: () => void;
}

/**
 * The bin that removes a section, or clears a nested container's place.
 *
 * **Withdrawn when this subtree holds the last copy of a required kind.** A
 * container takes everything beneath it when it goes, so the case that matters
 * is not a portrait somebody is looking at — it is the SECTION their portrait
 * happens to sit in, which says nothing about identity on its face.
 *
 * Disabled rather than refused on click: a control that accepts a press and
 * does nothing is the failure this repository keeps catching. The title is
 * what says why, so the withdrawal is explained rather than merely enforced.
 *
 * Its own component because {@link BlockCard} is at the cognitive-complexity
 * ceiling, and a button with a reason to be disabled is a self-contained thing.
 *
 * @param props - see {@link RemoveSectionButtonProps}.
 * @returns the button.
 */
function RemoveSectionButton(props: RemoveSectionButtonProps): ReactNode {
  return (
    <button
      type="button"
      aria-label={props.labels.removeSection}
      {...tid(props.testId)}
      disabled={props.locked}
      title={props.locked ? props.labels.removeLocked : undefined}
      onClick={props.onRemove}
      className="rounded-lg p-1.5 text-(--muted) disabled:opacity-40"
    >
      <Trash2 className="size-4" />
    </button>
  );
}

/**
 * One container: its name, its arrangement, its shape, and what is in each of
 * its places.
 *
 * **A section is a container at depth 0 that carries a name, so this is one
 * component and not two.** A container nested inside another gets the same
 * controls, its own grip included — `@dnd-kit` expresses a drag between a
 * parent and a child, which is the whole reason it replaced the library that
 * could not — and its removal empties the place it sat in rather than taking
 * the place away.
 *
 * **Narrowing the shape cannot destroy anything, and that is the model rather
 * than a rescue.** `spaces` is how many places a container lays ACROSS;
 * children fill them row by row and the section grows downward. So a six-space
 * section holding six things, narrowed to two, re-wraps into three rows with
 * all six still there and still in order. Nothing here writes `children` when
 * `spaces` changes — see `setSpaces`, which cannot — and the hint under
 * the control says so, because somebody about to narrow a section has to know
 * before they do it rather than afterwards. **The spaces select routes
 * through `setSpaces` rather than `patchContainer`**, because the two are one
 * fact: a `weights` list whose length no longer matches `spaces` is ignored by
 * every reader, so writing the count alone would silently drop an author's
 * proportions the moment they touched the control.
 *
 * **The shape control offers only what a `grid` container can honour.**
 * `weights` lay grid TRACKS, so a `masonry` container — uniform by CSS
 * multi-column construction — and `stack`/`carousel`/`tabs`/`accordion`/
 * `timeline` — which lay no tracks across at all — get no shape select and no
 * per-place dials. This repo's own rule: a control that accepts what somebody
 * types, stores it, refuses nothing and renders nothing is the worst kind,
 * because there is no way for them to learn it did nothing. The database
 * keeps whatever weights a container already carries regardless of `mode`,
 * deliberately — switching to `carousel` to look and back to `grid` finds the
 * shares exactly as they were, so the gate is on the CONTROL, never on the
 * stored value.
 *
 * **Each per-place dial clamps its own value in `onChange`, to between 1 and
 * `BLOCK_LIMITS.weight`.** An emptied input is `Number("") === 0` and the
 * `max` attribute alone does not stop somebody typing past it, and either one
 * reaches `blocksSchema` as a share `sections[0].weights[N]` refuses — a path
 * ending in an array index that `blockProblems` cannot mark, so an unclamped
 * dial could save a payload that surfaces only as the page-level "holds more
 * than it can" banner with nothing pointing at the control responsible. The
 * clamp keeps that payload from ever leaving the control rather than leaving
 * it reachable and unmarked.
 *
 * **Picking a shape seeds a `stack` into every place that is currently
 * empty, and touches no place that already holds something.** A place holds
 * exactly one child, so a wide middle is unusable until its own place can
 * grow past one thing — the seeded `stack` is that growth, and once it is
 * there the ordinary `add-place` control on its own nested card widens it.
 * `addToPlace` (`block-edits.ts`) is what does the "empty takes it directly"
 * half; nothing here wraps or discards a place that was already filled,
 * because a shape is an ARRANGEMENT change and must never be a content one.
 * **The editor never removes a stack it made** — an emptied column renders as
 * an empty place, which is what an empty place already does, and it is
 * deleted the way any block is, by `clearAt`/`removeAt` like any other.
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
 * **The card itself paints opaque `--surface-solid`.** While the page
 * atmosphere is live in the editor, a translucent workbench card would put its
 * section heading over an arbitrary author field. Child surfaces may remain
 * translucent because this stable backing, not the document, is beneath them.
 *
 * **The remove control withdraws when a block holds the last copy of a kind
 * the page must carry.** `lockedKinds` is computed once over the whole tree
 * and threaded down, so every bin in the editor locks at the same moment —
 * the same reasoning `atBlockLimit` already follows.
 *
 *
 * **The style popup is handed `gates`, computed by `styleGatesFor` from this
 * block rather than worked out here field by field (2026-08-30).** Only a
 * section may reach the window's edges and only a NAMED block draws a bar, so
 * `styleGatesFor(block, depth === 0)` is what tells the popup so — the same
 * function `leaf-editor.tsx` calls from its own kind of block, which is what
 * let a leaf reach the same popup without a second component.
 *
 * **It says what it is, in a rail and in a word.** `ContainerRail` runs down
 * the inside edge once per container at every depth, so nesting is countable
 * rather than inferred, and `CardKind` names the card beside the name field's
 * own label. The padding stays a uniform `p-3` and the rail lives INSIDE it:
 * widening the left side to `pl-4` for a gutter cost 8px of the card's
 * min-content width — 4px per nesting level — which is a card, not a decoration,
 * and it pushed the editor sideways on a narrow screen.
 *
 * **Its label bag HOLDS a leaf's rather than inheriting it (2026-08-27).**
 * `labels.leaf` is what every leaf this card renders is handed; everything
 * else on the bag is a string this card draws itself. See
 * {@link BlockCardLabels.leaf}.
 *
 * **It forwards `kinds` and reads none of it (2026-08-27).** When
 * `showChildren` is true, the prop passes straight through to every
 * `LeafEditor` this card renders. The Properties panel's Layout tab
 * (2026-09-04) sets that flag false and renders only this container's
 * controls.
 *
 * **The root now carries `CHROME_SCOPE` (2026-09-02), and its own background
 * moved off `--surface-solid` onto the genuinely opaque `--menu`.** This card
 * is the Properties panel's own editing form — its production caller always
 * passes `showChildren={false}`, so nothing skin-scoped ever renders inside
 * it — but
 * every label, hint, input and select in it used to read `--ink`/`--muted`
 * from the author's own page palette while sitting on a background whose
 * 90%-alpha COMPOUNDS with every level of nesting. A real `a11y.spec.ts` run
 * caught 15 `color-contrast` failures on a nested card sharing the page's
 * own bled-through colour as both its measured foreground and background.
 *
 * @returns the container's card.
 */
export function BlockCard({
  block,
  path,
  apply,
  lang,
  labels,
  atBlockLimit,
  locked,
  problems,
  dragHandle,
  kinds,
  showChildren = true,
  hideStylePopup = false,
  hideRemove = false,
  onRemove,
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

  // The shape whose `spaces`/`weights` pair matches this container exactly,
  // so the select can show what is actually stored rather than guessing —
  // and `undefined` when nothing matches, which is what makes the trailing
  // "Custom" option honest rather than a default nobody chose.
  const matchingShape = SECTION_SHAPES.find(
    (shape) =>
      shape.spaces === block.spaces &&
      sameWeights(shape.weights, block.weights),
  );
  // What every dial actually shows: the container's own weights where it has
  // some, and an even share of `1` per place otherwise — "even" is a real
  // answer here, not a gap, and typing into one dial has to start from
  // something.
  const weights =
    block.weights ?? Array.from({ length: block.spaces }, () => 1);
  // Position named once, exactly as `places` does it just below, and for the
  // same reason: `react/no-array-index-key` reads the map callback's own
  // index parameter, not a value derived from it further down.
  const weightFields = weights.map((weight, at) => ({
    weight,
    at,
    key: `weight-${at}`,
  }));

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

  // Asked once and read twice — the disabled state and the reason it gives.
  const cannotRemove = removalLocked(block, locked);

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
      // **`CHROME_SCOPE`, added 2026-09-02.** This card is the INSPECTOR's
      // own editing form for a container — its production call site always
      // passes `showChildren={false}` (`SelectedOptions` in
      // `block-editor.tsx`), so nothing skin-scoped ever renders inside it;
      // the actual page a stranger sees is `blocks.tsx`'s renderer, reached
      // through the separate preview tray. Every label, hint, input and
      // select here previously read `--ink`/`--muted` from whatever
      // enclosing scope happened to supply them — the author's own page
      // theme, since nothing broke the cascade — while this element's own
      // background is `--surface-solid`, which `.aeleos-chrome` fixes to an
      // always-legible pair. A real `a11y.spec.ts` scan caught the mismatch
      // on its first run reaching a NESTED card: 15 elements failing
      // `color-contrast` at once, all sharing the same fixed background and
      // a page-derived ink `.aeleos-chrome` never promised was legible
      // against it. `CHROME_SCOPE` re-declares both ends of that pairing on
      // this element, which is what makes them agree again.
      // **`bg-(--menu)`, not `bg-(--surface-solid)` (2026-09-02).**
      // `--surface-solid` carries a 90%-alpha channel — legitimate for
      // author CONTENT, which composes over a picture, but a hazard for a
      // CHROME_SCOPE'd editing card: a nested container's own card sits
      // inside its parent's, so the translucency COMPOUNDS with depth
      // (0.9×0.9 for two levels), letting more of the page's own background
      // bleed through than `check:contrast`'s single-layer approximation
      // ever accounts for. Measured directly: a nested card's own background
      // sampled `rgb(222,192,182)` — a warm tan the page's own gradient
      // supplies — not the near-white `check:contrast` assumes, and
      // `--muted` on it read 3.59:1 against the 4.5:1 floor. `--menu` is
      // fully opaque already (`globals.css` says so in its own words: "it
      // must be OPAQUE"), so every card at every depth paints a solid floor
      // under whatever nests inside it, and nesting stops compounding
      // anything.
      className={`${CHROME_SCOPE} @container relative grid gap-3 rounded-xl surface border-(--edge) bg-(--menu) p-3`}
    >
      <ContainerRail />

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
        {dragHandle}

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
          <div className="flex flex-wrap items-center gap-2">
            <CardKind kind="container">{labels.sectionEyebrow}</CardKind>
            <label htmlFor={`${id}-name`} className="text-xs font-medium">
              {labels.sectionName}
            </label>
          </div>
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
              {labels.leaf.problemGeneric}
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
                setSpaces(blocks, path, Number(event.target.value)),
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

        {block.mode === "grid" ? (
          <div className="order-last grid w-full min-w-0 gap-1.5 @xl:order-0 @xl:w-auto">
            <label htmlFor={`${id}-shape`} className="text-xs font-medium">
              {labels.sectionShape}
            </label>
            <select
              id={`${id}-shape`}
              {...tid(ids.shape)}
              value={matchingShape?.id ?? "Custom"}
              onChange={(event) => {
                const shape = SECTION_SHAPES.find(
                  (candidate) => candidate.id === event.target.value,
                );
                if (!shape) return;
                apply((blocks) => {
                  let shaped = patchContainer(blocks, path, {
                    spaces: shape.spaces,
                    weights: shape.weights,
                  });
                  // **A shape change must never wrap or discard content
                  // already there.** So this seeds a column into every place
                  // that is currently EMPTY — a wide middle is unusable until
                  // its place can grow — and leaves every filled place
                  // untouched. `block.children` is read from the render that
                  // is current when the shape was picked, not from `shaped`,
                  // because `patchContainer` never touches `children`.
                  for (const [position, child] of block.children.entries()) {
                    if (!child) {
                      shaped = addToPlace(
                        shaped,
                        [...path, position],
                        newContainer("stack", 1),
                      );
                    }
                  }
                  return shaped;
                });
              }}
              className="rounded-lg surface border-(--edge)/60 bg-(--menu) px-3 py-1.5 text-sm"
            >
              {SECTION_SHAPES.map((shape) => (
                <option key={shape.id} value={shape.id}>
                  {labels.shapes[shape.id]}
                </option>
              ))}
              {/* Never itself a choice — picking it would write nothing, and
                  a control that accepts a choice and changes nothing is the
                  worst kind there is. It names the current state instead,
                  the same role the unknown-arrangement option above plays
                  for `sectionMode`. */}
              <option value="Custom" disabled>
                {labels.sectionShapeCustom}
              </option>
            </select>
          </div>
        ) : null}

        {hideStylePopup ? null : (
          <SectionStylePopup
            value={block.style}
            onChange={(style) =>
              apply((blocks) => patchContainer(blocks, path, { style }))
            }
            labels={labels.style}
            // Computed from the block itself, in one place — see
            // `styleGatesFor`'s own TSDoc for why this replaced two separate
            // booleans this component used to work out by hand.
            gates={styleGatesFor(block, depth === 0)}
          />
        )}

        {hideRemove ? null : (
          <RemoveSectionButton
            locked={cannotRemove}
            testId={ids.remove}
            labels={labels}
            onRemove={() => {
              apply((blocks) =>
                depth === 0 ? removeAt(blocks, path) : clearAt(blocks, path),
              );
              onRemove?.();
            }}
          />
        )}
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
          {labels.leaf.problemGeneric}
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

      {/* Weights lay grid TRACKS, so this is offered only where the shape
          select above it is — see that control's own comment. The database
          stores weights for every mode regardless, so switching away and
          back finds them intact; this is only where they are EDITABLE. */}
      {block.mode === "grid" ? (
        <div className="relative grid gap-1.5">
          <div className="flex flex-wrap gap-2">
            {weightFields.map((field) => (
              <label
                key={field.key}
                className="grid min-w-0 gap-1 text-xs font-medium"
              >
                {labels.sectionWeight[field.at + 1]}
                <input
                  type="number"
                  min={1}
                  max={BLOCK_LIMITS.weight}
                  aria-describedby={`${id}-weights-hint`}
                  {...tid(`section-weight-${field.at}`)}
                  value={field.weight}
                  onChange={(event) => {
                    // Clamped here rather than left to `blocksSchema`: an
                    // emptied input is `Number("") === 0` and `max` does not
                    // block typing past it, and a share `blocksSchema` refuses
                    // lands at `sections[0].weights[N]` — a path
                    // `blockProblems` cannot mark on the array-index branch
                    // (see its own TSDoc), which used to surface as the
                    // page-level "holds more than it can" banner with nothing
                    // pointing at the dial responsible. Clamping makes that
                    // payload unreachable from this control.
                    const value = Math.min(
                      Math.max(1, Number(event.target.value) || 1),
                      BLOCK_LIMITS.weight,
                    );
                    const next = weights.map((prior, index) =>
                      index === field.at ? value : prior,
                    );
                    apply((blocks) =>
                      patchContainer(blocks, path, { weights: next }),
                    );
                  }}
                  className="w-16 rounded-lg surface border-(--edge)/60 bg-(--surface) px-2 py-1 text-sm"
                />
              </label>
            ))}
          </div>
          <p
            id={`${id}-weights-hint`}
            className="text-xs text-(--muted)"
            {...tid("section-weights-hint")}
          >
            {labels.sectionWeightsHint}
          </p>
        </div>
      ) : null}

      {!showChildren || collapsed ? null : (
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
                atBlockLimit={atBlockLimit}
                locked={locked}
                problems={problems}
                kinds={kinds}
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
  /** Whether the page is already holding as many blocks as it may. */
  atBlockLimit: boolean;
  /** The required kinds whose last copy must survive — see `lockedKinds`. */
  locked: ReadonlySet<string>;
  /** What the save schema refused, and where. */
  problems: readonly BlockProblem[];
  /** The leaf kinds this page may hold — see `BlockCardProps.kinds`. */
  kinds: readonly LeafKind[];
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
  atBlockLimit,
  locked,
  problems,
  kinds,
}: PlaceProps): ReactNode {
  return (
    <BlockSlot path={path} filled={Boolean(child)} label={labels.dragBlock}>
      {(handle) => (
        <PlaceContent
          child={child}
          path={path}
          apply={apply}
          lang={lang}
          labels={labels}
          atBlockLimit={atBlockLimit}
          locked={locked}
          problems={problems}
          dragHandle={handle}
          kinds={kinds}
        />
      )}
    </BlockSlot>
  );
}

/**
 * What is actually in the place, or the invitation to fill it.
 *
 * Split from {@link Place} so the drop target and the grip are declared once,
 * above the three things a place may render, rather than three times inside
 * them.
 *
 * @returns the contents.
 */
function PlaceContent({
  child,
  path,
  apply,
  lang,
  labels,
  atBlockLimit,
  locked,
  problems,
  dragHandle,
  kinds,
}: PlaceProps & { dragHandle: ReactNode }): ReactNode {
  if (child && isContainer(child)) {
    return (
      <BlockCard
        block={child}
        path={path}
        apply={apply}
        lang={lang}
        labels={labels}
        atBlockLimit={atBlockLimit}
        locked={locked}
        problems={problems}
        dragHandle={dragHandle}
        kinds={kinds}
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
        labels={labels.leaf}
        problems={problems}
        dragHandle={dragHandle}
        kinds={kinds}
      />
    );
  }
  return (
    <div
      {...tid("empty-place")}
      className="flex flex-wrap items-center justify-center gap-1.5 rounded-lg surface border-dashed border-(--edge)/60 bg-(--surface) p-3"
    >
      {/* An empty place here is filled through the ONE global Add picker,
          portalled into the toolbar (`add-slot.tsx`, `add-target.ts`) —
          never from within this legacy `showChildren` rendering, which no
          production caller reaches any more (see
          `BlockCardProps.showChildren`'s own note). The Items-scope
          inspector this comment used to name (`inspector-items.tsx`) is
          deleted; see "The Properties panel replaces the recursive
          inspector" in the actors feature note. The flat `add-content`/
          `add-nested` pair that used to live here is gone rather than
          rebuilt against a picker this card has no `page`/`locale` to feed;
          only removal stays possible for a place reached this way. */}
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
