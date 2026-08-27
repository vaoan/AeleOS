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
 * Each page targets an era's characteristic thing rather than its logo: no
 * marks, no wordmarks, no brand assets. What is copied is arrangement, palette
 * and density, which is what the block model either can or cannot express.
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
import pg from "pg";
import { poolerUrl, PROJECT_NAME } from "./aeleos-project.mjs";

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
        leaf("avatar", "Aeleos"),
        leaf("text", "Aeleos is in your extended network", {
          description_en:
            "Last login: 8/27/2026\n\nMale\n24 years old\nMedellín, COLOMBIA",
        }),
        leaf("table", "Contacting Aeleos", {
          rows: [
            [{ text_en: "Send Message" }, { text_en: "Forward to Friend" }],
            [{ text_en: "Add to Friends" }, { text_en: "Add to Favorites" }],
            [{ text_en: "Instant Message" }, { text_en: "Block User" }],
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
      style: { skin: "default", heading: "bar" },
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
    { spaces: 4, style: { skin: "default", heading: "bar" } },
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
    { style: { skin: "default", heading: "bar" } },
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
  canvas: "grid",
  // **An author cannot turn the backdrop OFF.** `none` is not a canvas, so it
  // falls back to nebula, and the density dial floors at 0.25. A flat 2007 page
  // had no animation at all; the nearest reachable thing is a canvas painted in
  // the page's own colours at the floor. Recorded as a gap in the findings.
  canvasColours: ["#ffffff", "#f2f5f9"],
  density: 0.25,
  speed: 0.25,
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
      group("stack", [leaf("avatar", "Display picture")]),
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
      group("stack", [leaf("avatar", "Aeleos")]),
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
    "timeline",
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
      group("stack", [leaf("avatar", "Aeleos")]),
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
  section("Feed", "timeline", [
    post(
      "· 3h",
      "the nice thing about a small timeline is you can read all of it",
    ),
    post("· 9h", "reposting my own post because the algorithm is me"),
    post(
      "· 1d",
      "starter packs but for people who write commit messages too long",
    ),
  ]),
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
      group("stack", [leaf("avatar", "Aeleos")]),
    ],
    { spaces: 2, weights: [3, 1], style: { chrome: "bare" } },
  ),
  section(
    "",
    "timeline",
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
      group("stack", [leaf("avatar", "Aeleos"), leaf("handle", "hi5 ID")]),
      group("stack", [
        leaf("name", "Aeleos"),
        leaf("stat", "Mood", { description_en: "😎 chillin" }),
        leaf("stat", "Profile views", { description_en: "18,402" }),
        leaf("progress", "Profile completeness", { description_en: "80" }),
      ]),
    ],
    { spaces: 2, weights: [1, 2], style: { skin: "default", heading: "bar" } },
  ),
  section(
    "My Friends (247)",
    "grid",
    Array.from({ length: 6 }, (_, i) =>
      leaf("picture", ["Dani", "Mica", "Sol", "Kira", "Vale", "Nico"][i], {
        image_url: photo(`hi5-${i}`, 240, 240),
      }),
    ),
    { spaces: 3, style: { skin: "default", heading: "bar" } },
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
    { style: { skin: "default", heading: "bar" } },
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
  canvas: "grid",
  // **An author cannot turn the backdrop OFF.** `none` is not a canvas, so it
  // falls back to nebula, and the density dial floors at 0.25. A flat 2007 page
  // had no animation at all; the nearest reachable thing is a canvas painted in
  // the page's own colours at the floor. Recorded as a gap in the findings.
  canvasColours: ["#ffffff", "#f2f5f9"],
  density: 0.25,
  speed: 0.25,
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
      group("stack", [leaf("avatar", "Aeleos"), leaf("handle", "Usuario")]),
      group("stack", [
        leaf("name", "Aeleos"),
        leaf("stat", "Ciudad", { description_en: "Medellín, Colombia" }),
        leaf("stat", "Amigos", { description_en: "412" }),
        leaf("stat", "Fotos", { description_en: "1,038" }),
      ]),
    ],
    { spaces: 2, weights: [1, 2], style: { skin: "default", heading: "bar" } },
  ),
  section(
    "Mis Fotos",
    "masonry",
    Array.from({ length: 7 }, (_, i) =>
      leaf("picture", `Foto ${i + 1}`, {
        image_url: photo(`sonico-${i}`, 400, 300 + (i % 3) * 120),
      }),
    ),
    { spaces: 3, style: { skin: "default", heading: "bar" } },
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
    { style: { skin: "default", heading: "bar" } },
  ),
];

const sonicoTheme = theme({
  background: gradient(180, [
    { color: "#f2f8fd", at: 0 },
    { color: "#ffffff", at: 100 },
  ]),
  accent: "#1a6bb5",
  canvas: "grid",
  // **An author cannot turn the backdrop OFF.** `none` is not a canvas, so it
  // falls back to nebula, and the density dial floors at 0.25. A flat 2007 page
  // had no animation at all; the nearest reachable thing is a canvas painted in
  // the page's own colours at the floor. Recorded as a gap in the findings.
  canvasColours: ["#ffffff", "#f2f5f9"],
  density: 0.25,
  speed: 0.25,
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
      leaf("avatar", "Aeleos"),
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

const PAGES = [
  ["myspace", "Aeleos ~*~", myspace, myspaceTheme],
  ["messenger", "Aeleos (Available)", messenger, messengerTheme],
  ["board", "Aeleos", board, boardTheme],
  ["sky", "Aeleos", sky, skyTheme],
  ["threads", "aeleos", threads, threadsTheme],
  ["hi5", "Aeleos", hi5, hi5Theme],
  ["sonico", "Aeleos", sonico, sonicoTheme],
  ["geocities", "AELEOS", geocities, geocitiesTheme],
];

await client.connect();
try {
  const [owner] = await ask(
    "select actor_ref from public.person_addresses where address = $1",
    [ADDRESS],
  );
  if (!owner) throw new Error(`no person at /${ADDRESS}`);
  const person = owner.actor_ref;

  for (const [handle, displayName, blocks, pageTheme] of PAGES) {
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
      "update public.actors set display_name = $1, visibility = 'unlisted' where actor_ref = $2",
      [displayName, ref],
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

  console.log(`\n${PROJECT_NAME}: ${PAGES.length} pastiches written.`);
} finally {
  await client.end();
}
