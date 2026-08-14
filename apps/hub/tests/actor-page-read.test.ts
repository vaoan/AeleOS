import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readActorPage } from "@/features/actors/infrastructure/actor-page";
import { DEFAULT_THEME } from "@/features/actors/domain/actor-theme";

/**
 * A client whose single-row read answers with `row`.
 *
 * @param row - what the table holds, or null.
 * @returns the client.
 */
function client(row: unknown) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: row, error: null });
  return {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
  } as unknown as SupabaseClient;
}

describe("readActorPage", () => {
  // The regression this exists for. The edit page passed no sections, the
  // editor defaulted them to `[]`, and `set_actor_sections` REPLACES — so
  // opening a fursona and pressing save deleted everything its owner had
  // written. Nothing failed and nothing warned; the page simply came back
  // empty.
  it("returns what the owner already wrote", async () => {
    const sections = [
      { name_en: "About", type: "cards", sort_order: 1, items: [] },
    ];
    const page = await readActorPage(client({ sections, theme: {} }), "ref");
    expect(page.sections).toEqual(sections);
  });

  it("returns the stored theme", async () => {
    const page = await readActorPage(
      client({ sections: [], theme: { accent: "#00ff88" } }),
      "ref",
    );
    expect(page.theme.accent).toBe("#00ff88");
  });

  // A fursona that has never been edited has no profile row at all, which is
  // an ordinary state rather than a fault — the editor opens empty, and saving
  // creates the row.
  it("is empty when there is no profile row", async () => {
    const page = await readActorPage(client(null), "ref");
    expect(page).toEqual({ sections: [], theme: DEFAULT_THEME });
  });

  // Stored sections that no longer parse must not take the editor down. They
  // come back as none, which is recoverable; an exception here would make the
  // fursona permanently uneditable.
  it("treats sections it cannot parse as none", async () => {
    const page = await readActorPage(
      client({ sections: { not: "an array" }, theme: {} }),
      "ref",
    );
    expect(page.sections).toEqual([]);
  });
});

// A read that FAILS is not the same as a page nobody has written, and
// collapsing the two is exactly how the original bug erased people's work: an
// editor that opens empty on a transient error will overwrite with empty on
// save.
it("throws when the read itself fails", async () => {
  const failing = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: vi
            .fn()
            .mockResolvedValue({ data: null, error: { message: "boom" } }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;
  await expect(readActorPage(failing, "ref")).rejects.toThrow(/boom/);
});
