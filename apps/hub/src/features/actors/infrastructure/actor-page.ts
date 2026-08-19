import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_THEME,
  parseTheme,
  type ActorTheme,
} from "@/features/actors/domain/actor-theme";
import { readSectionsSchema } from "@/features/actors/domain/section-schema";
import {
  lenientBlocksSchema,
  type Block,
} from "@/features/actors/domain/block-schema";
import { sectionsToBlocks } from "@/features/actors/domain/section-block-shim";

/**
 * Everything the editor needs to open a page as its owner left it.
 *
 * **`sections` is a union, and that is the whole shape of this type.** The
 * editor's next act is to REPLACE, so "nothing is written" and "I could not
 * read what is written" have to be different answers or the second becomes the
 * first — see the property.
 *
 * It is a tree of BLOCKS, which is what the editor holds and what
 * `set_actor_sections` accepts. A page stored in the flat shape — every page
 * written before the block model, none of which any migration converted — is
 * converted forward on the way through; see {@link readEitherShape}.
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
  sections: Block[] | null;
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
 * **Two shapes are stored and the editor holds one, so this converts** — see
 * {@link readEitherShape}, which owns that split and the reason a column it
 * can read as neither answers `null` rather than something approximate.
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
  return {
    sections: readEitherShape((data as { sections: unknown }).sections),
    theme: parseTheme((data as { theme: unknown }).theme),
  };
}

/**
 * A stored page as a tree of blocks, whichever of the two shapes it is stored
 * in.
 *
 * **Two shapes, because two shapes exist.** Everything written since
 * `set_actor_sections` began validating blocks is a tree; everything written
 * before it is the flat list, and no migration converted them — the
 * blocks-and-grids design says so in as many words. Both must open, and the
 * first save of either writes a tree.
 *
 * Neither can be mistaken for the other: a container carries no `type` and a
 * flat section carries no `kind`, so the schemas are disjoint and the order
 * these are tried in decides nothing.
 *
 * **The conversion goes ONE way now.** The editor holds blocks, so a stored
 * tree needs no conversion at all and a stored flat page is converted forward
 * by `sectionsToBlocks` — the same function the templates go through. The
 * reverse direction existed only so a flat editor could open a tree, and there
 * is no flat editor.
 *
 * `readSectionsSchema`, not `sectionsSchema`, for the flat half: an unknown
 * STYLE key must not blank the whole array the way an unknown section key
 * already does not — see that export's own TSDoc for why the two schemas
 * disagree on purpose.
 *
 * @param value - whatever the column held.
 * @returns the page, or null when this build can read it as neither shape.
 */
function readEitherShape(value: unknown): Block[] | null {
  const blocks = lenientBlocksSchema.safeParse(value);
  if (blocks.success) return blocks.data;
  const flat = readSectionsSchema.safeParse(value);
  return flat.success ? sectionsToBlocks(flat.data) : null;
}
