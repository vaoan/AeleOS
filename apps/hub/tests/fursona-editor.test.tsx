import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PAGE_MEASURES,
  type PageMeasure,
} from "@/features/actors/domain/actor-theme";
import { pageContext } from "./helpers/page-context";
import type { ComponentProps, ReactNode } from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import {
  BLOCK_LIMITS,
  BLOCK_STYLE_LIMITS,
} from "@/features/actors/domain/block-schema";
import { SKINS, type SkinId } from "@/shared/domain/skins";
import { isContainer, type Block } from "@/features/actors/domain/block-schema";
import {
  blockEditorLabels,
  completePagePreviewLabels,
} from "./support/editor-labels";

const save = vi.fn<(...a: unknown[]) => Promise<boolean>>();
let fieldErrors: Record<string, string> = {};
let saving = false;
let toolbarRenders = 0;
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

vi.mock(
  "@/features/actors/presentation/editor-toolbar",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@/features/actors/presentation/editor-toolbar")
      >();
    return {
      ...actual,
      EditorToolbar: (props: ComponentProps<typeof actual.EditorToolbar>) => {
        toolbarRenders += 1;
        return <actual.EditorToolbar {...props} />;
      },
    };
  },
);

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
  ...blockEditorLabels(),
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
  completePreview: completePagePreviewLabels(),
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
      kind: "Shape",
      kinds: { linear: "Linear", radial: "Radial", conic: "Conic" },
      repeat: "Repeat the colours",
      every: "Repeat every",
      shape: "Circle or ellipse",
      shapes: { ellipse: "Ellipse", circle: "Circle" },
      extent: "How far it reaches",
      extents: {
        "closest-side": "To the nearest edge",
        "closest-corner": "To the nearest corner",
        "farthest-side": "To the furthest edge",
        "farthest-corner": "To the furthest corner",
      },
      centreX: "Centre across",
      centreY: "Centre down",
      preview: "How the background looks",
    },
    accent: "Accent",
    canvasColours: "Animation colours",
    canvasGroup: "The moving backdrop",
    canvasGroupHint: "It moves behind your page.",
    canvas: "Animation",
    density: "How busy",
    speed: "How fast",
    scale: "How big",
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
      plasma: "Plasma",
      cells: "Cells",
      flow: "Current",
      fireflies: "Fireflies",
      none: "None",
    },
    adjusted: "As visitors see it",
    reset: "Reset",
    usingDefault: "Default",
    cursor: "Cursor picture",
    cursorHint: "A link to a small picture.",
    cursorTooBig: "Too big.",
    backgroundUrl: "Background picture",
    backgroundUrlHint: "A link to a picture, over your gradient.",
    backgroundFit: "Fit",
    backgroundFitCover: "Cover",
    backgroundFitTile: "Tile",
    copyFromProfile: "Use my profile's look",
    skin: "Style",
    // Derived from `SKINS`, exactly as the section-style fixture above already
    // is, rather than restating the catalogue. Restating it made adding a skin
    // a type error in a suite that tests none of these names — the catalogues
    // themselves are `messages.test.ts`'s job.
    measure: "measure",
    measures: Object.fromEntries(PAGE_MEASURES.map((m) => [m, m])) as Record<
      PageMeasure,
      string
    >,
    skins: Object.fromEntries(SKINS.map((skin) => [skin, skin])) as Record<
      SkinId,
      string
    >,
  },
  visibility: { private: "Private", unlisted: "Unlisted", public: "Public" },
  errors: {
    handle: "Use 1-32 letters, digits, dashes or underscores.",
    handleTaken: "You already have a fursona with that handle.",
    limitReached: "You already have the maximum number of fursonas.",
    displayName: "Keep this to 64 characters or fewer.",
    avatarUrl: "Enter an http or https image address.",
    visibility: "Choose one of the options.",
    sections: "What needs fixing is marked below.",
    sectionsMarked: "Your page was not saved. Something below is marked.",
    sectionsTooLarge: "Your page holds more than it can.",
  },
};

/** A section whose own name is past what the write schema accepts. */
const overlongName = () => [
  {
    kind: "container" as const,
    mode: "grid" as const,
    spaces: 2,
    name_en: "x".repeat(BLOCK_LIMITS.text + 1),
    children: [{ kind: "text" as const, title_en: "A", description_en: "" }],
  },
];

/** A section whose style carries an address past its own cap. */
const overlongBackground = () => [
  {
    kind: "container" as const,
    mode: "grid" as const,
    spaces: 2,
    name_en: "About",
    style: {
      background_url: `https://example.com/${"x".repeat(BLOCK_STYLE_LIMITS.background_url)}.png`,
    },
    children: [{ kind: "text" as const, title_en: "A", description_en: "" }],
  },
];

/** A section holding one piece of content nobody has titled yet. */
const untitled = () => [
  {
    kind: "container" as const,
    mode: "grid" as const,
    spaces: 2,
    name_en: "About",
    children: [
      { kind: "text" as const, title_en: "", description_en: "" },
      null,
    ],
  },
];

/**
 * Renders the editor with overrides.
 *
 * @param props - what to override.
 */
function renderEditor(props: Record<string, unknown> = {}) {
  return render(
    <FursonaEditor
      labels={labels}
      handleEditable
      page={pageContext({ parentHost: "" })}
      {...props}
    />,
  );
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
  toolbarRenders = 0;
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
    // **All, not one.** The handle is shown twice now and both are right: once
    // as the field somebody may not edit, and once by the `handle` identity
    // leaf, which the preview renders because a page carries its required
    // blocks from the moment it opens. The claim here is that the handle is
    // READABLE and not editable, which the line above already pins.
    expect(screen.getAllByText(/sparky/).length).toBeGreaterThan(0);
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

  // A NEW PAGE COULD NOT BE SAVED AT ALL.
  //
  // The create page passes no `initialSections`, and the default was `[]` — a
  // tree `set_actor_sections` refuses outright for naming no `avatar`, `handle`
  // or `owner`. So building a fursona by hand ended at a banner saying the
  // sections were refused, over a page whose author had done nothing wrong;
  // only the template path worked, because applying one runs the shim.
  //
  // **No unit test could have caught it and this one only just can**, which is
  // the part worth keeping. The refusal happens in the DATABASE, and `save` is
  // mocked here — so "does it save" is not the question this file can ask. What
  // it can ask is what the editor SENDS, which is where the fault actually was.
  it("starts a new page with the blocks the database requires", async () => {
    renderEditor();
    fireEvent.change(screen.getByLabelText("Handle"), {
      target: { value: "blaze" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(save).toHaveBeenCalled());

    const kinds = new Set<string>();
    const walk = (blocks: readonly (Block | null)[]): void => {
      for (const block of blocks) {
        if (block === null) continue;
        if (isContainer(block)) walk(block.children);
        else kinds.add(block.kind);
      }
    };
    walk((save.mock.calls[0]![0] as { sections: Block[] }).sections);

    // Every kind a fursona's page must carry. Asserted as the whole set rather
    // than one of them, because the composed section supplies all three and a
    // default that supplied only some would be refused just as completely.
    for (const required of ["avatar", "handle", "owner"]) {
      expect([...kinds]).toContain(required);
    }
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

  // `lang` reaches only the sections, so the strip belongs directly above
  // them, below the theme panel — not above the top fields it does not touch.
  // Sabotage-verified: reverting the render order makes both of these fail.
  it("puts the theme panel, language strip, sections, and complete preview in order", () => {
    renderEditor();
    const theme = screen.getByTestId("theme-open");
    const writingIn = screen.getByTestId("writing-in-en");
    const sections = screen.getByTestId("add-section");
    const completePreview = screen.getByRole("button", {
      name: labels.completePreview.expand,
    });

    expect(
      theme.compareDocumentPosition(writingIn) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      writingIn.compareDocumentPosition(sections) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      sections.compareDocumentPosition(completePreview) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  // The identity fields carried their opaque backing with none of the chrome
  // around it, so on a themed page they read as a bare rectangle floating on
  // the author's field while every sibling group was a rounded, bordered card.
  // Asserted against the theme panel rather than against a copied class list:
  // the claim is that these two match, and a literal list would keep passing
  // after the shared pattern moved out from under it.
  it("gives the identity fields the same card as every other workbench group", () => {
    renderEditor();
    const identity = screen.getByTestId("editor-identity-fields");
    const panel = screen.getByTestId("theme-open").closest("section");

    expect(panel).not.toBeNull();
    for (const shape of ["rounded-xl", "surface", "border-(--edge)", "p-3"]) {
      expect(panel!.className).toContain(shape);
      expect(identity.className).toContain(shape);
    }
    // The backing itself is load-bearing rather than decorative: it is what
    // the contrast guard measures a bare label against over a hostile field.
    expect(identity.className).toContain("bg-(--surface-solid)");
  });

  it("previews unsaved identity and measure through the real page renderer", () => {
    renderEditor({
      initial: {
        handle: "saved-handle",
        displayName: "Saved name",
        avatarUrl: "",
        visibility: "private",
      },
    });

    fireEvent.change(screen.getByLabelText("Handle"), {
      target: { value: "live-handle" },
    });
    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "Live name" },
    });
    fireEvent.change(screen.getByLabelText("Avatar"), {
      target: { value: "https://example.com/live.png" },
    });
    fireEvent.click(screen.getByTestId("theme-open"));
    fireEvent.change(screen.getByTestId("theme-measure"), {
      target: { value: "narrow" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: labels.completePreview.expand }),
    );

    const preview = within(screen.getByTestId("complete-page-preview-content"));
    expect(preview.getByTestId("public-actor-name")).toHaveTextContent(
      "live-handle",
    );
    expect(preview.getByText("Live name")).toBeInTheDocument();
    expect(preview.getByTestId("block-avatar")).toHaveAttribute(
      "src",
      "https://example.com/live.png",
    );
    expect(
      preview.getAllByTestId("public-section")[0]?.parentElement,
    ).toHaveClass("max-w-[620px]");
  });

  it("previews unsaved page content from the live block tree", () => {
    renderEditor({
      initialSections: [
        {
          kind: "container",
          mode: "stack",
          spaces: 1,
          name_en: "Draft section",
          children: [
            {
              kind: "text",
              title_en: "Draft title",
              description_en: "Saved page words",
            },
          ],
        },
      ],
    });

    fireEvent.change(screen.getByTestId("leaf-description"), {
      target: { value: "Unsaved page words" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: labels.completePreview.expand }),
    );

    const preview = within(screen.getByTestId("complete-page-preview-content"));
    expect(preview.getByText("Unsaved page words")).toBeInTheDocument();
    expect(preview.queryByText("Saved page words")).toBeNull();
  });

  it("updates a leaf preview without rerendering the whole editor", () => {
    renderEditor({
      initialSections: [
        {
          kind: "container",
          mode: "stack",
          spaces: 1,
          name_en: "Draft section",
          children: [
            {
              kind: "text",
              title_en: "Draft title",
              description_en: "Saved words",
            },
          ],
        },
      ],
    });
    fireEvent.click(screen.getByTestId("complete-page-preview-toggle"));
    const before = toolbarRenders;

    fireEvent.change(screen.getByTestId("leaf-description"), {
      target: { value: "Live words" },
    });

    expect(
      within(screen.getByTestId("complete-page-preview-content")).getByText(
        "Live words",
      ),
    ).toBeInTheDocument();
    expect(toolbarRenders).toBe(before);
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
        page={pageContext({ parentHost: "" })}
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
          backgroundUrl: null,
          backgroundFit: "cover",
          measure: null,
          skin: "default",
          density: 1,
          speed: 1,
          scale: 1,
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

// THE FIRST THING ANYBODY DOES, AND IT USED TO BE BROKEN.
//
// A new piece of content starts untitled — deliberately, because a seeded
// title would put words on somebody's page they did not write — and the write
// schema requires a heading. So "Add content, then Save" refused every time,
// and the only thing it produced was a banner saying "fix what is marked" over
// a page where nothing was marked, on a block that might be three levels down
// inside a collapsed card.
//
// **These drive the REAL resolver**, which is the point of putting them here
// rather than in `block-problems.test.ts`. That suite proves the walk against
// a hand-built tree; what it cannot prove is that `zodResolver` builds that
// shape at all. A shape assumption stated in prose is what this repository
// keeps paying for.
describe("a page the write schema refuses", () => {
  /**
   * Presses Save and waits for the form to have finished refusing.
   *
   * @returns nothing; resolves once the banner is on screen.
   */
  const saveAndRefuse = async (): Promise<void> => {
    fireEvent.click(screen.getByTestId("editor-save"));
    await screen.findByTestId("editor-error-banner");
  };

  it("does not save at all", async () => {
    renderEditor({ initialSections: untitled() });
    await saveAndRefuse();
    expect(save).not.toHaveBeenCalled();
  });

  // The assertion the whole thread of `problems` exists for: the refusal
  // reaches the one field that is wrong, rather than one sentence about a
  // page.
  it("marks the piece of content that has no title", async () => {
    renderEditor({ initialSections: untitled() });
    await saveAndRefuse();

    expect(screen.getByTestId("leaf-title")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByTestId("leaf-title")).toHaveAccessibleDescription(
      labels.problemTitle,
    );
    expect(screen.getByTestId("leaf-title-problem")).toBeInTheDocument();
  });

  it("says in the banner that what is wrong is marked", async () => {
    renderEditor({ initialSections: untitled() });
    await saveAndRefuse();
    expect(screen.getByTestId("editor-error-banner")).toHaveTextContent(
      labels.errors.sections,
    );
  });

  // A card holding a refusal shows its places whatever its collapse control
  // says — otherwise the banner is telling somebody about a marking they
  // cannot see.
  it("opens a collapsed section that is hiding the refusal", async () => {
    renderEditor({ initialSections: untitled() });
    fireEvent.click(screen.getByTestId("collapse-section"));
    expect(screen.queryByTestId("leaf-title")).toBeNull();

    await saveAndRefuse();

    expect(screen.getByTestId("leaf-title")).toBeInTheDocument();
  });

  // The mark clears as they act on it, or it would be a refusal somebody
  // cannot get rid of without a reload.
  it("clears the mark once a title is written", async () => {
    renderEditor({ initialSections: untitled() });
    await saveAndRefuse();

    fireEvent.change(screen.getByTestId("leaf-title"), {
      target: { value: "About me" },
    });

    await waitFor(() =>
      expect(screen.queryByTestId("leaf-title-problem")).toBeNull(),
    );
  });

  // A REFUSAL ON THE CONTAINER'S OWN FIELDS, which marked nothing at all until
  // this and raised a banner blaming a missing title — a field that was fine.
  // The name is over its cap here, which is the shape an ordinary author
  // reaches by pasting; an unknown `mode` gets there too, from a rollback.
  it("marks a section whose own name was refused", async () => {
    renderEditor({ initialSections: overlongName() });
    await saveAndRefuse();

    expect(screen.getByTestId("section-name")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByTestId("section-name")).toHaveAccessibleDescription(
      labels.problemGeneric,
    );
    expect(screen.getByTestId("section-name-problem")).toBeInTheDocument();
  });

  // And the banner stops naming a cause that is not the cause. `sections`
  // names the missing English title; it is only honest when every refusal is
  // one.
  it("names no cause in the banner when the refusal is not a title", async () => {
    renderEditor({ initialSections: overlongName() });
    await saveAndRefuse();

    const banner = screen.getByTestId("editor-error-banner");
    expect(banner).toHaveTextContent(labels.errors.sectionsMarked);
    expect(banner).not.toHaveTextContent(labels.errors.sections);
  });

  // A field the card does not draw at all — the style popup's background
  // address — still has to leave a mark, or the banner promises one nothing
  // made.
  it("marks a section whose style was refused, on a field it does not draw", async () => {
    renderEditor({ initialSections: overlongBackground() });
    await saveAndRefuse();

    expect(screen.getByTestId("section-problem")).toBeInTheDocument();
    expect(screen.getByTestId("editor-error-banner")).toHaveTextContent(
      labels.errors.sectionsMarked,
    );
  });

  // The other half of the trio, and the reason there are three messages for
  // one field: a page-level refusal carries no index, so nothing is marked and
  // a banner promising a marking would be the same fault again.
  it("says something different when the refusal marks nothing", async () => {
    // The BYTE cap rather than the block cap, and only because it is reached
    // with twenty leaves instead of five hundred — jsdom renders each one and
    // its live preview. Both refusals are `refine`s on the whole array and
    // both carry no index, which is the property under test.
    const long = "x".repeat(2000);
    const heavy = Array.from({ length: 20 }, () => ({
      kind: "text" as const,
      title_en: long,
      description_en: long,
    }));
    renderEditor({ initialSections: heavy });
    await saveAndRefuse();

    expect(screen.getByTestId("editor-error-banner")).toHaveTextContent(
      labels.errors.sectionsTooLarge,
    );
    expect(screen.queryByTestId("leaf-title-problem")).toBeNull();
  });
});
