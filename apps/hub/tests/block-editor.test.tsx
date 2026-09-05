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
import {
  AddSlotProvider,
  AddSlotTarget,
} from "@/features/actors/presentation/add-slot";
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
  pageInteractionsEnabled = false,
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
          // page interaction is off. The one exception passes `true`
          // directly — the real toolbar switch that flips this lives in
          // `EditorToolbar`, which `BlockEditor` itself never mounts.
          pageInteractionsEnabled={pageInteractionsEnabled}
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
  //
  // **`AddSlotProvider`/`AddSlotTarget` stand in for `EditorToolbar`.** The
  // single global Add is portalled out of `BlockEditor` into a slot the real
  // toolbar renders; this harness renders only `BlockEditor`, so it has to
  // supply that slot itself for `add-block` to be reachable at all.
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AddSlotProvider>
        <AddSlotTarget />
        <Harness />
      </AddSlotProvider>
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

/** Opens the panel on Page, where the section-adding controls live. */
const openPageAdd = (): void => {
  fireEvent.click(screen.getByTestId("select-page"));
};

/**
 * Selects the block at a canvas path by clicking it directly, exactly as a
 * real click on the live renderer does — there is no drill-down list to
 * open a row from any more (2026-09-04).
 *
 * @param path - a hyphen-joined `data-block-path`, e.g. `"0-1"`.
 */
const selectPath = (path: string): void => {
  const element = screen
    .getByTestId("editor-canvas")
    .querySelector(`[data-block-path="${path}"]`);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`no block rendered at path ${path}`);
  }
  fireEvent.click(element);
};

/**
 * The selected block's own canvas grip test id, for {@link drag}.
 *
 * @param path - a hyphen-joined `data-block-path`, matching {@link selectPath}.
 * @returns the dot-joined `canvas-drag-*` id `EditableBlockFrame` renders for
 * whichever block is currently selected.
 */
const canvasGrip = (path: string): string =>
  `canvas-drag-${path.replaceAll("-", ".")}`;

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
  // **The panel's own card is a control, never a second renderer.** Clicking
  // a section on the canvas opens its card in the Properties panel directly
  // — there is no Items/Options split to navigate through any more — and
  // that card must never duplicate the live rendering the canvas already
  // draws, which is the fault a second implementation would eventually grow.
  it("shows a selected section's card in the panel, distinct from its live canvas rendering", () => {
    harness([
      {
        ...newContainer("grid", 1),
        name_en: "Styled",
        style: { skin: "comic" },
        children: [titled("Real renderer")],
      },
    ]);
    fireEvent.click(screen.getByText("Styled"));

    const card = screen.getByTestId("section-card");
    const tray = screen.getByTestId("block-preview");

    expect(card).not.toContainElement(tray);
    expect(tray).not.toContainElement(card);
    expect(within(tray).getByTestId("public-section")).toBeInTheDocument();
    expect(within(tray).getByText("Real renderer")).toBeInTheDocument();
    expect(within(card).queryByText("Real renderer")).toBeNull();

    expect(tray).toHaveClass("mx-auto", "w-full", "max-w-7xl", "px-4");
    expect(tray).toHaveClass("pt-(--page-edge)", "pb-(--page-edge)");
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
    expect(
      screen
        .getByTestId("editor-canvas")
        .querySelectorAll('[data-canvas-path="0-0"], [data-canvas-path="0-1"]'),
    ).toHaveLength(2);
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
    selectPath("0");

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
  it("offers no layout option from the panel's Add at the depth cap", () => {
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
    // The innermost container — a section, a container inside it, a
    // container inside that — is the deepest a container may sit; nesting
    // one more there would put a fourth container at the cap.
    selectPath("0-0-0");

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
    selectPath("0");
    await drag(canvasGrip("0"), ["ArrowDown"]);
    expect(names(page())).toEqual(["two", "one"]);
  });

  it("leaves the order alone when a lift is dropped where it started", async () => {
    const page = harness([
      { ...newContainer("stack", 1), name_en: "one" },
      { ...newContainer("stack", 1), name_en: "two" },
    ]);
    selectPath("0");
    await drag(canvasGrip("0"), []);
    expect(names(page())).toEqual(["one", "two"]);
  });

  // Only the SELECTED block carries an accessible grip (2026-09-04) — there
  // is no Items list rendering every sibling's grip at once any more, which
  // is what made a nested child's grip unreachable alongside its parent's
  // the old test named. Selecting the top-level container still gives only
  // that one a grip, and never its own child's at the same time.
  it("gives the selected top-level container its own grip and no nested one alongside it", () => {
    harness([
      { ...newContainer("grid", 2), children: [titled("moved"), null] },
      newContainer("grid", 2),
    ]);
    selectPath("0");
    expect(screen.getByTestId("canvas-drag-0")).toBeInTheDocument();
    expect(screen.queryByTestId("canvas-drag-0.0")).toBeNull();
  });

  // DEPTH THREE, WHICH THE SPIKE DID NOT PROVE. A leaf at the deepest seat the
  // schema admits — three containers above it — moves to the place beside it,
  // and nothing about the path length is special-cased anywhere.
  it("moves a leaf at the depth cap to the place beside it", async () => {
    const page = harness([deepPage()]);
    selectPath("0-0-0-0");
    await drag(canvasGrip("0-0-0-0"), ["ArrowDown"]);
    expect(deepest(page())).toEqual([null, "buried"]);
  });

  // **"a cross-level target is never offered" no longer holds for the
  // canvas, and that is by design (2026-09-04).** Canvas grips admit any
  // domain-valid cross-container destination — see the feature note's
  // "Linear parents insert-and-shift; positional parents still exchange" and
  // the recursive-inspector correction above it — where the OLD sibling-only
  // restriction this test named belonged to the recursive inspector alone,
  // which is gone. What still refuses a bad drop is `moveBlock`/`applyDrop`
  // themselves, covered in `block-moves.test.ts`/`block-drops.test.ts` and
  // driven end to end in `section-drag-reorder.spec.ts`.

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
    selectPath("0");
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

  it("shows only the selected container's own card, with children collapsed", () => {
    harness([{ ...newContainer("stack", 1), name_en: "kept" }]);
    fireEvent.click(screen.getByText("kept"));
    expect(screen.getByTestId("section-card")).toBeInTheDocument();
    expect(screen.queryByTestId("empty-place")).toBeNull();
  });

  it("names every arrangement the schema knows, on a section's own control", () => {
    harness([newContainer("grid", 2)]);
    selectPath("0");
    const options = within(screen.getByTestId("section-mode"))
      .getAllByRole("option")
      .map((el) => (el as HTMLOptionElement).value);
    expect(options).toEqual([...CONTAINER_MODES]);
  });
});

describe("the Properties panel", () => {
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

  it("starts deselected with no properties panel in the DOM", () => {
    harness(recursivePage());
    expect(screen.queryByTestId("properties-panel")).toBeNull();
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
  it("puts the Page control inside the canvas and still opens the properties panel", () => {
    harness(recursivePage());
    const canvas = screen.getByTestId("editor-canvas");
    const control = screen.getByTestId("select-page");

    expect(canvas).toContainElement(control);

    fireEvent.click(control);

    expect(screen.getByTestId("properties-panel")).toBeInTheDocument();
  });

  it("instruments the live renderer and gives only the selected block an accessible canvas grip", () => {
    harness(recursivePage());

    const canvas = screen.getByTestId("editor-canvas");
    expect(within(canvas).getAllByTestId("canvas-drag-node")).toHaveLength(7);
    expect(
      within(canvas).queryByRole("button", { name: labels.dragBlock }),
    ).toBeNull();

    fireEvent.click(within(canvas).getByText("Deep leaf"));

    expect(screen.getByTestId("leaf-editor")).toBeInTheDocument();
    expect(screen.getByTestId("canvas-drag-0.0.0")).toHaveAccessibleName(
      labels.dragBlock,
    );
    expect(
      within(canvas).getAllByRole("button", { name: labels.dragBlock }),
    ).toHaveLength(1);
  });

  it.each(["tabs", "accordion"] as const)(
    "keeps an empty %s place available as a positional canvas destination",
    (mode) => {
      harness([
        {
          ...newContainer(mode, 2),
          children: [titled("filled"), null],
        },
      ]);

      expect(
        screen
          .getByTestId("editor-canvas")
          .querySelector('[data-canvas-path="0-1"]'),
      ).toBeInTheDocument();
    },
  );

  it("moves a rendered stack child by its canvas grip and follows its returned destination", async () => {
    const page = harness([
      {
        ...newContainer("stack", 1),
        children: [titled("A"), titled("B"), titled("C")],
      },
    ]);
    const canvas = screen.getByTestId("editor-canvas");
    fireEvent.click(within(canvas).getByText("A"));

    await drag("canvas-drag-0.0", ["ArrowDown", "ArrowDown"]);

    expect(
      firstContainer(page()).children.map((child) =>
        child && !isContainer(child) ? child.title_en : null,
      ),
    ).toEqual(["B", "C", "A"]);
    expect(screen.getByTestId("leaf-title")).toHaveValue("A");
    expect(screen.getByTestId("canvas-drag-0.2")).toBeInTheDocument();
  });

  // `refusalOf` and the announcements' own `name` callback both used to
  // resolve a drag id with bare `placePath`, which understands only the
  // recursive inspector's `"place:"` prefix and answers `undefined` for a
  // canvas grip's `"canvas-place:"` id — so a canvas lift announced "Picked
  // up ." with no position at all, silently, on every canvas drag. Both
  // sites now try `canvasPlacePath(id) ?? placePath(id)`.
  it("announces a canvas lift by the place's own name, not by an empty string", async () => {
    harness([
      {
        ...newContainer("stack", 1),
        children: [titled("A"), titled("B")],
      },
    ]);
    fireEvent.click(screen.getByText("A"));
    fireEvent.keyDown(screen.getByTestId("canvas-drag-0.0"), {
      code: "Space",
      key: " ",
    });
    await settle();

    const announcement = document.querySelector('[id^="DndLiveRegion-"]');
    expect(announcement).not.toBeNull();
    expect(announcement!.textContent).toBe(`${labels.drag.lifted} 1.1.`);
  });

  // `refusalOf` reads the same two ids through `applySiblingDrop`, which
  // `dropTargetForSibling` restricts to true siblings — the same parent,
  // by construction. That forces `applyLinearDrop`'s own `sameParent` true
  // on every call this makes, so its "too many" refusal (gated on
  // `!sameParent`) can never fire here; "into itself" and "too deep" both
  // require a depth change, and a same-parent before/after target always
  // computes a destination path the same length as the source's, which an
  // already-valid tree already satisfies at that depth. The one refusal
  // left reachable, "no such place", needs a target that has gone stale
  // between the keyboard's last step and the drop — attempted directly
  // (mutate the page mid-drag via `page.replace`, then drop onto the
  // now-missing place) and it did not redden: the stale mutation did not
  // survive to the drop's own read of the page, for reasons this task did
  // not chase further given that `applySiblingDrop` already cannot reach
  // the other three refusals at all. Sabotaging `refusalOf`
  // alone back to bare `placePath` — leaving the `name` fix above in
  // place — confirmed the negative empirically: the whole file stayed
  // green, 41/41, with no case anywhere noticing the difference. Per this
  // repository's own rule against writing a fixture that only looks like
  // it discriminates (root `CLAUDE.md` rule 27), this is recorded rather
  // than manufactured: `refusalOf`'s half of this fix has no reachable
  // canvas-drag scenario to redden against, given `applySiblingDrop`'s
  // sibling-only domain. The fix is still correct — it makes `refusalOf`
  // resolve the SAME two ids the `name` callback beside it now resolves,
  // for consistency, and because a future refusal type or a genuine
  // stale-target path is not provably impossible, only unreachable through
  // every case this file could construct.

  it("shows an insertion bar for a linear canvas target and clears it on cancel", async () => {
    harness([
      {
        ...newContainer("stack", 1),
        children: [titled("A"), titled("B")],
      },
    ]);
    fireEvent.click(screen.getByText("A"));
    fireEvent.keyDown(screen.getByTestId("canvas-drag-0.0"), {
      code: "Space",
      key: " ",
    });
    await settle();
    fireEvent.keyDown(document, { code: "ArrowDown" });
    await settle();

    expect(screen.getByTestId("canvas-drop-after")).toBeInTheDocument();

    fireEvent.keyDown(document, { code: "Escape", key: "Escape" });
    await settle();
    expect(screen.queryByTestId("canvas-drop-after")).toBeNull();
  });

  it("highlights an empty positional place without turning it into an insertion bar", async () => {
    harness([
      {
        ...newContainer("grid", 3),
        children: [titled("A"), null, titled("C")],
      },
    ]);
    fireEvent.click(screen.getByText("A"));
    fireEvent.keyDown(screen.getByTestId("canvas-drag-0.0"), {
      code: "Space",
      key: " ",
    });
    await settle();
    fireEvent.keyDown(document, { code: "ArrowDown" });
    await settle();

    expect(
      screen
        .getByTestId("editor-canvas")
        .querySelector('[data-canvas-path="0-1"]'),
    ).toHaveAttribute("data-canvas-drop", "place");
    expect(screen.queryByTestId("canvas-drop-before")).toBeNull();
    expect(screen.queryByTestId("canvas-drop-after")).toBeNull();
  });

  it("keeps canvas drag instrumentation and feedback out of Preview", () => {
    const page = harness(recursivePage());
    fireEvent.click(screen.getByText("Deep leaf"));
    expect(screen.getAllByTestId("canvas-drag-node")).not.toHaveLength(0);

    page.setControlsHidden(true);

    expect(screen.queryByTestId("canvas-drag-node")).toBeNull();
    expect(screen.queryByTestId(/canvas-drop-/)).toBeNull();
  });

  // `Preview` is one of the two inputs `pageInteractionsEnabled` composes
  // (root feature note, "page interactions enabled = controls hidden OR
  // toolbar switch enabled") — the case above pins the `controlsHidden`
  // half; this pins the toolbar-switch half directly, since `BlockEditor`
  // itself never mounts `EditorToolbar` and has no switch of its own to
  // click.
  it("renders no canvas drag wrappers while page interaction is enabled", () => {
    harness(recursivePage(), "fursona", true);
    expect(screen.queryByTestId("canvas-drag-node")).toBeNull();
    expect(screen.queryByTestId(/^canvas-drag-/)).toBeNull();
  });

  it("still clears the selection for a click on the page itself", () => {
    harness(recursivePage());
    fireEvent.click(screen.getByTestId("select-page"));
    expect(screen.getByTestId("properties-panel")).toBeInTheDocument();

    // The canvas outside any block and outside any control island: the one
    // click that still means "the panel should go". Exempting chrome must
    // not have exempted the page.
    fireEvent.click(screen.getByTestId("editor-canvas"));

    expect(screen.queryByTestId("properties-panel")).toBeNull();
  });

  // There is no drill-down and no tree navigation any more (2026-09-04): the
  // Properties panel shows exactly two tabs for whatever is directly
  // selected on the canvas, and selecting a deeper block is a fresh click on
  // the canvas rather than a step through an Items list. The equivalent
  // domain coverage — which block a click or a keyboard drag resolves to at
  // any depth — lives in `block-moves.test.ts`, `block-drops.test.ts` and
  // `section-drag-reorder.spec.ts`.

  it("clears a nested selection for Preview and does not restore it afterwards", () => {
    const page = harness(recursivePage());
    selectPath("0-0-0");
    expect(screen.getByTestId("leaf-editor")).toBeInTheDocument();

    page.setControlsHidden(true);
    expect(screen.queryByTestId("properties-panel")).toBeNull();

    page.setControlsHidden(false);
    expect(screen.queryByTestId("properties-panel")).toBeNull();
  });

  it.each([
    ["Page", () => fireEvent.click(screen.getByTestId("select-page"))],
    ["a container", () => selectPath("0")],
    ["a leaf", () => selectPath("0-0-0")],
  ])("closes the panel directly from %s without submitting", (_, enter) => {
    harness(recursivePage());
    const submitted = vi.fn((event: SubmitEvent) => event.preventDefault());
    screen
      .getByTestId("block-editor-form")
      .addEventListener("submit", submitted);
    enter();

    fireEvent.click(screen.getByTestId("panel-close"));

    expect(screen.queryByTestId("properties-panel")).toBeNull();
    expect(screen.getByTestId("editor-canvas")).toBeInTheDocument();
    expect(screen.getByTestId("select-page")).toBeInTheDocument();
    expect(submitted).not.toHaveBeenCalled();
  });

  it("selects the parent when the selected leaf is deleted", () => {
    harness(recursivePage());
    // "Deep leaf" sits at 0-0-0, inside "Inner" (a nested container at
    // 0-0). Deleting it should leave "Inner" — not "Outer" and not Page —
    // selected.
    selectPath("0-0-0");
    fireEvent.click(screen.getByTestId("remove-block"));

    expect(screen.getByTestId("properties-panel")).toBeInTheDocument();
    expect(screen.getByTestId("nested-card")).toBeInTheDocument();
  });

  it("persists repair after an external document replacement removes then reuses a path", async () => {
    const page = harness(recursivePage());
    selectPath("0");
    expect(screen.getByTestId("section-name")).toHaveValue("Outer");

    await act(async () => {
      page.replace([]);
      await Promise.resolve();
    });
    // Repaired to Page: the selected path is gone and nothing survives above
    // it, so the panel now shows Page's own fields rather than disappearing.
    expect(screen.getByTestId("properties-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("section-name")).toBeNull();

    await act(async () => {
      page.replace([{ ...newContainer("stack", 1), name_en: "Replacement" }]);
      await Promise.resolve();
    });
    // The repair is persisted: a new block filling the same numeric path
    // must not resurrect the stale selection.
    expect(screen.queryByTestId("section-name")).toBeNull();
  });

  it("keeps a sibling drag within Page and selects its returned destination", async () => {
    // A single hop, not two: with a canvas grip, each of these sections'
    // own empty place (`newContainer("stack", 1)`, one child) sits in the
    // keyboard walk order right after the section itself — canvas grips
    // admit any domain-valid cross-container destination, unlike the old
    // sibling-only inspector grip. A second ArrowDown here lands INSIDE
    // "two"'s own place rather than skipping past it to "three", which is
    // correct nesting behaviour and not a sibling reorder at all. One hop
    // stays within Page's own top-level list, which is what this case is
    // for.
    const page = harness([
      { ...newContainer("stack", 1), name_en: "one" },
      { ...newContainer("stack", 1), name_en: "two" },
      { ...newContainer("stack", 1), name_en: "three" },
    ]);
    selectPath("0");

    await drag(canvasGrip("0"), ["ArrowDown"]);

    expect(names(page())).toEqual(["two", "one", "three"]);
    expect(screen.getByTestId("canvas-drag-1")).toBeInTheDocument();
    expect(screen.getByTestId("section-name")).toHaveValue("one");
  });
});
