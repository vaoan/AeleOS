import { describe, expect, it, vi } from "vitest";
import { lockedKinds } from "@/features/actors/domain/required-blocks";
import { NextIntlClientProvider } from "next-intl";

import messages from "@/shared/infrastructure/i18n/messages/en.json";
import { fireEvent, render, screen, within } from "@testing-library/react";
import {
  BLOCK_LIMITS,
  isContainer,
  LEAF_KINDS,
  MAX_DEPTH,
  type Block,
  type ContainerBlock,
  type ContainerMode,
} from "@/features/actors/domain/block-schema";
import { newContainer, newLeaf } from "@/features/actors/domain/block-edits";
import type { BlockProblem } from "@/features/actors/domain/block-problems";
import { blockEditorLabels } from "./support/editor-labels";

// PRESENTATION IS COVERAGE-EXCLUDED, so a named test is the only thing that
// catches a gap. What this file is for is the four things somebody has to be
// able to do — choose a shape, put something in a place, nest, and take what
// is in a place away without taking the place away — plus the two claims the
// card makes that nothing else can check: narrowing destroys nothing, and
// author styles never leak into the controls.

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
        atBlockLimit={atBlockLimit}
        // **Computed from the page, exactly as `BlockEditor` does it.** A
        // harness passing an empty set would let a case assert the control is
        // enabled without that meaning anything about the rule.
        locked={lockedKinds(held.page, "fursona")}
        problems={problems}
        dragHandle={null}
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

/**
 * A container for the shape control's own tests, which read what `onChange`
 * is handed rather than a re-rendered page — so they need one block to start
 * from, not a whole page.
 *
 * @param overrides - fields to override on top of a `grid`/3 default.
 * @returns the container.
 */
function container(overrides: Partial<ContainerBlock> = {}): ContainerBlock {
  return { ...newContainer("grid", 3), ...overrides };
}

/**
 * Renders one card in isolation. `apply` hands `onChange` the whole next
 * page — the array `BlockEditor`'s own `apply` would have produced — so a
 * test can read exactly what an edit wrote without re-rendering a harness.
 *
 * @param block - the container to edit.
 * @param onChange - called with the next page after every edit; defaults to
 *   doing nothing, for the tests that only need the first render.
 * @returns what `render` returns, so a test may `unmount` before rendering
 *   the next case.
 */
function renderCard(
  block: ContainerBlock,
  onChange: (blocks: Block[]) => void = () => undefined,
) {
  return render(
    <BlockCard
      block={block}
      path={[0]}
      apply={(edit) => onChange(edit([block]))}
      lang="en"
      labels={labels}
      atBlockLimit={false}
      locked={new Set<string>()}
      problems={[]}
      dragHandle={null}
    />,
  );
}

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

  describe("the section's own fields", () => {
    it("keeps author skin and paint off the controls", () => {
      harness([
        {
          ...newContainer("grid", 1),
          style: {
            skin: "comic",
            background_url: "https://example.test/section.png",
            background_fit: "cover",
          },
        },
      ]);

      const card = screen.getByTestId("section-card");
      const name = screen.getByTestId("section-name");
      expect(card.getAttribute("style") ?? "").not.toMatch(
        /--skin-|background-image|clip-path/i,
      );
      expect(name.getAttribute("style") ?? "").not.toMatch(
        /--skin-|background-image|clip-path/i,
      );
      expect(screen.queryByTestId("section-card-face")).toBeNull();
    });

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

    // **A section holding the last copy of a required kind cannot be
    // removed**, and the case that matters is not a portrait somebody is
    // looking at — it is the SECTION their portrait happens to sit in, which
    // says nothing about identity on its face.
    //
    // The control is disabled rather than refusing the click, because a
    // control that accepts a press and does nothing is the failure this
    // repository keeps catching. The title is what says why.
    it("withdraws the bin when the section holds a locked kind", () => {
      const page = harness([
        {
          ...newContainer("grid", 2),
          children: [
            { kind: "avatar", title_en: "Portrait", description_en: "" },
            null,
          ],
        } as unknown as ContainerBlock,
      ]);
      const bin = screen.getByTestId("remove-section");
      expect(bin).toBeDisabled();
      expect(bin).toHaveAttribute("title", "remove-locked");
      fireEvent.click(bin);
      expect(page()).toHaveLength(1);
    });

    // **A second copy frees the first.** The rule is at-least-one, so a page
    // holding two portraits may lose either — and without this case the one
    // above passes for a control disabled whenever the kind appears at all,
    // which is a different and much more annoying rule.
    it("allows the bin when a second copy of the kind exists", () => {
      harness([
        {
          ...newContainer("grid", 2),
          children: [
            { kind: "avatar", title_en: "Portrait", description_en: "" },
            { kind: "avatar", title_en: "Again", description_en: "" },
          ],
        } as unknown as ContainerBlock,
      ]);
      expect(screen.getByTestId("remove-section")).not.toBeDisabled();
    });
  });

  describe("the shape control", () => {
    // Weights lay grid TRACKS: `masonry` is CSS multi-column, uniform by
    // construction, and `stack`/`carousel`/`tabs`/`accordion`/`timeline` lay
    // no tracks across at all. A control that accepted a shape here and
    // rendered nothing with it would be the fault this repo already paid
    // for once — see `social`'s missing description field.
    const NON_GRID_MODES = [
      "stack",
      "carousel",
      "tabs",
      "accordion",
      "timeline",
      "masonry",
    ] as const satisfies readonly ContainerMode[];

    it("offers the shape control for a grid", () => {
      renderCard(container({ mode: "grid", spaces: 3 }));
      expect(screen.getByTestId("section-shape")).toBeInTheDocument();
    });

    it("does not offer it for a mode that lays no tracks", () => {
      for (const mode of NON_GRID_MODES) {
        const { unmount } = renderCard(container({ mode, spaces: 3 }));
        expect(screen.queryByTestId("section-shape")).toBeNull();
        unmount();
      }
    });

    it("writes spaces and weights together when a shape is picked", () => {
      const onChange = vi.fn();
      renderCard(container({ mode: "grid", spaces: 3 }), onChange);
      fireEvent.change(screen.getByTestId("section-shape"), {
        target: { value: "WideMiddle" },
      });
      const next = onChange.mock.calls.at(-1)?.[0][0];
      expect(next.spaces).toBe(3);
      expect(next.weights).toEqual([1, 3, 1]);
    });

    // A PLACE HOLDS ONE CHILD, so a "wide middle" is unusable until its middle
    // place can grow — which is what makes picking a shape build a column
    // rather than leaving somebody to assemble one by hand. A place already
    // holding something must not be touched: the shape control changes the
    // ARRANGEMENT, never the content.
    it("seeds empty places with a column and leaves filled ones alone", () => {
      const onChange = vi.fn();
      renderCard(
        container({
          mode: "grid",
          spaces: 2,
          children: [titled("a"), null],
        }),
        onChange,
      );
      fireEvent.change(screen.getByTestId("section-shape"), {
        target: { value: "SidebarLeft" },
      });
      const next = onChange.mock.calls.at(-1)?.[0][0];
      expect(next.children[0]).toEqual(titled("a"));
      expect(next.children[1].mode).toBe("stack");
    });

    // Nothing pins this one functionally today — `patchContainer` with
    // `weights: undefined` is dropped by `JSON.stringify` on save — but
    // nothing asserted it either, and a section stuck weighted with no way
    // back to even is exactly the kind of silent regression this repo keeps
    // paying for.
    it("clears the weights when Even is picked after a weighted shape", () => {
      const onChange = vi.fn();
      renderCard(
        container({ mode: "grid", spaces: 3, weights: [1, 3, 1] }),
        onChange,
      );
      fireEvent.change(screen.getByTestId("section-shape"), {
        target: { value: "Even" },
      });
      const next = onChange.mock.calls.at(-1)?.[0][0];
      expect(next.weights).toBeUndefined();
    });

    it("shows one dial per place, seeded from the shape", () => {
      renderCard(container({ mode: "grid", spaces: 3, weights: [1, 3, 1] }));
      const dials = screen.getAllByTestId(/^section-weight-/);
      expect(dials.map((d) => (d as HTMLInputElement).value)).toEqual([
        "1",
        "3",
        "1",
      ]);
    });

    // The three shares DIFFER, so an implementation that wrote every dial's
    // value to the whole array — `[v, v, v]` — would pass a fixture whose
    // shares all happened to be alike and fail this one, exactly as it does
    // here: the untouched places must still read 3 and 1.
    it("writes one place's share without touching the others", () => {
      const onChange = vi.fn();
      renderCard(
        container({ mode: "grid", spaces: 3, weights: [1, 3, 1] }),
        onChange,
      );
      fireEvent.change(screen.getByTestId("section-weight-0"), {
        target: { value: "2" },
      });
      expect(onChange.mock.calls.at(-1)?.[0][0].weights).toEqual([2, 3, 1]);
    });

    // The truncated prefix, `[2, 5]`, matches no `SECTION_SHAPES` entry for
    // two places — `SidebarLeft` is `[1, 3]` and `SidebarRight` is `[3, 1]` —
    // so this cannot pass by way of a shape lookup standing in for a real
    // re-length. It has to be an actual truncation of what was there.
    it("re-lengths the weights when the width changes", () => {
      const onChange = vi.fn();
      renderCard(
        container({ mode: "grid", spaces: 3, weights: [2, 5, 4] }),
        onChange,
      );
      fireEvent.change(screen.getByTestId("section-spaces"), {
        target: { value: "2" },
      });
      expect(onChange.mock.calls.at(-1)?.[0][0].weights).toEqual([2, 5]);
    });

    it("explains what the shares do", () => {
      renderCard(container({ mode: "grid", spaces: 3 }));
      expect(screen.getByTestId("section-weights-hint")).toBeInTheDocument();
    });

    // FINDING 2 (final whole-branch review, 2026-08-19): `Number("")` is `0`
    // and `max` does not block typing past it, so an unclamped dial could
    // write a share `blocksSchema` refuses at `sections[0].weights[N]` — an
    // array-index path `blockProblems` cannot mark, which used to surface as
    // the page-level "holds more than it can" banner with nothing pointing
    // at the dial that caused it. Clamping in `onChange` makes that payload
    // unreachable from the control rather than reachable and then unmarked.
    it("clamps a cleared dial to 1 rather than writing 0", () => {
      const onChange = vi.fn();
      renderCard(
        container({ mode: "grid", spaces: 3, weights: [1, 3, 1] }),
        onChange,
      );
      fireEvent.change(screen.getByTestId("section-weight-0"), {
        target: { value: "" },
      });
      expect(onChange.mock.calls.at(-1)?.[0][0].weights).toEqual([1, 3, 1]);
    });

    it("clamps a dial typed past the bound to BLOCK_LIMITS.weight", () => {
      const onChange = vi.fn();
      renderCard(
        container({ mode: "grid", spaces: 3, weights: [1, 3, 1] }),
        onChange,
      );
      fireEvent.change(screen.getByTestId("section-weight-1"), {
        target: { value: "12" },
      });
      expect(onChange.mock.calls.at(-1)?.[0][0].weights).toEqual([
        1,
        BLOCK_LIMITS.weight,
        1,
      ]);
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
  describe("telling a section from content", () => {
    // Before this, the two cards painted the SAME background: `--surface` is
    // `var(--surface-solid)` in the one `:root, .aeleos-chrome` block, and dark
    // mode redeclares only the raw pair — so the whole distinction was one
    // border-alpha step, 4px of radius and 2px of padding, and a nested
    // section was styled byte-for-byte like a top-level one.

    it("gives a section a rail and names it, and gives a leaf neither", () => {
      harness([{ ...newContainer("grid", 1), children: [newLeaf("text")] }]);

      expect(screen.getAllByTestId("container-rail")).toHaveLength(1);
      // **Read off a marker of its own, never off the card's whole text.**
      // The name field is labelled "Section name" and the kind select was
      // labelled "Content", so `toHaveTextContent` on either card passes
      // whether or not an eyebrow was ever rendered — a fixture that cannot
      // tell the right answer from the wrong one.
      const [sectionEyebrow] = screen.getAllByTestId("card-kind");
      expect(sectionEyebrow).toHaveTextContent("Section");

      // The leaf names itself, and the rail is the section's alone.
      const leaf = screen.getByTestId("leaf-editor");
      expect(within(leaf).getByTestId("card-kind")).toHaveTextContent(
        "Content",
      );
      expect(within(leaf).queryByTestId("container-rail")).toBeNull();
    });

    it("gives every nested section a rail of its own", () => {
      // **Nested to the cap on purpose.** One rail on the outermost card and
      // one rail per container are indistinguishable on a flat fixture, so a
      // page with a single section could not tell the right behaviour from the
      // wrong one — and the point of the rail is that depth becomes countable.
      harness([
        {
          ...newContainer("stack", 1),
          children: [
            {
              ...newContainer("stack", 1),
              children: [newLeaf("text")],
            },
          ],
        },
      ]);

      expect(screen.getAllByTestId("container-rail")).toHaveLength(2);
      // Anti-vacuity: the fixture really did nest, so the count above is not
      // passing on a tree that collapsed to one card.
      expect(screen.getAllByTestId("nested-card")).toHaveLength(1);
    });
  });

  it("emits no viewport breakpoint anywhere in a card, a nested card or a leaf", () => {
    const kinds = LEAF_KINDS.map((kind) => ({
      ...newLeaf(kind),
      title_en: `One ${kind}`,
    }));
    // The card's live preview renders the real `Block`, and a retro player leaf
    // reaches for `useTranslations` — so the editor's own suite needs the
    // provider the app always supplies, exactly as the public renderer's does.
    const { container: root } = render(
      <NextIntlClientProvider locale="en" messages={messages}>
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
          atBlockLimit={false}
          locked={new Set<string>()}
          dragHandle={null}
          problems={[]}
        />
      </NextIntlClientProvider>,
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
