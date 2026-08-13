"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSupabaseBrowserClient } from "@/shared/infrastructure/supabase-browser";
import {
  deleteFursona,
  setFursonaFeatured,
  setFursonaOrder,
} from "@/features/actors/infrastructure/fursona-arrangement";
import { FURSONAS_QUERY_KEY } from "@/features/actors/application/use-fursonas";

/** Which fursona to move, and where to. */
export interface ReorderInput {
  /** The fursona's platform ID. */
  actorRef: string;
  /** Its new position in the owner's list. */
  sortOrder: number;
}

/** Which fursona to pin, and whether to pin it. */
export interface PinInput {
  /** The fursona's platform ID. */
  actorRef: string;
  /** True to pin it first, false to unpin. */
  featured: boolean;
}

/**
 * The three writes the fursona list can perform.
 *
 * Every one invalidates the list on success. Without that a deleted row stays on
 * screen and the next click lands on something already gone, and a reordered
 * list snaps back on the next render, which reads as the drag having failed.
 *
 * None of them swallow a refusal. `0012` raises the same `fursona not found` for
 * a row that is missing, someone else's, or inactive — deliberately
 * indistinguishable, so a caller cannot probe which refs are real — but the
 * caller must still be told that nothing happened.
 *
 * @returns the delete, reorder and pin mutations.
 */
export function useFursonaMutations() {
  const client = useSupabaseBrowserClient();
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: [FURSONAS_QUERY_KEY] });

  const remove = useMutation({
    mutationFn: (actorRef: string) => deleteFursona(client, actorRef),
    onSuccess: invalidate,
  });

  const reorder = useMutation({
    mutationFn: ({ actorRef, sortOrder }: ReorderInput) =>
      setFursonaOrder(client, actorRef, sortOrder),
    onSuccess: invalidate,
  });

  const pin = useMutation({
    mutationFn: ({ actorRef, featured }: PinInput) =>
      setFursonaFeatured(client, actorRef, featured),
    onSuccess: invalidate,
  });

  return { remove, reorder, pin };
}
