import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_THEME,
  PAGE_FONTS,
  PAGE_MEASURES,
  PAGE_SPACINGS,
  type PageFont,
  type PageMeasure,
  type PageSpacing,
} from "@/features/actors/domain/actor-theme";
import { pageContext } from "./helpers/page-context";
import type { ComponentProps, ReactNode } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  BLOCK_LIMITS,
  BLOCK_STYLE_LIMITS,
} from "@/features/actors/domain/block-schema";
import { SKINS, type SkinId } from "@/shared/domain/skins";
import { isContainer, type Block } from "@/features/actors/domain/block-schema";
import { blockEditorLabels } from "./support/editor-labels";
import { FURSONA_TEMPLATES } from "@/features/actors/domain/fursona-templates";
import { CHROME_SCOPE } from "@/shared/domain/chrome";
import {
  EscapeSlotProvider,
  EscapeSlotTarget,
} from "@/shared/presentation/escape-slot";

/**
 * What the live section previews currently render.
 *
 * **The observation point moved from a `postMessage` to the DOM, and that is a
 * strengthening rather than a port.** The complete preview was its own
 * document, so the most a unit test could see was the DRAFT crossing the
 * boundary — never the render, which lived in a document jsdom does not run.
 * The editor draws the real renderer inline, so a claim about what an author
 * sees is now observable exactly where it is made.
 *
 * @returns every section preview's text, joined.
 */
function previewText(): string {
  return screen
    .getAllByTestId("block-preview")
    .map((node) => node.textContent ?? "")
    .join(" ");
}

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
  hideControls: "Hide controls",
  showControls: "Show controls",
  more: "More",
  openSource: "Page source",
  interactWithPage: "Interact with page",
  interactWithPageHintOff: "Page links and controls are locked.",
  interactWithPageHintOn:
    "Page links and controls work as they do for a visitor.",
  source: {
    title: "Page source",
    close: "Close the page source",
    collapse: "Collapse",
    expand: "Expand",
    copyReference: "Copy the format reference",
    copied: "Copied",
    referenceTitle: "The format, for an assistant",
    resync: "Reload from the page",
    drifted: "The page changed while you were typing.",
    stale: "Showing your last valid version.",
    sourceLabel: "This page as JSON",
    resize: "Resize the panel",
  },
  bannerTitle: "Fix these before saving",
  pageStyle: "Your page’s own look",
  writingIn: "Writing in",
  writingInHint: "Only the page text.",
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
    surface: "Panels",
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
    font: "font",
    fontDefault: "fontDefault",
    fonts: Object.fromEntries(PAGE_FONTS.map((f) => [f, f])) as Record<
      PageFont,
      string
    >,
    spacing: "spacing",
    spacingDefault: "spacingDefault",
    spacings: Object.fromEntries(PAGE_SPACINGS.map((s) => [s, s])) as Record<
      PageSpacing,
      string
    >,
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
/**
 * The editor under a slot, which is the arrangement `PageShell` gives it.
 *
 * **The target comes FIRST, as it does in production**, where it is in the
 * header and the editor is in the content beneath — so the assertion that the
 * escape control lands outside the armed region is testing the real
 * relationship rather than an accident of this file.
 *
 * **Supplying the slot here is only honest because something else proves the
 * shell really has one.** A suite that hands a component the wiring it depends
 * on is exactly how this repository has hidden setup requirements before, so
 * `editor-is-the-page.spec.ts` finds `show-controls` inside a real `<header>`
 * in the running app, and asserts it covers none of the controls already
 * there.
 *
 * @param props - overrides for the editor.
 * @returns what `render` returned.
 */
function renderEditor(props: Record<string, unknown> = {}) {
  return render(
    <EscapeSlotProvider>
      <EscapeSlotTarget />
      <FursonaEditor
        labels={labels}
        handleEditable
        page={pageContext({ parentHost: "" })}
        {...props}
      />
    </EscapeSlotProvider>,
  );
}

/** Selects Page and opens only its Options pane. */
function openPageOptions(): void {
  fireEvent.click(screen.getByTestId("select-page"));
  fireEvent.click(screen.getByTestId("inspector-tab-options"));
}

/**
 * Enters one top-level section and opens only that container's Options.
 *
 * @param position - the occupied Page row to enter.
 */
function openSectionOptions(position = 0): void {
  fireEvent.click(screen.getByTestId("select-page"));
  fireEvent.click(screen.getAllByTestId("inspector-item-open")[position]!);
  fireEvent.click(screen.getByTestId("inspector-tab-options"));
}

/**
 * Enters one top-level section and then one of its occupied children.
 *
 * A leaf opens directly on Options, so no tab press follows the second row
 * activation.
 *
 * @param section - the occupied Page row to enter.
 * @param child - the occupied row inside that section.
 */
function openLeafOptions(section = 0, child = 0): void {
  fireEvent.click(screen.getByTestId("select-page"));
  fireEvent.click(screen.getAllByTestId("inspector-item-open")[section]!);
  fireEvent.click(screen.getAllByTestId("inspector-item-open")[child]!);
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
    openPageOptions();
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
    openPageOptions();
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

  it("starts without inspector controls and exposes page options through Page", () => {
    renderEditor();
    expect(screen.queryByTestId("canvas-inspector")).toBeNull();
    expect(screen.queryByTestId("editor-handle")).toBeNull();
    expect(screen.queryByTestId("theme-open")).toBeNull();

    openPageOptions();
    expect(screen.getByTestId("editor-handle")).toBeInTheDocument();
    expect(screen.getByTestId("theme-open")).toBeInTheDocument();
    expect(screen.getByTestId("canvas-inspector")).toBeInTheDocument();
  });

  it("saves what was typed", async () => {
    renderEditor();
    openPageOptions();
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
    openPageOptions();
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
    openPageOptions();
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
    openPageOptions();
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
    openPageOptions();
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
  // **THE INVERSION, asserted at its two halves.** A public route themes its
  // document and the editor now does the same with the draft, so a section
  // preview sits on the author's field, their background picture and the nebula
  // canvas mounted in the root layout — none of which any arrangement of boxes
  // inside the page could have put behind it.
  //
  // The stylesheet reaching `:root` is what makes the second half necessary:
  // every control is standing on the author's palette, and only `CHROME_SCOPE`
  // keeps it in AeleOS's. `tests/e2e/section-card-face.spec.ts` is where that
  // is measured in a browser, because a class assertion cannot see a cascade.
  it("themes the document with the draft and keeps the controls out of it", () => {
    const { container } = renderEditor({
      initialTheme: {
        ...DEFAULT_THEME,
        background: {
          kind: "linear" as const,
          repeating: false,
          every: 0,
          angle: 135,
          shape: "ellipse" as const,
          extent: "farthest-corner" as const,
          x: 50,
          y: 50,
          stops: [
            { color: "#2a0845", at: 0 },
            { color: "#ff2d95", at: 100 },
          ],
        },
      },
    });

    const css = [...container.querySelectorAll("style")]
      .map((node) => node.textContent ?? "")
      .join("");
    expect(css).toContain(":root");
    expect(css).toContain("--field:");
    // The whole theme, not the filtered atmosphere subset the theme panel used
    // to mount while open — that mechanism is gone, and this is the assertion
    // that would notice it coming back as a second stylesheet.
    expect(css).toContain("--accent:");

    const chromed = container.querySelectorAll(`.${CHROME_SCOPE}`);
    expect(chromed.length).toBeGreaterThan(0);
    // The toolbar's Save is inside one of them, which is the control most
    // obviously standing on the author's page.
    expect(
      screen.getByTestId("editor-save").closest(`.${CHROME_SCOPE}`),
    ).not.toBeNull();
    // A tray is NOT an island: it is the page, and must inherit everything the
    // document carries.
    for (const tray of screen.queryAllByTestId("block-preview")) {
      expect(tray.closest(`.${CHROME_SCOPE}`)).toBeNull();
    }
  });

  // **HIDING THE CONTROLS LEAVES THE PAGE.** The mechanism is one CSS rule over
  // `CHROME_SCOPE`, so what is asserted here is the attribute that arms it and
  // the two structural facts the rule depends on: every control is inside the
  // armed element, and the control that brings them back is not.
  //
  // What the rule DOES is a question for a browser — jsdom applies no
  // stylesheet — and `editor-is-the-page.spec.ts` is where it is photographed
  // against the live page at seven widths.
  it("arms the hide-controls rule and keeps its own way back out of it", () => {
    // Stubs `HTMLDialogElement.prototype.show`/`close`, which jsdom 26
    // implements as entirely absent properties — see
    // `page-source-dock.test.tsx`'s own copy of this stub for the full
    // account. Needed here because the dock is opened below: its
    // containment inside `[data-controls]` is the entire reason the dock
    // was placed there rather than as a sibling of `ThemeScope` (see
    // `apps/hub/src/features/actors/CLAUDE.md`), and that containment was
    // asserted by NOTHING once `PageSourceField` stopped mounting
    // unconditionally — this is the regression test for that gap.
    HTMLDialogElement.prototype.show = vi.fn(function (
      this: HTMLDialogElement,
    ) {
      this.setAttribute("open", "");
    });
    HTMLDialogElement.prototype.close = vi.fn(function (
      this: HTMLDialogElement,
    ) {
      this.removeAttribute("open");
    });

    try {
      const { container } = renderEditor();
      const armed = () =>
        container
          .querySelector("[data-controls]")!
          .getAttribute("data-controls");
      const form = screen.getByTestId("editor-content");
      const controls = container.querySelector("[data-controls]")!;

      // Opened BEFORE hiding controls, so the dock's own `CHROME_SCOPE`
      // island exists for the containment loop below to find. Counted
      // before and after, so a click that silently failed to mount it
      // cannot leave this test green for the wrong reason.
      const islandsBeforeOpen = container.querySelectorAll(
        `.${CHROME_SCOPE}`,
      ).length;
      fireEvent.click(screen.getByTestId("editor-open-source"));
      const dock = screen.getByTestId("page-source-dock");
      const islandsAfterOpen = container.querySelectorAll(
        `.${CHROME_SCOPE}`,
      ).length;
      expect(islandsAfterOpen).toBeGreaterThan(islandsBeforeOpen);

      expect(armed()).toBe("shown");
      expect(screen.queryByTestId("show-controls")).toBeNull();
      expect(form).toHaveClass(
        "h-[calc(100dvh-var(--bar-h))]",
        "min-h-0",
        "overflow-hidden",
      );
      expect(controls).toHaveClass("flex", "min-h-0", "flex-1", "flex-col");

      fireEvent.click(screen.getByTestId("select-page"));
      expect(screen.getByTestId("canvas-inspector")).toBeInTheDocument();
      fireEvent.click(screen.getByTestId("hide-controls"));
      expect(armed()).toBe("hidden");
      expect(screen.queryByTestId("canvas-inspector")).toBeNull();
      expect(form).not.toHaveClass(
        "h-[calc(100dvh-var(--bar-h))]",
        "overflow-hidden",
      );
      expect(controls).not.toHaveClass("flex-1", "min-h-0");

      // Every island is INSIDE the armed element, or the rule cannot reach it.
      const region = container.querySelector("[data-controls]")!;
      const islands = [...container.querySelectorAll(`.${CHROME_SCOPE}`)];
      // The dock itself has to be one of them — otherwise this loop is not
      // actually covering it, and the earlier count increase proved only
      // that SOMETHING mounted, not that it was the dock.
      expect(islands).toContain(dock);
      for (const island of islands) {
        if (
          island.hasAttribute("data-testid") &&
          island.getAttribute("data-testid") === "show-controls"
        )
          continue;
        expect(region.contains(island)).toBe(true);
      }

      // And the way back is OUTSIDE it, so the rule cannot hide the only
      // control that could undo it — which would strand somebody on a page
      // with no workbench and no way to reach one.
      const restore = screen.getByTestId("show-controls");
      expect(region.contains(restore)).toBe(false);

      fireEvent.click(restore);
      expect(armed()).toBe("shown");
      expect(screen.queryByTestId("show-controls")).toBeNull();
      expect(screen.queryByTestId("canvas-inspector")).toBeNull();
    } finally {
      Reflect.deleteProperty(HTMLDialogElement.prototype, "show");
      Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
    }
  });

  // A page carrying one real `link` leaf, so the interaction lock has
  // something on the canvas to act on. The real renderer, not a mock — the
  // lock's whole job is a real anchor, and a mocked one would remove the
  // setup requirement this feature exists to enforce.
  const linkPage = () => [
    {
      kind: "container",
      mode: "stack",
      spaces: 1,
      name_en: "Section",
      children: [
        {
          kind: "link",
          title_en: "A link",
          description_en: "",
          link_url: "https://example.com",
        },
      ],
    },
  ];

  /** The canvas's own link, or nothing if the page has none. */
  const canvasLink = (): HTMLAnchorElement | null =>
    document.querySelector('[data-testid="editor-canvas"] a[href]');

  describe("Interact with page", () => {
    it("locks the canvas and shows the switch unpressed by default", () => {
      renderEditor({ initialSections: linkPage() });
      expect(canvasLink()?.hasAttribute("inert")).toBe(true);
      expect(screen.getByTestId("interact-with-page")).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    });

    it("unlocks the canvas when the switch is pressed, with controls still visible", () => {
      const { container } = renderEditor({ initialSections: linkPage() });
      fireEvent.click(screen.getByTestId("interact-with-page"));

      expect(canvasLink()?.hasAttribute("inert")).toBe(false);
      expect(screen.getByTestId("interact-with-page")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      // Turning interaction on with the switch is not the same as Preview —
      // the workbench stays visible.
      expect(
        container
          .querySelector("[data-controls]")!
          .getAttribute("data-controls"),
      ).toBe("shown");
    });

    it("hiding controls makes the canvas interactive regardless of the switch", () => {
      renderEditor({ initialSections: linkPage() });
      expect(canvasLink()?.hasAttribute("inert")).toBe(true);

      fireEvent.click(screen.getByTestId("hide-controls"));
      expect(canvasLink()?.hasAttribute("inert")).toBe(false);
    });

    it("resets the switch to off when controls return, even if it was pressed before Preview", () => {
      renderEditor({ initialSections: linkPage() });
      fireEvent.click(screen.getByTestId("interact-with-page"));
      expect(screen.getByTestId("interact-with-page")).toHaveAttribute(
        "aria-pressed",
        "true",
      );

      fireEvent.click(screen.getByTestId("hide-controls"));
      fireEvent.click(screen.getByTestId("show-controls"));

      expect(screen.getByTestId("interact-with-page")).toHaveAttribute(
        "aria-pressed",
        "false",
      );
      // And the reset actually re-locks the canvas — the switch reading
      // "off" would be cosmetic on its own if the lock disagreed with it.
      expect(canvasLink()?.hasAttribute("inert")).toBe(true);
    });

    it("pressing the switch does not hide controls and does not clear a Page selection", () => {
      const { container } = renderEditor();
      fireEvent.click(screen.getByTestId("select-page"));
      expect(screen.getByTestId("canvas-inspector")).toBeInTheDocument();

      fireEvent.click(screen.getByTestId("interact-with-page"));

      expect(
        container
          .querySelector("[data-controls]")!
          .getAttribute("data-controls"),
      ).toBe("shown");
      expect(screen.getByTestId("canvas-inspector")).toBeInTheDocument();
    });

    // The two mechanisms are independent layers: `inert` is what stops a
    // real click from reaching the link's own handler in a browser, and this
    // is the second one — `onCanvasClick` itself declining to act — which is
    // what a click reaching the canvas's ANCESTOR handler (bubbling past an
    // element jsdom does not actually block, since jsdom implements no
    // `inert` behaviour) must still be refused by.
    it("selects a block from a canvas click only while locked", () => {
      renderEditor({ initialSections: linkPage() });
      expect(screen.queryByTestId("canvas-inspector")).toBeNull();

      fireEvent.click(canvasLink()!);
      expect(screen.getByTestId("canvas-inspector")).toBeInTheDocument();
    });

    it("does not select a block from a canvas click while page interaction is on", () => {
      renderEditor({ initialSections: linkPage() });
      fireEvent.click(screen.getByTestId("interact-with-page"));

      fireEvent.click(canvasLink()!);
      expect(screen.queryByTestId("canvas-inspector")).toBeNull();
    });
  });

  // **Not a submit.** Every button inside a `<form>` submits by default, so an
  // unspecified `type` would save the page on the way to looking at it.
  //
  // **Asserted on the form's own submit EVENT, not on the save mock.** The
  // first version of this checked `save` straight after the click and passed
  // with `type="button"` removed — react-hook-form validates asynchronously, so
  // the assertion ran before anything could have called it and could not have
  // failed either way. Rule 29: a sabotage that leaves the suite green has
  // proved nothing. jsdom dispatches `submit` synchronously when a submitting
  // button is clicked, which is the signal that actually discriminates.
  it("does not save the page on the way to looking at it", () => {
    renderEditor();
    const submitted = vi.fn();
    screen.getByTestId("editor-content").addEventListener("submit", submitted);

    fireEvent.click(screen.getByTestId("hide-controls"));

    expect(submitted).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  // It was a strip of its own between the theme panel and the sections until
  // 2026-08-28, and this case asserted that order. The switch is a control in
  // the toolbar now, so the old assertion is not merely stale — it asserts the
  // opposite of what is true, since the bar comes FIRST.
  //
  // **CONTAINMENT, not position**, and that distinction is the whole case: a
  // strip placed above the theme panel would satisfy every ordering assertion
  // that could be written here while not being in the bar at all. Asking which
  // element encloses it is the only question that can tell the two apart.
  it("puts the writing switch inside the toolbar, not in a strip of its own", () => {
    renderEditor();
    const toolbar = screen.getByTestId("editor-save").closest("div.sticky");
    expect(toolbar).not.toBeNull();
    expect(toolbar).toContainElement(screen.getByTestId("writing-in"));
  });

  it("keeps Page options separate from a section's options", () => {
    renderEditor();
    fireEvent.click(screen.getByTestId("select-page"));
    const inspector = screen.getByTestId("canvas-inspector");
    expect(screen.getAllByTestId("inspector-item-row").length).toBeGreaterThan(
      0,
    );
    expect(screen.getByTestId("theme-open")).not.toBeVisible();

    fireEvent.click(screen.getByTestId("inspector-tab-options"));
    const theme = screen.getByTestId("theme-open");
    expect(inspector).toContainElement(theme);
    expect(screen.queryByTestId("section-card")).toBeNull();
  });

  // The identity fields carried their opaque backing with none of the chrome
  // around it, so on a themed page they read as a bare rectangle floating on
  // the author's field while every sibling group was a rounded, bordered card.
  // Asserted against the theme panel rather than against a copied class list:
  // the claim is that these two match, and a literal list would keep passing
  // after the shared pattern moved out from under it.
  it("gives the identity fields the same card as every other workbench group", () => {
    renderEditor();
    fireEvent.click(screen.getByTestId("select-page"));
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

  it("previews unsaved identity and measure through the real page renderer", async () => {
    renderEditor({
      initial: {
        handle: "saved-handle",
        displayName: "Saved name",
        avatarUrl: "",
        visibility: "private",
      },
    });

    fireEvent.click(screen.getByTestId("select-page"));
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
    // **Observed in the RENDER, which is where the claim is made.** An author
    // sees what the form holds, not what was saved — and the section previews
    // draw the real renderer inline, so the live display name and portrait are
    // in the DOM rather than in a payload bound for another document.
    expect(previewText()).toContain("Live name");
    expect(
      screen
        .getAllByTestId("block-preview")
        .flatMap((node) => [...node.querySelectorAll("img")])
        .map((img) => img.getAttribute("src")),
    ).toContain("https://example.com/live.png");
  });

  it("previews unsaved page content from the live block tree", async () => {
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

    openLeafOptions();
    fireEvent.change(screen.getByTestId("leaf-description"), {
      target: { value: "Unsaved page words" },
    });
    const shown = previewText();
    expect(shown).toContain("Unsaved page words");
    expect(shown).not.toContain("Saved page words");
  });

  it("updates a leaf preview without rerendering the whole editor", async () => {
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
    openLeafOptions();
    const before = toolbarRenders;

    fireEvent.change(screen.getByTestId("leaf-description"), {
      target: { value: "Live words" },
    });

    // The subject is the RENDER ISOLATION below; this only establishes that
    // the edit landed, observable in the preview the editor renders inline.
    expect(previewText()).toContain("Live words");
    expect(toolbarRenders).toBe(before);
  });
});

describe("the page-source dock's own mount and its theme guard", () => {
  /**
   * Stubs `HTMLDialogElement.prototype.show`/`showModal`/`close`.
   *
   * jsdom 26 implements none of the three, not as no-ops but as entirely
   * absent properties — see `page-source-dock.test.tsx`'s own copy of this
   * stub for the full account. Scoped to this describe block rather than the
   * whole file: nothing else here ever mounts a `<dialog>`.
   */
  beforeEach(() => {
    HTMLDialogElement.prototype.show = vi.fn(function (
      this: HTMLDialogElement,
    ) {
      this.setAttribute("open", "");
    });
    HTMLDialogElement.prototype.showModal = vi.fn(function (
      this: HTMLDialogElement,
    ) {
      this.setAttribute("open", "");
    });
    HTMLDialogElement.prototype.close = vi.fn(function (
      this: HTMLDialogElement,
    ) {
      this.removeAttribute("open");
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(HTMLDialogElement.prototype, "show");
    Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
    Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
  });

  // **THE REGRESSION TEST for a cost review round found by construction
  // rather than by measurement.** `PageSourceField`'s `useWatch({ control,
  // name: "sections" })` would fire `usePageSource`'s `[theme, blocks]`
  // effect — a full `toDocument` serialisation of the whole page — on every
  // keystroke in the editor, for every author who never opens the dock, if
  // it existed in the tree from the start. It does not: `sourceMounted`
  // gates its very presence, set only on the first press of the toolbar
  // control and never unset. The absence of the dock's own test id from the
  // DOM before that press is the proof — nothing here MEASURES a cost,
  // because there is nothing mounted yet to have one.
  it("does not mount the source dock until it is opened, and keeps it once it has been", () => {
    renderEditor();

    expect(screen.queryByTestId("page-source-dock")).toBeNull();

    fireEvent.click(screen.getByTestId("editor-open-source"));
    expect(screen.getByTestId("page-source-dock")).toBeInTheDocument();

    // **Closing does not tear it down.** `sourceMounted` is never unset by
    // `onClose`, so the dock keeps the text and problems it was showing
    // rather than losing them the moment somebody closes it.
    fireEvent.click(screen.getByTestId("page-source-close"));
    expect(screen.getByTestId("page-source-dock")).toBeInTheDocument();
  });

  // **THE REGRESSION TEST for the one branch that can destroy an author's
  // colours.** `PageSourceField`'s `apply` writes `sections` unconditionally
  // and `theme` only `if (nextTheme)` — `usePageSource` answers `theme:
  // null` for a document that never mentioned one, by design (see its own
  // TSDoc), and a caller that wrote `null` through to the form would reset
  // the author's palette to whatever `themeSchema` resolves `null` to on the
  // very next render. `PageSourceField` is under `presentation/**/*.tsx`,
  // excluded from the coverage gate, and every other case in this
  // repository pastes a document round-tripped through `toDocument`, which
  // ALWAYS emits a `theme` key — so this is the only place the FALSE arm of
  // that `if` is ever exercised at all.
  // **THE PICKER'S OWN COPY OF THAT GUARANTEE.** The dock's case above proves
  // `applyDocumentTo`'s `if (theme)` branch; this proves the picker actually
  // REACHES it. They are not the same claim — the picker's route runs through
  // `BlockEditor`'s `onApplyDocument`, which could drop the theme, invent one,
  // or pass a resolved default, and none of that would redden the dock's case.
  //
  // It matters because every shipped starter carries `theme: null`, so this is
  // the ordinary path rather than an edge: an author who chose colours and
  // then picked a starting layout must keep them.
  it("leaves the author's theme alone when a picked template carries none", () => {
    const CUSTOMISED_THEME = {
      ...DEFAULT_THEME,
      accent: "#ff0000",
      background: {
        kind: "linear" as const,
        repeating: false,
        every: 0,
        angle: 135,
        shape: "ellipse" as const,
        extent: "farthest-corner" as const,
        x: 50,
        y: 50,
        stops: [
          { color: "#2a0845", at: 0 },
          { color: "#ff2d95", at: 100 },
        ],
      },
    };
    const { container } = renderEditor({ initialTheme: CUSTOMISED_THEME });

    const cssText = () =>
      [...container.querySelectorAll("style")]
        .map((node) => node.textContent ?? "")
        .join(" ");
    const before = cssText();
    expect(before).toContain("--accent:");

    // **The confirmation MUST appear, and asserting that is the point.** This
    // page's blocks are untouched — it is the scaffold — so the only thing
    // making it the author's is the palette they chose, which is exactly what
    // `holdsNothingAuthored`'s theme argument decides.
    //
    // An earlier version of this case clicked the confirmation only `if` it
    // was there, and that conditional hid a real bug for a commit: the call
    // site never passed the theme, so the guard was unreachable and somebody
    // who had chosen colours got no warning at all. A tolerated absence is not
    // an assertion.
    fireEvent.click(screen.getByTestId("select-page"));
    fireEvent.click(screen.getByTestId("template-picker"));
    const [template] = FURSONA_TEMPLATES;
    fireEvent.click(screen.getByTestId(`template-${template!.id}`));
    fireEvent.click(screen.getByTestId("template-confirm-yes"));

    // The page changed — anti-vacuity, because "the stylesheet is unchanged"
    // is also what a picker that did nothing at all would report.
    expect(screen.getAllByTestId("inspector-item-row").length).toBeGreaterThan(
      0,
    );

    // And the look did not.
    expect(cssText()).toBe(before);
  });

  it("leaves the author's theme alone when a pasted document omits it", () => {
    vi.useFakeTimers();
    try {
      // A gradient, not accent alone. `themeVars` derives every colour from
      // `theme.background` and emits nothing accent-related when it is
      // absent — "a theme with no background emits only the cloud colours
      // and the canvas, since there is nothing to solve the rest against"
      // (see `themeVars`'s own TSDoc). A background is what puts this test on
      // the path the guard actually protects.
      const CUSTOMISED_THEME = {
        ...DEFAULT_THEME,
        accent: "#ff0000",
        background: {
          kind: "linear" as const,
          repeating: false,
          every: 0,
          angle: 135,
          shape: "ellipse" as const,
          extent: "farthest-corner" as const,
          x: 50,
          y: 50,
          stops: [
            { color: "#2a0845", at: 0 },
            { color: "#ff2d95", at: 100 },
          ],
        },
      };
      const { container } = renderEditor({ initialTheme: CUSTOMISED_THEME });

      const cssText = () =>
        [...container.querySelectorAll("style")]
          .map((node) => node.textContent ?? "")
          .join(" ");
      // Compared by IDENTITY, not by matching a literal hex — the solved
      // palette converts the author's accent to OKLCH rather than repeating
      // it verbatim, so the assertion this test needs is "the whole derived
      // stylesheet is unchanged," not "one string still appears."
      const before = cssText();
      expect(before).toContain("--accent:");

      fireEvent.click(screen.getByTestId("editor-open-source"));
      const textarea = screen.getByTestId(
        "page-source-textarea",
      ) as HTMLTextAreaElement;

      // A genuine document missing its `theme` key entirely — not merely a
      // document whose theme happens to match the author's own, which would
      // pass this case whether or not the guard exists.
      const withoutTheme = JSON.parse(textarea.value) as {
        theme?: unknown;
        blocks: unknown;
        aeleos: number;
      };
      delete withoutTheme.theme;
      const pasted = JSON.stringify(withoutTheme);
      expect(pasted).not.toContain('"theme"');

      fireEvent.change(textarea, { target: { value: pasted } });
      act(() => {
        vi.advanceTimersByTime(300);
      });

      // The whole derived stylesheet is exactly what it was — never reset to
      // whatever an unguarded `setValue("theme", null, …)` would have
      // resolved to on the very next render.
      expect(cssText()).toBe(before);
    } finally {
      vi.useRealTimers();
    }
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
          surface: null,
          canvasColours: null,
          canvas: "nebula",
          cursor: null,
          backgroundUrl: null,
          backgroundFit: "cover",
          measure: null,
          font: null,
          spacing: null,
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
    openLeafOptions();

    expect(screen.getByTestId("leaf-title")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByTestId("leaf-title")).toHaveAccessibleDescription(
      labels.leaf.problemTitle,
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

  it("shows a refusal after drilling into the exact leaf that owns it", async () => {
    renderEditor({ initialSections: untitled() });
    expect(screen.queryByTestId("leaf-title")).toBeNull();

    await saveAndRefuse();
    expect(screen.queryByTestId("leaf-title")).toBeNull();
    openLeafOptions();

    expect(screen.getByTestId("leaf-title")).toBeInTheDocument();
  });

  // The mark clears as they act on it, or it would be a refusal somebody
  // cannot get rid of without a reload.
  it("clears the mark once a title is written", async () => {
    renderEditor({ initialSections: untitled() });
    await saveAndRefuse();
    openLeafOptions();

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
    openSectionOptions();

    expect(screen.getByTestId("section-name")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByTestId("section-name")).toHaveAccessibleDescription(
      labels.leaf.problemGeneric,
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
    openSectionOptions();

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

describe("leaving the page's own look while building", () => {
  // The document is where this lands, so it survives a render. Cleared rather
  // than trusted, or the "it starts on" assertion below reads whatever the
  // previous case left and can pass for the wrong reason.
  beforeEach(() => {
    document.documentElement.removeAttribute("data-page-theme");
  });

  // `initialTheme` is its own prop — the theme is not part of `initial`.
  const customised = { initialTheme: { ...DEFAULT_THEME, accent: "#ff0000" } };

  // **A control offering to remove colours the page never had does nothing**,
  // which is the shape this repository keeps trimming — and `PageThemeSwitch`'s
  // own doc says the caller decides. The default fixture is the discriminating
  // half: without it, "renders when customised" passes for a switch that always
  // renders.
  it("is absent while the page still wears the default look", () => {
    renderEditor();
    expect(screen.queryByTestId("page-theme-switch")).toBeNull();
  });

  it("appears once the page has a look of its own", () => {
    renderEditor(customised);
    expect(screen.getByTestId("page-theme-switch")).toBeInTheDocument();
  });

  // **Asserted on the DOCUMENT, not on the button's own state.** The editor
  // themes `:root`, and `themeCss` gates every rule it writes on
  // `:not([data-page-theme="default"])` — so this attribute is the whole
  // mechanism, and a switch that flipped its own `aria-pressed` and wrote
  // nothing here would look right and change nothing on screen.
  it("takes the page's look off the document and puts it back", () => {
    renderEditor(customised);
    const root = document.documentElement;
    expect(root.getAttribute("data-page-theme")).not.toBe("default");

    fireEvent.click(screen.getByTestId("page-theme-switch"));
    expect(root.getAttribute("data-page-theme")).toBe("default");

    fireEvent.click(screen.getByTestId("page-theme-switch"));
    expect(root.getAttribute("data-page-theme")).toBe("author");
  });
});
