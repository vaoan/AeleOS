import { describe, expect, it } from "vitest";
import {
  BLOCK_KINDS,
  BLOCK_LIMITS,
  CONTAINER_KIND,
  isContainer,
  CONTAINER_MODES,
  LEAF_KINDS,
  MAX_DEPTH,
  PAGE_TRACKS,
  TOO_DEEP_MESSAGE,
  blockSchema,
  blocksSchema,
  effectiveSpan,
  lenientBlockSchema,
  lenientBlocksSchema,
  type Block,
  type ContainerBlock,
  type LeafBlock,
} from "@/features/actors/domain/block-schema";

/**
 * A well-formed leaf, with overrides.
 *
 * @param over - fields to replace.
 * @returns the leaf.
 */
const leaf = (over: Record<string, unknown> = {}) => ({
  kind: "text",
  title_en: "A title",
  title_es: "Un titulo",
  description_en: "Some words.",
  description_es: "Unas palabras.",
  ...over,
});

/**
 * A well-formed container, with overrides.
 *
 * @param over - fields to replace.
 * @returns the container.
 */
const container = (over: Record<string, unknown> = {}) => ({
  kind: CONTAINER_KIND,
  mode: "stack",
  children: [leaf()],
  ...over,
});

/**
 * A well-formed table cell, with overrides.
 *
 * @param over - fields to replace.
 * @returns the cell.
 */
const cell = (over: Record<string, unknown> = {}) => ({
  text_en: "A value",
  text_es: "Un valor",
  ...over,
});

/**
 * The smallest legal leaves, for the tests that build very many of them.
 *
 * @param count - how many to build.
 * @returns the leaves.
 */
const leaves = (count: number) =>
  Array.from({ length: count }, () => ({ kind: "text", title_en: "t" }));

/**
 * Every span the vocabulary offers.
 *
 * @returns the track counts, from one upwards.
 */
const everyTrackCount = () =>
  Array.from({ length: BLOCK_LIMITS.tracks }, (_, n) => n + 1);

/**
 * A chain of containers with exactly one leaf at the given depth.
 *
 * `leafAtDepth(0)` is a bare leaf; `leafAtDepth(3)` is a leaf under three
 * enclosing containers, the outermost of which sits at depth 0.
 *
 * @param depth - how deep the leaf should sit.
 * @returns the tree.
 */
function leafAtDepth(depth: number): unknown {
  let node: unknown = leaf();
  for (let above = depth; above > 0; above -= 1) {
    node = container({ children: [node] });
  }
  return node;
}

/**
 * Whether the strict schema accepts one block.
 *
 * @param value - what to validate.
 * @returns true when it parsed.
 */
const accepts = (value: unknown) => blockSchema.safeParse(value).success;

/**
 * Whether the strict schema accepts a whole page of blocks.
 *
 * @param value - what to validate.
 * @returns true when it parsed.
 */
const acceptsPage = (value: unknown) => blocksSchema.safeParse(value).success;

/**
 * Why the strict schema turned a page down.
 *
 * The block budget and the byte budget are separate guards, and either one
 * refusing makes the parse fail — so a test that only asks whether it failed
 * cannot tell which fired, and would keep passing if the wrong one did.
 *
 * @param value - what to validate.
 * @returns every message the parse reported.
 */
const refusalOf = (value: unknown) => {
  const result = blocksSchema.safeParse(value);
  return result.success
    ? []
    : result.error.issues.map((issue) => issue.message);
};

/**
 * A copy of an object without one key.
 *
 * @param source - the object to copy.
 * @param key - the field to leave out.
 * @returns the copy.
 */
function without(
  source: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const copy = { ...source };
  delete copy[key];
  return copy;
}

/**
 * The block as a container, failing the test when it is not one.
 *
 * @param block - the parsed block to narrow.
 * @returns the same block, typed as a container.
 */
function asContainer(block: Block | undefined): ContainerBlock {
  if (block === undefined || !isContainer(block)) {
    throw new Error("expected a container");
  }
  return block;
}

/**
 * The block as a leaf, failing the test when it is not one.
 *
 * @param block - the parsed block to narrow.
 * @returns the same block, typed as a leaf.
 */
function asLeaf(block: Block | undefined): LeafBlock {
  if (block === undefined || isContainer(block)) {
    throw new Error("expected a leaf");
  }
  return block;
}

/**
 * Every message in a tree of issues, branch errors included.
 *
 * A `z.union` reports its own generic message at the top and each branch's
 * issues beneath it, so a named refusal inside one branch is invisible to a
 * flat `issues.map(…)`. Walking it is what lets a test assert the refusal
 * somebody would actually act on rather than the union's wrapper.
 *
 * @param issues - the issues to walk.
 * @returns every message found, at any depth.
 */
function messagesOf(issues: readonly { message: string }[]): string[] {
  return issues.flatMap((issue) => [
    issue.message,
    ...((issue as { errors?: { message: string }[][] }).errors ?? []).flatMap(
      (branch) => messagesOf(branch),
    ),
  ]);
}

describe("the vocabulary", () => {
  it("is the container kind together with every leaf kind", () => {
    expect([...BLOCK_KINDS]).toEqual([CONTAINER_KIND, ...LEAF_KINDS]);
  });

  it.each(LEAF_KINDS)("accepts a %s leaf", (kind) => {
    expect(accepts(leaf({ kind }))).toBe(true);
  });

  it.each(CONTAINER_MODES)("accepts a container in %s mode", (mode) => {
    expect(accepts(container({ mode }))).toBe(true);
  });

  it("refuses a kind it does not render", () => {
    expect(accepts(leaf({ kind: "spreadsheet" }))).toBe(false);
  });

  it("refuses a mode it cannot arrange", () => {
    expect(accepts(container({ mode: "isometric" }))).toBe(false);
  });

  // `kind` and `mode` arrive from user-controlled `jsonb`. This repo shipped a
  // Critical from a plain object indexed by an untrusted path segment, where
  // each of these names resolved to a truthy inherited value, passed the
  // guard, and then threw during a public page render. Named cases rather than
  // a generator: a branch reached only when a generator happens to cooperate
  // is untested, and the coverage number lies at a low rate.
  it.each(["__proto__", "constructor", "toString"])(
    "refuses %s as a kind rather than resolving something inherited",
    (kind) => {
      expect(accepts(leaf({ kind }))).toBe(false);
    },
  );

  it.each(["__proto__", "constructor", "toString"])(
    "refuses %s as a mode rather than resolving something inherited",
    (mode) => {
      expect(accepts(container({ mode }))).toBe(false);
    },
  );
});

describe("containers and leaves", () => {
  it("accepts a container holding children", () => {
    expect(accepts(container({ children: [leaf(), leaf()] }))).toBe(true);
  });

  it("accepts a container holding nothing at all", () => {
    expect(accepts(container({ children: [] }))).toBe(true);
  });

  it("reads a container with no children key as holding nothing", () => {
    const parsed = blockSchema.parse(without(container(), "children"));
    expect(asContainer(parsed).children).toEqual([]);
  });

  it("refuses children on a leaf", () => {
    expect(accepts(leaf({ children: [leaf()] }))).toBe(false);
  });

  it("strips children from a leaf when reading", () => {
    const parsed = lenientBlockSchema.parse(leaf({ children: [leaf()] }));
    expect(parsed).not.toHaveProperty("children");
  });

  it("refuses a container with no mode", () => {
    expect(accepts(without(container(), "mode"))).toBe(false);
  });

  it("accepts a container that names itself", () => {
    expect(accepts(container({ name_en: "About", name_es: "Acerca" }))).toBe(
      true,
    );
  });

  it("accepts a container with no name at all", () => {
    expect(accepts(container())).toBe(true);
  });
});

// The cap is pinned by its literal here, deliberately: writing these depths as
// `MAX_DEPTH + 1` would move with the constant, so raising the constant would
// change nothing and the guard could never be watched to fire.
describe("depth", () => {
  it("caps a tree three levels below the outermost block", () => {
    expect(MAX_DEPTH).toBe(3);
  });

  it("accepts a leaf at the top", () => {
    expect(accepts(leafAtDepth(0))).toBe(true);
  });

  it("accepts a leaf three containers down", () => {
    expect(accepts(leafAtDepth(3))).toBe(true);
  });

  // The guard the sabotage check drives. It is a schema refusal rather than a
  // separate walk — a container at the cap meets an option that refuses it by
  // name — so "too deep" cannot be forgotten by a caller.
  it("refuses a leaf four containers down", () => {
    expect(accepts(leafAtDepth(4))).toBe(false);
  });

  it("refuses a tree too deep when reading, too", () => {
    expect(lenientBlockSchema.safeParse(leafAtDepth(4)).success).toBe(false);
  });

  it("refuses a tree too deep anywhere in a page", () => {
    expect(acceptsPage([leaf(), leafAtDepth(4)])).toBe(false);
  });

  // The message is the contract, not an incidental. Without an option that
  // fails by name, a container one level too far is refused for naming a
  // `kind` no leaf has — so somebody who nested one too far is told their
  // block kind is invalid and their title is missing, neither of which they
  // got wrong. The literal is asserted here as well as the constant, so
  // changing the wording is a deliberate act that Task 3's SQL hears about.
  it("names the refusal after the fault", () => {
    expect(TOO_DEEP_MESSAGE).toBe("too deep");
  });

  it("says a tree is too deep rather than blaming the block's kind", () => {
    const issues = blockSchema.safeParse(leafAtDepth(4));
    expect(issues.success).toBe(false);
    expect(issues.error?.issues.map((issue) => issue.message)).toEqual([
      TOO_DEEP_MESSAGE,
    ]);
  });

  // **The read still refuses it, and still names it — one level in.** The
  // lenient schema is a `z.union` of the discriminated union and the
  // unknown-kind fallback, so its top-level message is the union's own
  // "Invalid input" and the named refusal is reported among the branch errors
  // beneath it. That is acceptable where the strict path's is not: the editor
  // reads the strict message and shows it to somebody, while every consumer of
  // a lenient parse treats any failure as "no page" and reads no message at
  // all. What must not change is that the tree is refused — which is
  // structural, since at the cap the container option is `tooDeepSchema` and
  // the fallback refuses every kind the vocabulary already names.
  it("says so when reading, too", () => {
    const parsed = lenientBlockSchema.safeParse(leafAtDepth(4));
    expect(parsed.success).toBe(false);
    expect(messagesOf(parsed.error?.issues ?? [])).toContain(TOO_DEEP_MESSAGE);
  });

  // The control for the case above: a legal tree parses, so "contains too
  // deep" is being read out of a real refusal rather than out of a schema that
  // refuses everything.
  it("reads a tree nested exactly to the cap", () => {
    expect(lenientBlockSchema.safeParse(leafAtDepth(3)).success).toBe(true);
  });

  it("points at the block that was too deep, not at the page", () => {
    const issues = blocksSchema.safeParse([leafAtDepth(4)]);
    expect(issues.error?.issues[0]?.path).toEqual([
      0,
      "children",
      0,
      "children",
      0,
      "children",
      0,
    ]);
  });

  // Containers are legal at depths 0, 1 and 2, so the deepest a leaf can sit is
  // depth 3 — three containers down, not two. Both of these once nested two and
  // named themselves for the cap they stopped short of, which mattered because
  // depth 3 is the only place `tooDeepSchema` joins the union: a leaf one level
  // higher never meets the option these tests exist to sit beside.
  const deepestLeaf = (kind: string) =>
    container({
      children: [
        container({ children: [container({ children: [leaf({ kind })] })] }),
      ],
    });

  it("still refuses a leaf kind it does not know at the deepest level", () => {
    expect(accepts(deepestLeaf("spreadsheet"))).toBe(false);
  });

  it("accepts every leaf kind at the deepest level", () => {
    for (const kind of LEAF_KINDS) {
      expect(accepts(deepestLeaf(kind))).toBe(true);
    }
  });
});

describe("a person's own writing", () => {
  it("refuses a leaf with no English title", () => {
    expect(accepts(without(leaf(), "title_en"))).toBe(false);
  });

  it("refuses a leaf whose English title is empty", () => {
    expect(accepts(leaf({ title_en: "" }))).toBe(false);
  });

  // **And READS one, which is the half that had to change.** The two schemas
  // disagree on purpose here: refusing an empty title on the write is the rule,
  // but refusing it on the read failed the WHOLE page — `parseBlocks` answers
  // `[]` for a failed parse, so one leaf three levels down showed a stranger
  // "nothing here yet" over a page full of content. That is the blast radius
  // `specialise` exists to prevent, and the leniency had only ever been
  // extended to unknown keys. The rule now lives where the write is
  // authorized: `0009` refuses a zero-length `title_en` beside its type check.
  it("still reads a leaf whose English title is empty", () => {
    expect(lenientBlockSchema.safeParse(leaf({ title_en: "" })).success).toBe(
      true,
    );
  });

  // The page-level version of the same case, which is where the damage was:
  // one empty title anywhere must cost that title and nothing else.
  it("reads a whole page rather than blanking it for one empty title", () => {
    const parsed = lenientBlocksSchema.parse([
      container({
        children: [container({ children: [leaf({ title_en: "" }), leaf()] })],
      }),
      container(),
    ]);
    expect(parsed).toHaveLength(2);
  });

  // The case that must never regress. These are somebody's own words about
  // their own character, not catalogue keys: not having written the Spanish
  // yet is an ordinary state and must never be reported as a fault.
  it("accepts a leaf with no Spanish title", () => {
    expect(accepts(without(leaf(), "title_es"))).toBe(true);
  });

  it("accepts a leaf with no description in either language", () => {
    const withoutSpanish = without(leaf(), "description_es");
    expect(accepts(without(withoutSpanish, "description_en"))).toBe(true);
  });

  it("reads a missing English description as empty", () => {
    const parsed = blockSchema.parse(without(leaf(), "description_en"));
    expect(parsed).toMatchObject({ description_en: "" });
  });

  it("accepts a container with no Spanish name", () => {
    expect(accepts(container({ name_en: "About" }))).toBe(true);
  });
});

describe("the fields every leaf keeps whatever its kind", () => {
  // `0009` accepts these on any item whatever the layout, so switching a
  // block's kind to look at it and switching back finds what was typed still
  // there. The editor decides which fields it OFFERS; the schema does not.
  it("accepts an address, a picture and an icon on a text leaf", () => {
    expect(
      accepts(
        leaf({
          icon: "star",
          image_url: "https://example.test/a.png",
          link_url: "https://example.test/",
        }),
      ),
    ).toBe(true);
  });

  it("accepts table rows on a leaf of another kind", () => {
    expect(accepts(leaf({ rows: [[cell()]] }))).toBe(true);
  });
});

describe("strict on write, lenient on read", () => {
  it("refuses a block key nothing reads", () => {
    expect(accepts(leaf({ headline: "A title" }))).toBe(false);
  });

  it("strips a block key nothing reads rather than refusing the block", () => {
    const parsed = lenientBlockSchema.parse(leaf({ headline: "A title" }));
    expect(parsed).not.toHaveProperty("headline");
    expect(parsed).toMatchObject({ title_en: "A title" });
  });

  it("refuses a style key nothing reads", () => {
    expect(accepts(leaf({ style: { corner_radius: "8px" } }))).toBe(false);
  });

  it("strips a style key nothing reads and keeps the rest", () => {
    const parsed = lenientBlockSchema.parse(
      leaf({ style: { skin: "glass", corner_radius: "8px" } }),
    );
    expect(parsed.style).toEqual({ skin: "glass" });
  });

  it("refuses a table cell key nothing reads", () => {
    expect(accepts(leaf({ rows: [[cell({ colour: "red" })]] }))).toBe(false);
  });

  it("strips a table cell key nothing reads", () => {
    const parsed = lenientBlockSchema.parse(
      leaf({ rows: [[cell({ colour: "red" })]] }),
    );
    expect(asLeaf(parsed).rows?.[0]?.[0]).toEqual({
      text_en: "A value",
      text_es: "Un valor",
    });
  });

  it("still refuses a block shape it does not recognise when reading", () => {
    const missingTitle = without(leaf(), "title_en");
    expect(lenientBlockSchema.safeParse(missingTitle).success).toBe(false);
  });

  // WHAT THE LENIENCY IS ACTUALLY FOR, AND WHAT IT DID NOT COVER FOR A WHOLE
  // BRANCH.
  //
  // The spec, the plan and `parseBlocks`' own TSDoc all justified the lenient
  // read by a deploy in which a new block KIND rolls out — the database ahead
  // of the deployment reading it. Measured against zod, that was false: a
  // discriminated union refuses an unrecognised discriminator, so one such
  // block failed the whole array and a stranger got "nothing here yet" over a
  // page full of content. The leniency covered unknown KEYS only, and
  // `blocks.tsx`'s `?? PlainLeaf` and `?? Stack` — written and documented for
  // exactly this case — were unreachable.
  describe("a kind or a mode this build does not know", () => {
    it("reads an unrecognised leaf kind rather than failing the block", () => {
      const parsed = lenientBlockSchema.safeParse(
        leaf({ kind: "hologram", title_en: "From the future" }),
      );
      expect(parsed.success).toBe(true);
      // Verbatim, because `data-block-kind` carries it and `LEAVES.get` is
      // what has to MISS. A kind rewritten to `text` here would render the
      // same and lie about what is stored.
      expect(asLeaf(parsed.data).kind).toBe("hologram");
      expect(asLeaf(parsed.data).title_en).toBe("From the future");
    });

    it("reads an unrecognised container mode rather than failing the page", () => {
      const parsed = lenientBlockSchema.safeParse(
        container({ mode: "spiral", children: [leaf()] }),
      );
      expect(parsed.success).toBe(true);
      expect(asContainer(parsed.data).mode).toBe("spiral");
      expect(asContainer(parsed.data).children).toHaveLength(1);
    });

    it("keeps the rest of a page when one block carries an unknown kind", () => {
      const parsed = lenientBlocksSchema.safeParse([
        container({ children: [leaf({ kind: "hologram" }), leaf()] }),
        container(),
      ]);
      expect(parsed.success).toBe(true);
      expect(parsed.data).toHaveLength(2);
    });

    // **A subtree the depth counter never walked must not arrive with it.**
    // The fallback is a LEAF, so `children` is an unknown key and is stripped
    // — which is what stops an unknown kind becoming a hole in the depth cap.
    it("strips the children of an unrecognised kind", () => {
      const parsed = lenientBlockSchema.safeParse({
        kind: "hologram",
        title_en: "t",
        children: [leaf(), leaf()],
      });
      expect(parsed.data).not.toHaveProperty("children");
    });

    // The three things the fallback must NOT admit, which is what keeps every
    // other guarantee intact. Without these it would be a hole rather than a
    // tolerance: it refuses every kind the vocabulary already names, so a
    // too-deep container still meets `tooDeepSchema` and a malformed leaf is
    // still refused as the kind it claims to be.
    it("does not admit a container that is too deep", () => {
      expect(lenientBlockSchema.safeParse(leafAtDepth(4)).success).toBe(false);
    });

    it("does not admit a malformed block of a kind it does know", () => {
      expect(
        lenientBlockSchema.safeParse(without(leaf(), "title_en")).success,
      ).toBe(false);
    });

    it("does not admit a block whose kind is not a string at all", () => {
      expect(lenientBlockSchema.safeParse(leaf({ kind: 7 })).success).toBe(
        false,
      );
    });

    // The write is where a typo is somebody's to fix, and the one moment they
    // are still looking at it. The tolerance is a read-path concession only.
    it("is refused on the write path", () => {
      expect(accepts(leaf({ kind: "hologram" }))).toBe(false);
      expect(accepts(container({ mode: "spiral" }))).toBe(false);
    });
  });

  it("strips an unknown key from a nested child when reading a page", () => {
    const parsed = lenientBlocksSchema.parse([
      container({ children: [leaf({ headline: "x" })] }),
    ]);
    expect(asContainer(parsed[0]).children[0]).not.toHaveProperty("headline");
  });
});

describe("a block's own form", () => {
  it("accepts a block with no style at all", () => {
    expect(accepts(leaf())).toBe(true);
  });

  it("accepts a style that sets only one thing", () => {
    expect(accepts(container({ style: { skin: "comic" } }))).toBe(true);
  });

  it.each(["cover", "tile"])("accepts the %s background fit", (fit) => {
    expect(accepts(leaf({ style: { background_fit: fit } }))).toBe(true);
  });

  it("refuses a background fit it does not render", () => {
    expect(accepts(leaf({ style: { background_fit: "parallax" } }))).toBe(
      false,
    );
  });

  it.each(["s", "m", "l"])("accepts the %s card size", (size) => {
    expect(accepts(leaf({ style: { card_size: size } }))).toBe(true);
  });

  it("refuses a card size it cannot render", () => {
    expect(accepts(leaf({ style: { card_size: "xl" } }))).toBe(false);
  });

  it.each(["solid", "dashed", "dotted", "double", "none"])(
    "accepts the %s border style",
    (border) => {
      expect(accepts(leaf({ style: { border } }))).toBe(true);
    },
  );

  it("refuses a border style it does not render", () => {
    expect(accepts(leaf({ style: { border: "groove" } }))).toBe(false);
  });

  it("accepts a skin name at the longest length allowed", () => {
    expect(accepts(leaf({ style: { skin: "x".repeat(32) } }))).toBe(true);
  });

  it("refuses a skin name one character over", () => {
    expect(accepts(leaf({ style: { skin: "x".repeat(33) } }))).toBe(false);
  });

  it("accepts a background address at the longest length allowed", () => {
    const base = "https://example.test/";
    const longest = base + "x".repeat(500 - base.length);
    expect(longest).toHaveLength(500);
    expect(accepts(leaf({ style: { background_url: longest } }))).toBe(true);
  });

  it("refuses a background address one character over", () => {
    const base = "https://example.test/";
    const tooLong = base + "x".repeat(501 - base.length);
    expect(tooLong).toHaveLength(501);
    expect(accepts(leaf({ style: { background_url: tooLong } }))).toBe(false);
  });
});

describe("tracks and span", () => {
  it("reads a container with no column count as a single track", () => {
    const parsed = blockSchema.parse(without(container(), "columns"));
    expect(asContainer(parsed).columns).toBe(1);
  });

  it("reads a block with no span as one track wide", () => {
    expect(blockSchema.parse(leaf()).span).toBe(1);
  });

  it.each(everyTrackCount())("accepts a span of %i", (span) => {
    expect(
      accepts(
        container({ columns: BLOCK_LIMITS.tracks, children: [leaf({ span })] }),
      ),
    ).toBe(true);
  });

  it.each(everyTrackCount())("accepts a column count of %i", (columns) => {
    expect(accepts(container({ columns }))).toBe(true);
  });

  it("refuses a span of nothing", () => {
    expect(accepts(leaf({ span: 0 }))).toBe(false);
  });

  it("refuses a negative span", () => {
    expect(accepts(leaf({ span: -1 }))).toBe(false);
  });

  it("refuses a span that is not a whole number", () => {
    expect(accepts(leaf({ span: 1.5 }))).toBe(false);
  });

  it("refuses a span wider than the vocabulary", () => {
    expect(accepts(leaf({ span: BLOCK_LIMITS.tracks + 1 }))).toBe(false);
  });

  it("refuses a column count of nothing", () => {
    expect(accepts(container({ columns: 0 }))).toBe(false);
  });

  it("refuses a column count that is not a whole number", () => {
    expect(accepts(container({ columns: 2.5 }))).toBe(false);
  });

  it("refuses more columns than the vocabulary has", () => {
    expect(accepts(container({ columns: BLOCK_LIMITS.tracks + 1 }))).toBe(
      false,
    );
  });

  // A block moved into a narrower container must not make the page unsavable:
  // refusing would mean somebody loses a whole page to a value they cannot
  // see. Narrowing the STORED value would satisfy that too, and it is the
  // wrong half — dragging the block back out could not restore what was
  // typed. The schema stores what was typed; `effectiveSpan` narrows it at
  // render, the same way `card_size` gates the field and never the value.
  it("accepts a span wider than its parent rather than refusing it", () => {
    expect(
      accepts(container({ columns: 2, children: [leaf({ span: 4 })] })),
    ).toBe(true);
  });

  it("stores a span wider than its parent exactly as it was typed", () => {
    const parsed = blockSchema.parse(
      container({ columns: 2, children: [leaf({ span: 4 })] }),
    );
    expect(asContainer(parsed).children[0]?.span).toBe(4);
  });

  it("stores a nested container's own too-wide span unchanged", () => {
    const parsed = blockSchema.parse(
      container({
        columns: 3,
        children: [container({ columns: 4, span: 4, children: [leaf()] })],
      }),
    );
    expect(asContainer(parsed).children[0]?.span).toBe(4);
  });

  // The page itself is the outermost container and it has one track: blocks at
  // the top stack down the page. That is a render-time fact and not a reason
  // to flatten what somebody typed, which could not be recovered by changing
  // PAGE_TRACKS later.
  it("stores a top-level span wider than the page unchanged", () => {
    expect(blocksSchema.parse([leaf({ span: 4 })])[0]?.span).toBe(4);
  });

  it("lays out a page one track wide", () => {
    expect(PAGE_TRACKS).toBe(1);
  });
});

describe("effectiveSpan", () => {
  it("narrows a span wider than its container", () => {
    expect(effectiveSpan(4, 2)).toBe(2);
  });

  it("leaves a span that already fits alone", () => {
    expect(effectiveSpan(3, 4)).toBe(3);
  });

  it("leaves a span that exactly fills its container alone", () => {
    expect(effectiveSpan(2, 2)).toBe(2);
  });

  it("narrows every span to one track at the top of a page", () => {
    const spans = everyTrackCount().map((span) =>
      effectiveSpan(span, PAGE_TRACKS),
    );
    expect(spans).toEqual(everyTrackCount().map(() => 1));
  });
});

describe("the limits", () => {
  it("accepts the most children a container may hold", () => {
    expect(
      accepts(container({ children: leaves(BLOCK_LIMITS.children) })),
    ).toBe(true);
  });

  it("refuses one child more", () => {
    expect(
      accepts(container({ children: leaves(BLOCK_LIMITS.children + 1) })),
    ).toBe(false);
  });

  it("accepts the longest text allowed", () => {
    expect(
      accepts(leaf({ description_en: "x".repeat(BLOCK_LIMITS.text) })),
    ).toBe(true);
  });

  it("refuses one character more", () => {
    const tooLong = "x".repeat(BLOCK_LIMITS.text + 1);
    expect(accepts(leaf({ description_en: tooLong }))).toBe(false);
  });

  it("accepts the widest table allowed", () => {
    const row = Array.from({ length: BLOCK_LIMITS.cells }, () => cell());
    expect(accepts(leaf({ kind: "table", rows: [row] }))).toBe(true);
  });

  it("refuses one cell more", () => {
    const row = Array.from({ length: BLOCK_LIMITS.cells + 1 }, () => cell());
    expect(accepts(leaf({ kind: "table", rows: [row] }))).toBe(false);
  });

  it("accepts the tallest table allowed", () => {
    const rows = Array.from({ length: BLOCK_LIMITS.rows }, () => [cell()]);
    expect(accepts(leaf({ kind: "table", rows }))).toBe(true);
  });

  it("refuses one row more", () => {
    const rows = Array.from({ length: BLOCK_LIMITS.rows + 1 }, () => [cell()]);
    expect(accepts(leaf({ kind: "table", rows }))).toBe(false);
  });

  it("accepts a cell with no Spanish text", () => {
    expect(accepts(leaf({ rows: [[without(cell(), "text_es")]] }))).toBe(true);
  });

  it("reads a cell with no English text as empty", () => {
    const parsed = blockSchema.parse(leaf({ rows: [[{}]] }));
    expect(asLeaf(parsed).rows?.[0]?.[0]).toEqual({ text_en: "" });
  });

  it("accepts an empty page", () => {
    expect(acceptsPage([])).toBe(true);
  });

  it("accepts a page of blocks", () => {
    expect(acceptsPage([container(), leaf()])).toBe(true);
  });

  it("refuses a page that is not a list of blocks at all", () => {
    expect(acceptsPage(leaf())).toBe(false);
  });

  it("accepts a page at exactly the block budget", () => {
    expect(acceptsPage(leaves(BLOCK_LIMITS.blocks))).toBe(true);
  });

  it("refuses one block more", () => {
    expect(acceptsPage(leaves(BLOCK_LIMITS.blocks + 1))).toBe(false);
  });

  // The budget is the whole tree, not the top of it. A page with few blocks at
  // the top and a great many inside them costs the same to render.
  it("counts blocks at every depth, not only at the top", () => {
    const full = container({ children: leaves(BLOCK_LIMITS.children) });
    const overBudget = Array.from(
      { length: Math.ceil(BLOCK_LIMITS.blocks / BLOCK_LIMITS.children) },
      () => full,
    );
    expect(overBudget.length).toBeLessThan(BLOCK_LIMITS.blocks);
    expect(refusalOf(overBudget)).toContain("too many blocks");
  });

  // The backstop. Every field here is legal on its own, the block budget is
  // nowhere near reached, and only the total is too large — which is exactly
  // what the byte cap is for.
  it("refuses a page that is legal block by block and far too large", () => {
    const fat = Array.from(
      { length: Math.ceil(BLOCK_LIMITS.bytes / BLOCK_LIMITS.text) },
      () =>
        leaf({
          description_en: "x".repeat(BLOCK_LIMITS.text),
          description_es: "y".repeat(BLOCK_LIMITS.text),
        }),
    );
    expect(fat.length).toBeLessThan(BLOCK_LIMITS.blocks);
    const refusals = refusalOf(fat);
    expect(refusals).toContain("blocks are too large");
    expect(refusals).not.toContain("too many blocks");
  });

  // **The cap is UTF-8 bytes, because Postgres's `octet_length` is.**
  // `String.length` counts UTF-16 code units and the two agree only for
  // ASCII — so this payload passes the old measure comfortably and exceeds
  // the real one by a wide margin. Spanish is this app's fallback language,
  // so accented text is the ordinary case; getting this wrong promises a save
  // the database then refuses, after the whole page has been written.
  it("measures the cap in bytes rather than in characters", () => {
    const accented = Array.from(
      { length: Math.ceil(BLOCK_LIMITS.bytes / (BLOCK_LIMITS.text * 4)) },
      () =>
        leaf({
          description_en: "á".repeat(BLOCK_LIMITS.text),
          description_es: "á".repeat(BLOCK_LIMITS.text),
        }),
    );
    const serialised = JSON.stringify(accented);
    expect(serialised.length).toBeLessThan(BLOCK_LIMITS.bytes);
    expect(new TextEncoder().encode(serialised).length).toBeGreaterThan(
      BLOCK_LIMITS.bytes,
    );
    expect(refusalOf(accented)).toContain("blocks are too large");
  });

  it("still accepts an accented page that fits in bytes", () => {
    expect(
      accepts(leaf({ description_en: "á".repeat(BLOCK_LIMITS.text) })),
    ).toBe(true);
  });

  it("reads a stored page leniently, stripping what it does not know", () => {
    const parsed = lenientBlocksSchema.parse([leaf({ headline: "x" })]);
    expect(parsed[0]).not.toHaveProperty("headline");
  });
});
