import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

const { FormErrorBanner } =
  await import("@/features/actors/presentation/form-error-banner");

const labels = {
  title: "Fix these before saving",
  errors: {
    handle: "Use 1-32 letters, digits, dashes or underscores.",
    handleTaken: "You already have a fursona with that handle.",
    limitReached: "You already have the maximum number of fursonas.",
    avatarUrl: "Enter an http or https image address.",
  },
};

describe("FormErrorBanner", () => {
  it("renders nothing when there is nothing wrong", () => {
    const { container } = render(
      <FormErrorBanner errors={{}} labels={labels} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  // The whole point of a banner. A long editor scrolls a field error out of
  // view, so somebody presses Save, nothing appears to happen, and the reason
  // is four hundred pixels below them.
  it("lists every problem at once", () => {
    render(
      <FormErrorBanner
        errors={{ handle: "handleTaken", avatarUrl: "avatarUrl" }}
        labels={labels}
      />,
    );
    expect(
      screen.getByText("You already have a fursona with that handle."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Enter an http or https image address."),
    ).toBeInTheDocument();
  });

  it("announces itself, so it is not only a visual change", () => {
    render(
      <FormErrorBanner errors={{ handle: "handleTaken" }} labels={labels} />,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("shows its heading", () => {
    render(
      <FormErrorBanner errors={{ handle: "handleTaken" }} labels={labels} />,
    );
    expect(screen.getByText("Fix these before saving")).toBeInTheDocument();
  });

  // Codes the editor invents (handleTaken, limitReached) and codes zod produces
  // both arrive here, exactly as they do in the field-level messages.
  it("renders a form-level code as readily as a field one", () => {
    render(
      <FormErrorBanner errors={{ form: "limitReached" }} labels={labels} />,
    );
    expect(
      screen.getByText("You already have the maximum number of fursonas."),
    ).toBeInTheDocument();
  });

  // A code with no message must not render an empty bullet, which reads as a
  // problem nobody will name.
  it("skips a code it has no message for", () => {
    render(
      <FormErrorBanner
        errors={{ mystery: "somethingUnmapped" }}
        labels={labels}
      />,
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
