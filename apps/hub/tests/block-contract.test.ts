import { describe, expect, it } from "vitest";
import { showsLabel } from "@/features/actors/presentation/block-contract";
import type { BlockStyle } from "@/features/actors/domain/block-schema";

/**
 * `showsLabel` is the one place the enclosing mode's `labelled` and a block's
 * own `style.label` compose. Read wherever an identity leaf or `PlainLeaf`
 * decides whether to draw its own title — see gap 16 of
 * `docs/superpowers/specs/2026-08-27-pastiche-findings.md` for why the key
 * exists at all.
 *
 * The rule under test: `hidden` can only NARROW what the mode already
 * decided, never widen it. Absent and `"show"` are the same state as far as
 * this function is concerned.
 */
describe("showsLabel", () => {
  it("shows the label when the mode allows it and no style is set", () => {
    expect(showsLabel(true, undefined)).toBe(true);
  });

  it("hides the label when the mode has already suppressed it, with no style set", () => {
    expect(showsLabel(false, undefined)).toBe(false);
  });

  it("shows the label when the mode allows it and the style explicitly says show", () => {
    const style: BlockStyle = { label: "show" };
    expect(showsLabel(true, style)).toBe(true);
  });

  it("hides the label when the mode allows it but the style says hidden", () => {
    const style: BlockStyle = { label: "hidden" };
    expect(showsLabel(true, style)).toBe(false);
  });

  // The composition rule's sharpest edge: `hidden` narrows, but `show` must
  // never WIDEN a mode's own suppression back open. There is nowhere left on
  // the leaf to put a title a `tabs` or `accordion` panel already drew.
  it("does not let an explicit show override a mode that has already suppressed the label", () => {
    const style: BlockStyle = { label: "show" };
    expect(showsLabel(false, style)).toBe(false);
  });

  // Both suppressed for the same reason, from two different causes.
  it("stays hidden when both the mode and the style agree", () => {
    const style: BlockStyle = { label: "hidden" };
    expect(showsLabel(false, style)).toBe(false);
  });

  // Anything else in the style bag is irrelevant to this function; only
  // `label` is read.
  it("ignores every other style key", () => {
    const style: BlockStyle = { chrome: "bare", radius: "square" };
    expect(showsLabel(true, style)).toBe(true);
  });
});
