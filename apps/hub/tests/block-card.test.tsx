import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import {
  BLOCK_LIMITS,
  isContainer,
  LEAF_KINDS,
  MAX_DEPTH,
  type Block,
  type ContainerBlock,
} from "@/features/actors/domain/block-schema";
import { newContainer, newLeaf } from "@/features/actors/domain/block-edits";
import type { BlockProblem } from "@/features/actors/domain/block-problems";
import { blockEditorLabels } from "./support/editor-labels";

// PRESENTATION IS COVERAGE-EXCLUDED, so a named test is the only thing that
// catches a gap. What this file is for is the four things somebody has to be
// able to do — choose a shape, put something in a place, nest, and take what
// is in a place away without taking the place away — plus the two claims the
// card makes that nothing else can check: that narrowing destroys nothing, and
// that the preview is the real renderer rather than a drawing of it.

vi.mock("lucide-react/dynamic", () => ({
  DynamicIcon: ({ name }: { name: string }) => <svg data-icon={name} />,
  iconNames: ["paw-print"],
}));

const { BlockCard } = await import("@/features/actors/presentation/block-card");

const labels = blockEditorLabels();

/**
 * One section card over a page a test can read back, driven the way the editor
 * drives it: a whole tree in one value, edited by pure functions, handed back
 * whole and re-rendered.
 *
 * @param page - what the page starts as.
 * @returns a way to read the page after each edit.
 */
function harness(
  page: Block[],
  problems: BlockProblem[] = [],
  atBlockLimit = false,
) {
  const held = { page };
  /**
   * Applies an edit and re-renders.
   *
   * @param edit - what to make of the page.
   */
  const apply = (edit: (blocks: Block[]) => Block[]): void => {
    held.page = edit(held.page);
    view.rerender(card());
  };
  /**
   * The card over whatever the page currently holds.
   *
   * @returns the element.
   */
  const card = () => {
    // A removed section leaves the page empty, which is a state the editor
    // renders as no card at all — the harness has to say so rather than hand
    // this component an undefined block.
    const [block] = held.page;
    if (!block) return null;
    return (
      <BlockCard
        block={block as ContainerBlock}
        path={[0]}
        apply={apply}
        lang="en"
        labels={labels}
        parentHost=""
        atBlockLimit={atBlockLimit}
        problems={problems}
      />
    );
  };
  const view = render(card());
  return () => held.page;
}

/** The first section of a page, narrowed to a container. */
const section = (page: Block[]): ContainerBlock => {
  const [block] = page;
  if (!block || !isContainer(block)) throw new Error("not a container");
  return block;
};

/** A leaf carrying a title, so an assertion can name it. */
const titled = (title: string) => ({ ...newLeaf("text"), title_en: title });

describe("BlockCard", () => {
  describe("the shape", () => {
    it("offers every width the schema accepts", () => {
      harness([newContainer("grid", 2)]);
      const options = within(screen.getByTestId("section-spaces"))
        .getAllByRole("option")
        .map((el) => (el as HTMLOptionElement).value);
      expect(options).toEqual(["1", "2", "3", "4", "5", "6"]);
    });

    it("changes the shape afterwards", () => {
      const page = harness([newContainer("grid", 2)]);
      fireEvent.change(screen.getByTestId("section-spaces"), {
        target: { value: "5" },
      });
      expect(section(page()).spaces).toBe(5);
    });

    // THE ASSERTION THE WHOLE RULE RESTS ON, driven through the control rather
    // than through the edit: `spaces` is a WIDTH and `children` is the
    // content, so narrowing re-wraps into more rows and strands nobody. The
    // way to break it is to rewrite `children` to the new width when the
    // select changes — which would destroy everything past it and could not be
    // undone by widening again.
    it("keeps every occupant when the shape narrows", () => {
      const page = harness([
        {
          ...newContainer("grid", 6),
          children: ["a", "b", "c", "d", "e", "f"].map((t) => titled(t)),
        },
      ]);
      fireEvent.change(screen.getByTestId("section-spaces"), {
        target: { value: "2" },
      });

      expect(section(page()).spaces).toBe(2);
      expect(screen.getAllByTestId("leaf-editor")).toHaveLength(6);
      expect(
        section(page()).children.map(
          (child) => child && !isContainer(child) && child.title_en,
        ),
      ).toEqual(["a", "b", "c", "d", "e", "f"]);
    });

    // Narrowing to one and back to six finds everything exactly as it was,
    // which a clamp cannot give: a rewritten `children` is gone whatever the
    // width becomes next.
    it("survives narrowing and widening again", () => {
      const page = harness([
        {
          ...newContainer("grid", 6),
          children: ["a", "b", "c"].map((t) => titled(t)),
        },
      ]);
      const before = structuredClone(section(page()).children);
      fireEvent.change(screen.getByTestId("section-spaces"), {
        target: { value: "1" },
      });
      fireEvent.change(screen.getByTestId("section-spaces"), {
        target: { value: "6" },
      });
      expect(section(page()).children).toEqual(before);
    });

    // The reassurance is part of the control: somebody about to narrow a
    // section has to know before they do it that nothing in it is removed.
    it("says what changing the shape does, beside the control", () => {
      harness([newContainer("grid", 2)]);
      expect(screen.getByTestId("spaces-hint")).toHaveTextContent(
        labels.sectionSpacesHint,
      );
    });
  });

  describe("an empty place", () => {
    // It keeps its width, carries this app's own "nothing here yet" edge, and
    // offers the two things that can go in it. Collapsing empty places would
    // make a space count meaningless the moment a section were partly filled.
    it("is drawn for each place, and offers what can fill it", () => {
      harness([newContainer("grid", 3)]);
      expect(screen.getAllByTestId("empty-place")).toHaveLength(3);
      expect(screen.getAllByTestId("add-content")).toHaveLength(3);
      expect(screen.getAllByTestId("add-nested")).toHaveLength(3);
    });

    it("is drawn between two filled ones, in its own position", () => {
      harness([
        {
          ...newContainer("grid", 3),
          children: [titled("a"), null, titled("b")],
        },
      ]);
      const places = screen.getByTestId("places");
      expect(within(places).getAllByTestId("empty-place")).toHaveLength(1);
      expect(within(places).getAllByTestId("leaf-editor")).toHaveLength(2);
    });

    it("takes a piece of content, keeping every position", () => {
      const page = harness([
        {
          ...newContainer("grid", 3),
          children: [titled("a"), null, titled("b")],
        },
      ]);
      fireEvent.click(screen.getByTestId("add-content"));
      expect(
        section(page()).children.map(
          (child) => child && !isContainer(child) && child.title_en,
        ),
      ).toEqual(["a", "", "b"]);
    });

    it("takes a section, which arrives with places of its own", () => {
      const page = harness([newContainer("grid", 1)]);
      fireEvent.click(screen.getByTestId("add-nested"));
      const [child] = section(page()).children;
      expect(child && isContainer(child)).toBe(true);
      expect(screen.getByTestId("nested-card")).toBeInTheDocument();
    });

    it("can be taken away entirely, which is not the same as emptying one", () => {
      const page = harness([newContainer("grid", 3)]);
      fireEvent.click(screen.getAllByTestId("remove-place")[0]!);
      expect(section(page()).children).toHaveLength(2);
      // The width is the author's and is not touched by removing a place.
      expect(section(page()).spaces).toBe(3);
    });

    it("is added one at a time, which is how a section grows downward", () => {
      const page = harness([newContainer("grid", 2)]);
      fireEvent.click(screen.getByTestId("add-place"));
      expect(section(page()).children).toHaveLength(3);
    });

    // AN EMPTY PLACE IS NOT A BLOCK. `countBlocks` excludes them and
    // `validate_block` counts them toward nothing, so adding one at the block
    // cap is legal on both sides — where the two invitations INSIDE a place
    // each add a block and are withdrawn. A control withdrawn at a number that
    // is not its own is the same fault as one that silently does nothing,
    // wearing an alibi.
    it("can still be added at the block cap, where filling one cannot", () => {
      harness([newContainer("grid", 2)], [], true);
      expect(screen.getByTestId("add-place")).toBeInTheDocument();
      expect(screen.queryByTestId("add-content")).toBeNull();
      expect(screen.queryByTestId("add-nested")).toBeNull();
    });

    it("is withdrawn at the container's own cap on how much it may hold", () => {
      harness([
        {
          ...newContainer("grid", 2),
          children: Array.from({ length: BLOCK_LIMITS.children }, () => null),
        },
      ]);
      expect(screen.queryByTestId("add-place")).toBeNull();
    });
  });

  describe("removing", () => {
    // REMOVE WHAT IS IN A PLACE, LEAVING THE PLACE. The shape an author chose
    // is theirs, and a section that closed up round a deletion would change
    // under them as they worked.
    it("empties a place and leaves it where it was", () => {
      const page = harness([
        {
          ...newContainer("grid", 3),
          children: [titled("a"), titled("b"), titled("c")],
        },
      ]);
      fireEvent.click(screen.getAllByTestId("remove-block")[0]!);
      expect(
        section(page()).children.map(
          (child) => child && !isContainer(child) && child.title_en,
        ),
      ).toEqual([null, "b", "c"]);
      expect(section(page()).children).toHaveLength(3);
    });

    it("empties the place a nested section sat in, rather than closing it", () => {
      const page = harness([
        {
          ...newContainer("grid", 2),
          children: [newContainer("stack", 1), titled("b")],
        },
      ]);
      // The nested card's own remove, which is the one inside it rather than
      // the section's.
      fireEvent.click(
        within(screen.getByTestId("nested-card")).getByTestId("remove-block"),
      );
      expect(section(page()).children[0]).toBeNull();
      expect(section(page()).children).toHaveLength(2);
    });
  });

  describe("nesting", () => {
    /** A page nested as deep as the schema allows a container to go. */
    const deep = (): Block[] => [
      {
        ...newContainer("stack", 1),
        children: [
          {
            ...newContainer("stack", 1),
            children: [{ ...newContainer("stack", 1), children: [null] }],
          },
        ],
      },
    ];

    it("draws a card at every depth a container may sit at", () => {
      harness(deep());
      expect(screen.getByTestId("section-card")).toBeInTheDocument();
      expect(screen.getAllByTestId("nested-card")).toHaveLength(MAX_DEPTH - 1);
    });

    // OFFERING A SECTION AND THEN REFUSING THE SAVE is the fault class this
    // repo already paid for once, when a missing `nuqs` adapter was reported
    // as "we could not load your identity". So the deepest place offers
    // content and no section, and says why.
    it("offers content but no section in a place at the cap, and says why", () => {
      harness(deep());
      const deepest = screen.getByTestId("empty-place");
      expect(within(deepest).getByTestId("add-content")).toBeInTheDocument();
      expect(within(deepest).queryByTestId("add-nested")).toBeNull();
      expect(within(deepest).getByTestId("nesting-at-limit")).toHaveTextContent(
        labels.nestingAtLimit,
      );
    });

    it("gives a nested container its own ids, so a section can still be counted", () => {
      harness([
        { ...newContainer("grid", 1), children: [newContainer("stack", 1)] },
      ]);
      expect(screen.getAllByTestId("section-card")).toHaveLength(1);
      expect(screen.getAllByTestId("section-name")).toHaveLength(1);
      expect(screen.getAllByTestId("nested-name")).toHaveLength(1);
    });
  });

  describe("the preview", () => {
    // THE REAL RENDERER, NOT A DRAWING OF IT. `Block` from `blocks.tsx` is
    // what both public pages are built from, handed the same tree the save
    // will send. A second implementation would have looked identical the day
    // it was written and drifted the first time either changed, with no type
    // error and no failing test.
    it("draws the section with the renderer a stranger's page uses", () => {
      harness([
        {
          ...newContainer("grid", 2),
          name_en: "About",
          children: [titled("Species")],
        },
      ]);
      const preview = screen.getByTestId("block-preview");
      expect(within(preview).getByTestId("public-section")).toBeInTheDocument();
      expect(within(preview).getByTestId("block-grid")).toBeInTheDocument();
      expect(within(preview).getByText("Species")).toBeInTheDocument();
    });

    // AN EMPTY PLACE KEEPS ITS WIDTH ON THE PAGE, and the preview is where an
    // author sees that before anybody else does.
    it("draws an empty place as room rather than as nothing", () => {
      harness([
        { ...newContainer("grid", 3), children: [titled("a"), null, null] },
      ]);
      expect(
        within(screen.getByTestId("block-preview")).getAllByTestId(
          "public-space",
        ),
      ).toHaveLength(2);
    });

    it("follows the authoring language rather than the app's", () => {
      const page = harness([
        {
          ...newContainer("grid", 1),
          children: [{ ...titled("English"), title_es: "Español" }],
        },
      ]);
      expect(
        within(screen.getByTestId("block-preview")).getByText("English"),
      ).toBeInTheDocument();
      expect(page()).toHaveLength(1);
    });

    // Only a section is previewed. A nested container previewed separately
    // would draw the same subtree twice on one screen.
    it("is drawn for a section and not for a container inside one", () => {
      harness([
        { ...newContainer("grid", 1), children: [newContainer("stack", 1)] },
      ]);
      expect(screen.getAllByTestId("block-preview")).toHaveLength(1);
    });
  });

  describe("the section's own fields", () => {
    it("writes the name in the language being written", () => {
      const page = harness([newContainer("grid", 2)]);
      fireEvent.change(screen.getByTestId("section-name"), {
        target: { value: "About" },
      });
      expect(section(page()).name_en).toBe("About");
    });

    it("writes the arrangement", () => {
      const page = harness([newContainer("grid", 2)]);
      fireEvent.change(screen.getByTestId("section-mode"), {
        target: { value: "timeline" },
      });
      expect(section(page()).mode).toBe("timeline");
    });

    // An arrangement this build has no name for still has to be shown, or the
    // select would render blank and the first change would silently rearrange
    // somebody's section.
    it("shows an arrangement it does not know, rather than rendering blank", () => {
      harness([{ ...newContainer("grid", 2), mode: "spiral" }]);
      const select = screen.getByTestId("section-mode") as HTMLSelectElement;
      expect(select.value).toBe("spiral");
      expect(
        within(select).getByRole("option", { name: "spiral" }),
      ).toBeDisabled();
    });

    it("collapses the places and keeps the header", () => {
      harness([newContainer("grid", 2)]);
      fireEvent.click(screen.getByTestId("collapse-section"));
      expect(screen.queryByTestId("places")).toBeNull();
      expect(screen.getByTestId("section-name")).toBeInTheDocument();
    });

    // **A CARD HOLDING A REFUSAL SHOWS ITS PLACES WHATEVER THE CONTROL SAYS.**
    // The control is about looking; this is about being able to look at all. A
    // refusal three levels down inside a collapsed section is one somebody
    // cannot see, let alone act on — while the banner tells them it is marked.
    it("shows its places anyway when something below is refused", () => {
      harness(
        [{ ...newContainer("grid", 2), children: [titled("a"), null] }],
        [{ path: [0, 0], field: "title_en" }],
      );
      fireEvent.click(screen.getByTestId("collapse-section"));
      expect(screen.getByTestId("places")).toBeInTheDocument();
    });

    // The other half, and the control that stops the case above passing on a
    // card that simply never collapses: a refusal on a DIFFERENT section
    // leaves this one collapsible.
    it("still collapses when the refusal is somewhere else", () => {
      harness(
        [{ ...newContainer("grid", 2), children: [titled("a"), null] }],
        [{ path: [7, 0], field: "title_en" }],
      );
      fireEvent.click(screen.getByTestId("collapse-section"));
      expect(screen.queryByTestId("places")).toBeNull();
    });

    it("removes the whole section when its bin is pressed", () => {
      const page = harness([newContainer("grid", 2)]);
      fireEvent.click(screen.getByTestId("remove-section"));
      expect(page()).toEqual([]);
    });
  });

  // THE GUARD AGAINST GOING BACK, ON THE EDITOR'S SIDE.
  //
  // `blocks.test.tsx` has asserted no viewport breakpoint on a public page for
  // a while, and it renders `PublicBlocks` only — so five `sm:` classes
  // survived in these two components, in the very file whose comment explains
  // why a viewport query is the wrong question below depth 0. Nothing policed
  // the editor: no lint rule forbids the prefix, and the end-to-end suite
  // drives this page at 1280px, where a `sm:` rule is simply on and asserts
  // nothing.
  //
  // Both components render at ARBITRARY DEPTH — a card holds cards and leaf
  // editors in its own grid tracks — which is what makes a window query wrong
  // here for exactly the reason it is wrong on the public page.
  //
  // Chrome that is NOT nested is deliberately out of scope: the toolbar, the
  // gradient picker and the theme panel sit in the page's own column, where
  // the window IS the box they are in.
  it("emits no viewport breakpoint anywhere in a card, a nested card or a leaf", () => {
    const kinds = LEAF_KINDS.map((kind) => ({
      ...newLeaf(kind),
      title_en: `One ${kind}`,
    }));
    const { container: root } = render(
      <BlockCard
        block={
          {
            ...newContainer("grid", BLOCK_LIMITS.spaces),
            name_en: "About",
            children: [
              { ...newContainer("grid", 3), children: [...kinds, null] },
              ...kinds,
              null,
            ],
          } as ContainerBlock
        }
        path={[0]}
        apply={() => undefined}
        lang="en"
        labels={labels}
        parentHost="me.furrycolombia.com"
        atBlockLimit={false}
        problems={[]}
      />,
    );
    // Through `getAttribute`, because an SVG element's `className` is an
    // `SVGAnimatedString` with no `split` — and lucide glyphs are all over
    // this card.
    const classes = [...root.querySelectorAll("[class]")].flatMap((element) =>
      (element.getAttribute("class") ?? "").split(/\s+/),
    );
    const viewport = /^(?:sm|md|lg|xl|2xl):/;
    expect([...new Set(classes.filter((name) => viewport.test(name)))]).toEqual(
      [],
    );
    // The anti-vacuity half: this card really did emit container queries, so
    // "no viewport prefixes" is not passing on markup that carries no
    // responsive rule at all.
    const queries = classes.filter(
      (name) => name.startsWith("@") && name.includes(":"),
    );
    expect(queries.length).toBeGreaterThan(0);
  });
});
