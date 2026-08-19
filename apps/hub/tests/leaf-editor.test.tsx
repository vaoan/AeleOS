import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import {
  BLOCK_LIMITS,
  LEAF_KINDS,
  isContainer,
  type Block,
  type LeafBlock,
} from "@/features/actors/domain/block-schema";
import { newContainer, newLeaf } from "@/features/actors/domain/block-edits";
import type { BlockProblem } from "@/features/actors/domain/block-problems";
import { leafFields } from "@/features/actors/domain/leaf-fields";
import { blockEditorLabels } from "./support/editor-labels";

// PRESENTATION IS COVERAGE-EXCLUDED, so a named test is the only thing that
// catches a gap. What this file is for is the rule Task 7 exists to keep: a
// control that accepts what somebody types, stores it, refuses nothing and
// renders nothing is the worst kind there is, because there is no way for them
// to learn it did nothing. Which fields each kind DRAWS is measured against
// the real renderer in `leaf-fields.test.tsx`; what is measured here is that
// the editor offers exactly those.

vi.mock("lucide-react/dynamic", () => ({
  DynamicIcon: ({ name }: { name: string }) => <svg data-icon={name} />,
  iconNames: ["paw-print", "sparkles"],
}));

const { LeafEditor } =
  await import("@/features/actors/presentation/leaf-editor");

const labels = blockEditorLabels();

/**
 * One leaf editor over a page a test can read back.
 *
 * The leaf sits in a section's first place, exactly where the editor puts one,
 * so a removal has a place to leave behind.
 *
 * @param leaf - what the place holds.
 * @param lang - which language is being written.
 * @returns a way to read the page after each edit.
 */
function harness(
  leaf: LeafBlock,
  lang: "en" | "es" = "en",
  problems: BlockProblem[] = [],
) {
  const held: { page: Block[] } = {
    page: [{ ...newContainer("grid", 2), children: [leaf, null] }],
  };
  /**
   * Applies an edit and re-renders.
   *
   * @param edit - what to make of the page.
   */
  const apply = (edit: (blocks: Block[]) => Block[]): void => {
    held.page = edit(held.page);
    view.rerender(editor());
  };
  /**
   * The editor over whatever sits in the place now.
   *
   * @returns the element, or nothing once the place is empty.
   */
  const editor = () => {
    const [section] = held.page;
    const child =
      section && isContainer(section) ? section.children[0] : undefined;
    if (!child || isContainer(child)) return null;
    return (
      <LeafEditor
        leaf={child}
        path={[0, 0]}
        apply={apply}
        lang={lang}
        labels={labels}
        problems={problems}
        dragHandle={null}
      />
    );
  };
  const view = render(editor());
  return () => held.page;
}

/** What sits in the first place of a page a harness is holding. */
const held = (page: Block[]): LeafBlock | null => {
  const [section] = page;
  if (!section || !isContainer(section)) throw new Error("not a container");
  const child = section.children[0];
  return child && !isContainer(child) ? child : null;
};

describe("LeafEditor", () => {
  describe("choosing what a piece of content is", () => {
    it("offers every kind the renderer draws, and no other", () => {
      harness(newLeaf("text"));
      const options = within(screen.getByTestId("leaf-kind"))
        .getAllByRole("option")
        .map((el) => (el as HTMLOptionElement).value);
      expect(options).toEqual([...LEAF_KINDS]);
    });

    it("changes the kind", () => {
      const page = harness(newLeaf("text"));
      fireEvent.change(screen.getByTestId("leaf-kind"), {
        target: { value: "quote" },
      });
      expect(held(page())?.kind).toBe("quote");
    });

    // SWITCHING A KIND TO LOOK AT IT AND SWITCHING BACK FINDS WHAT WAS TYPED
    // STILL THERE. Every field is accepted whatever the kind is, so the editor
    // hides the fields a kind does not render and never clears them.
    it("keeps everything the leaf was carrying across a change of kind", () => {
      const page = harness({
        ...newLeaf("link"),
        title_en: "Kept",
        description_en: "Also kept",
        link_url: "https://a.test",
        icon: "paw-print",
        image_url: "https://a.test/p.png",
      });
      const before = structuredClone(held(page()));

      fireEvent.change(screen.getByTestId("leaf-kind"), {
        target: { value: "stat" },
      });
      // `stat` renders no address and no icon, so neither control is offered.
      expect(screen.queryByTestId("leaf-link")).toBeNull();

      fireEvent.change(screen.getByTestId("leaf-kind"), {
        target: { value: "link" },
      });
      expect(held(page())).toEqual(before);
    });

    // A kind this build has never heard of is reachable: the lenient read
    // admits a name a newer deployment wrote, and its author must be able to
    // open their page, read what is on it and save the rest without that block
    // being silently retyped.
    it("shows a kind it does not know, rather than rendering blank", () => {
      harness({ ...newLeaf("text"), kind: "diagram" } as LeafBlock);
      const select = screen.getByTestId("leaf-kind") as HTMLSelectElement;
      expect(select.value).toBe("diagram");
      expect(
        within(select).getByRole("option", { name: "diagram" }),
      ).toBeDisabled();
    });

    it("labels an unknown kind's fields as a plain card's", () => {
      harness({ ...newLeaf("text"), kind: "diagram" } as LeafBlock);
      expect(screen.getByTestId("leaf-title")).toHaveAccessibleName(
        labels.leafTitle.text!,
      );
      expect(screen.getByTestId("leaf-description")).toBeInTheDocument();
    });
  });

  describe("offering only the fields a kind renders", () => {
    // ONE CASE PER KIND, DRIVEN FROM THE VOCABULARY, so a kind added later is
    // covered the moment it is added. The table itself is measured against the
    // renderer in `leaf-fields.test.tsx`; this is the other half — that the
    // editor agrees with it.
    it.each(LEAF_KINDS)("offers exactly what a %s draws", (kind) => {
      harness(newLeaf(kind));
      const fields = leafFields(kind);
      expect(Boolean(screen.queryByTestId("leaf-link"))).toBe(fields.link);
      expect(Boolean(screen.queryByTestId("leaf-image"))).toBe(fields.picture);
      expect(Boolean(screen.queryByTestId("leaf-rows"))).toBe(fields.rows);
      expect(Boolean(screen.queryByTestId("leaf-description"))).toBe(
        fields.description,
      );
      // The icon is a picker rather than an input, and it names itself.
      expect(
        Boolean(screen.queryByRole("button", { name: labels.chooseIcon })),
      ).toBe(fields.icon);
    });

    // EVERY KIND NAMES ITS OWN TITLE FIELD, because the pair genuinely means
    // something different per kind — a `picture`'s title is its ALT TEXT and a
    // `quote`'s is who said it. A field whose meaning changes silently between
    // kinds is worse than a differently named one.
    it.each(LEAF_KINDS)("names a %s leaf's own title field", (kind) => {
      harness(newLeaf(kind));
      expect(screen.getByTestId("leaf-title")).toHaveAccessibleName(
        labels.leafTitle[kind]!,
      );
    });

    it.each(LEAF_KINDS.filter((kind) => leafFields(kind).description))(
      "names a %s leaf's own description field and prompt",
      (kind) => {
        harness(newLeaf(kind));
        const field = screen.getByTestId("leaf-description");
        expect(field).toHaveAccessibleName(labels.leafDescription[kind]!);
        expect(field).toHaveAttribute("placeholder", labels.leafHint[kind]!);
      },
    );

    // WHICH HINT THE ADDRESS FIELD SHOWS IS THE OTHER HALF OF THE SAME RULE.
    // `player` and `post` frame what they recognise; `link` and `social` draw
    // a button or a chip whatever host was pasted, so a hint promising a
    // player would be a promise they cannot keep.
    it.each(LEAF_KINDS.filter((kind) => leafFields(kind).link))(
      "tells a %s leaf what its address will actually become",
      (kind) => {
        harness(newLeaf(kind));
        expect(screen.getByTestId("leaf-link")).toHaveAccessibleDescription(
          leafFields(kind).embeds
            ? labels.linkUrlHint
            : labels.linkUrlPlainHint,
        );
      },
    );
  });

  describe("writing", () => {
    it("writes the title in the language being written", () => {
      const page = harness(newLeaf("text"));
      fireEvent.change(screen.getByTestId("leaf-title"), {
        target: { value: "Species" },
      });
      expect(held(page())?.title_en).toBe("Species");
    });

    // AN UNWRITTEN SPANISH FIELD IS AN ORDINARY STATE. No warning, no badge,
    // nothing marking it as missing — and it is written as ABSENT rather than
    // as `""`, so a page reads back exactly as it was written.
    it("writes and then clears the Spanish half without storing an empty one", () => {
      const page = harness({ ...newLeaf("text"), title_en: "Species" }, "es");
      const field = screen.getByTestId("leaf-title");
      expect((field as HTMLInputElement).value).toBe("");

      fireEvent.change(field, { target: { value: "Especie" } });
      expect(held(page())?.title_es).toBe("Especie");

      fireEvent.change(screen.getByTestId("leaf-title"), {
        target: { value: "" },
      });
      expect(held(page())?.title_es).toBeUndefined();
      // The English half is untouched by any of it.
      expect(held(page())?.title_en).toBe("Species");
    });

    it("writes an address and a picture", () => {
      const page = harness(newLeaf("picture"));
      fireEvent.change(screen.getByTestId("leaf-image"), {
        target: { value: "https://a.test/p.png" },
      });
      expect(held(page())?.image_url).toBe("https://a.test/p.png");
    });

    // The preview follows what is being typed, so somebody pasting an address
    // is not entering it into a box that never shows them anything. Its `alt`
    // is the leaf's own title, which for a `picture` IS the alt text.
    it("shows a placeholder until a picture's address is written", () => {
      harness({ ...newLeaf("picture"), title_en: "A wolf" });
      expect(screen.getByTestId("leaf-image-missing")).toBeInTheDocument();
      fireEvent.change(screen.getByTestId("leaf-image"), {
        target: { value: "https://a.test/p.png" },
      });
      expect(screen.queryByTestId("leaf-image-missing")).toBeNull();
      expect(screen.getByAltText("A wolf")).toHaveAttribute(
        "src",
        "https://a.test/p.png",
      );
    });

    it("writes the address a link points at", () => {
      const page = harness(newLeaf("link"));
      fireEvent.change(screen.getByTestId("leaf-link"), {
        target: { value: "https://a.test" },
      });
      expect(held(page())?.link_url).toBe("https://a.test");
    });

    it("writes a chosen icon", () => {
      const page = harness(newLeaf("link"));
      fireEvent.click(screen.getByRole("button", { name: labels.chooseIcon }));
      fireEvent.click(screen.getByRole("button", { name: "paw-print" }));
      expect(held(page())?.icon).toBe("paw-print");
    });

    // REMOVE WHAT IS IN A PLACE, LEAVING THE PLACE. The shape an author chose
    // is theirs; a section that closed up round a deletion would change under
    // them as they worked.
    it("empties the place it sits in, and leaves the place", () => {
      const page = harness(newLeaf("text"));
      fireEvent.click(screen.getByTestId("remove-block"));
      const [section] = page();
      expect(section && isContainer(section) && section.children).toEqual([
        null,
        null,
      ]);
    });
  });

  describe("what the save refused", () => {
    // The commonest refusal there is, and the one somebody meets on their
    // first attempt: a new piece of content starts untitled and the write
    // schema requires a heading.
    it("marks the title and says what to do", () => {
      harness(newLeaf("text"), "en", [{ path: [0, 0], field: "title_en" }]);
      expect(screen.getByTestId("leaf-title")).toHaveAttribute(
        "aria-invalid",
        "true",
      );
      expect(screen.getByTestId("leaf-title")).toHaveAccessibleDescription(
        labels.problemTitle,
      );
    });

    // **The mark follows the ENGLISH half whichever half is on screen**, and
    // says so, because `title_en` is what the schema requires. Somebody
    // writing Spanish would otherwise be marked on a field that is allowed to
    // be empty, with no way to learn which one is not.
    it("marks the title while the Spanish half is being written", () => {
      harness(newLeaf("text"), "es", [{ path: [0, 0], field: "title_en" }]);
      expect(screen.getByTestId("leaf-title")).toHaveAttribute(
        "aria-invalid",
        "true",
      );
    });

    // A refusal on a field this component does not draw would otherwise leave
    // the block unmarked while the banner promised a marking — the fault the
    // whole thread exists to end, coming back one field at a time.
    it("says so when the refusal is on a field it does not draw", () => {
      harness(newLeaf("text"), "en", [{ path: [0, 0], field: "rows" }]);
      expect(screen.getByTestId("leaf-problem")).toHaveTextContent(
        labels.problemGeneric,
      );
      expect(screen.getByTestId("leaf-title")).toHaveAttribute(
        "aria-invalid",
        "false",
      );
    });

    it("marks nothing when nothing was refused", () => {
      harness(newLeaf("text"));
      expect(screen.queryByTestId("leaf-title-problem")).toBeNull();
      expect(screen.queryByTestId("leaf-problem")).toBeNull();
    });

    // A refusal on a DIFFERENT block must not mark this one, which is the
    // control that stops every case above passing on a component that marks
    // unconditionally.
    it("marks nothing when the refusal belongs to another block", () => {
      harness(newLeaf("text"), "en", [{ path: [0, 1], field: "title_en" }]);
      expect(screen.queryByTestId("leaf-title-problem")).toBeNull();
    });
  });

  describe("a table's rows", () => {
    it("adds a row as a pair, from none at all", () => {
      const page = harness(newLeaf("table"));
      fireEvent.click(screen.getByTestId("add-row"));
      expect(held(page())?.rows).toEqual([[{ text_en: "" }, { text_en: "" }]]);
      expect(screen.getAllByTestId("table-cell")).toHaveLength(2);
    });

    it("writes a cell", () => {
      const page = harness({
        ...newLeaf("table"),
        rows: [[{ text_en: "" }, { text_en: "" }]],
      });
      fireEvent.change(screen.getAllByTestId("table-cell")[1]!, {
        target: { value: "A wolf" },
      });
      expect(held(page())?.rows?.[0]?.[1]?.text_en).toBe("A wolf");
    });

    // **A NUMERAL PER CELL**, exactly as `Seat.ordinal` does it in the
    // renderer and for the same reason: eight inputs all called "Cell" is
    // eight controls a screen reader cannot tell apart, and axe cannot flag it
    // because each of them HAS a name. A position needs no catalogue entry and
    // reads the same in both languages.
    it("names each cell and each control by its position", () => {
      harness({
        ...newLeaf("table"),
        rows: [[{ text_en: "a" }, { text_en: "b" }], [{ text_en: "c" }]],
      });
      const names = screen
        .getAllByTestId("table-cell")
        .map((input) => input.getAttribute("aria-label"));
      expect(new Set(names).size).toBe(names.length);
      expect(names).toEqual([
        `${labels.cellText} 1.1`,
        `${labels.cellText} 1.2`,
        `${labels.cellText} 2.1`,
      ]);
      expect(
        screen
          .getAllByTestId("remove-row")
          .map((button) => button.getAttribute("aria-label")),
      ).toEqual([`${labels.removeRow} 1`, `${labels.removeRow} 2`]);
    });

    it("adds and removes a cell", () => {
      const page = harness({
        ...newLeaf("table"),
        rows: [[{ text_en: "a" }, { text_en: "b" }]],
      });
      fireEvent.click(screen.getByTestId("add-cell"));
      expect(held(page())?.rows?.[0]).toHaveLength(3);
      fireEvent.click(screen.getAllByTestId("remove-cell")[0]!);
      expect(held(page())?.rows?.[0]).toEqual([
        { text_en: "b" },
        { text_en: "" },
      ]);
    });

    it("removes a row", () => {
      const page = harness({
        ...newLeaf("table"),
        rows: [[{ text_en: "a" }], [{ text_en: "b" }]],
      });
      fireEvent.click(screen.getAllByTestId("remove-row")[0]!);
      expect(held(page())?.rows).toEqual([[{ text_en: "b" }]]);
    });

    // A control that silently does nothing at a cap reads as broken, so it is
    // withdrawn rather than left to refuse — the same rule the add-section
    // control follows at the block cap.
    it("withdraws the add controls at their caps", () => {
      harness({
        ...newLeaf("table"),
        rows: [
          Array.from({ length: BLOCK_LIMITS.cells }, () => ({ text_en: "x" })),
        ],
      });
      expect(screen.queryByTestId("add-cell")).toBeNull();
      expect(screen.getByTestId("add-row")).toBeInTheDocument();
    });
  });
});
