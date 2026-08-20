import { describe, expect, it } from "vitest";
import { trackListFor } from "@/features/actors/domain/block-tracks";
import type { ContainerBlock } from "@/features/actors/domain/block-schema";

const container = (spaces: number, weights?: number[]): ContainerBlock => ({
  kind: "container",
  mode: "grid",
  spaces,
  weights,
  children: [],
});

describe("trackListFor", () => {
  it("answers nothing when there are no weights, so the CSS fallback is what renders", () => {
    expect(trackListFor(container(3))).toBeUndefined();
  });

  it("answers nothing when the list is not one share per place", () => {
    expect(trackListFor(container(3, [1, 3]))).toBeUndefined();
    expect(trackListFor(container(3, [1, 3, 1, 1]))).toBeUndefined();
  });

  it("answers nothing when every share is the same, because that IS the fallback", () => {
    expect(trackListFor(container(3, [2, 2, 2]))).toBeUndefined();
  });

  it("builds one floored track per share, in order", () => {
    expect(trackListFor(container(3, [1, 3, 1]))).toBe(
      "minmax(min(8rem,100%),1fr) minmax(min(8rem,100%),3fr) minmax(min(8rem,100%),1fr)",
    );
  });

  it("keeps an order a palindrome could not prove", () => {
    expect(trackListFor(container(3, [3, 1, 2]))).toBe(
      "minmax(min(8rem,100%),3fr) minmax(min(8rem,100%),1fr) minmax(min(8rem,100%),2fr)",
    );
  });
});
