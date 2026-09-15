# Rule 17: Being right for the wrong reason is the worse way to be right, because the reasoning is what the next person reuses.

17. **Being right for the wrong reason is the worse way to be right, because
    the reasoning is what the next person reuses.** The `min-w-0` fix was
    correct and its stated mechanism was false: a flex item is NOT floored at
    `min-width: auto` in a column container — per Flexbox §4.5 an automatic
    minimum size applies on the main axis, so it computes to `0` — and the
    guard that actually did the work everywhere except `timeline` was
    `minmax(0, 1fr)`. The credited sabotage was false too: removing the
    `min-w-0` guards left the whole suite green, because no fixture put a wide
    leaf in the one mode that lays `auto` tracks. A conclusion that survives a
    wrong explanation will be copied to the next place with the explanation
    attached, and there it will be wrong about the outcome as well. Measure
    which half of a fix is load-bearing before writing down why it worked.
