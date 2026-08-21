import { z } from "zod";

/**
 * The ways a section can be laid out.
 *
 * The first four are Libra's set, adopted unchanged so that a future port from
 * that repository stays mechanical. The rest are this hub's own: a fursona page
 * is somebody's character rather than a product listing, and the layouts that
 * serve a catalogue do not stretch to a page whose whole job is to be theirs.
 *
 * **`socials` needs no third-party cooperation and so cannot break.** Every
 * other expressive layout frames or fetches something from elsewhere; this one
 * only brands whatever address the author pasted, through `resolveSocial`, so
 * there is nothing upstream that can go down and take it with it.
 *
 * **`posts` embeds a social post directly, and only where a provider was
 * verified to allow it.** Telegram, Instagram, X/Twitter, Pinterest and a
 * named list of Mastodon instances back it — see `embed-providers.ts` for
 * exactly which, found by loading each candidate embed address in a real,
 * logged-out browser rather than by plausibility. An address that resolves to
 * none of them — Bluesky's shareable link is the case this exists for — falls
 * back to the same branded chip `socials` renders, never to nothing and never
 * to a bare link.
 *
 * **`masonry` packs columns by height rather than laying out a uniform
 * grid**, through CSS multi-column layout — the one structural thing neither
 * `cards` nor `gallery` can do, which is what earns a new layout its place
 * rather than a rearrangement of one already here.
 *
 * **`progress` draws a proportion; `stats` only ever states one.** Its title
 * is the label and its description is the value, inverting the pair exactly
 * as `stats` and `quote` already do — but it also tries to READ that value,
 * through `progressValue` in `domain/progress-value.ts`, and draws a bar sized to
 * it. A description that cannot be read as a number renders as the same
 * plain label/value row `stats` renders, never a broken bar.
 *
 * **`tabs` shows one panel at a time, horizontally, switched by a radio
 * group and CSS's own `:checked`** — never a client component. `accordion`
 * is vertical and every item may be open at once; this is a switcher, and
 * saying so is what keeps the two from reading as duplicates of each other.
 *
 * **Nothing in the database holds this list any more, and no guard pins it.**
 * `is_section_type()` and the flat validation in `set_actor_sections` were
 * replaced by the block model — `is_block_kind()`, `is_container_mode()` and
 * `validate_block()` — and `section-limits-match-migration.test.ts` went with
 * them. This file is dead code awaiting its own deletion; adding a layout here
 * would change nothing anywhere. Add a block kind or a container mode in
 * `block-schema.ts` instead, where the drift guard still runs.
 */
export const SECTION_TYPES = [
  "cards",
  "accordion",
  "two-column",
  "gallery",
  "video",
  "music",
  "carousel",
  "links",
  "stats",
  "quote",
  "timeline",
  "socials",
  "posts",
  "masonry",
  "progress",
  "tabs",
] as const;

/** One of the layouts. */
export type SectionType = (typeof SECTION_TYPES)[number];

/**
 * What `0009` used to accept, mirrored so somebody heard about a cap while
 * typing.
 *
 * **These are no longer the database's caps and nothing pins them.** `0009`
 * carries the block model's own — `BLOCK_LIMITS` in `block-schema.ts`, pinned
 * by `block-limits-match-migration.test.ts` — and `c_max_sections` and
 * `c_max_items` no longer exist at all. Only the character and byte caps happen
 * to have survived unchanged, which is a coincidence rather than a guarantee.
 * This file is dead code awaiting its own deletion; do not reason about the
 * database from it.
 *
 * The byte cap is written `65_536` so it reads as the power of two it is
 * rather than as a number somebody picked.
 */
export const SECTION_LIMITS = {
  /** Sections per fursona. */
  sections: 20,
  /** Items per section. */
  items: 50,
  /** Characters in any one text field. */
  text: 2000,
  /** Bytes in the whole serialised array. */
  bytes: 65_536,
} as const;

/** A text field somebody writes in one language. */
const text = z.string().max(SECTION_LIMITS.text);

/**
 * A field the author may simply not have written yet.
 *
 * Optional rather than required-but-empty, and this is the difference between
 * a person's own words and a catalogue key: next-intl fails a build for a
 * missing translation, because those are the app's own chrome. These are
 * somebody's writing about their own character, and not having written the
 * Spanish yet is an ordinary state that must never be reported as a fault.
 */
const optionalText = text.optional();

/**
 * One entry inside a section.
 *
 * **A title is required and a description is not.** An item is a heading with
 * something under it: without the heading there is a blank box and nothing to
 * render, while without the description there is a perfectly good card — which
 * is exactly what a template hands somebody to fill in. Every public layout
 * leaves the element out when it is empty; `two-column` goes further and drops
 * the whole row, because a label with no value is half a pair rather than a
 * heading on its own.
 *
 * `icon`, `image_url` and `link_url` are all optional and all stored on every
 * item whatever the layout, which is deliberate: `0009` accepts them on any
 * item, so switching a section to another layout to look at it and switching
 * back finds what was typed still there. What each layout RENDERS is a separate
 * question, and the editor offers only the fields the layout will use — a
 * control that stores what somebody types and shows nothing is the worst kind,
 * because nothing tells them it did nothing.
 *
 * `link_url` is not validated here beyond its length. The rule that matters is
 * enforced where it is used, by `resolveEmbed` and `safeHttpUrl`, which build
 * an address rather than trusting one.
 */
export const sectionItemSchema = z.object({
  title_en: text.min(1),
  title_es: optionalText,
  // **A description may be empty, and a title may not.** An item is a heading
  // with something under it: without the heading it is a blank box, and a
  // renderer has nothing to show. Without the description it is a heading, which
  // is a perfectly good card — and it is what a template hands somebody to fill
  // in.
  //
  // This required a non-empty string until templates shipped their guidance as
  // CONTENT rather than as a prompt, which meant a page created from one and
  // published unedited read its own instructions out to strangers. `0009` has
  // always accepted the empty string; only this line forbade it.
  description_en: text,
  description_es: optionalText,
  icon: optionalText,
  image_url: optionalText,
  link_url: optionalText,
  sort_order: z.number().int(),
});

/**
 * The keys a section's own style bag may carry, shared by the strict (write)
 * and lenient (read) schemas below — see {@link sectionStyleSchema} and
 * {@link readSectionsSchema} for why there are two.
 */
const sectionStyleShape = {
  skin: z.string().max(32).optional(),
  background_url: z.string().max(500).optional(),
  background_fit: z.enum(["cover", "tile"]).optional(),
  // The MINIMUM width a card in this section's grid may shrink to; the
  // browser decides how many fit at that width, exactly as an `auto-fill`
  // grid track does — this sets no column count of its own. Absent means
  // the page's default, the same resting state as every other key here.
  card_size: z.enum(["s", "m", "l"]).optional(),
  // **`none` is a CHOICE and absence is INHERITANCE — the two are not the
  // same state.** Absent means the section takes whatever
  // `--skin-border-style` the page (or an enclosing scope) already set;
  // `"none"` means the author explicitly turned the border off for this
  // section, regardless of what the page around it does. Storing `""` for
  // either would be the third state this bag has refused everywhere else in
  // it — `none` is a member of the enum for exactly that reason, rather than
  // the empty string standing in for it.
  border: z.enum(["solid", "dashed", "dotted", "double", "none"]).optional(),
  // **Nothing writes this in the flat shape and nothing reads it here.** It is
  // present because `style-bag-parity.test.ts` holds the two bags identical,
  // and the guard is worth more than the one unused key: a bag that may differ
  // is a bag somebody will let differ by accident. The block model is where it
  // means something — see `blockStyleShape`.
  bleed: z.boolean().optional(),
  // **Nothing writes this in the flat shape and nothing reads it here either**,
  // for the same reason `bleed` above is present: the two bags are held
  // identical by `style-bag-parity.test.ts`, and a bag that may differ is a bag
  // somebody lets differ by accident. `blockStyleShape` is where it means
  // something — absent or `true` keeps a section's page chrome, `false` removes
  // it.
  margins: z.boolean().optional(),
};

/**
 * How one section chooses to LOOK. Form only — never colour.
 *
 * Colour is the page's, chosen once in the theme configurator, and that split
 * is what every one of this hub's skins rests on: a skin names no colour of
 * its own. A per-section colour would collapse every pairing of a style and a
 * palette into a colour scheme.
 *
 * Every key is optional and **absent means "inherit the page"** — a real
 * answer, not a gap, exactly as the theme's own keys work.
 *
 * **`.strict()` refuses an unknown key rather than silently dropping it**,
 * which `z.object` does by default. That matched `set_actor_sections`, which
 * refused the same typo at the write instead of storing it and rendering
 * nothing — the "control that does nothing" fault this project keeps
 * catching. That function validates blocks now, and refuses this shape
 * outright. **This is the WRITE-path schema only** — see
 * {@link readSectionsSchema} for why reading stored data needs the opposite
 * choice.
 *
 * `skin` is deliberately **not** checked against `SKINS` here, matching how
 * `set_actor_theme` treats the page's own skin: the renderer falls back for a
 * name it does not know, and a list here would be a second place to keep in
 * step with every skin this hub adds.
 */
export const sectionStyleSchema = z.object(sectionStyleShape).strict();

/**
 * The lenient counterpart of {@link sectionStyleSchema}, used only by
 * {@link readSectionsSchema} to parse what is already stored.
 *
 * Carries the same keys, without `.strict()` — so `z.object`'s default
 * behaviour applies: an unrecognised key is stripped rather than refused.
 */
const sectionStyleSchemaForReading = z.object(sectionStyleShape);

/**
 * One section of a fursona's page.
 *
 * `style` is optional and absent whenever the author has not chosen to
 * override the page — see {@link sectionStyleSchema}, which owns the shape.
 * This is the WRITE-path shape; {@link readSectionsSchema} composes a
 * lenient variant of it rather than reusing this one directly.
 */
export const sectionSchema = z.object({
  name_en: text.min(1),
  name_es: optionalText,
  type: z.enum(SECTION_TYPES),
  sort_order: z.number().int(),
  items: z.array(sectionItemSchema).max(SECTION_LIMITS.items),
  style: sectionStyleSchema.optional(),
});

/**
 * The read-path counterpart of {@link sectionSchema}: identical, except its
 * `style` accepts an unknown key by stripping it rather than refusing the
 * whole section.
 */
const sectionSchemaForReading = sectionSchema.extend({
  style: sectionStyleSchemaForReading.optional(),
});

/**
 * The array-level rules shared by the write and read schemas below — a count
 * cap and a serialised byte cap, checked identically whichever section shape
 * is inside.
 *
 * Factored out so the byte cap — the backstop that catches a payload legal in
 * every individual field and ruinous in total, exactly as `0009` checks it
 * last on the serialised value — is written once rather than kept in step by
 * hand across both callers.
 *
 * @param schema - the section shape to validate: {@link sectionSchema} for
 *   {@link sectionsSchema}, {@link sectionSchemaForReading} for
 *   {@link readSectionsSchema}.
 * @returns the array schema.
 */
function sectionsArraySchema<T extends z.ZodType>(schema: T) {
  return z
    .array(schema)
    .max(SECTION_LIMITS.sections)
    .refine(
      (sections) => JSON.stringify(sections).length <= SECTION_LIMITS.bytes,
      { message: "sections are too large" },
    );
}

/**
 * Everything a fursona's page is made of, as the EDITOR validates it before
 * saving.
 *
 * **Strict on every unknown key, section or style alike** — a typo the author
 * just typed is refused rather than silently dropped. Use
 * {@link readSectionsSchema} instead when parsing what is already stored; the
 * two differ on purpose, see there. **Nothing this schema accepts is writable
 * any more**: `set_actor_sections` validates blocks, and refuses this shape.
 */
export const sectionsSchema = sectionsArraySchema(sectionSchema);

/**
 * Everything a fursona's page is made of, as it is READ back from storage.
 *
 * **Lenient on an unknown style key, where {@link sectionsSchema} is strict —
 * this is a deliberate ruling, not an oversight.** `sectionStyleSchema`'s
 * `.strict()` is right at the write: a typo the author just typed should be
 * refused. It is wrong at the read: `z`'s array validation fails the WHOLE
 * array the moment one section's `style` carries a key this build does not
 * recognise, and both `readActorPage` and `parseSections` treat that failure
 * as "no sections at all" — an owner's editor and a stranger's public page
 * both render EMPTY. Phase D adds `card_size` to this exact bag, so any
 * window where the database is ahead of the running app — a migration
 * deployed before the code that reads its new key, or a rollback — would
 * blank every page carrying that key, not merely fail to show it. Stripping
 * an unrecognised style key here costs nothing a stranger would notice: the
 * key was never going to render regardless, and every other key on the
 * section still does.
 */
export const readSectionsSchema = sectionsArraySchema(sectionSchemaForReading);

/** One section, as the editor holds it. */
export type FursonaSection = z.infer<typeof sectionSchema>;
