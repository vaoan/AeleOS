import { getTranslations } from "next-intl/server";
import {
  ensurePersonActor,
  FursonaEditor,
  readMyAddress,
  readMyProfileTheme,
  readPublicPerson,
} from "@/features/actors";
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
 * **It carries an `owner` even though nothing has been created yet**, because
 * whoever is signed in will own whatever this form makes — read through
 * `readPublicPerson`, exactly as the edit route does it. Omitting the key did
 * not preview an empty owner card: `OwnerLeaf` returns null without one, so a
 * block every fursona page must carry rendered NOTHING on the one screen where
 * somebody is deciding where to put it.
 *
 * **It calls `ensurePersonActor()` first, for the same reason `/pages` does
 * and found the same way `/pages`'s own TSDoc already names: somebody can
 * arrive here from another app having never opened `/me` or `/pages` at
 * all.** Without it, a person with no address row yet reads `readMyAddress`
 * as `null`, `ownerAddress` falls back to `""`, and `OwnerLeaf` links to
 * `/${""}` with nothing inside it — a link with no accessible name, found
 * by `a11y.spec.ts`'s source-dock case the first time anything scanned this
 * route without visiting `/me` first. The call is idempotent, so a person who
 * did already visit `/me` pays nothing extra for it.
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
  await ensurePersonActor();
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
  // **The owner is known before the fursona is.** Whoever is signed in will own
  // whatever this form creates, and `owner` is a block every fursona page must
  // carry — so leaving it out did not preview an empty owner card, it made a
  // REQUIRED block render nothing at all, on the one screen where somebody is
  // deciding where to put it. The address is the same read, and it is what the
  // card links to.
  const ownerAddress = (await readMyAddress(await createServerClient())) ?? "";
  const ownerProfile = ownerAddress
    ? await readPublicPerson(ownerAddress)
    : undefined;
  return (
    <FursonaEditor
      labels={await fursonaEditorLabels(t("editorTitleNew"))}
      handleEditable
      profileTheme={profileTheme}
      // Twitch's player needs to know the domain embedding it, and every
      // section's live preview is the real renderer — which now includes the
      // identity leaves.
      //
      // The fursona's own fields are empty and that is correct: nothing has
      // been created yet, and the editor overrides them from the live form as
      // somebody writes. The OWNER is not in that category — it is whoever is
      // signed in, and it is known now.
      page={{
        parentHost: env.hubHost,
        actorKind: "fursona",
        handle: "",
        address: ownerAddress,
        displayName: null,
        avatarUrl: null,
        owner: {
          address: ownerAddress,
          displayName: ownerProfile?.displayName ?? null,
          avatarUrl: ownerProfile?.avatarUrl ?? null,
        },
        measure: null,
        fursonasFallbackTitle: tPublic("fursonas"),
      }}
    />
  );
}
