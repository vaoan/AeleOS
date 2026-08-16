import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  SECTION_TYPES,
  type FursonaSection,
  type FursonaSectionItem,
  type SectionType,
} from "@/features/actors/domain/section-schema";

vi.mock("lucide-react/dynamic", () => ({
  DynamicIcon: ({ name }: { name: string }) => <svg data-icon={name} />,
  // `circle-dot` is here because Cards falls back to it, `globe` because
  // Socials does the same, `camera` because it is Instagram's brand icon in
  // `social-links.ts`, and `cloud` because it is Bluesky's — the posts layout
  // falls back to that exact chip for a Bluesky link, which is the case the
  // fallback exists for. A mock that omitted any of them would make a
  // fallback or a derived brand icon look broken when it is not, the mocked
  // dependency hiding its own setup requirement, again.
  iconNames: [
    "sparkles",
    "heart",
    "paw-print",
    "circle-dot",
    "globe",
    "camera",
    "cloud",
  ],
}));
const { PublicSections, backgroundImageValue, sectionStyle } =
  await import("@/features/actors/presentation/public-sections");

/**
 * One item, with overrides.
 *
 * @param over - fields to replace.
 * @returns the item.
 */
const item = (over: Record<string, unknown> = {}) => ({
  title_en: "English title",
  title_es: "Título en español",
  description_en: "English words.",
  description_es: "Palabras en español.",
  sort_order: 1,
  ...over,
});

/**
 * One section, with overrides.
 *
 * @param over - fields to replace.
 * @returns the section.
 */
const section = (over: Record<string, unknown> = {}) =>
  ({
    name_en: "About",
    name_es: "Acerca de",
    type: "cards",
    sort_order: 1,
    items: [item()],
    ...over,
  }) as unknown as FursonaSection;

/**
 * Renders the sections.
 *
 * `parentHost` defaults to a value rather than `""` so the Twitch cases below
 * exercise the resolved-address branch by default. The only test that passes
 * `""` explicitly (below) renders zero sections, so it does not exercise
 * Twitch degrading to a link — that behaviour is covered at the resolver
 * level, in `embeds.test.ts`'s "resolves to nothing when no parent host is
 * configured".
 *
 * @param sections - what to render.
 * @param locale - the locale being read.
 * @param parentHost - this deployment's hostname, as a route would resolve it.
 */
function renderSections(
  sections: FursonaSection[],
  locale = "en",
  parentHost = "me.furrycolombia.com",
) {
  return render(
    <PublicSections
      sections={sections}
      locale={locale}
      parentHost={parentHost}
    />,
  );
}

describe("PublicSections", () => {
  // Not an empty state. A page with no sections is one somebody has not
  // finished, and a stranger has no use for being told so.
  it("renders nothing at all when there are no sections", () => {
    const { container } = render(
      <PublicSections sections={[]} locale="en" parentHost="" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("heads each section with its name", () => {
    renderSections([section()]);
    expect(
      screen.getByRole("heading", { name: "About", level: 2 }),
    ).toBeInTheDocument();
  });

  it("reads the section name in the locale being read", () => {
    renderSections([section()], "es");
    expect(
      screen.getByRole("heading", { name: "Acerca de", level: 2 }),
    ).toBeInTheDocument();
  });

  // 0009 stores sort_order, so array position is not what comes back.
  it("orders sections by their stored order, not their position", () => {
    renderSections([
      section({ name_en: "Second", sort_order: 2 }),
      section({ name_en: "First", sort_order: 1 }),
    ]);
    const headings = screen
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent);
    expect(headings).toEqual(["First", "Second"]);
  });

  it("orders items by their stored order too", () => {
    renderSections([
      section({
        items: [
          item({ title_en: "Second", sort_order: 2 }),
          item({ title_en: "First", sort_order: 1 }),
        ],
      }),
    ]);
    const titles = screen
      .getAllByRole("heading", { level: 3 })
      .map((h) => h.textContent);
    expect(titles).toEqual(["First", "Second"]);
  });

  describe("cards", () => {
    it("shows the item's icon", () => {
      renderSections([
        section({ type: "cards", items: [item({ icon: "paw-print" })] }),
      ]);
      expect(document.querySelector('[data-icon="paw-print"]')).not.toBeNull();
    });

    // The same rule IconPicker applies on the writing side, needing its own
    // test because this component does not share that one's code. `icon` is
    // free text as far as 0009 is concerned.
    // Every card gets a tile, including the ones whose author chose no icon.
    // Rendering it only sometimes is what made a row of cards ragged, and a
    // ragged row is most of why these did not read as cards at all.
    it("still gives a card an icon when its author chose none", () => {
      renderSections([section({ type: "cards", items: [item()] })]);
      expect(document.querySelector("[data-icon]")).not.toBeNull();
      expect(screen.getByText("English words.")).toBeInTheDocument();
    });

    it("falls back for a name lucide does not have", () => {
      renderSections([
        section({ type: "cards", items: [item({ icon: "not-an-icon" })] }),
      ]);
      expect(document.querySelector('[data-icon="not-an-icon"]')).toBeNull();
      expect(document.querySelector("[data-icon]")).not.toBeNull();
    });

    // Only the layouts that need a tile pass a fallback. A link with no icon is
    // an ordinary link, and giving it a default would put a meaningless mark
    // beside somebody's carefully named button.
    it("leaves a link without an icon alone", () => {
      renderSections([
        section({
          type: "links",
          items: [item({ link_url: "https://example.test/x" })],
        }),
      ]);
      expect(document.querySelector("[data-icon]")).toBeNull();
    });
  });

  // A disclosure that needs no script, on the one page a stranger might reach
  // with JavaScript switched off.
  describe("accordion", () => {
    it("renders a details element per item", () => {
      renderSections([section({ type: "accordion" })]);
      expect(document.querySelectorAll("details")).toHaveLength(1);
    });

    it("puts the title in the summary", () => {
      renderSections([section({ type: "accordion" })]);
      expect(document.querySelector("summary")?.textContent).toBe(
        "English title",
      );
    });
  });

  describe("two-column", () => {
    // "Two columns" names the shape of each ROW — a label against its value —
    // not a grid with two items per row. The first version rendered the second
    // thing, so these assert the structure rather than only the words: a `dt`
    // and a `dd` in one list is the layout, and a pair of headings would not be.
    it("renders each item as a label and its value", () => {
      const { container } = renderSections([section({ type: "two-column" })]);
      const label = container.querySelector("dt");
      const value = container.querySelector("dd");
      expect(label).toHaveTextContent("English title");
      expect(value).toHaveTextContent("English words.");
      expect(label?.closest("dl")).toBe(value?.closest("dl"));
    });
  });

  describe("gallery", () => {
    it("renders an image described by the item's own title", () => {
      renderSections([
        section({
          type: "gallery",
          items: [item({ image_url: "https://example.test/a.png" })],
        }),
      ]);
      const image = screen.getByRole("img");
      expect(image).toHaveAttribute("src", "https://example.test/a.png");
      expect(image).toHaveAttribute("alt", "English title");
    });

    // A slot somebody added and has not filled in should show nothing, not a
    // broken image with a caption under it.
    it("skips an item with no image address", () => {
      renderSections([
        section({
          type: "gallery",
          items: [
            item({ image_url: "https://example.test/a.png", sort_order: 1 }),
            item({ title_en: "Empty", sort_order: 2 }),
          ],
        }),
      ]);
      expect(screen.getAllByRole("img")).toHaveLength(1);
      expect(screen.queryByText("Empty")).toBeNull();
    });

    it("renders no images when none has an address", () => {
      renderSections([section({ type: "gallery", items: [item()] })]);
      expect(screen.queryByRole("img")).toBeNull();
    });
  });

  describe("the language it renders", () => {
    it.each(["cards", "accordion", "two-column"] as const)(
      "prefers the locale's language in a %s section",
      (type) => {
        renderSections([section({ type })], "es");
        expect(screen.getByText("Palabras en español.")).toBeInTheDocument();
      },
    );

    // Forced by the schema: `_en` is required and `_es` optional, so Spanish is
    // the field that may be missing. A reader in Spanish sees the author's
    // English rather than a blank.
    it("falls back to English when the Spanish was never written", () => {
      renderSections(
        [
          section({
            name_es: undefined,
            items: [item({ title_es: undefined, description_es: undefined })],
          }),
        ],
        "es",
      );
      expect(
        screen.getByRole("heading", { name: "About", level: 2 }),
      ).toBeInTheDocument();
      expect(screen.getByText("English words.")).toBeInTheDocument();
    });
  });
});

describe("the expressive layouts", () => {
  /**
   * Renders one section of a given layout with one item.
   *
   * @param type - the layout.
   * @param overrides - what the single item carries.
   * @returns the render result.
   */
  function one(
    type: FursonaSection["type"],
    overrides: Partial<FursonaSectionItem> = {},
  ) {
    return renderSections([section({ type, items: [item(overrides)] })]);
  }

  describe("video and music", () => {
    it("frames a YouTube link on the no-cookie host", () => {
      const { container } = one("video", {
        link_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      });
      expect(container.querySelector("iframe")).toHaveAttribute(
        "src",
        "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
      );
    });

    it("frames a Spotify link", () => {
      const { container } = one("music", {
        link_url: "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT",
      });
      expect(container.querySelector("iframe")).toHaveAttribute(
        "src",
        "https://open.spotify.com/embed/track/4cOdK2wGLETKBW3PvgPWqT",
      );
    });

    // A page that starts playing at whoever opened it is the one thing about
    // the era this borrows from that nobody actually wants back.
    it("never grants the frame autoplay", () => {
      const { container } = one("video", {
        link_url: "https://youtu.be/dQw4w9WgXcQ",
      });
      expect(
        container.querySelector("iframe")?.getAttribute("allow"),
      ).not.toContain("autoplay");
    });

    // The whole point of resolving rather than passing through. If this ever
    // renders a frame, a fursona page can host an attacker's page inside itself.
    it.each([
      "javascript:alert(1)",
      "https://evil.example/player",
      "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ",
    ])("frames nothing for %s", (link_url) => {
      const { container } = one("video", { link_url });
      expect(container.querySelector("iframe")).toBeNull();
    });

    // Refused is not the same as ignored. An author who pasted a link this hub
    // cannot play still gets their link, and can see that it is not a player.
    it("falls back to a plain link when it cannot resolve a player", () => {
      one("video", { link_url: "https://example.test/a-video" });
      expect(screen.getByRole("link")).toHaveAttribute(
        "href",
        "https://example.test/a-video",
      );
    });

    // The one prop this file threads beyond `items`/`locale`: Twitch's player
    // needs `parent=` naming the embedding domain, and that can only come
    // from the route-resolved `parentHost`, never from what the author
    // pasted.
    it("frames a Twitch channel using the configured hub host", () => {
      const { container } = one("video", {
        link_url: "https://www.twitch.tv/luna",
      });
      expect(container.querySelector("iframe")).toHaveAttribute(
        "src",
        "https://player.twitch.tv/?channel=luna&parent=me.furrycolombia.com",
      );
    });

    it("frames a portrait player without the video aspect", () => {
      render(
        <PublicSections
          locale="en"
          parentHost="me.furrycolombia.com"
          sections={[
            {
              name_en: "Clips",
              type: "video",
              sort_order: 1,
              items: [
                {
                  title_en: "A clip",
                  description_en: "",
                  link_url:
                    "https://www.tiktok.com/@luna/video/7123456789012345678",
                  sort_order: 1,
                },
              ],
            },
          ]}
        />,
      );
      const frame = screen.getByTitle("A clip");
      expect(frame.className).toContain("aspect-9/16");
      expect(frame.className).not.toContain("aspect-video");
    });
  });

  describe("links", () => {
    it("links an ordinary address", () => {
      one("links", { link_url: "https://example.test/refsheet" });
      const link = screen.getByRole("link");
      expect(link).toHaveAttribute("href", "https://example.test/refsheet");
      expect(link).toHaveAttribute("target", "_blank");
    });

    // A page anybody can publish links on has to say so to a crawler, or it
    // becomes a way to buy ranking.
    it("marks the link as untrusted and user-generated", () => {
      one("links", { link_url: "https://example.test/refsheet" });
      const rel = screen.getByRole("link").getAttribute("rel") ?? "";
      expect(rel).toContain("noopener");
      expect(rel).toContain("noreferrer");
      expect(rel).toContain("nofollow");
      expect(rel).toContain("ugc");
    });

    // React escapes text and not URL schemes, so nothing upstream of the anchor
    // is stopping this. The item still renders — it just is not a link.
    it.each([
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
    ])("refuses to link %s", (link_url) => {
      one("links", { link_url });
      expect(screen.queryByRole("link")).toBeNull();
      expect(screen.getByText("English title")).toBeInTheDocument();
    });
  });

  describe("socials", () => {
    it("shows a known brand's label and handle when the title is empty", () => {
      one("socials", {
        title_en: "",
        link_url: "https://www.instagram.com/luna.fox",
      });
      expect(screen.getByText("Instagram")).toBeInTheDocument();
      expect(screen.getByText("@luna.fox")).toBeInTheDocument();
    });

    it("falls back to the hostname for a host it does not know", () => {
      one("socials", {
        title_en: "",
        link_url: "https://some-artist-site.example/luna",
      });
      expect(screen.getByText("some-artist-site.example")).toBeInTheDocument();
    });

    it("prefers the author's own title over the brand label", () => {
      one("socials", {
        title_en: "My Instagram",
        link_url: "https://www.instagram.com/luna.fox",
      });
      expect(screen.getByText("My Instagram")).toBeInTheDocument();
      expect(screen.queryByText("Instagram")).toBeNull();
    });

    // The whole point of the layout: an unrecognised host is still a usable,
    // clickable chip, exactly like a known one.
    it("links an unrecognised host", () => {
      one("socials", { link_url: "https://some-artist-site.example/luna" });
      expect(screen.getByRole("link")).toHaveAttribute(
        "href",
        "https://some-artist-site.example/luna",
      );
    });

    it("renders an unlinkable address as text, never as an anchor", () => {
      render(
        <PublicSections
          locale="en"
          parentHost=""
          sections={[
            {
              name_en: "Elsewhere",
              type: "socials",
              sort_order: 1,
              items: [
                {
                  title_en: "Somewhere",
                  description_en: "",
                  link_url: "javascript:alert(1)",
                  sort_order: 1,
                },
              ],
            },
          ]}
        />,
      );
      expect(screen.queryByRole("link")).toBeNull();
      expect(screen.getByText("Somewhere")).toBeInTheDocument();
    });

    it("marks every anchor untrusted, user-generated, and opened in a new tab", () => {
      one("socials", { link_url: "https://www.instagram.com/luna.fox" });
      const link = screen.getByRole("link");
      expect(link).toHaveAttribute("target", "_blank");
      const rel = link.getAttribute("rel") ?? "";
      expect(rel).toContain("noopener");
      expect(rel).toContain("noreferrer");
      expect(rel).toContain("nofollow");
      expect(rel).toContain("ugc");
    });

    it("lets the item's own icon override the derived brand icon", () => {
      one("socials", {
        icon: "paw-print",
        link_url: "https://www.instagram.com/luna.fox",
      });
      expect(document.querySelector('[data-icon="paw-print"]')).not.toBeNull();
      expect(document.querySelector('[data-icon="camera"]')).toBeNull();
    });

    it("uses the derived brand icon when the author picked none", () => {
      one("socials", { link_url: "https://www.instagram.com/luna.fox" });
      expect(document.querySelector('[data-icon="camera"]')).not.toBeNull();
    });

    it("falls back to the generic icon for an unrecognised host with no chosen icon", () => {
      one("socials", { link_url: "https://some-artist-site.example/luna" });
      expect(document.querySelector('[data-icon="globe"]')).not.toBeNull();
    });
  });

  describe("posts", () => {
    it("frames a Telegram post", () => {
      const { container } = one("posts", {
        link_url: "https://t.me/telegram/436",
      });
      expect(container.querySelector("iframe")).toHaveAttribute(
        "src",
        "https://t.me/telegram/436?embed=1",
      );
    });

    it("frames an Instagram post", () => {
      const { container } = one("posts", {
        link_url: "https://www.instagram.com/p/DbbY9pdm6Q2/",
      });
      expect(container.querySelector("iframe")).toHaveAttribute(
        "src",
        "https://www.instagram.com/p/DbbY9pdm6Q2/embed",
      );
    });

    it("frames a tweet", () => {
      const { container } = one("posts", {
        link_url: "https://x.com/NASA/status/2088355206723477740",
      });
      expect(container.querySelector("iframe")).toHaveAttribute(
        "src",
        "https://platform.twitter.com/embed/Tweet.html?id=2088355206723477740",
      );
    });

    it("frames a Pinterest pin", () => {
      const { container } = one("posts", {
        link_url: "https://www.pinterest.com/pin/21744010694976967/",
      });
      expect(container.querySelector("iframe")).toHaveAttribute(
        "src",
        "https://assets.pinterest.com/ext/embed.html?id=21744010694976967",
      );
    });

    // One table entry per Mastodon instance, so a post on any allowed
    // instance must frame — not just the one somebody happens to try first.
    it.each([
      [
        "https://mastodon.social/@Mastodon/116765910384325070",
        "https://mastodon.social/@Mastodon/116765910384325070/embed",
      ],
      [
        "https://mstdn.social/@Desa13l/117103829078125562",
        "https://mstdn.social/@Desa13l/117103829078125562/embed",
      ],
      [
        "https://meow.social/@avithetiger/113250402988268487",
        "https://meow.social/@avithetiger/113250402988268487/embed",
      ],
      [
        "https://furry.engineer/@sudaksis/117103833536639917",
        "https://furry.engineer/@sudaksis/117103833536639917/embed",
      ],
    ])("frames a Mastodon post on %s", (link_url, expectedSrc) => {
      const { container } = one("posts", { link_url });
      expect(container.querySelector("iframe")).toHaveAttribute(
        "src",
        expectedSrc,
      );
    });

    it("asks for the post frame shape, not the video one", () => {
      const { container } = one("posts", {
        link_url: "https://t.me/telegram/436",
      });
      const frame = container.querySelector("iframe");
      expect(frame?.className).toContain("h-150");
      expect(frame?.className).not.toContain("aspect-video");
    });

    it("never grants the frame autoplay", () => {
      const { container } = one("posts", {
        link_url: "https://t.me/telegram/436",
      });
      expect(
        container.querySelector("iframe")?.getAttribute("allow"),
      ).not.toContain("autoplay");
    });

    // Bluesky is exactly the case this fallback exists for: `embed.bsky.app`
    // hard-refuses the handle a shareable Bluesky link carries (see
    // `embed-providers.ts`), so it never resolves to a frame here — and must
    // still show up as the same branded chip the socials layout would give it,
    // never as nothing and never as a bare link.
    it("falls back to a branded Bluesky chip when no provider can frame it", () => {
      const { container } = one("posts", {
        title_en: "",
        link_url: "https://bsky.app/profile/bsky.app/post/3msqpuobiwk2t",
      });
      expect(container.querySelector("iframe")).toBeNull();
      expect(screen.getByText("Bluesky")).toBeInTheDocument();
      expect(screen.getByText("@bsky.app")).toBeInTheDocument();
      expect(document.querySelector('[data-icon="cloud"]')).not.toBeNull();
      expect(screen.getByRole("link")).toHaveAttribute(
        "href",
        "https://bsky.app/profile/bsky.app/post/3msqpuobiwk2t",
      );
    });

    // The same fallback also covers a host `resolveSocial` has never heard
    // of — still a usable, clickable chip rather than a dead item.
    it("falls back to an hostname chip for a host no provider or brand knows", () => {
      one("posts", {
        title_en: "",
        link_url: "https://some-artist-site.example/luna",
      });
      expect(screen.getByText("some-artist-site.example")).toBeInTheDocument();
    });

    // An address that is not even linkable — the one case where the fallback
    // chip has nothing to build an anchor from — still shows the author's own
    // title as text, exactly as the socials layout does for the same input.
    it("renders as text, never as a link, when the address is not safe to link at all", () => {
      const { container } = one("posts", { link_url: "javascript:alert(1)" });
      expect(screen.queryByRole("link")).toBeNull();
      expect(container.querySelector("iframe")).toBeNull();
      expect(screen.getByText("English title")).toBeInTheDocument();
    });
  });

  describe("carousel", () => {
    it("shows a picture per item", () => {
      one("carousel", { image_url: "https://example.test/a.png" });
      expect(screen.getByRole("img")).toHaveAttribute(
        "src",
        "https://example.test/a.png",
      );
    });

    // The same rule the gallery follows: an item somebody has not finished is
    // dropped rather than rendered as a broken frame.
    it("drops an item with no picture", () => {
      one("carousel", { image_url: undefined });
      expect(screen.queryByRole("img")).toBeNull();
    });
  });

  describe("stats, quotes and the timeline", () => {
    // The label is the title and the value is the description, which is the
    // reverse of every other layout. Asserting both proves the pairing rather
    // than just that two strings arrived.
    it("renders a stat as a label above its value", () => {
      one("stats");
      expect(screen.getByText("English title")).toBeInTheDocument();
      expect(screen.getByText("English words.")).toBeInTheDocument();
    });

    it("renders a quotation with its attribution", () => {
      const { container } = one("quote");
      expect(container.querySelector("blockquote")).toHaveTextContent(
        "English words.",
      );
      expect(container.querySelector("figcaption")).toHaveTextContent(
        "English title",
      );
    });

    // An ordered list, because the entries are in an order that means something.
    it("renders the timeline as an ordered list", () => {
      const { container } = one("timeline");
      expect(container.querySelector("ol > li")).toHaveTextContent(
        "English title",
      );
    });
  });
});

describe("an item whose description nobody wrote", () => {
  // **A description may now be empty, because a template hands somebody a
  // heading to fill in rather than prose to delete.** So every layout has to
  // leave out the element rather than render a blank one — an empty `<p>` in a
  // gap-spaced grid is a visible hole nobody put there.
  //
  // `two-column` is the deliberate exception and is asserted separately: a `dt`
  // without its `dd` is invalid markup and breaks the pairing the layout exists
  // to express.
  const blank = (type: SectionType) => ({
    name_en: "Section",
    type,
    sort_order: 1,
    items: [
      {
        title_en: "Just a heading",
        description_en: "",
        ...(type === "gallery" || type === "carousel"
          ? { image_url: "https://example.test/a.png" }
          : {}),
        ...(type === "links" ||
        type === "video" ||
        type === "music" ||
        type === "socials" ||
        type === "posts"
          ? { link_url: "https://example.test/" }
          : {}),
        sort_order: 1,
      },
    ],
  });

  it.each(SECTION_TYPES.filter((type) => type !== "two-column"))(
    "renders %s with no empty element in its place",
    (type) => {
      const { container } = render(
        <PublicSections
          sections={[blank(type)]}
          locale="en"
          parentHost="me.furrycolombia.com"
        />,
      );
      const blanks = [
        ...container.querySelectorAll("p, blockquote, figcaption"),
      ]
        .filter((el) => el.textContent?.trim() === "")
        .map((el) => el.tagName);
      expect(blanks).toEqual([]);
    },
  );

  // **A row with no value is not a pair, so it does not render.** It used to
  // keep the blank cell, on the argument that a `dt` needs its `dd` — true, and
  // the answer is to drop BOTH, not to render half a row. A label with nothing
  // beside it is noise on somebody's public page, and the label reappears the
  // moment they write the value.
  it("hides a two-column row whose value nobody wrote", () => {
    const { container } = render(
      <PublicSections
        sections={[
          {
            name_en: "Design notes",
            type: "two-column",
            sort_order: 1,
            items: [
              {
                title_en: "Markings",
                description_en: "",
                sort_order: 1,
              },
              {
                title_en: "Colours",
                description_en: "Cream and rust.",
                sort_order: 2,
              },
            ],
          },
        ]}
        locale="en"
        parentHost="me.furrycolombia.com"
      />,
    );
    expect(container.querySelectorAll("dt")).toHaveLength(1);
    expect(container.querySelectorAll("dd")).toHaveLength(1);
    expect(screen.getByText("Colours")).toBeInTheDocument();
    expect(screen.queryByText("Markings")).toBeNull();
  });

  // And when nothing is left, the list goes too. An empty `dl` is a bordered
  // box with nothing in it — the blank cell again, one level up.
  it("renders no list at all when every row is empty", () => {
    const { container } = render(
      <PublicSections
        sections={[blank("two-column")]}
        locale="en"
        parentHost="me.furrycolombia.com"
      />,
    );
    expect(container.querySelector("dl")).toBeNull();
  });
});

describe("a section's own style", () => {
  // The unthemed case has to stay a genuine absence, not an empty style
  // object — an empty `style=""` attribute is still a change to markup that
  // used to carry none at all.
  it("adds no extra attributes when the section carries no style", () => {
    const { container } = renderSections([section()]);
    const wrapper = container.querySelector("section");
    expect(wrapper).not.toBeNull();
    expect(wrapper?.hasAttribute("style")).toBe(false);
  });

  // **This is the sabotage-provable regression test for the claim above; the
  // DOM-level one is not.** React's SSR serializer drops an empty
  // `style={{}}` exactly as it drops no `style` prop at all —
  // `renderToStaticMarkup` emits identical markup for both — so swapping
  // `sectionStyle`'s early return for `return {}` leaves every DOM-level
  // assertion in this file green. Calling the function directly, before
  // React's serializer gets a chance to hide the difference, is the one
  // place this can actually go red.
  it("returns undefined, not an empty object, for a section with no style", () => {
    expect(sectionStyle(undefined)).toBeUndefined();
  });

  // Asserting the VALUES, not merely that a style attribute exists — a
  // wrapper emitting the wrong skin, or none at all beyond an empty object,
  // would pass a test that only checked for a non-empty attribute.
  it("carries its chosen skin's own overrides", () => {
    const { container } = renderSections([
      section({ style: { skin: "neobrutalism" } }),
    ]);
    const wrapper = container.querySelector("section");
    expect(wrapper?.style.getPropertyValue("--skin-round")).toBe("0");
    expect(wrapper?.style.getPropertyValue("--skin-border")).toBe("3px");
  });

  // The regression this feature exists to fix: a skin has to carry the FULL
  // property set, defaults included, or a property neobrutalism does not
  // mention would fall through to whatever the enclosing page happens to be
  // wearing rather than resetting to the design's own default.
  it("resets a property its own skin does not set, rather than inheriting the page's", () => {
    const { container } = renderSections([
      section({ style: { skin: "neobrutalism" } }),
    ]);
    const wrapper = container.querySelector("section");
    expect(wrapper?.style.getPropertyValue("--skin-font")).toBe(
      "var(--font-sans)",
    );
  });

  it("paints a background picture it was given", () => {
    const { container } = renderSections([
      section({
        style: { background_url: "https://example.test/bg.png" },
      }),
    ]);
    const wrapper = container.querySelector("section");
    expect(wrapper?.style.backgroundImage).toBe(
      'url("https://example.test/bg.png")',
    );
  });

  it("tiles the background when told to", () => {
    const { container } = renderSections([
      section({
        style: {
          background_url: "https://example.test/bg.png",
          background_fit: "tile",
        },
      }),
    ]);
    const wrapper = container.querySelector("section");
    expect(wrapper?.style.backgroundRepeat).toBe("repeat");
    expect(wrapper?.style.backgroundSize).toBe("");
  });

  it("covers with the background when told to", () => {
    const { container } = renderSections([
      section({
        style: {
          background_url: "https://example.test/bg.png",
          background_fit: "cover",
        },
      }),
    ]);
    const wrapper = container.querySelector("section");
    expect(wrapper?.style.backgroundSize).toBe("cover");
    expect(wrapper?.style.backgroundRepeat).toBe("");
  });

  // The same rule every other pasted address on this page follows: an
  // address `safeHttpUrl` refuses paints nothing, never something built from
  // what was typed. `javascript:` is refused for the same reason an anchor
  // never carries one unescaped.
  it("paints nothing when the address is not http(s)", () => {
    const { container } = renderSections([
      section({ style: { background_url: "javascript:alert(1)" } }),
    ]);
    const wrapper = container.querySelector("section");
    expect(wrapper?.hasAttribute("style")).toBe(false);
  });

  it("carries both a skin and a background at once", () => {
    const { container } = renderSections([
      section({
        style: {
          skin: "glass",
          background_url: "https://example.test/bg.png",
          background_fit: "cover",
        },
      }),
    ]);
    const wrapper = container.querySelector("section");
    expect(wrapper?.style.getPropertyValue("--skin-round")).toBe("2");
    expect(wrapper?.style.backgroundImage).toBe(
      'url("https://example.test/bg.png")',
    );
  });

  // Integration-level coverage for the quote regression below: rendered end
  // to end, a host that still carries a `"` after normalisation paints
  // nothing. This alone is **not** the sabotage-provable regression test —
  // see the note on `backgroundImageValue`'s own suite for why jsdom's
  // CSSOM already hides the difference at this layer, whether or not the
  // refusal exists.
  it("refuses a background address whose host still carries a quote", () => {
    const { container } = renderSections([
      section({
        style: { background_url: 'https://ex"ample.test/a.png' },
      }),
    ]);
    const wrapper = container.querySelector("section");
    expect(wrapper?.hasAttribute("style")).toBe(false);
  });

  // The sharper version of the same case: a skin chosen alongside the
  // quoted address proves the background is what gets refused, rather than
  // merely proving the whole style bag came back empty.
  it("keeps its skin but paints no background when the host still carries a quote", () => {
    const { container } = renderSections([
      section({
        style: {
          skin: "glass",
          background_url: 'https://ex"ample.test/a.png',
        },
      }),
    ]);
    const wrapper = container.querySelector("section");
    expect(wrapper?.style.getPropertyValue("--skin-round")).toBe("2");
    expect(wrapper?.style.backgroundImage).toBe("");
  });
});

describe("backgroundImageValue", () => {
  // **This is the sabotage-provable regression test, and the DOM-level ones
  // above are not.** jsdom's `CSSStyleDeclaration` silently drops a
  // malformed value on assignment — confirmed directly: setting
  // `element.style.backgroundImage` to the exact string this function would
  // build from a quoted host, were it not refused, reads back as `""`,
  // identically whether or not that refusal exists. A test that only
  // observes the rendered DOM therefore cannot go red on the unfixed code;
  // this one calls the pure function directly, before any sink gets a
  // chance to hide the difference.
  it("builds a url() value for a safe address", () => {
    expect(backgroundImageValue("https://example.test/bg.png")).toBe(
      'url("https://example.test/bg.png")',
    );
  });

  it("returns nothing for an address with no scheme http(s) can trust", () => {
    expect(backgroundImageValue("javascript:alert(1)")).toBeUndefined();
  });

  it("returns nothing when no address was given", () => {
    expect(backgroundImageValue(undefined)).toBeUndefined();
  });

  // The regression: `safeHttpUrl`'s WHATWG normalisation percent-encodes a
  // `"` in a path or query, but leaves one in the HOST untouched — confirmed
  // directly: `new URL('https://ex"ample.test/a.png').toString()` still
  // carries the quote. Built into `url("…")` unchecked, that quote would
  // close the CSS string early in ANY context that string is later
  // interpolated into, not only the one this file happens to use today.
  it("refuses an address whose host still carries a quote after normalisation", () => {
    expect(backgroundImageValue('https://ex"ample.test/a.png')).toBeUndefined();
  });

  // The second gap normalisation leaves open: a raw `\` in the query or
  // fragment survives `safeHttpUrl` untouched, and sitting right before the
  // closing `"` this function appends, it turns that closing quote into a
  // CSS escape sequence rather than the string's own end — the built value
  // never closes. `new URL('https://example.test/?x\\').toString()` keeps
  // the backslash verbatim, confirming this is not something normalisation
  // already handles.
  it("refuses an address whose query still carries a backslash", () => {
    expect(backgroundImageValue("https://example.test/?x\\")).toBeUndefined();
  });

  // A quote surviving in the path or query, by contrast, is exactly what
  // `safeHttpUrl` already neutralises — percent-encoded before this function
  // ever sees it — so it must still build a value rather than over-refusing.
  it("still builds a value when a quote only ever reached the path", () => {
    expect(backgroundImageValue('https://example.test/a".png')).toBe(
      'url("https://example.test/a%22.png")',
    );
  });
});
