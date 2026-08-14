import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PAGE_THEME_ATTRIBUTE,
  PAGE_THEME_CHANGE_EVENT,
  PAGE_THEME_SCRIPT,
  PAGE_THEME_STORAGE_KEY,
  resolvePageTheme,
  setPageTheme,
} from "@/shared/application/page-theme";

afterEach(() => {
  document.documentElement.removeAttribute(PAGE_THEME_ATTRIBUTE);
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("resolvePageTheme", () => {
  // The whole point: somebody arriving at a fursona page sees it as its owner
  // built it, without having asked for anything.
  it("wears the author's theme when nobody has chosen", () => {
    expect(resolvePageTheme(null)).toBe("author");
  });

  it.each(["author", "default"])("honours the stored choice %s", (stored) => {
    expect(resolvePageTheme(stored)).toBe(stored);
  });

  // The value is user-writable and outlives deploys, so a stale one must not
  // leave the page with an attribute nothing matches.
  it.each(["", "dark", "AUTHOR", "null", "off"])(
    "treats the unknown value %o as absent",
    (stored) => {
      expect(resolvePageTheme(stored)).toBe("author");
    },
  );
});

describe("PAGE_THEME_SCRIPT", () => {
  /**
   * Runs the script the way the browser does.
   *
   * Evaluated rather than pattern-matched: a test that only asserted the string
   * contains the right key would pass for a script that throws on line one.
   *
   * @returns nothing.
   */
  const run = () => {
    new Function(PAGE_THEME_SCRIPT)();
  };

  // The script is a string and can only repeat the key rather than import it.
  // Without this the two could read and write different keys and the choice
  // would be silently ignored on every load.
  it("reads the key the app writes", () => {
    expect(PAGE_THEME_SCRIPT).toContain(PAGE_THEME_STORAGE_KEY);
    expect(PAGE_THEME_SCRIPT).toContain(PAGE_THEME_ATTRIBUTE);
  });

  it("defaults to the author's theme", () => {
    run();
    expect(document.documentElement.getAttribute(PAGE_THEME_ATTRIBUTE)).toBe(
      "author",
    );
  });

  it.each(["author", "default"])("applies the stored choice %s", (stored) => {
    localStorage.setItem(PAGE_THEME_STORAGE_KEY, stored);
    run();
    expect(document.documentElement.getAttribute(PAGE_THEME_ATTRIBUTE)).toBe(
      stored,
    );
  });

  it("ignores a stored value it does not know", () => {
    localStorage.setItem(PAGE_THEME_STORAGE_KEY, "chartreuse");
    run();
    expect(document.documentElement.getAttribute(PAGE_THEME_ATTRIBUTE)).toBe(
      "author",
    );
  });

  // Storage throws outright in some privacy modes, and an exception here would
  // leave a themed page with no attribute and therefore no theme.
  it("still sets the attribute when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    run();
    expect(document.documentElement.getAttribute(PAGE_THEME_ATTRIBUTE)).toBe(
      "author",
    );
  });

  // Nothing user-supplied may ever reach a script injected with
  // dangerouslySetInnerHTML. This is what keeps that true.
  it("interpolates nothing", () => {
    expect(PAGE_THEME_SCRIPT).not.toContain("${");
  });
});

describe("setPageTheme", () => {
  it("applies and remembers the choice", () => {
    setPageTheme("default");
    expect(document.documentElement.getAttribute(PAGE_THEME_ATTRIBUTE)).toBe(
      "default",
    );
    expect(localStorage.getItem(PAGE_THEME_STORAGE_KEY)).toBe("default");
  });

  it("tells an open page about it", () => {
    const heard = vi.fn();
    window.addEventListener(PAGE_THEME_CHANGE_EVENT, heard);
    setPageTheme("author");
    window.removeEventListener(PAGE_THEME_CHANGE_EVENT, heard);
    expect(heard).toHaveBeenCalled();
  });

  // The attribute is set BEFORE the write, so a visitor in a privacy mode still
  // gets the switch they asked for — they just do not get it remembered.
  it("still switches the page when storage refuses", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(() => setPageTheme("default")).not.toThrow();
    expect(document.documentElement.getAttribute(PAGE_THEME_ATTRIBUTE)).toBe(
      "default",
    );
  });
});
