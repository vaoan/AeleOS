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

  // Stored sections that no longer parse must not take the editor down — an
  // exception here would make the fursona permanently uneditable.
  //
  // **But they come back as `null`, never `[]`, and the difference is the
  // whole point.** `[]` says "nothing is written" to a caller whose next act
  // is to REPLACE, so returning it for a page that IS written is data loss
  // dressed as a degraded read. That is not hypothetical: it is what happened
  // the moment a stored page became a tree of blocks this flat schema cannot
  // parse. See `useFursonaEditor`'s own suite for the save that refuses.
  it("answers null for a stored page it cannot parse, never an empty one", async () => {
    const page = await readActorPage(
      client({ sections: { not: "an array" }, theme: {} }),
      "ref",
    );
    expect(page.sections).toBeNull();
  });

  // The block model, which is exactly the shape this flat schema stopped being
  // able to read — the fixture is a real container rather than nonsense, so
  // this fails if the read is ever quietly widened to accept both.
  it("answers null for a page stored as a tree of blocks", async () => {
    const page = await readActorPage(
      client({
        sections: [
          {
            kind: "container",
            mode: "stack",
            name_en: "About",
            children: [{ kind: "text", title_en: "Species" }],
          },
        ],
        theme: {},
      }),
      "ref",
    );
    expect(page.sections).toBeNull();
  });

  // The other half of the same distinction, and the control that stops the two
  // above passing on a function that answers null for everything: a row whose
  // sections really are empty is `[]`, which an editor MAY replace.
  it("answers an empty array for a row whose page is genuinely empty", async () => {
    const page = await readActorPage(
      client({ sections: [], theme: {} }),
      "ref",
    );
    expect(page.sections).toEqual([]);
  });

  // Finding 4 of the final review: an unrecognised STYLE key must cost only
  // that key, never the whole page. `sectionsSchema`'s `.strict()` style bag
  // would have failed this array's parse entirely and reopened the exact bug
  // this function exists to fix — an editor opening empty and then saving
  // over what its owner actually wrote. `readSectionsSchema` strips the key
  // instead, so the section the owner can see and edit survives.
  it("renders a section carrying an unrecognised style key, rather than emptying the page", async () => {
    const sections = [
      {
        name_en: "About",
        type: "cards",
        sort_order: 1,
        items: [],
        style: { skin: "glass", corner_radius: "8px" },
      },
    ];
    const page = await readActorPage(client({ sections, theme: {} }), "ref");
    expect(page.sections).toEqual([
      { ...sections[0], style: { skin: "glass" } },
    ]);
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
