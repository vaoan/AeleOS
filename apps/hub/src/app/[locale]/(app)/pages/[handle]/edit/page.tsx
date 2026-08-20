import { createServerClient } from "@/shared/infrastructure/supabase-server";
import { env } from "@/shared/infrastructure/env";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  FursonaEditor,
  listMyActors,
  readActorPage,
  readMyAddress,
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
 * **It builds the `PageContext` the renderer threads**, resolving
 * `parentHost` from `env.hubHost`, the same way both public
 * routes do. Every section in the editor previews itself with the real
 * renderer, and one leaf kind reads that value: Twitch refuses to load a
 * player unless `parent=` names the embedding domain. Deployment configuration
 * is not something a client component can resolve for itself, so the route
 * does it.
 *
 * **The page it reads comes back with its identity blocks**, supplied by
 * `withRequiredBlocks` when the stored page names none — so the editor holds
 * real blocks from the moment it opens and its first save writes them.
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
 * @returns the edit page, or a 404 when no owned, active fursona matches.
 *
 * **The fursona list's fallback heading comes from `publicProfile`**, the same
 * key the public route reads. The editor previews with the real renderer, so a
 * string of its own would be a preview that disagrees with the page. It asked
 * `fursonas.fursonas` before, which existed in neither catalogue and rendered
 * its own key path where a heading belonged.
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
  // **The SAME key the public route reads.** This is the heading over the
  // fursona list when its author has written none, and the editor previews
  // with the real renderer — so a second string here would be a preview that
  // disagrees with the page. `fursonas.fursonas` never existed in either
  // catalogue and rendered its own key path at somebody.
  const tPublic = await getTranslations("publicProfile");

  // Loaded and handed to the editor, which is not optional: `set_actor_sections`
  // REPLACES, so an editor that opened without them would delete everything
  // this fursona had written the first time somebody pressed save.
  const page = await readActorPage(
    await createServerClient(),
    actor.actorRef,
    "fursona",
  );
  // For the panel's "use my profile's look". A separate read because a theme
  // belongs to one actor: this fursona's and its owner's are unrelated rows.
  const profileTheme = await readMyProfileTheme(await createServerClient());
  // The address this fursona's public page sits under, so an `owner` block
  // previews with the link it will actually carry. Empty is survivable — the
  // preview shows a link to nowhere, which is what a person with no address
  // yet genuinely has.
  const ownerAddress = (await readMyAddress(await createServerClient())) ?? "";

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
      // Twitch's player needs to know the domain embedding it, and every
      // section's live preview is the real renderer — which now includes the
      // identity leaves, so this carries what they draw from.
      //
      // The typed fields are overridden inside the editor from the live form.
      // `owner` is not among them: a fursona's owner is not something its
      // editor can change. Its name and picture are null here because this
      // route reads the OWNER's row for nothing else, and the preview shows
      // what a visitor sees when that person's profile is private.
      page={{
        parentHost: env.hubHost,
        actorKind: "fursona",
        handle: actor.handle,
        address: ownerAddress,
        displayName: actor.displayName ?? null,
        avatarUrl: actor.avatarUrl ?? null,
        owner: { address: ownerAddress, displayName: null, avatarUrl: null },
        measure: page.theme.measure,
        fursonasFallbackTitle: tPublic("fursonas"),
      }}
    />
  );
}
