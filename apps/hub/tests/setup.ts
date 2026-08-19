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
