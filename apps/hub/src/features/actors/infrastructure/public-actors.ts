import {
  parseTheme,
  type ActorTheme,
} from "@/features/actors/domain/actor-theme";
import { createIdentityClient } from "@aeleos/identity";
import { env } from "@/shared/infrastructure/env";
import {
  withRequiredBlocks,
  type ActorKind,
} from "@/features/actors/domain/required-blocks";
import {
  lenientBlocksSchema,
  type Block,
} from "@/features/actors/domain/block-schema";
import { sectionsToBlocks } from "@/features/actors/domain/section-block-shim";
import { readSectionsSchema } from "@/features/actors/domain/section-schema";

/** One fursona as a person's public profile lists it. */
export interface PublicFursonaSummary {
  /** Its handle, unique among this owner's fursonas only. */
  handle: string;
  /** What to show, when they set one. */
  displayName: string | null;
  /** Their picture, when they set one. */
  avatarUrl: string | null;
}

/**
 * An actor's page, as a stranger may see it.
 *
 * **What they wrote is `blocks`, and the rename is the model rather than
 * tidying.** It was `sections`, a flat array whose every element was one
 * welded arrangement-and-content type; it is a recursive tree now, and a
 * section is simply a container at depth 0 that carries a name. The database
 * column keeps the old name — see {@link toPublicActor} — because renaming a
 * column is a migration and this is a reading.
 *
 * It carries the owner's `theme`, always — its resting state overrides nothing,
 * so a page nobody has themed is exactly what it was before theming existed.
 * `parseTheme` cannot fail, which means a stored theme that is nonsense costs
 * the page its colours and never the page itself.
 *
 * **Two fields are page-kind-specific and mutually exclusive.** `fursonas` is
 * present on a person's page and `owner` on a fursona's; neither has anything
 * to say on the other. Both are optional rather than nullable for that reason
 * — absent means "not a question this page asks", where null would mean "asked
 * and empty".
 */
export interface PublicActor {
  /** The actor's own handle. */
  handle: string;
  /** What to show, when they set one. */
  displayName: string | null;
  /** Their picture, when they set one. */
  avatarUrl: string | null;
  /**
   * The address a link should use — the vanity when there is one, else the
   * number. Both keep resolving; this is the one to make canonical.
   */
  address: string;
  /**
   * Whether a search engine may index this page.
   *
   * False for `unlisted`, which is what makes unlisted mean anything: a link
   * somebody chose not to publish must not arrive in a search result.
   */
  listed: boolean;
  /**
   * What they wrote, as a tree of blocks. Empty when they have written
   * nothing, and empty too when what is stored does not parse — see
   * {@link parseBlocks}.
   */
  blocks: Block[];
  /**
   * How the owner chose the page to look.
   *
   * Always present, and its resting state overrides nothing — a stranger sees
   * the page as its owner built it, and a page nobody has themed is exactly
   * what it was before theming existed. Never a reason to withhold the page:
   * `parseTheme` cannot fail.
   */
  theme: ActorTheme;
  /**
   * The owner's **public** fursonas, on a person's page only.
   *
   * Absent on a fursona's own page. Never contains an unlisted one — see
   * `public_person` in `0012`, which is where that rule is enforced.
   */
  fursonas?: PublicFursonaSummary[];
  /**
   * Who owns this fursona, on a fursona's page only.
   *
   * Absent on a person's own page, where there is no owner to name.
   *
   * **`displayName` and `avatarUrl` are null unless the OWNER's own profile is
   * readable, and the gate is in `public_fursona` rather than here.** A
   * fursona's page is governed by the fursona's visibility rather than its
   * owner's, so a public character routinely belongs to somebody whose profile
   * 404s; showing that person's name and portrait to a stranger would disclose
   * what they chose to keep private. Re-deriving the rule in TypeScript would
   * be a second copy of it, free to drift from the one `0012` enforces.
   *
   * `address` is always present and is not a disclosure: it is already the
   * first segment of this page's own URL.
   */
  owner?: {
    /** The owner's canonical address. Always present. */
    address: string;
    /** Their display name, or null when their profile is private. */
    displayName: string | null;
    /** Their picture, or null when their profile is private. */
    avatarUrl: string | null;
  };
}

/**
 * A Supabase client with no token at all, so PostgREST resolves it as `anon`.
 *
 * **The null `getToken` is the point, not a shortcut.** `@aeleos/identity`
 * documents that a null token authenticates as `anon` rather than failing, and
 * this is the first caller in the hub that wants exactly that: these pages are
 * read by strangers. Everywhere else in this app a null token would be a bug,
 * so it is spelled out here rather than left to look like an oversight.
 *
 * Nothing else about the request is trusted. `0012`'s two functions are the
 * whole of what `anon` may execute, and their own `where` clauses decide what
 * comes back — this client cannot widen that.
 *
 * @returns a client authenticated as nobody.
 */
const anonClient = () =>
  createIdentityClient({
    getToken: async () => null,
    url: env.supabaseUrl,
    anonKey: env.supabaseAnonKey,
  });

/**
 * Parses a stored page, treating a shape the schema rejects as none.
 *
 * A page written before a schema change must still render its header and its
 * name. Throwing here would turn one bad row into a 500 on somebody's public
 * profile, which is a worse failure than a page with nothing under the heading.
 *
 * **Uses `lenientBlocksSchema`, not `blocksSchema`.** The write schema refuses
 * a typo an author just made, which is right at the moment they can still fix
 * it and wrong here: one block this build does not fully recognise would
 * otherwise fail the WHOLE page and blank a stranger's profile, in exactly the
 * window where a newer deployment's writes are being read by an older one.
 *
 * **Three things are tolerated and the rest are not.** An unknown KEY is
 * stripped (`specialise`); an unrecognised `kind` or `mode` is kept verbatim
 * for the renderer's own fallbacks (`unknownKindSchema`); an empty `title_en`
 * is a floor. A container past the depth cap, a malformed block of a kind this
 * build DOES know, and every size cap are refused here exactly as they are on
 * the write — so a failed parse still means something is genuinely wrong
 * rather than merely newer.
 *
 * **A page stored in the FLAT shape is converted rather than refused**, and
 * that is a live regression rather than a nicety. No migration converted the
 * pages written before `set_actor_sections` began validating blocks — the
 * blocks-and-grids design says as much — so every one of them fell straight
 * through to the `[]` above and served a stranger a heading with nothing under
 * it. `sectionsToBlocks` is the same conversion `readActorPage` runs when the
 * editor opens one, so a page reads the same to a stranger and to its owner,
 * and the same before and after its owner next saves it.
 *
 * @param value - the stored `sections` column.
 * @param kind - which kind of actor's page it is, deciding which identity
 *   blocks the shim supplies when the stored page names none.
 */
function parseBlocks(value: unknown, kind: ActorKind): Block[] {
  const result = lenientBlocksSchema.safeParse(value);
  const parsed = result.success
    ? result.data
    : (() => {
        const flat = readSectionsSchema.safeParse(value);
        return flat.success ? sectionsToBlocks(flat.data) : [];
      })();
  // **The shim runs even on the empty fallback**, and that is the point: a page
  // whose stored shape this build cannot read at all still shows a stranger
  // whose page it is. Absence of an identity block means the default position,
  // never deletion — see `withRequiredBlocks`.
  return withRequiredBlocks(parsed, kind);
}

/**
 * Maps one row from either public read into the shape a page renders.
 *
 * @param row - the row as PostgREST returned it.
 * @param address - the canonical address to report.
 * @param kind - which kind of actor's page it is, deciding which identity
 *   blocks the shim supplies when the stored page names none.
 * @param owner - who owns this fursona, on a fursona's page only. Omitted on a
 *   person's page, where there is nobody to name. Its name and picture are
 *   already gated by `public_fursona`; nothing here re-decides that.
 * @returns the actor.
 */
function toPublicActor(
  row: Record<string, unknown>,
  address: string,
  kind: ActorKind,
  owner?: PublicActor["owner"],
): PublicActor {
  return {
    ...(owner ? { owner } : {}),
    handle: row.handle as string,
    displayName: (row.display_name as string | null) ?? null,
    avatarUrl: (row.avatar_url as string | null) ?? null,
    address,
    listed: Boolean(row.listed),
    // The column is still called `sections`; what it holds is a tree of
    // blocks, and a section is a container at depth 0 that carries a name.
    blocks: parseBlocks(row.sections, kind),
    // parseTheme falls back per field rather than throwing, so a stored theme
    // that is nonsense costs the page its colours and never the page itself.
    theme: parseTheme(row.theme),
  };
}

/**
 * Reads a person's public profile by either of their addresses.
 *
 * The number and the vanity both resolve, and the returned `address` is the
 * canonical one, so a page can point `rel="canonical"` at it without a second
 * query.
 *
 *
 * **The read applies `withRequiredBlocks`**, so a page naming no identity
 * block comes back with the header it always had. Absence means the default
 * position rather than deletion, which is why no stored page needed migrating.
 *
 * @param address - the first URL segment, as somebody typed it.
 * @returns the profile, or `undefined` when there is nothing to show — which
 * covers private, suspended, deleted and never-existed alike. The caller must
 * render all four identically; a distinguishable answer is an existence oracle.
 * @throws when the read itself fails, which is not the same as "not found" and
 * must not be collapsed into it.
 */
export async function readPublicPerson(
  address: string,
): Promise<PublicActor | undefined> {
  const { data, error } = await anonClient()
    .rpc("public_person", { p_address: address })
    .maybeSingle();

  if (error) throw new Error(`Could not read the profile: ${error.message}`);
  if (!data) return undefined;

  const row = data as Record<string, unknown>;
  return {
    ...toPublicActor(row, row.address as string, "person"),
    fursonas: ((row.fursonas as Record<string, unknown>[] | null) ?? []).map(
      (entry) => ({
        handle: entry.handle as string,
        displayName: (entry.display_name as string | null) ?? null,
        avatarUrl: (entry.avatar_url as string | null) ?? null,
      }),
    ),
  };
}

/**
 * Reads one fursona's page, addressed under its owner.
 *
 * The handle resolves **within that person only**, because handles are unique
 * per owner — two people's `luna` are two different characters.
 *
 * **It reports the OWNER as well**, which a person's page has no equivalent of.
 * The address is always there; the owner's name and picture are null unless
 * that person's own profile is readable, and that decision is `public_fursona`'s
 * rather than this function's — see {@link PublicActor.owner}.
 *
 *
 * **The read applies `withRequiredBlocks`**, so a page naming no identity
 * block comes back with the header it always had. Absence means the default
 * position rather than deletion, which is why no stored page needed migrating.
 *
 * @param address - the owner's address, as somebody typed it.
 * @param handle - the fursona's handle, as somebody typed it.
 * @returns the page, or `undefined` when there is nothing to show. As above,
 * that covers every hidden state and the caller must not tell them apart.
 * @throws when the read itself fails.
 */
export async function readPublicFursona(
  address: string,
  handle: string,
): Promise<PublicActor | undefined> {
  const { data, error } = await anonClient()
    .rpc("public_fursona", { p_address: address, p_handle: handle })
    .maybeSingle();

  if (error) throw new Error(`Could not read the fursona: ${error.message}`);
  if (!data) return undefined;

  const row = data as Record<string, unknown>;
  return toPublicActor(row, row.owner_address as string, "fursona", {
    address: row.owner_address as string,
    // Null when the owner's own profile is private. The gate is SQL's — see
    // `public_fursona` in `0012` and the `owner` field's own doc.
    displayName: (row.owner_display_name as string | null) ?? null,
    avatarUrl: (row.owner_avatar_url as string | null) ?? null,
  });
}
