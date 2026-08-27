import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PreviewDocument } from "@/features/actors/presentation/preview-document";
import {
  PREVIEW_DRAFT,
  PREVIEW_READY,
} from "@/features/actors/presentation/preview-message";
import { DEFAULT_THEME } from "@/features/actors/domain/actor-theme";
import { pageContext } from "./helpers/page-context";

const draft = {
  kind: PREVIEW_DRAFT,
  blocks: [
    {
      kind: "container",
      mode: "stack",
      spaces: 1,
      name_en: "A section",
      children: [
        { kind: "text", title_en: "A title", description_en: "Words" },
      ],
    },
  ],
  theme: DEFAULT_THEME,
  page: pageContext(),
  locale: "en",
  deviceHeight: 844,
};

/**
 * Delivers one message the way the parent window would.
 *
 * `origin` and `source` default to the values a genuine parent post carries,
 * so a case that means to break ONE of them overrides only that one — a
 * fixture breaking both would pass with either check missing.
 *
 * @param data - the message payload.
 * @param over - the one field this case means to make wrong.
 */
function post(data: unknown, over: Partial<MessageEventInit> = {}) {
  act(() => {
    window.dispatchEvent(
      new MessageEvent("message", {
        data,
        origin: window.location.origin,
        source: window.parent,
        ...over,
      }),
    );
  });
}

afterEach(() => vi.restoreAllMocks());

describe("PreviewDocument", () => {
  it("announces itself to the parent and renders nothing until told", () => {
    const posted = vi.spyOn(window.parent, "postMessage");

    render(<PreviewDocument />);

    expect(posted).toHaveBeenCalledWith(
      { kind: PREVIEW_READY },
      window.location.origin,
    );
    expect(screen.queryByTestId("public-section")).toBeNull();
  });

  it("renders the draft it is sent", () => {
    render(<PreviewDocument />);

    post(draft);

    expect(screen.getByText("A section")).toBeInTheDocument();
    expect(screen.getByText("A title")).toBeInTheDocument();
    expect(screen.getByTestId("page-content")).toBeInTheDocument();
  });

  it("replaces the draft when a newer one arrives", () => {
    render(<PreviewDocument />);
    post(draft);

    post({
      ...draft,
      blocks: [
        { ...draft.blocks[0], name_en: "A later section", children: [] },
      ],
    });

    expect(screen.getByText("A later section")).toBeInTheDocument();
    expect(screen.queryByText("A section")).toBeNull();
  });

  // Origin and source are checked independently, and each case breaks exactly
  // one of them.
  it("ignores a message from another origin", () => {
    render(<PreviewDocument />);

    post(draft, { origin: "https://evil.example" });

    expect(screen.queryByTestId("public-section")).toBeNull();
  });

  it("ignores a message from another source", () => {
    render(<PreviewDocument />);

    post(draft, { source: null });

    expect(screen.queryByTestId("public-section")).toBeNull();
  });

  // **The backdrop is banded, one band per screenful of the chosen device.**
  // A viewport-anchored background covers a visitor's window and re-anchors as
  // they scroll; the frame is as tall as the whole page, so one copy would
  // stretch over everything. Bands show, statically, what a visitor sees
  // screenful by screenful.
  it("repeats the backdrop once per screenful", () => {
    render(<PreviewDocument />);
    post(draft);

    const bands = screen.getAllByTestId("preview-backdrop-band");
    expect(bands.length).toBeGreaterThan(0);
    // Each band is exactly one screenful tall and stacked by that height.
    expect(bands[0]).toHaveStyle({ height: "844px", top: "0px" });
    // `fixed` is the one thing not carried over — it is what banding undoes.
    expect(bands[0]).toHaveStyle({ backgroundAttachment: "scroll" });
  });

  // Without this the body's single stretched copy shows through every gap the
  // bands leave, and the last band is a partial screenful whenever the page is
  // not an exact multiple of the device.
  it("stops the body painting its own stretched copy", () => {
    const { container } = render(<PreviewDocument />);
    post(draft);

    // `!important` is load-bearing: `themeCss` emits the body backdrop behind
    // a `:root:not([data-page-theme="default"])` gate, which outranks a bare
    // `body` selector, so a plain rule loses in silence.
    expect(container.innerHTML).toContain(
      "body{background-image:none!important}",
    );
  });

  // A draft with no device height cannot be banded, and is refused at the
  // shape check rather than rendered with a zero-height backdrop.
  it("ignores a draft that names no device height", () => {
    render(<PreviewDocument />);

    post({ ...draft, deviceHeight: undefined });

    expect(screen.queryByTestId("public-section")).toBeNull();
  });

  it("ignores a message it cannot read", () => {
    render(<PreviewDocument />);

    post({ kind: "something-else" });

    expect(screen.queryByTestId("public-section")).toBeNull();
  });

  it("stops listening once it is gone", () => {
    const { unmount } = render(<PreviewDocument />);
    unmount();

    // Nothing to assert on screen — the subject is that no handler runs on a
    // torn-down tree, which React reports as an error rather than silently.
    expect(() => post(draft)).not.toThrow();
  });
});
