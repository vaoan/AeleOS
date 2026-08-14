import { getTranslations } from "next-intl/server";
import {
  FURSONA_TEMPLATES,
  CANVASES,
  SECTION_TYPES,
  type CanvasId,
  type FursonaEditorLabels,
  type SectionType,
} from "@/features/actors";

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
 * `errors` is keyed by error **code**, not by field: it must carry an entry for
 * every code either action can return, including the ones no field produces
 * (`handleTaken`, and `limitReached` for the fursona quota). A code with no
 * entry here falls back to the field's generic message, which for a form-level
 * failure means falling back to nothing — so adding a code to an action means
 * adding it here and to both catalogues.
 *
 * The theme panel's strings are **nested** under `theme` rather than spread in
 * beside everything else. Both it and the toolbar have a `title`, and a flat
 * bag would have one silently win — a collision this shape of object makes easy
 * to create and impossible to see.
 *
 * `types` is DERIVED from `SECTION_TYPES` rather than listed. Written out by
 * hand it was a set of entries that had to be remembered whenever a layout was
 * added, and the reward for forgetting was a picker offering a blank option.
 * `messages.test.ts` already fails the build when a key is in one catalogue and
 * not the other, so deriving it moves the whole question to one place.
 *
 * `writingIn` and `writingInHint` are two strings for one control because the
 * switch names itself and then says what it governs. The hint is not decoration:
 * the editor has an app language and an authoring language, and somebody with no
 * reason to suspect a second axis reads the switch as the app's own.
 *
 * @param title - what the toolbar says is being edited. The two pages differ
 * only in this and in whether the handle can be typed, which is why they share
 * one function rather than each carrying a near-identical copy.
 * @returns the translated labels.
 */
export async function fursonaEditorLabels(
  title: string,
): Promise<FursonaEditorLabels> {
  const t = await getTranslations("fursonas");
  return {
    title,
    save: t("save"),
    saving: t("saving"),
    cancel: t("cancel"),
    bannerTitle: t("bannerTitle"),
    writingIn: t("writingIn"),
    writingInHint: t("writingInHint"),
    sectionsTitle: t("sectionsTitle"),
    empty: t("sectionsEmpty"),
    addSection: t("addSection"),
    newSectionType: t("newSectionType"),
    atLimit: t("sectionsAtLimit"),
    dragSection: t("dragSection"),
    sectionName: t("sectionName"),
    sectionType: t("sectionType"),
    addItem: t("addItem"),
    removeItem: t("removeItem"),
    removeSection: t("removeSection"),
    collapse: t("collapseSection"),
    expand: t("expandSection"),
    itemTitle: t("itemTitle"),
    itemDescription: t("itemDescription"),
    imageUrl: t("imageUrl"),
    // Nested rather than spread into the same bag as everything else. Both
    // the toolbar and the theme panel have a `title`, and flattening them would
    // have one silently win — which is the kind of collision a label bag makes
    // easy to create and impossible to see.
    theme: {
      title: t("themeTitle"),
      live: t("themeLive"),
      accent: t("themeAccent"),
      backdropA: t("themeBackdropA"),
      backdropB: t("themeBackdropB"),
      canvas: t("themeCanvas"),
      canvases: Object.fromEntries(
        CANVASES.map((canvas) => [canvas, t(`canvases.${canvas}`)]),
      ) as Record<CanvasId, string>,
      onLight: t("themeOnLight"),
      onDark: t("themeOnDark"),
      adjusted: t("themeAdjusted"),
      reset: t("themeReset"),
    },
    linkUrl: t("linkUrl"),
    linkUrlHint: t("linkUrlHint"),
    imageMissing: t("imageMissing"),
    chooseIcon: t("chooseIcon"),
    searchIcons: t("searchIcons"),
    noIconsFound: t("noIconsFound"),
    clearIcon: t("clearIcon"),
    noIcon: t("noIcon"),
    imageUpload: t("imageUpload"),
    imageUploading: t("imageUploading"),
    imageTooLarge: t("imageTooLarge"),
    imageWrongType: t("imageWrongType"),
    imageFailed: t("imageFailed"),
    imageStaysPublic: t("imageStaysPublic"),
    useTemplate: t("useTemplate"),
    templateConfirm: t("templateConfirm"),
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
        t("templateSections", { count: template.sections.length }),
      ]),
    ),
    // Derived rather than listed. Written out by hand this was four entries
    // that had to be remembered whenever a layout was added, and the reward for
    // forgetting was a picker offering a blank option. `messages.test.ts`
    // already fails the build when a key is in one catalogue and not the other,
    // so deriving it moves the whole question to one place.
    types: Object.fromEntries(
      SECTION_TYPES.map((type) => [type, t(`types.${type}`)]),
    ) as Record<SectionType, string>,
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
      limitReached: t("form.errors.limitReached"),
      displayName: t("form.errors.displayName"),
      avatarUrl: t("form.errors.avatarUrl"),
      visibility: t("form.errors.visibility"),
      sectionsRefused: t("form.errors.sectionsRefused"),
    },
  };
}
