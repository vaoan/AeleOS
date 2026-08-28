import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEvent, fireEvent, render, screen } from "@testing-library/react";
import {
  PageSourceDock,
  sourceAddress,
  type PageSourceDockLabels,
} from "@/features/actors/presentation/page-source-dock";
import type { PageSourceState } from "@/features/actors/application/use-page-source";
import type { DocumentProblem } from "@/features/actors/domain/page-document";

/**
 * Stubs `HTMLDialogElement.prototype.show`/`showModal`/`close`.
 *
 * **jsdom 26.1.0 (the version installed here, confirmed by direct probe)
 * implements none of the three** — not as no-ops, as entirely absent
 * properties, so calling `.show()` on a real `<dialog>` node throws
 * `TypeError: dialog.show is not a function`. Every case below renders the
 * dock with `open` at some point, so the stub has to be armed before any of
 * them, not only the one case that asserts which method was called.
 *
 * Each stub mutates the reflected `open` attribute the same way a browser's
 * real implementation would, which is what lets `getByRole("dialog")` find
 * the element afterwards — `dom-testing-library` only exposes a `<dialog>`
 * with the `open` attribute present, confirmed by direct probe as well.
 */
function stubDialogMethods(): void {
  HTMLDialogElement.prototype.show = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  });
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute("open", "");
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  });
}

const labels: PageSourceDockLabels = {
  title: "Page source",
  close: "Close",
  collapse: "Collapse",
  expand: "Expand",
  copyReference: "Copy reference",
  copied: "Copied",
  referenceTitle: "Reference for an assistant",
  resync: "Use the page as shown",
  drifted: "The page changed while you were typing",
  stale: "This will not be applied until it is fixed",
  sourceLabel: "Page source (JSON)",
  resize: "Resize the panel",
};

/**
 * Builds a {@link PageSourceState} fixture, consistent the way the real hook
 * keeps it: `stale` mirrors whether `problems` is non-empty, since that is
 * exactly what `usePageSource` returns (`stale: problems.length > 0`) and the
 * dock is entitled to rely on it.
 *
 * @param overrides - fields to replace.
 * @returns a fixture.
 */
function baseSource(overrides: Partial<PageSourceState> = {}): PageSourceState {
  const problems = overrides.problems ?? [];
  return {
    text: '{\n  "aeleos": 1,\n  "blocks": []\n}',
    problems,
    stale: problems.length > 0,
    drifted: false,
    onChange: vi.fn(),
    onFocusChange: vi.fn(),
    resync: vi.fn(),
    ...overrides,
  };
}

/** What {@link renderDock} may override. */
interface RenderDockOverrides {
  open?: boolean;
  onClose?: () => void;
  source?: PageSourceState;
  reference?: string;
}

/**
 * Renders the dock with overrides.
 *
 * @param props - what to override.
 * @returns the `source` and `onClose` fixtures actually used, so a case can
 *   assert against the exact mock it rendered with.
 */
function renderDock(props: RenderDockOverrides = {}): {
  source: PageSourceState;
  onClose: () => void;
} {
  const source = props.source ?? baseSource();
  const onClose = props.onClose ?? vi.fn();
  render(
    <PageSourceDock
      open={props.open ?? true}
      onClose={onClose}
      source={source}
      reference={props.reference ?? '{"aeleos":1,"blocks":[]}'}
      labels={labels}
    />,
  );
  return { source, onClose };
}

describe("PageSourceDock", () => {
  beforeEach(() => {
    stubDialogMethods();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Excludes: a dock that inerts the page behind it. `showModal()` would add
  // a backdrop and trap focus, which is the one thing a live-bound panel over
  // the author's own document must not do. Sabotage-verified below.
  it("is non-modal: it calls show(), never showModal(), and carries no aria-modal", () => {
    renderDock();
    expect(HTMLDialogElement.prototype.show).toHaveBeenCalledTimes(1);
    expect(HTMLDialogElement.prototype.showModal).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("open");
    expect(dialog).not.toHaveAttribute("aria-modal", "true");
  });

  it("closes on Escape", () => {
    const { onClose } = renderDock();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // Excludes: a textarea that swallows Tab to insert one, which strands a
  // keyboard user trying to leave the field. Sabotage-verified below.
  it("does not trap Tab in the textarea", () => {
    renderDock();
    const textarea = screen.getByRole("textbox", { name: labels.sourceLabel });
    const event = createEvent.keyDown(textarea, { key: "Tab" });
    fireEvent(textarea, event);
    expect(event.defaultPrevented).toBe(false);
  });

  it("labels the textarea", () => {
    renderDock();
    expect(
      screen.getByRole("textbox", { name: labels.sourceLabel }),
    ).toBeInTheDocument();
  });

  it("sends typing to onChange", () => {
    const { source } = renderDock();
    const textarea = screen.getByRole("textbox", { name: labels.sourceLabel });
    fireEvent.change(textarea, { target: { value: "[]" } });
    expect(source.onChange).toHaveBeenCalledWith("[]");
  });

  it("names a syntax problem's message and no path", () => {
    const problems: DocumentProblem[] = [
      { at: "syntax", message: "Unexpected token } in JSON at position 42" },
    ];
    renderDock({ source: baseSource({ problems }) });
    expect(
      screen.getByText("Unexpected token } in JSON at position 42"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/blocks\[/)).not.toBeInTheDocument();
  });

  it("names an envelope problem's message alone", () => {
    const problems: DocumentProblem[] = [
      { at: "envelope", message: "no version marker" },
    ];
    renderDock({ source: baseSource({ problems }) });
    expect(screen.getByText("no version marker")).toBeInTheDocument();
  });

  it("names a block problem's path as blocks[0].children[1].kind", () => {
    const problems: DocumentProblem[] = [
      { at: "block", path: [0, 1], field: "kind" },
    ];
    renderDock({ source: baseSource({ problems }) });
    expect(screen.getByText("blocks[0].children[1].kind")).toBeInTheDocument();
  });

  it("names a refused-kind problem's path and kind", () => {
    const problems: DocumentProblem[] = [
      { at: "refused-kind", path: [0], kind: "owner" },
    ];
    renderDock({ source: baseSource({ problems }) });
    expect(screen.getByText("blocks[0]: owner")).toBeInTheDocument();
  });

  it("names an unsafe-key problem's key, pathless", () => {
    const problems: DocumentProblem[] = [
      { at: "unsafe-key", key: "__proto__" },
    ];
    renderDock({ source: baseSource({ problems }) });
    expect(screen.getByText("__proto__")).toBeInTheDocument();
    expect(screen.queryByText(/blocks\[/)).not.toBeInTheDocument();
  });

  it("announces the stale state, carrying aria-live=polite", () => {
    renderDock({
      source: baseSource({
        problems: [{ at: "envelope", message: "not a document" }],
      }),
    });
    const strip = screen.getByText(labels.stale);
    expect(strip.closest('[aria-live="polite"]')).toBeInTheDocument();
  });

  it("shows no problem strip when nothing is stale", () => {
    renderDock({ source: baseSource() });
    expect(screen.queryByText(labels.stale)).not.toBeInTheDocument();
  });

  it("offers resync while drifted, and pressing it calls source.resync", () => {
    const { source } = renderDock({ source: baseSource({ drifted: true }) });
    expect(screen.getByText(labels.drifted)).toBeInTheDocument();
    fireEvent.click(screen.getByText(labels.resync));
    expect(source.resync).toHaveBeenCalledTimes(1);
  });

  it("offers no resync while not drifted", () => {
    renderDock({ source: baseSource({ drifted: false }) });
    expect(screen.queryByText(labels.drifted)).not.toBeInTheDocument();
    expect(screen.queryByText(labels.resync)).not.toBeInTheDocument();
  });

  it("renders the reference and copies it", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderDock({ reference: '{"aeleos":1,"blocks":[]}' });
    expect(screen.getByText('{"aeleos":1,"blocks":[]}')).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: labels.copyReference }));
    expect(writeText).toHaveBeenCalledWith('{"aeleos":1,"blocks":[]}');
    await screen.findByRole("button", { name: labels.copied });
  });

  // The brief's twelfth, required case: both arms of the clipboard write.
  // Excludes: a control that claims success on a rejected write.
  it("does not claim success when the clipboard write rejects", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.assign(navigator, { clipboard: { writeText } });
    renderDock();
    fireEvent.click(screen.getByRole("button", { name: labels.copyReference }));
    // Let the rejected promise's microtask settle.
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(
      screen.queryByRole("button", { name: labels.copied }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: labels.copyReference }),
    ).toBeInTheDocument();
  });

  it("collapsing hides the body and keeps the header, and the control reads expand", () => {
    renderDock();
    expect(
      screen.getByRole("textbox", { name: labels.sourceLabel }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: labels.collapse }));
    expect(
      screen.queryByRole("textbox", { name: labels.sourceLabel }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(labels.title)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: labels.expand }),
    ).toBeInTheDocument();
  });

  it("expanding again brings the body back", () => {
    renderDock();
    fireEvent.click(screen.getByRole("button", { name: labels.collapse }));
    fireEvent.click(screen.getByRole("button", { name: labels.expand }));
    expect(
      screen.getByRole("textbox", { name: labels.sourceLabel }),
    ).toBeInTheDocument();
  });

  it("wears CHROME_SCOPE on its root element", () => {
    renderDock();
    expect(screen.getByRole("dialog").className).toContain("aeleos-chrome");
  });

  it("carries a keyboard-reachable resize grip", () => {
    renderDock();
    const grip = screen.getByRole("separator", { name: labels.resize });
    expect(grip).toHaveAttribute("aria-orientation", "vertical");
    expect(grip).toHaveAttribute("tabIndex", "0");
  });
});

describe("sourceAddress", () => {
  it("spells the top-level index as blocks[n]", () => {
    expect(sourceAddress([0])).toBe("blocks[0]");
  });

  it("spells nested indices as children[n], chained", () => {
    expect(sourceAddress([0, 1])).toBe("blocks[0].children[1]");
  });

  it("appends the field when one is given", () => {
    expect(sourceAddress([0, 1], "kind")).toBe("blocks[0].children[1].kind");
  });

  it("omits the trailing dot when no field is given", () => {
    expect(sourceAddress([2])).toBe("blocks[2]");
  });
});
