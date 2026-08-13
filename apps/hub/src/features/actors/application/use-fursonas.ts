"use client";

import { useQuery } from "@tanstack/react-query";
import { useSupabaseBrowserClient } from "@/shared/infrastructure/supabase-browser";
import {
  readArrangement,
  readMyActors,
  type Arrangement,
} from "@/features/actors/infrastructure/fursona-arrangement";
import type { Actor } from "@/features/actors/infrastructure/fursonas";

/** The cache key every fursona query and mutation agrees on. */
export const FURSONAS_QUERY_KEY = "fursonas";

/**
 * How long the server's rows are trusted before a background refetch.
 *
 * The seed came from this very request, so refetching it immediately is pure
 * waste. Long enough that arriving, looking, and leaving costs one read; short
 * enough that a list left open in a tab catches up on its own.
 */
const SEED_TRUSTED_FOR_MS = 30_000;

/** What {@link useFursonas} returns. */
export interface FursonaListData {
  /** The person's actors, their own row first. */
  rows: Actor[];
  /** Arrangement for the fursonas that have any. */
  arrangement: Arrangement[];
}

/**
 * The fursona list, seeded from the server render.
 *
 * `initial` is what the server component already fetched, so the first paint
 * shows real rows rather than a skeleton — the one place this port deliberately
 * departs from Libra's studio, which fetches in the browser and shows bars while
 * it does.
 *
 * **The rows are a real query, not a pass-through of `initial`.** That is what
 * gives the mutations something to invalidate: with a pass-through, a deleted
 * fursona would stay on screen until a full page reload, which reads as the
 * delete having silently failed. `initialData` keeps the first paint instant
 * anyway, so nothing is lost by doing it properly.
 *
 * The arrangement is a second query because it comes from a second table; see
 * `readArrangement` for why `0012` did not join them.
 *
 * @param initial - the rows the server rendered with.
 * @returns the rows and their arrangement.
 */
export function useFursonas(initial: Actor[]): FursonaListData {
  const client = useSupabaseBrowserClient();

  const rows = useQuery({
    queryKey: [FURSONAS_QUERY_KEY, "rows"],
    queryFn: () => readMyActors(client),
    initialData: initial,
    // Without this the seed is stale the instant it lands, so every visit
    // refetches a list the server just sent — a wasted round trip on a free
    // tier, and one this page has never needed. Invalidation ignores
    // staleTime, so the mutations still force the refetch they rely on.
    staleTime: SEED_TRUSTED_FOR_MS,
  });

  const arrangement = useQuery({
    queryKey: [FURSONAS_QUERY_KEY, "arrangement"],
    queryFn: () => readArrangement(client),
    // Deliberately no staleTime, and `[]` is a placeholder rather than a seed:
    // the server never fetched this, so it must be read at once. An empty
    // arrangement and a not-yet-read one look the same on screen — everything
    // in handle order — which is why this one may fetch immediately and the
    // rows may not.
    initialData: [] as Arrangement[],
  });

  return { rows: rows.data, arrangement: arrangement.data };
}
