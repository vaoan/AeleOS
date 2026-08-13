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
import { FURSONAS_QUERY_KEY } from "@/features/actors/application/use-fursonas";
import type { FursonaInput } from "@/features/actors/domain/fursona-schema";

/** What {@link useFursonaEditor} returns. */
export interface FursonaEditorState {
  /** Saves the fursona, creating or updating as the ref decides. */
  save: (values: FursonaInput) => Promise<void>;
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
 * Two refusals become field errors because the person can act on them: a taken
 * handle, and the quota. **Everything else is left to propagate**, exactly as
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
    mutationFn: (values: FursonaInput) =>
      actorRef
        ? updateFursona(client, actorRef, values)
        : createFursona(client, values).then(() => undefined),
    // The list must forget what it knew, or somebody returns to a page that
    // does not have the fursona they just made.
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [FURSONAS_QUERY_KEY] }),
  });

  const save = async (values: FursonaInput): Promise<void> => {
    try {
      await mutation.mutateAsync(values);
      // Cleared on success, so a fixed handle stops being reported as taken.
      setFieldErrors({});
    } catch (error) {
      if (error instanceof HandleTakenError) {
        setFieldErrors({ handle: "handleTaken" });
        return;
      }
      if (error instanceof FursonaLimitError) {
        setFieldErrors({ form: "limitReached" });
        return;
      }
      throw error;
    }
  };

  return { save, saving: mutation.isPending, fieldErrors };
}
