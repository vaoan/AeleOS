import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const readArrangement = vi.fn();
const readMyActors = vi.fn();
const deleteFursona = vi.fn();
const setFursonaOrder = vi.fn();
const setFursonaFeatured = vi.fn();
vi.mock("@/features/actors/infrastructure/fursona-arrangement", () => ({
  readArrangement: (...a: unknown[]) => readArrangement(...a),
  readMyActors: (...a: unknown[]) => readMyActors(...a),
  deleteFursona: (...a: unknown[]) => deleteFursona(...a),
  setFursonaOrder: (...a: unknown[]) => setFursonaOrder(...a),
  setFursonaFeatured: (...a: unknown[]) => setFursonaFeatured(...a),
}));
vi.mock("@/shared/infrastructure/supabase-browser", () => ({
  useSupabaseBrowserClient: () => ({}),
}));

const { useFursonas } =
  await import("@/features/actors/application/use-fursonas");
const { useFursonaMutations } =
  await import("@/features/actors/application/use-fursona-mutations");

let queryClient: QueryClient;

/**
 * A provider wrapper with a fresh client per test.
 *
 * @returns the wrapped tree.
 */
function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const rows = [
  {
    actorRef: "ref-1",
    kind: "fursona" as const,
    handle: "sparky",
    displayName: "Sparky",
    avatarUrl: null,
    visibility: "private" as const,
    status: "active" as const,
  },
];

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  readArrangement.mockReset();
  readArrangement.mockResolvedValue([]);
  readMyActors.mockReset();
  readMyActors.mockResolvedValue(rows);
  deleteFursona.mockReset();
  deleteFursona.mockResolvedValue(undefined);
  setFursonaOrder.mockReset();
  setFursonaOrder.mockResolvedValue(undefined);
  setFursonaFeatured.mockReset();
  setFursonaFeatured.mockResolvedValue(undefined);
});

describe("useFursonas", () => {
  // The deviation this phase is built on: the server already fetched these, so
  // the first render must show them rather than a skeleton.
  it("shows the server's rows immediately, with no fetch first", () => {
    const { result } = renderHook(() => useFursonas(rows), { wrapper });
    expect(result.current.rows).toEqual(rows);
    expect(readMyActors).not.toHaveBeenCalled();
  });

  // The rows must be a real query, not a pass-through of `initial`. A
  // pass-through has nothing for the mutations to invalidate, so a deleted
  // fursona would stay on screen until a full page reload — which reads as the
  // delete having silently failed.
  it("refetches the rows when the list is invalidated", async () => {
    readMyActors.mockResolvedValueOnce([]);
    const { result } = renderHook(() => useFursonas(rows), { wrapper });
    await queryClient.invalidateQueries({ queryKey: ["fursonas"] });
    await waitFor(() => {
      expect(result.current.rows).toEqual([]);
    });
  });

  it("reads the arrangement", async () => {
    readArrangement.mockResolvedValueOnce([
      { actorRef: "ref-1", sortOrder: 1, featured: true },
    ]);
    const { result } = renderHook(() => useFursonas(rows), { wrapper });
    await waitFor(() => {
      expect(result.current.arrangement).toHaveLength(1);
    });
  });
});

describe("useFursonaMutations", () => {
  it("deletes through the infrastructure function", async () => {
    const { result } = renderHook(() => useFursonaMutations(), { wrapper });
    await result.current.remove.mutateAsync("ref-1");
    expect(deleteFursona).toHaveBeenCalledWith({}, "ref-1");
  });

  it("reorders through the infrastructure function", async () => {
    const { result } = renderHook(() => useFursonaMutations(), { wrapper });
    await result.current.reorder.mutateAsync({
      actorRef: "ref-1",
      sortOrder: 2,
    });
    expect(setFursonaOrder).toHaveBeenCalledWith({}, "ref-1", 2);
  });

  it("pins through the infrastructure function", async () => {
    const { result } = renderHook(() => useFursonaMutations(), { wrapper });
    await result.current.pin.mutateAsync({
      actorRef: "ref-1",
      featured: true,
    });
    expect(setFursonaFeatured).toHaveBeenCalledWith({}, "ref-1", true);
  });

  // Without the invalidation the row stays on screen after being deleted, and
  // the next click lands on something that is already gone.
  it("invalidates the list afterwards, so the row leaves the page", async () => {
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useFursonaMutations(), { wrapper });
    await result.current.remove.mutateAsync("ref-1");
    expect(spy).toHaveBeenCalledWith({ queryKey: ["fursonas"] });
  });

  it("surfaces a refusal rather than swallowing it", async () => {
    deleteFursona.mockRejectedValueOnce(new Error("fursona not found"));
    const { result } = renderHook(() => useFursonaMutations(), { wrapper });
    await expect(result.current.remove.mutateAsync("ref-1")).rejects.toThrow(
      /fursona not found/,
    );
  });
});
