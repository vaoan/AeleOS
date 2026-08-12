import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { StarToggle } from "@/components/star-toggle";

describe("StarToggle", () => {
  it("exposes its state to assistive technology", () => {
    render(<StarToggle pressed onToggle={vi.fn()} label="Nebula background" />);
    expect(screen.getByRole("button", { pressed: true })).toBeInTheDocument();
  });

  it("reports pressed=false when the nebula is off", () => {
    render(
      <StarToggle
        pressed={false}
        onToggle={vi.fn()}
        label="Nebula background"
      />,
    );
    expect(screen.getByRole("button", { pressed: false })).toBeInTheDocument();
  });

  // It is an unlabelled dot, so the accessible name is the only thing telling
  // a screen-reader user what it does.
  it("takes its accessible name from the label", () => {
    render(<StarToggle pressed onToggle={vi.fn()} label="Fondo de nebulosa" />);
    expect(
      screen.getByRole("button", { name: "Fondo de nebulosa" }),
    ).toBeInTheDocument();
  });

  it("calls back on click", () => {
    const onToggle = vi.fn();
    render(<StarToggle pressed onToggle={onToggle} label="Nebula" />);
    screen.getByRole("button").click();
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("does not call back when it was not activated", () => {
    const onToggle = vi.fn();
    render(<StarToggle pressed onToggle={onToggle} label="Nebula" />);
    expect(onToggle).not.toHaveBeenCalled();
  });

  // The 11px dot alone is below the 24x24 target minimum, so the hit area has
  // to be the button around it. This class assertion is a proxy; the real
  // measurement is the e2e test in Task 7.
  it("puts the hit area on the button, not the dot", () => {
    render(<StarToggle pressed onToggle={vi.fn()} label="Nebula" />);
    expect(screen.getByRole("button").className).toMatch(/size-\[30px\]/);
  });

  it("is a real button, so it is keyboard reachable", () => {
    render(<StarToggle pressed onToggle={vi.fn()} label="Nebula" />);
    const button = screen.getByRole("button");
    expect(button.tagName).toBe("BUTTON");
    // Inside a form this would otherwise submit it.
    expect(button).toHaveAttribute("type", "button");
  });

  it("shows a visible focus ring, since the dot has no other affordance", () => {
    render(<StarToggle pressed onToggle={vi.fn()} label="Nebula" />);
    expect(screen.getByRole("button").className).toMatch(/focus-visible:/);
  });

  // The star going out is the whole metaphor: it is the light source, and the
  // dust it lights disappears with it.
  it("dims and shrinks the dot when off", () => {
    const { container, rerender } = render(
      <StarToggle pressed onToggle={vi.fn()} label="Nebula" />,
    );
    const dot = () => container.querySelector("span");
    expect(dot()?.className).toMatch(/bg-star/);
    rerender(<StarToggle pressed={false} onToggle={vi.fn()} label="Nebula" />);
    expect(dot()?.className).not.toMatch(/bg-star/);
    expect(dot()?.className).toMatch(/scale-/);
  });
});
