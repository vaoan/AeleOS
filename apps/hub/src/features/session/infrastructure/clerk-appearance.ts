/**
 * How Clerk's remaining components are themed to match the rest of the app.
 *
 * Sign-in no longer uses any of this: that page is our own markup calling
 * Clerk's headless `signIn.sso()`. What is left is the account menu and the
 * profile it opens, which are still Clerk's components — and which contain
 * social connections and form fields of their own, so those keys are live.
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
    colorPrimary: "oklch(46% 0.15 25deg)",
    colorForeground: "oklch(27% 0.045 35deg)",
    colorMutedForeground: "oklch(50% 0.045 30deg)",
    colorBackground: "oklch(99% 0.01 40deg)",
    colorInputForeground: "oklch(27% 0.045 35deg)",
    colorBorder: "oklch(66% 0.075 35deg)",
  },
  dark: {
    colorPrimary: "oklch(74% 0.18 350deg)",
    colorForeground: "oklch(96% 0.012 340deg)",
    colorMutedForeground: "oklch(66% 0.03 330deg)",
    colorBackground: "oklch(16% 0.04 305deg)",
    colorInputForeground: "oklch(96% 0.012 340deg)",
    colorBorder: "oklch(52% 0.09 325deg)",
  },
} as const;

/** A theme Clerk can be dressed for. */
export type ClerkTheme = keyof typeof PALETTE;

/**
 * Everything that is not a colour, and so is the same in both themes.
 *
 * These were lost once already: rewriting the palette to fix the var() problem
 * dropped them, and Clerk quietly fell back to its own 6px radius inside a
 * 16px card. Nothing failed — it just looked slightly wrong in a way that is
 * hard to name when you are looking at it.
 */
const SHAPE = {
  fontFamily: "var(--font-sans)",
  // 0.5rem, matching `rounded-lg` on our own buttons. The card is deliberately
  // rounder at 1rem; controls inside a card should not match the card.
  borderRadius: "0.5rem",
} as const;

/**
 * Clerk's own chrome, removed so its component sits inside our card.
 *
 * The header is hidden because the page already has a heading; showing both
 * gives the card two titles. Backgrounds are transparent because our `Card`
 * paints the surface — a second one behind it double-tints the translucency
 * and the nebula stops showing through.
 */
const ELEMENTS = {
  // `max-w-none` is the one that matters. Clerk's card is 400px wide by
  // default, so inside a 620px column it sat left-aligned with a ragged
  // 122px gap down the right — the heading reached the card edge and the form
  // stopped well short of it.
  rootBox: "w-full!",
  cardBox: "w-full! max-w-none! border-none! bg-transparent! shadow-none!",
  card: "w-full! max-w-none! border-none! bg-transparent! p-0! shadow-none!",
  header: "hidden!",
  footer: "bg-transparent! [&>*]:bg-transparent!",
  footerAction: "bg-transparent!",
  formButtonPrimary:
    "h-11! bg-[var(--accent)]! text-[var(--on-accent)]! shadow-none hover:opacity-90",
  // A border and a hover fill, so these read as buttons. Stripped to
  // fully transparent they were three floating logos with stray border
  // fragments between them.
  socialButtonsIconButton:
    "h-11! border! border-[var(--edge)]! bg-[var(--bar)]! hover:bg-[var(--edge)]/20!",
  socialButtonsBlockButton:
    "h-11! border! border-[var(--edge)]! bg-[var(--bar)]! text-[var(--ink)]! hover:bg-[var(--edge)]/20!",
  socialButtonsBlockButtonText: "text-[var(--ink)]! font-medium!",
  formFieldInput:
    "h-11! min-h-11! bg-[var(--bar)]! border-[var(--edge)]! px-3!",
  dividerLine: "bg-[var(--edge)]!",
  dividerText: "text-[var(--muted)]!",
  formFieldLabel: "text-[var(--ink)]!",
  footerActionText: "text-[var(--muted)]!",
  footerActionLink: "text-[var(--accent)]!",
} as const;

/**
 * The appearance for a given theme.
 *
 * Applies to the account menu and profile, not to sign-in: that page is our own
 * markup now. `layout` is deliberately absent — this Clerk version has no such
 * key on `Appearance`, and setting it was silently ignored on both the
 * component and the provider before that was discovered.
 *
 * @param theme - the theme currently on the document.
 * @returns an appearance object for Clerk's `appearance` prop.
 */
export function clerkAppearanceFor(theme: ClerkTheme) {
  return { variables: { ...PALETTE[theme], ...SHAPE }, elements: ELEMENTS };
}

/** Every palette, exported so the stylesheet-parity test can check them all. */
export const CLERK_PALETTE = PALETTE;
