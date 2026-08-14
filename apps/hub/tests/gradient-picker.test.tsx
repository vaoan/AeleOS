import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { GradientPicker } from "@/features/actors/presentation/gradient-picker";
import type { Gradient } from "@/shared/domain/gradient";

const labels = {
  title: "Page background",
  bar: "Gradient stops",
  colour: "Colour",
  position: "Position",
  angle: "Angle",
  add: "Add colour",
  remove: "Remove",
};

/**
 * A gradient of three colours, evenly spread.
 *
 * @returns the gradient.
 */
const three = (): Gradient => ({
  angle: 90,
  stops: [
    { color: "#ff0000", at: 0 },
    { color: "#00ff00", at: 50 },
    { color: "#0000ff", at: 100 },
  ],
});

/**
 * Renders the picker and reports what it hands back.
 *
 * @param value - the gradient to start from.
 * @returns the change spy and a way to read the latest gradient.
 */
function renderPicker(value: Gradient = three()) {
  const onChange = vi.fn();
  // **Stateful, because the picker is controlled.** A spy alone would leave
  // `value` frozen at the first render, so a second interaction would act on
  // the original gradient rather than on the one the first produced — and a
  // test of two steps in a row would be testing neither.
  function Harness() {
    const [gradient, setGradient] = useState(value);
    return (
      <GradientPicker
        value={gradient}
        onChange={(next) => {
          onChange(next);
          setGradient(next);
        }}
        labels={labels}
      />
    );
  }
  const view = render(<Harness />);
  return {
    onChange,
    view,
    latest: () => onChange.mock.calls.at(-1)?.[0] as Gradient,
  };
}

describe("GradientPicker", () => {
  it("shows a handle per stop", () => {
    renderPicker();
    expect(screen.getAllByRole("button", { name: /^Colour \d/ })).toHaveLength(
      3,
    );
  });

  it("moves a stop when its position changes", () => {
    const { latest } = renderPicker();
    fireEvent.change(screen.getByTestId("gradient-position"), {
      target: { value: "30" },
    });
    expect(latest().stops.map((s) => s.at)).toEqual([30, 50, 100]);
  });

  // **THE REGRESSION TEST.** Selection was tracked by looking the stop up in the
  // new list by identity — which found the element already at that index and so
  // always returned it unchanged. Dragging a handle past its neighbour
  // therefore left the selection pointing at the neighbour, and the very next
  // colour change edited the wrong stop. Nothing failed; the gradient simply
  // came apart under the person's hands.
  it("keeps editing the stop that was dragged, not the one it passed", () => {
    const { latest } = renderPicker();

    // Select the first stop, then drag it past the second.
    fireEvent.click(screen.getByRole("button", { name: "Colour 1" }));
    fireEvent.change(screen.getByTestId("gradient-position"), {
      target: { value: "70" },
    });

    // It is now the middle stop. Recolouring must change THAT stop — the red
    // one that moved — and leave the green one it overtook alone.
    fireEvent.change(screen.getByTestId("gradient-colour"), {
      target: { value: "#ffffff" },
    });

    const stops = latest().stops;
    expect(stops.find((s) => s.at === 70)?.color).toBe("#ffffff");
    expect(stops.find((s) => s.at === 50)?.color).toBe("#00ff00");
  });

  it("adds a stop", () => {
    const { latest } = renderPicker();
    fireEvent.click(screen.getByTestId("gradient-add"));
    expect(latest().stops).toHaveLength(4);
  });

  it("removes the selected stop", () => {
    const { latest } = renderPicker();
    fireEvent.click(screen.getByRole("button", { name: "Colour 2" }));
    fireEvent.click(screen.getByTestId("gradient-remove"));
    expect(latest().stops.map((s) => s.color)).toEqual(["#ff0000", "#0000ff"]);
  });

  // A background with no colours is not a background, so the control must not
  // be able to empty itself into an invalid state.
  it("cannot remove the last stop", () => {
    renderPicker({ angle: 90, stops: [{ color: "#ff0000", at: 0 }] });
    expect(screen.getByTestId("gradient-remove")).toBeDisabled();
  });

  it("cannot add past the cap", () => {
    renderPicker({
      angle: 90,
      stops: Array.from({ length: 12 }, (_, i) => ({
        color: "#ff0000",
        at: i * 8,
      })),
    });
    expect(screen.getByTestId("gradient-add")).toBeDisabled();
  });

  it("turns the gradient", () => {
    const { latest } = renderPicker();
    fireEvent.change(screen.getByTestId("gradient-angle"), {
      target: { value: "200" },
    });
    expect(latest().angle).toBe(200);
  });
});
