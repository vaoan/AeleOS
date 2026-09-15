# Rule 14: A budget is only real if it separates the two builds, and one reading of each does not establish that.

14. **A budget is only real if it separates the two builds, and one reading of
    each does not establish that.** The dial-latency ceiling in
    `personalised-page-cost.spec.ts` was set from a single pair — 31ms fixed,
    557ms sabotaged — and it failed CI at 283ms on code that was correct. Read
    again, the same unmodified build measured a median of 17.6ms and 575.4ms at
    a 6x throttle in two runs minutes apart, against 836.1ms sabotaged. The
    distributions overlapped, so **no ceiling existed that could have been
    right**, and recalibrating it would only have moved which runs lied. It was
    replaced rather than relaxed, by a ratio of two counts taken in the same
    run — theme commits per delivered movement — which reads 0.006 fixed and
    1.000 sabotaged at throttles of 1x, 4x, 6x and 8x. The general form:
    **before trusting a performance budget, measure the good build twice and the
    bad build once, and check the gap is bigger than the spread.** A single
    green and a single red look identical to a real signal and to a coin toss.

    **The half of that which cost the most time is the sabotage.** An agent
    tried to check the budget by defeating the coalescing at RUNTIME —
    monkey-patching `requestAnimationFrame` — rather than in the source, saw the
    number barely move, and concluded the budget might be measuring nothing.
    Both halves of that were wrong and each on its own is enough. The patch does
    not reproduce the fault: the component's pending-frame flag still collapses
    a burst arriving in one task, so the keyboard burst reported 0.006 commits
    per movement WITH the patch applied — the coalescing intact. And the
    instrument is built out of the very thing being patched, `rAF` twice over,
    so it reported 2.6ms where the honest fixed build reports 27.0 and the truly
    sabotaged build 37.7: a page committing on every single event scoring ten
    times better than one that does not. **Never sabotage a mechanism your
    instrument is built on**; and when a runtime shortcut and a source edit
    disagree, the source edit is the measurement and the shortcut is a third
    program neither of you meant to run.

    A smaller finding from the same pass, worth keeping because it decides what
    a check CAN assert: **headless Chromium rasterises everything on the CPU.**
    Asked over CDP, it answers `2d_canvas: unavailable_software`,
    `gpu_compositing: disabled_software`, `rasterization: disabled_software` on
    a SwiftShader device, where the same browser headed on the same machine
    answers `enabled` to all three on the real adapter. Every canvas
    millisecond this repository has ever recorded is therefore software raster.
    That is the right regime for a CI budget — the runner has no GPU either, and
    it is the pessimistic side — and it leaves the resolution assertions
    untouched, since those compare integers. What it forbids is quoting those
    milliseconds as what a visitor's machine pays. The account is in
    `canvas-performance.spec.ts`'s own header.
