# Rule 30: A comment describing what ANOTHER file does is a claim nothing checks, and it shipped two broken headline features on one branch.

30. **A comment describing what ANOTHER file does is a claim nothing checks,
    and it shipped two broken headline features on one branch.**
    `blocks.tsx` says three separate times that "the route asks the shell for a
    full-width `main`"; `page-shell.tsx` documents `COLUMN.full` as existing
    for exactly that; the prop's type admits it — and **no route ever passed
    it.** Both public pages asked for `"wide"`, so every page was laid inside a
    centred, padded `max-w-7xl` column, and three things were wrong at once: a
    second gutter inside the page's own (16px each side, which moved the
    container-query width at which a three-place section stops collapsing and
    reddened `weighted-places.spec.ts` on a viewport its own header had
    MEASURED), the two widest of the six measures silently capped at 80rem so
    two stops a person can pick did nothing, and a `bleed` section — this
    branch's own headline — unable to reach either edge.

    **Every unit test stayed green through all of it**, because they render
    `PublicBlocks` and assert `MEASURE_CLASS` as class STRINGS. The class was
    always right; the box it was laid in was not. This is rule 18 with the
    tense removed — `check:docs` compares a symbol against its own code, and
    none of those comments was about its own symbol — and it is the repository's
    own "a mocked dependency hides its own setup requirements", the suites that
    mocked the shell away being the ones that could not have caught it. The
    giveaway is a comment whose subject is a different file, and the check is
    one grep: **does the caller it describes exist?** `COLUMN.full` had no
    caller and no test mentioned it either, which is the same fact twice.

    **The same branch shipped the same shape one layer down.** `PAGE_MEASURES`
    gained six stops in TypeScript while `set_actor_theme`'s key allowlist
    never heard of `measure` — and that allowlist ends in
    `raise exception 'unknown theme key %'`, so picking a width did not merely
    fail to persist: it made the WHOLE theme save throw, every colour beside it
    included. `block-limits-match-migration.test.ts` exists to stop exactly
    this for `mode` and `kind`, and a seventh closed vocabulary was added
    beside it without being pinned to the SQL. **A vocabulary written down in
    two languages needs the test that says so in the same change**, and the
    cheap version is a regex over the migration — not because a regex is
    elegant but because nothing else in the build can see across the two.

    **The theme half of this is closed now (2026-08-27).** `PAGE_MEASURES`,
    `PAGE_FONTS` and `PAGE_SPACINGS` are compared against `set_actor_theme`'s
    own allowlist in `block-limits-match-migration.test.ts`, so the exact
    failure above — a seventh closed vocabulary added beside the pinned ones
    without being pinned itself — now reddens. Sabotaging the allowlist to
    forget one face reddens exactly that row. The block-level vocabularies were
    already pinned; the page-level ones were the gap this rule named and nobody
    had filled.

    A trap came with writing it, and it is the one this file already warns
    about two paragraphs down: the pattern was written as a plain template
    literal, so `[\s\S]` collapsed to `[sS]`, matched nothing, and would have
    passed forever. It was caught only because the file's convention is to
    assert the regex matched BEFORE comparing anything. Use `String.raw`.

    What found both was one browser test that seeded a REAL page through the
    product's own RPC and then measured boxes. Neither fault was reachable from
    any suite that mocked the shell or compared a class name, and the second
    was not reachable from any suite at all that did not write to a database.
