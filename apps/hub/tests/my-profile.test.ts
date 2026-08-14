import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { updateMyProfile } from "@/features/actors/infrastructure/my-profile";

const rpc = vi.fn();
const client = { rpc } as unknown as SupabaseClient;

describe("updateMyProfile", () => {
  it("sends the values", async () => {
    rpc.mockResolvedValue({ error: null });
    await updateMyProfile(client, {
      displayName: "Aeleos",
      avatarUrl: "https://example.test/a.png",
      visibility: "public",
    });
    expect(rpc).toHaveBeenCalledWith("update_my_profile", {
      p_display_name: "Aeleos",
      p_avatar_url: "https://example.test/a.png",
      p_visibility: "public",
    });
  });

  // The database stores null for an empty value; sending "" would store a blank
  // name and make the page title an empty string rather than fall back.
  it("sends null for a value somebody cleared", async () => {
    rpc.mockResolvedValue({ error: null });
    await updateMyProfile(client, {
      displayName: "   ",
      avatarUrl: "",
      visibility: "private",
    });
    expect(rpc).toHaveBeenCalledWith("update_my_profile", {
      p_display_name: null,
      p_avatar_url: null,
      p_visibility: "private",
    });
  });

  // Never silent: the form shows a failure, and a caller that swallowed this
  // would tell somebody their profile was published when it was not.
  it("throws when the database refuses", async () => {
    rpc.mockResolvedValue({ error: { message: "person actor is suspended" } });
    await expect(
      updateMyProfile(client, {
        displayName: "x",
        avatarUrl: "",
        visibility: "public",
      }),
    ).rejects.toThrow(/suspended/);
  });
});
