import { expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { mintSessionToken } from "./clerk-session";

// WHY A SHARED SEEDER EXISTS NOW AND DID NOT BEFORE.
//
// Several specs write a page straight into the database as a real
// Clerk-authenticated caller, bypassing the editor — deliberately, because what
// each is testing lives entirely on the READ side and driving the form would
// make them fail for reasons that have nothing to do with what they claim. Each
// carried its own copy of the same twenty lines.
//
// **The reason to share them now is not tidiness.** There is no editor that can
// write a block tree at all until phase 3, so every one of those specs seeds
// its fixture by hand, and a page shape is now a nested structure rather than a
// flat list — which is exactly the kind of literal that goes subtly wrong in
// six places independently. One builder means one thing to get right, and the
// database refuses the rest.

/** One block, as the database stores it. Loose by design — see {@link leaf}. */
export type SeedBlock = Record<string, unknown>;

/**
 * One leaf, with overrides.
 *
 * **Untyped on purpose.** These fixtures are the payload a caller PUTs on the
 * wire, and the point of several of them is to hand the database something the
 * client's own types would not admit. Typing them against `LeafBlock` would
 * make the suite agree with the schema by construction, which is the one thing
 * an end-to-end fixture must not do.
 *
 * `description_en` is legally absent — the database defaults it — so nothing
 * here writes a value it does not mean. Neither `span` nor `columns` exists
 * any more, and both are refused BY NAME on the way in: a container declares
 * how many places it lays across (`spaces`) and each child takes one.
 *
 * @param over - fields to replace.
 * @returns the leaf.
 */
export const leaf = (over: SeedBlock = {}): SeedBlock => ({
  kind: "text",
  title_en: "A leaf",
  ...over,
});

/**
 * One container, with overrides.
 *
 * A container with a `name_en` at the top of a page is a SECTION — that is the
 * whole of the difference — so a fixture that wants the `public-section`
 * marker simply names its outermost containers.
 *
 * `spaces` defaults to one across, which is what an unspecified arrangement
 * means. An entry of `children` may be `null`, which is a place holding
 * nothing: it keeps its width on the page and draws nothing.
 *
 * @param over - fields to replace.
 * @returns the container.
 */
export const container = (over: SeedBlock = {}): SeedBlock => ({
  kind: "container",
  mode: "stack",
  children: [leaf()],
  ...over,
});

/**
 * The identity section every seeded fursona page carries.
 *
 * **A page must name at least one `avatar`, `handle` and `owner`**, refused by
 * `set_actor_sections` and not merely by the editor — so a fixture without
 * them is not a page the product can store, and `seedPage` appends this to
 * every tree it writes. Written out literally rather than built from
 * `REQUIRED_KINDS`: a fixture that derived the list would agree with the
 * schema by construction and could never report that the requirement had
 * changed, which is the same reason {@link leaf} is untyped.
 *
 * **Appended rather than prepended, and that is index stability rather than
 * taste.** `withRequiredBlocks` puts its own composed section FIRST, which is
 * what a page stored before these kinds existed reads back as; doing that here
 * would renumber every place in every fixture, so `place-0.1` in a spec would
 * name a block that spec never wrote. Appending leaves every existing path and
 * every `nth(i)` exactly where its spec put it, and costs one trailing section
 * that assertions counting sections have to know about.
 *
 * @returns the section, as the database stores it.
 */
export const identity = (): SeedBlock =>
  container({
    name_en: "Identity",
    name_es: "Identidad",
    mode: "stack",
    children: [
      leaf({ kind: "avatar", title_en: "Portrait", title_es: "Retrato" }),
      leaf({ kind: "handle", title_en: "Handle", title_es: "Alias" }),
      leaf({ kind: "owner", title_en: "Owner", title_es: "Dueño" }),
    ],
  });

/**
 * How many top-level sections {@link seedPage} adds beyond what it was given.
 *
 * Written as a name rather than folded into each spec's arithmetic so that a
 * count reads as "my sections, and the identity one" instead of as a magic
 * `+ 1` nobody can place a year from now.
 */
export const SEEDED_IDENTITY_SECTIONS = 1;

/**
 * How many `public-leaf` blocks that section puts on the page.
 *
 * The three the database requires — `avatar`, `handle` and `owner` — so a spec
 * counting every leaf on a page counts these too. Same reasoning as
 * {@link SEEDED_IDENTITY_SECTIONS}: a named total beats an unexplained one.
 */
export const SEEDED_IDENTITY_LEAVES = 3;

/**
 * How {@link identity} reads in the editor's own arrangement dump.
 *
 * `block-drag.spec.ts` asserts the WHOLE page as an exact array — which is the
 * point of it, since a drag that moved something it should not have is only
 * visible against the whole — so the trailing section has to be spelled out
 * there rather than counted.
 *
 * @param at - the top-level index the identity section sits at.
 * @returns its entries, in the form `arrangement` builds.
 */
export const identityArrangement = (at: number): string[] => [
  `${at}=section-card:Identity`,
  `${at}.0=leaf-editor:Portrait`,
  `${at}.1=leaf-editor:Handle`,
  `${at}.2=leaf-editor:Owner`,
];

/** What {@link seedPage} needs. */
export interface SeedOptions {
  /** The Clerk user to write as. */
  userId: string;
  /** A short prefix for the generated handle, so a failure names its spec. */
  handlePrefix: string;
  /** The fursona's display name. */
  displayName: string;
  /** The page itself, as a tree of blocks. */
  blocks: SeedBlock[];
  /** The owner's theme, when the spec needs one. */
  theme?: Record<string, unknown>;
}

/** Where a seeded page lives. */
export interface SeededPage {
  /** The owner's canonical address — the first segment of the URL. */
  address: string;
  /** The fursona's handle — the second. */
  handle: string;
}

/**
 * Writes one public fursona page straight into the database.
 *
 * **As a real Clerk-authenticated caller through the product's own RPCs**, not
 * with a service key: `set_actor_sections` is `security definer` and walks the
 * tree through `validate_block`, so a fixture this accepts is one the editor
 * could have written and a fixture it refuses fails the test loudly rather
 * than rendering half a page.
 *
 * Every RPC result is asserted, because a silent failure here produces an empty
 * page and an assertion about the RENDER then fails somewhere far from the
 * cause.
 *
 * **{@link identity} is appended to every tree**, because a page naming no
 * `avatar`, `handle` or `owner` is one the database refuses. A caller passes
 * only the blocks its own subject is about; the trailing section is what makes
 * the write legal, and anything counting top-level sections has to count it.
 *
 * @param options - who to write as, and what to write.
 * @returns the address and handle the page is served at.
 */
export async function seedPage(options: SeedOptions): Promise<SeededPage> {
  const jwt = await mintSessionToken(options.userId);
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    },
  );

  const { error: provisionError } = await supabase.rpc("ensure_person_actor");
  expect(provisionError).toBeNull();

  const handle = `${options.handlePrefix}${Date.now().toString().slice(-9)}`;
  const { data: actorRef, error: createError } = await supabase.rpc(
    "create_fursona",
    {
      p_handle: handle,
      p_display_name: options.displayName,
      p_avatar_url: null,
      p_visibility: "public",
    },
  );
  expect(createError).toBeNull();

  const { error: blocksError } = await supabase.rpc("set_actor_sections", {
    p_actor_ref: actorRef,
    p_sections: [...options.blocks, identity()],
  });
  expect(blocksError).toBeNull();

  if (options.theme) {
    const { error: themeError } = await supabase.rpc("set_actor_theme", {
      p_actor_ref: actorRef,
      p_theme: options.theme,
    });
    expect(themeError).toBeNull();
  }

  const { data: address, error: addressError } =
    await supabase.rpc("my_address");
  expect(addressError).toBeNull();

  return { address: address as string, handle };
}
