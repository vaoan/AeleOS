import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_THEME,
  parseTheme,
  type ActorTheme,
} from "@/features/actors/domain/actor-theme";
import {
  sectionsSchema,
  type FursonaSection,
} from "@/features/actors/domain/section-schema";

/** Everything the editor needs to open a page as its owner left it. */
export interface ActorPage {
  /** What they wrote. Empty when they have written nothing. */
  sections: FursonaSection[];
  /** How they chose it to look. */
  theme: ActorTheme;
}

/**
 * Reads an actor's own page for editing.
 *
 * **This exists because its absence was silently destroying people's work.**
 * The edit page passed no sections to the editor, the editor defaulted them to
 * `[]`, and `set_actor_sections` replaces rather than merges — so opening a
 * fursona and pressing save deleted every section its owner had written.
 * Nothing failed, nothing warned, and the page simply came back empty. Anything
 * added to `actor_profiles` from now on inherits that trap unless it is loaded
 * here too, which is why the theme is in the same read rather than its own.
 *
 * It is the owner's own read, so it goes through RLS on `actor_profiles` rather
 * than through `public_person` — an owner must be able to edit a page that is
 * private, and the public readers deliberately serve nothing for one.
 *
 * A missing row is an ordinary state, not a fault: a fursona that has never
 * been edited has no profile row, and saving creates it.
 *
 * @param client - a Supabase client authenticated as the owner.
 * @param actorRef - whose page.
 * @returns the sections and the theme, both defaulted when absent.
 * @throws when the read itself fails, which is not the same as "not written
 * yet" and must not be collapsed into it — collapsing them is precisely how
 * the original bug erased pages.
 */
export async function readActorPage(
  client: SupabaseClient,
  actorRef: string,
): Promise<ActorPage> {
  const { data, error } = await client
    .from("actor_profiles")
    .select("sections, theme")
    .eq("actor_ref", actorRef)
    .maybeSingle();

  if (error) throw new Error(`Could not read the page: ${error.message}`);
  if (!data) return { sections: [], theme: DEFAULT_THEME };

  // Sections that no longer parse come back as none rather than throwing. A
  // throw here would make the fursona permanently uneditable, which is a worse
  // outcome than an editor that opens empty and can be saved over.
  const parsed = sectionsSchema.safeParse(
    (data as { sections: unknown }).sections,
  );
  return {
    sections: parsed.success ? parsed.data : [],
    theme: parseTheme((data as { theme: unknown }).theme),
  };
}
