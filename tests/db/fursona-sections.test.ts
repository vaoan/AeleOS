import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { admin, clientAs, closePool, newSub } from "./helpers";

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
 * One well-formed item.
 *
 * @param over - fields to replace.
 * @returns the item.
 */
const item = (over: Record<string, unknown> = {}) => ({
  title_en: "A title",
  title_es: "Un título",
  description_en: "Some words.",
  description_es: "Unas palabras.",
  sort_order: 1,
  ...over,
});

/**
 * One well-formed section.
 *
 * @param over - fields to replace.
 * @returns the section.
 */
const section = (over: Record<string, unknown> = {}) => ({
  name_en: "About",
  name_es: "Acerca de",
  type: "cards",
  sort_order: 1,
  items: [item()],
  ...over,
});

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
 * Writes sections as the given identity.
 *
 * @param sub - the caller's identity subject.
 * @param actorRef - the fursona to write to.
 * @param sections - the value to write.
 * @returns the error message, or null when it succeeded.
 */
async function write(
  sub: string,
  actorRef: string,
  sections: unknown,
): Promise<string | null> {
  const c = await clientAs(sub);
  const { error } = await c.rpc("set_actor_sections", {
    p_actor_ref: actorRef,
    p_sections: sections,
  });
  return error?.message ?? null;
}

/**
 * Reads back the sections stored for a fursona, as the service role.
 *
 * @param actorRef - the fursona to read.
 * @returns whatever is stored.
 */
async function read(actorRef: string): Promise<unknown> {
  const { data, error } = await admin()
    .from("actor_profiles")
    .select("sections")
    .eq("actor_ref", actorRef)
    .single();
  if (error) throw error;
  return data.sections;
}

describe("set_actor_sections", () => {
  it("stores a well-formed array and reads it back unchanged", async () => {
    expect(await write(alice.sub, alice.sonaRef, [section()])).toBeNull();
    expect(await read(alice.sonaRef)).toEqual([section()]);
  });

  // Replaces rather than appends. An editor sends the whole document every
  // save, so appending would double it on the second save.
  it("replaces what was there rather than appending", async () => {
    await write(alice.sub, alice.sonaRef, [
      section(),
      section({ sort_order: 2 }),
    ]);
    await write(alice.sub, alice.sonaRef, [section({ name_en: "Only" })]);
    expect(await read(alice.sonaRef)).toEqual([section({ name_en: "Only" })]);
  });

  // The profile row only exists once somebody arranges or writes something,
  // so this has to create it, exactly as set_fursona_order does.
  it("creates the profile row on first write", async () => {
    const fresh = await seedPerson();
    expect(await write(fresh.sub, fresh.sonaRef, [section()])).toBeNull();
    expect(await read(fresh.sonaRef)).toEqual([section()]);
  });

  it("refuses somebody else's fursona, saying nothing about why", async () => {
    const message = await write(mallory.sub, alice.sonaRef, [section()]);
    expect(message).toMatch(/fursona not found/i);
    expect(message).not.toMatch(/owner|permission|belongs/i);
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

describe("the shape it refuses", () => {
  it("refuses a sections value that is not an array", async () => {
    expect(await write(alice.sub, alice.sonaRef, { not: "an array" })).toMatch(
      /sections must be an array/i,
    );
  });

  it("refuses a section that is not an object", async () => {
    expect(await write(alice.sub, alice.sonaRef, ["nope"])).toMatch(
      /section 1/i,
    );
  });

  // The value must be one nobody would plausibly ADD. It was `carousel`, which
  // became a real layout — at which point this asserted the opposite of its
  // name. A name that could not be a layout is the point, not one that merely
  // is not a layout yet.
  it("refuses an unknown section type", async () => {
    const message = await write(alice.sub, alice.sonaRef, [
      section({ type: "not-a-layout" }),
    ]);
    // Names which section and which rule, because the editor has to tell
    // somebody what to fix. Unlike the ownership error, this is not a secret.
    expect(message).toMatch(/section 1/i);
    expect(message).toMatch(/type/i);
  });

  it("refuses a section with no English name", async () => {
    expect(
      await write(alice.sub, alice.sonaRef, [without(section(), "name_en")]),
    ).toMatch(/section 1/i);
  });

  // The Spanish is the person's own writing, not a catalogue key. Not having
  // written it yet is an ordinary state, never an error.
  it("accepts a section with no Spanish name", async () => {
    expect(
      await write(alice.sub, alice.sonaRef, [without(section(), "name_es")]),
    ).toBeNull();
  });

  it("accepts an item with no Spanish title or description", async () => {
    const englishOnly = without(without(item(), "title_es"), "description_es");
    expect(
      await write(alice.sub, alice.sonaRef, [
        section({ items: [englishOnly] }),
      ]),
    ).toBeNull();
  });

  it("refuses items that are not an array", async () => {
    expect(
      await write(alice.sub, alice.sonaRef, [section({ items: "nope" })]),
    ).toMatch(/section 1/i);
  });

  it("refuses an item with no English title", async () => {
    const message = await write(alice.sub, alice.sonaRef, [
      section({ items: [without(item(), "title_en")] }),
    ]);
    expect(message).toMatch(/section 1/i);
    expect(message).toMatch(/item 1/i);
  });

  it("accepts a section with no items at all", async () => {
    expect(
      await write(alice.sub, alice.sonaRef, [section({ items: [] })]),
    ).toBeNull();
  });

  it("accepts every one of the four types", async () => {
    for (const type of ["cards", "accordion", "two-column", "gallery"]) {
      expect(
        await write(alice.sub, alice.sonaRef, [section({ type })]),
      ).toBeNull();
    }
  });
});

// A jsonb reachable by any signed-in caller is the same hazard 0011's quota
// closed, and worse: a fursona row costs a handle, a sections blob costs
// storage on every write with no natural ceiling. Each number below is a
// product knob rather than a safety law — nothing else depends on it.
describe("the limits", () => {
  const SECTIONS_MAX = 20;
  const ITEMS_MAX = 50;
  const TEXT_MAX = 2000;

  /**
   * A run of well-formed sections.
   *
   * @param count - how many to build.
   * @returns the sections.
   */
  const sections = (count: number) =>
    Array.from({ length: count }, (_, n) => section({ sort_order: n + 1 }));

  /**
   * A run of well-formed items.
   *
   * @param count - how many to build.
   * @returns the items.
   */
  const items = (count: number) =>
    Array.from({ length: count }, (_, n) => item({ sort_order: n + 1 }));

  it("accepts the most sections allowed", async () => {
    expect(
      await write(alice.sub, alice.sonaRef, sections(SECTIONS_MAX)),
    ).toBeNull();
  });

  it("refuses one section more", async () => {
    expect(
      await write(alice.sub, alice.sonaRef, sections(SECTIONS_MAX + 1)),
    ).toMatch(/too many sections/i);
  });

  it("accepts the most items allowed in a section", async () => {
    expect(
      await write(alice.sub, alice.sonaRef, [
        section({ items: items(ITEMS_MAX) }),
      ]),
    ).toBeNull();
  });

  it("refuses one item more", async () => {
    const message = await write(alice.sub, alice.sonaRef, [
      section({ items: items(ITEMS_MAX + 1) }),
    ]);
    expect(message).toMatch(/section 1/i);
    expect(message).toMatch(/too many items/i);
  });

  it("accepts the longest text allowed", async () => {
    expect(
      await write(alice.sub, alice.sonaRef, [
        section({ items: [item({ description_en: "x".repeat(TEXT_MAX) })] }),
      ]),
    ).toBeNull();
  });

  it("refuses one character more", async () => {
    const message = await write(alice.sub, alice.sonaRef, [
      section({ items: [item({ description_en: "x".repeat(TEXT_MAX + 1) })] }),
    ]);
    expect(message).toMatch(/too long/i);
  });

  // The backstop that does not depend on getting the field rules right. Every
  // individual value here is legal; only the total is not.
  it("refuses a payload that is legal field by field but far too large", async () => {
    const fat = Array.from({ length: SECTIONS_MAX }, (_, n) =>
      section({
        sort_order: n + 1,
        items: Array.from({ length: ITEMS_MAX }, (__, m) =>
          item({
            sort_order: m + 1,
            description_en: "x".repeat(TEXT_MAX),
            description_es: "y".repeat(TEXT_MAX),
          }),
        ),
      }),
    );
    expect(await write(alice.sub, alice.sonaRef, fat)).toMatch(/too large/i);
  });
});
