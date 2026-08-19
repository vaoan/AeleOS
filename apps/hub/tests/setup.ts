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
