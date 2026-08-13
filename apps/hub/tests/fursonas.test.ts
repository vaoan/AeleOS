import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SupabaseClient } from "@supabase/supabase-js";

const rpc = vi.fn<(...a: unknown[]) => unknown>();

// The functions take their client now, so there is nothing to mock away:
// this is the client, handed in the way a caller hands one in.
const client = () => ({ rpc }) as unknown as SupabaseClient;

vi.mock("@/shared/infrastructure/supabase-server", () => ({
  createServerClient: vi.fn(async () => client()),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listMyActors", () => {
  it("maps snake_case rows to the Actor shape", async () => {
    rpc.mockResolvedValueOnce({
      data: [
        {
          actor_ref: "ref-p",
          kind: "person",
          handle: "u-abc",
          display_name: "Heiner",
          avatar_url: null,
          visibility: "private",
          status: "active",
        },
      ],
      error: null,
    });
    const { listMyActors } =
      await import("@/features/actors/infrastructure/fursonas");
    await expect(listMyActors(client())).resolves.toEqual([
      {
        actorRef: "ref-p",
        kind: "person",
        handle: "u-abc",
        displayName: "Heiner",
        avatarUrl: null,
        visibility: "private",
        status: "active",
      },
    ]);
  });

  it("maps a missing display name to null", async () => {
    rpc.mockResolvedValueOnce({
      data: [
        {
          actor_ref: "ref-f",
          kind: "fursona",
          handle: "sparky",
          display_name: null,
          avatar_url: "https://img.example/a.png",
          visibility: "public",
          status: "active",
        },
      ],
      error: null,
    });
    const { listMyActors } =
      await import("@/features/actors/infrastructure/fursonas");
    await expect(listMyActors(client())).resolves.toEqual([
      {
        actorRef: "ref-f",
        kind: "fursona",
        handle: "sparky",
        displayName: null,
        avatarUrl: "https://img.example/a.png",
        visibility: "public",
        status: "active",
      },
    ]);
  });

  it("returns an empty list rather than throwing when there are none", async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });
    const { listMyActors } =
      await import("@/features/actors/infrastructure/fursonas");
    await expect(listMyActors(client())).resolves.toEqual([]);
  });

  it("treats a null payload as empty rather than crashing the page", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    const { listMyActors } =
      await import("@/features/actors/infrastructure/fursonas");
    await expect(listMyActors(client())).resolves.toEqual([]);
  });

  it("throws when the read fails, rather than rendering an empty list", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    const { listMyActors } =
      await import("@/features/actors/infrastructure/fursonas");
    await expect(listMyActors(client())).rejects.toThrow(/boom/);
  });
});

describe("createFursona", () => {
  it("passes trimmed values through to the rpc", async () => {
    rpc.mockResolvedValueOnce({ data: "new-ref", error: null });
    const { createFursona } =
      await import("@/features/actors/infrastructure/fursonas");
    await expect(
      createFursona(client(), {
        handle: "  Sparky  ",
        displayName: " Sparky ",
        avatarUrl: "",
        visibility: "private",
      }),
    ).resolves.toBe("new-ref");
    expect(rpc).toHaveBeenCalledWith("create_fursona", {
      p_handle: "Sparky",
      p_display_name: "Sparky",
      p_avatar_url: null,
      p_visibility: "private",
    });
  });

  it("surfaces a taken handle as a typed error the form can catch", async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "handle already taken" },
    });
    const { createFursona, HandleTakenError } =
      await import("@/features/actors/infrastructure/fursonas");
    await expect(
      createFursona(client(), {
        handle: "taken",
        displayName: "",
        avatarUrl: "",
        visibility: "private",
      }),
    ).rejects.toBeInstanceOf(HandleTakenError);
  });

  // 0011 gave create_fursona a quota. Its message is deliberately distinct from
  // every other failure the function raises so this layer can type it, and a
  // person who reaches the limit gets told so instead of an error boundary.
  it("surfaces a reached quota as a typed error the form can catch", async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "fursona limit reached" },
    });
    const { createFursona, FursonaLimitError } =
      await import("@/features/actors/infrastructure/fursonas");
    await expect(
      createFursona(client(), {
        handle: "one-too-many",
        displayName: "",
        avatarUrl: "",
        visibility: "private",
      }),
    ).rejects.toBeInstanceOf(FursonaLimitError);
  });

  it("rethrows any other failure rather than reporting a taken handle", async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "no person actor for caller" },
    });
    const { createFursona, HandleTakenError } =
      await import("@/features/actors/infrastructure/fursonas");
    const err = await createFursona(client(), {
      handle: "x",
      displayName: "",
      avatarUrl: "",
      visibility: "private",
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(HandleTakenError);
  });
});

describe("updateFursona", () => {
  it("sends the actor ref and the editable fields", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    const { updateFursona } =
      await import("@/features/actors/infrastructure/fursonas");
    await updateFursona(client(), "ref-1", {
      displayName: "New",
      avatarUrl: "https://img.example/a.png",
      visibility: "public",
    });
    expect(rpc).toHaveBeenCalledWith("update_fursona", {
      p_actor_ref: "ref-1",
      p_display_name: "New",
      p_avatar_url: "https://img.example/a.png",
      p_visibility: "public",
    });
  });

  it("throws when the update is refused, so the caller cannot report success", async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "fursona not found" },
    });
    const { updateFursona } =
      await import("@/features/actors/infrastructure/fursonas");
    await expect(
      updateFursona(client(), "ref-1", {
        displayName: "x",
        avatarUrl: "",
        visibility: "private",
      }),
    ).rejects.toThrow(/fursona not found/);
  });
});
