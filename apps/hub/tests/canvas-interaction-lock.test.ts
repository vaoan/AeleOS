import { afterEach, describe, expect, it } from "vitest";
import { CHROME_SCOPE } from "@/shared/domain/chrome";
import { lockCanvasInteraction } from "@/features/actors/presentation/canvas-interaction-lock";

let root: HTMLElement | null = null;

afterEach(() => {
  root?.remove();
  root = null;
});

function mountCanvas(html: string): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("data-editor-canvas", "");
  el.innerHTML = html;
  document.body.append(el);
  root = el;
  return el;
}

describe("lockCanvasInteraction", () => {
  it("locks anchors, buttons, iframes and controlled video on the canvas", () => {
    const canvas = mountCanvas(`
      <a href="https://example.com">link</a>
      <button type="button">press</button>
      <iframe src="about:blank"></iframe>
      <video controls></video>
      <video></video>
    `);
    lockCanvasInteraction(canvas);

    expect(canvas.querySelector("a")?.hasAttribute("inert")).toBe(true);
    expect(canvas.querySelector("button")?.hasAttribute("inert")).toBe(true);
    expect(canvas.querySelector("iframe")?.hasAttribute("inert")).toBe(true);
    expect(canvas.querySelector("video[controls]")?.hasAttribute("inert")).toBe(
      true,
    );
    // An uncontrolled video plays nothing on its own and is not in the
    // selector — asserted so the fixture cannot pass by locking everything.
    expect(canvas.querySelectorAll("video")[1]?.hasAttribute("inert")).toBe(
      false,
    );
  });

  it("leaves a chrome-island control unlocked inside the same canvas", () => {
    const canvas = mountCanvas(`
      <a href="https://example.com" data-testid="page-link">link</a>
      <div class="${CHROME_SCOPE}">
        <button type="button" data-testid="chrome-button">grip</button>
      </div>
    `);
    lockCanvasInteraction(canvas);

    expect(
      canvas.querySelector('[data-testid="page-link"]')?.hasAttribute("inert"),
    ).toBe(true);
    expect(
      canvas
        .querySelector('[data-testid="chrome-button"]')
        ?.hasAttribute("inert"),
    ).toBe(false);
  });

  it("marks an anchor mounted after the lock is taken", async () => {
    const canvas = mountCanvas('<div data-testid="slot"></div>');
    lockCanvasInteraction(canvas);

    const link = document.createElement("a");
    link.href = "https://example.com";
    canvas.querySelector('[data-testid="slot"]')!.append(link);

    // MutationObserver callbacks run as a microtask.
    await Promise.resolve();
    await Promise.resolve();

    expect(link.hasAttribute("inert")).toBe(true);
  });

  it("ignores a non-element node the observer reports, such as a text change", async () => {
    const canvas = mountCanvas('<div data-testid="slot">before</div>');
    lockCanvasInteraction(canvas);

    canvas
      .querySelector('[data-testid="slot"]')!
      .append(document.createTextNode(" after"));

    await Promise.resolve();
    await Promise.resolve();

    // Nothing throws and the slot's existing text is untouched — the guard
    // is that a text node never reaches `applyTo`, which has nothing to
    // assert on its own beyond "this did not crash".
    expect(canvas.textContent).toContain("before after");
  });

  it("does not overwrite the recorded prior state when the same element is relocated", async () => {
    const canvas = mountCanvas(`
      <div data-testid="a"></div>
      <div data-testid="b"></div>
    `);
    const link = document.createElement("a");
    link.href = "https://example.com";
    canvas.querySelector('[data-testid="a"]')!.append(link);

    const unlock = lockCanvasInteraction(canvas);
    expect(link.hasAttribute("inert")).toBe(true);

    // Moving an already-locked element re-fires the observer for the same
    // node instance. If the second sighting overwrote its recorded prior
    // state with "already inert" (true, since the lock itself set it),
    // unlock would leave it inert forever instead of freeing it.
    canvas.querySelector('[data-testid="b"]')!.append(link);
    await Promise.resolve();
    await Promise.resolve();

    unlock();
    expect(link.hasAttribute("inert")).toBe(false);
  });

  it("restores prior inert state on unlock: keeps a renderer-disabled element inert, frees a live one", () => {
    const canvas = mountCanvas(`
      <iframe src="about:blank" inert></iframe>
      <a href="https://example.com">link</a>
    `);
    const unlock = lockCanvasInteraction(canvas);

    // Both are locked while editing, whatever their prior state was.
    expect(canvas.querySelector("iframe")?.hasAttribute("inert")).toBe(true);
    expect(canvas.querySelector("a")?.hasAttribute("inert")).toBe(true);

    unlock();

    // The discriminating case: unlocking must not make everything
    // interactive again. The iframe was inert before the lock ran (the
    // renderer's own choice) and must stay inert; the link was not and
    // must become live again.
    expect(canvas.querySelector("iframe")?.hasAttribute("inert")).toBe(true);
    expect(canvas.querySelector("a")?.hasAttribute("inert")).toBe(false);
  });

  it("disconnects its observer on cleanup: a node mounted after unlock is not marked", async () => {
    const canvas = mountCanvas('<div data-testid="slot"></div>');
    const unlock = lockCanvasInteraction(canvas);
    unlock();

    const link = document.createElement("a");
    link.href = "https://example.com";
    canvas.querySelector('[data-testid="slot"]')!.append(link);

    await Promise.resolve();
    await Promise.resolve();

    expect(link.hasAttribute("inert")).toBe(false);
  });

  it("never marks the canvas element itself inert", () => {
    const canvas = mountCanvas('<a href="https://example.com">link</a>');
    lockCanvasInteraction(canvas);

    expect(canvas.hasAttribute("inert")).toBe(false);
  });
});
