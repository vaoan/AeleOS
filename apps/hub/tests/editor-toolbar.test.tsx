import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";

vi.mock("@/shared/infrastructure/i18n/navigation", () => ({
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

const { EditorToolbar } =
  await import("@/features/actors/presentation/editor-toolbar");

const labels = {
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
};

/**
 * Renders the toolbar with overrides.
 *
 * @param props - what to override.
 * @returns nothing.
 */
function renderToolbar(props: Record<string, unknown> = {}): void {
  render(
    <EditorToolbar
      title="New fursona"
      labels={labels}
      saving={false}
      cancelHref="/pages"
      onHideControls={() => {}}
      onOpenSource={() => {}}
      interactEnabled={false}
      onInteractEnabledChange={() => {}}
      // A stand-in, because this suite is about the BAR. The real control has
      // its own suite; what matters here is that the bar renders the node it
      // is handed, which a marker proves better than the real component would.
      writingIn={<span data-testid="writing-in-slot" />}
      {...props}
    />,
  );
}

describe("EditorToolbar", () => {
  it("shows the title it was given", () => {
    renderToolbar();
    expect(screen.getByText("New fursona")).toBeInTheDocument();
  });

  // A submit button, not a click handler: the form owns submission, so Enter
  // in a text field saves exactly as pressing Save does.
  it("saves by submitting the form rather than by handling a click", () => {
    renderToolbar();
    expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute(
      "type",
      "submit",
    );
  });

  // **THE REGRESSION TEST for a navigation with no loading bar.** Cancel was a
  // button calling `router.push`. `RouteProgress` starts on a click that lands
  // on an `<a>` and on a form submission — Save is covered by the submit, and
  // Cancel was covered by neither, so leaving the editor changed the route with
  // nothing on screen saying anything was happening.
  //
  // A link is also the right element on its own merits: a middle-click or a
  // modified click opens it in a new tab, which a button silently refuses.
  it("leaves by a link, so the bar can see it", () => {
    renderToolbar();
    const cancel = screen.getByRole("link", { name: "Cancel" });
    expect(cancel).toHaveAttribute("href", "/pages");
  });

  it("says it is saving while it is", () => {
    renderToolbar({ saving: true });
    expect(screen.getByRole("button", { name: "Saving…" })).toBeInTheDocument();
  });

  // The fault this prevents is a double submit. create_fursona would answer
  // the second one with "handle already yours" — a baffling error about a
  // fursona somebody just successfully created.
  it("refuses a second save while one is in flight", () => {
    renderToolbar({ saving: true });
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  });

  it("is not disabled when idle", () => {
    renderToolbar();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  // THE COMPACT MENU'S OWN GROUPING (2026-09-04): source JSON, Interact with
  // page and Cancel all live inside the one `More` disclosure now, rather
  // than each holding a permanent seat in a row that already wraps at `sm`.
  // jsdom applies none of `<details>`'s native open/closed CSS, so this
  // cannot assert visibility the way a browser could (see
  // `page-source-dock.tsx`'s own account of the identical gap) — it asserts
  // CONTAINMENT instead: all three sit inside the same `<details>` the
  // `More` trigger owns, which is the fact a browser's hiding rests on.
  it("groups source JSON, Interact with page and Cancel under More", () => {
    renderToolbar();
    const details = screen.getByTestId("editor-more").closest("details");
    expect(details).not.toBeNull();
    const group = within(details!);
    expect(group.getByTestId("editor-open-source")).toBeInTheDocument();
    expect(group.getByTestId("interact-with-page")).toBeInTheDocument();
    expect(group.getByTestId("editor-cancel")).toBeInTheDocument();
  });

  // The regression this guards: `onOpenSource` is a required prop precisely
  // because there is no address for the dock to have — see the prop's own
  // TSDoc — so nothing but a click on this control can ever reach it.
  it("opens the page-source dock on press", () => {
    const onOpenSource = vi.fn();
    renderToolbar({ onOpenSource });
    fireEvent.click(screen.getByRole("button", { name: "Page source" }));
    expect(onOpenSource).toHaveBeenCalledOnce();
  });

  it("shows Interact with page unpressed, with the off hint, by default", () => {
    renderToolbar();
    const button = screen.getByRole("button", { name: "Interact with page" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.getByText("Page links and controls are locked."),
    ).toBeInTheDocument();
  });

  it("shows Interact with page pressed, with the on hint, when enabled", () => {
    renderToolbar({ interactEnabled: true });
    const button = screen.getByRole("button", { name: "Interact with page" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByText(
        "Page links and controls work as they do for a visitor.",
      ),
    ).toBeInTheDocument();
  });

  // The hint has to be the description an assistive technology actually
  // reads, not merely a sentence that happens to be on the page — a stray
  // paragraph with the same words would pass a `getByText` case that never
  // checked the wiring.
  it("describes Interact with page by the hint the aria-describedby id names", () => {
    renderToolbar();
    const button = screen.getByRole("button", { name: "Interact with page" });
    const describedBy = button.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toHaveTextContent(
      "Page links and controls are locked.",
    );
  });

  it("presses the switch on: calls onInteractEnabledChange(true) from off", () => {
    const onInteractEnabledChange = vi.fn();
    renderToolbar({ interactEnabled: false, onInteractEnabledChange });
    fireEvent.click(screen.getByRole("button", { name: "Interact with page" }));
    expect(onInteractEnabledChange).toHaveBeenCalledExactlyOnceWith(true);
  });

  it("presses the switch off: calls onInteractEnabledChange(false) from on", () => {
    const onInteractEnabledChange = vi.fn();
    renderToolbar({ interactEnabled: true, onInteractEnabledChange });
    fireEvent.click(screen.getByRole("button", { name: "Interact with page" }));
    expect(onInteractEnabledChange).toHaveBeenCalledExactlyOnceWith(false);
  });
});
