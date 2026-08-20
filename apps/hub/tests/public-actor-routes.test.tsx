import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_THEME } from "@/features/actors/domain/actor-theme";
import { publicName as realPublicName } from "@/features/actors/domain/actor-content";
import { render } from "@testing-library/react";

const readPublicPerson = vi.fn();
const readPublicFursona = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
// Records the props each route hands it rather than discarding them, so
// "the route resolves parentHost from env.hubHost and passes it down" is
// something this suite can assert rather than merely arrange for. A stub
// that returned null outright proved nothing: the route could pass "" and
// every test here would still pass, which is exactly the silent-failure
// shape — a value accepted, forwarded, and never checked.
const publicProfile = vi.fn();

vi.mock("@/features/actors", () => ({
  readPublicPerson: (...a: unknown[]) => readPublicPerson(...a),
  readPublicFursona: (...a: unknown[]) => readPublicFursona(...a),
  // **The REAL one, deliberately.** Naming is the thing under test in the
  // title cases below, and a stub here would answer whatever the test
  // wanted while the route did something else — which is how a provisioned
  // handle reached the tab at all: guarded everywhere except the one place
  // nobody drove.
  publicName: realPublicName,
  // This suite is about which branch each route takes and, since round 2,
  // what it hands PublicProfile — not about PublicProfile's own rendering,
  // which has its own suite. Recording is separate from the return value so
  // the stub is still a valid component: `publicProfile` itself follows the
  // same untyped `vi.fn()` shape as readPublicPerson/readPublicFursona above.
  // Captured as one argument rather than spread — React calls a function
  // component with a second argument too (`undefined` in modern React), and
  // `toHaveBeenCalledWith` checks the whole argument list, not just its head.
  PublicProfile: (props: unknown) => {
    publicProfile(props);
    return null;
  },
  // Passes its children through. The theme it would apply is the owner's, and
  // this suite asserts routing rather than appearance — but it cannot be
  // omitted, or the route renders nothing and every branch assertion below
  // becomes vacuous.
  ThemeScope: ({ children }: { children: unknown }) => children,
  // The routes ask this before rendering the visitor's switch. A mocked barrel
  // that omits it fails the route rather than the theme code.
  isCustomised: () => false,
}));

vi.mock("next/navigation", () => ({ notFound: () => notFound() }));

vi.mock("next-intl/server", () => ({
  setRequestLocale: vi.fn(),
  getTranslations: async () => (key: string) => `t:${key}`,
}));

vi.mock("@/shared/presentation/page-shell", () => ({
  PageShell: ({ children }: { children: unknown }) => children,
}));

// Both routes now resolve `parentHost` from `env.hubHost` themselves, exactly
// as they already resolve `locale` — see PublicProfileProps/PublicSectionsProps.
// This suite is about which branch each route takes, not about the value that
// reaches a mocked-out PublicProfile, so a stub is enough; the real module
// would otherwise demand the Supabase variables this file never sets.
vi.mock("@/shared/infrastructure/env", () => ({
  env: { hubHost: "parent-host-test.example" },
}));

const personRoute = await import("@/app/[locale]/[person]/page");
const fursonaRoute = await import("@/app/[locale]/[person]/[handle]/page");

const actor = {
  handle: "luna",
  displayName: "Luna",
  avatarUrl: null,
  address: "luna-wolf",
  listed: true,
  sections: [],
  // **A real theme, not an empty object.** The route reads its `measure` to
  // build the page context, and a fixture without one made every case here
  // fail on a missing property rather than on anything the case was about.
  theme: DEFAULT_THEME,
};

beforeEach(() => {
  readPublicPerson.mockReset();
  readPublicFursona.mockReset();
  notFound.mockClear();
  publicProfile.mockClear();
});

const personParams = Promise.resolve({ locale: "es", person: "42" });
const fursonaParams = Promise.resolve({
  locale: "es",
  person: "42",
  handle: "luna",
});

describe("the person route", () => {
  it("asks for the address in the path", async () => {
    readPublicPerson.mockResolvedValue(actor);
    await personRoute.default({ params: personParams });
    expect(readPublicPerson).toHaveBeenCalledWith("42");
  });

  it("renders the profile when there is one", async () => {
    readPublicPerson.mockResolvedValue(actor);
    await expect(
      personRoute.default({ params: personParams }),
    ).resolves.toBeDefined();
    expect(notFound).not.toHaveBeenCalled();
  });

  // The plumbing round 1 added: this route resolves parentHost from
  // env.hubHost itself and hands it to PublicProfile, exactly as it already
  // does for locale. Asserting the exact mocked value — never "", never a
  // hard-coded default — is what would catch the wiring silently dropping it.
  it("passes the configured hub host to PublicProfile", async () => {
    readPublicPerson.mockResolvedValue(actor);
    // The mocked PublicProfile only records its props once React actually
    // renders it — awaiting the route alone builds the element tree but
    // never walks it, which is why the stub it replaced (`() => null`)
    // could not have caught a dropped prop either.
    render(await personRoute.default({ params: personParams }));
    expect(publicProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        page: expect.objectContaining({
          parentHost: "parent-host-test.example",
        }),
      }),
    );
  });

  // Private, suspended, deleted and never-registered all arrive as no row, and
  // every one of them must answer the same way — a distinguishable response
  // would let anybody test which addresses are taken.
  it("404s when there is nothing to show", async () => {
    readPublicPerson.mockResolvedValue(undefined);
    await expect(personRoute.default({ params: personParams })).rejects.toThrow(
      /NEXT_NOT_FOUND/,
    );
  });

  describe("its metadata", () => {
    it("titles the page with the display name", async () => {
      readPublicPerson.mockResolvedValue(actor);
      const meta = await personRoute.generateMetadata({ params: personParams });
      expect(meta.title).toBe("Luna");
    });

    it("falls back to the handle when there is no display name", async () => {
      readPublicPerson.mockResolvedValue({ ...actor, displayName: null });
      const meta = await personRoute.generateMetadata({ params: personParams });
      expect(meta.title).toBe("luna");
    });

    // **The leak this file could not see.** The case above passes whatever the
    // code does, because its handle is one somebody CHOSE — so it never held
    // the shape that was wrong. A person who has picked no display name is
    // provisioned `u-` plus their `actor_ref` with the dashes stripped, and
    // that went into the tab, history, bookmarks and every screenshot of a page
    // open to strangers. The page BODY had guarded it since it shipped; the
    // title did not, because applying the guard was optional.
    it("never puts a provisioned handle in the title", async () => {
      const machine = "u-0123456789abcdef0123456789abcdef";
      readPublicPerson.mockResolvedValue({
        ...actor,
        displayName: null,
        handle: machine,
      });
      const meta = await personRoute.generateMetadata({ params: personParams });
      expect(meta.title).not.toContain("0123456789abcdef");
      expect(meta.title).toBe("luna-wolf");
    });

    // Both addresses resolve forever, so without this a profile accumulates two
    // indexed URLs for one page.
    it("points canonical at the address the database reports", async () => {
      readPublicPerson.mockResolvedValue(actor);
      const meta = await personRoute.generateMetadata({ params: personParams });
      expect(meta.alternates?.canonical).toBe("/es/luna-wolf");
    });

    it("lets a public profile be indexed", async () => {
      readPublicPerson.mockResolvedValue(actor);
      const meta = await personRoute.generateMetadata({ params: personParams });
      expect(meta.robots).toBeUndefined();
    });

    // Without this an unlisted profile ends up in a search result and
    // "unlisted" means nothing at all.
    it("refuses indexing for an unlisted profile", async () => {
      readPublicPerson.mockResolvedValue({ ...actor, listed: false });
      const meta = await personRoute.generateMetadata({ params: personParams });
      expect(meta.robots).toEqual({ index: false, follow: false });
    });

    // THE LEAK NOBODY LOOKS FOR. Putting the address in a 404's title would
    // confirm which addresses exist to anyone reading a tab, a share preview or
    // a server log — the same oracle the page body avoids.
    it("names nothing when there is nothing to show", async () => {
      readPublicPerson.mockResolvedValue(undefined);
      const meta = await personRoute.generateMetadata({ params: personParams });
      expect(JSON.stringify(meta)).not.toContain("42");
      expect(meta.alternates).toBeUndefined();
    });
  });
});

describe("the fursona route", () => {
  it("asks for the handle under the address", async () => {
    readPublicFursona.mockResolvedValue(actor);
    await fursonaRoute.default({ params: fursonaParams });
    expect(readPublicFursona).toHaveBeenCalledWith("42", "luna");
  });

  it("renders the page when there is one", async () => {
    readPublicFursona.mockResolvedValue(actor);
    await expect(
      fursonaRoute.default({ params: fursonaParams }),
    ).resolves.toBeDefined();
  });

  // Same plumbing, same reason as the person route's equivalent test above —
  // this route resolves parentHost from env.hubHost independently, so it
  // needs its own proof rather than inheriting the other route's.
  it("passes the configured hub host to PublicProfile", async () => {
    readPublicFursona.mockResolvedValue(actor);
    render(await fursonaRoute.default({ params: fursonaParams }));
    expect(publicProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        page: expect.objectContaining({
          parentHost: "parent-host-test.example",
        }),
      }),
    );
  });

  it("404s when there is nothing to show", async () => {
    readPublicFursona.mockResolvedValue(undefined);
    await expect(
      fursonaRoute.default({ params: fursonaParams }),
    ).rejects.toThrow(/NEXT_NOT_FOUND/);
  });

  describe("its metadata", () => {
    it("titles the page and points canonical under the owner", async () => {
      readPublicFursona.mockResolvedValue(actor);
      const meta = await fursonaRoute.generateMetadata({
        params: fursonaParams,
      });
      expect(meta.title).toBe("Luna");
      expect(meta.alternates?.canonical).toBe("/es/luna-wolf/luna");
    });

    it("falls back to the handle when there is no display name", async () => {
      readPublicFursona.mockResolvedValue({ ...actor, displayName: null });
      const meta = await fursonaRoute.generateMetadata({
        params: fursonaParams,
      });
      expect(meta.title).toBe("luna");
    });

    it("refuses indexing for an unlisted fursona", async () => {
      readPublicFursona.mockResolvedValue({ ...actor, listed: false });
      const meta = await fursonaRoute.generateMetadata({
        params: fursonaParams,
      });
      expect(meta.robots).toEqual({ index: false, follow: false });
    });

    it("lets a public fursona be indexed", async () => {
      readPublicFursona.mockResolvedValue(actor);
      const meta = await fursonaRoute.generateMetadata({
        params: fursonaParams,
      });
      expect(meta.robots).toBeUndefined();
    });

    it("names neither the address nor the handle when there is nothing", async () => {
      readPublicFursona.mockResolvedValue(undefined);
      const meta = await fursonaRoute.generateMetadata({
        params: fursonaParams,
      });
      const rendered = JSON.stringify(meta);
      expect(rendered).not.toContain("42");
      expect(rendered).not.toContain("luna");
    });
  });
});
