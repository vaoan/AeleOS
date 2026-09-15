# Rule 42: A CHECKER IS ONLY AS WIDE AS ITS GLOB, and the prose nobody checks is the prose in somebody else's language.

42. **A CHECKER IS ONLY AS WIDE AS ITS GLOB, and the prose nobody checks is
    the prose in somebody else's language.** `check:tools` runs cspell over
    `**/*.{ts,tsx,md,json}`. `scripts/pastiche-references.mjs` is `.mjs`, and
    it holds the bilingual strings sixteen seeded pages render — so the
    Spanish an author reads is opened by no tool in the pipeline. Pointed at
    that file by hand, cspell reports **86** unknown words; in CI it reports
    nothing, because it never sees it. A clean `check:tools` is not evidence
    about a file its glob excludes.

    **The half worth carrying is what filled the gap instead.** A reviewer
    flagged `GeoCities fueron millones de páginas personales` as a plural verb
    on a singular subject. It was overruled on a real rule — Spanish copulas
    may agree with a plural PREDICATE, `Mi única alegría son sus visitas` —
    and left alone. The repository's owner, who speaks the language, read it
    as wrong on sight. **A grammar rule that permits a form is not a
    judgement that it reads well**, and where no checker runs, a native
    reader is the check: escalate rather than adjudicate.

    **The two rulings this rule and rule 41 make together were both used the
    same day, on the same commit (2026-09-04).** `Carrd` — the product this
    branch's own design is named after, recurring in TSDoc, a test file's own
    header comment and the feature's living documentation — earned a
    dictionary entry under rule 41's "a word the CODE needs" standard; a
    stray negated-adjective coinage in a sibling phase plan's prose, used
    once and only there to describe a control nothing had audited yet, was
    reworded instead, under the same rule's other half. And `angaritamaldonado` — the machine-specific home-directory
    basename baked into several already-committed `cd /Users/...` example
    commands across this feature's seven phase plans — went in beside the
    existing `Heiner`/`Angarita` entries for the same person, the identical
    reasoning that already justified `vaoan` and `rmellis` sitting in this
    same list: a real, recurring token rather than a coinage.

    **The same split recurred on the palette drag-to-add feature's Task 4
    (2026-09-05), and CI is what caught it — `conformance` failed on
    `cspell "**/*.{ts,tsx,md,json}"` over two words neither the implementer
    nor the two review rounds before it had run past a spell-checker.**
    `unaccommodated` earned a dictionary entry: it names the canvas's own
    missing accommodation padding in `block-editor.tsx`'s own TSDoc and an
    inline comment beside it, twice in code plus once in this feature's
    CLAUDE.md describing the same mechanism — a real, recurring word in code
    rather than a one-off. The other flagged word — the negated adjective
    for "cannot take focus" — appeared exactly once, only in that CLAUDE.md's
    own prose, with no matching TSDoc anywhere in the diff, and was reworded
    to that plain phrase instead of joining the dictionary.
