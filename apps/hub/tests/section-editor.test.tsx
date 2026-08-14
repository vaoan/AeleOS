import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useForm } from "react-hook-form";
import type { ReactNode } from "react";
import { SECTION_LIMITS } from "@/features/actors/domain/section-schema";
import { FURSONA_TEMPLATES } from "@/features/actors/domain/fursona-templates";

// Flattened, so this tests ordering and what is offered rather than the drag
// library's own behaviour, which is its to test.
// ImageField reaches for the browser Supabase client, which is Clerk-backed.
// These suites are about the fields, not about a session.
vi.mock("@/shared/infrastructure/supabase-browser", () => ({
  useSupabaseBrowserClient: () => ({}),
}));

vi.mock("@hello-pangea/dnd", () => ({
  DragDropContext: ({ children }: { children: ReactNode }) => <>{children}</>,
  Droppable: ({
    children,
  }: {
    children: (p: {
      innerRef: undefined;
      droppableProps: Record<string, never>;
      placeholder: null;
    }) => ReactNode;
  }) => (
    <>
      {children({ innerRef: undefined, droppableProps: {}, placeholder: null })}
    </>
  ),
  Draggable: ({
    children,
  }: {
    children: (p: {
      innerRef: undefined;
      draggableProps: Record<string, never>;
      dragHandleProps: Record<string, never>;
    }) => ReactNode;
  }) => (
    <>
      {children({
        innerRef: undefined,
        draggableProps: {},
        dragHandleProps: {},
      })}
    </>
  ),
}));

const { SectionEditor } =
  await import("@/features/actors/presentation/section-editor");

const labels = {
  sectionsTitle: "Sections",
  empty: "No sections yet. Add one to start building the page.",
  addSection: "Add section",
  newSectionType: "New section layout",
  atLimit: "You have reached the maximum number of sections.",
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
  imageUrl: "Image address",
  imageMissing: "No image",
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
  useTemplate: "Start from a template",
  templateConfirm: "This replaces the sections you have.",
  templateConfirmYes: "Replace them",
  templateConfirmNo: "Keep mine",
  names: Object.fromEntries(
    FURSONA_TEMPLATES.map((template) => [
      template.id,
      `Name of ${template.id}`,
    ]),
  ),
  descriptions: Object.fromEntries(
    FURSONA_TEMPLATES.map((template) => [template.id, `About ${template.id}`]),
  ),
  sectionCounts: Object.fromEntries(
    FURSONA_TEMPLATES.map((template) => [template.id, `${template.id} count`]),
  ),
  types: {
    cards: "Cards",
    accordion: "Accordion",
    "two-column": "Two columns",
    gallery: "Gallery",
  },
};

/**
 * A section, with overrides.
 *
 * @param over - fields to replace.
 * @returns the section.
 */
const section = (over: Record<string, unknown> = {}) => ({
  name_en: "About me",
  name_es: "",
  type: "cards",
  sort_order: 1,
  items: [],
  ...over,
});

/**
 * Renders the editor inside a real form.
 *
 * @returns the sections under test; assertions read the DOM.
 */
function Harness({ sections }: { sections: ReturnType<typeof section>[] }) {
  const form = useForm({ defaultValues: { sections } });
  return (
    <SectionEditor
      control={form.control}
      register={form.register}
      lang="en"
      labels={labels}
    />
  );
}

/**
 * Renders the editor.
 *
 * @param sections - the sections to start with.
 */
function renderEditor(sections: ReturnType<typeof section>[] = []): void {
  render(<Harness sections={sections} />);
}

/** The section names currently rendered, in order. */
const names = () =>
  screen
    .getAllByLabelText("Section name")
    .map((el) => (el as HTMLInputElement).value);

describe("SectionEditor", () => {
  it("invites the first section when there are none", () => {
    renderEditor();
    expect(screen.getByText(labels.empty)).toBeInTheDocument();
  });

  it("renders sections in order", () => {
    renderEditor([section(), section({ name_en: "My art", sort_order: 2 })]);
    expect(names()).toEqual(["About me", "My art"]);
  });

  it("shows no empty state once there is a section", () => {
    renderEditor([section()]);
    expect(screen.queryByText(labels.empty)).toBeNull();
  });

  it("appends a section of the chosen layout", () => {
    renderEditor();
    fireEvent.change(screen.getByLabelText("New section layout"), {
      target: { value: "gallery" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add section" }));

    expect(names()).toHaveLength(1);
    expect(screen.getByLabelText("Layout")).toHaveValue("gallery");
  });

  it("removes the section that was asked for", () => {
    renderEditor([
      section({ name_en: "Keep me" }),
      section({ name_en: "Remove me", sort_order: 2 }),
      section({ name_en: "Keep me too", sort_order: 3 }),
    ]);
    fireEvent.click(
      screen.getAllByRole("button", { name: "Remove section" })[1]!,
    );
    expect(names()).toEqual(["Keep me", "Keep me too"]);
  });

  // An add button that silently does nothing at the limit reads as broken.
  // Saying why is the whole difference.
  it("withdraws the add control at the limit and says why", () => {
    renderEditor(
      Array.from({ length: SECTION_LIMITS.sections }, (_, n) =>
        section({ name_en: `Section ${n + 1}`, sort_order: n + 1 }),
      ),
    );
    expect(screen.queryByRole("button", { name: "Add section" })).toBeNull();
    expect(screen.getByText(labels.atLimit)).toBeInTheDocument();
  });

  it("still offers the add control one below the limit", () => {
    renderEditor(
      Array.from({ length: SECTION_LIMITS.sections - 1 }, (_, n) =>
        section({ name_en: `Section ${n + 1}`, sort_order: n + 1 }),
      ),
    );
    expect(
      screen.getByRole("button", { name: "Add section" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(labels.atLimit)).toBeNull();
  });

  describe("starting from a template", () => {
    const first = FURSONA_TEMPLATES[0]!;

    /** Opens the template list. */
    const openTemplates = () =>
      fireEvent.click(screen.getByRole("button", { name: labels.useTemplate }));

    it("fills an empty editor with the template's sections", () => {
      renderEditor();
      openTemplates();
      fireEvent.click(
        screen.getByRole("button", { name: labels.names[first.id] }),
      );
      expect(names()).toEqual(first.sections.map((s) => s.name_en));
    });

    // Replacement, not append. A template merged onto what somebody already
    // wrote produces a page nobody asked for.
    it("replaces what was there, once that is confirmed", () => {
      renderEditor([section({ name_en: "Mine" })]);
      openTemplates();
      fireEvent.click(
        screen.getByRole("button", { name: labels.names[first.id] }),
      );
      fireEvent.click(
        screen.getByRole("button", { name: labels.templateConfirmYes }),
      );
      expect(names()).toEqual(first.sections.map((s) => s.name_en));
    });

    it("leaves them alone when the replacement is declined", () => {
      renderEditor([section({ name_en: "Mine" })]);
      openTemplates();
      fireEvent.click(
        screen.getByRole("button", { name: labels.names[first.id] }),
      );
      fireEvent.click(
        screen.getByRole("button", { name: labels.templateConfirmNo }),
      );
      expect(names()).toEqual(["Mine"]);
    });
  });

  it("offers a drag handle for each section", () => {
    renderEditor([section(), section({ name_en: "My art", sort_order: 2 })]);
    expect(
      screen.getAllByRole("button", { name: "Drag to reorder section" }),
    ).toHaveLength(2);
  });
});
