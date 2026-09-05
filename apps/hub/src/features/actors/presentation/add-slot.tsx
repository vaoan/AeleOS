"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/** What the provider hands down: where the slot is, and how to claim it. */
interface AddSlot {
  /** The slot element once it has mounted, or null before that. */
  node: HTMLElement | null;
  /** A ref callback the target passes to its own element. */
  attach: (element: HTMLElement | null) => void;
}

const Context = createContext<AddSlot>({ node: null, attach: () => {} });

/** What {@link AddSlotProvider} wraps. */
export interface AddSlotProviderProps {
  /** `EditorToolbar` and `BlockEditor` both — the slot and its filler. */
  children: ReactNode;
}

/**
 * Lets `BlockEditor` put its own Add control inside `EditorToolbar`'s row.
 *
 * **A context and a portal, not a prop, because the data the control needs
 * is owned by the wrong component for a prop.** `BlockEditor` alone holds
 * `blocks` and the current `EditorSelection` — `FursonaEditor` deliberately
 * never watches `sections`, because doing so would re-render `EditorToolbar`
 * on every keystroke inside a leaf, the exact fault `PageSourceField`'s own
 * isolated `useWatch` exists to avoid one level over (see
 * `fursona-editor.test.tsx`'s toolbar-render-count case). So the single
 * global Add control cannot be built as data in `FursonaEditor` and handed
 * down to `EditorToolbar` as a `pageThemeSwitch`-shaped node would be —
 * `FursonaEditor` would have to read `blocks` to build it, which reopens the
 * render count exactly where the theme/language switches never do, since
 * neither of those needs the page tree.
 *
 * The mechanism is the same shape as `EscapeSlotProvider`/`EscapeSlotTarget`,
 * scoped to this feature rather than shared: `BlockEditor` builds and
 * portals its own `AddBlockPicker`, computed from its own local `blocks` and
 * selection, into a slot `EditorToolbar` renders — so only `BlockEditor`'s
 * own subtree re-renders when either changes, and `EditorToolbar` never
 * learns what a selection is.
 *
 * @returns the subtree, with the slot available to it.
 */
export function AddSlotProvider({ children }: AddSlotProviderProps): ReactNode {
  const [node, setNode] = useState<HTMLElement | null>(null);
  // `setNode` is stable, so the ref callback identity never changes and React
  // does not detach and re-attach the slot on every value change.
  const value = useMemo(() => ({ node, attach: setNode }), [node]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/**
 * The empty place in the toolbar's row `BlockEditor`'s Add control portals
 * into.
 *
 * `display: contents` so an unfilled slot is not a gap and a filled one is a
 * direct flex item of the row, spaced by the row's own `gap`.
 *
 * @returns the slot element.
 */
export function AddSlotTarget(): ReactNode {
  const { attach } = useContext(Context);
  return <div ref={attach} className="contents" />;
}

/**
 * Where `BlockEditor` portals its own Add control, or null before the slot
 * mounts.
 *
 * **Null is an ordinary answer, not an error.** A caller renders nothing
 * until it is non-null; rendering the control in place as a fallback would be
 * a path the product never takes, wearing the exact shape this repository has
 * already been caught measuring instead of the real one.
 *
 * @returns the slot element, or null.
 */
export function useAddSlot(): HTMLElement | null {
  return useContext(Context).node;
}
