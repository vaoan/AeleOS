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

/** One well-formed section, the shape the editor sends. */
const SECTIONS = [
  {
    name_en: "About me",
    name_es: "Sobre mí",
    type: "cards",
    sort_order: 1,
    items: [
      {
        title_en: "Who I am",
        title_es: "Quién soy",
        description_en: "Some words.",
        description_es: "Unas palabras.",
        sort_order: 1,
      },
    ],
  },
];

/**
 * Writes sections as somebody.
 *
 * @param sub - whose token to use.
 * @param actorRef - whose page to write.
 * @returns the error, or null.
 */
async function setSections(
  sub: string,
  actorRef: string,
): Promise<{ message: string } | null> {
  const c = await clientAs(sub);
  const { error } = await c.rpc("set_actor_sections", {
    p_actor_ref: actorRef,
    p_sections: SECTIONS,
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
      expect(await setSections(sub, personRef)).toBeNull();
    });

    it("reads them back", async () => {
      const { sub, personRef } = await seed();
      await setSections(sub, personRef);

      const c = await clientAs(sub);
      const { data, error } = await c
        .from("actor_profiles")
        .select("sections")
        .eq("actor_ref", personRef)
        .single();

      expect(error).toBeNull();
      expect((data as { sections: unknown }).sections).toEqual(SECTIONS);
    });

    it("refuses somebody else's person page", async () => {
      const mallory = await seed();
      const alice = await seed();
      expect(
        (await setSections(mallory.sub, alice.personRef))?.message,
      ).toMatch(/not found/i);
    });
  });

  describe("a fursona's page, unchanged", () => {
    it("lets an owner write their fursona's sections", async () => {
      const { sub, sonaRef } = await seed();
      expect(await setSections(sub, sonaRef)).toBeNull();
    });

    it("refuses somebody else's fursona", async () => {
      const mallory = await seed();
      const alice = await seed();
      expect((await setSections(mallory.sub, alice.sonaRef))?.message).toMatch(
        /not found/i,
      );
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

    expect((await setSections(sub, personRef))?.message).toMatch(
      /not found|suspended/i,
    );
  });
});
