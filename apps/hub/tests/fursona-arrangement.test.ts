import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PageRefusedError,
  deleteFursona,
  readArrangement,
  readMyActors,
  setFursonaFeatured,
  setFursonaOrder,
  setFursonaSections,
} from "@/features/actors/infrastructure/fursona-arrangement";
import { sectionsToBlocks } from "@/features/actors/domain/section-block-shim";
import type { SupabaseClient } from "@supabase/supabase-js";

const rpc = vi.fn();
const select = vi.fn();

/**
 * A Supabase client stub exposing only what these functions touch.
 *
 * @returns the stub, typed as a client so the call sites type-check.
 */
const list = vi.fn();
const remove = vi.fn();

function client(): SupabaseClient {
  return {
    rpc,
    from: () => ({ select }),
    // deleteFursona removes an actor's pictures before marking the row, so the
    // client it is handed must carry storage. See 0009 for why the database
    // cannot do this itself.
    storage: { from: () => ({ list, remove }) },
  } as unknown as SupabaseClient;
}

beforeEach(() => {
  rpc.mockReset();
  select.mockReset();
  list.mockReset();
  remove.mockReset();
  rpc.mockResolvedValue({ data: null, error: null });
  select.mockResolvedValue({ data: [], error: null });
  list.mockResolvedValue({ data: [], error: null });
  remove.mockResolvedValue({ error: null });
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

describe("a refusal the caller can act on", () => {
  // The branch this covers is the whole reason `PageRefusedError` exists. The
  // editor used to classify refusals by matching prose — `/section|too many|
  // too large|too long/i` — written when every message `set_actor_sections`
  // could raise carried the word "section". Every per-block message begins
  // `block N:` now and contains none of those four words, so the commonest
  // refusal stopped matching, threw past the handler, and the person was shown
  // nothing while their fields had already been written.
  //
  // Asserting the TYPE rather than the message is the point: a message is the
  // database's to change and a class is ours.
  it("raises PageRefusedError for the shape refusal, not a bare Error", async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "22023", message: "block 1: unknown kind" },
    });
    await expect(setFursonaSections(client(), "ref-1", [])).rejects.toThrow(
      PageRefusedError,
    );
  });

  // The other side, and it is what stops the case above passing for the wrong
  // reason: every refusal must NOT become a PageRefusedError, or the editor
  // would offer "your page was refused" for a fursona somebody does not own.
  it("leaves every other refusal a plain Error", async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "P0001", message: "fursona not found" },
    });
    const raised = setFursonaSections(client(), "ref-1", []);
    await expect(raised).rejects.toThrow("fursona not found");
    await expect(raised).rejects.not.toBeInstanceOf(PageRefusedError);
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

  // Sends the whole document, because 0009 replaces rather than merges — which
  // is also what makes retrying a failed save safe.
  //
  // **And it sends BLOCKS, never the flat sections it was handed.**
  // `set_actor_sections` walks `validate_block` and refuses the flat shape
  // outright, so every save carrying a section was refused in production until
  // `sectionsToBlocks` sat here. Asserting the converted payload rather than
  // the argument is what makes this test able to fail: the version that
  // asserted `p_sections: sections` passed happily against the code that was
  // refused by the database on every call.
  it("writes sections by actor ref, as blocks", async () => {
    const sections = [
      { name_en: "About", type: "cards" as const, sort_order: 1, items: [] },
    ];
    await setFursonaSections(client(), "ref-1", sections);
    expect(rpc).toHaveBeenCalledWith("set_actor_sections", {
      p_actor_ref: "ref-1",
      p_sections: sectionsToBlocks(sections),
    });
    const sent = rpc.mock.calls[0]?.[1] as { p_sections: unknown[] };
    expect(sent.p_sections[0]).toMatchObject({
      kind: "container",
      mode: "grid",
      name_en: "About",
    });
  });

  it("deletes by actor ref", async () => {
    await deleteFursona(client(), "ref-1");
    expect(rpc).toHaveBeenCalledWith("delete_fursona", {
      p_actor_ref: "ref-1",
    });
  });

  // A delete is ONE write again. It used to sweep the fursona's uploaded
  // pictures out of a storage bucket first, in a forced order, because the
  // storage delete policy required the actor to still be active — so marking
  // the row first would have stranded files nobody could reclaim.
  //
  // There is no bucket now: a picture is an address somebody pasted at a host
  // that was never ours, so there is nothing here to clean up and no order to
  // get wrong. The two tests that pinned that order are gone with the feature
  // rather than left passing against a mock of something absent.
  it("touches nothing but the row", async () => {
    const c = client();
    await deleteFursona(c, "ref-1");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(list).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it.each([
    ["setFursonaOrder", () => setFursonaOrder(client(), "r", 1)],
    ["setFursonaFeatured", () => setFursonaFeatured(client(), "r", true)],
    ["deleteFursona", () => deleteFursona(client(), "r")],
    ["setFursonaSections", () => setFursonaSections(client(), "r", [])],
  ])("%s throws when the database refuses", async (_name, call) => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "fursona not found" },
    });
    await expect(call()).rejects.toThrow(/fursona not found/);
  });
});
