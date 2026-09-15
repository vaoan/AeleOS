# Rule 13: A test can exercise a path the product never takes and look exactly like coverage.

13. **A test can exercise a path the product never takes and look exactly like
    coverage.** `canvas-performance.spec.ts` set `--canvas` by name for every
    canvas, the default one included. The product never does that for the
    default — `themeVars` emits the property only for a canvas OTHER than the
    default, so that the untouched page stays byte-for-byte what it was — so
    the one caller exercising the nebula was the one caller that could not
    reproduce how the nebula is reached. It measured the half-resolution path
    while every page in the app served the full-resolution one: four times the
    pixels, 35.8ms a frame against 8.9, from the day `renderScale` was written.

    This is the repository's own "a mocked dependency hides its own setup
    requirements" with the TEST supplying what was missing instead of a mock,
    and it generalises the same way: **a suite that supplies setup the product
    does not is measuring a different program.** When a value has a fallback,
    the check has to reach it the way production does — by leaving it unset —
    and a fallback that each consumer applies for itself is a fallback each
    consumer gets a separate chance to disagree about. Both faults here were
    that: `renderScale("")` answered 1 where `renderScale("nebula")` answered
    0.5, and nothing owned the resolution until `resolveCanvas` did.

    **The other half is rule 10 at its sharpest.** Three of us reasoned
    confidently about which CSS was expensive — `backdrop-filter`,
    `background-attachment: fixed`, the comic halftone, `neon`'s spread,
    `cutout`'s `clip-path` — and every one of those arguments was wrong.
    Measured on a throttled phone, all of them together cost 4.0 points of the
    main thread and the canvas cost 65.6; the fixed attachment, the single
    measurement the feature notes flagged as highest-value, was zero three
    times over. The thing nobody had looked at was a one-line fallback. Suspect
    what is measured, not what is interesting.
