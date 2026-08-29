/**
 * Eight pages that imitate somebody else's social network, as a test of reach.
 *
 * **The question is not "does it render" but "could a person have built this".**
 * `seed-showcase.mjs` proves every key still works and `seed-persona.mjs` proves
 * one page is worth looking at. Neither asks whether the model can be pushed
 * toward a LOOK it was not designed for — and imitating something specific is
 * the only way to find the walls, because a pastiche fails visibly and in a way
 * you can name.
 *
 * Each page targets an era's characteristic ARRANGEMENT, palette and density,
 * which is what the block model either can or cannot express. Its chrome is
 * never copied wholesale — no navigation, no page furniture, no reproduction
 * of anybody's interface.
 *
 * **This paragraph used to say "no marks, no wordmarks, no brand assets" while
 * the list below set eight brand logos as avatars**, and the contradiction sat
 * in one file for a fortnight. The logos were added deliberately and the
 * sentence was never updated — see the actors note, where the change is
 * recorded. What is true is narrower and worth stating exactly: each page uses
 * the site's own mark as the profile AVATAR, hot-linked and never committed,
 * to say which era is being imitated. Nothing else of theirs is reproduced.
 *
 * The era looks under `era-*` take the opposite line and use no artwork at
 * all, because an operating system's chrome is the thing being imitated rather
 * than a name beside it. That difference is deliberate; if it is ever
 * reconciled, reconcile it here rather than in one of the two.
 *
 * **They are `unlisted` on purpose.** A profile lists only public fursonas, so
 * these are reachable by address and absent from `/en/137` — which keeps that
 * curated page what it is while leaving these open for review.
 *
 * Run it with the database password:
 *
 * ```bash
 * set -a; . ./.secrets; set +a; node scripts/seed-pastiches.mjs
 * ```
 */
import { readFileSync } from "node:fs";
import pg from "pg";
import { poolerUrl, PROJECT_NAME } from "./aeleos-project.mjs";

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

/** What each look is called on the page, since an id is not a name. */
const ERA_NAMES = {
  "era-win98": "Windows 98",
  "era-winxp": "Windows XP",
  "era-vista": "Windows Vista",
  "era-win7": "Windows 7",
  "era-win8": "Windows 8",
};

const password = process.env.SUPABASE_DB_PASSWORD;
if (!password) {
  console.error("SUPABASE_DB_PASSWORD is required (see .secrets).");
  process.exit(1);
}

/** The person these hang off, who already exists. */
const ADDRESS = "137";

const client = new pg.Client({ connectionString: poolerUrl(password) });

/**
 * Runs one statement.
 *
 * @param query - the SQL.
 * @param values - bound parameters, so nothing is concatenated into SQL.
 * @returns the rows.
 */
async function ask(query, values = []) {
  const { rows } = await client.query(query, values);
  return rows;
}

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
      style: { skin: "default", heading: "gradient" },
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
    { spaces: 4, style: { skin: "default", heading: "gradient" } },
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
    { style: { skin: "default", heading: "gradient" } },
  ),
];

// **Rebuilt from a real 2007 capture of a MySpace profile, not from memory.**
// The first attempt was a purple gradient with rounded cards and generous type,
// which is not what the site looked like: a profile is WHITE content boxes with
// solid coloured title bars, ~11px Verdana, and almost no padding. The page
// background is the one thing an author customised, so the tile stays.
const myspaceTheme = theme({
  background: gradient(180, [
    { color: "#e8eef7", at: 0 },
    { color: "#ffffff", at: 100 },
  ]),
  accent: "#003399",
  // **No animation at all, which is what a flat 2007 page had.** This used to
  // fake it with a grid at the density floor, because `CANVASES` did not list
  // `none` — the mechanism was there the whole time and only the picker was
  // missing.
  canvas: "none",
  skin: "default",
  font: "classic",
  spacing: "compact",
  backgroundUrl: tile("stardust"),
  backgroundFit: "tile",
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

const messengerTheme = theme({
  background: gradient(160, [
    { color: "#dff0ff", at: 0 },
    { color: "#9ec9ec", at: 60 },
    { color: "#6ba7d6", at: 100 },
  ]),
  accent: "#0b6bcb",
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
// 3 — A dark microblog board. `timeline` is the mode this exists to test.
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
  speed: 0.2,
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

const skyTheme = theme({
  background: gradient(170, [
    { color: "#ffffff", at: 0 },
    { color: "#eef6ff", at: 100 },
  ]),
  accent: "#0085ff",
  canvas: "bubbles",
  canvasColours: ["#cfe6ff", "#0085ff"],
  density: 0.5,
  speed: 0.3,
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
        leaf("text", "", {
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

const threadsTheme = theme({
  background: gradient(180, [
    { color: "#000000", at: 0 },
    { color: "#0a0a0a", at: 100 },
  ]),
  accent: "#f5f5f5",
  canvas: "grid",
  canvasColours: ["#1a1a1a", "#101010"],
  density: 0.2,
  speed: 0.1,
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
// 6 — hi5. Loud, yellow, widget-shaped.
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
      style: { skin: "default", heading: "gradient" },
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
    { spaces: 3, style: { skin: "default", heading: "gradient" } },
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
    { style: { skin: "default", heading: "gradient" } },
  ),
];

// **hi5 was BLUE, not yellow.** The first attempt built a bright orange candy
// page off the memory of the logo; a 2007 capture of the real site is blue and
// grey title bars over white content, the same idiom MySpace used. The orange
// survives only as the accent, which is where it actually was.
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
      style: { skin: "default", heading: "gradient" },
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
    { spaces: 3, style: { skin: "default", heading: "gradient" } },
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
    { style: { skin: "default", heading: "gradient" } },
  ),
];

const sonicoTheme = theme({
  background: gradient(180, [
    { color: "#f2f8fd", at: 0 },
    { color: "#ffffff", at: 100 },
  ]),
  accent: "#1a6bb5",
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
// ---------------------------------------------------------------------------

const geocities = [
  section(
    "*~*~ WELCOME TO AELEOS' HOMEPAGE ~*~*",
    "stack",
    [
      leaf("avatar", "Aeleos", { style: { image_fit: "contain" } }),
      leaf("text", "", {
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
  speed: 0.2,
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
// **Built from knowledge rather than from a capture**, unlike the eight above:
// web.archive.org would not answer this session and the live site refuses an
// unauthenticated fetch. What is claimed here is the FEEL — a dark page, a
// banner, a narrow stats rail beside a wide body, a thumbnail grid and a
// shouts wall — not a palette anybody measured. Check it against a real
// capture before treating any colour in it as reference.
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
    ].map(([who, said]) =>
      leaf("text", who, { description_en: said, style: { chrome: "bare" } }),
    ),
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
// Built from knowledge rather than from a capture — see the note on 9.
// ---------------------------------------------------------------------------

const fotolog = [
  // **A group, not a section.** A named container draws its name, and this
  // header already carries the `name` and `handle` leaves — naming it printed
  // "aeleos" three times down the page before anybody scrolled.
  group("stack", [leaf("name", "aeleos"), leaf("handle", "fotolog")], {
    style: { chrome: "bare", text_align: "center" },
  }),

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
    ].map(([who, said]) =>
      leaf("text", who, { description_en: said, style: { chrome: "bare" } }),
    ),
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
// Built from knowledge rather than from a capture — see the note on 9. The
// blue is the one thing here anybody would recognise on sight.
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
    ].map(([who, said]) =>
      leaf("text", who, { description_en: said, style: { chrome: "bare" } }),
    ),
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
  [
    "myspace",
    "Aeleos ~*~",
    myspace,
    myspaceTheme,
    "https://cdn.simpleicons.org/myspace/003399",
  ],
  [
    "messenger",
    "Aeleos (Available)",
    messenger,
    messengerTheme,
    "https://upload.wikimedia.org/wikipedia/en/b/bf/Windows_Live_Messenger_icon.png",
  ],
  [
    "board",
    "Aeleos",
    board,
    boardTheme,
    "https://cdn.simpleicons.org/x/1d9bf0",
  ],
  [
    "sky",
    "Aeleos",
    sky,
    skyTheme,
    "https://cdn.simpleicons.org/bluesky/0085ff",
  ],
  [
    "threads",
    "aeleos",
    threads,
    threadsTheme,
    "https://cdn.simpleicons.org/threads/ffffff",
  ],
  [
    "hi5",
    "Aeleos",
    hi5,
    hi5Theme,
    "https://www.google.com/s2/favicons?domain=hi5.com&sz=256",
  ],
  [
    "sonico",
    "Aeleos",
    sonico,
    sonicoTheme,
    "https://upload.wikimedia.org/wikipedia/commons/4/49/Logo-twoo-sonico.png",
  ],
  [
    "geocities",
    "AELEOS",
    geocities,
    geocitiesTheme,
    "https://upload.wikimedia.org/wikipedia/commons/6/63/GeoCities_logo.svg",
  ],
  [
    "furaffinity",
    "Aeleos",
    furaffinity,
    furaffinityTheme,
    "https://cdn.simpleicons.org/furaffinity/2f7d95",
  ],
  [
    "fotolog",
    "aeleos",
    fotolog,
    fotologTheme,
    "https://www.google.com/s2/favicons?domain=fotolog.com&sz=256",
  ],
  [
    "facebook",
    "Aeleos",
    facebook,
    facebookTheme,
    "https://cdn.simpleicons.org/facebook/3b5998",
  ],
];

await client.connect();
try {
  const [owner] = await ask(
    "select actor_ref from public.person_addresses where address = $1",
    [ADDRESS],
  );
  if (!owner) throw new Error(`no person at /${ADDRESS}`);
  const person = owner.actor_ref;

  for (const [handle, displayName, blocks, pageTheme, avatar] of PAGES) {
    const [existing] = await ask(
      "select actor_ref from public.actors where owner_ref = $1 and handle = $2",
      [person, handle],
    );
    const ref = existing
      ? existing.actor_ref
      : (
          await ask(
            `insert into public.actors
               (actor_ref, kind, owner_ref, handle, display_name, visibility, status)
             values (gen_random_uuid(), 'fursona', $1, $2, $3, 'public', 'active')
             returning actor_ref`,
            [person, handle, displayName],
          )
        )[0].actor_ref;
    await ask(
      `update public.actors
          set display_name = $1, visibility = 'public', avatar_url = $2
        where actor_ref = $3`,
      [displayName, avatar, ref],
    );
    await ask(
      `insert into public.actor_profiles (actor_ref, sections, theme)
       values ($1, $2::jsonb, $3::jsonb)
       on conflict (actor_ref) do update
         set sections = excluded.sections, theme = excluded.theme`,
      [ref, JSON.stringify(blocks), JSON.stringify(pageTheme)],
    );
    console.log(`[pastiche] /${ADDRESS}/${handle}`);
  }

  // **The era looks, seeded from the same data the picker offers.** They are
  // `unlisted` like every other pastiche: a profile lists only public
  // fursonas, so these stay reachable by address and absent from `/en/137`,
  // which keeps that curated page what it is.
  for (const look of ERA_LOOKS) {
    const handle = look.id;
    const displayName = ERA_NAMES[look.id];
    const [existing] = await ask(
      "select actor_ref from public.actors where owner_ref = $1 and handle = $2",
      [person, handle],
    );
    const ref = existing
      ? existing.actor_ref
      : (
          await ask(
            `insert into public.actors
               (actor_ref, kind, owner_ref, handle, display_name, visibility, status)
             values (gen_random_uuid(), 'fursona', $1, $2, $3, 'unlisted', 'active')
             returning actor_ref`,
            [person, handle, displayName],
          )
        )[0].actor_ref;
    await ask(
      `update public.actors
          set display_name = $1, visibility = 'unlisted', avatar_url = null
        where actor_ref = $2`,
      [displayName, ref],
    );
    await ask(
      `insert into public.actor_profiles (actor_ref, sections, theme)
       values ($1, $2::jsonb, $3::jsonb)
       on conflict (actor_ref) do update
         set sections = excluded.sections, theme = excluded.theme`,
      [ref, JSON.stringify(look.blocks), JSON.stringify(look.theme)],
    );
    console.log(`[era]      /${ADDRESS}/${handle}`);
  }

  console.log(
    `\n${PROJECT_NAME}: ${PAGES.length} pastiches and ${ERA_LOOKS.length} era looks written.`,
  );
} finally {
  await client.end();
}
