import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePageSource } from "@/features/actors/application/use-page-source";
import {
  DOCUMENT_VERSION,
  toDocument,
} from "@/features/actors/domain/page-document";
import { DEFAULT_THEME } from "@/features/actors/domain/actor-theme";
import type { ActorTheme } from "@/features/actors/domain/actor-theme";
import type { Block } from "@/features/actors/domain/block-schema";

const BLOCKS_A: Block[] = [
  { kind: "text", title_en: "A", description_en: "a" },
];

const BLOCKS_B: Block[] = [
  { kind: "text", title_en: "B", description_en: "b" },
];

const BLOCKS_C: Block[] = [
  { kind: "text", title_en: "C", description_en: "c" },
];

/** Advances the debounce timer inside `act`, so React flushes the writes it schedules. */
function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

/**
 * Mounts the hook with props that can be changed across renders.
 *
 * Every case that simulates "the ordinary controls moved the page" needs a
 * `rerender` that hands the hook a genuinely new `blocks`/`theme` pair, which
 * plain `renderHook(() => usePageSource(...))` cannot do — its callback closes
 * over whatever was in scope when it was defined, not over `rerender`'s
 * argument.
 */
function mount(
  initialProps: { theme: ActorTheme; blocks: Block[] },
  apply: (next: { theme: ActorTheme | null; blocks: Block[] }) => void,
  debounceMs?: number,
) {
  return renderHook(
    (props: { theme: ActorTheme; blocks: Block[] }) =>
      usePageSource({ ...props, actorKind: "fursona", apply, debounceMs }),
    { initialProps },
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("usePageSource", () => {
  it("serialises the page into the box on mount", () => {
    const { result } = mount(
      { theme: DEFAULT_THEME, blocks: BLOCKS_A },
      vi.fn(),
    );
    expect(result.current.text).toBe(toDocument(DEFAULT_THEME, BLOCKS_A));
    expect(result.current.problems).toEqual([]);
    expect(result.current.stale).toBe(false);
    expect(result.current.drifted).toBe(false);
  });

  it("reaches apply after the debounce and not before", () => {
    const apply = vi.fn();
    const { result } = mount({ theme: DEFAULT_THEME, blocks: BLOCKS_A }, apply);

    act(() => {
      result.current.onChange(JSON.stringify(BLOCKS_B));
    });
    expect(apply).not.toHaveBeenCalled();

    advance(250);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith({ theme: null, blocks: BLOCKS_B });
  });

  it("leaves the theme alone when the document carries none", () => {
    // The full envelope, naming the key and giving it null explicitly, rather
    // than the bare-array shorthand the case above uses — a different branch
    // of `parseDocument`'s envelope handling, and the one this behaviour's
    // own name is about: an explicit `"theme": null` means leave-mine-alone,
    // the same as an absent key.
    const apply = vi.fn();
    const { result } = mount({ theme: DEFAULT_THEME, blocks: BLOCKS_A }, apply);

    act(() => {
      result.current.onChange(
        JSON.stringify({
          aeleos: DOCUMENT_VERSION,
          theme: null,
          blocks: BLOCKS_B,
        }),
      );
    });
    advance(250);

    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith({ theme: null, blocks: BLOCKS_B });
  });

  it("never calls apply and sets stale for an invalid edit", () => {
    const apply = vi.fn();
    const { result } = mount({ theme: DEFAULT_THEME, blocks: BLOCKS_A }, apply);

    act(() => {
      result.current.onChange("{ not json");
    });
    advance(250);

    expect(apply).not.toHaveBeenCalled();
    expect(result.current.stale).toBe(true);
    expect(result.current.problems).toEqual([
      { at: "syntax", message: expect.any(String) as unknown as string },
    ]);
  });

  it("carries a refused-kind problem through to `problems`, still without calling apply", () => {
    // A different `DocumentProblem` variant from the syntax case above,
    // reached through a different branch of `parseDocument` entirely (past
    // `JSON.parse`, past `blocksSchema`, and into `refusedLeaves`) — so this
    // is not the same failure re-asserted under a different name. `fursonas`
    // is `REFUSED_KIND.fursona`.
    const apply = vi.fn();
    const { result } = mount({ theme: DEFAULT_THEME, blocks: BLOCKS_A }, apply);

    act(() => {
      result.current.onChange(
        JSON.stringify([
          { kind: "fursonas", title_en: "Nope", description_en: "" },
        ]),
      );
    });
    advance(250);

    expect(apply).not.toHaveBeenCalled();
    expect(result.current.stale).toBe(true);
    expect(result.current.problems).toEqual([
      { at: "refused-kind", path: [0], kind: "fursonas" },
    ]);
  });

  it("clears stale on a later valid edit", () => {
    const apply = vi.fn();
    const { result } = mount({ theme: DEFAULT_THEME, blocks: BLOCKS_A }, apply);

    act(() => {
      result.current.onChange("{ not json");
    });
    advance(250);
    expect(result.current.stale).toBe(true);

    act(() => {
      result.current.onChange(JSON.stringify(BLOCKS_B));
    });
    advance(250);

    expect(result.current.stale).toBe(false);
    expect(result.current.problems).toEqual([]);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith({ theme: null, blocks: BLOCKS_B });
  });

  it("resets the debounce on every keystroke rather than stacking timers", () => {
    const apply = vi.fn();
    const { result } = mount({ theme: DEFAULT_THEME, blocks: BLOCKS_A }, apply);

    act(() => {
      result.current.onChange("{ still typing");
    });
    advance(200);
    act(() => {
      result.current.onChange(JSON.stringify(BLOCKS_B));
    });
    // 200ms since the second keystroke, 400ms since the first: if the first
    // keystroke's timer had not been cleared, this is past its 250ms and the
    // stale one would already have parsed the unfinished text.
    advance(200);
    expect(apply).not.toHaveBeenCalled();

    advance(50);
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it("cancels a pending debounce when resync is called", () => {
    // Without this, a debounced parse scheduled just before `resync` would
    // still land 250ms later — applying an edit the author just asked to
    // throw away, right on top of the page `resync` put back.
    const apply = vi.fn();
    const { result } = mount({ theme: DEFAULT_THEME, blocks: BLOCKS_A }, apply);

    act(() => {
      result.current.onChange(JSON.stringify(BLOCKS_B));
    });
    act(() => {
      result.current.resync();
    });
    advance(250);

    expect(apply).not.toHaveBeenCalled();
    expect(result.current.text).toBe(toDocument(DEFAULT_THEME, BLOCKS_A));
  });

  it("clears the pending debounce timer on unmount", () => {
    const apply = vi.fn();
    const { result, unmount } = mount(
      { theme: DEFAULT_THEME, blocks: BLOCKS_A },
      apply,
    );

    act(() => {
      result.current.onChange(JSON.stringify(BLOCKS_B));
    });
    unmount();
    advance(250);

    expect(apply).not.toHaveBeenCalled();
  });

  it("does not flag a false drift after its own non-canonical edit round-trips while focused (the loop guard)", () => {
    // The typed text here is deliberately NOT `toDocument`'s own output —
    // it is the bare-array shorthand, with none of `toDocument`'s envelope,
    // key order or indentation. That is what makes this fixture discriminate:
    // if `mirror` were set to the raw typed text (as an earlier version did),
    // comparing it against the caller's re-serialised `toDocument(theme,
    // blocks)` would never match on THIS input, and every successful edit
    // while focused would immediately relabel itself as drifted the moment
    // the caller's form round-trips the applied value back in as new
    // `theme`/`blocks` props — which is the ordinary, ever-present shape of
    // how this hook is used, not an edge case. A fixture built from
    // `toDocument`'s own output cannot tell that fault from a working guard,
    // because the two forms happen to be byte-identical only on that one
    // input.
    const apply = vi.fn();
    const { result, rerender } = mount(
      { theme: DEFAULT_THEME, blocks: BLOCKS_A },
      apply,
    );

    act(() => {
      result.current.onFocusChange(true);
    });

    const typed = JSON.stringify(BLOCKS_B);
    act(() => {
      result.current.onChange(typed);
    });
    advance(250);
    expect(apply).toHaveBeenCalledTimes(1);
    const applied = apply.mock.calls[0]?.[0] as {
      theme: ActorTheme | null;
      blocks: Block[];
    };
    expect(applied.theme).toBeNull();

    // The round trip: content- and key-order-identical to what was just
    // accepted, but a freshly cloned array — never the literal object
    // `apply` received — which is exactly what a form's `setValue` followed
    // by a re-render produces.
    const roundTripped = structuredClone(applied.blocks);
    rerender({ theme: DEFAULT_THEME, blocks: roundTripped });

    expect(result.current.drifted).toBe(false);
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it("does not reformat a non-canonical edit round-tripping back while unfocused (the loop guard)", () => {
    // The unfocused half of the same fixture: instead of a spurious drift,
    // an unguarded round trip here would silently rewrite what the person
    // typed into `toDocument`'s canonical form the instant it echoed back —
    // reformatting their box out from under them with no edit of their own.
    const apply = vi.fn();
    const { result, rerender } = mount(
      { theme: DEFAULT_THEME, blocks: BLOCKS_A },
      apply,
    );

    act(() => {
      result.current.onFocusChange(false);
    });

    const typed = JSON.stringify(BLOCKS_B);
    act(() => {
      result.current.onChange(typed);
    });
    advance(250);
    expect(apply).toHaveBeenCalledTimes(1);
    const applied = apply.mock.calls[0]?.[0] as {
      theme: ActorTheme | null;
      blocks: Block[];
    };

    const roundTripped = structuredClone(applied.blocks);
    rerender({ theme: DEFAULT_THEME, blocks: roundTripped });

    expect(result.current.text).toBe(typed);
  });

  it("honours a non-default debounceMs rather than hardcoding 250", () => {
    const apply = vi.fn();
    const { result } = mount(
      { theme: DEFAULT_THEME, blocks: BLOCKS_A },
      apply,
      1000,
    );

    act(() => {
      result.current.onChange(JSON.stringify(BLOCKS_B));
    });
    advance(250);
    expect(apply).not.toHaveBeenCalled();

    advance(750);
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it("clears drift once the person's own edit is applied", () => {
    // My ruling: once the person's text has been applied, the page IS what
    // the text says, so the drift is resolved by their edit winning. A
    // banner still reading "the page changed underneath you" after the page
    // has taken their change would be describing a disagreement that no
    // longer exists.
    const apply = vi.fn();
    const { result, rerender } = mount(
      { theme: DEFAULT_THEME, blocks: BLOCKS_A },
      apply,
    );

    act(() => {
      result.current.onFocusChange(true);
    });
    rerender({ theme: DEFAULT_THEME, blocks: BLOCKS_C });
    expect(result.current.drifted).toBe(true);

    act(() => {
      result.current.onChange(JSON.stringify(BLOCKS_B));
    });
    advance(250);

    expect(result.current.drifted).toBe(false);
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it("refreshes the box when it is not focused", () => {
    const apply = vi.fn();
    const { result, rerender } = mount(
      { theme: DEFAULT_THEME, blocks: BLOCKS_A },
      apply,
    );

    act(() => {
      result.current.onFocusChange(false);
    });
    const before = result.current.text;

    rerender({ theme: DEFAULT_THEME, blocks: BLOCKS_C });

    expect(result.current.text).not.toBe(before);
    expect(result.current.text).toBe(toDocument(DEFAULT_THEME, BLOCKS_C));
    expect(result.current.drifted).toBe(false);
  });

  it("keeps the box and flags drift when it is focused", () => {
    const apply = vi.fn();
    const { result, rerender } = mount(
      { theme: DEFAULT_THEME, blocks: BLOCKS_A },
      apply,
    );

    act(() => {
      result.current.onFocusChange(true);
    });
    const before = result.current.text;

    rerender({ theme: DEFAULT_THEME, blocks: BLOCKS_C });

    expect(result.current.text).toBe(before);
    expect(result.current.drifted).toBe(true);
  });

  it("throws the box away and re-reads the page on resync", () => {
    const apply = vi.fn();
    const { result, rerender } = mount(
      { theme: DEFAULT_THEME, blocks: BLOCKS_A },
      apply,
    );

    act(() => {
      result.current.onFocusChange(true);
    });
    rerender({ theme: DEFAULT_THEME, blocks: BLOCKS_C });
    expect(result.current.drifted).toBe(true);

    act(() => {
      result.current.resync();
    });

    expect(result.current.drifted).toBe(false);
    expect(result.current.problems).toEqual([]);
    expect(result.current.text).toBe(toDocument(DEFAULT_THEME, BLOCKS_C));
  });
});
