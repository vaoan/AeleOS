"use client";

import { useEffect, useState } from "react";

import {
  loadSkin,
  type SkinProblem,
} from "@/features/actors/infrastructure/skin-loader";

/** What a chrome knows about the skin it is drawing with. */
export interface SkinState {
  /**
   * Every sheet it can draw from, the fallback filled in per file.
   *
   * **Merged rather than switched**, which is what makes a skin missing one
   * sheet draw the rest: a real museum skin may ship no `nums_ex.bmp` and
   * nothing about that should cost it its transport buttons.
   */
  readonly sheets: ReadonlyMap<string, string>;
  /** Why the chosen skin is not being used, or null when it is. */
  readonly problem: SkinProblem | null;
  /** True while a skin is being fetched. */
  readonly loading: boolean;
}

/** The outcome of the last load that finished, and which address it was for. */
interface Settled {
  /** The address that was being loaded. */
  readonly url: string;
  /** What went wrong, or null when it loaded. */
  readonly problem: SkinProblem | null;
}

/** No sheets at all, as one shared value so a render is not churn. */
const NOTHING: ReadonlyMap<string, string> = new Map();

/**
 * Loads a `.wsz` and keeps it, falling back per sheet.
 *
 * **The fallback is always underneath**, so there is exactly one rendering
 * path: a chrome never asks whether it has a skin, because it always does. A
 * component that drew differently when unskinned would be a second
 * implementation of the window, drifting from the first the moment either
 * changed — the argument that already makes the editor's preview call the real
 * renderer.
 *
 * **Object URLs are revoked when the address changes and on unmount.** A
 * classic skin is a megabyte of uncompressed bitmaps, and an editor previewing
 * one skin after another would otherwise hold every one of them for the life of
 * the tab.
 *
 * **A failure keeps the previous sheets rather than blanking the window.** That
 * is deliberate: somebody typing an address into the editor produces a stream of
 * unreachable prefixes, and a window that flickered to bare fallback on every
 * keystroke would be unusable. The `problem` says what happened; the picture
 * stays put.
 *
 * @param url - the skin's address, or undefined for the fallback alone.
 * @param fallback - sheets that are always available, by atlas name.
 * @returns the sheets to draw with, and what went wrong.
 */
export function useSkin(
  url: string | undefined,
  fallback: ReadonlyMap<string, string>,
): SkinState {
  const [sheets, setSheets] = useState<ReadonlyMap<string, string>>(NOTHING);
  const [settled, setSettled] = useState<Settled | null>(null);

  useEffect(() => {
    if (!url) return;

    const controller = new AbortController();
    let revoke: (() => void) | undefined;
    let dropped = false;

    void loadSkin(url, controller.signal).then((result) => {
      if (dropped) {
        // The address changed while this was in flight. Revoking here is the
        // whole point: the setters below would be no-ops, so without it the
        // blobs of every abandoned keystroke leak.
        if (result.ok) result.skin.revoke();
        return;
      }
      if (result.ok) {
        revoke = result.skin.revoke;
        setSheets(result.skin.sheets);
        setSettled({ url, problem: null });
        return;
      }
      setSettled({ url, problem: result.reason });
    });

    return () => {
      dropped = true;
      controller.abort();
      revoke?.();
    };
  }, [url]);

  // **Everything below is DERIVED, and no state is set synchronously in the
  // effect.** React 19's `react-hooks/set-state-in-effect` refuses that, and it
  // is right to: resetting on `url` becoming undefined was a second render for
  // a fact already knowable from the props. Deriving also makes `loading` mean
  // exactly what it says — the last settled outcome is not for this address —
  // where a boolean set in two places can disagree with reality after an abort.
  const loaded = url === undefined ? NOTHING : sheets;
  return {
    // A new `Map` per render, deliberate and cheap at twelve entries: the two
    // sources are separate state, and memoising would need both as dependencies
    // to be correct anyway.
    sheets: new Map([...fallback, ...loaded]),
    // `settled !== null` first, not `settled?.url === url`: with no address and
    // nothing settled both sides are `undefined`, the comparison is TRUE, and
    // the dereference that follows throws on the very first render.
    problem: settled !== null && settled.url === url ? settled.problem : null,
    loading: url !== undefined && settled?.url !== url,
  };
}
