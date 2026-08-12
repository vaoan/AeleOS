import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  otherTheme,
  resolveTheme,
  setTheme,
  THEME_CHANGE_EVENT,
  THEME_SCRIPT,
  THEME_STORAGE_KEY,
} from "@/lib/theme";

describe("resolveTheme", () => {
  it("uses a stored choice over the system preference", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("falls back to the system preference when nothing is stored", () => {
    expect(resolveTheme(null, true)).toBe("dark");
    expect(resolveTheme(null, false)).toBe("light");
  });

  // Storage is user-writable and survives deploys, so a value that is no longer
  // valid must not produce `data-theme="garbage"` and an unstyled page.
  it("ignores a stored value that is not a theme", () => {
    expect(resolveTheme("neon", true)).toBe("dark");
    expect(resolveTheme("", false)).toBe("light");
  });
});

describe("THEME_SCRIPT", () => {
  it("sets the attribute before paint rather than after hydration", () => {
    expect(THEME_SCRIPT).toContain("documentElement");
    expect(THEME_SCRIPT).toContain("data-theme");
  });

  it("cannot throw, because a failure here leaves the page unstyled", () => {
    expect(THEME_SCRIPT).toContain("try");
    expect(THEME_SCRIPT).toContain("catch");
  });

  // The script is a string, so it cannot import the key — it can only repeat
  // it. This is the check that stops the two drifting apart and the stored
  // preference being silently ignored.
  it("reads the same storage key the app writes", () => {
    expect(THEME_SCRIPT).toContain(THEME_STORAGE_KEY);
  });

  // It is injected via dangerouslySetInnerHTML, so a `</script>` inside it
  // would close the tag early and dump the rest into the page as text.
  it("contains nothing that would break out of its own script tag", () => {
    expect(THEME_SCRIPT).not.toContain("</");
  });
});

describe("THEME_SCRIPT behaviour", () => {
  /**
   * Runs the script against a stubbed document and storage.
   *
   * The script is a string injected into the page, so nothing else in the test
   * suite executes it. Evaluating it here is the only way its logic is covered
   * at all rather than merely pattern-matched.
   *
   * @param stored - what `localStorage.getItem` should return.
   * @param prefersDark - what the dark-scheme media query should report.
   * @param throwOnRead - whether storage should throw, as privacy modes do.
   * @returns the value the script set on the document element.
   */
  const run = (
    stored: string | null,
    prefersDark: boolean,
    throwOnRead = false,
  ): string => {
    let applied = "";
    const documentElement = {
      /**
       * Captures the attribute the script sets.
       *
       * @param name - the attribute name.
       * @param value - the theme being applied.
       */
      setAttribute(name: string, value: string) {
        if (name === "data-theme") applied = value;
      },
    };
    const scope = {
      document: { documentElement },
      localStorage: {
        /**
         * Returns the stored preference, or throws as a privacy mode does.
         *
         * @returns the stored value, or null when nothing is stored.
         */
        getItem: () => {
          if (throwOnRead) throw new Error("storage disabled");
          return stored;
        },
      },
      window: {
        /**
         * Reports the system colour-scheme preference.
         *
         * @returns an object shaped like a MediaQueryList.
         */
        matchMedia: () => ({ matches: prefersDark }),
      },
    };
    new Function("document", "localStorage", "window", THEME_SCRIPT)(
      scope.document,
      scope.localStorage,
      scope.window,
    );
    return applied;
  };

  it("applies the stored theme", () => {
    expect(run("dark", false)).toBe("dark");
    expect(run("light", true)).toBe("light");
  });

  it("applies the system preference when nothing is stored", () => {
    expect(run(null, true)).toBe("dark");
    expect(run(null, false)).toBe("light");
  });

  it("applies a theme rather than a stored nonsense value", () => {
    expect(run("neon", true)).toBe("dark");
  });

  // Without the catch, the document keeps no theme at all and every token
  // falls back — a worse outcome than picking the wrong one.
  it("still applies a theme when storage throws", () => {
    expect(run(null, false, true)).toBe("light");
  });
});

describe("otherTheme", () => {
  it("returns the one a toggle should switch to", () => {
    expect(otherTheme("dark")).toBe("light");
    expect(otherTheme("light")).toBe("dark");
  });
});

describe("setTheme", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-theme");
    localStorage.clear();
  });

  it("applies the theme to the document", () => {
    setTheme("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("remembers the choice", () => {
    setTheme("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });

  // `storage` does not fire in the tab that wrote the value, so without this
  // the control would update storage and nothing on the page would notice.
  it("announces the change to this tab", () => {
    const heard = vi.fn();
    window.addEventListener(THEME_CHANGE_EVENT, heard);
    setTheme("dark");
    expect(heard).toHaveBeenCalledTimes(1);
    window.removeEventListener(THEME_CHANGE_EVENT, heard);
  });

  // Applying first and persisting second is what makes this survivable: a
  // privacy mode that refuses storage still gets the theme it asked for.
  it("still applies the theme when storage refuses", () => {
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("storage disabled");
      });
    expect(() => setTheme("dark")).not.toThrow();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    setItem.mockRestore();
  });
});
