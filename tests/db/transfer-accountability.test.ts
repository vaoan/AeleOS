import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { admin, clientAs, closePool, newSub, withSuperuser } from "./helpers";

type Person = { sub: string; personRef: string };

async function seedPerson(): Promise<Person> {
  const sub = newSub();
  const personRef = randomUUID();
  const { error } = await admin().from("actors").insert({
    actor_ref: personRef,
    kind: "person",
    identity_sub: sub,
    handle: `p-${personRef.slice(0, 8)}`,
  });
  if (error) throw error;
  return { sub, personRef };
}

async function seedSona(ownerRef: string): Promise<string> {
  const { data, error } = await admin()
    .from("actors")
    .insert({
      actor_ref: randomUUID(),
      kind: "fursona",
      owner_ref: ownerRef,
      handle: `s-${randomUUID().slice(0, 8)}`,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

afterAll(async () => {
  await closePool();
});

describe("accountability survives a fursona transfer", () => {
  it("keeps pre-transfer content attributed to the original person", async () => {
    const seller = await seedPerson();
    const buyer = await seedPerson();
    const sonaId = await seedSona(seller.personRef);

    // Seller authors content as the sona.
    const sellerClient = await clientAs(seller.sub);
    const { data: comment, error: insErr } = await sellerClient
      .from("comments")
      .insert({
        body: "posted before the sale",
        author_actor_id: sonaId,
        author_person_ref: seller.personRef,
      })
      .select("id")
      .single();
    expect(insErr).toBeNull();

    // The character changes hands (Phase 2 will wrap this in a proposal flow).
    const { error: xferErr } = await admin()
      .from("actors")
      .update({ owner_ref: buyer.personRef })
      .eq("id", sonaId);
    expect(xferErr).toBeNull();

    // Accountability still resolves to the seller, not the buyer. Privileged
    // read: author_person_ref is revoked from every client role by design.
    const snapshot = await withSuperuser(async (c) => {
      const r = await c.query<{ author_person_ref: string }>(
        "select author_person_ref from public.comments where id = $1",
        [comment.id as string],
      );
      return r.rows[0]?.author_person_ref;
    });
    expect(snapshot).toBe(seller.personRef);
    expect(snapshot).not.toBe(buyer.personRef);
  });

  it("does not let the new owner edit pre-transfer content", async () => {
    const seller = await seedPerson();
    const buyer = await seedPerson();
    const sonaId = await seedSona(seller.personRef);

    const sellerClient = await clientAs(seller.sub);
    const { data: comment, error: insErr } = await sellerClient
      .from("comments")
      .insert({
        body: "seller's words",
        author_actor_id: sonaId,
        author_person_ref: seller.personRef,
      })
      .select("id")
      .single();
    expect(insErr).toBeNull();

    await admin()
      .from("actors")
      .update({ owner_ref: buyer.personRef })
      .eq("id", sonaId);

    const buyerClient = await clientAs(buyer.sub);
    const { data: updated, error } = await buyerClient
      .from("comments")
      .update({ body: "rewritten by the buyer" })
      .eq("id", comment.id as string)
      .select("id");
    expect(error).toBeNull();
    expect(updated).toHaveLength(0);
  });

  it("does not reveal the previous owner to the new owner", async () => {
    const seller = await seedPerson();
    const buyer = await seedPerson();
    const sonaId = await seedSona(seller.personRef);

    await admin()
      .from("actors")
      .update({ owner_ref: buyer.personRef })
      .eq("id", sonaId);

    const buyerClient = await clientAs(buyer.sub);

    const viaComments = await buyerClient
      .from("comments")
      .select("author_person_ref");
    expect(viaComments.error).not.toBeNull();

    const viaActors = await buyerClient
      .from("actors_public")
      .select("owner_ref")
      .eq("id", sonaId);
    expect(viaActors.error).not.toBeNull();
  });

  it("lets the new owner author as the transferred sona", async () => {
    const seller = await seedPerson();
    const buyer = await seedPerson();
    const sonaId = await seedSona(seller.personRef);

    await admin()
      .from("actors")
      .update({ owner_ref: buyer.personRef })
      .eq("id", sonaId);

    const buyerClient = await clientAs(buyer.sub);
    const { error } = await buyerClient.from("comments").insert({
      body: "new owner speaking",
      author_actor_id: sonaId,
      author_person_ref: buyer.personRef,
    });
    expect(error).toBeNull();
  });

  it("stops the previous owner from authoring as the sold sona", async () => {
    const seller = await seedPerson();
    const buyer = await seedPerson();
    const sonaId = await seedSona(seller.personRef);

    await admin()
      .from("actors")
      .update({ owner_ref: buyer.personRef })
      .eq("id", sonaId);

    const sellerClient = await clientAs(seller.sub);
    const { error } = await sellerClient.from("comments").insert({
      body: "still mine?",
      author_actor_id: sonaId,
      author_person_ref: seller.personRef,
    });
    expect(error).not.toBeNull();
  });
});
