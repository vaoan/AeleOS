# A window is corners chosen one at a time (2026-08-29).

- **A window is corners chosen one at a time (2026-08-29).** `corners` and
  `heading_corners` name which of a block's — and its bar's — corners are
  rounded, so a bar rounded across its top over content rounded across its foot
  draws the window shape a single `radius` could not. `radius` says how MUCH
  and these say WHERE.

  **The XP era look wears it**, which closes gap 10 of the pastiche findings —
  a bar rounded on top over a body rounded at its foot, join straight. That gap
  had been open since the era looks were built, and it closed **from the other
  end**: not by a look reaching for a key, but by somebody looking at the pages
  and naming what was missing.

  **Absence still emits nothing**, which is what keeps every stored page
  byte-identical.

  Two things it cost that generalise past this feature:

  - **jsdom dispatches a programmatic click to a DISABLED input where a browser
    would not.** The picker refuses to untick its last corner, and the
    `disabled` attribute alone made that a property of one control rather than
    an invariant about the value. The handler refuses it too — which is also
    what makes the guard reachable in a unit test at all.
  - **A CUSTOM PROPERTY substitutes its `var()`s where it is DECLARED, not
    where it is read.** Defaulting the corner tokens at `:root` to
    `var(--radius-xl)` looks like "the radius each card already had" and is
    not: the substitution happens at `:root`, freezing that scope's
    `--skin-round`, so every nested skin lost its own corner. And the fallback
    cannot reference `--radius-xl` either, because `@theme inline` makes a
    utility INLINE the token's expression rather than reference it — which is
    precisely why per-skin radius worked before. Both faults are invisible from
    a class string and were caught by a browser reading a computed style, with
    a full unit suite green at 100% throughout.
  - **A control can reach the wrong ELEMENT and every unit test still pass.**
    The first version wrote `border-radius` on the styled element — but a
    block's style bag lands on a WRAPPER, and the card that draws the corner is
    nested inside it. The class string was always right; the box it was written
    on drew nothing. Root rule 30's shape, and the same fault `--img-fit`
    already cost once. Only a computed style in a browser can see it.
  - **A `sed` sabotage that fails to apply looks exactly like a successful
    verification.** One here matched nothing, the suite stayed green, and the
    pin appeared proven. Rule 29 with the mutation step itself as the fixture:
    check the substitution LANDED before believing the run.
