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

  // The segmented switch shows both languages at once, so each side has to be
  // able to say which one it is. `toggle` can only mean "the other one", which
  // is the wrong verb for a control where both options are already visible.
  it("selects a named language", () => {
    const { result } = renderHook(() => useLanguageToggle());
    act(() => result.current.select("es"));
    expect(result.current.lang).toBe("es");
  });

  // Clicking the side that is already active must not bounce somebody to the
  // other one, which is exactly what wiring both sides to `toggle` would do.
  it("leaves the language alone when the active side is selected", () => {
    const { result } = renderHook(() => useLanguageToggle());
    act(() => result.current.select("en"));
    expect(result.current.lang).toBe("en");
  });
});
