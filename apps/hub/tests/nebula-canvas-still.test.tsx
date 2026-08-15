import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NebulaCanvas } from "@/shared/presentation/nebula-canvas";

/**
 * The still path, which is what a reader who asked for no motion gets.
 *
 * With `prefers-reduced-motion: reduce` the canvas renders exactly ONE frame
 * and then nothing, ever, unless something tells it to draw again. That makes
 * it the one path where "did anything notice this change?" is a question with
 * teeth — on the animated path every frame re-reads the theme, so a missed
 * signal is invisible.
 *
 * These tests stub the 2D context, and that is a deliberate line. What is under
 * test is the DECISION to redraw, not the drawing: whether a change to the
 * theme reaches a canvas that only paints when told. The pixels are covered
 * where pixels can be: `canvas-raster.test.ts` for the field, and the
 * Playwright suite for a real browser.
 */

/** Every call the component makes on its context, so a draw can be counted. */
interface Recorder {
  /** How many times a frame was started. Every draw path clears first. */
  clears: number;
}

let recorder: Recorder;

/** Whether the stubbed media query reports a reader wanting no motion. */
let reducedMotion = true;

/** The listeners `matchMedia` handed out, so a change can be delivered. */
let mediaListeners: (() => void)[] = [];

beforeEach(() => {
  recorder = { clears: 0 };
  reducedMotion = true;
  mediaListeners = [];

  // jsdom implements none of these. Each is the smallest thing that lets the
  // component's own logic run; none of them decides anything the tests assert.
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("reduce") ? reducedMotion : false,
    media: query,
    addEventListener: (_: string, listener: () => void) =>
      mediaListeners.push(listener),
    removeEventListener: () => undefined,
  }));
  vi.stubGlobal(
    "ImageData",
    class {
      constructor(
        readonly data: Uint8ClampedArray,
        readonly width: number,
        readonly height: number,
      ) {}
    },
  );
  vi.stubGlobal(
    "Path2D",
    class {
      moveTo() {}
      lineTo() {}
      closePath() {}
      addPath() {}
    },
  );

  const context = {
    clearRect: () => {
      recorder.clears += 1;
    },
    // Everything else the renderers touch, doing nothing.
    fillRect: () => {},
    strokeRect: () => {},
    beginPath: () => {},
    closePath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    arc: () => {},
    fill: () => {},
    stroke: () => {},
    fillText: () => {},
    drawImage: () => {},
    putImageData: () => {},
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "butt",
    font: "",
    textBaseline: "alphabetic",
    imageSmoothingEnabled: true,
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
});

afterEach(() => {
  // **Unmounted before the stubs come off, and the order is load-bearing.**
  // Tearing down the `<style>` elements below is itself a mutation, so leaving
  // the component mounted queues one more observer callback — which then runs
  // against jsdom's real `getContext`, the one that throws "not implemented".
  // The suite still passed, which is exactly why it is worth fixing rather
  // than living with: an unhandled error nobody reads is where the next real
  // one will hide.
  cleanup();
  for (const style of document.querySelectorAll("style[data-test-theme]")) {
    style.remove();
  }
  document.documentElement.removeAttribute("style");
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/**
 * Publishes a theme the way `ThemeScope` does — as a `<style>` in the page.
 *
 * Not as an inline style on the root, which is what makes this test worth
 * having: the real mechanism is an element React REPLACES, and the component's
 * observer watches the document for exactly that.
 *
 * @param css - the declarations for `:root`.
 * @returns nothing.
 */
function publishTheme(css: string): void {
  for (const old of document.querySelectorAll("style[data-test-theme]")) {
    old.remove();
  }
  const style = document.createElement("style");
  style.setAttribute("data-test-theme", "");
  style.textContent = `:root { ${css} }`;
  document.body.append(style);
}

/** Lets the mutation observer deliver, which it does on a microtask. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("the canvas with motion turned off", () => {
  it("paints one frame and then holds still", async () => {
    render(<NebulaCanvas />);
    expect(recorder.clears).toBe(1);
    await settle();
    expect(recorder.clears).toBe(1);
  });

  it("repaints when the page asks for a different canvas", async () => {
    render(<NebulaCanvas />);
    const painted = recorder.clears;

    publishTheme("--canvas: stars;");
    await settle();

    // The regression. The still path compared only the canvas's COLOURS before
    // deciding to redraw, so a theme that changed which canvas to draw — and
    // nothing else — was read, found equal, and discarded. A reader who had
    // asked for no motion watched the picker do nothing.
    expect(recorder.clears).toBeGreaterThan(painted);
  });

  it("repaints when a dial moves", async () => {
    render(<NebulaCanvas />);
    const painted = recorder.clears;

    publishTheme("--canvas: stars; --canvas-density: 3;");
    await settle();

    expect(recorder.clears).toBeGreaterThan(painted);
  });

  it("repaints when the size dial moves on its own", async () => {
    publishTheme("--canvas: stars;");
    render(<NebulaCanvas />);
    const painted = recorder.clears;

    publishTheme("--canvas: stars; --canvas-scale: 4;");
    await settle();

    expect(recorder.clears).toBeGreaterThan(painted);
  });

  it("repaints when only the opacity moves", async () => {
    render(<NebulaCanvas />);
    const painted = recorder.clears;

    publishTheme("--nebula-opacity: 0.8;");
    await settle();

    expect(recorder.clears).toBeGreaterThan(painted);
  });

  it("repaints when the colours move, as it always did", async () => {
    render(<NebulaCanvas />);
    const painted = recorder.clears;

    publishTheme("--canvas-1: 10 20 30;");
    await settle();

    expect(recorder.clears).toBeGreaterThan(painted);
  });

  it("does not repaint when the theme changes nothing it draws", async () => {
    render(<NebulaCanvas />);
    publishTheme("--canvas: stars;");
    await settle();
    const painted = recorder.clears;

    // A `<style>` React replaced with identical content — which is every
    // keystroke in a field that does not touch the canvas. Redrawing for those
    // is what made the theming editor unusable before the comparison existed,
    // so the guard has to stay a guard.
    publishTheme("--canvas: stars;");
    await settle();

    expect(recorder.clears).toBe(painted);
  });

  it("holds the frame when the reader wants no motion, whatever else changes", () => {
    render(<NebulaCanvas />);
    // One frame, not a loop. If this ever counts up on its own, the still path
    // has started animating and `prefers-reduced-motion` is being ignored.
    expect(recorder.clears).toBe(1);
  });
});
