import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { admin, clientAs, closePool, newSub } from "./helpers";

/**
 * The migration this suite is the conformance proof of.
 *
 * Read rather than typed out, because a hand-kept copy of a growable list
 * drifts the moment somebody adds to the list and not to the copy. The
 * migration is the right source here because it is the authority the database
 * is built from, and it travels with this suite: a consuming app copies
 * `supabase/migrations/` and `tests/db/` together, so the path holds wherever
 * the pair lands.
 */
const MIGRATION = readFileSync(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../supabase/migrations/0009_actor_profiles.sql",
  ),
  "utf8",
);

/**
 * Every value one `in (...)` list in the migration declares.
 *
 * Throws rather than returning nothing when the function cannot be found: an
 * empty list here would make the cases below pass while proving nothing, which
 * is the one way a guard like this fails silently.
 *
 * @param fn - the function to read, unqualified.
 * @param parameter - the name of the parameter it tests, as in `p_kind`.
 * @returns the strings that function accepts.
 */
function declared(fn: string, parameter: string): string[] {
  const body = MIGRATION.match(
    new RegExp(
      `create or replace function public\\.${fn}[\\s\\S]*?select ${parameter} in \\(([\\s\\S]*?)\\)\\s*\\$\\$`,
    ),
  )?.[1];
  if (!body)
    throw new Error(
      `${fn} was not found in 0009_actor_profiles.sql. If it was renamed or ` +
        `its shape changed, every value below would go untested and this ` +
        `guard must be updated with it.`,
    );
  // Comments come out FIRST, and the anchor above is why the match reaches the
  // end of the list at all: the prose inside it carries both apostrophes and
  // closing parentheses, either of which a quote- or paren-matching pass over
  // the raw text would read as the end of a value or of the list.
  return [...body.replace(/--.*/g, "").matchAll(/'([^']+)'/g)]
    .map((match) => match[1])
    .filter((value): value is string => value !== undefined);
}

const DECLARED_KINDS = declared("is_block_kind", "p_kind");
const DECLARED_MODES = declared("is_container_mode", "p_mode");
const DECLARED_LEAF_KINDS = DECLARED_KINDS.filter(
  (kind) => kind !== "container",
);

type Person = { sub: string; personRef: string; sonaRef: string };

/**
 * Seeds a person and one active private fursona they own.
 *
 * @returns the identity, its person ref, and the fursona's actor ref.
 */
async function seedPerson(): Promise<Person> {
  const sub = newSub();
  const personRef = randomUUID();
  const sonaRef = randomUUID();
  const a = admin();

  const { error: pErr } = await a.from("actors").insert({
    actor_ref: personRef,
    kind: "person",
    identity_sub: sub,
    handle: `p-${personRef.slice(0, 8)}`,
  });
  if (pErr) throw pErr;

  const { error: sErr } = await a.from("actors").insert({
    actor_ref: sonaRef,
    kind: "fursona",
    owner_ref: personRef,
    handle: `s-${sonaRef.slice(0, 8)}`,
    visibility: "private",
  });
  if (sErr) throw sErr;

  return { sub, personRef, sonaRef };
}

/**
 * One well-formed leaf.
 *
 * @param over - fields to replace.
 * @returns the leaf.
 */
const leaf = (over: Record<string, unknown> = {}) => ({
  kind: "text",
  title_en: "A title",
  title_es: "Un título",
  description_en: "Some words.",
  description_es: "Unas palabras.",
  ...over,
});

/**
 * One well-formed container, holding a single leaf.
 *
 * It declares one place across, and the children it holds are deliberately
 * NOT tied to that: `spaces` is a width and children fill the places row by
 * row, so a case may hand it any number.
 *
 * @param over - fields to replace.
 * @returns the container.
 */
const container = (over: Record<string, unknown> = {}) => ({
  kind: "container",
  mode: "stack",
  spaces: 1,
  name_en: "About",
  name_es: "Acerca de",
  children: [leaf()],
  ...over,
});

/**
 * A run of empty spaces.
 *
 * @param count - how many.
 * @returns that many empty entries.
 */
const empties = (count: number) => Array.from({ length: count }, () => null);

/**
 * The smallest block the database will take, for the counting and sizing cases
 * where the fixtures have to stay well under the byte cap to prove anything
 * about the other one.
 *
 * @returns a leaf carrying nothing but what is required.
 */
const tiny = () => ({ kind: "text", title_en: "a" });

/**
 * A copy of an object without one key.
 *
 * A helper rather than destructuring the key into an unused variable, which
 * eslint rejects — and this reads as what the test means: the field is absent.
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
 * A run of blocks built from one factory.
 *
 * @param count - how many to build.
 * @param build - what each one is.
 * @returns the blocks.
 */
const many = <T>(count: number, build: (index: number) => T): T[] =>
  Array.from({ length: count }, (_, n) => build(n));

let alice: Person;
let mallory: Person;

beforeAll(async () => {
  alice = await seedPerson();
  mallory = await seedPerson();
});

afterAll(async () => {
  await closePool();
});

/**
 * Writes a page as the given identity.
 *
 * @param sub - the caller's identity subject.
 * @param actorRef - the actor to write to.
 * @param blocks - the value to write.
 * @returns the error message, or null when it succeeded.
 */
async function write(
  sub: string,
  actorRef: string,
  blocks: unknown,
): Promise<string | null> {
  // **The identity blocks are appended for every case that is not about
  // them.** A valid fursona page must carry `avatar`, `handle` and `owner`,
  // and threading those through fifty fixtures would bury what each one is
  // actually testing. Cases about the required rule itself call
  // `writeExactly` and bypass this.
  const withIdentity = Array.isArray(blocks)
    ? [...blocks, ...IDENTITY_BLOCKS]
    : blocks;
  return writeExactly(sub, actorRef, withIdentity);
}

/** The three leaves a fursona's page must carry, as their own sections. */
const IDENTITY_BLOCKS = ["avatar", "handle", "owner"].map((kind) => ({
  kind,
  title_en: kind,
  description_en: "",
}));

/** What a PERSON's page must carry instead: `fursonas` where `owner` was. */
const PERSON_IDENTITY_BLOCKS = ["avatar", "handle", "fursonas"].map((kind) => ({
  kind,
  title_en: kind,
  description_en: "",
}));

/**
 * Writes exactly what it is given, adding nothing.
 *
 * @param sub - the caller's identity subject.
 * @param actorRef - the actor to write to.
 * @param blocks - the value to write, verbatim.
 * @returns the error message, or null when it succeeded.
 */
async function writeExactly(
  sub: string,
  actorRef: string,
  blocks: unknown,
): Promise<string | null> {
  const c = await clientAs(sub);
  const { error } = await c.rpc("set_actor_sections", {
    p_actor_ref: actorRef,
    p_sections: blocks,
  });
  return error?.message ?? null;
}

/**
 * Reads back the page stored for an actor, as the service role.
 *
 * @param actorRef - the actor to read.
 * @returns whatever is stored.
 */
async function read(actorRef: string): Promise<unknown> {
  const sections = await readExactly(actorRef);
  // The mirror of `write`: it appends the identity blocks a valid page must
  // carry, so the assertions get back what the case actually wrote. Cases
  // about those blocks use `readExactly`.
  return Array.isArray(sections)
    ? sections.slice(0, sections.length - IDENTITY_BLOCKS.length)
    : sections;
}

/**
 * Reads back the page stored for an actor, verbatim.
 *
 * @param actorRef - the actor to read.
 * @returns whatever is stored, identity blocks included.
 */
async function readExactly(actorRef: string): Promise<unknown> {
  const { data, error } = await admin()
    .from("actor_profiles")
    .select("sections")
    .eq("actor_ref", actorRef)
    .single();
  if (error) throw error;
  return data.sections;
}

// Asserted before anything is driven through the function, for the same reason
// the client's own drift guard checks its regexes first: a pattern that quietly
// matched nothing would leave every case below iterating an empty list and
// passing forever.
describe("the vocabulary the migration declares", () => {
  it("finds the kinds", () => {
    expect(DECLARED_KINDS.length).toBeGreaterThan(0);
  });

  it("finds the modes", () => {
    expect(DECLARED_MODES.length).toBeGreaterThan(0);
  });

  // The one value the container/leaf split turns on. Were it missing from the
  // list, every container case below would be refused for an unknown kind and
  // the depth guard would never be reached at all.
  it("finds the container kind among them", () => {
    expect(DECLARED_KINDS).toContain("container");
  });

  it("finds leaf kinds beside it", () => {
    expect(DECLARED_LEAF_KINDS.length).toBeGreaterThan(0);
  });
});

describe("set_actor_sections", () => {
  it("stores a well-formed tree and reads it back unchanged", async () => {
    expect(await write(alice.sub, alice.sonaRef, [container()])).toBeNull();
    expect(await read(alice.sonaRef)).toEqual([container()]);
  });

  it("takes a leaf at the top level, with no container around it", async () => {
    expect(await write(alice.sub, alice.sonaRef, [leaf()])).toBeNull();
    expect(await read(alice.sonaRef)).toEqual([leaf()]);
  });

  // Replaces rather than appends. An editor sends the whole document every
  // save, so appending would double it on the second save.
  it("replaces what was there rather than appending", async () => {
    await write(alice.sub, alice.sonaRef, [container(), container()]);
    await write(alice.sub, alice.sonaRef, [container({ name_en: "Only" })]);
    expect(await read(alice.sonaRef)).toEqual([container({ name_en: "Only" })]);
  });

  // The profile row only exists once somebody arranges or writes something, so
  // this has to create it, exactly as set_fursona_order does.
  it("creates the profile row on first write", async () => {
    const fresh = await seedPerson();
    expect(await write(fresh.sub, fresh.sonaRef, [container()])).toBeNull();
    expect(await read(fresh.sonaRef)).toEqual([container()]);
  });

  it("refuses somebody else's fursona, saying nothing about why", async () => {
    const message = await write(mallory.sub, alice.sonaRef, [container()]);
    expect(message).toMatch(/fursona not found/i);
    expect(message).not.toMatch(/owner|permission|belongs/i);
  });

  // **THE SQLSTATE IS AN INTERFACE, and this is where it is proven.** The
  // editor classifies a refusal by code rather than by prose — it used to
  // match on the word "section", which every message stopped carrying the day
  // the model changed, so the commonest refusal threw past the handler and
  // showed the person nothing. `PageRefusedError` reads `error.code`, which
  // means the two codes below are a contract this suite has to hold: `22023`
  // for anything about the payload, `42501` for anything about who is asking.
  // A test on the client's side alone would only prove the client's mock.
  describe("the SQLSTATE a refusal carries", () => {
    /**
     * The code PostgREST reports for a write.
     *
     * @param sub - the caller's identity subject.
     * @param actorRef - the actor to write to.
     * @param blocks - the value to write.
     * @returns the SQLSTATE, or null when the write succeeded.
     */
    async function codeOf(
      sub: string,
      actorRef: string,
      blocks: unknown,
    ): Promise<string | null> {
      const c = await clientAs(sub);
      const { error } = await c.rpc("set_actor_sections", {
        p_actor_ref: actorRef,
        p_sections: blocks,
      });
      return error?.code ?? null;
    }

    /**
     * Four containers, which is one level past the cap.
     *
     * @returns the too-deep page.
     */
    const tooDeep = () => [
      container({
        children: [
          container({ children: [container({ children: [container()] })] }),
        ],
      }),
    ];

    it.each([
      ["an unknown kind", [{ kind: "nonsense", title_en: "x" }]],
      ["a container too deep", tooDeep()],
      ["a leaf with no title", [without(leaf(), "title_en")]],
      ["a page that is not an array", "nope"],
    ])("answers 22023 for %s", async (_name, blocks) => {
      expect(await codeOf(alice.sub, alice.sonaRef, blocks)).toBe("22023");
    });

    // The other code, so the pair is distinguishable rather than "everything
    // is 22023" — the editor must not report somebody else's fursona as a
    // problem with their own writing.
    it("answers 42501 for a fursona the caller does not own", async () => {
      expect(await codeOf(mallory.sub, alice.sonaRef, [container()])).toBe(
        "42501",
      );
    });

    // The control: a write that succeeds carries no code at all, so the cases
    // above are reading a refusal rather than a constant.
    it("answers nothing at all for a write that lands", async () => {
      // `codeOf` calls the RPC directly, so the page it sends has to be a
      // valid one on its own — the identity blocks `write` appends are not
      // added here.
      expect(
        await codeOf(alice.sub, alice.sonaRef, [
          container(),
          ...IDENTITY_BLOCKS,
        ]),
      ).toBeNull();
    });
  });

  // **`validate_block` IS the only way in, and until this it was not.**
  //
  // The grant on `actor_profiles` named no columns, and PostgREST exposes the
  // table, so a signed-in person could PATCH `sections` on a row they own and
  // set it to arbitrary `jsonb` with this function never invoked — no depth
  // cap, no byte cap, no block count, no vocabulary. Five places in this
  // repository call those caps "the guard this whole model rests on", which is
  // a sentence that has to be true in the file every consuming app copies.
  //
  // The grant names its columns now. These are what make that a guarantee
  // rather than a convention, and they belong in the conformance suite because
  // a consuming app copies this file along with the migration.
  describe("the only route to a page", () => {
    it("refuses a direct write to sections, even by the owner", async () => {
      const c = await clientAs(alice.sub);
      const { error } = await c
        .from("actor_profiles")
        .update({ sections: [{ kind: "nonsense" }] })
        .eq("actor_ref", alice.sonaRef);
      expect(error).not.toBeNull();
      expect(`${error?.message} ${error?.code}`).toMatch(
        /permission denied|42501/i,
      );
    });

    it("refuses a direct write to theme, even by the owner", async () => {
      const c = await clientAs(alice.sub);
      const { error } = await c
        .from("actor_profiles")
        .update({ theme: { accent: "#000000" } })
        .eq("actor_ref", alice.sonaRef);
      expect(error).not.toBeNull();
    });

    // The other half, without which the two above would be satisfied by a
    // grant that simply revoked everything: arranging is still a direct write
    // and must keep working, because that is what the column list exists to
    // keep rather than to close.
    it("still lets the owner arrange directly", async () => {
      const fresh = await seedPerson();
      const c = await clientAs(fresh.sub);
      const { error: seedError } = await c
        .from("actor_profiles")
        .insert({ actor_ref: fresh.sonaRef, sort_order: 1 });
      expect(seedError).toBeNull();

      const { error } = await c
        .from("actor_profiles")
        .update({ featured: true, sort_order: 2 })
        .eq("actor_ref", fresh.sonaRef);
      expect(error).toBeNull();
    });

    // And the page still arrives through the function, so what was closed is
    // the bypass rather than the feature.
    it("still lets the owner write a page through the function", async () => {
      expect(await write(alice.sub, alice.sonaRef, [container()])).toBeNull();
    });
  });

  it("defaults to an empty array for a row created by arranging", async () => {
    const fresh = await seedPerson();
    const c = await clientAs(fresh.sub);
    const { error } = await c.rpc("set_fursona_order", {
      p_actor_ref: fresh.sonaRef,
      p_sort_order: 1,
    });
    expect(error).toBeNull();
    expect(await read(fresh.sonaRef)).toEqual([]);
  });
});

describe("the vocabulary it accepts", () => {
  // **`fursonas` is excluded here and gets its own case below**, because a
  // page's required and refused kinds depend on the actor's kind: `fursonas`
  // has nothing to render on a fursona's page and is refused there, exactly as
  // `owner` is refused on a person's. Writing every kind to the fursona would
  // have reported that rule as "the vocabulary rejects fursonas", which is not
  // what it says.
  it.each(DECLARED_LEAF_KINDS.filter((k) => k !== "fursonas"))(
    "accepts the %s leaf",
    async (kind) => {
      expect(
        await write(alice.sub, alice.sonaRef, [leaf({ kind })]),
      ).toBeNull();
    },
  );

  it("accepts the fursonas leaf on a person's page, where it belongs", async () => {
    expect(
      await writeExactly(alice.sub, alice.personRef, [
        leaf({ kind: "fursonas" }),
        ...PERSON_IDENTITY_BLOCKS,
      ]),
    ).toBeNull();
  });

  it.each(DECLARED_MODES)("accepts a container in %s mode", async (mode) => {
    expect(
      await write(alice.sub, alice.sonaRef, [container({ mode })]),
    ).toBeNull();
  });

  it("refuses a kind nothing renders", async () => {
    const message = await write(alice.sub, alice.sonaRef, [
      leaf({ kind: "not-a-block" }),
    ]);
    // Names which block and which rule, because the editor has to tell
    // somebody what to fix. Unlike the ownership error, this is not a secret.
    expect(message).toMatch(/block 1:/i);
    expect(message).toMatch(/unknown kind/i);
  });

  // The regression for a fault the flat validator this replaces actually had:
  // `not is_section_type(NULL)` is NULL, not true, so `if` never fired and a
  // section carrying no type at all was accepted. Every list lookup here is
  // paired with a `jsonb_typeof` test that is TRUE — never NULL — when the key
  // is absent, and these two cases are what prove it.
  it("refuses a block with no kind at all", async () => {
    expect(
      await write(alice.sub, alice.sonaRef, [without(leaf(), "kind")]),
    ).toMatch(/unknown kind/i);
  });

  it("refuses a container with no mode at all", async () => {
    expect(
      await write(alice.sub, alice.sonaRef, [without(container(), "mode")]),
    ).toMatch(/unknown mode/i);
  });

  it("refuses a mode nothing arranges by", async () => {
    const message = await write(alice.sub, alice.sonaRef, [
      container({ mode: "kaleidoscope" }),
    ]);
    expect(message).toMatch(/block 1:/i);
    expect(message).toMatch(/unknown mode/i);
  });
});

describe("the shape it refuses", () => {
  it("refuses a value that is not an array", async () => {
    expect(await write(alice.sub, alice.sonaRef, { not: "an array" })).toMatch(
      /blocks must be an array/i,
    );
  });

  it("refuses a block that is not an object", async () => {
    expect(await write(alice.sub, alice.sonaRef, ["nope"])).toMatch(
      /block 1: must be an object/i,
    );
  });

  it("refuses a leaf with no English title", async () => {
    const message = await write(alice.sub, alice.sonaRef, [
      without(leaf(), "title_en"),
    ]);
    expect(message).toMatch(/block 1:/i);
    expect(message).toMatch(/title_en is required/i);
  });

  // **`jsonb_typeof` answers 'string' for `""`, so the type check alone let
  // this through** — and the client's read schema refused it, which answers a
  // failed parse with an EMPTY PAGE. One such leaf anywhere in a tree showed a
  // stranger "nothing here yet" over a page full of content. The read is a
  // floor now and this is the rule; a write that accepts a shape the model
  // calls illegal is how the two get to disagree in the first place.
  it("refuses a leaf whose English title is empty", async () => {
    const message = await write(alice.sub, alice.sonaRef, [
      leaf({ title_en: "" }),
    ]);
    expect(message).toMatch(/block 1:/i);
    expect(message).toMatch(/title_en is required/i);
  });

  // Nested, because the guard is inside the recursion and a rule that fired
  // only at the top would be worse than none — the path is what the editor
  // shows somebody.
  it("names the path of a nested leaf whose English title is empty", async () => {
    const message = await write(alice.sub, alice.sonaRef, [
      container({ children: [leaf(), leaf({ title_en: "" })] }),
    ]);
    expect(message).toMatch(/block 1\.2:/i);
    expect(message).toMatch(/title_en is required/i);
  });

  // The Spanish is the person's own writing, not a catalogue key. Not having
  // written it yet is an ordinary state, never an error.
  it("accepts a leaf with no Spanish title or description", async () => {
    const englishOnly = without(without(leaf(), "title_es"), "description_es");
    expect(await write(alice.sub, alice.sonaRef, [englishOnly])).toBeNull();
  });

  it("accepts a leaf with no description at all", async () => {
    expect(
      await write(alice.sub, alice.sonaRef, [
        without(without(leaf(), "description_en"), "description_es"),
      ]),
    ).toBeNull();
  });

  it("accepts a container with no name in either language", async () => {
    expect(
      await write(alice.sub, alice.sonaRef, [
        without(without(container(), "name_en"), "name_es"),
      ]),
    ).toBeNull();
  });

  it("accepts a container with no children key at all", async () => {
    expect(
      await write(alice.sub, alice.sonaRef, [without(container(), "children")]),
    ).toBeNull();
  });

  it("accepts a container with no children", async () => {
    expect(
      await write(alice.sub, alice.sonaRef, [container({ children: [] })]),
    ).toBeNull();
  });

  it("accepts a container whose every place is empty", async () => {
    expect(
      await write(alice.sub, alice.sonaRef, [
        container({ spaces: 3, children: empties(3) }),
      ]),
    ).toBeNull();
  });

  // **THE CASE THE WHOLE MODEL TURNS ON.** A place is positional: a shorter
  // list can say how many things there are and cannot say WHICH place is
  // empty, so an entry is a block or an explicit nothing — and the round trip
  // has to bring it back in the same position. A later "tidying" of the nulls
  // would pass every other case in this file.
  it("stores an empty place between two filled ones, in place", async () => {
    const page = [
      container({
        spaces: 3,
        children: [leaf(), null, leaf({ title_en: "third" })],
      }),
    ];
    expect(await write(alice.sub, alice.sonaRef, page)).toBeNull();
    expect(await read(alice.sonaRef)).toEqual(page);
  });

  // Legal and meaningless, and kept rather than trimmed: somebody is usually
  // about to fill it, and trimming would move whatever they put after it.
  it("stores a trailing empty place rather than trimming it", async () => {
    const page = [container({ spaces: 2, children: [leaf(), null, null] })];
    expect(await write(alice.sub, alice.sonaRef, page)).toBeNull();
    expect(await read(alice.sonaRef)).toEqual(page);
  });

  // **A width is not a total.** More children than places across is more
  // ROWS, which is what "it keeps extending down" asked for — and what an
  // equality rule between the two would have made unrepresentable.
  it("accepts more children than the container has places across", async () => {
    expect(
      await write(alice.sub, alice.sonaRef, [
        container({ spaces: 3, children: many(17, () => tiny()) }),
      ]),
    ).toBeNull();
  });

  it("accepts a part-filled last row", async () => {
    expect(
      await write(alice.sub, alice.sonaRef, [
        container({ spaces: 3, children: many(5, () => tiny()) }),
      ]),
    ).toBeNull();
  });

  it("accepts fewer children than the container has places across", async () => {
    expect(
      await write(alice.sub, alice.sonaRef, [
        container({ spaces: 4, children: [leaf()] }),
      ]),
    ).toBeNull();
  });

  it("refuses children that are not an array", async () => {
    expect(
      await write(alice.sub, alice.sonaRef, [container({ children: "nope" })]),
    ).toMatch(/children must be an array/i);
  });

  // An empty place is not a block, so nothing about it is walked and nothing
  // about it may be refused for the shape a block would have to have.
  it("walks past an empty place rather than refusing it as a block", async () => {
    expect(
      await write(alice.sub, alice.sonaRef, [
        container({ spaces: 2, children: [null, leaf()] }),
      ]),
    ).toBeNull();
  });

  // The path is what makes a tree's errors legible at all — an ordinal cannot
  // name a block inside one. Asserted on a block two levels down so a path
  // built from the wrong counter shows up as the wrong number rather than as
  // no number.
  it("names the path of the block it refuses", async () => {
    const message = await write(alice.sub, alice.sonaRef, [
      container(),
      container({
        children: [leaf(), leaf(), without(leaf(), "title_en")],
      }),
    ]);
    expect(message).toMatch(/block 2\.3:/);
  });
});

// The guard this whole model rests on, because `sections` is user-controlled
// jsonb reachable by any signed-in caller and a recursive walk with no counter
// is the shape that exhausts its own stack.
describe("the depth cap", () => {
  /**
   * A chain of containers with one leaf at the bottom.
   *
   * @param depth - how many containers to nest.
   * @returns the outermost container.
   */
  const nest = (depth: number): Record<string, unknown> =>
    depth === 1
      ? container({ children: [leaf()] })
      : container({ children: [nest(depth - 1)] });

  // Three containers deep is the deepest legal tree: a container at depth 0, 1
  // and 2, with leaves at depth 3. Written as a literal rather than computed
  // from anything the migration declares — an expectation derived from the
  // constant under test moves with a sabotage and proves nothing.
  it("accepts a container at the deepest legal level", async () => {
    expect(await write(alice.sub, alice.sonaRef, [nest(3)])).toBeNull();
  });

  it("refuses a container one level deeper", async () => {
    const message = await write(alice.sub, alice.sonaRef, [nest(4)]);
    expect(message).toMatch(/too deep/i);
    // The refusal names the container that was too deep, not its parent and
    // not the leaf under it. `TOO_DEEP_MESSAGE` in the client's schema carries
    // the same words, so the app and the database say one thing about one
    // payload.
    expect(message).toMatch(/block 1\.1\.1\.1:/);
  });

  // **The counter is on the container, not on what it holds.** An empty
  // container one level too deep carries nothing at all, so a guard that fired
  // on the contents rather than on the block would let this through — and the
  // recursion it bounds would then be bounded by the payload instead of by the
  // cap, which is the whole fault this guard exists to prevent.
  it("refuses a container that is too deep even when it is empty", async () => {
    // Four containers, so the innermost sits at depth 3 — the same level
    // `nest(4)` reaches, with nothing inside it. Counted deliberately rather
    // than reused from `nest`, and the first draft of this case had three:
    // that tree is legal, it was accepted, and the case passed as an
    // acceptance dressed up as a refusal.
    const empty = container({ children: [] });
    expect(
      await write(alice.sub, alice.sonaRef, [
        container({
          children: [
            container({ children: [container({ children: [empty] })] }),
          ],
        }),
      ]),
    ).toMatch(/too deep/i);
  });
});

describe("spaces", () => {
  it.each([1, 2, 3, 4, 5, 6])(
    "accepts a section %s places across",
    async (spaces) => {
      expect(
        await write(alice.sub, alice.sonaRef, [container({ spaces })]),
      ).toBeNull();
    },
  );

  it("accepts a container with no space count at all", async () => {
    expect(
      await write(alice.sub, alice.sonaRef, [without(container(), "spaces")]),
    ).toBeNull();
  });

  // Written as a literal rather than read out of the migration: an
  // expectation derived from the constant under test moves with a sabotage
  // and proves nothing.
  it("accepts the widest shape allowed", async () => {
    expect(
      await write(alice.sub, alice.sonaRef, [container({ spaces: 6 })]),
    ).toBeNull();
  });

  it("refuses one place more", async () => {
    expect(
      await write(alice.sub, alice.sonaRef, [container({ spaces: 7 })]),
    ).toMatch(/spaces must be a whole number from 1 to 6/i);
  });

  it.each([0, 1.5, -1])("refuses %s places across", async (spaces) => {
    expect(
      await write(alice.sub, alice.sonaRef, [container({ spaces })]),
    ).toMatch(/spaces must be a whole number/i);
  });

  it("refuses a space count written as a string", async () => {
    expect(
      await write(alice.sub, alice.sonaRef, [container({ spaces: "2" })]),
    ).toMatch(/spaces must be a whole number/i);
  });

  it("refuses a space count that is a boolean", async () => {
    expect(
      await write(alice.sub, alice.sonaRef, [container({ spaces: true })]),
    ).toMatch(/spaces must be a whole number/i);
  });

  // The one that matters most: JSON null reaches the check as a value rather
  // than as an absent key, and an absent key is legal — so the two must not
  // collapse into one answer. It is also the shape that makes a chain of
  // `and`s unsafe in SQL, which is why the check is a `case`.
  it("refuses a space count that is null, where an absent one is fine", async () => {
    expect(
      await write(alice.sub, alice.sonaRef, [container({ spaces: null })]),
    ).toMatch(/spaces must be a whole number/i);
  });

  // **`columns` and `span` are refused BY NAME rather than ignored.** Every
  // other stray key here costs only the bytes it occupies; these two carried
  // meaning that is gone, so a stale writer must hear about it rather than
  // have the page come back a shape nobody chose.
  it.each(["columns", "span"])(
    "refuses the old %s key on a container",
    async (key) => {
      const message = await write(alice.sub, alice.sonaRef, [
        container({ [key]: 2 }),
      ]);
      expect(message).toMatch(/block 1:/i);
      expect(message).toMatch(/columns and span were replaced by spaces/i);
    },
  );

  it("refuses the old span key on a leaf", async () => {
    expect(await write(alice.sub, alice.sonaRef, [leaf({ span: 2 })])).toMatch(
      /columns and span were replaced by spaces/i,
    );
  });
});

describe("weights", () => {
  it("stores a weight list whose length is the container's spaces", async () => {
    expect(
      await write(alice.sub, alice.sonaRef, [
        container({ spaces: 3, weights: [1, 3, 1], children: empties(3) }),
      ]),
    ).toBeNull();
  });

  // **Both directions, deliberately.** A weight list SHORTER than `spaces`
  // and one LONGER than it are not the same fixture: `<> p_length` refuses
  // both, but a sabotage that weakens the comparison to `< p_length` still
  // refuses a list that is too short while silently admitting one that is too
  // long. A single shorter-only case cannot tell the two apart — see rule 27
  // in the root CLAUDE.md — so this covers both sides of the count.
  it.each([
    { spaces: 3, weights: [1, 3] }, // shorter than spaces
    { spaces: 2, weights: [1, 3, 1] }, // longer than spaces
  ])(
    "refuses a weight list of the wrong length, by name ($spaces spaces, $weights.length shares)",
    async ({ spaces, weights }) => {
      expect(
        await write(alice.sub, alice.sonaRef, [
          container({ spaces, weights, children: empties(spaces) }),
        ]),
      ).toMatch(/weights must have one share per space/);
    },
  );

  // FINDING 4 (final whole-branch review, 2026-08-19): these two used to
  // match the generic /weights/, which the LENGTH message above also
  // satisfies — so a regression collapsing both messages into one would not
  // have reddened either case. Tightened to the message naming the real
  // cause, which is not "the wrong number of shares".
  it("refuses a share above the cap, naming the real cause", async () => {
    expect(
      await write(alice.sub, alice.sonaRef, [
        container({ spaces: 2, weights: [1, 7], children: empties(2) }),
      ]),
    ).toMatch(/a share must be a whole number from 1 to 6/);
  });

  it.each([
    [1, 0],
    [1, 1.5],
  ])(
    "refuses a share that is zero or fractional, naming the real cause (%j)",
    async (...bad) => {
      expect(
        await write(alice.sub, alice.sonaRef, [
          container({ spaces: 2, weights: bad, children: empties(2) }),
        ]),
      ).toMatch(/a share must be a whole number from 1 to 6/);
    },
  );

  it("stores weights on a mode that lays no tracks", async () => {
    // Dormant rather than refused: switching mode to look at a section and
    // switching back must not lose the shape.
    expect(
      await write(alice.sub, alice.sonaRef, [
        container({
          mode: "carousel",
          spaces: 2,
          weights: [1, 3],
          children: empties(2),
        }),
      ]),
    ).toBeNull();
  });

  // **`jsonb_array_elements` sits behind a `case`, and this is why.** It is a
  // set-returning function: fed something that is not an array it does not
  // answer false, it RAISES — the same evaluation-order hazard
  // `is_space_count`'s own comment documents. A stray string or number here
  // must come back as an ordinary refusal, not an unhandled database error.
  it("refuses a weight list written as a string, rather than raising", async () => {
    expect(
      await write(alice.sub, alice.sonaRef, [
        container({ spaces: 2, weights: "wide", children: empties(2) }),
      ]),
    ).toMatch(/weights/);
  });

  it("refuses a weight list written as a bare number, rather than raising", async () => {
    expect(
      await write(alice.sub, alice.sonaRef, [
        container({ spaces: 2, weights: 3, children: empties(2) }),
      ]),
    ).toMatch(/weights/);
  });
});

// The database side of the style bag. It is validated identically at every
// depth, because a nested container styles itself the way a section does — a
// section IS a container.
describe("the style bag it refuses", () => {
  it("accepts a well-formed style and reads it back unchanged", async () => {
    const style = {
      skin: "glass",
      background_url: "https://example.test/bg.png",
      background_fit: "cover",
      card_size: "m",
    };
    expect(
      await write(alice.sub, alice.sonaRef, [container({ style })]),
    ).toBeNull();
    expect(await read(alice.sonaRef)).toEqual([container({ style })]);
  });

  it("refuses a style that is not an object", async () => {
    const message = await write(alice.sub, alice.sonaRef, [
      leaf({ style: "not-an-object" }),
    ]);
    expect(message).toMatch(/block 1:/i);
    expect(message).toMatch(/style must be an object/i);
  });

  it("refuses a skin name over the limit", async () => {
    expect(
      await write(alice.sub, alice.sonaRef, [
        leaf({ style: { skin: "s".repeat(33) } }),
      ]),
    ).toMatch(/skin name is too long/i);
  });

  it("refuses a background address over the limit", async () => {
    expect(
      await write(alice.sub, alice.sonaRef, [
        leaf({
          style: { background_url: `https://example.test/${"a".repeat(500)}` },
        }),
      ]),
    ).toMatch(/background address is too long/i);
  });

  it("refuses a background fit it does not render", async () => {
    expect(
      await write(alice.sub, alice.sonaRef, [
        leaf({ style: { background_fit: "parallax" } }),
      ]),
    ).toMatch(/unknown background fit/i);
  });

  it("refuses a card size it cannot render", async () => {
    expect(
      await write(alice.sub, alice.sonaRef, [
        leaf({ style: { card_size: "xl" } }),
      ]),
    ).toMatch(/unknown card size/i);
  });

  it.each(["solid", "dashed", "dotted", "double", "none"])(
    "accepts the %s border style and reads it back unchanged",
    async (border) => {
      const style = { border };
      expect(
        await write(alice.sub, alice.sonaRef, [leaf({ style })]),
      ).toBeNull();
      expect(await read(alice.sonaRef)).toEqual([leaf({ style })]);
    },
  );

  it("refuses a border style it cannot render", async () => {
    expect(
      await write(alice.sub, alice.sonaRef, [
        leaf({ style: { border: "groove" } }),
      ]),
    ).toMatch(/unknown border style/i);
  });

  it.each(["cover", "contain"])(
    "accepts the %s picture fit and reads it back unchanged",
    async (image_fit) => {
      const style = { image_fit };
      expect(
        await write(alice.sub, alice.sonaRef, [leaf({ style })]),
      ).toBeNull();
      expect(await read(alice.sonaRef)).toEqual([leaf({ style })]);
    },
  );

  it("refuses a picture fit it cannot render", async () => {
    expect(
      await write(alice.sub, alice.sonaRef, [
        leaf({ style: { image_fit: "fill" } }),
      ]),
    ).toMatch(/unknown image fit/i);
  });

  it.each(["square", "soft", "round"])(
    "accepts the %s corner and reads it back unchanged",
    async (radius) => {
      const style = { radius };
      expect(
        await write(alice.sub, alice.sonaRef, [leaf({ style })]),
      ).toBeNull();
      expect(await read(alice.sonaRef)).toEqual([leaf({ style })]);
    },
  );

  it("refuses a corner it cannot render", async () => {
    expect(
      await write(alice.sub, alice.sonaRef, [
        leaf({ style: { radius: "pill" } }),
      ]),
    ).toMatch(/unknown corner radius/i);
  });

  // The third heading value, added beside `plain` and `bar`. A vocabulary
  // written down in two languages needs the case that says so — see the root
  // note's rule 30, which this is the seventh instance of.
  it("accepts the gradient heading and reads it back unchanged", async () => {
    const style = { heading: "gradient" };
    expect(await write(alice.sub, alice.sonaRef, [leaf({ style })])).toBeNull();
    expect(await read(alice.sonaRef)).toEqual([leaf({ style })]);
  });

  it.each(["snug", "roomy"])(
    "accepts the %s heading padding and reads it back unchanged",
    async (heading_pad) => {
      const style = { heading_pad };
      expect(
        await write(alice.sub, alice.sonaRef, [leaf({ style })]),
      ).toBeNull();
      expect(await read(alice.sonaRef)).toEqual([leaf({ style })]);
    },
  );

  it("refuses a heading padding it cannot render", async () => {
    expect(
      await write(alice.sub, alice.sonaRef, [
        leaf({ style: { heading_pad: "huge" } }),
      ]),
    ).toMatch(/unknown heading padding/i);
  });

  it("refuses a style key nothing reads", async () => {
    expect(
      await write(alice.sub, alice.sonaRef, [
        leaf({ style: { corner_radius: "8px" } }),
      ]),
    ).toMatch(/unknown style key/i);
  });

  // `jsonb_each_text` yields SQL NULL, not the string "null", for a JSON null
  // value — so `length(NULL) > 32` and `NULL not in (…)` are themselves NULL,
  // and neither `raise exception` fires. The guard sits above the key-by-key
  // branches rather than inside any one of them, so each new key is covered by
  // it without a change to the guard itself.
  it.each(["skin", "background_url", "background_fit", "card_size", "border"])(
    "refuses a null %s rather than silently storing it",
    async (key) => {
      expect(
        await write(alice.sub, alice.sonaRef, [
          leaf({ style: { [key]: null } }),
        ]),
      ).toMatch(/must not be null/i);
    },
  );

  it("validates a nested container's style, not only a section's", async () => {
    const message = await write(alice.sub, alice.sonaRef, [
      container({
        children: [container({ style: { card_size: "xl" }, children: [] })],
      }),
    ]);
    expect(message).toMatch(/block 1\.1:/);
    expect(message).toMatch(/unknown card size/i);
  });
});

// The rows of a `table` leaf. Validated for every block that carries one
// rather than only for a `table`, because the client stores what was typed
// when a kind changes and an array reached by no cap at all is what this
// exists to prevent.
describe("a table's rows", () => {
  const ROWS_MAX = 50;
  const CELLS_MAX = 8;

  /**
   * A table of blank cells.
   *
   * @param rows - how many rows.
   * @param cells - how many cells in each.
   * @returns the rows.
   */
  const table = (rows: number, cells: number) =>
    many(rows, () => many(cells, () => ({ text_en: "a", text_es: "b" })));

  it("accepts the most rows allowed", async () => {
    expect(
      await write(alice.sub, alice.sonaRef, [
        leaf({ kind: "table", rows: table(ROWS_MAX, 2) }),
      ]),
    ).toBeNull();
  });

  it("refuses one row more", async () => {
    expect(
      await write(alice.sub, alice.sonaRef, [
        leaf({ kind: "table", rows: table(ROWS_MAX + 1, 2) }),
      ]),
    ).toMatch(/too many rows/i);
  });

  it("accepts the most cells allowed in a row", async () => {
    expect(
      await write(alice.sub, alice.sonaRef, [
        leaf({ kind: "table", rows: table(2, CELLS_MAX) }),
      ]),
    ).toBeNull();
  });

  it("refuses one cell more, naming the row", async () => {
    const message = await write(alice.sub, alice.sonaRef, [
      leaf({
        kind: "table",
        rows: [...table(1, 2), ...table(1, CELLS_MAX + 1)],
      }),
    ]);
    expect(message).toMatch(/block 1, row 2:/);
    expect(message).toMatch(/too many cells/i);
  });

  it("refuses rows that are not an array", async () => {
    expect(
      await write(alice.sub, alice.sonaRef, [
        leaf({ kind: "table", rows: "nope" }),
      ]),
    ).toMatch(/rows must be an array/i);
  });

  it("refuses a row that is not an array", async () => {
    expect(
      await write(alice.sub, alice.sonaRef, [
        leaf({ kind: "table", rows: ["nope"] }),
      ]),
    ).toMatch(/block 1, row 1: must be an array/i);
  });

  it("refuses a cell that is not an object", async () => {
    expect(
      await write(alice.sub, alice.sonaRef, [
        leaf({ kind: "table", rows: [["nope"]] }),
      ]),
    ).toMatch(/a cell must be an object/i);
  });

  it("refuses cell text over the character cap", async () => {
    expect(
      await write(alice.sub, alice.sonaRef, [
        leaf({ kind: "table", rows: [[{ text_en: "x".repeat(2001) }]] }),
      ]),
    ).toMatch(/cell text is too long/i);
  });

  // **A mark beside the row, stored on the row's first cell.** Named rather
  // than checked against a list, exactly like a leaf's own `icon`: the
  // renderer answers a name lucide does not have with nothing at all, so a
  // stranger's page cannot be taken down by a value from an older row.
  it("keeps a cell's mark and reads it back unchanged", async () => {
    const rows = [[{ text_en: "Species", icon: "paw-print" }]];
    expect(
      await write(alice.sub, alice.sonaRef, [leaf({ kind: "table", rows })]),
    ).toBeNull();
    expect(await read(alice.sonaRef)).toEqual([leaf({ kind: "table", rows })]);
  });

  it("refuses a cell mark over the character cap", async () => {
    expect(
      await write(alice.sub, alice.sonaRef, [
        leaf({ kind: "table", rows: [[{ icon: "x".repeat(2001) }]] }),
      ]),
    ).toMatch(/cell icon is too long/i);
  });

  // A blank row is a real row — a table with a gap in it is an ordinary
  // table — so neither an empty row nor an empty table is a fault.
  it("accepts a row with no cells", async () => {
    expect(
      await write(alice.sub, alice.sonaRef, [
        leaf({ kind: "table", rows: [[], []] }),
      ]),
    ).toBeNull();
  });

  it("accepts a table with no rows", async () => {
    expect(
      await write(alice.sub, alice.sonaRef, [
        leaf({ kind: "table", rows: [] }),
      ]),
    ).toBeNull();
  });
});

// A jsonb reachable by any signed-in caller is the same hazard the fursona
// quota closed, and worse: a fursona row costs a handle, a page costs storage
// on every write with no natural ceiling. Each number below is a product knob
// rather than a safety law — nothing else depends on it.
describe("the limits", () => {
  // **A separate number from `spaces`, which is a width.** This bounds the
  // content across every row of a container, and it is where the bound on
  // the recursion actually is — the client's own cap cannot do it, because
  // zod parses an array's elements before applying its `.max()`.
  const CHILDREN_MAX = 50;
  const TEXT_MAX = 2000;

  it("accepts the most children allowed in a container", async () => {
    expect(
      await write(alice.sub, alice.sonaRef, [
        container({ children: many(CHILDREN_MAX, () => tiny()) }),
      ]),
    ).toBeNull();
  });

  it("refuses one child more", async () => {
    expect(
      await write(alice.sub, alice.sonaRef, [
        container({ children: many(CHILDREN_MAX + 1, () => tiny()) }),
      ]),
    ).toMatch(/too many children/i);
  });

  it("accepts the longest text allowed", async () => {
    expect(
      await write(alice.sub, alice.sonaRef, [
        leaf({ description_en: "x".repeat(TEXT_MAX) }),
      ]),
    ).toBeNull();
  });

  it("refuses one character more", async () => {
    expect(
      await write(alice.sub, alice.sonaRef, [
        leaf({ description_en: "x".repeat(TEXT_MAX + 1) }),
      ]),
    ).toMatch(/text is too long/i);
  });

  it("caps a container's name by the same rule", async () => {
    expect(
      await write(alice.sub, alice.sonaRef, [
        container({ name_en: "x".repeat(TEXT_MAX + 1) }),
      ]),
    ).toMatch(/text is too long/i);
  });

  // **Counted at every depth, not at the top.** Ten containers of forty-nine
  // leaves is ten blocks by the wrong measure and five hundred by the right
  // one, which is why both fixtures here are trees rather than flat lists —
  // a top-level count would accept them both.
  it("accepts the most blocks allowed, counting every depth", async () => {
    // **The identity blocks come OUT of the budget, never on top of it.** This
    // case is about the cap being exactly 500, so the page must total exactly
    // 500 with the three the page is required to carry among them: ten
    // containers of forty-nine children is 10 + 490, and three of those
    // children ARE the identity leaves.
    //
    // Putting them at depth 1 rather than at the top is deliberate — it means
    // this case also fails if `block_kinds_present` stops recursing.
    const page = many(10, (i: number) => ({
      kind: "container",
      mode: "stack",
      spaces: 3,
      children:
        i === 0
          ? [...many(46, () => tiny()), ...IDENTITY_BLOCKS]
          : many(49, () => tiny()),
    }));
    expect(await writeExactly(alice.sub, alice.sonaRef, page)).toBeNull();
  });

  it("refuses a tree over the block cap", async () => {
    const page = many(11, () => ({
      kind: "container",
      mode: "stack",
      spaces: 3,
      children: many(45, () => tiny()),
    }));
    expect(await write(alice.sub, alice.sonaRef, page)).toMatch(
      /too many blocks/i,
    );
  });

  // **An empty place is not a block.** The budget bounds what has to be
  // rendered and a place with nothing in it renders nothing, so a page of
  // wide-open sections must not be refused for blocks it does not hold. Ten
  // sections of fifty empty places are ten blocks by the right measure and
  // five hundred and ten by the wrong one.
  it("does not count an empty place against the block budget", async () => {
    const page = many(10, () => ({
      kind: "container",
      mode: "stack",
      spaces: 3,
      children: empties(50),
    }));
    expect(await write(alice.sub, alice.sonaRef, page)).toBeNull();
  });
});

// The backstop that does not depend on getting the field rules right. Every
// individual value in these fixtures is legal; only the total is not.
describe("the byte cap", () => {
  const TEXT_MAX = 2000;

  /**
   * A leaf carrying two fields of the longest text allowed.
   *
   * @param character - what to fill them with.
   * @returns the leaf, serialising to a little over four thousand characters.
   */
  const fat = (character: string) => ({
    kind: "text",
    title_en: character.repeat(TEXT_MAX),
    description_en: character.repeat(TEXT_MAX),
  });

  it("accepts a page just under the cap", async () => {
    expect(
      await write(
        alice.sub,
        alice.sonaRef,
        many(16, () => fat("x")),
      ),
    ).toBeNull();
  });

  it("refuses a page that is legal field by field and far too large", async () => {
    expect(
      await write(
        alice.sub,
        alice.sonaRef,
        many(17, () => fat("x")),
      ),
    ).toMatch(/too large/i);
  });

  // **The unit, measured rather than assumed.** This page is about 36,400
  // CHARACTERS — comfortably under the cap — and about 72,400 BYTES, well
  // over it, because every character in it is two bytes in UTF-8. A validator
  // measuring `length()` accepts it; one measuring `octet_length` refuses it.
  // The client measures the same thing with `TextEncoder`, and this is the
  // case that proves the two agree. Spanish is this app's fallback language,
  // so accented text is the ordinary case rather than the edge one.
  it("measures bytes, not characters", async () => {
    expect(
      await write(
        alice.sub,
        alice.sonaRef,
        many(9, () => fat("á")),
      ),
    ).toMatch(/too large/i);
  });
});

// **The rule that a page must name its actor, enforced where it cannot be
// bypassed.** `sections` is user-controlled `jsonb` and `set_actor_sections`
// is its only writer, so this is the layer the guarantee actually rests on —
// the save boundary and the editor refuse the same trees earlier, for a better
// message, and neither of them is a guarantee.
describe("the blocks a page must carry", () => {
  const identity = (kind: string) => leaf({ kind, title_en: kind });

  it("refuses a fursona page with no portrait", async () => {
    const message = await writeExactly(alice.sub, alice.sonaRef, [
      identity("handle"),
      identity("owner"),
    ]);
    expect(message).toMatch(/missing required blocks/);
    expect(message).toContain("avatar");
  });

  // Every missing kind, not just the first: somebody who removed two blocks
  // should be told about two.
  it("names every missing kind", async () => {
    const message = await writeExactly(alice.sub, alice.sonaRef, [
      identity("avatar"),
    ]);
    expect(message).toContain("handle");
    expect(message).toContain("owner");
  });

  it("accepts a page carrying all three", async () => {
    expect(
      await writeExactly(alice.sub, alice.sonaRef, IDENTITY_BLOCKS),
    ).toBeNull();
  });

  // **Found at any depth.** A rule that only looked at the top level would
  // refuse this, and a page whose author nested their portrait inside a
  // section is the ordinary case rather than an exotic one.
  it("finds a required block nested two levels down", async () => {
    expect(
      await writeExactly(alice.sub, alice.sonaRef, [
        {
          kind: "container",
          mode: "stack",
          spaces: 1,
          children: [
            {
              kind: "container",
              mode: "stack",
              spaces: 1,
              children: IDENTITY_BLOCKS,
            },
          ],
        },
      ]),
    ).toBeNull();
  });

  // **This case asserts the hole is OPEN, and it is not a mistake.**
  //
  // `accordion` renders each child as a `<details>` with no `open` attribute,
  // so a required block inside one satisfies every layer of this rule and
  // shows a visitor nothing. That was weighed against putting the ownership
  // fact in the page chrome — outside the skin's scope, derived from the row,
  // un-styleable — and declined: the ruling is that every part of the page
  // belongs to its owner.
  //
  // Written down as a PASSING test so that nobody reads the enforcement above
  // and concludes it guarantees visibility. If that ruling is ever reversed,
  // this test is what has to change, deliberately.
  it("accepts a required block hidden inside a collapsed accordion", async () => {
    expect(
      await writeExactly(alice.sub, alice.sonaRef, [
        {
          kind: "container",
          mode: "accordion",
          spaces: 1,
          children: IDENTITY_BLOCKS,
        },
      ]),
    ).toBeNull();
  });

  // The rule is kind-dependent and both halves are asserted, because a single
  // case cannot tell "fursonas is required" from "fursonas is required on a
  // person's page".
  it("refuses an owner block on a person's page", async () => {
    const message = await writeExactly(alice.sub, alice.personRef, [
      ...PERSON_IDENTITY_BLOCKS,
      identity("owner"),
    ]);
    expect(message).toMatch(/cannot carry/);
    expect(message).toContain("owner");
  });

  it("refuses a fursonas block on a fursona's page", async () => {
    const message = await writeExactly(alice.sub, alice.sonaRef, [
      ...IDENTITY_BLOCKS,
      identity("fursonas"),
    ]);
    expect(message).toMatch(/cannot carry/);
    expect(message).toContain("fursonas");
  });

  it("requires fursonas rather than owner on a person's page", async () => {
    expect(
      await writeExactly(alice.sub, alice.personRef, PERSON_IDENTITY_BLOCKS),
    ).toBeNull();
    const message = await writeExactly(alice.sub, alice.personRef, [
      identity("avatar"),
      identity("handle"),
    ]);
    expect(message).toContain("fursonas");
  });
});

// **`bleed` is a BOOLEAN, and the string is the case that matters.** The
// validator walks the style bag with `jsonb_each_text`, which renders `true`
// as the string 'true' — exactly what a form control hands back when somebody
// forgets to convert it. A check written against that text would accept both
// and disagree with the client schema while appearing to agree.
describe("the bleed style key", () => {
  const styled = (bleed: unknown) => [
    { ...container(), style: { bleed } },
    ...IDENTITY_BLOCKS,
  ];

  it("accepts true and false", async () => {
    expect(
      await writeExactly(alice.sub, alice.sonaRef, styled(true)),
    ).toBeNull();
    expect(
      await writeExactly(alice.sub, alice.sonaRef, styled(false)),
    ).toBeNull();
  });

  it("refuses the STRING true", async () => {
    expect(
      await writeExactly(alice.sub, alice.sonaRef, styled("true")),
    ).toMatch(/bleed must be true or false/);
  });

  it("refuses a number", async () => {
    expect(await writeExactly(alice.sub, alice.sonaRef, styled(1))).toMatch(
      /bleed must be true or false/,
    );
  });

  // Stored at any depth even though only depth 0 reads it: refusing it deeper
  // would make moving a section INTO another one fail on a style it carried
  // legitimately a moment earlier.
  it("stores it on a nested container too", async () => {
    expect(
      await writeExactly(alice.sub, alice.sonaRef, [
        {
          ...container(),
          children: [{ ...container(), style: { bleed: true } }],
        },
        ...IDENTITY_BLOCKS,
      ]),
    ).toBeNull();
  });
});

// **`margins` is a BOOLEAN, and the string is the case that matters** — the
// same reason `bleed`'s is, one polarity over: absent means the page's ordinary
// chrome, so a `'false'` mistaken for the boolean would strip the chrome from a
// page whose author never asked for that, and it is exactly what a checkbox
// hands back unconverted.
describe("the margins style key", () => {
  const styled = (margins: unknown) => [
    { ...container(), style: { margins } },
    ...IDENTITY_BLOCKS,
  ];

  it("accepts true and false", async () => {
    expect(
      await writeExactly(alice.sub, alice.sonaRef, styled(true)),
    ).toBeNull();
    expect(
      await writeExactly(alice.sub, alice.sonaRef, styled(false)),
    ).toBeNull();
  });

  it("refuses a string and a number", async () => {
    expect(
      await writeExactly(alice.sub, alice.sonaRef, styled("false")),
    ).toMatch(/margins must be true or false/);
    expect(await writeExactly(alice.sub, alice.sonaRef, styled(0))).toMatch(
      /margins must be true or false/,
    );
  });

  // Stored at any depth even though only depth 0 reads it: refusing it deeper
  // would make moving a section INTO another one fail on a style it carried
  // legitimately a moment earlier.
  it("stores it on a nested container too", async () => {
    expect(
      await writeExactly(alice.sub, alice.sonaRef, [
        {
          ...container(),
          children: [{ ...container(), style: { margins: false } }],
        },
        ...IDENTITY_BLOCKS,
      ]),
    ).toBeNull();
  });
});
