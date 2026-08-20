import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Block } from "@/features/actors/domain/block-schema";

type ClientOptions = {
  getToken: () => Promise<string | null>;
  url: string;
  anonKey: string;
};

const rpc = vi.fn();
const createIdentityClient = vi.fn<
  (options: ClientOptions) => { rpc: typeof rpc }
>(() => ({ rpc }));

vi.mock("@aeleos/identity", () => ({
  createIdentityClient: (options: ClientOptions) =>
    createIdentityClient(options),
}));

vi.mock("@/shared/infrastructure/env", () => ({
  env: { supabaseUrl: "https://db.test", supabaseAnonKey: "anon-key" },
}));

const { readPublicPerson, readPublicFursona } =
  await import("@/features/actors/infrastructure/public-actors");

/**
 * Makes the next rpc call answer with a row.
 *
 * @param data - the row, or null for "nothing to show".
 * @param error - the failure, when there is one.
 */
function answer(data: unknown, error: unknown = null): void {
  rpc.mockReturnValue({ maybeSingle: async () => ({ data, error }) });
}

// **A section is a container at depth 0 carrying a name.** Written as the
// database stores it — with `spaces` and `description_en` absent, which is
// legal — so that `PARSED` below is what the read schema materialises rather
// than a copy of the input, and a defaulting that stopped happening would go
// red here.
const STORED = [
  {
    kind: "container",
    mode: "stack",
    name_en: "About",
    children: [
      { kind: "stat", title_en: "Species", description_en: "A wolf." },
    ],
  },
];

/** The same page, with every default the read schema materialises. */
const PARSED = [
  {
    kind: "container",
    mode: "stack",
    spaces: 1,
    name_en: "About",
    children: [
      {
        kind: "stat",
        title_en: "Species",
        description_en: "A wolf.",
      },
    ],
  },
];

const personRow = {
  handle: "u-abc",
  display_name: "A person",
  avatar_url: "https://example.test/p.png",
  address: "luna",
  listed: true,
  sections: STORED,
  fursonas: [
    {
      handle: "luna",
      display_name: "Luna",
      avatar_url: "https://example.test/f.png",
    },
  ],
};

const fursonaRow = {
  handle: "luna",
  display_name: "Luna",
  avatar_url: null,
  owner_address: "42",
  // **Deliberately unlike the fursona's own two fields.** A mapping that read
  // `display_name` where it meant `owner_display_name` would pass against a
  // fixture where the two agree, and the fursona's avatar is null here while
  // the owner's is a real address — so each column can only be satisfied by
  // the column it names.
  owner_display_name: "Heiner",
  owner_avatar_url: "https://example.test/owner.png",
  listed: false,
  sections: STORED,
};

beforeEach(() => {
  rpc.mockReset();
  createIdentityClient.mockClear();
});

/**
 * The blocks a read returns, with the ones the shim supplied taken off.
 *
 * **`withRequiredBlocks` runs on every public read**, so `blocks` is never
 * just what was stored — a page naming no identity block gets a header, which
 * is the whole reason no page needed migrating. These assertions are about
 * what the PARSE did with the stored value, so they compare the stored part
 * and check completeness separately. `toEqual` on the whole array would be
 * asserting the shim's exact output, which is a fixture of the shim rather
 * than a claim about parsing.
 *
 * @param blocks - what the read returned.
 * @returns the blocks that did not come from the shim.
 */
function stored(blocks: Block[] | undefined): Block[] {
  const seeded = new Set(["avatar", "handle", "name", "owner", "fursonas"]);
  // `children.length > 0` is load-bearing: `[].every()` is TRUE, so without it
  // an EMPTY container counts as shim-supplied and gets filtered away. The
  // nested-to-the-cap case is built from empty containers and caught this.
  const fromShim = (b: Block): boolean =>
    "children" in b
      ? b.children.length > 0 &&
        b.children.every((c) => c !== null && fromShim(c))
      : seeded.has(b.kind);
  return (blocks ?? []).filter((b) => !fromShim(b));
}

describe("readPublicPerson", () => {
  it("asks the database by address", async () => {
    answer(personRow);
    await readPublicPerson("Luna");
    expect(rpc).toHaveBeenCalledWith("public_person", { p_address: "Luna" });
  });

  it("returns the profile", async () => {
    answer(personRow);
    const person = await readPublicPerson("luna");
    expect(person).toMatchObject({
      handle: "u-abc",
      displayName: "A person",
      address: "luna",
      listed: true,
    });
    expect(stored(person?.blocks)).toEqual(PARSED);
  });

  it("names no owner — a person has none", async () => {
    answer(personRow);
    expect((await readPublicPerson("luna"))?.owner).toBeUndefined();
  });

  it("carries the owner's public fursonas", async () => {
    answer(personRow);
    expect((await readPublicPerson("luna"))?.fursonas).toEqual([
      {
        handle: "luna",
        displayName: "Luna",
        avatarUrl: "https://example.test/f.png",
      },
    ]);
  });

  it("reports an empty list rather than undefined when there are none", async () => {
    answer({ ...personRow, fursonas: null });
    expect((await readPublicPerson("luna"))?.fursonas).toEqual([]);
  });

  it("nulls a missing display name and avatar", async () => {
    answer({ ...personRow, display_name: null, avatar_url: null });
    const person = await readPublicPerson("luna");
    expect(person?.displayName).toBeNull();
    expect(person?.avatarUrl).toBeNull();
  });

  it("nulls a display name and avatar the row omits entirely", async () => {
    const { display_name, avatar_url, ...rest } = personRow;
    void display_name;
    void avatar_url;
    answer(rest);
    const person = await readPublicPerson("luna");
    expect(person?.displayName).toBeNull();
    expect(person?.avatarUrl).toBeNull();
  });

  it("nulls a missing fursona display name and avatar", async () => {
    answer({ ...personRow, fursonas: [{ handle: "luna" }] });
    expect((await readPublicPerson("luna"))?.fursonas).toEqual([
      { handle: "luna", displayName: null, avatarUrl: null },
    ]);
  });

  // Private, suspended, deleted and never-existed all arrive here as no row,
  // and the caller must render every one of them the same way.
  it("returns undefined when there is nothing to show", async () => {
    answer(null);
    expect(await readPublicPerson("nobody")).toBeUndefined();
  });

  // A read failure is NOT "not found". Collapsing the two would turn a database
  // hiccup into a 404 saying somebody's profile does not exist.
  it("throws when the read fails", async () => {
    answer(null, { message: "connection reset" });
    await expect(readPublicPerson("luna")).rejects.toThrow(/connection reset/);
  });
});

describe("readPublicFursona", () => {
  it("asks the database by address and handle", async () => {
    answer(fursonaRow);
    await readPublicFursona("42", "Luna");
    expect(rpc).toHaveBeenCalledWith("public_fursona", {
      p_address: "42",
      p_handle: "Luna",
    });
  });

  it("reports the owner's address as the canonical one", async () => {
    answer(fursonaRow);
    expect((await readPublicFursona("42", "luna"))?.address).toBe("42");
  });

  it("carries the unlisted flag through", async () => {
    answer(fursonaRow);
    expect((await readPublicFursona("42", "luna"))?.listed).toBe(false);
  });

  it("has no fursona list of its own", async () => {
    answer(fursonaRow);
    expect((await readPublicFursona("42", "luna"))?.fursonas).toBeUndefined();
  });

  it("carries the owner, address and identity alike", async () => {
    answer(fursonaRow);
    expect((await readPublicFursona("42", "luna"))?.owner).toEqual({
      address: "42",
      displayName: "Heiner",
      avatarUrl: "https://example.test/owner.png",
    });
  });

  // **The withholding is SQL's, and this is what reaching the client looks
  // like.** `public_fursona` returns null for both when the owner's own
  // profile is private — `tests/db/public-reads.test.ts` is what proves the
  // gate — and the address survives, because it is already in this page's URL.
  it("keeps the owner's address when their name and picture are withheld", async () => {
    answer({
      ...fursonaRow,
      owner_display_name: null,
      owner_avatar_url: null,
    });
    expect((await readPublicFursona("42", "luna"))?.owner).toEqual({
      address: "42",
      displayName: null,
      avatarUrl: null,
    });
  });

  it("returns undefined when there is nothing to show", async () => {
    answer(null);
    expect(await readPublicFursona("42", "nobody")).toBeUndefined();
  });

  it("throws when the read fails", async () => {
    answer(null, { message: "connection reset" });
    await expect(readPublicFursona("42", "luna")).rejects.toThrow(
      /connection reset/,
    );
  });
});

describe("the page it will accept", () => {
  it("renders a page the schema accepts", async () => {
    answer(fursonaRow);
    expect(stored((await readPublicFursona("42", "luna"))?.blocks)).toEqual(
      PARSED,
    );
  });

  // A page stored before a schema change must still render its header and its
  // name. Throwing would turn one bad row into a 500 on a public profile, which
  // is worse than a heading with nothing under it.
  it("treats a page the schema rejects as none", async () => {
    answer({ ...fursonaRow, sections: [{ nonsense: true }] });
    expect(stored((await readPublicFursona("42", "luna"))?.blocks)).toEqual([]);
  });

  it("treats a non-array as none", async () => {
    answer({ ...fursonaRow, sections: "not an array" });
    expect(stored((await readPublicFursona("42", "luna"))?.blocks)).toEqual([]);
  });

  /**
   * A container holding what it is given.
   *
   * @param children - the blocks inside it.
   * @returns the container, as the database would store it.
   */
  const nest = (children: unknown[]): unknown => ({
    kind: "container",
    mode: "stack",
    children,
  });

  // The cap the database enforces with its own counter, mirrored here so a
  // tree one level too deep is refused on the read side too rather than
  // reaching a renderer that has no heading entry for that level. Containers
  // are legal at depths 0, 1 and 2, so FOUR of them is the first illegal
  // shape — the off-by-one two people on this branch got wrong from opposite
  // directions.
  it("treats a tree nested past the cap as none", async () => {
    answer({ ...fursonaRow, sections: [nest([nest([nest([nest([])])])])] });
    expect(stored((await readPublicFursona("42", "luna"))?.blocks)).toEqual([]);
  });

  // **One leaf's empty title must cost that title and nothing else.** It used
  // to cost the whole page: `title_en` was `min(1)` on the read schema as well
  // as the write, so `parseBlocks` answered `[]` and a stranger got "nothing
  // here yet" over a page full of content. The rule lives at the write now —
  // `validate_block` refuses a zero-length title — and the read is a floor
  // that must never take a page down with it. Nested, because the damage was
  // proportional to how deep the offending leaf was buried: nothing about the
  // page said which one it was.
  it("renders a whole page rather than blanking it for one empty title", async () => {
    answer({
      ...fursonaRow,
      sections: [
        nest([
          {
            kind: "container",
            mode: "stack",
            children: [
              { kind: "text", title_en: "" },
              { kind: "text", title_en: "Written" },
            ],
          },
        ]),
      ],
    });
    expect(
      stored((await readPublicFursona("42", "luna"))?.blocks),
    ).toHaveLength(1);
  });

  // The control that stops the case above being vacuous. Three containers is
  // the deepest legal nesting, and it must come back whole — without this, a
  // parse that refused every tree at all would pass the refusal case happily.
  it("keeps a tree nested exactly to the cap", async () => {
    answer({ ...fursonaRow, sections: [nest([nest([nest([])])])] });
    expect(
      stored((await readPublicFursona("42", "luna"))?.blocks),
    ).toHaveLength(1);
  });

  // An unrecognised STYLE key must cost only that key, never the whole page —
  // `parseBlocks` uses `lenientBlocksSchema` rather than the editor's
  // `.strict()` write schema for exactly this reason, and the window it exists
  // for is a deploy where the database is ahead of this build. A stranger must
  // still see the block; only the key nothing here renders is dropped.
  it("renders a block carrying an unrecognised style key, rather than emptying the page", async () => {
    answer({
      ...fursonaRow,
      sections: [
        { ...STORED[0], style: { skin: "glass", corner_radius: "8px" } },
      ],
    });
    expect(stored((await readPublicFursona("42", "luna"))?.blocks)).toEqual([
      { ...PARSED[0], style: { skin: "glass" } },
    ]);
  });

  // A LIVE REGRESSION, NOT A HYPOTHETICAL. Nothing converted the pages written
  // before `set_actor_sections` began validating blocks — the blocks-and-grids
  // design says so in as many words — so every one of them stopped parsing
  // here and served a stranger a heading with nothing under it. The flat shape
  // goes through the same `sectionsToBlocks` the editor's own save uses, so a
  // page reads the same before and after its owner next saves it.
  it("renders a page still stored in the flat shape", async () => {
    answer({
      ...fursonaRow,
      sections: [
        {
          name_en: "About",
          type: "stats",
          sort_order: 1,
          items: [
            {
              title_en: "Species",
              description_en: "A wolf.",
              sort_order: 1,
            },
          ],
        },
      ],
    });
    expect(stored((await readPublicFursona("42", "luna"))?.blocks)).toEqual([
      {
        kind: "container",
        mode: "grid",
        spaces: 4,
        name_en: "About",
        children: [
          {
            kind: "stat",
            title_en: "Species",
            description_en: "A wolf.",
          },
        ],
      },
    ]);
  });

  // The control that keeps the case above from being vacuous in the other
  // direction: a value that is neither shape is still nothing, rather than
  // whatever a lenient reading of it would produce.
  it("treats a page that is neither shape as none", async () => {
    answer({ ...fursonaRow, sections: [{ name_en: "About", type: "spiral" }] });
    expect(stored((await readPublicFursona("42", "luna"))?.blocks)).toEqual([]);
  });
});

describe("the client it builds", () => {
  // The null token is the point. @aeleos/identity documents that it
  // authenticates as `anon` rather than failing, and these pages are read by
  // strangers — everywhere else in this app a null token would be a bug.
  it("authenticates as nobody", async () => {
    answer(personRow);
    await readPublicPerson("luna");

    const options = createIdentityClient.mock.calls[0]?.[0];
    expect(await options?.getToken()).toBeNull();
    expect(options?.url).toBe("https://db.test");
    expect(options?.anonKey).toBe("anon-key");
  });
});
