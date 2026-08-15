import { z } from "zod";

/**
 * The ways a section can be laid out.
 *
 * The first four are Libra's set, adopted unchanged so that a future port from
 * that repository stays mechanical. The rest are this hub's own: a fursona page
 * is somebody's character rather than a product listing, and the layouts that
 * serve a catalogue do not stretch to a page whose whole job is to be theirs.
 *
 * **The database holds this same list in `is_section_type()`**, and it is
 * authoritative — a type it does not know is refused whatever this array says.
 * `section-limits-match-migration.test.ts` reads the SQL and fails the build if
 * the two ever disagree, so neither side can be extended alone.
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
] as const;

/** One of the layouts. */
export type SectionType = (typeof SECTION_TYPES)[number];

/**
 * What `0009` will accept, mirrored so somebody hears about a cap while typing.
 *
 * **The database is authoritative and this is a copy**, which is a thing worth
 * being nervous about: a copy that drifts either rejects what the database
 * would have taken or promises what it will refuse. So it is not trusted to
 * stay right — `section-limits-match-migration.test.ts` reads the migration and
 * fails if any of these four stops matching.
 *
 * Change one of these only by changing `0009` too. The guard will say so.
 *
 * The byte cap is written `65_536` so it reads as the power of two it is
 * rather than as a number somebody picked. The migration states the same value
 * in SQL, where separators are not available, and the guard compares them as
 * numbers — so the two spellings cannot drift apart.
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

/** One section of a fursona's page. */
export const sectionSchema = z.object({
  name_en: text.min(1),
  name_es: optionalText,
  type: z.enum(SECTION_TYPES),
  sort_order: z.number().int(),
  items: z.array(sectionItemSchema).max(SECTION_LIMITS.items),
});

/**
 * Everything a fursona's page is made of.
 *
 * The byte cap is checked last, on the serialised value, exactly as `0009`
 * does — it is the backstop that catches a payload legal in every individual
 * field and ruinous in total, which no per-field rule can see.
 */
export const sectionsSchema = z
  .array(sectionSchema)
  .max(SECTION_LIMITS.sections)
  .refine(
    (sections) => JSON.stringify(sections).length <= SECTION_LIMITS.bytes,
    { message: "sections are too large" },
  );

/** One section, as the editor holds it. */
export type FursonaSection = z.infer<typeof sectionSchema>;

/** One item within a section. */
export type FursonaSectionItem = z.infer<typeof sectionItemSchema>;
