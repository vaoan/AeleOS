import { describe, expect, it } from "vitest";
import {
  PREVIEW_DRAFT,
  PREVIEW_READY,
  isPreviewReady,
  readPreviewDraft,
} from "@/features/actors/presentation/preview-message";
import { DEFAULT_THEME } from "@/features/actors/domain/actor-theme";
import { pageContext } from "./helpers/page-context";

const draft = {
  kind: PREVIEW_DRAFT,
  blocks: [],
  theme: DEFAULT_THEME,
  page: pageContext(),
  locale: "es",
  deviceHeight: 900,
};

describe("readPreviewDraft", () => {
  it("reads a whole draft", () => {
    expect(readPreviewDraft(draft)).toEqual(draft);
  });

  // Every rejection names ONE malformed field, so a check removed from the
  // parser reddens exactly the case that covers it. A single fixture that was
  // wrong in five ways would pass with four of the five checks missing.
  it.each([
    ["a number", 7],
    ["null", null],
    ["a string", PREVIEW_DRAFT],
    ["another kind", { ...draft, kind: "something-else" }],
    ["blocks that are not an array", { ...draft, blocks: {} }],
    ["no theme", { ...draft, theme: undefined }],
    ["a theme that is not an object", { ...draft, theme: "dark" }],
    ["no page", { ...draft, page: undefined }],
    ["a locale that is not a string", { ...draft, locale: 3 }],
    // Banding the backdrop needs one screenful's height; without it the
    // preview would draw a zero-height backdrop rather than none.
    ["no device height", { ...draft, deviceHeight: undefined }],
    ["a device height that is not a number", { ...draft, deviceHeight: "844" }],
  ])("refuses %s", (_name, value) => {
    expect(readPreviewDraft(value)).toBeNull();
  });
});

describe("isPreviewReady", () => {
  it("recognises the handshake", () => {
    expect(isPreviewReady({ kind: PREVIEW_READY })).toBe(true);
  });

  it.each([
    ["a draft", { kind: PREVIEW_DRAFT }],
    ["a bare string", PREVIEW_READY],
    ["nothing", undefined],
    ["null", null],
  ])("does not recognise %s", (_name, value) => {
    expect(isPreviewReady(value)).toBe(false);
  });
});

describe("the two names", () => {
  // They travel between documents, so they are namespaced rather than being
  // words like "ready" that anything else on the origin might also post.
  it("are distinct and namespaced", () => {
    expect(PREVIEW_READY).not.toBe(PREVIEW_DRAFT);
    expect(PREVIEW_READY.startsWith("aeleos:")).toBe(true);
    expect(PREVIEW_DRAFT.startsWith("aeleos:")).toBe(true);
  });
});
