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
 * **Never wraps a `@dnd-kit` node, a `SKIN_SCOPE` descendant, or a public
 * route.** Motion writes inline styles, which beat every layered utility
 * unconditionally — the same mechanism root rules 3 and 4 already name for
 * a stylesheet — so the boundary is enforced by where this component is
 * mounted (`FursonaEditor`'s own chrome tree) and by the same static grep
 * test that guards the import.
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
