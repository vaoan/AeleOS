/** The themes this app has. Anything else stored is treated as absent. */
const THEMES = ["light", "dark"] as const;

/** A theme this app can render. */
export type Theme = (typeof THEMES)[number];

/**
 * Where the chosen theme is persisted.
 *
 * Exported because {@link THEME_SCRIPT} is a string and can only repeat this
 * value rather than import it. A test asserts the two agree; without that, the
 * script and the app could read and write different keys and the preference
 * would be silently ignored on every load.
 */
export const THEME_STORAGE_KEY = "aeleos-theme";

/**
 * Decides which theme to render.
 *
 * A stored choice wins over the system preference, because it is the more
 * specific signal. Anything stored that is not a known theme is treated as
 * absent rather than trusted — the value is user-writable and outlives
 * deploys, so a stale one must not leave the page with an unknown theme and
 * every token unresolved.
 *
 * @param stored - the persisted choice, or null when there is none.
 * @param prefersDark - whether the system asks for dark.
 * @returns the theme to put on the document element.
 */
export function resolveTheme(
  stored: string | null,
  prefersDark: boolean,
): Theme {
  if (stored && (THEMES as readonly string[]).includes(stored)) {
    return stored as Theme;
  }
  return prefersDark ? "dark" : "light";
}

/**
 * The script that sets `data-theme` before first paint.
 *
 * Injected synchronously into `<head>`. Doing this after hydration shows a
 * light-themed frame to every dark-mode visitor on every load, which is worse
 * than having no light theme at all.
 *
 * It duplicates {@link resolveTheme}'s logic rather than importing it, because
 * it must run before any bundle loads. The duplication is deliberate and both
 * halves are tested — including this one, which is evaluated in the suite
 * rather than merely pattern-matched.
 *
 * Wrapped in try/catch because storage access throws outright in some privacy
 * modes; an exception here would leave the document with no theme at all.
 *
 * Security: this is a module constant with no interpolation. It is safe to
 * inject with `dangerouslySetInnerHTML` precisely because nothing user-supplied
 * ever reaches it — do not add a parameter to this string.
 */
export const THEME_SCRIPT = `
try {
  var s = localStorage.getItem("${THEME_STORAGE_KEY}");
  var d = window.matchMedia("(prefers-color-scheme: dark)").matches;
  var t = s === "light" || s === "dark" ? s : (d ? "dark" : "light");
  document.documentElement.setAttribute("data-theme", t);
} catch (e) {
  document.documentElement.setAttribute("data-theme", "light");
}
`.trim();

/**
 * Event dispatched when the theme changes in this tab.
 *
 * The `storage` event deliberately does not fire in the tab that wrote the
 * value, so without this a control would update storage and nothing on the
 * page would notice until the next reload.
 */
export const THEME_CHANGE_EVENT = "aeleos:theme-change";

/**
 * Applies a theme and remembers it.
 *
 * Writes the attribute first and persists second: the attribute is what the
 * page renders from, so a storage failure in a privacy mode must still leave
 * the visitor with the theme they asked for, just not a lasting one.
 *
 * Unchanged in behaviour; it reaches the global through `globalThis` rather than `window`, which is the same object and one that also exists where `window` does not.
 *
 * @param theme - the theme to apply.
 * @returns nothing.
 */
export function setTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage is unavailable in some privacy modes. The choice still applies to
    // this page view; it simply will not survive a reload.
  }
  globalThis.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

/**
 * The opposite theme.
 *
 * @param theme - the current theme.
 * @returns the one a toggle should switch to.
 */
export function otherTheme(theme: Theme): Theme {
  return theme === "dark" ? "light" : "dark";
}
