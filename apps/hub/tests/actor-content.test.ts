import { describe, expect, it } from "vitest";
import { contentFor } from "@/features/actors/domain/actor-content";

const item = {
  title_en: "English title",
  title_es: "Título en español",
  description_en: "English words.",
};

describe("contentFor", () => {
  it("returns the locale's own value", () => {
    expect(contentFor(item, "title", "es")).toBe("Título en español");
  });

  it("returns English when English is what was asked for", () => {
    expect(contentFor(item, "title", "en")).toBe("English title");
  });

  // Not a marker, not the key, not a warning: the author's own words in the
  // language they did write. Somebody reading in Spanish sees the English
  // rather than a blank heading.
  it("falls back to English when the locale's field is absent", () => {
    expect(contentFor(item, "description", "es")).toBe("English words.");
  });

  it("falls back when the locale's field is present but empty", () => {
    expect(contentFor({ ...item, title_es: "" }, "title", "es")).toBe(
      "English title",
    );
  });

  it("falls back when the locale's field is only whitespace", () => {
    expect(contentFor({ ...item, title_es: "   " }, "title", "es")).toBe(
      "English title",
    );
  });

  it("falls back when the locale's field is not a string at all", () => {
    expect(contentFor({ ...item, title_es: 42 }, "title", "es")).toBe(
      "English title",
    );
  });

  it("returns empty when neither language is written", () => {
    expect(contentFor({}, "title", "es")).toBe("");
  });

  it("returns empty when the English field is not a string", () => {
    expect(contentFor({ title_en: null }, "title", "es")).toBe("");
  });

  // THE DIRECTION MATTERS. `_en` is the required field and `_es` the optional
  // one, so falling back the other way would show a blank where the schema
  // guarantees a value. A test that only checked "some fallback happens" would
  // pass with the arrows reversed.
  it("never falls back from English to Spanish", () => {
    expect(contentFor({ title_es: "Sólo español" }, "title", "en")).toBe("");
  });
});
