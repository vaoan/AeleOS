import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, clientAs, closePool, newSub, withClaims } from "./helpers";

afterAll(async () => {
  await closePool();
});

let alice: { sub: string; personRef: string; sonaRef: string };
let mallory: { sub: string; personRef: string; sonaRef: string };

/**
 * Provisions a person with one fursona.
 *
 * @returns the identity, the person and the fursona.
 */
async function seed() {
  const sub = newSub();
  const c = await clientAs(sub);
  const { data: personRef, error } = await c.rpc("ensure_person_actor");
  if (error) throw error;
  // All four parameters. PostgREST resolves an overload by the exact argument
  // names it is given, so omitting the optional-looking ones does not fall back
  // to a default — it fails to find the function at all.
  const { data: sonaRef, error: sonaError } = await c.rpc("create_fursona", {
    p_handle: `s${Math.random().toString(36).slice(2, 10)}`,
    p_display_name: "Luna",
    p_avatar_url: null,
    p_visibility: "private",
  });
  if (sonaError) throw sonaError;
  return {
    sub,
    personRef: personRef as string,
    sonaRef: sonaRef as string,
  };
}

beforeAll(async () => {
  alice = await seed();
  mallory = await seed();
});

/**
 * Writes a theme as somebody.
 *
 * @param sub - whose token.
 * @param actorRef - whose page.
 * @param theme - what to store.
 * @returns the error message, or null.
 */
async function write(
  sub: string,
  actorRef: string,
  theme: unknown,
): Promise<string | null> {
  const c = await clientAs(sub);
  const { error } = await c.rpc("set_actor_theme", {
    p_actor_ref: actorRef,
    p_theme: theme,
  });
  return error ? error.message : null;
}

/**
 * Reads a stored theme privileged.
 *
 * @param actorRef - whose page.
 * @returns what is stored.
 */
async function stored(actorRef: string): Promise<Record<string, unknown>> {
  const { data } = await admin()
    .from("actor_profiles")
    .select("theme")
    .eq("actor_ref", actorRef)
    .single();
  return (data as { theme: Record<string, unknown> }).theme;
}

describe("set_actor_theme", () => {
  it("stores what somebody chose", async () => {
    expect(
      await write(alice.sub, alice.sonaRef, {
        background: { angle: 90, stops: [{ color: "#1a1a2e", at: 0 }] },
        accent: "#00ff88",
        canvasColours: ["#112233", "#445566", "#778899"],
        canvas: "none",
      }),
    ).toBeNull();
    expect(await stored(alice.sonaRef)).toEqual({
      background: { angle: 90, stops: [{ color: "#1a1a2e", at: 0 }] },
      accent: "#00ff88",
      canvasColours: ["#112233", "#445566", "#778899"],
      canvas: "none",
    });
  });

  it("lets somebody theme their own person page too", async () => {
    expect(
      await write(alice.sub, alice.personRef, { accent: "#123456" }),
    ).toBeNull();
    expect(await stored(alice.personRef)).toEqual({ accent: "#123456" });
  });

  // An empty object is "override nothing", which is a legitimate thing to
  // store — it is how somebody puts their page back to the design's own look.
  it("accepts an empty theme", async () => {
    expect(await write(alice.sub, alice.sonaRef, {})).toBeNull();
    expect(await stored(alice.sonaRef)).toEqual({});
  });

  it("replaces rather than merging", async () => {
    await write(alice.sub, alice.sonaRef, {
      accent: "#00ff88",
      canvas: "drift",
    });
    await write(alice.sub, alice.sonaRef, { accent: "#ff0000" });
    expect(await stored(alice.sonaRef)).toEqual({ accent: "#ff0000" });
  });

  describe("what it refuses", () => {
    it.each([
      ["red", "a colour name"],
      ["#fff", "a short hex"],
      ["#gggggg", "a hex that is not one"],
      ["#00ff8", "five digits"],
      ["javascript:alert(1)", "a scheme"],
    ])("refuses %s (%s)", async (accent) => {
      expect(await write(alice.sub, alice.sonaRef, { accent })).toMatch(
        /must be #rrggbb/i,
      );
    });

    // An unknown key is refused rather than ignored. Storing it would let a
    // client fill the column with anything at all under a name the renderer
    // never reads, which is an unbounded write wearing a theme's clothes.
    // The key must be one nobody would plausibly ADD. It was `background`,
    // which became a real theme key — the third time in this repository that a
    // name chosen as "obviously not real" became real, after `carousel` and
    // `orbit`. Pick something that could not be a key, not something that
    // merely is not one yet.
    it("refuses a key it does not know", async () => {
      expect(
        await write(alice.sub, alice.sonaRef, { "not-a-theme-key": "#ffffff" }),
      ).toMatch(/unknown theme key/i);
    });

    it.each([null, 42, "a string", [1, 2]])("refuses %o", async (theme) => {
      expect(await write(alice.sub, alice.sonaRef, theme)).toMatch(
        /must be an object/i,
      );
    });

    // A gradient is shape-checked, not colour-checked: which colours exist is
    // not a question the database can answer, and the client drops a stop it
    // cannot read rather than rendering one nobody picked.
    it("refuses more canvas colours than any canvas could use", async () => {
      expect(
        await write(alice.sub, alice.sonaRef, {
          canvasColours: Array.from({ length: 9 }, () => "#ffffff"),
        }),
      ).toMatch(/at most 8/i);
    });

    it("refuses canvas colours that are not a list", async () => {
      expect(
        await write(alice.sub, alice.sonaRef, { canvasColours: "#ffffff" }),
      ).toMatch(/at most 8/i);
    });

    it("refuses a background with no stops", async () => {
      expect(
        await write(alice.sub, alice.sonaRef, {
          background: { angle: 90, stops: [] },
        }),
      ).toMatch(/1 to 12 stops/i);
    });

    it("refuses a background that is not a gradient", async () => {
      expect(
        await write(alice.sub, alice.sonaRef, { background: "#1a1a2e" }),
      ).toMatch(/1 to 12 stops/i);
    });

    // A fursona can have a lot of colours. Twelve is the cap, and the cap is
    // what keeps a client-reachable write on a free-tier database bounded.
    it("accepts a background with many stops", async () => {
      expect(
        await write(alice.sub, alice.sonaRef, {
          background: {
            angle: 45,
            stops: Array.from({ length: 12 }, (_, i) => ({
              color: "#ff0000",
              at: i * 9,
            })),
          },
        }),
      ).toBeNull();
    });

    it("refuses more stops than the cap", async () => {
      expect(
        await write(alice.sub, alice.sonaRef, {
          background: {
            angle: 45,
            stops: Array.from({ length: 13 }, (_, i) => ({
              color: "#ff0000",
              at: i,
            })),
          },
        }),
      ).toMatch(/1 to 12 stops/i);
    });

    it("refuses a canvas name that is absurdly long", async () => {
      expect(
        await write(alice.sub, alice.sonaRef, { canvas: "x".repeat(40) }),
      ).toMatch(/too long/i);
    });

    // The byte cap is the backstop, and it guards the one hole the shape check
    // leaves open: a stop's COLOUR is not length-checked here, because which
    // colours exist is not a question the database answers. So a hostile client
    // can send twelve legal stops carrying enormous strings, and nothing but
    // the total size stops it.
    //
    // Built out of VALID keys on purpose. An earlier version used forty
    // invented ones and passed by tripping the unknown-key check instead —
    // which meant the cap it was named for was never exercised at all.
    it("refuses a theme that is too large", async () => {
      const huge = "#".padEnd(400, "f");
      expect(
        await write(alice.sub, alice.sonaRef, {
          background: {
            angle: 90,
            stops: Array.from({ length: 12 }, (_, i) => ({
              color: huge,
              at: i,
            })),
          },
        }),
      ).toMatch(/too large/i);
    });
  });

  describe("who may write one", () => {
    // The same wording every writer here uses: a caller must not learn whether
    // an actor they do not own exists.
    it("refuses somebody else's fursona, without admitting it exists", async () => {
      expect(
        await write(mallory.sub, alice.sonaRef, { accent: "#ffffff" }),
      ).toMatch(/fursona not found/i);
    });

    it("refuses an actor that does not exist, identically", async () => {
      expect(
        await write(mallory.sub, "00000000-0000-0000-0000-000000000000", {
          accent: "#ffffff",
        }),
      ).toMatch(/fursona not found/i);
    });

    it("refuses an anonymous caller", async () => {
      await expect(
        withClaims(null, async (c) =>
          c.query("select public.set_actor_theme($1, '{}'::jsonb)", [
            alice.sonaRef,
          ]),
        ),
      ).rejects.toThrow(/permission denied/i);
    });

    // A person carries a sanction and must not shed it by theming.
    it("refuses a suspended person", async () => {
      const bob = await seed();
      await admin()
        .from("actors")
        .update({ status: "suspended" })
        .eq("actor_ref", bob.personRef);
      expect(await write(bob.sub, bob.sonaRef, { accent: "#ffffff" })).toMatch(
        /fursona not found/i,
      );
    });
  });

  // The whole reason the theme is stored: a stranger sees the page as its owner
  // built it, without being signed in to anything.
  it("reaches a stranger through the public read", async () => {
    const sona = await seed();
    await write(sona.sub, sona.sonaRef, { accent: "#00ff88", canvas: "none" });
    await admin()
      .from("actors")
      .update({ visibility: "public" })
      .eq("actor_ref", sona.sonaRef);

    const { data: handleRow } = await admin()
      .from("actors")
      .select("handle")
      .eq("actor_ref", sona.sonaRef)
      .single();
    const { data: addressRow } = await admin()
      .from("person_addresses")
      .select("address")
      .eq("actor_ref", sona.personRef)
      .single();

    const seen = await withClaims(null, async (c) =>
      c.query("select theme from public.public_fursona($1, $2)", [
        (addressRow as { address: string }).address,
        (handleRow as { handle: string }).handle,
      ]),
    );
    expect(seen.rows[0].theme).toEqual({ accent: "#00ff88", canvas: "none" });
  });
});
