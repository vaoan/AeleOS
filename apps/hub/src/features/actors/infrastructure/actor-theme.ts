import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_THEME,
  type ActorTheme,
} from "@/features/actors/domain/actor-theme";
import { listMyActors } from "@/features/actors/infrastructure/fursonas";
import { readActorPage } from "@/features/actors/infrastructure/actor-page";

/**
 * Stores how somebody chose their own page to look.
 *
 * **Only what was actually chosen is sent.** A theme is a set of overrides and
 * `null` means "the design's own", so a null field is omitted rather than
 * written — `set_actor_theme` refuses a key whose value is not a colour, and
 * more importantly a stored `null` would be a value pretending to be an
 * absence. Sending `{}` is how somebody puts their page back.
 *
 * The cursor travels as an address; nothing is stored, as with every other
 * picture here.
 *
 * The two canvas dials travel as numbers and are never null: there is no such
 * thing as an absent multiplier, since one IS the absence.
 *
 * The skin travels as its NAME, alongside the canvas and unlike the colours: it
 * is not nullable, because `default` is a real skin whose overrides are empty.
 * The properties it stands for are resolved when the page renders, so renaming
 * or restyling a skin later reaches every page already wearing it.
 *
 * The canvas's colours travel as a list rather than as two named fields, since
 * how many there are depends on which canvas was chosen.
 *
 * The background travels as a gradient object rather than a string — as many
 * stops as somebody built — which is why the payload is typed loosely here and
 * shape-checked by `set_actor_theme` rather than pattern-matched.
 *
 * The background travels with the rest. It is the colour the page is built
 * around, so a stored theme without one derives no palette at all.
 *
 * `p_actor_ref` names the page, and it is a suggestion the database checks
 * rather than trusts: `set_actor_theme` resolves ownership through
 * `owns_active_actor()` and answers "fursona not found" either way, so a caller
 * cannot learn whether somebody else's actor exists by theming it.
 *
 * @param client - a Supabase client authenticated as the owner.
 * @param actorRef - the person or fursona whose page it is.
 * @param theme - what to store.
 * @throws when the caller does not own an active actor by that reference, or
 * when a colour is not `#rrggbb`.
 */
export async function setActorTheme(
  client: SupabaseClient,
  actorRef: string,
  theme: ActorTheme,
): Promise<void> {
  const stored: Record<string, unknown> = {
    canvas: theme.canvas,
    skin: theme.skin,
    density: theme.density,
    speed: theme.speed,
  };
  if (theme.background) stored.background = theme.background;
  if (theme.accent) stored.accent = theme.accent;
  if (theme.canvasColours) stored.canvasColours = theme.canvasColours;
  if (theme.cursor) stored.cursor = theme.cursor;

  const { error } = await client.rpc("set_actor_theme", {
    p_actor_ref: actorRef,
    p_theme: stored,
  });
  if (error) throw new Error(`Could not save your theme: ${error.message}`);
}

/**
 * The signed-in person's own profile theme.
 *
 * Exists so the fursona editor can offer "make this look like my profile".
 * A theme belongs to one actor, so a person's and a fursona's are unrelated by
 * design — somebody who spends an evening on their profile and then finds every
 * character wearing the default has no way to carry the work across, and
 * rebuilding a gradient stop by stop from memory is not one.
 *
 * **A read, not `ensurePersonActor`.** That function provisions, and the /me
 * page owns that side effect deliberately; calling it here would put a write
 * behind opening an editor. `my_actors` returns the person's own row alongside
 * their fursonas, which is enough to find the reference.
 *
 * A caller with no person row gets the default, which is also what somebody who
 * has never themed their profile gets — and the editor renders no button for
 * either, because there is nothing to copy in both cases.
 *
 * @param client - a Supabase client authenticated as the person.
 * @returns their profile's theme, or the default when there is none.
 * @throws when either read fails, which is not the same as "not themed yet".
 */
export async function readMyProfileTheme(
  client: SupabaseClient,
): Promise<ActorTheme> {
  const person = (await listMyActors(client)).find(
    (actor) => actor.kind === "person",
  );
  if (!person) return DEFAULT_THEME;
  return (await readActorPage(client, person.actorRef)).theme;
}
