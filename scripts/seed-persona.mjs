/**
 * Builds a real-feeling furry at `/en/137` — a person, two characters, and
 * pages that use everything the model can do because each piece earns its
 * place, not because a list had to be covered.
 *
 * **It exists because the showcase cannot answer the question it answers.**
 * `seed-showcase.mjs` puts one of everything on one page, which is what makes
 * it a verification and also why nothing on it looks like a page a person
 * would build. Between them the two scripts ask different questions: does
 * every key still render, and would anybody want this.
 *
 * **Coverage here is a consequence, not a goal.** Across the three pages every
 * container mode and every leaf kind appears, but each was chosen for the job
 * it is doing — `timeline` for a character's redesigns, `accordion` for the
 * questions every artist is asked, `tabs` for outfit variants, `progress` for
 * a fursuit fund. A page reaching for `masonry` in order to tick `masonry` off
 * would be the showcase again with better pictures.
 *
 * **`card_size` is deliberately absent.** It is stored and read by no
 * renderer, so setting it would be a choice that does nothing — exactly the
 * shape this repo calls the worst kind of control.
 *
 * **The character is regional on purpose.** A spectacled bear is the only bear
 * native to South America and the only one in Colombia, which is the kind of
 * choice a member of this community makes and a generic seeder does not.
 *
 * **Most of the writing is bilingual and some of it is not**, which is the
 * honest shape of a Colombian user's page: `title_en` is the base field every
 * leaf must carry, `title_es` is optional, and a block written in one language
 * only is a person who has not written the other yet. Never a fault.
 *
 * **The pictures are placeholders and the writing is not.** Nothing here is
 * hosted by us — every picture is an address, exactly like the players and the
 * embeds — but no placeholder service has furry art on it, so the captions
 * carry what the images cannot.
 *
 * **The target is {@link PROJECT_REF} and nothing else can be passed in**, for
 * the reason `aeleos-project.mjs` exists: Libra is in production with its own
 * project and this writes with an admin token.
 *
 * ```bash
 * SUPABASE_ACCESS_TOKEN=… node scripts/seed-persona.mjs
 * ```
 */
import { PROJECT_REF, PROJECT_NAME } from "./aeleos-project.mjs";

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error("SUPABASE_ACCESS_TOKEN is required.");
  process.exit(1);
}

/** The person this rebuilds. Their address, not their actor ref. */
const ADDRESS = "137";

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

/** A placeholder picture. Picsum answers every seed, which pixabay does not. */
const ART = (seed, w = 800, h = 560) =>
  `https://picsum.photos/seed/${seed}/${w}/${h}`;

/** Verified in a BROWSER by the showcase — curl cannot see Chromium's ORB. */
const AUDIO = [
  "https://archive.org/download/CD1.TylerBatesItsOnlyAMatterOfTime_201901/CD1.%20Tyler%20Bates%20-%20It%27s%20Only%20a%20Matter%20of%20Time.mp3",
  "https://upload.wikimedia.org/wikipedia/commons/c/c8/Example.ogg",
];

/** A Winamp skin, which is what a `jukebox` reads its `link_url` as. */
const WINAMP_SKIN =
  "https://r2.webampskins.org/skins/8a2cfd657fa97b1a511b372f5249d63a.wsz";

/** Cell 0 is the address, 1 the title, 2 the artist. */
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

// ---------------------------------------------------------------------------
// Cacao — the character, and the page that carries the most.
// ---------------------------------------------------------------------------

const cacaoSections = [
  // The shape this whole feature was built for: facts down one narrow side,
  // the art and the writing in a wide middle, ways to reach him down the
  // other. Every place holds a `stack`, so the three columns grow on their own
  // and a long middle never drags the sides with it.
  section(
    "Cacao",
    "grid",
    [
      group("stack", [
        leaf("stat", "Species", {
          title_es: "Especie",
          description_en: "Spectacled bear",
          description_es: "Oso de anteojos",
        }),
        leaf("stat", "Height", {
          title_es: "Altura",
          description_en: "1.90 m",
        }),
        leaf("stat", "Age", { title_es: "Edad", description_en: "31" }),
        leaf("stat", "Pronouns", {
          title_es: "Pronombres",
          description_en: "he / él",
        }),
        leaf("progress", "Fursuit fund", {
          title_es: "Fondo para la fursuit",
          description_en: "42%",
        }),
        leaf("progress", "Ref sheet", {
          title_es: "Hoja de referencia",
          description_en: "100%",
        }),
      ]),
      group("stack", [
        leaf("picture", "Cacao, full reference", {
          title_es: "Cacao, referencia completa",
          image_url: ART("cacao-ref", 900, 620),
          description_en: "Ink and gouache, 2024",
          description_es: "Tinta y gouache, 2024",
        }),
        leaf("text", "About him", {
          title_es: "Sobre él",
          description_en:
            "Cacao is a spectacled bear — the only bear that lives in Colombia, and the one everybody here grew up seeing on the back of a fifty-peso coin. Broad through the shoulders, slow to anger, and completely unable to hide it when he is pleased about something.\n\nHe smells of wet earth and green coffee. He is the one who carries everybody's bags up the hill and then says it was nothing.",
          description_es:
            "Cacao es un oso de anteojos — el único oso que vive en Colombia, y el que todos acá crecimos viendo en el reverso de la moneda de cincuenta pesos. Ancho de hombros, difícil de enojar, y completamente incapaz de disimular cuando algo le gusta.\n\nHuele a tierra mojada y a café verde. Es el que sube las maletas de todos por la loma y después dice que no fue nada.",
        }),
        leaf("quote", "Dani, at Furrécua 2025", {
          description_en:
            "He hugged me so hard my glasses came off and then apologised for twenty minutes.",
          description_es:
            "Me abrazó tan duro que se me cayeron las gafas y después se disculpó por veinte minutos.",
        }),
      ]),
      group("stack", [
        leaf("link", "Full ref sheet", {
          title_es: "Hoja completa",
          description_en: "Front, back, headshots",
          description_es: "Frente, espalda, headshots",
          link_url: "https://example.com/cacao/ref",
          icon: "image",
        }),
        leaf("link", "Ask before you draw", {
          title_es: "Pregunta antes de dibujar",
          link_url: "https://t.me/tomasdibuja",
          icon: "paw-print",
        }),
        leaf("social", "Telegram", { link_url: "https://t.me/tomasdibuja" }),
        leaf("social", "Bluesky", {
          link_url: "https://bsky.app/profile/tomasdibuja.bsky.social",
        }),
      ]),
    ],
    { spaces: 3, weights: [1, 3, 1], style: { skin: "paper" } },
  ),

  // A character's redesigns really are a sequence, which is the one thing
  // `timeline` does that no arrangement of boxes does.
  section(
    "How he got here",
    "timeline",
    [
      leaf("text", "2019 — the first sketch", {
        title_es: "2019 — el primer boceto",
        description_en:
          "Drawn on the back of a receipt on the bus to Guatapé. He had a scarf then and no markings at all.",
        description_es:
          "Dibujado detrás de un recibo en el bus a Guatapé. Tenía bufanda y ninguna mancha.",
      }),
      leaf("text", "2021 — the markings", {
        title_es: "2021 — las manchas",
        description_en:
          "The eye markings arrived, and with them the rule: they are NOT symmetrical. The left one runs into the muzzle, the right stops short.",
        description_es:
          "Llegaron las manchas de los ojos, y con ellas la regla: NO son simétricas. La izquierda se mete en el hocico, la derecha se queda corta.",
      }),
      leaf("text", "2024 — the current sheet", {
        title_es: "2024 — la hoja actual",
        description_en:
          "Third full reference, and the first I would hand to a stranger without a paragraph of corrections attached.",
        description_es:
          "Tercera referencia completa, y la primera que le entregaría a un desconocido sin un párrafo de correcciones.",
      }),
      leaf("text", "2026 — the suit", {
        title_es: "2026 — la fursuit",
        description_en: "Head and paws commissioned. 42% of the way there.",
        description_es: "Cabeza y manos encargadas. 42% del camino.",
      }),
    ],
    { name_es: "Cómo llegó hasta aquí", style: { border: "dashed" } },
  ),

  // Outfit variants are a switcher, not a list: you want one at a time and you
  // want to flip between them. That is `tabs`, and it stays a server component.
  section(
    "Wardrobe",
    "tabs",
    [
      group(
        "stack",
        [
          leaf("picture", "Everyday", {
            image_url: ART("cacao-casual", 700, 620),
          }),
          leaf("text", "Everyday", {
            title_es: "Diario",
            description_en:
              "Ruana, canvas satchel, and the boots he refuses to replace.",
            description_es:
              "Ruana, morral de lona, y las botas que se niega a cambiar.",
          }),
        ],
        { name_en: "Everyday", name_es: "Diario" },
      ),
      group(
        "stack",
        [
          leaf("picture", "Páramo", { image_url: ART("cacao-cold", 700, 620) }),
          leaf("text", "Páramo", {
            description_en:
              "For the cold above three thousand metres: wool, a scarf that is far too long, and frost in the fur.",
            description_es:
              "Para el frío arriba de los tres mil metros: lana, una bufanda demasiado larga, y escarcha en el pelaje.",
          }),
        ],
        { name_en: "Páramo", name_es: "Páramo" },
      ),
      group(
        "stack",
        [
          leaf("picture", "Formal", {
            image_url: ART("cacao-formal", 700, 620),
          }),
          leaf("text", "Formal", {
            description_en:
              "Worn exactly twice. He complains about the collar in both photographs.",
            description_es:
              "Usado exactamente dos veces. Se queja del cuello en las dos fotos.",
          }),
        ],
        { name_en: "Formal", name_es: "Formal" },
      ),
    ],
    { spaces: 3, name_es: "Vestuario", style: { skin: "frame" } },
  ),

  // Art comes in every aspect ratio there is, so the arrangement that does not
  // wait for the tallest neighbour is the right one.
  section(
    "Gallery",
    "masonry",
    [
      leaf("picture", "By Tomás, 2026", {
        image_url: ART("cacao-g1", 600, 800),
      }),
      leaf("picture", "By @nubeazul, 2025", {
        image_url: ART("cacao-g2", 600, 460),
        description_en: "Trade, and still my favourite of him",
        description_es: "Intercambio, y todavía mi favorito de él",
      }),
      leaf("picture", "Badge, 2024", { image_url: ART("cacao-g3", 600, 600) }),
      leaf("picture", "Sketch page", { image_url: ART("cacao-g4", 600, 900) }),
      leaf("picture", "Con badge, 2023", {
        image_url: ART("cacao-g5", 600, 520),
      }),
    ],
    { spaces: 3, name_es: "Galería", style: { skin: "sticker" } },
  ),

  // A row you scroll sideways through is how a con gallery actually reads.
  section(
    "Drawn by friends",
    "carousel",
    [
      leaf("picture", "@nubeazul", { image_url: ART("cacao-f1", 520, 520) }),
      leaf("picture", "@paramofox", { image_url: ART("cacao-f2", 520, 520) }),
      leaf("picture", "@cafeconleche", {
        image_url: ART("cacao-f3", 520, 520),
      }),
      leaf("picture", "@tejomaru", { image_url: ART("cacao-f4", 520, 520) }),
    ],
    { name_es: "Dibujado por amigos" },
  ),

  // The palette is genuinely tabular — a label and a value, many times — and
  // `table` is the kind that announces the pair together to a screen reader. A
  // nested grid of swatches sits beside it: section, stack, grid, leaves is
  // exactly the depth cap.
  section(
    "Palette",
    "grid",
    [
      group("stack", [
        leaf("table", "Colours", {
          title_es: "Colores",
          description_en: "Hex, if you are drawing him",
          description_es: "Hex, si lo vas a dibujar",
          rows: [
            [{ text_en: "Fur", text_es: "Pelaje" }, { text_en: "#2E2A28" }],
            [
              { text_en: "Markings", text_es: "Manchas" },
              { text_en: "#E8C98A" },
            ],
            [{ text_en: "Eyes", text_es: "Ojos" }, { text_en: "#7A4B2A" }],
            [{ text_en: "Nose", text_es: "Nariz" }, { text_en: "#1B1917" }],
            [
              { text_en: "Pads", text_es: "Almohadillas" },
              { text_en: "#4A3B34" },
            ],
          ],
        }),
        group(
          "grid",
          [
            leaf("picture", "Fur", { image_url: ART("swatch-fur", 300, 200) }),
            leaf("picture", "Markings", {
              image_url: ART("swatch-mark", 300, 200),
            }),
            leaf("picture", "Eyes", { image_url: ART("swatch-eye", 300, 200) }),
          ],
          { spaces: 3 },
        ),
      ]),
      leaf("text", "One rule", {
        title_es: "Una regla",
        description_en:
          "The markings are not symmetrical. Everyone gets it wrong on the first pass and I have never once minded.",
        description_es:
          "Las manchas no son simétricas. Todo el mundo se equivoca en el primer intento y nunca me ha molestado.",
      }),
    ],
    {
      spaces: 2,
      weights: [3, 1],
      name_es: "Paleta",
      style: { skin: "blueprint", border: "dotted" },
    },
  ),

  // The questions every artist is asked, one open at a time or all at once —
  // which is disclosure, not switching.
  section(
    "Questions",
    "accordion",
    [
      leaf("text", "Can I draw him?", {
        title_es: "¿Puedo dibujarlo?",
        description_en:
          "Yes, always, and you never have to ask. Gift art makes my week. The only thing I ask is the markings rule above.",
        description_es:
          "Sí, siempre, y no tienes que pedir permiso. El regalo de arte me alegra la semana. Lo único que pido es la regla de las manchas.",
      }),
      leaf("text", "Can I use him as a base?", {
        title_es: "¿Puedo usarlo como base?",
        description_en:
          "No — he is a specific person, not a species sheet. Spectacled bears themselves are wide open though, and there are far too few of us.",
        description_es:
          "No — él es una persona específica, no una hoja de especie. Pero los osos de anteojos están libres, y somos muy pocos.",
      }),
      leaf("text", "What even is a spectacled bear?", {
        title_es: "¿Qué es un oso de anteojos?",
        description_en:
          "The only bear in South America. Cloud forest, mostly vegetarian, climbs better than anything that heavy should. Also called the Andean bear, and yes, the one on the old fifty-peso coin.",
        description_es:
          "El único oso de Suramérica. Bosque de niebla, casi vegetariano, trepa mejor de lo que algo tan pesado debería. También se llama oso andino, y sí, el de la moneda vieja de cincuenta pesos.",
      }),
    ],
    { name_es: "Preguntas", style: { skin: "comic" } },
  ),

  // A character theme is a real thing furries make, and it is the one place a
  // media player belongs rather than being shown off.
  section(
    "He sounds like this",
    "grid",
    [
      leaf("jukebox", "Cacao's tape", {
        title_es: "El casete de Cacao",
        icon: "winamp",
        rows: playlist(),
        link_url: WINAMP_SKIN,
      }),
      group("stack", [
        leaf("player", "The con vlog", {
          title_es: "El vlog de la con",
          icon: "wmp9",
          rows: playlist(),
        }),
        leaf("embed", "Furrécua aftermovie", {
          link_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        }),
      ]),
    ],
    {
      spaces: 2,
      weights: [1, 1],
      name_es: "Suena así",
      style: { skin: "neon", border: "solid" },
    },
  ),

  // A picture behind the section, tiled rather than covering — and a third
  // place left deliberately empty, which keeps its width and draws nothing
  // rather than closing the row up.
  section(
    "Where he'll be",
    "grid",
    [
      leaf("table", "2026", {
        rows: [
          [{ text_en: "Furrécua" }, { text_en: "Medellín · March" }],
          [{ text_en: "Confuror" }, { text_en: "Guadalajara · October" }],
          [
            { text_en: "Anthrocon" },
            { text_en: "maybe, honestly probably not" },
          ],
        ],
      }),
      leaf("text", "Say hello", {
        title_es: "Salúdame",
        description_en:
          "I am usually at the artist tables and I am usually the tallest thing in the room. Hugs yes, photos yes, ask first either way.",
        description_es:
          "Normalmente estoy en las mesas de artistas y normalmente soy lo más alto del salón. Abrazos sí, fotos sí, pregunta primero de todas formas.",
      }),
      null,
    ],
    {
      spaces: 3,
      weights: [2, 2, 1],
      name_es: "Dónde estará",
      style: {
        background_url: ART("paramo-tile", 120, 120),
        background_fit: "tile",
        border: "double",
      },
    },
  ),
];

/** Cacao's own theme: cloud forest at dusk, with fireflies. */
const cacaoTheme = {
  background: {
    kind: "linear",
    repeating: false,
    every: 100,
    angle: 165,
    shape: "ellipse",
    extent: "farthest-corner",
    x: 50,
    y: 30,
    stops: [
      { color: "#0f1a14", at: 0 },
      { color: "#1d3326", at: 38 },
      { color: "#4a3b1e", at: 72 },
      { color: "#8a5a24", at: 100 },
    ],
  },
  accent: "#e8c98a",
  canvas: "fireflies",
  canvasColours: ["#e8c98a", "#9fd8a0", "#f0b45e", "#5c8a5f"],
  density: 1.2,
  speed: 0.55,
  scale: 1.1,
  skin: "paper",
  backgroundUrl: ART("cacao-wash", 1200, 800),
  backgroundFit: "cover",
  cursor: null,
};

// ---------------------------------------------------------------------------
// Nube — the second character, unlisted. Small on purpose.
// ---------------------------------------------------------------------------

const nubeSections = [
  section(
    "Nube",
    "grid",
    [
      group("stack", [
        leaf("stat", "Species", {
          title_es: "Especie",
          description_en: "Andean fox",
          description_es: "Zorro andino",
        }),
        leaf("stat", "Pronouns", {
          title_es: "Pronombres",
          description_en: "they / elle",
        }),
        leaf("stat", "Status", {
          title_es: "Estado",
          description_en: "Unlisted — still cooking",
          description_es: "Sin listar — todavía en obra",
        }),
      ]),
      group("stack", [
        leaf("picture", "Nube, work in progress", {
          image_url: ART("nube-wip", 800, 560),
        }),
        leaf("text", "Not finished", {
          title_es: "Sin terminar",
          description_en:
            "Nube is unlisted, which is not the same as private: this page works perfectly if you have the address, and it simply does not appear on my profile. That is the whole point of unlisted, and it is how I share a design before it is ready.",
          description_es:
            "Nube está sin listar, que no es lo mismo que privado: esta página funciona perfecto si tienes la dirección, y simplemente no aparece en mi perfil. Para eso sirve, y así comparto un diseño antes de que esté listo.",
        }),
      ]),
    ],
    { spaces: 2, weights: [1, 2], style: { skin: "clay" } },
  ),
];

/** Nube's theme: cold, pale, unfinished. */
const nubeTheme = {
  background: {
    kind: "linear",
    repeating: false,
    every: 100,
    angle: 200,
    shape: "ellipse",
    extent: "farthest-corner",
    x: 50,
    y: 30,
    stops: [
      { color: "#141a24", at: 0 },
      { color: "#2b3a52", at: 55 },
      { color: "#6d7f9c", at: 100 },
    ],
  },
  accent: "#a9c3e6",
  canvas: "snow",
  canvasColours: ["#dbe7f7", "#a9c3e6"],
  density: 0.9,
  speed: 0.4,
  scale: 1,
  skin: "clay",
  backgroundUrl: null,
  backgroundFit: "cover",
  cursor: null,
};

// ---------------------------------------------------------------------------
// Tomás — the person. His page is the artist's desk, not a character sheet.
// ---------------------------------------------------------------------------

const personSections = [
  section(
    "Hola",
    "grid",
    [
      group("stack", [
        leaf("stat", "From", { title_es: "De", description_en: "Medellín" }),
        leaf("stat", "Pronouns", {
          title_es: "Pronombres",
          description_en: "he / él",
        }),
        leaf("stat", "Here since", {
          title_es: "Aquí desde",
          description_en: "2019",
        }),
        leaf("progress", "Commission queue", {
          title_es: "Cola de comisiones",
          description_en: "3/8",
        }),
      ]),
      group("stack", [
        leaf("picture", "My table at Furrécua", {
          title_es: "Mi mesa en Furrécua",
          image_url: ART("tomas-table", 900, 600),
        }),
        leaf("text", "Hi, I'm Tomás", {
          title_es: "Hola, soy Tomás",
          description_en:
            "Illustrator in Medellín. I draw badges and reference sheets, mostly in ink, mostly of bears, and I am usually the one at the table who brought far too many markers.\n\nMy own character is Cacao, below. Ask me about spectacled bears only if you have twenty minutes.",
          description_es:
            "Ilustrador en Medellín. Dibujo badges y hojas de referencia, casi siempre en tinta, casi siempre de osos, y normalmente soy el de la mesa que trajo demasiados marcadores.\n\nMi personaje es Cacao, acá abajo. Pregúntame por los osos de anteojos solo si tienes veinte minutos.",
        }),
        leaf("quote", "A regular, every single con", {
          description_en: "You drew my character better than I imagined him.",
          description_es:
            "Dibujaste a mi personaje mejor de lo que lo imaginé.",
        }),
      ]),
      group("stack", [
        leaf("link", "Commissions", {
          title_es: "Comisiones",
          description_en: "Open — two slots",
          description_es: "Abiertas — dos cupos",
          link_url: "https://example.com/tomas/commissions",
          icon: "palette",
        }),
        leaf("social", "Telegram", { link_url: "https://t.me/tomasdibuja" }),
        leaf("social", "Bluesky", {
          link_url: "https://bsky.app/profile/tomasdibuja.bsky.social",
        }),
        leaf("social", "Instagram", {
          link_url: "https://www.instagram.com/tomasdibuja",
        }),
      ]),
    ],
    { spaces: 3, weights: [1, 3, 1], style: { skin: "paper" } },
  ),

  // Prices are a table and terms are questions. Side by side, with the wide
  // half carrying the one people actually read first.
  section(
    "Commissions",
    "grid",
    [
      group("stack", [
        leaf("table", "Prices 2026", {
          title_es: "Precios 2026",
          description_en: "COP. Half up front, half on delivery.",
          description_es: "COP. Mitad al empezar, mitad al entregar.",
          rows: [
            [{ text_en: "Badge" }, { text_en: "$45.000" }],
            [
              { text_en: "Half body", text_es: "Medio cuerpo" },
              { text_en: "$120.000" },
            ],
            [
              { text_en: "Full body", text_es: "Cuerpo completo" },
              { text_en: "$190.000" },
            ],
            [
              { text_en: "Reference sheet", text_es: "Hoja de referencia" },
              { text_en: "$380.000" },
            ],
          ],
        }),
      ]),
      group(
        "accordion",
        [
          leaf("text", "What I will draw", {
            title_es: "Lo que dibujo",
            description_en:
              "Anthro, feral, ferals wearing clothes for some reason, mechanical parts, gore up to a point. Ask.",
            description_es:
              "Antro, feral, ferales con ropa por alguna razón, partes mecánicas, gore hasta cierto punto. Pregunta.",
          }),
          leaf("text", "What I will not", {
            title_es: "Lo que no",
            description_en:
              "Hate imagery, real people, minors in anything adult.",
            description_es:
              "Imágenes de odio, personas reales, menores en nada adulto.",
          }),
          leaf("text", "How long", {
            title_es: "Cuánto demora",
            description_en:
              "Two to five weeks. I will tell you where you are in the queue, and I will tell you if it slips.",
            description_es:
              "De dos a cinco semanas. Te digo en qué punto de la cola vas, y te aviso si se atrasa.",
          }),
        ],
        { name_en: "Terms", name_es: "Términos" },
      ),
    ],
    {
      spaces: 2,
      weights: [2, 3],
      name_es: "Comisiones",
      style: { skin: "outline" },
    },
  ),

  section(
    "Recent work",
    "masonry",
    [
      leaf("picture", "Badge commission", {
        image_url: ART("tomas-a", 600, 700),
      }),
      leaf("picture", "Ink study", { image_url: ART("tomas-b", 600, 460) }),
      leaf("picture", "Convention sketch", {
        image_url: ART("tomas-c", 600, 820),
      }),
      leaf("picture", "Ref sheet detail", {
        image_url: ART("tomas-d", 600, 560),
      }),
      leaf("picture", "Gouache test", { image_url: ART("tomas-e", 600, 640) }),
    ],
    { spaces: 3, name_es: "Trabajo reciente", style: { skin: "sticker" } },
  ),

  // Written in Spanish only. He never got round to the English, which is
  // ordinary and must never be reported as a fault.
  section(
    "Dónde me encuentras",
    "grid",
    [
      leaf("link", "Furrécua 2026", {
        description_en: "Medellín · marzo · mesa 14",
        link_url: "https://example.com/furrecua",
        icon: "calendar",
      }),
      leaf("link", "Tienda", {
        description_en: "Prints y stickers",
        link_url: "https://example.com/tienda",
        icon: "shopping-bag",
      }),
      leaf("embed", "Lo que suena en el estudio", {
        link_url: "https://open.spotify.com/album/1DFixLWuPkv3KT3TnV35m3",
      }),
    ],
    { spaces: 3, weights: [1, 1, 2], style: { border: "none" } },
  ),
];

/** Tomás's theme: ink, paper and warm lamp light. */
const personTheme = {
  background: {
    kind: "linear",
    repeating: false,
    every: 100,
    angle: 150,
    shape: "ellipse",
    extent: "farthest-corner",
    x: 50,
    y: 30,
    stops: [
      { color: "#17130f", at: 0 },
      { color: "#2e2419", at: 45 },
      { color: "#7a5a2e", at: 100 },
    ],
  },
  accent: "#f0b45e",
  canvas: "bokeh",
  canvasColours: ["#f0b45e", "#e8c98a", "#a9763c"],
  density: 1,
  speed: 0.5,
  scale: 1.15,
  skin: "paper",
  backgroundUrl: null,
  backgroundFit: "cover",
  cursor: null,
};

// ---------------------------------------------------------------------------
// Write.
// ---------------------------------------------------------------------------

const pages = [
  ["person", personSections, personTheme],
  ["cacao", cacaoSections, cacaoTheme],
  ["nube", nubeSections, nubeTheme],
];

console.log(`[persona] target: ${PROJECT_NAME} (${PROJECT_REF})`);
for (const [what, blocks, theme] of pages) {
  const b = JSON.stringify(blocks).length;
  const t = JSON.stringify(theme).length;
  console.log(
    `[persona] ${what}: blocks ${b} (cap 65536), theme ${t} (cap 2048)`,
  );
  if (b > 65536) throw new Error(`${what} is over the block cap`);
  if (t > 2048) throw new Error(`${what}'s theme is over its cap`);
}

const [owner] = await ask(
  `select actor_ref from public.person_addresses where address = '${ADDRESS}'`,
);
if (!owner)
  throw new Error(`no person is at address ${ADDRESS} — nothing to build on`);
const person = owner.actor_ref;

/**
 * Writes one actor's page and theme.
 *
 * @param ref - the actor.
 * @param blocks - the sections.
 * @param theme - the theme.
 * @returns nothing.
 */
async function writePage(ref, blocks, theme) {
  await ask(
    `insert into public.actor_profiles (actor_ref, sections, theme)
     values ('${ref}', $b$${JSON.stringify(blocks)}$b$::jsonb,
             $t$${JSON.stringify(theme)}$t$::jsonb)
     on conflict (actor_ref) do update
       set sections = excluded.sections, theme = excluded.theme`,
    { write: true },
  );
}

await ask(
  `update public.actors
      set display_name = 'Tomás', visibility = 'public'
    where actor_ref = '${person}'`,
  { write: true },
);
await writePage(person, personSections, personTheme);

/**
 * Creates or updates one of this person's fursonas, then writes its page.
 *
 * **It inserts directly rather than calling `create_fursona`**, which derives
 * its owner from the caller's token and so cannot be reached by an admin
 * script with no session. Everything that function would enforce holds here by
 * construction: the handle matches its charset and length, the fursona shape
 * carries an owner and no identity, and the row is `active`.
 *
 * @param handle - the handle, unique within this owner.
 * @param displayName - the name shown on the page.
 * @param visibility - `public` to list it on the person's profile.
 * @param blocks - the page.
 * @param theme - the page's theme.
 * @returns nothing.
 */
async function fursona(handle, displayName, visibility, blocks, theme) {
  const [existing] = await ask(
    `select actor_ref from public.actors
      where owner_ref = '${person}' and handle = '${handle}'`,
  );
  const ref = existing
    ? existing.actor_ref
    : (
        await ask(
          `insert into public.actors
             (actor_ref, kind, owner_ref, handle, display_name, visibility, status)
           values (gen_random_uuid(), 'fursona', '${person}', '${handle}',
                   '${displayName}', '${visibility}', 'active')
           returning actor_ref`,
          { write: true },
        )
      )[0].actor_ref;
  await ask(
    `update public.actors
        set display_name = '${displayName}', visibility = '${visibility}'
      where actor_ref = '${ref}'`,
    { write: true },
  );
  await writePage(ref, blocks, theme);
  console.log(`[persona] ${handle}: ${visibility}`);
}

await fursona("cacao", "Cacao", "public", cacaoSections, cacaoTheme);
// Unlisted on purpose, and its own page says why. A profile lists only PUBLIC
// fursonas, so this one is reachable by its address and absent from `/137` —
// the rule most likely to be broken by an implementation that simply lists
// what somebody owns.
await fursona("nube", "Nube", "unlisted", nubeSections, nubeTheme);

const check = await ask(
  `select a.handle, a.visibility,
          jsonb_array_length(coalesce(p.sections, '[]'::jsonb)) as sections
     from public.actors a
     left join public.actor_profiles p on p.actor_ref = a.actor_ref
    where a.actor_ref = '${person}' or a.owner_ref = '${person}'
    order by a.kind, a.handle`,
);
console.log("[persona] stored:", JSON.stringify(check));
console.log(`[persona] https://me.furrycolombia.com/en/${ADDRESS}`);
console.log(`[persona] https://me.furrycolombia.com/en/${ADDRESS}/cacao`);
console.log(`[persona] https://me.furrycolombia.com/en/${ADDRESS}/nube`);
