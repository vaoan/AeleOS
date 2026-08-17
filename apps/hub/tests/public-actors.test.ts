import { beforeEach, describe, expect, it, vi } from "vitest";

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

const SECTIONS = [
  {
    name_en: "About",
    type: "cards",
    sort_order: 1,
    items: [
      {
        title_en: "Species",
        description_en: "A wolf.",
        sort_order: 1,
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
  sections: SECTIONS,
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
  listed: false,
  sections: SECTIONS,
};

beforeEach(() => {
  rpc.mockReset();
  createIdentityClient.mockClear();
});

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
    expect(person?.sections).toEqual(SECTIONS);
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

describe("the sections it will accept", () => {
  it("renders sections the schema accepts", async () => {
    answer(fursonaRow);
    expect((await readPublicFursona("42", "luna"))?.sections).toEqual(SECTIONS);
  });

  // A page stored before a schema change must still render its header and its
  // name. Throwing would turn one bad row into a 500 on a public profile, which
  // is worse than a heading with nothing under it.
  it("treats sections the schema rejects as none", async () => {
    answer({ ...fursonaRow, sections: [{ nonsense: true }] });
    expect((await readPublicFursona("42", "luna"))?.sections).toEqual([]);
  });

  it("treats a non-array as none", async () => {
    answer({ ...fursonaRow, sections: "not an array" });
    expect((await readPublicFursona("42", "luna"))?.sections).toEqual([]);
  });

  // Finding 4 of the final review: an unrecognised STYLE key must cost only
  // that key, never the whole page — `parseSections` uses
  // `readSectionsSchema` rather than the editor's `.strict()` write schema
  // for exactly this reason. A stranger reading this page must still see the
  // section; only the key nothing here renders is dropped.
  it("renders a section carrying an unrecognised style key, rather than emptying the page", async () => {
    const sectionWithUnknownStyleKey = [
      { ...SECTIONS[0], style: { skin: "glass", corner_radius: "8px" } },
    ];
    answer({ ...fursonaRow, sections: sectionWithUnknownStyleKey });
    expect((await readPublicFursona("42", "luna"))?.sections).toEqual([
      { ...SECTIONS[0], style: { skin: "glass" } },
    ]);
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
