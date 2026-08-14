import {
  parseTheme,
  type ActorTheme,
} from "@/features/actors/domain/actor-theme";
import { createIdentityClient } from "@aeleos/identity";
import { env } from "@/shared/infrastructure/env";
import {
  sectionsSchema,
  type FursonaSection,
} from "@/features/actors/domain/section-schema";

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
 * It carries the owner's `theme`, always — its resting state overrides nothing,
 * so a page nobody has themed is exactly what it was before theming existed.
 * `parseTheme` cannot fail, which means a stored theme that is nonsense costs
 * the page its colours and never the page itself.
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
  /** What they wrote. Empty when they have written nothing. */
  sections: FursonaSection[];
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
 * Parses stored sections, treating a shape the schema rejects as none.
 *
 * A page written before a schema change must still render its header and its
 * name. Throwing here would turn one bad row into a 500 on somebody's public
 * profile, which is a worse failure than a page with nothing under the heading.
 *
 * @param value - whatever the database returned.
 * @returns the sections, or `[]` when they do not parse.
 */
function parseSections(value: unknown): FursonaSection[] {
  const result = sectionsSchema.safeParse(value);
  return result.success ? (result.data as FursonaSection[]) : [];
}

/**
 * Maps one row from either public read into the shape a page renders.
 *
 * @param row - the row as PostgREST returned it.
 * @param address - the canonical address to report.
 * @returns the actor.
 */
function toPublicActor(
  row: Record<string, unknown>,
  address: string,
): PublicActor {
  return {
    handle: row.handle as string,
    displayName: (row.display_name as string | null) ?? null,
    avatarUrl: (row.avatar_url as string | null) ?? null,
    address,
    listed: Boolean(row.listed),
    sections: parseSections(row.sections),
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
    ...toPublicActor(row, row.address as string),
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
  return toPublicActor(row, row.owner_address as string);
}
