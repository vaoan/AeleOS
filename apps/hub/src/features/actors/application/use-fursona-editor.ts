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
import { setFursonaSections } from "@/features/actors/infrastructure/fursona-arrangement";
import { FURSONAS_QUERY_KEY } from "@/features/actors/application/use-fursonas";
import type { FursonaInput } from "@/features/actors/domain/fursona-schema";
import type { FursonaSection } from "@/features/actors/domain/section-schema";
import type { ActorTheme } from "@/features/actors/domain/actor-theme";
import { setActorTheme } from "@/features/actors/infrastructure/actor-theme";
import { updateMyProfile } from "@/features/actors/infrastructure/my-profile";

/** Everything one save writes: the fields, the page's sections, its theme. */
export type FursonaDraft = FursonaInput & {
  /** The page's sections. */
  sections: FursonaSection[];
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
 * change, which the configurator does locally with the same `themeCss` the
 * public page uses. Persisting on every frame of a dragged colour slider would
 * be a write per frame, which is a different thing entirely and one a free-tier
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
 * handle, the quota, and a section the database would not hold. **Everything else is left to propagate**, exactly as
 * the server action did — swallowing an unrecognised fault would turn it into a
 * save that silently did nothing, which is the worst outcome available here.
 *
 * A retired handle is reported on the handle field with its own code, because
 * it is a different situation from a taken one: nothing wears the name, and it
 * is being kept out of circulation so links shared under it keep answering 404.
 *
 * @param actorRef - the actor being edited, or absent to create a fursona.
 * @param kind - whether the actor is the person themselves, which changes
 * which function writes the fields and nothing else.
 * @returns the save function, whether one is in flight, and any field errors.
 */
export function useFursonaEditor(
  actorRef?: string,
  kind: "fursona" | "person" = "fursona",
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
      await setFursonaSections(client, ref, sections);
      await setActorTheme(client, ref, theme);
    },
    // The list must forget what it knew, or somebody returns to a page that
    // does not have the fursona they just made.
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [FURSONAS_QUERY_KEY] }),
  });

  const save = async (values: FursonaDraft): Promise<boolean> => {
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
      // A section write that the database refused. The fursona itself may
      // already exist — on create it certainly does — and that is a state to
      // report rather than undo: deleting a just-created fursona would spend a
      // handle from a namespace that never reclaims one, which is worse than a
      // fursona with no sections yet. The caller keeps the person on the page
      // with their writing intact, and a second Save simply replaces.
      if (
        error instanceof Error &&
        /section|too many|too large|too long/i.test(error.message)
      ) {
        setFieldErrors({ form: "sectionsRefused" });
        return false;
      }
      throw error;
    }
  };

  return { save, saving: mutation.isPending, fieldErrors };
}
