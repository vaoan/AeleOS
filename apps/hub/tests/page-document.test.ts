import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DOCUMENT_VERSION,
  PASTE_LIMIT_BYTES,
  parseDocument,
  toDocument,
} from "@/features/actors/domain/page-document";
import { DEFAULT_THEME } from "@/features/actors/domain/actor-theme";
import { CANVAS_RANGE } from "@/shared/domain/canvas-motion";
import type {
  Block,
  ContainerBlock,
} from "@/features/actors/domain/block-schema";

/**
 * A page whose shape a wrong answer cannot reproduce by accident.
 *
 * Deliberately asymmetric, because a round-trip over a default page passes
 * whether or not the parse does anything (root rules 27 and 29):
 *
 *  * `weights` is `[1, 3, 2]` — not a palindrome, so a renderer or parser that
 *    reverses the array fails, where `[1, 3, 1]` would pass.
 *  * `spaces` is 3, not the default of 1.
 *  * three sections, because a shift and a swap leave the same page when
 *    there are two.
 *  * a container nested to the depth cap, so a parse that silently flattens is
 *    visible.
 */
const PAGE: Block[] = [
  {
    kind: "container",
    mode: "grid",
    spaces: 3,
    weights: [1, 3, 2],
    children: [
      { kind: "text", title_en: "First", description_en: "one" },
      null,
      {
        kind: "container",
        mode: "stack",
        spaces: 1,
        children: [
          {
            kind: "container",
            mode: "stack",
            spaces: 1,
            children: [
              { kind: "text", title_en: "Deepest", description_en: "three" },
            ],
          },
        ],
      },
    ],
  },
  {
    kind: "container",
    mode: "list",
    spaces: 1,
    children: [{ kind: "avatar", title_en: "Portrait", description_en: "" }],
  },
  {
    kind: "container",
    mode: "stack",
    spaces: 1,
    children: [
      { kind: "handle", title_en: "Handle", description_en: "" },
      { kind: "owner", title_en: "Owner", description_en: "" },
    ],
  },
];

describe("toDocument", () => {
  it("emits the object form with a version marker", () => {
    const parsed: unknown = JSON.parse(toDocument(DEFAULT_THEME, PAGE));
    expect(parsed).toMatchObject({ aeleos: DOCUMENT_VERSION });
    expect(Object.keys(parsed as object)).toEqual([
      "aeleos",
      "theme",
      "blocks",
    ]);
  });

  it("round-trips a page unchanged", () => {
    const back = parseDocument(toDocument(DEFAULT_THEME, PAGE), "fursona");
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.blocks).toEqual(PAGE);
    expect(back.theme).toEqual(DEFAULT_THEME);
  });
});

describe("parseDocument", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports a thrown non-Error as unreadable", () => {
    // `JSON.parse` and the reviver both only ever throw `Error`s in this
    // module's own code — this is what exercises the fallback for a parse
    // failure that is not an `Error` instance, which nothing this build
    // controls can otherwise produce.
    vi.spyOn(JSON, "parse").mockImplementationOnce(() => {
      throw "not an Error";
    });
    const back = parseDocument("{}", "fursona");
    expect(back.ok).toBe(false);
    if (back.ok) return;
    expect(back.problems).toEqual([{ at: "syntax", message: "unreadable" }]);
  });

  it("accepts a bare array as blocks, and touches no theme", () => {
    const back = parseDocument(JSON.stringify(PAGE), "fursona");
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.blocks).toEqual(PAGE);
    expect(back.theme).toBeNull();
  });

  it("reads an absent theme as leave-mine-alone", () => {
    const back = parseDocument(
      JSON.stringify({ aeleos: 1, blocks: PAGE }),
      "fursona",
    );
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.theme).toBeNull();
  });

  it("refuses an unrecognised version by name", () => {
    const back = parseDocument(
      JSON.stringify({ aeleos: 99, blocks: PAGE }),
      "fursona",
    );
    expect(back.ok).toBe(false);
    if (back.ok) return;
    expect(back.problems).toEqual([
      { at: "envelope", message: "unknown version 99" },
    ]);
  });

  it("refuses an object form with no version marker", () => {
    const back = parseDocument(JSON.stringify({ blocks: PAGE }), "fursona");
    expect(back.ok).toBe(false);
    if (back.ok) return;
    expect(back.problems[0]).toMatchObject({ at: "envelope" });
  });

  it("refuses a value that is neither an array nor an object", () => {
    const back = parseDocument(JSON.stringify("just a string"), "fursona");
    expect(back.ok).toBe(false);
    if (back.ok) return;
    expect(back.problems[0]).toMatchObject({ at: "envelope" });
  });

  it("reports a syntax failure as a position and no path", () => {
    const back = parseDocument('{ "aeleos": 1, "blocks": [', "fursona");
    expect(back.ok).toBe(false);
    if (back.ok) return;
    expect(back.problems[0]).toMatchObject({ at: "syntax" });
    expect(back.problems[0]).not.toHaveProperty("path");
  });

  it("reports a schema refusal as a path into the tree", () => {
    // `Block` is a union, so each step down needs the container cast —
    // TypeScript cannot narrow an index into a fixture, however fixed its
    // shape is two dozen lines above.
    const broken = structuredClone(PAGE);
    const section = broken[0] as ContainerBlock;
    const nested = section.children[2] as ContainerBlock;
    const deeper = nested.children[0] as ContainerBlock;
    // The deepest leaf's title, which the write schema requires.
    delete (deeper.children[0] as { title_en?: string }).title_en;
    const back = parseDocument(
      JSON.stringify({ aeleos: 1, blocks: broken }),
      "fursona",
    );
    expect(back.ok).toBe(false);
    if (back.ok) return;
    expect(back.problems).toContainEqual({
      at: "block",
      path: [0, 2, 0, 0],
      field: "title_en",
    });
  });

  it("reports a page-level refusal with no block to mark", () => {
    const tooMany: Block[] = Array.from({ length: 501 }, () => ({
      kind: "text",
      title_en: "x",
      description_en: "",
    }));
    const back = parseDocument(
      JSON.stringify({ aeleos: 1, blocks: tooMany }),
      "fursona",
    );
    expect(back.ok).toBe(false);
    if (back.ok) return;
    expect(back.problems).toEqual([
      { at: "envelope", message: "too many blocks" },
    ]);
  });

  it("reports a leaf the destination's actor kind refuses", () => {
    const back = parseDocument(
      JSON.stringify({ aeleos: 1, blocks: PAGE }),
      "person",
    );
    expect(back.ok).toBe(false);
    if (back.ok) return;
    expect(back.problems).toContainEqual({
      at: "refused-kind",
      path: [2, 1],
      kind: "owner",
    });
  });

  it("refuses an oversized paste without parsing it", () => {
    const huge = "x".repeat(PASTE_LIMIT_BYTES + 1);
    const back = parseDocument(huge, "fursona");
    expect(back.ok).toBe(false);
    if (back.ok) return;
    expect(back.problems).toEqual([
      { at: "envelope", message: "too large to read" },
    ]);
  });

  it("does not let a `__proto__` key reach anything", () => {
    const back = parseDocument(
      '{ "aeleos": 1, "__proto__": { "polluted": true }, "blocks": [] }',
      "fursona",
    );
    expect(back.ok).toBe(false);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("refuses a `constructor` key nested inside a block, not only at the top", () => {
    const back = parseDocument(
      JSON.stringify({
        aeleos: 1,
        blocks: [
          { kind: "text", title_en: "t", constructor: { polluted: true } },
        ],
      }),
      "fursona",
    );
    expect(back.ok).toBe(false);
  });

  it("normalises a hostile theme rather than trusting it", () => {
    const back = parseDocument(
      JSON.stringify({
        aeleos: 1,
        blocks: PAGE,
        theme: {
          accent: "javascript:alert(1)",
          canvasColours: Array.from({ length: 5000 }, () => "#ff0000"),
          density: 9e9,
          skin: "not-a-skin",
        },
      }),
      "fursona",
    );
    expect(back.ok).toBe(true);
    if (!back.ok || !back.theme) return;
    expect(back.theme.accent).toBeNull();
    expect(back.theme.canvasColours?.length ?? 0).toBeLessThan(50);
    // `dial()` clamps to `CANVAS_RANGE.max` (5), not to 1 — measured against
    // `shared/domain/canvas-motion.ts` rather than assumed.
    expect(back.theme.density).toBeLessThanOrEqual(CANVAS_RANGE.max);
    expect(back.theme.skin).toBe(DEFAULT_THEME.skin);
  });

  // Step 5: the parser-depth measurement. `JSON.parse` was measured against
  // the installed engine (2026-08-27) at depths of 100 through 5,000,000 — a
  // bare array nested 5,000,000 deep, 10MB of text, parsed in 604ms with no
  // ceiling found. This depth is comfortably under that, chosen only to clear
  // `blocksSchema`'s own `MAX_DEPTH` (3) many times over.
  it("refuses a tree nested past MAX_DEPTH as a problem, never a throw", () => {
    const DEPTH = 1000;
    let node: unknown = {
      kind: "text",
      title_en: "Deepest",
      description_en: "",
    };
    for (let i = 0; i < DEPTH; i += 1) {
      node = { kind: "container", mode: "stack", spaces: 1, children: [node] };
    }
    const text = JSON.stringify({ aeleos: 1, blocks: [node] });
    let back: ReturnType<typeof parseDocument> | undefined;
    expect(() => {
      back = parseDocument(text, "fursona");
    }).not.toThrow();
    expect(back?.ok).toBe(false);
  });
});
