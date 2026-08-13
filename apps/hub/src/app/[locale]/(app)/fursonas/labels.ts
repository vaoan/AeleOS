import { getTranslations } from "next-intl/server";
import type { FursonaEditorLabels } from "@/features/actors";

/**
 * Resolves every label {@link FursonaForm} needs, on the server where the
 * locale is.
 *
 * Shared by the create and edit pages, which differ only in the submit
 * button's wording — `submitKey` selects which catalogue entry fills it,
 * rather than each page carrying its own near-identical copy of this
 * function.
 *
 * It now also carries every string the section editor needs, resolved here for
 * the same reason as the rest: those components are client components, so the
 * catalogue lookup belongs on the server where the locale already is.
 *
 * `errors` is keyed by error **code**, not by field: it must carry an entry for
 * every code either action can return, including the ones no field produces
 * (`handleTaken`, and `limitReached` for the fursona quota). A code with no
 * entry here falls back to the field's generic message, which for a form-level
 * failure means falling back to nothing — so adding a code to an action means
 * adding it here and to both catalogues.
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
    types: {
      cards: t("types.cards"),
      accordion: t("types.accordion"),
      "two-column": t("types.two-column"),
      gallery: t("types.gallery"),
    },
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
