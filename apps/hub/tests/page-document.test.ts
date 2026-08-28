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

  it('reads an explicit "theme": null as leave-mine-alone too', () => {
    // Same reading as an omitted key, on the ruling that a document naming
    // the key and giving it nothing most plausibly means "no theme here" —
    // resetting somebody's colours on that ambiguity is the destructive
    // reading. Before this fix, this branch took `parseTheme(null)` and
    // reset the theme to the default instead of leaving it alone.
    const back = parseDocument(
      JSON.stringify({ aeleos: 1, blocks: PAGE, theme: null }),
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

  it('refuses a document with no "blocks" key at all', () => {
    // Boundary: the envelope is otherwise well-formed (a real version
    // marker) and simply never names `blocks` — `envelope.blocks` reads
    // `undefined`, which `blocksSchema` refuses at the root with no field to
    // mark, so this is the `envelope` fallback rather than a `block` problem.
    const back = parseDocument(JSON.stringify({ aeleos: 1 }), "fursona");
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

  it("accepts a paste of exactly PASTE_LIMIT_BYTES", () => {
    // Boundary: the cap is `> PASTE_LIMIT_BYTES`, so exactly the limit must
    // still be read rather than refused — the classic off-by-one on a cap.
    // Padded with leading whitespace, which JSON permits and which is not
    // otherwise significant, so the document itself stays a trivial `[]`.
    const text = " ".repeat(PASTE_LIMIT_BYTES - 2) + "[]";
    expect(new TextEncoder().encode(text).length).toBe(PASTE_LIMIT_BYTES);
    const back = parseDocument(text, "fursona");
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.blocks).toEqual([]);
  });

  it("does not let a `__proto__` key reach anything", () => {
    const back = parseDocument(
      '{ "aeleos": 1, "__proto__": { "polluted": true }, "blocks": [] }',
      "fursona",
    );
    expect(back.ok).toBe(false);
    if (back.ok) return;
    // Discriminating rather than merely `ok === false`: with no version
    // marker or `blocks` key touched, this document is otherwise ACCEPTABLE
    // — `blocksSchema.safeParse([])` succeeds — so removing the reviver
    // reddens this by flipping it to `ok: true`, not by leaving it green for
    // the wrong reason.
    expect(back.problems).toEqual([{ at: "unsafe-key", key: "__proto__" }]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("refuses a `constructor` key nested inside the theme, not only at the top", () => {
    // Discriminating on purpose, unlike the fixture this replaces: a
    // `constructor` key placed on a BLOCK is refused by `blocksSchema`'s own
    // `.strict()` whether or not the reviver runs, so that case could never
    // have told the two apart (root rule 27). `parseTheme` reads named
    // fields off the theme object rather than validating it as a whole, so
    // an unsafe key placed there is invisible to any schema — without the
    // reviver this document parses to `ok: true` with `accent` honoured;
    // with it, the reviver is the only thing that catches it.
    const back = parseDocument(
      JSON.stringify({
        aeleos: 1,
        blocks: PAGE,
        theme: { constructor: { polluted: true }, accent: "#112233" },
      }),
      "fursona",
    );
    expect(back.ok).toBe(false);
    if (back.ok) return;
    expect(back.problems).toEqual([{ at: "unsafe-key", key: "constructor" }]);
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
    // `dial()` clamps to exactly `CANVAS_RANGE.max` (5), not to 1 and not to
    // anything looser than the real bound — measured against
    // `shared/domain/canvas-motion.ts` rather than assumed.
    expect(back.theme.density).toBe(CANVAS_RANGE.max);
    expect(back.theme.skin).toBe(DEFAULT_THEME.skin);
  });

  /**
   * Builds a chain of `depth` nested single-child `stack` containers around
   * one leaf, the shape `blocksSchema`'s own depth cap and the reviver's
   * recursion both care about.
   *
   * @param depth - how many containers to nest.
   * @returns the innermost node, before it is serialised.
   */
  function nestedChain(depth: number): unknown {
    let node: unknown = {
      kind: "text",
      title_en: "Deepest",
      description_en: "",
    };
    for (let i = 0; i < depth; i += 1) {
      node = { kind: "container", mode: "stack", spaces: 1, children: [node] };
    }
    return node;
  }

  // Step 5: the parser-depth measurement, corrected. `JSON.parse` with no
  // reviver has no ceiling reachable within `PASTE_LIMIT_BYTES` — measured at
  // 5,000,000 levels, 10MB, 604ms — but that is not the call this function
  // makes. `refuseUnsafeKeys` turns the walk that invokes it into a recursive
  // one in JS, whose real ceiling — measured against this exact container
  // shape, inside this repo's own vitest worker, 2026-08-27 — is depth 857
  // (862 in plain Node). This case stays two orders of magnitude under that,
  // which is what lets it demonstrate the SCHEMA's `MAX_DEPTH` refusal rather
  // than the reviver's own stack limit; the case below this one is what proves
  // the reviver's limit is a caught problem rather than a thrown one.
  it('refuses a tree nested past MAX_DEPTH as an "envelope" problem naming it, never a throw', () => {
    const text = JSON.stringify({ aeleos: 1, blocks: [nestedChain(20)] });
    let back: ReturnType<typeof parseDocument> | undefined;
    expect(() => {
      back = parseDocument(text, "fursona");
    }).not.toThrow();
    expect(back?.ok).toBe(false);
    if (!back || back.ok) return;
    // `blocksSchema`'s own depth-cap issue path ends in a NUMBER, not a field
    // name — `[0, "children", 0, "children", 0, "children", 0]` for a chain
    // nested past the cap — so `blockProblemsFromIssues` finds no field to
    // mark. This is the array-level `envelope` fallback, not a `block`
    // problem naming a field ("children") nobody typed; see parseDocument's
    // own TSDoc for the measured path shape.
    expect(back.problems).toEqual([{ at: "envelope", message: "too deep" }]);
  });

  it("catches the reviver's own stack limit as an ordinary problem, never a throw", () => {
    // 2,000 levels of minimal containers serialise to about 120KB — comfortably
    // under `PASTE_LIMIT_BYTES` (128KB) and comfortably PAST the measured 857
    // depth at which `refuseUnsafeKeys`'s own recursive invocation throws
    // `RangeError: Maximum call stack size exceeded`. A paste this shape is not
    // hostile by any cap this module checks; it still has to come back as a
    // problem rather than escape as an uncaught exception.
    const text = JSON.stringify({ aeleos: 1, blocks: [nestedChain(2000)] });
    expect(new TextEncoder().encode(text).length).toBeLessThan(
      PASTE_LIMIT_BYTES,
    );
    let back: ReturnType<typeof parseDocument> | undefined;
    expect(() => {
      back = parseDocument(text, "fursona");
    }).not.toThrow();
    expect(back?.ok).toBe(false);
    if (!back || back.ok) return;
    expect(back.problems[0]).toMatchObject({ at: "syntax" });
  });
});
