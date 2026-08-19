/**
 * Which kind of leaf a chrome can be drawn by.
 *
 * **The split is a video surface, and it is a LICENSING line rather than a
 * technical one.** A playlist can hold a YouTube address and play it by driving
 * the provider's own embed over `postMessage` — but YouTube's terms forbid
 * hiding or obscuring the player, so only a chrome with somewhere to SHOW it
 * may offer that. A `player` has a pane by construction; a `jukebox` has none,
 * and refuses such an address by name rather than accepting it and playing
 * nothing.
 *
 * Splitting by capability rather than by product is what makes it survive the
 * next chrome: anything with a pane joins `player`, anything without joins
 * `jukebox`, and nobody has to remember which brand is which.
 */
export type ChromeKind = "player" | "jukebox";

/**
 * The custom properties one chrome overrides.
 *
 * **A chrome is DATA, and that is the whole reason the roster can be long.**
 * Every media player of that era draws the same handful of things — a transport
 * row, a seek bar, a volume control, a title readout, a playlist, and for a
 * `player` a video pane. What differs is ornament. So one component per kind
 * reads these, and twenty chromes cost a few hundred bytes of table rather than
 * twenty lazily-loaded chunks.
 *
 * This is the shape `SKINS` already uses in `shared/domain/skins.ts`, and it is
 * deliberately the same shape: a reader who has understood one has understood
 * both.
 */
export type ChromeTokens = Readonly<Record<`--${string}`, string>>;

/** One chrome: which kind it belongs to, and how it paints. */
export interface Chrome {
  /** The name stored on the leaf's `icon`. */
  readonly id: string;
  /** Which leaf kind may draw it. */
  readonly kind: ChromeKind;
  /**
   * Whether it is drawn from a `.wsz` sprite sheet rather than from tokens.
   *
   * **True for exactly one chrome, and that is why it is a flag rather than a
   * kind.** Winamp is not a token set — it is a sprite engine reading a real
   * file format, with ~100,000 published skins behind it. Everything that makes
   * it different is behind this flag, and the renderer uses it to decide
   * whether to load the sprite path at all.
   */
  readonly sprites?: true;
  /** What it overrides. Anything absent inherits the defaults. */
  readonly tokens: ChromeTokens;
}

/**
 * What every chrome starts from, so a partial one cannot fall through.
 *
 * **A chrome states only its DIFFERENCES, and this is spread underneath.** That
 * is the fix `nestedSkinVars` already had to make for skins: a token set holding
 * only overrides is correct at exactly one scope, and two of them nested means
 * "not set" falls through to whatever encloses it rather than to the default. A
 * page may hold two players, so this must be complete.
 */
export const CHROME_DEFAULTS: ChromeTokens = {
  "--chrome-shell": "#2b2f36",
  "--chrome-edge": "#14171c",
  "--chrome-highlight": "#4a515c",
  "--chrome-radius": "6px",
  "--chrome-pane": "#000000",
  "--chrome-face": "#22262c",
  "--chrome-ink": "#e8ecf2",
  "--chrome-ink-dim": "#98a2b0",
  "--chrome-accent": "#5ee0b5",
  "--chrome-button": "#343a43",
  "--chrome-button-edge": "#171a1f",
  "--chrome-button-radius": "4px",
  "--chrome-gloss":
    "linear-gradient(180deg,rgb(255 255 255/14%),transparent 55%)",
  "--chrome-shadow": "0 2px 6px rgb(0 0 0/45%)",
  "--chrome-font":
    "ui-sans-serif, 'Segoe UI', Tahoma, system-ui, -apple-system, sans-serif",
};

/**
 * Every chrome a `player` may wear, in the order the editor offers them.
 *
 * **`as const` is load-bearing rather than tidy.** It types the first element
 * as present, so {@link chromeFor} can fall back to it with no runtime check —
 * where a plain array types `[0]` as possibly undefined and forces a `throw` no
 * input can reach. An unreachable branch holds coverage under the threshold for
 * ever with nothing to write a case against, so the guarantee belongs in the
 * type.
 */
const PLAYER_CHROMES = [
  {
    id: "wmp9",
    kind: "player",
    tokens: {
      "--chrome-shell":
        "linear-gradient(180deg,#f4f6f9 0%,#d3d9e2 48%,#b9c2cf 100%)",
      "--chrome-edge": "#8e98a8",
      "--chrome-highlight": "#ffffff",
      "--chrome-radius": "10px",
      "--chrome-face": "rgb(255 255 255/55%)",
      "--chrome-ink": "#1d2530",
      "--chrome-ink-dim": "#5d6878",
      "--chrome-accent": "#2f7fd6",
      "--chrome-button":
        "linear-gradient(180deg,#ffffff 0%,#dfe5ee 55%,#c6cedb 100%)",
      "--chrome-button-edge": "#939dad",
      "--chrome-button-radius": "50%",
      "--chrome-gloss":
        "linear-gradient(180deg,rgb(255 255 255/70%),transparent 48%)",
      "--chrome-shadow": "0 3px 10px rgb(20 30 45/28%)",
    },
  },
  {
    id: "wmp7",
    kind: "player",
    tokens: {
      "--chrome-shell":
        "linear-gradient(180deg,#3f4fa8 0%,#26307a 55%,#161d52 100%)",
      "--chrome-edge": "#0d1240",
      "--chrome-highlight": "#8c9bff",
      "--chrome-radius": "18px",
      "--chrome-face": "rgb(10 14 55/55%)",
      "--chrome-ink": "#e9ecff",
      "--chrome-ink-dim": "#9aa4e0",
      "--chrome-accent": "#7ee8ff",
      "--chrome-button":
        "linear-gradient(180deg,#6b7bdd 0%,#3b48a5 60%,#28328a 100%)",
      "--chrome-button-edge": "#141a5c",
      "--chrome-button-radius": "50%",
      "--chrome-gloss":
        "linear-gradient(180deg,rgb(255 255 255/34%),transparent 52%)",
      "--chrome-shadow": "0 4px 14px rgb(8 12 50/55%)",
    },
  },
  {
    id: "wmp8",
    kind: "player",
    tokens: {
      "--chrome-shell":
        "linear-gradient(180deg,#dfe8f6 0%,#a9c0e2 60%,#7f9dc9 100%)",
      "--chrome-edge": "#5d7aa6",
      "--chrome-highlight": "#ffffff",
      "--chrome-radius": "8px",
      "--chrome-face": "rgb(255 255 255/45%)",
      "--chrome-ink": "#16283f",
      "--chrome-ink-dim": "#4e6a8f",
      "--chrome-accent": "#f0a30a",
      "--chrome-button":
        "linear-gradient(180deg,#ffffff 0%,#cddcf2 60%,#a8c0e0 100%)",
      "--chrome-button-edge": "#6a86b2",
      "--chrome-button-radius": "6px",
      "--chrome-gloss":
        "linear-gradient(180deg,rgb(255 255 255/62%),transparent 46%)",
      "--chrome-shadow": "0 3px 9px rgb(30 55 95/30%)",
    },
  },
  {
    id: "vlc",
    kind: "player",
    tokens: {
      "--chrome-shell": "#f2f2f2",
      "--chrome-edge": "#b8b8b8",
      "--chrome-highlight": "#ffffff",
      "--chrome-radius": "2px",
      "--chrome-face": "#e6e6e6",
      "--chrome-ink": "#1d1d1d",
      "--chrome-ink-dim": "#6b6b6b",
      "--chrome-accent": "#ff8800",
      "--chrome-button": "#ececec",
      "--chrome-button-edge": "#bdbdbd",
      "--chrome-button-radius": "2px",
      "--chrome-gloss": "none",
      "--chrome-shadow": "0 1px 3px rgb(0 0 0/18%)",
    },
  },
  {
    id: "quicktime",
    kind: "player",
    tokens: {
      "--chrome-shell":
        "linear-gradient(180deg,#dcdcdc 0%,#b9b9b9 50%,#9d9d9d 100%)",
      "--chrome-edge": "#6f6f6f",
      "--chrome-highlight": "#f6f6f6",
      "--chrome-radius": "14px",
      "--chrome-face": "rgb(255 255 255/38%)",
      "--chrome-ink": "#232323",
      "--chrome-ink-dim": "#5f5f5f",
      "--chrome-accent": "#3f6fa8",
      "--chrome-button":
        "linear-gradient(180deg,#efefef 0%,#c9c9c9 55%,#adadad 100%)",
      "--chrome-button-edge": "#7c7c7c",
      "--chrome-button-radius": "50%",
      "--chrome-gloss":
        "linear-gradient(180deg,rgb(255 255 255/55%),transparent 50%)",
      "--chrome-shadow": "0 3px 10px rgb(0 0 0/32%)",
    },
  },
  {
    id: "mpc",
    kind: "player",
    tokens: {
      "--chrome-shell": "#d4d0c8",
      "--chrome-edge": "#808080",
      "--chrome-highlight": "#ffffff",
      "--chrome-radius": "0px",
      "--chrome-face": "#d4d0c8",
      "--chrome-ink": "#000000",
      "--chrome-ink-dim": "#555555",
      "--chrome-accent": "#000080",
      "--chrome-button": "#d4d0c8",
      "--chrome-button-edge": "#808080",
      "--chrome-button-radius": "0px",
      "--chrome-gloss": "none",
      "--chrome-shadow": "none",
      "--chrome-font": "Tahoma, 'MS Sans Serif', ui-sans-serif, sans-serif",
    },
  },
] as const satisfies readonly Chrome[];

/**
 * Every chrome a `jukebox` may wear, in the order the editor offers them.
 *
 * **The first entry is the DEFAULT, and Winamp is deliberately not it.** Not
 * taste: Winamp is the one chrome behind a dynamic import, so it produces no
 * server markup at all — a public page wearing it by default would render
 * nothing for its player until hydration, where every other leaf on this
 * platform paints something a reader can see before script runs. `EmbedFrame`
 * sets that standard and this follows it. Winamp is one click away in the
 * picker, and choosing it is a choice to wait a moment for the sprite engine.
 *
 * `leaf-fields.test.tsx` is what caught this, by rendering a `jukebox` to
 * static markup and finding the fields it claims to read change nothing.
 *
 * See {@link PLAYER_CHROMES} for why this is `as const`.
 */
const JUKEBOX_CHROMES = [
  {
    id: "wmp64",
    kind: "jukebox",
    tokens: {
      "--chrome-shell": "#d4d0c8",
      "--chrome-edge": "#808080",
      "--chrome-highlight": "#ffffff",
      "--chrome-radius": "0px",
      "--chrome-face": "#d4d0c8",
      "--chrome-ink": "#000000",
      "--chrome-ink-dim": "#555555",
      "--chrome-accent": "#000080",
      "--chrome-button": "#d4d0c8",
      "--chrome-button-edge": "#808080",
      "--chrome-button-radius": "0px",
      "--chrome-gloss": "none",
      "--chrome-shadow": "none",
      "--chrome-font": "Tahoma, 'MS Sans Serif', ui-sans-serif, sans-serif",
    },
  },
  {
    id: "winamp",
    kind: "jukebox",
    sprites: true,
    // Sprites decide everything a skin paints. These are read only by the
    // parts NO sheet covers — the fallback text when a skin ships no
    // `text.bmp`, and the frame the window sits in.
    tokens: {
      "--chrome-shell": "#31363f",
      "--chrome-edge": "#0f1115",
      "--chrome-ink": "#00ff4a",
      "--chrome-ink-dim": "#1d7f3c",
      "--chrome-accent": "#00ff4a",
      "--chrome-radius": "0px",
      "--chrome-gloss": "none",
      "--chrome-font": "ui-monospace, 'Cascadia Mono', Consolas, monospace",
    },
  },
  {
    id: "sonique",
    kind: "jukebox",
    tokens: {
      "--chrome-shell":
        "radial-gradient(120% 140% at 50% 0%,#4a2f7a 0%,#241546 55%,#0d0820 100%)",
      "--chrome-edge": "#0a0618",
      "--chrome-highlight": "#b98bff",
      "--chrome-radius": "24px",
      "--chrome-face": "rgb(20 10 45/60%)",
      "--chrome-ink": "#e6d6ff",
      "--chrome-ink-dim": "#9b86c9",
      "--chrome-accent": "#c77dff",
      "--chrome-button":
        "linear-gradient(180deg,#6a45b0 0%,#3d2570 60%,#2a1954 100%)",
      "--chrome-button-edge": "#150c30",
      "--chrome-button-radius": "50%",
      "--chrome-gloss":
        "linear-gradient(180deg,rgb(255 255 255/22%),transparent 60%)",
      "--chrome-shadow": "0 6px 20px rgb(20 5 50/60%)",
    },
  },
  {
    id: "foobar",
    kind: "jukebox",
    tokens: {
      "--chrome-shell": "#f7f7f7",
      "--chrome-edge": "#c9c9c9",
      "--chrome-highlight": "#ffffff",
      "--chrome-radius": "0px",
      "--chrome-face": "#ffffff",
      "--chrome-ink": "#111111",
      "--chrome-ink-dim": "#777777",
      "--chrome-accent": "#3178c6",
      "--chrome-button": "#f0f0f0",
      "--chrome-button-edge": "#cccccc",
      "--chrome-button-radius": "0px",
      "--chrome-gloss": "none",
      "--chrome-shadow": "none",
      "--chrome-font": "ui-monospace, Consolas, 'Courier New', monospace",
    },
  },
] as const satisfies readonly Chrome[];

/**
 * The chromes each kind may draw, in the order the editor offers them.
 *
 * Keyed by a closed union rather than by text from `jsonb`, so a plain record
 * is safe here where {@link CHROMES} must be a `Map`.
 */
const BY_KIND = {
  player: PLAYER_CHROMES,
  jukebox: JUKEBOX_CHROMES,
} as const satisfies Record<ChromeKind, readonly Chrome[]>;

/**
 * Every chrome, by the id stored on a leaf's `icon`.
 *
 * A `Map` rather than a record, on this feature's standing rule: the id arrives
 * from `jsonb`, and a record answers `__proto__` and `constructor` with
 * inherited values — the shape that once put a `TypeError` through
 * `TIDAL_KINDS` on a public page.
 *
 * **A chrome joins this table in the change that IMPLEMENTS it.** A name here
 * with nothing behind it is a control that accepts a choice, stores it and
 * changes nothing, which is the worst kind — the rule `CANVASES` already
 * carries.
 */
export const CHROMES: ReadonlyMap<string, Chrome> = new Map(
  [...PLAYER_CHROMES, ...JUKEBOX_CHROMES].map((one) => [one.id, one] as const),
);

/**
 * The chromes one kind may draw, in table order.
 *
 * @param kind - `player` or `jukebox`.
 * @returns every chrome belonging to it.
 */
export function chromesFor(kind: ChromeKind): readonly Chrome[] {
  return BY_KIND[kind];
}

/**
 * The chrome a leaf asked for, or the first of its kind.
 *
 * **Never undefined, and never the wrong kind.** A stored id may be one this
 * build has never heard of — a newer deployment wrote it — or one belonging to
 * the other kind, which a person switching kinds leaves behind in `icon`.
 * Either would otherwise draw nothing at all; falling back to the kind's first
 * chrome costs somebody their choice of look and never their player.
 *
 * @param kind - the leaf's kind.
 * @param id - what its `icon` holds, if anything.
 * @returns a chrome of that kind.
 */
export function chromeFor(kind: ChromeKind, id: string | undefined): Chrome {
  const asked = id === undefined ? undefined : CHROMES.get(id);
  return asked?.kind === kind ? asked : BY_KIND[kind][0];
}

/**
 * Every custom property a chrome needs, defaults filled in.
 *
 * @param chrome - the chrome to draw.
 * @returns the complete token set.
 */
export function chromeTokens(chrome: Chrome): ChromeTokens {
  return { ...CHROME_DEFAULTS, ...chrome.tokens };
}
