import { getTranslations } from "next-intl/server";
import {
  CONTAINER_MODES,
  DESCRIBED_KINDS,
  FURSONA_TEMPLATES,
  LEAF_KINDS,
  SECTION_SHAPES,
  SPACE_CHOICES,
  themeConfiguratorLabels,
  type FursonaEditorLabels,
} from "@/features/actors";
import { SKINS, type SkinId } from "@/shared/domain/skins";

/**
 * Resolves every label {@link FursonaForm} needs, on the server where the
 * locale is.
 *
 * Shared by the create and edit pages, which differ only in the submit
 * button's wording — `submitKey` selects which catalogue entry fills it,
 * rather than each page carrying its own near-identical copy of this
 * function.
 *
 * It now also carries every string the section editor needs — the icon
 * picker's, the gallery item's, and the upload control's — resolved here for
 * the same reason as the rest: those components are client components, so the
 * catalogue lookup belongs on the server where the locale already is.
 *
 * The template picker's three label records are **built by mapping
 * `FURSONA_TEMPLATES`**, not written out. A template added later then either
 * gets a catalogue entry or fails the message-key test; it can never quietly
 * render its own id at somebody.
 *
 * `handleRetired` is its own message and not a variant of `handleTaken`: one is
 * a name another of their fursonas wears, the other a name nothing wears and
 * nothing may take again. Telling somebody a retired handle is "already yours"
 * would send them looking for a fursona that does not exist.
 *
 * `errors` is keyed by error **code**, not by field: it must carry an entry for
 * every code either action can return, including the ones no field produces
 * (`handleTaken`, and `limitReached` for the fursona quota). A code with no
 * entry here falls back to the field's generic message, which for a form-level
 * failure means falling back to nothing — so adding a code to an action means
 * adding it here and to both catalogues.
 *
 * `pageUnreadable` is not a refusal of anything the person typed: it says a
 * page is stored that this build cannot read, so the save was a no-op. It has
 * to be a message rather than silence, because the alternative — saving what
 * the editor believes, which is nothing — deletes the page.
 *
 * **`sections`, `sectionsMarked` and `sectionsTooLarge` are three messages for
 * one field**, and each split is the difference between a sentence somebody
 * can act on and one they cannot. A refusal that landed on a BLOCK is marked
 * in the editor — `aria-invalid` and a line under the field — so those two
 * messages may say "what needs fixing is marked below" and be telling the
 * truth. They differ on the CAUSE: `sections` also names the missing English
 * title, which is only honest when every refusal is one, and `sectionsMarked`
 * names none, because a container's own `mode`, `spaces`, name or style
 * address can be refused too and pointing somebody at a title that is fine is
 * its own fault. A page-level refusal carries no index, so nothing is marked
 * and a message promising a marking would be the fault this trio exists to
 * end. `sectionsCode` in `FursonaEditor` picks between them.
 *
 * `problemTitle` and `problemGeneric` are the marks themselves. The first is
 * the only refusal anybody meets in ordinary use — a new piece of content
 * starts untitled and the write schema requires a heading — and it names
 * ENGLISH, because that is the half the schema requires whichever half is on
 * screen.
 *
 * `leafHint` is the description field's placeholder, one per content kind,
 * and it is where a template's guidance moved to. It is the app's own words,
 * so it is a catalogue entry like the rest; what somebody types into that
 * field is theirs and is not.
 *
 * **`leafTitle`, `leafDescription` and `leafHint` are one entry per content
 * kind, built by mapping the vocabulary.** A `picture`'s title is its ALT
 * TEXT, a `link`'s is the words on the button, a `quote`'s is who said it —
 * the pair genuinely means something different per kind, and a field whose
 * meaning changes silently between kinds is worse than a differently named
 * one. `leafDescription` and `leafHint` cover `DESCRIBED_KINDS` only: a
 * `social` chip renders no description, so there is no string to write for a
 * field that is never offered.
 *
 * The theme panel's own strings are resolved by `themeConfiguratorLabels`,
 * shared with `/me` — the panel appears in both places, and those live in
 * route folders that may not import each other, so a copy here would be one a
 * later string could be added to and not the other.
 *
 * `style.skins` is built by mapping `SKINS`, the same way the theme panel's
 * own `skins` record is — reusing the SAME `skins.*` catalogue keys rather
 * than inventing a second set of names for the same styles. A skin is a skin
 * whether it is chosen for the whole page or for one section of it.
 *
 * **The card-size strings are gone with the control.** Nothing on any page
 * reads `--card-size` since a container began declaring an explicit space
 * count, and a control that accepts a choice and changes nothing is the worst
 * kind there is. The schema keeps the key, so a value the flat editor stored
 * survives untouched.
 *
 * `style.border*` names what the edge looks like — a solid, dashed, dotted or
 * double line — never the schema's own wire values. `borderInherit` is the
 * option that clears `style.border`, distinct from `borderNone`: clearing
 * leaves the section following whatever the page (or an enclosing section)
 * already set, while `borderNone` is an explicit choice to turn the border
 * off regardless of that. `borderHint` says the field reaches this section's
 * own surfaces, not the popup's.
 *
 * The two cloud labels became one, `canvasColours`, naming the group — the
 * editor renders as many pickers as the chosen canvas actually paints with, so
 * there is nothing fixed left to name individually.
 *
 * The background's strings are **nested** under `gradient`, for the same reason
 * the theme panel's are nested: it has a `title` of its own.
 *
 * The cursor's three strings name the field, say that a picture is a link and
 * how small it has to be, and warn when the one somebody pasted is too big for
 * any browser to use.
 *
 * The theme panel gained a `background`, which is the colour every other one is
 * now derived from, and lost the pair that named a light and a dark rendering —
 * there is one rendering.
 *
 * The theme panel gained `usingDefault`, which marks a colour nobody has
 * chosen. A colour input always carries a value, so without it the design's own
 * colour is presented as though somebody had picked it.
 *
 * The upload's six strings are gone with the bucket. What remains for a picture
 * is `imageUrl` and a hint saying it is a link and nothing is stored — which
 * has to be said, because a field called "image" beside a fursona editor reads
 * as a place to put a file until somebody is told otherwise.
 *
 * The theme panel's strings are **nested** under `theme` rather than spread in
 * beside everything else. Both it and the toolbar have a `title`, and a flat
 * bag would have one silently win — a collision this shape of object makes easy
 * to create and impossible to see.
 *
 * `modes`, `leafKinds` and the three per-kind field records are DERIVED from
 * `CONTAINER_MODES`, `LEAF_KINDS` and `DESCRIBED_KINDS` rather than listed.
 * Written out by hand they would be entries somebody has to remember whenever
 * the vocabulary grows, and the reward for forgetting is a picker offering a
 * blank option — which is not hypothetical: a layout added to neither
 * catalogue once rendered `fursonas.types.progress` at somebody, at a width
 * that overflowed a 320px phone. `messages.test.ts` pins each list against
 * both catalogues, so deriving them moves the whole question to one place.
 *
 * `shapes` is the same idea applied to `SECTION_SHAPES` — one name per entry,
 * keyed by its `id`, so a shape added to the list cannot render a raw key at
 * somebody either. `sectionWeight` is keyed by place number (1 through
 * `SPACE_CHOICES`'s widest entry) rather than by a fixed vocabulary — a
 * FUNCTION was tried first and broken: this runs on the server and the result
 * crosses into `FursonaEditor`, a client component, as a prop, and React
 * cannot serialise a function across that boundary. It failed the whole
 * editor page at runtime rather than one control, which is why every label
 * here is data, never a closure.
 *
 * `writingIn` and `writingInHint` are two strings for one control because the
 * switch names itself and then says what it governs. The hint is not decoration:
 * the editor has an app language and an authoring language, and somebody with no
 * reason to suspect a second axis reads the switch as the app's own.
 *
 * `linkUrlHint` and `linkUrlPlainHint` are two strings for one field, for the
 * same reason `writingIn`/`writingInHint` are two for one control: what a
 * pasted address becomes genuinely differs by kind, so a single hint vague
 * enough to be true for `player` and `post` (which frame what they recognise)
 * and for `link` and `social` (which never do) would be true of neither.
 * `LeafFields.embeds` in `domain/leaf-fields.ts` is what decides which is
 * shown.
 *
 * **`drag` is one bag for the five things a drag says and the three ways a
 * drop can be refused.** The five are the words `@dnd-kit`'s own defaults
 * would otherwise supply in hard-coded English built out of raw drag ids; the
 * three are `MoveRefusal` in words, and without them a refused drop is a drag
 * that silently did nothing. Nested, like `style` and `theme`, because
 * `dropped` and `cancelled` would collide flat with the toolbar's own
 * vocabulary.
 *
 * `addSectionFor` names the brand preset control's own group, not any brand —
 * a brand's name is never translated, so `section-presets.ts` supplies those
 * verbatim rather than this function resolving them from the catalogue.
 *
 * @param title - what the toolbar says is being edited. The two pages differ
 * only in this and in whether the handle can be typed, which is why they share
 * one function rather than each carrying a near-identical copy.
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
 * beside it: checked omits the key, unchecked stores `false`.
 *
 * `hideControls` and `showControls` are separate strings because the control
 * that steps the workbench aside and the one that brings it back are rendered
 * in different places and never both exist at once.
 *
 * `sectionEyebrow` and `contentEyebrow` are the nouns the two card kinds wear,
 * and each is separate from the field label beside it — `sectionName` and
 * `leafKind` label fields, these two say what the card IS. One string doing
 * both is how the noun ended up invisible.
 *
 * `pageStyle` names the switch that takes the page's own look off while
 * building.
 *
 * **The leaf's strings are nested under `leaf`.** `BlockCardLabels` holds a
 * `LeafEditorLabels` rather than extending one, so the shape this builds is
 * the card's own vocabulary plus one bag it forwards — see that interface for
 * why the forward is named rather than inherited.
 *
 * **`openSource` and `source` are two catalogue entries for the same
 * feature, and they stay separate on purpose.** `openSource` is the
 * toolbar's own control — one string, flat, alongside `hideControls` — while
 * `source` is the dock it opens, nested exactly as `theme` is because both it
 * and this bag carry a `title`. The dock itself never renders the control
 * that opens it, so its own label bag has no `open` entry to collide with.
 *
 * It builds BOTH confirmation warnings. `templateConfirm` names the page and
 * `templateConfirmLook` names the page and the colours; which one a person
 * sees depends on whether the template they chose carries a look, so both are
 * always built and the picker decides.
 *
 * **`sectionCounts` reads a template's BLOCKS**, and the number it shows is the
 * same one under a new name: `sectionsToBlocks` maps one top-level section to
 * one container, and a template is converted where it is declared rather than
 * when it is applied. If a starter ever gains a nested section this stops being
 * a coincidence and the count has to be taken from the authored form instead.
 *
 * @returns the translated labels.
 *
 * It builds the style popup's `chrome`, `heading`, `heading_pad`,
 * `text_align`, `image_fit`, `radius`, `label` and `portrait` strings too —
 * `heading` being four names now, since a bar may be drawn in the accent,
 * shaded, or in the quieter derived tone — plus the bar's own picture, how
 * that picture lies, the room under the name, and one name per corner for the
 * two corner pickers. **Built once, as `stylePopupLabels`, and used twice**:
 * `SectionStylePopup` opens for a container and for a leaf alike since
 * 2026-08-30, so the bag is assigned to both `style` and `leaf.style` rather
 * than built out twice — see the local const's own comment.
 *
 * The same bag now names the canvas inspector's Page, Items, Options, Back
 * and Close controls. These are translated here with the rest of the editor
 * chrome; they are not labels stored in somebody's page document. Items is the
 * selected page or container's immediate-child list, not the old global Add
 * palette. Close clears selection at any depth; Back still selects the parent.
 *
 * **It also names the toolbar's Interact-with-page switch (2026-09-02)** —
 * `interactWithPage` and its two accessible-description hints, `Off`/`On` —
 * beside `hideControls`/`showControls`, which it already carried.
 *
 * **And the Add picker's own four strings**, inherited through
 * `BlockEditorLabels`: `addBlock` names the trigger everywhere it appears,
 * `addBlockTitle` the popup's own heading, and `addContentGroup`/
 * `addLayoutGroup` the two option groups inside it. The picker reuses
 * `nestingAtLimit`, already resolved above, rather than a fifth string that
 * would say the identical thing.
 *
 * The drag refusal bag also distinguishes a valid linear destination whose
 * parent is already at the child cap. That `tooMany` outcome is ordinary
 * feedback from the drop planner, not a save error.
 */
export async function fursonaEditorLabels(
  title: string,
): Promise<FursonaEditorLabels> {
  const t = await getTranslations("fursonas");
  // **Built once and used twice.** `SectionStylePopup` opens for a container
  // (`BlockCardLabels.style`, below) and for a leaf (`leaf.style`) alike
  // since 2026-08-30 — one popup, one bag of strings, so there is one place
  // to add a key rather than two copies free to drift apart.
  const stylePopupLabels = {
    open: t("sectionStyleOpen"),
    title: t("sectionStyleTitle"),
    skin: t("sectionStyleSkin"),
    bleed: t("sectionStyleBleed"),
    margins: t("sectionStyleMargins"),
    skins: Object.fromEntries(
      SKINS.map((skin) => [skin, t(`skins.${skin}`)]),
    ) as Record<SkinId, string>,
    inheritSkin: t("sectionStyleInherit"),
    backgroundUrl: t("sectionStyleBackgroundUrl"),
    backgroundUrlHint: t("sectionStyleBackgroundUrlHint"),
    fit: t("sectionStyleFit"),
    fitDefault: t("sectionStyleFitDefault"),
    fitCover: t("sectionStyleFitCover"),
    fitTile: t("sectionStyleFitTile"),
    border: t("sectionStyleBorder"),
    borderHint: t("sectionStyleBorderHint"),
    borderInherit: t("sectionStyleBorderInherit"),
    borderNone: t("sectionStyleBorderNone"),
    borderSolid: t("sectionStyleBorderSolid"),
    borderDashed: t("sectionStyleBorderDashed"),
    borderDotted: t("sectionStyleBorderDotted"),
    chrome: t("styleChrome"),
    chromeInherit: t("styleChromeInherit"),
    chromeCard: t("styleChromeCard"),
    chromeBare: t("styleChromeBare"),
    chromeHint: t("styleChromeHint"),
    heading: t("styleHeading"),
    headingPlain: t("styleHeadingPlain"),
    headingBar: t("styleHeadingBar"),
    headingGradient: t("styleHeadingGradient"),
    // The quieter bar tone. Its wording says how the strip READS rather than
    // what it is made of — an author picks no colour for it, so naming a
    // derivation would describe machinery they never meet.
    headingSoft: t("styleHeadingSoft"),
    headingGap: t("styleHeadingGap"),
    headingGapDefault: t("styleHeadingGapDefault"),
    headingGapNone: t("styleHeadingGapNone"),
    headingGapSnug: t("styleHeadingGapSnug"),
    headingGapRoomy: t("styleHeadingGapRoomy"),
    headingImage: t("styleHeadingImage"),
    headingImageHint: t("styleHeadingImageHint"),
    headingFit: t("styleHeadingFit"),
    headingFitCover: t("styleHeadingFitCover"),
    headingFitTile: t("styleHeadingFitTile"),
    corners: t("styleCorners"),
    headingCorners: t("styleHeadingCorners"),
    corner: {
      tl: t("styleCornerTl"),
      tr: t("styleCornerTr"),
      br: t("styleCornerBr"),
      bl: t("styleCornerBl"),
    },
    headingPad: t("styleHeadingPad"),
    headingPadDefault: t("styleHeadingPadDefault"),
    headingPadSnug: t("styleHeadingPadSnug"),
    headingPadRoomy: t("styleHeadingPadRoomy"),
    // `label` composes with `showsLabel`'s own set of leaf kinds — see
    // `honoursLabel` in `presentation/block-contract.ts` for the gate this
    // popup uses to decide when to offer it at all.
    label: t("styleLabel"),
    labelDefault: t("styleLabelDefault"),
    labelShow: t("styleLabelShow"),
    labelHidden: t("styleLabelHidden"),
    labelHint: t("styleLabelHint"),
    textAlign: t("styleTextAlign"),
    textAlignInherit: t("styleTextAlignInherit"),
    textAlignStart: t("styleTextAlignStart"),
    textAlignCenter: t("styleTextAlignCenter"),
    textAlignEnd: t("styleTextAlignEnd"),
    imageFit: t("styleImageFit"),
    imageFitInherit: t("styleImageFitInherit"),
    imageFitCover: t("styleImageFitCover"),
    imageFitContain: t("styleImageFitContain"),
    // `avatar` only — see `honoursPortrait` in `presentation/block-contract.ts`.
    portrait: t("stylePortrait"),
    portraitDefault: t("stylePortraitDefault"),
    portraitSmall: t("stylePortraitSmall"),
    portraitMedium: t("stylePortraitMedium"),
    portraitLarge: t("stylePortraitLarge"),
    radius: t("styleRadius"),
    radiusInherit: t("styleRadiusInherit"),
    radiusSquare: t("styleRadiusSquare"),
    radiusSoft: t("styleRadiusSoft"),
    radiusRound: t("styleRadiusRound"),
    borderDouble: t("sectionStyleBorderDouble"),
  };
  return {
    title,
    save: t("save"),
    saving: t("saving"),
    cancel: t("cancel"),
    hideControls: t("hideControls"),
    showControls: t("showControls"),
    openSource: t("source.open"),
    interactWithPage: t("interactWithPage"),
    interactWithPageHintOff: t("interactWithPageHintOff"),
    interactWithPageHintOn: t("interactWithPageHintOn"),
    bannerTitle: t("bannerTitle"),
    pageStyle: t("pageStyle"),
    writingIn: t("writingIn"),
    writingInHint: t("writingInHint"),
    sectionsTitle: t("sectionsTitle"),
    empty: t("sectionsEmpty"),
    addSection: t("addSection"),
    newSectionSpaces: t("newSectionSpaces"),
    addSectionFor: t("addSectionFor"),
    addBlock: t("addBlock"),
    addBlockTitle: t("addBlockTitle"),
    addContentGroup: t("addContentGroup"),
    addLayoutGroup: t("addLayoutGroup"),
    selectPage: t("selectPage"),
    inspectorItems: t("inspectorItems"),
    inspectorOptions: t("inspectorOptions"),
    inspectorBack: t("inspectorBack"),
    inspectorClose: t("inspectorClose"),
    wrapInLayout: t("wrapInLayout"),
    atLimit: t("sectionsAtLimit"),
    dragSection: t("dragSection"),
    dragBlock: t("dragBlock"),
    // Nested for the reason `style` and `theme` are: `dropped` and
    // `cancelled` would collide flat with words this bag already has.
    drag: {
      instructions: t("dragInstructions"),
      lifted: t("dragLifted"),
      over: t("dragOver"),
      dropped: t("dragDropped"),
      cancelled: t("dragCancelled"),
      intoItself: t("dragRefusedIntoItself"),
      tooDeep: t("dragRefusedTooDeep"),
      noSuchPlace: t("dragRefusedNoSuchPlace"),
      tooMany: t("dragRefusedTooMany"),
    },
    sectionEyebrow: t("sectionEyebrow"),
    sectionName: t("sectionName"),
    sectionMode: t("sectionMode"),
    sectionSpaces: t("sectionSpaces"),
    sectionSpacesHint: t("sectionSpacesHint"),
    sectionShape: t("sectionShape"),
    shapes: Object.fromEntries(
      SECTION_SHAPES.map((shape) => [shape.id, t(`sectionShape${shape.id}`)]),
    ),
    sectionShapeCustom: t("sectionShapeCustom"),
    sectionWeight: Object.fromEntries(
      SPACE_CHOICES.map((place) => [place, t("sectionWeight", { place })]),
    ),
    sectionWeightsHint: t("sectionWeightsHint"),
    modes: Object.fromEntries(
      CONTAINER_MODES.map((mode) => [mode, t(`modes.${mode}`)]),
    ),
    addContent: t("addContent"),
    addNested: t("addNested"),
    nestingAtLimit: t("nestingAtLimit"),
    removePlace: t("removePlace"),
    addPlace: t("addPlace"),
    previewTitle: t("previewTitle"),
    removeSection: t("removeSection"),
    removeLocked: t("removeLocked"),
    collapse: t("collapseSection"),
    expand: t("expandSection"),
    // Nested, like `theme` below — the popup has a `title` of its own, and a
    // flat bag would have it silently collide with this level's. Built above
    // rather than here, and shared with `leaf.style` below.
    style: stylePopupLabels,
    // Nested rather than spread into the same bag as everything else. Both
    // the toolbar and the theme panel have a `title`, and flattening them would
    // have one silently win — which is the kind of collision a label bag makes
    // easy to create and impossible to see.
    theme: themeConfiguratorLabels(t),
    // Nested, like `theme` above: both it and this bag have a `title`, and a
    // flat bag would have one silently win. `open` is not repeated here — it
    // is the toolbar's own control, `openSource` above — because the dock
    // itself never renders a button that opens it.
    source: {
      title: t("source.title"),
      close: t("source.close"),
      collapse: t("source.collapse"),
      expand: t("source.expand"),
      copyReference: t("source.copyReference"),
      copied: t("source.copied"),
      referenceTitle: t("source.referenceTitle"),
      resync: t("source.resync"),
      drifted: t("source.drifted"),
      stale: t("source.stale"),
      sourceLabel: t("source.sourceLabel"),
      resize: t("source.resize"),
    },
    useTemplate: t("useTemplate"),
    templateConfirm: t("templateConfirm"),
    templateConfirmLook: t("templateConfirmLook"),
    templateConfirmYes: t("templateConfirmYes"),
    templateConfirmNo: t("templateConfirmNo"),
    // Built by mapping the shipped templates rather than listed by hand, so a
    // template added later cannot leave the picker showing a raw key.
    names: Object.fromEntries(
      FURSONA_TEMPLATES.map((template) => [
        template.id,
        t(`templates.${template.id}.name`),
      ]),
    ),
    descriptions: Object.fromEntries(
      FURSONA_TEMPLATES.map((template) => [
        template.id,
        t(`templates.${template.id}.description`),
      ]),
    ),
    sectionCounts: Object.fromEntries(
      FURSONA_TEMPLATES.map((template) => [
        template.id,
        t("templateSections", { count: template.blocks.length }),
      ]),
    ),
    handle: t("form.handle"),
    handleHint: t("form.handleHint"),
    displayName: t("form.displayName"),
    avatarUrl: t("form.avatarUrl"),
    visibilityLabel: t("form.visibilityLabel"),
    visibility: {
      private: t("visibility.private"),
      unlisted: t("visibility.unlisted"),
      public: t("visibility.public"),
    },
    errors: {
      handle: t("form.errors.handle"),
      handleTaken: t("form.errors.handleTaken"),
      handleRetired: t("form.errors.handleRetired"),
      limitReached: t("form.errors.limitReached"),
      displayName: t("form.errors.displayName"),
      avatarUrl: t("form.errors.avatarUrl"),
      visibility: t("form.errors.visibility"),
      sectionsRefused: t("form.errors.sectionsRefused"),
      sections: t("form.errors.sections"),
      sectionsMarked: t("form.errors.sectionsMarked"),
      sectionsTooLarge: t("form.errors.sectionsTooLarge"),
      pageUnreadable: t("form.errors.pageUnreadable"),
    },
    leaf: {
      removeBlock: t("removeBlock"),
      contentEyebrow: t("contentEyebrow"),
      leafKind: t("leafKind"),
      leafKinds: Object.fromEntries(
        LEAF_KINDS.map((kind) => [kind, t(`leafKinds.${kind}`)]),
      ),
      leafTitle: Object.fromEntries(
        LEAF_KINDS.map((kind) => [kind, t(`leafFields.${kind}.title`)]),
      ),
      leafDescription: Object.fromEntries(
        DESCRIBED_KINDS.map((kind) => [
          kind,
          t(`leafFields.${kind}.description`),
        ]),
      ),
      leafHint: Object.fromEntries(
        DESCRIBED_KINDS.map((kind) => [kind, t(`leafFields.${kind}.hint`)]),
      ),
      rowIcon: t("leafRowIcon"),
      tableRows: t("tableRows"),
      addRow: t("addRow"),
      removeRow: t("removeRow"),
      addCell: t("addCell"),
      removeCell: t("removeCell"),
      cellText: t("cellText"),
      problemTitle: t("problemTitle"),
      problemGeneric: t("problemGeneric"),
      imageUrl: t("imageUrl"),
      imageUrlHint: t("imageUrlHint"),
      linkUrl: t("linkUrl"),
      linkUrlHint: t("linkUrlHint"),
      linkUrlPlainHint: t("linkUrlPlainHint"),
      imageMissing: t("imageMissing"),
      chooseIcon: t("chooseIcon"),
      searchIcons: t("searchIcons"),
      noIconsFound: t("noIconsFound"),
      clearIcon: t("clearIcon"),
      noIcon: t("noIcon"),
      // The same object `style` above holds — one popup for a container and
      // a leaf both, so one bag of strings rather than two copies free to
      // drift apart.
      style: stylePopupLabels,
    },
  };
}
