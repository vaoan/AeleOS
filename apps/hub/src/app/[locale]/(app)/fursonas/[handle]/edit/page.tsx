import { createServerClient } from "@/shared/infrastructure/supabase-server";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { FursonaEditor, listMyActors } from "@/features/actors";
import { fursonaEditorLabels } from "@/app/[locale]/(app)/fursonas/labels";

/**
 * The page for editing one of your fursonas.
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

  return (
    <FursonaEditor
      labels={await fursonaEditorLabels(t("editorTitleEdit"))}
      handleEditable={false}
      actorRef={actor.actorRef}
      initial={{
        handle: actor.handle,
        displayName: actor.displayName ?? "",
        avatarUrl: actor.avatarUrl ?? "",
        visibility: actor.visibility,
      }}
    />
  );
}
