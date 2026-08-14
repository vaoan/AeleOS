import { getTranslations } from "next-intl/server";
import { FursonaEditor, readMyProfileTheme } from "@/features/actors";
import { createServerClient } from "@/shared/infrastructure/supabase-server";
import { fursonaEditorLabels } from "@/app/[locale]/(app)/fursonas/labels";

/**
 * The page for creating a fursona.
 *
 * It reads the person's own profile theme so the panel can offer "use my
 * profile's look". A new fursona is where that matters most: without it,
 * somebody who themed their profile faces rebuilding a gradient they placed
 * stop by stop on another page, from memory.
 *
 * Its labels come from `fursonaEditorLabels`, shared with the edit page rather
 * than each page keeping its own near-identical copy. The two differ only in
 * the toolbar's title and in whether the handle can be typed.
 *
 * @returns the create page.
 */
export default async function NewFursonaPage() {
  const t = await getTranslations("fursonas");
  // Read so the panel can offer "use my profile's look". A new fursona is
  // exactly where somebody most wants it: the alternative is rebuilding a
  // gradient they placed stop by stop on another page, from memory.
  const profileTheme = await readMyProfileTheme(await createServerClient());
  return (
    <FursonaEditor
      labels={await fursonaEditorLabels(t("editorTitleNew"))}
      handleEditable
      profileTheme={profileTheme}
    />
  );
}
