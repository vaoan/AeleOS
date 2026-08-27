/**
 * The class marking an island of AeleOS's own controls.
 *
 * **The mirror of `SKIN_SCOPE`, and the inversion the editor rests on.** A
 * public page themes the document; the editor themes it too, with the draft
 * its author is building — so a control sitting on that document would wear
 * their palette, their skin and their field. An element carrying this class
 * re-declares the app's own tokens ON ITSELF, and a caller may assume every
 * descendant resolves AeleOS's colours, surfaces, edges and skin defaults
 * whatever the author wrote at `:root`.
 *
 * **There is no cascade fight here, and that is why this works at all.** The
 * cascade compares declarations on the same element; a declaration on the
 * control always beats one inherited from `:root`, whatever the specificity or
 * source order of the rule the author's theme arrived in.
 *
 * **The composed properties are the trap, and they are handled in the
 * stylesheet rather than here.** `--surface` and `--bar` are composed from raw
 * values at `:root`, and a descendant inherits the already-resolved result — so
 * an island restating only the raw colours would keep the author's surface. The
 * rule in `globals.css` names this class alongside `:root` on the block that
 * declares both, which is what makes them re-resolve. See `ROOT_COMPOSED` in
 * `features/actors/domain/actor-theme.ts` for the same hazard met from the
 * other side.
 *
 * **Never put it on `<html>`.** The tokens are declared for `:root` and for
 * this class in one rule, so an element that is both matches the same selector
 * twice and gains nothing — while the author's theme, which targets `:root`
 * from an unlayered stylesheet injected later, would win that element outright.
 *
 * It lives in `shared/` because `globals.css` and every feature's controls both
 * need it, and `shared/` may not import a feature. One constant, used by the
 * element and by the rule — `SKIN_SCOPE` records what happened when that pair
 * drifted apart.
 */
export const CHROME_SCOPE = "aeleos-chrome";
