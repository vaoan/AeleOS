import type { SupabaseClient } from "@supabase/supabase-js";
import type { Visibility } from "@/features/actors/domain/fursona-schema";

/** What a person may change about their own profile. */
export interface MyProfileInput {
  /** What to show at the top of their page. */
  displayName: string;
  /** Their picture. */
  avatarUrl: string;
  /** Who may see the profile page. */
  visibility: Visibility;
}

/**
 * Edits the caller's own person profile.
 *
 * **There is no actor reference to pass**, and that is the authorization: the
 * function derives the target from the token, so a caller cannot name somebody
 * else's row. It is the same shape as `create_fursona`, which takes no owner
 * for the same reason.
 *
 * Publishing is why this exists. A person is provisioned `private` and had no
 * way to change it, so their profile page answered 404 for everybody —
 * including them.
 *
 * @param client - a Supabase client authenticated as the person.
 * @param input - the values to store.
 * @throws when the caller is suspended, has no person actor, or names a
 * visibility that is not one of the three.
 */
export async function updateMyProfile(
  client: SupabaseClient,
  input: MyProfileInput,
): Promise<void> {
  const { error } = await client.rpc("update_my_profile", {
    p_display_name: input.displayName.trim() || null,
    p_avatar_url: input.avatarUrl.trim() || null,
    p_visibility: input.visibility,
  });
  if (error) throw new Error(`Could not save your profile: ${error.message}`);
}
