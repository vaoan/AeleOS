// apps/hub/tests/drag-preview.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DragPreview } from "@/features/actors/presentation/drag-preview";

describe("DragPreview", () => {
  it("names what is being carried", () => {
    render(<DragPreview label="Picture" />);
    expect(screen.getByTestId("drag-preview")).toBeInTheDocument();
  });

  // What sits behind this is a colour the page's author chose, and they may
  // choose any colour, so a translucent preview has no guaranteed contrast
  // and no measurement can give it one.
  it("is opaque, and wears the chrome scope", () => {
    render(<DragPreview label="Picture" />);
    const preview = screen.getByTestId("drag-preview");
    expect(preview.className).toContain("bg-(--menu)");
    expect(preview.className).toContain("aeleos-chrome");
  });
});
