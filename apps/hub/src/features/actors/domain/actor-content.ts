/**
 * Picks a bilingual field for the locale being read, falling back to English.
 *
 * **The fallback direction is forced by the schema, not chosen.** `0009`
 * requires `name_en`, `title_en` and `description_en` and makes every `_es`
 * optional, so Spanish is the field that may be missing. Reading the locale's
 * field and falling back to English therefore shows the author's own words
 * rather than a blank heading.
 *
 * That is the OPPOSITE of the app's chrome, which falls back to **Spanish**
 * deliberately, and confusing the two is the mistake this function exists to
 * prevent. The catalogues are the repository's words and a missing key is a
 * build failure; these are a person's words about their own character, and not
 * having written the Spanish yet is an ordinary state that must never be
 * reported as a fault.
 *
 * @param source - the object holding `<field>_en` and optionally `<field>_es`.
 * @param field - the field's base name, as in `title`.
 * @param locale - the locale being rendered.
 * @returns the locale's value when it has one, the English one when it does
 * not, and `""` when neither is written — never a marker, a warning, or the
 * key itself.
 */
export function contentFor(
  source: Record<string, unknown>,
  field: string,
  locale: string,
): string {
  const localised = source[`${field}_${locale}`];
  if (typeof localised === "string" && localised.trim() !== "") {
    return localised;
  }

  const english = source[`${field}_en`];
  return typeof english === "string" ? english : "";
}
