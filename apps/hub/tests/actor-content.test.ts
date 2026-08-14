import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  contentFor,
  isMachineHandle,
} from "@/features/actors/domain/actor-content";

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

describe("isMachineHandle", () => {
  it("knows the handle provisioning mints", () => {
    expect(isMachineHandle("u-78797f558e275eb3b3254726f43f1667")).toBe(true);
  });

  it("is case-insensitive, because a uuid may be rendered either way", () => {
    expect(isMachineHandle("U-78797F558E275EB3B3254726F43F1667")).toBe(true);
  });

  // Anchored at both ends and exact in length. A handle that merely starts
  // with `u-`, or is one hex short, is somebody's own name.
  it.each([
    "u-78797f558e275eb3b3254726f43f166",
    "u-78797f558e275eb3b3254726f43f16677",
    "xu-78797f558e275eb3b3254726f43f1667",
    "u-78797f558e275eb3b3254726f43f1667x",
    "u-not-hex-at-all",
    "luna",
    "u-shaped",
  ])("leaves %s alone", (handle) => {
    expect(isMachineHandle(handle)).toBe(false);
  });

  // **Pinned to the database's own reserved namespace.** `0007` refuses this
  // exact shape as a chosen handle, which is what makes the guard total: a
  // fursona cannot be named into looking like a person. If one file's pattern
  // moves and the other's does not, a chosen handle could be hidden from its
  // own page or a person's reference could be shown on one.
  it("matches the shape the database reserves", () => {
    const sql = readFileSync(
      join(
        process.cwd(),
        "..",
        "..",
        "supabase",
        "migrations",
        "0007_fursona_self_service.sql",
      ),
      "utf8",
    );
    expect(sql).toContain("'^u-[0-9a-f]{32}$'");
  });
});
