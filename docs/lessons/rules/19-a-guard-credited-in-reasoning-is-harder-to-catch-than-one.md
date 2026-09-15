# Rule 19: A guard credited in REASONING is harder to catch than one credited in a comment, because there is nothing to read.

19. **A guard credited in REASONING is harder to catch than one credited in a
    comment, because there is nothing to read.** This file already says a
    sentence crediting a guard is not the guard. The new shape is a report or a
    review arguing "axe covers this" about `heading-order` and
    `scope-attr-valid` — both `best-practice` in `axe-core@4.13.0`, and
    `a11y.spec.ts` runs `wcag2a/2aa/21a/21aa` only, so neither ever fires. No
    file contained a false claim; the false claim was in the argument for why
    no file needed one. Settle it by reading `getRules()` out of the installed
    version rather than by recalling which tag a rule carries. And the naive
    fix is worse than the gap: `AxeBuilder` cannot mix `withTags` and
    `withRules`, so adding them means adopting the whole `best-practice`
    family — which would flag `empty-table-header`, a blank `<th>` beside a
    written value that `TableLeaf` renders **on purpose**. That is the second
    time "just turn the rule on" would have broken something deliberate; the
    first was `unicorn/prefer-string-raw` rewriting a middleware matcher Next
    reads statically.
