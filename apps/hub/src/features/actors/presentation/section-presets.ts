import type {
  ContainerBlock,
  ContainerMode,
  LeafKind,
} from "@/features/actors/domain/block-schema";
import {
  newContainer,
  newLeaf,
  setAt,
} from "@/features/actors/domain/block-edits";
import type { EmbedProviderId } from "@/shared/domain/embed-providers";

/**
 * One brand offered in the add-section control.
 *
 * **`kind` is not a free choice — it is the one content kind that brand
 * genuinely fits.** A `post` leaf embeds a social post; offering it for a
 * brand whose posts cannot be embedded would be a lie a person only discovers
 * after pasting a link. See {@link SECTION_PRESETS} for the rule each entry
 * here was checked against — and see `provider` below for how that rule is
 * enforced rather than only stated.
 */
export interface SectionPreset {
  /** Stable across a session; the test id suffix and the React key. */
  id: string;
  /** How the section this brand's box becomes arranges what is in it. */
  mode: ContainerMode;
  /** How many places across that section lays. */
  spaces: number;
  /** The content kind the place it starts with holds. */
  kind: LeafKind;
  /**
   * The brand's own name, used verbatim for both `name_en` and `name_es`.
   *
   * **Not translated.** Instagram is Instagram in Spanish too — the same
   * reasoning as the editor's language strip, whose endonyms
   * ("English"/"Español") are deliberately untranslated: a name that changes
   * under somebody is how a picker becomes unreadable to the person reading
   * it.
   */
  name: string;
  /**
   * The `EMBED_PROVIDERS` entry that makes `type` honest for this brand.
   *
   * **Declared, never inferred.** `id` and a provider's own id need not spell
   * the brand the same way — this preset's `id` is `x`, the provider's is
   * `twitter` — so guessing the link from string equality would be fragile in
   * exactly the way a stated link is not. `section-presets.test.ts` asserts
   * both directions: every `player`/`post` preset names a provider that exists
   * in `EMBED_PROVIDERS`, and every `social` preset names none — a `social`
   * leaf brands a link and embeds nothing, so a provider there would be a
   * claim the kind cannot honour.
   */
  provider?: EmbedProviderId;
}

/**
 * The brands whose own posts `embed-providers.ts` can frame.
 *
 * Split out so {@link SECTION_PRESETS} stays readable at the width the rest of
 * this file is written at; the rule each entry meets is stated there.
 */
const POSTS = [
  {
    id: "instagram",
    mode: "grid",
    spaces: 3,
    kind: "post",
    name: "Instagram",
    provider: "instagram",
  },
  {
    id: "x",
    mode: "grid",
    spaces: 3,
    kind: "post",
    name: "X",
    provider: "twitter",
  },
  {
    id: "telegram",
    mode: "grid",
    spaces: 3,
    kind: "post",
    name: "Telegram",
    provider: "telegram",
  },
] as const satisfies readonly SectionPreset[];

/**
 * The brands a `social` leaf brands and nothing embeds.
 *
 * Split out for the same reason as {@link POSTS}. Three places across, the
 * width a row of chips reads at.
 */
const SOCIALS = [
  { id: "bluesky", mode: "grid", spaces: 3, kind: "social", name: "Bluesky" },
  {
    id: "furaffinity",
    mode: "grid",
    spaces: 3,
    kind: "social",
    name: "FurAffinity",
  },
  { id: "toyhouse", mode: "grid", spaces: 3, kind: "social", name: "Toyhouse" },
  { id: "kofi", mode: "grid", spaces: 3, kind: "social", name: "Ko-fi" },
  {
    id: "deviantart",
    mode: "grid",
    spaces: 3,
    kind: "social",
    name: "DeviantArt",
  },
  { id: "weasyl", mode: "grid", spaces: 3, kind: "social", name: "Weasyl" },
] as const satisfies readonly SectionPreset[];

/**
 * The brand-named boxes the add-section control offers.
 *
 * **Where "an Instagram box" comes from.** The schema names arrangements and
 * content kinds by shape, not by brand — there is no `instagram` anything —
 * but on the sites this borrows from (MySpace, Sonico, Hi5) you added an
 * Instagram box, and seeing the brand was the connectedness. So this list sits
 * entirely in presentation: choosing "Instagram" appends a section already
 * named Instagram, holding a `post` leaf ready for an address. Nothing here
 * reaches the schema or SQL.
 *
 * **The rule every entry is checked against: a preset may only target a
 * content kind that can actually handle that brand.**
 *
 * - `post` genuinely embeds a social post, and only for the providers
 *   `embed-providers.ts` verified can be framed this way: Telegram,
 *   Instagram, X/Twitter, Pinterest, Mastodon.
 * - `player` likewise only for brands `embed-providers.ts` can build a player
 *   for.
 * - `social` brands any link and embeds nothing, so it is the right target for
 *   everything else.
 *
 * **The rule is enforced, not only stated.** Every entry whose `kind` embeds
 * also names the `provider` that backs it, and `section-presets.test.ts`
 * checks both directions — an embedding preset with no known provider, and a
 * `social` preset that names one anyway — so a future preset for a brand
 * `EMBED_PROVIDERS` does not know fails the build rather than a review.
 *
 * **Bluesky is deliberately a `social` leaf, not a `post` one, and this is the
 * sharpest case of the rule above.** `embed-providers.ts` has no Bluesky
 * entry: its embed host wants a DID, and shareable `bsky.app` links carry a
 * handle instead — resolving one to the other needs an outbound fetch this
 * project refuses to make on a pasted address. A `post` preset for Bluesky
 * would hand somebody a box their own links could never fill. `social` brands
 * the link instead, exactly like FurAffinity or GitHub, and that is not a
 * downgrade — it is the kind that was always going to be honest about what a
 * Bluesky link can do here.
 *
 * **Curated, not exhaustive.** This is not "every brand `embed-providers.ts`
 * or `resolveSocial` knows how to name" — it is a short list favouring what
 * somebody on this platform would actually reach for, the way the four
 * starting templates are a floor and not an attempt to cover everyone.
 *
 * **The database holds no opinion about any of this.** A preset only ever
 * produces a value `blocksSchema` already accepts; removing every entry here
 * changes nothing about what a person could build by hand.
 */
export const SECTION_PRESETS: readonly SectionPreset[] = [
  // post — providers embed-providers.ts confirmed can embed a post.
  // Pinterest and the Mastodon instances are left out of THIS list on
  // curation grounds (see the TSDoc above), not because they cannot embed.
  ...POSTS,

  // player — the brands embed-providers.ts can build a player for. Three
  // places across for video, matching the width the flat `video` layout drew;
  // audio is a stack, because two players side by side leave neither wide
  // enough to show a track name.
  {
    id: "youtube",
    mode: "grid",
    spaces: 2,
    kind: "player",
    name: "YouTube",
    provider: "youtube",
  },
  {
    id: "twitch",
    mode: "grid",
    spaces: 2,
    kind: "player",
    name: "Twitch",
    provider: "twitch",
  },
  {
    id: "tiktok",
    mode: "grid",
    spaces: 2,
    kind: "player",
    name: "TikTok",
    provider: "tiktok",
  },
  {
    id: "spotify",
    mode: "stack",
    spaces: 1,
    kind: "player",
    name: "Spotify",
    provider: "spotify",
  },
  {
    id: "soundcloud",
    mode: "stack",
    spaces: 1,
    kind: "player",
    name: "SoundCloud",
    provider: "soundcloud",
  },

  // social — brands the link, embeds nothing, so nothing here can be wrong
  // about what will play, and none of them names a provider: a `social` leaf
  // cannot honour one. Bluesky belongs here for the reason above.
  ...SOCIALS,
] as const;

/**
 * A new section from a brand preset, with only what the schema requires.
 *
 * The name is already filled in, on both languages at once, because a brand's
 * name is not translated. Its first place holds a leaf of the kind that brand
 * fits, so the box arrives ready for an address rather than as a shape
 * somebody has to work out how to fill; the remaining places are empty, which
 * is the shape the preset chose made visible.
 *
 * @param preset - the brand chosen.
 * @returns the section, ready to append; never mutates `preset`.
 */
export function presetBlock(preset: SectionPreset): ContainerBlock {
  const container = newContainer(preset.mode, preset.spaces);
  const [filled] = setAt(
    [{ ...container, name_en: preset.name, name_es: preset.name }],
    [0, 0],
    newLeaf(preset.kind),
  );
  return filled as ContainerBlock;
}
