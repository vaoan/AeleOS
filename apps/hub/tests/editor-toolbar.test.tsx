import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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

const labels = { save: "Save", saving: "Saving…", cancel: "Cancel" };

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
      cancelHref="/fursonas"
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
    expect(cancel).toHaveAttribute("href", "/fursonas");
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
});
