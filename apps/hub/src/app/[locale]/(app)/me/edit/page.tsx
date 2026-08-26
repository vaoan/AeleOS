import { getTranslations } from "next-intl/server";
import {
  FursonaEditor,
  ensurePersonActor,
  getPersonActor,
  readActorPage,
  readMyAddress,
  readPublicPerson,
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
 * **It reads its own public profile for the `fursonas` list**, through
 * `readPublicPerson` — the same `public_person` a stranger reads, so the
 * public-only rule `0012` enforces is asked rather than copied here. The list
 * used to be hardcoded empty, which made the REQUIRED `fursonas` block preview
 * as a heading over nothing while the page carried a grid of cards: 330px
 * against 72px, measured by photographing the two.
 *
 * The consequence to know is that a person whose profile is still `private` —
 * the minted default — previews an empty list, because there is no public page
 * for them yet. That is honest and it is not obviously the kindest answer; the
 * alternative is filtering `listMyActors` by visibility, which is that same
 * rule copied into a route and free to drift from it.
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
  const address = (await readMyAddress(client)) ?? "";
  // **The characters a stranger would see listed here, asked of the thing that
  // decides which those are.** `public_person` returns the PUBLIC fursonas
  // only; filtering `listMyActors` by visibility here would be a second copy
  // of `0012`'s rule, free to drift from it. A private profile has no public
  // page and answers nothing, so its preview keeps the empty list it has
  // always shown.
  const publicProfile = address ? await readPublicPerson(address) : undefined;

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
      // `fursonas` is a list rather than absent: absent means "not this page
      // kind" and would make the block vanish, where an empty list draws its
      // heading. It used to be hardcoded empty, which made the required
      // `fursonas` block a heading over nothing in every preview while the
      // page itself carried a grid of cards.
      page={{
        parentHost: env.hubHost,
        actorKind: "person",
        handle: person?.handle ?? "",
        address,
        displayName: person?.displayName ?? null,
        avatarUrl: person?.avatarUrl ?? null,
        fursonas: publicProfile?.fursonas ?? [],
        measure: page.theme.measure,
        fursonasFallbackTitle: tPublic("fursonas"),
      }}
    />
  );
}
