import { describe, expect, it, vi } from "vitest";
import { pageContext } from "./helpers/page-context";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { SKINS } from "@/shared/domain/skins";
import {
  newContainer,
  type BlockPath,
} from "@/features/actors/domain/block-edits";
import { LEAF_KINDS, type Block } from "@/features/actors/domain/block-schema";
import { blockEditorLabels } from "./support/editor-labels";

vi.mock("lucide-react/dynamic", () => ({
  DynamicIcon: ({ name }: { name: string }) => <svg data-icon={name} />,
  iconNames: ["sparkles"],
}));

const { BlockCard } = await import("@/features/actors/presentation/block-card");
const { SectionPreviewTray } =
  await import("@/features/actors/presentation/section-preview-tray");
const { SectionStylePopup } =
  await import("@/features/actors/presentation/section-style-popup");

const labels = blockEditorLabels();

/**
 * One card over a page a test can read back, exactly as the editor drives it:
 * a whole tree in one value, edited by pure functions and handed back whole.
 *
 * @returns the card, and a way to read what the edits made of the page.
 */
function harness(page: Block[], path: BlockPath = [0]) {
  const held = { page };
  /**
   * Applies an edit and re-renders, the way the editor's own `apply` does.
   *
   * @param edit - what to make of the page.
   */
  const apply = (edit: (blocks: Block[]) => Block[]): void => {
    held.page = edit(held.page);
    view.rerender(card());
  };
  /**
   * The card as it stands, over whatever the page currently holds.
   *
   * @returns the element.
   */
  const card = () => {
    const block = path.reduce<Block | null>(
      (current, index) =>
        current && "children" in current
          ? (current.children[index] ?? null)
          : (held.page[index] ?? null),
      null,
    );
    if (!block || !("children" in block)) throw new Error("not a container");
    return (
      <>
        <BlockCard
          block={block}
          path={path}
          apply={apply}
          lang="en"
          labels={labels}
          atBlockLimit={false}
          locked={new Set<string>()}
          problems={[]}
          dragHandle={null}
          kinds={LEAF_KINDS}
        />
        {path.length === 1 ? (
          <SectionPreviewTray
            block={block}
            position={path[0]!}
            count={1}
            lang="en"
            page={pageContext({ parentHost: "" })}
          />
        ) : null}
      </>
    );
  };
  const view = render(card());
  return { held, view };
}

/** A page of one plain, unstyled section. */
const onePage = (): Block[] => [{ ...newContainer("grid", 2) }];

/** A page of three plain sections, so a write can be shown not to spread. */
const threePage = (): Block[] => [
  { ...newContainer("grid", 2), name_en: "First" },
  { ...newContainer("grid", 2), name_en: "Second" },
  { ...newContainer("grid", 2), name_en: "Third" },
];

/**
 * Renders three cards over one page, each addressing its own position.
 *
 * A single-section harness cannot tell a correctly scoped write from one that
 * happened to land on the only block there was.
 *
 * @returns what the page holds, readable after an edit.
 */
function threeHarness() {
  const held = { page: threePage() };
  /**
   * Applies an edit and re-renders every card.
   *
   * @param edit - what to make of the page.
   */
  const apply = (edit: (blocks: Block[]) => Block[]): void => {
    held.page = edit(held.page);
    view.rerender(cards());
  };
  /**
   * All three cards as they stand.
   *
   * @returns the elements.
   */
  const cards = () => (
    <>
      {held.page.map((block, index) =>
        "children" in block ? (
          <BlockCard
            key={index}
            block={block}
            path={[index]}
            apply={apply}
            lang="en"
            labels={labels}
            atBlockLimit={false}
            locked={new Set<string>()}
            problems={[]}
            dragHandle={null}
            kinds={LEAF_KINDS}
          />
        ) : null,
      )}
    </>
  );
  const view = render(cards());
  return held;
}

/** The style bag of one section of a page a harness is holding. */
const styleOf = (page: Block[], index = 0) =>
  (page[index] as { style?: Record<string, unknown> }).style;

/** Opens the (only, in a one-section harness) style popup. */
function openPopup() {
  fireEvent.click(screen.getByRole("button", { name: "Section style" }));
}

describe("SectionStylePopup", () => {
  it("is closed until the paintbrush is pressed", () => {
    harness(onePage());
    expect(screen.queryByLabelText("Style")).toBeNull();
  });

  it("shows the skin list and the background fields once opened", () => {
    harness(onePage());
    openPopup();
    expect(screen.getByLabelText("Style")).toBeInTheDocument();
    expect(screen.getByLabelText("Background picture")).toBeInTheDocument();
  });

  it("offers every skin, in order, behind an inherit option", () => {
    harness(onePage());
    openPopup();
    const options = within(screen.getByLabelText("Style"))
      .getAllByRole("option")
      .map((el) => (el as HTMLOptionElement).value);
    expect(options).toEqual(["", ...SKINS]);
  });

  it("hides the fit field until a background address is set", () => {
    harness(onePage());
    openPopup();
    expect(screen.queryByLabelText("Fit")).toBeNull();
    fireEvent.change(screen.getByLabelText("Background picture"), {
      target: { value: "https://example.test/bg.png" },
    });
    expect(screen.getByLabelText("Fit")).toBeInTheDocument();
  });

  // THE CARD-SIZE FIELD IS GONE, AND ITS ABSENCE IS THE ASSERTION. It named
  // the minimum width a card in an `auto-fill` grid could shrink to; a
  // container declares an explicit space count now, so nothing on any page
  // reads `--card-size`, and a control that accepts a choice and changes
  // nothing is the worst kind there is. The schema keeps the KEY, so a value
  // the flat editor stored is not destroyed by the field going.
  it("offers no card-size field, because no page reads one", () => {
    harness(onePage());
    openPopup();
    expect(screen.queryByLabelText("Card size")).toBeNull();
  });

  it("offers margins only on a top-level section", () => {
    const { view } = harness(onePage());
    openPopup();
    expect(screen.getByLabelText("Margins")).toBeChecked();
    expect(screen.getByTestId("section-style-margins")).toBeInTheDocument();
    view.unmount();

    harness(
      [
        {
          ...newContainer("grid", 1),
          children: [{ ...newContainer("grid", 1) }],
        },
      ],
      [0, 0],
    );
    openPopup();
    expect(screen.queryByTestId("section-style-margins")).toBeNull();
  });

  it("stores false when margins are removed and absence when restored", () => {
    const { held } = harness(onePage());
    openPopup();
    fireEvent.click(screen.getByLabelText("Margins"));
    expect(styleOf(held.page)).toEqual({ margins: false });
    fireEvent.click(screen.getByLabelText("Margins"));
    expect(styleOf(held.page)).toBeUndefined();
  });

  it("offers every border option, in order, behind an inherit option", () => {
    harness(onePage());
    openPopup();
    const options = within(screen.getByLabelText("Border"))
      .getAllByRole("option")
      .map((el) => (el as HTMLOptionElement).value);
    expect(options).toEqual([
      "",
      "solid",
      "dashed",
      "dotted",
      "double",
      "none",
    ]);
  });

  // The assertion the scoping rests on. A write addressed by a captured index
  // rather than by the path the card is rendering at would be
  // indistinguishable from a correct one in a harness with only one block.
  it("writes a chosen skin to that section, and no other", () => {
    const held = threeHarness();

    fireEvent.click(
      screen.getAllByRole("button", { name: "Section style" })[1]!,
    );
    fireEvent.change(screen.getByLabelText("Style"), {
      target: { value: "glass" },
    });

    expect(styleOf(held.page, 0)).toBeUndefined();
    expect(styleOf(held.page, 1)).toEqual({ skin: "glass" });
    expect(styleOf(held.page, 2)).toBeUndefined();
  });

  it("writes a background address to that section, and no other", () => {
    const held = threeHarness();

    fireEvent.click(
      screen.getAllByRole("button", { name: "Section style" })[2]!,
    );
    fireEvent.change(screen.getByLabelText("Background picture"), {
      target: { value: "https://example.test/bg.png" },
    });

    expect(styleOf(held.page, 0)).toBeUndefined();
    expect(styleOf(held.page, 1)).toBeUndefined();
    expect(styleOf(held.page, 2)).toEqual({
      background_url: "https://example.test/bg.png",
    });
  });

  it("writes a chosen border to that section, and no other", () => {
    const held = threeHarness();

    fireEvent.click(
      screen.getAllByRole("button", { name: "Section style" })[1]!,
    );
    fireEvent.change(screen.getByLabelText("Border"), {
      target: { value: "dashed" },
    });

    expect(styleOf(held.page, 0)).toBeUndefined();
    expect(styleOf(held.page, 1)).toEqual({ border: "dashed" });
    expect(styleOf(held.page, 2)).toBeUndefined();
  });

  // The rule most likely to be got wrong, named explicitly: clearing a field
  // must remove the key, never store "".
  it("removes the skin key when cleared, rather than storing an empty string", () => {
    const { held } = harness(onePage());
    openPopup();

    fireEvent.change(screen.getByLabelText("Style"), {
      target: { value: "glass" },
    });
    expect(styleOf(held.page)).toEqual({ skin: "glass" });

    fireEvent.change(screen.getByLabelText("Style"), {
      target: { value: "" },
    });
    // Not merely falsy — genuinely ABSENT. A stored `{ skin: "" }` would still
    // be a third state the style bag does not recognise.
    expect(styleOf(held.page)).toBeUndefined();
  });

  it("removes the background key when cleared, rather than storing an empty string", () => {
    const { held } = harness(onePage());
    openPopup();

    fireEvent.change(screen.getByLabelText("Background picture"), {
      target: { value: "https://example.test/bg.png" },
    });
    fireEvent.change(screen.getByLabelText("Background picture"), {
      target: { value: "" },
    });

    expect(styleOf(held.page)).toBeUndefined();
  });

  it("removes the border key when cleared, rather than storing an empty string", () => {
    const { held } = harness(onePage());
    openPopup();

    fireEvent.change(screen.getByLabelText("Border"), {
      target: { value: "dotted" },
    });
    expect(styleOf(held.page)).toEqual({ border: "dotted" });

    fireEvent.change(screen.getByLabelText("Border"), {
      target: { value: "" },
    });
    expect(styleOf(held.page)).toBeUndefined();
  });

  // `"none"` is a CHOICE, not the clearing state — see the style bag's own doc
  // for `border`. Selecting it must store the literal string, never be treated
  // as equivalent to the empty "inherit" option.
  it('stores an explicit "none" as a real value, distinct from clearing', () => {
    const { held } = harness(onePage());
    openPopup();

    fireEvent.change(screen.getByLabelText("Border"), {
      target: { value: "none" },
    });
    expect(styleOf(held.page)).toEqual({ border: "none" });
  });

  it("clears only the cleared field, leaving a sibling field of the same block intact", () => {
    const { held } = harness(onePage());
    openPopup();

    fireEvent.change(screen.getByLabelText("Style"), {
      target: { value: "glass" },
    });
    fireEvent.change(screen.getByLabelText("Background picture"), {
      target: { value: "https://example.test/bg.png" },
    });
    fireEvent.change(screen.getByLabelText("Background picture"), {
      target: { value: "" },
    });

    expect(styleOf(held.page)).toEqual({ skin: "glass" });
  });

  it("writes cover and tile, and clears the fit back to neither", () => {
    const { held } = harness(onePage());
    openPopup();
    fireEvent.change(screen.getByLabelText("Background picture"), {
      target: { value: "https://example.test/bg.png" },
    });

    fireEvent.change(screen.getByLabelText("Fit"), {
      target: { value: "tile" },
    });
    expect(styleOf(held.page)).toMatchObject({ background_fit: "tile" });

    fireEvent.change(screen.getByLabelText("Fit"), {
      target: { value: "cover" },
    });
    expect(styleOf(held.page)).toMatchObject({ background_fit: "cover" });

    fireEvent.change(screen.getByLabelText("Fit"), {
      target: { value: "" },
    });
    // The address itself is a different field and must survive.
    expect(styleOf(held.page)).toEqual({
      background_url: "https://example.test/bg.png",
    });
  });

  // The point of the popup: the card behind it previews the choice live,
  // through the SAME `blockStyle` the public page renders with — asserted on
  // the preview element's own custom properties, not merely that the popup
  // opened.
  it("previews the chosen skin on the card behind it while the popup is open", () => {
    harness(onePage());
    const card = screen.getByTestId("section-card");
    expect(card.hasAttribute("style")).toBe(false);

    openPopup();
    fireEvent.change(screen.getByLabelText("Style"), {
      target: { value: "neobrutalism" },
    });

    // Values pinned against `skins.ts`'s own table for `neobrutalism` — the
    // same ones `block-style.test.ts` asserts for the public renderer.
    const styled = within(screen.getByTestId("block-preview")).getByTestId(
      "public-section",
    );
    expect(styled.style.getPropertyValue("--skin-round")).toBe("0");
    expect(styled.style.getPropertyValue("--skin-border")).toBe("3px");
    expect(screen.getByTestId("section-style-panel")).toBeInTheDocument();
  });

  // **On the SECTION the renderer draws, which is where a visitor sees it.**
  // This used to be asserted on a face the preview tray painted — an element of
  // the editor's own, carrying the picture on the author's behalf so it could
  // sit under the card's corners. There is no face any more: the tray paints
  // nothing and renders the real section, so the picture is on the same element
  // and in the same property a stranger's browser resolves.
  //
  // That is the same claim the border case below makes, and deliberately so.
  // `tests/e2e/section-card-face.spec.ts` measures the pixels; this pins which
  // element carries the value.
  it("previews a background picture on the section the renderer draws", () => {
    harness(onePage());
    openPopup();
    fireEvent.change(screen.getByLabelText("Background picture"), {
      target: { value: "https://example.test/bg.png" },
    });
    expect(screen.getByTestId("public-section").style.backgroundImage).toBe(
      'url("https://example.test/bg.png")',
    );
    // The editor's own card is not in the business of painting the page.
    expect(screen.getByTestId("section-card").style.backgroundImage).toBe("");
  });

  it("previews the chosen border on the card behind the popup", () => {
    harness(onePage());
    openPopup();
    fireEvent.change(screen.getByLabelText("Border"), {
      target: { value: "dashed" },
    });
    expect(
      screen
        .getByTestId("public-section")
        .style.getPropertyValue("--skin-border-style"),
    ).toBe("dashed");
  });

  // `"none"` previews exactly like any other member of the enum — it is a
  // real, emitted value, not a state `blockStyle` special-cases away.
  it('previews an explicit "none" border the same way as any other choice', () => {
    harness(onePage());
    openPopup();
    fireEvent.change(screen.getByLabelText("Border"), {
      target: { value: "none" },
    });
    expect(
      screen
        .getByTestId("public-section")
        .style.getPropertyValue("--skin-border-style"),
    ).toBe("none");
  });

  // An overlay, unlike `IconPicker`'s inline panel — what follows is what an
  // overlay owes and an inline one does not.
  describe("as an overlay", () => {
    it("moves focus into the panel on open", () => {
      harness(onePage());
      openPopup();
      expect(screen.getByLabelText("Style")).toHaveFocus();
    });

    it("closes on Escape and returns focus to the trigger", () => {
      harness(onePage());
      openPopup();
      expect(screen.getByTestId("section-style-panel")).toBeInTheDocument();

      fireEvent.keyDown(document, { key: "Escape" });

      expect(screen.queryByTestId("section-style-panel")).toBeNull();
      expect(
        screen.getByRole("button", { name: "Section style" }),
      ).toHaveFocus();
    });

    it("closes on a click outside it and returns focus to the trigger", () => {
      harness(onePage());
      openPopup();
      expect(screen.getByTestId("section-style-panel")).toBeInTheDocument();

      fireEvent.mouseDown(document.body);

      expect(screen.queryByTestId("section-style-panel")).toBeNull();
      expect(
        screen.getByRole("button", { name: "Section style" }),
      ).toHaveFocus();
    });

    // **The corner picker: four boxes laid out AS the square they set.**
    // These pin the two rules that could go silently wrong — an all-four state
    // must clear the key rather than store the longest possible list, and the
    // last tick must not be removable, because an empty list is not a value
    // the schema has a spelling for.
    it("stores nothing while every corner is still rounded", () => {
      const { held } = harness(onePage());
      openPopup();

      // Every box starts ticked, because absence means all four.
      for (const corner of ["tl", "tr", "br", "bl"]) {
        expect(
          screen.getByTestId(`section-style-corner-${corner}`),
        ).toBeChecked();
      }
      expect(styleOf(held.page)?.corners).toBeUndefined();
    });

    it("writes the corners that remain when one is unticked", () => {
      const { held } = harness(onePage());
      openPopup();

      fireEvent.click(screen.getByTestId("section-style-corner-bl"));

      // Written in CSS's own order rather than the order they were clicked,
      // so two authors who untick the same corner store the same string.
      expect(styleOf(held.page)?.corners).toBe("tl,tr,br");
    });

    it("clears the key again when the last corner is put back", () => {
      const { held } = harness(onePage());
      openPopup();

      fireEvent.click(screen.getByTestId("section-style-corner-bl"));
      fireEvent.click(screen.getByTestId("section-style-corner-bl"));

      // Not "tl,tr,br,bl" — an all-four list is the default said the long way,
      // and storing it would leave a page carrying a key that changes nothing.
      expect(styleOf(held.page)?.corners).toBeUndefined();
    });

    it("refuses to untick the last remaining corner", () => {
      const { held } = harness(onePage());
      openPopup();

      for (const corner of ["tr", "br", "bl"]) {
        fireEvent.click(screen.getByTestId(`section-style-corner-${corner}`));
      }
      expect(styleOf(held.page)?.corners).toBe("tl");

      // Both halves: the control says it is unavailable, AND the handler
      // refuses the write. jsdom dispatches a click to a disabled input where
      // a browser would not, which is what makes the second half reachable
      // here — and what makes it worth having, since the invariant is about
      // the value rather than about one control's attribute.
      const last = screen.getByTestId("section-style-corner-tl");
      expect(last).toBeDisabled();
      fireEvent.click(last);
      expect(styleOf(held.page)?.corners).toBe("tl");
    });

    it("does not close on a click inside the panel itself", () => {
      harness(onePage());
      openPopup();

      fireEvent.mouseDown(screen.getByTestId("section-style-panel"));

      expect(screen.getByTestId("section-style-panel")).toBeInTheDocument();
    });
  });
});

/**
 * The "Own title" ("label") select gates on `honoursLabel`, a prop the
 * caller computes from `block-contract.ts`'s function of the same name — see
 * that file for why: no container and only five leaf kinds ever read
 * `style.label`, so offering the control anywhere else is a choice that
 * changes nothing.
 *
 * Every `BlockCard` in this file's own harness renders a CONTAINER, so
 * `honoursLabel` is always `false` there — the "absent" half is exercised
 * through the real caller. The "present" half has no real caller yet (no
 * leaf currently gets a style popup of its own), so it is exercised by
 * rendering {@link SectionStylePopup} directly with the prop each half
 * would compute. A negative case with no positive control beside it proves
 * nothing — see this repository's own rule on the point.
 */
describe("SectionStylePopup — the Own title control's gate", () => {
  it("offers no Own title control through the real container path", () => {
    harness(onePage());
    openPopup();
    expect(screen.queryByTestId("section-style-label")).toBeNull();
  });

  it("is absent when the block does not honour style.label", () => {
    render(
      <SectionStylePopup
        value={undefined}
        onChange={() => {}}
        labels={labels.style}
        atTop
        named={false}
        honoursLabel={false}
      />,
    );
    openPopup();
    expect(screen.queryByTestId("section-style-label")).toBeNull();
  });

  it("is present when the block does honour style.label", () => {
    render(
      <SectionStylePopup
        value={undefined}
        onChange={() => {}}
        labels={labels.style}
        atTop
        named={false}
        honoursLabel
      />,
    );
    openPopup();
    expect(screen.getByTestId("section-style-label")).toBeInTheDocument();
  });
});

// `blockStyle` itself — the function the preview above calls — carries its
// own suite in `block-style.test.ts`. It is imported rather than
// reimplemented (see `block-style.ts`'s own TSDoc on the export), so there is
// exactly one place its branches are pinned, not two that could quietly drift
// apart.
