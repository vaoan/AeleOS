import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useForm } from "react-hook-form";
import type { AuthoringLanguage } from "@/features/actors/application/use-language-toggle";
import type { SectionType } from "@/features/actors/domain/section-schema";

// ImageField reaches for the browser Supabase client, which is Clerk-backed.
// These suites are about the fields, not about a session.
vi.mock("@/shared/infrastructure/supabase-browser", () => ({
  useSupabaseBrowserClient: () => ({}),
}));

vi.mock("lucide-react/dynamic", () => ({
  DynamicIcon: ({ name }: { name: string }) => <svg data-icon={name} />,
  iconNames: ["sparkles", "heart", "star"],
}));

const { SectionItemFields } =
  await import("@/features/actors/presentation/section-item-fields");

const labels = {
  itemTitle: "Title",
  itemDescription: "Description",
  removeItem: "Remove item",
  imageUrl: "Image address",
  imageUrlHint: "Paste a link to a picture.",
  linkUrl: "Link address",
  linkUrlHint: "A video or music link plays here.",
  imageMissing: "No image yet",
  chooseIcon: "Choose an icon",
  searchIcons: "Search icons",
  noIconsFound: "No icons match that.",
  clearIcon: "Remove the icon",
  noIcon: "No icon",
};

type Values = {
  items: {
    title_en: string;
    title_es?: string;
    description_en: string;
    description_es?: string;
    icon?: string;
    image_url?: string;
  }[];
};

/**
 * Renders the fields inside a real form, so `register` is the real thing.
 *
 * A stub register would let a wrong field path pass — which is the one fault
 * this component can have.
 *
 * @returns the fields under test; assertions read the DOM.
 */
function Harness({
  lang,
  type,
  defaults,
  onRemove,
}: {
  lang: AuthoringLanguage;
  type: SectionType;
  defaults: Values["items"][number];
  onRemove: () => void;
}) {
  const { control, register } = useForm<Values>({
    defaultValues: { items: [defaults] },
  });
  return (
    <SectionItemFields
      control={control}
      register={register}
      path="items.0"
      type={type}
      lang={lang}
      labels={labels}
      onRemove={onRemove}
    />
  );
}

const values = {
  title_en: "English title",
  title_es: "Titulo en espanol",
  description_en: "English words.",
  description_es: "Palabras en espanol.",
};

/**
 * Renders the harness.
 *
 * @param type - the section's layout, which decides what is offered.
 * @param lang - which language to bind to.
 * @param defaults - the item's values.
 * @returns the remove spy.
 */
function renderFields(
  type: SectionType = "cards",
  lang: AuthoringLanguage = "en",
  defaults: Values["items"][number] = values,
): ReturnType<typeof vi.fn> {
  const onRemove = vi.fn();
  render(
    <Harness lang={lang} type={type} defaults={defaults} onRemove={onRemove} />,
  );
  return onRemove;
}

describe("SectionItemFields", () => {
  it("binds to the English fields when writing English", () => {
    renderFields("cards", "en");
    expect(screen.getByLabelText("Title")).toHaveValue("English title");
    expect(screen.getByLabelText("Description")).toHaveValue("English words.");
  });

  // The whole point of the toggle. Binding both sides to the English field
  // would look identical until somebody typed and lost their Spanish.
  it("binds to the Spanish fields when writing Spanish", () => {
    renderFields("cards", "es");
    expect(screen.getByLabelText("Title")).toHaveValue("Titulo en espanol");
    expect(screen.getByLabelText("Description")).toHaveValue(
      "Palabras en espanol.",
    );
  });

  // Not a warning, not a placeholder nagging about it: an empty field. The
  // Spanish is the author's to write when they choose.
  it("shows an unwritten Spanish value as simply empty", () => {
    renderFields("cards", "es", {
      title_en: "English title",
      description_en: "English words.",
    });
    expect(screen.getByLabelText("Title")).toHaveValue("");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("removes on request", () => {
    const onRemove = renderFields();
    fireEvent.click(screen.getByRole("button", { name: "Remove item" }));
    expect(onRemove).toHaveBeenCalledOnce();
  });

  describe("the fields a layout offers", () => {
    it("offers an icon on a cards item, and no image address", () => {
      renderFields("cards");
      expect(
        screen.getByRole("button", { name: labels.chooseIcon }),
      ).toBeInTheDocument();
      expect(screen.queryByLabelText(labels.imageUrl)).toBeNull();
    });

    it("offers an image address on a gallery item, and no icon", () => {
      renderFields("gallery");
      expect(screen.getByLabelText(labels.imageUrl)).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: labels.chooseIcon }),
      ).toBeNull();
    });

    it.each(["accordion", "two-column"] as const)(
      "offers neither on a %s item",
      (type) => {
        renderFields(type);
        expect(
          screen.queryByRole("button", { name: labels.chooseIcon }),
        ).toBeNull();
        expect(screen.queryByLabelText(labels.imageUrl)).toBeNull();
      },
    );

    it.each(["cards", "accordion", "two-column", "gallery"] as const)(
      "still writes a title and a description on a %s item",
      (type) => {
        renderFields(type);
        expect(screen.getByLabelText("Title")).toBeInTheDocument();
        expect(screen.getByLabelText("Description")).toBeInTheDocument();
      },
    );
  });

  describe("the gallery preview", () => {
    it("shows the image, described by the item's own title", () => {
      renderFields("gallery", "en", {
        ...values,
        image_url: "https://example.test/a.png",
      });
      const image = screen.getByRole("img");
      expect(image).toHaveAttribute("src", "https://example.test/a.png");
      expect(image).toHaveAttribute("alt", "English title");
    });

    it("shows a placeholder when no address has been written", () => {
      renderFields("gallery");
      expect(screen.queryByRole("img")).toBeNull();
      expect(screen.getByText(labels.imageMissing)).toBeInTheDocument();
    });

    // The preview follows the field. Reading the address once at mount would
    // leave somebody typing a URL into a box that never shows them anything.
    it("follows what is typed into the address", () => {
      renderFields("gallery");
      fireEvent.change(screen.getByLabelText(labels.imageUrl), {
        target: { value: "https://example.test/b.png" },
      });
      expect(screen.getByRole("img")).toHaveAttribute(
        "src",
        "https://example.test/b.png",
      );
    });
  });

  describe("the icon", () => {
    it("shows the stored icon", () => {
      renderFields("cards", "en", { ...values, icon: "heart" });
      expect(document.querySelector('[data-icon="heart"]')).not.toBeNull();
    });

    it("writes the chosen icon into the form", () => {
      renderFields("cards", "en", { ...values, icon: "heart" });
      fireEvent.click(screen.getByRole("button", { name: labels.chooseIcon }));
      fireEvent.click(screen.getByRole("button", { name: "star" }));
      expect(document.querySelector('[data-icon="star"]')).not.toBeNull();
    });
  });
});
