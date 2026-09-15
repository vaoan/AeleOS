# Rule 31: A SKIPPED test reports green, and a suite that skips most of itself when a secret is absent is the easiest way in this repository to believe work is verified when it is not.

31. **A SKIPPED test reports green, and a suite that skips most of itself when
    a secret is absent is the easiest way in this repository to believe work is
    verified when it is not.** `pnpm test:e2e` on a shell that has not sourced
    `.secrets` runs 48 of 136 cases and prints `48 passed` — no failures, no
    summary line anybody reads as a warning, and every suite that needs a
    Clerk identity quietly stood down by `global-setup.ts`. That skip is
    correct and must stay: a fork has no secrets and demanding them would turn
    a clean run into a hard failure. What is not correct is reading the result
    as a pass. Three shipped faults on one branch were invisible to every
    local run for exactly this reason, and CI would have caught all three —
    `e2e` is a required check and it HAS the secrets — so the cost was paid at
    the point where it is most expensive to diagnose rather than avoided.

    The habit: **before believing a browser run, check how many cases it
    skipped.** `set -a; . ./.secrets; set +a` in the same invocation is what
    makes the suite whole, and the number to compare against is the case count,
    not the word "passed". The same shape is worth suspecting anywhere a
    `test.skip` is conditioned on the environment rather than on the code.
