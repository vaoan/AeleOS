import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { setActorTheme } from "@/features/actors/infrastructure/actor-theme";
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
      background: { angle: 90, stops: [{ color: "#1a1a2e", at: 0 }] },
      accent: "#00ff88",
      canvasColours: ["#112233", "#445566"],
      canvas: "none",
    });
    expect(rpc).toHaveBeenCalledWith("set_actor_theme", {
      p_actor_ref: "actor-1",
      p_theme: {
        background: { angle: 90, stops: [{ color: "#1a1a2e", at: 0 }] },
        accent: "#00ff88",
        canvasColours: ["#112233", "#445566"],
        canvas: "none",
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
    expect(rpc.mock.calls[0][1].p_theme).toEqual({ canvas: "nebula" });
  });

  it("sends only the colours that were chosen", async () => {
    const { client: c, rpc } = client();
    await setActorTheme(c, "actor-1", {
      ...DEFAULT_THEME,
      canvasColours: ["#112233"],
    });
    expect(rpc.mock.calls[0][1].p_theme).toEqual({
      canvas: "nebula",
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
