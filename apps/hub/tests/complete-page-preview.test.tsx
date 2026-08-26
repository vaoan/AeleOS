import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_THEME } from "@/features/actors/domain/actor-theme";
import type { Block } from "@/features/actors/domain/block-schema";
import { DEFAULT_GRADIENT } from "@/shared/domain/gradient";
import {
  PREVIEW_DRAFT,
  PREVIEW_READY,
} from "@/features/actors/presentation/preview-message";
import { pageContext } from "./helpers/page-context";
import { CompletePagePreview } from "@/features/actors/presentation/complete-page-preview";

const blocks: Block[] = [
  {
    kind: "container",
    mode: "stack",
    spaces: 1,
    name_en: "First section",
    children: [
      { kind: "text", title_en: "Live title", description_en: "Live words" },
    ],
  },
  {
    kind: "container",
    mode: "stack",
    spaces: 1,
    name_en: "Second section",
    children: [],
  },
];

const labels = {
  title: "Complete page preview",
  expand: "Show complete page",
  collapse: "Hide complete page",
  devices: { phone: "Phone", tablet: "Tablet", desktop: "Desktop" },
  sizeHint: {
    phone: "Shown at 390 by 844",
    tablet: "Shown at 768 by 1024",
    desktop: "Shown at 1280 by 900",
  },
};

/**
 * Renders the disclosure with everything defaulted.
 *
 * @param over - props this case means to change.
 * @returns whatever `render` returned.
 */
function mount(over: Partial<Parameters<typeof CompletePagePreview>[0]> = {}) {
  return render(
    <CompletePagePreview
      blocks={blocks}
      theme={DEFAULT_THEME}
      lang="es"
      page={pageContext()}
      labels={labels}
      {...over}
    />,
  );
}

/** The frame, once the disclosure is open. */
const frame = () =>
  screen.getByTestId("complete-page-preview-frame") as HTMLIFrameElement;

/**
 * Answers the parent's handshake as the framed document would.
 *
 * The component sends nothing until this arrives, which is the whole ordering
 * guarantee — so a case that wants a draft posted must call this first.
 */
async function announceReady() {
  act(() => {
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { kind: PREVIEW_READY },
        origin: window.location.origin,
        source: frame().contentWindow,
      }),
    );
  });
  // The draft is coalesced to one post per animation frame, so nothing has
  // crossed yet when the handshake returns. Waiting for a real frame is the
  // honest flush: faking the timer would test a different scheduler.
  await act(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );
}

afterEach(() => vi.restoreAllMocks());

describe("CompletePagePreview", () => {
  it("starts collapsed and mounts the preview route when opened", () => {
    mount();
    expect(screen.queryByTestId("complete-page-preview-frame")).toBeNull();

    const toggle = screen.getByTestId("complete-page-preview-toggle");
    expect(toggle).toHaveAccessibleName(labels.expand);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);

    expect(frame()).toHaveAttribute("src", "/es/me/preview");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveAccessibleName(labels.collapse);
  });

  it("unmounts the frame when closed", () => {
    mount();
    const toggle = screen.getByTestId("complete-page-preview-toggle");
    fireEvent.click(toggle);
    fireEvent.click(toggle);

    expect(screen.queryByTestId("complete-page-preview-frame")).toBeNull();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  // The default is the size nearest the author's own window. jsdom reports
  // exactly 1024, which is EQUIDISTANT from the tablet's 768 and the desktop's
  // 1280 — so this case lands on `nearestDevice`'s documented tie-break, which
  // takes the narrower. That was found by running it rather than by reasoning:
  // the expectation here first said 1280.
  it("opens at the device nearest the author's own window", () => {
    expect(globalThis.innerWidth).toBe(1024);
    mount();
    fireEvent.click(screen.getByTestId("complete-page-preview-toggle"));

    expect(frame()).toHaveAttribute("width", "768");
    expect(frame()).toHaveAttribute("height", "1024");
  });

  it("takes the device somebody picks, at that exact viewport", () => {
    mount();
    fireEvent.click(screen.getByTestId("complete-page-preview-toggle"));

    fireEvent.click(screen.getByTestId("preview-device-phone"));

    expect(frame()).toHaveAttribute("width", "390");
    expect(frame()).toHaveAttribute("height", "844");
  });

  // **The frame is not remounted when the size changes.** Re-creating it would
  // drop the draft and restart the handshake, so an author flipping between
  // sizes would watch their page blank and rebuild each time.
  it("keeps the same frame across a size change", () => {
    mount();
    fireEvent.click(screen.getByTestId("complete-page-preview-toggle"));
    const before = frame();

    fireEvent.click(screen.getByTestId("preview-device-phone"));

    expect(frame()).toBe(before);
  });

  it("sends nothing until the document announces itself", async () => {
    mount();
    fireEvent.click(screen.getByTestId("complete-page-preview-toggle"));
    const post = vi.spyOn(frame().contentWindow!, "postMessage");

    expect(post).not.toHaveBeenCalled();

    await announceReady();

    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({ kind: PREVIEW_DRAFT, locale: "es" }),
      window.location.origin,
    );
  });

  it("sends the live theme and the live actor facts", async () => {
    const theme = {
      ...DEFAULT_THEME,
      background: { ...DEFAULT_GRADIENT, stops: [{ color: "#24152f", at: 0 }] },
    };
    mount({ theme });
    fireEvent.click(screen.getByTestId("complete-page-preview-toggle"));
    const post = vi.spyOn(frame().contentWindow!, "postMessage");

    await announceReady();

    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({ theme, page: pageContext() }),
      window.location.origin,
    );
  });

  // A block the form is mid-edit on cannot be rendered, and the SENDER is
  // where that is settled: what crosses the boundary must already be
  // renderable, so the receiver needs no second schema free to drift.
  it("drops a malformed draft block rather than sending it", async () => {
    const malformed = {
      kind: "container",
      mode: "grid",
      spaces: "not-a-number",
      name_en: "Malformed",
      children: [],
    } as unknown as Block;
    mount({ blocks: [blocks[0]!, malformed, blocks[1]!] });
    fireEvent.click(screen.getByTestId("complete-page-preview-toggle"));
    const post = vi.spyOn(frame().contentWindow!, "postMessage");

    await announceReady();

    const sent = post.mock.calls[0]![0] as { blocks: Block[] };
    expect(sent.blocks).toHaveLength(2);
    expect(JSON.stringify(sent.blocks)).not.toContain("Malformed");
  });

  it("does not inspect draft blocks until the disclosure opens", async () => {
    let reads = 0;
    const observed = {
      get kind() {
        reads += 1;
        return "container";
      },
      mode: "stack",
      spaces: 1,
      children: [],
    } as unknown as Block;

    mount({ blocks: [observed] });

    expect(reads).toBe(0);
    fireEvent.click(screen.getByTestId("complete-page-preview-toggle"));
    await announceReady();
    expect(reads).toBeGreaterThan(0);
  });

  // **Hidden from the eye on a narrow screen, never from a screen reader.**
  // The control row wraps to three lines on a 320px phone and takes 170px of a
  // 568px screen — measured on the deployed site — and the hint is the line
  // worth reclaiming, because the SELECTED DEVICE BUTTON already says which
  // viewport this is. What it must not become is `hidden`: the spec's reason
  // for the label is that a narrowed page must never be mistaken for the
  // author's own measure, and dropping it out of the accessibility tree would
  // take that guarantee away from exactly the people who cannot see the
  // pressed button either.
  it("keeps the size announced when it stops being visible", () => {
    mount();
    fireEvent.click(screen.getByTestId("complete-page-preview-toggle"));

    const hint = screen.getByTestId("preview-size-hint");
    expect(hint).toHaveClass("sr-only");
    expect(hint).toHaveClass("sm:not-sr-only");
    expect(hint).not.toHaveClass("hidden");
    // Still readable by name, which is what "announced" means here.
    expect(hint).toHaveTextContent("Shown at 768 by 1024");
  });

  it("names the size it is showing", () => {
    mount();
    fireEvent.click(screen.getByTestId("complete-page-preview-toggle"));
    fireEvent.click(screen.getByTestId("preview-device-tablet"));

    expect(screen.getByTestId("preview-size-hint")).toHaveTextContent(
      "Shown at 768 by 1024",
    );
  });

  // **The surround paints NOTHING, and this case is the reversal of one that
  // pinned the opposite by name.** It wore `[background:var(--field)]` so the
  // frame's edges would disappear into it, and did the opposite: the frame's
  // own copy of that field is anchored to the FRAME's viewport while the
  // surround's was stretched across the surround's box, so the two never lined
  // up with each other — and neither lined up with the editor's own atmosphere
  // behind them, which is the seam somebody saw. Transparent, the letterbox
  // beside a phone-shaped frame is simply the editor.
  //
  // The old assertion was not wrong about the code; it was asserting the
  // mechanism, and the mechanism was the fault. Same shape as the two suites
  // that pinned `overflow-x: auto` by name in `CLAUDE.md`.
  it("paints nothing of its own beside the frame", () => {
    mount();
    fireEvent.click(screen.getByTestId("complete-page-preview-toggle"));

    const surround = screen.getByTestId("preview-surround");
    // Named literally rather than by a regex: the word boundary this used
    // to need arrived as a literal 0x08 through a heredoc, which is the
    // escape-collapse trap in rule 28 and is invisible in a file listing.
    expect(surround.className).not.toContain("[background:var(--field)]");
    expect(surround.className).not.toContain("bg-");
    expect(frame()).not.toHaveClass("rounded-xl", "surface", "border-(--edge)");
  });

  // **The frame pins, and the spacer is the distance it pins for.** Together
  // they are what replaces the frame's own scrollbar with the page's: without
  // the pin the preview scrolls away while being scrubbed, and without the
  // spacer there is no scroll to scrub it with.
  it("pins the frame clear of the editor's bars", () => {
    mount();
    fireEvent.click(screen.getByTestId("complete-page-preview-toggle"));

    const surround = screen.getByTestId("preview-surround");
    expect(surround).toHaveClass("sticky");
    // Not `top-0`: the header, the toolbar and the section strip are all still
    // held above when somebody has scrolled far enough to reach the preview.
    expect(surround).toHaveClass("top-(--bar-top-3)");
    expect(screen.getByTestId("preview-scroller")).toContainElement(surround);
  });
});
