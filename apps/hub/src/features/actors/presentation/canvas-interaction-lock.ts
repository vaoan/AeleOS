"use client";

import { CHROME_SCOPE } from "@/shared/domain/chrome";

/**
 * Every selector the interaction lock treats as capable of acting on its
 * own — navigating, playing, opening, receiving keyboard focus.
 *
 * Anchors, buttons, form controls, disclosures, controlled media, frames,
 * editable content and an explicit tab stop. `[tabindex]:not([tabindex='-1'])`
 * is what catches a block that opted itself into the tab order without also
 * being one of the named elements.
 */
export const INTERACTIVE =
  "a[href], button, input, select, textarea, details, summary, audio[controls], video[controls], iframe, object, embed, [contenteditable], [tabindex]:not([tabindex='-1'])";

/**
 * Every {@link INTERACTIVE} match under `node`, `node` itself included,
 * excluding anything inside an AeleOS control island.
 *
 * A chrome island — the inspector, Add, the toolbar — can sit inside the
 * canvas element the lock is asked to act on; its own controls must keep
 * working while the page they float over does not.
 *
 * @param node - the subtree to search, an added node or the whole canvas.
 * @returns the elements the lock should act on.
 */
function candidatesIn(node: ParentNode): Element[] {
  const found: Element[] = [];
  if (
    node instanceof Element &&
    node.matches(INTERACTIVE) &&
    !node.closest(`.${CHROME_SCOPE}`)
  ) {
    found.push(node);
  }
  for (const el of node.querySelectorAll(INTERACTIVE)) {
    if (!el.closest(`.${CHROME_SCOPE}`)) found.push(el);
  }
  return found;
}

/**
 * Marks every interactive descendant of an editor canvas `inert`, so a click
 * meant to select a block cannot also navigate, play or open one.
 *
 * **The canvas element itself is never marked `inert`** — only its
 * descendants — because the click that selects a block is read from that
 * same element, and an inert ancestor would swallow it before it arrived.
 *
 * It observes the canvas for anything mounted after the lock is taken —
 * a newly selected player, a freshly authored link — so a block added mid-
 * session is caught exactly like one that was already there.
 *
 * **Unlocking restores each element's own prior state rather than always
 * removing `inert`.** The public renderer can mark something `inert` on
 * its own terms (a disabled control, say), and this lock must never make
 * that interactive again just because editing ended — see
 * `canvas-interaction-lock.test.ts`'s discriminating fixture, an
 * already-inert element beside a live one.
 *
 * @param root - the canvas element carrying `data-editor-canvas`.
 * @returns a cleanup function: stops observing and restores every element
 *   this call touched to whatever `inert` state it had before it ran.
 */
export function lockCanvasInteraction(root: HTMLElement): () => void {
  const priorInert = new Map<Element, boolean>();

  const lock = (el: Element): void => {
    if (!priorInert.has(el)) priorInert.set(el, el.hasAttribute("inert"));
    el.setAttribute("inert", "");
  };

  const applyTo = (node: ParentNode): void => {
    for (const el of candidatesIn(node)) lock(el);
  };

  applyTo(root);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof Element) applyTo(node);
      }
    }
  });
  observer.observe(root, { childList: true, subtree: true });

  return () => {
    observer.disconnect();
    for (const [el, wasInert] of priorInert) {
      if (wasInert) el.setAttribute("inert", "");
      else el.removeAttribute("inert");
    }
  };
}
