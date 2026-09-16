# Rule 39: A containment boundary enumerated BY HAND is only as good as its list, and nothing static can see the list is short.

39. **A containment boundary enumerated BY HAND is only as good as its list,
    and nothing static can see the list is short.** `CHROME_SCOPE` is the
    editor's promise that a control stays AeleOS's whatever the author does to
    their page, and it keeps that promise by re-declaring properties on the
    island. `color` was on the list because it leaked once; `font-family`
    because it leaked once. **`font-size` was never on it**, and a page's
    `spacing` writes one — so choosing `compact` shrank the workbench: 45 of 77
    marked controls, every island 16px to 13px, and the select that set it
    shrinking under the pointer. Nothing failed. No type, no linter and no unit
    test knows which inheritable properties a theme has learned to write, so
    the boundary silently narrows every time a theme gains a key and nobody
    thinks of the island.

    **The second leak is the one that generalises furthest, because the
    property WAS restated.** The island said `font-family: var(--font-sans)`,
    and the author's typeface writes `--font-sans` — so the declaration was
    present, correct, and resolved somebody else's value. **Restating a
    declaration is not enough when the declaration reads a token somebody else
    can write**; the token has to be restated too, or captured where they
    cannot reach it. This repo already knew the shape from `--surface` and
    `--bar` and had written it down for colours; it recurred on a property
    because the note named the two tokens rather than the class of hazard.

    Two smaller things fell out, both measured rather than reasoned. **A
    reset that must lose to a local override should read a TOKEN rather than
    win a cascade fight** — `font-size: var(--chrome-text, 1rem)` leaves an
    island's own `--chrome-text` free to differ, where a bare `1rem` in an
    unlayered rule beat a `text-sm` on the same element and silently resized a
    button. And **the guard for a "nothing changed" claim is the assertion that
    something DID** — `controls-stay-stable.spec.ts` asserts the author's page
    moved in the same breath as asserting no control did, because a fixture
    where the theme never applied reports "nothing changed" too. That half is
    proved capable of failing by choosing a value the control already holds.
