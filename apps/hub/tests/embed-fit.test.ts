import { describe, expect, it } from "vitest";
import { EMBED_FIT, HEIGHT_REQUEST } from "@/shared/domain/embed-fit";
import { EMBED_PROVIDERS } from "@/shared/domain/embed-providers";
import type { EmbedProviderId } from "@/shared/domain/embed-providers";

/**
 * One provider's parser, by id.
 *
 * @param id - whose parser is wanted.
 * @returns the parser.
 */
function parser(id: EmbedProviderId) {
  const fit = EMBED_FIT.get(id);
  if (!fit) throw new Error(`no fit for ${id}`);
  return fit.height;
}

// EVERY PAYLOAD BELOW WAS RECORDED FROM A REAL FRAME on 2026-08-19, origin and
// all — none of these shapes is documented by its provider, so a test written
// from a recollection of them would pin the recollection. The exact strings
// are in `.superpowers/sdd/embeds-that-fit/measurements.md`.
describe("twitter's height message", () => {
  const twitter = parser("twitter");

  it("reads the height out of a resize message", () => {
    expect(
      twitter({
        "twttr.embed": {
          jsonrpc: "2.0",
          method: "twttr.private.resize",
          id: "embed-0",
          params: [{ width: 420, height: 589, data: { tweet_id: "20" } }],
        },
      }),
    ).toBe(589);
  });

  // Twitter sends four `twttr.embed` messages and only one carries a size.
  it("refuses a twttr.embed message that is not a resize", () => {
    expect(
      twitter({
        "twttr.embed": { method: "twttr.private.rendered", params: [] },
      }),
    ).toBeNull();
  });

  it.each([
    ["no envelope", { height: 589 }],
    ["an envelope that is not an object", { "twttr.embed": "resize" }],
    [
      "params that are not an array",
      { "twttr.embed": { method: "twttr.private.resize", params: {} } },
    ],
    [
      "a first param that is not an object",
      { "twttr.embed": { method: "twttr.private.resize", params: [589] } },
    ],
    [
      "no height in the first param",
      { "twttr.embed": { method: "twttr.private.resize", params: [{}] } },
    ],
    ["a string", '{"height":589}'],
    ["nothing", null],
    ["an array", [589]],
  ])("refuses %s", (_case, payload) => {
    expect(twitter(payload)).toBeNull();
  });
});

describe("instagram's height message", () => {
  const instagram = parser("instagram");

  // A JSON STRING, not an object — the thing a listener written from the
  // Twitter shape alone would silently ignore.
  it("parses the JSON string it sends", () => {
    expect(instagram('{"details":{"height":444},"type":"MEASURE"}')).toBe(444);
  });

  it.each([
    ["its LOADING sibling", '{"type":"LOADING"}'],
    ["its MOUNTED sibling", '{"type":"MOUNTED","details":{"styles":{}}}'],
    ["a measure with no details", '{"type":"MEASURE"}'],
    [
      "a measure whose details are not an object",
      '{"type":"MEASURE","details":7}',
    ],
    ["text that is not JSON at all", "MEASURE 444"],
    ["JSON that is not an object", "444"],
    ["an object rather than a string", { type: "MEASURE" }],
  ])("refuses %s", (_case, payload) => {
    expect(instagram(payload)).toBeNull();
  });
});

describe("telegram's height message", () => {
  const telegram = parser("telegram");

  it("parses the JSON string it sends", () => {
    expect(telegram('{"event":"resize","height":781}')).toBe(781);
  });

  it.each([
    ["its ready sibling", '{"event":"ready"}'],
    ["a resize with no height", '{"event":"resize"}'],
    ["a resize whose height is text", '{"event":"resize","height":"781"}'],
  ])("refuses %s", (_case, payload) => {
    expect(telegram(payload)).toBeNull();
  });
});

describe("mastodon's answer", () => {
  const mastodon = parser("mastodon-social");

  it("reads the height it answers with", () => {
    expect(mastodon({ type: "setHeight", id: "aeleos", height: 754 })).toBe(
      754,
    );
  });

  // The echoed id is whatever we sent, so it identifies nothing a forged
  // message could not also carry — the origin and the source do that.
  it("accepts an answer echoing an id it was not sent", () => {
    expect(mastodon({ type: "setHeight", id: 9999, height: 337 })).toBe(337);
  });

  it.each([
    ["a message of another type", { type: "ready", height: 754 }],
    ["an answer with no height", { type: "setHeight" }],
    ["nothing", undefined],
  ])("refuses %s", (_case, payload) => {
    expect(mastodon(payload)).toBeNull();
  });
});

// A HEIGHT REACHES AN INLINE STYLE, so a frame claiming an absurd one would
// hand a visitor a page they cannot scroll off. Every provider's parser goes
// through the same bounds, so one is exercised for all of them.
describe("the bounds a claimed height has to clear", () => {
  const telegram = parser("telegram");

  /**
   * Telegram's message carrying one claimed height.
   *
   * @param height - what the frame claims, as JSON.
   * @returns the payload.
   */
  const claiming = (height: string) => `{"event":"resize","height":${height}}`;

  it.each([
    ["a height below the floor", "39"],
    ["zero", "0"],
    ["a negative height", "-600"],
    ["a height past the ceiling", "4001"],
    ["an absurd height", "1e9"],
    ["null", "null"],
  ])("refuses %s", (_case, height) => {
    expect(telegram(claiming(height))).toBeNull();
  });

  it.each([
    ["the floor itself", "40", 40],
    ["the ceiling itself", "4000", 4000],
  ])("accepts %s", (_case, height, expected) => {
    expect(telegram(claiming(height))).toBe(expected);
  });

  // A provider reporting a subpixel height would otherwise put a fractional
  // pixel on the box, which is a seam rather than a fit.
  it("rounds a fractional height", () => {
    expect(telegram(claiming("444.6"))).toBe(445);
  });
});

describe("EMBED_FIT", () => {
  it("names only providers the table actually has", () => {
    const ids = new Set(EMBED_PROVIDERS.map((provider) => provider.id));
    for (const id of EMBED_FIT.keys()) expect(ids).toContain(id);
  });

  // Mastodon is the only provider that has to be asked, and getting this wrong
  // in either direction is silent: a provider wrongly marked `ask` collapses
  // its frame for nothing, and Mastodon wrongly marked otherwise is never
  // measured at all.
  it("asks Mastodon and nobody else", () => {
    const asked = [...EMBED_FIT]
      .filter(([, fit]) => fit.ask)
      .map(([id]) => id)
      .sort();
    expect(asked).toEqual([
      "furry-engineer",
      "mastodon-social",
      "meow-social",
      "mstdn-social",
    ]);
  });

  // Pinterest measured 516, 638, 645, 750, 840 and 962 across six pins in one
  // 420px-wide frame, and answers no request of any shape — so an entry here
  // would be a mechanism that does not exist.
  it("claims no way to measure Pinterest", () => {
    expect(EMBED_FIT.has("pinterest")).toBe(false);
  });
});

describe("HEIGHT_REQUEST", () => {
  it("asks for a height in the shape every instance answers", () => {
    expect(HEIGHT_REQUEST).toEqual({ type: "setHeight", id: "aeleos" });
  });
});
