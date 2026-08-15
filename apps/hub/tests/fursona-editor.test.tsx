import {
  SECTION_TYPES,
  type SectionType,
} from "@/features/actors/domain/section-schema";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const save = vi.fn<(...a: unknown[]) => Promise<boolean>>();
let fieldErrors: Record<string, string> = {};
let saving = false;
// The editor reaches for the browser Supabase client, which is Clerk-backed.
// These suites are about the fields, not about a session.
vi.mock("@/shared/infrastructure/supabase-browser", () => ({
  useSupabaseBrowserClient: () => ({}),
}));

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
  // The toolbar's Cancel is a link now, so the mocked module owes one — the
  // mocked-dependency trap again: what stands in for a module has to carry
  // everything the module is relied on for, and nothing announces a new
  // reliance until the suite goes red.
  Link: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
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
  writingInHint: "Only the page text.",
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
  itemDescriptionHint: "What do you want to say here?",
  imageUrl: "Image address",
  imageUrlHint: "Paste a link to a picture.",
  theme: {
    title: "Colours",
    live: "Live",
    gradient: {
      title: "Page background",
      bar: "Gradient stops",
      colour: "Colour",
      position: "Position",
      angle: "Angle",
      add: "Add colour",
      remove: "Remove",
    },
    accent: "Accent",
    canvasColours: "Canvas colours",
    canvas: "Backdrop",
    density: "How busy",
    speed: "How fast",
    canvases: {
      nebula: "Nebula",
      stars: "Starfield",
      aurora: "Aurora",
      constellation: "Constellation",
      waves: "Waves",
      bubbles: "Bubbles",
      snow: "Snow",
      grid: "Horizon grid",
      blobs: "Drifting glows",
      orbits: "Orbits",
      hexagons: "Honeycomb",
      ribbons: "Ribbons",
      confetti: "Confetti",
      skyline: "Skyline",
      bokeh: "Bokeh",
      mystify: "Mystify",
      bounce: "Bouncing boxes",
      rain: "Glyph rain",
      warp: "Warp speed",
      none: "None",
    },
    adjusted: "As visitors see it",
    reset: "Reset",
    usingDefault: "Default",
    cursor: "Cursor picture",
    cursorHint: "A link to a small picture.",
    cursorTooBig: "Too big.",
    copyFromProfile: "Use my profile's look",
    skin: "Style",
    skins: {
      default: "The default",
      glass: "Frosted glass",
      neobrutalism: "Neobrutalism",
      aero: "Glossy aero",
      candy: "Candy",
      clay: "Soft clay",
      paper: "Paper",
      terminal: "Terminal",
      retro: "Retro window",
      outline: "Outline",
      blueprint: "Blueprint",
      comic: "Comic",
      inset: "Inset",
      sticker: "Sticker",
    },
  },
  linkUrl: "Link address",
  linkUrlHint: "A video or music link plays here.",
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
  // Derived, so a new layout does not need remembering in four fixtures. The
  // name is the type, which is all any assertion here cares about.
  types: Object.fromEntries(
    SECTION_TYPES.map((type) => [type, type]),
  ) as Record<SectionType, string>,
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
function renderEditor(props: Record<string, unknown> = {}) {
  return render(<FursonaEditor labels={labels} handleEditable {...props} />);
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
  // The class a theme's rules are scoped to used to be asserted here, because
  // the live preview once emitted a stylesheet scoped to a class no element in
  // the app wore: the rules were correct, present, and matched nothing.
  //
  // It moved to `PageShell`'s content element, which is where `SKIN_SCOPE` now
  // lives and where `page-shell.test.tsx` pins it. The editor renders inside
  // that element, so carrying a second copy of the class would be the drift the
  // original fault was made of.
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
      expect(push).toHaveBeenCalledWith("/pages");
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

  // Cancel is a link, so leaving is the browser's job rather than the
  // router's — which is what lets the loading bar see it. What this still owes
  // is that it saves nothing and points at the list.
  it("leaves without saving when cancelled", () => {
    renderEditor();
    const cancel = screen.getByRole("link", { name: "Cancel" });
    expect(cancel).toHaveAttribute("href", "/pages");
    expect(save).not.toHaveBeenCalled();
  });
});

describe("FursonaEditor for a person", () => {
  /**
   * Renders the editor as `/me/edit` does.
   *
   * @returns nothing.
   */
  function renderPerson(): void {
    render(
      <FursonaEditor
        labels={labels}
        handleEditable={false}
        kind="person"
        actorRef="actor-1"
        initial={{
          // The provisioned handle: `u-` and thirty-two hex characters.
          handle: "u-78797f558e275eb3b3254726f43f1667",
          displayName: "Aeleos",
          avatarUrl: "",
          visibility: "private",
        }}
        initialSections={[]}
        initialTheme={{
          background: null,
          accent: null,
          canvasColours: null,
          canvas: "nebula",
          cursor: null,
          skin: "default",
          density: 1,
          speed: 1,
        }}
      />,
    );
  }

  it("does not offer a handle nobody chose", () => {
    renderPerson();
    expect(screen.queryByTestId("editor-handle")).toBeNull();
  });

  // **THE REGRESSION TEST for a Save that did nothing at all.** A person's
  // handle is `u-` plus thirty-two hex characters — thirty-four — and
  // `fursonaSchema` caps a handle at thirty-two. So the resolver refused the
  // form on a field that is not rendered: no message could appear, because
  // there is no input to attach one to, and pressing Save simply did nothing.
  //
  // Found by driving the real page, which is the only way it shows: every unit
  // test used a handle somebody could have typed.
  it("saves, despite a handle its own schema would reject", async () => {
    renderPerson();
    fireEvent.click(screen.getByTestId("editor-save"));
    await waitFor(() => expect(save).toHaveBeenCalled());
  });
});
