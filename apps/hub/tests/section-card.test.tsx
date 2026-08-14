import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useForm } from "react-hook-form";
import type { AuthoringLanguage } from "@/features/actors/application/use-language-toggle";

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
  itemTitle: "Title",
  itemDescription: "Description",
  imageUrl: "Image address",
  imageMissing: "No image yet",
  chooseIcon: "Choose an icon",
  searchIcons: "Search icons",
  noIconsFound: "No icons match that.",
  clearIcon: "Remove the icon",
  noIcon: "No icon",
  imageUpload: "Upload a picture",
  imageUploading: "Uploading…",
  imageTooLarge: "That file is over 2 MB.",
  imageWrongType: "That is not an image we can store.",
  imageFailed: "The upload did not work.",
  imageStaysPublic: "An uploaded picture stays reachable by its address.",
  types: {
    cards: "Cards",
    accordion: "Accordion",
    "two-column": "Two columns",
    gallery: "Gallery",
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
  return (
    <SectionCard
      control={form.control}
      register={form.register}
      path="sections.0"
      index={0}
      lang={lang}
      labels={labels}
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
  it("binds the section name to the language being written", () => {
    renderCard("es");
    expect(screen.getByLabelText("Section name")).toHaveValue("Sobre mi");
  });

  it("offers exactly the four layouts", () => {
    renderCard();
    const options = screen
      .getAllByRole("option")
      .map((el) => (el as HTMLOptionElement).value);
    expect(options).toEqual(["cards", "accordion", "two-column", "gallery"]);
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
