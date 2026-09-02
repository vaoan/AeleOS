import { describe, expect, it } from "vitest";
import {
  CONTAINER_MODES,
  LEAF_KINDS,
} from "@/features/actors/domain/block-schema";
import { newLeaf } from "@/features/actors/domain/block-edits";
import {
  sampleContainer,
  sampleLeaf,
} from "@/features/actors/domain/add-samples";

describe("sampleLeaf", () => {
  it("carries the generic title and description for a kind with no shape of its own", () => {
    const leaf = sampleLeaf("text");
    expect(leaf.kind).toBe("text");
    expect(leaf.title_en).toBe("Sample title");
    expect(leaf.description_en).toBe("Sample description text.");
  });

  it("shapes table with rows a caption and two labelled cells", () => {
    const leaf = sampleLeaf("table");
    expect(leaf.rows).toBeTruthy();
    expect(leaf.rows!.length).toBeGreaterThan(0);
    expect(leaf.rows![0][0].text_en).toBeTruthy();
    expect(leaf.rows![0][1].text_en).toBeTruthy();
  });

  it("shapes progress with a label title and a readable percentage description", () => {
    const leaf = sampleLeaf("progress");
    expect(leaf.title_en).toBeTruthy();
    expect(leaf.description_en).toMatch(/%$/);
  });

  it("shapes quote with an attribution title and quoted words", () => {
    const leaf = sampleLeaf("quote");
    expect(leaf.title_en).toBeTruthy();
    expect(leaf.description_en).toBeTruthy();
  });

  it("shapes stat with a label title and a value description", () => {
    const leaf = sampleLeaf("stat");
    expect(leaf.title_en).toBeTruthy();
    expect(leaf.description_en).toBeTruthy();
  });

  it("produces every leaf kind without throwing", () => {
    for (const kind of LEAF_KINDS) {
      expect(() => sampleLeaf(kind)).not.toThrow();
      expect(sampleLeaf(kind).kind).toBe(kind);
    }
  });

  // The whole point of a sample: it must never be mistaken for what adding
  // the kind actually produces. `newLeaf` starts with an empty title, which
  // the strict save schema refuses — a sample with the same empty title
  // could not preview anything, and a sample with a NON-empty title could be
  // confused for it if the two agreed.
  it("never matches what newLeaf produces for the same kind", () => {
    for (const kind of LEAF_KINDS) {
      expect(sampleLeaf(kind).title_en).not.toBe(newLeaf(kind).title_en);
    }
  });
});

describe("sampleContainer", () => {
  it("carries the requested mode and two sample places", () => {
    const container = sampleContainer("grid");
    expect(container.kind).toBe("container");
    expect(container.mode).toBe("grid");
    expect(container.spaces).toBe(2);
    expect(container.children).toHaveLength(2);
    expect(container.children.every((child) => child !== null)).toBe(true);
  });

  it("produces every container mode without throwing", () => {
    for (const mode of CONTAINER_MODES) {
      expect(() => sampleContainer(mode)).not.toThrow();
      expect(sampleContainer(mode).mode).toBe(mode);
    }
  });

  it("fills every place with a sample leaf rather than leaving them empty", () => {
    const container = sampleContainer("stack");
    for (const child of container.children) {
      expect(child).not.toBeNull();
      expect(child!.kind).toBe("text");
    }
  });
});
