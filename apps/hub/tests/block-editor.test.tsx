import { describe, expect, it, vi } from "vitest";
import type React from "react";
import { missingRequiredKinds } from "@/features/actors/domain/required-blocks";
import { pageContext } from "./helpers/page-context";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { useForm, type UseFormReturn } from "react-hook-form";
import {
  BLOCK_LIMITS,
  CONTAINER_MODES,
  isContainer,
  type Block,
  type ContainerBlock,
} from "@/features/actors/domain/block-schema";
import { newContainer, newLeaf } from "@/features/actors/domain/block-edits";
import { FURSONA_TEMPLATES } from "@/features/actors/domain/fursona-templates";
import { SECTION_PRESETS } from "@/features/actors/presentation/section-presets";
import { blockEditorLabels } from "./support/editor-labels";

// PRESENTATION IS COVERAGE-EXCLUDED, so a named test is the only thing that
// catches a gap here. What this file is for is the SHAPE of the editor — the
// controls that exist, when they are withdrawn, and what each of them hands to
// the tree — while `block-edits.test.ts` and `block-moves.test.ts` own what the
// edits themselves do.

// **THE DRAG LIBRARY IS NOT MOCKED, and the drags below are real.**
//
// This file used to flatten `@hello-pangea/dnd` and capture the `onDragEnd`
// callback so a test could call it with a hand-made result. That measured the
// handler and nothing else: it would have passed with the grips wired to
// nothing, which is precisely how a grip in this repository shipped dead by
// every input method. `@dnd-kit`'s hooks work in jsdom — they register no
// ResizeObserver while nothing is dragging, and the keyboard sensor needs no
// geometry here because a keyboard drag walks a LIST of places rather than
// reading rectangles — so the drags below go through the real sensor, the real
// collision function and the real `moveBlock`.
//
// The keyboard sensor attaches its document listener inside a `setTimeout`, so
// the lift has to be flushed before the arrow keys are sent; `drag` below is
// where that lives.

// **The owner block's link is locale-aware**, and the shim now puts one on
// every fursona page the editor holds — so this suite renders a `Link` where
// it never did before. Mocked rather than wrapped in a provider, matching how
// every other component suite here handles it: the locale is not what these
// cases are about.
vi.mock("@/shared/infrastructure/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("lucide-react/dynamic", () => ({
  DynamicIcon: ({ name }: { name: string }) => <svg data-icon={name} />,
  iconNames: ["paw-print"],
}));

const { BlockEditor } =
  await import("@/features/actors/presentation/block-editor");

const labels = blockEditorLabels();

/** What the harness's form holds. */
type FormValues = { sections: Block[] };

/**
 * The editor over a real form, so a test can read the page back.
 *
 * @returns the form.
 */
function harness(sections: Block[] = []) {
  let form: UseFormReturn<FormValues> | undefined;
  /**
   * The editor, capturing the form it is bound to.
   *
   * @returns the element.
   */
  function Harness() {
    form = useForm<FormValues>({ defaultValues: { sections } });
    return (
      <BlockEditor
        control={form.control}
        lang="en"
        labels={labels}
        page={pageContext({ parentHost: "" })}
        problems={[]}
      />
    );
  }
  render(<Harness />);
  return () => form!.getValues().sections;
}

/** The section names of a page, in order. */
const names = (page: Block[]) =>
  page.map((block) => isContainer(block) && block.name_en);

/** A leaf carrying a title, so an assertion can name it. */
const titled = (title: string) => ({ ...newLeaf("text"), title_en: title });

/**
 * A page nested as deeply as the schema admits: three containers, then a leaf.
 *
 * @returns the section.
 */
const deepPage = (): ContainerBlock => ({
  ...newContainer("grid", 2),
  children: [
    {
      ...newContainer("grid", 2),
      children: [
        { ...newContainer("grid", 2), children: [titled("buried"), null] },
        null,
      ],
    },
    null,
  ],
});

/**
 * What sits in the deepest container of {@link deepPage}, by title.
 *
 * @param page - the page to read.
 * @returns one entry per place, the title or nothing.
 */
const deepest = (page: Block[]) => {
  const [section] = page;
  const inner =
    section && isContainer(section) ? section.children[0] : undefined;
  const deep = inner && isContainer(inner) ? inner.children[0] : undefined;
  if (!deep || !isContainer(deep)) throw new Error("not nested");
  return deep.children.map((child) =>
    child && "title_en" in child ? child.title_en : null,
  );
};

/**
 * The live region `@dnd-kit` manages itself, which is what a screen reader
 * hears.
 *
 * @returns the element.
 */
const liveRegion = (): HTMLElement => {
  const region = document.querySelector('[id^="DndLiveRegion-"]');
  if (!region) throw new Error("no live region");
  return region as HTMLElement;
};

/**
 * Drives a real keyboard drag: lift, step, drop.
 *
 * The sensor attaches its own document listener inside a `setTimeout`, so the
 * lift is flushed before any arrow key is sent — without that the steps land
 * on nothing and the drop looks like a no-op rather than a failure.
 *
 * @param handle - the grip's test id.
 * @param steps - the arrow keys to press between the lift and the drop.
 */
const drag = async (handle: string, steps: string[]): Promise<void> => {
  fireEvent.keyDown(screen.getByTestId(handle), { code: "Space", key: " " });
  await settle();
  for (const code of steps) {
    fireEvent.keyDown(document, { code });
    await settle();
  }
  fireEvent.keyDown(document, { code: "Space", key: " " });
  await settle();
};

/**
 * Lets the sensor's own timers and the drop's own promise run.
 *
 * The keyboard sensor attaches its document listener inside a `setTimeout`, so
 * the lift has to be flushed before an arrow key is sent — without that the
 * steps land on nothing and the drop looks like a no-op rather than a failure.
 * The drop itself is `async` in the library, which is the other half.
 */
const settle = async (): Promise<void> => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

/** The page's first block, narrowed to a container. */
const firstContainer = (page: Block[]): ContainerBlock => {
  const [block] = page;
  if (!block || !isContainer(block)) throw new Error("not a container");
  return block;
};

describe("BlockEditor", () => {
  it("draws the live section in the page's own box, outside the droppable", () => {
    harness([
      {
        ...newContainer("grid", 1),
        name_en: "Styled",
        style: { skin: "comic" },
        children: [titled("Real renderer")],
      },
    ]);

    const card = screen.getByTestId("section-card");
    const tray = screen.getByTestId("block-preview");
    const slot = screen.getByTestId("place-0");

    expect(slot).toContainElement(card);
    expect(slot).not.toContainElement(tray);
    expect(within(tray).getByTestId("public-section")).toBeInTheDocument();
    expect(within(tray).getByText("Real renderer")).toBeInTheDocument();
    expect(tray.parentElement).toHaveClass("gap-2");
    expect(tray.parentElement?.parentElement).toHaveClass("gap-6");

    // **THE PAGE BOX, which the tray never laid before.** A preview that does
    // not is showing the author a section at the workbench's width: `bleed`
    // does nothing, the first and last section's page spacing is absent, and
    // every container query inside answers to a box no visitor has. These are
    // the classes `pageBoxClass` composes for a lone section at the default
    // `wider` measure — first and last at once, because there is one.
    expect(tray).toHaveClass("mx-auto", "w-full", "max-w-7xl", "px-4");
    expect(tray).toHaveClass("pt-6", "pb-6");

    // **NOTHING of the editor's own is painted over the page.** The card face,
    // the label, the padding and the author's `--field` on an in-flow box are
    // all gone: the document carries the theme, so the field, the background
    // picture and the nebula canvas are already behind this. The host that
    // used to sit here also clipped on all four edges — see the tray's own
    // TSDoc — so its absence is what lets a `neon` glow leave its box.
    expect(within(tray).queryByTestId("preview-theme-host")).toBeNull();
    expect(within(tray).queryByTestId("section-preview-face")).toBeNull();
    expect(tray.className).not.toContain("overflow");
  });

  it("says so when there is nothing on the page", () => {
    harness();
    expect(screen.getByText(labels.empty)).toBeInTheDocument();
  });

  // CHOOSING A SHAPE IS THE FIRST THING SOMEBODY DOES, so the control that
  // does it sits beside the one that adds the section rather than only on the
  // card afterwards.
  it("offers every width the schema accepts, before a section exists", () => {
    harness();
    const options = within(screen.getByTestId("new-section-spaces"))
      .getAllByRole("option")
      .map((el) => (el as HTMLOptionElement).value);
    expect(options).toEqual(["1", "2", "3", "4", "5", "6"]);
  });

  it("adds a section of the chosen shape, with a place for each space", () => {
    const page = harness();
    fireEvent.change(screen.getByTestId("new-section-spaces"), {
      target: { value: "4" },
    });
    fireEvent.click(screen.getByTestId("add-section"));

    const block = firstContainer(page());
    expect(block.spaces).toBe(4);
    expect(block.children).toEqual([null, null, null, null]);
    expect(screen.getAllByTestId("empty-place")).toHaveLength(4);
  });

  it("appends rather than replacing what is already there", () => {
    const page = harness([newContainer("stack", 1)]);
    fireEvent.click(screen.getByTestId("add-section"));
    expect(page()).toHaveLength(2);
  });

  // A TEMPLATE REPLACES, which is why the picker confirms first when there is
  // anything to lose. Templates are still written in the flat vocabulary, so
  // what arrives is the conversion — the same one that opens every page
  // already stored.
  // **Replacing, plus the identity blocks the page must keep.** A template
  // ships structure and names no identity block; applying one replaces the
  // page, so without the shim on that path choosing a template would strip
  // somebody's portrait and handle and leave a tree the write refuses.
  //
  // The count is the template's sections PLUS what the shim supplies, and the
  // completeness check is what actually pins the behaviour — a length
  // assertion alone would pass on a shim that added the wrong blocks.
  it("applies a template as blocks, keeping the page complete", () => {
    const page = harness();
    fireEvent.click(screen.getByTestId("template-picker"));
    const [template] = FURSONA_TEMPLATES;
    fireEvent.click(screen.getByTestId(`template-${template!.id}`));

    expect(page().length).toBeGreaterThanOrEqual(template!.sections.length);
    expect(page().every((block) => isContainer(block))).toBe(true);
    expect(missingRequiredKinds(page(), "fursona")).toEqual([]);
  });

  // A PRESET APPENDS AND NEVER ASKS FIRST, because appending is not
  // destructive; adding a confirmation would make the two controls look
  // interchangeable when they are not.
  it("appends a brand preset already named and already holding its kind", () => {
    const page = harness();
    fireEvent.click(screen.getByTestId("section-presets"));
    const [preset] = SECTION_PRESETS;
    fireEvent.click(screen.getByTestId(`preset-${preset!.id}`));

    const block = firstContainer(page());
    expect(block.name_en).toBe(preset!.name);
    const [first] = block.children;
    expect(first && !isContainer(first) && first.kind).toBe(preset!.kind);
  });

  // A DROP REORDERS THE PAGE AND NOTHING ELSE: a block carries no
  // `sort_order` — the array IS the order at every depth — so there is nothing
  // to renumber afterwards and nothing a save can send stale.
  it("shifts a section past its neighbour on a keyboard drag", async () => {
    const page = harness([
      { ...newContainer("stack", 1), name_en: "one" },
      { ...newContainer("stack", 1), name_en: "two" },
    ]);
    await drag("drag-0", ["ArrowDown"]);
    expect(names(page())).toEqual(["two", "one"]);
  });

  it("leaves the order alone when a lift is dropped where it started", async () => {
    const page = harness([
      { ...newContainer("stack", 1), name_en: "one" },
      { ...newContainer("stack", 1), name_en: "two" },
    ]);
    await drag("drag-0", []);
    expect(names(page())).toEqual(["one", "two"]);
  });

  // MOVING CONTENT BETWEEN SECTIONS IS THE THING THE OLD LIBRARY COULD NOT DO
  // AT ALL — its own README rules out dragging from a parent list into a child
  // one. The leaf leaves its place empty, because a place is positional and
  // must keep the width its author gave it.
  it("moves a piece of content into an empty place in another section", async () => {
    const page = harness([
      { ...newContainer("grid", 2), children: [titled("moved"), null] },
      newContainer("grid", 2),
    ]);
    // The places, in drawing order, are [0,0] [0,1] [1,0] [1,1]; the sections
    // themselves are not offered, because a nested block dropped onto one
    // would SWAP with the whole section rather than land in it.
    await drag("drag-0.0", ["ArrowDown", "ArrowDown"]);

    const [first, second] = page();
    expect(isContainer(first) && first.children).toEqual([null, null]);
    expect(
      isContainer(second) &&
        second.children.map((c) => c && "title_en" in c && c.title_en),
    ).toEqual(["moved", null]);
  });

  // DEPTH THREE, WHICH THE SPIKE DID NOT PROVE. A leaf at the deepest seat the
  // schema admits — three containers above it — moves to the place beside it,
  // and nothing about the path length is special-cased anywhere.
  it("moves a leaf at the depth cap to the place beside it", async () => {
    const page = harness([deepPage()]);
    await drag("drag-0.0.0.0", ["ArrowDown"]);
    expect(deepest(page())).toEqual([null, "buried"]);
  });

  // A REFUSAL IS SAID OUT LOUD. `moveBlock` answers why a drop did not happen,
  // and a drag that quietly changed nothing would be indistinguishable from a
  // broken grip — which is the fault this repository keeps paying for.
  it("says why a drop one level too deep changed nothing", async () => {
    const page = harness([deepPage(), newContainer("grid", 2)]);
    // The section already reaches three levels of its own, so putting it in a
    // place at depth one would land its leaf at depth four. The places, in
    // order, are [0] [1] [1,0] [1,1] — everything inside the section being
    // carried is left out, because a keyboard drag walks a list and a list can
    // simply not offer them.
    await drag("drag-0", ["ArrowDown", "ArrowDown"]);
    expect(screen.getByTestId("drag-refusal")).toHaveTextContent(
      labels.drag.tooDeep,
    );
    // And it is SAID, not only shown — the library's own live region is what a
    // screen reader is listening to, and a refusal that reached the page but
    // not that region would be silent to exactly the person dragging by
    // keyboard.
    expect(liveRegion()).toHaveTextContent(labels.drag.tooDeep);
    expect(deepest(page())).toEqual(["buried", null]);
  });

  // WITHDRAWN AT THE CAP, WITH A SENTENCE SAYING WHY. A button that silently
  // does nothing reads as broken, and the cap is not a fault on the person's
  // part — it is a number `blocksSchema` and `validate_block` both enforce.
  it("withdraws every add control at the block cap and says why", () => {
    const full: Block[] = Array.from({ length: BLOCK_LIMITS.blocks }, () => ({
      ...newLeaf("text"),
      title_en: "x",
    }));
    harness(full);
    expect(screen.getByText(labels.atLimit)).toBeInTheDocument();
    expect(screen.queryByTestId("add-section")).toBeNull();
    expect(screen.queryByTestId("section-presets")).toBeNull();
  });

  // The cap counts what `blocksSchema` counts, empty places excluded — a page
  // of wide-open sections must not be refused for blocks it does not hold.
  it("counts an empty place against nothing", () => {
    harness([{ ...newContainer("grid", 6), children: Array(50).fill(null) }]);
    expect(screen.getByTestId("add-section")).toBeInTheDocument();
  });

  // A PAGE MAY HOLD A LEAF AT THE TOP LEVEL, and one this editor could not
  // show would be content nobody can read or remove while every save kept
  // writing it back. Nothing here builds one; the schema admits one.
  it("shows a leaf sitting at the top of the page", () => {
    harness([{ ...newLeaf("text"), title_en: "Loose" }]);
    expect(screen.getByTestId("leaf-editor")).toBeInTheDocument();
    expect(screen.queryByTestId("section-card")).toBeNull();
  });

  it("names every arrangement the schema knows, on a section's own control", () => {
    harness([newContainer("grid", 2)]);
    const options = within(screen.getByTestId("section-mode"))
      .getAllByRole("option")
      .map((el) => (el as HTMLOptionElement).value);
    expect(options).toEqual([...CONTAINER_MODES]);
  });
});
