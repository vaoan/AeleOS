import { describe, expect, it, vi } from "vitest";
import { DEFAULT_GRADIENT } from "@/shared/domain/gradient";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  readMyProfileTheme,
  setActorTheme,
} from "@/features/actors/infrastructure/actor-theme";
import { DEFAULT_THEME } from "@/features/actors/domain/actor-theme";

/**
 * A client that records the call.
 *
 * @param error - what the call should answer with.
 * @returns the client and the recorder.
 */
function client(error: { message: string } | null = null) {
  const rpc = vi.fn().mockResolvedValue({ error });
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

describe("setActorTheme", () => {
  it("sends what somebody chose", async () => {
    const { client: c, rpc } = client();
    await setActorTheme(c, "actor-1", {
      background: {
        ...DEFAULT_GRADIENT,
        angle: 90,
        stops: [{ color: "#1a1a2e", at: 0 }],
      },
      surface: null,
      accent: "#00ff88",
      canvasColours: ["#112233", "#445566"],
      canvas: "none",
      cursor: null,
      backgroundUrl: null,
      backgroundFit: "tile",
      measure: null,
      font: null,
      spacing: null,
      skin: "glass",
      density: 1,
      speed: 1,
      scale: 1,
    });
    expect(rpc).toHaveBeenCalledWith("set_actor_theme", {
      p_actor_ref: "actor-1",
      p_theme: {
        background: {
          ...DEFAULT_GRADIENT,
          angle: 90,
          stops: [{ color: "#1a1a2e", at: 0 }],
        },
        accent: "#00ff88",
        canvasColours: ["#112233", "#445566"],
        canvas: "none",
        backgroundFit: "tile",
        skin: "glass",
        density: 1,
        speed: 1,
        scale: 1,
      },
    });
  });

  // A null is an absence, not a value. Writing it would store something that
  // looks like a choice, and set_actor_theme refuses a key that is not a colour
  // anyway — so omitting is both the correct meaning and the only thing the
  // database accepts.
  it("omits a colour nobody chose rather than storing null", async () => {
    const { client: c, rpc } = client();
    await setActorTheme(c, "actor-1", DEFAULT_THEME);
    expect(rpc.mock.calls[0][1].p_theme).toEqual({
      canvas: "nebula",
      skin: "default",
      density: 1,
      speed: 1,
      scale: 1,
      backgroundFit: "cover",
    });
  });

  it("sends only the colours that were chosen", async () => {
    const { client: c, rpc } = client();
    await setActorTheme(c, "actor-1", {
      ...DEFAULT_THEME,
      canvasColours: ["#112233"],
    });
    expect(rpc.mock.calls[0][1].p_theme).toEqual({
      canvas: "nebula",
      skin: "default",
      density: 1,
      speed: 1,
      scale: 1,
      backgroundFit: "cover",
      canvasColours: ["#112233"],
    });
  });

  it("throws with the reason when the database refuses", async () => {
    const { client: c } = client({ message: "fursona not found" });
    await expect(setActorTheme(c, "actor-1", DEFAULT_THEME)).rejects.toThrow(
      /fursona not found/,
    );
  });
});

describe("the cursor a theme carries", () => {
  it("is sent when somebody chose one", async () => {
    const { client: c, rpc } = client();
    await setActorTheme(c, "actor-1", {
      ...DEFAULT_THEME,
      cursor: "https://example.test/paw.png",
    });
    expect(rpc.mock.calls[0][1].p_theme.cursor).toBe(
      "https://example.test/paw.png",
    );
  });

  // Omitted rather than sent as null, like every other absent choice: a null
  // stored is a value pretending to be an absence.
  it("is omitted when nobody did", async () => {
    const { client: c, rpc } = client();
    await setActorTheme(c, "actor-1", DEFAULT_THEME);
    expect(rpc.mock.calls[0][1].p_theme.cursor).toBeUndefined();
  });
});

describe("the background picture a theme carries", () => {
  it("is sent when somebody chose one", async () => {
    const { client: c, rpc } = client();
    await setActorTheme(c, "actor-1", {
      ...DEFAULT_THEME,
      backgroundUrl: "https://example.test/wallpaper.png",
    });
    expect(rpc.mock.calls[0][1].p_theme.backgroundUrl).toBe(
      "https://example.test/wallpaper.png",
    );
  });

  // Omitted rather than sent as null, like the cursor: a stored null is a
  // value pretending to be an absence.
  it("is omitted when nobody chose one", async () => {
    const { client: c, rpc } = client();
    await setActorTheme(c, "actor-1", DEFAULT_THEME);
    expect(rpc.mock.calls[0][1].p_theme.backgroundUrl).toBeUndefined();
  });

  // Sent unconditionally, unlike the address: it is not nullable, so there is
  // no "nobody chose" state for a conditional send to express.
  it("sends the fit even when it is still the default", async () => {
    const { client: c, rpc } = client();
    await setActorTheme(c, "actor-1", DEFAULT_THEME);
    expect(rpc.mock.calls[0][1].p_theme.backgroundFit).toBe("cover");
  });
});

describe("readMyProfileTheme", () => {
  /**
   * A client answering `my_actors` and the `actor_profiles` read.
   *
   * @param actors - the rows `my_actors` returns.
   * @param theme - the stored theme, or null for no profile row.
   * @returns the client.
   */
  function person(actors: unknown[], theme: unknown = null) {
    return {
      rpc: vi.fn().mockResolvedValue({ data: actors, error: null }),
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: theme === null ? null : { sections: [], theme },
              error: null,
            }),
          }),
        }),
      }),
    } as unknown as SupabaseClient;
  }

  const row = (kind: string) => ({
    actor_ref: `${kind}-1`,
    kind,
    handle: kind === "person" ? "u-abc" : "luna",
    display_name: null,
    avatar_url: null,
    visibility: "private",
    status: "active",
  });

  it("reads the theme of the person's own row", async () => {
    const client = person([row("fursona"), row("person")], {
      accent: "#00ff88",
    });
    expect((await readMyProfileTheme(client)).accent).toBe("#00ff88");
  });

  // **The person's row, not the first row.** `my_actors` returns the fursonas
  // alongside it, so taking whichever came back first would copy one character's
  // look onto another and call it the profile's.
  it("ignores the fursonas beside it", async () => {
    const client = person([row("fursona"), row("person")]);
    const seen: string[] = [];
    const spy = {
      ...client,
      from: () => ({
        select: () => ({
          eq: (_c: string, ref: string) => {
            seen.push(ref);
            return { maybeSingle: async () => ({ data: null, error: null }) };
          },
        }),
      }),
    } as unknown as SupabaseClient;
    await readMyProfileTheme(spy);
    expect(seen).toEqual(["person-1"]);
  });

  // Nothing themed yet is an ordinary state, not a fault: the editor renders no
  // button for it, which is the same outcome as having no person row at all.
  it("gives the default when nothing is stored", async () => {
    const client = person([row("person")]);
    expect(await readMyProfileTheme(client)).toEqual(DEFAULT_THEME);
  });

  it("gives the default when there is no person row", async () => {
    const client = person([row("fursona")]);
    expect(await readMyProfileTheme(client)).toEqual(DEFAULT_THEME);
  });

  it("throws when the actor list cannot be read", async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "no" } }),
    } as unknown as SupabaseClient;
    await expect(readMyProfileTheme(client)).rejects.toThrow(/no/);
  });
});

describe("the page measure, stored", () => {
  it("sends a measure somebody chose", async () => {
    const { client: c, rpc } = client();
    await setActorTheme(c, "ref-1", { ...DEFAULT_THEME, measure: "full" });
    expect(rpc).toHaveBeenCalledWith(
      "set_actor_theme",
      expect.objectContaining({
        p_theme: expect.objectContaining({ measure: "full" }),
      }),
    );
  });

  // **Omitted rather than stored as null**, like every other "the design's
  // own" field here. A stored null and an absent key mean the same thing to
  // `parseTheme`, and writing one would record a choice nobody made.
  it("omits a measure nobody chose", async () => {
    const { client: c, rpc } = client();
    await setActorTheme(c, "ref-1", { ...DEFAULT_THEME, measure: null });
    const [, args] = rpc.mock.calls[0] as unknown as [
      string,
      { p_theme: object },
    ];
    expect(args.p_theme).not.toHaveProperty("measure");
  });
});
