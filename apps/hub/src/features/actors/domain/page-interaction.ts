/**
 * Editor chrome visibility and the session-only interaction switch.
 *
 * The two inputs {@link pageInteractionsEnabled} reads. Kept as a named type
 * rather than inlined so the function's own `@param` names one thing instead
 * of two, which is what lets the same sentence satisfy both `jsdoc` (which
 * would otherwise ask for one entry per property of an inline object type)
 * and `tsdoc` (which refuses a dotted parameter name outright).
 */
export interface PageInteractionState {
  /**
   * Whether Preview has stepped the workbench aside.
   *
   * Preview is hide-controls, not a second renderer, so this alone always
   * implies interaction — see {@link pageInteractionsEnabled}.
   */
  controlsHidden: boolean;
  /** The toolbar's own session-only switch. */
  switchEnabled: boolean;
}

/**
 * Whether authored page content may receive pointer and keyboard input.
 *
 * Preview is hide-controls, not a second renderer, so hidden controls always
 * enable interaction. The toolbar switch is the only way to enable it while
 * controls remain visible. Neither input is stored.
 *
 * @param state - editor chrome visibility and the session switch.
 * @returns true when links, media and frames on the canvas must work.
 */
export function pageInteractionsEnabled(state: PageInteractionState): boolean {
  return state.controlsHidden || state.switchEnabled;
}
