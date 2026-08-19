import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { DEFAULT_THEME } from "@/features/actors/domain/actor-theme";

class HandleRetiredError extends Error {}
class HandleTakenError extends Error {}
class FursonaLimitError extends Error {}
class PageRefusedError extends Error {}

const createFursona = vi.fn<(...a: unknown[]) => unknown>();
const updateFursona = vi.fn<(...a: unknown[]) => unknown>();
const setFursonaSections = vi.fn<(...a: unknown[]) => unknown>();
const setActorTheme = vi.fn();
const updateMyProfile = vi.fn<(...a: unknown[]) => unknown>();
vi.mock("@/features/actors/infrastructure/my-profile", () => ({
  updateMyProfile: (...a: unknown[]) => updateMyProfile(...a),
}));
vi.mock("@/features/actors/infrastructure/actor-theme", () => ({
  setActorTheme: (...a: unknown[]) => setActorTheme(...a),
}));
vi.mock("@/features/actors/infrastructure/fursona-arrangement", () => ({
  setFursonaSections: (...a: unknown[]) => setFursonaSections(...a),
  PageRefusedError,
}));
vi.mock("@/features/actors/infrastructure/fursonas", () => ({
  createFursona: (...a: unknown[]) => createFursona(...a),
  updateFursona: (...a: unknown[]) => updateFursona(...a),
  HandleTakenError,
  HandleRetiredError,
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
    kind: "container" as const,
    mode: "grid" as const,
    spaces: 2,
    name_en: "About",
    children: [],
  },
];

/** One save's worth: the four fields and the page's blocks. */
const values = { ...fields, sections, theme: DEFAULT_THEME };

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  updateMyProfile.mockReset();
  updateMyProfile.mockResolvedValue(undefined);
  createFursona.mockReset();
  createFursona.mockResolvedValue("new-ref");
  updateFursona.mockReset();
  updateFursona.mockResolvedValue(undefined);
  setFursonaSections.mockReset();
  setFursonaSections.mockResolvedValue(undefined);
  setActorTheme.mockReset();
  setActorTheme.mockResolvedValue(undefined);
});

describe("useFursonaEditor", () => {
  // The theme is the third write, and it goes to the ref the first two
  // resolved — on create that ref does not exist until createFursona returns.
  it("writes the theme to the fursona it just created", async () => {
    const { result } = renderHook(() => useFursonaEditor(), { wrapper });
    await result.current.save(values);
    expect(setActorTheme).toHaveBeenCalledWith({}, "new-ref", DEFAULT_THEME);
  });

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
  //
  // **The messages here are real ones, and that is the point of the case.**
  // This used to reject with `"section 1: unknown type"` — `origin/main`'s
  // wording, which `0009` cannot emit any more — against a classifier that
  // matched on prose. Both were wrong together, so the suite stayed green
  // while the commonest refusal in the product threw past the handler and
  // showed the person nothing. `PageRefusedError` is built from the SQLSTATE
  // instead, and these strings are read out of the migration's own `raise`
  // statements.
  it.each([
    "block 1: unknown kind",
    "block 1: too deep",
    "block 1: title_en is required",
    "block 1.2: a leaf holds no children",
    "blocks are too large (limit 65536 bytes)",
  ])("reports %o rather than undoing the fursona", async (message) => {
    setFursonaSections.mockRejectedValueOnce(new PageRefusedError(message));
    const { result } = renderHook(() => useFursonaEditor(), { wrapper });
    let landed: boolean | undefined;
    await act(async () => {
      landed = await result.current.save(values);
    });
    expect(landed).toBe(false);
    expect(result.current.fieldErrors).toEqual({ form: "sectionsRefused" });
  });

  // The other side of the same contract: a refusal that is NOT about the page
  // keeps propagating. Flattening every failure into "your sections were
  // refused" would tell somebody to fix writing that is perfectly fine.
  it("lets a refusal that is not about the page propagate", async () => {
    setFursonaSections.mockRejectedValueOnce(new Error("fursona not found"));
    const { result } = renderHook(() => useFursonaEditor(), { wrapper });
    await expect(result.current.save(values)).rejects.toThrow(
      /fursona not found/,
    );
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

  // THE ERASURE. This is a regression test for a Critical, and the fault it
  // reproduces is the one `actor-page.ts`'s own TSDoc says that function exists
  // to prevent — returned, in a new shape, the moment the stored page stopped
  // being a flat list of sections.
  //
  // `readActorPage` parses with the flat schema, fails on a block tree, and
  // used to return `sections: []` — indistinguishable from "nothing written
  // yet". The editor then opened empty and this mutation sent
  // `setFursonaSections(ref, [])` unconditionally. `set_actor_sections` accepts
  // an empty tree and REPLACES, so the RPC succeeded, nothing warned, and the
  // whole page was gone.
  //
  // **The assertion is on the WRITE, not on the return value**, because that is
  // where the data was lost. A test that only checked `save` reported false
  // would have passed against an implementation that reported false AFTER
  // writing.
  describe("a page this build could not read", () => {
    it("writes nothing at all, not even the fields", async () => {
      const { result } = renderHook(
        () => useFursonaEditor("ref-1", "fursona", false),
        { wrapper },
      );
      await act(async () => {
        await result.current.save(values);
      });
      expect(setFursonaSections).not.toHaveBeenCalled();
      expect(updateFursona).not.toHaveBeenCalled();
      expect(setActorTheme).not.toHaveBeenCalled();
    });

    it("reports it on the form rather than failing silently", async () => {
      const { result } = renderHook(
        () => useFursonaEditor("ref-1", "fursona", false),
        { wrapper },
      );
      let landed: boolean | undefined;
      await act(async () => {
        landed = await result.current.save(values);
      });
      // False, so the editor keeps the person on the page — the return value
      // is what it navigates on, never `fieldErrors`.
      expect(landed).toBe(false);
      expect(result.current.fieldErrors).toEqual({ form: "pageUnreadable" });
    });

    // A person's own page goes through a different first write
    // (`update_my_profile`), so the refusal has to be before the branch rather
    // than inside one of its arms.
    it("refuses a person's own page the same way", async () => {
      const { result } = renderHook(
        () => useFursonaEditor("person-ref", "person", false),
        { wrapper },
      );
      await act(async () => {
        await result.current.save(values);
      });
      expect(updateMyProfile).not.toHaveBeenCalled();
      expect(setFursonaSections).not.toHaveBeenCalled();
    });

    // The control that stops all three above being vacuous: the same hook with
    // the flag left at its default writes everything, so what they observe is
    // the flag rather than a harness that never writes anything.
    it("still writes everything when the page WAS readable", async () => {
      const { result } = renderHook(
        () => useFursonaEditor("ref-1", "fursona", true),
        { wrapper },
      );
      await act(async () => {
        await result.current.save(values);
      });
      expect(setFursonaSections).toHaveBeenCalledWith({}, "ref-1", sections);
      expect(setActorTheme).toHaveBeenCalled();
    });
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

describe("a handle its owner retired", () => {
  // **Its own field error, with its own words.** "Already yours" would be a lie
  // about a name nothing wears — it is being kept out of circulation so links
  // shared under it keep answering 404 rather than resolving to a new
  // character. Reported on the handle field, because that is where the person
  // can do something about it.
  it("is reported on the handle field", async () => {
    updateFursona.mockRejectedValueOnce(new HandleRetiredError("retired"));
    const { result } = renderHook(() => useFursonaEditor("ref-1"), { wrapper });
    let saved: boolean | undefined;
    await act(async () => {
      saved = await result.current.save(values);
    });
    expect(saved).toBe(false);
    expect(result.current.fieldErrors).toEqual({ handle: "handleRetired" });
  });
});

describe("useFursonaEditor, for a person", () => {
  // **`update_my_profile` takes no actor reference, and that IS the
  // authorization** — it derives the target from the token, so a caller cannot
  // name somebody else's row. Which is exactly why a person cannot go through
  // `update_fursona`, and why this branch exists at all.
  it("writes the fields through the profile function", async () => {
    const { result } = renderHook(() => useFursonaEditor("me-1", "person"), {
      wrapper,
    });
    await act(async () => {
      await result.current.save(values);
    });
    // The fields only: sections and theme are their own writes, and the draft
    // is destructured before this call.
    expect(updateMyProfile).toHaveBeenCalledWith({}, fields);
    expect(updateFursona).not.toHaveBeenCalled();
  });

  // A person is provisioned on first sign-in and there is exactly one. Reaching
  // `create_fursona` here would make a second actor out of an editor that is
  // supposed to be editing the only one.
  it("never creates", async () => {
    const { result } = renderHook(() => useFursonaEditor("me-1", "person"), {
      wrapper,
    });
    await act(async () => {
      await result.current.save(values);
    });
    expect(createFursona).not.toHaveBeenCalled();
  });

  it("still writes the sections and the theme", async () => {
    const { result } = renderHook(() => useFursonaEditor("me-1", "person"), {
      wrapper,
    });
    await act(async () => {
      await result.current.save(values);
    });
    expect(setFursonaSections).toHaveBeenCalledWith({}, "me-1", sections);
    expect(setActorTheme).toHaveBeenCalledWith({}, "me-1", DEFAULT_THEME);
  });
});
