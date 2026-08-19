import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
  }> = {},
) {
  const {
    locale = "en",
    depth = 0,
    path = "0",
    parentHost = "me.furrycolombia.com",
  } = over;
  return render(
    <Block
      block={block}
      locale={locale}
      depth={depth}
      path={path}
      parentHost={parentHost}
    />,
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
      "@lg:grid-cols-3",
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
        <Block block={tabbed()} locale="en" depth={0} path="0" parentHost="" />
        <Block block={tabbed()} locale="en" depth={0} path="1" parentHost="" />
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
        <Block block={tabbed()} locale="en" depth={0} path="0" parentHost="" />
        <Block block={tabbed()} locale="en" depth={0} path="1" parentHost="" />
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
    [2, "@xs:grid-cols-2"],
    [3, "@lg:grid-cols-3"],
    [4, "@2xl:grid-cols-4"],
    [5, "@4xl:grid-cols-5"],
    [6, "@5xl:grid-cols-6"],
  ])("lays %i places across in a grid", (spaces, expected) => {
    renderBlock(container({ mode: "grid", spaces }));
    expect(screen.getByTestId("block-grid").className).toContain(expected);
  });

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
      <PublicBlocks
        blocks={page}
        locale="en"
        parentHost="me.furrycolombia.com"
      />,
    );
    // Read through `getAttribute` rather than `className`: an SVG element's
    // `className` is an `SVGAnimatedString`, which has no `split` — and a
    // lucide glyph is on this page, so the obvious form throws rather than
    // measuring anything.
    const classesOf = (root_: Element) =>
      [...root_.querySelectorAll("[class]")].flatMap((element) =>
        (element.getAttribute("class") ?? "").split(/\s+/),
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
  it.each(LEAF_KINDS)("renders something for a %s leaf", (kind) => {
    const { container: root } = renderBlock(leaf({ kind }));
    expect(screen.getByTestId("public-leaf")).not.toBeEmptyDOMElement();
    expect(root.textContent).not.toBe("");
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

describe("a player leaf", () => {
  /**
   * A `player` leaf pointing at something.
   *
   * @param url - the address its author pasted.
   * @param over - anything else to change.
   * @returns the leaf.
   */
  const playerLeaf = (
    url: string | undefined,
    over: Record<string, unknown> = {},
  ) => leaf({ kind: "player", link_url: url, ...over });

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
  it.each([
    ["https://youtu.be/dQw4w9WgXcQ", "aspect-video"],
    ["https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT", "h-42"],
    ["https://www.tiktok.com/@user/video/1234567890123456789", "aspect-9/16"],
    ["https://t.me/channelname/123", "h-150"],
  ])("shapes the frame for %s", (url, expected) => {
    renderBlock(playerLeaf(url));
    expect(screen.getByTitle("English title").className).toContain(expected);
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
    expect(screen.getByTestId("block-player").textContent).toBe(
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
    leaf({ kind: "post", link_url: url });

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

  // The only provider that reads `parentHost` is Twitch, whose player is a
  // video rather than a post — so a post resolves without one and a Twitch
  // address takes the branded chip.
  it("chips a Twitch address rather than framing a video in a post's column", () => {
    renderBlock(postLeaf("https://twitch.tv/luna"), {
      parentHost: "me.furrycolombia.com",
    });
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
    rows?: { text_en: string; text_es?: string }[][],
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
        parentHost="me.furrycolombia.com"
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
              leaf({ kind: "player", link_url: "https://twitch.tv/aeleos" }),
            ],
          }),
        ]}
        locale="en"
        parentHost="hub.example"
      />,
    );
    expect(screen.getByTitle("English title").getAttribute("src")).toContain(
      "parent=hub.example",
    );
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
        parentHost="me.furrycolombia.com"
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
        parentHost="me.furrycolombia.com"
      />,
    );
    expect(screen.getByTestId("block-stack")).toBeInTheDocument();
    expect(screen.getByText("Still here")).toBeInTheDocument();
  });
});
