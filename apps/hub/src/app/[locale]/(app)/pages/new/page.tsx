import { getTranslations } from "next-intl/server";
import { FursonaEditor, readMyProfileTheme } from "@/features/actors";
import { createServerClient } from "@/shared/infrastructure/supabase-server";
import { env } from "@/shared/infrastructure/env";
import { fursonaEditorLabels } from "@/app/[locale]/(app)/pages/labels";

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
 * **It resolves `parentHost` from `env.hubHost`**, exactly as both edit routes
 * do: every section previews itself with the real renderer, and Twitch refuses
 * to load a player unless `parent=` names the embedding domain.
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
      // Twitch's player needs to know the domain embedding it, and every
      // section's live preview is the real renderer.
      parentHost={env.hubHost}
    />
  );
}
