import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { GradientPicker } from "@/features/actors/presentation/gradient-picker";
import { DEFAULT_GRADIENT } from "@/shared/domain/gradient";
import type { Gradient } from "@/shared/domain/gradient";

const labels = {
  title: "Page background",
  bar: "Gradient stops",
  colour: "Colour",
  position: "Position",
  angle: "Angle",
  add: "Add colour",
  remove: "Remove",
  kind: "Shape",
  kinds: { linear: "Linear", radial: "Radial", conic: "Conic" },
  repeat: "Repeat the colours",
  every: "Repeat every",
  shape: "Circle or ellipse",
  shapes: { ellipse: "Ellipse", circle: "Circle" },
  extent: "How far it reaches",
  extents: {
    "closest-side": "To the nearest edge",
    "closest-corner": "To the nearest corner",
    "farthest-side": "To the furthest edge",
    "farthest-corner": "To the furthest corner",
  },
  centreX: "Centre across",
  centreY: "Centre down",
  preview: "How the background looks",
};

/**
 * A gradient of three colours, evenly spread.
 *
 * @returns the gradient.
 */
const three = (): Gradient => ({
  ...DEFAULT_GRADIENT,
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
    renderPicker({
      ...DEFAULT_GRADIENT,
      angle: 90,
      stops: [{ color: "#ff0000", at: 0 }],
    });
    expect(screen.getByTestId("gradient-remove")).toBeDisabled();
  });

  it("cannot add past the cap", () => {
    renderPicker({
      ...DEFAULT_GRADIENT,
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

describe("GradientPicker, the shape of the gradient", () => {
  it("changes the kind", () => {
    const { latest } = renderPicker();
    fireEvent.change(screen.getByTestId("gradient-kind"), {
      target: { value: "conic" },
    });
    expect(latest().kind).toBe("conic");
  });

  // A radial gradient runs outward from a point and has no direction. A slider
  // that turns something with no direction is a slider that does nothing, and
  // nothing about it would tell the person that.
  it("drops the direction for a radial gradient and keeps it for a conic", () => {
    const { view } = renderPicker({ ...three(), kind: "radial" });
    expect(screen.queryByTestId("gradient-angle")).toBeNull();
    view.rerender(
      <GradientPicker
        value={{ ...three(), kind: "conic" }}
        onChange={() => {}}
        labels={labels}
      />,
    );
    expect(screen.getByTestId("gradient-angle")).toBeInTheDocument();
  });

  it("offers the shape and the extent to a radial gradient only", () => {
    renderPicker();
    expect(screen.queryByTestId("gradient-shape")).toBeNull();
    expect(screen.queryByTestId("gradient-extent")).toBeNull();
    fireEvent.change(screen.getByTestId("gradient-kind"), {
      target: { value: "radial" },
    });
    expect(screen.getByTestId("gradient-shape")).toBeInTheDocument();
    expect(screen.getByTestId("gradient-extent")).toBeInTheDocument();
  });

  it("changes the shape and the extent", () => {
    const { latest } = renderPicker({ ...three(), kind: "radial" });
    fireEvent.change(screen.getByTestId("gradient-shape"), {
      target: { value: "circle" },
    });
    expect(latest().shape).toBe("circle");
    fireEvent.change(screen.getByTestId("gradient-extent"), {
      target: { value: "closest-side" },
    });
    expect(latest().extent).toBe("closest-side");
  });

  // A centre belongs to the kinds that have one. A linear gradient has a
  // direction instead.
  it("offers a centre to the two kinds that have one", () => {
    renderPicker();
    expect(screen.queryByTestId("gradient-x")).toBeNull();
    fireEvent.change(screen.getByTestId("gradient-kind"), {
      target: { value: "radial" },
    });
    expect(screen.getByTestId("gradient-x")).toBeInTheDocument();
    expect(screen.getByTestId("gradient-y")).toBeInTheDocument();
  });

  it("moves the centre", () => {
    const { latest } = renderPicker({ ...three(), kind: "conic" });
    fireEvent.change(screen.getByTestId("gradient-x"), {
      target: { value: "20" },
    });
    expect(latest().x).toBe(20);
    fireEvent.change(screen.getByTestId("gradient-y"), {
      target: { value: "80" },
    });
    expect(latest().y).toBe(80);
  });
});

describe("GradientPicker, repetition", () => {
  it("turns repetition on", () => {
    const { latest } = renderPicker();
    fireEvent.click(screen.getByTestId("gradient-repeating"));
    expect(latest().repeating).toBe(true);
  });

  // The length only means something while repetition is on, and a slider shown
  // beside a switch that is off is the same fault in smaller clothes.
  it("shows the length only while repetition is on", () => {
    renderPicker();
    expect(screen.queryByTestId("gradient-every")).toBeNull();
    fireEvent.click(screen.getByTestId("gradient-repeating"));
    expect(screen.getByTestId("gradient-every")).toBeInTheDocument();
  });

  it("changes the length of one repetition", () => {
    const { latest } = renderPicker({ ...three(), repeating: true });
    fireEvent.change(screen.getByTestId("gradient-every"), {
      target: { value: "40" },
    });
    expect(latest().every).toBe(40);
  });
});

describe("GradientPicker, what it shows", () => {
  // **The handles sit at their stops' positions.** Painting the bar with the
  // radial or conic form would put every handle somewhere other than the colour
  // it carries, so the bar stays a left-to-right ramp and the RESULT gets its
  // own tile. Sabotage this by giving the bar `gradientCss(value)` and the two
  // assertions below swap places.
  it("keeps the stop bar a ramp and shows the result beside it", () => {
    renderPicker({ ...three(), kind: "radial", repeating: true, every: 20 });
    expect(screen.getByTestId("gradient-bar")).toHaveStyle({
      background:
        "linear-gradient(90deg, #ff0000 0%, #00ff00 50%, #0000ff 100%)",
    });
    expect(screen.getByTestId("gradient-preview").style.background).toContain(
      "repeating-radial-gradient(",
    );
  });

  it("names the result for anybody who cannot see it", () => {
    renderPicker();
    expect(screen.getByLabelText(labels.preview)).toBeInTheDocument();
  });
});
