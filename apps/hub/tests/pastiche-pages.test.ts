import { describe, expect, it } from "vitest";

import { PAGES, ERA_LOOKS } from "../../../scripts/pastiche-pages.mjs";
import { parseTheme } from "@/features/actors/domain/actor-theme";
import { blocksSchema } from "@/features/actors/domain/block-schema";
import { REQUIRED_KINDS } from "@/features/actors/domain/required-blocks";

/** Every seeded page, social and era look alike, with a name to report by. */
const everyPage = [
  ...PAGES.map((p) => [p.handle, p.blocks, p.theme] as const),
  ...ERA_LOOKS.map((l) => [l.id, l.blocks, l.theme] as const),
];

describe("every seeded page", () => {
  it("covers both sets", () => {
    // A vacuous suite is the failure mode here: if the import ever answers an
    // empty array every case below passes for free.
    expect(everyPage.length).toBe(16);
  });

  it.each(everyPage)(
    "%s keeps every theme value it sets",
    (id, _blocks, theme) => {
      // parseTheme is the READ path — it normalises, drops and clamps. Asserting
      // idempotence would be true and useless: what matters is that no value the
      // seeder sets is silently DISCARDED at read, which is the exact shape of
      // the shipped `measure` bug — a vocabulary written down in TypeScript that
      // the read path had never heard of.
      const parsed = parseTheme(theme) as Record<string, unknown>;
      for (const [key, value] of Object.entries(theme)) {
        if (value === null) continue; // null means "the design's own", not a value.
        expect(parsed[key], `${id} lost its ${key}`).toEqual(value);
      }
    },
  );

  it.each(everyPage)("%s is a tree the schema accepts", (_id, blocks) => {
    expect(() => blocksSchema.parse(blocks)).not.toThrow();
  });

  it.each(everyPage)("%s carries every required kind", (id, blocks) => {
    const kinds = new Set<string>();
    const walk = (b: unknown): void => {
      const node = b as { kind?: string; children?: unknown[] };
      if (node.kind) kinds.add(node.kind);
      node.children?.forEach(walk);
    };
    (blocks as unknown[]).forEach(walk);
    // Every one of these is a fursona page, so `owner` is required and
    // `fursonas` is refused.
    for (const required of REQUIRED_KINDS.fursona) {
      expect(kinds, `${id} is missing a ${required} block`).toContain(required);
    }
  });
});
