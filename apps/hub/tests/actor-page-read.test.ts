import { describe, expect, it, vi } from "vitest";
import { missingRequiredKinds } from "@/features/actors/domain/required-blocks";
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

// **Every read here now carries the identity blocks the shim supplies.**
// `withRequiredBlocks` runs on the editor's read so the editor holds real
// blocks the moment it opens a page, which is what makes the first save write
// them explicitly and satisfies the database rule without a migration.
//
// So "reads back exactly as stored" stopped being true, deliberately. These
// assertions state the two things that ARE true: what somebody wrote is
// present and unchanged, and the page comes back complete. `toEqual` on the
// whole array would be asserting the shim's exact output, which is a fixture
// of the shim rather than a claim about this function.
describe("readActorPage", () => {
  // The regression this exists for. The edit page passed no sections, the
  // editor defaulted them to `[]`, and `set_actor_sections` REPLACES — so
  // opening a fursona and pressing save deleted everything its owner had
  // written. Nothing failed and nothing warned; the page simply came back
  // empty.
  // The FLAT shape, which is what every page written before the block model
  // still holds — nothing converted them. It must open, or its owner cannot
  // reach their own page at all; and it opens CONVERTED, because the editor
  // holds blocks and a flat section is not one.
  it("returns what the owner already wrote, as the blocks the editor holds", async () => {
    const sections = [
      {
        name_en: "About",
        type: "cards",
        sort_order: 1,
        items: [
          { title_en: "Species", description_en: "A wolf.", sort_order: 1 },
        ],
      },
    ];
    const page = await readActorPage(
      client({ sections, theme: {} }),
      "ref",
      "fursona",
    );
    expect(page.sections).toEqual(
      expect.arrayContaining([
        {
          kind: "container",
          mode: "grid",
          spaces: 3,
          name_en: "About",
          children: [
            { kind: "link", title_en: "Species", description_en: "A wolf." },
          ],
        },
      ]),
    );
    expect(missingRequiredKinds(page.sections ?? [], "fursona")).toEqual([]);
  });

  it("returns the stored theme", async () => {
    const page = await readActorPage(
      client({ sections: [], theme: { accent: "#00ff88" } }),
      "ref",
      "fursona",
    );
    expect(page.theme.accent).toBe("#00ff88");
  });

  // A fursona that has never been edited has no profile row at all, which is
  // an ordinary state rather than a fault — the editor opens empty, and saving
  // creates the row.
  it("is a complete, empty page when there is no profile row", async () => {
    const page = await readActorPage(client(null), "ref", "fursona");
    expect(page.theme).toEqual(DEFAULT_THEME);
    // The same answer a row holding `[]` gives. Those are one state — nobody
    // has written anything — and telling them apart serves nobody.
    expect(missingRequiredKinds(page.sections ?? [], "fursona")).toEqual([]);
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
      "fursona",
    );
    expect(page.sections).toBeNull();
  });

  // THE ORDINARY CASE: a page written by this editor is already a tree, so
  // nothing converts it and every position survives untouched — including the
  // empty place, which is the one thing no conversion could carry.
  it("reads a page stored as blocks back exactly as it was stored", async () => {
    const sections = [
      {
        kind: "container",
        mode: "grid",
        spaces: 3,
        name_en: "About",
        children: [
          { kind: "stat", title_en: "Species", description_en: "A wolf." },
          null,
          { kind: "text", title_en: "More", description_en: "Words." },
        ],
      },
    ];
    const page = await readActorPage(
      client({ sections, theme: {} }),
      "ref",
      "fursona",
    );
    expect(page.sections).toEqual(expect.arrayContaining(sections));
    expect(missingRequiredKinds(page.sections ?? [], "fursona")).toEqual([]);
  });

  // A NESTED TREE OPENS. It used to answer null here, because the only editor
  // there was composed a flat list and flattening a tree it half-understood
  // would have written the half back over the whole. The editor holds the tree
  // now, so refusing one would refuse the pages this phase exists to let
  // people build.
  it("opens a container nested inside a container", async () => {
    const sections = [
      {
        kind: "container",
        mode: "stack",
        spaces: 1,
        name_en: "About",
        children: [
          {
            kind: "container",
            mode: "grid",
            spaces: 2,
            children: [
              { kind: "text", title_en: "Species", description_en: "" },
            ],
          },
        ],
      },
    ];
    const page = await readActorPage(
      client({ sections, theme: {} }),
      "ref",
      "fursona",
    );
    expect(page.sections).toEqual(expect.arrayContaining(sections));
    expect(missingRequiredKinds(page.sections ?? [], "fursona")).toEqual([]);
  });

  // The other half of the same distinction, and the control that stops the two
  // above passing on a function that answers null for everything: a row whose
  // sections really are empty is `[]`, which an editor MAY replace.
  // **A genuinely empty page is not empty any more, and that is the shim.**
  // What matters here is still the distinction this function exists for: an
  // empty page is not `null`, so the editor may replace it. `null` means the
  // stored shape did not parse and must never be overwritten.
  it("answers a complete page for a row whose page is genuinely empty", async () => {
    const page = await readActorPage(
      client({ sections: [], theme: {} }),
      "ref",
      "fursona",
    );
    expect(page.sections).not.toBeNull();
    expect(missingRequiredKinds(page.sections ?? [], "fursona")).toEqual([]);
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
    const page = await readActorPage(
      client({ sections, theme: {} }),
      "ref",
      "fursona",
    );
    expect(page.sections).toEqual(
      expect.arrayContaining([
        {
          kind: "container",
          mode: "grid",
          spaces: 3,
          name_en: "About",
          children: [],
          style: { skin: "glass" },
        },
      ]),
    );
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
  await expect(readActorPage(failing, "ref", "fursona")).rejects.toThrow(
    /boom/,
  );
});
