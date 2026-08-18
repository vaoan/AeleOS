import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_THEME,
  parseTheme,
  type ActorTheme,
} from "@/features/actors/domain/actor-theme";
import {
  readSectionsSchema,
  type FursonaSection,
} from "@/features/actors/domain/section-schema";

/**
 * Everything the editor needs to open a page as its owner left it.
 *
 * **`sections` is a union, and that is the whole shape of this type.** The
 * editor's next act is to REPLACE, so "nothing is written" and "I could not
 * read what is written" have to be different answers or the second becomes the
 * first — see the property.
 */
export interface ActorPage {
  /**
   * What they wrote — and **`null` is a third state, not an empty one**.
   *
   * `[]` means nothing has been written yet, which an editor may safely
   * replace. `null` means a page IS stored and this build could not read its
   * shape, which an editor must never replace: `set_actor_sections` REPLACES,
   * so writing `[]` over it destroys the page. Collapsing the two is precisely
   * the fault this function's own doc says it exists to prevent, and it
   * returned once already — see {@link readActorPage}.
   */
  sections: FursonaSection[] | null;
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
 * been edited has no profile row, and saving creates it. **That is `[]`, and a
 * stored page this build cannot read is `null` — the two are different answers
 * and a caller that treats them alike deletes somebody's page.** They were the
 * same answer until a stored page stopped being a flat list of sections, and
 * for that window every editor save wrote `[]` over a real page with nothing
 * failing and nothing warning, which is verbatim the paragraph above.
 *
 * **Parses sections with `readSectionsSchema`, not the editor's
 * `sectionsSchema`.** The two differ only on an unrecognised STYLE key: the
 * write schema refuses it, the read schema strips it. Using the strict one
 * here would reopen the exact bug this function exists to fix — a single
 * style key this build does not yet recognise would fail the WHOLE array's
 * parse and open the editor on an empty page, ready to save over what its
 * owner actually wrote.
 *
 * @param client - a Supabase client authenticated as the owner.
 * @param actorRef - whose page.
 * @returns the theme, always; and the sections, which are `[]` when nothing has
 * been written, the stored page when it parses, and **`null` when a page is
 * stored and could not be read**.
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

  // **Sections that no longer parse come back as `null`, never as `[]`.** A
  // throw here would make the fursona permanently uneditable, which is worse
  // than an editor that opens without them; but `[]` says "nothing is written"
  // to a caller whose next act is to REPLACE, and that is data loss rather than
  // a degraded read. The distinction is the whole reason this returns a union.
  //
  // `readSectionsSchema`, not `sectionsSchema`: an unknown STYLE key must not
  // blank the whole array the way an unknown section key already does not —
  // see that export's own TSDoc for why the two schemas disagree on purpose.
  const parsed = readSectionsSchema.safeParse(
    (data as { sections: unknown }).sections,
  );
  return {
    sections: parsed.success ? parsed.data : null,
    theme: parseTheme((data as { theme: unknown }).theme),
  };
}
