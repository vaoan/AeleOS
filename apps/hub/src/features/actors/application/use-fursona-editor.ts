"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useSupabaseBrowserClient } from "@/shared/infrastructure/supabase-browser";
import {
  createFursona,
  updateFursona,
  FursonaLimitError,
  HandleTakenError,
} from "@/features/actors/infrastructure/fursonas";
import { setFursonaSections } from "@/features/actors/infrastructure/fursona-arrangement";
import { FURSONAS_QUERY_KEY } from "@/features/actors/application/use-fursonas";
import type { FursonaInput } from "@/features/actors/domain/fursona-schema";
import type { FursonaSection } from "@/features/actors/domain/section-schema";

/** Everything one save writes: the four fields, and the page's sections. */
export type FursonaDraft = FursonaInput & { sections: FursonaSection[] };

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
 * A save is **two writes**: the four fields, then the sections. On create the
 * order is forced, because `set_fursona_sections` needs an `actor_ref` that
 * does not exist until the fursona does.
 *
 * That admits a partial failure — fields written, sections refused — and it is
 * reported rather than undone. On create the fursona already exists, and
 * deleting it to roll back would spend a handle from a namespace that never
 * reclaims one; a fursona with no sections yet is the better of the two states.
 * `set_fursona_sections` replaces rather than merges, so simply saving again
 * finishes the job.
 *
 * Three refusals become field errors because the person can act on them: a taken
 * handle, the quota, and a section the database would not hold. **Everything else is left to propagate**, exactly as
 * the server action did — swallowing an unrecognised fault would turn it into a
 * save that silently did nothing, which is the worst outcome available here.
 *
 * @param actorRef - the fursona being edited, or absent to create one.
 * @returns the save function, whether one is in flight, and any field errors.
 */
export function useFursonaEditor(actorRef?: string): FursonaEditorState {
  const client = useSupabaseBrowserClient();
  const queryClient = useQueryClient();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const mutation = useMutation({
    // Two writes, and the order is forced on create: set_fursona_sections needs
    // an actor_ref that does not exist until the fursona does.
    mutationFn: async ({ sections, ...fields }: FursonaDraft) => {
      const ref = actorRef ?? (await createFursona(client, fields));
      if (actorRef) await updateFursona(client, actorRef, fields);
      await setFursonaSections(client, ref, sections);
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
