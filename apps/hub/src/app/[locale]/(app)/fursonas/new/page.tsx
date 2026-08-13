import { getTranslations } from "next-intl/server";
import { FursonaEditor } from "@/features/actors";
import { fursonaEditorLabels } from "@/app/[locale]/(app)/fursonas/labels";

/**
 * The page for creating a fursona.
 *
 * Its labels come from `fursonaEditorLabels`, shared with the edit page rather
 * than each page keeping its own near-identical copy. The two differ only in
 * the toolbar's title and in whether the handle can be typed.
 *
 * @returns the create page.
 */
export default async function NewFursonaPage() {
  const t = await getTranslations("fursonas");
  return (
    <FursonaEditor
      labels={await fursonaEditorLabels(t("editorTitleNew"))}
      handleEditable
    />
  );
}
