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

/**
 * Whether a handle is the machine one provisioning mints.
 *
 * A person is created with `u-<actor_ref with the hyphens removed>` — see
 * `0006` — because a handle is `not null` and nobody has chosen one yet. It is
 * an internal value and **must never be rendered to anybody**, for two reasons:
 *
 *  * It is `actor_ref` in a thin disguise. On a PERSON that reference is the
 *    `owner_ref` of every fursona they own, which is precisely the column
 *    `/api/actors/mine` strips out by name. A public page printing it hands it
 *    to every stranger who visits, permanently.
 *  * It is machine text at the top of somebody's page. `docs/integrating.md`
 *    tells every consuming app never to show it to a person, and the hub does
 *    not get an exemption from its own contract.
 *
 * Matched on shape rather than compared against a computed value, so it holds
 * for an actor whose reference the caller does not have — which is every actor
 * on a public page.
 *
 * @param handle - the handle as stored.
 * @returns true when it is the provisioned one and not a chosen name.
 */
export function isMachineHandle(handle: string): boolean {
  return /^u-[0-9a-f]{32}$/i.test(handle);
}
