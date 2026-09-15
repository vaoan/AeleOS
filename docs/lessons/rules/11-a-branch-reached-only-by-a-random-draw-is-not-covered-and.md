# Rule 11: A branch reached only by a random draw is not covered, and the coverage number lies about it at a low rate.

11. **A branch reached only by a random draw is not covered, and the coverage
    number lies about it at a low rate.** `embed-providers.ts`'s Mastodon
    resolver had no named case reaching the FALSE arm of its `&&` — every
    hand-written reject returned a line earlier, and the property test's own
    generator produced only valid pairs. The one thing that ever made it false
    was the unseeded hostile property _happening_ to draw a failing pair, so
    about one run in 42 came back `99.84% (654/655)` on a check that requires
    100, and the same shape sat unnoticed in the Twitch resolver beside it.
    Two things kept it invisible for weeks: the miss is rare enough to read as
    infrastructure noise rather than as a defect, and `test:coverage` is
    configured for `text-summary`, which reports the percentage and **never
    names the line**. So the diagnostic is worth remembering on its own —
    `--coverage.reporter=text` names it. **It finds the uncovered line and
    cannot confirm a clean file**, which is the half of the advice that was
    missing: measured 2026-08-19, `text` omits a fully-covered file from its
    table ENTIRELY — `block-tracks.ts` sat at 9/9 statements, 6/6 branches and
    3/3 functions in `coverage-final.json` and appeared nowhere in the printed
    table, and `--coverage.skipFull=false` did not bring it back. So absence
    from that table means "clean" or "not instrumented" and the reporter will
    not say which. Read `coverage-final.json` when the question is whether a
    file is covered, and use `text` when the question is which line is not.
    The rule generalises past coverage,
    because the shape recurs wherever a property test sits beside named cases:
    a property test states a claim about ALL inputs; it does not stand in for
    a case about ONE. If a branch is only entered when a generator happens to
    produce the right input, that branch is untested and the suite is telling
    you otherwise. The check that settles it is the suite run with the
    property files excluded: everything must still be at 100%.
