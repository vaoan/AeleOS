/**
 * One entry of somebody's playlist.
 *
 * **`url` is a link and nothing here ever fetches it to check.** Every picture
 * and every player on this platform is an address somebody pasted at a host
 * that was never ours, and a track is no different — see the external-media
 * rule in the root `CLAUDE.md`. Whether it plays is discovered by trying.
 */
export interface PlaylistTrack {
  /** Where the audio lives. */
  readonly url: string;
  /** What to call it, if somebody said. */
  readonly title?: string;
  /** Who made it, if somebody said. */
  readonly artist?: string;
}

/** How a playlist advances when a track ends or somebody presses next. */
export interface PlaylistMode {
  /** Whether the next track is drawn at random rather than taken in order. */
  readonly shuffle: boolean;
  /** Whether the end of the list wraps back to the start. */
  readonly repeat: boolean;
}

/**
 * Where a playlist goes next, or nowhere.
 *
 * **`null` means stop, and it is a real answer rather than a missing one.** The
 * end of a list with repeat off is the ordinary way playback finishes; a
 * function that wrapped anyway would make a playlist impossible to reach the
 * end of, which is the behaviour people find maddening about autoplay.
 *
 * **`random` is a parameter and never `Math.random()` called in here.** A
 * module that draws its own randomness cannot be tested for the branch that
 * matters — this repository has the rule written down as "a branch reached only
 * by a random draw is not covered, and the coverage number lies about it at a
 * low rate."
 *
 * Shuffle never answers the track already playing when the list has more than
 * one, because pressing next and hearing the same song is indistinguishable
 * from a button that did nothing.
 *
 * @param current - the index playing now, or -1 for nothing.
 * @param length - how many tracks the playlist holds.
 * @param mode - shuffle and repeat.
 * @param random - a draw in 0..1, supplied by the caller.
 * @returns the next index, or null to stop.
 */
export function nextIndex(
  current: number,
  length: number,
  mode: PlaylistMode,
  random: number,
): number | null {
  if (length <= 0) return null;
  if (length === 1) {
    // The only track: repeat plays it again, and otherwise it plays once and
    // stops — but a playlist that has not started yet still starts.
    if (mode.repeat) return 0;
    return current === 0 ? null : 0;
  }
  if (mode.shuffle) {
    // **With nothing playing, every track is a candidate** — the skip-the-
    // current mapping below would otherwise make track 0 unreachable as the
    // opening song of a shuffled playlist, silently, for ever.
    if (current < 0) return Math.min(length - 1, Math.floor(random * length));
    // Drawn from the OTHER tracks and then mapped back, so no draw is wasted
    // and the current track cannot come up — where re-drawing until it differs
    // has no bound on how long it takes.
    const drawn = Math.min(length - 2, Math.floor(random * (length - 1)));
    return drawn < current ? drawn : drawn + 1;
  }
  const following = current + 1;
  if (following < length) return following;
  return mode.repeat ? 0 : null;
}

/**
 * Where a playlist goes when somebody presses previous.
 *
 * **Previous does not shuffle**, and that is deliberate rather than an
 * omission: shuffle decides what comes NEXT, and a random "previous" is a
 * button whose label is a lie. It steps back through the list, and wraps only
 * when repeat is on for the same reason next does.
 *
 * @param current - the index playing now.
 * @param length - how many tracks the playlist holds.
 * @param mode - shuffle and repeat; only repeat is read.
 * @returns the previous index, or null to stay put.
 */
export function previousIndex(
  current: number,
  length: number,
  mode: PlaylistMode,
): number | null {
  if (length <= 0) return null;
  const before = current - 1;
  if (before >= 0) return before;
  return mode.repeat ? length - 1 : null;
}

/**
 * What Winamp's four digits show for a number of seconds.
 *
 * **Clamped at 99:59 rather than allowed to overflow**, because the display is
 * exactly four digits: an hour-long set would otherwise draw a five-digit
 * number into a four-digit box, painting over the marquee beside it.
 *
 * A negative or non-finite input answers zeroes. `currentTime` is `NaN` before
 * a track's metadata arrives, and `NaN` reaching the digit lookup draws no
 * digits at all — a clock that vanishes for the first moment of every track.
 *
 * @param seconds - how far through, or how long.
 * @returns the four digits, minutes first.
 */
export function clockDigits(seconds: number): readonly number[] {
  if (!Number.isFinite(seconds) || seconds < 0) return [0, 0, 0, 0];
  const whole = Math.min(Math.floor(seconds), 99 * 60 + 59);
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return [
    Math.floor(minutes / 10),
    minutes % 10,
    Math.floor(rest / 10),
    rest % 10,
  ];
}

/**
 * What the marquee scrolls for a track.
 *
 * Winamp's own form, `n. artist - title`, falling back through what somebody
 * actually wrote. **The address is the last resort and never nothing**: a track
 * with no title still has to be tellable from the one above it, and a blank
 * marquee reads as a player that failed to load rather than as a file nobody
 * named.
 *
 * @param track - the track, or undefined when the playlist is empty.
 * @param position - its one-based place in the playlist.
 * @returns the line to scroll.
 */
export function marqueeLine(
  track: PlaylistTrack | undefined,
  position: number,
): string {
  if (!track) return "";
  const named = [track.artist, track.title].filter(Boolean).join(" - ");
  return `${position}. ${named || track.url}`;
}

/**
 * One cell of a stored row, as the block schema shapes it.
 *
 * Declared here rather than imported so this module stays free of the schema —
 * it is read by a client component, and the schema pulls in zod.
 */
interface StoredCell {
  /** The English text, which is the default language of a cell. */
  readonly text_en?: string;
  /** The Spanish text, when its author wrote one. */
  readonly text_es?: string;
}

/**
 * Which cell of a row holds what.
 *
 * **The positions are the contract, and they are opaque in the data.** A
 * playlist is stored in a leaf's `rows` — the same field a `table` leaf uses —
 * because that field is already validated and capped by the live database at
 * 50 rows of 8 cells, with no migration written and no statement hand-applied.
 * A purpose-built `playlist` array would have arrived with no cap at all until
 * somebody wrote one, which `validate_block`'s own comment calls the thing it
 * exists to prevent.
 *
 * What it costs is this table: nothing in the stored JSON says cell 0 is an
 * address. It is named once here and once in {@link rowsFromPlaylist}, and
 * `playlist.test.ts` pins the round trip — but it IS a convention, which is
 * what rule 15 warns about, so it is written down where both directions can
 * see it rather than inferred at each end.
 */
const CELL = { url: 0, title: 1, artist: 2 } as const;

/**
 * The text of one cell, in the language somebody is reading.
 *
 * Same rule as `contentFor`: the reader's language when its author wrote one,
 * and English otherwise. **A song title is the author's own writing, so an
 * empty Spanish cell is somebody who has not written it yet and never a fault.**
 *
 * @param cell - the stored cell, if there is one.
 * @param locale - the language being read.
 * @returns the text, or an empty string.
 */
function cellText(cell: StoredCell | undefined, locale: string): string {
  if (!cell) return "";
  const localised = locale === "en" ? undefined : cell.text_es;
  const chosen = localised?.trim() ? localised : cell.text_en;
  return chosen?.trim() ?? "";
}

/**
 * A stored `rows` array read as a playlist.
 *
 * **A row with no address is dropped**, because a track that cannot be played
 * is not a track — it would sit in the list, be selectable, and do nothing.
 * That is the one silent-control failure this feature refuses everywhere.
 * A row whose title and artist are both blank is kept: `marqueeLine` falls back
 * to the address, so it is still tellable from its neighbours.
 *
 * @param rows - the leaf's stored rows, if it has any.
 * @param locale - the language being read.
 * @returns the playlist, in stored order.
 */
export function playlistFromRows(
  rows: readonly (readonly StoredCell[])[] | undefined,
  locale: string,
): PlaylistTrack[] {
  return (rows ?? []).flatMap((cells) => {
    const url = cellText(cells[CELL.url], locale);
    if (!url) return [];
    const title = cellText(cells[CELL.title], locale);
    const artist = cellText(cells[CELL.artist], locale);
    return [
      {
        url,
        ...(title ? { title } : {}),
        ...(artist ? { artist } : {}),
      },
    ];
  });
}

/**
 * A playlist written back as stored rows.
 *
 * The other half of {@link CELL}, so the editor and the renderer cannot
 * disagree about which cell is which. **English only**: the editor writes what
 * somebody typed into the default language, and a Spanish title is added by
 * editing the row rather than by this function inventing one.
 *
 * @param tracks - the playlist.
 * @returns rows, ready to store.
 */
export function rowsFromPlaylist(
  tracks: readonly PlaylistTrack[],
): { text_en: string }[][] {
  return tracks.map((track) => [
    { text_en: track.url },
    { text_en: track.title ?? "" },
    { text_en: track.artist ?? "" },
  ]);
}
