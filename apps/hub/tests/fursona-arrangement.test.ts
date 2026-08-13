import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteFursona,
  readArrangement,
  readMyActors,
  setFursonaFeatured,
  setFursonaOrder,
} from "@/features/actors/infrastructure/fursona-arrangement";
import type { SupabaseClient } from "@supabase/supabase-js";

const rpc = vi.fn();
const select = vi.fn();

/**
 * A Supabase client stub exposing only what these functions touch.
 *
 * @returns the stub, typed as a client so the call sites type-check.
 */
function client(): SupabaseClient {
  return {
    rpc,
    from: () => ({ select }),
  } as unknown as SupabaseClient;
}

beforeEach(() => {
  rpc.mockReset();
  select.mockReset();
  rpc.mockResolvedValue({ data: null, error: null });
  select.mockResolvedValue({ data: [], error: null });
});

describe("readArrangement", () => {
  it("maps the row shape to the domain shape", async () => {
    select.mockResolvedValueOnce({
      data: [{ actor_ref: "ref-1", sort_order: 2, featured: true }],
      error: null,
    });
    await expect(readArrangement(client())).resolves.toEqual([
      { actorRef: "ref-1", sortOrder: 2, featured: true },
    ]);
  });

  it("returns an empty list when nobody has arranged anything", async () => {
    await expect(readArrangement(client())).resolves.toEqual([]);
  });

  // Collapsing a failure into an empty list would silently reset everybody's
  // ordering to the default, which looks exactly like data loss.
  it("throws rather than reporting no arrangement", async () => {
    select.mockResolvedValueOnce({ data: null, error: { message: "nope" } });
    await expect(readArrangement(client())).rejects.toThrow(/nope/);
  });

  // A success carrying null rather than [] is a shape PostgREST can return, and
  // it is not a failure — it must read as "nothing arranged", not throw.
  it("treats a null payload with no error as nothing arranged", async () => {
    select.mockResolvedValueOnce({ data: null, error: null });
    await expect(readArrangement(client())).resolves.toEqual([]);
  });

  // sort_order is nullable in 0012: a fursona that was pinned but never
  // dragged has a row with no position at all.
  it("keeps a missing sort order as null rather than inventing a position", async () => {
    select.mockResolvedValueOnce({
      data: [{ actor_ref: "ref-1", sort_order: null, featured: true }],
      error: null,
    });
    await expect(readArrangement(client())).resolves.toEqual([
      { actorRef: "ref-1", sortOrder: null, featured: true },
    ]);
  });
});

describe("readMyActors", () => {
  it("maps the row shape the way the server reader does", async () => {
    rpc.mockResolvedValueOnce({
      data: [
        {
          actor_ref: "ref-1",
          kind: "fursona",
          handle: "sparky",
          display_name: "Sparky",
          avatar_url: null,
          visibility: "public",
          status: "active",
        },
      ],
      error: null,
    });
    await expect(readMyActors(client())).resolves.toEqual([
      {
        actorRef: "ref-1",
        kind: "fursona",
        handle: "sparky",
        displayName: "Sparky",
        avatarUrl: null,
        visibility: "public",
        status: "active",
      },
    ]);
  });

  it("throws when the list cannot be read", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "denied" } });
    await expect(readMyActors(client())).rejects.toThrow(/denied/);
  });

  it("treats a null payload with no error as an empty list", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(readMyActors(client())).resolves.toEqual([]);
  });

  // Both are nullable, and a fursona with neither is the ordinary case — the
  // form lets somebody create one with a handle alone.
  it("keeps a missing display name and avatar as null", async () => {
    rpc.mockResolvedValueOnce({
      data: [
        {
          actor_ref: "ref-1",
          kind: "fursona",
          handle: "sparky",
          display_name: null,
          avatar_url: null,
          visibility: "private",
          status: "active",
        },
      ],
      error: null,
    });
    const [row] = await readMyActors(client());
    expect(row?.displayName).toBeNull();
    expect(row?.avatarUrl).toBeNull();
  });
});

describe("the write functions", () => {
  it("orders by actor ref", async () => {
    await setFursonaOrder(client(), "ref-1", 3);
    expect(rpc).toHaveBeenCalledWith("set_fursona_order", {
      p_actor_ref: "ref-1",
      p_sort_order: 3,
    });
  });

  it("pins by actor ref", async () => {
    await setFursonaFeatured(client(), "ref-1", true);
    expect(rpc).toHaveBeenCalledWith("set_fursona_featured", {
      p_actor_ref: "ref-1",
      p_featured: true,
    });
  });

  it("deletes by actor ref", async () => {
    await deleteFursona(client(), "ref-1");
    expect(rpc).toHaveBeenCalledWith("delete_fursona", {
      p_actor_ref: "ref-1",
    });
  });

  it.each([
    ["setFursonaOrder", () => setFursonaOrder(client(), "r", 1)],
    ["setFursonaFeatured", () => setFursonaFeatured(client(), "r", true)],
    ["deleteFursona", () => deleteFursona(client(), "r")],
  ])("%s throws when the database refuses", async (_name, call) => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "fursona not found" },
    });
    await expect(call()).rejects.toThrow(/fursona not found/);
  });
});
