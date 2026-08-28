import { describe, expect, it } from "vitest";
import {
  KIND_MEANINGS,
  MODE_MEANINGS,
  pageReference,
} from "@/features/actors/domain/page-reference";
import {
  CONTAINER_MODES,
  LEAF_KINDS,
  MAX_DEPTH,
} from "@/features/actors/domain/block-schema";
import { parseDocument } from "@/features/actors/domain/page-document";

describe("the reference describes every member of every vocabulary", () => {
  it("has a meaning for each container mode", () => {
    for (const mode of CONTAINER_MODES) {
      expect(
        MODE_MEANINGS[mode],
        `no meaning written for mode "${mode}"`,
      ).toBeTruthy();
    }
    expect(Object.keys(MODE_MEANINGS)).toHaveLength(CONTAINER_MODES.length);
  });

  it("has a meaning for each leaf kind", () => {
    for (const kind of LEAF_KINDS) {
      expect(
        KIND_MEANINGS[kind],
        `no meaning written for kind "${kind}"`,
      ).toBeTruthy();
    }
    expect(Object.keys(KIND_MEANINGS)).toHaveLength(LEAF_KINDS.length);
  });
});

describe("the reference is built from the constants rather than typed out", () => {
  it("names every mode and kind it may emit", () => {
    const text = pageReference("fursona");
    for (const mode of CONTAINER_MODES) expect(text).toContain(mode);
    for (const kind of LEAF_KINDS) expect(text).toContain(kind);
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

  it("carries a complete worked example that this build can read", () => {
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
  });
});
