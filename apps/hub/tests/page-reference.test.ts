import { describe, expect, it } from "vitest";
import {
  KIND_MEANINGS,
  MODE_MEANINGS,
  pageReference,
  ROWS_MEANINGS,
  THEME_KEY_MEANINGS,
} from "@/features/actors/domain/page-reference";
import {
  CONTAINER_MODES,
  LEAF_KINDS,
  MAX_DEPTH,
} from "@/features/actors/domain/block-schema";
import { parseDocument } from "@/features/actors/domain/page-document";
import { missingRequiredKinds } from "@/features/actors/domain/required-blocks";
import { DEFAULT_THEME } from "@/features/actors/domain/actor-theme";
import { leafFields } from "@/features/actors/domain/leaf-fields";

describe("the reference describes every member of every vocabulary", () => {
  it("has a meaning for each container mode", () => {
    for (const mode of CONTAINER_MODES) {
      // `.trim().length` rather than `toBeTruthy()`: a whitespace-only string
      // is truthy and would pass this check while printing nothing readable —
      // a gate that can be satisfied by " " is not a gate.
      expect(
        MODE_MEANINGS[mode].trim().length,
        `no meaning written for mode "${mode}"`,
      ).toBeGreaterThan(0);
    }
    expect(Object.keys(MODE_MEANINGS)).toHaveLength(CONTAINER_MODES.length);
  });

  it("has a meaning for each leaf kind", () => {
    for (const kind of LEAF_KINDS) {
      expect(
        KIND_MEANINGS[kind].trim().length,
        `no meaning written for kind "${kind}"`,
      ).toBeGreaterThan(0);
    }
    expect(Object.keys(KIND_MEANINGS)).toHaveLength(LEAF_KINDS.length);
  });

  it("has a meaning for each theme key, gated against DEFAULT_THEME's own keys", () => {
    // `ActorTheme` is a TypeScript interface with no runtime existence, so
    // `DEFAULT_THEME` — a real object typed `: ActorTheme` — is what stands
    // in for "every key the type has". This is what actually catches a field
    // ADDED to `ActorTheme` and `DEFAULT_THEME` together: the `satisfies`
    // on `THEME_KEY_MEANINGS` alone would not notice `DEFAULT_THEME` holding
    // a key this record lacks, only the reverse.
    const themeKeys = Object.keys(DEFAULT_THEME);
    for (const key of themeKeys) {
      expect(
        (THEME_KEY_MEANINGS as Record<string, string>)[key]?.trim().length,
        `no meaning written for theme key "${key}"`,
      ).toBeGreaterThan(0);
    }
    expect(Object.keys(THEME_KEY_MEANINGS).sort()).toEqual(
      [...themeKeys].sort(),
    );
  });

  it("names rows' meaning for exactly the kinds that read it, and no others", () => {
    // The direct regression guard for the Critical finding: this file and
    // `block-schema.ts` both once asserted "`table` is the only kind that
    // reads `rows`" as an absolute, when `leafFields("player").rows` and
    // `leafFields("jukebox").rows` were already `true`. Checking against
    // `leafFields` — the renderer's own answer, pinned by
    // `leaf-fields.test.tsx` — is what makes that specific falsehood
    // impossible to restate silently a second time.
    for (const kind of LEAF_KINDS) {
      const reads = leafFields(kind).rows;
      // One unconditional assertion rather than an `if`/`else` pair of
      // `expect`s — `vitest/no-conditional-expect` refuses the latter, and
      // this states the identical claim: a meaning is written if and only if
      // the kind reads `rows`.
      expect(
        Boolean(ROWS_MEANINGS[kind]),
        `"${kind}" reads rows (${reads}) but has a meaning written (${String(ROWS_MEANINGS[kind])})`,
      ).toBe(reads);
    }
  });

  it("groups player and jukebox under the same field shape the renderer does", () => {
    // `page-reference.ts`'s `RETRO_KINDS` names player/jukebox by hand rather
    // than deriving them, because nothing in `LeafFields` distinguishes an
    // `icon` that is a glyph from one that is a chrome choice. This is the
    // check that stands in for that derivation: `leaf-fields.ts` draws both
    // kinds from its one shared `RETRO` object, so if a future change ever
    // gives them different field shapes, this reddens and says so — which is
    // the cue to revisit `RETRO_KINDS` too.
    expect(leafFields("player")).toEqual(leafFields("jukebox"));
  });
});

describe("the reference is built from the constants rather than typed out", () => {
  it("names every mode in its own row, not merely as a substring anywhere", () => {
    const text = pageReference("fursona");
    // A bare `toContain(mode)` is satisfied incidentally: "list" appears in
    // "block-grid", "grid" in "grid-cols", etc. Matching the exact generated
    // row — `` `mode` — meaning `` — ties the assertion to the row this
    // function actually emits rather than to any occurrence of the word.
    for (const mode of CONTAINER_MODES) {
      expect(text).toContain(`\`${mode}\` — ${MODE_MEANINGS[mode]}`);
    }
  });

  it("names every leaf kind in its own row, not merely as a substring anywhere", () => {
    const text = pageReference("fursona");
    // Same reasoning as the mode case above: bare `toContain(kind)` passes
    // incidentally for "name" (`name_en`), "text" (`text_align`), "link"
    // (`link_url`), "picture" ("background picture"), "table", "list" and
    // "grid" — none of which is the kind's own row.
    for (const kind of LEAF_KINDS) {
      expect(text).toContain(`\`${kind}\` — ${KIND_MEANINGS[kind]}`);
    }
  });

  it("names the depth cap as a number rather than a word", () => {
    expect(pageReference("fursona")).toContain(String(MAX_DEPTH));
  });

  it("tells a person's page and a fursona's apart", () => {
    expect(pageReference("person")).toContain("fursonas");
    expect(pageReference("person")).toContain("owner");
    // A person's page refuses `owner`; the reference has to say so, or a model
    // reading it will emit one and the import will report a refusal the
    // document we handed them never warned about.
    expect(pageReference("person")).toMatch(/(refuses|refused)[^.]*owner/i);
    expect(pageReference("fursona")).toMatch(/(refuses|refused)[^.]*fursonas/i);
  });

  it("states that a theme object resets every field it omits, not merely the one named", () => {
    // The other Important finding: the reference used to say "any theme key
    // this document omits ... is left exactly as it already is on the page",
    // which is false the moment a `theme` object is sent at all — `parseTheme`
    // resolves every field independently, each falling back to the design's
    // own default. Only the whole `theme` KEY being absent or null leaves the
    // page untouched.
    const text = pageReference("fursona");
    expect(text).toMatch(/not a patch/i);
    expect(text).toMatch(/resets? (the accent|everything else)/i);
  });

  it("carries a complete worked example that this build can read and accepts as complete", () => {
    const example = pageReference("fursona").match(/```json\n([\s\S]*?)```/);
    expect(
      example?.[1],
      "the reference has no fenced JSON example",
    ).toBeTruthy();
    // Proves the example is not merely plausible: it goes through the real
    // parser. An example a model copies that this build refuses is worse than
    // no example at all.
    const parsed = parseDocument(example![1], "fursona");
    expect(parsed.ok, `${JSON.stringify(parsed)}`).toBe(true);
    if (!parsed.ok) return;
    // `parseDocument` only ever checks REFUSED kinds, never required ones —
    // so an example missing `avatar` would still parse `ok: true` while
    // `set_actor_sections` refuses it outright. This is the Important finding
    // that gap left uncaught the first time.
    expect(missingRequiredKinds(parsed.blocks, "fursona")).toEqual([]);
  });

  it("carries a complete worked example for a person's page too", () => {
    // The worked example is generated per `kind` — a person's page requires
    // `fursonas` and refuses `owner`, the exact mirror of a fursona's — so
    // this is not the same fixture as the case above under a different label:
    // an example built for "fursona" and handed out unchanged when generating
    // for "person" would fail exactly this parse.
    const example = pageReference("person").match(/```json\n([\s\S]*?)```/);
    expect(
      example?.[1],
      "the reference has no fenced JSON example",
    ).toBeTruthy();
    const parsed = parseDocument(example![1], "person");
    expect(parsed.ok, `${JSON.stringify(parsed)}`).toBe(true);
    if (!parsed.ok) return;
    expect(missingRequiredKinds(parsed.blocks, "person")).toEqual([]);
  });
});
