# Rule 32: A test's cost is a property of the SUITE it lives in, and a flake there is fixed by moving it, never by widening its budget.

32. **A test's cost is a property of the SUITE it lives in, and a flake there
    is fixed by moving it, never by widening its budget.** `source-bytes.test.ts`
    reads every text file in the repository — a gate on the repository, not a
    unit test of the hub — and it sat in `apps/hub/tests/`, where 128 jsdom
    worker files compete for one disk. It timed out once at 8618ms against
    vitest's 5000ms default, on the first run after a `git reset --hard` and a
    `pnpm install`: the one moment none of those files is in the OS cache, and
    the condition **every CI run starts in**. Measured afterwards it reads 67ms
    alone, 149ms with the Vite cache deleted, and 265ms under three sustained
    disk-load generators — so once a machine has run it the failure cannot be
    reproduced on demand, and that single observation is the whole of the
    evidence. Say so rather than implying a before-and-after nobody took.

    The tempting fix is a bigger timeout and it is wrong twice over: the number
    was never the fault, and a budget widened until a flake stops showing is
    rule 14's ceiling that lies about which runs are real. It moved to
    `tests/tools/` first — node environment, no jsdom — and then out of the test
    runner entirely: it is `scripts/check-source-bytes.mjs` now, a plain gate in
    `check:tools` beside `check-contrast`, `check-doc-freshness` and
    `check-schema-drift`, with `tests/tools/source-bytes.test.ts` covering its
    exported functions against fixtures. `check:tools` runs inside the required
    `conformance` job throughout, so nothing about the gating ever changed.

    **A warm-up phase was considered for this and refused, and the reason
    generalises past caches.** Reading the files once so the timed body hits a
    warm cache does not remove the cost, it moves it outside the assertion — and
    "the warm pass leaves the real pass fast enough" is a claim about wall-clock
    that only a cold run can settle. That is the same unmeasured claim in a
    different place, for twice the IO. The distinction worth keeping: **a
    failure mode eliminated by construction needs no observation, and a
    performance claim always does.** Bulk IO in a plain script is the first;
    bulk IO in a warmed test is the second wearing the first's clothes. Reach
    for the runner when you are testing logic and for a script when you are
    gating the repository — the three siblings above were already that shape and
    this was the odd one out.

    **The other half was a hand-maintained skip list, and that one was a
    correctness bug rather than a speed one.** The crawl carried eight directory
    names to skip, which is `.gitignore` restated by hand and free to drift from
    it. Measured, it read **204 files git does not list** — the local Claude
    settings and every `.superpowers/sdd/` brief and report — none of which
    exists on a runner and none of which can reach `main`. So the
    guard's file set was **machine-dependent** and a third of what it read was
    nobody's source. `git ls-files --cached --others --exclude-standard` is the
    set that can be committed, on every machine, with nothing to maintain.
    `--others` is what keeps a file written a moment ago and not yet staged
    inside the guard, which is exactly when a mangled escape is still catchable;
    `--cached` is why the list needs an existence filter, because a deletion
    that is not yet staged is a path git still reports with no bytes behind it.

    It narrows the guard — an ignored file is no longer read — so that hole is a
    **passing case** rather than a sentence, and the fixture is BUILT: the suite
    inits a throwaway repository holding one file of every kind the filter
    decides about. A checkout with no ignored text file in it would pass against
    a crawl and against git alike, which is rule 27 exactly.

    **That fixture then found a bug the real-tree assertion could not, and the
    shape is worth carrying.** `textFiles` returns repository-relative paths and
    its existence filter called `existsSync(path)` — resolved against the
    PROCESS, not the repository it was asked about. Invisible while the two
    agree, which they always did when the only caller was the repo's own root,
    and it drops every path the moment they do not. The instructive part is what
    that did to the cases beside it: with the list filtered to empty, the three
    negative assertions — ignores an ignored file, ignores a non-text extension,
    ignores a staged-then-deleted path — all went GREEN, vacuously. **A negative
    assertion passes for free when enumeration returns nothing**, so a suite of
    them needs a positive case proving the enumeration works at all, or it is
    rule 23 with better manners: the assertions ran and could not have failed.

    And the fix sprang the very trap the file exists for, which is worth knowing
    about the trap's reach: an escape in the new test collapsed into a literal
    newline on the way to disk, and what caught it was the parser, not the guard
    — a control character inside a string literal is a syntax error, whereas the
    NUL that started all this sat in a JSX attribute where nothing objects.
