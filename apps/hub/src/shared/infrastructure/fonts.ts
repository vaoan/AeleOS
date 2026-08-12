import { DM_Sans, JetBrains_Mono, Space_Grotesk } from "next/font/google";

/**
 * The display face, used for the wordmark and headings.
 *
 * Self-hosted by `next/font` at build time: the font files are served from our
 * own origin, so there is no runtime request to Google. That keeps the $0
 * constraint and removes a third-party dependency from every page load.
 *
 * Exposes `--font-display` rather than a class, because the variable is set
 * once on `<html>` and read by Tailwind's `font-display` utility.
 */
export const display = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-display",
  display: "swap",
});

/**
 * The body face, deliberately shared with Libra.
 *
 * The platform's apps share a skeleton and differ in their skin: DM Sans is the
 * skeleton, while the display and mono faces are AeleOS's own. Changing this
 * one is a platform decision, not an AeleOS decision.
 */
export const sans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
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
 */
export const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});
