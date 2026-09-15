# Rule 33: ZERO TOLERANCE FOR FLAKINESS. A test that sometimes fails is a defect report, and the defect is usually not in the test.

33. **ZERO TOLERANCE FOR FLAKINESS. A test that sometimes fails is a defect
    report, and the defect is usually not in the test.** Never retry it, never
    widen its timeout to make it stop, never mark it `skip` and move on. Find
    the mechanism, fix the mechanism, and write down what it was. A suite you
    have taught yourself to re-run is a suite that has stopped being evidence,
    and the day it goes red for a real reason is the day somebody re-runs it.

    **"Intermittent" is a description of what you observed, not of the cause,
    and treating it as the cause is the whole failure.** Measured 2026-08-26:
    `fursona-drag-reorder.spec.ts` failed about one run in three, then three
    runs in three, and both readings were of the same monotonic clock rather
    than of chance. The drop always landed — the live region announced it — and
    the list
    always reordered; it took **5985ms, 5974ms, 5973ms**, three readings inside
    12ms of each other, against `expect.poll`'s 5000ms default. Nothing was
    random. A fixed threshold was being crossed by a number that only ever goes
    up.

    What made it go up is the part worth carrying. `readArrangement` selects
    `actor_profiles` with **no filter**, because RLS is what narrows it — and
    the policy was `using (owns_active_actor(actor_ref))`, a `security definer`
    function, which Postgres cannot inline and therefore calls **once per row**.
    Every end-to-end run leaves its fixtures behind, so the table had reached
    6,206 rows, and one read of nine of them was:

    ```
    Seq Scan on actor_profiles (actual time=542..1383 rows=9 loops=1)
      Filter: owns_active_actor(actor_ref)
      Rows Removed by Filter: 6206
      Buffers: shared hit=56748
    Execution Time: 1383.579 ms
    ```

    Three concurrent copies of that is the six seconds. **So the flake was a
    performance regression that had been growing for months, and the test was
    the only thing in the repository telling anyone about it.** Widening the
    timeout — the obvious fix, and the one this rule exists to forbid — would
    have deleted the only signal that a person's own fursona list takes five
    seconds to settle.

    The fix is a set-returning `security definer` function, evaluated once as a
    hashed subplan, with the policy asking for membership rather than calling a
    predicate per row: **1387ms to 2.5ms, 56,869 buffers to 767.** Two things
    about doing that safely generalise. A policy expression runs as the CALLING
    role, so the obvious rewrite — inlining the subquery into the policy — fails
    with `permission denied for table actors`, which is exactly why the original
    used a definer function and is a good reason to keep one. And **speed is
    worthless on an RLS policy unless the visible set is provably identical**:
    that was checked across 61 callers, including one whose identity does not
    exist, with 59 of them able to see something, because a comparison where
    both sides return nothing is rule 27 wearing a security hat.

    **The one thing this rule does NOT forbid is naming a cost you have
    measured (2026-08-27).** A DEFAULT is not a budget anybody chose.
    `block-editor.test.tsx`'s cap case renders `BLOCK_LIMITS.blocks` — 500 —
    real leaf editors into jsdom, and sat against vitest's generic 5000ms:
    measured at 843/858ms with the card eyebrow rendering nothing and
    1048/1056ms with it, while CI ran the same case at 5314ms and timed out.
    At about 5x this machine the case was already inside 15% of the ceiling
    **before** the eyebrow existed, with no headroom for a loaded runner.

    So the forbidden move is raising a number until a red run goes green
    without knowing why. Naming an explicit ceiling, on a case that asserts no
    duration, with the readings and the mechanism written beside it, is the
    opposite act — and the giveaway is that it comes with numbers. A micro-fix
    was tried first and refused for the right reason: replacing the leaf's icon
    with a CSS box read 896–1043ms against 1048/1056, distributions that
    overlap, so rule 14 says there is no claim there to make.
