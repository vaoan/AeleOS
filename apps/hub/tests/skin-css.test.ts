import { describe, expect, it } from "vitest";

import {
  MAIN_HEIGHT,
  MAIN_LAYOUT,
  MAIN_WIDTH,
  mainBox,
  SLIDER_FRAME_HEIGHT,
  SLIDER_FRAMES,
  TIME_DIGITS,
} from "@/features/actors/domain/skin-layout";
import {
  controlStyle,
  sliderStyle,
  spriteStyle,
  thumbOffset,
} from "@/features/actors/presentation/skin-css";

/** A skin whose every sheet resolved. */
const sheets = new Map(
  [
    "main.bmp",
    "cbuttons.bmp",
    "titlebar.bmp",
    "volume.bmp",
    "balance.bmp",
    "posbar.bmp",
    "numbers.bmp",
    "nums_ex.bmp",
    "playpaus.bmp",
    "monoster.bmp",
    "shufrep.bmp",
    "pledit.bmp",
  ].map((sheet) => [sheet, `blob:${sheet}`] as const),
);

describe("the main window layout", () => {
  it("is the size every classic skin paints", () => {
    expect([MAIN_WIDTH, MAIN_HEIGHT]).toEqual([275, 116]);
  });

  it("keeps every control inside the window", () => {
    const outside = [...MAIN_LAYOUT]
      .filter(
        ([, box]) =>
          box.left < 0 ||
          box.top < 0 ||
          box.left + box.width > MAIN_WIDTH ||
          box.top + box.height > MAIN_HEIGHT,
      )
      .map(([name]) => name);
    expect(outside).toEqual([]);
  });

  it("lays the five transport buttons in a row, edge to edge", () => {
    // 23 apart at 23 wide, so they abut — a gap here is a visible seam in the
    // one row of the window somebody uses most.
    const row = ["previous", "play", "pause", "stop", "next"].map((name) =>
      mainBox(name),
    );
    expect(row.map((box) => box?.left)).toEqual([16, 39, 62, 85, 108]);
    expect(row.every((box) => box?.top === 88)).toBe(true);
  });

  it("spaces the time digits as a clock rather than evenly", () => {
    // The minute/second gap is wider than the gap within either pair. Evenly
    // spacing them is the obvious simplification and it is wrong.
    const gaps = TIME_DIGITS.slice(1).map(
      (at, index) => at - (TIME_DIGITS[index] ?? 0),
    );
    expect(gaps).toEqual([12, 18, 12]);
  });

  it("answers undefined for a control the window does not have", () => {
    expect(mainBox("equaliser")).toBeUndefined();
    expect(mainBox("__proto__")).toBeUndefined();
  });
});

describe("spriteStyle", () => {
  it("cuts a sprite out of its own sheet", () => {
    expect(spriteStyle("MAIN_PLAY_BUTTON", sheets)).toEqual({
      backgroundImage: "url(blob:cbuttons.bmp)",
      backgroundPosition: "-23px -0px",
      backgroundRepeat: "no-repeat",
      width: "23px",
      height: "18px",
    });
  });

  it("answers undefined for a sprite no skin has", () => {
    expect(spriteStyle("MAIN_NOT_A_THING", sheets)).toBeUndefined();
  });

  it("answers undefined when this skin omits the sheet", () => {
    // Per-sprite rather than wholesale: a skin missing one sheet must still
    // draw everything else, so the caller needs to be told about that sheet
    // alone.
    const missing = new Map(sheets);
    missing.delete("cbuttons.bmp");
    expect(spriteStyle("MAIN_PLAY_BUTTON", missing)).toBeUndefined();
    expect(spriteStyle("MAIN_WINDOW_BACKGROUND", missing)).toBeDefined();
  });
});

describe("controlStyle", () => {
  it("takes the box from the layout and the picture from the atlas", () => {
    expect(controlStyle("play", "MAIN_PLAY_BUTTON", sheets)).toEqual({
      position: "absolute",
      left: "39px",
      top: "88px",
      width: "23px",
      height: "18px",
      backgroundImage: "url(blob:cbuttons.bmp)",
      backgroundPosition: "-23px -0px",
      backgroundRepeat: "no-repeat",
    });
  });

  it("still positions a control whose sprite this skin lacks", () => {
    // The box is ours and the picture is the skin's, so a missing sheet costs
    // the picture and never the position — otherwise one absent sheet would
    // pile every remaining control into the window's top-left corner.
    const missing = new Map(sheets);
    missing.delete("shufrep.bmp");
    expect(controlStyle("shuffle", "MAIN_SHUFFLE_BUTTON", missing)).toEqual({
      position: "absolute",
      left: "164px",
      top: "89px",
      width: "47px",
      height: "15px",
    });
  });

  it("answers undefined for a control the window does not have", () => {
    expect(
      controlStyle("equaliser", "MAIN_PLAY_BUTTON", sheets),
    ).toBeUndefined();
  });
});

describe("sliderStyle", () => {
  it("cuts the first frame at rest", () => {
    expect(sliderStyle("MAIN_VOLUME_BACKGROUND", sheets, 0)).toMatchObject({
      backgroundPosition: "-0px -0px",
      height: `${SLIDER_FRAME_HEIGHT}px`,
    });
  });

  it("cuts the last frame at full", () => {
    expect(sliderStyle("MAIN_VOLUME_BACKGROUND", sheets, 1)).toMatchObject({
      backgroundPosition: `-0px -${(SLIDER_FRAMES - 1) * SLIDER_FRAME_HEIGHT}px`,
    });
  });

  it("adds the sprite's own offset rather than replacing it", () => {
    // Balance's sprite starts at x=9 in its sheet. A slider that ignored that
    // would draw the volume sprite's left edge on a balance control, which
    // looks like a skin bug rather than a code one.
    expect(sliderStyle("MAIN_BALANCE_BACKGROUND", sheets, 0)).toMatchObject({
      backgroundPosition: "-9px -0px",
    });
  });

  it("clamps a fraction outside 0..1", () => {
    const low = sliderStyle("MAIN_VOLUME_BACKGROUND", sheets, -3);
    const high = sliderStyle("MAIN_VOLUME_BACKGROUND", sheets, 7);
    expect(low).toMatchObject({ backgroundPosition: "-0px -0px" });
    expect(high).toMatchObject({
      backgroundPosition: `-0px -${(SLIDER_FRAMES - 1) * SLIDER_FRAME_HEIGHT}px`,
    });
  });

  it("treats NaN as rest rather than letting it reach CSS", () => {
    // `-NaNpx` is dropped by the browser, which leaves the slider on frame zero
    // and looking like a control that does nothing — the exact failure this
    // feature refuses everywhere else.
    expect(
      sliderStyle("MAIN_VOLUME_BACKGROUND", sheets, Number.NaN),
    ).toMatchObject({ backgroundPosition: "-0px -0px" });
  });

  it("answers undefined for a sprite or a sheet it does not have", () => {
    expect(sliderStyle("MAIN_NOT_A_THING", sheets, 0.5)).toBeUndefined();
    const missing = new Map(sheets);
    missing.delete("volume.bmp");
    expect(sliderStyle("MAIN_VOLUME_BACKGROUND", missing, 0.5)).toBeUndefined();
  });
});

describe("thumbOffset", () => {
  it("leaves the thumb inside the trough at the end of a track", () => {
    // 248 wide, 29 thumb: the travel is 219. Using the trough's own width puts
    // the thumb 29px past the end at the close of every track.
    expect(thumbOffset(1, 248, 29)).toBe(219);
    expect(thumbOffset(0, 248, 29)).toBe(0);
    expect(thumbOffset(0.5, 248, 29)).toBe(110);
  });

  it("clamps, and never answers a negative travel", () => {
    expect(thumbOffset(-1, 248, 29)).toBe(0);
    expect(thumbOffset(2, 248, 29)).toBe(219);
    expect(thumbOffset(1, 10, 29)).toBe(0);
  });

  it("treats NaN as the start", () => {
    expect(thumbOffset(Number.NaN, 248, 29)).toBe(0);
  });
});
