import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const { EditorToolbar } =
  await import("@/features/actors/presentation/editor-toolbar");

const labels = { save: "Save", saving: "Saving…", cancel: "Cancel" };

/**
 * Renders the toolbar with overrides.
 *
 * @param props - what to override.
 * @returns the cancel spy.
 */
function renderToolbar(props: Record<string, unknown> = {}) {
  const onCancel = vi.fn();
  render(
    <EditorToolbar
      title="New fursona"
      labels={labels}
      saving={false}
      onCancel={onCancel}
      {...props}
    />,
  );
  return onCancel;
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

  it("calls back when cancelled", () => {
    const onCancel = renderToolbar();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("says it is saving while it is", () => {
    renderToolbar({ saving: true });
    expect(screen.getByRole("button", { name: "Saving…" })).toBeInTheDocument();
  });

  // The fault this prevents is a double submit. create_fursona would answer
  // the second one with "handle already taken" — a baffling error about a
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
