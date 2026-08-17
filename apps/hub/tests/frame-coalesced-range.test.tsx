import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { FrameCoalescedRange } from "@/shared/presentation/frame-coalesced-range";

/** The frame callbacks waiting to run, so a test decides when a frame happens. */
let frames: (FrameRequestCallback | null)[] = [];

beforeEach(() => {
  frames = [];
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.push(callback);
    // Handles from one, so that zero can go on meaning "nothing scheduled".
    return frames.length;
  });
  vi.stubGlobal("cancelAnimationFrame", (handle: number) => {
    frames[handle - 1] = null;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Runs every frame callback still scheduled. */
function flushFrame() {
  const due = frames;
  frames = [];
  act(() => {
    for (const callback of due) callback?.(0);
  });
}

const PROPS = {
  id: "density",
  min: 0.25,
  max: 5,
  step: 0.05,
  testId: "dial",
  className: "h-2",
};

/**
 * Moves the thumb.
 *
 * `fireEvent` rather than assigning `value` and dispatching an event by hand:
 * React patches the element's own `value` setter to track what it last
 * rendered, so a plain assignment updates that tracker and React then decides
 * nothing changed and never calls the handler. The first version of this file
 * did exactly that and every case here reported no frame at all.
 */
function drag(element: HTMLInputElement, to: number) {
  fireEvent.change(element, { target: { value: String(to) } });
}

/** Counts writes to one element's `value`, which is not an own property. */
function countWrites(element: HTMLInputElement): () => number {
  const descriptor = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!;
  let writes = 0;
  Object.defineProperty(element, "value", {
    configurable: true,
    get: () => descriptor.get!.call(element) as string,
    set: (next: string) => {
      writes += 1;
      descriptor.set!.call(element, next);
    },
  });
  return () => writes;
}

describe("FrameCoalescedRange", () => {
  it("reports the value once the frame arrives", () => {
    const onCommit = vi.fn();
    render(<FrameCoalescedRange {...PROPS} value={1} onCommit={onCommit} />);
    const input = screen.getByTestId("dial") as HTMLInputElement;

    drag(input, 2.5);
    // Nothing yet: the whole point is that the report waits for the frame.
    expect(onCommit).not.toHaveBeenCalled();

    flushFrame();
    expect(onCommit).toHaveBeenCalledExactlyOnceWith(2.5);
  });

  // **The saving, and the thing a future edit would silently undo.** Several
  // movements inside one frame are one report, because each report restyles
  // every element under `:root` and a blocked main thread delivers input in
  // bursts.
  it("collapses a burst of movements into one report", () => {
    const onCommit = vi.fn();
    render(<FrameCoalescedRange {...PROPS} value={1} onCommit={onCommit} />);
    const input = screen.getByTestId("dial") as HTMLInputElement;

    drag(input, 1.5);
    drag(input, 2);
    drag(input, 3.25);
    expect(frames).toHaveLength(1);

    flushFrame();
    expect(onCommit).toHaveBeenCalledExactlyOnceWith(3.25);
  });

  it("reports again on the next frame after one has been paid", () => {
    const onCommit = vi.fn();
    render(<FrameCoalescedRange {...PROPS} value={1} onCommit={onCommit} />);
    const input = screen.getByTestId("dial") as HTMLInputElement;

    drag(input, 2);
    flushFrame();
    drag(input, 4);
    flushFrame();

    expect(onCommit.mock.calls).toEqual([[2], [4]]);
  });

  // The element holds its own value while a finger is on it — which is what
  // keeps the thumb under the finger — so nothing else puts a value back.
  it("leaves the element where a drag left it", () => {
    render(<FrameCoalescedRange {...PROPS} value={1} onCommit={() => {}} />);
    const input = screen.getByTestId("dial") as HTMLInputElement;

    drag(input, 3);
    flushFrame();
    expect(input.value).toBe("3");
  });

  // The ordinary end of a drag: the parent catches up and hands back the value
  // the element already shows. Writing it again would be harmless but pointless
  // — and the guard that skips it is the same one that has to hold below.
  it("writes nothing when the parent catches up to where the drag ended", () => {
    const view = render(
      <FrameCoalescedRange {...PROPS} value={1} onCommit={() => {}} />,
    );
    const input = screen.getByTestId("dial") as HTMLInputElement;
    drag(input, 3);
    flushFrame();
    const writes = countWrites(input);

    view.rerender(
      <FrameCoalescedRange {...PROPS} value={3} onCommit={() => {}} />,
    );
    expect(writes()).toBe(0);
  });

  // Reset and "copy from my profile" change the value without a drag. An
  // uncontrolled element does not follow its prop, so this has to be done by
  // hand — and if it is not, Reset appears to do nothing at all.
  it("follows a value that changed without a drag", () => {
    const view = render(
      <FrameCoalescedRange {...PROPS} value={1} onCommit={() => {}} />,
    );
    const input = screen.getByTestId("dial") as HTMLInputElement;
    drag(input, 3);
    flushFrame();
    view.rerender(
      <FrameCoalescedRange {...PROPS} value={3} onCommit={() => {}} />,
    );

    view.rerender(
      <FrameCoalescedRange {...PROPS} value={1} onCommit={() => {}} />,
    );
    expect(input.value).toBe("1");
  });

  // **The snap-back this component exists to avoid.** Mid-drag the element
  // holds something newer than the prop; writing the prop over it drags the
  // thumb back out from under the finger.
  it("does not put a stale value back while a report is pending", () => {
    const view = render(
      <FrameCoalescedRange {...PROPS} value={1} onCommit={() => {}} />,
    );
    const input = screen.getByTestId("dial") as HTMLInputElement;

    drag(input, 4);
    // A render arriving before the frame — the panel re-rendering for its own
    // reasons, carrying a value older than the finger's position.
    view.rerender(
      <FrameCoalescedRange {...PROPS} value={2} onCommit={() => {}} />,
    );
    expect(input.value).toBe("4");
  });

  it("reports the newest handler rather than the one the drag started with", () => {
    const first = vi.fn();
    const second = vi.fn();
    const view = render(
      <FrameCoalescedRange {...PROPS} value={1} onCommit={first} />,
    );
    const input = screen.getByTestId("dial") as HTMLInputElement;

    drag(input, 2);
    view.rerender(
      <FrameCoalescedRange {...PROPS} value={1} onCommit={second} />,
    );
    flushFrame();

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledExactlyOnceWith(2);
  });

  it("cancels a pending report when it goes away", () => {
    const onCommit = vi.fn();
    const view = render(
      <FrameCoalescedRange {...PROPS} value={1} onCommit={onCommit} />,
    );
    const input = screen.getByTestId("dial") as HTMLInputElement;

    drag(input, 2);
    view.unmount();

    flushFrame();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("cancels nothing when nothing was pending", () => {
    const cancel = vi.fn();
    vi.stubGlobal("cancelAnimationFrame", cancel);
    const view = render(
      <FrameCoalescedRange {...PROPS} value={1} onCommit={() => {}} />,
    );
    view.unmount();
    expect(cancel).not.toHaveBeenCalled();
  });
});
