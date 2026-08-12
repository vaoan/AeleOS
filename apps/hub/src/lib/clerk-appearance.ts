/**
 * How Clerk's components are themed to match the rest of the app.
 *
 * Colours are **literal OKLCH values, not `var(--token)`**, and that is not an
 * oversight. Clerk parses these strings to derive its own scale — hover states,
 * focus rings, translucent overlays — and a `var()` reference is not something
 * it can parse. Passing one leaves `--clerk-color-primary` empty, which
 * produced a sign-in card with an invisible "Continue" button and a black
 * footer strip on a light page. Measured in a browser, not guessed.
 *
 * The cost is that these values duplicate `globals.css`. That duplication is
 * held honest by `tests/clerk-appearance.test.ts`, which parses the stylesheet
 * and fails if a token moves without this file moving with it.
 *
 * `elements` classes are a different mechanism and *do* resolve custom
 * properties, because they are ordinary CSS applied to Clerk's DOM. Anything
 * that can be expressed as a class belongs there rather than here.
 *
 * Those classes carry Tailwind's `!` modifier deliberately. Clerk styles its
 * own elements with emotion, which outranks a plain utility class: without the
 * modifier the class is present in `class` and simply loses, which is how a
 * `hidden` header stayed visible at `display: flex`. Do not remove them to
 * tidy the file up — measure first.
 */

/** The palette Clerk derives its scale from, per theme. */
const PALETTE = {
  light: {
    colorPrimary: "oklch(0.46 0.15 25)",
    colorForeground: "oklch(0.27 0.045 35)",
    colorMutedForeground: "oklch(0.5 0.045 30)",
    colorBackground: "oklch(0.99 0.01 40)",
    colorInputForeground: "oklch(0.27 0.045 35)",
    colorBorder: "oklch(0.66 0.075 35)",
  },
  dark: {
    colorPrimary: "oklch(0.74 0.18 350)",
    colorForeground: "oklch(0.96 0.012 340)",
    colorMutedForeground: "oklch(0.66 0.03 330)",
    colorBackground: "oklch(0.16 0.04 305)",
    colorInputForeground: "oklch(0.96 0.012 340)",
    colorBorder: "oklch(0.52 0.09 325)",
  },
} as const;

/** A theme Clerk can be dressed for. */
export type ClerkTheme = keyof typeof PALETTE;

/**
 * Clerk's own chrome, removed so its component sits inside our card.
 *
 * The header is hidden because the page already has a heading; showing both
 * gives the card two titles. Backgrounds are transparent because our `Card`
 * paints the surface — a second one behind it double-tints the translucency
 * and the nebula stops showing through.
 */
const ELEMENTS = {
  rootBox: "w-full",
  cardBox: "w-full border-none! bg-transparent! shadow-none!",
  card: "w-full border-none! bg-transparent! p-0! shadow-none!",
  header: "hidden!",
  footer: "bg-transparent! [&>*]:bg-transparent!",
  footerAction: "bg-transparent!",
  formButtonPrimary:
    "bg-[var(--accent)]! text-[var(--on-accent)]! shadow-none hover:opacity-90",
  socialButtonsIconButton: "border-[var(--edge)]! bg-transparent!",
  formFieldInput: "bg-transparent! border-[var(--edge)]!",
  dividerLine: "bg-[var(--edge)]!",
} as const;

/**
 * The appearance for a given theme.
 *
 * @param theme - the theme currently on the document.
 * @returns an appearance object for Clerk's `appearance` prop.
 */
export function clerkAppearanceFor(theme: ClerkTheme) {
  return { variables: PALETTE[theme], elements: ELEMENTS };
}

/** Every palette, exported so the stylesheet-parity test can check them all. */
export const CLERK_PALETTE = PALETTE;
