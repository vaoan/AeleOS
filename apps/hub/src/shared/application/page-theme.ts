/** What a visitor may choose to see on a page its owner has themed. */
const PAGE_THEMES = ["author", "default"] as const;

/** A visitor's choice about somebody else's theme. */
export type PageTheme = (typeof PAGE_THEMES)[number];

/**
 * The attribute the choice lands on.
 *
 * Separate from `data-theme` rather than a third value of it, because the two
 * answer different questions and a visitor holds both answers at once: whether
 * to wear this author's colours, and — if not — which of the defaults to fall
 * back to. Folding them together would lose the second the moment somebody
 * turned the first on.
 */
export const PAGE_THEME_ATTRIBUTE = "data-page-theme";

/**
 * Where the choice is persisted.
 *
 * Exported because {@link PAGE_THEME_SCRIPT} is a string and can only repeat
 * this value rather than import it. A test asserts the two agree; without it
 * the script and the app could read and write different keys and the
 * preference would be silently ignored on every load.
 */
export const PAGE_THEME_STORAGE_KEY = "aeleos-page-theme";

/** Event dispatched so an open page reacts to its own change. */
export const PAGE_THEME_CHANGE_EVENT = "aeleos:page-theme-change";

/**
 * Decides whether to wear the author's theme.
 *
 * **Every page starts on the author's, and the choice is NOT remembered.**
 * That is the fix for a real fault, not a simplification: the choice used to
 * live in `localStorage` under one key for the whole site, so a visitor who
 * took one person's colours off never saw anybody else's again. Somebody had
 * silently opted out of every page on the platform by pressing a button on one
 * of them.
 *
 * Per-page storage was the other candidate and is worse: it needs a key naming
 * an actor, so leaving a theme once would follow somebody around that one page
 * for ever, and there would be no way to discover why a page looked different
 * from how its owner built it.
 *
 * So the switch lasts as long as the visit does. A stranger always arrives at a
 * page as its owner made it, and can always take it off for as long as they are
 * reading. `stored` is kept as a parameter because the pre-paint script still
 * calls this shape, and because a future per-visit store would slot straight
 * in.
 *
 * @param stored - a previously chosen value, if a caller has one.
 * @returns the choice to put on the document element.
 */
export function resolvePageTheme(stored: string | null): PageTheme {
  return stored && (PAGE_THEMES as readonly string[]).includes(stored)
    ? (stored as PageTheme)
    : "author";
}

/**
 * The script that sets the attribute before first paint.
 *
 * Injected synchronously into `<head>` for the same reason the theme script is:
 * doing it after hydration shows every visitor a frame of the wrong palette,
 * and on a themed page that frame is the whole design changing under them.
 *
 * **It reads nothing.** Every page starts on the author's theme, so there is
 * no stored value to consult — which also removes the try/catch this needed
 * when it touched storage that throws in some privacy modes. It used to read
 * one key for the whole site, and a visitor who took one person's colours off
 * never saw anybody else's again.
 *
 * Security: a module constant with no interpolation. It is safe to inject with
 * `dangerouslySetInnerHTML` precisely because nothing user-supplied ever
 * reaches it — do not add a parameter to this string.
 */
export const PAGE_THEME_SCRIPT = `
document.documentElement.setAttribute("${PAGE_THEME_ATTRIBUTE}", "author");
`.trim();

/**
 * Applies a visitor's choice, for as long as they are on the page.
 *
 * **Nothing is written down.** Persisting this is what made one press on one
 * person's page take the theme off everybody's, so the choice now lasts the
 * visit — a stranger always arrives at a page as its owner built it.
 *
 * @param choice - what the visitor picked.
 * @returns nothing.
 */
export function setPageTheme(choice: PageTheme): void {
  document.documentElement.setAttribute(PAGE_THEME_ATTRIBUTE, choice);
  window.dispatchEvent(new Event(PAGE_THEME_CHANGE_EVENT));
}
