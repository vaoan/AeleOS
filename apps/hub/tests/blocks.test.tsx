import { describe, expect, it, vi } from "vitest";
import {
  PAGE_MEASURES,
  type PageMeasure,
} from "@/features/actors/domain/actor-theme";
import { pageContext } from "./helpers/page-context";
import type { PageContext } from "@/features/actors/presentation/blocks";
import { NextIntlClientProvider } from "next-intl";

import messages from "@/shared/infrastructure/i18n/messages/en.json";
import { render, screen, within } from "@testing-library/react";
import {
  BLOCK_LIMITS,
  CONTAINER_MODES,
  LEAF_KINDS,
  MAX_DEPTH,
  lenientBlocksSchema,
  type Block as BlockNode,
  type ContainerBlock,
  type ContainerMode,
  type LeafBlock,
} from "@/features/actors/domain/block-schema";
import { leafFields } from "@/features/actors/domain/leaf-fields";
import { resolveEmbed } from "@/features/actors/domain/embeds";
import { EMBED_PROVIDERS } from "@/shared/domain/embed-providers";
import { PLAYER_ORIGINS } from "@/shared/domain/player-origins";
import { nestedSkinVars } from "@/shared/domain/skins";

// The glyph is lazy-loaded by a client component, which renders nothing
// synchronously here — so an assertion about WHICH icon a leaf chose has
// nothing to read without this. Every name a leaf can fall back to is in the
// list: `link` because a link leaf falls back to it, `globe` because a social
// chip does, `camera` and `cloud` because they are the brand icons
// `social-links.ts` derives for Instagram and Bluesky, and `paw-print` because
// it is the author-chosen one the derived icon must lose to. A mock omitting
// any of them would make a working fallback look broken.
vi.mock("lucide-react/dynamic", () => ({
  DynamicIcon: ({ name }: { name: string }) => <svg data-icon={name} />,
  iconNames: ["link", "globe", "camera", "cloud", "paw-print"],
}));
const { Block, LEAVES, MODES, PublicBlocks } =
  await import("@/features/actors/presentation/blocks");

// **The real list, past the mock above.** Every icon assertion in this file
// reads `data-icon`, which the mock emits for ANY name — so on its own it
// proves only that a constant matches the mock's list. A typo in a fallback
// constant would pass all of them and render nothing at all in production,
// because `PublicSectionIcon` answers `null` for a name lucide does not have:
// the exact shape of the two faults this repo has already written down, where
// the suite that mocked the dependency away is the one that could not see it.
const { iconNames: REAL_ICON_NAMES } = await vi.importActual<
  typeof import("lucide-react/dynamic")
>("lucide-react/dynamic");

/**
 * One leaf, with overrides.
 *
 * @param over - fields to replace.
 * @returns the leaf.
 */
const leaf = (over: Record<string, unknown> = {}): LeafBlock =>
  ({
    kind: "text",
    title_en: "English title",
    title_es: "Título en español",
    description_en: "English words.",
    description_es: "Palabras en español.",
    ...over,
  }) as unknown as LeafBlock;

/**
 * One container, with overrides.
 *
 * @param over - fields to replace.
 * @returns the container.
 */
const container = (over: Record<string, unknown> = {}): ContainerBlock =>
  ({
    kind: "container",
    mode: "stack",
    spaces: 1,
    children: [leaf()],
    ...over,
  }) as unknown as ContainerBlock;

/**
 * Renders one block as a page would.
 *
 * @param block - the block to render.
 * @param over - anything about its position to change.
 * @returns testing-library's result.
 */
function renderBlock(
  block: BlockNode,
  over: Partial<{
    locale: string;
    depth: number;
    path: string;
    parentHost: string;
    page: PageContext;
  }> = {},
) {
  const {
    locale = "en",
    depth = 0,
    path = "0",
    parentHost = "me.furrycolombia.com",
    page = pageContext({ parentHost }),
  } = over;
  // **The real provider with the real catalogue.** The retro player leaves are
  // the first here to reach for `useTranslations`, and rendering them bare
  // throws — which is right, because every page in this app renders inside
  // `NextIntlClientProvider`. Stubbing the translation function would measure a
  // different program; supplying what production supplies means a missing
  // catalogue key fails here too.
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <Block
        block={block}
        locale={locale}
        depth={depth}
        path={path}
        page={page}
      />
    </NextIntlClientProvider>,
  );
}

/**
 * The custom properties an element declares inline.
 *
 * Read off the `style` ATTRIBUTE rather than through `CSSStyleDeclaration`,
 * because a custom property is not a known property and an implementation is
 * free not to expose it there. Splitting on `;` is safe for these values: a
 * skin's shadows, gradients and clip paths carry commas and parentheses but
 * never a semicolon.
 *
 * @param element - the element to read.
 * @returns its declared custom properties, by name.
 */
function customProperties(element: Element): Record<string, string> {
  const declared = element.getAttribute("style") ?? "";
  return Object.fromEntries(
    declared
      .split(";")
      .map((rule) => rule.split(/:(.*)/s))
      .filter(([name]) => name?.trim().startsWith("--"))
      .map(([name, value]) => [name?.trim() ?? "", value?.trim() ?? ""]),
  );
}

/**
 * How many times a run of text appears on the rendered page.
 *
 * Counted over TEXT NODES rather than over elements: a `<label>` wrapping the
 * tab's own radio has an element child, so "the element whose whole content is
 * these words" finds nothing at all — which is a test that cannot fail rather
 * than one that passes.
 *
 * @param root - the rendered container.
 * @param words - the text to count.
 * @returns how many text nodes hold exactly it.
 */
function timesShown(root: Element, words: string): number {
  const walk = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let seen = 0;
  for (let node = walk.nextNode(); node; node = walk.nextNode()) {
    if (node.textContent === words) seen += 1;
  }
  return seen;
}

describe("MODES", () => {
  it("has a renderer for every mode the model admits", () => {
    for (const mode of CONTAINER_MODES) expect(MODES.has(mode)).toBe(true);
  });

  it("holds nothing the model does not admit", () => {
    expect([...MODES.keys()].toSorted()).toEqual(
      [...CONTAINER_MODES].toSorted(),
    );
  });

  // The shape this repo shipped a Critical from: a plain object indexed by
  // user-controlled text answers these with truthy inherited values.
  it.each([
    "__proto__",
    "constructor",
    "toString",
    "valueOf",
    "hasOwnProperty",
  ])("answers nothing for %s, which a record would answer for", (name) => {
    // **The comparison is against a record built from the same entries, not
    // against `{}`.** `Reflect.get({}, name)` stood here and was presented as
    // a control; it asserts a property of JavaScript rather than of this app
    // and cannot fail. What is worth pinning is the difference the `Map`
    // makes: a record carrying exactly these renderers still answers these
    // names, which is what passed a `!entry` guard and then had no component
    // to call.
    const asRecord = Object.fromEntries(MODES);
    expect(Reflect.get(asRecord, name)).toBeDefined();
    expect(MODES.get(name)).toBeUndefined();
  });

  it.each(["sideways", "__proto__", "constructor", "toString"])(
    "falls back to stacking for the mode %s, through the renderer itself",
    (mode) => {
      renderBlock(container({ mode: mode as ContainerMode }));
      expect(screen.getByTestId("block-stack")).toBeInTheDocument();
      expect(screen.getByTestId("public-leaf")).toBeInTheDocument();
    },
  );
});

describe("the modes", () => {
  it("stacks by default, and emits no grid at all", () => {
    renderBlock(container({ mode: "stack" }));
    const stack = screen.getByTestId("block-stack");
    expect(stack.className).toContain("flex");
    expect(stack.className).not.toContain("grid");
  });

  it("lays a grid at the container's own space count", () => {
    renderBlock(container({ mode: "grid", spaces: 3 }));
    expect(screen.getByTestId("block-grid").className).toContain(
      "@lg:[grid-template-columns:var(--block-tracks,repeat(3,minmax(0,1fr)))]",
    );
  });

  it("packs masonry into the container's own space count", () => {
    renderBlock(container({ mode: "masonry", spaces: 4 }));
    expect(screen.getByTestId("block-masonry").className).toContain(
      "@2xl:columns-4",
    );
  });

  // Without it a browser is free to split one child across a column boundary.
  it("forbids a masonry child being split across a column", () => {
    renderBlock(container({ mode: "masonry", spaces: 2 }));
    const child = screen.getByTestId("block-masonry").firstElementChild;
    expect(child?.className).toContain("break-inside-avoid");
  });

  it("scrolls a carousel sideways and snaps it", () => {
    renderBlock(container({ mode: "carousel" }));
    const row = screen.getByTestId("block-carousel");
    expect(row.className).toContain("overflow-x-auto");
    expect(row.className).toContain("snap-x");
  });

  // Both classes were sized against a full-width section, where the bleed
  // landed in the page's own padding. A block sits in a grid track now, where
  // the same bleed reaches the gap and the neighbouring column — so a carousel
  // pulls no negative margin, and the timeline's dot is paid for by a margin
  // of its own rather than by whatever happens to be outside it.
  it("keeps a carousel inside its own box", () => {
    renderBlock(container({ mode: "carousel" }));
    expect(screen.getByTestId("block-carousel").className).not.toContain("-mx");
  });

  it("keeps the timeline's dot inside its own box", () => {
    renderBlock(container({ mode: "timeline" }));
    expect(screen.getByTestId("block-timeline").className).toContain("ml-1.5");
  });

  it("orders a timeline as a list", () => {
    renderBlock(
      container({
        mode: "timeline",
        children: [leaf(), leaf({ title_en: "B" })],
      }),
    );
    const list = screen.getByTestId("block-timeline");
    expect(list.tagName).toBe("OL");
    expect(list.querySelectorAll("li")).toHaveLength(2);
  });
});

describe("tabs", () => {
  /** A container of tabs over one child of each block kind. */
  const tabbed = () =>
    container({
      mode: "tabs",
      children: [
        leaf({ title_en: "First tab" }),
        container({ name_en: "Second tab", children: [leaf()] }),
      ],
    });

  it("checks the first tab and no other", () => {
    renderBlock(tabbed());
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    expect(radios.map((radio) => radio.defaultChecked)).toEqual([true, false]);
  });

  it("puts every tab in one group, so only one can be chosen at a time", () => {
    renderBlock(tabbed());
    const names = new Set(
      (screen.getAllByRole("radio") as HTMLInputElement[]).map(
        (radio) => radio.name,
      ),
    );
    expect(names.size).toBe(1);
  });

  it("labels a tab with a leaf's title and a container's name", () => {
    renderBlock(tabbed());
    const labels = [
      ...screen.getByTestId("block-tabs").querySelectorAll("label"),
    ].map((label) => label.textContent);
    expect(labels).toEqual(["First tab", "Second tab"]);
  });

  // The tab IS the name, so the panel must not print it again. Reading the
  // `<label>` alone — which is all the first version of this suite did — sees
  // one copy and cannot tell whether there is a second, which is exactly how
  // this shipped. Count over the whole rendered tree instead.
  it.each(["First tab", "Second tab"])(
    "shows the tab %s exactly once",
    (words) => {
      const { container: root } = renderBlock(tabbed());
      expect(timesShown(root, words)).toBe(1);
    },
  );

  it("renders a panel's own body, without the name the tab already carries", () => {
    renderBlock(tabbed());
    const panel = screen
      .getByTestId("block-tabs")
      .querySelector("label")?.nextElementSibling;
    expect(panel?.textContent).toBe("English words.");
  });

  // `name_en` is optional on a container, so a `<label>` whose only content is
  // an `sr-only` radio is reachable by ordinary authoring — and that is a form
  // control with no accessible name, axe's `label` rule, the one tagged for WCAG level A.
  it("labels a tab whose child has no name of its own", () => {
    renderBlock(
      container({
        mode: "tabs",
        children: [
          container({ children: [leaf()] }),
          container({ children: [leaf()] }),
        ],
      }),
    );
    expect(screen.getByRole("radio", { name: "1" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "2" })).toBeInTheDocument();
  });

  // A dangling `aria-controls` is worse than none: it tells a screen reader a
  // relationship exists and then fails to deliver it.
  it("points every tab at a panel that exists", () => {
    const { container: root } = renderBlock(tabbed());
    for (const radio of screen.getAllByRole("radio")) {
      const target = radio.getAttribute("aria-controls") ?? "";
      expect(target).not.toBe("");
      expect(root.ownerDocument.getElementById(target)).not.toBeNull();
    }
  });

  // `getElementById` answers with the FIRST match, so "every tab points at a
  // panel that exists" passes happily on a page where every panel shares one
  // id — which is what an identifier built from anything but the path gives.
  it("gives every panel on the page an id of its own", () => {
    const { container: root } = render(
      <>
        <Block
          block={tabbed()}
          locale="en"
          depth={0}
          path="0"
          page={pageContext({ parentHost: "" })}
        />
        <Block
          block={tabbed()}
          locale="en"
          depth={0}
          path="1"
          page={pageContext({ parentHost: "" })}
        />
      </>,
    );
    const ids = [...root.querySelectorAll("[id]")].map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThan(0);
  });

  // The identifier is built from the path, which is digits and hyphens — never
  // from anything an author typed, which may carry whitespace an ID-reference
  // list would tokenise on.
  it("builds an identifier no author's words can reach", () => {
    renderBlock(
      container({
        mode: "tabs",
        name_en: "About me, at length",
        children: [leaf({ title_en: "Two words here" })],
      }),
    );
    const radio = screen.getByRole("radio");
    expect(radio.getAttribute("aria-controls")).toMatch(/^[a-z0-9-]+$/);
    expect((radio as HTMLInputElement).name).toMatch(/^[a-z0-9-]+$/);
  });

  // Two containers of tabs on one page must not fight over one selection: an
  // HTML radio group's `name` is unique to the whole document.
  it("keeps two tab groups on one page apart", () => {
    render(
      <>
        <Block
          block={tabbed()}
          locale="en"
          depth={0}
          path="0"
          page={pageContext({ parentHost: "" })}
        />
        <Block
          block={tabbed()}
          locale="en"
          depth={0}
          path="1"
          page={pageContext({ parentHost: "" })}
        />
      </>,
    );
    const names = new Set(
      (screen.getAllByRole("radio") as HTMLInputElement[]).map(
        (radio) => radio.name,
      ),
    );
    expect(names.size).toBe(2);
  });

  // The tab row paints above the panel through `order-1`/`order-2` in a
  // wrapping flex, without moving either in the document — which is what lets
  // the adjacent-sibling selector reveal a panel at all. Only a browser can
  // settle the painting; this pins the mechanism that produces it.
  it("orders the tab row above the panel without reordering the document", () => {
    renderBlock(tabbed());
    const row = screen.getByTestId("block-tabs");
    expect(row.className).toContain("flex-wrap");
    const label = row.querySelector("label");
    expect(label?.className).toContain("order-1");
    expect(label?.nextElementSibling?.className).toContain("order-2");
  });

  it("reveals a panel from its own immediately preceding label", () => {
    renderBlock(tabbed());
    const panel = screen
      .getByTestId("block-tabs")
      .querySelector("label")?.nextElementSibling;
    expect(panel?.className).toContain("[label:has(:checked)+&]:block");
    expect(panel?.className).toContain("hidden");
  });
});

describe("accordion", () => {
  it("opens each disclosure independently of the others", () => {
    renderBlock(
      container({
        mode: "accordion",
        children: [leaf({ title_en: "One" }), leaf({ title_en: "Two" })],
      }),
    );
    const disclosures = screen
      .getByTestId("block-accordion")
      .querySelectorAll("details");
    expect(disclosures).toHaveLength(2);
    // HTML's own `name` attribute would make them exclusive — which is `tabs`,
    // vertically. Multi-open is the whole difference between the two modes.
    for (const disclosure of disclosures)
      expect(disclosure.hasAttribute("name")).toBe(false);
  });

  // The summary IS the name; the disclosure's body must not repeat it.
  it("shows a disclosure's label exactly once", () => {
    const { container: root } = renderBlock(
      container({
        mode: "accordion",
        children: [leaf({ title_en: "Only once" })],
      }),
    );
    expect(timesShown(root, "Only once")).toBe(1);
  });

  it("labels a disclosure whose child has no name of its own", () => {
    renderBlock(
      container({
        mode: "accordion",
        children: [container({ children: [leaf()] })],
      }),
    );
    const summary = screen
      .getByTestId("block-accordion")
      .querySelector("summary");
    expect(summary?.textContent).toBe("1");
  });

  // The wrapper carries the border and the surface, so an empty one is a
  // bordered sliver with nothing in it — the `dl` with no rows, in a new
  // place.
  it("renders nothing at all when it holds nothing", () => {
    const { container: root } = renderBlock(
      container({ mode: "accordion", children: [] }),
    );
    expect(root.querySelector("[data-testid='block-accordion']")).toBeNull();
  });

  it("summarises each disclosure with its child's own label", () => {
    renderBlock(
      container({
        mode: "accordion",
        children: [
          container({ name_en: "A group", children: [leaf()] }),
          leaf({ title_en: "A leaf" }),
        ],
      }),
    );
    const summaries = [
      ...screen.getByTestId("block-accordion").querySelectorAll("summary"),
    ].map((summary) => summary.textContent);
    expect(summaries).toEqual(["A group", "A leaf"]);
  });
});

// THE PLACES A CONTAINER LAYS, AND THE ONES NOBODY HAS FILLED.
//
// `spaces` is a WIDTH and `children` is the content: a container lays that many
// places across and its children fill them row by row, so a fifty-picture
// gallery is three places across and seventeen rows deep. An entry may be
// `null`, which is a place holding nothing — and the whole model rests on that
// place keeping its width rather than the row closing up, because a space count
// means nothing the moment a partly-filled section renders as though it were
// narrower.
describe("the places a container lays", () => {
  it.each([
    [
      2,
      "@xs:[grid-template-columns:var(--block-tracks,repeat(2,minmax(0,1fr)))]",
    ],
    [
      3,
      "@lg:[grid-template-columns:var(--block-tracks,repeat(3,minmax(0,1fr)))]",
    ],
    [
      4,
      "@2xl:[grid-template-columns:var(--block-tracks,repeat(4,minmax(0,1fr)))]",
    ],
    [
      5,
      "@4xl:[grid-template-columns:var(--block-tracks,repeat(5,minmax(0,1fr)))]",
    ],
    [
      6,
      "@5xl:[grid-template-columns:var(--block-tracks,repeat(6,minmax(0,1fr)))]",
    ],
  ])("lays %i places across in a grid", (spaces, expected) => {
    renderBlock(container({ mode: "grid", spaces }));
    expect(screen.getByTestId("block-grid").className).toContain(expected);
  });

  // A lone block on a part-filled last row is centred across the leftover, and
  // ONLY where the leftover divides evenly — three places leave two tracks
  // beside the fourth block, four places leave three, and no track boundary
  // splits three in half.
  it.each([
    [3, "@lg:[&>*:last-child:nth-child(3n+1)]:col-start-2"],
    [5, "@4xl:[&>*:last-child:nth-child(5n+1)]:col-start-3"],
  ])(
    "centres a lone block on the last row of %i places",
    (spaces, expected) => {
      renderBlock(container({ mode: "grid", spaces }));
      expect(screen.getByTestId("block-grid").className).toContain(expected);
    },
  );

  it.each([1, 2, 4, 6])(
    "centres nothing across %i places, where the leftover is odd",
    (spaces) => {
      renderBlock(container({ mode: "grid", spaces }));
      expect(screen.getByTestId("block-grid").className).not.toContain(
        "col-start",
      );
    },
  );

  it.each([
    [2, "@xs:columns-2"],
    [3, "@lg:columns-3"],
    [4, "@2xl:columns-4"],
    [5, "@4xl:columns-5"],
    [6, "@5xl:columns-6"],
  ])("packs %i columns in a masonry", (spaces, expected) => {
    renderBlock(container({ mode: "masonry", spaces }));
    expect(screen.getByTestId("block-masonry").className).toContain(expected);
  });

  // One place is what the element already declares, so a class for it would be
  // a rule that changes nothing. Both entries exist in the map; both are empty.
  it.each([
    ["grid", "block-grid", "grid-cols-1"],
    ["masonry", "block-masonry", "columns-1"],
  ])("declares nothing extra for one place in %s", (mode, id, base) => {
    renderBlock(container({ mode: mode as ContainerMode, spaces: 1 }));
    const laid = screen.getByTestId(id).className;
    expect(laid).toContain(base);
    expect(laid).not.toContain("@");
  });

  // A count outside the vocabulary is refused by the WRITE — the strict schema
  // and `validate_block` — and deliberately admitted by the read, so this
  // arrives from a newer deployment's page being read by an older build rather
  // than from anything malformed. One place is the answer that cannot overflow
  // whatever it is laid in.
  it.each([
    ["grid", "block-grid", "grid-cols-1"],
    ["masonry", "block-masonry", "columns-1"],
  ])(
    "lays a single place for a count outside %s's vocabulary",
    (mode, id, base) => {
      renderBlock(
        container({
          mode: mode as ContainerMode,
          spaces: BLOCK_LIMITS.spaces + 3,
        }),
      );
      const laid = screen.getByTestId(id).className;
      expect(laid).toContain(base);
      expect(laid).not.toContain("@");
    },
  );

  // Every count the vocabulary admits has an entry, so a container the schema
  // accepts can never fall through to the single-place answer by accident.
  it.each([...Array.from({ length: BLOCK_LIMITS.spaces }, (_, i) => i + 1)])(
    "has an answer for a container of %i places",
    (spaces) => {
      renderBlock(container({ mode: "grid", spaces }));
      const laid = screen.getByTestId("block-grid").className;
      expect(laid).toContain("grid-cols-1");
      // One place is legitimately the base alone; every wider count has to add
      // a rule of its own, or the vocabulary silently stops at whatever the
      // map last named.
      expect(laid.includes("@") || spaces === 1).toBe(true);
    },
  );
});

describe("a place holding nothing", () => {
  /**
   * A container whose middle place is empty.
   *
   * @param mode - the arrangement to put it in.
   * @returns the container.
   */
  const gapped = (mode: string): ContainerBlock =>
    container({
      mode,
      spaces: 3,
      children: [
        leaf({ title_en: "First" }),
        null,
        leaf({ title_en: "Third" }),
      ],
    });

  // THE ASSERTION THE WHOLE MODEL RESTS ON.
  //
  // A place is POSITIONAL. `[a, null, b]` has to mean that `b` is third, and a
  // renderer that dropped the empty entry would make it second — which is the
  // collapse the flow model had and the reason this one exists. Counting the
  // grid's own children is what says the position survived; reading the third
  // one's words is what says it is the right position.
  it("keeps the third thing third when the second place is empty", () => {
    renderBlock(gapped("grid"));
    const places = [...screen.getByTestId("block-grid").children];
    expect(places).toHaveLength(3);
    expect(places[2]?.textContent).toContain("Third");
  });

  // And it draws nothing: no border, no surface, no words. A place that
  // painted a box would be a broken card rather than room for the next thing.
  it("draws nothing at all in the empty place", () => {
    renderBlock(gapped("grid"));
    const empty = screen.getByTestId("public-space");
    expect(empty.className).toBe("");
    expect(empty.childNodes).toHaveLength(0);
    expect(empty.textContent).toBe("");
  });

  // A trailing empty place is kept rather than trimmed: somebody is usually
  // about to fill it, and trimming would move every entry after the next thing
  // they add.
  it("keeps a trailing empty place", () => {
    renderBlock(
      container({
        mode: "grid",
        spaces: 3,
        children: [leaf({ title_en: "Only" }), null, null],
      }),
    );
    expect(screen.getByTestId("block-grid").children).toHaveLength(3);
    expect(screen.getAllByTestId("public-space")).toHaveLength(2);
  });

  // Every mode that lays a BOX keeps the place, because there the empty box is
  // the shape its author chose. `masonry` and `carousel` wrap each place in an
  // element of their own, so the count is of the wrapper either way.
  it.each([
    ["stack", "block-stack"],
    ["grid", "block-grid"],
    ["masonry", "block-masonry"],
    ["carousel", "block-carousel"],
    ["timeline", "block-timeline"],
  ])("keeps the empty place in %s", (mode, id) => {
    renderBlock(gapped(mode));
    expect(screen.getByTestId(id).children).toHaveLength(3);
    expect(screen.getByTestId("public-space")).toBeInTheDocument();
  });

  // And the two whose place is a CONTROL rather than a box drop it: a tab that
  // opens onto nothing and a disclosure with nothing to disclose are controls
  // that do not work, which is worse than the gap they would fill.
  it("gives an empty place no tab", () => {
    renderBlock(gapped("tabs"));
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(screen.queryByTestId("public-space")).not.toBeInTheDocument();
  });

  it("gives an empty place no disclosure", () => {
    renderBlock(gapped("accordion"));
    expect(
      screen.getByTestId("block-accordion").querySelectorAll("details"),
    ).toHaveLength(2);
    expect(screen.queryByTestId("public-space")).not.toBeInTheDocument();
  });

  // Dropping an empty place must not renumber the ones that remain. A child
  // with no name of its own is labelled by its POSITION in the container, so a
  // tab lifted off the third place says "3" whether or not the second is empty.
  it("names a lifted tab by its true position, not by what survived", () => {
    renderBlock(
      container({
        mode: "tabs",
        spaces: 3,
        children: [
          container({ children: [leaf()] }),
          null,
          container({ children: [leaf()] }),
        ],
      }),
    );
    const labels = screen
      .getAllByRole("radio")
      .map((radio) => radio.parentElement?.textContent);
    expect(labels).toEqual(["1", "3"]);
  });

  // `tabs` opens on the first place holding something. A container whose first
  // place is empty would otherwise open on nothing at all, leaving every panel
  // hidden — a section that renders as a row of tabs and no content.
  it("opens tabs on the first place that holds something", () => {
    renderBlock(
      container({
        mode: "tabs",
        spaces: 2,
        children: [null, leaf({ title_en: "Second" })],
      }),
    );
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    expect(radios).toHaveLength(1);
    expect(radios[0]?.defaultChecked).toBe(true);
  });

  // A container whose every place is empty renders no accordion at all. The
  // wrapper carries the border and the surface, so an unguarded one is a
  // bordered sliver with nothing in it.
  it("renders no accordion for a container of nothing but empty places", () => {
    renderBlock(
      container({ mode: "accordion", spaces: 2, children: [null, null] }),
    );
    expect(screen.queryByTestId("block-accordion")).not.toBeInTheDocument();
  });
});

// CONTENT ADAPTS TO ITS PARENT, NOT TO THE WINDOW.
//
// Every responsive rule in this renderer used to be a viewport breakpoint,
// which in a tree is wrong in a way that worsens with depth: a card in one
// place of a three-space section is about a third of the page wide, while every
// `sm:` rule inside it believes it has the whole screen. The fix is CSS
// container queries — no library, which matters because these are server
// components — and it works only if every container declares a containment
// context for the rules beneath it to query.
describe("the containment context", () => {
  it("declares one on the section, which is what a mode's places query", () => {
    const { container: root } = renderBlock(container({ name_en: "A name" }));
    expect(root.querySelector("section")?.className).toContain("@container");
  });

  it("declares one on a leaf's own wrapper, so a leaf asks about its own box", () => {
    renderBlock(leaf());
    expect(screen.getByTestId("public-leaf").className).toContain("@container");
  });

  it("declares one on every container of a nested tree", () => {
    const { container: root } = renderBlock(
      container({
        name_en: "Outer",
        mode: "grid",
        spaces: 2,
        children: [
          container({ mode: "grid", spaces: 2, children: [leaf()] }),
          leaf(),
        ],
      }),
    );
    const sections = [...root.querySelectorAll("section")];
    expect(sections).toHaveLength(2);
    for (const section of sections) {
      expect(section.className).toContain("@container");
    }
  });

  // THE GUARD AGAINST GOING BACK.
  //
  // A viewport breakpoint here is a fault visible only in a browser at a wide
  // window with a narrow space — exactly the case no existing 320px guard can
  // reach, because those resize the WINDOW and the window is not what is
  // narrow. A structural assertion over the rendered class lists catches the
  // next `sm:` before it needs a browser at all: a container query is
  // `@`-prefixed and a viewport one is not.
  //
  // **Every mode AND every leaf kind, both driven from the vocabulary.** It
  // used to build its children from three kinds, so a `sm:` added to any of
  // the other seven renderers would have passed — closed by grep at review
  // time, which is a person remembering rather than a guard. The children are
  // built through `leafFields`, so a kind added later arrives here carrying
  // whatever its own renderer reads, without anybody adding a case.
  it("emits no viewport breakpoint anywhere on a page of every mode and kind", () => {
    const page = CONTAINER_MODES.map((mode) =>
      container({
        name_en: `A ${mode}`,
        mode,
        spaces: BLOCK_LIMITS.spaces,
        children: [
          null,
          ...LEAF_KINDS.map((kind) => {
            const fields = leafFields(kind);
            return leaf({
              kind,
              title_en: `One ${kind}`,
              // Reads as prose to every kind but `progress`, which needs a
              // number to draw its bar at all — and a bar is markup no other
              // branch emits.
              description_en: "60%",
              ...(fields.link
                ? { link_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }
                : {}),
              ...(fields.icon ? { icon: "paw-print" } : {}),
              ...(fields.picture
                ? { image_url: "https://example.com/a.png" }
                : {}),
              ...(fields.rows
                ? { rows: [[{ text_en: "Height" }, { text_en: "180cm" }]] }
                : {}),
            });
          }),
        ],
      }),
    );
    const { container: root } = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PublicBlocks
          blocks={page}
          locale="en"
          page={pageContext({ parentHost: "me.furrycolombia.com" })}
        />
      </NextIntlClientProvider>,
    );
    // Read through `getAttribute` rather than `className`: an SVG element's
    // `className` is an `SVGAnimatedString`, which has no `split` — and a
    // lucide glyph is on this page, so the obvious form throws rather than
    // measuring anything.
    //
    // **`[data-page-gutter]` is excluded, and only that element.** It is the
    // page's own gutter — the outermost box, with no container above it — and
    // it may carry window-sized horizontal and first/last chrome according to
    // that section's style and position. The rule this guard enforces is about
    // BLOCKS adapting to their parent; the page adapting to the window is the
    // thing they adapt inside of. Its descendants are still scanned.
    const classesOf = (root_: Element) =>
      [...root_.querySelectorAll("[class]:not([data-page-gutter])")].flatMap(
        (element) => (element.getAttribute("class") ?? "").split(/\s+/),
      );
    const viewport = /^(?:sm|md|lg|xl|2xl):/;
    const offenders = classesOf(root).filter((name) => viewport.test(name));
    expect([...new Set(offenders)]).toEqual([]);
    // The anti-vacuity half: the page really did render container queries, so
    // "no viewport prefixes" is not passing on a page that emitted no
    // responsive rule at all.
    const queries = classesOf(root).filter(
      (name) => name.startsWith("@") && name.includes(":"),
    );
    expect(queries.length).toBeGreaterThan(0);
  });

  // The one card width that was a viewport rule and is now a container one.
  // 384px is right in a section with room for it and wrong in one without, and
  // the window cannot tell the difference.
  it("sizes a carousel card against its section rather than the screen", () => {
    renderBlock(container({ mode: "carousel" }));
    const card = screen.getByTestId("block-carousel").firstElementChild;
    expect(card?.className).toContain("@md:w-96");
  });
});

describe("headings", () => {
  it.each([
    [0, 2],
    [1, 3],
    [2, 4],
  ])("heads a container at depth %i with an h%i", (depth, level) => {
    renderBlock(container({ name_en: "A name" }), { depth });
    expect(
      screen.getByRole("heading", { name: "A name", level }),
    ).toBeInTheDocument();
  });

  it("has a heading for every depth a container can sit at", () => {
    for (let depth = 0; depth < MAX_DEPTH; depth += 1) {
      renderBlock(container({ name_en: `Depth ${depth}` }), { depth });
      const heading = screen.getByRole("heading", { name: `Depth ${depth}` });
      expect(Number(heading.tagName.slice(1))).toBe(depth + 2);
    }
  });

  // Inventing one would put words on somebody's page that they did not write.
  it("gives an unnamed container no heading", () => {
    renderBlock(container());
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("reads a container's name in the locale being read", () => {
    renderBlock(container({ name_en: "About", name_es: "Acerca de" }), {
      locale: "es",
    });
    expect(
      screen.getByRole("heading", { name: "Acerca de" }),
    ).toBeInTheDocument();
  });

  it("marks only a section for the end-to-end suite", () => {
    renderBlock(container({ name_en: "A section" }), { depth: 0 });
    expect(screen.getByTestId("public-section").tagName).toBe("SECTION");
  });

  // It used to hang off the heading, which renders only for a NAMED
  // container — a state the flat model could not reach, because a section's
  // name was required there. The end-to-end suite counts sections by this id,
  // and one whose author left the name blank would not be counted.
  it("marks a section whose author wrote no name", () => {
    renderBlock(container(), { depth: 0 });
    expect(screen.getByTestId("public-section")).toBeInTheDocument();
    expect(screen.queryByRole("heading")).toBeNull();
  });

  // The styled element is the `<section>`, so the marker has to be reachable
  // as that element rather than as something inside it.
  it("marks the element the style bag lands on", () => {
    renderBlock(container({ name_en: "A section", style: { skin: "paper" } }));
    const marked = screen.getByTestId("public-section");
    expect(customProperties(marked)["--skin-round"]).toBe("0.4");
  });

  it("does not mark a nested container as a section", () => {
    renderBlock(container({ name_en: "A group" }), { depth: 1 });
    expect(screen.queryByTestId("public-section")).toBeNull();
  });

  // The fallback exists so a depth outside the vocabulary keeps its heading
  // rather than losing it; a heading a level off is recoverable and a missing
  // one is not.
  it("still heads a container at a depth the vocabulary does not name", () => {
    renderBlock(container({ name_en: "Too deep" }), { depth: MAX_DEPTH + 1 });
    expect(
      screen.getByRole("heading", { name: "Too deep", level: 4 }),
    ).toBeInTheDocument();
  });
});

describe("a leaf", () => {
  it("shows its title and its words", () => {
    renderBlock(leaf());
    expect(screen.getByText("English title")).toBeInTheDocument();
    expect(screen.getByText("English words.")).toBeInTheDocument();
  });

  it("reads them in the locale being read", () => {
    renderBlock(leaf(), { locale: "es" });
    expect(screen.getByText("Título en español")).toBeInTheDocument();
    expect(screen.getByText("Palabras en español.")).toBeInTheDocument();
  });

  // Not having written the Spanish yet is an ordinary state, never a fault.
  it("falls back to English for a language its author has not written", () => {
    renderBlock(leaf({ title_es: undefined, description_es: undefined }), {
      locale: "es",
    });
    expect(screen.getByText("English title")).toBeInTheDocument();
  });

  // An empty `<p>` is a visible hole in a gap-spaced grid. The title assertion
  // is what stops this passing on a leaf that rendered nothing at all.
  it("leaves the words out entirely when there are none", () => {
    const { container: root } = renderBlock(leaf({ description_en: "" }));
    expect(screen.getByText("English title")).toBeInTheDocument();
    expect(root.querySelectorAll("p")).toHaveLength(0);
  });

  it("names its kind, so a browser spec can find every one of them", () => {
    renderBlock(leaf({ kind: "quote" }));
    expect(screen.getByTestId("public-leaf")).toHaveAttribute(
      "data-block-kind",
      "quote",
    );
  });

  // The seam: a per-kind renderer replaces what is INSIDE this element and can
  // never drop the containment context or the style bag, because neither is
  // its to carry.
  it("keeps the containment context and the style bag outside the leaf's own content", () => {
    renderBlock(
      container({
        mode: "grid",
        spaces: 4,
        children: [leaf({ style: { skin: "paper" } })],
      }),
    );
    const wrapper = screen.getByTestId("public-leaf");
    expect(wrapper.className).toContain("@container");
    expect(customProperties(wrapper)["--skin-round"]).toBe("0.4");
  });

  // A leaf's title is styled as a heading and is not one: a leaf sits at any
  // depth the model admits, including one past the deepest level HEADING names,
  // so a real `<h*>` here would skip or repeat a level depending on what
  // contains it — what axe's `heading-order` names. That rule is
  // `best-practice` and `a11y.spec.ts` runs only the WCAG tags, so THIS case is
  // the guard rather than a restatement of one; see `TAGS` there.
  it("gives a leaf's own title no heading element", () => {
    renderBlock(leaf());
    expect(screen.queryByRole("heading")).toBeNull();
  });

  // An empty `<span>` is a hole in a gap-spaced grid exactly as an empty `<p>`
  // is. The schema requires `title_en`, and this file never trusts a caller's
  // validation over its own rendering.
  it("leaves the title out entirely when its author wrote none", () => {
    const { container: root } = renderBlock(
      leaf({ title_en: "", title_es: "" }),
    );
    expect(root.querySelectorAll("span")).toHaveLength(0);
    expect(screen.getByText("English words.")).toBeInTheDocument();
  });
});

describe("LEAVES", () => {
  it("holds nothing the model does not admit as a kind", () => {
    for (const kind of LEAVES.keys())
      expect(LEAF_KINDS as readonly string[]).toContain(kind);
  });

  // The shape this repo shipped a Critical from: a plain object indexed by
  // user-controlled text answers these with truthy inherited values, which
  // passes a `!entry` guard and then has no component to call.
  it.each([
    "__proto__",
    "constructor",
    "toString",
    "valueOf",
    "hasOwnProperty",
  ])("answers nothing for %s, which a record would answer for", (name) => {
    // Against a record of the same entries rather than against `{}` — see the
    // identical note in the `MODES` suite for why the empty-object form was a
    // control that could not fail.
    const asRecord = Object.fromEntries(LEAVES);
    expect(Reflect.get(asRecord, name)).toBeDefined();
    expect(LEAVES.get(name)).toBeUndefined();
  });

  it.each(["__proto__", "constructor", "toString", "not-a-kind"])(
    "renders the leaf's own words for the kind %s, through the renderer itself",
    (kind) => {
      renderBlock(leaf({ kind }));
      expect(screen.getByText("English title")).toBeInTheDocument();
      expect(screen.getByText("English words.")).toBeInTheDocument();
    },
  );

  // The `satisfies Record<LeafKind, …>` on the private object is the real
  // guard and it is a compile-time one, which no test can watch fail. This is
  // the runtime half of the same claim, and it is what stays true if somebody
  // widens the `satisfies` back to `Partial`.
  it("has a renderer for every kind the model admits", () => {
    for (const kind of LEAF_KINDS) expect(LEAVES.get(kind)).toBeDefined();
  });

  // Whatever a kind renders, it renders SOMETHING: a block its author placed in
  // a grid that vanished would leave a hole nothing explains.
  //
  // **The context has to let every kind draw**, which no context a real page
  // builds ever does: `owner` belongs to a fursona's page and `fursonas` to a
  // person's, and production never carries both. Handing this one both is what
  // makes the claim "every kind renders something" testable at all — the
  // alternative is running it twice and exempting a kind from each pass, which
  // is the same coverage with a hole in the middle where somebody later adds a
  // kind and forgets one side.
  const everyKind = pageContext({
    fursonas: [{ handle: "luna", displayName: "Luna", avatarUrl: null }],
  });

  it.each(LEAF_KINDS)("renders something for a %s leaf", (kind) => {
    const { container: root } = renderBlock(leaf({ kind }), {
      page: everyKind,
    });
    expect(screen.getByTestId("public-leaf")).not.toBeEmptyDOMElement();
    // **Markup, not text.** `avatar` is the first kind that renders neither a
    // heading nor prose — a portrait is unmistakably something on the page and
    // has no `textContent` at all, so the older assertion measured "is this
    // kind textual" while claiming to measure "does this kind render". The
    // element check above is the claim; this keeps the stricter half for every
    // kind that does have words.
    expect(root.innerHTML).not.toBe("");
  });
});

describe("a link leaf", () => {
  /**
   * A `link` leaf pointing somewhere.
   *
   * @param url - the address its author pasted.
   * @param over - anything else to change.
   * @returns the leaf.
   */
  const linkLeaf = (
    url: string | undefined,
    over: Record<string, unknown> = {},
  ) => leaf({ kind: "link", link_url: url, ...over });

  it("anchors an address safeHttpUrl accepts", () => {
    renderBlock(linkLeaf("https://example.test/luna"));
    const anchor = screen.getByRole("link");
    expect(anchor).toHaveAttribute("href", "https://example.test/luna");
    expect(anchor).toHaveAttribute("target", "_blank");
  });

  // A page anybody can publish links on has to say so, or it becomes a way to
  // buy ranking; the second pair is about the reader's own tab.
  it("tells a search engine and the reader's tab what the link is", () => {
    renderBlock(linkLeaf("https://example.test/luna"));
    expect(screen.getByRole("link").getAttribute("rel")?.split(" ")).toEqual(
      expect.arrayContaining(["noopener", "noreferrer", "nofollow", "ugc"]),
    );
  });

  // `http:` is allowed where a frame refuses it: parts of this fandom's web
  // have never had a certificate.
  it("anchors a plain http address", () => {
    renderBlock(linkLeaf("http://old.example.test/"));
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "http://old.example.test/",
    );
  });

  // React escapes text, not URL schemes. The address is REFUSED rather than
  // escaped — the value is made safe by construction.
  it.each(["javascript:alert(1)", "data:text/html,<script>", "not a url"])(
    "refuses %s and renders a plain card rather than an anchor",
    (url) => {
      renderBlock(linkLeaf(url));
      expect(screen.queryByRole("link")).toBeNull();
      expect(screen.getByTestId("block-link").tagName).toBe("DIV");
      // Never nothing: its author still sees what they typed.
      expect(screen.getByText("English title")).toBeInTheDocument();
    },
  );

  it("renders a plain card for a leaf whose author pasted no address at all", () => {
    renderBlock(linkLeaf(undefined));
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("English title")).toBeInTheDocument();
  });

  it("shows the author's own icon", () => {
    renderBlock(linkLeaf("https://example.test/", { icon: "paw-print" }));
    expect(document.querySelector('[data-icon="paw-print"]')).not.toBeNull();
  });

  // A tile rendered only sometimes makes a row of links ragged.
  it("still gives a link a tile when its author chose no icon", () => {
    renderBlock(linkLeaf("https://example.test/"));
    expect(document.querySelector('[data-icon="link"]')).not.toBeNull();
  });

  it("falls back to the same tile for a name lucide does not have", () => {
    renderBlock(linkLeaf("https://example.test/", { icon: "not-an-icon" }));
    expect(document.querySelector('[data-icon="link"]')).not.toBeNull();
  });

  // The tab IS the title, so the card must not print it again — and it must
  // still be a link.
  it("drops the title a tab already showed, and stays a link", () => {
    const { container: root } = renderBlock(
      container({
        mode: "tabs",
        children: [linkLeaf("https://example.test/luna")],
      }),
    );
    expect(timesShown(root, "English title")).toBe(1);
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "https://example.test/luna",
    );
  });
});

describe("a picture leaf", () => {
  /**
   * A `picture` leaf.
   *
   * @param url - the address its author pasted.
   * @param over - anything else to change.
   * @returns the leaf.
   */
  const pictureLeaf = (
    url: string | undefined,
    over: Record<string, unknown> = {},
  ) => leaf({ kind: "picture", image_url: url, ...over });

  it("shows a picture at the address its author pasted", () => {
    renderBlock(pictureLeaf("https://pics.example.test/luna.png"));
    const picture = screen.getByRole("img");
    expect(picture).toHaveAttribute(
      "src",
      "https://pics.example.test/luna.png",
    );
  });

  // The title is the ALT TEXT here, exactly as `gallery` and `carousel` read
  // it — and it is not printed beside the picture, because a caption repeating
  // the alt is read out twice by a screen reader.
  it("reads the title as alt text rather than printing it", () => {
    renderBlock(pictureLeaf("https://pics.example.test/luna.png"));
    expect(screen.getByRole("img")).toHaveAttribute("alt", "English title");
    expect(screen.getByTestId("block-picture").textContent).toBe(
      "English words.",
    );
  });

  it("captions the picture with the description, in the locale being read", () => {
    renderBlock(pictureLeaf("https://pics.example.test/luna.png"), {
      locale: "es",
    });
    expect(screen.getByText("Palabras en español.")).toBeInTheDocument();
  });

  // An empty `<figcaption>` is a visible hole in a gap-spaced grid.
  it("leaves the caption out when there is nothing to say", () => {
    const { container: root } = renderBlock(
      pictureLeaf("https://pics.example.test/luna.png", {
        description_en: "",
        description_es: "",
      }),
    );
    expect(root.querySelectorAll("figcaption")).toHaveLength(0);
  });

  // The flat `gallery` put the stored value straight into `src`. Nothing was
  // exploitable there — an `<img>` cannot execute a `javascript:` address — but
  // a value trusted because of where it lands is a trap for the next sink.
  it.each(["javascript:alert(1)", "not a url"])(
    "refuses %s and shows the words instead of a broken picture",
    (url) => {
      renderBlock(pictureLeaf(url));
      expect(screen.queryByRole("img")).toBeNull();
      expect(screen.getByText("English title")).toBeInTheDocument();
      expect(screen.getByText("English words.")).toBeInTheDocument();
    },
  );

  // The flat gallery dropped such an item entirely, which is right for an item
  // in a list of pictures and wrong for a block somebody placed in a grid.
  it("falls back to a plain row rather than nothing when there is no address", () => {
    renderBlock(pictureLeaf(undefined));
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("English title")).toBeInTheDocument();
  });
});

/** One address per provider, so nothing framed can escape the table unseen. */
const PROVIDER_SAMPLE = new Map<string, string>([
  ["youtube", "https://youtu.be/dQw4w9WgXcQ"],
  ["vimeo", "https://vimeo.com/123456789"],
  ["spotify", "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT"],
  ["soundcloud", "https://soundcloud.com/artist/track"],
  ["dailymotion", "https://dai.ly/x8abcd1"],
  ["tiktok", "https://www.tiktok.com/@user/video/1234567890123456789"],
  ["applemusic", "https://music.apple.com/us/song/slug/1234567"],
  ["deezer", "https://www.deezer.com/track/123456"],
  ["tidal", "https://tidal.com/track/123456"],
  ["mixcloud", "https://www.mixcloud.com/user/show/"],
  ["twitch", "https://twitch.tv/luna"],
  ["telegram", "https://t.me/channelname/123"],
  ["instagram", "https://www.instagram.com/p/Abc12"],
  ["twitter", "https://x.com/user/status/123456"],
  ["pinterest", "https://www.pinterest.com/pin/123456789"],
  ["mastodon-social", "https://mastodon.social/@user/123456"],
  ["mstdn-social", "https://mstdn.social/@user/123456"],
  ["meow-social", "https://meow.social/@user/123456"],
  ["furry-engineer", "https://furry.engineer/@user/123456"],
]);

describe("an embed leaf", () => {
  /**
   * A `post` leaf pointing at something.
   *
   * **These cases used to say `player`.** The two embed kinds were one leaf
   * under two names — byte-identical field sets, one renderer — and `post`
   * absorbed both, so every provider that framed under `player` frames here.
   * `player` is a retro media player now.
   *
   * @param url - the address its author pasted.
   * @param over - anything else to change.
   * @returns the leaf.
   */
  const playerLeaf = (
    url: string | undefined,
    over: Record<string, unknown> = {},
  ) => leaf({ kind: "embed", link_url: url, ...over });

  /**
   * The box a frame is sized by.
   *
   * The `<iframe>` fills it and carries none of the sizing itself, because a
   * height a provider reports has to override the shape's own class and an
   * inline style on the frame inside would not reach the class outside it.
   *
   * @param frame - the `<iframe>`, found by its accessible name.
   * @returns the element carrying the shape and the height.
   */
  const frameBox = (frame: HTMLElement) => {
    const box = frame.parentElement;
    if (!box) throw new Error("the frame is not in a box");
    return box;
  };

  it("frames the address resolveEmbed built, and never the one pasted", () => {
    renderBlock(playerLeaf("https://www.youtube.com/watch?v=dQw4w9WgXcQ"));
    const frame = screen.getByTitle("English title");
    expect(frame.tagName).toBe("IFRAME");
    expect(frame).toHaveAttribute(
      "src",
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    );
  });

  // The whole claim of the embed model, at the seam that renders it: nothing a
  // block frames can be off an origin `frame-src` allows. `PLAYER_ORIGINS` is
  // derived from `EMBED_PROVIDERS` and `csp.test.ts` asserts `frame-src`
  // contains every one of them, so this closes the loop from the other end.
  it("has a sample address for every provider a block can reach", () => {
    expect(
      EMBED_PROVIDERS.map((provider) => provider.id).filter(
        (id) => !PROVIDER_SAMPLE.has(id),
      ),
    ).toEqual([]);
  });

  it.each([...PROVIDER_SAMPLE])(
    "frames %s on an origin the policy allows",
    (id, url) => {
      renderBlock(playerLeaf(url));
      const frame = screen.getByTitle("English title");
      expect(PLAYER_ORIGINS).toContain(
        new URL(frame.getAttribute("src") ?? "").origin,
      );
      // **The key has to be the provider the sample actually resolves to.**
      // Without this the two guards above pass while leaving a provider
      // unexercised: the completeness case only checks that every id HAS a
      // key, and the origin case only checks the origin is allowed — so a
      // sample edited to another provider's host satisfies both, silently, and
      // its own provider is never driven.
      expect(
        resolveEmbed(url, { parentHost: "me.furrycolombia.com" })?.provider,
      ).toBe(id);
    },
  );

  // A profile that starts making noise at whoever opened it is the thing people
  // remember most fondly and least accurately about the pages this borrows from.
  it("asks for no autoplay permission", () => {
    renderBlock(playerLeaf("https://youtu.be/dQw4w9WgXcQ"));
    expect(
      screen.getByTitle("English title").getAttribute("allow"),
    ).not.toContain("autoplay");
  });

  it("sandboxes the frame, loads it lazily and trims the referrer", () => {
    renderBlock(playerLeaf("https://youtu.be/dQw4w9WgXcQ"));
    const frame = screen.getByTitle("English title");
    expect(frame.getAttribute("sandbox")?.split(" ")).toEqual([
      "allow-scripts",
      "allow-same-origin",
      "allow-presentation",
      "allow-popups",
      "allow-popups-to-escape-sandbox",
    ]);
    expect(frame).toHaveAttribute("loading", "lazy");
    expect(frame).toHaveAttribute(
      "referrerpolicy",
      "strict-origin-when-cross-origin",
    );
  });

  // A named case per shape: the frame's aspect comes from the resolution, never
  // from a two-way test that would send every future shape down one branch.
  //
  // **The classes are on the BOX and not on the `<iframe>`.** The box is what
  // carries a height the provider reports, so the fallback the class expresses
  // has to sit on the same element the reported number overrides — an
  // `h-150` on the frame inside would keep applying underneath a measured
  // 225.
  it.each([
    ["https://youtu.be/dQw4w9WgXcQ", "aspect-video"],
    ["https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT", "h-42"],
    ["https://www.tiktok.com/@user/video/1234567890123456789", "aspect-9/16"],
    ["https://t.me/channelname/123", "h-150"],
  ])("shapes the frame for %s", (url, expected) => {
    renderBlock(playerLeaf(url));
    expect(frameBox(screen.getByTitle("English title")).className).toContain(
      expected,
    );
  });

  // **Every number here was watched in a browser inside the provider's own
  // document**, and each is a case the shape alone could not express: Apple
  // Music serves an album, a song and a music video from one host, and Spotify
  // and Tidal both key off the kind their own address carries.
  it.each([
    ["https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT", "152px"],
    ["https://open.spotify.com/album/4cOdK2wGLETKBW3PvgPWqT", "352px"],
    ["https://music.apple.com/us/album/slug/1234567", "450px"],
    ["https://music.apple.com/us/song/slug/1234567", "175px"],
    ["https://tidal.com/track/123456", "121px"],
    ["https://www.tiktok.com/@user/video/1234567890123456789", "756px"],
  ])("frames %s at its measured height", (url, expected) => {
    renderBlock(playerLeaf(url));
    // **The number goes on the FRAME, not on the box.** Every element here is
    // `border-box` and the box carries the border, so a height put on the box
    // is the border's to spend first — measured in the real app, that handed
    // Spotify 150px of viewport for a 152px box and it drew its 80px card.
    // The box takes `auto` and sizes itself to the frame it holds.
    const frame = screen.getByTitle("English title");
    expect(frame.style.height).toBe(expected);
    expect(frameBox(frame).style.height).toBe("auto");
  });

  // A provider that paints whatever frame it is given must NOT be pinned to a
  // number: an inline height would crop a scrolling list nothing was wrong
  // with. The shape's own class is the whole answer for these.
  it.each([
    "https://youtu.be/dQw4w9WgXcQ",
    "https://soundcloud.com/artist/track",
    "https://tidal.com/album/123456",
    "https://www.mixcloud.com/user/show/",
  ])("leaves %s to fill its frame", (url) => {
    renderBlock(playerLeaf(url));
    const frame = screen.getByTitle("English title");
    expect(frame.style.height).toBe("100%");
    expect(frameBox(frame).style.height).toBe("");
  });

  // The one address form whose KIND decides the shape rather than the height:
  // measured at four widths, an Apple music video is 16∶9 at every one, so any
  // fixed number would be right at exactly one of them.
  it("frames an Apple music video as a video, not as a player card", () => {
    renderBlock(
      playerLeaf("https://music.apple.com/us/music-video/slug/12345"),
    );
    const box = frameBox(screen.getByTitle("English title"));
    expect(box.className).toContain("aspect-video");
    expect(box.className).not.toContain("h-42");
  });

  // A post caps at 420px and a TikTok at 320, in a place that may be far
  // wider — so the leftover has to be split rather than all pushed to the
  // right. The cap is on the FIGURE so the caption is as wide as the frame.
  it.each([
    ["https://t.me/channelname/123", "max-w-105"],
    ["https://www.tiktok.com/@user/video/1234567890123456789", "max-w-80"],
  ])("centres the capped figure for %s", (url, cap) => {
    renderBlock(playerLeaf(url));
    const figure = frameBox(screen.getByTitle("English title")).parentElement;
    expect(figure?.className).toContain(cap);
    expect(figure?.className).toContain("mx-auto");
  });

  // A player that takes the whole place must not be centred INTO a narrower
  // one: `mx-auto` with no cap does nothing, and a cap here would shrink a
  // video for no reason.
  it("caps neither a video nor an audio player", () => {
    renderBlock(playerLeaf("https://youtu.be/dQw4w9WgXcQ"));
    const figure = frameBox(screen.getByTitle("English title")).parentElement;
    expect(figure?.className).not.toContain("max-w-");
  });

  // An `<iframe>` with an empty `title` is axe's `frame-title`, at WCAG level A.
  it("names a frame whose author wrote no title after its provider", () => {
    renderBlock(
      playerLeaf("https://youtu.be/dQw4w9WgXcQ", {
        title_en: "",
        title_es: "",
      }),
    );
    expect(screen.getByTitle("youtube")).toBeInTheDocument();
  });

  // "Refuses nothing, shows nothing" is the trap the media layouts already
  // avoid — and an empty frame is the other half of it.
  it("renders a link, never an empty frame, for an address it cannot place", () => {
    renderBlock(playerLeaf("https://example.test/watch/123"));
    expect(document.querySelector("iframe")).toBeNull();
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "https://example.test/watch/123",
    );
  });

  it("falls through to a plain row for an address it cannot even link", () => {
    renderBlock(playerLeaf("javascript:alert(1)"));
    expect(document.querySelector("iframe")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("English title")).toBeInTheDocument();
  });

  // Twitch's player refuses to load unless `parent=` names the embedding
  // domain, so without one it must resolve to a link rather than to a frame
  // guaranteed to error.
  it("degrades Twitch to a link when this deployment has no hostname", () => {
    renderBlock(playerLeaf("https://twitch.tv/luna"), { parentHost: "" });
    expect(document.querySelector("iframe")).toBeNull();
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "https://twitch.tv/luna",
    );
  });

  it("names this deployment in Twitch's parent parameter", () => {
    renderBlock(playerLeaf("https://twitch.tv/luna"), {
      parentHost: "me.furrycolombia.com",
    });
    expect(screen.getByTitle("English title").getAttribute("src")).toContain(
      "parent=me.furrycolombia.com",
    );
  });

  it("captions the player with its author's own words", () => {
    renderBlock(playerLeaf("https://youtu.be/dQw4w9WgXcQ"));
    expect(screen.getByTestId("block-embed").textContent).toBe(
      "English titleEnglish words.",
    );
  });

  it("drops the title a tab already showed, and keeps framing the player", () => {
    const { container: root } = renderBlock(
      container({
        mode: "tabs",
        children: [playerLeaf("https://youtu.be/dQw4w9WgXcQ")],
      }),
    );
    expect(timesShown(root, "English title")).toBe(1);
    expect(root.querySelector("iframe")).not.toBeNull();
  });
});

describe("a post leaf", () => {
  /**
   * A `post` leaf pointing at something.
   *
   * @param url - the address its author pasted.
   * @returns the leaf.
   */
  const postLeaf = (url: string | undefined) =>
    leaf({ kind: "embed", link_url: url });

  it("frames a post the table can place", () => {
    renderBlock(postLeaf("https://t.me/channelname/123"));
    expect(screen.getByTitle("English title")).toHaveAttribute(
      "src",
      "https://t.me/channelname/123?embed=1",
    );
  });

  // Bluesky is the case this exists for: `embed.bsky.app` hard-refuses the
  // handle a pasted Bluesky address carries, so it never resolves — and a page
  // that already brands Bluesky as a chip elsewhere would be inconsistent
  // showing it unbranded here.
  it("renders a branded chip, never a bare link, for an address it cannot place", () => {
    renderBlock(postLeaf("https://bsky.app/profile/luna.test/post/abc"));
    expect(document.querySelector("iframe")).toBeNull();
    expect(screen.getByTestId("block-social")).toBeInTheDocument();
    expect(document.querySelector('[data-icon="cloud"]')).not.toBeNull();
  });

  // **This case INVERTED when the two embed kinds merged, and the previous
  // behaviour was deliberate rather than a bug.** It used to chip, and the
  // reason was written down: Twitch is the only provider reading `parentHost`,
  // its player is a video rather than a post, and a video did not belong in a
  // post's column — the `player` leaf framed it instead.
  //
  // There is no post's column any more. `post` absorbed every embed, and it
  // already frames YouTube, Vimeo, TikTok and Dailymotion, so a chipped Twitch
  // would be the one arbitrary case rather than the consistent one. The old
  // reasoning did not become wrong; its premise went away.
  it("frames a Twitch address now that one kind holds every embed", () => {
    renderBlock(postLeaf("https://twitch.tv/luna"), {
      parentHost: "me.furrycolombia.com",
    });
    const frame = document.querySelector("iframe");
    expect(frame).not.toBeNull();
    // Twitch refuses to load unless `parent=` names the embedding domain, so
    // the merged kind has to pass it — which is what changed here.
    expect(frame?.getAttribute("src")).toContain("parent=me.furrycolombia.com");
  });

  it("still chips a Twitch address when no parent host is known", () => {
    // Without it Twitch would frame a player guaranteed to error, so the
    // resolver refuses and the chip is the honest outcome.
    renderBlock(postLeaf("https://twitch.tv/luna"), { parentHost: "" });
    expect(document.querySelector("iframe")).toBeNull();
    expect(screen.getByTestId("block-social")).toBeInTheDocument();
  });

  it("falls through to a chip with its author's words for an unlinkable address", () => {
    renderBlock(postLeaf("javascript:alert(1)"));
    expect(document.querySelector("iframe")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("English title")).toBeInTheDocument();
  });
});

describe("a social leaf", () => {
  /**
   * A `social` leaf pointing at something.
   *
   * @param url - the address its author pasted.
   * @param over - anything else to change.
   * @returns the leaf.
   */
  const socialLeaf = (
    url: string | undefined,
    over: Record<string, unknown> = {},
  ) => leaf({ kind: "social", link_url: url, ...over });

  it("brands a host it knows, with the handle out of the address", () => {
    renderBlock(socialLeaf("https://instagram.com/luna"));
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "https://instagram.com/luna",
    );
    expect(screen.getByText("@luna")).toBeInTheDocument();
    expect(document.querySelector('[data-icon="camera"]')).not.toBeNull();
  });

  // The property that makes this kind worth having, and the one somebody will
  // want to "fix" by refusing an unknown host. Do not: nothing here reaches a
  // frame, so tightening it would delete the reason it exists.
  it("chips a host it does not know, labelled with the hostname", () => {
    renderBlock(
      socialLeaf("https://itch.example.test/luna", {
        title_en: "",
        title_es: "",
      }),
    );
    expect(screen.getByText("itch.example.test")).toBeInTheDocument();
    expect(screen.getByRole("link")).toBeInTheDocument();
    expect(document.querySelector('[data-icon="globe"]')).not.toBeNull();
  });

  it("prefers the author's own title over the brand's label", () => {
    renderBlock(socialLeaf("https://instagram.com/luna"));
    expect(screen.getByText("English title")).toBeInTheDocument();
    expect(screen.queryByText("Instagram")).toBeNull();
  });

  // The tab has already said what the author wrote, so the chip names the
  // service instead — which is derived from the address rather than a repeat of
  // anybody's words.
  it("names the service when a tab already showed the title", () => {
    const { container: root } = renderBlock(
      container({
        mode: "tabs",
        children: [socialLeaf("https://instagram.com/luna")],
      }),
    );
    expect(timesShown(root, "English title")).toBe(1);
    expect(screen.getByText("Instagram")).toBeInTheDocument();
  });

  it("lets the author's own icon beat the derived brand one", () => {
    renderBlock(
      socialLeaf("https://instagram.com/luna", { icon: "paw-print" }),
    );
    expect(document.querySelector('[data-icon="paw-print"]')).not.toBeNull();
    expect(document.querySelector('[data-icon="camera"]')).toBeNull();
  });

  it.each(["javascript:alert(1)", "data:text/html,<script>", undefined])(
    "refuses to link %s and renders the chip as text",
    (url) => {
      renderBlock(socialLeaf(url));
      expect(screen.queryByRole("link")).toBeNull();
      expect(screen.getByTestId("block-social").tagName).toBe("SPAN");
      expect(screen.getByText("English title")).toBeInTheDocument();
    },
  );

  // A chip that has neither the author's title nor a brand to fall back to is
  // reachable: an unrecognised address with no title written.
  it("shows no empty label when there is nothing to call it", () => {
    const { container: root } = renderBlock(
      socialLeaf("javascript:alert(1)", { title_en: "", title_es: "" }),
    );
    expect(root.textContent).toBe("");
  });
});

describe("a stat leaf", () => {
  /**
   * A `stat` leaf.
   *
   * @param over - anything to change.
   * @returns the leaf.
   */
  const statLeaf = (over: Record<string, unknown> = {}): LeafBlock =>
    leaf({ kind: "stat", ...over });

  // The debt `LEAF_KINDS` records, paid: what made `two-column` worth having
  // was the PAIRING, not the two columns. Reading `dt` and `dd` by tag is what
  // pins the inversion — both strings being present would stay green if the
  // two were swapped.
  it("pairs the label with its value, as a dl announced together", () => {
    const { container: root } = renderBlock(statLeaf());
    const list = root.querySelector("dl");
    expect(list?.querySelector("dt")?.textContent).toBe("English title");
    expect(list?.querySelector("dd")?.textContent).toBe("English words.");
  });

  // The markup above says which is which to a screen reader; this says it to
  // everybody else. A swap of the two class lists would leave the `dl` case
  // green.
  it("sets the value large and the label small", () => {
    renderBlock(statLeaf());
    expect(screen.getByText("English title")).toHaveClass(
      "text-(--muted)",
      "uppercase",
    );
    expect(screen.getByText("English words.")).toHaveClass("font-bold");
  });

  it("reads both halves in the locale being read", () => {
    const { container: root } = renderBlock(statLeaf(), { locale: "es" });
    expect(root.querySelector("dt")?.textContent).toBe("Título en español");
    expect(root.querySelector("dd")?.textContent).toBe("Palabras en español.");
  });

  // The drop rule, inherited whole: a `dt` with no `dd` is invalid markup, so
  // half a row is not an option.
  it("drops the pair entirely, label and all, when the value is unwritten", () => {
    const { container: root } = renderBlock(
      statLeaf({ description_en: "", description_es: "" }),
    );
    expect(root.querySelector("dl")).toBeNull();
    expect(root.querySelector("dt")).toBeNull();
    expect(root.querySelector("dd")).toBeNull();
  });

  // And where the drop rule INVERTS for a leaf: the flat layout then dropped
  // the whole list, which was right for one row among others. A block sits in a
  // grid track its author placed it in, so it must still say something.
  it("still shows its label rather than vanishing when the pair is dropped", () => {
    renderBlock(statLeaf({ description_en: "", description_es: "" }));
    expect(screen.getByText("English title")).toBeInTheDocument();
    expect(screen.getByTestId("public-leaf")).not.toBeEmptyDOMElement();
  });

  // The value is read AFTER a language has been picked, so the fallback every
  // other kind has decides a whole pair here. Not a fault — a person who has
  // not written the English yet is an ordinary state.
  it("shows a stat written in one language only to readers of that language", () => {
    const written = statLeaf({
      description_en: "",
      description_es: "Zorro ártico",
    });
    const spanish = renderBlock(written, { locale: "es" });
    expect(spanish.container.querySelector("dd")?.textContent).toBe(
      "Zorro ártico",
    );
    const english = renderBlock(written, { locale: "en" });
    expect(english.container.querySelector("dd")).toBeNull();
  });

  // The other way to have no pair. A `dd` with no `dt` is the same invalid
  // half-row seen from the other side, so the value renders alone.
  it("renders the value alone when a tab already showed the label", () => {
    const { container: root } = renderBlock(
      container({ mode: "tabs", children: [statLeaf()] }),
    );
    expect(timesShown(root, "English title")).toBe(1);
    expect(root.querySelector("dl")).toBeNull();
    expect(root.querySelector("dd")).toBeNull();
    expect(screen.getByText("English words.")).toBeInTheDocument();
  });

  it("carries a test id of its own", () => {
    renderBlock(statLeaf());
    expect(screen.getByTestId("block-stat")).toBeInTheDocument();
  });
});

describe("a quote leaf", () => {
  /**
   * A `quote` leaf.
   *
   * @param over - anything to change.
   * @returns the leaf.
   */
  const quoteLeaf = (over: Record<string, unknown> = {}): LeafBlock =>
    leaf({ kind: "quote", ...over });

  // The second kind whose two fields do not mean "heading" and "body": the
  // description is what was said and the title is who said it. Read by tag, so
  // a swap turns this red.
  it("quotes the description and attributes it to the title", () => {
    const { container: root } = renderBlock(quoteLeaf());
    expect(root.querySelector("blockquote")?.textContent).toBe(
      "English words.",
    );
    expect(root.querySelector("figcaption")?.textContent).toBe("English title");
  });

  it("reads both halves in the locale being read", () => {
    const { container: root } = renderBlock(quoteLeaf(), { locale: "es" });
    expect(root.querySelector("blockquote")?.textContent).toBe(
      "Palabras en español.",
    );
    expect(root.querySelector("figcaption")?.textContent).toBe(
      "Título en español",
    );
  });

  // A quotation with no words is not a quotation. It falls back rather than
  // hanging a mark over nothing — and the attribution is still shown.
  it("falls back to a plain row when there are no words to quote", () => {
    const { container: root } = renderBlock(
      quoteLeaf({ description_en: "", description_es: "" }),
    );
    expect(root.querySelector("blockquote")).toBeNull();
    expect(screen.getByText("English title")).toBeInTheDocument();
    expect(screen.getByTestId("public-leaf")).not.toBeEmptyDOMElement();
  });

  it("drops the attribution a tab already showed, and keeps the words", () => {
    const { container: root } = renderBlock(
      container({ mode: "tabs", children: [quoteLeaf()] }),
    );
    expect(timesShown(root, "English title")).toBe(1);
    expect(root.querySelector("figcaption")).toBeNull();
    expect(root.querySelector("blockquote")?.textContent).toBe(
      "English words.",
    );
  });

  // An empty `<figcaption>` is a visible hole in a gap-spaced grid, exactly as
  // an empty `<p>` is — and the schema requires `title_en`, which this file
  // never trusts over its own rendering.
  it("leaves the attribution out entirely when nobody is named", () => {
    const { container: root } = renderBlock(
      quoteLeaf({ title_en: "", title_es: "" }),
    );
    expect(root.querySelector("figcaption")).toBeNull();
    expect(root.querySelector("blockquote")?.textContent).toBe(
      "English words.",
    );
  });

  it("carries a test id of its own", () => {
    renderBlock(quoteLeaf());
    expect(screen.getByTestId("block-quote")).toBeInTheDocument();
  });
});

describe("a progress leaf", () => {
  // A digit run past the ~309 digits at which `Number` overflows to
  // `Infinity`, and well inside the 2000-character text cap — so this is
  // reachable input rather than a hypothetical.
  const OVERFLOW = "9".repeat(400);

  /**
   * A `progress` leaf carrying a value.
   *
   * @param value - what its author wrote as the value, which is the
   *   DESCRIPTION — the inversion this kind is most likely to be got wrong on.
   * @param over - anything else to change.
   * @returns the leaf.
   */
  const progressLeaf = (
    value: string,
    over: Record<string, unknown> = {},
  ): LeafBlock =>
    leaf({
      kind: "progress",
      title_en: "Commissions",
      title_es: "Comisiones",
      description_en: value,
      description_es: undefined,
      ...over,
    });

  // The inversion, read off the styling rather than off both strings being
  // present — which would stay green if the two class lists were swapped.
  it("styles the title as the label and the description as the value", () => {
    renderBlock(progressLeaf("60%"));
    expect(screen.getByText("Commissions")).toHaveClass(
      "text-(--muted)",
      "uppercase",
    );
    expect(screen.getByText("60%")).toHaveClass("font-bold");
  });

  it.each([
    ["a bare number", "60", "60"],
    ["a percentage", "60%", "60"],
    ["a fraction", "3/5", "60"],
    ["a value over 100", "150%", "100"],
    // A trait on a scale is ordinarily written as a decimal — "7.5/10", not
    // "75%" — so every form reads a decimal too.
    ["a decimal fraction", "7.5/10", "75"],
    ["a decimal percentage", "7.5%", "8"],
    ["a bare decimal", "2.5", "3"],
    // The one overflow that survives, because it resolves to a genuine finite
    // value: `5 / Infinity` is a real `0`.
    ["a denominator alone overflowing", `5/${OVERFLOW}`, "0"],
  ])("draws a bar for %s", (_form, value, percent) => {
    const { container: root } = renderBlock(progressLeaf(value));
    expect(root.querySelector('[role="progressbar"]')).toHaveAttribute(
      "aria-valuenow",
      percent,
    );
  });

  // **Asserted on what was RENDERED, not on what the parser returned**, which
  // is the distinction the original fault survived on: a suite reading
  // `progressValue`'s value stayed green while the bar drew itself full.
  // Sabotage-verified by deleting the `Number.isFinite` guard, which turns the
  // overflow cases red with a `progressbar` present.
  it.each([
    ["both sides of the fraction overflow", `${OVERFLOW}/${OVERFLOW}`],
    ["the numerator alone overflows", `${OVERFLOW}/5`],
    ["the denominator is zero", "3/0"],
    ["it is prose", "Almost there"],
    // Every pattern requires a digit first, so a leading `-` falls through all
    // three rather than being read and clamped to zero.
    ["it is negative", "-10"],
    ["it carries a unit this does not know", "60 px"],
    ["it is empty", ""],
  ])("draws no bar at all when %s", (_case, value) => {
    const { container: root } = renderBlock(progressLeaf(value));
    expect(root.querySelector('[role="progressbar"]')).toBeNull();
    // Not "no element with that role" but no SECOND ELEMENT at all under the
    // words — the card holds exactly the row of words and nothing beneath it.
    // Observed while sabotaging, and the reason this is the assertion: the
    // unguarded bar renders with NO `style` attribute whatsoever, because
    // CSSOM refuses `width: NaN%` outright. Counting styled elements would
    // therefore have read zero in both states — a test that cannot fail. What
    // distinguishes them is that the bar is there at all.
    expect(screen.getByTestId("block-progress").children).toHaveLength(1);
  });

  // The row is still a row: whatever it could not measure, it still shows.
  it("still shows both words when it draws no bar", () => {
    renderBlock(progressLeaf("Almost there"));
    expect(screen.getByText("Commissions")).toBeInTheDocument();
    expect(screen.getByText("Almost there")).toBeInTheDocument();
  });

  // Why the guard has to live in the parser rather than in the markup: a `NaN`
  // width is not drawn wrong, it is DROPPED. CSSOM refuses the declaration
  // outright and the previous value stands — which is why a bar sized from
  // `NaN` reads as a confident 100% rather than as an obvious fault.
  it("is guarding against a width CSSOM discards rather than one it draws", () => {
    const probe = document.createElement("div");
    probe.style.width = "50%";
    probe.style.width = `${Number.NaN}%`;
    expect(probe.style.width).toBe("50%");
  });

  it("sizes the fill from the value, as a percentage CSSOM accepts", () => {
    const { container: root } = renderBlock(progressLeaf("3/5"));
    const fill = root.querySelector<HTMLElement>('[role="progressbar"] > div');
    expect(fill?.style.width).toBe("60%");
  });

  // An empty `<span>` is a hole in a gap-spaced row. Counting the spans is
  // what catches a value rendered with no text, which asserting the title's
  // presence alone would not.
  it("shows no value at all when the description is empty", () => {
    const { container: root } = renderBlock(progressLeaf(""));
    expect(root.querySelectorAll("span")).toHaveLength(1);
    expect(screen.getByText("Commissions")).toBeInTheDocument();
  });

  it("reads the value in the locale being read", () => {
    const { container: root } = renderBlock(
      progressLeaf("3/5", { description_es: "4/5" }),
      { locale: "es" },
    );
    expect(root.querySelector('[role="progressbar"]')).toHaveAttribute(
      "aria-valuenow",
      "80",
    );
  });

  it("drops the label a tab already showed, and keeps drawing the bar", () => {
    const { container: root } = renderBlock(
      container({ mode: "tabs", children: [progressLeaf("60%")] }),
    );
    expect(timesShown(root, "Commissions")).toBe(1);
    expect(root.querySelector('[role="progressbar"]')).not.toBeNull();
  });

  // A `progressbar` with no accessible name is a control a screen reader can
  // only call "progress bar". The bar renders only when the value parsed, so
  // the fallback is never itself empty.
  it("names the bar after its value when its author wrote no label", () => {
    const { container: root } = renderBlock(
      progressLeaf("60%", { title_en: "", title_es: "" }),
    );
    expect(root.querySelector('[role="progressbar"]')).toHaveAttribute(
      "aria-label",
      "60%",
    );
  });

  it("names the bar after its label when there is one", () => {
    const { container: root } = renderBlock(progressLeaf("60%"));
    expect(root.querySelector('[role="progressbar"]')).toHaveAttribute(
      "aria-label",
      "Commissions",
    );
  });

  it("carries a test id of its own", () => {
    renderBlock(progressLeaf("60%"));
    expect(screen.getByTestId("block-progress")).toBeInTheDocument();
  });
});

describe("a table leaf", () => {
  /**
   * One cell, in one or both languages.
   *
   * @param text_en - its English text.
   * @param text_es - its Spanish text, which its author may not have written.
   * @returns the cell.
   */
  const cell = (text_en: string, text_es?: string) => ({ text_en, text_es });

  /**
   * A `table` leaf carrying rows.
   *
   * @param rows - its rows of cells, or nothing at all.
   * @param over - anything else to change.
   * @returns the leaf.
   */
  const tableLeaf = (
    rows?: { text_en: string; text_es?: string; icon?: string }[][],
    over: Record<string, unknown> = {},
  ): LeafBlock => leaf({ kind: "table", rows, ...over });

  const SPECIES = [cell("Species"), cell("Arctic fox")];
  const HEIGHT = [cell("Height"), cell("170cm")];

  // The pairing debt at many rows: a `<th scope="row">` is what makes a screen
  // reader announce the label WITH each value, which is the property that made
  // `two-column` worth having and the one a grid of cards cannot supply.
  it("heads each row with its first cell and states the rest as values", () => {
    const { container: root } = renderBlock(tableLeaf([SPECIES, HEIGHT]));
    const rows = root.querySelectorAll("tbody tr");
    expect(rows).toHaveLength(2);
    expect(rows[0]?.querySelector("th")).toHaveAttribute("scope", "row");
    expect(rows[0]?.querySelector("th")?.textContent).toBe("Species");
    expect(rows[0]?.querySelector("td")?.textContent).toBe("Arctic fox");
    expect(rows[1]?.querySelector("th")?.textContent).toBe("Height");
  });

  // Derived from the model's own cap rather than typed again, so raising it
  // without touching the renderer is caught here.
  it("keeps every value cell of a row at the model's own width", () => {
    const wide = Array.from({ length: BLOCK_LIMITS.cells }, (_unused, at) =>
      cell(`c${String(at)}`),
    );
    const { container: root } = renderBlock(tableLeaf([wide]));
    expect(root.querySelectorAll("tbody th")).toHaveLength(1);
    expect(root.querySelectorAll("tbody td")).toHaveLength(
      BLOCK_LIMITS.cells - 1,
    );
  });

  it("renders every row of a table at the model's own height", () => {
    const many = Array.from({ length: BLOCK_LIMITS.rows }, (_unused, at) => [
      cell(`label ${String(at)}`),
      cell(`value ${String(at)}`),
    ]);
    const { container: root } = renderBlock(tableLeaf(many));
    expect(root.querySelectorAll("tbody tr")).toHaveLength(BLOCK_LIMITS.rows);
  });

  it("reads a cell in the locale being read", () => {
    const { container: root } = renderBlock(
      tableLeaf([[cell("Species", "Especie"), cell("Arctic fox", "Zorro")]]),
      { locale: "es" },
    );
    expect(root.querySelector("th")?.textContent).toBe("Especie");
    expect(root.querySelector("td")?.textContent).toBe("Zorro");
  });

  // The drop rule, inherited whole: half a row is not an option, so the label
  // goes with the value it has lost.
  it("drops a row whose values are all empty, label and all", () => {
    const { container: root } = renderBlock(
      tableLeaf([SPECIES, [cell("Height"), cell(""), cell("")]]),
    );
    expect(root.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(root.textContent).not.toContain("Height");
  });

  // The same case with nothing to be empty. A label with no cell beside it is
  // the invalid half-row seen once more.
  it("drops a row whose label has no value cell at all", () => {
    const { container: root } = renderBlock(
      tableLeaf([SPECIES, [cell("Height")]]),
    );
    expect(root.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(root.textContent).not.toContain("Height");
  });

  // The value decides, never the label — a blank label beside a real value is
  // a table with a gap in it, which is an ordinary table.
  it("keeps a row whose label is blank but whose value is written", () => {
    const { container: root } = renderBlock(
      tableLeaf([[cell(""), cell("Arctic fox")]]),
    );
    expect(root.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(root.querySelector("th")?.textContent).toBe("");
    expect(root.querySelector("td")?.textContent).toBe("Arctic fox");
  });

  // The filter reads the value AFTER a language has been picked, so the
  // ordinary fallback decides a whole row here.
  it("shows a row written in one language only to readers of that language", () => {
    const written = tableLeaf([
      [cell("Especie", "Especie"), cell("", "Zorro")],
    ]);
    const spanish = renderBlock(written, { locale: "es" });
    expect(spanish.container.querySelectorAll("tbody tr")).toHaveLength(1);
    const english = renderBlock(written, { locale: "en" });
    expect(english.container.querySelector("table")).toBeNull();
  });

  // Where the drop rule INVERTS for a leaf. The flat layout dropped the whole
  // list once no row survived, because the `dl` carried the border; a block
  // sits in a grid track its author placed it in, so it must still say
  // something.
  it("falls back to a plain row, never nothing, when no row survives", () => {
    const { container: root } = renderBlock(
      tableLeaf([[cell("Height"), cell("")]]),
    );
    expect(root.querySelector("table")).toBeNull();
    expect(screen.getByText("English title")).toBeInTheDocument();
    expect(screen.getByText("English words.")).toBeInTheDocument();
    expect(screen.getByTestId("public-leaf")).not.toBeEmptyDOMElement();
  });

  // Which is also what a `table` looks like the moment it is added, and every
  // other kind stores `rows` without ever reading them.
  it.each([
    ["no rows at all", undefined],
    ["an empty row list", []],
  ])("falls back the same way for a leaf carrying %s", (_case, rows) => {
    const { container: root } = renderBlock(tableLeaf(rows));
    expect(root.querySelector("table")).toBeNull();
    expect(screen.getByText("English title")).toBeInTheDocument();
  });

  it("captions the table with its title and its description", () => {
    const { container: root } = renderBlock(tableLeaf([SPECIES]));
    expect(root.querySelector("caption")?.textContent).toBe(
      "English titleEnglish words.",
    );
  });

  it("drops the caption's title a tab already showed, and keeps the rest", () => {
    const { container: root } = renderBlock(
      container({ mode: "tabs", children: [tableLeaf([SPECIES])] }),
    );
    expect(timesShown(root, "English title")).toBe(1);
    expect(root.querySelector("caption")?.textContent).toBe("English words.");
  });

  it("leaves the caption out entirely when there is nothing to say", () => {
    const { container: root } = renderBlock(
      tableLeaf([SPECIES], {
        title_en: "",
        title_es: "",
        description_en: "",
        description_es: "",
      }),
    );
    expect(root.querySelector("caption")).toBeNull();
    expect(root.querySelector("table")).not.toBeNull();
  });

  // Eight columns of real words do not fit a 320px viewport, and a table that
  // overflowed its block would scroll the whole PAGE sideways.
  it("scrolls a wide table inside its own box rather than the page", () => {
    const { container: root } = renderBlock(tableLeaf([SPECIES]));
    expect(root.querySelector("table")?.parentElement?.className).toContain(
      "overflow-x-auto",
    );
  });

  // A cell carries no identity, so its position is its key. Two rows holding
  // identical words are two rows.
  it("renders two identical rows rather than collapsing them", () => {
    const { container: root } = renderBlock(tableLeaf([SPECIES, SPECIES]));
    expect(root.querySelectorAll("tbody tr")).toHaveLength(2);
  });

  it("carries a test id of its own", () => {
    renderBlock(tableLeaf([SPECIES]));
    expect(screen.getByTestId("block-table")).toBeInTheDocument();
  });

  // **Read off the row's FIRST cell, and drawn beside the label.** A contact
  // box from 2004 has a small mark on every line; the header is where it
  // belongs, because an icon on a value cell would sit in the middle of the
  // text it decorates.
  it("draws a mark beside the label when the first cell names one", () => {
    // A name the REAL lucide has, checked past the mock — the mock draws an
    // `<svg>` for anything, so a name lucide lacks would pass here and render
    // nothing on a stranger's page. That is this file's own standing trap.
    expect(REAL_ICON_NAMES).toContain("paw-print");
    const { container: root } = renderBlock(
      tableLeaf([
        [{ ...cell("Species"), icon: "paw-print" }, cell("Arctic fox")],
      ]),
    );
    expect(root.querySelector("tbody th svg")).not.toBeNull();
  });

  // **The discriminating pair.** An icon named on a VALUE cell must draw
  // nothing — a renderer reading "any cell with an icon" would pass the case
  // above and fail this one — and a row with no icon at all must stay bare
  // rather than take a fallback mark, which is where this deliberately parts
  // from `LinkLeaf`.
  it("ignores a mark named on a value cell", () => {
    const { container: root } = renderBlock(
      tableLeaf([
        [cell("Species"), { ...cell("Arctic fox"), icon: "paw-print" }],
      ]),
    );
    expect(root.querySelector("tbody th svg")).toBeNull();
  });

  it("draws no mark at all when no cell names one", () => {
    const { container: root } = renderBlock(tableLeaf([SPECIES]));
    expect(root.querySelector("tbody th svg")).toBeNull();
  });

  // The rest of this file trusts nothing that came out of `jsonb` — it is why
  // `MODES` and `LEAVES` are `Map`s and why an unknown `kind` renders rather
  // than throwing. `rows` arrives from the same column, so a stored object
  // where an array belongs, or a string where a row belongs, must not be a
  // `TypeError` thrown DURING a public page render.
  it.each([
    ["an object", { "0": [{ text_en: "x" }] }],
    ["a string", "Species: arctic fox"],
    ["a number", 7],
    ["null", null],
  ])("does not throw when rows is %s", (_case, rows) => {
    expect(() => renderBlock(leaf({ kind: "table", rows }))).not.toThrow();
    expect(screen.getByText("English title")).toBeInTheDocument();
  });

  it.each([
    ["a string", "Species"],
    ["an object", { text_en: "Species" }],
    ["null", null],
  ])("does not throw when a row is %s", (_case, row) => {
    expect(() =>
      renderBlock(leaf({ kind: "table", rows: [row, SPECIES] })),
    ).not.toThrow();
    // The rows around it still render: one bad row is dropped by the same
    // filter an empty one is, rather than taking the table down with it.
    expect(screen.getByText("Arctic fox")).toBeInTheDocument();
  });
});

describe("the icons a leaf falls back to", () => {
  /**
   * The name the mock rendered, which is the constant the code actually chose.
   *
   * Read back out of the DOM rather than restated in the test, so there is no
   * copy of the constant here to drift from the one in `blocks.tsx` — which is
   * the whole reason those constants are private.
   *
   * @returns the icon name the leaf asked for.
   */
  const iconRendered = (): string =>
    document.querySelector("[data-icon]")?.getAttribute("data-icon") ?? "";

  it.each([
    [
      "a link whose author chose no icon",
      "link",
      { link_url: "https://a.test/" },
    ],
    [
      "a chip on a host with no brand",
      "social",
      { link_url: "https://some-artist-site.example/luna" },
    ],
    [
      "a chip whose brand supplies the icon",
      "social",
      { link_url: "https://instagram.com/luna" },
    ],
    [
      "a chip for a brand that resolves to no embed",
      "social",
      { link_url: "https://bsky.app/profile/luna.test" },
    ],
  ])("falls back to a name lucide really has for %s", (_case, kind, over) => {
    renderBlock(leaf({ kind, icon: undefined, ...over }));
    expect(REAL_ICON_NAMES as readonly string[]).toContain(iconRendered());
  });

  // Anti-vacuity. `iconRendered` answers `""` when nothing rendered at all, and
  // `toContain("")` would then be the only thing failing — but a mock that
  // stopped emitting the attribute would make every case above fail for the
  // wrong reason rather than silently pass. This says out loud that the real
  // list is the real list, so a mocked `importActual` could not stand in for it.
  it("is checking against lucide's own list and not the mock's", () => {
    expect(REAL_ICON_NAMES.length).toBeGreaterThan(100);
    expect(REAL_ICON_NAMES as readonly string[]).not.toContain("paw-print-XX");
  });
});

describe("a leaf with nothing left to show", () => {
  // Reachable only inside `tabs` or `accordion`: the mode lifts the title and
  // the author left the description empty. `title_en` is `min(1)` in the
  // schema, so at `labelled: true` there is always something. What the file
  // rendered before was an empty bordered card in the panel — a visible
  // artefact saying nothing, which `Accordion` and `LeafCaption` both already
  // refuse for the structurally identical case.
  // Every kind that reaches `PlainLeaf` when it has nothing of its own to show.
  // `picture` is in the list because a leaf with no address falls through to it
  // exactly as `stat` and `table` do; `link`, `social`, `player` and `post` are
  // not, because each still renders an icon tile or a frame — something rather
  // than nothing — and so were never the empty-card case.
  it.each(["text", "picture", "stat", "quote", "progress", "table"])(
    "renders no empty bordered card for a %s leaf a tab has emptied",
    (kind) => {
      const { container: root } = renderBlock(
        container({
          mode: "tabs",
          children: [leaf({ kind, description_en: "", description_es: "" })],
        }),
      );
      expect(screen.getByTestId("public-leaf")).toBeEmptyDOMElement();
      // The track is still held: the wrapping element is `Block`'s and carries
      // the span and the style bag, so nothing vanishes out of a grid.
      expect(
        root.querySelector('[data-block-kind="' + kind + '"]'),
      ).not.toBeNull();
    },
  );

  // The other half of the same rule, and the one that must not regress: a leaf
  // that still has words shows them, whatever else it could not render.
  it("still renders the words when a tab left the description behind", () => {
    renderBlock(
      container({
        mode: "tabs",
        children: [leaf({ kind: "text" })],
      }),
    );
    expect(screen.getByText("English words.")).toBeInTheDocument();
  });
});

/**
 * `style.label` on `PlainLeaf` — gap 16 of
 * `docs/superpowers/specs/2026-08-27-pastiche-findings.md`, closed for the
 * `text` kind and its fallback role. The composition rule itself is pinned
 * in `block-contract.test.ts`; this proves the leaf actually reads it.
 */
describe("style.label", () => {
  it("draws no heading when the style says hidden, keeping the description", () => {
    renderBlock(
      leaf({
        kind: "text",
        title_en: "English title",
        description_en: "English words.",
        style: { label: "hidden" },
      }),
    );
    expect(screen.queryByText("English title")).not.toBeInTheDocument();
    expect(screen.getByText("English words.")).toBeInTheDocument();
  });

  // The control: with no style at all, the same title is drawn. Without
  // this, a renderer that dropped every heading regardless of the key would
  // pass the case above just as well.
  it("draws its heading when no style is set", () => {
    renderBlock(
      leaf({
        kind: "text",
        title_en: "English title",
        description_en: "English words.",
      }),
    );
    expect(screen.getByText("English title")).toBeInTheDocument();
  });

  // A mode's own suppression is not undone by an explicit show — the same
  // edge the identity leaves are checked against, proved here on the kind
  // that reaches EVERY unrecognised leaf as its fallback. Scoped to
  // `public-leaf`, the leaf's own wrapper: `tabs` draws the title again of
  // its own accord, on the tab CONTROL rather than the leaf, and a
  // document-wide query would find that instead of testing what this leaf
  // itself decided to draw.
  it("a tab's suppression is not overridden by an explicit show", () => {
    renderBlock(
      container({
        mode: "tabs",
        children: [
          leaf({
            kind: "text",
            title_en: "English title",
            description_en: "English words.",
            style: { label: "show" },
          }),
        ],
      }),
    );
    const leafCard = within(screen.getByTestId("public-leaf"));
    expect(leafCard.queryByText("English title")).not.toBeInTheDocument();
    expect(leafCard.getByText("English words.")).toBeInTheDocument();
  });
});

describe("the recursion", () => {
  /**
   * The deepest tree the model admits: a container at every depth a container
   * may sit at, and a leaf under the last of them.
   *
   * @returns the tree.
   */
  const deepest = () =>
    container({
      name_en: "Depth 0",
      children: [
        container({
          name_en: "Depth 1",
          children: [
            container({
              name_en: "Depth 2",
              children: [leaf({ title_en: "Depth 3" })],
            }),
          ],
        }),
      ],
    });

  it("terminates on the deepest legal tree", () => {
    renderBlock(deepest());
    for (const depth of [0, 1, 2])
      expect(screen.getByText(`Depth ${depth}`)).toBeInTheDocument();
    expect(screen.getByText("Depth 3")).toBeInTheDocument();
  });

  it("renders every leaf of a wide, deep tree", () => {
    const titles = ["a", "b", "c", "d", "e", "f"];
    renderBlock(
      container({
        mode: "grid",
        spaces: 2,
        children: [
          container({
            mode: "stack",
            spaces: 2,
            children: [
              container({
                mode: "masonry",
                spaces: 2,
                children: titles.map((title) => leaf({ title_en: title })),
              }),
            ],
          }),
        ],
      }),
    );
    expect(screen.getAllByTestId("public-leaf")).toHaveLength(titles.length);
    for (const title of titles)
      expect(screen.getByText(title)).toBeInTheDocument();
  });

  it("holds a container of every mode inside a container", () => {
    renderBlock(
      container({
        mode: "stack",
        children: CONTAINER_MODES.map((mode) =>
          container({ mode, children: [leaf()] }),
        ),
      }),
    );
    expect(screen.getAllByTestId("public-leaf")).toHaveLength(
      CONTAINER_MODES.length,
    );
  });

  it("renders an empty container without anything inside it", () => {
    renderBlock(container({ children: [] }));
    expect(screen.getByTestId("block-stack")).toBeEmptyDOMElement();
  });
});

describe("a skin nests", () => {
  /**
   * A skin at every depth a container may sit at, each one a skin whose own
   * table entry omits what the one above it sets.
   *
   * @returns the tree.
   */
  const skinned = () =>
    container({
      style: { skin: "glass" },
      children: [
        container({
          style: { skin: "comic" },
          children: [
            container({
              style: { skin: "paper" },
              children: [leaf({ style: { skin: "outline" } })],
            }),
          ],
        }),
      ],
    });

  it("applies a style bag at every level of the tree", () => {
    const { container: root } = renderBlock(skinned());
    const scopes = root.querySelectorAll("section");
    expect(scopes).toHaveLength(3);
    for (const scope of scopes)
      expect(Object.keys(customProperties(scope)).length).toBeGreaterThan(0);
  });

  // `nestedSkinVars` emits a skin's COMPLETE property set rather than its
  // differences precisely so a skin can nest — but it was written and tested
  // for one level. A `paper` block inside a `comic` block inside a `glass`
  // section is the case that breaks if the reset is incomplete, and it fails
  // silently: comic's halftone simply keeps showing through paper.
  // **Relative, not absolute.** The expected value is `nestedSkinVars` itself,
  // the same function the code under test calls, so this catches a partial
  // reset at any depth — `toMatchObject` fails on a missing key — but a
  // regression INSIDE `nestedSkinVars` or `SKIN_DEFAULTS` moves both sides
  // together and stays green. The absolute proof is the literal case below;
  // `skins.test.ts` pins `SKIN_DEFAULTS` against `globals.css` separately.
  it.each([
    [0, "glass"],
    [1, "comic"],
    [2, "paper"],
  ] as const)(
    "resets every property a skin can set at depth %i",
    (index, skin) => {
      const { container: root } = renderBlock(skinned());
      const scope = root.querySelectorAll("section")[index];
      expect(customProperties(scope!)).toMatchObject(nestedSkinVars(skin));
    },
  );

  // **The absolute one.** Values written out rather than computed, so this
  // could not be passed by a partial reset or by a change inside
  // `nestedSkinVars`.
  it("clears an enclosing skin's texture at the third level", () => {
    const { container: root } = renderBlock(skinned());
    const deepest = root.querySelectorAll("section")[2];
    const declared = customProperties(deepest!);
    // `comic` two levels up sets both of these; `paper` sets neither, so only
    // a complete reset puts them back.
    expect(declared["--skin-gloss"]).toBe("none");
    expect(declared["--skin-gloss-size"]).toBe("auto");
    expect(declared["--skin-round"]).toBe("0.4");
  });

  it("resets a skin on a leaf at the deepest level too", () => {
    renderBlock(skinned());
    expect(customProperties(screen.getByTestId("public-leaf"))).toMatchObject(
      nestedSkinVars("outline"),
    );
  });

  // A block whose author chose nothing must not acquire a `style` attribute,
  // so a page nobody has touched is what it was before this existed.
  //
  // **This one cannot fail on `blockStyle` returning `{}` instead of
  // `undefined`, and that is not a gap in it.** React drops an empty
  // `style={{}}` exactly as it drops an absent prop, so the DOM-level
  // guarantee is React's; the return-value contract is asserted directly in
  // `block-style.test.ts`, which is where that sabotage goes red.
  // What this still catches is a bag that emits something nobody asked for.
  it("emits no style at all for a block that chose nothing", () => {
    const { container: root } = renderBlock(container({ children: [leaf()] }));
    expect(root.querySelector("section")?.hasAttribute("style")).toBe(false);
    expect(screen.getByTestId("public-leaf").hasAttribute("style")).toBe(false);
  });
});

describe("PublicBlocks", () => {
  /**
   * A whole page, rendered as a route would.
   *
   * @param blocks - the outermost blocks.
   * @returns testing-library's result.
   */
  const renderPage = (blocks: BlockNode[]) =>
    render(
      <PublicBlocks
        blocks={blocks}
        locale="en"
        page={pageContext({ parentHost: "me.furrycolombia.com" })}
      />,
    );

  // Nothing, not an empty grid: the empty state belongs to the route, in the
  // visitor's own language, and a bordered nothing above it would be a second
  // answer to one question.
  it("renders nothing at all for a page with no blocks", () => {
    const { container: root } = renderPage([]);
    expect(root.firstChild).toBeNull();
  });

  it("renders one section per outermost block", () => {
    renderPage([container({ name_en: "One" }), container({ name_en: "Two" })]);
    expect(screen.getAllByTestId("public-section")).toHaveLength(2);
  });

  // **The array IS the order.** The flat sections this replaces carried a
  // `sort_order` and had to be sorted on every read; a block has no order of
  // its own, so a renderer that sorted would be inventing a key the model
  // does not have. Two containers whose names sort the other way round is
  // what makes this fail if anything ever reaches for one.
  it("keeps the author's own order rather than sorting by anything", () => {
    renderPage([
      container({ name_en: "Zeta" }),
      container({ name_en: "Alpha" }),
    ]);
    const headings = screen
      .getAllByRole("heading", { level: 2 })
      .map((element) => element.textContent);
    expect(headings).toEqual(["Zeta", "Alpha"]);
  });

  // The page hands its outermost blocks nothing about width, because there is
  // nothing to hand: a block takes exactly one place of whatever contains it,
  // and here that is the page. What it DOES get is a containment context of
  // its own, which is what every responsive rule beneath it queries — a
  // top-level section that declared none would send its whole subtree back to
  // asking the window.
  it("gives each outermost block a containment context of its own", () => {
    const { container: root } = renderPage([
      container({ name_en: "One" }),
      container({ name_en: "Two" }),
    ]);
    const sections = [...root.querySelectorAll("section")];
    expect(sections).toHaveLength(2);
    for (const section of sections) {
      expect(section.className).toContain("@container");
      expect(section.className).not.toContain("col-span");
    }
  });

  // The path is what every id and every radio-group name in the tree is built
  // from, and it starts here. A page whose blocks all shared one path would
  // give two `tabs` sections one radio group — the fault the flat renderer
  // needed a separate `sectionId` to avoid.
  it("gives each outermost block a path of its own position", () => {
    renderPage([
      container({
        mode: "tabs",
        children: [leaf({ title_en: "A" }), leaf({ title_en: "B" })],
      }),
      container({
        mode: "tabs",
        children: [leaf({ title_en: "C" }), leaf({ title_en: "D" })],
      }),
    ]);
    const names = [
      ...new Set(
        [...document.querySelectorAll('input[type="radio"]')].map((input) =>
          input.getAttribute("name"),
        ),
      ),
    ];
    expect(names).toEqual(["block-0-tabs", "block-1-tabs"]);
  });

  it("threads the parent host down to the one leaf that reads it", () => {
    render(
      <PublicBlocks
        blocks={[
          container({
            children: [
              leaf({ kind: "embed", link_url: "https://twitch.tv/aeleos" }),
            ],
          }),
        ]}
        locale="en"
        page={pageContext({ parentHost: "hub.example" })}
      />,
    );
    expect(screen.getByTitle("English title").getAttribute("src")).toContain(
      "parent=hub.example",
    );
  });

  it("emits the track list as a custom property on a weighted grid", () => {
    const { container } = renderPage([
      {
        kind: "container",
        mode: "grid",
        spaces: 3,
        name_en: "S",
        weights: [1, 3, 1],
        children: [null, null, null],
      },
    ]);
    const grid = container.querySelector("[data-testid='block-grid']");
    expect(grid?.getAttribute("style")).toContain(
      "--block-tracks: minmax(min(8rem,100%),1fr) minmax(min(8rem,100%),3fr) minmax(min(8rem,100%),1fr)",
    );
  });

  it("resets the custom property to initial when there are no weights", () => {
    // Not "emits no custom property at all" any more — see blocks.tsx's note
    // on `--block-tracks`. Custom properties inherit, so leaving the property
    // unset here would let a nested unweighted grid resolve an ENCLOSING
    // weighted grid's track list instead of its own uniform fallback. Setting
    // it to `"initial"` resets it at this element, which is what makes the
    // fallback in `SPACE_CLASS`'s `var()` apply again beneath it.
    const { container } = renderPage([
      {
        kind: "container",
        mode: "grid",
        spaces: 3,
        name_en: "S",
        children: [null, null, null],
      },
    ]);
    const grid = container.querySelector("[data-testid='block-grid']");
    expect(grid?.getAttribute("style")).toContain("--block-tracks: initial");
  });

  it("keeps the uniform fallback in the class, so an unweighted grid is unchanged", () => {
    const { container } = renderPage([
      {
        kind: "container",
        mode: "grid",
        spaces: 3,
        name_en: "S",
        children: [null, null, null],
      },
    ]);
    const grid = container.querySelector("[data-testid='block-grid']");
    expect(grid?.className).toContain(
      "@lg:[grid-template-columns:var(--block-tracks,repeat(3,minmax(0,1fr)))]",
    );
  });

  it("does not centre a lone last block in a weighted grid", () => {
    const { container } = renderPage([
      {
        kind: "container",
        mode: "grid",
        spaces: 3,
        name_en: "S",
        weights: [1, 3, 1],
        children: [
          leaf({ title_en: "a" }),
          leaf({ title_en: "b" }),
          leaf({ title_en: "c" }),
          leaf({ title_en: "d" }),
        ],
      },
    ]);
    const grid = container.querySelector("[data-testid='block-grid']");
    expect(grid?.className).not.toContain("col-start-2");
  });

  it("still centres a lone last block in an unweighted grid", () => {
    const { container } = renderPage([
      {
        kind: "container",
        mode: "grid",
        spaces: 3,
        name_en: "S",
        children: [
          leaf({ title_en: "a" }),
          leaf({ title_en: "b" }),
          leaf({ title_en: "c" }),
          leaf({ title_en: "d" }),
        ],
      },
    ]);
    const grid = container.querySelector("[data-testid='block-grid']");
    expect(grid?.className).toContain("col-start-2");
  });
});

// THE FALLBACKS, REACHED THE WAY A DEPLOY REACHES THEM.
//
// `LEAVES.get(kind) ?? PlainLeaf` and `MODES.get(mode) ?? Stack` are written
// and documented as the answer for a payload carrying a name this build does
// not know — and for the length of a branch nothing could reach them, because
// the lenient READ schema refused such a block first and `parseBlocks` answered
// with an empty page. The cases above call the renderer with a hand-made block;
// these go through the parse, which is the only path a real deploy has.
describe("a page stored by a newer deployment", () => {
  /**
   * A stored page, read the way `parseBlocks` reads one.
   *
   * @param stored - what the database holds.
   * @returns the parsed blocks.
   */
  const read = (stored: unknown): BlockNode[] =>
    lenientBlocksSchema.parse(stored);

  it("renders an unrecognised leaf kind as its own words", () => {
    render(
      <PublicBlocks
        blocks={read([
          {
            kind: "container",
            mode: "stack",
            name_en: "Section",
            children: [
              {
                kind: "hologram",
                title_en: "From the future",
                description_en: "Words this build cannot arrange.",
              },
            ],
          },
        ])}
        locale="en"
        page={pageContext({ parentHost: "me.furrycolombia.com" })}
      />,
    );
    expect(screen.getByText("From the future")).toBeInTheDocument();
    expect(
      screen.getByText("Words this build cannot arrange."),
    ).toBeInTheDocument();
    // The kind reaches the marker verbatim, so the DOM says what is stored
    // rather than what it was rendered as.
    expect(screen.getByTestId("public-leaf")).toHaveAttribute(
      "data-block-kind",
      "hologram",
    );
  });

  it("stacks an unrecognised container mode rather than dropping the page", () => {
    render(
      <PublicBlocks
        blocks={read([
          {
            kind: "container",
            mode: "spiral",
            name_en: "Section",
            children: [{ kind: "text", title_en: "Still here" }],
          },
        ])}
        locale="en"
        page={pageContext({ parentHost: "me.furrycolombia.com" })}
      />,
    );
    expect(screen.getByTestId("block-stack")).toBeInTheDocument();
    expect(screen.getByText("Still here")).toBeInTheDocument();
  });
});

// **The measure is asserted as a CLASS STRING, verbatim.** A browser test at a
// chosen viewport cannot tell `wider` from `widest` unless the window happens
// to sit between them, which is rule 29's measured lesson from the
// weighted-places branch: a sabotage that swaps two stops would leave such a
// test green. Comparing the emitted class is what pins which stop is which.
describe("the page measure", () => {
  const gutterOf = (measure: PageMeasure | null) => {
    const { container: root } = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PublicBlocks
          blocks={[container({ name_en: "A section" })]}
          locale="en"
          page={pageContext({ measure })}
        />
      </NextIntlClientProvider>,
    );
    return root.querySelector("[data-page-gutter]")?.getAttribute("class");
  };

  it.each([
    ["narrow", "max-w-[620px]"],
    ["medium", "max-w-3xl"],
    ["wide", "max-w-5xl"],
    ["wider", "max-w-7xl"],
    ["widest", "max-w-[96rem]"],
  ] as const)("lays %s out at %s", (measure, expected) => {
    expect(gutterOf(measure)?.split(/\s+/)).toContain(expected);
  });

  // `full` is the one stop that is an ABSENCE rather than a value, so it is
  // asserted as one: no maximum at all, and no centring to do.
  it("gives full no maximum and nothing to centre in", () => {
    const classes = gutterOf("full")?.split(/\s+/) ?? [];
    expect(classes.some((name) => name.startsWith("max-w-"))).toBe(false);
    expect(classes).not.toContain("mx-auto");
  });

  // **Null is the design's own, and it must emit exactly what a page emitted
  // before the measure existed.** Without this, adding the field could have
  // silently re-laid every page that never chose one.
  //
  // It pins the AGREEMENT and not the value, and cannot do better: both sides
  // read the same entry, so swapping `wider` with `widest` leaves it green —
  // measured, not assumed. The verbatim class cases above are what pin which
  // stop is which, and they redden on exactly that swap.
  it("treats null as the measure every page already had", () => {
    expect(gutterOf(null)).toBe(gutterOf("wider"));
  });

  // The page's own gutter, which is the one box here sized by the window.
  it("keeps the window-sized gutter at every measure", () => {
    for (const measure of PAGE_MEASURES) {
      expect(gutterOf(measure)?.split(/\s+/)).toEqual(
        expect.arrayContaining(["px-4", "sm:px-6"]),
      );
    }
  });
});

describe("page chrome belongs to each top-level section", () => {
  const renderGutters = (overrides: Array<Record<string, unknown>>) => {
    const { container: root } = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PublicBlocks
          blocks={overrides.map((over, position) =>
            container({ name_en: `Section ${position}`, ...over }),
          )}
          locale="en"
          page={pageContext({ measure: "wider" })}
        />
      </NextIntlClientProvider>,
    );
    return {
      parent: root.firstElementChild,
      gutters: [...root.querySelectorAll("[data-page-gutter]")].map((element) =>
        (element.getAttribute("class") ?? "").split(/\s+/),
      ),
    };
  };

  it("puts top, between, and bottom chrome on the sections that own it", () => {
    const { gutters } = renderGutters([{}, {}, {}]);
    const [first, middle, last] = gutters;
    expect(first).toEqual([
      "mx-auto",
      "w-full",
      "max-w-7xl",
      "px-4",
      "sm:px-6",
      "pt-(--page-edge)",
    ]);
    expect(middle).toEqual([
      "mx-auto",
      "w-full",
      "max-w-7xl",
      "px-4",
      "sm:px-6",
      "mt-(--page-gap)",
    ]);
    expect(last).toEqual([
      "mx-auto",
      "w-full",
      "max-w-7xl",
      "px-4",
      "sm:px-6",
      "mt-(--page-gap)",
      "pb-(--page-edge)",
    ]);
  });

  it("gives one ordinary section both page edges", () => {
    const { gutters } = renderGutters([{}]);
    expect(gutters[0]).toEqual([
      "mx-auto",
      "w-full",
      "max-w-7xl",
      "px-4",
      "sm:px-6",
      "pt-(--page-edge)",
      "pb-(--page-edge)",
    ]);
  });

  it("removes all page chrome only from a section with margins false", () => {
    const { gutters } = renderGutters([{ style: { margins: false } }, {}]);
    const [flush, ordinary] = gutters;
    expect(flush).toEqual(["mx-auto", "w-full", "max-w-7xl"]);
    expect(ordinary).toEqual([
      "mx-auto",
      "w-full",
      "max-w-7xl",
      "px-4",
      "sm:px-6",
      "mt-(--page-gap)",
      "pb-(--page-edge)",
    ]);
  });

  it("keeps bleed independent from margins", () => {
    const { gutters } = renderGutters([
      { style: { bleed: true } },
      { style: { bleed: true, margins: false } },
    ]);
    const [bled, banner] = gutters;
    expect(bled).toEqual(["w-full", "pt-(--page-edge)"]);
    expect(banner).toEqual(["w-full"]);
  });

  it("ignores margins on a nested container", () => {
    const { gutters } = renderGutters([
      {
        children: [
          container({
            name_en: "Nested",
            style: { margins: false },
          }),
        ],
      },
    ]);
    expect(gutters[0]).toEqual([
      "mx-auto",
      "w-full",
      "max-w-7xl",
      "px-4",
      "sm:px-6",
      "pt-(--page-edge)",
      "pb-(--page-edge)",
    ]);
  });

  it("leaves no parent gap that a section cannot opt out of", () => {
    const { parent } = renderGutters([{}, {}]);
    expect(parent?.className.split(/\s+/)).not.toContain("gap-10");
  });
});

// **Bleed is asserted against a page whose measure is NOT already full.** On a
// full-width page a bled section and an ordinary one are laid out identically,
// so the fixture could not tell them apart and the case would pass whatever
// the renderer did. `wider` is the default and the discriminating choice.
describe("a section that reaches both edges", () => {
  const gutters = (bleed: boolean | undefined) => {
    const { container: root } = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PublicBlocks
          blocks={[
            { ...container({ name_en: "Ordinary" }) },
            {
              ...container({ name_en: "Bled" }),
              ...(bleed === undefined ? {} : { style: { bleed } }),
            },
          ]}
          locale="en"
          page={pageContext({ measure: "wider" })}
        />
      </NextIntlClientProvider>,
    );
    return [...root.querySelectorAll("[data-page-gutter]")].map((element) =>
      (element.getAttribute("class") ?? "").split(/\s+/),
    );
  };

  it("drops the measure, the centring and the padding", () => {
    const [ordinary, bled] = gutters(true);
    expect(ordinary).toContain("max-w-7xl");
    expect(bled?.some((name) => name.startsWith("max-w-"))).toBe(false);
    expect(bled).not.toContain("mx-auto");
    expect(bled).not.toContain("px-4");
  });

  // `false` and absent mean the same thing on the page, which is what makes
  // storing `false` pointless — see the popup, which stores absence instead.
  it("leaves a section alone when bleed is false or absent", () => {
    expect(gutters(false)[1]).toContain("max-w-7xl");
    expect(gutters(undefined)[1]).toContain("max-w-7xl");
  });

  // **Depth 0 only.** A nested container carrying the key must change nothing:
  // it has a section between it and the page and cannot escape it.
  it("ignores the key on a nested container", () => {
    const { container: root } = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PublicBlocks
          blocks={[
            {
              ...container({ name_en: "Outer" }),
              children: [
                { ...container({ name_en: "Inner" }), style: { bleed: true } },
              ],
            },
          ]}
          locale="en"
          page={pageContext({ measure: "wider" })}
        />
      </NextIntlClientProvider>,
    );
    const gutter = root.querySelector("[data-page-gutter]");
    expect(gutter?.getAttribute("class")?.split(/\s+/)).toContain("max-w-7xl");
  });
});

describe("a section's name as a bar", () => {
  const named = (style?: ContainerBlock["style"]): ContainerBlock => ({
    kind: "container",
    mode: "stack",
    spaces: 1,
    name_en: "Contacting Aeleos",
    children: [{ kind: "text", title_en: "Send Message", description_en: "" }],
    ...(style ? { style } : {}),
  });

  // The default, asserted first so the case below is a CHANGE from something
  // rather than a claim about nothing.
  it("floats above the content when the key is absent", () => {
    const { container } = renderBlock(named());
    expect(container.querySelector('[data-testid="heading-bar"]')).toBeNull();
    expect(container.querySelector("section")?.className).toContain("gap-3");
  });

  // **The gap is asserted as well as the fill, because a bar that kept the
  // section's `gap-3` is a floating label with a background** — which is not
  // what MySpace or hi5 did, and is the shape this key exists to avoid. A test
  // reading only the heading would pass on exactly that.
  it("welds the name to the content it names", () => {
    const { container } = renderBlock(named({ heading: "bar" }));
    const bar = container.querySelector('[data-testid="heading-bar"]');
    expect(bar).not.toBeNull();
    expect(bar?.className).toContain("bg-(--accent)");
    expect(container.querySelector("section")?.className).toContain("gap-0");
    expect(container.querySelector("section")?.className).not.toContain(
      "gap-3",
    );
  });

  // **The gradient must be a CHANGE from the flat bar, not merely "a bar".**
  // Asserting only that the strip exists would pass on code that ignored the
  // new value entirely and fell through to `bg-(--accent)` — which is what a
  // renderer reading `=== "bar"` alone does. So the flat fill is asserted
  // absent as well.
  it("shades the bar when the gradient is asked for", () => {
    const { container } = renderBlock(named({ heading: "gradient" }));
    const bar = container.querySelector('[data-testid="heading-bar"]');
    expect(bar?.className).toContain("linear-gradient");
    expect(bar?.className).not.toContain("bg-(--accent)");
    expect(container.querySelector("section")?.className).toContain("gap-0");
  });

  // **The quieter tone, and the assertions compare whole CLASS TOKENS rather
  // than substrings.** `bg-(--accent)` is a prefix of `bg-(--accent-soft)`, so
  // a `toContain` on the string cannot tell the two apart in either direction
  // — it would pass on a renderer that ignored `soft` entirely and on one that
  // painted every bar soft. Splitting on whitespace makes each assertion an
  // exact match, which is what discriminates.
  it("paints the quieter tone when soft is asked for", () => {
    const { container } = renderBlock(named({ heading: "soft" }));
    const classes = container
      .querySelector('[data-testid="heading-bar"]')
      ?.className.split(/\s+/);
    expect(classes).toContain("bg-(--accent-soft)");
    expect(classes).toContain("text-(--on-accent-soft)");
    expect(classes).not.toContain("bg-(--accent)");
    expect(container.querySelector("section")?.className).toContain("gap-0");
  });

  // The mirror: a flat bar must not quietly become the soft one, which a
  // renderer reading the key loosely would do.
  it("leaves the plain bar at full strength", () => {
    const { container } = renderBlock(named({ heading: "bar" }));
    const classes = container
      .querySelector('[data-testid="heading-bar"]')
      ?.className.split(/\s+/);
    expect(classes).toContain("bg-(--accent)");
    expect(classes).not.toContain("bg-(--accent-soft)");
  });

  // The mirror of it: the flat bar must not GAIN a gradient, which a renderer
  // that shaded every bar would.
  it("leaves the plain bar flat", () => {
    const { container } = renderBlock(named({ heading: "bar" }));
    expect(
      container.querySelector('[data-testid="heading-bar"]')?.className,
    ).not.toContain("linear-gradient");
  });

  // **A picture ON the bar.** The fill must SURVIVE underneath it rather than
  // being replaced: a picture that fails to load, or one with transparency,
  // has to leave the author's own colour behind the strip rather than letting
  // the page show through something meant to be solid. So the case asserts
  // both — the class list still carries the fill, and the element carries the
  // image.
  it("paints a picture on the bar without dropping the fill", () => {
    const { container } = renderBlock(
      named({ heading: "bar", heading_image: "https://example.com/bliss.png" }),
    );
    const bar = container.querySelector<HTMLElement>(
      '[data-testid="heading-bar"]',
    );
    expect(bar?.style.backgroundImage).toContain("bliss.png");
    expect(bar?.style.backgroundSize).toBe("cover");
    expect(bar?.className.split(/\s+/)).toContain("bg-(--accent)");
  });

  // The mirror, and the one that discriminates: a bar with no picture must
  // carry no image at all rather than an empty one.
  it("paints no picture when none is given", () => {
    const { container } = renderBlock(named({ heading: "bar" }));
    const bar = container.querySelector<HTMLElement>(
      '[data-testid="heading-bar"]',
    );
    expect(bar?.style.backgroundImage).toBe("");
  });

  // **A PLAIN name draws no picture**, because there is no strip to paint it
  // on — the same restriction `heading_pad` has, and for the same reason.
  it("ignores a bar picture when the name is not a bar", () => {
    const { container } = renderBlock(
      named({ heading: "plain", heading_image: "https://example.com/x.png" }),
    );
    const heading = container.querySelector("h2");
    expect(heading?.style.backgroundImage).toBe("");
  });

  // **A quote cannot escape the `url("…")` wrapper**, which is the guarantee
  // that matters — and it is NOT reached the way this case first assumed.
  // `backgroundImageValue` refuses a raw `"` or `\`, but `safeHttpUrl` parses
  // through `new URL()` first and percent-encodes a quote in the path, so the
  // refusal never sees one and the value arrives as `%22`. Equally safe by a
  // different route. Asserting the REFUSAL would have pinned a path this
  // input does not take; asserting the property pins what protects the sink.
  it.each([
    ['https://example.com/a".png', "quote"],
    ["https://example.com/a\\.png", "backslash"],
    ["javascript:alert(1)", "a scheme that is not http"],
  ])("lets no %s reach the style, given %s", (heading_image) => {
    const { container } = renderBlock(named({ heading: "bar", heading_image }));
    const emitted =
      container.querySelector<HTMLElement>('[data-testid="heading-bar"]')?.style
        .backgroundImage ?? "";
    const inner = emitted.replace(/^url\("/, "").replace(/"\)$/, "");
    expect(inner).not.toMatch(/["\\]/);
  });

  // **The gap under a name, which had no control at all.** Absence is not one
  // value — a bar welds and a plain name floats — so each case names which
  // default it is departing from, and the two defaults are asserted first.
  //
  // **Each value is tested against the default it DEPARTS from**, which is why
  // `none` is on a plain name rather than a bar. Asked of a barred section it
  // would assert `gap-0` — exactly what a bar already gets — so the case would
  // pass on a renderer that ignored the key entirely. Verified: with the
  // lookup removed, this table reddens on all three rather than on two.
  it.each([
    ["none", "plain", "gap-0"],
    ["snug", "bar", "gap-2"],
    ["roomy", "bar", "gap-6"],
  ] as const)("gives a %s heading gap", (heading_gap, heading, expected) => {
    const { container } = renderBlock(named({ heading, heading_gap }));
    const section = container.querySelector("section");
    expect(section?.className.split(/\s+/)).toContain(expected);
  });

  // The half that proves absence still means what it meant: a barred section
  // welds, a plain one does not, and neither reads the table.
  it("leaves the welded bar and the floating name alone when unset", () => {
    const { container: barred } = renderBlock(named({ heading: "bar" }));
    expect(barred.querySelector("section")?.className.split(/\s+/)).toContain(
      "gap-0",
    );
    const { container: plain } = renderBlock(named());
    expect(plain.querySelector("section")?.className.split(/\s+/)).toContain(
      "gap-3",
    );
  });

  // **A gap reaches a PLAIN name too**, which the padding key deliberately
  // does not: there is real space above the content whether or not a strip is
  // drawn, so pulling a floating name tight against what it names is a thing
  // somebody can want.
  it("gives a plain name its own gap", () => {
    const { container } = renderBlock(named({ heading_gap: "roomy" }));
    expect(
      container.querySelector("section")?.className.split(/\s+/),
    ).toContain("gap-6");
  });

  // **These assert TOKENS, not `border-radius`.** The style bag lands on a
  // wrapper and the card that draws the corner is nested inside it, so the
  // renderer writes `--corner-*` and the cards read them — see
  // `squareOffCorners`. A longhand here would have been the version that
  // measured 0 in a browser while every unit case stayed green.
  //
  // **The window shape: a bar rounded across its top over content rounded
  // across its foot.** Asserting only that something is `0` would pass on a
  // renderer that squared all four, so each case names the corners that must
  // stay UNSET as well — an unset longhand is what lets the class and the
  // skin keep deciding, which is the whole mechanism.
  it("squares off only the corners a bar does not name", () => {
    const { container } = renderBlock(
      named({ heading: "bar", heading_corners: "tl,tr" }),
    );
    const bar = container.querySelector<HTMLElement>(
      '[data-testid="heading-bar"]',
    );
    expect(bar?.style.getPropertyValue("--corner-bl")).toBe("0");
    expect(bar?.style.getPropertyValue("--corner-br")).toBe("0");
    // Named corners are written too, not merely left alone: these inherit, and
    // a bar sits inside the section whose own corners it would otherwise pick
    // up. Measured in a browser, that gave a bar with square top corners.
    //
    // The value is the expression `@theme inline` puts in `rounded-xl`, NOT
    // `var(--radius-xl)`: that token is computed at `:root`, so referencing it
    // freezes root's skin and a nested skin loses its own corner.
    expect(bar?.style.getPropertyValue("--corner-tl")).toBe(
      "calc(var(--skin-round)*0.75rem)",
    );
    expect(bar?.style.getPropertyValue("--corner-tr")).toBe(
      "calc(var(--skin-round)*0.75rem)",
    );
  });

  it("squares off only the corners a block's box does not name", () => {
    const { container } = renderBlock(named({ corners: "bl,br" }));
    const section = container.querySelector<HTMLElement>("section");
    expect(section?.style.getPropertyValue("--corner-tl")).toBe("0");
    expect(section?.style.getPropertyValue("--corner-tr")).toBe("0");
    expect(section?.style.getPropertyValue("--corner-bl")).toBe(
      "calc(var(--skin-round)*0.75rem)",
    );
    expect(section?.style.getPropertyValue("--corner-br")).toBe(
      "calc(var(--skin-round)*0.75rem)",
    );
  });

  // **Absent emits NOTHING**, which is what keeps every stored page identical.
  // This is the case a renderer that defaulted to "all four" would still pass
  // on if it emitted `0`s nowhere — so it is paired with the two above, which
  // fail if nothing is ever emitted.
  it("leaves every corner alone when none are named", () => {
    const { container } = renderBlock(named({ heading: "bar" }));
    const section = container.querySelector<HTMLElement>("section");
    const bar = container.querySelector<HTMLElement>(
      '[data-testid="heading-bar"]',
    );
    for (const token of [
      "--corner-tl",
      "--corner-tr",
      "--corner-bl",
      "--corner-br",
    ]) {
      expect(section?.style.getPropertyValue(token)).toBe("");
      expect(bar?.style.getPropertyValue(token)).toBe("");
    }
  });

  // A bar's corners are read only where a bar is drawn — there is no strip to
  // square off otherwise, and the plain heading must not acquire one.
  it("ignores the bar's corners when the name is not a bar", () => {
    const { container } = renderBlock(
      named({ heading: "plain", heading_corners: "tl" }),
    );
    const heading = container.querySelector<HTMLElement>("h2");
    expect(heading?.style.getPropertyValue("--corner-bl")).toBe("");
  });

  // **The room a bar gives its name, which is the complaint this answers.** A
  // solid strip at `px-3 py-2` with `compact` type in it reads as crowded.
  it.each([
    ["roomy", "px-5 py-4"],
    ["snug", "px-2 py-0.5"],
  ] as const)("gives a %s bar its own padding", (heading_pad, expected) => {
    const { container } = renderBlock(named({ heading: "bar", heading_pad }));
    const bar = container.querySelector('[data-testid="heading-bar"]');
    expect(bar?.className).toContain(expected);
    // The default must be GONE, not merely joined — two padding utilities on
    // one element is a class list whose winner depends on Tailwind's order.
    expect(bar?.className).not.toContain("px-3 py-2");
  });

  it("leaves a bar that asks for nothing exactly as it was", () => {
    const { container } = renderBlock(named({ heading: "bar" }));
    expect(
      container.querySelector('[data-testid="heading-bar"]')?.className,
    ).toContain("px-3 py-2");
  });

  // **A plain name reads none of it**, which is the half a fixture could
  // easily miss: padding on a heading with nothing behind it moves text for no
  // reason, and the key is documented as bar-only.
  it("gives a plain name no padding of its own", () => {
    const { container } = renderBlock(named({ heading_pad: "roomy" }));
    const section = container.querySelector("section");
    expect(section?.textContent).toContain("Contacting Aeleos");
    expect(section?.innerHTML).not.toContain("px-5 py-4");
  });

  // A container with no name has nothing to put in a bar, and asking for one
  // must not collapse the gap under content that has no heading above it.
  it("is inert on a container with no name", () => {
    const { container } = renderBlock({
      kind: "container",
      mode: "stack",
      spaces: 1,
      children: [{ kind: "text", title_en: "Loose", description_en: "" }],
      style: { heading: "bar" },
    });
    expect(container.querySelector('[data-testid="heading-bar"]')).toBeNull();
    expect(container.querySelector("section")?.className).toContain("gap-3");
  });
});

describe("the divided list", () => {
  const listOf = (mode: "list" | "stack"): ContainerBlock => ({
    kind: "container",
    mode,
    spaces: 1,
    children: [
      { kind: "text", title_en: "One", description_en: "" },
      { kind: "text", title_en: "Two", description_en: "" },
    ],
  });

  // **Asserted against `stack`, not in isolation.** Both render their children
  // in a column, so a test that only checked "the children are there" passes
  // for either and proves nothing about which one ran. What separates them is
  // the rule and the absence of a gap — a gap between cards says "separate
  // things", a rule says "one sequence" — so those are what the fixtures
  // compare.
  it("draws a rule between its children where a stack draws a gap", () => {
    const { container } = renderBlock(listOf("list"));
    const list = container.querySelector('[data-testid="block-list"]');
    expect(list?.className).toContain("divide-y");
    expect(list?.className).not.toContain("gap-4");
  });

  it("is not what a stack already did", () => {
    const { container } = renderBlock(listOf("stack"));
    const stack = container.querySelector('[data-testid="block-stack"]');
    expect(container.querySelector('[data-testid="block-list"]')).toBeNull();
    expect(stack?.className).toContain("gap-4");
    expect(stack?.className).not.toContain("divide-y");
  });

  it("still renders every child", () => {
    renderBlock(listOf("list"));
    expect(screen.getByText("One")).toBeInTheDocument();
    expect(screen.getByText("Two")).toBeInTheDocument();
  });
});
