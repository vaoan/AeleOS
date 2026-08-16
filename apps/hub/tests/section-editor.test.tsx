import {
  SECTION_TYPES,
  type SectionType,
} from "@/features/actors/domain/section-schema";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { useEffect, type ReactNode } from "react";
import { SECTION_LIMITS } from "@/features/actors/domain/section-schema";
import { FURSONA_TEMPLATES } from "@/features/actors/domain/fursona-templates";
import { SECTION_PRESETS } from "@/features/actors/presentation/section-presets";
import { SKINS, type SkinId } from "@/shared/domain/skins";
import type { DropResult } from "@hello-pangea/dnd";

// Flattened, so this tests ordering and what is offered rather than the drag
// library's own behaviour, which is its to test.
// ImageField reaches for the browser Supabase client, which is Clerk-backed.
// These suites are about the fields, not about a session.
vi.mock("@/shared/infrastructure/supabase-browser", () => ({
  useSupabaseBrowserClient: () => ({}),
}));

// `DragDropContext` below is flattened, exactly like `Draggable` and
// `Droppable`, so a real drag is never driven here — that is
// `section-drag-reorder.spec.ts`'s job, against a real browser. What this
// captures is the `onDragEnd` callback `SectionEditor` registers, so a test
// can call it directly to simulate a drop and assert what it did to
// `sort_order`.
let capturedOnDragEnd: ((result: DropResult) => void) | undefined;

vi.mock("@hello-pangea/dnd", () => ({
  DragDropContext: ({
    children,
    onDragEnd,
  }: {
    children: ReactNode;
    onDragEnd: (result: DropResult) => void;
  }) => {
    capturedOnDragEnd = onDragEnd;
    return <>{children}</>;
  },
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
  style: {
    open: "Section style",
    title: "This section's own style",
    skin: "Style",
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
  },
  itemTitle: "Title",
  itemDescription: "Description",
  itemDescriptionHint: "What do you want to say here?",
  imageUrl: "Image address",
  imageUrlHint: "Paste a link to a picture.",
  linkUrl: "Link address",
  linkUrlHint: "A video or music link plays here.",
  linkUrlPlainHint: "This becomes a button or a chip.",
  imageMissing: "No image",
  chooseIcon: "Choose an icon",
  searchIcons: "Search icons",
  noIconsFound: "No icons match that.",
  clearIcon: "Remove the icon",
  noIcon: "No icon",
  addSectionFor: "Add a section for…",
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
  // Derived, so a new layout does not need remembering in four fixtures. The
  // name is the type, which is all any assertion here cares about.
  types: Object.fromEntries(
    SECTION_TYPES.map((type) => [type, type]),
  ) as Record<SectionType, string>,
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
 * The form `Harness` most recently rendered — captured rather than returned,
 * since `render` from Testing Library hands back a DOM query object, not the
 * component's own hook state. `sort_order` reaches no visible input, so
 * reading it back after a simulated drop needs the form directly.
 */
let capturedForm: UseFormReturn<{ sections: ReturnType<typeof section>[] }>;

/**
 * Renders the editor inside a real form.
 *
 * @returns the sections under test; assertions read the DOM.
 */
function Harness({ sections }: { sections: ReturnType<typeof section>[] }) {
  const form = useForm({ defaultValues: { sections } });
  // Capturing during render is a side effect the rules of hooks forbid; an
  // effect is the escape hatch, and Testing Library's `render` flushes it
  // before returning, so it is ready for the assertion straight after.
  useEffect(() => {
    capturedForm = form;
  });
  return (
    <SectionEditor
      control={form.control}
      register={form.register}
      setValue={form.setValue}
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

  describe("brand presets", () => {
    const instagram = SECTION_PRESETS.find((p) => p.id === "instagram")!;

    /** Opens the preset list. */
    const openPresets = () =>
      fireEvent.click(screen.getByTestId("section-presets"));

    it("appends a section of the brand's layout, named for the brand", () => {
      renderEditor();
      openPresets();
      fireEvent.click(screen.getByTestId(`preset-${instagram.id}`));

      expect(names()).toEqual([instagram.name]);
      expect(screen.getByLabelText("Layout")).toHaveValue(instagram.type);
    });

    // Appends, unlike the template picker's replace — nothing already written
    // is lost, and there is nothing to confirm.
    it("appends without touching what was already there", () => {
      renderEditor([section({ name_en: "Mine" })]);
      openPresets();
      fireEvent.click(screen.getByTestId(`preset-${instagram.id}`));

      expect(names()).toEqual(["Mine", instagram.name]);
    });

    it("is withdrawn at the same limit as the manual add control", () => {
      renderEditor(
        Array.from({ length: SECTION_LIMITS.sections }, (_, n) =>
          section({ name_en: `Section ${n + 1}`, sort_order: n + 1 }),
        ),
      );
      expect(screen.queryByTestId("section-presets")).toBeNull();
    });
  });

  it("offers a drag handle for each section", () => {
    renderEditor([section(), section({ name_en: "My art", sort_order: 2 })]);
    expect(
      screen.getAllByRole("button", { name: "Drag to reorder section" }),
    ).toHaveLength(2);
  });

  // THE ASSERTION THAT WOULD HAVE CAUGHT THE BUG. `move` from `useFieldArray`
  // reorders the on-screen array and nothing else; a save that read only
  // `sort_order` — which is what `0009` and the public page actually sort
  // by — sent every section back under its ORIGINAL number, so a drag never
  // reached a visitor. Reading `names()` (array position) after a drop would
  // pass on the unfixed code too, because `move` alone already gets that
  // right — the defect is invisible to anything that does not read
  // `sort_order` itself.
  describe("keeping sort_order in step with the screen", () => {
    it("rewrites every section's sort_order to match a drag's new position", () => {
      renderEditor([
        section({ name_en: "First", sort_order: 1 }),
        section({ name_en: "Second", sort_order: 2 }),
        section({ name_en: "Third", sort_order: 3 }),
      ]);

      // First moves to where Third was — the same shape of move
      // `section-drag-reorder.spec.ts` drives by keyboard, just fired
      // directly at the handler `SectionEditor` registered.
      capturedOnDragEnd!({
        source: { index: 0, droppableId: "sections" },
        destination: { index: 2, droppableId: "sections" },
      } as unknown as DropResult);

      const sections = capturedForm.getValues("sections");
      expect(sections.map((s) => s.name_en)).toEqual([
        "Second",
        "Third",
        "First",
      ]);
      expect(sections.map((s) => s.sort_order)).toEqual([1, 2, 3]);
    });

    it("does nothing when a section is dropped back where it started", () => {
      renderEditor([
        section({ name_en: "First", sort_order: 1 }),
        section({ name_en: "Second", sort_order: 2 }),
      ]);

      capturedOnDragEnd!({
        source: { index: 0, droppableId: "sections" },
        destination: { index: 0, droppableId: "sections" },
      } as unknown as DropResult);

      expect(
        capturedForm.getValues("sections").map((s) => s.sort_order),
      ).toEqual([1, 2]);
    });

    // The interaction with removing, found while fixing the drag: a section
    // removed from the middle leaves a gap in the survivors' sort_order,
    // which is harmless by itself. What is not harmless is the NEXT add —
    // `fields.length + 1`, computed after the removal, can land at or below
    // a surviving section's sort_order, so the section just appended at the
    // visual end sorts BEFORE one already there.
    it("keeps a later add above every survivor, even after removals left a gap", () => {
      renderEditor(
        Array.from({ length: 5 }, (_, n) =>
          section({ name_en: `Section ${n + 1}`, sort_order: n + 1 }),
        ),
      );

      // Remove every section but the last, one at a time — "Remove section"
      // always targets index 0 once the row above it is gone.
      const last = names().at(-1);
      while (names().length > 1) {
        fireEvent.click(
          screen.getAllByRole("button", { name: "Remove section" })[0]!,
        );
      }
      expect(names()).toEqual([last]);

      fireEvent.click(screen.getByRole("button", { name: "Add section" }));

      const sections = capturedForm.getValues("sections");
      expect(sections.map((s) => s.name_en)).toEqual(["Section 5", ""]);
      // Strictly increasing and matching the screen — not merely distinct,
      // which the pre-fix code already accidentally achieved. The fault was
      // an INVERSION, not a collision: the appended section's computed
      // sort_order landed at or below the survivor's, sorting the new,
      // visually-last section BEFORE "Section 5" rather than merely tying it.
      expect(sections.map((s) => s.sort_order)).toEqual([1, 2]);
    });
  });
});
