import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PlaylistTrack } from "@/features/actors/domain/playlist";
import type { SkinResult } from "@/features/actors/infrastructure/skin-loader";
import type { PlayerLabels } from "@/features/actors/presentation/player-chrome";
import { WinampChrome } from "@/features/actors/presentation/winamp-chrome";

const { loadSkin } = vi.hoisted(() => ({ loadSkin: vi.fn() }));
vi.mock("@/features/actors/infrastructure/skin-loader", () => ({ loadSkin }));

const labels: PlayerLabels = {
  play: "Play",
  pause: "Pause",
  stop: "Stop",
  previous: "Previous",
  next: "Next",
  shuffle: "Shuffle",
  repeat: "Repeat",
  volume: "Volume",
  seek: "Seek",
  playlist: "Playlist",
  unplayable: "That link will not play",
  empty: "Nothing here yet",
};

const tracks: PlaylistTrack[] = [
  { url: "https://a.test/1.mp3", title: "Howl", artist: "Luna" },
  { url: "https://a.test/2.mp3", title: "Drift" },
];

/** A skin that loaded, carrying whichever sheets a case needs. */
function skinWith(sheets: Record<string, string>): SkinResult {
  return {
    ok: true,
    skin: { sheets: new Map(Object.entries(sheets)), revoke: () => undefined },
  };
}

function draw(skinUrl?: string) {
  return render(
    <WinampChrome
      tracks={tracks}
      title="Night drives"
      labels={labels}
      skinUrl={skinUrl}
    />,
  );
}

beforeEach(() => loadSkin.mockReset());
afterEach(() => vi.restoreAllMocks());

describe("WinampChrome", () => {
  it("draws every control from tokens when there is no skin at all", () => {
    // The decision this renderer rests on: no artwork is shipped, so the
    // unskinned window is AeleOS's own look rather than a broken Winamp. There
    // is one rendering path, not a special "unskinned" mode.
    draw();
    for (const name of [
      "Previous",
      "Play",
      "Stop",
      "Next",
      "Shuffle",
      "Repeat",
    ]) {
      const button = screen.getByRole("button", { name });
      expect(button.dataset["painted"]).toBe("tokens");
    }
    expect(loadSkin).not.toHaveBeenCalled();
  });

  it("positions a control even with no picture for it", () => {
    // A missing sheet costs a control its FACE and never its place, or one
    // absent sheet piles the whole window into the top-left corner.
    draw();
    const play = screen.getByRole("button", { name: "Play" });
    expect(play.style.left).toBe("39px");
    expect(play.style.top).toBe("88px");
    expect(play.style.width).toBe("23px");
  });

  it("paints a control from the skin once one loads", async () => {
    loadSkin.mockResolvedValue(
      skinWith({ "cbuttons.bmp": "blob:buttons", "main.bmp": "blob:main" }),
    );
    draw("https://x.test/a.wsz");
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Play" }).dataset["painted"],
      ).toBe("sprite"),
    );
    const play = screen.getByRole("button", { name: "Play" });
    // jsdom normalises a CSS url() by quoting it; the value the component set
    // is the unquoted form.
    expect(play.style.backgroundImage).toContain("blob:buttons");
    // jsdom also normalises `-0px` to `0px`, so the sign is matched loosely
    // while the offset — the part that decides WHICH sprite is cut — is exact.
    expect(play.style.backgroundPosition).toMatch(/^-23px\s+-?0px$/);
  });

  it("paints only what the skin supplies, per sheet", async () => {
    // A real museum skin shipping some sheets and not others is ordinary, and
    // it must not cost the window the controls it DID supply.
    loadSkin.mockResolvedValue(skinWith({ "cbuttons.bmp": "blob:buttons" }));
    draw("https://x.test/partial.wsz");
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Play" }).dataset["painted"],
      ).toBe("sprite"),
    );
    expect(
      screen.getByRole("button", { name: "Shuffle" }).dataset["painted"],
    ).toBe("tokens");
  });

  it("keeps the window at its own size rather than reflowing", () => {
    const { container } = draw();
    const window_ = container.querySelector<HTMLElement>(
      "[class*='origin-top-left']",
    );
    expect(window_?.style.width).toBe("275px");
    expect(window_?.style.height).toBe("116px");
  });

  it("scales by a CONTAINER query, never a viewport breakpoint", () => {
    // A block in one place of a three-space section is about a third of the
    // page wide, so a `sm:` rule here answers a question about a box the window
    // does not live in. `blocks.test.tsx` asserts the same for the renderers.
    const { container } = draw();
    const classes = container.innerHTML;
    expect(classes).toContain("@[550px]:scale-200");
    expect(classes).not.toMatch(/\bsm:|\bmd:|\blg:|\bxl:/);
  });

  it("shows the track, the clock and the transport", () => {
    draw();
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(screen.getByText("1. Luna - Howl")).toBeInTheDocument();
    expect(screen.getByText("00:00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
  });

  it("offers seek and volume as real sliders", () => {
    draw();
    expect(screen.getByRole("slider", { name: "Seek" })).toBeInTheDocument();
    const volume = screen.getByRole("slider", { name: "Volume" });
    fireEvent.change(volume, { target: { value: "0.3" } });
    expect((volume as HTMLInputElement).value).toBe("0.3");
  });

  it("says so when a playlist is empty", () => {
    render(
      <WinampChrome
        tracks={[]}
        title="Empty"
        labels={labels}
        skinUrl={undefined}
      />,
    );
    expect(screen.getByText("Nothing here yet")).toBeInTheDocument();
  });
});
