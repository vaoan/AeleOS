import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
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
 * @returns testing-library's result.
 */
function renderLeaf(Leaf: LeafRenderer, page: PageContext, block: LeafBlock) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {Leaf({ leaf: block, locale: "en", labelled: true, page })}
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
