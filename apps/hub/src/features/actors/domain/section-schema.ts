import { z } from "zod";

/**
 * The four ways a section can be laid out.
 *
 * Libra's set, adopted unchanged. Divergence here is what would make a future
 * port from that repository stop being mechanical, which is the whole reason
 * the studio's client stack was taken on.
 */
export const SECTION_TYPES = [
  "cards",
  "accordion",
  "two-column",
  "gallery",
] as const;

/** One of the four layouts. */
export type SectionType = (typeof SECTION_TYPES)[number];

/**
 * What `0013` will accept, mirrored so somebody hears about a cap while typing.
 *
 * **The database is authoritative and this is a copy**, which is a thing worth
 * being nervous about: a copy that drifts either rejects what the database
 * would have taken or promises what it will refuse. So it is not trusted to
 * stay right — `section-limits-match-migration.test.ts` reads the migration and
 * fails if any of these four stops matching.
 *
 * Change one of these only by changing `0013` too. The guard will say so.
 */
export const SECTION_LIMITS = {
  /** Sections per fursona. */
  sections: 20,
  /** Items per section. */
  items: 50,
  /** Characters in any one text field. */
  text: 2000,
  /** Bytes in the whole serialised array. */
  bytes: 65536,
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

/** One entry inside a section. */
export const sectionItemSchema = z.object({
  title_en: text.min(1),
  title_es: optionalText,
  description_en: text.min(1),
  description_es: optionalText,
  icon: optionalText,
  image_url: optionalText,
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
 * The byte cap is checked last, on the serialised value, exactly as `0013`
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
