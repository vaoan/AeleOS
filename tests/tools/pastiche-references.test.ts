import { describe, expect, it } from "vitest";

import {
  captureUrl,
  inspirationSection,
  REFERENCES,
} from "../../scripts/pastiche-references.mjs";

describe("captureUrl", () => {
  it("wraps a noFrame replay, not a framed one", () => {
    const url = captureUrl("20080215082853", "http://www.hi5.com/");
    // Asserting on the DECODED parameter rather than on percent-escapes: the
    // claim is about which replay is being asked for, not about how a slash is
    // spelled, and an assertion on the escaping would pass a URL that encoded
    // the right string into the wrong parameter.
    const target = new URL(url).searchParams.get("url");
    // The framed replay carries the archive's own banner and sidebar, which
    // would be 40% of the reference picture.
    expect(target).toContain("/noFrame/replay/");
    expect(target).not.toContain("/wayback/");
  });

  it("carries the whole replay URL as one parameter", () => {
    const url = captureUrl("20080215082853", "http://www.hi5.com/");
    // The replay URL contains its own `://` and slashes. Left unencoded it
    // would be truncated or split; round-tripping it through searchParams is
    // what proves it survived as one opaque value.
    expect(new URL(url).searchParams.get("url")).toBe(
      "https://arquivo.pt/noFrame/replay/20080215082853/http://www.hi5.com/",
    );
    expect(new URL(url).origin).toBe("https://arquivo.pt");
  });

  it("stays inside the 500-character image_url cap", () => {
    // The longest real one is `myspace`, whose target carries a username.
    const url = captureUrl(
      "20081024054301",
      "http://profile.myspace.com/akioyang",
    );
    expect(url.length).toBe(140);
    expect(url.length).toBeLessThan(500);
  });
});

describe("REFERENCES", () => {
  it("names all sixteen pages", () => {
    expect(Object.keys(REFERENCES)).toHaveLength(16);
  });

  it("gives every entry either a capture or a reason there is none", () => {
    for (const [handle, ref] of Object.entries(REFERENCES)) {
      const hasCapture = typeof ref.image === "string" && ref.image.length > 0;
      const hasReason = typeof ref.absent === "string" && ref.absent.length > 0;
      // Exactly one. A page with both is undecided; a page with neither is a
      // gap wearing the clothes of a finding.
      expect(hasCapture !== hasReason, `${handle} must have exactly one`).toBe(
        true,
      );
    }
  });

  // Renamed from the plan's "marks exactly the three subjects no archive can
  // hold": `absent` covers two distinct reasons, not one, and there are four
  // entries, not three. `board`, `sky` and `threads` are the reason above —
  // no archive can hold the subject (a crawler never sees the dark mode, the
  // signed-in profile, or the client-rendered markup). `geocities` is a
  // different reason: the subject is not a single page at all, so there is
  // no one capture to point at, only a restored gallery of many.
  it("marks exactly the four pages that carry no capture", () => {
    const absent = Object.entries(REFERENCES)
      .filter(([, r]) => r.absent)
      .map(([h]) => h)
      .sort();
    expect(absent).toEqual(["board", "geocities", "sky", "threads"]);
  });

  it("gives every entry both languages of its own writing", () => {
    for (const [handle, ref] of Object.entries(REFERENCES)) {
      expect(typeof ref.title_en, `${handle}.title_en`).toBe("string");
      expect(typeof ref.title_es, `${handle}.title_es`).toBe("string");
      expect(typeof ref.link_label_en, `${handle}.link_label_en`).toBe(
        "string",
      );
      expect(typeof ref.link_label_es, `${handle}.link_label_es`).toBe(
        "string",
      );
      expect(ref.title_en.length).toBeGreaterThan(0);
      expect(ref.title_es.length).toBeGreaterThan(0);
      expect(ref.link_label_en.length).toBeGreaterThan(0);
      expect(ref.link_label_es.length).toBeGreaterThan(0);
    }
  });

  it("translates the stated reason wherever one exists", () => {
    // Filtered first, so the loop body asserts unconditionally rather than
    // guarding an `expect` behind an `if` — an assertion that can be skipped
    // is an assertion that can silently stop running.
    const absentEntries = Object.entries(REFERENCES).filter(
      ([, ref]) => ref.absent,
    );
    expect(absentEntries.length).toBe(4);
    for (const [handle, ref] of absentEntries) {
      expect(typeof ref.absent_es, `${handle}.absent_es`).toBe("string");
      expect(ref.absent_es!.length).toBeGreaterThan(0);
    }
  });
});

describe("inspirationSection", () => {
  it("draws a picture and a link when there is a capture", () => {
    const section = inspirationSection(REFERENCES.hi5);
    const kinds = section.children.map((c) => c.kind);
    expect(kinds).toContain("picture");
    expect(kinds).toContain("link");
  });

  it("draws no picture when there is none, and says why instead", () => {
    const section = inspirationSection(REFERENCES.board);
    const kinds = section.children.map((c) => c.kind);
    // The discriminating half: a section that merely omitted the picture would
    // pass a `not.toContain` on its own. It has to carry the reason too.
    expect(kinds).not.toContain("picture");
    expect(kinds).toContain("text");
    const reason = section.children.find((c) => c.kind === "text");
    expect(reason.description_en).toBe(REFERENCES.board.absent);
  });

  it("is bilingual, because a section name is the author's own writing", () => {
    const section = inspirationSection(REFERENCES.hi5);
    expect(section.name_en).toBe("The inspiration");
    expect(section.name_es).toBe("La inspiración");
  });

  it("sits at depth 0 as a named container", () => {
    const section = inspirationSection(REFERENCES.hi5);
    expect(section.kind).toBe("container");
    expect(typeof section.name_en).toBe("string");
  });
});
