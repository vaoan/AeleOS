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
 * **It builds the `PageContext` the renderer threads**, resolving
 * `parentHost` from `env.hubHost`, exactly as both edit routes
 * do: every section previews itself with the real renderer, and Twitch refuses
 * to load a player unless `parent=` names the embedding domain.
 *
 * **The context it builds now feeds the identity leaves too**, so a preview
 * shows a real portrait and a real handle. The three fields somebody can type
 * are overridden inside the editor from the live form — see `FursonaEditor` —
 * because a context resolved on the server holds what was SAVED.
 *
 *
 * The context also carries the page's MEASURE, which the block renderer
 * reads to lay each top-level section out in the author's chosen width.
 *
 * @returns the create page.
 *
 * **The fursona list's fallback heading comes from `publicProfile`**, the same
 * key the public route reads. The editor previews with the real renderer, so a
 * string of its own would be a preview that disagrees with the page. It asked
 * `fursonas.fursonas` before, which existed in neither catalogue and rendered
 * its own key path where a heading belonged.
 */
export default async function NewFursonaPage() {
  const t = await getTranslations("fursonas");
  // **The SAME key the public route reads.** This is the heading over the
  // fursona list when its author has written none, and the editor previews
  // with the real renderer — so a second string here would be a preview that
  // disagrees with the page. `fursonas.fursonas` never existed in either
  // catalogue and rendered its own key path at somebody.
  const tPublic = await getTranslations("publicProfile");
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
      // section's live preview is the real renderer — which now includes the
      // identity leaves.
      //
      // Almost everything here is empty and that is correct: nothing has been
      // created yet, so there is no handle, no address and no owner. The
      // editor overrides the typed fields from the live form, so the preview
      // fills in as somebody writes.
      page={{
        parentHost: env.hubHost,
        actorKind: "fursona",
        handle: "",
        address: "",
        displayName: null,
        avatarUrl: null,
        measure: null,
        fursonasFallbackTitle: tPublic("fursonas"),
      }}
    />
  );
}
