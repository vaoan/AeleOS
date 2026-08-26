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
