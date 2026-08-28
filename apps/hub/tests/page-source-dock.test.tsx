import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  createEvent,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
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
 *
 * **`vi.restoreAllMocks()` cannot undo this.** These are plain assignments
 * to a prototype property that never existed, not `vi.spyOn` wrapping an
 * existing one — `restoreAllMocks` only reverts the latter. Harmless under
 * Vitest's per-file isolation, since a fresh module graph gets a fresh
 * `HTMLDialogElement` either way, but a comment implying cleanup that is not
 * happening is the same fault this whole review round is about. See
 * {@link unstubDialogMethods}, called explicitly rather than relied on
 * implicitly.
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

/**
 * Removes the three properties {@link stubDialogMethods} added.
 *
 * `Reflect.deleteProperty` rather than the `delete` operator: TypeScript
 * refuses `delete` on a non-optional property (`ts(2790)`), which
 * `HTMLDialogElement.prototype.show` is in `lib.dom.d.ts`.
 */
function unstubDialogMethods(): void {
  Reflect.deleteProperty(HTMLDialogElement.prototype, "show");
  Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
}

/**
 * Stubs `Element.prototype.setPointerCapture`/`hasPointerCapture`.
 *
 * jsdom implements neither at all — confirmed by direct probe, the same way
 * the dialog methods were — so the resize grip's `onPointerDown` throws
 * calling `setPointerCapture` unless this runs first. `hasPointerCapture`
 * defaults to returning `true`, matching a browser immediately after
 * `setPointerCapture` succeeded; a case that needs the FALSE arm overrides
 * the mock's return value for that one case.
 */
function stubPointerCapture(): void {
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn().mockReturnValue(true);
}

/** Removes the two properties {@link stubPointerCapture} added. */
function unstubPointerCapture(): void {
  Reflect.deleteProperty(Element.prototype, "setPointerCapture");
  Reflect.deleteProperty(Element.prototype, "hasPointerCapture");
}

/**
 * Dispatches a pointer-shaped event by hand.
 *
 * **jsdom 26.1.0 has no `PointerEvent` constructor at all** — confirmed by
 * direct probe: `typeof window.PointerEvent` is `"undefined"`, so
 * `new PointerEvent(...)` throws before a test even gets to `clientX`. Testing
 * Library's `fireEvent.pointerDown`/`pointerMove` degrade silently rather than
 * throwing — they still dispatch SOMETHING, but without a real `PointerEvent`
 * to construct, `clientX` never reaches the handler (measured: it comes back
 * `undefined`, and `--dock-width` resolves to `NaNpx`). A plain `MouseEvent`
 * DOES support `clientX` as a constructor option, and React's listener is
 * bound to the event TYPE STRING rather than to the constructor, so a
 * `MouseEvent` dispatched as `"pointerdown"`/`"pointermove"` reaches
 * `onPointerDown`/`onPointerMove` exactly as a real `PointerEvent` would, and
 * `event.pointerId` is added afterwards since `MouseEvent`'s own constructor
 * does not accept it.
 *
 * @param element - the element to dispatch on.
 * @param type - `"pointerdown"` or `"pointermove"`.
 * @param clientX - the horizontal position the handler reads.
 * @param pointerId - defaults to 7, matching {@link stubPointerCapture}'s
 *   `hasPointerCapture` stub, which ignores its argument entirely.
 */
function firePointerEvent(
  element: Element,
  type: "pointerdown" | "pointermove",
  clientX: number,
  pointerId = 7,
): void {
  const event = new MouseEvent(type, {
    clientX,
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperty(event, "pointerId", {
    value: pointerId,
    configurable: true,
  });
  act(() => {
    element.dispatchEvent(event);
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
 * @returns the `source` and `onClose` fixtures actually used, plus a
 *   `rerender` bound to the same element so a case can change props on the
 *   already-mounted dock — `open` going false, or `source.stale` flipping on
 *   the very node that was already there.
 */
function renderDock(props: RenderDockOverrides = {}): {
  source: PageSourceState;
  onClose: () => void;
  rerender: (next?: RenderDockOverrides) => void;
} {
  const source = props.source ?? baseSource();
  const onClose = props.onClose ?? vi.fn();
  const reference = props.reference ?? '{"aeleos":1,"blocks":[]}';
  const result = render(
    <PageSourceDock
      open={props.open ?? true}
      onClose={onClose}
      source={source}
      reference={reference}
      labels={labels}
    />,
  );
  const rerender = (next: RenderDockOverrides = {}) => {
    result.rerender(
      <PageSourceDock
        open={next.open ?? props.open ?? true}
        onClose={next.onClose ?? onClose}
        source={next.source ?? source}
        reference={next.reference ?? reference}
        labels={labels}
      />,
    );
  };
  return { source, onClose, rerender };
}

describe("PageSourceDock", () => {
  beforeEach(() => {
    stubDialogMethods();
    stubPointerCapture();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    unstubDialogMethods();
    unstubPointerCapture();
    vi.useRealTimers();
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

  // The effect's `else if (dialog.open) dialog.close()` arm — unreached by
  // every other case here, which all render `open: true` and never flip it.
  it("calls the native close() when open goes from true to false", () => {
    const { rerender } = renderDock({ open: true });
    expect(HTMLDialogElement.prototype.close).not.toHaveBeenCalled();

    rerender({ open: false });

    expect(HTMLDialogElement.prototype.close).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
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

  // Excludes: an `aria-live` region that enters the DOM already carrying its
  // text — AT announces a CHANGE inside an existing region and commonly
  // misses one that arrives pre-populated. Asserting only "there is an
  // aria-live ancestor while stale is true" cannot tell that fault apart from
  // the fix, because both produce that ancestor; this asserts the SAME node
  // persists across the transition and only its content changes.
  it("mounts the aria-live region unconditionally and only gates its content", () => {
    const { rerender } = renderDock({ source: baseSource() });
    const region = screen.getByTestId("page-source-problems");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toBeEmptyDOMElement();

    rerender({
      source: baseSource({
        problems: [{ at: "envelope", message: "not a document" }],
      }),
    });

    // The SAME element, not a newly mounted one carrying the same testid.
    expect(screen.getByTestId("page-source-problems")).toBe(region);
    expect(region).toHaveTextContent(labels.stale);
    expect(region).toHaveTextContent("not a document");
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

  // Excludes: a label that reads "Copied" forever after the first success,
  // which gives a second copy no feedback at all.
  it("the copied label reverts on its own after the reset window", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderDock();

    fireEvent.click(screen.getByRole("button", { name: labels.copyReference }));
    // Fake timers leave microtasks alone, but the click handler's `await`
    // still needs a turn of the microtask queue before `setCopied(true)` runs
    // — and this act() wraps only that flush, never the fireEvent call
    // itself, which already wraps its own synchronous dispatch.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(
      screen.getByRole("button", { name: labels.copied }),
    ).toBeInTheDocument();

    // 2000ms — COPIED_RESET_MS in the component, not exported, so restated
    // here; a change to that constant should be a deliberate edit to both.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

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

  // Given the coverage exclusion on presentation .tsx (root CLAUDE.md's
  // toolchain section), these branches are invisible to CI's threshold
  // forever unless a named case reaches each one directly — a grip wired to
  // the wrong sign passes the attribute-only case above just as well.
  describe("resizing", () => {
    /**
     * Reads the dialog's own `--dock-width` custom property.
     *
     * @returns the current width, as the literal string the inline style
     *   carries (e.g. `"420px"`).
     */
    function dockWidth(): string {
      return screen.getByRole("dialog").style.getPropertyValue("--dock-width");
    }

    it("ArrowLeft widens the panel by the step", () => {
      renderDock();
      fireEvent.keyDown(
        screen.getByRole("separator", { name: labels.resize }),
        {
          key: "ArrowLeft",
        },
      );
      expect(dockWidth()).toBe("444px");
    });

    it("ArrowRight narrows the panel by the step", () => {
      renderDock();
      fireEvent.keyDown(
        screen.getByRole("separator", { name: labels.resize }),
        {
          key: "ArrowRight",
        },
      );
      expect(dockWidth()).toBe("396px");
    });

    // Excludes: a ceiling that does not exist, or one set to the wrong
    // figure. `window.innerWidth` is jsdom's default, 1024, so the measured
    // ceiling here is `min(768, 1024 * 0.8) === 768`.
    it("ArrowLeft repeated does not exceed the measured ceiling", () => {
      renderDock();
      const grip = screen.getByRole("separator", { name: labels.resize });
      for (let i = 0; i < 30; i += 1) {
        fireEvent.keyDown(grip, { key: "ArrowLeft" });
      }
      expect(dockWidth()).toBe("768px");
    });

    it("ArrowRight repeated does not go below the floor", () => {
      renderDock();
      const grip = screen.getByRole("separator", { name: labels.resize });
      for (let i = 0; i < 30; i += 1) {
        fireEvent.keyDown(grip, { key: "ArrowRight" });
      }
      expect(dockWidth()).toBe("320px");
    });

    it("a key other than the two arrows changes nothing", () => {
      renderDock();
      fireEvent.keyDown(
        screen.getByRole("separator", { name: labels.resize }),
        {
          key: "Enter",
        },
      );
      expect(dockWidth()).toBe("420px");
    });

    // Excludes: a grip that resizes from wherever the pointer happens to be,
    // rather than only while it is actually captured.
    it("a pointer drag sets the width from the pointer position while captured", () => {
      renderDock();
      const grip = screen.getByRole("separator", { name: labels.resize });
      firePointerEvent(grip, "pointerdown", 900);
      expect(Element.prototype.setPointerCapture).toHaveBeenCalledTimes(1);
      // window.innerWidth (1024) - clientX (500) = 524.
      firePointerEvent(grip, "pointermove", 500);
      expect(dockWidth()).toBe("524px");
    });

    // Excludes: a `pointermove` handler with no capture guard at all, which
    // would resize on every hover rather than only during an active drag.
    it("a pointer move with no capture changes nothing", () => {
      renderDock();
      vi.mocked(Element.prototype.hasPointerCapture).mockReturnValue(false);
      const grip = screen.getByRole("separator", { name: labels.resize });
      firePointerEvent(grip, "pointermove", 500);
      expect(dockWidth()).toBe("420px");
    });
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
