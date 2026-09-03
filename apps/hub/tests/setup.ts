import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Testing Library only registers its own cleanup when Vitest runs with
// `globals: true`, which this project does not. Without this, each render
// leaves its DOM behind and the *second* component test in a file starts
// finding duplicate elements from the first.
afterEach(cleanup);

// jsdom implements no `ResizeObserver` at all, and `EmbedFrame` constructs one
// to notice a width change — so without this, rendering any Mastodon post
// throws `ResizeObserver is not defined` and every test that merely draws a
// page dies on a mechanism it was not testing.
//
// **It observes nothing on purpose.** jsdom lays nothing out, so a faithful
// implementation would have no width to report and would only ever fire with
// zero — which is a measurement no browser produces. What a resize actually
// does is proved in `tests/e2e/`, against a layout engine; this stub exists so
// the code under test can be CONSTRUCTED, and any test that wants a resize
// drives the callback itself.
class NoResizeObserver implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= NoResizeObserver;

// jsdom implements neither `HTMLMediaElement.prototype.play` nor `.pause` —
// both throw "Not implemented" — and `useJukebox` now DRIVES the element rather
// than describing it, because `autoplay` is a load-time attribute and flipping
// it off never stopped anything. So any test that merely renders a player would
// die on a mechanism it was not testing.
//
// **These are supplied because every real browser has them, which is a
// different thing from supplying behaviour the product does not.** They record
// nothing and assert nothing; a test that cares whether the element was played
// or paused replaces them with its own spies, as `use-jukebox.test.ts` does.
// What playback really does is proved in `tests/e2e/`, against a browser.
HTMLMediaElement.prototype.play = function play() {
  return Promise.resolve();
};
HTMLMediaElement.prototype.pause = function pause() {};

// jsdom implements no `window.matchMedia` at all — calling it throws
// "matchMedia is not a function" — so any test that merely renders a
// component asking a breakpoint (`CanvasInspector`'s desktop-vs-phone
// entrance direction, among others) dies on a mechanism it was not testing.
//
// **It always answers "no match", on purpose.** jsdom lays nothing out and
// has no real viewport, so a faithful implementation has no width to compare
// a query against and could only ever answer one way regardless — which
// would be a measurement no browser produces. This stub exists so the code
// under test can be CONSTRUCTED at the narrowest, safest default; what a real
// breakpoint does is proved in `tests/e2e/`, against a real viewport, and any
// unit test that cares about the "matches" branch supplies its own mock.
globalThis.matchMedia ??= function matchMedia(query: string): MediaQueryList {
  return {
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  } as MediaQueryList;
};
