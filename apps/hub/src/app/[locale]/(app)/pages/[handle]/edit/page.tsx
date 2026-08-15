import { createServerClient } from "@/shared/infrastructure/supabase-server";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  FursonaEditor,
  listMyActors,
  readActorPage,
  readMyProfileTheme,
} from "@/features/actors";
import { fursonaEditorLabels } from "@/app/[locale]/(app)/pages/labels";

/**
 * The page for editing one of your fursonas.
 *
 * **It loads the fursona's existing page and hands it down, and that is not
 * optional.** `set_actor_sections` replaces rather than merges, so an editor
 * opened without the existing sections deleted every one of them the first time
 * somebody pressed save — silently, with nothing failing and nothing warning.
 * Anything added to `actor_profiles` inherits that trap unless it is loaded
 * here too, which is why the theme travels in the same read.
 *
 * The route is keyed by **handle** rather than `actor_ref`: a handle is what a
 * person recognises in a URL, and a UUID means nothing to them.
 *
 * Resolution goes through `listMyActors(await createServerClient())`, which returns only the caller's own
 * actors — so a handle belonging to someone else is simply not found. That is
 * the authorization, and it is the same code path as the happy one, so there is
 * no separate ownership check to forget.
 *
 * The lookup also requires `status === "active"`: a suspended fursona 404s
 * exactly as a foreign one does, rather than opening a form that only fails,
 * with a generic error, at submit — `update_fursona`'s own `status = 'active'`
 * check would refuse it there, but by then the person has been told nothing
 * is wrong when in fact the fursona is sanctioned.
 *
 * The comparison is case-insensitive because the database's unique index is on
 * `lower(handle)` — `/fursonas/Sparky/edit` and `/fursonas/sparky/edit`
 * address the same fursona, and only one of them would work otherwise.
 *
 * **The handle is editable here.** Renaming retires the old one rather than
 * releasing it, so `/{address}/{old}` answers 404 for good instead of until
 * somebody takes the name again — see `retired_handles` in `0007`.
 *
 * It reads the person's own profile theme as well as this fursona's, because a
 * theme belongs to one actor: the two are unrelated rows, which is exactly why
 * the panel offers to copy one onto the other.
 *
 * @returns the edit page, or a 404 when no owned, active fursona matches.
 */
export default async function EditFursonaPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const actors = await listMyActors(await createServerClient());
  const actor = actors.find(
    (a) =>
      a.kind === "fursona" &&
      a.status === "active" &&
      a.handle.toLowerCase() === handle.toLowerCase(),
  );
  if (!actor) notFound();

  const t = await getTranslations("fursonas");

  // Loaded and handed to the editor, which is not optional: `set_actor_sections`
  // REPLACES, so an editor that opened without them would delete everything
  // this fursona had written the first time somebody pressed save.
  const page = await readActorPage(await createServerClient(), actor.actorRef);
  // For the panel's "use my profile's look". A separate read because a theme
  // belongs to one actor: this fursona's and its owner's are unrelated rows.
  const profileTheme = await readMyProfileTheme(await createServerClient());

  return (
    <FursonaEditor
      labels={await fursonaEditorLabels(t("editorTitleEdit"))}
      handleEditable
      actorRef={actor.actorRef}
      initial={{
        handle: actor.handle,
        displayName: actor.displayName ?? "",
        avatarUrl: actor.avatarUrl ?? "",
        visibility: actor.visibility,
      }}
      initialSections={page.sections}
      initialTheme={page.theme}
      profileTheme={profileTheme}
    />
  );
}
