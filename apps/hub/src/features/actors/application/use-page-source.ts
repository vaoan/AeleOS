"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  parseDocument,
  toDocument,
  type DocumentProblem,
} from "@/features/actors/domain/page-document";
import type { ActorTheme } from "@/features/actors/domain/actor-theme";
import type { Block } from "@/features/actors/domain/block-schema";
import type { ActorKind } from "@/features/actors/domain/required-blocks";

/** How long to wait, after the last keystroke, before parsing the box. */
const DEFAULT_DEBOUNCE_MS = 250;

/**
 * What the source dock is showing and can do.
 *
 * This is the whole of the binding's OBSERVABLE state — `text` is what is in
 * the box, `problems` is everything wrong with it, and `stale`/`drifted` are
 * the two ways the box and the page can disagree. A caller wires `onChange`
 * and `onFocusChange` to the textarea and `resync` to a button; nothing else
 * is needed to render the dock.
 */
export interface PageSourceState {
  /** What is in the box. */
  text: string;
  /** Everything wrong with it, empty when it is good. */
  problems: readonly DocumentProblem[];
  /** True when the page is showing an older tree than the text describes. */
  stale: boolean;
  /** True when the page moved under a text that is being edited. */
  drifted: boolean;
  /** Types into the box. */
  onChange: (next: string) => void;
  /** The box took or lost focus; the arbitration reads this. */
  onFocusChange: (focused: boolean) => void;
  /** Throws the box away and re-reads the page. */
  resync: () => void;
}

/** What {@link usePageSource} needs, and what it does with each field. */
interface UsePageSourceOptions {
  /** The page's theme as the rest of the form holds it. */
  theme: ActorTheme;
  /** The page's tree as the rest of the form holds it. */
  blocks: Block[];
  /**
   * Which kind of page this is, so a paste naming a refused leaf kind is
   * rejected the same way the save boundary would reject it.
   */
  actorKind: ActorKind;
  /**
   * Called once per accepted parse, with the parsed halves. Never called for
   * an invalid document. `theme` is `null` when the document carried none —
   * the caller must leave its own current theme untouched in that case
   * rather than resetting it, exactly as an absent key does everywhere else
   * in this model.
   */
  apply: (next: { theme: ActorTheme | null; blocks: Block[] }) => void;
  /**
   * How long to wait, after the last keystroke, before parsing the box.
   *
   * Defaults to 250.
   */
  debounceMs?: number;
}

/**
 * Binds a page's document text to its live tree, in both directions.
 *
 * **Which direction wins is the whole design, and both halves are guarded by
 * the same `mirror` ref rather than by two separate mechanisms.** `mirror`
 * holds the last serialisation this hook itself produced or accepted — never
 * a copy of the tree, only the STRING it last agreed with the caller about.
 *
 * **Text to page.** `onChange` records every keystroke immediately, so the
 * box never lags what was typed, and schedules a parse `debounceMs` after
 * the last one. A successful parse clears `problems` and `drifted`, records
 * `mirror`, and calls `apply` — the only place this hook ever tells its
 * caller anything. A failed parse only records `problems`; it never calls
 * `apply` and never touches `mirror` or `drifted`.
 *
 * **`mirror` is set to the CANONICAL `toDocument` output of what was
 * accepted, never to the raw text that was typed, and this is not a detail —
 * an earlier version stored the raw text and the guard below only ever
 * worked for the one input where the two happen to be identical.** A
 * hand-edited box is not canonical JSON in general — different whitespace,
 * different key order, the bare-array shorthand — so comparing a caller's
 * re-serialised `toDocument(theme, blocks)` against raw typed text fails on
 * every ordinary edit, which is exactly the input this feature exists for.
 * The fix is to store what the ACCEPTED PARSE re-serialises to,
 * `toDocument(parsed.theme ?? theme, parsed.blocks)`, so the round trip
 * through the caller's form compares like against like.
 *
 * **The page keeps the last good tree, and that is a consequence of never
 * applying rather than a stored copy.** There is no second variable holding
 * "the last good tree" anywhere in this hook — the tree the page renders is
 * whatever `blocks`/`theme` already were, because a failed parse simply never
 * calls `apply` to change them. A stored copy would be a second source of
 * truth, able to disagree with the form that actually holds the page; the
 * absence of a write is the only source of truth this needs.
 *
 * **Page to text.** A `useEffect` on `[theme, blocks]` re-serialises on
 * every change. If that serialisation already equals `mirror`, the change is
 * an echo of something this hook itself just produced or accepted, and
 * nothing happens — this is what stops a round trip through the caller's
 * `apply` from re-entering the loop, and it is checked by STRING equality
 * rather than by comparing `blocks` by reference, because a caller's form
 * very often hands back a freshly built array for content that has not
 * actually changed. Past that guard, a genuine external change either
 * overwrites the box — when it is not focused, which is the ordinary case of
 * picking up somebody else's edit — or, while it IS focused, is recorded as
 * `drifted` rather than clobbering whatever is being typed. Naively
 * re-serialising a focused box would destroy the author's whitespace and
 * jump their cursor mid-word; recording the drift and leaving `resync` as an
 * explicit choice is the alternative that does neither.
 *
 * **A successful `apply` also clears `drifted`, and that is a ruling rather
 * than an omission.** Once the person's own edit has been applied, the page
 * IS what their text says — so a banner still reading "the page changed
 * underneath you" after their own change just won would be describing a
 * disagreement that no longer exists.
 *
 * **`focused` is a ref, and the one consequence worth naming: this hook does
 * not self-heal a drift on blur.** The page→text effect only runs when
 * `[theme, blocks]` changes, never when focus changes, so a box left
 * `drifted` while focused stays `drifted` after the person clicks away —
 * until `resync`, or until the next real page change arrives while unfocused.
 * A `useState` for focus would have made the effect re-run on blur and could
 * have cleared it there instead; a ref does not, and that is the design this
 * hook keeps rather than a gap in it — a blur is not the person accepting or
 * rejecting the drift, so healing it silently on blur would be a second,
 * unannounced way for their box to change out from under them.
 *
 * **`resync` is the one place this hook throws the box away on purpose.** It
 * cancels any pending debounce first — otherwise a parse scheduled just
 * before `resync` would still land and apply an edit the person just asked
 * to discard, on top of the page `resync` put back — then re-serialises the
 * CURRENT `theme`/`blocks` unconditionally, regardless of focus, and clears
 * `drifted` and `problems` with it.
 *
 * **`theme` coming back `null` from a parse means leave the current theme
 * alone, and `apply` is called with that `null` verbatim.** This hook does
 * not resolve it to a real theme itself — the field is `ActorTheme | null` on
 * the callback precisely so the caller, which holds the actual current theme
 * in its own form, is the one deciding what "unchanged" resolves to, rather
 * than this hook guessing at a value it was not given fresh.
 *
 * **A CONTRACT ON THE CALLER: pass `onChange` straight to the textarea's
 * change handler, and never put it in an effect's or a memo's dependency
 * array.** `onChange`'s identity changes whenever `theme` (among other
 * things) changes — see its own implementation for why `theme` has to be a
 * real dependency — so anything that re-runs when `onChange`'s reference
 * changes will re-run on a theme change too. A theme change arriving mid-type
 * would then cancel and reschedule whatever that dependent effect or memo
 * was doing, which is not itself a debounce bug but would look exactly like
 * one to whoever debugs it next. `PageSourceField` (`fursona-editor.tsx`) is
 * the caller, and honours this: it hands the whole `source` object straight
 * to `PageSourceDock`, which wires `source.onChange` directly onto the
 * textarea's `onChange` prop, never into an effect's or a memo's dependency
 * array.
 *
 * @param options - {@link UsePageSourceOptions}.
 * @returns the dock's state and the three actions it can take.
 */
export function usePageSource(options: UsePageSourceOptions): PageSourceState {
  const {
    theme,
    blocks,
    actorKind,
    apply,
    debounceMs = DEFAULT_DEBOUNCE_MS,
  } = options;

  const [text, setText] = useState(() => toDocument(theme, blocks));
  const [problems, setProblems] = useState<readonly DocumentProblem[]>([]);
  const [drifted, setDrifted] = useState(false);

  /**
   * The last serialisation this hook itself produced or accepted.
   *
   * Never the tree — only the string both sides last agreed on. Every write
   * to `text` from either direction compares against this first, which is
   * what stops the two directions re-entering each other.
   */
  const mirror = useRef(text);

  /**
   * Whether the box currently has focus.
   *
   * A ref rather than state on purpose: nothing here is ever rendered from
   * it directly (only `drifted` is), and the page-to-text effect below reads
   * it without depending on it — a plain state variable read the same way
   * would be a real missing dependency, where a ref read through `.current`
   * is not one, because a ref's identity never changes and React does not
   * track mutations to what it points at.
   */
  const focused = useRef(false);

  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const doc = toDocument(theme, blocks);
    if (doc === mirror.current) return;
    if (focused.current) {
      setDrifted(true);
      return;
    }
    setText(doc);
    mirror.current = doc;
    setDrifted(false);
    setProblems([]);
    // Only `theme` and `blocks` decide whether the page has moved; `mirror`
    // and `focused` are refs read for their current value on purpose, not
    // dependencies whose change should re-run this.
  }, [theme, blocks]);

  useEffect(
    () => () => {
      if (timer.current !== undefined) clearTimeout(timer.current);
    },
    [],
  );

  const onChange = useCallback(
    (next: string) => {
      setText(next);
      if (timer.current !== undefined) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const parsed = parseDocument(next, actorKind);
        if (parsed.ok) {
          setProblems([]);
          // The CANONICAL form of what was applied, not the raw text that was
          // typed — see this function's own TSDoc for why a hand-edited box
          // makes those two different on every input except one.
          mirror.current = toDocument(parsed.theme ?? theme, parsed.blocks);
          setDrifted(false);
          apply({ theme: parsed.theme, blocks: parsed.blocks });
        } else {
          setProblems(parsed.problems);
        }
      }, debounceMs);
    },
    // `theme` is a real dependency here, not an oversight: it is read inside
    // the debounced callback as the fallback for `parsed.theme ?? theme`, and
    // omitting it would leave every keystroke's closure pinned to whichever
    // `theme` happened to be in scope the last time `actorKind`, `apply` or
    // `debounceMs` changed — which could be arbitrarily stale.
    //
    // This does NOT close every staleness window, and the one that is left is
    // accepted rather than fixed: a theme change landing AFTER the keystroke
    // that starts a debounce but BEFORE it fires still runs inside the
    // closure that keystroke captured, with the pre-change `theme` baked in —
    // so the resulting mirror mismatches and a drift is raised. That drift is
    // an honest one (the page genuinely moved while an edit was in flight),
    // and it resolves itself the ordinary way: the next `resync`, or the next
    // real page change while unfocused.
    [actorKind, apply, debounceMs, theme],
  );

  const onFocusChange = useCallback((next: boolean) => {
    focused.current = next;
  }, []);

  const resync = useCallback(() => {
    if (timer.current !== undefined) clearTimeout(timer.current);
    const doc = toDocument(theme, blocks);
    setText(doc);
    mirror.current = doc;
    setDrifted(false);
    setProblems([]);
  }, [theme, blocks]);

  return {
    text,
    problems,
    stale: problems.length > 0,
    drifted,
    onChange,
    onFocusChange,
    resync,
  };
}
