import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useSkin } from "@/features/actors/application/use-skin";
import type { SkinResult } from "@/features/actors/infrastructure/skin-loader";

const { loadSkin } = vi.hoisted(() => ({ loadSkin: vi.fn() }));

vi.mock("@/features/actors/infrastructure/skin-loader", () => ({ loadSkin }));

/** The sheets a chrome always has, standing in for the shipped base skin. */
const fallback = new Map([
  ["main.bmp", "/skins/base/main.bmp"],
  ["cbuttons.bmp", "/skins/base/cbuttons.bmp"],
  ["shufrep.bmp", "/skins/base/shufrep.bmp"],
]);

const revoked: string[] = [];

/** A skin that loaded, carrying the sheets given. */
function loadedSkin(sheets: Record<string, string>, name = "skin"): SkinResult {
  return {
    ok: true,
    skin: {
      sheets: new Map(Object.entries(sheets)),
      revoke: () => revoked.push(name),
    },
  };
}

beforeEach(() => {
  revoked.length = 0;
  loadSkin.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useSkin", () => {
  it("draws with the fallback alone when no skin is chosen", () => {
    const { result } = renderHook(() => useSkin(undefined, fallback));
    expect([...result.current.sheets.keys()]).toEqual([...fallback.keys()]);
    expect(result.current.problem).toBeNull();
    expect(loadSkin).not.toHaveBeenCalled();
  });

  it("lays a loaded skin over the fallback, sheet by sheet", async () => {
    // The point of merging rather than switching: this skin ships no
    // `shufrep.bmp`, and that must cost it its shuffle button and nothing else.
    loadSkin.mockResolvedValue(
      loadedSkin({
        "main.bmp": "blob:theirs-main",
        "cbuttons.bmp": "blob:theirs-buttons",
      }),
    );
    const { result } = renderHook(() =>
      useSkin("https://x.test/a.wsz", fallback),
    );
    await waitFor(() =>
      expect(result.current.sheets.get("main.bmp")).toBe("blob:theirs-main"),
    );
    expect(result.current.sheets.get("cbuttons.bmp")).toBe(
      "blob:theirs-buttons",
    );
    expect(result.current.sheets.get("shufrep.bmp")).toBe(
      "/skins/base/shufrep.bmp",
    );
  });

  it("reports while it is loading", async () => {
    let settle: ((result: SkinResult) => void) | undefined;
    loadSkin.mockReturnValue(
      new Promise<SkinResult>((resolve) => {
        settle = resolve;
      }),
    );
    const { result } = renderHook(() =>
      useSkin("https://x.test/a.wsz", fallback),
    );
    await waitFor(() => expect(result.current.loading).toBe(true));
    settle?.(loadedSkin({ "main.bmp": "blob:m" }));
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it("keeps the picture when a skin fails, and says why", async () => {
    // Somebody typing an address produces a stream of unreachable prefixes. A
    // window that flickered to bare fallback on every keystroke is unusable.
    loadSkin.mockResolvedValueOnce(loadedSkin({ "main.bmp": "blob:good" }));
    const { result, rerender } = renderHook(
      ({ url }: { url: string }) => useSkin(url, fallback),
      { initialProps: { url: "https://x.test/good.wsz" } },
    );
    await waitFor(() =>
      expect(result.current.sheets.get("main.bmp")).toBe("blob:good"),
    );

    loadSkin.mockResolvedValueOnce({ ok: false, reason: "unreachable" });
    rerender({ url: "https://x.test/typo.ws" });
    await waitFor(() => expect(result.current.problem).toBe("unreachable"));
    expect(result.current.sheets.get("main.bmp")).toBe("blob:good");
  });

  it("clears an earlier problem once a skin loads", async () => {
    loadSkin.mockResolvedValueOnce({ ok: false, reason: "no-sprites" });
    const { result, rerender } = renderHook(
      ({ url }: { url: string }) => useSkin(url, fallback),
      { initialProps: { url: "https://x.test/holiday.zip" } },
    );
    await waitFor(() => expect(result.current.problem).toBe("no-sprites"));

    loadSkin.mockResolvedValueOnce(loadedSkin({ "main.bmp": "blob:ok" }));
    rerender({ url: "https://x.test/real.wsz" });
    await waitFor(() => expect(result.current.problem).toBeNull());
  });

  it("revokes the old skin when the address changes", async () => {
    loadSkin.mockResolvedValueOnce(
      loadedSkin({ "main.bmp": "blob:1" }, "first"),
    );
    const { result, rerender } = renderHook(
      ({ url }: { url: string }) => useSkin(url, fallback),
      { initialProps: { url: "https://x.test/1.wsz" } },
    );
    await waitFor(() =>
      expect(result.current.sheets.get("main.bmp")).toBe("blob:1"),
    );

    loadSkin.mockResolvedValueOnce(
      loadedSkin({ "main.bmp": "blob:2" }, "second"),
    );
    rerender({ url: "https://x.test/2.wsz" });
    await waitFor(() => expect(revoked).toContain("first"));
  });

  it("revokes on unmount", async () => {
    loadSkin.mockResolvedValue(loadedSkin({ "main.bmp": "blob:1" }, "only"));
    const { result, unmount } = renderHook(() =>
      useSkin("https://x.test/1.wsz", fallback),
    );
    await waitFor(() =>
      expect(result.current.sheets.get("main.bmp")).toBe("blob:1"),
    );
    unmount();
    expect(revoked).toEqual(["only"]);
  });

  it("revokes a skin that arrives after its address was abandoned", async () => {
    // The leak nothing else catches: the state setters are no-ops once the
    // effect is torn down, so a skin landing late has nobody left to revoke it.
    let settle: ((result: SkinResult) => void) | undefined;
    loadSkin.mockReturnValueOnce(
      new Promise<SkinResult>((resolve) => {
        settle = resolve;
      }),
    );
    const { rerender } = renderHook(
      ({ url }: { url: string }) => useSkin(url, fallback),
      { initialProps: { url: "https://x.test/slow.wsz" } },
    );

    loadSkin.mockResolvedValueOnce(
      loadedSkin({ "main.bmp": "blob:2" }, "second"),
    );
    rerender({ url: "https://x.test/quick.wsz" });

    settle?.(loadedSkin({ "main.bmp": "blob:late" }, "abandoned"));
    await waitFor(() => expect(revoked).toContain("abandoned"));
  });

  it("ignores a FAILURE that arrives after its address was abandoned", async () => {
    // The mirror of the case above, and the one a reader assumes is the same.
    // It is not: there is no skin to revoke, and what must not happen is the
    // stale reason overwriting the state of the address that replaced it —
    // which would report "unreachable" over a skin that had just loaded fine.
    let settle: ((result: SkinResult) => void) | undefined;
    loadSkin.mockReturnValueOnce(
      new Promise<SkinResult>((resolve) => {
        settle = resolve;
      }),
    );
    const { result, rerender } = renderHook(
      ({ url }: { url: string }) => useSkin(url, fallback),
      { initialProps: { url: "https://x.test/slow.wsz" } },
    );

    loadSkin.mockResolvedValueOnce(
      loadedSkin({ "main.bmp": "blob:2" }, "good"),
    );
    rerender({ url: "https://x.test/quick.wsz" });
    await waitFor(() =>
      expect(result.current.sheets.get("main.bmp")).toBe("blob:2"),
    );

    settle?.({ ok: false, reason: "unreachable" });
    await waitFor(() => expect(revoked).toEqual([]));
    expect(result.current.problem).toBeNull();
    expect(result.current.sheets.get("main.bmp")).toBe("blob:2");
  });

  it("aborts the fetch it no longer needs", async () => {
    loadSkin.mockResolvedValue(loadedSkin({ "main.bmp": "blob:1" }));
    const { unmount } = renderHook(() =>
      useSkin("https://x.test/1.wsz", fallback),
    );
    const signal = loadSkin.mock.calls[0]?.[1] as AbortSignal;
    expect(signal.aborted).toBe(false);
    unmount();
    expect(signal.aborted).toBe(true);
  });

  it("goes back to the fallback when the skin is taken off", async () => {
    loadSkin.mockResolvedValueOnce(loadedSkin({ "main.bmp": "blob:1" }, "one"));
    const { result, rerender } = renderHook(
      ({ url }: { url: string | undefined }) => useSkin(url, fallback),
      { initialProps: { url: "https://x.test/1.wsz" as string | undefined } },
    );
    await waitFor(() =>
      expect(result.current.sheets.get("main.bmp")).toBe("blob:1"),
    );
    rerender({ url: undefined });
    await waitFor(() =>
      expect(result.current.sheets.get("main.bmp")).toBe(
        "/skins/base/main.bmp",
      ),
    );
    expect(revoked).toContain("one");
  });
});
