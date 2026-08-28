import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WritingInToggle } from "@/features/actors/presentation/writing-in-toggle";

const labels = {
  writingIn: "Writing in",
  writingInHint: "Only the page text — not the app.",
};

describe("WritingInToggle", () => {
  it("shows both languages and marks the active one", () => {
    render(<WritingInToggle lang="en" onSelect={() => {}} labels={labels} />);

    // **Both sides, and each naming itself.** A single button that flips can
    // only mean "the other one", which is the ambiguity this control exists
    // not to have — so the case asserts the inactive side is present, not
    // merely that the active one is.
    expect(screen.getByTestId("writing-in-en")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId("writing-in-es")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("carries both forms of each name, so one survives at every width", () => {
    render(<WritingInToggle lang="en" onSelect={() => {}} labels={labels} />);

    // The code and the endonym are swapped by `display`, which jsdom does not
    // resolve — so what is asserted is that BOTH are in the markup and which
    // class decides. Asserting the visible text alone would pass on a control
    // that rendered only the code at every width, which is the wrong answer
    // above `sm` and exactly what a careless simplification would produce.
    //
    // Read off `className` rather than through a `querySelector`, because a
    // Tailwind variant needs a backslash in the selector and this repository
    // has already lost an escape on the way to disk once.
    const spanish = screen.getByTestId("writing-in-es");
    expect(
      [...spanish.querySelectorAll("span")].map((span) => [
        span.className,
        span.textContent,
      ]),
    ).toEqual([
      ["md:hidden", "ES"],
      ["max-md:hidden", "Español"],
    ]);
  });

  it("names the control and explains what it does not reach", () => {
    render(<WritingInToggle lang="en" onSelect={() => {}} labels={labels} />);

    // The app's own language button sits in the header directly above this
    // bar. Without both of these there is nothing telling a reader — or a
    // screen reader — which of the two adjacent language controls this is.
    const group = screen.getByRole("group", { name: labels.writingIn });
    expect(group).toHaveAttribute("title", labels.writingInHint);
  });

  it("selects the side that was pressed rather than flipping", () => {
    const onSelect = vi.fn();
    render(<WritingInToggle lang="en" onSelect={onSelect} labels={labels} />);

    fireEvent.click(screen.getByTestId("writing-in-es"));
    expect(onSelect).toHaveBeenCalledWith("es");
  });

  it("selects the ACTIVE side when it is pressed, rather than flipping away", () => {
    const onSelect = vi.fn();
    render(<WritingInToggle lang="en" onSelect={onSelect} labels={labels} />);

    // **The case that tells `select` from `toggle`.** Pressing the side you
    // are already on is a no-op, and a control wired to `toggle` would answer
    // "es" here — so this is the only fixture on the page that can tell the
    // two verbs apart. Pressing the INACTIVE side cannot: both verbs agree
    // there.
    fireEvent.click(screen.getByTestId("writing-in-en"));
    expect(onSelect).toHaveBeenCalledWith("en");
  });

  it("submits nothing when it sits inside a form", () => {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <WritingInToggle lang="en" onSelect={() => {}} labels={labels} />
      </form>,
    );

    // Every button inside a form submits by default, and this control lives
    // inside the editor's own form — so an unspecified type would SAVE the
    // page on the way to switching language. Asserted on the form's own
    // submit EVENT, which is the only thing that can see it.
    fireEvent.click(screen.getByTestId("writing-in-es"));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
