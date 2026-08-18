import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useForm, type UseFormReturn } from "react-hook-form";
import type {
  FieldValues,
  UseFormRegister,
  UseFormSetValue,
  Control,
} from "react-hook-form";
import { SKINS, type SkinId } from "@/shared/domain/skins";
import {
  SECTION_TYPES,
  type SectionType,
} from "@/features/actors/domain/section-schema";

// The card reaches for the browser Supabase client, which is Clerk-backed.
// These suites are about the style popup, not about a session.
vi.mock("@/shared/infrastructure/supabase-browser", () => ({
  useSupabaseBrowserClient: () => ({}),
}));

vi.mock("lucide-react/dynamic", () => ({
  DynamicIcon: ({ name }: { name: string }) => <svg data-icon={name} />,
  iconNames: ["sparkles"],
}));

const { SectionCard } =
  await import("@/features/actors/presentation/section-card");

/** One label per skin, the id standing in for the translated name. */
const skinLabels = Object.fromEntries(
  SKINS.map((skin) => [skin, skin]),
) as Record<SkinId, string>;

/** {@link SectionCardLabels}, filled in with `SectionStylePopupLabels`. */
const labels = {
  sectionName: "Section name",
  sectionType: "Layout",
  addItem: "Add item",
  removeItem: "Remove item",
  removeSection: "Remove section",
  collapse: "Collapse section",
  expand: "Expand section",
  dragSection: "Drag to reorder section",
  itemTitle: "Title",
  itemDescription: "Description",
  itemLabel: "Label",
  itemValue: "Value",
  itemValueHint: "A number, a percentage, or one out of another",
  itemDescriptionHint: "What do you want to say here?",
  imageUrl: "Image address",
  imageUrlHint: "Paste a link to a picture.",
  linkUrl: "Link address",
  linkUrlHint: "A video or music link plays here.",
  linkUrlPlainHint: "This becomes a button or a chip.",
  imageMissing: "No image yet",
  chooseIcon: "Choose an icon",
  searchIcons: "Search icons",
  noIconsFound: "No icons match that.",
  clearIcon: "Remove the icon",
  noIcon: "No icon",
  types: Object.fromEntries(
    SECTION_TYPES.map((type) => [type, type]),
  ) as Record<SectionType, string>,
  style: {
    open: "Section style",
    title: "This section's own style",
    skin: "Style",
    skins: skinLabels,
    inheritSkin: "Inherit the page",
    backgroundUrl: "Background picture",
    backgroundUrlHint: "Paste an address. Nothing is stored.",
    fit: "Fit",
    fitDefault: "Original size",
    fitCover: "Cover",
    fitTile: "Tile",
    cardSize: "Card size",
    cardSizeHint: "Smaller fits more per row.",
    cardSizeDefault: "Default",
    cardSizeS: "Compact",
    cardSizeM: "Medium",
    cardSizeL: "Spacious",
    border: "Border",
    borderHint: "The edge around this section's own cards and panels.",
    borderInherit: "Inherit the page",
    borderNone: "No border",
    borderSolid: "Solid line",
    borderDashed: "Dashed line",
    borderDotted: "Dotted line",
    borderDouble: "Double line",
  },
};

/**
 * A bare section, with no items and no `style`.
 *
 * @param name - the section's English name.
 * @param type - its layout; defaults to `"cards"`, the one layout the
 *   card-size field is offered on.
 */
const bareSection = (name: string, type: string = "cards") => ({
  name_en: name,
  name_es: "",
  type,
  sort_order: 1,
  items: [] as unknown[],
  style: undefined as
    | {
        skin?: string;
        background_url?: string;
        background_fit?: "cover" | "tile";
        card_size?: "s" | "m" | "l";
        border?: "solid" | "dashed" | "dotted" | "double" | "none";
      }
    | undefined,
});

/** What the harnesses' form holds. */
type FormValues = { sections: ReturnType<typeof bareSection>[] };

/**
 * One card in a real form, for the tests that only need one section.
 *
 * @returns the form, so a test can read back what was written.
 */
function OneSectionHarness({
  capture,
  type,
}: {
  capture: (form: UseFormReturn<FormValues>) => void;
  /** The lone section's layout; defaults to `"cards"` via `bareSection`. */
  type?: string;
}) {
  const form = useForm<FormValues>({
    defaultValues: { sections: [bareSection("Only", type)] },
  });
  capture(form);
  return (
    <SectionCard
      control={form.control as unknown as Control<FieldValues>}
      register={form.register as unknown as UseFormRegister<FieldValues>}
      setValue={form.setValue as unknown as UseFormSetValue<FieldValues>}
      path="sections.0"
      index={0}
      lang="en"
      labels={labels}
      dragHandleProps={null}
      onRemove={() => {}}
    />
  );
}

/**
 * Three cards sharing one form — the shape the "writes to THAT section and
 * no other" tests need. A single-section harness cannot tell a correctly
 * scoped write from one that happened to land on the only row there was.
 *
 * @returns the form, so a test can read every section back.
 */
function ThreeSectionHarness({
  capture,
}: {
  capture: (form: UseFormReturn<FormValues>) => void;
}) {
  const form = useForm<FormValues>({
    defaultValues: {
      sections: [
        bareSection("First"),
        bareSection("Second"),
        bareSection("Third"),
      ],
    },
  });
  capture(form);
  return (
    <>
      {[0, 1, 2].map((index) => (
        <SectionCard
          key={index}
          control={form.control as unknown as Control<FieldValues>}
          register={form.register as unknown as UseFormRegister<FieldValues>}
          setValue={form.setValue as unknown as UseFormSetValue<FieldValues>}
          path={`sections.${index}`}
          index={index}
          lang="en"
          labels={labels}
          dragHandleProps={null}
          onRemove={() => {}}
        />
      ))}
    </>
  );
}

/** Opens the (only, in a one-section harness) style popup. */
function openPopup() {
  fireEvent.click(screen.getByRole("button", { name: "Section style" }));
}

describe("SectionStylePopup", () => {
  it("is closed until the paintbrush is pressed", () => {
    render(<OneSectionHarness capture={() => {}} />);
    expect(screen.queryByLabelText("Style")).toBeNull();
  });

  it("shows the skin list and the background fields once opened", () => {
    render(<OneSectionHarness capture={() => {}} />);
    openPopup();
    expect(screen.getByLabelText("Style")).toBeInTheDocument();
    expect(screen.getByLabelText("Background picture")).toBeInTheDocument();
  });

  it("offers every skin, in order, behind an inherit option", () => {
    render(<OneSectionHarness capture={() => {}} />);
    openPopup();
    const options = within(screen.getByLabelText("Style"))
      .getAllByRole("option")
      .map((el) => (el as HTMLOptionElement).value);
    expect(options).toEqual(["", ...SKINS]);
  });

  it("hides the fit field until a background address is set", () => {
    render(<OneSectionHarness capture={() => {}} />);
    openPopup();
    expect(screen.queryByLabelText("Fit")).toBeNull();
    fireEvent.change(screen.getByLabelText("Background picture"), {
      target: { value: "https://example.test/bg.png" },
    });
    expect(screen.getByLabelText("Fit")).toBeInTheDocument();
  });

  // Unlike skin and background — which paint every layout — card_size is
  // read by Cards alone. Offering the field on a layout that never reads it
  // would be exactly the "control that does nothing" fault
  // section-item-fields.tsx already names for LINKED/ICONED/PICTURED.
  it("shows the card size field on a cards section", () => {
    render(<OneSectionHarness capture={() => {}} type="cards" />);
    openPopup();
    expect(screen.getByLabelText("Card size")).toBeInTheDocument();
  });

  it("hides the card size field on a non-cards section", () => {
    render(<OneSectionHarness capture={() => {}} type="gallery" />);
    openPopup();
    expect(screen.queryByLabelText("Card size")).toBeNull();
  });

  // The gate hides the FIELD, never the stored value: switching a section's
  // own layout away from cards and back must find style.card_size exactly
  // as it was, the same "value survives, control disappears" shape
  // LINKED/ICONED/PICTURED already use for item fields.
  it("keeps a stored card size when the layout switches away and back", () => {
    let form: UseFormReturn<FormValues> | undefined;
    render(<OneSectionHarness capture={(f) => (form = f)} type="cards" />);
    openPopup();

    fireEvent.change(screen.getByLabelText("Card size"), {
      target: { value: "l" },
    });
    expect(form!.getValues().sections[0]).toMatchObject({
      style: { card_size: "l" },
    });

    fireEvent.change(screen.getByLabelText("Layout"), {
      target: { value: "gallery" },
    });
    expect(screen.queryByLabelText("Card size")).toBeNull();
    expect(form!.getValues().sections[0]).toMatchObject({
      style: { card_size: "l" },
    });

    fireEvent.change(screen.getByLabelText("Layout"), {
      target: { value: "cards" },
    });
    expect(screen.getByLabelText("Card size")).toBeInTheDocument();
    expect(form!.getValues().sections[0]).toMatchObject({
      style: { card_size: "l" },
    });
  });

  it("offers every card size, in order, behind a default option", () => {
    render(<OneSectionHarness capture={() => {}} />);
    openPopup();
    const options = within(screen.getByLabelText("Card size"))
      .getAllByRole("option")
      .map((el) => (el as HTMLOptionElement).value);
    expect(options).toEqual(["", "s", "m", "l"]);
  });

  // Unlike card_size, a border is not gated on a layout: every layout renders
  // at least one `surface` element, so the field is offered whatever this
  // section's own layout is — asserted on the one layout card_size hides
  // itself on, to make the contrast concrete rather than assumed.
  it("shows the border field on every layout, unlike card size", () => {
    render(<OneSectionHarness capture={() => {}} type="gallery" />);
    openPopup();
    expect(screen.getByLabelText("Border")).toBeInTheDocument();
    expect(screen.queryByLabelText("Card size")).toBeNull();
  });

  it("offers every border option, in order, behind an inherit option", () => {
    render(<OneSectionHarness capture={() => {}} />);
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

  // The assertion the whole task exists for. Sections live in a
  // `useFieldArray`, and a write scoped to a captured INDEX rather than to
  // this section's own `path` would be indistinguishable from a correct one
  // in a harness with only one row.
  it("writes a chosen skin to that section, and no other", () => {
    let form: UseFormReturn<FormValues> | undefined;
    render(<ThreeSectionHarness capture={(f) => (form = f)} />);

    fireEvent.click(
      screen.getAllByRole("button", { name: "Section style" })[1]!,
    );
    fireEvent.change(screen.getByLabelText("Style"), {
      target: { value: "glass" },
    });

    const sections = form!.getValues().sections as {
      style?: { skin?: string };
    }[];
    expect(sections[0]?.style).toBeUndefined();
    expect(sections[1]?.style).toEqual({ skin: "glass" });
    expect(sections[2]?.style).toBeUndefined();
  });

  it("writes a background address to that section, and no other", () => {
    let form: UseFormReturn<FormValues> | undefined;
    render(<ThreeSectionHarness capture={(f) => (form = f)} />);

    fireEvent.click(
      screen.getAllByRole("button", { name: "Section style" })[2]!,
    );
    fireEvent.change(screen.getByLabelText("Background picture"), {
      target: { value: "https://example.test/bg.png" },
    });

    const sections = form!.getValues().sections as {
      style?: { background_url?: string };
    }[];
    expect(sections[0]?.style).toBeUndefined();
    expect(sections[1]?.style).toBeUndefined();
    expect(sections[2]?.style).toEqual({
      background_url: "https://example.test/bg.png",
    });
  });

  // The same fault, for the newest field: a stale captured index would land
  // this write on the wrong row exactly as it would for skin or background.
  it("writes a chosen card size to that section, and no other", () => {
    let form: UseFormReturn<FormValues> | undefined;
    render(<ThreeSectionHarness capture={(f) => (form = f)} />);

    fireEvent.click(
      screen.getAllByRole("button", { name: "Section style" })[0]!,
    );
    fireEvent.change(screen.getByLabelText("Card size"), {
      target: { value: "l" },
    });

    const sections = form!.getValues().sections as {
      style?: { card_size?: string };
    }[];
    expect(sections[0]?.style).toEqual({ card_size: "l" });
    expect(sections[1]?.style).toBeUndefined();
    expect(sections[2]?.style).toBeUndefined();
  });

  // The same fault again, for the border field: a stale captured index would
  // land this write on the wrong row exactly as it would for the others.
  it("writes a chosen border to that section, and no other", () => {
    let form: UseFormReturn<FormValues> | undefined;
    render(<ThreeSectionHarness capture={(f) => (form = f)} />);

    fireEvent.click(
      screen.getAllByRole("button", { name: "Section style" })[1]!,
    );
    fireEvent.change(screen.getByLabelText("Border"), {
      target: { value: "dashed" },
    });

    const sections = form!.getValues().sections as {
      style?: { border?: string };
    }[];
    expect(sections[0]?.style).toBeUndefined();
    expect(sections[1]?.style).toEqual({ border: "dashed" });
    expect(sections[2]?.style).toBeUndefined();
  });

  // The rule most likely to be got wrong, named explicitly: clearing a field
  // must remove the key, never store "".
  it("removes the skin key when cleared, rather than storing an empty string", () => {
    let form: UseFormReturn<FormValues> | undefined;
    render(<OneSectionHarness capture={(f) => (form = f)} />);
    openPopup();

    fireEvent.change(screen.getByLabelText("Style"), {
      target: { value: "glass" },
    });
    expect(form!.getValues().sections[0]).toMatchObject({
      style: { skin: "glass" },
    });

    fireEvent.change(screen.getByLabelText("Style"), {
      target: { value: "" },
    });
    const cleared = form!.getValues().sections[0] as { style?: unknown };
    // Not merely falsy — genuinely ABSENT. A stored `{ skin: "" }` would
    // still be a third state `sectionStyleSchema` does not recognise.
    expect(cleared.style).toBeUndefined();
  });

  it("removes the background key when cleared, rather than storing an empty string", () => {
    let form: UseFormReturn<FormValues> | undefined;
    render(<OneSectionHarness capture={(f) => (form = f)} />);
    openPopup();

    fireEvent.change(screen.getByLabelText("Background picture"), {
      target: { value: "https://example.test/bg.png" },
    });
    fireEvent.change(screen.getByLabelText("Background picture"), {
      target: { value: "" },
    });

    const cleared = form!.getValues().sections[0] as { style?: unknown };
    expect(cleared.style).toBeUndefined();
  });

  // The rule most likely to be got wrong, named explicitly, for the newest
  // field too: clearing must remove the key, never store "".
  it("removes the card_size key when cleared, rather than storing an empty string", () => {
    let form: UseFormReturn<FormValues> | undefined;
    render(<OneSectionHarness capture={(f) => (form = f)} />);
    openPopup();

    fireEvent.change(screen.getByLabelText("Card size"), {
      target: { value: "s" },
    });
    expect(form!.getValues().sections[0]).toMatchObject({
      style: { card_size: "s" },
    });

    fireEvent.change(screen.getByLabelText("Card size"), {
      target: { value: "" },
    });
    const cleared = form!.getValues().sections[0] as { style?: unknown };
    // Not merely falsy — genuinely ABSENT. A stored `{ card_size: "" }`
    // would still be a third state `sectionStyleSchema` does not recognise.
    expect(cleared.style).toBeUndefined();
  });

  // The rule most likely to be got wrong, named explicitly, for the border
  // field too: clearing (the empty option) must remove the key, never store
  // "".
  it("removes the border key when cleared, rather than storing an empty string", () => {
    let form: UseFormReturn<FormValues> | undefined;
    render(<OneSectionHarness capture={(f) => (form = f)} />);
    openPopup();

    fireEvent.change(screen.getByLabelText("Border"), {
      target: { value: "dotted" },
    });
    expect(form!.getValues().sections[0]).toMatchObject({
      style: { border: "dotted" },
    });

    fireEvent.change(screen.getByLabelText("Border"), {
      target: { value: "" },
    });
    const cleared = form!.getValues().sections[0] as { style?: unknown };
    // Not merely falsy — genuinely ABSENT. A stored `{ border: "" }` would
    // still be a third state `sectionStyleSchema` does not recognise.
    expect(cleared.style).toBeUndefined();
  });

  // `"none"` is a CHOICE, not the clearing state — see `sectionStyleSchema`'s
  // own doc for `border`. Selecting it must store the literal string, never
  // be treated as equivalent to the empty "inherit" option.
  it('stores an explicit "none" as a real value, distinct from clearing', () => {
    let form: UseFormReturn<FormValues> | undefined;
    render(<OneSectionHarness capture={(f) => (form = f)} />);
    openPopup();

    fireEvent.change(screen.getByLabelText("Border"), {
      target: { value: "none" },
    });
    const stored = form!.getValues().sections[0] as {
      style?: { border?: unknown };
    };
    expect(stored.style?.border).toBe("none");
    expect(stored.style).not.toBeUndefined();
  });

  it("clears only the cleared field, leaving a sibling field of the same section intact", () => {
    let form: UseFormReturn<FormValues> | undefined;
    render(<OneSectionHarness capture={(f) => (form = f)} />);
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

    expect(form!.getValues().sections[0]).toMatchObject({
      style: { skin: "glass" },
    });
  });

  it("writes cover and tile, and clears the fit back to neither", () => {
    let form: UseFormReturn<FormValues> | undefined;
    render(<OneSectionHarness capture={(f) => (form = f)} />);
    openPopup();
    fireEvent.change(screen.getByLabelText("Background picture"), {
      target: { value: "https://example.test/bg.png" },
    });

    fireEvent.change(screen.getByLabelText("Fit"), {
      target: { value: "tile" },
    });
    expect(form!.getValues().sections[0]).toMatchObject({
      style: { background_fit: "tile" },
    });

    fireEvent.change(screen.getByLabelText("Fit"), {
      target: { value: "cover" },
    });
    expect(form!.getValues().sections[0]).toMatchObject({
      style: { background_fit: "cover" },
    });

    fireEvent.change(screen.getByLabelText("Fit"), {
      target: { value: "" },
    });
    const cleared = form!.getValues().sections[0] as {
      style?: { background_fit?: unknown; background_url?: unknown };
    };
    expect(cleared.style?.background_fit).toBeUndefined();
    // The address itself is a different field and must survive.
    expect(cleared.style?.background_url).toBe("https://example.test/bg.png");
  });

  // The point of the task: the card behind the popup previews the choice
  // live, through the SAME `nestedSkinVars` the public page renders with —
  // asserted on the preview element's own custom properties, not merely that
  // the popup opened.
  it("previews the chosen skin on the card behind it while the popup is open", () => {
    render(<OneSectionHarness capture={() => {}} />);
    const card = screen.getByTestId("section-card");
    expect(card.hasAttribute("style")).toBe(false);

    openPopup();
    fireEvent.change(screen.getByLabelText("Style"), {
      target: { value: "neobrutalism" },
    });

    // Values pinned against `skins.ts`'s own table for `neobrutalism` — the
    // same ones `block-style.test.ts` asserts for the public renderer.
    expect(card.style.getPropertyValue("--skin-round")).toBe("0");
    expect(card.style.getPropertyValue("--skin-border")).toBe("3px");
    expect(screen.getByTestId("section-style-panel")).toBeInTheDocument();
  });

  // **On the card's FACE, not on its root, and the distinction is the whole
  // point.** The root is the ancestor every `surface` below it inherits the
  // skin's custom properties from; the face is the element that paints, and
  // the only one carrying the card's corners and — under `cutout` — its
  // chamfer. A picture on the root would paint a square rect behind a rounded
  // face and bleed at all four corners. `tests/e2e/section-card-face.spec.ts`
  // measures the pixels; this pins which element carries the value.
  it("previews a background picture on the face of the card behind the popup", () => {
    render(<OneSectionHarness capture={() => {}} />);
    const face = screen.getByTestId("section-card-face");
    openPopup();
    fireEvent.change(screen.getByLabelText("Background picture"), {
      target: { value: "https://example.test/bg.png" },
    });
    expect(face.style.backgroundImage).toBe(
      'url("https://example.test/bg.png")',
    );
    // The root keeps only what inherits, so the picture is not on it twice.
    expect(screen.getByTestId("section-card").style.backgroundImage).toBe("");
  });

  // The point of the task, for the newest field: the card previews the
  // chosen card size live, through the SAME `blockStyle` the public page
  // renders with — asserted on the preview element's own `--card-size`
  // custom property, pinned against `CARD_SIZE_MIN`'s own `l` entry (see
  // `block-style.test.ts`'s identical assertion for the public
  // renderer).
  it("previews the chosen card size on the card behind the popup", () => {
    render(<OneSectionHarness capture={() => {}} />);
    const card = screen.getByTestId("section-card");
    openPopup();
    fireEvent.change(screen.getByLabelText("Card size"), {
      target: { value: "l" },
    });
    expect(card.style.getPropertyValue("--card-size")).toBe("20rem");
  });

  // The point of the task: the card behind the popup previews the chosen
  // border live, through the SAME `blockStyle` the public page renders
  // with — asserted on the preview element's own `--skin-border-style`
  // custom property, the token Task 1 made reachable and this control is the
  // first thing to write.
  it("previews the chosen border on the card behind the popup", () => {
    render(<OneSectionHarness capture={() => {}} />);
    const card = screen.getByTestId("section-card");
    openPopup();
    fireEvent.change(screen.getByLabelText("Border"), {
      target: { value: "dashed" },
    });
    expect(card.style.getPropertyValue("--skin-border-style")).toBe("dashed");
  });

  // `"none"` previews exactly like any other member of the enum — it is a
  // real, emitted value, not a state `blockStyle` special-cases away.
  it('previews an explicit "none" border the same way as any other choice', () => {
    render(<OneSectionHarness capture={() => {}} />);
    const card = screen.getByTestId("section-card");
    openPopup();
    fireEvent.change(screen.getByLabelText("Border"), {
      target: { value: "none" },
    });
    expect(card.style.getPropertyValue("--skin-border-style")).toBe("none");
  });

  // An overlay, unlike `IconPicker`'s inline panel — what follows is what an
  // overlay owes and an inline one does not.
  describe("as an overlay", () => {
    it("moves focus into the panel on open", () => {
      render(<OneSectionHarness capture={() => {}} />);
      openPopup();
      expect(screen.getByLabelText("Style")).toHaveFocus();
    });

    it("closes on Escape and returns focus to the trigger", () => {
      render(<OneSectionHarness capture={() => {}} />);
      openPopup();
      expect(screen.getByTestId("section-style-panel")).toBeInTheDocument();

      fireEvent.keyDown(document, { key: "Escape" });

      expect(screen.queryByTestId("section-style-panel")).toBeNull();
      expect(
        screen.getByRole("button", { name: "Section style" }),
      ).toHaveFocus();
    });

    it("closes on a click outside it and returns focus to the trigger", () => {
      render(<OneSectionHarness capture={() => {}} />);
      openPopup();
      expect(screen.getByTestId("section-style-panel")).toBeInTheDocument();

      fireEvent.mouseDown(document.body);

      expect(screen.queryByTestId("section-style-panel")).toBeNull();
      expect(
        screen.getByRole("button", { name: "Section style" }),
      ).toHaveFocus();
    });

    it("does not close on a click inside the panel itself", () => {
      render(<OneSectionHarness capture={() => {}} />);
      openPopup();

      fireEvent.mouseDown(screen.getByTestId("section-style-panel"));

      expect(screen.getByTestId("section-style-panel")).toBeInTheDocument();
    });
  });
});

// `blockStyle` itself — the function the preview above calls — carries its
// own suite in `block-style.test.ts`. It is imported here rather than
// reimplemented (see `block-style.ts`'s own TSDoc on the export), so there is
// exactly one place its branches are pinned, not two that could quietly drift
// apart.
