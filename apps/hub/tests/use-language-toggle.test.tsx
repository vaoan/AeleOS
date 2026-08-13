import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useLanguageToggle } from "@/features/actors/application/use-language-toggle";

describe("useLanguageToggle", () => {
  // English by default, and this says nothing about the app's audience: the
  // interface falls back to Spanish deliberately. The language somebody writes
  // in is a different axis from the language they read the app in, and tying
  // them would mean a Spanish-reading person could not start in English
  // without switching the whole interface.
  it("starts on English", () => {
    const { result } = renderHook(() => useLanguageToggle());
    expect(result.current.lang).toBe("en");
  });

  it("switches to Spanish", () => {
    const { result } = renderHook(() => useLanguageToggle());
    act(() => result.current.toggle());
    expect(result.current.lang).toBe("es");
  });

  it("switches back", () => {
    const { result } = renderHook(() => useLanguageToggle());
    act(() => result.current.toggle());
    act(() => result.current.toggle());
    expect(result.current.lang).toBe("en");
  });
});
