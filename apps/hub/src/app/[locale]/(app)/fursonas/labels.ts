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
      displayName: t("form.errors.displayName"),
      avatarUrl: t("form.errors.avatarUrl"),
      visibility: t("form.errors.visibility"),
    },
  };
}
