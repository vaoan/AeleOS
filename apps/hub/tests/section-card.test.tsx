import {
  SECTION_TYPES,
  type SectionType,
} from "@/features/actors/domain/section-schema";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { useEffect } from "react";
import type { AuthoringLanguage } from "@/features/actors/application/use-language-toggle";
import { SKINS, type SkinId } from "@/shared/domain/skins";

// ImageField reaches for the browser Supabase client, which is Clerk-backed.
// These suites are about the fields, not about a session.
vi.mock("@/shared/infrastructure/supabase-browser", () => ({
  useSupabaseBrowserClient: () => ({}),
}));

vi.mock("lucide-react/dynamic", () => ({
  DynamicIcon: ({ name }: { name: string }) => <svg data-icon={name} />,
  iconNames: ["sparkles", "heart", "star"],
}));

const { SectionCard } =
  await import("@/features/actors/presentation/section-card");

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
  // Derived, so a new layout does not need remembering in four fixtures. The
  // name is the type, which is all any assertion here cares about.
  types: Object.fromEntries(
    SECTION_TYPES.map((type) => [type, type]),
  ) as Record<SectionType, string>,
  style: {
    open: "Section style",
    title: "This section's own style",
    skin: "Style",
    // Derived, for the same reason `types` above is: a skin added later
    // cannot leave this fixture silently short of one.
    skins: Object.fromEntries(SKINS.map((skin) => [skin, skin])) as Record<
      SkinId,
      string
    >,
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
 * One item, with overrides.
 *
 * @param over - fields to replace.
 * @returns the item.
 */
const item = (over: Record<string, unknown> = {}) => ({
  title_en: "Item one",
  title_es: "",
  description_en: "Words.",
  description_es: "",
  sort_order: 1,
  ...over,
});

/**
 * The form `Harness` most recently rendered — `sort_order` reaches no
 * visible input, so a test reading it back needs the form directly rather
 * than the DOM `render` hands back.
 */
let capturedForm: UseFormReturn<{
  sections: {
    name_en: string;
    name_es: string;
    type: string;
    sort_order: number;
    items: ReturnType<typeof item>[];
  }[];
}>;

/**
 * Renders one card inside a real form.
 *
 * @returns the section's fields; assertions read the DOM.
 */
function Harness({
  lang,
  items,
  type,
  onRemove,
}: {
  lang: AuthoringLanguage;
  items: ReturnType<typeof item>[];
  type: string;
  onRemove: () => void;
}) {
  const form = useForm({
    defaultValues: {
      sections: [
        {
          name_en: "About me",
          name_es: "Sobre mi",
          type,
          sort_order: 1,
          items,
        },
      ],
    },
  });
  // Capturing during render is a side effect the rules of hooks forbid; an
  // effect is the escape hatch, and Testing Library's `render` flushes it
  // before returning, so it is ready for the assertion straight after.
  useEffect(() => {
    capturedForm = form;
  });
  return (
    <SectionCard
      control={form.control}
      register={form.register}
      setValue={form.setValue}
      path="sections.0"
      index={0}
      lang={lang}
      labels={labels}
      // No `Draggable` wraps this harness, so there is nothing real to spread
      // — matching what the library itself hands a disabled handle.
      dragHandleProps={null}
      onRemove={onRemove}
    />
  );
}

/**
 * Renders the card.
 *
 * @param lang - which language to bind to.
 * @param items - the section's items.
 * @returns the remove spy.
 */
function renderCard(
  lang: AuthoringLanguage = "en",
  items = [item()],
  type = "cards",
): ReturnType<typeof vi.fn> {
  const onRemove = vi.fn();
  render(<Harness lang={lang} items={items} type={type} onRemove={onRemove} />);
  return onRemove;
}

/** The titles currently rendered, in order. */
const titles = () =>
  screen.getAllByLabelText("Title").map((el) => (el as HTMLInputElement).value);

describe("SectionCard", () => {
  it("offers a drag handle in its own header row", () => {
    renderCard();
    expect(
      screen.getByRole("button", { name: "Drag to reorder section" }),
    ).toBeInTheDocument();
  });

  it("binds the section name to the language being written", () => {
    renderCard("es");
    expect(screen.getByLabelText("Section name")).toHaveValue("Sobre mi");
  });

  it("offers every layout, in order", () => {
    renderCard();
    const options = screen
      .getAllByRole("option")
      .map((el) => (el as HTMLOptionElement).value);
    expect(options).toEqual([...SECTION_TYPES]);
  });

  it("renders its items in order", () => {
    renderCard("en", [item(), item({ title_en: "Item two", sort_order: 2 })]);
    expect(titles()).toEqual(["Item one", "Item two"]);
  });

  it("appends an item", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Add item" }));
    expect(titles()).toHaveLength(2);
  });

  // The same collision `SectionEditor` has for sections, found while fixing
  // its drag: `sort_order: fields.length + 1` alone is computed from the
  // CURRENT count, which a removal has already shrunk — so a later add can
  // land at or below a surviving item's `sort_order`, and the public page
  // sorts items by that field exactly as it sorts sections.
  it("keeps a later add above every survivor, even after removals left a gap", () => {
    renderCard("en", [
      item({ title_en: "Item 1", sort_order: 1 }),
      item({ title_en: "Item 2", sort_order: 2 }),
      item({ title_en: "Item 3", sort_order: 3 }),
    ]);

    fireEvent.click(screen.getAllByRole("button", { name: "Remove item" })[0]!);
    fireEvent.click(screen.getAllByRole("button", { name: "Remove item" })[0]!);
    expect(titles()).toEqual(["Item 3"]);

    fireEvent.click(screen.getByRole("button", { name: "Add item" }));

    const items = capturedForm.getValues("sections.0.items");
    expect(items.map((i) => i.title_en)).toEqual(["Item 3", ""]);
    expect(items.map((i) => i.sort_order)).toEqual([1, 2]);
  });

  // The assertion worth writing carefully. An index-based remove that closes
  // over a stale index drops the wrong row, and a test that removes from a
  // one-item list cannot tell the difference.
  it("removes the item that was asked for, not the first one", () => {
    renderCard("en", [
      item({ title_en: "Keep me" }),
      item({ title_en: "Remove me", sort_order: 2 }),
      item({ title_en: "Keep me too", sort_order: 3 }),
    ]);
    fireEvent.click(screen.getAllByRole("button", { name: "Remove item" })[1]!);
    expect(titles()).toEqual(["Keep me", "Keep me too"]);
  });

  it("hides the items when collapsed, keeping the header", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Collapse section" }));
    expect(screen.queryByLabelText("Title")).toBeNull();
    expect(screen.getByLabelText("Section name")).toBeInTheDocument();
  });

  it("expands again", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Collapse section" }));
    fireEvent.click(screen.getByRole("button", { name: "Expand section" }));
    expect(screen.getByLabelText("Title")).toBeInTheDocument();
  });

  // The wiring a props change silently drops. The card knows its layout and
  // the items do not, so an item asked to render the wrong fields looks
  // entirely normal until somebody notices the picker they were promised.
  it("gives its items the layout it is set to", () => {
    renderCard("en", [item()], "gallery");
    expect(screen.getByLabelText("Image address")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Choose an icon" })).toBeNull();
  });

  // And follows a change to it, without a save in between: somebody switching
  // the layout is looking to see what it does.
  it("follows the layout being changed", () => {
    renderCard("en", [item()], "cards");
    expect(screen.queryByLabelText("Image address")).toBeNull();
    fireEvent.change(screen.getByLabelText("Layout"), {
      target: { value: "gallery" },
    });
    expect(screen.getByLabelText("Image address")).toBeInTheDocument();
  });

  it("removes the whole section on request", () => {
    const onRemove = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Remove section" }));
    expect(onRemove).toHaveBeenCalledOnce();
  });
});
