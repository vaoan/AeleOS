import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CANVASES, DEFAULT_THEME } from "@/features/actors/domain/actor-theme";
import {
  ThemeConfigurator,
  type ThemeConfiguratorLabels,
} from "@/features/actors/presentation/theme-configurator";
import { SKINS } from "@/shared/domain/skins";

// WHAT THIS FILE PINS, AND WHAT IT CANNOT.
//
// The animation's three controls were scattered down this panel in the order
// they happened to be written: its colours near the top, its dials in the
// middle, and the menu that PICKS it at the bottom — so somebody set a thing's
// colours and its speed before choosing which thing. Nothing was broken, which
// is exactly why nothing caught it: every control worked, and each one on its
// own looked like it was in a sensible place.
//
// So the assertion is CONTAINMENT, not presence. "The dials are on the page"
// passes with them back at the bottom of it; "the dials are inside the box the
// menu is in" does not.
//
// What this cannot pin is the other half of the same report: the label on the
// animation's colours was simply the wrong words, and in Spanish it collided
// with the two other things on this panel named after the background. A
// catalogue key holding wrong copy is indistinguishable from one holding right
// copy to anything that can be written here. `messages.test.ts` proves both
// languages carry every key; nothing proves the words are the right ones, and
// nothing here should pretend to.

/** Labels, distinguishable from each other so a query cannot pass by accident. */
const LABELS: ThemeConfiguratorLabels = {
  title: "How your page looks",
  live: "Changes show straight away",
  gradient: {
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
  },
  accent: "Accent",
  canvasColours: "Animation colours",
  canvasGroup: "The moving backdrop",
  canvasGroupHint: "It moves behind your page.",
  canvas: "Animation",
  density: "How busy",
  speed: "How fast",
  scale: "How big",
  canvases: Object.fromEntries(
    CANVASES.map((canvas) => [canvas, `canvas:${canvas}`]),
  ) as ThemeConfiguratorLabels["canvases"],
  skin: "Style",
  skins: Object.fromEntries(
    SKINS.map((skin) => [skin, `skin:${skin}`]),
  ) as ThemeConfiguratorLabels["skins"],
  adjusted: "Your accent, as visitors see it",
  reset: "Back to the default look",
  copyFromProfile: "Use my profile's look",
  usingDefault: "Default",
  cursor: "Cursor picture",
  cursorHint: "A link to a small picture.",
  cursorTooBig: "That picture is too big.",
  backgroundUrl: "Background picture",
  backgroundUrlHint: "A link to a picture, over your gradient.",
  backgroundFit: "Fit",
  backgroundFitCover: "Cover",
  backgroundFitTile: "Tile",
};

/**
 * Renders the panel with it open.
 *
 * @param theme - the theme to show.
 * @returns the change spy.
 */
function openPanel(theme = DEFAULT_THEME) {
  const onChange = vi.fn();
  render(
    <ThemeConfigurator value={theme} onChange={onChange} labels={LABELS} />,
  );
  // The panel is collapsed until asked for: it is the longest thing in the
  // editor and most edits never touch it.
  fireEvent.click(screen.getByTestId("theme-open"));
  return onChange;
}

describe("ThemeConfigurator", () => {
  describe("the animation's own box", () => {
    it("names itself and says what it is", () => {
      openPanel();
      const group = screen.getByTestId("theme-animation");
      expect(group).toHaveTextContent("The moving backdrop");
      expect(group).toHaveTextContent("It moves behind your page.");
    });

    // The menu comes FIRST inside the box. Everything else in there describes
    // whatever it names, so choosing after tuning is the order that made this
    // confusing in the first place.
    it("holds the menu that picks one", () => {
      openPanel();
      expect(screen.getByTestId("theme-animation")).toContainElement(
        screen.getByTestId("theme-canvas"),
      );
    });

    it("holds that animation's own colours", () => {
      openPanel();
      expect(screen.getByTestId("theme-animation")).toContainElement(
        screen.getByTestId("theme-canvas-colour-0"),
      );
    });

    it.each(["density", "speed", "scale"] as const)(
      "holds the %s dial",
      (dial) => {
        openPanel();
        expect(screen.getByTestId("theme-animation")).toContainElement(
          screen.getByTestId(`theme-${dial}`),
        );
      },
    );

    // The page's own gradient is a different thing that was called the same
    // word, which is the whole reason this box exists. It must stay outside.
    // Selected by test id rather than by label text: every slider in the
    // gradient picker reads its own value out inside its `<label>`, the way
    // the canvas dials beside it always have, so the label's text is "Angle"
    // followed by the degrees and an exact match on the name finds nothing.
    it("leaves the page's background outside it", () => {
      openPanel();
      expect(screen.getByTestId("theme-animation")).not.toContainElement(
        screen.getByTestId("gradient-angle"),
      );
    });

    // `none` draws nothing, so a dial for it accepts a drag and changes
    // nothing — the control-that-does-nothing this panel keeps being trimmed
    // for. The box stays, because the menu that picks something else is in it.
    it("drops the dials when nothing is drawn", () => {
      openPanel({ ...DEFAULT_THEME, canvas: "none" });
      expect(screen.queryByTestId("theme-density")).not.toBeInTheDocument();
      expect(screen.getByTestId("theme-animation")).toContainElement(
        screen.getByTestId("theme-canvas"),
      );
    });
  });

  describe("the background picture", () => {
    it("changes the address", () => {
      const onChange = openPanel();
      fireEvent.change(screen.getByTestId("theme-background-url"), {
        target: { value: "https://example.test/wallpaper.png" },
      });
      expect(onChange).toHaveBeenCalledWith({
        ...DEFAULT_THEME,
        backgroundUrl: "https://example.test/wallpaper.png",
      });
    });

    // The same control-that-does-nothing rule as the canvas dials: a fit
    // select is pointless while there is no picture to place.
    it("offers no fit until there is a picture", () => {
      openPanel();
      expect(
        screen.queryByTestId("theme-background-fit"),
      ).not.toBeInTheDocument();
    });

    it("offers the fit once there is a picture", () => {
      openPanel({
        ...DEFAULT_THEME,
        backgroundUrl: "https://example.test/wallpaper.png",
      });
      expect(screen.getByTestId("theme-background-fit")).toBeInTheDocument();
    });

    it("changes the fit", () => {
      const onChange = openPanel({
        ...DEFAULT_THEME,
        backgroundUrl: "https://example.test/wallpaper.png",
      });
      fireEvent.change(screen.getByTestId("theme-background-fit"), {
        target: { value: "tile" },
      });
      expect(onChange).toHaveBeenCalledWith({
        ...DEFAULT_THEME,
        backgroundUrl: "https://example.test/wallpaper.png",
        backgroundFit: "tile",
      });
    });
  });
});
