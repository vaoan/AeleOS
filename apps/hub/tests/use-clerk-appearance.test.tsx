import { afterEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { useClerkAppearance } from "@/features/session/presentation/use-clerk-appearance";
import {
  CLERK_PALETTE,
  clerkAppearanceFor,
} from "@/features/session/infrastructure/clerk-appearance";

// WHY THIS EXISTS NOW AND DID NOT BEFORE.
//
// This hook lived in a coverage-excluded directory, on a rule whose stated
// reason is entirely about JSX — "a coverage number on JSX measures rendering,
// not behaviour". It renders nothing. When that exclusion was narrowed to
// `.tsx` so `block-style.ts` would be measured, this was the one file the
// narrowing exposed, and it was genuinely untested rather than merely
// unmeasured.
//
// What it does is not decorative either: Clerk parses literal colours to derive
// its own scale and cannot read a `var()`, so its palette has to be
// re-selected in JavaScript when the theme changes. Without the subscription
// the account menu simply stays in whichever mode it first rendered in.

afterEach(() => {
  delete document.documentElement.dataset.theme;
});

describe("useClerkAppearance", () => {
  it("reads the theme currently on the document", () => {
    document.documentElement.dataset.theme = "dark";
    const { result } = renderHook(() => useClerkAppearance());
    expect(result.current).toEqual(clerkAppearanceFor("dark"));
  });

  // Anything that is not exactly `dark` is light — the same rule the pre-paint
  // theme script follows, so the card cannot disagree with the page about which
  // mode is in force.
  it.each([
    ["light", "light"],
    ["", "light"],
    ["nonsense", "light"],
  ])("treats data-theme %o as %s", (attribute, expected) => {
    document.documentElement.dataset.theme = attribute;
    const { result } = renderHook(() => useClerkAppearance());
    expect(result.current).toEqual(
      clerkAppearanceFor(expected as "light" | "dark"),
    );
  });

  it("falls back to light when the document names no theme at all", () => {
    const { result } = renderHook(() => useClerkAppearance());
    expect(result.current).toEqual(clerkAppearanceFor("light"));
  });

  // **The subscription is the whole point of the hook.** Reading the attribute
  // once would give a card that is correct on first paint and then stays in
  // that mode for ever, which is exactly the fault the `MutationObserver` was
  // added for. Asserting the value CHANGED after the attribute did is the only
  // form of this that can go red on a hook that forgot to subscribe.
  it("follows the document when the theme changes under it", async () => {
    document.documentElement.dataset.theme = "light";
    const { result } = renderHook(() => useClerkAppearance());
    expect(result.current).toEqual(clerkAppearanceFor("light"));

    await act(async () => {
      document.documentElement.dataset.theme = "dark";
      // A MutationObserver delivers on a microtask, so the change is not
      // visible until the queue drains — awaiting inside `act` is what lets
      // React re-render before the assertion below reads the result.
      await Promise.resolve();
    });

    expect(result.current).toEqual(clerkAppearanceFor("dark"));
    // And the two really are different objects, so the assertion above is not
    // satisfied by a palette that happens to be the same in both modes.
    expect(CLERK_PALETTE.dark).not.toEqual(CLERK_PALETTE.light);
  });

  // The server snapshot, which no client render ever calls. It matters because
  // `useSyncExternalStore` uses it for the HTML the browser first paints, and a
  // value disagreeing with the pre-paint theme script would hydrate a card in
  // one mode onto a page in the other.
  it("assumes light while rendering on the server", () => {
    /**
     * A component whose whole output is the appearance's primary colour.
     *
     * @returns that colour as text, so `renderToString` carries it.
     */
    function Probe() {
      return <>{useClerkAppearance().variables?.colorPrimary}</>;
    }
    expect(renderToString(<Probe />)).toBe(CLERK_PALETTE.light.colorPrimary);
  });
});
