import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useForm, type UseFormReturn } from "react-hook-form";
import type { ReactNode } from "react";
import type { DropResult } from "@hello-pangea/dnd";
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
// the tree — while `block-edits.test.ts` owns what the edits themselves do.

// `DragDropContext` is flattened, exactly like `Draggable` and `Droppable`, so
// a real drag is never driven here — that is `section-drag-reorder.spec.ts`'s
// job, against a real browser. What this captures is the `onDragEnd` callback
// the editor registers, so a test can call it directly and assert what a drop
// did to the page.
let capturedOnDragEnd: ((result: DropResult) => void) | undefined;

vi.mock("@hello-pangea/dnd", () => ({
  DragDropContext: ({
    children,
    onDragEnd,
  }: {
    children: ReactNode;
    onDragEnd: (result: DropResult) => void;
  }) => {
    capturedOnDragEnd = onDragEnd;
    return <>{children}</>;
  },
  Droppable: ({
    children,
  }: {
    children: (p: {
      innerRef: undefined;
      droppableProps: Record<string, never>;
      placeholder: null;
    }) => ReactNode;
  }) => (
    <>
      {children({ innerRef: undefined, droppableProps: {}, placeholder: null })}
    </>
  ),
  Draggable: ({
    children,
  }: {
    children: (p: {
      innerRef: undefined;
      draggableProps: Record<string, never>;
      dragHandleProps: Record<string, never>;
    }) => ReactNode;
  }) => (
    <>
      {children({
        innerRef: undefined,
        draggableProps: {},
        dragHandleProps: {},
      })}
    </>
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
        parentHost=""
        problems={[]}
      />
    );
  }
  render(<Harness />);
  return () => form!.getValues().sections;
}

/** The page's first block, narrowed to a container. */
const firstContainer = (page: Block[]): ContainerBlock => {
  const [block] = page;
  if (!block || !isContainer(block)) throw new Error("not a container");
  return block;
};

describe("BlockEditor", () => {
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
  it("applies a template as blocks, replacing the page", () => {
    const page = harness();
    fireEvent.click(screen.getByTestId("template-picker"));
    const [template] = FURSONA_TEMPLATES;
    fireEvent.click(screen.getByTestId(`template-${template!.id}`));

    expect(page()).toHaveLength(template!.sections.length);
    expect(page().every((block) => isContainer(block))).toBe(true);
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

  // A drop reorders the page and nothing else: a block carries no `sort_order`
  // — the array IS the order at every depth — so there is nothing to renumber
  // afterwards and nothing a save can send stale.
  it("reorders sections on a drop", () => {
    const page = harness([
      { ...newContainer("stack", 1), name_en: "one" },
      { ...newContainer("stack", 1), name_en: "two" },
    ]);
    capturedOnDragEnd!({
      source: { index: 0, droppableId: "sections" },
      destination: { index: 1, droppableId: "sections" },
    } as DropResult);
    expect(page().map((block) => isContainer(block) && block.name_en)).toEqual([
      "two",
      "one",
    ]);
  });

  it("leaves the order alone when a drag is cancelled", () => {
    const page = harness([
      { ...newContainer("stack", 1), name_en: "one" },
      { ...newContainer("stack", 1), name_en: "two" },
    ]);
    capturedOnDragEnd!({
      source: { index: 0, droppableId: "sections" },
      destination: null,
    } as DropResult);
    capturedOnDragEnd!({
      source: { index: 0, droppableId: "sections" },
      destination: { index: 0, droppableId: "sections" },
    } as DropResult);
    expect(page().map((block) => isContainer(block) && block.name_en)).toEqual([
      "one",
      "two",
    ]);
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
