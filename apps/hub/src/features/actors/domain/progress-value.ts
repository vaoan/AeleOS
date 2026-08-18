/**
 * Clamps a percentage to what a bar can actually draw.
 *
 * @param value - a percentage, from any of the forms {@link progressValue}
 *   reads — none of which refuses a value outside 0–100 on its own.
 * @returns `value` clamped to the range a bar can render, `[0, 100]`.
 */
function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/**
 * A whole number or a decimal, as the pattern fragment shared by every form
 * {@link progressValue} reads.
 *
 * **Written as an alternation, `(\d+|\d+\.\d+)`, rather than `\d+(?:\.\d+)?`
 * — the two accept the same strings, but only the alternation is
 * star-height 1.** The optional-group form puts a `+` inside a `?`, which
 * `security/detect-unsafe-regex` flags on principle when it can see a
 * pattern at all — regardless of whether the input is actually attacker-
 * controlled or the pattern can actually backtrack catastrophically (it
 * cannot: there is nothing here for two quantifiers to disagree about).
 * Verified directly against the `safe-regex` package the rule is built on:
 * the optional form is rejected, the alternation is accepted.
 *
 * **The rule cannot actually see either form here, and that is worth
 * saying plainly rather than leaving the sentence above to imply
 * otherwise.** `detect-unsafe-regex` only inspects a regex `Literal` or
 * `new RegExp(<Literal>)` — {@link FRACTION_PATTERN} and its siblings below
 * are `new RegExp` calls over a template literal WITH an interpolation, a
 * node shape the rule does not evaluate at all, so `\d+(?:\.\d+)?` would
 * lint clean if it were substituted in today. The alternation stays anyway,
 * on its own merits: it is still the genuinely simpler, linear shape, and
 * keeping it is what lets these ever become literals again — say, if
 * `NUMBER`'s indirection is later found not to be worth it — without
 * silently reintroducing the pattern the rule exists to catch.
 */
const NUMBER = String.raw`\d+|\d+\.\d+`;

/**
 * The patterns {@link progressValue} tries, in the order it tries them,
 * each built from {@link NUMBER} once at module load rather than compiled
 * fresh on every call — none carries the `g`/`y` flags that would make
 * reusing a compiled `RegExp` across calls unsafe.
 */
const FRACTION_PATTERN = new RegExp(`^(${NUMBER})\\s*/\\s*(${NUMBER})$`);
const PERCENT_PATTERN = new RegExp(`^(${NUMBER})\\s*%$`);
const BARE_NUMBER_PATTERN = new RegExp(`^(?:${NUMBER})$`);

/**
 * Reads a `progress` block's value as a percentage, or refuses it.
 *
 * A fraction ("3/5", or "7.5/10" — divided and scaled; a zero denominator is
 * refused rather than producing `Infinity`), a percentage ("60%" or
 * "7.5%"), and a bare number ("60" or "7.5", read directly as a
 * percentage) — tried in that order, and nothing else is read. Every form
 * is clamped to `[0, 100]` by {@link clampPercent}, since nothing stops
 * somebody writing "150" or "150%" and a bar has no way to draw past its
 * own edge.
 *
 * **Anything else returns `null`, and that is the point.** Prose, an empty
 * string, a negative number, or a unit this does not recognise all refuse
 * gracefully rather than producing a broken bar — the same "refuses nothing,
 * shows nothing" trap the embed kinds already avoid by falling back to a link.
 * This is also the common case: an unedited placeholder is prose, not a
 * number, and every caller reads a refusal as "draw no bar at all" — never as
 * an error.
 *
 * **A caller must assert on what it RENDERED, not on what this returned.**
 * The fault this refusal exists for is not a wrong number; it is a bar drawn
 * from `NaN`, whose `width` CSSOM rejects outright, leaving the fill at its
 * parent's full width. A bar reading 100% on nonsense looks like an answer,
 * which is worse than no bar, and a test that only reads this function's
 * return value cannot see it.
 *
 * **It lives in `domain/` rather than beside a renderer**, which is not
 * tidiness: two renderers read it now, so a copy in either one would be a
 * second body free to drift the first time the parse changed — and a domain
 * file is inside the measured coverage set, where a presentation file is
 * excluded and an unexercised branch here would be invisible.
 *
 * @param value - the block's value, already resolved to the locale being
 *   read.
 * @returns a percentage from 0 to 100, or `null` when it cannot be read as
 *   one.
 */
export function progressValue(value: string): number | null {
  const trimmed = value.trim();

  const fraction = FRACTION_PATTERN.exec(trimmed);
  if (fraction) {
    const denominator = Number(fraction[2]);
    if (denominator === 0) return null;
    const ratio = (Number(fraction[1]) / denominator) * 100;
    // A numerator AND denominator that both overflow `Number` (roughly 309+
    // digits each — reachable, since the text cap is 2000) read as
    // `Infinity / Infinity`, which is `NaN`. Neither side being zero, the
    // guard above does not catch it, and `NaN` is not `null` — so without
    // this, the bar rendered anyway: `aria-valuenow="NaN"` and a
    // `width: "NaN%"` style CSSOM rejects outright, leaving the bar at its
    // block parent's full width. This same check ALSO refuses a NUMERATOR-
    // only overflow (`Infinity / 5` is `Infinity`, not finite) — the right
    // answer for the same reason: nobody could read either as a genuine
    // proportion. Only a DENOMINATOR-only overflow survives it, and not as
    // a special case — `5 / Infinity` is a real, finite `0`, which is
    // exactly what an unreadably large total should draw. Checked after the
    // divide rather than by rejecting a long digit run up front, so this one
    // finite outcome is not thrown away along with the two that are not.
    if (!Number.isFinite(ratio)) return null;
    return clampPercent(ratio);
  }

  const percent = PERCENT_PATTERN.exec(trimmed);
  if (percent) return clampPercent(Number(percent[1]));

  if (BARE_NUMBER_PATTERN.test(trimmed)) return clampPercent(Number(trimmed));

  return null;
}
