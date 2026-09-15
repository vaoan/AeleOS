# Rule 26: An event you can OBSERVE is not proof that the thing which acts on it is listening yet.

26. **An event you can OBSERVE is not proof that the thing which acts on it is
    listening yet.** `@dnd-kit/core@6.3.1`'s `KeyboardSensor.attach()` starts
    the drag synchronously and then adds its own `keydown` listener inside a
    `setTimeout`. The lift is announced out of the state that synchronous call
    set — so the announcement, which is the only signal a browser test has, is
    rendered INSIDE the window where an arrow key reaches nothing at all. One
    run in three lost its first arrow, the walk then sat on the place it
    started from, and the poll timed out five seconds later quoting an
    announcement that was entirely correct. It reads as a slow machine and is
    not: the key was never delivered, so no timeout is large enough to fix it.

    Two things generalise past this library. **Waiting for a visible effect
    proves the effect and never the wiring behind it** — and where a dependency
    defers its own listeners, the wait has to be ORDERED against that deferral
    rather than made longer.

    **The ordering this rule originally prescribed was wrong, and measuring it
    is what showed that.** It said one macrotask closes the window "by
    construction, because the sensor's timer was queued first and timers of
    equal delay fire in the order they were queued". That argument assumes the
    sensor has already ATTACHED when the yield is queued — and attach happens
    in a React commit the scheduler may defer. On a page with one more section
    it does defer, and then our timer is queued first, fires first, and the
    first arrow is lost on EVERY run rather than one in three. Measured
    2026-08-20: one macrotask lost it every time, two lost it every time, a
    `requestAnimationFrame` with a `setTimeout` nested inside it lost it never.
    React commits before paint, so the frame callback runs after the commit
    that attached the sensor, and a timer queued from inside that frame is
    queued after the sensor's own. `support/drag.ts` does that now.

    The general form is the part to carry: **an ordering argument has a
    premise about WHEN the other side registered, and that premise is the thing
    to check.** A guard whose correctness rests on queue order is only as true
    as its assumption about what has already run — and the failure mode is not
    a flake that gets rarer on a faster machine, it is a deterministic loss on
    a heavier page. And **a
    "did it happen" check built on a signal that is already dirty is vacuous**:
    the second drag in a test begins with the first drag's own DROP
    announcement still on screen, so `expect(liveRegion).not.toBeEmpty()`
    passed before anything had been lifted — an assertion that could not fail,
    in the one place a dead grip would first be noticed. Wait for a CHANGE from
    what was there, not for presence.
