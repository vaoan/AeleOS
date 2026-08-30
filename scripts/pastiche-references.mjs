/**
 * What each of the sixteen pastiche pages is imitating, and where the
 * evidence lives — plus the builder that turns one registry entry into a
 * page section a stranger can read.
 *
 * Nothing here is stored. Every `image` and `link` is a hot link: to
 * `arquivo.pt`'s screenshot endpoint for a real archived page, or straight to
 * a Wikipedia-hosted file for the six subjects that are not a web page at all
 * (an operating system, a desktop application). AeleOS hosts no files, and
 * this registry is not an exception to that.
 *
 * `arquivo.pt/screenshot?url=<replay-url>`, pointed at a `noFrame` replay,
 * renders that replay and returns a chrome-free PNG — no archive banner, no
 * sidebar, just the page as it was captured. The plain (non-screenshot)
 * `noFrame/replay` URL is what each entry links to instead, so a reader can
 * open the actual archived page rather than only a picture of it.
 */

/**
 * arquivo.pt's own replay address for one captured page, framed for nothing:
 * `noFrame` strips the archive's banner and sidebar, which is what makes a
 * screenshot of it a picture of the SITE rather than of the archive around
 * it.
 */
function replayUrl(timestamp, originalUrl) {
  return `https://arquivo.pt/noFrame/replay/${timestamp}/${originalUrl}`;
}

/**
 * Builds a hot link to a rendered screenshot of one arquivo.pt capture.
 *
 * @param timestamp - the fourteen-digit capture timestamp arquivo.pt assigns
 *   the page (`YYYYMMDDhhmmss`), as returned by its CDX API.
 * @param originalUrl - the page's own URL at capture time, unencoded.
 * @returns a URL on `arquivo.pt`'s own screenshot endpoint. It is a hot link
 *   that renders on request — nothing is fetched or stored by this
 *   function, and nothing is stored by AeleOS when the link is later shown
 *   on a page. The result carries the replay address as a single, fully
 *   encoded `url` query parameter, so it survives being embedded in HTML or
 *   passed to `URL` without being re-escaped.
 */
export function captureUrl(timestamp, originalUrl) {
  const target = new URL("https://arquivo.pt/screenshot");
  target.searchParams.set("url", replayUrl(timestamp, originalUrl));
  return target.toString();
}

/**
 * The six subjects arquivo.pt actually holds a capture of. Verified against
 * the CDX API on 2026-08-29 — see the task report for the resolution check.
 */
const myspace = captureUrl(
  "20081024054301",
  "http://profile.myspace.com/akioyang",
);
const hi5 = captureUrl("20080215082853", "http://www.hi5.com/");
const sonico = captureUrl("20081024155043", "http://www.sonico.com/");
const fotolog = captureUrl("20080215112915", "http://www.fotolog.com/");
const facebook = captureUrl("20080215125110", "http://www.facebook.com/");
const furaffinity = captureUrl("20191214070143", "http://www.furaffinity.net/");

/**
 * The registry: one entry per seeded page (eleven social pastiches, five
 * era looks), keyed by the same handle `pastiche-pages.mjs` seeds it under.
 *
 * Every entry carries `title_en`/`title_es` and `link_label_en`/
 * `link_label_es` regardless of which branch it takes below — these are the
 * author's own writing, not next-intl, and a caller may assume both
 * languages are always populated. Exactly one of `image` or `absent` is set,
 * never both and never neither: `image` is a hot link to a real capture,
 * `absent` is the stated reason none exists (with its own `absent_es`).
 * `link` is always set, in both branches, and points somewhere a reader can
 * follow to see more than the one picture shown — the archived page itself,
 * a restored gallery, a Wikipedia article, or the live site.
 */
export const REFERENCES = {
  myspace: {
    image: myspace,
    title_en: "A MySpace profile, October 2008",
    title_es: "Un perfil de MySpace, octubre de 2008",
    link: replayUrl("20081024054301", "http://profile.myspace.com/akioyang"),
    link_label_en: "Browse the archived profile",
    link_label_es: "Explorar el perfil archivado",
  },
  hi5: {
    image: hi5,
    title_en: "hi5's homepage, February 2008",
    title_es: "La página de inicio de hi5, febrero de 2008",
    link: replayUrl("20080215082853", "http://www.hi5.com/"),
    link_label_en: "Browse the archived page",
    link_label_es: "Explorar la página archivada",
  },
  sonico: {
    image: sonico,
    title_en: "Sonico's homepage, October 2008",
    title_es: "La página de inicio de Sonico, octubre de 2008",
    link: replayUrl("20081024155043", "http://www.sonico.com/"),
    link_label_en: "Browse the archived page",
    link_label_es: "Explorar la página archivada",
  },
  fotolog: {
    image: fotolog,
    title_en: "Fotolog's homepage, February 2008",
    title_es: "La página de inicio de Fotolog, febrero de 2008",
    link: replayUrl("20080215112915", "http://www.fotolog.com/"),
    link_label_en: "Browse the archived page",
    link_label_es: "Explorar la página archivada",
  },
  facebook: {
    image: facebook,
    title_en: "Facebook's homepage, February 2008",
    title_es: "La página de inicio de Facebook, febrero de 2008",
    link: replayUrl("20080215125110", "http://www.facebook.com/"),
    link_label_en: "Browse the archived page",
    link_label_es: "Explorar la página archivada",
  },
  furaffinity: {
    image: furaffinity,
    title_en: "Fur Affinity's homepage, December 2019",
    title_es: "La página de inicio de Fur Affinity, diciembre de 2019",
    link: replayUrl("20191214070143", "http://www.furaffinity.net/"),
    link_label_en: "Browse the archived page",
    link_label_es: "Explorar la página archivada",
  },

  // Not a web page at all: a desktop application. A capture of it is a
  // screenshot rather than an archived page, so `web.archive.org` and
  // `arquivo.pt` are both the wrong place to look — this is a curated file on
  // a permanent CDN instead.
  messenger: {
    image:
      "https://upload.wikimedia.org/wikipedia/en/9/9b/Windows-Live-Messenger-80-236x300.png",
    title_en: "Windows Live Messenger 8.0",
    title_es: "Windows Live Messenger 8.0",
    link: "https://en.wikipedia.org/wiki/Windows_Live_Messenger",
    link_label_en: "Read about Windows Live Messenger",
    link_label_es: "Leer sobre Windows Live Messenger",
  },

  // The five OS-era looks. None of these is a web page either — the subject
  // is the operating system's own chrome — so each is a curated Wikipedia
  // file rather than an arquivo.pt replay.
  "era-win98": {
    image: "https://upload.wikimedia.org/wikipedia/en/0/00/Windows98.png",
    title_en: "Windows 98's default desktop",
    title_es: "El escritorio predeterminado de Windows 98",
    link: "https://en.wikipedia.org/wiki/Windows_98",
    link_label_en: "Read about Windows 98",
    link_label_es: "Leer sobre Windows 98",
  },
  "era-winxp": {
    image: "https://upload.wikimedia.org/wikipedia/en/6/64/Windows_XP_Luna.png",
    title_en: "Windows XP's Luna theme",
    title_es: "El tema Luna de Windows XP",
    link: "https://en.wikipedia.org/wiki/Windows_XP",
    link_label_en: "Read about Windows XP",
    link_label_es: "Leer sobre Windows XP",
  },
  "era-vista": {
    image: "https://upload.wikimedia.org/wikipedia/en/a/a3/Windows_Vista.png",
    title_en: "Windows Vista's Aero glass",
    title_es: "El cristal Aero de Windows Vista",
    link: "https://en.wikipedia.org/wiki/Windows_Vista",
    link_label_en: "Read about Windows Vista",
    link_label_es: "Leer sobre Windows Vista",
  },
  "era-win7": {
    image:
      "https://upload.wikimedia.org/wikipedia/en/5/50/Windows_7_SP1_screenshot.png",
    title_en: "Windows 7's desktop",
    title_es: "El escritorio de Windows 7",
    link: "https://en.wikipedia.org/wiki/Windows_7",
    link_label_en: "Read about Windows 7",
    link_label_es: "Leer sobre Windows 7",
  },
  "era-win8": {
    image:
      "https://upload.wikimedia.org/wikipedia/en/8/8e/Windows_8_Start_Screen.png",
    title_en: "Windows 8's Start screen",
    title_es: "La pantalla de inicio de Windows 8",
    link: "https://en.wikipedia.org/wiki/Windows_8",
    link_label_en: "Read about Windows 8",
    link_label_es: "Leer sobre Windows 8",
  },

  // GeoCities was never one page. It was millions of them, hosted by Yahoo
  // until 2009 and never crawled as a whole by any archive this project has
  // found — `geocities.restorativland.org` is a fan-restored gallery of real
  // archived personal pages, which is evidence of the same kind this project
  // treats every other reference as, just not a single capture.
  geocities: {
    absent:
      "GeoCities was millions of personal pages, not one. The reference is a restored gallery of real archived ones rather than a single capture.",
    absent_es:
      "GeoCities era millones de páginas personales, no una sola. La referencia es una galería restaurada de páginas realmente archivadas, en lugar de una única captura.",
    title_en: "A GeoCities homepage",
    title_es: "Una página de inicio de GeoCities",
    link: "https://geocities.restorativland.org/Area51/",
    link_label_en: "Browse the restored gallery",
    link_label_es: "Explorar la galería restaurada",
  },

  // The board imitates Twitter's dark mode. No archive holds it: a crawler
  // is never signed in, so it is always served the light theme instead.
  board: {
    absent:
      "No archive holds this. A crawler arrives logged out and is served the light page, so the dark mode this imitates was never captured anywhere — a property of what an archive can see, not a gap in its coverage.",
    absent_es:
      "Ningún archivo conserva esto. Un rastreador llega sin haber iniciado sesión y recibe la página clara, así que el modo oscuro que esta página imita nunca fue capturado en ningún lugar — una propiedad de lo que un archivo puede ver, no un vacío en su cobertura.",
    title_en: "Twitter's dark mode, circa 2019",
    title_es: "El modo oscuro de Twitter, hacia 2019",
    link: "https://arquivo.pt/wayback/20080218174727/http://twitter.com/",
    link_label_en: "See what the archive captured instead",
    link_label_es: "Ver lo que el archivo sí capturó",
  },

  // Bluesky. Its own profile pages are never what a crawler is served.
  sky: {
    absent:
      "The archive has years of captures and none of a profile: a crawler is served the logged-out splash. This page's colours were read off the live site instead, on 2026-08-29.",
    absent_es:
      "El archivo tiene años de capturas y ninguna de un perfil: un rastreador recibe la pantalla de bienvenida sin sesión iniciada. Los colores de esta página se tomaron del sitio en vivo, el 29 de agosto de 2026.",
    title_en: "Bluesky's profile page",
    title_es: "La página de perfil de Bluesky",
    link: "https://bsky.app/",
    link_label_en: "Visit the live site",
    link_label_es: "Visitar el sitio en vivo",
  },

  // Threads. Its markup is written by the client after the page loads, so a
  // crawler's stored copy replays blank.
  threads: {
    absent:
      "The archive's captures replay blank. Threads builds its page after the markup a crawler stores, so there is nothing to replay. This page's colours were read off the live site in dark mode instead, on 2026-08-29.",
    absent_es:
      "Las capturas del archivo se reproducen en blanco. Threads construye su página después del marcado que guarda un rastreador, así que no hay nada que reproducir. Los colores de esta página se tomaron del sitio en vivo en modo oscuro, el 29 de agosto de 2026.",
    title_en: "Threads' profile page, dark mode",
    title_es: "La página de perfil de Threads, en modo oscuro",
    link: "https://www.threads.net/",
    link_label_en: "Visit the live site",
    link_label_es: "Visitar el sitio en vivo",
  },
};

/**
 * The section that shows what a page is imitating.
 *
 * A caller may assume the same three trailing children always exist except
 * for the branch on `image`/`absent`: this is idempotent (same input, same
 * output, nothing read or written) and produces no network access — every
 * URL inside it is a hot link the RENDERER resolves later, never fetched
 * here. It carries no colour of its own (`chrome: "bare"`, `heading:
 * "plain"`), so a page's own palette is what a reader sees around it, and
 * `mode: "stack"` keeps the picture, the reason, and the link in reading
 * order regardless of how many of the three are present.
 *
 * @param reference - one entry from {@link REFERENCES}.
 * @returns a depth-0 named container (`kind: "container"`), ready to append
 *   to a page's `blocks`. Its `children` hold a `picture` when
 *   `reference.image` is set, a `text` explaining why when
 *   `reference.absent` is set instead, and always a trailing `link` to
 *   `reference.link`.
 */
export function inspirationSection(reference) {
  const children = [];
  if (reference.image) {
    children.push({
      kind: "picture",
      title_en: reference.title_en,
      title_es: reference.title_es,
      description_en: "",
      image_url: reference.image,
      // The captures are whole pages rather than crops, so cropping them to a
      // card would hide the arrangement that is the entire point.
      style: { image_fit: "contain" },
    });
  }
  if (reference.absent) {
    children.push({
      kind: "text",
      title_en: "No capture exists",
      title_es: "No existe una captura",
      description_en: reference.absent,
      description_es: reference.absent_es,
    });
  }
  children.push({
    kind: "link",
    title_en: reference.link_label_en,
    title_es: reference.link_label_es,
    description_en: "",
    link_url: reference.link,
  });
  return {
    kind: "container",
    mode: "stack",
    name_en: "The inspiration",
    name_es: "La inspiración",
    children,
    // Bare and plain, so the section reads as an appendix rather than as part
    // of the imitation above it.
    style: { chrome: "bare", heading: "plain" },
  };
}
