import { getTranslations } from "next-intl/server";
import type { FursonaFormLabels } from "@/features/actors";

/**
 * Resolves every label {@link FursonaForm} needs, on the server where the
 * locale is.
 *
 * Shared by the create and edit pages, which differ only in the submit
 * button's wording — `submitKey` selects which catalogue entry fills it,
 * rather than each page carrying its own near-identical copy of this
 * function.
 *
 * `errors` is keyed by error **code**, not by field: it must carry an entry for
 * every code either action can return, including the ones no field produces
 * (`handleTaken`, and `limitReached` for the fursona quota). A code with no
 * entry here falls back to the field's generic message, which for a form-level
 * failure means falling back to nothing — so adding a code to an action means
 * adding it here and to both catalogues.
 *
 * @param submitKey - the catalogue key for the submit button: `"submitCreate"`
 * on the create page, `"submitSave"` on the edit page.
 * @returns the translated labels.
 */
export async function fursonaFormLabels(
  submitKey: "submitCreate" | "submitSave",
): Promise<FursonaFormLabels> {
  const t = await getTranslations("fursonas");
  return {
    handle: t("form.handle"),
    handleHint: t("form.handleHint"),
    displayName: t("form.displayName"),
    avatarUrl: t("form.avatarUrl"),
    visibilityLabel: t("form.visibilityLabel"),
    submit: t(`form.${submitKey}`),
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
    },
  };
}
