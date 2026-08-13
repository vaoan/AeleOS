import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useForm } from "react-hook-form";
import type { AuthoringLanguage } from "@/features/actors/application/use-language-toggle";

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
  onRemove,
}: {
  lang: AuthoringLanguage;
  items: ReturnType<typeof item>[];
  onRemove: () => void;
}) {
  const form = useForm({
    defaultValues: {
      sections: [
        {
          name_en: "About me",
          name_es: "Sobre mi",
          type: "cards",
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
): ReturnType<typeof vi.fn> {
  const onRemove = vi.fn();
  render(<Harness lang={lang} items={items} onRemove={onRemove} />);
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

  it("removes the whole section on request", () => {
    const onRemove = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Remove section" }));
    expect(onRemove).toHaveBeenCalledOnce();
  });
});
