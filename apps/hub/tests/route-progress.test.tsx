import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

let pathname = "/me";

// Only the locale-aware pathname. `useSearchParams` is deliberately not used by
// the component — reading it in a layout opts the whole tree out of static
// rendering, which this app goes out of its way to keep.
vi.mock("@/shared/infrastructure/i18n/navigation", () => ({
  usePathname: () => pathname,
}));

const { RouteProgress } = await import("@/shared/presentation/route-progress");

/** Longer than the show delay, shorter than the give-up timeout. */
const PAST_DELAY = 400;

/**
 * Renders the bar at a known path.
 *
 * @param at - the locale-stripped pathname to start from.
 * @returns the rerender helper, for simulating a completed navigation.
 */
function renderAt(at: string) {
  pathname = at;
  return render(<RouteProgress label="Loading" />);
}

/**
 * Clicks an anchor appended to the document, as a real navigation would.
 *
 * @param attrs - attributes for the anchor.
 * @param init - extra mouse event properties, for modifier keys.
 */
function clickLink(
  attrs: Record<string, string>,
  init: MouseEventInit = {},
): void {
  const a = document.createElement("a");
  for (const [k, v] of Object.entries(attrs)) a.setAttribute(k, v);
  a.textContent = "go";
  document.body.appendChild(a);
  act(() => {
    a.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, ...init }),
    );
  });
}

/** Advances past the show delay inside act, so React flushes the state. */
function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

/** The bar, or null when it is not on the page. */
const bar = () => screen.queryByRole("progressbar");

beforeEach(() => {
  vi.useFakeTimers();
  pathname = "/me";
});

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

// Tailwind v4 resolves `animate-[route-progress_...]` against a real
// `@keyframes`, and a missing one fails SILENTLY: the bar renders, holds still,
// and reads as a thin accent line somebody left behind. Nothing else in the
// suite would notice, because the element is present either way.
describe("the keyframe the bar animates against", () => {
  it("exists in globals.css, under the name the component asks for", () => {
    const css = readFileSync(
      resolve(process.cwd(), "src/app/globals.css"),
      "utf8",
    );
    expect(css).toMatch(/@keyframes\s+route-progress\s*\{/);
  });
});

describe("RouteProgress", () => {
  it("shows nothing before anybody clicks", () => {
    renderAt("/me");
    expect(bar()).toBeNull();
  });

  // The delay is the whole point: a prefetched navigation completes in a frame
  // or two, and a bar that flashes for that long reads as a glitch rather than
  // as feedback.
  it("stays hidden while a navigation is still within the delay", () => {
    renderAt("/me");
    clickLink({ href: "/pages" });
    advance(50);
    expect(bar()).toBeNull();
  });

  it("appears once a navigation outlasts the delay", () => {
    renderAt("/me");
    clickLink({ href: "/pages" });
    advance(PAST_DELAY);
    expect(bar()).not.toBeNull();
  });

  // The case that looks like it should be excluded and must not be. Next's
  // `<Link>` prevents the default on every internal navigation so it can route
  // on the client, so filtering on `defaultPrevented` would suppress the bar
  // for exactly the navigations it exists for. An earlier draft did that, and
  // this test is what is left of finding out.
  it("still shows when the click's default was prevented, as Next's Link does", () => {
    renderAt("/me");
    const a = document.createElement("a");
    a.setAttribute("href", "/pages");
    a.addEventListener("click", (e) => e.preventDefault());
    document.body.appendChild(a);
    act(() => {
      a.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });
    advance(PAST_DELAY);
    expect(bar()).not.toBeNull();
  });

  it("names itself for a screen reader", () => {
    renderAt("/me");
    clickLink({ href: "/pages" });
    advance(PAST_DELAY);
    expect(bar()).toHaveAttribute("aria-label", "Loading");
  });

  it("clears when the new page arrives", () => {
    const { rerender } = renderAt("/me");
    clickLink({ href: "/pages" });
    advance(PAST_DELAY);
    expect(bar()).not.toBeNull();

    pathname = "/pages";
    act(() => {
      rerender(<RouteProgress label="Loading" />);
    });
    expect(bar()).toBeNull();
  });

  // Without this a validation error that returns field errors instead of
  // redirecting would leave the bar pinned to the top of the page forever,
  // which is worse than never showing one.
  it("gives up rather than sticking forever", () => {
    renderAt("/me");
    clickLink({ href: "/pages" });
    advance(PAST_DELAY);
    expect(bar()).not.toBeNull();

    advance(30_000);
    expect(bar()).toBeNull();
  });

  it("starts on a form submission, since those navigate too", () => {
    renderAt("/pages/new");
    const form = document.createElement("form");
    document.body.appendChild(form);
    act(() => {
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    advance(PAST_DELAY);
    expect(bar()).not.toBeNull();
  });

  describe("clicks that do not navigate this tab", () => {
    it("ignores a modified click, which opens a new tab", () => {
      renderAt("/me");
      clickLink({ href: "/pages" }, { metaKey: true });
      advance(PAST_DELAY);
      expect(bar()).toBeNull();
    });

    it("ignores a middle click", () => {
      renderAt("/me");
      clickLink({ href: "/pages" }, { button: 1 });
      advance(PAST_DELAY);
      expect(bar()).toBeNull();
    });

    it("ignores a link to another origin", () => {
      renderAt("/me");
      clickLink({ href: "https://clerk.com/docs" });
      advance(PAST_DELAY);
      expect(bar()).toBeNull();
    });

    it("ignores a link that opens in a new tab", () => {
      renderAt("/me");
      clickLink({ href: "/pages", target: "_blank" });
      advance(PAST_DELAY);
      expect(bar()).toBeNull();
    });

    it("ignores a hash link to the same page", () => {
      renderAt("/me");
      clickLink({ href: "#main" });
      advance(PAST_DELAY);
      expect(bar()).toBeNull();
    });

    it("ignores a download link", () => {
      renderAt("/me");
      clickLink({ href: "/export.csv", download: "" });
      advance(PAST_DELAY);
      expect(bar()).toBeNull();
    });

    it("ignores a click that is not on a link at all", () => {
      renderAt("/me");
      const button = document.createElement("button");
      document.body.appendChild(button);
      act(() => {
        button.dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true }),
        );
      });
      advance(PAST_DELAY);
      expect(bar()).toBeNull();
    });
  });
});
