import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useForm } from "react-hook-form";
import type { AuthoringLanguage } from "@/features/actors/application/use-language-toggle";

const { SectionItemFields } =
  await import("@/features/actors/presentation/section-item-fields");

const labels = {
  itemTitle: "Title",
  itemDescription: "Description",
  removeItem: "Remove item",
};

type Values = {
  items: {
    title_en: string;
    title_es?: string;
    description_en: string;
    description_es?: string;
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
  defaults,
  onRemove,
}: {
  lang: AuthoringLanguage;
  defaults: Values["items"][number];
  onRemove: () => void;
}) {
  const { register } = useForm<Values>({
    defaultValues: { items: [defaults] },
  });
  return (
    <SectionItemFields
      register={register}
      path="items.0"
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
 * @param lang - which language to bind to.
 * @param defaults - the item's values.
 * @returns the remove spy.
 */
function renderFields(
  lang: AuthoringLanguage = "en",
  defaults = values,
): ReturnType<typeof vi.fn> {
  const onRemove = vi.fn();
  render(<Harness lang={lang} defaults={defaults} onRemove={onRemove} />);
  return onRemove;
}

describe("SectionItemFields", () => {
  it("binds to the English fields when writing English", () => {
    renderFields("en");
    expect(screen.getByLabelText("Title")).toHaveValue("English title");
    expect(screen.getByLabelText("Description")).toHaveValue("English words.");
  });

  // The whole point of the toggle. Binding both sides to the English field
  // would look identical until somebody typed and lost their Spanish.
  it("binds to the Spanish fields when writing Spanish", () => {
    renderFields("es");
    expect(screen.getByLabelText("Title")).toHaveValue("Titulo en espanol");
    expect(screen.getByLabelText("Description")).toHaveValue(
      "Palabras en espanol.",
    );
  });

  // Not a warning, not a placeholder nagging about it: an empty field. The
  // Spanish is the author's to write when they choose.
  it("shows an unwritten Spanish value as simply empty", () => {
    renderFields("es", {
      title_en: "English title",
      description_en: "English words.",
    } as typeof values);
    expect(screen.getByLabelText("Title")).toHaveValue("");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("removes on request", () => {
    const onRemove = renderFields();
    fireEvent.click(screen.getByRole("button", { name: "Remove item" }));
    expect(onRemove).toHaveBeenCalledOnce();
  });
});
