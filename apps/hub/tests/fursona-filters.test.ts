import { describe, expect, it } from "vitest";
import {
  applyFursonaFilters,
  isFiltering,
} from "@/features/actors/domain/fursona-filters";
import type { Actor } from "@/features/actors";

/**
 * An actor row, with overrides.
 *
 * `displayName` defaults to null rather than to a name. A default name is
 * shared by every row the test does not override, so a search for it matches
 * rows the test meant to exclude — which is exactly what happened the first
 * time this file was written, and it looked like the filter was broken.
 *
 * @param over - fields to replace.
 * @returns the actor.
 */
function actor(over: Partial<Actor> = {}): Actor {
  return {
    actorRef: "ref-1",
    kind: "fursona",
    handle: "sparky",
    displayName: null,
    avatarUrl: null,
    visibility: "private",
    status: "active",
    ...over,
  };
}

const none = { q: "", visibility: "" };

describe("applyFursonaFilters", () => {
  it("returns everything when nothing is filtered", () => {
    const rows = [actor(), actor({ actorRef: "ref-2", handle: "blaze" })];
    expect(applyFursonaFilters(rows, none)).toHaveLength(2);
  });

  it("matches the handle, case-insensitively", () => {
    const rows = [actor({ handle: "sparky" }), actor({ handle: "blaze" })];
    const found = applyFursonaFilters(rows, { q: "SPARK", visibility: "" });
    expect(found.map((a) => a.handle)).toEqual(["sparky"]);
  });

  // Somebody searching for a fursona types the name they gave it, not the
  // handle they registered. Matching only the handle would miss that.
  it("matches the display name too", () => {
    const rows = [
      actor({ handle: "a1", displayName: "Sparky the Dragon" }),
      actor({ handle: "b2", displayName: "Blaze" }),
    ];
    const found = applyFursonaFilters(rows, { q: "dragon", visibility: "" });
    expect(found.map((a) => a.handle)).toEqual(["a1"]);
  });

  it("survives a row with no display name", () => {
    const rows = [actor({ handle: "a1", displayName: null })];
    expect(applyFursonaFilters(rows, { q: "a1", visibility: "" })).toHaveLength(
      1,
    );
  });

  it("filters by visibility", () => {
    const rows = [
      actor({ handle: "a1", visibility: "public" }),
      actor({ handle: "b2", visibility: "private" }),
    ];
    const found = applyFursonaFilters(rows, { q: "", visibility: "public" });
    expect(found.map((a) => a.handle)).toEqual(["a1"]);
  });

  it("applies both at once", () => {
    const rows = [
      actor({ handle: "sparky", visibility: "public" }),
      actor({ handle: "sparky-2", visibility: "private" }),
      actor({ handle: "blaze", visibility: "public" }),
    ];
    const found = applyFursonaFilters(rows, {
      q: "spark",
      visibility: "public",
    });
    expect(found.map((a) => a.handle)).toEqual(["sparky"]);
  });

  // The person row is not a fursona and must never be filtered out of the list
  // — it is the "you" row, and losing it under a filter would read as the
  // account disappearing.
  it("keeps the person row whatever the filter", () => {
    const rows = [
      actor({ kind: "person", handle: "u-abc", displayName: null }),
      actor({ handle: "blaze" }),
    ];
    const found = applyFursonaFilters(rows, { q: "zzz", visibility: "public" });
    expect(found.map((a) => a.kind)).toEqual(["person"]);
  });
});

describe("isFiltering", () => {
  it("is false when nothing is set", () => {
    expect(isFiltering(none)).toBe(false);
  });

  it("is true for a search", () => {
    expect(isFiltering({ q: "a", visibility: "" })).toBe(true);
  });

  it("is true for a visibility", () => {
    expect(isFiltering({ q: "", visibility: "public" })).toBe(true);
  });

  // Whitespace is not a filter. Without this, a stray space in the box would
  // silently disable reordering.
  it("ignores a search that is only whitespace", () => {
    expect(isFiltering({ q: "   ", visibility: "" })).toBe(false);
  });
});
