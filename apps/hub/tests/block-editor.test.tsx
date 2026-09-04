import { describe, expect, it, vi } from "vitest";
import React, { useState } from "react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/shared/infrastructure/i18n/messages/en.json";
import {
  missingRequiredKinds,
  offerableLeafKinds,
} from "@/features/actors/domain/required-blocks";
import { pageContext } from "./helpers/page-context";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
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

/** A page reader that can also simulate a document import replacing blocks. */
interface HarnessPage {
  /** Reads the current form value. */
  (): Block[];
  /** Replaces the field from outside `BlockEditor`'s own edit boundary. */
  replace: (blocks: Block[]) => void;
  /** Enters or leaves Preview without moving selection ownership upward. */
  setControlsHidden: (hidden: boolean) => void;
}

/**
 * The editor over a real form, so a test can read the page back.
 *
 * @returns the form.
 */
function harness(
  sections: Block[] = [],
  actorKind: "person" | "fursona" = "fursona",
) {
  let form: UseFormReturn<FormValues> | undefined;
  let setControlsHidden:
    React.Dispatch<React.SetStateAction<boolean>> | undefined;
  let resetSelection: (() => void) | undefined;
  /**
   * The editor, capturing the form it is bound to.
   *
   * @returns the element.
   */
  function Harness() {
    form = useForm<FormValues>({ defaultValues: { sections } });
    const [controlsHidden, setHidden] = useState(false);
    const [selectionResetKey, setSelectionResetKey] = useState(0);
    setControlsHidden = setHidden;
    resetSelection = () => setSelectionResetKey((current) => current + 1);
    return (
      <form data-testid="block-editor-form">
        <BlockEditor
          control={form.control}
          lang="en"
          labels={labels}
          page={pageContext({ parentHost: "", actorKind })}
          problems={[]}
          // **The harness stands in for `FursonaEditor`, which owns the form.**
          // `BlockEditor` forwards a picked template upward rather than applying
          // it, because a look is a second field this component cannot reach —
          // so the harness writes it, exactly as the real editor does.
          onApplyDocument={({ blocks }) => form?.setValue("sections", blocks)}
          // No look chosen, so the picker applies without confirming — which is
          // what every case in this file assumes.
          theme={null}
          // Locked by default, matching the editor's own default: every case
          // in this file exercises canvas selection, which only works while
          // page interaction is off.
          pageInteractionsEnabled={false}
          controlsHidden={controlsHidden}
          selectionResetKey={selectionResetKey}
        />
      </form>
    );
  }
  // The Add picker's previews reach `useTranslations` through `RetroPlayer`
  // for `player`/`jukebox` — exactly as `blocks.test.tsx` and
  // `add-block-picker.test.tsx` document — and the picker is reachable from
  // every scope now, so every render here needs the real provider with the
  // real catalogue rather than a stub that would measure a different
  // program.
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <Harness />
    </NextIntlClientProvider>,
  );
  const page = (() => form!.getValues().sections) as HarnessPage;
  page.replace = (blocks) => form!.setValue("sections", blocks);
  page.setControlsHidden = (hidden) => {
    act(() => {
      if (hidden) resetSelection!();
      setControlsHidden!(hidden);
    });
  };
  return page;
}

/** Opens the page inspector on Items, where page additions live. */
const openPageAdd = (): void => {
  fireEvent.click(screen.getByTestId("select-page"));
};

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
    fireEvent.click(screen.getByTestId("select-page"));
    fireEvent.click(screen.getByTestId("inspector-item-open"));
    fireEvent.click(screen.getByTestId("inspector-tab-options"));

    const card = screen.getByTestId("section-card");
    const tray = screen.getByTestId("block-preview");
    const slot = screen.getByTestId("place-0.0");

    expect(slot).not.toContainElement(card);
    expect(slot).not.toContainElement(tray);
    expect(within(tray).getByTestId("public-section")).toBeInTheDocument();
    expect(within(tray).getByText("Real renderer")).toBeInTheDocument();

    expect(tray).toHaveClass("mx-auto", "w-full", "max-w-7xl", "px-4");
    expect(tray).toHaveClass("pt-(--page-edge)", "pb-(--page-edge)");

    expect(within(tray).queryByTestId("preview-theme-host")).toBeNull();
    expect(within(tray).queryByTestId("section-preview-face")).toBeNull();
    expect(tray.className).not.toContain("overflow");
  });

  it("says so when there is nothing on the page", () => {
    harness();
    expect(screen.getByText(labels.empty)).toBeInTheDocument();
  });

  // ONE ADD CONTROL, not the sixteen flat `add-leaf-*` buttons plus
  // `add-section` this replaced. Presets and `add-place` are unrelated
  // controls and stay exactly where they were.
  it("offers exactly one add-block in Page Items, alongside presets", () => {
    harness();
    openPageAdd();
    expect(screen.getAllByTestId("add-block")).toHaveLength(1);
    expect(screen.getByTestId("section-presets")).toBeInTheDocument();
    for (const kind of offerableLeafKinds("fursona")) {
      expect(screen.queryByTestId(`add-leaf-${kind}`)).toBeNull();
    }
  });

  // A SECTION NOW STARTS AT A FIXED SHAPE AND IS RESHAPED AFTERWARDS, which is
  // what every nested container already did — `add-nested` never let anybody
  // choose a width before adding either. Choosing a width up front was the
  // one thing the page level did differently, and the picker makes every
  // scope work the same way: `add-block` adds `newContainer(mode, 2)`, and
  // the section's own shape control (`block-card.test.tsx`) is where its
  // width is chosen afterwards.
  it("adds a section from the picker, with two places to start", () => {
    const page = harness();
    openPageAdd();
    fireEvent.click(screen.getByTestId("add-block"));
    fireEvent.click(
      screen
        .getAllByTestId("add-block-option")
        .find((option) => option.getAttribute("data-add-mode") === "grid")!,
    );

    const block = firstContainer(page());
    expect(block.spaces).toBe(2);
    expect(block.children).toEqual([null, null]);
    expect(screen.getAllByTestId("inspector-empty-place")).toHaveLength(2);
  });

  it("appends rather than replacing what is already there", () => {
    const page = harness([newContainer("stack", 1)]);
    openPageAdd();
    fireEvent.click(screen.getByTestId("add-block"));
    fireEvent.click(
      screen
        .getAllByTestId("add-block-option")
        .find((option) => option.getAttribute("data-add-mode") === "grid")!,
    );
    expect(page()).toHaveLength(2);
  });

  // THE "NESTING LOOKED DELETED" BUG this replaces the flat add row to fix:
  // `add-nested` used to exist only on an EMPTY place, so a section whose
  // places were all filled offered no way to add a section inside it at all.
  // `mayNest` still admits one up to `MAX_DEPTH` — the picker just has to be
  // reachable from a full scope's own Items footer, not only from a place
  // that happens to be empty.
  it("still offers add-block from a full two-place container, and adds a nested container inside it", () => {
    const page = harness([
      {
        ...newContainer("grid", 2),
        children: [titled("a"), titled("b")],
      },
    ]);
    fireEvent.click(screen.getByTestId("select-page"));
    fireEvent.click(screen.getByTestId("inspector-item-open"));

    expect(screen.getByTestId("add-block")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("add-block"));
    fireEvent.click(
      screen
        .getAllByTestId("add-block-option")
        .find((option) => option.getAttribute("data-add-mode") === "grid")!,
    );

    const outer = firstContainer(page());
    expect(outer.children).toHaveLength(3);
    const nested = outer.children[2];
    expect(nested && isContainer(nested)).toBe(true);
  });

  // The deepest CONTAINER `mayNest` still admits sits at depth two — a
  // section, a container inside it, a container inside that — where a
  // fourth level would exceed `MAX_DEPTH`. The picker's layout group must be
  // absent from that container's own Items footer, matching what an empty
  // place at the same depth already refuses.
  it("offers no layout group from a container's Items footer at the depth cap", () => {
    harness([
      {
        ...newContainer("stack", 1),
        children: [
          {
            ...newContainer("stack", 1),
            children: [
              { ...newContainer("stack", 1), children: [titled("deep")] },
            ],
          },
        ],
      },
    ]);
    fireEvent.click(screen.getByTestId("select-page"));
    fireEvent.click(screen.getByTestId("inspector-item-open"));
    fireEvent.click(screen.getByTestId("inspector-item-open"));
    fireEvent.click(screen.getByTestId("inspector-item-open"));

    fireEvent.click(screen.getByTestId("add-block"));
    expect(
      screen
        .getAllByTestId("add-block-option")
        .every((option) => !option.hasAttribute("data-add-mode")),
    ).toBe(true);
    expect(screen.getByTestId("nesting-at-limit")).toBeInTheDocument();
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
    openPageAdd();
    fireEvent.click(screen.getByTestId("template-picker"));
    const [template] = FURSONA_TEMPLATES;
    fireEvent.click(screen.getByTestId(`template-${template!.id}`));

    expect(page().length).toBeGreaterThanOrEqual(template!.blocks.length);
    expect(page().every((block) => isContainer(block))).toBe(true);
    expect(missingRequiredKinds(page(), "fursona")).toEqual([]);
  });

  // A PRESET APPENDS AND NEVER ASKS FIRST, because appending is not
  // destructive; adding a confirmation would make the two controls look
  // interchangeable when they are not.
  it("appends a brand preset already named and already holding its kind", () => {
    const page = harness();
    openPageAdd();
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
    openPageAdd();
    await drag("drag-0", ["ArrowDown"]);
    expect(names(page())).toEqual(["two", "one"]);
  });

  it("leaves the order alone when a lift is dropped where it started", async () => {
    const page = harness([
      { ...newContainer("stack", 1), name_en: "one" },
      { ...newContainer("stack", 1), name_en: "two" },
    ]);
    openPageAdd();
    await drag("drag-0", []);
    expect(names(page())).toEqual(["one", "two"]);
  });

  it("offers only top-level siblings while Page Items is open", () => {
    harness([
      { ...newContainer("grid", 2), children: [titled("moved"), null] },
      newContainer("grid", 2),
    ]);
    openPageAdd();
    expect(screen.getByTestId("drag-0")).toBeInTheDocument();
    expect(screen.getByTestId("drag-1")).toBeInTheDocument();
    expect(screen.queryByTestId("drag-0.0")).toBeNull();
  });

  // DEPTH THREE, WHICH THE SPIKE DID NOT PROVE. A leaf at the deepest seat the
  // schema admits — three containers above it — moves to the place beside it,
  // and nothing about the path length is special-cased anywhere.
  it("moves a leaf at the depth cap to the place beside it", async () => {
    const page = harness([deepPage()]);
    openPageAdd();
    fireEvent.click(screen.getByTestId("inspector-item-open"));
    fireEvent.click(screen.getByTestId("inspector-item-open"));
    fireEvent.click(screen.getByTestId("inspector-item-open"));
    await drag("drag-0.0.0.0", ["ArrowDown"]);
    expect(deepest(page())).toEqual([null, "buried"]);
  });

  // A CROSS-LEVEL TARGET IS NEVER OFFERED. The final boundary repeats this
  // rule for stale or synthetic ids, while the visible inspector simply keeps
  // the unrelated level out of its dnd context.
  it("does not offer a cross-level target one level too deep", () => {
    harness([deepPage(), newContainer("grid", 2)]);
    openPageAdd();
    expect(screen.getByTestId("drag-0")).toBeInTheDocument();
    expect(screen.getByTestId("drag-1")).toBeInTheDocument();
    expect(screen.queryByTestId("drag-1.0")).toBeNull();
    expect(screen.queryByTestId("drag-refusal")).toBeNull();
  });

  // WITHDRAWN AT THE CAP, WITH A SENTENCE SAYING WHY. A button that silently
  // does nothing reads as broken, and the cap is not a fault on the person's
  // part — it is a number `blocksSchema` and `validate_block` both enforce.
  //
  // **Its timeout is explicit, and the number is measured rather than
  // widened until it went green.** This renders `BLOCK_LIMITS.blocks` — 500 —
  // real leaf editors into jsdom, so it is a stress fixture wearing a unit
  // test's clothes, and vitest's 5000ms DEFAULT was never a budget anybody
  // chose for it. Measured on one developer machine: 843ms and 858ms with the
  // card eyebrow and rail rendering nothing, 1048ms and 1056ms as shipped.
  // CI ran the same case at 5314ms and timed out — about 5x this machine — so
  // the case was already inside 15% of the default before the eyebrow existed
  // and had no headroom for a loaded runner.
  //
  // Root rule 33 forbids widening a timeout to make a flake stop; the
  // mechanism here is measured and written down, which is the case that rule
  // exempts. **Nothing about this case asserts a duration**, so a generous
  // ceiling costs no signal: it fails when the controls do not withdraw, and
  // 20s is chosen so a runner four times slower than the one that failed still
  // reaches the assertions. If it ever times out again, that is a real
  // rendering regression and not a number to raise.
  it("withdraws every add control at the block cap and says why", () => {
    const full: Block[] = Array.from({ length: BLOCK_LIMITS.blocks }, () => ({
      ...newLeaf("text"),
      title_en: "x",
    }));
    harness(full);
    openPageAdd();
    expect(screen.getByText(labels.atLimit)).toBeInTheDocument();
    expect(screen.queryByTestId("add-block")).toBeNull();
    expect(screen.queryByTestId("section-presets")).toBeNull();
  }, 20_000);

  // The cap counts what `blocksSchema` counts, empty places excluded — a page
  // of wide-open sections must not be refused for blocks it does not hold.
  it("counts an empty place against nothing", () => {
    harness([{ ...newContainer("grid", 6), children: Array(50).fill(null) }]);
    openPageAdd();
    expect(screen.getByTestId("add-block")).toBeInTheDocument();
  });

  // A PAGE MAY HOLD A LEAF AT THE TOP LEVEL, and one this editor could not
  // show would be content nobody can read or remove while every save kept
  // writing it back. Nothing here builds one; the schema admits one.
  it("shows a leaf sitting at the top of the page", () => {
    harness([{ ...newLeaf("text"), title_en: "Loose" }]);
    openPageAdd();
    fireEvent.click(screen.getByTestId("inspector-item-open"));
    expect(screen.getByTestId("leaf-editor")).toBeInTheDocument();
    expect(screen.queryByTestId("section-card")).toBeNull();
  });

  // **A LOOK IS A FURSONA DOCUMENT, AND A PERSON'S PAGE REFUSES IT.** An era
  // look names `owner`, which has nothing to render on somebody's own profile,
  // so `set_actor_sections` refuses the save outright. Offering one at
  // `/me/edit` would hand them a page that applies cleanly and then cannot be
  // saved — the "the control did nothing" fault wearing its worst face, since
  // it looks like it did everything.
  //
  // Both halves, because either alone passes on a picker that offers nothing
  // at all or on one that filters nothing.
  it("offers era looks on a fursona's page and withholds them from a person's", () => {
    harness([], "fursona");
    openPageAdd();
    fireEvent.click(screen.getByTestId("template-picker"));
    expect(screen.getByTestId("template-era-win98")).toBeInTheDocument();
    cleanup();

    harness([], "person");
    openPageAdd();
    fireEvent.click(screen.getByTestId("template-picker"));
    expect(screen.queryByTestId("template-era-win98")).toBeNull();
    // And a starter is still offered there, so the filter narrowed rather
    // than emptied.
    expect(screen.getByTestId("template-reference-sheet")).toBeInTheDocument();
  });

  it("mounts only the selected container's controls in Options", () => {
    harness([{ ...newContainer("stack", 1), name_en: "kept" }]);
    openPageAdd();
    fireEvent.click(screen.getByTestId("inspector-item-open"));
    fireEvent.click(screen.getByTestId("inspector-tab-options"));
    expect(screen.getByTestId("section-card")).toBeInTheDocument();
    expect(screen.queryByTestId("empty-place")).toBeNull();
  });

  it("names every arrangement the schema knows, on a section's own control", () => {
    harness([newContainer("grid", 2)]);
    openPageAdd();
    fireEvent.click(screen.getByTestId("inspector-item-open"));
    fireEvent.click(screen.getByTestId("inspector-tab-options"));
    const options = within(screen.getByTestId("section-mode"))
      .getAllByRole("option")
      .map((el) => (el as HTMLOptionElement).value);
    expect(options).toEqual([...CONTAINER_MODES]);
  });
});

describe("recursive inspector drill-down", () => {
  const recursivePage = (): Block[] => [
    {
      ...newContainer("grid", 3),
      name_en: "Outer",
      children: [
        {
          ...newContainer("stack", 1),
          name_en: "Inner",
          children: [titled("Deep leaf")],
        },
        null,
        titled("Sibling leaf"),
      ],
    },
    { ...newContainer("stack", 1), name_en: "Second" },
  ];

  it("starts deselected with no inspector in the DOM", () => {
    harness(recursivePage());
    expect(screen.queryByTestId("canvas-inspector")).toBeNull();
  });

  it("makes only the canvas an inner scroller while controls show", () => {
    const page = harness(recursivePage());
    const canvas = screen.getByTestId("editor-canvas");
    const editor = canvas.closest("section[data-editor-stack]");

    expect(editor).toHaveClass("flex", "min-h-0", "flex-1");
    expect(canvas).toHaveClass(
      "min-h-0",
      "flex-1",
      "overflow-y-auto",
      "overflow-x-clip",
    );

    page.setControlsHidden(true);
    expect(editor).not.toHaveClass("flex-1", "min-h-0");
    expect(canvas).not.toHaveClass("overflow-y-auto", "overflow-x-clip");
  });

  // THE PAGE CONTROL RIDES THE PAGE, AND ITS OWN CLICK MUST SURVIVE THE RIDE.
  //
  // Two claims, and the second exists because the first creates it. Putting
  // the control inside `editor-canvas` puts it inside the canvas's own click
  // handler — which selects the nearest `data-block-path` and, finding none,
  // clears the selection. So the press that opens the inspector would close
  // it again on the way up, and the button would visibly do nothing.
  //
  // Containment alone cannot catch that: the control is in the right box in
  // both the working and the broken version. The selection is what tells them
  // apart, which is why both are asserted here rather than only the placement.
  it("puts the Page control inside the canvas and still opens the inspector", () => {
    harness(recursivePage());
    const canvas = screen.getByTestId("editor-canvas");
    const control = screen.getByTestId("select-page");

    expect(canvas).toContainElement(control);

    fireEvent.click(control);

    expect(screen.getByTestId("canvas-inspector")).toBeInTheDocument();
  });

  it("still clears the selection for a click on the page itself", () => {
    harness(recursivePage());
    fireEvent.click(screen.getByTestId("select-page"));
    expect(screen.getByTestId("canvas-inspector")).toBeInTheDocument();

    // The canvas outside any block and outside any control island: the one
    // click that still means "the inspector should go". Exempting chrome must
    // not have exempted the page.
    fireEvent.click(screen.getByTestId("editor-canvas"));

    expect(screen.queryByTestId("canvas-inspector")).toBeNull();
  });

  it("drills Page to a container to a leaf, showing only immediate children", () => {
    harness(recursivePage());

    fireEvent.click(screen.getByTestId("select-page"));
    const inspector = screen.getByTestId("canvas-inspector");
    expect(within(inspector).getAllByTestId("inspector-item-row")).toHaveLength(
      2,
    );
    expect(within(inspector).queryByText("Deep leaf")).toBeNull();

    fireEvent.click(
      within(inspector).getAllByTestId("inspector-item-open")[0]!,
    );
    expect(within(inspector).getAllByTestId("inspector-item-row")).toHaveLength(
      3,
    );
    // `toBeVisible` would also fail on the row's own opacity-in entrance
    // (`inspector-items.tsx`), which jsdom never actually animates to
    // completion — no real compositor, no real frames. What this case is
    // actually checking is that the row sits in the ACTIVE pane rather than
    // one `hidden` is currently hiding, which `closest("[hidden]")`
    // answers without depending on an animation jsdom cannot run.
    const emptyPlace = within(inspector).getByTestId("inspector-empty-place");
    expect(emptyPlace.closest("[hidden]")).toBeNull();
    expect(within(inspector).queryByText("Deep leaf")).toBeNull();

    fireEvent.click(
      within(inspector).getAllByTestId("inspector-item-open")[0]!,
    );
    expect(within(inspector).getAllByTestId("inspector-item-row")).toHaveLength(
      1,
    );
    fireEvent.click(within(inspector).getByTestId("inspector-item-open"));

    expect(within(inspector).queryByRole("tablist")).toBeNull();
    // Not `toBeVisible`, for the same reason as the empty place above: the
    // Options pane's own entrance opacity never resolves in jsdom.
    expect(
      within(inspector).getByTestId("leaf-editor").closest("[hidden]"),
    ).toBeNull();
    expect(within(inspector).queryByTestId("nested-card")).toBeNull();
  });

  it("derives Back and breadcrumbs from the selected path", () => {
    harness(recursivePage());
    fireEvent.click(screen.getByTestId("select-page"));
    fireEvent.click(screen.getAllByTestId("inspector-item-open")[0]!);
    fireEvent.click(screen.getAllByTestId("inspector-item-open")[0]!);

    expect(screen.getAllByTestId("inspector-breadcrumb")).toHaveLength(3);
    fireEvent.click(screen.getByTestId("inspector-back"));
    expect(screen.getAllByTestId("inspector-item-row")).toHaveLength(3);

    fireEvent.click(screen.getAllByTestId("inspector-breadcrumb")[0]!);
    expect(screen.getAllByTestId("inspector-item-row")).toHaveLength(2);

    fireEvent.click(screen.getByTestId("inspector-back"));
    expect(screen.queryByTestId("canvas-inspector")).toBeNull();
  });

  it("clears a nested selection for Preview and does not restore it afterwards", () => {
    const page = harness(recursivePage());
    fireEvent.click(screen.getByTestId("select-page"));
    fireEvent.click(screen.getAllByTestId("inspector-item-open")[0]!);
    fireEvent.click(screen.getAllByTestId("inspector-item-open")[0]!);
    fireEvent.click(screen.getByTestId("inspector-item-open"));
    expect(screen.getByTestId("leaf-editor")).toBeInTheDocument();

    page.setControlsHidden(true);
    expect(screen.queryByTestId("canvas-inspector")).toBeNull();

    page.setControlsHidden(false);
    expect(screen.queryByTestId("canvas-inspector")).toBeNull();
  });

  it.each([
    ["Page", () => undefined],
    [
      "a container",
      () => fireEvent.click(screen.getAllByTestId("inspector-item-open")[0]!),
    ],
    [
      "a leaf",
      () => {
        fireEvent.click(screen.getAllByTestId("inspector-item-open")[0]!);
        fireEvent.click(screen.getAllByTestId("inspector-item-open")[0]!);
        fireEvent.click(screen.getByTestId("inspector-item-open"));
      },
    ],
  ])("closes the inspector directly from %s without submitting", (_, enter) => {
    harness(recursivePage());
    const submitted = vi.fn((event: SubmitEvent) => event.preventDefault());
    screen
      .getByTestId("block-editor-form")
      .addEventListener("submit", submitted);
    fireEvent.click(screen.getByTestId("select-page"));
    enter();

    fireEvent.click(screen.getByTestId("inspector-close"));

    expect(screen.queryByTestId("canvas-inspector")).toBeNull();
    expect(screen.getByTestId("editor-canvas")).toBeInTheDocument();
    expect(screen.getByTestId("select-page")).toBeInTheDocument();
    expect(submitted).not.toHaveBeenCalled();
  });

  it("selects the parent when the selected leaf is deleted", () => {
    harness(recursivePage());
    fireEvent.click(screen.getByTestId("select-page"));
    fireEvent.click(screen.getAllByTestId("inspector-item-open")[0]!);
    fireEvent.click(screen.getAllByTestId("inspector-item-open")[1]!);
    fireEvent.click(screen.getByTestId("remove-block"));

    // Not `toBeVisible`: the inspector's own entrance opacity
    // (`canvas-inspector.tsx`) never actually animates to completion in
    // jsdom, which has no real compositor. `closest("[hidden]")` is the
    // check that survives that — the inspector is mounted at all here,
    // which is the real claim.
    const inspector = screen.getByTestId("canvas-inspector");
    expect(inspector.closest("[hidden]")).toBeNull();
    expect(screen.getAllByTestId("inspector-item-row")).toHaveLength(3);
    expect(screen.getAllByTestId("inspector-empty-place")).toHaveLength(2);
  });

  it("persists repair after an external document replacement removes then reuses a path", async () => {
    const page = harness(recursivePage());
    fireEvent.click(screen.getByTestId("select-page"));
    fireEvent.click(screen.getAllByTestId("inspector-item-open")[0]!);
    fireEvent.click(screen.getByTestId("inspector-tab-options"));
    expect(screen.getByTestId("section-name")).toHaveValue("Outer");

    await act(async () => {
      page.replace([]);
      await Promise.resolve();
    });
    expect(screen.getAllByTestId("inspector-breadcrumb")).toHaveLength(1);

    await act(async () => {
      page.replace([{ ...newContainer("stack", 1), name_en: "Replacement" }]);
      await Promise.resolve();
    });
    expect(screen.getAllByTestId("inspector-breadcrumb")).toHaveLength(1);
    expect(screen.queryByTestId("section-name")).toBeNull();
    expect(screen.getByTestId("inspector-item-open")).toHaveTextContent(
      "Replacement",
    );
  });

  it("keeps sibling drag within the visible Page rows and does not enter the moved row", async () => {
    const page = harness([
      { ...newContainer("stack", 1), name_en: "one" },
      { ...newContainer("stack", 1), name_en: "two" },
      { ...newContainer("stack", 1), name_en: "three" },
    ]);
    fireEvent.click(screen.getByTestId("select-page"));

    await drag("drag-0", ["ArrowDown", "ArrowDown"]);

    expect(names(page())).toEqual(["two", "three", "one"]);
    expect(screen.getAllByTestId("inspector-item-row")).toHaveLength(3);
    expect(screen.queryByTestId("section-name")).toBeNull();
  });
});
