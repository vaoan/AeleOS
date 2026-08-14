import { beforeEach, describe, expect, it, vi } from "vitest";

const readPublicPerson = vi.fn();
const readPublicFursona = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("@/features/actors", () => ({
  readPublicPerson: (...a: unknown[]) => readPublicPerson(...a),
  readPublicFursona: (...a: unknown[]) => readPublicFursona(...a),
  // A stub, not a render: this suite is about which branch each route takes,
  // and PublicProfile has its own suite.
  PublicProfile: () => null,
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

const personRoute = await import("@/app/[locale]/[person]/page");
const fursonaRoute = await import("@/app/[locale]/[person]/[handle]/page");

const actor = {
  handle: "luna",
  displayName: "Luna",
  avatarUrl: null,
  address: "luna-wolf",
  listed: true,
  sections: [],
};

beforeEach(() => {
  readPublicPerson.mockReset();
  readPublicFursona.mockReset();
  notFound.mockClear();
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
