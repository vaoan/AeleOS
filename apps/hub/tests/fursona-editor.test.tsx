import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const save = vi.fn<(...a: unknown[]) => Promise<boolean>>();
let fieldErrors: Record<string, string> = {};
let saving = false;
vi.mock("@/features/actors/application/use-fursona-editor", () => ({
  useFursonaEditor: (...a: unknown[]) => {
    lastActorRef = a[0];
    return { save, saving, fieldErrors };
  },
}));

let lastActorRef: unknown;

const push = vi.fn();
vi.mock("@/shared/infrastructure/i18n/navigation", () => ({
  useRouter: () => ({ push }),
}));

const { FursonaEditor } =
  await import("@/features/actors/presentation/fursona-editor");

const labels = {
  title: "New fursona",
  handle: "Handle",
  handleHint: "1-32 characters.",
  displayName: "Display name",
  avatarUrl: "Avatar",
  visibilityLabel: "Visibility",
  save: "Save",
  saving: "Saving…",
  cancel: "Cancel",
  bannerTitle: "Fix these before saving",
  writingIn: "Writing in",
  sectionsTitle: "Sections",
  empty: "No sections yet.",
  addSection: "Add section",
  newSectionType: "New section layout",
  atLimit: "At the limit.",
  dragSection: "Drag to reorder section",
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
  imageMissing: "No image",
  chooseIcon: "Choose an icon",
  searchIcons: "Search icons",
  noIconsFound: "No icons match that.",
  clearIcon: "Remove the icon",
  noIcon: "No icon",
  useTemplate: "Start from a template",
  templateConfirm: "This replaces the sections you have.",
  templateConfirmYes: "Replace them",
  templateConfirmNo: "Keep mine",
  names: {},
  descriptions: {},
  sectionCounts: {},
  types: {
    cards: "Cards",
    accordion: "Accordion",
    "two-column": "Two columns",
    gallery: "Gallery",
  },
  visibility: { private: "Private", unlisted: "Unlisted", public: "Public" },
  errors: {
    handle: "Use 1-32 letters, digits, dashes or underscores.",
    handleTaken: "You already have a fursona with that handle.",
    limitReached: "You already have the maximum number of fursonas.",
    displayName: "Keep this to 64 characters or fewer.",
    avatarUrl: "Enter an http or https image address.",
    visibility: "Choose one of the options.",
  },
};

/**
 * Renders the editor with overrides.
 *
 * @param props - what to override.
 */
function renderEditor(props: Record<string, unknown> = {}): void {
  render(<FursonaEditor labels={labels} handleEditable {...props} />);
}

beforeEach(() => {
  save.mockReset();
  // true means "everything landed". The editor navigates on this value and
  // never on fieldErrors, which is stale by the time a save resolves.
  save.mockResolvedValue(true);
  push.mockReset();
  fieldErrors = {};
  saving = false;
  lastActorRef = undefined;
});

describe("FursonaEditor", () => {
  it("shows the title in the toolbar", () => {
    renderEditor();
    expect(screen.getByText("New fursona")).toBeInTheDocument();
  });

  it("offers the four fields", () => {
    renderEditor();
    expect(screen.getByLabelText("Handle")).toBeInTheDocument();
    expect(screen.getByLabelText("Display name")).toBeInTheDocument();
    expect(screen.getByLabelText("Avatar")).toBeInTheDocument();
    expect(screen.getByLabelText("Visibility")).toBeInTheDocument();
  });

  it("fills the fields from what it was given", () => {
    renderEditor({
      initial: {
        handle: "sparky",
        displayName: "Sparky",
        avatarUrl: "",
        visibility: "public",
      },
    });
    expect(screen.getByLabelText("Display name")).toHaveValue("Sparky");
  });

  // update_fursona takes no handle at all, so an editable one would submit a
  // value the database ignores — a change somebody watched themselves make
  // that silently did not happen.
  it("does not let the handle be edited when editing", () => {
    renderEditor({
      handleEditable: false,
      actorRef: "ref-1",
      initial: {
        handle: "sparky",
        displayName: "",
        avatarUrl: "",
        visibility: "private",
      },
    });
    expect(screen.queryByLabelText("Handle")).toBeNull();
    expect(screen.getByText(/sparky/)).toBeInTheDocument();
  });

  it("passes the actor ref through, so the hook knows to update", () => {
    renderEditor({ actorRef: "ref-1", handleEditable: false });
    expect(lastActorRef).toBe("ref-1");
  });

  it("saves what was typed", async () => {
    renderEditor();
    fireEvent.change(screen.getByLabelText("Handle"), {
      target: { value: "blaze" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({ handle: "blaze" }),
      );
    });
  });

  it("goes back to the list once a save succeeds", async () => {
    renderEditor();
    fireEvent.change(screen.getByLabelText("Handle"), {
      target: { value: "blaze" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith("/fursonas");
    });
  });

  // The save was refused, so staying put with the reason showing is the only
  // useful outcome — navigating away would hide it.
  it("stays put when the save was refused", async () => {
    fieldErrors = { handle: "handleTaken" };
    renderEditor();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "You already have a fursona with that handle.",
    );
    expect(push).not.toHaveBeenCalled();
  });

  // THE REGRESSION. The refusal happens DURING the save, which is the only way
  // it happens in life — and the way the original test did not cover. The
  // editor read `fieldErrors` from the closure captured before the save ran, so
  // it was still empty, and it navigated away: the error hidden, the typing
  // gone. Presetting fieldErrors before render let the old test pass over it.
  it("stays put when the save is refused while it runs", async () => {
    save.mockImplementation(async () => {
      fieldErrors = { handle: "handleTaken" };
      return false;
    });
    renderEditor();
    fireEvent.change(screen.getByLabelText("Handle"), {
      target: { value: "blaze" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(save).toHaveBeenCalled();
    });
    expect(push).not.toHaveBeenCalled();
  });

  it("refuses to submit a handle the schema rejects", async () => {
    renderEditor();
    fireEvent.change(screen.getByLabelText("Handle"), {
      target: { value: "not a valid handle!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(save).not.toHaveBeenCalled();
  });

  it("leaves without saving when cancelled", () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(save).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/fursonas");
  });
});
