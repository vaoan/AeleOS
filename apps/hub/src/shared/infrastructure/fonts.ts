import localFont from "next/font/local";

/**
 * The display face, used for the wordmark and headings.
 *
 * Vendored, not fetched. `next/font/google` self-hosts what it *ships*, but it
 * downloads the woff2 files from `fonts.gstatic.com` while compiling — so a 404
 * or a rate-limit there failed the build, not just a page load. That happened:
 * Google answered 404 for three Space Grotesk files, `layout.tsx` never
 * compiled, and the `e2e` job timed out waiting 120s for a dev server that was
 * never coming. `e2e` is a required check, so an outage at Google blocked every
 * merge in the repository, including documentation-only ones. The files now
 * live in `./fonts/`, and the build reaches the network for nothing.
 *
 * The files are the exact latin-subset weights this file asked for before, so
 * the rendering is unchanged — see `scripts/fetch-fonts.mjs`, which is how they
 * were obtained and how to refresh them.
 *
 * Exposes `--font-display` rather than a class, because the variable is set
 * once on `<html>` and read by Tailwind's `font-display` utility.
 */
export const display = localFont({
  src: [
    { path: "./fonts/space-grotesk-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/space-grotesk-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-display",
  display: "swap",
});

/**
 * The body face, deliberately shared with Libra.
 *
 * The platform's apps share a skeleton and differ in their skin: DM Sans is the
 * skeleton, while the display and mono faces are AeleOS's own. Changing this
 * one is a platform decision, not an AeleOS decision — and that now includes
 * the weights, which stopped being a parameter and became three files. Adding
 * a weight here means vendoring it (`scripts/fetch-fonts.mjs`), not editing an
 * array; `tests/fonts.test.ts` fails on a `src` entry with no file behind it.
 */
export const sans = localFont({
  src: [
    { path: "./fonts/dm-sans-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/dm-sans-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/dm-sans-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-sans",
  display: "swap",
});

/**
 * The monospace face, used for every platform ID and handle.
 *
 * Chosen on the platform ID rather than the wordmark. Every face looks fine at
 * 26px; `45242b95-3aed-5bf1-8f67-fd8c8b8c17e6` gets read aloud, pasted into
 * tickets and compared across apps, so disambiguating `0`/`O` and `1`/`l`
 * matters more here than character does.
 *
 * `fallback` is spelled out for this one alone. The other two degrade to a
 * proportional system face, which is what they want; a handle rendered
 * proportionally while the face loads is the one place the substitution is
 * visible as wrong.
 */
export const mono = localFont({
  src: [
    {
      path: "./fonts/jetbrains-mono-400.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/jetbrains-mono-500.woff2",
      weight: "500",
      style: "normal",
    },
  ],
  variable: "--font-mono",
  display: "swap",
  fallback: ["ui-monospace", "monospace"],
});
