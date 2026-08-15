import { describe, expect, it } from "vitest";
import {
  NEBULA_STORAGE_KEY,
  resolveNebula,
} from "@/shared/application/nebula-preference";

describe("resolveNebula", () => {
  it("is on by default, so nobody must find a setting to see the design", () => {
    expect(resolveNebula(null, false)).toEqual({
      enabled: true,
      animated: true,
    });
  });

  it("honours an explicit off", () => {
    expect(resolveNebula("off", false)).toEqual({
      enabled: false,
      animated: false,
    });
  });

  it("honours an explicit on", () => {
    expect(resolveNebula("on", false)).toEqual({
      enabled: true,
      animated: true,
    });
  });

  // Reduced motion keeps the nebula and stops the drift. Removing it entirely
  // would hand a plainer product to someone who asked only for less movement.
  it("keeps the nebula but stops the motion under reduced motion", () => {
    expect(resolveNebula(null, true)).toEqual({
      enabled: true,
      animated: false,
    });
    expect(resolveNebula("on", true)).toEqual({
      enabled: true,
      animated: false,
    });
  });

  it("still respects off under reduced motion", () => {
    expect(resolveNebula("off", true)).toEqual({
      enabled: false,
      animated: false,
    });
  });

  it("treats an unrecognised stored value as unset", () => {
    expect(resolveNebula("maybe", false)).toEqual({
      enabled: true,
      animated: true,
    });
    expect(resolveNebula("", false)).toEqual({
      enabled: true,
      animated: true,
    });
  });

  // A disabled layer that still animates would burn a frame budget drawing
  // nothing, so this invariant is asserted rather than assumed.
  it("never reports animation while disabled", () => {
    // Every combination is resolved, then the offenders are named. Asserting
    // inside `if (!state.enabled)` checked nothing whenever no input produced a
    // disabled layer, and said so with a green tick.
    const states = [null, "on", "off", "junk"].flatMap((stored) =>
      [true, false].map((reduced) => ({
        stored,
        reduced,
        ...resolveNebula(stored, reduced),
      })),
    );
    expect(states.some((state) => !state.enabled)).toBe(true);
    expect(states.filter((state) => !state.enabled && state.animated)).toEqual(
      [],
    );
  });
});

describe("NEBULA_STORAGE_KEY", () => {
  it("does not collide with the theme's key", () => {
    expect(NEBULA_STORAGE_KEY).not.toBe("aeleos-theme");
  });
});
