import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { admin, closePool, newSub, withClaims } from "./helpers";

afterAll(async () => {
  await closePool();
});

type Person = { personRef: string; number: string };

/**
 * Seeds a person with an address, without going through provisioning.
 *
 * Direct inserts because these suites need to control `status` and
 * `visibility`, which `ensure_person_actor` does not take.
 *
 * @param over - columns to set on the person row.
 * @returns the person's ref and their number address.
 */
async function seedPerson(over: Record<string, unknown> = {}): Promise<Person> {
  const personRef = randomUUID();
  const a = admin();

  const { error } = await a.from("actors").insert({
    actor_ref: personRef,
    kind: "person",
    identity_sub: newSub(),
    handle: `u-${randomUUID().replace(/-/g, "")}`,
    display_name: "A person",
    avatar_url: "https://example.test/p.png",
    visibility: "public",
    ...over,
  });
  if (error) throw error;

  // **Read, not invented.** A person's number is assigned by a trigger on the
  // insert above, so a fixture that made one up would now be a second number
  // for the same person — which the one-number-per-person index refuses, and
  // which is how this fixture announced that the invariant had moved.
  const { data, error: aErr } = await a
    .from("person_addresses")
    .select("address")
    .eq("actor_ref", personRef)
    .eq("kind", "number")
    .single();
  if (aErr) throw aErr;

  return { personRef, number: (data as { address: string }).address };
}

/**
 * Gives a person a fursona.
 *
 * @param ownerRef - who owns it.
 * @param over - columns to set on the fursona row.
 * @returns the fursona's ref and handle.
 */
async function seedFursona(
  ownerRef: string,
  over: Record<string, unknown> = {},
): Promise<{ sonaRef: string; handle: string }> {
  const sonaRef = randomUUID();
  // Resolved BEFORE the insert, not after. Reading it from the generated value
  // while `over` replaced it in the row handed callers a handle that was never
  // written — every assertion using it then looked up nothing and read as the
  // schema failing. Cost one CI cycle to find.
  const handle =
    (over.handle as string | undefined) ?? `s-${sonaRef.slice(0, 8)}`;
  const { error } = await admin()
    .from("actors")
    .insert({
      actor_ref: sonaRef,
      kind: "fursona",
      owner_ref: ownerRef,
      display_name: "A character",
      avatar_url: "https://example.test/f.png",
      visibility: "public",
      ...over,
      handle,
    });
  if (error) throw error;
  return { sonaRef, handle };
}

/** Reads a person's page exactly as an anonymous visitor's request would. */
const readPerson = (address: string) =>
  withClaims(null, async (c) =>
    c.query("select * from public.public_person($1)", [address]),
  );

/** Reads one fursona's page as an anonymous visitor. */
const readFursona = (address: string, handle: string) =>
  withClaims(null, async (c) =>
    c.query("select * from public.public_fursona($1, $2)", [address, handle]),
  );

const SECTIONS = [
  {
    name_en: "About",
    name_es: "Acerca de",
    type: "cards",
    sort_order: 1,
    items: [
      {
        title_en: "Species",
        title_es: "Especie",
        description_en: "A wolf.",
        description_es: "Un lobo.",
        sort_order: 1,
      },
    ],
  },
];

let owner: Person;
let vanity: string;
let sona: { sonaRef: string; handle: string };

beforeAll(async () => {
  owner = await seedPerson();
  vanity = `luna-${randomUUID().slice(0, 8)}`;
  const { error } = await admin()
    .from("person_addresses")
    .insert({ address: vanity, actor_ref: owner.personRef, kind: "vanity" });
  if (error) throw error;

  sona = await seedFursona(owner.personRef);

  const { error: pErr } = await admin()
    .from("actor_profiles")
    .insert({ actor_ref: sona.sonaRef, sections: SECTIONS });
  if (pErr) throw pErr;
});

describe("public_person", () => {
  it("answers for a public person by their number", async () => {
    const { rows } = await readPerson(owner.number);
    expect(rows).toHaveLength(1);
    expect(rows[0].display_name).toBe("A person");
  });

  // Both forms resolve, forever. A link shared under the number must not rot
  // because somebody was later granted a nicer address.
  it("answers identically by their vanity", async () => {
    const byNumber = (await readPerson(owner.number)).rows[0];
    const byVanity = (await readPerson(vanity)).rows[0];
    expect(byVanity).toEqual(byNumber);
  });

  it("resolves an address typed in the wrong case", async () => {
    const { rows } = await readPerson(vanity.toUpperCase());
    expect(rows).toHaveLength(1);
  });

  // The canonical one is the vanity when there is one, so the page can emit
  // rel="canonical" without a second query and one page does not accumulate two
  // indexed addresses.
  it("reports the vanity as the canonical address", async () => {
    expect((await readPerson(owner.number)).rows[0].address).toBe(vanity);
  });

  it("reports the number when there is no vanity", async () => {
    const plain = await seedPerson();
    expect((await readPerson(plain.number)).rows[0].address).toBe(plain.number);
  });

  it("carries the person's own sections", async () => {
    const p = await seedPerson();
    await admin()
      .from("actor_profiles")
      .insert({ actor_ref: p.personRef, sections: SECTIONS });
    expect((await readPerson(p.number)).rows[0].sections).toEqual(SECTIONS);
  });

  it("answers with no sections for a person who has written none", async () => {
    const p = await seedPerson();
    expect((await readPerson(p.number)).rows[0].sections).toEqual([]);
  });

  // THE LISTING RULE. "List the fursonas they own" is the natural
  // implementation and it destroys what `unlisted` means — a link somebody
  // chose not to publish would appear on a page anybody can read.
  describe("the fursona list", () => {
    it("holds only the public ones", async () => {
      const p = await seedPerson();
      const wanted = await seedFursona(p.personRef, { visibility: "public" });
      await seedFursona(p.personRef, { visibility: "unlisted" });
      await seedFursona(p.personRef, { visibility: "private" });
      await seedFursona(p.personRef, { status: "suspended" });
      await seedFursona(p.personRef, { status: "deleted" });

      const list = (await readPerson(p.number)).rows[0].fursonas as {
        handle: string;
      }[];
      expect(list.map((f) => f.handle)).toEqual([wanted.handle]);
    });

    it("is empty rather than null for somebody with none", async () => {
      const p = await seedPerson();
      expect((await readPerson(p.number)).rows[0].fursonas).toEqual([]);
    });

    it("never carries a linkability column", async () => {
      const list = (await readPerson(owner.number)).rows[0].fursonas as Record<
        string,
        unknown
      >[];
      for (const entry of list) {
        expect(entry).not.toHaveProperty("owner_ref");
        expect(entry).not.toHaveProperty("identity_sub");
        expect(entry).not.toHaveProperty("actor_ref");
      }
    });
  });

  describe("what it hides, all in the same way", () => {
    it("hides a private person", async () => {
      const p = await seedPerson({ visibility: "private" });
      expect((await readPerson(p.number)).rows).toHaveLength(0);
    });

    it("hides a suspended person", async () => {
      const p = await seedPerson({ status: "suspended" });
      expect((await readPerson(p.number)).rows).toHaveLength(0);
    });

    it("hides a deleted person", async () => {
      const p = await seedPerson({ status: "deleted" });
      expect((await readPerson(p.number)).rows).toHaveLength(0);
    });

    it("answers an unknown address with no rows", async () => {
      expect((await readPerson("nobody-has-this")).rows).toHaveLength(0);
    });
  });

  it("returns exactly the eight columns", async () => {
    const { rows } = await readPerson(owner.number);
    expect(Object.keys(rows[0]).sort()).toEqual([
      "address",
      "avatar_url",
      "display_name",
      "fursonas",
      "handle",
      "listed",
      "sections",
      "theme",
    ]);
  });
});

describe("public_fursona", () => {
  it("answers for a public fursona under its owner's address", async () => {
    const { rows } = await readFursona(owner.number, sona.handle);
    expect(rows).toHaveLength(1);
    expect(rows[0].display_name).toBe("A character");
    expect(rows[0].sections).toEqual(SECTIONS);
  });

  it("answers by the owner's vanity too", async () => {
    expect((await readFursona(vanity, sona.handle)).rows).toHaveLength(1);
  });

  it("resolves a handle typed in the wrong case", async () => {
    const { rows } = await readFursona(owner.number, sona.handle.toUpperCase());
    expect(rows).toHaveLength(1);
  });

  it("reports the owner's canonical address", async () => {
    expect(
      (await readFursona(owner.number, sona.handle)).rows[0].owner_address,
    ).toBe(vanity);
  });

  // Handles are unique PER OWNER, so the same handle under two addresses is two
  // different characters. Resolving one from the other would be the bug that
  // makes per-owner handles unsafe.
  it("resolves the handle within that person only", async () => {
    const other = await seedPerson();
    const mine = await seedFursona(owner.personRef, {
      handle: `shared-${randomUUID().slice(0, 6)}`,
      display_name: "Mine",
    });
    await seedFursona(other.personRef, {
      handle: mine.handle,
      display_name: "Theirs",
    });

    expect(
      (await readFursona(owner.number, mine.handle)).rows[0].display_name,
    ).toBe("Mine");
    expect(
      (await readFursona(other.number, mine.handle)).rows[0].display_name,
    ).toBe("Theirs");
  });

  it("answers nothing for a handle belonging to a different person", async () => {
    const stranger = await seedPerson();
    expect((await readFursona(stranger.number, sona.handle)).rows).toHaveLength(
      0,
    );
  });

  // Unlike the LIST, a fursona's own page serves `unlisted` — that is what
  // unlisted means: reachable by whoever holds the link, invisible to whoever
  // does not.
  it("serves an unlisted fursona's own page", async () => {
    const f = await seedFursona(owner.personRef, { visibility: "unlisted" });
    const { rows } = await readFursona(owner.number, f.handle);
    expect(rows).toHaveLength(1);
    expect(rows[0].listed).toBe(false);
  });

  it("marks a public fursona listed", async () => {
    expect((await readFursona(owner.number, sona.handle)).rows[0].listed).toBe(
      true,
    );
  });

  describe("what it hides, all in the same way", () => {
    it("hides a private fursona", async () => {
      const f = await seedFursona(owner.personRef, { visibility: "private" });
      expect((await readFursona(owner.number, f.handle)).rows).toHaveLength(0);
    });

    it("hides a suspended fursona", async () => {
      const f = await seedFursona(owner.personRef, { status: "suspended" });
      expect((await readFursona(owner.number, f.handle)).rows).toHaveLength(0);
    });

    it("hides a deleted fursona", async () => {
      const f = await seedFursona(owner.personRef, { status: "deleted" });
      expect((await readFursona(owner.number, f.handle)).rows).toHaveLength(0);
    });

    // The rule that exists nowhere else in the schema. A fursona whose OWNER is
    // suspended is itself still active, so `actors_public` would keep showing
    // it — a person carries the sanction and must not shed it by switching
    // persona, and this is the one place strangers actually look.
    it("hides an active fursona whose owner is suspended", async () => {
      const p = await seedPerson({ status: "suspended" });
      const f = await seedFursona(p.personRef);
      expect((await readFursona(p.number, f.handle)).rows).toHaveLength(0);
    });

    it("also hides that owner's own page", async () => {
      const p = await seedPerson({ status: "suspended" });
      expect((await readPerson(p.number)).rows).toHaveLength(0);
    });

    // THIS ASSERTION WAS REVERSED WHEN 0015 FOLDED INTO 0012, DELIBERATELY. It used to require the
    // owner's visibility to be public or unlisted, on the reasoning that a
    // private person's address should not become a directory of their
    // characters. That made a fursona's own `public` setting mean nothing: a
    // person is provisioned `private`, there is no interface to change it, so
    // every published fursona 404'd for a reason nobody could see or fix. The
    // first end-to-end test that created one through the real editor and read
    // it as a stranger failed on exactly this.
    //
    // A fursona's page obeys the FURSONA's visibility; the person's own profile
    // still obeys theirs. The owner's STATUS gates both, because a sanction is
    // not a preference.
    it("serves a published fursona of a private owner", async () => {
      const p = await seedPerson({ visibility: "private" });
      const f = await seedFursona(p.personRef);
      expect((await readFursona(p.number, f.handle)).rows).toHaveLength(1);
    });

    it("still hides that private owner's own profile", async () => {
      const p = await seedPerson({ visibility: "private" });
      await seedFursona(p.personRef);
      expect((await readPerson(p.number)).rows).toHaveLength(0);
    });

    it("answers an unknown handle with no rows", async () => {
      expect(
        (await readFursona(owner.number, "nobody-has-this")).rows,
      ).toHaveLength(0);
    });
  });

  it("returns exactly the seven columns", async () => {
    const { rows } = await readFursona(owner.number, sona.handle);
    expect(Object.keys(rows[0]).sort()).toEqual([
      "avatar_url",
      "display_name",
      "handle",
      "listed",
      "owner_address",
      "sections",
      "theme",
    ]);
  });

  it("never returns a linkability column or a raw state", async () => {
    const { rows } = await readFursona(owner.number, sona.handle);
    for (const column of [
      "identity_sub",
      "owner_ref",
      "actor_ref",
      "visibility",
      "status",
    ]) {
      expect(rows[0]).not.toHaveProperty(column);
    }
  });
});

// These are the FIRST functions in this schema anon may execute. Pinning two
// neighbours proves the grant is an exception somebody made on purpose rather
// than a habit spreading.
describe("the anon grant is an exception", () => {
  it("lets an anonymous caller execute both", async () => {
    await expect(readPerson(owner.number)).resolves.toBeDefined();
    await expect(readFursona(owner.number, sona.handle)).resolves.toBeDefined();
  });

  it("does not make my_actors reachable anonymously", async () => {
    await expect(
      withClaims(null, async (c) =>
        c.query("select 1 from public.my_actors() limit 1"),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it("does not make actors_public readable anonymously", async () => {
    await expect(
      withClaims(null, async (c) =>
        c.query("select 1 from public.actors_public limit 1"),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it("does not make person_addresses readable anonymously", async () => {
    await expect(
      withClaims(null, async (c) =>
        c.query("select 1 from public.person_addresses limit 1"),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});
