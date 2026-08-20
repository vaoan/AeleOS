import { getTranslations } from "next-intl/server";
import {
  FursonaEditor,
  ensurePersonActor,
  getPersonActor,
  readActorPage,
  readMyAddress,
} from "@/features/actors";
import { fursonaEditorLabels } from "@/app/[locale]/(app)/pages/labels";
import { createServerClient } from "@/shared/infrastructure/supabase-server";
import { env } from "@/shared/infrastructure/env";

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
 * **It builds the `PageContext` the renderer threads**, resolving `parentHost`
 * from `env.hubHost`: every section previews itself with the real renderer,
 * and Twitch refuses to load a player unless `parent=` names the embedding
 * domain. One object rather than one prop per value — see `PageContext` in
 * `presentation/blocks.tsx` for why it is threaded by hand rather than
 * provided by a React context.
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
 * **The context it builds now feeds the identity leaves too**, so a preview
 * shows a real portrait and a real handle. The three fields somebody can type
 * are overridden inside the editor from the live form — see `FursonaEditor` —
 * because a context resolved on the server holds what was SAVED.
 *
 *
 * The context also carries the page's MEASURE, which the block renderer
 * reads to lay each top-level section out in the author's chosen width.
 *
 * @returns the editor.
 *
 * **The fursona list's fallback heading comes from `publicProfile`**, the same
 * key the public route reads. The editor previews with the real renderer, so a
 * string of its own would be a preview that disagrees with the page. It asked
 * `fursonas.fursonas` before, which existed in neither catalogue and rendered
 * its own key path where a heading belonged.
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
  const page = await readActorPage(client, actorRef, "person");
  const t = await getTranslations("fursonas");
  // **The SAME key the public route reads.** This is the heading over the
  // fursona list when its author has written none, and the editor previews
  // with the real renderer — so a second string here would be a preview that
  // disagrees with the page. `fursonas.fursonas` never existed in either
  // catalogue and rendered its own key path at somebody.
  const tPublic = await getTranslations("publicProfile");

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
      // Twitch's player needs to know the domain embedding it, and every
      // section's live preview is the real renderer — which now includes the
      // identity leaves, so this carries what they draw from.
      //
      // The three fields somebody can TYPE are overridden inside the editor
      // from the live form, so a preview never shows the portrait they had
      // before they started. What is here is what the form cannot change.
      //
      // `fursonas` is empty rather than absent: absent means "not this page
      // kind" and would make the block vanish, where empty draws its heading.
      // The real list is a public read this route does not make.
      page={{
        parentHost: env.hubHost,
        actorKind: "person",
        handle: person?.handle ?? "",
        address: (await readMyAddress(await createServerClient())) ?? "",
        displayName: person?.displayName ?? null,
        avatarUrl: person?.avatarUrl ?? null,
        fursonas: [],
        measure: page.theme.measure,
        fursonasFallbackTitle: tPublic("fursonas"),
      }}
    />
  );
}
