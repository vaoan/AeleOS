import { describe, expect, it } from "vitest";
import {
  REQUIRED_KINDS,
  defaultIdentitySection,
  holdsNothingAuthored,
  missingRequiredKinds,
  withRequiredBlocks,
} from "@/features/actors/domain/required-blocks";
import {
  blocksSchema,
  type Block,
  type ContainerBlock,
} from "@/features/actors/domain/block-schema";
import { DEFAULT_THEME } from "@/features/actors/domain/actor-theme";

/** A leaf of the given kind. */
const leaf = (kind: string): Block =>
  ({
    kind,
    title_en: "A label",
    description_en: "",
  }) as Block;

/** A container holding the given children. */
const box = (children: (Block | null)[], spaces = 1): ContainerBlock => ({
  kind: "container",
  mode: "grid",
  spaces,
  children,
});

describe("missingRequiredKinds", () => {
  // **The fixture buries the block as deep and as late as the model allows.**
  // A required kind sitting first at depth 0 cannot tell "found it anywhere"
  // from "looked only at the top" — both answers are the same page. This one
  // puts it in the LAST place of the LAST section, two levels down.
  it("finds a required kind nested at the cap", () => {
    const page: Block[] = [
      box([leaf("text")]),
      box([leaf("text"), box([leaf("text"), leaf("avatar")], 2)], 2),
      box([leaf("handle"), leaf("fursonas")], 2),
    ];
    expect(missingRequiredKinds(page, "person")).toEqual([]);
  });

  it("names every missing kind, not just the first", () => {
    expect(missingRequiredKinds([leaf("text")], "person")).toEqual([
      "avatar",
      "handle",
      "fursonas",
    ]);
  });

  // An empty place is `null` in `children` and is not a block. A walk that
  // assumed every entry was an object would throw on the commonest page there
  // is — one with a gap somebody left deliberately.
  it("walks past empty places", () => {
    const page: Block[] = [
      box([null, leaf("avatar"), null], 3),
      box([leaf("handle"), null, leaf("fursonas")], 3),
    ];
    expect(missingRequiredKinds(page, "person")).toEqual([]);
  });

  // **The two kinds are page-kind-specific and opposite.** A single fixture
  // asserting "fursonas is required" cannot tell a kind-dependent rule from a
  // rule that requires it everywhere; this pair can.
  it("requires fursonas on a person and owner on a fursona", () => {
    const shared: Block[] = [box([leaf("avatar"), leaf("handle")], 2)];
    expect(missingRequiredKinds(shared, "person")).toEqual(["fursonas"]);
    expect(missingRequiredKinds(shared, "fursona")).toEqual(["owner"]);
  });

  it("does not count a container's own kind as a leaf kind", () => {
    expect(missingRequiredKinds([box([])], "person")).toEqual([
      ...REQUIRED_KINDS.person,
    ]);
  });
});

describe("defaultIdentitySection", () => {
  // **Parsed by the real schema, not shape-checked by hand.** A fixture
  // asserting `spaces === 2` would pass while producing a tree the write
  // refuses — the failure would surface as somebody's first save being
  // rejected on a page they did not build.
  it.each(["person", "fursona"] as const)(
    "produces a %s section the write schema accepts",
    (kind) => {
      const result = blocksSchema.safeParse(withRequiredBlocks([], kind));
      expect(result.error).toBeUndefined();
      expect(result.success).toBe(true);
    },
  );

  it.each(["person", "fursona"] as const)(
    "satisfies its own required set for a %s",
    (kind) => {
      expect(missingRequiredKinds(withRequiredBlocks([], kind), kind)).toEqual(
        [],
      );
    },
  );

  it("carries the owner on a fursona and the fursona list on a person", () => {
    const person = JSON.stringify(withRequiredBlocks([], "person"));
    const fursona = JSON.stringify(withRequiredBlocks([], "fursona"));
    expect(person).toContain('"fursonas"');
    expect(person).not.toContain('"owner"');
    expect(fursona).toContain('"owner"');
    expect(fursona).not.toContain('"fursonas"');
  });

  it("is a section — a container at depth 0", () => {
    expect(defaultIdentitySection("person").kind).toBe("container");
  });
});

describe("withRequiredBlocks", () => {
  // **The very array, by reference.** The editor decides a page is dirty by
  // comparing what it read against what it holds; a shim that rebuilt an
  // already-complete page would mark every page dirty the moment it opened,
  // and "you have unsaved changes" would mean nothing.
  it("returns the same array when nothing is missing", () => {
    const page = withRequiredBlocks([], "person");
    expect(withRequiredBlocks(page, "person")).toBe(page);
  });

  it("keeps what was already there, in order", () => {
    const written = [box([leaf("text")]), box([leaf("quote")])];
    const result = withRequiredBlocks(written, "person");
    expect(result).toEqual(expect.arrayContaining(written));
    expect(result.length).toBeGreaterThan(written.length);
  });

  // A page that already names a required kind must not gain a second copy of
  // it: the rule is at-least-one, and a shim that prepended unconditionally
  // would duplicate somebody's portrait every time they opened the editor.
  it("adds nothing for a kind the page already has", () => {
    const page = withRequiredBlocks([], "fursona");
    const twice = JSON.stringify(withRequiredBlocks(page, "fursona"));
    expect(twice.split('"avatar"')).toHaveLength(2);
  });

  // **A PARTIAL page gets only what it lacks, never the whole header.**
  // Somebody who deleted their handle block still has the portrait they kept,
  // and handing back the composed section would stand a second portrait beside
  // it. Coverage found this: the branch was unreachable by any test, and the
  // behaviour behind it was wrong rather than merely untested.
  it("adds only the missing leaf when some identity blocks survive", () => {
    const kept: Block[] = [box([leaf("avatar"), leaf("fursonas")], 2)];
    const result = JSON.stringify(withRequiredBlocks(kept, "person"));
    expect(result.split('"avatar"')).toHaveLength(2);
    expect(result).toContain('"handle"');
    // The composed section carries a `name` leaf; a partial repair must not.
    expect(result).not.toContain('"name"');
  });

  it("adds only the owner when a fursona has everything else", () => {
    const kept: Block[] = [box([leaf("avatar"), leaf("handle")], 2)];
    const result = JSON.stringify(withRequiredBlocks(kept, "fursona"));
    expect(result.split('"avatar"')).toHaveLength(2);
    expect(result).toContain('"owner"');
    expect(result).not.toContain('"name"');
  });

  it("adds only the fursona list when a person has a header already", () => {
    const kept: Block[] = [box([leaf("avatar"), leaf("handle")], 2)];
    const result = JSON.stringify(withRequiredBlocks(kept, "person"));
    expect(result).toContain('"fursonas"');
    expect(result).not.toContain('"name"');
  });
});

// WHAT THE TEMPLATE PICKER'S CONFIRMATION IS ACTUALLY PROTECTING.
//
// It used to ask "does this page have any sections", which stopped meaning
// anything the moment every page opened carrying its required blocks: a brand
// new fursona would have warned its owner that applying a template replaces
// work they had not done. The question is whether anything on the page is
// THEIRS.
describe("holdsNothingAuthored", () => {
  it.each(["fursona", "person"] as const)(
    "recognises what a new %s page opens with",
    (kind) => {
      expect(holdsNothingAuthored(withRequiredBlocks([], kind), kind)).toBe(
        true,
      );
    },
  );

  // An empty page has nothing of theirs either, and answering no here would
  // put the confirmation in front of the emptiest page there is. Production
  // never reaches this state — every read path seeds the scaffold — but the
  // answer has to be right rather than merely unreachable.
  it("counts an empty page as holding nothing of theirs", () => {
    expect(holdsNothingAuthored([], "fursona")).toBe(true);
  });

  // **A LOOK is the author's work too, and the blocks cannot see it.** Somebody
  // may have picked colours and touched nothing else; the page is then still
  // byte-for-byte the scaffold, and replacing it would take their palette with
  // it. Before this the picker applied without asking, because it asked the
  // wrong question.
  it("counts a chosen theme as the author's work", () => {
    const scaffold = withRequiredBlocks([], "fursona");
    expect(holdsNothingAuthored(scaffold, "fursona")).toBe(true);

    expect(
      holdsNothingAuthored(scaffold, "fursona", {
        ...DEFAULT_THEME,
        accent: "#e21233",
      }),
    ).toBe(false);
  });

  // **Anti-vacuity, and it is the half that discriminates.** The case above
  // must go false because the theme is CUSTOMISED, not merely because a theme
  // was passed — an implementation reading `theme !== undefined` would satisfy
  // it and be wrong about every page that opens with a default.
  it("does not count an untouched theme", () => {
    const scaffold = withRequiredBlocks([], "fursona");
    expect(holdsNothingAuthored(scaffold, "fursona", DEFAULT_THEME)).toBe(true);
    expect(holdsNothingAuthored(scaffold, "fursona", null)).toBe(true);
  });

  it.each([
    [
      "a section of their own beside it",
      (page: Block[]) => [...page, box([leaf("text")])],
    ],
    [
      "a section of their own before it",
      (page: Block[]) => [box([leaf("text")]), ...page],
    ],
    ["nothing but their own writing", () => [box([leaf("text")])]],
  ])("treats %s as the author's", (_what, make) => {
    const page = make(withRequiredBlocks([], "fursona"));
    expect(holdsNothingAuthored(page, "fursona")).toBe(false);
  });

  // The edit that changes no COUNT — which is the one a length check would
  // have called untouched, and the reason this compares the shape.
  it("treats a retitled identity block as the author's", () => {
    const page = withRequiredBlocks([], "fursona");
    const edited = JSON.parse(JSON.stringify(page)) as ContainerBlock[];
    edited[0]!.name_en = "Me";
    expect(holdsNothingAuthored(edited, "fursona")).toBe(false);
  });

  // A person's scaffold is not a fursona's — it carries `fursonas` where the
  // other carries `owner` — so asking with the wrong kind must not answer yes.
  it("answers per kind", () => {
    expect(
      holdsNothingAuthored(withRequiredBlocks([], "person"), "fursona"),
    ).toBe(false);
  });
});
