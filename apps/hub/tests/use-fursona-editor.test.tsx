import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

class HandleTakenError extends Error {}
class FursonaLimitError extends Error {}

const createFursona = vi.fn<(...a: unknown[]) => unknown>();
const updateFursona = vi.fn<(...a: unknown[]) => unknown>();
const setFursonaSections = vi.fn<(...a: unknown[]) => unknown>();
vi.mock("@/features/actors/infrastructure/fursona-arrangement", () => ({
  setFursonaSections: (...a: unknown[]) => setFursonaSections(...a),
}));
vi.mock("@/features/actors/infrastructure/fursonas", () => ({
  createFursona: (...a: unknown[]) => createFursona(...a),
  updateFursona: (...a: unknown[]) => updateFursona(...a),
  HandleTakenError,
  FursonaLimitError,
}));
vi.mock("@/shared/infrastructure/supabase-browser", () => ({
  useSupabaseBrowserClient: () => ({}),
}));

const { useFursonaEditor } =
  await import("@/features/actors/application/use-fursona-editor");

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

const fields = {
  handle: "sparky",
  displayName: "Sparky",
  avatarUrl: "",
  visibility: "private" as const,
};

const sections = [
  {
    name_en: "About",
    type: "cards" as const,
    sort_order: 1,
    items: [],
  },
];

/** One save's worth: the four fields and the page's sections. */
const values = { ...fields, sections };

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  createFursona.mockReset();
  createFursona.mockResolvedValue("new-ref");
  updateFursona.mockReset();
  updateFursona.mockResolvedValue(undefined);
  setFursonaSections.mockReset();
  setFursonaSections.mockResolvedValue(undefined);
});

describe("useFursonaEditor", () => {
  it("creates when it has no actor ref", async () => {
    const { result } = renderHook(() => useFursonaEditor(), { wrapper });
    await result.current.save(values);
    expect(createFursona).toHaveBeenCalledWith({}, fields);
    expect(updateFursona).not.toHaveBeenCalled();
  });

  it("updates when it has one", async () => {
    const { result } = renderHook(() => useFursonaEditor("ref-1"), { wrapper });
    await result.current.save(values);
    expect(updateFursona).toHaveBeenCalledWith({}, "ref-1", fields);
    expect(createFursona).not.toHaveBeenCalled();
  });

  // The order is forced: set_actor_sections needs an actor_ref that does not
  // exist until the fursona does, so create must land first and its returned
  // ref is what the sections are written against.
  it("creates the fursona first, then writes its sections against the new ref", async () => {
    const { result } = renderHook(() => useFursonaEditor(), { wrapper });
    await result.current.save(values);
    expect(setFursonaSections).toHaveBeenCalledWith({}, "new-ref", sections);
    expect(createFursona.mock.invocationCallOrder[0]!).toBeLessThan(
      setFursonaSections.mock.invocationCallOrder[0]!,
    );
  });

  it("writes sections against the existing ref when editing", async () => {
    const { result } = renderHook(() => useFursonaEditor("ref-1"), { wrapper });
    await result.current.save(values);
    expect(setFursonaSections).toHaveBeenCalledWith({}, "ref-1", sections);
  });

  // The partial failure the plan calls out: the fursona exists and its content
  // does not. Reported, never rolled back — deleting a just-created fursona
  // would spend a handle from a namespace that never reclaims one.
  it("reports a refused section write rather than undoing the fursona", async () => {
    setFursonaSections.mockRejectedValueOnce(
      new Error("section 1: unknown type"),
    );
    const { result } = renderHook(() => useFursonaEditor(), { wrapper });
    let landed: boolean | undefined;
    await act(async () => {
      landed = await result.current.save(values);
    });
    expect(landed).toBe(false);
    expect(result.current.fieldErrors).toEqual({ form: "sectionsRefused" });
  });

  // Without this the list still shows the old rows after a save, and somebody
  // who just created a fursona goes back to a page that does not have it.
  it("invalidates the list on success", async () => {
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useFursonaEditor(), { wrapper });
    await result.current.save(values);
    expect(spy).toHaveBeenCalledWith({ queryKey: ["fursonas"] });
  });

  it("maps a taken handle to the handle field", async () => {
    createFursona.mockRejectedValueOnce(new HandleTakenError("taken"));
    const { result } = renderHook(() => useFursonaEditor(), { wrapper });
    await act(async () => {
      await result.current.save(values);
    });
    expect(result.current.fieldErrors).toEqual({ handle: "handleTaken" });
  });

  // Against `form`, not a field: the quota is not something the person typed
  // wrong, and keying it to `handle` would tell them to change a good one.
  it("maps a reached quota to the form", async () => {
    createFursona.mockRejectedValueOnce(new FursonaLimitError("limit"));
    const { result } = renderHook(() => useFursonaEditor(), { wrapper });
    await act(async () => {
      await result.current.save(values);
    });
    expect(result.current.fieldErrors).toEqual({ form: "limitReached" });
  });

  // The server action this replaces let anything it did not recognise propagate.
  // Losing that would turn a real fault into a save that silently did nothing.
  it("lets an unrecognised failure propagate", async () => {
    createFursona.mockRejectedValueOnce(new Error("no person actor"));
    const { result } = renderHook(() => useFursonaEditor(), { wrapper });
    await expect(result.current.save(values)).rejects.toThrow(
      /no person actor/,
    );
  });

  it("clears a previous field error when a later save succeeds", async () => {
    let landedAgain: boolean | undefined;
    createFursona.mockRejectedValueOnce(new HandleTakenError("taken"));
    const { result } = renderHook(() => useFursonaEditor(), { wrapper });
    await act(async () => {
      await result.current.save(values);
    });
    expect(result.current.fieldErrors).toEqual({ handle: "handleTaken" });

    await act(async () => {
      landedAgain = await result.current.save(values);
    });
    expect(result.current.fieldErrors).toEqual({});
    // And it reports success, which is what the editor navigates on.
    expect(landedAgain).toBe(true);
  });
});
