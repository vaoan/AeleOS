import { describe, expect, it } from "vitest";
import { SECTION_TYPES } from "@/features/actors/domain/section-schema";
import { EMBED_PROVIDERS } from "@/shared/domain/embed-providers";
import {
  presetSection,
  SECTION_PRESETS,
} from "@/features/actors/presentation/section-presets";

/** The layouts that genuinely embed, and so must be backed by a provider. */
const EMBEDDING_TYPES = new Set(["posts", "video", "music"]);

describe("SECTION_PRESETS", () => {
  it("only ever targets a layout the schema actually knows", () => {
    for (const preset of SECTION_PRESETS) {
      expect(SECTION_TYPES).toContain(preset.type);
    }
  });

  it("gives Bluesky socials, never posts — its embed host rejects the handle a shareable link carries", () => {
    const bluesky = SECTION_PRESETS.find((preset) => preset.id === "bluesky");
    expect(bluesky?.type).toBe("socials");
  });

  it("has no two presets sharing an id", () => {
    const ids = SECTION_PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // The rule the brief actually states: a preset may only target a layout
  // that can actually handle the brand. `type` alone cannot enforce this —
  // it only proves the layout exists, not that it embeds this brand — so the
  // declared `provider` link is what closes the gap, checked both ways.
  it("names a provider, that EMBED_PROVIDERS actually has, for every embedding preset", () => {
    const providerIds = new Set(EMBED_PROVIDERS.map((provider) => provider.id));
    for (const preset of SECTION_PRESETS) {
      if (!EMBEDDING_TYPES.has(preset.type)) continue;
      expect(preset.provider).toBeDefined();
      expect(providerIds.has(preset.provider!)).toBe(true);
    }
  });

  it("names no provider for a socials preset — the layout cannot honour one", () => {
    for (const preset of SECTION_PRESETS) {
      if (preset.type !== "socials") continue;
      expect(preset.provider).toBeUndefined();
    }
  });
});

describe("presetSection", () => {
  it("names both languages with the brand's own name, verbatim, and starts with no items", () => {
    const preset = SECTION_PRESETS[0]!;

    expect(presetSection(preset, 3)).toEqual({
      name_en: preset.name,
      name_es: preset.name,
      type: preset.type,
      sort_order: 3,
      items: [],
    });
  });

  it("never mutates the preset it was given", () => {
    const preset = { ...SECTION_PRESETS[0]! };
    const before = JSON.stringify(preset);

    presetSection(preset, 1);

    expect(JSON.stringify(preset)).toBe(before);
  });
});
