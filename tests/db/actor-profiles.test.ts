import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { admin, clientAs, closePool, newSub } from "./helpers";

afterAll(async () => {
  await closePool();
});

/**
 * Provisions a person and gives them one active fursona.
 *
 * @returns the identity, the person's ref, and the fursona's ref.
 */
async function seed(): Promise<{
  sub: string;
  personRef: string;
  sonaRef: string;
}> {
  const sub = newSub();
  const c = await clientAs(sub);
  const { data: personRef, error } = await c.rpc("ensure_person_actor");
  if (error) throw error;

  const sonaRef = randomUUID();
  const { error: sErr } = await admin()
    .from("actors")
    .insert({
      actor_ref: sonaRef,
      kind: "fursona",
      owner_ref: personRef as string,
      handle: `s-${sonaRef.slice(0, 8)}`,
    });
  if (sErr) throw sErr;

  return { sub, personRef: personRef as string, sonaRef };
}

/**
 * One well-formed page, the shape the editor sends: a section is a container
 * at depth 0 carrying a name, and what is in it are leaves.
 *
 * The shape is pinned by `tests/db/blocks.test.ts`; what this file is about is
 * WHO may write one, so it needs only a value the validator accepts.
 */
const SECTIONS = [
  {
    kind: "container",
    mode: "stack",
    spaces: 1,
    name_en: "About me",
    name_es: "Sobre mí",
    children: [
      {
        kind: "text",
        title_en: "Who I am",
        title_es: "Quién soy",
        description_en: "Some words.",
        description_es: "Unas palabras.",
      },
    ],
  },
];

/**
 * The identity leaves a page of each actor kind must carry.
 *
 * **This file is about WHO may write a page, not what one contains**, so the
 * required blocks are appended rather than written into `SECTIONS`: a fixture
 * carrying them inline would make every case here look like it was about them.
 * `tests/db/blocks.test.ts` is where the rule itself is pinned.
 */
const IDENTITY: Record<"person" | "fursona", unknown[]> = {
  person: ["avatar", "handle", "fursonas"],
  fursona: ["avatar", "handle", "owner"],
} as unknown as Record<"person" | "fursona", unknown[]>;

/**
 * Writes sections as somebody.
 *
 * @param sub - whose token to use.
 * @param actorRef - whose page to write.
 * @param kind - which kind of actor's page it is, deciding which identity
 *   blocks the page must carry to be accepted at all.
 * @returns the error, or null.
 */
async function setSections(
  sub: string,
  actorRef: string,
  kind: "person" | "fursona",
): Promise<{ message: string } | null> {
  const c = await clientAs(sub);
  const { error } = await c.rpc("set_actor_sections", {
    p_actor_ref: actorRef,
    p_sections: [
      ...SECTIONS,
      ...(IDENTITY[kind] as string[]).map((k) => ({
        kind: k,
        title_en: k,
        description_en: "",
      })),
    ],
  });
  return error;
}

describe("actor_profiles", () => {
  // The capability that did not exist. A person's profile page is a page like
  // any other, so sections stopped belonging to fursonas — duplicating the
  // table to say so would give one concept two schemas.
  describe("a person's own page", () => {
    it("lets a person write their own sections", async () => {
      const { sub, personRef } = await seed();
      expect(await setSections(sub, personRef, "person")).toBeNull();
    });

    it("reads them back", async () => {
      const { sub, personRef } = await seed();
      await setSections(sub, personRef, "person");

      const c = await clientAs(sub);
      const { data, error } = await c
        .from("actor_profiles")
        .select("sections")
        .eq("actor_ref", personRef)
        .single();

      expect(error).toBeNull();
      // What this case is about is that the row round-trips for its owner.
      // The identity blocks the write appends are the page's, not this
      // fixture's, so it asserts the fixture survived rather than pinning the
      // whole array — which would be asserting the required-block rule here
      // instead of in the suite that owns it.
      expect((data as { sections: unknown }).sections).toEqual(
        expect.arrayContaining(SECTIONS),
      );
    });

    it("refuses somebody else's person page", async () => {
      const mallory = await seed();
      const alice = await seed();
      expect(
        (await setSections(mallory.sub, alice.personRef, "person"))?.message,
      ).toMatch(/not found/i);
    });
  });

  describe("a fursona's page, unchanged", () => {
    it("lets an owner write their fursona's sections", async () => {
      const { sub, sonaRef } = await seed();
      expect(await setSections(sub, sonaRef, "fursona")).toBeNull();
    });

    it("refuses somebody else's fursona", async () => {
      const mallory = await seed();
      const alice = await seed();
      expect(
        (await setSections(mallory.sub, alice.sonaRef, "fursona"))?.message,
      ).toMatch(/not found/i);
    });
  });

  // Ordering and pinning stay FURSONA concepts. A person has nothing to be
  // ordered among — there is exactly one of them — so generalising the
  // ownership test for sections must not accidentally generalise these.
  describe("arrangement is still fursona-only", () => {
    it("refuses to order a person", async () => {
      const { sub, personRef } = await seed();
      const c = await clientAs(sub);
      const { error } = await c.rpc("set_fursona_order", {
        p_actor_ref: personRef,
        p_sort_order: 1,
      });
      expect(error?.message).toMatch(/not found/i);
    });

    it("refuses to pin a person", async () => {
      const { sub, personRef } = await seed();
      const c = await clientAs(sub);
      const { error } = await c.rpc("set_fursona_featured", {
        p_actor_ref: personRef,
        p_featured: true,
      });
      expect(error?.message).toMatch(/not found/i);
    });

    it("still orders a fursona", async () => {
      const { sub, sonaRef } = await seed();
      const c = await clientAs(sub);
      const { error } = await c.rpc("set_fursona_order", {
        p_actor_ref: sonaRef,
        p_sort_order: 2,
      });
      expect(error).toBeNull();
    });
  });

  // Suspension still travels. current_person_ref() filters to active people, so
  // a suspended person cannot write their own page any more than they can act
  // as anybody — generalising ownership must not open a door around that.
  it("refuses a suspended person their own page", async () => {
    const { sub, personRef } = await seed();
    const { error } = await admin()
      .from("actors")
      .update({ status: "suspended" })
      .eq("actor_ref", personRef);
    expect(error).toBeNull();

    expect((await setSections(sub, personRef, "person"))?.message).toMatch(
      /not found|suspended/i,
    );
  });
});
