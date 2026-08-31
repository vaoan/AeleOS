import { describe, expect, it } from "vitest";
import {
  honoursCard,
  honoursCorners,
  honoursImageFit,
  honoursLabel,
  honoursPortrait,
  showsLabel,
  styleGatesFor,
} from "@/features/actors/presentation/block-contract";
import { newContainer, newLeaf } from "@/features/actors/domain/block-edits";
import type { BlockStyle } from "@/features/actors/domain/block-schema";

/**
 * `showsLabel` is the one place the enclosing mode's `labelled` and a block's
 * own `style.label` compose. Read wherever an identity leaf or `PlainLeaf`
 * decides whether to draw its own title — see gap 16 of
 * `docs/superpowers/specs/2026-08-27-pastiche-findings.md` for why the key
 * exists at all.
 *
 * The rule under test: `hidden` can only NARROW what the mode already
 * decided, never widen it. Absent and `"show"` are the same state as far as
 * this function is concerned.
 */
describe("showsLabel", () => {
  it("shows the label when the mode allows it and no style is set", () => {
    expect(showsLabel(true, undefined)).toBe(true);
  });

  it("hides the label when the mode has already suppressed it, with no style set", () => {
    expect(showsLabel(false, undefined)).toBe(false);
  });

  it("shows the label when the mode allows it and the style explicitly says show", () => {
    const style: BlockStyle = { label: "show" };
    expect(showsLabel(true, style)).toBe(true);
  });

  it("hides the label when the mode allows it but the style says hidden", () => {
    const style: BlockStyle = { label: "hidden" };
    expect(showsLabel(true, style)).toBe(false);
  });

  // The composition rule's sharpest edge: `hidden` narrows, but `show` must
  // never WIDEN a mode's own suppression back open. There is nowhere left on
  // the leaf to put a title a `tabs` or `accordion` panel already drew.
  it("does not let an explicit show override a mode that has already suppressed the label", () => {
    const style: BlockStyle = { label: "show" };
    expect(showsLabel(false, style)).toBe(false);
  });

  // Both suppressed for the same reason, from two different causes.
  it("stays hidden when both the mode and the style agree", () => {
    const style: BlockStyle = { label: "hidden" };
    expect(showsLabel(false, style)).toBe(false);
  });

  // Anything else in the style bag is irrelevant to this function; only
  // `label` is read.
  it("ignores every other style key", () => {
    const style: BlockStyle = { chrome: "bare", radius: "square" };
    expect(showsLabel(true, style)).toBe(true);
  });
});

/**
 * `honoursLabel` is the set `showsLabel` composes with, reinstated
 * 2026-08-30 so `SectionStylePopup` can gate its "Own title" select on a
 * LEAF's own kind rather than on a `ContainerBlock`'s, which is always
 * `"container"` and never one of these five.
 */
describe("honoursLabel", () => {
  it.each(["text", "avatar", "handle", "name", "owner"])(
    "is true for %s",
    (kind) => {
      expect(honoursLabel(kind)).toBe(true);
    },
  );

  // `fursonas` is the one identity leaf that does NOT compose with
  // `showsLabel` — its own title is never suppressible — so a purely
  // positive sweep of "the four identity leaves" would miss it.
  it.each(["fursonas", "stat", "quote", "progress", "table", "link", "social"])(
    "is false for %s",
    (kind) => {
      expect(honoursLabel(kind)).toBe(false);
    },
  );

  it("is false for a kind this build has never heard of", () => {
    expect(honoursLabel("diagram")).toBe(false);
  });
});

/**
 * `honoursImageFit` names the leaf kinds whose own `<img>` reads
 * `--img-fit` directly — `AvatarLeaf`, `OwnerLeaf`'s mini portrait, and
 * `PictureLeaf`.
 */
describe("honoursImageFit", () => {
  it.each(["avatar", "owner", "picture"])("is true for %s", (kind) => {
    expect(honoursImageFit(kind)).toBe(true);
  });

  it.each(["handle", "name", "fursonas", "text", "link"])(
    "is false for %s",
    (kind) => {
      expect(honoursImageFit(kind)).toBe(false);
    },
  );
});

/** `honoursPortrait` names `avatar` alone. */
describe("honoursPortrait", () => {
  it("is true for avatar", () => {
    expect(honoursPortrait("avatar")).toBe(true);
  });

  // `owner`'s own mini avatar deliberately does not read `portrait` — see
  // `block-schema.ts`'s TSDoc on the key — so it is the discriminating
  // negative case rather than an arbitrary one.
  it.each(["owner", "picture", "handle", "text"])("is false for %s", (kind) => {
    expect(honoursPortrait(kind)).toBe(false);
  });
});

/**
 * `styleGatesFor` is the one place `SectionStylePopup`'s five controls are
 * decided, from the block being edited rather than from separate booleans a
 * caller computes by hand.
 */
describe("styleGatesFor", () => {
  it("gates a container on its own name and depth, never on label/imageFit-by-kind/portrait", () => {
    const named = { ...newContainer("grid", 2), name_en: "Gallery" };
    expect(styleGatesFor(named, true)).toEqual({
      heading: true,
      atTop: true,
      label: false,
      imageFit: true,
      portrait: false,
      card: true,
      corners: true,
    });
  });

  it("answers heading:false for an unnamed container, at any depth", () => {
    const unnamed = newContainer("grid", 2);
    expect(styleGatesFor(unnamed, false)).toEqual({
      heading: false,
      atTop: false,
      label: false,
      imageFit: true,
      portrait: false,
      card: true,
      corners: true,
    });
  });

  // Blank strings and pure whitespace are not a name — `BlockCard`'s own
  // check reads `name_en?.trim()`, and this function has to agree with it.
  it("treats a whitespace-only name as no name at all", () => {
    const blank = { ...newContainer("grid", 2), name_en: "   " };
    expect(styleGatesFor(blank, true).heading).toBe(false);
  });

  // A NAME IN SPANISH ALONE STILL COUNTS. `BlockCard`'s check is an OR
  // across both languages, and this function has to be too, or a section
  // named only in Spanish would silently lose its heading controls.
  it("honours a name written in Spanish alone", () => {
    const spanishOnly = { ...newContainer("grid", 2), name_es: "Especie" };
    expect(styleGatesFor(spanishOnly, true).heading).toBe(true);
  });

  it("ignores the `atTop` argument for a leaf — bleed/margins are a container-only concept", () => {
    const leaf = newLeaf("text");
    expect(styleGatesFor(leaf, true).atTop).toBe(false);
  });

  it("gates a leaf by its own kind, never by heading or atTop", () => {
    // `avatar` has a `surface`-bearing box (`rounded-full surface`) but no
    // `CORNER_CLASS` — a fixed circle never asks `--skin-round` anything —
    // so `card` and `corners` must disagree here, not agree.
    expect(styleGatesFor(newLeaf("avatar"), true)).toEqual({
      heading: false,
      atTop: false,
      label: true,
      imageFit: true,
      portrait: true,
      card: true,
      corners: false,
    });
    // `stat` carries both `surface` and `CORNER_CLASS` (`MEASURE_CARD`), so
    // this is the positive case `avatar` above is the discriminating
    // negative for.
    expect(styleGatesFor(newLeaf("stat"), true)).toEqual({
      heading: false,
      atTop: false,
      label: false,
      imageFit: false,
      portrait: false,
      card: true,
      corners: true,
    });
    // `handle` draws no box at all — a bare `<span>` — so both are false,
    // the discriminating negative for `card` that `avatar` cannot be.
    expect(styleGatesFor(newLeaf("handle"), true)).toEqual({
      heading: false,
      atTop: false,
      label: true,
      imageFit: false,
      portrait: false,
      card: false,
      corners: false,
    });
  });
});

/**
 * `honoursCorners` names the leaf kinds whose own box carries `CORNER_CLASS`
 * — the only thing `radius` and the `corners` style key ever reach through.
 */
describe("honoursCorners", () => {
  it.each(["text", "stat", "quote", "progress", "table", "picture", "owner"])(
    "is true for %s",
    (kind) => {
      expect(honoursCorners(kind)).toBe(true);
    },
  );

  // `link`/`social` (`LEAF_CARD`) and `embed` (`FRAME_SHAPE`) all have a
  // `surface`-bearing box but a FIXED `rounded-xl`, never `--skin-round`;
  // `avatar` the same with `rounded-full`. Each is the case that tells
  // "has a box" apart from "the box reads this token".
  it.each(["link", "social", "embed", "avatar"])(
    "is false for %s, despite having a surface-bearing box",
    (kind) => {
      expect(honoursCorners(kind)).toBe(false);
    },
  );

  it.each(["handle", "name", "fursonas", "player", "jukebox"])(
    "is false for %s",
    (kind) => {
      expect(honoursCorners(kind)).toBe(false);
    },
  );

  it("is false for a kind this build has never heard of", () => {
    expect(honoursCorners("diagram")).toBe(false);
  });
});

/**
 * `honoursCard` names the leaf kinds whose own box carries `surface` — what
 * `skin`, `border` and `chrome` all act through.
 */
describe("honoursCard", () => {
  it.each([
    "text",
    "link",
    "picture",
    "embed",
    "social",
    "stat",
    "quote",
    "progress",
    "table",
    "avatar",
    "owner",
  ])("is true for %s", (kind) => {
    expect(honoursCard(kind)).toBe(true);
  });

  // `fursonas` is true for a DIFFERENT reason than the eleven above: its own
  // wrapper is bare, and what makes this true is that `FursonaCardList`'s
  // cards — which it renders, not which it IS — carry `surface`, and
  // `surface`'s tokens are ordinary custom properties that inherit from the
  // wrapper `Block()` writes a leaf's own skin/border/chrome onto. Named
  // separately from the eleven above because a review found the FIRST
  // version of this gate answered `fursonas` wrong by asking "does this
  // leaf's own box carry `surface`" instead of "does anything it renders".
  it("is true for fursonas, despite its own wrapper being bare", () => {
    expect(honoursCard("fursonas")).toBe(true);
  });

  // `player`/`jukebox` wear a bespoke `--chrome-*` chrome that shares no
  // token with a skin; `handle`/`name` draw no box anywhere, not even
  // through a descendant. Each is a different reason to answer false, not
  // the same one repeated — and neither is the `fursonas` shape, which is
  // why that kind is asserted on its own above rather than folded in here.
  it.each(["player", "jukebox", "handle", "name"])(
    "is false for %s",
    (kind) => {
      expect(honoursCard(kind)).toBe(false);
    },
  );

  it("is false for a kind this build has never heard of", () => {
    expect(honoursCard("diagram")).toBe(false);
  });
});
