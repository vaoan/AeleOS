import { createServerClient } from "@/shared/infrastructure/supabase-server";
import type {
  FursonaInput,
  Visibility,
} from "@/features/actors/domain/fursona-schema";

/**
 * An actor as the caller's own list exposes it.
 *
 * Carries no `owner_ref` and no `identity_sub`: `my_actors()` omits them by
 * construction, so the fursona-to-person mapping never reaches a client.
 */
export type Actor = {
  actorRef: string;
  kind: "person" | "fursona";
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
  visibility: Visibility;
  status: "active" | "suspended";
};

/** Raised when a handle is already in use, so a form can say which field. */
export class HandleTakenError extends Error {
  /** @param message - the database's message. */
  constructor(message: string) {
    super(message);
    this.name = "HandleTakenError";
  }
}

/**
 * Raised when the caller already owns as many fursonas as `create_fursona`
 * allows, so a form can say that rather than failing into an error boundary.
 *
 * Deliberately carries no number. The quota is `create_fursona`'s own constant
 * (0011) and the migration states that nothing else in the schema depends on
 * it; mirroring it here would put a second copy on the wrong side of the seam,
 * free to drift the moment the product knob is turned.
 */
export class FursonaLimitError extends Error {
  /** @param message - the database's message. */
  constructor(message: string) {
    super(message);
    this.name = "FursonaLimitError";
  }
}

/**
 * The empty string means "absent" on the wire; the database wants null.
 *
 * @param value - the raw form field.
 * @returns the trimmed value, or null when it is empty.
 */
const orNull = (value: string): string | null => value.trim() || null;

/**
 * Every actor the signed-in person may act as, their own person row first.
 *
 * @returns the caller's actors, or an empty list when they have none.
 * @throws when the read fails. Absence is an empty list; a failure must not
 * masquerade as one, or a transient error renders as "you have no fursonas"
 * and invites the person to create a duplicate.
 */
export async function listMyActors(): Promise<Actor[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("my_actors");
  if (error) throw new Error(`Could not read your actors: ${error.message}`);

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    actorRef: row.actor_ref as string,
    kind: row.kind as Actor["kind"],
    handle: row.handle as string,
    displayName: (row.display_name as string | null) ?? null,
    avatarUrl: (row.avatar_url as string | null) ?? null,
    visibility: row.visibility as Visibility,
    status: row.status as Actor["status"],
  }));
}

/**
 * Creates a fursona owned by the signed-in person.
 *
 * The owner is not a parameter here and is not one in the database either —
 * `create_fursona` derives it from the token, so there is nothing to forge.
 *
 * @param input - the validated fursona fields.
 * @returns the new actor's platform ID.
 * @throws `HandleTakenError` when the handle is already in use, in any case.
 * @throws `FursonaLimitError` when the caller is already at the quota.
 * @throws on any other failure.
 */
export async function createFursona(input: FursonaInput): Promise<string> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("create_fursona", {
    p_handle: input.handle.trim(),
    p_display_name: orNull(input.displayName),
    p_avatar_url: orNull(input.avatarUrl),
    p_visibility: input.visibility,
  });

  if (error) {
    if (/handle already taken/i.test(error.message))
      throw new HandleTakenError(error.message);
    if (/fursona limit reached/i.test(error.message))
      throw new FursonaLimitError(error.message);
    throw new Error(`Could not create the fursona: ${error.message}`);
  }
  return data as string;
}

/**
 * Edits a fursona the signed-in person owns.
 *
 * The handle is absent by design — it addresses the fursona, and renaming is a
 * separate concern. Ownership is re-checked in the database, so passing another
 * person's `actorRef` fails there rather than being trusted here.
 *
 * @param actorRef - the fursona's platform ID.
 * @param input - the editable fields.
 * @throws when the fursona does not exist or is not the caller's — the database
 * reports both identically, so this cannot be used to probe which refs are real.
 */
export async function updateFursona(
  actorRef: string,
  input: Omit<FursonaInput, "handle">,
): Promise<void> {
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("update_fursona", {
    p_actor_ref: actorRef,
    p_display_name: orNull(input.displayName),
    p_avatar_url: orNull(input.avatarUrl),
    p_visibility: input.visibility,
  });
  if (error) throw new Error(`Could not update the fursona: ${error.message}`);
}
