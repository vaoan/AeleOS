import { describe, expect, it } from "vitest";
import en from "@/shared/infrastructure/i18n/messages/en.json";
import es from "@/shared/infrastructure/i18n/messages/es.json";
import { routing } from "@/shared/infrastructure/i18n/routing";

/**
 * Every leaf key in a nested catalogue, dot-joined.
 *
 * @param value - the catalogue or a nested object within it.
 * @param prefix - the path accumulated so far.
 * @returns every leaf key path.
 */
function collectKeys(value: Record<string, unknown>, prefix = ""): string[] {
  const keys: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === "object" && !Array.isArray(child)) {
      keys.push(...collectKeys(child as Record<string, unknown>, path));
    } else {
      keys.push(path);
    }
  }
  return keys;
}

/**
 * Reads a dot-joined key out of a catalogue.
 *
 * @param catalogue - the catalogue to read from.
 * @param key - the dot-joined path.
 * @returns the value at that path.
 */
function valueAt(catalogue: Record<string, unknown>, key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>(
      (current, part) => (current as Record<string, unknown>)?.[part],
      catalogue,
    );
}

const enKeys = collectKeys(en).sort();
const esKeys = collectKeys(es).sort();

describe("message catalogues", () => {
  it("cover every configured locale", () => {
    // A locale with no catalogue throws at request time, on that locale only —
    // so it is invisible until someone with that browser language arrives.
    expect([...routing.locales].sort()).toEqual(["en", "es"]);
  });

  it("are not empty", () => {
    expect(enKeys.length).toBeGreaterThan(0);
    expect(esKeys.length).toBeGreaterThan(0);
  });

  // The failure this prevents is one-sided and silent: next-intl renders the
  // key itself when a message is missing, so a Spanish visitor sees
  // "home.tagline" on the page while English looks perfect.
  it("have exactly the same keys", () => {
    expect(enKeys.filter((k) => !esKeys.includes(k))).toEqual([]);
    expect(esKeys.filter((k) => !enKeys.includes(k))).toEqual([]);
  });

  it("have no empty English values", () => {
    expect(enKeys.filter((k) => valueAt(en, k) === "")).toEqual([]);
  });

  it("have no empty Spanish values", () => {
    expect(esKeys.filter((k) => valueAt(es, k) === "")).toEqual([]);
  });

  // An untranslated string is easy to miss in review and reads as a bug to the
  // person seeing it. The exceptions are listed rather than tolerated by a
  // rule, so adding one is a deliberate edit somebody has to justify:
  //
  // - the two titles are the product name, which does not translate
  // - `profile.empty` is an em dash, which is punctuation rather than language
  // - `nav.fursonas` is the community's own loanword, used untranslated in
  //   Spanish exactly as it is in English. The catalogue already relies on
  //   that: `fursonas.title` is "Tus fursonas", translating the phrase around
  //   a word it leaves alone. The nav label is that word with no phrase to
  //   carry, so the two languages coincide.
  // - `fursonas.templates.fursuit.name` is the same loanword, and the same
  //   case: the template's DESCRIPTION beside it is translated, so this is one
  //   word that does not translate rather than one that was forgotten.
  // - `fursonas.types.video` is the same word in both languages. Every other
  //   layout name beside it is translated, which is the evidence that this one
  //   was considered rather than skipped.
  it("have no Spanish values left identical to the English", () => {
    const allowed = [
      "fursonas.templates.fursuit.name",
      // The same loanword again, heading the list of somebody's characters on
      // their public page. Spanish uses it unchanged, exactly as `nav.fursonas`
      // does.
      "publicProfile.fursonas",
      "home.title",
      "meta.title",
      "profile.empty",
      "nav.fursonas",
      "fursonas.types.video",
      // Latin, and the same word in both languages. The canvases beside it are
      // translated, which is the evidence this one was considered.
      "fursonas.canvases.aurora",
    ];
    const untranslated = enKeys.filter(
      (k) => valueAt(en, k) === valueAt(es, k),
    );
    expect(untranslated.sort()).toEqual(allowed.sort());
  });
});
