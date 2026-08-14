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
 * **The default is the author's**, which is the whole point: somebody arriving
 * at a fursona page sees it as its owner built it, without having asked for
 * anything. Only a visitor who has explicitly opted out gets the defaults back.
 *
 * Anything stored that is not a known choice is treated as absent rather than
 * trusted — the value is user-writable and outlives deploys, so a stale one
 * must not leave a page with an attribute nothing matches.
 *
 * @param stored - the persisted choice, or null when there is none.
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
 * It duplicates {@link resolvePageTheme} rather than importing it, because it
 * must run before any bundle loads. Both halves are tested, this one by being
 * evaluated in the suite rather than merely pattern-matched.
 *
 * Wrapped in try/catch because storage access throws outright in some privacy
 * modes; an exception here would leave a themed page with no attribute and
 * therefore no theme.
 *
 * Security: a module constant with no interpolation. It is safe to inject with
 * `dangerouslySetInnerHTML` precisely because nothing user-supplied ever
 * reaches it — do not add a parameter to this string.
 */
export const PAGE_THEME_SCRIPT = `
try {
  var s = localStorage.getItem("${PAGE_THEME_STORAGE_KEY}");
  var v = s === "author" || s === "default" ? s : "author";
  document.documentElement.setAttribute("${PAGE_THEME_ATTRIBUTE}", v);
} catch (e) {
  document.documentElement.setAttribute("${PAGE_THEME_ATTRIBUTE}", "author");
}
`.trim();

/**
 * Applies and persists a visitor's choice.
 *
 * The attribute is set before the write, so the page changes even where storage
 * refuses — a visitor in a privacy mode still gets the switch they asked for,
 * they just do not get it remembered.
 *
 * @param choice - what the visitor picked.
 * @returns nothing.
 */
export function setPageTheme(choice: PageTheme): void {
  document.documentElement.setAttribute(PAGE_THEME_ATTRIBUTE, choice);
  try {
    localStorage.setItem(PAGE_THEME_STORAGE_KEY, choice);
  } catch {
    // Storage throws outright in some privacy modes. The attribute is already
    // set, so the only thing lost is remembering it for next time.
  }
  window.dispatchEvent(new Event(PAGE_THEME_CHANGE_EVENT));
}
