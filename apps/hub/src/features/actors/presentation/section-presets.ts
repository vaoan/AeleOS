import type {
  FursonaSection,
  SectionType,
} from "@/features/actors/domain/section-schema";
import type { EmbedProviderId } from "@/shared/domain/embed-providers";

/**
 * One brand offered in the add-section control.
 *
 * **`type` is not a free choice — it is the one layout that brand genuinely
 * fits.** `posts` embeds a social post; offering it for a brand whose posts
 * cannot be embedded would be a lie a person only discovers after pasting a
 * link. See {@link SECTION_PRESETS} for the rule each entry here was checked
 * against — and see `provider` below for how that rule is enforced rather
 * than only stated.
 */
export interface SectionPreset {
  /** Stable across a session; the test id suffix and the React key. */
  id: string;
  /** The layout this brand's box is appended as. */
  type: SectionType;
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
   * both directions: every `video`/`music`/`posts` preset names a provider
   * that exists in `EMBED_PROVIDERS`, and every `socials` preset names none —
   * `socials` brands a link and embeds nothing, so a provider there would be a
   * claim the layout cannot honour.
   */
  provider?: EmbedProviderId;
}

/**
 * The brand-named boxes the add-section control offers.
 *
 * **Where "an Instagram box" comes from.** The schema names layouts by shape,
 * not by brand — there is no `instagram` section type — but on the sites this
 * borrows from (MySpace, Sonico, Hi5) you added an Instagram box, and seeing
 * the brand was the connectedness. So this list sits entirely in
 * presentation: choosing "Instagram" appends a `posts` section already named
 * Instagram. Nothing here reaches the schema or SQL.
 *
 * **The rule every entry is checked against: a preset may only target a
 * layout that can actually handle that brand.**
 *
 * - `posts` genuinely embeds a social post, and only for the providers
 *   `embed-providers.ts` verified can be framed this way: Telegram,
 *   Instagram, X/Twitter, Pinterest, Mastodon.
 * - `video` and `music` likewise only for brands `embed-providers.ts` can
 *   build a player for.
 * - `socials` brands any link and embeds nothing, so it is the right target
 *   for everything else.
 *
 * **The rule is enforced, not only stated.** Every entry whose `type` embeds
 * also names the `provider` that backs it, and `section-presets.test.ts`
 * checks both directions — an embedding preset with no known provider, and a
 * `socials` preset that names one anyway — so a future preset for a brand
 * `EMBED_PROVIDERS` does not know fails the build rather than a review.
 *
 * **Bluesky is deliberately `socials`, not `posts`, and this is the sharpest
 * case of the rule above.** `embed-providers.ts` has no Bluesky entry: its
 * embed host wants a DID, and shareable `bsky.app` links carry a handle
 * instead — resolving one to the other needs an outbound fetch this project
 * refuses to make on a pasted address. A `posts` preset for Bluesky would
 * hand somebody a box their own links could never fill. `socials` brands the
 * link instead, exactly like FurAffinity or GitHub, and that is not a
 * downgrade — it is the layout that was always going to be honest about what
 * a Bluesky link can do here.
 *
 * **Curated, not exhaustive.** This is not "every brand `embed-providers.ts`
 * or `resolveSocial` knows how to name" — it is a short list favouring what
 * somebody on this platform would actually reach for, the way the four
 * starting templates are a floor and not an attempt to cover everyone.
 *
 * **The database holds no opinion about any of this.** A preset only ever
 * produces a value `sectionSchema` already accepts; removing every entry here
 * changes nothing about what a person could type by hand.
 */
export const SECTION_PRESETS: readonly SectionPreset[] = [
  // posts — providers embed-providers.ts confirmed can embed a post.
  // Pinterest and the Mastodon instances are left out of THIS list on
  // curation grounds (see the TSDoc above), not because they cannot embed.
  { id: "instagram", type: "posts", name: "Instagram", provider: "instagram" },
  { id: "x", type: "posts", name: "X", provider: "twitter" },
  { id: "telegram", type: "posts", name: "Telegram", provider: "telegram" },

  // video
  { id: "youtube", type: "video", name: "YouTube", provider: "youtube" },
  { id: "twitch", type: "video", name: "Twitch", provider: "twitch" },
  { id: "tiktok", type: "video", name: "TikTok", provider: "tiktok" },

  // music
  { id: "spotify", type: "music", name: "Spotify", provider: "spotify" },
  {
    id: "soundcloud",
    type: "music",
    name: "SoundCloud",
    provider: "soundcloud",
  },

  // socials — brands the link, embeds nothing, so nothing here can be wrong
  // about what will play, and none of them names a provider: `socials`
  // cannot honour one. Bluesky belongs here for the reason above.
  { id: "bluesky", type: "socials", name: "Bluesky" },
  { id: "furaffinity", type: "socials", name: "FurAffinity" },
  { id: "toyhouse", type: "socials", name: "Toyhouse" },
  { id: "kofi", type: "socials", name: "Ko-fi" },
  { id: "deviantart", type: "socials", name: "DeviantArt" },
  { id: "weasyl", type: "socials", name: "Weasyl" },
] as const;

/**
 * A new section from a brand preset, with only what the schema requires.
 *
 * Mirrors the editor's own `emptySection` — same shape, same empty `items` —
 * except the name is already filled in, on both languages at once, because a
 * brand's name is not translated.
 *
 * @param preset - the brand chosen.
 * @param sortOrder - where the new section goes.
 * @returns the section, ready to append; never mutates `preset`.
 */
export function presetSection(
  preset: SectionPreset,
  sortOrder: number,
): FursonaSection {
  return {
    name_en: preset.name,
    name_es: preset.name,
    type: preset.type,
    sort_order: sortOrder,
    items: [],
  };
}
