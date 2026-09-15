# Rule 36: A Tailwind class that compiles to NOTHING is indistinguishable, in every test this repository has, from one that works.

36. **A Tailwind class that compiles to NOTHING is indistinguishable, in every
    test this repository has, from one that works.** `image_fit` was written as
    `object-(--img-fit)`, which reads exactly like the token utilities beside it
    — `bg-(--menu)`, `text-(--muted)`, `border-(--edge)` — and emits no CSS at
    all: the `(--var)` shorthand resolves against a utility's OWN namespace, and
    `object-`'s is `object-position`, not `object-fit`. Measured by compiling
    the candidate through the installed Tailwind directly, which is the cheap
    diagnostic and the one to reach for: `object-(--img-fit)` produced an empty
    rule set where `[object-fit:var(--img-fit)]` produced the property.

    **Every unit test was green and every one of them had to be.** They render
    the component and assert CLASS STRINGS, and the class string was always
    precisely what was intended — so the suite could confirm what the class is
    CALLED and had no way to ask what it MEANS. That is root rule 30 with the
    subject moved one step in: not a comment about another file, but a claim
    about another system's behaviour, checked by a test that never consults
    that system. The stylesheet is a dependency like any other, and this is
    "a mocked dependency hides its own setup requirements" with the mock being
    the assumption that a plausible class name resolves.

    Two things settle it and nothing cheaper does. **Compile the candidate**
    when a utility is being written for the first time in an unfamiliar shape;
    and where the class carries a feature rather than a decoration, **assert
    the COMPUTED property in a browser** — `blocks-render.spec.ts`'s fit case
    does, with a control block asserting that absence is still the crop every
    stored page has, because a stylesheet where both resolved the same way
    would otherwise pass. Restoring the shorthand reddens it and reddens
    nothing else.
