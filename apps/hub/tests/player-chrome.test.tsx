import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { PlaylistTrack } from "@/features/actors/domain/playlist";
import {
  PlayerChrome,
  type PlayerLabels,
} from "@/features/actors/presentation/player-chrome";

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

function draw(overrides: Partial<Parameters<typeof PlayerChrome>[0]> = {}) {
  return render(
    <PlayerChrome
      kind="player"
      chrome="wmp9"
      tracks={tracks}
      title="Night drives"
      labels={labels}
      {...overrides}
    />,
  );
}

describe("PlayerChrome", () => {
  it("wears the chrome's tokens rather than any of its own colours", () => {
    const { container } = draw();
    const figure = container.querySelector("figure");
    // The whole point of the table: the component names no colour at all, so
    // swapping the chrome swaps the look with no component change.
    expect(figure?.getAttribute("style")).toContain("--chrome-accent: #2f7fd6");
    expect(figure?.dataset["chrome"]).toBe("wmp9");
  });

  it("wears a different chrome's tokens on the same markup", () => {
    const { container } = draw({ chrome: "vlc" });
    expect(container.querySelector("figure")?.getAttribute("style")).toContain(
      "--chrome-accent: #ff8800",
    );
  });

  it("falls back rather than drawing nothing for an unknown chrome", () => {
    const { container } = draw({ chrome: "wmp42" });
    const style = container.querySelector("figure")?.getAttribute("style");
    expect(style).toContain("--chrome-accent");
  });

  it("gives a player a video pane and a jukebox none", () => {
    // Not cosmetic: the pane is the only place a YouTube embed may legally be
    // shown, because YouTube's terms forbid hiding the player.
    const { container: player } = draw({ kind: "player" });
    expect(player.querySelector("video")).not.toBeNull();
    expect(player.querySelector("audio")).toBeNull();

    const { container: jukebox } = draw({ kind: "jukebox", chrome: "foobar" });
    expect(jukebox.querySelector("video")).toBeNull();
    expect(jukebox.querySelector("audio")).not.toBeNull();
  });

  it("names every control for a screen reader", () => {
    draw();
    for (const name of [
      "Previous",
      "Play",
      "Stop",
      "Next",
      "Shuffle",
      "Repeat",
    ]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    expect(screen.getByRole("slider", { name: "Seek" })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Volume" })).toBeInTheDocument();
  });

  it("plays and then offers to pause", () => {
    draw();
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Play" })).toBeNull();
  });

  it("shows the shuffle and repeat toggles as pressed", () => {
    draw();
    const shuffle = screen.getByRole("button", { name: "Shuffle" });
    expect(shuffle).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(shuffle);
    expect(shuffle).toHaveAttribute("aria-pressed", "true");
  });

  it("lists the playlist and marks what is playing", () => {
    draw();
    const list = screen.getByRole("list", { name: "Playlist" });
    const entries = within(list).getAllByRole("button");
    expect(entries).toHaveLength(2);
    expect(entries[0]).toHaveTextContent("1. Luna - Howl");
    expect(entries[1]).toHaveTextContent("2. Drift");

    fireEvent.click(entries[1]!);
    expect(entries[1]).toHaveAttribute("aria-current", "true");
    expect(entries[0]).not.toHaveAttribute("aria-current");
  });

  it("names the first track before anything is selected", () => {
    // A readout saying "no songs yet" over a playlist holding two of them
    // contradicts the list right under it. Seen on the showcase page.
    //
    // Scoped to the READOUT rather than the page: the playlist below carries
    // the same words, so an unscoped query finds two and the case fails for a
    // reason that has nothing to do with what it is asserting.
    const { container } = draw();
    const readout = container.querySelector('[aria-live="polite"]');
    expect(readout?.textContent).toBe("1. Luna - Howl");
    expect(screen.queryByText("Nothing here yet")).toBeNull();
  });

  it("says so when the playlist is empty, rather than showing a blank line", () => {
    // A blank readout reads as a player that failed to load rather than as one
    // nobody has filled in.
    draw({ tracks: [] });
    expect(screen.getByText("Nothing here yet")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Playlist" })).toBeNull();
  });

  it("asks for CORS first, so the analyser is available where it can be", () => {
    const { container } = draw();
    expect(container.querySelector("video")?.getAttribute("crossorigin")).toBe(
      "anonymous",
    );
  });
});
