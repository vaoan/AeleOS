import { getTranslations } from "next-intl/server";
import {
  FursonaEditor,
  ensurePersonActor,
  getPersonActor,
  readActorPage,
} from "@/features/actors";
import { fursonaEditorLabels } from "@/app/[locale]/(app)/pages/labels";
import { createServerClient } from "@/shared/infrastructure/supabase-server";

/**
 * The page for editing your own profile.
 *
 * **The same editor a fursona gets.** A person's public page is a page like any
 * other — display name, avatar, who may see it, sections, theme — so it would
 * be a second implementation of the same screen to build its own form, and the
 * two would drift. What differs is only what a person actor cannot have: no
 * handle to choose, nothing to delete, and no place in an order.
 *
 * **It lives under `/me` rather than under `/pages`.** A static segment beside
 * `/pages/[handle]/edit` would silently make a fursona with that handle
 * uneditable — the reserved-word trap the addressing note already documents —
 * and `me` is reserved already, so this costs no new permanently-reserved word.
 * The way in is the pencil on your own row in the list, which is where somebody
 * looks for it.
 *
 * @returns the editor.
 */
export default async function EditMyProfilePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  await params;
  // **This page provisions, exactly as `/me` does.** Somebody can arrive here
  // straight from a link without ever having opened `/me`, and a person row is
  // what everything below reads — reaching for one that has not been created
  // yet answered 404 for a signed-in caller looking at their own profile.
  // `ensurePersonActor` is idempotent, so a reload creates nothing.
  const actorRef = await ensurePersonActor();
  const person = await getPersonActor(actorRef);
  const client = await createServerClient();
  const page = await readActorPage(client, actorRef);
  const t = await getTranslations("fursonas");

  return (
    <FursonaEditor
      labels={await fursonaEditorLabels(t("editorTitleProfile"))}
      handleEditable={false}
      kind="person"
      actorRef={actorRef}
      initial={{
        handle: person?.handle ?? "",
        displayName: person?.displayName ?? "",
        avatarUrl: person?.avatarUrl ?? "",
        visibility: person?.visibility ?? "private",
      }}
      initialSections={page.sections}
      initialTheme={page.theme}
    />
  );
}
