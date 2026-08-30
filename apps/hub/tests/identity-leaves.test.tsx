import { describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/shared/infrastructure/i18n/messages/en.json";
import {
  AvatarLeaf,
  FursonasLeaf,
  HandleLeaf,
  NameLeaf,
  OwnerLeaf,
} from "@/features/actors/presentation/identity-leaves";
import type { LeafRenderer } from "@/features/actors/presentation/block-contract";
import type { LeafBlock } from "@/features/actors/domain/block-schema";
import type { PageContext } from "@/features/actors/presentation/blocks";
import { pageContext } from "./helpers/page-context";

/**
 * A leaf of the given kind carrying a title.
 *
 * @param kind - the leaf kind.
 * @param over - anything else to set.
 * @returns the leaf.
 */
function leaf(kind: string, over: Partial<LeafBlock> = {}): LeafBlock {
  return {
    kind,
    title_en: "A label",
    description_en: "",
    ...over,
  } as LeafBlock;
}

/**
 * Renders one identity leaf.
 *
 * The real catalogue provider, because `FursonaCardList` reaches for links and
 * every page in this app renders inside one.
 *
 * @param Leaf - the renderer under test.
 * @param page - the page context to render from.
 * @param block - the leaf.
 * @param labelled - whether the enclosing mode has already shown this leaf's
 *   title; defaults to `true`, which is every mode but `tabs`/`accordion`.
 * @returns testing-library's result.
 */
function renderLeaf(
  Leaf: LeafRenderer,
  page: PageContext,
  block: LeafBlock,
  labelled = true,
) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {Leaf({ leaf: block, locale: "en", labelled, page })}
    </NextIntlClientProvider>,
  );
}

describe("HandleLeaf", () => {
  // **The whole point of the kind.** A person is minted as
  // `u-<actor_ref with the hyphens out>`, which on a person is the `owner_ref`
  // of every fursona they own — the exact column /api/actors/mine strips by
  // name. Printing it to a stranger is the leak this guards.
  it("shows a person's address, never their provisioned handle", () => {
    renderLeaf(
      HandleLeaf,
      pageContext({
        actorKind: "person",
        handle: "u-0191fabc9d7e4b2ca1f3e5d6c7b8a9f0",
        address: "42",
        owner: undefined,
      }),
      leaf("handle"),
    );
    expect(screen.getByTestId("block-handle")).toHaveTextContent("42");
    expect(screen.getByTestId("block-handle")).not.toHaveTextContent("u-0191");
  });

  // A fursona's handle is chosen, is already in its address, and is not
  // derived from any reference — so it shows as it is. Without this case the
  // guard above is satisfied by a renderer that prints the address always.
  it("shows a fursona's chosen handle", () => {
    renderLeaf(
      HandleLeaf,
      pageContext({ handle: "luna", address: "42" }),
      leaf("handle"),
    );
    expect(screen.getByTestId("block-handle")).toHaveTextContent("luna");
  });
});

describe("NameLeaf", () => {
  it("shows the display name", () => {
    renderLeaf(NameLeaf, pageContext({ displayName: "Luna" }), leaf("name"));
    expect(screen.getByTestId("block-name")).toHaveTextContent("Luna");
  });

  // The one identity kind allowed to draw nothing, because `display_name` is
  // nullable and `handle` is what guarantees an actor is named. See the
  // renderer's own note for why that is not the does-nothing failure.
  it("renders nothing when there is no display name", () => {
    const { container } = renderLeaf(
      NameLeaf,
      pageContext({ displayName: null }),
      leaf("name"),
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("AvatarLeaf", () => {
  // The title is the ALT TEXT, which is the only place a screen reader learns
  // whose portrait this is — the visible name is a separate block that may be
  // nowhere near it.
  it("uses the leaf's title as alt text", () => {
    renderLeaf(
      AvatarLeaf,
      pageContext({ avatarUrl: "https://example.test/a.png" }),
      leaf("avatar", { title_en: "Luna, a grey wolf" }),
    );
    expect(screen.getByAltText("Luna, a grey wolf")).toBeInTheDocument();
  });

  it("draws a placeholder rather than nothing when there is no picture", () => {
    renderLeaf(AvatarLeaf, pageContext({ avatarUrl: null }), leaf("avatar"));
    expect(screen.getByTestId("block-avatar")).toBeInTheDocument();
  });

  // `size-12`, `size-24` and `size-32` share no prefix with one another, so
  // splitting the class list and comparing whole tokens is not load-bearing
  // here the way it is for `--accent`/`--accent-soft` — done anyway to match
  // this repository's own convention for a class-list assertion.
  it.each([
    ["s", "size-12"],
    ["l", "size-32"],
  ] as const)(
    "draws the %s portrait as %s on the picture",
    (portrait, expected) => {
      renderLeaf(
        AvatarLeaf,
        pageContext({ avatarUrl: "https://example.test/a.png" }),
        leaf("avatar", { style: { portrait } }),
      );
      const classes = screen.getByTestId("block-avatar").className.split(/\s+/);
      expect(classes).toContain(expected);
      expect(classes).not.toContain("size-24");
    },
  );

  // The empty-state placeholder has to agree with the picture, or a page with
  // no portrait set contradicts one with a portrait set the moment somebody
  // adds one.
  it("draws the same size on the placeholder when there is no picture", () => {
    renderLeaf(
      AvatarLeaf,
      pageContext({ avatarUrl: null }),
      leaf("avatar", { style: { portrait: "l" } }),
    );
    const classes = screen.getByTestId("block-avatar").className.split(/\s+/);
    expect(classes).toContain("size-32");
  });

  // **The hard requirement, checked as DOM identity rather than as two
  // separate `toContain` calls.** Two passing assertions that each look at
  // one render can never prove the two renders AGREE; comparing the whole
  // serialised element is what makes "byte-for-byte the same" a claim this
  // test can actually fail.
  it('renders "m" identically to leaving the key unset', () => {
    renderLeaf(
      AvatarLeaf,
      pageContext({ avatarUrl: "https://example.test/a.png" }),
      leaf("avatar"),
    );
    const absent = screen.getByTestId("block-avatar").outerHTML;
    cleanup();
    renderLeaf(
      AvatarLeaf,
      pageContext({ avatarUrl: "https://example.test/a.png" }),
      leaf("avatar", { style: { portrait: "m" } }),
    );
    expect(screen.getByTestId("block-avatar").outerHTML).toBe(absent);
  });
});

describe("OwnerLeaf", () => {
  it("links to the owner by address", () => {
    renderLeaf(
      OwnerLeaf,
      pageContext({
        owner: { address: "42", displayName: "Heiner", avatarUrl: null },
      }),
      leaf("owner"),
    );
    expect(screen.getByRole("link")).toHaveAttribute("href", "/en/42");
    expect(screen.getByTestId("block-owner")).toHaveTextContent("Heiner");
  });

  // **The privacy case, and the assertion is on the absence of a NAME rather
  // than of a string.** `public_fursona` withholds the owner's name and
  // picture when their own profile is private; the address survives because it
  // is already in this page's URL. A renderer that "helpfully" substituted the
  // address for the missing name would still show the address and would read
  // as correct — so this checks the link's text is the address ALONE.
  it("shows the address alone when the owner's identity is withheld", () => {
    renderLeaf(
      OwnerLeaf,
      pageContext({
        owner: { address: "42", displayName: null, avatarUrl: null },
      }),
      leaf("owner"),
    );
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/en/42");
    expect(link.textContent?.trim()).toBe("42");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("renders nothing on a page with no owner", () => {
    const { container } = renderLeaf(
      OwnerLeaf,
      pageContext({ actorKind: "person", owner: undefined }),
      leaf("owner"),
    );
    expect(container).toBeEmptyDOMElement();
  });

  // **A deliberate decision, made executable.** The owner's own mini avatar
  // is a mark beside a link, not the page's own portrait, so it does not read
  // `style.portrait` — a value set here has nowhere to reach. Guards against
  // this leaf quietly gaining the behaviour later, unnoticed.
  it("keeps its mini avatar at size-10 whatever its own style asks for", () => {
    const { container } = renderLeaf(
      OwnerLeaf,
      pageContext({
        owner: {
          address: "42",
          displayName: "Heiner",
          avatarUrl: "https://example.test/a.png",
        },
      }),
      leaf("owner", { style: { portrait: "l" } }),
    );
    // `alt=""` makes this an accessibility-tree PRESENTATION node rather than
    // an `img`, so it is found by tag rather than by role.
    const img = container.querySelector("img");
    const classes = img?.className.split(/\s+/) ?? [];
    expect(classes).toContain("size-10");
    expect(classes).not.toContain("size-32");
  });
});

describe("FursonasLeaf", () => {
  const withList = (over: Partial<PageContext> = {}) =>
    pageContext({
      actorKind: "person",
      owner: undefined,
      address: "42",
      fursonas: [{ handle: "luna", displayName: "Luna", avatarUrl: null }],
      fursonasFallbackTitle: "Fursonas",
      ...over,
    });

  // The heading is the author's own words. A missing translation here is a
  // person who has not written the Spanish yet, never a build failure.
  it("prefers the block's own title over the catalogue heading", () => {
    renderLeaf(
      FursonasLeaf,
      withList(),
      leaf("fursonas", { title_en: "My characters" }),
    );
    expect(screen.getByRole("heading")).toHaveTextContent("My characters");
  });

  it("falls back to the catalogue heading when the block has none", () => {
    renderLeaf(
      FursonasLeaf,
      withList(),
      leaf("fursonas", { title_en: "" as unknown as string }),
    );
    expect(screen.getByRole("heading")).toHaveTextContent("Fursonas");
  });

  // `FursonaCardList` answers null for an empty list, which was right while it
  // was chrome the page appended and is wrong for a block somebody placed: the
  // grid track it sat in would be a hole nothing explains.
  it("keeps its heading when the list is empty", () => {
    renderLeaf(
      FursonasLeaf,
      withList({ fursonas: [] }),
      leaf("fursonas", { title_en: "My characters" }),
    );
    expect(screen.getByRole("heading")).toHaveTextContent("My characters");
  });

  it("renders nothing on a page with no list", () => {
    const { container } = renderLeaf(
      FursonasLeaf,
      pageContext({ fursonas: undefined }),
      leaf("fursonas"),
    );
    expect(container).toBeEmptyDOMElement();
  });
});

/**
 * `style.label` on the four identity leaves — gap 16 of
 * `docs/superpowers/specs/2026-08-27-pastiche-findings.md`. `AvatarLeaf`'s
 * label is its `alt` text rather than visible words, so it gets its own case;
 * the other three are checked by the text they print.
 */
describe("style.label (gap 16)", () => {
  it("AvatarLeaf hides its title from alt text when the style says hidden", () => {
    renderLeaf(
      AvatarLeaf,
      pageContext({ avatarUrl: "https://example.test/a.png" }),
      leaf("avatar", {
        title_en: "Luna, a grey wolf",
        style: { label: "hidden" },
      }),
    );
    expect(screen.getByTestId("block-avatar")).toHaveAttribute("alt", "");
  });

  it("AvatarLeaf keeps its title as alt text when the style says show", () => {
    renderLeaf(
      AvatarLeaf,
      pageContext({ avatarUrl: "https://example.test/a.png" }),
      leaf("avatar", {
        title_en: "Luna, a grey wolf",
        style: { label: "show" },
      }),
    );
    expect(screen.getByAltText("Luna, a grey wolf")).toBeInTheDocument();
  });

  it("HandleLeaf draws no label when the style says hidden", () => {
    renderLeaf(
      HandleLeaf,
      pageContext({ handle: "luna", address: "42" }),
      leaf("handle", { title_en: "My handle", style: { label: "hidden" } }),
    );
    expect(screen.queryByText("My handle")).not.toBeInTheDocument();
    // The control: the value itself must still be there — this key hides
    // the label, never the block's content.
    expect(screen.getByTestId("block-handle")).toHaveTextContent("luna");
  });

  // The control for the case above: with no style at all, the label is
  // exactly where it always was. Without this, a renderer that dropped
  // every label regardless of the key would pass the case above just as
  // well.
  it("HandleLeaf draws its label when no style is set", () => {
    renderLeaf(
      HandleLeaf,
      pageContext({ handle: "luna", address: "42" }),
      leaf("handle", { title_en: "My handle" }),
    );
    expect(screen.getByText("My handle")).toBeInTheDocument();
  });

  it("NameLeaf draws no label when the style says hidden", () => {
    renderLeaf(
      NameLeaf,
      pageContext({ displayName: "Luna" }),
      leaf("name", { title_en: "Display name", style: { label: "hidden" } }),
    );
    expect(screen.queryByText("Display name")).not.toBeInTheDocument();
    expect(screen.getByTestId("block-name")).toHaveTextContent("Luna");
  });

  it("OwnerLeaf draws no label when the style says hidden", () => {
    renderLeaf(
      OwnerLeaf,
      pageContext({
        owner: { address: "42", displayName: "Heiner", avatarUrl: null },
      }),
      leaf("owner", { title_en: "Owner", style: { label: "hidden" } }),
    );
    expect(screen.queryByText("Owner")).not.toBeInTheDocument();
    expect(screen.getByTestId("block-owner")).toHaveTextContent("Heiner");
  });

  // The composition rule's sharpest edge, proved at the leaf level rather
  // than only against the bare function: a mode that has already suppressed
  // the label (`labelled: false`, as a `tabs`/`accordion` panel passes) is
  // not undone by an explicit `label: "show"` on the block itself.
  it("a mode's suppression is not overridden by an explicit show", () => {
    renderLeaf(
      HandleLeaf,
      pageContext({ handle: "luna", address: "42" }),
      leaf("handle", { title_en: "My handle", style: { label: "show" } }),
      /* labelled */ false,
    );
    expect(screen.queryByText("My handle")).not.toBeInTheDocument();
  });
});
