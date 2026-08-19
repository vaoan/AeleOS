import { describe, expect, it } from "vitest";
import {
  CONTAINER_MODES,
  LEAF_KINDS,
  BLOCK_LIMITS,
  blocksSchema,
  isContainer,
} from "@/features/actors/domain/block-schema";
import { EMBED_PROVIDERS } from "@/shared/domain/embed-providers";
import {
  presetBlock,
  SECTION_PRESETS,
} from "@/features/actors/presentation/section-presets";

/** The content kinds that genuinely embed, and so must be backed by a provider. */
const EMBEDDING_KINDS = new Set(["post", "player"]);

describe("SECTION_PRESETS", () => {
  it("only ever targets an arrangement and a kind the schema actually knows", () => {
    for (const preset of SECTION_PRESETS) {
      expect(CONTAINER_MODES).toContain(preset.mode);
      expect(LEAF_KINDS).toContain(preset.kind);
      expect(preset.spaces).toBeGreaterThanOrEqual(1);
      expect(preset.spaces).toBeLessThanOrEqual(BLOCK_LIMITS.spaces);
    }
  });

  it("gives Bluesky a social chip, never a post — its embed host rejects the handle a shareable link carries", () => {
    const bluesky = SECTION_PRESETS.find((preset) => preset.id === "bluesky");
    expect(bluesky?.kind).toBe("social");
  });

  it("has no two presets sharing an id", () => {
    const ids = SECTION_PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // The rule the brief actually states: a preset may only target a content
  // kind that can actually handle the brand. `kind` alone cannot enforce this
  // — it only proves the kind exists, not that it embeds this brand — so the
  // declared `provider` link is what closes the gap, checked both ways.
  it("names a provider, that EMBED_PROVIDERS actually has, for every embedding preset", () => {
    const providerIds = new Set(EMBED_PROVIDERS.map((provider) => provider.id));
    for (const preset of SECTION_PRESETS) {
      if (!EMBEDDING_KINDS.has(preset.kind)) continue;
      expect(preset.provider).toBeDefined();
      expect(providerIds.has(preset.provider!)).toBe(true);
    }
  });

  it("names no provider for a social preset — the kind cannot honour one", () => {
    for (const preset of SECTION_PRESETS) {
      if (preset.kind !== "social") continue;
      expect(preset.provider).toBeUndefined();
    }
  });
});

describe("presetBlock", () => {
  it("names both languages with the brand's own name, verbatim", () => {
    const preset = SECTION_PRESETS[0]!;
    const block = presetBlock(preset);

    expect(block.name_en).toBe(preset.name);
    expect(block.name_es).toBe(preset.name);
    expect(block.mode).toBe(preset.mode);
    expect(block.spaces).toBe(preset.spaces);
  });

  // THE BOX ARRIVES READY FOR AN ADDRESS. A preset that produced an empty
  // container would hand somebody a brand-named shape and no clue which of ten
  // content kinds that brand needs — which is the whole affordance the preset
  // list exists to give.
  it("fills its first place with the kind that brand fits, and leaves the rest empty", () => {
    for (const preset of SECTION_PRESETS) {
      const block = presetBlock(preset);
      expect(block.children).toHaveLength(preset.spaces);
      const [first, ...rest] = block.children;
      expect(first && !isContainer(first) && first.kind).toBe(preset.kind);
      expect(rest.every((child) => child === null)).toBe(true);
    }
  });

  // The database is the authority, so what a preset produces has to be
  // something it would take — bar the empty title every new leaf carries,
  // which the person fills in before saving.
  it("produces a page the write schema accepts once its leaf is titled", () => {
    for (const preset of SECTION_PRESETS) {
      const block = presetBlock(preset);
      const titled = {
        ...block,
        children: block.children.map((child) =>
          child ? { ...child, title_en: "Something" } : null,
        ),
      };
      expect(blocksSchema.safeParse([titled]).success).toBe(true);
    }
  });

  it("never mutates the preset it was given", () => {
    const preset = { ...SECTION_PRESETS[0]! };
    const before = JSON.stringify(preset);

    presetBlock(preset);

    expect(JSON.stringify(preset)).toBe(before);
  });
});
