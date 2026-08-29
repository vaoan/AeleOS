/**
 * The eleven social pastiches and the five era looks, as data — split out of
 * `seed-pastiches.mjs` so a page can be looked at without writing to
 * production.
 *
 * `seed-pastiches.mjs` reads a database password and connects at module top
 * level, so nothing could ever import a page from it: doing so would run the
 * connection check and exit the process the moment `SUPABASE_DB_PASSWORD` was
 * unset. This module holds every definition and none of the database code —
 * the seeder imports `PAGES`, `ERA_LOOKS` and `ERA_LOOKS_META` from here and
 * is the writer alone.
 *
 * Moved unchanged: this is a pure refactor, proved byte-identical against a
 * payload dumped from the seeder before the move. Every comment stays with
 * the page it documents — they carry the measurements against real captures
 * and are the most valuable thing in the file.
 */
import { readFileSync } from "node:fs";

/**
 * The five OS-era looks, read rather than restated.
 *
 * **Generated from `era-looks.ts`, which is the source.** This script is plain
 * JavaScript writing direct SQL and cannot import that module — Node strips
 * types but will not resolve the app's `@/` alias, and every path out of it
 * goes through one. Pasting the trees here would give two copies that looked
 * identical the day they were written and drifted the first time either
 * changed, and the whole point of seeding these is to LOOK at what the picker
 * offers: a page that had diverged would be a photograph of something nobody
 * can pick. `apps/hub/tests/era-looks-json.test.ts` fails when the two
 * disagree and says how to regenerate.
 */
const ERA_LOOKS = JSON.parse(
  readFileSync(new URL("./era-looks.generated.json", import.meta.url), "utf8"),
);

/**
 * What each look is called on the page, and the mark it wears as an avatar.
 *
 * **The same allowance the eleven social pages take**, and it took a ruling to
 * get here: this file used to say the era looks carried no artwork at all,
 * because an operating system's CHROME is the thing being imitated and a logo
 * is not part of that. The two sets therefore took opposite lines, which was
 * written down as a deliberate difference rather than settled.
 *
 * It is settled now, in favour of consistency: **every page here uses its
 * subject's own mark as the profile avatar, hot-linked and never committed,
 * and nothing else of theirs is reproduced.** A page with an empty circle
 * where every neighbour has a mark reads as unfinished rather than as
 * principled.
 *
 * Each mark is the one that shipped WITH that release rather than a modern
 * Windows logo, which is the same era-fidelity the palettes are held to: the
 * 1998 flag, the XP wordmark, Vista's and 7's own lockups, and the flat 2012
 * flag for 8.
 */
const ERA_LOOKS_META = {
  "era-win98": {
    name: "Windows 98",
    avatar:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c1/Windows_98_logo.svg/330px-Windows_98_logo.svg.png",
  },
  "era-winxp": {
    name: "Windows XP",
    avatar:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/b/bb/Windows_XP_wordmark.svg/330px-Windows_XP_wordmark.svg.png",
  },
  "era-vista": {
    name: "Windows Vista",
    avatar:
      "https://upload.wikimedia.org/wikipedia/en/thumb/8/8a/Windows_Vista_Logo_and_Wordmark.svg/330px-Windows_Vista_Logo_and_Wordmark.svg.png",
  },
  "era-win7": {
    name: "Windows 7",
    avatar:
      "https://upload.wikimedia.org/wikipedia/en/thumb/2/26/Windows_7_Logo_and_Wordmark.svg/330px-Windows_7_Logo_and_Wordmark.svg.png",
  },
  "era-win8": {
    name: "Windows 8",
    avatar:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/Windows_logo_-_2012.svg/330px-Windows_logo_-_2012.svg.png",
  },
};

/** A photograph, stable per seed so a re-run is the same page. */
const photo = (seed, w, h) => `https://picsum.photos/seed/${seed}/${w}/${h}`;

/** A tiling texture, for the eras that had one behind everything. */
const tile = (name) =>
  `https://www.transparenttextures.com/patterns/${name}.png`;

const leaf = (kind, title, rest = {}) => ({
  kind,
  title_en: title,
  description_en: "",
  ...rest,
});
const group = (mode, children, rest = {}) => ({
  kind: "container",
  mode,
  children,
  ...rest,
});
const section = (name, mode, children, rest = {}) => ({
  kind: "container",
  mode,
  name_en: name,
  children,
  ...rest,
});

/** A gradient, with the keys `parseTheme` expects all present. */
const gradient = (angle, stops, kind = "linear") => ({
  kind,
  repeating: false,
  every: 100,
  angle,
  shape: "ellipse",
  extent: "farthest-corner",
  x: 50,
  y: 50,
  stops,
});

/** A theme, with every key the parser wants. */
const theme = (over) => ({
  background: null,
  accent: null,
  surface: null,
  canvasColours: null,
  canvas: "nebula",
  cursor: null,
  backgroundUrl: null,
  backgroundFit: "cover",
  measure: null,
  font: null,
  spacing: null,
  skin: "default",
  density: 1,
  speed: 1,
  scale: 1,
  ...over,
});

// ---------------------------------------------------------------------------
// 1 — MySpace, 2005. A tiled background, a two-column body, a Top 8, and a
//     music player that is the whole reason anybody customised a page.
// ---------------------------------------------------------------------------

const myspace = [
  section(
    "Aeleos",
    "grid",
    [
      group("stack", [
        leaf("avatar", "Aeleos", { style: { image_fit: "contain" } }),
        leaf("text", "Aeleos is in your extended network", {
          description_en:
            "Last login: 8/27/2026\n\nMale\n24 years old\nMedellín, COLOMBIA",
        }),
        leaf("table", "Contacting Aeleos", {
          rows: [
            [
              { text_en: "Send Message", icon: "mail" },
              { text_en: "Forward to Friend" },
            ],
            [
              { text_en: "Add to Friends", icon: "user-plus" },
              { text_en: "Add to Favorites" },
            ],
            [
              { text_en: "Instant Message", icon: "message-square" },
              { text_en: "Block User" },
            ],
          ],
        }),
        leaf("handle", "URL"),
      ]),
      group("stack", [
        leaf("text", "Aeleos' Blurbs", {
          description_en:
            "About me:\n\nhey!! im aeleos, i draw and i make playlists nobody asked for. this layout took me four hours and i am NOT taking it down. if the music started playing at full volume, sorry (not sorry).",
        }),
        leaf("text", "Who I'd like to meet", {
          description_en:
            "anyone who still codes their own page instead of filling in a form. and whoever made the glitter text generator.",
        }),
        leaf("jukebox", "Aeleos' Music", {
          icon: "winamp-classic",
          rows: [
            [
              {
                text_en:
                  "https://archive.org/download/testmp3testfile/mpthreetest.mp3",
              },
              { text_en: "Everlong" },
              { text_en: "Foo Fighters" },
            ],
            [
              {
                text_en:
                  "https://archive.org/download/testmp3testfile/mpthreetest.mp3",
              },
              { text_en: "Mr. Brightside" },
              { text_en: "The Killers" },
            ],
          ],
        }),
        leaf("owner", "Owner"),
      ]),
    ],
    {
      spaces: 2,
      weights: [1, 2],
      style: {
        skin: "default",
        heading: "gradient",
        border: "solid",
        radius: "square",
        heading_gap: "none",
      },
    },
  ),
  section(
    "Aeleos' Top 8",
    "grid",
    Array.from({ length: 8 }, (_, i) =>
      leaf(
        "picture",
        ["Dani", "Mica", "Tom", "Sol", "Kira", "Vale", "Nico", "Ana"][i],
        {
          image_url: photo(`top8-${i}`, 300, 300),
        },
      ),
    ),
    {
      spaces: 4,
      style: {
        skin: "default",
        heading: "gradient",
        border: "solid",
        radius: "square",
        heading_gap: "none",
      },
    },
  ),
  section(
    "Aeleos' Friends Comments",
    "stack",
    [
      leaf("text", "Dani", {
        description_en: "OMG the layout!!! how did you do the glitter thing",
      }),
      leaf("text", "Mica", {
        description_en: "turn the music DOWN i was at work",
      }),
      leaf("text", "Tom", { description_en: "top 8 and im not on it. cool." }),
    ],
    {
      style: {
        skin: "default",
        heading: "gradient",
        border: "solid",
        radius: "square",
        heading_gap: "none",
      },
    },
  ),
];

// **Rebuilt a second time, against a real CUSTOMISED profile rather than the
// site's own default chrome — the "aim at the era, not the product as
// shipped" ruling this task exists for.** The comment this replaces described
// white content boxes with solid title bars, which is what MySpace HANDED
// somebody. It is not what MySpace WAS: a person who customised their page put
// a photograph behind everything and made every box translucent so it showed
// through, with thin bright borders holding the shape together. The page's own
// copy already argued for this reading — "this layout took me four hours and
// i am NOT taking it down" — while the theme never matched it.
//
// **Captured** `profile.myspace.com/akioyang` at `arquivo.pt`, timestamp
// `20081024054301` (2008-10-24 05:43:01 UTC):
// `arquivo.pt/screenshot?url=<encoded
// https://arquivo.pt/noFrame/replay/20081024054301/http://profile.myspace.com/akioyang>`.
// A night skyline photograph fills the page behind every box; the boxes carry
// only a thin border, the photograph showing through where a solid fill used
// to be; corners are square throughout, never rounded.
//
// **Sampled from the capture, not eyeballed.** The link colour is the exact
// `#003399` this theme already carried — confirmed at 6.8% of the
// "Contacting" box's own pixels, so the accent needed no change. Five patches
// of the boxes, sampled where they sit over the photograph's dusk sky, read
// `#495771`, `#4b576e`, `#595c6d`, `#605f67` and `#5d575d` — a dusk blue-grey
// averaging `#555a6a`.
//
// **Semi-transparent boxes are NOT reachable, and that is recorded as gap 13
// in the pastiche findings rather than approximated.** A block's fill is
// `theme.surface`, one opaque colour with no alpha channel — there is no key
// for translucency anywhere in the style bag.
//
// **The sampled average was tried as `surface` and made the page
// unreadable, measured rather than assumed.** `#555a6a` is OKLCH
// `L≈0.4691` — mid-lightness by construction, because averaging five
// patches of a *translucent* box blended with a photograph behind it lands
// exactly where a flat opaque colour cannot serve text in either direction.
// Run through this theme's own `derivePalette` (background `#e8eef7`,
// `hardestStop` of the field): ink read 2.86:1 against that surface, muted
// 3.06:1, edge 3.01:1 — against floors of 4.5, 4.5 and 3.0. The same tokens
// read 16.86 / 18.00 / 17.71 against the field, so the failure is specific to
// the surface, not to the page's palette generally. Walking `dimmestLegible`
// the full 100 steps toward black cannot exceed ~3.06 there: it is the same
// "no direction clears the minimum" hole this codebase already documents for
// `#008080`, which sits at almost exactly the same lightness.
//
// **The fix is a colour nearest `#555a6a` along the same lightness axis that
// clears 4.5:1 for both ink and muted, found by sweeping rather than
// guessing.** Holding the sampled hue and chroma fixed (`H≈271.65`,
// `C≈0.0267`) and walking lightness in both directions: darker crosses zero
// legibility and does not recover it until `L≈0.19` (`ΔL≈-0.28`), where the
// solved ink flips from dark to light text and both clear at once — a much
// larger move. Lighter needs only `ΔL≈+0.11`: `surface: "#737989"` (OKLCH
// `L≈0.577`) reads ink 4.52:1, muted 4.53:1, edge 3.02:1 against itself —
// every floor cleared, barely, which is what "nearest" means. **Fidelity
// loses to readability here, and readability wins**: an unreadable page is
// not a pastiche of anything, so the surface is the swept value rather than
// the sampled one. It still reads close to the capture's dusk boxes — lighter
// than the exact blend, not a different colour family — and every box on the
// page is painted with it outright, standing in for the photograph showing
// through rather than being it.
//
// **Nothing in the build would have caught the original value.**
// `pnpm check:contrast` measures the design system's own fixed token pairs
// and never reads a page's own authored colour, so this could have shipped
// unreadable with every gate green — recorded as its own gap in the pastiche
// findings, separate from gap 13.
//
// `border: "solid"` with `radius: "square"` on every section draws the thin,
// sharp-cornered edge the capture has in place of this page's old rounded
// default. `heading_gap: "none"` is set explicitly on each barred section
// too, welding its bar flush to its content.
//
// **`corners` was tried here and removed.** `radius: "square"` sets
// `--skin-round: 0`, and `squareOffCorners` writes every corner — named or
// not — as a multiple of that same token, so at `--skin-round: 0` a "rounded"
// corner and a square one compute to the identical `0`. `corners: "tl,tr"`
// alongside `radius: "square"` is a no-op: it names WHERE to round when HOW
// MUCH is already zero everywhere. A key that changes nothing is a dead
// letter that reads like a change in the diff, so it is absent rather than
// decorative — this file's first real use of `corners` belongs to a page that
// wants the window shape it actually draws: a bar rounded across its top over
// a body square at its foot, which needs `radius: "soft"` to mean anything.
//
// Kept: `font: "classic"`, `spacing: "compact"` and `measure: "wide"` — the
// capture confirms all three.
const myspaceTheme = theme({
  background: gradient(180, [
    { color: "#e8eef7", at: 0 },
    { color: "#ffffff", at: 100 },
  ]),
  accent: "#003399",
  surface: "#737989",
  // **No animation at all, which is what a flat 2008 page had.** This used to
  // fake it with a grid at the density floor, because `CANVASES` did not list
  // `none` — the mechanism was there the whole time and only the picker was
  // missing.
  canvas: "none",
  skin: "default",
  font: "classic",
  spacing: "compact",
  backgroundUrl: photo("myspace-skyline", 1600, 1200),
  backgroundFit: "cover",
  measure: "wide",
});

// ---------------------------------------------------------------------------
// 2 — Windows Live Messenger. The `aero` skin already exists, which is the
//     single biggest hint that this one should land.
// ---------------------------------------------------------------------------

const messenger = [
  section(
    "Aeleos (Available)",
    "grid",
    [
      group("stack", [
        leaf("avatar", "Display picture", {
          style: { image_fit: "contain" },
        }),
      ]),
      group("stack", [
        leaf("name", "Aeleos"),
        leaf("text", "Personal message", {
          description_en: "brb making coffee ☕ — (L) music on",
        }),
        leaf("stat", "Status", { description_en: "Available" }),
        leaf("handle", "Messenger ID"),
      ]),
    ],
    { spaces: 2, weights: [1, 3], style: { skin: "aero" } },
  ),
  section(
    "Contacts",
    "accordion",
    [
      group(
        "stack",
        [
          leaf("social", "Dani", {
            link_url: "https://bsky.app/profile/bsky.app",
          }),
          leaf("social", "Mica", { link_url: "https://t.me/telegram" }),
          leaf("social", "Sol", {
            link_url: "https://bsky.app/profile/bsky.app",
          }),
        ],
        { name_en: "Available (3)" },
      ),
      group(
        "stack",
        [
          leaf("text", "Tom", { description_en: "Away — 22 min" }),
          leaf("text", "Kira", { description_en: "Busy — in a call" }),
        ],
        { name_en: "Away (2)" },
      ),
      group(
        "stack",
        [leaf("text", "Nico", { description_en: "Appears offline" })],
        {
          name_en: "Offline (1)",
        },
      ),
    ],
    { style: { skin: "aero" } },
  ),
  section(
    "Conversation",
    "stack",
    [
      leaf("text", "Dani says:", {
        description_en: "did you finish the thing",
      }),
      leaf("text", "Aeleos says:", { description_en: "which thing" }),
      leaf("text", "Dani says:", { description_en: "THE THING" }),
      leaf("text", "Dani sent a nudge.", {
        description_en: "You have just sent a nudge.",
      }),
      leaf("owner", "Owner"),
    ],
    { style: { skin: "aero" } },
  ),
];

// **Evidence-backed since 2026-08-29**, from Wikipedia's own
// `File:Windows-Live-Messenger-80-236x300.png` — Messenger **8.0**, which is
// exactly the 2006 release this page is dated to. `web.archive.org` is
// unreachable, and it was the wrong place to look anyway: Messenger is a
// desktop application, so a capture of it is a screenshot rather than an
// archived page.
//
// Sampled rather than eyeballed: **56% of that window is `#f8f8f8`** and the
// contact list itself is `#ffffff`, over a `#193c74` navy title bar, with a
// pale `#dbf1ee` band under it.
//
// **So the real thing is near-white PANELS over blue chrome, and this page had
// it the other way round** — a blue field with panels tinted from it, because
// until `theme.surface` existed a panel could only ever be a step off the
// ground. Two values move: the accent becomes the measured navy, and the
// surface becomes the measured near-white.
//
// **The blue ground STAYS, and that is a judgement rather than an oversight.**
// `aero` is the whole reason this page exists — it is the one pastiche wearing
// a skin for its own sake — and glass needs something behind it to show
// through. A near-white ground would be more faithful to a screenshot of the
// window and would delete the effect the page is a test of.
const messengerTheme = theme({
  background: gradient(160, [
    { color: "#dff0ff", at: 0 },
    { color: "#9ec9ec", at: 60 },
    { color: "#6ba7d6", at: 100 },
  ]),
  accent: "#193c74",
  surface: "#f8f8f8",
  canvas: "bubbles",
  canvasColours: ["#ffffff", "#bfe0f7"],
  density: 0.8,
  speed: 0.5,
  skin: "aero",
  font: "classic",
  spacing: "compact",
  measure: "narrow",
});

// ---------------------------------------------------------------------------
// 3 — A dark microblog board. It was built to test `timeline`, and it does not
//     use it: `list` — a stack with a hairline and no gap — is what a feed
//     actually is, and it did not exist when this page was written. The
//     rebuild moved to it and this line went on naming the old mode.
//
// **No capture backs this one and its palette is not the era it was filed
// under (checked 2026-08-29).** `#15202b` and `#1d9bf0` are recognisably
// Twitter's DARK mode from about 2019 onward; 2012 Twitter was a light page
// with a paler blue. So the page is coherent and the date on it was not — the
// README says ~2019 now. Nothing was restyled: a pastiche of a real era is
// worth more than a pastiche of a date somebody typed, and this is a generic
// board rather than a reproduction, so the honest fix is the label.
//
// **And a dark mode is not ARCHIVABLE, which is why no source will ever close
// this one.** arquivo.pt holds `twitter.com/twitter` profile captures from
// 2009 and 2010 — a crawler arrives logged out and is served the default LIGHT
// page, so no archive anywhere holds the palette this page imitates. That is a
// property of what an archive can see rather than a gap in coverage, and it
// will still be true next time somebody looks.
// ---------------------------------------------------------------------------

const post = (when, text) => leaf("text", when, { description_en: text });

const board = [
  section(
    "Aeleos",
    "grid",
    [
      group("stack", [
        leaf("avatar", "Aeleos", { style: { image_fit: "contain" } }),
      ]),
      group("stack", [
        leaf("name", "Aeleos"),
        leaf("handle", "@aeleos"),
        leaf("text", "Bio", {
          description_en:
            "drawing bears · building the thing that lets you build the thing · he/él · Medellín",
        }),
        group(
          "grid",
          [
            leaf("stat", "Following", { description_en: "312" }),
            leaf("stat", "Followers", { description_en: "4,891" }),
            leaf("stat", "Joined", { description_en: "Aug 2026" }),
          ],
          { spaces: 3 },
        ),
      ]),
    ],
    { spaces: 2, weights: [1, 4], style: { chrome: "bare" } },
  ),
  section(
    "Posts",
    "list",
    [
      post(
        "2h",
        "shipped a thing where the page you edit IS the page. no preview pane. it just is the page.",
      ),
      post(
        "6h",
        "every time i split a file i find a dependency i did not know i had",
      ),
      post(
        "1d",
        "the measurement disagreed with me again and it was right again",
      ),
      post("2d", "hot take: a test that has never been red is a rumour"),
    ],
    { style: { chrome: "bare" } },
  ),
  section(
    "Elsewhere",
    "grid",
    [
      leaf("social", "Bluesky", {
        link_url: "https://bsky.app/profile/bsky.app",
      }),
      leaf("owner", "Owner"),
    ],
    { spaces: 2, style: { chrome: "bare" } },
  ),
];

const boardTheme = theme({
  background: gradient(180, [
    { color: "#0f1419", at: 0 },
    { color: "#15202b", at: 100 },
  ]),
  accent: "#1d9bf0",
  canvas: "grid",
  canvasColours: ["#1d9bf0", "#22303c"],
  density: 0.4,
  speed: 0.25,
  skin: "default",
  font: "system",
  spacing: "compact",
  measure: "medium",
});

// ---------------------------------------------------------------------------
// 4 — The same shape in daylight. Deliberately near the one above, because
//     "can two pastiches of near-identical products read differently" is a
//     harder question than "can it do dark".
// ---------------------------------------------------------------------------

const sky = [
  section(
    "Aeleos",
    "grid",
    [
      group("stack", [
        leaf("avatar", "Aeleos", { style: { image_fit: "contain" } }),
      ]),
      group("stack", [
        leaf("name", "Aeleos"),
        leaf("handle", "@aeleos.furrycolombia.com"),
        leaf("text", "Bio", {
          description_en:
            "bears, blocks and boring infrastructure. mostly here for the skeets.",
        }),
        group(
          "grid",
          [
            leaf("stat", "Follows", { description_en: "201" }),
            leaf("stat", "Followers", { description_en: "1,204" }),
          ],
          { spaces: 2 },
        ),
      ]),
    ],
    { spaces: 2, weights: [1, 4] },
  ),
  section(
    "Feed",
    "list",
    [
      post(
        "· 3h",
        "the nice thing about a small timeline is you can read all of it",
      ),
      post("· 9h", "reposting my own post because the algorithm is me"),
      post(
        "· 1d",
        "starter packs but for people who write commit messages too long",
      ),
    ],
    { style: { chrome: "bare" } },
  ),
  section(
    "Links",
    "grid",
    [
      leaf("link", "My site", { link_url: "https://me.furrycolombia.com" }),
      leaf("owner", "Owner"),
    ],
    { spaces: 2 },
  ),
];

// **Measured against the LIVE site on 2026-08-29**, which is the one kind of
// evidence this page can have — Bluesky is still running, so there is nothing
// to reach into an archive for. Two values moved:
//
//   - the ground is FLAT `#ffffff`. It was a white-to-pale-blue ramp, and the
//     real page has no gradient at all: `getComputedStyle(document.body)`
//     answers `rgb(255, 255, 255)` on both `body` and `html`.
//   - the accent is `#006aff`, read off the Follow button. It was `#0085ff` —
//     the brand blue everybody quotes, and NOT the blue the application
//     paints. A colour being the official one is not evidence about what the
//     page looks like.
const skyTheme = theme({
  background: gradient(170, [
    { color: "#ffffff", at: 0 },
    { color: "#ffffff", at: 100 },
  ]),
  accent: "#006aff",
  // Live Bluesky paints nothing behind itself, so neither does this. The same
  // reasoning five other pages here already carry: an animated backdrop reads
  // as a bug in the pastiche rather than as a default doing its job.
  canvas: "none",
  skin: "default",
  font: "system",
  measure: "medium",
});

// ---------------------------------------------------------------------------
// 5 — Black, borderless, almost nothing. The hardest of the eight, because
//     what defines it is what it REMOVES.
// ---------------------------------------------------------------------------

const threads = [
  section(
    "aeleos",
    "grid",
    [
      group("stack", [
        leaf("name", "Aeleos"),
        leaf("handle", "aeleos"),
        leaf("text", "Bio", {
          title_es: "Biografía",
          description_en: "building in public, posting in private",
        }),
        leaf("stat", "Followers", { description_en: "1,204" }),
      ]),
      group("stack", [
        leaf("avatar", "Aeleos", { style: { image_fit: "contain" } }),
      ]),
    ],
    { spaces: 2, weights: [3, 1], style: { chrome: "bare" } },
  ),
  section(
    "",
    "list",
    [
      post(
        "aeleos",
        "text-only, black, and nothing has a border. that is the entire design.",
      ),
      post("aeleos", "a feed is just a stack with opinions about spacing"),
      post("aeleos", "if you can see a card edge here i have failed"),
      leaf("owner", "Owner"),
    ],
    { style: { chrome: "bare" } },
  ),
];

// **Measured against the LIVE site in DARK mode on 2026-08-29.** Threads is
// still running, so this needs no archive either — but it needs a colour
// scheme: a probe with no dark preference is served `#fafafa`, and this page
// is the black one Threads launched with. `colorScheme: "dark"` is what makes
// the measurement the right one.
//
// Live reads `rgb(10, 10, 10)` on `body`, `rgb(243, 245, 247)` for ink and
// `rgb(16, 16, 16)` for the card the profile sits in. The old second stop was
// already exactly right; what moved is that the ground is FLAT rather than a
// ramp from pure black, and that the card is now expressible at all —
// `theme.surface` did not exist when this page was written, so its panels were
// a derived step off the ground rather than the colour the real page uses.
//
// **What is deliberately NOT copied is the 2026 relayout.** Live Threads now
// puts the profile in a rounded card on a grey field; this page is the 2023
// edge-to-edge one the README dates it to. A live site is evidence about
// today, and today is not always the era being imitated.
const threadsTheme = theme({
  background: gradient(180, [
    { color: "#0a0a0a", at: 0 },
    { color: "#0a0a0a", at: 100 },
  ]),
  accent: "#f3f5f7",
  surface: "#101010",
  // As with Bluesky: the real page is a flat ground and nothing moves on it.
  canvas: "none",
  // **`default`, and the rows are `chrome: "bare"`.** The first attempt used
  // `outline`, whose whole identity is a border, and asked it for
  // `border_style: "none"` — a test confounded by its own fixture, and one that
  // could not have worked anyway: that key removes the border STYLE and leaves
  // the card. `chrome` is the key that exists for this.
  skin: "default",
  font: "system",
  spacing: "compact",
  measure: "narrow",
});

// ---------------------------------------------------------------------------
// 6 — hi5. Blue, busy, widget-shaped. The yellow everybody remembers is the
//     LOGO rather than the site; see the theme note below, which is where
//     that correction was measured.
// ---------------------------------------------------------------------------

const hi5 = [
  section(
    "Aeleos",
    "grid",
    [
      group("stack", [
        leaf("avatar", "Aeleos", { style: { image_fit: "contain" } }),
        leaf("handle", "hi5 ID"),
      ]),
      group("stack", [
        leaf("name", "Aeleos"),
        leaf("stat", "Mood", { description_en: "😎 chillin" }),
        leaf("stat", "Profile views", { description_en: "18,402" }),
        leaf("progress", "Profile completeness", { description_en: "80" }),
      ]),
    ],
    {
      spaces: 2,
      weights: [1, 2],
      style: {
        skin: "default",
        heading: "gradient",
        heading_gap: "none",
        heading_pad: "snug",
        radius: "soft",
        corners: "tl,tr",
      },
    },
  ),
  section(
    "My Friends (247)",
    "grid",
    Array.from({ length: 6 }, (_, i) =>
      leaf("picture", ["Dani", "Mica", "Sol", "Kira", "Vale", "Nico"][i], {
        image_url: photo(`hi5-${i}`, 240, 240),
      }),
    ),
    {
      spaces: 3,
      style: {
        skin: "default",
        heading: "gradient",
        heading_gap: "none",
        heading_pad: "snug",
        radius: "soft",
        corners: "tl,tr",
      },
    },
  ),
  section(
    "My Widgets",
    "carousel",
    [
      leaf("quote", "Fortune of the day", {
        description_en: "You will refactor something that did not need it.",
      }),
      leaf("stat", "Days on hi5", { description_en: "1,204" }),
      leaf("picture", "Glitter", { image_url: photo("hi5-glitter", 400, 300) }),
      leaf("owner", "Owner"),
    ],
    {
      style: {
        skin: "default",
        heading: "gradient",
        heading_gap: "none",
        heading_pad: "snug",
        radius: "soft",
        corners: "tl,tr",
      },
    },
  ),
];

// **hi5 was BLUE, not yellow.** The first attempt built a bright orange candy
// page off the memory of the LOGO; a real capture of the real site is blue and
// grey title bars over white content, the same idiom MySpace used.
//
// **No orange survives anywhere in this theme**, and a sentence here used to
// claim it did — "the orange survives only as the accent, which is where it
// actually was" — over an accent that is and always was `#4a7ebb`, a blue. The
// correction was made and the sentence describing it was not, which is the
// exact shape this repository keeps paying for: a note that reads like a
// measurement, sitting four lines above the value that falsifies it.
//
// **The date was wrong too, and is corrected here rather than left to compound
// the last error.** This used to say "a 2007 capture"; the timestamp actually
// fetched is `20080215082853` — **2008-02-15**, `arquivo.pt`'s replay of
// `http://www.hi5.com/`.
//
// **Sampled from that render.** The page is the logged-out landing screen
// (SIGN IN, SEARCH IN YOUR CITY, POPULAR VIDEOS, JUST RELEASED), each panel a
// title bar over a white body. Reading down a single column of the SIGN IN
// bar, pixel by pixel: `#6d95b3` at its top edge, brightening to `#80a0c8`
// a few pixels in, then darkening back down through `#7b9bbf` and `#7593b5`
// to `#5481b6` at its foot — a real vertical sheen, not a flat fill, and the
// same ramp reappears identically under SEARCH IN YOUR CITY and POPULAR
// VIDEOS (`#6d95b3` → `#80a0c8` → `#5481b6`, sampled the same way). So
// `heading: "gradient"` is kept rather than moved to `"bar"` — this is the one
// of the two pages in this task whose strips are genuinely a ramp. `#4a7ebb`,
// already the accent, sits inside that same sampled range and needed no
// change.
//
// **The window shape now belongs to it.** Every section gets `radius: "soft"`
// with `corners: "tl,tr"` — the bar rounds across its top, the body squares
// off at its foot — plus `heading_gap: "none"`, welding the bar flush to its
// content, and `heading_pad: "snug"`, since `spacing: "compact"` already
// shrinks the type. None of the three panels in the capture round a corner at
// all; the window shape is this page's own idiom applied rather than a second
// thing copied from the capture, which is why `corners` earns its place here
// instead of being left at square like MySpace.
const hi5Theme = theme({
  background: gradient(180, [
    { color: "#f2f5f9", at: 0 },
    { color: "#ffffff", at: 100 },
  ]),
  accent: "#4a7ebb",
  // **No animation at all, which is what a flat 2007 page had.** This used to
  // fake it with a grid at the density floor, because `CANVASES` did not list
  // `none` — the mechanism was there the whole time and only the picker was
  // missing.
  canvas: "none",
  skin: "default",
  font: "classic",
  spacing: "compact",
  measure: "wide",
});

// ---------------------------------------------------------------------------
// 7 — Sonico. Blue, photo-forward, album-shaped. `masonry` is the test here.
//
// **Evidence-backed since 2026-08-29, from a DIFFERENT web archive.**
// `web.archive.org` is unreachable and Wikipedia has nothing but an Italian
// town of the same name — but **arquivo.pt**, the Portuguese national web
// archive, holds `http://www.sonico.com/` at `20081024155043`, inside the year
// this page is dated to, and it replays with its stylesheet intact.
//
// Sampled from that render: a white page, a solid **`#003399`** navigation bar
// and footer, `#f3f3f3`/`#f7f7f7` panels, and `#3366cc` as the secondary blue.
// So the ground was already right and the accent was not — `#1a6bb5` was a
// plausible mid-blue nobody measured.
//
// **That `#003399` is the same navy MySpace carries is a real coincidence of
// 2008 web design rather than a copy-paste**, and both are measured: it was a
// web-safe value half the era reached for.
// ---------------------------------------------------------------------------

const sonico = [
  section(
    "Aeleos",
    "grid",
    [
      group("stack", [
        leaf("avatar", "Aeleos", { style: { image_fit: "contain" } }),
        leaf("handle", "Usuario"),
      ]),
      group("stack", [
        leaf("name", "Aeleos"),
        leaf("stat", "Ciudad", { description_en: "Medellín, Colombia" }),
        leaf("stat", "Amigos", { description_en: "412" }),
        leaf("stat", "Fotos", { description_en: "1,038" }),
      ]),
    ],
    {
      spaces: 2,
      weights: [1, 2],
      style: {
        skin: "default",
        heading: "bar",
        heading_gap: "none",
        heading_pad: "snug",
        radius: "soft",
        corners: "tl,tr",
      },
    },
  ),
  section(
    "Mis Fotos",
    "masonry",
    Array.from({ length: 7 }, (_, i) =>
      leaf("picture", `Foto ${i + 1}`, {
        image_url: photo(`sonico-${i}`, 400, 300 + (i % 3) * 120),
      }),
    ),
    {
      spaces: 3,
      style: {
        skin: "default",
        heading: "bar",
        heading_gap: "none",
        heading_pad: "snug",
        radius: "soft",
        corners: "tl,tr",
      },
    },
  ),
  section(
    "Álbumes",
    "carousel",
    [
      leaf("picture", "Furrécua 2026", {
        image_url: photo("album-1", 500, 340),
      }),
      leaf("picture", "Cumpleaños", { image_url: photo("album-2", 500, 340) }),
      leaf("picture", "El taller", { image_url: photo("album-3", 500, 340) }),
      leaf("owner", "Owner"),
    ],
    {
      style: {
        skin: "default",
        heading: "bar",
        heading_gap: "none",
        heading_pad: "snug",
        radius: "soft",
        corners: "tl,tr",
      },
    },
  ),
];

// **Re-sampled for this task, and it holds.** The top navigation strip (under
// the Principal/Postais/Jogos tabs) reads flat `#3366cc` across its whole
// width at three consecutive scanlines; the footer reads flat `#003399` the
// same way — no vertical variation at either, which is what makes both
// FLAT rather than a ramp. So `heading: "bar"` replaces `"gradient"` on every
// section here: this is the one of the two pages in this task whose strips
// are genuinely flat. The panel backgrounds behind "Iniciar Sessão" and
// "Cadastrar-se no Sonico" sample `#f7f7f7`, a hair off the recorded
// `surface: "#f3f3f3"` — close enough that the stored value holds rather than
// being churned for a one-shade difference.
//
// **The window shape now belongs to it too**, the same as hi5: `radius:
// "soft"` with `corners: "tl,tr"` rounds the bar across its top and squares
// the body off at its foot, `heading_gap: "none"` welds the bar to its
// content, and `heading_pad: "snug"` matches the type `spacing: "compact"`
// already shrank. Neither captured panel rounds a corner at all — this is the
// idiom applied to the page, not a second thing copied from the capture.
const sonicoTheme = theme({
  background: gradient(180, [
    { color: "#ffffff", at: 0 },
    { color: "#ffffff", at: 100 },
  ]),
  accent: "#003399",
  surface: "#f3f3f3",
  // **No animation at all, which is what a flat 2007 page had.** This used to
  // fake it with a grid at the density floor, because `CANVASES` did not list
  // `none` — the mechanism was there the whole time and only the picker was
  // missing.
  canvas: "none",
  skin: "default",
  font: "classic",
  spacing: "compact",
  measure: "wide",
});

// ---------------------------------------------------------------------------
// 8 — GeoCities. A tiled starfield, a visitor counter, a webring, and a page
//     that is under construction and always will be.
//
// **Evidence-backed since 2026-08-29, and the evidence CONFIRMED the design
// rather than changing it.** Wikipedia has only a Yahoo-era wordmark, and
// `geocities.com` in an archive is the PORTAL rather than anybody's page — but
// this pastiche imitates a personal homepage, so the portal was never the
// right subject. `geocities.restorativland.org` is a restored gallery of real
// archived GeoCities sites by neighbourhood, which is exactly that subject.
//
// Five pages sampled out of Area51/Dreamworld, in a browser:
//
//   - **`font-family` is `"Times New Roman"` on all five.** Every one is the
//     browser's default serif, nobody having set a face at all.
//   - Grounds are `#000000` (three), `#ffffff` and `#ff0000` — dark and
//     saturated, arbitrary per author.
//   - Two of five carry a TILED background image.
//   - `<center>` tags and layout `<table>`s throughout; link colours
//     `#ff9900`, `#0000ff`, `#0000ee`.
//
// **So `font: "serif"` and centred text are measured now rather than argued.**
// The note below records that the first attempt reached for `terminal`, got
// monospace, and read as a developer's site; five out of five Times New Roman
// is what that reasoning was missing. Nothing about this page changed — which
// is the useful shape for evidence to have.
// ---------------------------------------------------------------------------

const geocities = [
  section(
    "*~*~ WELCOME TO AELEOS' HOMEPAGE ~*~*",
    "stack",
    [
      leaf("avatar", "Aeleos", { style: { image_fit: "contain" } }),
      leaf("text", "NOTICE", {
        title_es: "AVISO",
        description_en:
          "You are visitor number 000142. This page is best viewed in Netscape Navigator 4.0 at 800x600.",
      }),
      leaf("picture", "UNDER CONSTRUCTION", {
        image_url: photo("construction", 460, 120),
      }),
      leaf("handle", "My handle"),
    ],
    { style: { skin: "default", text_align: "center" } },
  ),
  section(
    "MY INTERESTS",
    "stack",
    [
      leaf("text", "ABOUT ME", {
        description_en:
          "hi!!! my name is aeleos and this is my page on the world wide web. i like drawing, animals, and computers. i made this page myself with notepad.",
      }),
      leaf("table", "STATS", {
        rows: [
          [{ text_en: "Visitors" }, { text_en: "000142" }],
          [{ text_en: "Last updated" }, { text_en: "27 Aug 2026" }],
          [{ text_en: "Best viewed in" }, { text_en: "Netscape 4" }],
          [{ text_en: "Sign my" }, { text_en: "GUESTBOOK" }],
        ],
      }),
    ],
    { style: { skin: "default", text_align: "center" } },
  ),
  section(
    "[ THE FURRY WEBRING ]",
    "grid",
    [
      leaf("link", "<< PREVIOUS", { link_url: "https://me.furrycolombia.com" }),
      leaf("link", "RANDOM", { link_url: "https://me.furrycolombia.com" }),
      leaf("link", "NEXT >>", { link_url: "https://me.furrycolombia.com" }),
      leaf("owner", "Owner"),
    ],
    { spaces: 3, style: { skin: "default", text_align: "center" } },
  ),
];

const geocitiesTheme = theme({
  background: gradient(180, [
    { color: "#000010", at: 0 },
    { color: "#000033", at: 100 },
  ]),
  accent: "#00ff66",
  canvas: "stars",
  canvasColours: ["#ffffff", "#00ff66"],
  density: 1.6,
  speed: 0.25,
  skin: "default",
  // **A serif and centred text, which is what actually dates a page to 1999.**
  // The first attempt reached for `terminal` and got monospace, which reads as
  // a developer's site rather than a personal homepage — and left every
  // heading in the app's own display face, because a skin cannot set one.
  font: "serif",
  spacing: "compact",
  backgroundUrl: tile("dark-mosaic"),
  backgroundFit: "tile",
  measure: "medium",
});

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 9 — Fur Affinity, the furry web's own. Dark, dense, art first, and the one
//     shape none of the eight had: a WALL of short rows under everything else.
//
// **Evidence-backed since 2026-08-28, from a real December 2008 capture.** It
// was built from knowledge first, and it was measurably WRONG: a near-black
// ground and saturated teal header bars, where the capture shows a slate
// blue-grey ground and light silver bars carrying DARK text. It had been
// reading as a modern dark theme rather than as 2008. Both were corrected
// against the capture — see the theme below, where the measurement lives.
// ---------------------------------------------------------------------------

const furaffinity = [
  // The banner: the one place a page reaches both edges and touches the top.
  // **No NAME on purpose.** A depth-0 container that carries one draws it, and
  // a heading floating over a full-bleed banner is a label nobody asked for.
  // An unnamed container at depth 0 is a group with no heading — which is
  // exactly what a banner is.
  group(
    "stack",
    [
      leaf("picture", "Aeleos' banner", {
        image_url: photo("fa-banner", 1600, 260),
      }),
    ],
    { style: { bleed: true, margins: false, chrome: "bare" } },
  ),

  section(
    "Aeleos",
    "grid",
    [
      group("stack", [
        leaf("avatar", "Aeleos", { style: { image_fit: "contain" } }),
        leaf("table", "Stats", {
          rows: [
            [{ text_en: "Views", icon: "eye" }, { text_en: "48,120" }],
            [{ text_en: "Submissions", icon: "image" }, { text_en: "212" }],
            [{ text_en: "Favs", icon: "star" }, { text_en: "9,431" }],
            [
              { text_en: "Comments", icon: "message-square" },
              { text_en: "3,077" },
            ],
            [
              { text_en: "Registered", icon: "calendar" },
              { text_en: "Mar 2007" },
            ],
          ],
        }),
        leaf("handle", "Username"),
      ]),
      group("stack", [
        leaf("text", "Artist Profile", {
          description_en:
            "traditional and digital, mostly canids. commissions are CLOSED until i clear the queue. please read my TOS before noting me. i draw for fun and i answer every shout eventually, i promise.",
        }),
        leaf("table", "Contact Information", {
          rows: [
            [{ text_en: "Telegram", icon: "send" }, { text_en: "@aeleos" }],
            [
              { text_en: "Trello", icon: "clipboard-list" },
              { text_en: "aeleos/queue" },
            ],
            [
              { text_en: "Stream", icon: "video" },
              { text_en: "picarto.tv/aeleos" },
            ],
          ],
        }),
      ]),
    ],
    // The narrow stats rail beside the wide body — the arrangement `weights`
    // exists for, and the one nesting could never have produced.
    {
      spaces: 2,
      weights: [1, 3],
      style: { heading: "bar", heading_pad: "roomy" },
    },
  ),

  section(
    "Recent Submissions",
    "grid",
    Array.from({ length: 8 }, (_, i) =>
      leaf("picture", "Submission " + (i + 1), {
        image_url: photo("fa-sub-" + i, 400, 400),
      }),
    ),
    { spaces: 4, style: { heading: "bar", heading_pad: "roomy" } },
  ),

  // **The shouts wall, and the reason this page is here.** Many short rows of
  // a name and a line, divided rather than boxed — `list` plus `chrome: bare`,
  // which is exactly the pair the divided-list phase added and which none of
  // the eight above had a use for.
  section(
    "Shouts",
    "list",
    [
      ["Tavi", "your linework got so clean this year!! teach me"],
      ["mochi_wolf", "thanks for the trade, it came out great :3"],
      ["Renard", "commissions when"],
      ["pixelpaws", "happy belated!! sorry i missed the stream"],
      ["Kestrel", "that arctic fox piece lives rent free in my head"],
    ]
      .map(([who, said]) =>
        leaf("text", who, { description_en: said, style: { chrome: "bare" } }),
      )
      .concat(leaf("owner", "Owner", { style: { chrome: "bare" } })),
    { style: { heading: "bar", heading_pad: "roomy", chrome: "bare" } },
  ),
];

const furaffinityTheme = theme({
  // **Measured off a real 2008 capture (2026-08-28), where it had been built
  // from knowledge.** The ground is a slate BLUE-GREY rather than the
  // near-black this page used to assume, and the section headers are a light
  // silver bar carrying DARK text — not a saturated accent with white on it.
  // Both were wrong in the same direction: the page was reading as a modern
  // dark theme rather than as 2008.
  background: gradient(180, [
    { color: "#2e3a45", at: 0 },
    { color: "#38444f", at: 100 },
  ]),
  accent: "#b9c4cd",
  // The 2008 capture's panels are a shade LIGHTER than the slate ground rather
  // than the same colour, which a stepped surface could not express.
  surface: "#3f4d59",
  canvas: "none",
  skin: "default",
  font: "classic",
  spacing: "compact",
  measure: "wider",
});

// ---------------------------------------------------------------------------
// 10 — Fotolog / Metroflog, ~2005, and enormous in Colombia specifically.
//      Structurally the opposite of every page above: ONE photograph, and then
//      a guestbook longer than the rest of the page put together.
//
// **The one page still built from knowledge, and a SECOND archive now says
// why (2026-08-29).** The claim used to rest on `web.archive.org` alone;
// **arquivo.pt** holds `http://www.fotolog.com/` at `20080215112915`, and
// rendering it gives the same result — 126 links at `#0000ee`, the browser's
// own default, headings in unstyled serif and raw bullet lists. The markup
// survives and the stylesheet does not, at two independent archives.
//
// It is also the logged-out HOMEPAGE either way, where this pastiche imitates
// a profile. So what is claimed here is the FEEL — one photograph and a
// guestbook longer than the rest of the page — not a palette anybody measured.
// ---------------------------------------------------------------------------

const fotolog = [
  // **A group, not a section.** A named container draws its name, and this
  // header already carries the `name` and `handle` leaves — naming it printed
  // "aeleos" three times down the page before anybody scrolled. `avatar` was
  // added later, alongside `owner` on the guestbook below: the page rendered
  // fine without either because the seeder bypasses `set_actor_sections`,
  // which is the exact gap `pastiche-pages.test.ts` exists to catch.
  group(
    "stack",
    [
      leaf("avatar", "Aeleos", { style: { image_fit: "contain" } }),
      leaf("name", "aeleos"),
      leaf("handle", "fotolog"),
    ],
    { style: { chrome: "bare", text_align: "center" } },
  ),

  // The whole point of the page, and deliberately the only picture on it.
  section(
    "hoy",
    "stack",
    [
      leaf("picture", "hoy", { image_url: photo("fl-today", 900, 900) }),
      leaf("text", "pie de foto", {
        description_en:
          "sabado en la tarde, medellin. la camara de mi hermana. 47 comentarios y sigo contando",
        style: { chrome: "bare", text_align: "center" },
      }),
    ],
    { style: { heading: "bar" } },
  ),

  // The guestbook: a long column of one-line rows, which is what the page was
  // actually FOR — the photograph was the excuse.
  section(
    "comentarios",
    "list",
    [
      ["luchito_88", "hermosaaa la foto!! pasa por el mio"],
      ["andre.v", "+1 y firmo, buenisima"],
      ["kata", "ayyy que linda, saludos desde cali"],
      ["nano", "firmado, devuelveme la firma porfa"],
      ["mari_sol", "esa camara es una belleza, cual es?"],
      ["juanpis", "jajaja la cara de tu hermana al fondo"],
      ["laura.g", "te dejo mi firma del dia"],
      ["el_mono", "primero!! ah no, septimo"],
    ]
      .map(([who, said]) =>
        leaf("text", who, { description_en: said, style: { chrome: "bare" } }),
      )
      .concat(leaf("owner", "Owner", { style: { chrome: "bare" } })),
    { style: { heading: "bar", chrome: "bare" } },
  ),
];

const fotologTheme = theme({
  background: gradient(180, [
    { color: "#ffffff", at: 0 },
    { color: "#eef2f6", at: 100 },
  ]),
  accent: "#0a6ebd",
  canvas: "none",
  skin: "default",
  font: "classic",
  spacing: "compact",
  // Narrow on purpose: the page was one column and one photograph.
  measure: "narrow",
});

// ---------------------------------------------------------------------------
// 11 — Facebook, ~2008. Blue bars, a narrow left rail of information boxes,
//      and a wall. The most COPIED layout of its decade.
//
// **Confirmed against a real March 2007 capture (2026-08-28).** `#3b5998` was
// already right — the one colour of theirs anybody would recognise on sight —
// and the capture added a detail the model could not then express: the navy
// bar carries a LIGHTER blue sub-bar beneath it. `heading: "soft"` is that
// second tone, and the subordinate sections below wear it.
// ---------------------------------------------------------------------------

const facebook = [
  section(
    "Aeleos",
    "grid",
    [
      group("stack", [
        leaf("avatar", "Aeleos", { style: { image_fit: "contain" } }),
        leaf("table", "Information", {
          rows: [
            [
              { text_en: "Networks", icon: "globe" },
              { text_en: "Medellin, Colombia" },
            ],
            [{ text_en: "Sex", icon: "user" }, { text_en: "Male" }],
            [{ text_en: "Birthday", icon: "cake" }, { text_en: "March 3" }],
            [
              { text_en: "Relationship", icon: "heart" },
              { text_en: "It's complicated" },
            ],
          ],
        }),
      ]),
      group("stack", [
        leaf("name", "Aeleos"),
        leaf("handle", "aeleos.facebook"),
        leaf("text", "What's on your mind?", {
          description_en:
            "Aeleos is wondering why he spent four hours on a profile page instead of sleeping.",
        }),
      ]),
    ],
    { spaces: 2, weights: [1, 2], style: { heading: "bar" } },
  ),

  section(
    "Friends",
    "grid",
    Array.from({ length: 6 }, (_, i) =>
      leaf("picture", "Friend " + (i + 1), {
        image_url: photo("fb-friend-" + i, 200, 200),
      }),
    ),
    // **The lighter blue strip under the navy one**, which is what the March
    // 2007 capture actually shows and what one accent could not express. The
    // identity section keeps the strong bar; everything subordinate to it
    // takes the quieter tone.
    { spaces: 6, style: { heading: "soft" } },
  ),

  section(
    "The Wall",
    "list",
    [
      ["Tomas", "happy birthday man!! drinks on saturday"],
      ["Valentina", "PICS FROM FRIDAY ARE UP, you got tagged in 11"],
      ["Sebas", "is anyone else still awake or just me"],
      ["Camila", "poked you."],
    ]
      .map(([who, said]) =>
        leaf("text", who, { description_en: said, style: { chrome: "bare" } }),
      )
      .concat(leaf("owner", "Owner", { style: { chrome: "bare" } })),
    { style: { heading: "soft", chrome: "bare" } },
  ),
];

const facebookTheme = theme({
  background: gradient(180, [
    { color: "#edeff4", at: 0 },
    { color: "#dfe3ee", at: 100 },
  ]),
  // `#3b5998` off the 2007 capture, which is the one colour of Facebook's that
  // everybody can name.
  accent: "#3b5998",
  // Facebook's body is white, not a tint of its own pale-blue page ground.
  surface: "#ffffff",
  canvas: "none",
  skin: "default",
  font: "classic",
  spacing: "compact",
  // **`wider`, and the friends strip is what decides it.** A six-across grid
  // collapses to ONE column below a 64rem container, with no step in between:
  // at `wide` the container is 976px and six thumbnails rendered as a single
  // photograph the width of the page. Recorded in the pastiche findings.
  measure: "wider",
});

/**
 * Each page's avatar, which is the mark of the site it imitates.
 *
 * **In the seeder rather than set by hand**, which is how it was done first:
 * a re-run then left every newly added page with an empty circle, and would
 * have dropped the rest the moment anybody reset them. A seed that does not
 * restore everything it depends on works exactly once.
 *
 * Several are wide wordmarks, which is what found the `image_fit` gap — every
 * avatar leaf below asks for `contain` so the mark is shown whole rather than
 * cropped to a fragment.
 */
const PAGES = [
  {
    handle: "myspace",
    displayName: "Aeleos ~*~",
    blocks: myspace,
    theme: myspaceTheme,
    avatar: "https://cdn.simpleicons.org/myspace/003399",
  },
  {
    handle: "messenger",
    displayName: "Aeleos (Available)",
    blocks: messenger,
    theme: messengerTheme,
    avatar:
      "https://upload.wikimedia.org/wikipedia/en/b/bf/Windows_Live_Messenger_icon.png",
  },
  {
    handle: "board",
    displayName: "Aeleos",
    blocks: board,
    theme: boardTheme,
    avatar: "https://cdn.simpleicons.org/x/1d9bf0",
  },
  {
    handle: "sky",
    displayName: "Aeleos",
    blocks: sky,
    theme: skyTheme,
    avatar: "https://cdn.simpleicons.org/bluesky/006aff",
  },
  {
    handle: "threads",
    displayName: "aeleos",
    blocks: threads,
    theme: threadsTheme,
    avatar: "https://cdn.simpleicons.org/threads/ffffff",
  },
  {
    handle: "hi5",
    displayName: "Aeleos",
    blocks: hi5,
    theme: hi5Theme,
    avatar: "https://www.google.com/s2/favicons?domain=hi5.com&sz=256",
  },
  {
    handle: "sonico",
    displayName: "Aeleos",
    blocks: sonico,
    theme: sonicoTheme,
    avatar:
      "https://upload.wikimedia.org/wikipedia/commons/4/49/Logo-twoo-sonico.png",
  },
  {
    handle: "geocities",
    displayName: "AELEOS",
    blocks: geocities,
    theme: geocitiesTheme,
    avatar:
      "https://upload.wikimedia.org/wikipedia/commons/6/63/GeoCities_logo.svg",
  },
  {
    handle: "furaffinity",
    displayName: "Aeleos",
    blocks: furaffinity,
    theme: furaffinityTheme,
    avatar: "https://cdn.simpleicons.org/furaffinity/2f7d95",
  },
  {
    handle: "fotolog",
    displayName: "aeleos",
    blocks: fotolog,
    theme: fotologTheme,
    avatar: "https://www.google.com/s2/favicons?domain=fotolog.com&sz=256",
  },
  {
    handle: "facebook",
    displayName: "Aeleos",
    blocks: facebook,
    theme: facebookTheme,
    avatar: "https://cdn.simpleicons.org/facebook/3b5998",
  },
];

export { ERA_LOOKS, ERA_LOOKS_META, PAGES };
