"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/** What the provider hands down: where the slot is, and how to claim it. */
interface EscapeSlot {
  /** The slot element once it has mounted, or null before that. */
  node: HTMLElement | null;
  /** A ref callback the target passes to its own element. */
  attach: (element: HTMLElement | null) => void;
}

const Context = createContext<EscapeSlot>({ node: null, attach: () => {} });

/** What {@link EscapeSlotProvider} wraps. */
export interface EscapeSlotProviderProps {
  /** The shell, its header and its page — the slot and its filler both. */
  children: ReactNode;
}

/**
 * Lets a page put ONE control of its own into the header's control row.
 *
 * **A context rather than a prop, because the state is in the wrong place for
 * one.** {@link PageShell} is a server component whose slots a route fills;
 * whether the fursona editor's workbench is hidden is client state held deep
 * inside `FursonaEditor`. Threading it upward would put one feature's state in
 * the component every page shares.
 *
 * **A context rather than a DOM lookup, because a lookup is not allowed here
 * and should not be.** `document.querySelector` is restricted in this app in
 * favour of a ref, and the rule is right: a string contract between two
 * components is untyped, unchecked, and silently wrong the day either side
 * renames it. The ref callback also removes the timing question a query has —
 * there is no moment where the node exists and this has not noticed.
 *
 * The control lands in the header's row IN FLOW, which is the whole point. As
 * a `fixed` element in the corner the editor's escape button covered the
 * language and light/dark toggles by 88% each, putting both out of reach; a
 * control out of flow has no way to know what it lands on.
 *
 * @returns the subtree, with the slot available to it.
 */
export function EscapeSlotProvider({
  children,
}: EscapeSlotProviderProps): ReactNode {
  const [node, setNode] = useState<HTMLElement | null>(null);
  // `setNode` is stable, so the ref callback identity never changes and React
  // does not detach and re-attach the slot on every value change.
  const value = useMemo(() => ({ node, attach: setNode }), [node]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/**
 * The empty place in the header a page's own escape control portals into.
 *
 * `display: contents` so an unfilled slot is not a gap and a filled one is a
 * direct flex item of the header's row, spaced by the row's own `gap`.
 *
 * @returns the slot element.
 */
export function EscapeSlotTarget(): ReactNode {
  const { attach } = useContext(Context);
  return <div ref={attach} className="contents" />;
}

/**
 * Where to portal a page's own escape control, or null before the slot mounts.
 *
 * **Null is an ordinary answer and not an error.** A caller renders nothing
 * until it is non-null; the alternative — rendering the control in place as a
 * fallback — would be a path the product never takes, which this repository has
 * already been caught measuring instead of the real one.
 *
 * @returns the slot element, or null.
 */
export function useEscapeSlot(): HTMLElement | null {
  return useContext(Context).node;
}
