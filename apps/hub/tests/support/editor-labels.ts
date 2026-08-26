import {
  CONTAINER_MODES,
  LEAF_KINDS,
} from "@/features/actors/domain/block-schema";
import { SPACE_CHOICES } from "@/features/actors/domain/block-edits";
import { DESCRIBED_KINDS } from "@/features/actors/domain/leaf-fields";
import { SECTION_SHAPES } from "@/features/actors/presentation/section-shapes";
import { SKINS, type SkinId } from "@/shared/domain/skins";
import type { BlockEditorLabels } from "@/features/actors/presentation/block-editor";
import type { CompletePagePreviewLabels } from "@/features/actors/presentation/complete-page-preview";

/**
 * Every string the page editor renders, with each name standing in for its
 * translation.
 *
 * **Shared rather than restated in each suite, and the per-kind records are
 * DERIVED**, because that is what makes adding a content kind or an
 * arrangement a change in one place. A fixture written out by hand is a fifth
 * list to keep in step with the vocabulary, and the one it would quietly fall
 * behind is the one no assertion reads — which is how a suite ends up green
 * about a control it is no longer rendering.
 *
 * The values are the ids themselves wherever a record is derived, so an
 * assertion can name what it is looking for without the fixture having to
 * invent English. `shapes` and `sectionWeight` follow the same rule, DERIVED
 * from `SECTION_SHAPES` and `SPACE_CHOICES` respectively — the shape
 * control's own vocabulary, so a shape or a place count added later cannot
 * quietly fall behind the fixture the way the comment above warns about.
 *
 * `problemTitle` and `problemGeneric` are what a refused save marks a block
 * with; the suites assert against these values rather than against a
 * substring, so a reworded message is a fixture change rather than a silent
 * pass. `drag.tooDeep` and its two neighbours are read the same
 * way, by the suite that drives a real keyboard drag into a place one level
 * too deep.
 *
 *
 * **The remove control withdraws when a block holds the last copy of a kind
 * the page must carry.** `lockedKinds` is computed once over the whole tree
 * and threaded down, so every bin in the editor locks at the same moment —
 * the same reasoning `atBlockLimit` already follows.
 *
 *
 * **A section may also reach both edges of the window** — the `bleed` key,
 * offered at depth 0 only, because a nested block has a section between it and
 * the page and cannot escape it. `margins` is the independent chrome toggle
 * beside it.
 *
 * @returns the labels, freshly built, so a suite that mutates one is not
 * mutating another's.
 */
export function blockEditorLabels(): BlockEditorLabels {
  return {
    sectionsTitle: "Sections",
    empty: "No sections yet.",
    addSection: "Add section",
    newSectionSpaces: "New section shape",
    addSectionFor: "Add a section for…",
    atLimit: "At the limit.",
    dragSection: "Drag to reorder section",
    dragBlock: "Drag to move this",
    drag: {
      instructions: "Space to pick up, arrows to move, space to drop.",
      lifted: "Picked up",
      over: "Moved over",
      dropped: "Dropped on",
      cancelled: "Left where it was.",
      intoItself: "That would put a section inside itself.",
      tooDeep: "That is one level too deep.",
      noSuchPlace: "That place is no longer there.",
    },
    sectionName: "Section name",
    sectionMode: "Arrangement",
    sectionSpaces: "Spaces across",
    sectionSpacesHint: "Fewer means more rows. Nothing is removed.",
    sectionShape: "Shape",
    shapes: Object.fromEntries(
      SECTION_SHAPES.map((shape) => [shape.id, shape.id]),
    ),
    sectionShapeCustom: "Custom",
    sectionWeight: Object.fromEntries(
      SPACE_CHOICES.map((place) => [place, `Width of place ${place}`]),
    ),
    sectionWeightsHint: "These set how wide each place is.",
    modes: Object.fromEntries(CONTAINER_MODES.map((mode) => [mode, mode])),
    removeSection: "Remove section",
    removeLocked: "remove-locked",
    collapse: "Collapse section",
    expand: "Expand section",
    addContent: "Add content",
    addNested: "Add a section here",
    nestingAtLimit: "Sections cannot be nested any deeper.",
    removePlace: "Remove this place",
    addPlace: "Add a place",
    previewTitle: "How it will look",
    removeBlock: "Remove what is here",
    leafKind: "Content",
    leafKinds: Object.fromEntries(LEAF_KINDS.map((kind) => [kind, kind])),
    leafTitle: Object.fromEntries(
      LEAF_KINDS.map((kind) => [kind, `${kind} title`]),
    ),
    leafDescription: Object.fromEntries(
      DESCRIBED_KINDS.map((kind) => [kind, `${kind} description`]),
    ),
    leafHint: Object.fromEntries(
      DESCRIBED_KINDS.map((kind) => [kind, `${kind} hint`]),
    ),
    tableRows: "Rows",
    addRow: "Add row",
    removeRow: "Remove this row",
    addCell: "Add cell",
    removeCell: "Remove this cell",
    cellText: "Cell",
    problemTitle: "This needs a title in English.",
    problemGeneric: "Something here was refused.",
    linkUrl: "Link address",
    linkUrlHint: "A video or music link plays here.",
    linkUrlPlainHint: "This becomes a button or a chip.",
    imageUrl: "Image address",
    imageUrlHint: "Paste a link to a picture.",
    imageMissing: "No image",
    chooseIcon: "Choose an icon",
    searchIcons: "Search icons",
    noIconsFound: "No icons match that.",
    clearIcon: "Remove the icon",
    noIcon: "No icon",
    useTemplate: "Start from a template",
    templateConfirm: "This replaces the sections you have.",
    templateConfirmYes: "Replace them",
    templateConfirmNo: "Keep mine",
    names: {},
    descriptions: {},
    sectionCounts: {},
    style: {
      open: "Section style",
      title: "This section's own style",
      skin: "Style",
      bleed: "Reach both edges",
      margins: "Margins",
      skins: Object.fromEntries(SKINS.map((skin) => [skin, skin])) as Record<
        SkinId,
        string
      >,
      inheritSkin: "Inherit the page",
      backgroundUrl: "Background picture",
      backgroundUrlHint: "Paste an address. Nothing is stored.",
      fit: "Fit",
      fitDefault: "Original size",
      fitCover: "Cover",
      fitTile: "Tile",
      border: "Border",
      borderHint: "The edge around this block's own cards and panels.",
      borderInherit: "Inherit the page",
      borderNone: "No border",
      borderSolid: "Solid line",
      borderDashed: "Dashed line",
      borderDotted: "Dotted line",
      borderDouble: "Double line",
    },
  };
}

/**
 * The complete-page disclosure strings used by editor test fixtures.
 *
 * It carries the device names and one size hint PER DEVICE, since the preview
 * is shown at a named viewport and the real catalogue message is ICU — a
 * single string with `{width}`/`{height}` left in it would be a fixture shaped
 * unlike anything the app ever passes, which is how the render-time
 * `FORMATTING_ERROR` stayed invisible to every unit test.
 *
 * @returns labels that make the disclosure's state explicit in assertions.
 */
export function completePagePreviewLabels(): CompletePagePreviewLabels {
  return {
    title: "Complete page preview",
    expand: "Show complete page",
    collapse: "Hide complete page",
    devices: { phone: "Phone", tablet: "Tablet", desktop: "Desktop" },
    sizeHint: {
      phone: "Shown at 390 by 844",
      tablet: "Shown at 768 by 1024",
      desktop: "Shown at 1280 by 900",
    },
  };
}
