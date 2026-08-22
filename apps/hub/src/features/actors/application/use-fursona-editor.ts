"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useSupabaseBrowserClient } from "@/shared/infrastructure/supabase-browser";
import {
  createFursona,
  updateFursona,
  FursonaLimitError,
  HandleRetiredError,
  HandleTakenError,
} from "@/features/actors/infrastructure/fursonas";
import {
  PageRefusedError,
  setFursonaSections,
} from "@/features/actors/infrastructure/fursona-arrangement";
import { FURSONAS_QUERY_KEY } from "@/features/actors/application/use-fursonas";
import type { FursonaInput } from "@/features/actors/domain/fursona-schema";
import type { Block } from "@/features/actors/domain/block-schema";
import type { ActorTheme } from "@/features/actors/domain/actor-theme";
import { setActorTheme } from "@/features/actors/infrastructure/actor-theme";
import { updateMyProfile } from "@/features/actors/infrastructure/my-profile";

/** Everything one save writes: the fields, the page's blocks, its theme. */
export type FursonaDraft = FursonaInput & {
  /** The page, as a tree of blocks. */
  sections: Block[];
  /** How the page looks. */
  theme: ActorTheme;
};

/**
 * What {@link useFursonaEditor} returns.
 *
 * `save` reports success rather than leaving a caller to infer it from
 * `fieldErrors`, and that distinction is the whole shape of this interface —
 * see the property's own note for the bug it exists to prevent.
 */
export interface FursonaEditorState {
  /**
   * Saves the fursona, creating or updating as the ref decides.
   *
   * Returns **true** only when everything landed. A caller must not decide
   * whether to navigate by reading `fieldErrors` after awaiting this: that
   * value is captured from the render that built the handler, so it is still
   * empty when the save fails, and the editor once navigated away on a refusal
   * and took somebody's typing with it.
   */
  save: (values: FursonaDraft) => Promise<boolean>;
  /** True while a save is in flight, so the toolbar can refuse a second one. */
  saving: boolean;
  /** Refusals the person can act on, keyed by field or by the reserved `form`. */
  fieldErrors: Record<string, string>;
}

/**
 * Saving a fursona, from the browser.
 *
 * Replaces the server actions this used to go through. The editor is a
 * react-hook-form form calling a mutation, and phase 4b's sections need
 * `useFieldArray` — which a server action cannot drive.
 *
 * **Authorisation is unchanged by the move.** `create_fursona` and
 * `update_fursona` are `security definer` and derive the owner from the token,
 * so they never trusted the caller's word about who they are; only the call
 * site moved.
 *
 * A save is **three writes**: the four fields, then the sections, then the
 * theme. On create the order is forced, because the last two need an
 * `actor_ref` that does not exist until the fursona does.
 *
 * The theme is written here rather than the moment a colour changes, and the
 * distinction is worth keeping straight: what has to be instant is SEEING the
 * change. The configurator updates the form value; its parent
 * `PreviewThemeHost` applies `previewThemeCss`, which shares declaration
 * sources with the public page's `themeCss` without styling the editor
 * document. Persisting on every frame of a dragged colour slider would be a
 * write per frame, which is a different thing entirely and one a free-tier
 * database would not thank us for.
 *
 * That admits a partial failure — fields written, sections refused — and it is
 * reported rather than undone. On create the fursona already exists, and
 * deleting it to roll back would spend a handle from a namespace that never
 * reclaims one; a fursona with no sections yet is the better of the two states.
 * `set_actor_sections` replaces rather than merges, so simply saving again
 * finishes the job.
 *
 * Three refusals become field errors because the person can act on them: a taken
 * handle, the quota, and a page the database would not hold. **Everything else is left to propagate**, exactly as
 * the server action did — swallowing an unrecognised fault would turn it into a
 * save that silently did nothing, which is the worst outcome available here.
 *
 * A retired handle is reported on the handle field with its own code, because
 * it is a different situation from a taken one: nothing wears the name, and it
 * is being kept out of circulation so links shared under it keep answering 404.
 *
 * **A page this build could not READ refuses the save outright**, before any
 * of the three writes. `set_actor_sections` replaces rather than merges and an
 * empty tree is a valid tree, so an editor that opened on a page it could not
 * parse and then saved would write `[]` over it: the RPC succeeds, nothing
 * warns, and the page is gone. That is not the same failure as a refused
 * section write below — nothing was wrong with what the person typed, and
 * there is nothing they can fix — so it is a NO-OP with a reason rather than a
 * partial save. `readActorPage` is what knows; see {@link ActorPage.sections}
 * for why `null` and `[]` had to stop being the same answer.
 *
 * @param actorRef - the actor being edited, or absent to create a fursona.
 * @param kind - whether the actor is the person themselves, which changes
 * which function writes the fields and nothing else.
 * @param pageIsReadable - false when the stored page could not be parsed, which
 * refuses every save on this actor rather than replacing the page with nothing.
 * Absent means yes, which is the ordinary case and the only possible answer on
 * the create page.
 * **The actor kind reaches the save**, because which blocks a page must
 * carry depends on it — `setFursonaSections` refuses an incomplete page before
 * the round trip, and inferring the kind from the tree would read a page
 * missing its `owner` as a person's and accept it.
 *
 * @returns the save function, whether one is in flight, and any field errors.
 */
export function useFursonaEditor(
  actorRef?: string,
  kind: "fursona" | "person" = "fursona",
  pageIsReadable = true,
): FursonaEditorState {
  const client = useSupabaseBrowserClient();
  const queryClient = useQueryClient();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const mutation = useMutation({
    // Two writes, and the order is forced on create: set_actor_sections needs
    // an actor_ref that does not exist until the fursona does.
    mutationFn: async ({ sections, theme, ...fields }: FursonaDraft) => {
      // **A person is updated through a function that takes no actor
      // reference**, because deriving the target from the token IS its
      // authorization — a caller cannot name somebody else's row. That is also
      // why a person can never be created here: they are provisioned on first
      // sign-in and there is exactly one.
      const ref =
        kind === "person"
          ? actorRef!
          : (actorRef ?? (await createFursona(client, fields)));
      if (kind === "person") await updateMyProfile(client, fields);
      else if (actorRef) await updateFursona(client, actorRef, fields);
      await setFursonaSections(client, ref, sections, kind);
      await setActorTheme(client, ref, theme);
    },
    // The list must forget what it knew, or somebody returns to a page that
    // does not have the fursona they just made.
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [FURSONAS_QUERY_KEY] }),
  });

  const save = async (values: FursonaDraft): Promise<boolean> => {
    // **Before any write, and it must stay before any write.** The editor is
    // holding `[]` for a page it could not read, and every one of the three
    // writes below would land — the fields, then `[]` over the whole page,
    // then the theme. Refusing the save entirely is the only answer that
    // cannot lose anything: a partial save would leave somebody believing the
    // sections they can no longer see are still there, which is exactly what
    // they would be, until the next save.
    if (!pageIsReadable) {
      setFieldErrors({ form: "pageUnreadable" });
      return false;
    }
    try {
      await mutation.mutateAsync(values);
      // Cleared on success, so a fixed handle stops being reported as taken.
      setFieldErrors({});
      return true;
    } catch (error) {
      if (error instanceof HandleRetiredError) {
        setFieldErrors({ handle: "handleRetired" });
        return false;
      }
      if (error instanceof HandleTakenError) {
        setFieldErrors({ handle: "handleTaken" });
        return false;
      }
      if (error instanceof FursonaLimitError) {
        setFieldErrors({ form: "limitReached" });
        return false;
      }
      // A page write the database refused. The fursona itself may already
      // exist — on create it certainly does — and that is a state to report
      // rather than undo: deleting a just-created fursona would spend a handle
      // from a namespace that never reclaims one, which is worse than a
      // fursona with no sections yet. The caller keeps the person on the page
      // with their writing intact, and a second Save simply replaces.
      //
      // **Matched on the CLASS, never on the message, and that is a fix.**
      // This was `/section|too many|too large|too long/i`, written when every
      // refusal `set_actor_sections` could raise carried the word "section".
      // Every per-block message begins `block N:` now and none of them
      // contains any of those four words, so the commonest refusal stopped
      // matching, threw straight past this handler, and left the fields
      // written and the banner empty. `PageRefusedError` is built from the
      // SQLSTATE the migration sets on purpose; see its own doc.
      if (error instanceof PageRefusedError) {
        setFieldErrors({ form: "sectionsRefused" });
        return false;
      }
      throw error;
    }
  };

  return { save, saving: mutation.isPending, fieldErrors };
}
