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

    // The resolved TEMPLATE, not a class name — a grid that always renders one
    // column would still carry whatever static class it was given. This is the
    // literal value a browser's `auto-fill` reads to decide how many columns
    // fit, so asserting it is asserting the behaviour itself, not a proxy for
    // it. `card_size: "l"` is Task 1's schema key; nothing before this task
    // read it, and this is that reading. The `min(…, 100%)` wrapper around
    // the minimum is asserted here too — jsdom cannot tell it apart from a
    // bare `minmax(size, 1fr)` since neither one lays anything out, so this
    // is a template-text check, not proof it stops the overflow it exists
    // for. `card-size-grid.spec.ts` is what proves that, in a real browser.
    it("grids with the large minimum when the section chose card_size l", () => {
      const { container } = renderSections([
        section({ type: "cards", style: { card_size: "l" } }),
      ]);
      const grid = container.querySelector('[data-testid="public-cards"]');
      expect(grid).toHaveStyle({
        gridTemplateColumns:
          "repeat(auto-fill, minmax(min(var(--card-size, 16rem), 100%), 1fr))",
      });
      // The section wrapper is what actually carries the chosen minimum — the
      // grid's own template never changes; it always reads through the same
      // `var()`. `--card-size` on the ancestor is the value that resolves it.
      const wrapper = container.querySelector("section");
      expect(wrapper?.style.getPropertyValue("--card-size")).toBe("20rem");
    });

    it("grids with the small minimum when the section chose card_size s", () => {
      const { container } = renderSections([
        section({ type: "cards", style: { card_size: "s" } }),
      ]);
      const wrapper = container.querySelector("section");
      expect(wrapper?.style.getPropertyValue("--card-size")).toBe("12rem");
    });

    // No `card_size` at all: the wrapper carries no `--card-size` of its own,
    // so the grid falls through to the literal default baked into its
    // template — asserted below, once, since it is the same string regardless
    // of which section renders it.
    it("sets no --card-size on the wrapper when the section chose none", () => {
      const { container } = renderSections([section({ type: "cards" })]);
      const wrapper = container.querySelector("section");
      expect(wrapper?.style.getPropertyValue("--card-size")).toBe("");
    });

    // The template's own fallback — read directly off the grid, independent of
    // whether any section ever sets `--card-size` at all. A section with no
    // `style` renders no wrapper `style` attribute (Phase C's guarantee,
    // asserted in "a section's own style" below) and still grids correctly,
    // because the default lives in the template's literal, not in anything
    // `sectionStyle` has to emit.
    it("grids with the default minimum when the section carries no style at all", () => {
      const { container } = renderSections([section({ type: "cards" })]);
      const grid = container.querySelector('[data-testid="public-cards"]');
      expect(grid).toHaveStyle({
        gridTemplateColumns:
          "repeat(auto-fill, minmax(min(var(--card-size, 16rem), 100%), 1fr))",
      });
    });
  });

  // Variable-height packing: CSS columns rather than a uniform grid, so a
  // long entry and a short one sit together instead of leaving the ragged
  // gaps `cards` and `gallery` leave.
  describe("masonry", () => {
    it("shows the item's icon", () => {
      renderSections([
        section({ type: "masonry", items: [item({ icon: "paw-print" })] }),
      ]);
      expect(document.querySelector('[data-icon="paw-print"]')).not.toBeNull();
    });

    // The same rule `cards` follows, for the same reason: a column where
    // only some items are anchored by a tile reads as ragged, so an item
    // whose author chose no icon still gets one.
    it("still gives an item an icon when its author chose none", () => {
      renderSections([section({ type: "masonry", items: [item()] })]);
      expect(document.querySelector("[data-icon]")).not.toBeNull();
      expect(screen.getByText("English words.")).toBeInTheDocument();
    });

    it("carries the public-masonry test id", () => {
      const { container } = renderSections([section({ type: "masonry" })]);
      expect(
        container.querySelector('[data-testid="public-masonry"]'),
      ).not.toBeNull();
    });

    // The mechanism the layout exists for: without `break-inside-avoid`, a
    // browser is free to split one item across a column break. The class
    // IS the mechanism here, so asserting it is asserting the behaviour,
    // not a proxy for it — unlike the grid template string `Cards` asserts,
    // there is no computed layout property jsdom could read instead.
    it("keeps each item from splitting across a column break", () => {
      const { container } = renderSections([section({ type: "masonry" })]);
      const item = container.querySelector(
        '[data-testid="public-masonry"] > div',
      );
      expect(item).toHaveClass("break-inside-avoid");
    });

    // One column on a phone, two from 40rem, three from 64rem — the
    // responsive column count the TSDoc calls load-bearing. Nothing else in
    // this diff would notice a refactor that dropped it, since
    // `src/features/*/presentation/**` is excluded from coverage.
    it("sets a responsive column count on the container", () => {
      const { container } = renderSections([section({ type: "masonry" })]);
      const grid = container.querySelector('[data-testid="public-masonry"]');
      expect(grid).toHaveClass("columns-1", "sm:columns-2", "lg:columns-3");
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

  // `progress` inverts the pair the same way `stats` and `quote` do — title
  // is the label, description is the value — and additionally tries to READ
  // that value as a number to draw a bar from.
  describe("progress", () => {
    // Both strings landing in the document proves nothing about which one is
    // styled as the label and which as the value — a swap of the two
    // `className`s would leave that assertion green. The inversion is the
    // one thing the brief calls most likely to be got wrong, so this reads
    // the actual styling: the title carries the small muted uppercase label
    // treatment `Stats` uses for its label, and the description carries the
    // bold value treatment.
    it("styles the title as the label and the description as the value", () => {
      one("progress", { description_en: "60%" });
      expect(screen.getByText("English title")).toHaveClass(
        "text-(--muted)",
        "uppercase",
      );
      expect(screen.getByText("60%")).toHaveClass("font-bold");
    });

    it.each([
      ["a bare number", "60", "60"],
      ["a percentage", "60%", "60"],
      ["a fraction", "3/5", "60"],
      // Clamped rather than refused: a bar cannot draw past its own edge.
      ["a value over 100", "150%", "100"],
      // A species trait on a scale is ordinarily written as a decimal —
      // "7.5/10", not "75%" — so every form progressValue reads a decimal too.
      ["a decimal fraction", "7.5/10", "75"],
      ["a decimal percentage", "7.5%", "8"],
      ["a bare decimal", "2.5", "3"],
    ])("draws a bar for %s", (_label, description, percent) => {
      const { container } = one("progress", { description_en: description });
      const bar = container.querySelector('[role="progressbar"]');
      expect(bar).toHaveAttribute("aria-valuenow", percent);
    });

    // Not a supported form — the regexes require digits, so a leading `-`
    // falls through every one of them rather than being read and clamped.
    it("refuses a negative value rather than clamping it to zero", () => {
      const { container } = one("progress", { description_en: "-10" });
      expect(container.querySelector('[role="progressbar"]')).toBeNull();
      expect(screen.getByText("-10")).toBeInTheDocument();
    });

    // The trap the brief names explicitly: a description that is not a
    // number must render as a plain row, never a broken bar.
    it("renders a plain row, not a bar, when the description is not a number", () => {
      const { container } = one("progress", {
        description_en: "Almost there",
      });
      expect(container.querySelector('[role="progressbar"]')).toBeNull();
      expect(screen.getByText("English title")).toBeInTheDocument();
      expect(screen.getByText("Almost there")).toBeInTheDocument();
    });

    // A fraction with a zero denominator would divide by zero; refused
    // rather than drawing a bar sized from Infinity or NaN.
    it("refuses a fraction with a zero denominator", () => {
      const { container } = one("progress", { description_en: "3/0" });
      expect(container.querySelector('[role="progressbar"]')).toBeNull();
      expect(screen.getByText("3/0")).toBeInTheDocument();
    });

    // Regression: a fraction whose numerator AND denominator both overflow
    // `Number` reads as `Infinity / Infinity`, which is `NaN` — not caught by
    // the zero-denominator guard above, since neither side is zero. `NaN` is
    // not `null`, so the unguarded code let the bar element render anyway:
    // `aria-valuenow="NaN"` in the accessibility tree, and a `width: "NaN%"`
    // style CSSOM rejects outright, leaving the inner div's width at its
    // block parent's — a FULL bar for a description that is nonsense. That
    // is the exact "refuses nothing, shows nothing" trap this layout exists
    // to avoid, inverted into "shows everything". Sabotage-verified: reverting
    // the `Number.isFinite` guard in `progressValue` turns this red, with
    // `[role="progressbar"]` present and `aria-valuenow="NaN"`.
    it("refuses a fraction whose numerator and denominator both overflow to Infinity", () => {
      const overflow = "9".repeat(400);
      const { container } = one("progress", {
        description_en: `${overflow}/${overflow}`,
      });
      expect(container.querySelector('[role="progressbar"]')).toBeNull();
    });

    // The same `Number.isFinite` guard also refuses a NUMERATOR-only
    // overflow — `Infinity / 5` is `Infinity`, not finite — for the same
    // reason: nobody could read it as a genuine proportion either.
    it("refuses a fraction whose numerator alone overflows to Infinity", () => {
      const overflow = "9".repeat(400);
      const { container } = one("progress", {
        description_en: `${overflow}/5`,
      });
      expect(container.querySelector('[role="progressbar"]')).toBeNull();
    });

    // A DENOMINATOR-only overflow is the one case that survives the guard —
    // not as a special case, but because it resolves to a genuine, finite
    // value: `5 / Infinity` is a real `0`, exactly what an unreadably large
    // total should draw.
    it("draws a zero-width bar when only the denominator overflows to Infinity", () => {
      const overflow = "9".repeat(400);
      const { container } = one("progress", {
        description_en: `5/${overflow}`,
      });
      const bar = container.querySelector('[role="progressbar"]');
      expect(bar).toHaveAttribute("aria-valuenow", "0");
    });

    // The global "no empty element" walk below only inspects
    // `p, blockquote, figcaption` — `progress`'s value is a `<span>`, so that
    // walk gives it no coverage. Asserting the bar's absence and the title's
    // presence proves neither half of "and shows no value": a value `<span>`
    // rendered with empty text would satisfy both and this would stay green.
    // Counting the card's own spans catches that — there is exactly one
    // (the title) when there is nothing to show as a value.
    it("draws no bar and shows no value when the description is empty", () => {
      const { container } = one("progress", { description_en: "" });
      expect(container.querySelector('[role="progressbar"]')).toBeNull();
      const card = container.querySelector(
        '[data-testid="public-progress"] > div',
      );
      expect(card?.querySelectorAll("span")).toHaveLength(1);
      expect(screen.getByText("English title")).toBeInTheDocument();
    });

    it("carries the public-progress test id", () => {
      const { container } = one("progress");
      expect(
        container.querySelector('[data-testid="public-progress"]'),
      ).not.toBeNull();
    });
  });

  // A switcher, not `accordion` rearranged: exactly one panel at a time,
  // chosen from a row of tabs, done in CSS with a radio group and `:checked`
  // rather than a client component.
  describe("tabs", () => {
    /**
     * Two items, so the "one at a time" behaviour has something to switch
     * between.
     */
    const two = () =>
      renderSections([
        section({
          type: "tabs",
          items: [
            item({ title_en: "First", description_en: "First panel." }),
            item({
              title_en: "Second",
              sort_order: 2,
              description_en: "Second panel.",
            }),
          ],
        }),
      ]);

    it("renders one radio input per item", () => {
      two();
      expect(screen.getAllByRole("radio")).toHaveLength(2);
    });

    it("checks the first tab and no other by default", () => {
      two();
      const radios = screen.getAllByRole("radio");
      expect(radios[0]).toBeChecked();
      expect(radios[1]).not.toBeChecked();
    });

    // Grouped by `name`, so arrow keys and mutual exclusivity work exactly
    // as they do in any other native radio group.
    it("groups every tab's radio under the same name", () => {
      two();
      const [first, second] = screen.getAllByRole("radio");
      expect(first).toHaveAttribute("name", second?.getAttribute("name"));
    });

    // Both panels are ALWAYS in the document — only CSS hides one — so
    // asserting that both strings appear proves nothing about which tab a
    // panel is keyed to; deleting `[label:has(:checked)+&]:block` entirely,
    // or regrouping the `Fragment` pairs into two separate lists, would
    // leave this green. The selector this layout depends on is DOM
    // adjacency: `label:has(:checked)+&` requires every panel's own
    // immediately preceding sibling to be its own tab's `<label>`. That is
    // the invariant worth asserting, because it is the one a refactor is
    // most likely to break without anyone noticing in a diff.
    it("keeps every panel immediately after its own tab's label", () => {
      const { container } = two();
      const panels = container.querySelectorAll(
        '[data-testid="public-tabs"] > div',
      );
      expect(panels).toHaveLength(2);
      for (const panel of panels) {
        const prev = panel.previousElementSibling;
        expect(prev?.tagName).toBe("LABEL");
        expect(prev?.querySelector('input[type="radio"]')).not.toBeNull();
      }
    });

    it("carries every panel's own text", () => {
      two();
      expect(screen.getByText("First panel.")).toBeInTheDocument();
      expect(screen.getByText("Second panel.")).toBeInTheDocument();
    });

    // Two `tabs` sections on one page must not fight over which of their own
    // tabs is checked — HTML radio grouping by `name` is global to the
    // document, not scoped to a component.
    it("names two tabs sections' radio groups differently", () => {
      const { container } = renderSections([
        section({ name_en: "First section", type: "tabs", sort_order: 1 }),
        section({ name_en: "Second section", type: "tabs", sort_order: 2 }),
      ]);
      const names = [...container.querySelectorAll('input[type="radio"]')].map(
        (input) => input.getAttribute("name"),
      );
      expect(new Set(names).size).toBe(2);
    });

    // Not `accordion`: no `<details>` element backs a switcher.
    it("renders no details element", () => {
      const { container } = two();
      expect(container.querySelector("details")).toBeNull();
    });

    it("carries the public-tabs test id", () => {
      const { container } = one("tabs");
      expect(
        container.querySelector('[data-testid="public-tabs"]'),
      ).not.toBeNull();
    });

    // A radio group already announces each tab as a choice with no extra
    // markup, but nothing native ties a SPECIFIC tab to a SPECIFIC panel —
    // `aria-controls` makes that explicit rather than left to be inferred
    // from adjacency.
    //
    // **The section name here is deliberately two words.** `aria-controls`
    // is a space-separated ID-reference LIST, so a `panelId` built from an
    // author's free text (`name_en`) would tokenise on any whitespace it
    // contains — "About Me" produces a broken id no single-word fixture can
    // exercise. An exact-string match against the SAME broken value
    // (`container.querySelector('[id="…"]')`, matching whatever `panelId`
    // literally is) would still "pass" on a whitespace-containing id, since
    // the `id` attribute carries the identical string — which is exactly
    // how an earlier version of this test missed the fault. This resolves
    // the relationship the way a consumer actually does: split on
    // whitespace first, the way `aria-controls`'s own ID-reference-list
    // grammar does, then look each token up by id.
    it("points each tab's aria-controls at its own panel's id, even when the section name has a space", () => {
      const { container } = renderSections([
        section({
          name_en: "About Me",
          type: "tabs",
          items: [
            item({ title_en: "First", description_en: "First panel." }),
            item({
              title_en: "Second",
              sort_order: 2,
              description_en: "Second panel.",
            }),
          ],
        }),
      ]);
      const radios = screen.getAllByRole("radio");
      for (const radio of radios) {
        const panelId = radio.getAttribute("aria-controls");
        expect(panelId).toBeTruthy();
        const tokens = panelId!.trim().split(/\s+/);
        expect(tokens).toHaveLength(1);
        const panel = document.getElementById(tokens[0]!);
        expect(panel).not.toBeNull();
        // The controlled panel is this radio's own — its label (the radio's
        // parent) is the panel's immediately preceding sibling.
        expect(panel?.previousElementSibling).toBe(radio.closest("label"));
        expect(container.contains(panel)).toBe(true);
      }
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

  // Calling the pure function directly: the resolved VALUE `--card-size`
  // carries for each size, not merely that some class exists that mentions
  // one. `sectionStyle` is what Task 1's `card_size` reaches a page through —
  // this is the reading side that key had nothing render before this task.
  it.each([
    ["s", "12rem"],
    ["m", "16rem"],
    ["l", "20rem"],
  ] as const)("maps card_size %s to --card-size %s", (card_size, min) => {
    expect(sectionStyle({ card_size })).toEqual({ "--card-size": min });
  });

  // No `card_size` chosen, but something else in the bag is — proves the key
  // is genuinely absent from what is emitted, rather than merely unobserved
  // because nothing else was set either.
  it("emits no --card-size when a style is chosen but card_size is not", () => {
    expect(sectionStyle({ skin: "glass" })).not.toHaveProperty("--card-size");
  });

  // Task 2's key: `border` becomes `--skin-border-style` verbatim, including
  // `"none"` — which is a CHOICE and is emitted exactly like any other
  // member, never treated as absence.
  it.each(["solid", "dashed", "dotted", "double", "none"] as const)(
    "maps border %s to --skin-border-style %s",
    (border) => {
      // Read through a string index because `React.CSSProperties` declares no
      // custom properties; the value is what matters, not the whole object,
      // which the floor tests below assert in full.
      expect(
        (sectionStyle({ border }) as Record<string, string> | undefined)?.[
          "--skin-border-style"
        ],
      ).toBe(border);
    },
  );

  // The floor under the WIDTH, which is what makes each of those choices do
  // something on a skin too narrow to draw it. The numbers are measured — see
  // `BORDER_MIN_WIDTH`'s own doc and `border-style-cascade.spec.ts`, which
  // watches the pixels rather than the declaration.
  it.each([
    ["solid", "1px"],
    ["dashed", "1px"],
    ["dotted", "1px"],
    ["double", "3px"],
  ] as const)("floors border %s at %s", (border, floor) => {
    expect(sectionStyle({ border })).toEqual({
      "--skin-border-style": border,
      "--skin-border-min": floor,
    });
  });

  // `none` paints nothing at any width, so a floor under it would be a width
  // with nothing to draw — and, worse, would widen the LAYOUT of every
  // surface inside a section whose author asked for no edge at all.
  it("puts no floor under a border of none", () => {
    expect(sectionStyle({ border: "none" })).toEqual({
      "--skin-border-style": "none",
    });
  });

  // A style is chosen, but not `border` — proves the token is genuinely
  // absent from what is emitted, the same guarantee `card_size` gets above,
  // rather than merely unobserved because nothing else was set either.
  //
  // **Deliberately no `skin` here.** Choosing a skin already puts
  // `--skin-border-style` in the returned object, through `nestedSkinVars`'s
  // own full property set (`SKIN_DEFAULTS` carries an entry for it, per
  // Task 1) — that is the enclosing skin's own reset, not this key's doing,
  // and asserting its absence against a skinned style would test the wrong
  // thing.
  it("emits no --skin-border-style when a style is chosen but border is not", () => {
    expect(sectionStyle({ card_size: "m" })).not.toHaveProperty(
      "--skin-border-style",
    );
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

  // The DOM-level counterpart of the `sectionStyle` unit tests above: the
  // token reaches an actual rendered `<section>` wrapper, not merely the
  // object `sectionStyle` returns.
  it("sets --skin-border-style on the wrapper when the section chose a border", () => {
    const { container } = renderSections([
      section({ style: { border: "dotted" } }),
    ]);
    const wrapper = container.querySelector("section");
    expect(wrapper?.style.getPropertyValue("--skin-border-style")).toBe(
      "dotted",
    );
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
    expect(wrapper?.style.backgroundSize).toBe("auto");
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
    expect(wrapper?.style.backgroundRepeat).toBe("no-repeat");
  });

  // **The absent fit is a third paint, not the absence of one**, and this is
  // the assertion that says so. It used to emit neither property, and
  // `background-repeat`'s initial value is `repeat` — so "Default" and "Tile"
  // were one behaviour under two names while the option's own doc promised
  // "unrepeated". Measured in a real Chromium at the time: an 8px tile over a
  // 64x64 box darkened 2048 of 4096 pixels either way, against 32 for a
  // genuinely unrepeated copy.
  //
  // `background-size: auto` is emitted for the same reason one step further:
  // `@utility surface` declares `background-size: var(--skin-gloss-size)`, so
  // on the editor's face a picture with no explicit size took the SKIN's
  // texture tile — `comic` sets `6px 6px` — and previewed as a mosaic of a
  // picture the public page renders at natural size.
  it("neither tiles nor scales a background whose fit the author left unset", () => {
    const { container } = renderSections([
      section({ style: { background_url: "https://example.test/bg.png" } }),
    ]);
    const wrapper = container.querySelector("section");
    expect(wrapper?.style.backgroundRepeat).toBe("no-repeat");
    expect(wrapper?.style.backgroundSize).toBe("auto");
  });

  // A fit with no picture is not a paint instruction at all — there is
  // nothing to repeat or scale — so neither property is emitted. Without this
  // the two above would pass on an implementation that always emitted them.
  it("emits no repeat or size when there is no picture to paint", () => {
    expect(sectionStyle({ background_fit: "tile" })).toBeUndefined();
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
