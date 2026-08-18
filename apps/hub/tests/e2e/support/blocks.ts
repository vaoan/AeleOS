import { expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { mintSessionToken } from "./clerk-session";

// WHY A SHARED SEEDER EXISTS NOW AND DID NOT BEFORE.
//
// Six specs write a page straight into the database as a real
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
 * `span`, `columns` and `description_en` are all legally absent — the database
 * defaults them — so nothing here writes a value it does not mean.
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
 * @param over - fields to replace.
 * @returns the container.
 */
export const container = (over: SeedBlock = {}): SeedBlock => ({
  kind: "container",
  mode: "stack",
  children: [leaf()],
  ...over,
});

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
    p_sections: options.blocks,
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
