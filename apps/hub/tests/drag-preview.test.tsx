// apps/hub/tests/drag-preview.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DragPreview } from "@/features/actors/presentation/drag-preview";

describe("DragPreview", () => {
  it("names what is being carried", () => {
    render(<DragPreview label="Picture" />);
    expect(screen.getByTestId("drag-preview")).toHaveTextContent("Picture");
  });

  // What sits behind this is a colour the page's author chose, and they may
  // choose any colour, so a translucent preview has no guaranteed contrast
  // and no measurement can give it one.
  //
  // **A WHOLE-TOKEN comparison, not a substring one, and that is load-bearing
  // rather than stylistic.** `bg-(--menu)` is a prefix of `bg-(--menu)/80` —
  // the alpha-channel modifier Tailwind appends after the token — so a plain
  // `toContain("bg-(--menu)")` against the raw class STRING would pass a
  // translucent regression unchanged, exactly the `bg-(--accent)` /
  // `bg-(--accent-soft)` trap `blocks.test.tsx` already documents. Splitting
  // on whitespace first and asserting membership in the resulting token list
  // is what makes `bg-(--menu)` and `bg-(--menu)/80` two different strings.
  it("is opaque, and wears the chrome scope", () => {
    render(<DragPreview label="Picture" />);
    const preview = screen.getByTestId("drag-preview");
    const classes = preview.className.split(/\s+/);
    expect(classes).toContain("bg-(--menu)");
    expect(classes).toContain("aeleos-chrome");
  });
});
