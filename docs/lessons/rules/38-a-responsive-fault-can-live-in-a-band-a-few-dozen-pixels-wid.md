# Rule 38: A responsive fault can live in a BAND a few dozen pixels wide, and the band starts at whichever breakpoint you just used.

38. **A responsive fault can live in a BAND a few dozen pixels wide, and the
    band starts at whichever breakpoint you just used.** Adding the writing
    switch to the editor's toolbar meant three things arrived at `sm` at once:
    the row going from two lines to one, Hide controls and Cancel getting their
    words back, and the switch swapping its two-letter codes for
    `English`/`Español`. Measured, the row then wanted **673px against a 640px
    viewport** — and overflowed from exactly 640 to about 672 **and nowhere
    else**. 320 was clean, 700 was clean, every desktop width was clean.

    **The habit that misses it is the obvious one**: check a phone width and a
    desktop width, see nothing, move on. Both of those readings are true and
    neither is anywhere near the fault. A breakpoint is a discontinuity, and a
    discontinuity is where a layout's cost jumps — so the width to look at is
    the one immediately at and above each breakpoint the change touches, not
    the sizes you happen to think in. Sweeping 360/500/600/639/640/700/767/768
    took one run and named the band to the pixel.

    The fix generalises too, and it is not "shave everything": **stagger the
    arrivals.** Deferring the endonyms one step to `md` left the single row
    61px of slack where it first appears and 95px where they arrive. Where a
    row genuinely cannot hold what is asked of it — this one wanted 345.1px
    against a 288px box at 320, and trimming every icon button and Save's
    padding gives back 32 — letting it WRAP keeps every control the size it was
    designed at, and here it also gave a phone the page title it had never
    shown at all.

    This is rule 30's shape with the subject moved: not a claim about another
    file, but a claim about a range of widths, verified at two points inside it
    and false in between.
