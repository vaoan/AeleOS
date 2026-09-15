# Rule 37: A write path's looseness is usually justified by a CONTROL, and the justification is void the moment a paste box exists.

37. **A write path's looseness is usually justified by a CONTROL, and the
    justification is void the moment a paste box exists.** `themeSchema` — the
    schema the editor's form validates against — is loose on `accent`,
    `cursor`, `backgroundUrl` and the three dials, and its own TSDoc gives the
    reason in two sentences: the colours are `#rrggbb` or null _"and nothing
    else is reachable through a colour input"_, and the dials are loose
    _"since a slider cannot produce anything else"_. Both are true. Both are
    statements about a **user interface** rather than about the data, and
    `canvasColours` is `z.array(z.string())` there with no length bound at
    all — a picker produces a handful, a paste can carry a hundred thousand.

    So an import must use the **READ** path's guards, never the write path's.
    `parseTheme` already existed and was already correct, because it was
    written for a `jsonb` column nobody controls: it normalises every colour,
    drops what is not `#rrggbb`, caps the list, clamps every dial and falls
    back per field. Nothing new had to be written; what had to be noticed was
    which of two functions was the right one.

    The giveaway is mechanical and worth grepping for: **a schema comment
    whose reason names a widget.** "A slider cannot", "nothing else is
    reachable through", "the picker only offers" — each is a guard credited to
    a control, and each becomes false the day a second way in exists. It is
    the repository's own "a mocked dependency hides its own setup
    requirements" one level up, with the thing being assumed upstream being a
    user interface rather than a module.

    Found designing `2026-08-27-page-source-and-sharing-design.md`, before any
    of it was built — which is the cheap way to find it and not the usual one.
