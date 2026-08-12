import { beforeEach, describe, expect, it, vi } from "vitest";

const createFursona = vi.fn<(...a: unknown[]) => unknown>();
const updateFursona = vi.fn<(...a: unknown[]) => unknown>();
const redirect = vi.fn<(...a: unknown[]) => never>(() => {
  // Next's redirect signals by throwing. Modelling that is the whole point of
  // this mock: a test with a silent redirect would not catch the action
  // swallowing it inside a try block.
  throw new Error("NEXT_REDIRECT");
});
const revalidatePath = vi.fn<(...a: unknown[]) => void>();
const getLocale = vi.fn<() => Promise<string>>(() => Promise.resolve("es"));

class HandleTakenError extends Error {}

// The locale-aware redirect, not next/navigation's plain one: the plain
// version drops the locale prefix and costs an extra hop through the intl
// middleware on every successful create.
vi.mock("@/shared/infrastructure/i18n/navigation", () => ({
  redirect: (...a: unknown[]) => redirect(...a),
}));
vi.mock("next-intl/server", () => ({
  getLocale: () => getLocale(),
}));
vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => revalidatePath(...a),
}));
vi.mock("@/features/actors", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/actors/domain/fursona-schema")
  >("@/features/actors/domain/fursona-schema");
  return {
    parseFursona: actual.parseFursona,
    createFursona: (...a: unknown[]) => createFursona(...a),
    updateFursona: (...a: unknown[]) => updateFursona(...a),
    HandleTakenError,
  };
});

/**
 * Form data for a fursona, with overrides applied.
 *
 * @param over - fields to replace.
 * @returns the populated FormData.
 */
function form(over: Record<string, string> = {}): FormData {
  const fd = new FormData();
  const fields = {
    handle: "sparky",
    displayName: "Sparky",
    avatarUrl: "",
    visibility: "private",
    ...over,
  };
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createFursonaAction", () => {
  it("returns field errors without touching the database", async () => {
    const { createFursonaAction } =
      await import("@/app/[locale]/(app)/fursonas/actions");
    const state = await createFursonaAction(
      { errors: {} },
      form({ handle: "" }),
    );
    expect(state.errors.handle).toBeDefined();
    expect(createFursona).not.toHaveBeenCalled();
  });

  // The client validates too, but that is a convenience. If this test can be
  // deleted without anything else failing, the action has stopped being the
  // control it is supposed to be.
  it("re-validates on the server even when the client would have passed", async () => {
    const { createFursonaAction } =
      await import("@/app/[locale]/(app)/fursonas/actions");
    const state = await createFursonaAction(
      { errors: {} },
      form({ avatarUrl: "javascript:alert(1)" }),
    );
    expect(state.errors.avatarUrl).toBeDefined();
    expect(createFursona).not.toHaveBeenCalled();
  });

  it("reports a taken handle against the handle field", async () => {
    createFursona.mockRejectedValueOnce(new HandleTakenError("taken"));
    const { createFursonaAction } =
      await import("@/app/[locale]/(app)/fursonas/actions");
    const state = await createFursonaAction({ errors: {} }, form());
    expect(state.errors).toEqual({ handle: "handleTaken" });
  });

  it("redirects to the list, in the caller's locale, on success", async () => {
    createFursona.mockResolvedValueOnce("new-ref");
    const { createFursonaAction } =
      await import("@/app/[locale]/(app)/fursonas/actions");
    await expect(createFursonaAction({ errors: {} }, form())).rejects.toThrow(
      /NEXT_REDIRECT/,
    );
    expect(redirect).toHaveBeenCalledWith({
      href: "/fursonas",
      locale: "es",
    });
  });

  it("revalidates the list before redirecting, so the hop after a create is not stale", async () => {
    createFursona.mockResolvedValueOnce("new-ref");
    const { createFursonaAction } =
      await import("@/app/[locale]/(app)/fursonas/actions");
    await expect(createFursonaAction({ errors: {} }, form())).rejects.toThrow();
    expect(revalidatePath).toHaveBeenCalledWith("/es/fursonas");
  });

  it("lets an unexpected failure propagate rather than showing a field error", async () => {
    createFursona.mockRejectedValueOnce(new Error("no person actor"));
    const { createFursonaAction } =
      await import("@/app/[locale]/(app)/fursonas/actions");
    await expect(createFursonaAction({ errors: {} }, form())).rejects.toThrow(
      /no person actor/,
    );
  });
});

describe("updateFursonaAction", () => {
  /**
   * Edit form data, with overrides.
   *
   * @param over - fields to replace.
   * @returns the populated FormData.
   */
  function editForm(over: Record<string, string> = {}): FormData {
    const fd = new FormData();
    const fields = {
      actorRef: "ref-1",
      displayName: "After",
      avatarUrl: "",
      visibility: "public",
      ...over,
    };
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    return fd;
  }

  it("sends the edit to the database and redirects to the list, in the caller's locale", async () => {
    updateFursona.mockResolvedValueOnce(undefined);
    const { updateFursonaAction } =
      await import("@/app/[locale]/(app)/fursonas/actions");
    await expect(
      updateFursonaAction({ errors: {} }, editForm()),
    ).rejects.toThrow(/NEXT_REDIRECT/);
    expect(updateFursona).toHaveBeenCalledWith("ref-1", {
      displayName: "After",
      avatarUrl: "",
      visibility: "public",
    });
    expect(redirect).toHaveBeenCalledWith({ href: "/fursonas", locale: "es" });
  });

  it("revalidates the list before redirecting, so the hop after an edit is not stale", async () => {
    updateFursona.mockResolvedValueOnce(undefined);
    const { updateFursonaAction } =
      await import("@/app/[locale]/(app)/fursonas/actions");
    await expect(
      updateFursonaAction({ errors: {} }, editForm()),
    ).rejects.toThrow();
    expect(revalidatePath).toHaveBeenCalledWith("/es/fursonas");
  });

  it("returns field errors without touching the database", async () => {
    const { updateFursonaAction } =
      await import("@/app/[locale]/(app)/fursonas/actions");
    const state = await updateFursonaAction(
      { errors: {} },
      editForm({ avatarUrl: "javascript:alert(1)" }),
    );
    expect(state.errors.avatarUrl).toBeDefined();
    expect(updateFursona).not.toHaveBeenCalled();
  });

  // The placeholder handle is this function's own invention. Leaking a handle
  // error would show a message about a field the person cannot even see.
  it("never reports an error against the handle it supplied itself", async () => {
    const { updateFursonaAction } =
      await import("@/app/[locale]/(app)/fursonas/actions");
    const state = await updateFursonaAction(
      { errors: {} },
      editForm({ visibility: "everyone" }),
    );
    expect(state.errors.handle).toBeUndefined();
  });

  // A missing actorRef is not something a person can fix by typing — it means
  // a tampered or broken form — so it throws to the error boundary rather
  // than returning a field error, and never against the read-only handle.
  it("throws on a submit with no actor ref rather than guessing one or blaming the handle", async () => {
    const { updateFursonaAction } =
      await import("@/app/[locale]/(app)/fursonas/actions");
    await expect(
      updateFursonaAction({ errors: {} }, editForm({ actorRef: "" })),
    ).rejects.toThrow(/actorRef/);
    expect(updateFursona).not.toHaveBeenCalled();
  });

  // A refusal from the database must not read as success. update_fursona
  // raises when the row is missing OR not the caller's, so this is also the
  // cross-owner case seen from the action's side.
  it("lets a refusal propagate rather than redirecting", async () => {
    updateFursona.mockRejectedValueOnce(new Error("fursona not found"));
    const { updateFursonaAction } =
      await import("@/app/[locale]/(app)/fursonas/actions");
    await expect(
      updateFursonaAction({ errors: {} }, editForm()),
    ).rejects.toThrow(/fursona not found/);
    expect(redirect).not.toHaveBeenCalled();
  });
});
