import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { FursonaSection } from "@/features/actors/domain/section-schema";

vi.mock("lucide-react/dynamic", () => ({
  DynamicIcon: ({ name }: { name: string }) => <svg data-icon={name} />,
  iconNames: ["sparkles", "heart", "paw-print"],
}));

const { PublicSections } =
  await import("@/features/actors/presentation/public-sections");

/**
 * One item, with overrides.
 *
 * @param over - fields to replace.
 * @returns the item.
 */
const item = (over: Record<string, unknown> = {}) => ({
  title_en: "English title",
  title_es: "Título en español",
  description_en: "English words.",
  description_es: "Palabras en español.",
  sort_order: 1,
  ...over,
});

/**
 * One section, with overrides.
 *
 * @param over - fields to replace.
 * @returns the section.
 */
const section = (over: Record<string, unknown> = {}) =>
  ({
    name_en: "About",
    name_es: "Acerca de",
    type: "cards",
    sort_order: 1,
    items: [item()],
    ...over,
  }) as unknown as FursonaSection;

/**
 * Renders the sections.
 *
 * @param sections - what to render.
 * @param locale - the locale being read.
 */
function renderSections(sections: FursonaSection[], locale = "en"): void {
  render(<PublicSections sections={sections} locale={locale} />);
}

describe("PublicSections", () => {
  // Not an empty state. A page with no sections is one somebody has not
  // finished, and a stranger has no use for being told so.
  it("renders nothing at all when there are no sections", () => {
    const { container } = render(<PublicSections sections={[]} locale="en" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("heads each section with its name", () => {
    renderSections([section()]);
    expect(
      screen.getByRole("heading", { name: "About", level: 2 }),
    ).toBeInTheDocument();
  });

  it("reads the section name in the locale being read", () => {
    renderSections([section()], "es");
    expect(
      screen.getByRole("heading", { name: "Acerca de", level: 2 }),
    ).toBeInTheDocument();
  });

  // 0009 stores sort_order, so array position is not what comes back.
  it("orders sections by their stored order, not their position", () => {
    renderSections([
      section({ name_en: "Second", sort_order: 2 }),
      section({ name_en: "First", sort_order: 1 }),
    ]);
    const headings = screen
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent);
    expect(headings).toEqual(["First", "Second"]);
  });

  it("orders items by their stored order too", () => {
    renderSections([
      section({
        items: [
          item({ title_en: "Second", sort_order: 2 }),
          item({ title_en: "First", sort_order: 1 }),
        ],
      }),
    ]);
    const titles = screen
      .getAllByRole("heading", { level: 3 })
      .map((h) => h.textContent);
    expect(titles).toEqual(["First", "Second"]);
  });

  describe("cards", () => {
    it("shows the item's icon", () => {
      renderSections([
        section({ type: "cards", items: [item({ icon: "paw-print" })] }),
      ]);
      expect(document.querySelector('[data-icon="paw-print"]')).not.toBeNull();
    });

    // The same rule IconPicker applies on the writing side, needing its own
    // test because this component does not share that one's code. `icon` is
    // free text as far as 0009 is concerned.
    it("renders a card without an icon when the name is not one lucide has", () => {
      renderSections([
        section({ type: "cards", items: [item({ icon: "not-an-icon" })] }),
      ]);
      expect(document.querySelector('[data-icon="not-an-icon"]')).toBeNull();
      expect(
        screen.getByRole("heading", { name: "English title", level: 3 }),
      ).toBeInTheDocument();
    });

    it("renders a card with no icon at all", () => {
      renderSections([section({ type: "cards", items: [item()] })]);
      expect(document.querySelector("[data-icon]")).toBeNull();
      expect(screen.getByText("English words.")).toBeInTheDocument();
    });
  });

  // A disclosure that needs no script, on the one page a stranger might reach
  // with JavaScript switched off.
  describe("accordion", () => {
    it("renders a details element per item", () => {
      renderSections([section({ type: "accordion" })]);
      expect(document.querySelectorAll("details")).toHaveLength(1);
    });

    it("puts the title in the summary", () => {
      renderSections([section({ type: "accordion" })]);
      expect(document.querySelector("summary")?.textContent).toBe(
        "English title",
      );
    });
  });

  describe("two-column", () => {
    it("renders the title and the description", () => {
      renderSections([section({ type: "two-column" })]);
      expect(
        screen.getByRole("heading", { name: "English title", level: 3 }),
      ).toBeInTheDocument();
      expect(screen.getByText("English words.")).toBeInTheDocument();
    });
  });

  describe("gallery", () => {
    it("renders an image described by the item's own title", () => {
      renderSections([
        section({
          type: "gallery",
          items: [item({ image_url: "https://example.test/a.png" })],
        }),
      ]);
      const image = screen.getByRole("img");
      expect(image).toHaveAttribute("src", "https://example.test/a.png");
      expect(image).toHaveAttribute("alt", "English title");
    });

    // A slot somebody added and has not filled in should show nothing, not a
    // broken image with a caption under it.
    it("skips an item with no image address", () => {
      renderSections([
        section({
          type: "gallery",
          items: [
            item({ image_url: "https://example.test/a.png", sort_order: 1 }),
            item({ title_en: "Empty", sort_order: 2 }),
          ],
        }),
      ]);
      expect(screen.getAllByRole("img")).toHaveLength(1);
      expect(screen.queryByText("Empty")).toBeNull();
    });

    it("renders no images when none has an address", () => {
      renderSections([section({ type: "gallery", items: [item()] })]);
      expect(screen.queryByRole("img")).toBeNull();
    });
  });

  describe("the language it renders", () => {
    it.each(["cards", "accordion", "two-column"] as const)(
      "prefers the locale's language in a %s section",
      (type) => {
        renderSections([section({ type })], "es");
        expect(screen.getByText("Palabras en español.")).toBeInTheDocument();
      },
    );

    // Forced by the schema: `_en` is required and `_es` optional, so Spanish is
    // the field that may be missing. A reader in Spanish sees the author's
    // English rather than a blank.
    it("falls back to English when the Spanish was never written", () => {
      renderSections(
        [
          section({
            name_es: undefined,
            items: [item({ title_es: undefined, description_es: undefined })],
          }),
        ],
        "es",
      );
      expect(
        screen.getByRole("heading", { name: "About", level: 2 }),
      ).toBeInTheDocument();
      expect(screen.getByText("English words.")).toBeInTheDocument();
    });
  });
});
