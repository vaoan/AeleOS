/**
 * Rebuilds the showcase page at `/en/1` — one block of every kind, one section
 * of every arrangement, every style key, a theme with a gradient, a canvas and
 * a page picture, both retro players across every chrome, and nesting to the
 * depth cap.
 *
 * **It is a verification as much as a demo.** Everything the model can express
 * is expressed here, so a change that breaks one of them shows up on a page
 * somebody can look at rather than only in a suite. It is also how two real
 * faults were found that the markup reported as fine: a Content-Security-Policy
 * refusing every skin, and both players reading "no songs yet" over a playlist
 * holding two.
 *
 * **The target is {@link PROJECT_REF} and nothing else can be passed in.**
 * Libra is in production with its own project, and this writes with an admin
 * token — so the reference is imported rather than read from the environment,
 * for the reason `aeleos-project.mjs` exists.
 *
 * Run with a Supabase personal access token:
 *
 * ```bash
 * SUPABASE_ACCESS_TOKEN=… node scripts/seed-showcase.mjs
 * ```
 */
import { PROJECT_REF, PROJECT_NAME } from "./aeleos-project.mjs";

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error("SUPABASE_ACCESS_TOKEN is required.");
  process.exit(1);
}

/**
 * Runs one statement against the project.
 *
 * `write` must be passed explicitly, so nothing here mutates by accident.
 *
 * @param query - the SQL to run.
 * @param options - whether the statement writes.
 * @returns the rows, as the Management API returns them.
 */
async function ask(query, { write = false } = {}) {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, read_only: !write }),
    },
  );
  const text = await response.text();
  if (!response.ok)
    throw new Error(`${response.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : [];
}

const AUDIO = [
  "https://archive.org/download/CD1.TylerBatesItsOnlyAMatterOfTime_201901/CD1.%20Tyler%20Bates%20-%20It%27s%20Only%20a%20Matter%20of%20Time.mp3",
  "https://upload.wikimedia.org/wikipedia/commons/c/c8/Example.ogg",
];

// Verified IN A BROWSER rather than with curl: Wikimedia's upload host is
// refused by Chromium's Opaque Response Blocking, which curl cannot see at all.
const PICTURES = [
  "https://picsum.photos/seed/aeleos-one/640/420",
  "https://picsum.photos/seed/aeleos-two/640/420",
  "https://cdn.pixabay.com/photo/2017/02/20/18/03/cat-2083492_640.jpg",
  "https://picsum.photos/seed/aeleos-four/640/420",
];

/** A soft, low-contrast picture, so text over it stays readable. */
const WASH = "https://picsum.photos/seed/aeleos-wash/900/600?blur=8";
/** Something small, to show a TILE rather than a cover. */
const TILE = "https://picsum.photos/seed/aeleos-tile/96/96?grayscale&blur=2";

const SKINS = {
  base: "https://r2.webampskins.org/skins/8a2cfd657fa97b1a511b372f5249d63a.wsz",
  vibro:
    "https://r2.webampskins.org/skins/4cea755a4048eecefc0f0d327f4d01ea.wsz",
};

/** A playlist as stored rows: cell 0 the address, 1 the title, 2 the artist. */
const playlist = () => [
  [
    { text_en: AUDIO[0] },
    {
      text_en: "It's Only a Matter of Time",
      text_es: "Solo es cuestión de tiempo",
    },
    { text_en: "Tyler Bates" },
  ],
  [{ text_en: AUDIO[1] }, { text_en: "Example" }, { text_en: "Wikimedia" }],
];

const leaf = (kind, title, rest = {}) => ({
  kind,
  title_en: title,
  description_en: "",
  ...rest,
});

const section = (name, mode, children, rest = {}) => ({
  kind: "container",
  mode,
  name_en: name,
  children,
  ...rest,
});

const group = (mode, children, rest = {}) => ({
  kind: "container",
  mode,
  children,
  ...rest,
});

/** One nested container wearing a skin, with a line of prose inside it. */
const skinCard = (skin, words) =>
  group("stack", [leaf("text", skin, { description_en: words })], {
    name_en: skin,
    style: { skin },
  });

/** One nested container wearing a border style. */
const borderCard = (border) =>
  group(
    "stack",
    [
      leaf("text", border, {
        description_en:
          border === "none"
            ? "`none` is a CHOICE. Absent would mean inherit."
            : `A ${border} edge, composed over whatever skin is worn.`,
      }),
    ],
    { name_en: border, style: { border } },
  );

const sections = [
  section("Words", "stack", [
    leaf("text", "A paragraph", {
      description_en:
        "A `text` leaf: a heading and prose. Every word on this page is somebody's own writing, never a translation key.",
    }),
    leaf("quote", "Ada Lovelace", {
      description_en:
        "That brain of mine is something more than merely mortal, as time will show.",
    }),
    leaf("stat", "Species", { description_en: "Arctic fox" }),
    leaf("progress", "Reference sheet", { description_en: "72%" }),
  ]),

  section(
    "A grid of six places, one deliberately empty",
    "grid",
    [
      leaf("picture", "A cat", { image_url: PICTURES[0] }),
      leaf("picture", "A tabby", { image_url: PICTURES[1] }),
      null,
      leaf("picture", "An apple", { image_url: PICTURES[2] }),
      leaf("picture", "A cat in snow", { image_url: PICTURES[3] }),
      leaf("text", "The gap is on purpose", {
        description_en:
          "An empty place keeps its width and draws nothing. Collapsing it would change the shape its author chose.",
      }),
    ],
    { spaces: 3 },
  ),

  section(
    "The retro players",
    "grid",
    [
      leaf("player", "Media player — WMP9", {
        icon: "wmp9",
        rows: playlist(),
        description_en: "A `player`: a video pane, so it can host YouTube.",
      }),
      leaf("jukebox", "Music player — Winamp", {
        icon: "winamp",
        link_url: SKINS.base,
        rows: playlist(),
        description_en: "A `jukebox` wearing a real .wsz from the Skin Museum.",
      }),
    ],
    { spaces: 2 },
  ),

  section(
    "Every chrome is a table entry",
    "grid",
    [
      leaf("player", "WMP7", { icon: "wmp7", rows: playlist() }),
      leaf("player", "VLC", { icon: "vlc", rows: playlist() }),
      leaf("player", "QuickTime", { icon: "quicktime", rows: playlist() }),
      leaf("player", "Media Player Classic", { icon: "mpc", rows: playlist() }),
      leaf("jukebox", "Sonique", { icon: "sonique", rows: playlist() }),
      leaf("jukebox", "foobar2000", { icon: "foobar", rows: playlist() }),
      leaf("jukebox", "WMP 6.4", { icon: "wmp64", rows: playlist() }),
      leaf("jukebox", "Winamp, another skin", {
        icon: "winamp",
        link_url: SKINS.vibro,
        rows: playlist(),
      }),
    ],
    { spaces: 2 },
  ),

  section(
    "Skins — form, never colour",
    "grid",
    [
      skinCard("glass", "Frosted, and blurring what is behind it."),
      skinCard("comic", "A halftone tile and a heavy edge."),
      skinCard("neon", "A shadow with no offset: a glow, not a cast."),
      skinCard("cutout", "A corner cut off straight rather than rounded."),
      skinCard("frame", "Concentric rings where every other edge is one line."),
      skinCard("outline", "No surface at all — the page shows through."),
      skinCard("inset", "Pressed in rather than raised."),
      skinCard("sticker", "A die-cut ring."),
      skinCard("blueprint", "A ruled grid."),
    ],
    { spaces: 3 },
  ),

  section(
    "Borders compose with whatever skin is worn",
    "grid",
    [
      borderCard("solid"),
      borderCard("dashed"),
      borderCard("dotted"),
      borderCard("double"),
      borderCard("none"),
    ],
    { spaces: 3, style: { skin: "paper" } },
  ),

  section(
    "A picture behind a section, covering",
    "grid",
    [
      leaf("text", "cover", {
        description_en:
          "One copy, scaled to fill. The section's own skin still paints over it.",
      }),
      leaf("stat", "Fit", { description_en: "cover" }),
    ],
    {
      spaces: 2,
      style: { background_url: WASH, background_fit: "cover", skin: "glass" },
    },
  ),

  section(
    "A picture behind a section, tiling",
    "grid",
    [
      leaf("text", "tile", {
        description_en:
          "Repeated at its natural size. `tile` and the absent default are three different paints, and used to be two.",
      }),
      leaf("stat", "Fit", { description_en: "tile" }),
    ],
    {
      spaces: 2,
      style: {
        background_url: TILE,
        background_fit: "tile",
        skin: "outline",
        border: "double",
      },
    },
  ),

  section(
    "Embeds — one kind, any provider",
    "grid",
    [
      leaf("embed", "A video", {
        link_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      }),
      leaf("embed", "An album", {
        link_url: "https://open.spotify.com/album/1DFixLWuPkv3KT3TnV35m3",
      }),
    ],
    { spaces: 2 },
  ),

  section(
    "Links and chips",
    "grid",
    [
      leaf("link", "A button out", {
        link_url: "https://furrycolombia.com",
        icon: "globe",
      }),
      leaf("social", "Bluesky", {
        link_url: "https://bsky.app/profile/luna.test",
      }),
      leaf("social", "Itch", { link_url: "https://luna.itch.io" }),
    ],
    { spaces: 3 },
  ),

  section("A table of paired cells", "stack", [
    leaf("table", "At a glance", {
      description_en: "Rows a screen reader announces as pairs.",
      rows: [
        [{ text_en: "Species" }, { text_en: "Arctic fox" }],
        [{ text_en: "Pronouns" }, { text_en: "they/them" }],
        [{ text_en: "Colour" }, { text_en: "White and grey" }],
      ],
    }),
  ]),

  section("Tabs", "tabs", [
    group(
      "stack",
      [
        leaf("text", "First", {
          description_en: "One panel at a time, with no JavaScript at all.",
        }),
      ],
      { name_en: "About" },
    ),
    group(
      "stack",
      [
        leaf("text", "Second", {
          description_en: "A radio group and :checked.",
        }),
      ],
      { name_en: "Story" },
    ),
  ]),

  section("An accordion", "accordion", [
    group(
      "stack",
      [
        leaf("text", "Open me", {
          description_en: "Every one openable at once.",
        }),
      ],
      { name_en: "Disclosure" },
    ),
    group(
      "stack",
      [leaf("text", "And me", { description_en: "Where tabs is a switcher." })],
      { name_en: "Another" },
    ),
  ]),

  section("A timeline", "timeline", [
    leaf("text", "2024", { description_en: "Designed." }),
    leaf("text", "2025", { description_en: "Drawn." }),
    leaf("text", "2026", { description_en: "Here." }),
  ]),

  section(
    "Masonry",
    "masonry",
    [
      leaf("text", "Short", { description_en: "One line." }),
      leaf("text", "Longer", {
        description_en:
          "Multi-column has no rows at all, so a short item is followed by whatever comes next rather than waiting for the tallest one beside it.",
      }),
      leaf("text", "Middle", { description_en: "Two lines, about." }),
    ],
    { spaces: 3 },
  ),

  section("A carousel", "carousel", [
    leaf("picture", "One", { image_url: PICTURES[0] }),
    leaf("picture", "Two", { image_url: PICTURES[1] }),
    leaf("picture", "Three", { image_url: PICTURES[3] }),
  ]),

  section(
    "Nesting, to the cap of three — and a style at every level",
    "grid",
    [
      group(
        "grid",
        [
          group(
            "stack",
            [
              leaf("text", "Depth three", {
                description_en:
                  "A section, a container, a container, a leaf. The database counts this, not the editor.",
              }),
            ],
            {
              name_en: "Two levels in",
              style: { skin: "inset", border: "dashed" },
            },
          ),
          leaf("stat", "Depth two", { description_en: "Beside it" }),
        ],
        {
          spaces: 2,
          name_en: "One level in",
          style: { skin: "neon", background_url: TILE, background_fit: "tile" },
        },
      ),
      leaf("text", "Depth one", {
        description_en:
          "A skin nests: `nestedSkinVars` spreads the complete set, or 'not set' would fall through to whatever encloses it.",
      }),
    ],
    { spaces: 2, style: { skin: "comic" } },
  ),
];

/**
 * The page's own theme: a gradient, a canvas, a picture and a skin.
 *
 * Capped at 2048 bytes by `set_actor_theme`, which is why the gradient is four
 * stops rather than the twelve it allows.
 */
const theme = {
  background: {
    kind: "linear",
    repeating: false,
    every: 100,
    angle: 160,
    shape: "ellipse",
    extent: "farthest-corner",
    x: 50,
    y: 30,
    stops: [
      { color: "#160f2e", at: 0 },
      { color: "#3b1d5e", at: 34 },
      { color: "#7c2f6b", at: 68 },
      { color: "#e8763c", at: 100 },
    ],
  },
  accent: "#ffb27a",
  canvas: "aurora",
  canvasColours: ["#7ee8ff", "#c77dff", "#ff8a4c", "#5ee0b5"],
  density: 1.4,
  speed: 0.7,
  scale: 1.2,
  skin: "glass",
  backgroundUrl: WASH,
  backgroundFit: "cover",
  cursor: null,
};

const blocks = JSON.stringify(sections);
const themed = JSON.stringify(theme);
console.log(`[showcase] target: ${PROJECT_NAME} (${PROJECT_REF})`);
console.log(`[showcase] blocks ${blocks.length} bytes (cap 65536)`);
console.log(`[showcase] theme  ${themed.length} bytes (cap 2048)`);
if (themed.length > 2048) throw new Error("the theme is over its cap");
if (blocks.length > 65536) throw new Error("the blocks are over their cap");

const [owner] = await ask(
  "select actor_ref from public.person_addresses where address = '1'",
);
if (!owner) throw new Error("no person is at address 1 — nothing to show on");
const actor = owner.actor_ref;

await ask(
  `update public.actors set display_name = 'The showcase', visibility = 'public'
   where actor_ref = '${actor}'`,
  { write: true },
);

await ask(
  `insert into public.actor_profiles (actor_ref, sections, theme)
   values ('${actor}', $b$${blocks}$b$::jsonb, $t$${themed}$t$::jsonb)
   on conflict (actor_ref) do update
     set sections = excluded.sections, theme = excluded.theme`,
  { write: true },
);

const [check] = await ask(
  `select jsonb_array_length(sections) as sections,
          octet_length(sections::text) as block_bytes,
          octet_length(theme::text) as theme_bytes
   from public.actor_profiles where actor_ref = '${actor}'`,
);
console.log("[showcase] stored:", JSON.stringify(check));
console.log("[showcase] https://me.furrycolombia.com/en/1");
