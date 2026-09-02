import {
  CONTAINER_MODES,
  LEAF_KINDS,
} from "@/features/actors/domain/block-schema";
import { SPACE_CHOICES } from "@/features/actors/domain/block-edits";
import { DESCRIBED_KINDS } from "@/features/actors/domain/leaf-fields";
import { SECTION_SHAPES } from "@/features/actors/presentation/section-shapes";
import { SKINS, type SkinId } from "@/shared/domain/skins";
import type { BlockEditorLabels } from "@/features/actors/presentation/block-editor";

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
 * `sectionEyebrow` and `contentEyebrow` carry real English rather than their
 * own key names, like the other scalars here, because the assertions that read
 * them are looking for a word a person sees.
 *
 * **The leaf's strings are nested under `leaf`**, mirroring the real builder:
 * a card holds a `LeafEditorLabels` rather than extending one, so a suite
 * asserting a leaf string reads `labels.leaf.…` exactly as the component does.
 *
 * It carries BOTH template confirmations, because the picker chooses between
 * them on whether the chosen template has a look.
 *
 * @returns the labels, freshly built, so a suite that mutates one is not
 * mutating another's.
 *
 * It carries the style popup's `chrome`, `heading`, `heading_pad`,
 * `text_align`, `image_fit`, `radius`, `label` and `portrait` strings, the
 * theme panel's `font` and `spacing`, and the leaf editor's `rowIcon`.
 * `heading` is four names, the fourth being the quieter bar tone; beside them
 * sit the bar's own picture, how that picture lies, the room under the name,
 * and one name per corner for the two corner pickers.
 *
 * **The style bag is built once and used for both `style` and `leaf.style`**,
 * matching the real builder (`pages/labels.ts`'s `stylePopupLabels`): one
 * popup opens for a container and for a leaf alike, so one fixture bag rather
 * than two that could quietly disagree.
 */
const stylePopupLabels = {
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
  chrome: "Card",
  chromeInherit: "Inherit the page",
  chromeCard: "Keep the card",
  chromeBare: "No card",
  chromeHint: "Takes away the fill, the edge and the padding.",
  heading: "Name",
  headingPlain: "Above the content",
  headingBar: "As a bar on top of it",
  headingGradient: "As a shaded bar",
  headingSoft: "As a quieter bar",
  headingGap: "Space under the name",
  headingGapDefault: "Ordinary",
  headingGapNone: "None",
  headingGapSnug: "Tight",
  headingGapRoomy: "Roomy",
  headingImage: "Picture on the name bar",
  headingImageHint: "A link to a picture. Nothing is uploaded.",
  headingFit: "How the name picture fills",
  headingFitCover: "Fill the bar",
  headingFitTile: "Tile it",
  corners: "Rounded corners",
  headingCorners: "Rounded corners on the name bar",
  corner: {
    tl: "Top left",
    tr: "Top right",
    br: "Bottom right",
    bl: "Bottom left",
  },
  headingPad: "Name spacing",
  headingPadDefault: "Ordinary",
  headingPadSnug: "Tight",
  headingPadRoomy: "Roomy",
  label: "Own title",
  labelDefault: "Whatever this spot already shows",
  labelShow: "Show",
  labelHidden: "Hide",
  labelHint: "Only narrows what this spot already decided.",
  textAlign: "Text",
  textAlignInherit: "Inherit the page",
  textAlignStart: "Left",
  textAlignCenter: "Centred",
  textAlignEnd: "Right",
  borderDouble: "Double line",
  imageFit: "Pictures",
  imageFitInherit: "Inherit",
  imageFitCover: "Cropped to fill",
  imageFitContain: "Shown whole",
  portrait: "Portrait size",
  portraitDefault: "Default",
  portraitSmall: "Small",
  portraitMedium: "Medium",
  portraitLarge: "Large",
  radius: "Corners",
  radiusInherit: "Inherit",
  radiusSquare: "Square",
  radiusSoft: "Soft",
  radiusRound: "Round",
};

/**
 * Supplies one stable English label bag for editor presentation tests.
 *
 * It includes the canvas inspector's Page, Items, Options and Back words so
 * tests use the same complete contract as the translated route rather than
 * filling recursive navigation controls with ad-hoc labels per fixture.
 *
 * **Carries the Add picker's four strings too (2026-09-02)** —
 * `addBlock`/`addBlockTitle`/`addContentGroup`/`addLayoutGroup` — as real
 * English, since `AddBlockPicker` is not part of the vocabulary-derived
 * records above and a suite asserting its own words needs them spelled out.
 *
 * @returns every label the block editor and its existing child controls need.
 */
export function blockEditorLabels(): BlockEditorLabels {
  return {
    sectionsTitle: "Sections",
    empty: "No sections yet.",
    addSection: "Add section",
    newSectionSpaces: "New section shape",
    addSectionFor: "Add a section for…",
    addBlock: "Add",
    addBlockTitle: "Add to this section",
    addContentGroup: "Content",
    addLayoutGroup: "Layout",
    selectPage: "Page",
    inspectorItems: "Items",
    inspectorOptions: "Options",
    inspectorBack: "Back",
    wrapInLayout: "Wrap in a layout",
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
    sectionEyebrow: "Section",
    sectionName: "Name",
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
    useTemplate: "Start from a template",
    templateConfirm: "This replaces the sections you have.",
    templateConfirmLook: "Replaces the page and the colours",
    templateConfirmYes: "Replace them",
    templateConfirmNo: "Keep mine",
    names: {},
    descriptions: {},
    sectionCounts: {},
    style: stylePopupLabels,
    leaf: {
      removeBlock: "Remove what is here",
      rowIcon: "Row icon",
      contentEyebrow: "Content",
      leafKind: "Type",
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
      style: stylePopupLabels,
    },
  };
}
