import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

// The real FursonaForm. Like actor-tile, it sits in an excluded coverage path
// and no gate asks for this file — but the form-level alert below is the only
// thing standing between a person at the fursona quota and a blank error
// boundary, and asserting it against a hand-written copy of the markup would
// prove nothing.
const { FursonaForm } =
  await import("@/features/actors/presentation/fursona-form");

/** Every label the form needs, with the error codes it can be handed. */
const labels = {
  handle: "Handle",
  handleHint: "1-32 characters.",
  displayName: "Display name",
  avatarUrl: "Avatar",
  visibilityLabel: "Visibility",
  submit: "Create",
  visibility: { private: "Private", unlisted: "Unlisted", public: "Public" },
  errors: {
    handle: "Bad handle.",
    handleTaken: "That handle is already taken.",
    displayName: "Too long.",
    avatarUrl: "Bad address.",
    visibility: "Pick one.",
    limitReached: "You have reached the maximum number of fursonas.",
  },
};

/**
 * Renders the form with a server action that returns the given state.
 *
 * `useActionState` seeds from its initial value, so the state under test is
 * supplied by invoking the action rather than by prop — which is also how it
 * arrives in the real app.
 *
 * @param errors - the error codes the action reports.
 * @returns the rendered form element, ready to submit.
 */
function renderWithErrors(errors: Record<string, string>): HTMLFormElement {
  const { container } = render(
    <FursonaForm
      action={() => Promise.resolve({ errors })}
      labels={labels}
      handleEditable
    />,
  );
  const el = container.querySelector("form");
  if (!el) throw new Error("the form did not render");
  return el;
}

describe("FursonaForm", () => {
  it("renders no alert when nothing failed", () => {
    renderWithErrors({});
    expect(screen.queryByRole("alert")).toBeNull();
  });

  // The quota reaches the form under the reserved `form` key rather than a
  // field name (see createFursonaAction). Without a branch that renders it, the
  // action's mapping is dead code and the person sees a form that silently did
  // nothing — which is worse than the error boundary it replaced.
  it("renders a form-level alert for an error keyed to the form", async () => {
    // useActionState holds the initial state until the action has run, so the
    // form is submitted rather than the state being injected as a prop — the
    // same path a real refusal takes.
    fireEvent.submit(renderWithErrors({ form: "limitReached" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "You have reached the maximum number of fursonas.",
      );
    });
  });

  // Keyed to a field, the same message must NOT become a form-level alert —
  // otherwise `form` is not reserved and any field error would double up.
  it("does not raise a field error to the form level", async () => {
    fireEvent.submit(renderWithErrors({ handle: "handleTaken" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "That handle is already taken.",
      );
    });
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });
});
