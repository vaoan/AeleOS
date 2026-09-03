"use client";

import { domAnimation, LazyMotion, MotionConfig } from "motion/react";
import type { ReactNode } from "react";

/**
 * Motion's feature bundle for editor chrome, re-exported as `m`.
 *
 * **Import `m` from here, never `motion` from `motion/react` directly.**
 * `motion` pulls the full namespace and every gesture/layout feature with
 * it; `m` paired with {@link EditorMotion}'s `LazyMotion` is what keeps the
 * always-loaded core small and fetches the rest once the editor mounts. A
 * static grep test (`editor-motion.test.tsx`) fails if `"motion/react"` is
 * imported anywhere under this feature outside this file and its own test.
 */
export { m } from "motion/react";

/** What {@link EditorMotion} needs. */
export interface EditorMotionProps {
  /** Editor chrome that may render `m` components from this module. */
  children: ReactNode;
}

/**
 * One reduced-motion switch for every animation inside editor chrome.
 *
 * Mounted once, at the editor's own root — never per control — so the
 * preference is honoured in one place rather than restated by every `m.*`
 * component. `reducedMotion="user"` reads `prefers-reduced-motion` and,
 * where it is set to reduce, collapses every Motion-driven animation and
 * transition to its end state instantly; it does not touch CSS transitions
 * declared outside Motion, which is why the canvas-accommodation and
 * selection-outline transitions in `block-editor.tsx` are plain CSS with
 * their own `prefers-reduced-motion` handling.
 *
 * **Must never wrap a `@dnd-kit` node, a `SKIN_SCOPE` descendant, or a
 * public route — and the three halves of that are checked by two DIFFERENT
 * mechanisms, corrected 2026-09-02 after a review found the TSDoc claiming
 * one for all three.** Motion writes inline styles, which beat every
 * layered utility unconditionally — the same mechanism root rules 3 and 4
 * already name for a stylesheet.
 *
 * The `SKIN_SCOPE`/public-route half IS a static grep, and it is general:
 * `editor-motion.test.tsx`'s "never appears in the public renderer, the
 * public profile, or the theme scope" case fails if `motion/react` (or this
 * module) is ever imported by `blocks.tsx`, `public-profile.tsx` or
 * `theme-scope.tsx` — which is every file `m.*` could otherwise reach that
 * boundary through.
 *
 * The `@dnd-kit` half is NOT general, and claiming it was is exactly what
 * got corrected: a real review found this component's own root and its
 * Items-pane entrance both writing `x`/`y` while wrapping `InspectorItems`
 * → `BlockSlot`, the real draggable/droppable — an ancestor `transform` on
 * the very box `@dnd-kit` measures and moves, which no test had ever
 * checked. Both are opacity-only now (see `canvas-inspector.tsx`'s own
 * TSDoc), and `editor-motion.test.tsx`'s "the `@dnd-kit` ancestry boundary"
 * cases pin exactly those two positions against regression — a NAMED,
 * narrow check on the one file this feature composes across that boundary
 * in, not a general ancestry scanner. A new `m.*` usage elsewhere that
 * becomes an ancestor of a `@dnd-kit` node is not caught by anything
 * automatic; it is caught by root rule 30's own remedy — grep for
 * `useDraggable`/`useDroppable`/`BlockSlot` before adding one.
 *
 * @param props - see {@link EditorMotionProps}.
 * @returns the children, wrapped in Motion's lazy feature loader and its one
 *   reduced-motion switch.
 */
export function EditorMotion(props: EditorMotionProps): ReactNode {
  const { children } = props;
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
