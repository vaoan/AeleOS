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
  // `circle-dot` is here because Cards falls back to it, and a mock that
  // omitted it would make the fallback look broken when it is not — the mocked
  // dependency hiding its own setup requirement, again.
  iconNames: ["sparkles", "heart", "paw-print", "circle-dot"],
}));
const { PublicSections } =
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
        ...(type === "links" || type === "video" || type === "music"
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
