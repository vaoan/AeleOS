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

  it("names the attribute the app reads", () => {
    expect(PAGE_THEME_SCRIPT).toContain(PAGE_THEME_ATTRIBUTE);
  });

  // **THE REGRESSION TEST for one press taking the theme off every page.** The
  // choice used to live in `localStorage` under a single key for the whole
  // site, so a visitor who took one person's colours off never saw anybody
  // else's again — they had silently opted out of every page on the platform
  // by pressing a button on one of them.
  //
  // Every page starts on the author's theme now, whatever storage holds.
  it.each(["default", "author", "chartreuse"])(
    "starts on the author's theme even with %s stored",
    (stored) => {
      localStorage.setItem(PAGE_THEME_STORAGE_KEY, stored);
      run();
      expect(document.documentElement.getAttribute(PAGE_THEME_ATTRIBUTE)).toBe(
        "author",
      );
    },
  );

  // It reads nothing at all now, which is also what removed the try/catch this
  // needed when it touched storage that throws in some privacy modes.
  it("touches no storage", () => {
    const read = vi.spyOn(Storage.prototype, "getItem");
    run();
    expect(read).not.toHaveBeenCalled();
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
  // **Applied, and deliberately not remembered.** Persisting it is what made
  // one press on one person's page take the theme off everybody's, so the
  // choice lasts the visit and a stranger always arrives at a page as its
  // owner built it.
  it("applies the choice without writing it down", () => {
    const wrote = vi.spyOn(Storage.prototype, "setItem");
    setPageTheme("default");
    expect(document.documentElement.getAttribute(PAGE_THEME_ATTRIBUTE)).toBe(
      "default",
    );
    expect(wrote).not.toHaveBeenCalled();
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
