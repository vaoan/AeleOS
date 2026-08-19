"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import type { ChromeKind } from "@/features/actors/domain/chromes";
import { playlistFromRows } from "@/features/actors/domain/playlist";
import { needsSprites } from "@/features/actors/presentation/chrome-style";
import {
  PlayerChrome,
  type PlayerLabels,
} from "@/features/actors/presentation/player-chrome";

/**
 * The sprite renderer, loaded only when a page actually wears Winamp.
 *
 * **This is the whole loading budget in one line.** Every other chrome is a
 * token set over {@link PlayerChrome}, so the roster costs a table; Winamp is a
 * sprite engine carrying the archive reader, the atlas and the sprite CSS, and
 * a page whose player is any other chrome must not pay for it.
 */
const WinampChrome = dynamic(() =>
  import("@/features/actors/presentation/winamp-chrome").then(
    (module) => module.WinampChrome,
  ),
);

/** One stored cell, as a playlist row carries it. */
interface StoredCell {
  /** The English text. */
  readonly text_en?: string;
  /** The Spanish text, when its author wrote one. */
  readonly text_es?: string;
}

/** What a leaf hands its player. */
export interface RetroPlayerProps {
  /** Whether there is a video pane, which decides the chrome roster. */
  readonly kind: ChromeKind;
  /** The chrome name, from the leaf's `icon`. */
  readonly chrome: string | undefined;
  /** The playlist, still in stored form. */
  readonly rows: readonly (readonly StoredCell[])[] | undefined;
  /** The `.wsz` address, from the leaf's `link_url`. Winamp reads it. */
  readonly skinUrl: string | undefined;
  /** What the person called this player. */
  readonly title: string;
  /** The language being read, which decides a song's title. */
  readonly locale: string;
}

/**
 * A leaf's player: its words resolved, its chrome chosen, its skin loaded.
 *
 * **The one client boundary the retro players need**, and it exists for two
 * reasons that both have to be true here rather than in `blocks.tsx`. The a11y
 * labels are APP chrome and must be bilingual, and `blocks.tsx` deliberately
 * has no translations at all — every word it renders is the author's own. And
 * the choice between the token renderer and the sprite one decides what to
 * LOAD, which only a client component can defer.
 *
 * The chrome components themselves take their words as props rather than
 * reading them, which is what keeps them testable without a provider.
 *
 * @param props - the leaf's player fields.
 * @returns the player.
 */
export function RetroPlayer(props: RetroPlayerProps): ReactNode {
  const { kind, chrome, rows, skinUrl, title, locale } = props;
  const t = useTranslations("fursonas");

  const labels: PlayerLabels = {
    play: t("playerPlay"),
    pause: t("playerPause"),
    stop: t("playerStop"),
    previous: t("playerPrevious"),
    next: t("playerNext"),
    shuffle: t("playerShuffle"),
    repeat: t("playerRepeat"),
    volume: t("playerVolume"),
    seek: t("playerSeek"),
    playlist: t("playerPlaylist"),
    unplayable: t("playerUnplayable"),
    empty: t("playerEmpty"),
  };

  const tracks = playlistFromRows(rows, locale);

  if (needsSprites(kind, chrome)) {
    return (
      <WinampChrome
        tracks={tracks}
        title={title}
        labels={labels}
        skinUrl={skinUrl}
      />
    );
  }

  return (
    <PlayerChrome
      kind={kind}
      chrome={chrome}
      tracks={tracks}
      title={title}
      labels={labels}
    />
  );
}
