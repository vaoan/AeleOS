# Rule 29: A SABOTAGE is a fixture too, and a green restore afterwards is indistinguishable from a real verification.

29. **A SABOTAGE is a fixture too, and a green restore afterwards is
    indistinguishable from a real verification.** Rule 27 is about a fixture
    that cannot tell a right answer from a wrong one; this is the same failure
    landing on the step that was supposed to prove the fixture works. "Break it
    and watch it go red" is vacuous when the break you chose lands where the
    watched case cannot see it — and the trap is that the sequence looks
    identical to a successful one: you break, you run, you restore, everything
    is green, and you have learned nothing. The weighted-places branch hit this
    class **seven times in eight tasks**, three of them on sabotage steps
    rather than on test fixtures, which is what makes it a rule rather than an
    anecdote. All measured:

    - `<>` changed to `<` on a length check did not redden anything, because
      both agree on "too short" and diverge only on "too long", and every
      fixture was short.
    - Removing a class's `@lg:` prefix did not redden the "collapses to one
      track" case — and the prediction had been that the rule would then apply
      at EVERY width. It applies at no width: the unprefixed arbitrary-value
      class loses the cascade to `grid-cols-1`, so the grid collapsed
      everywhere and the collapse case passed trivially while three other cases
      reddened.
    - Lowering that threshold instead (`@lg:` → `@xs:`) did not redden it
      either. `@xs` is 20rem of CONTAINER, and the phone fixture's container is
      about 288px once page padding is priced in, so even the too-eager
      threshold leaves 320px collapsed.
    - A brief's order check selected `h3` elements where `PlainLeaf` renders a
      `<span>`. It would have compared `[]` to `[]` and passed forever.
    - A pad fixture `[1, 3, 1]` widened to five gives `[1, 3, 1, 1, 1]` whether
      the code pads with the constant `1` or with the LAST SHARE — because the
      last share is itself `1`. Rewritten to `[1, 3, 2]`, the pad-with-last-
      share sabotage reddens exactly.
    - Two more were caught before they were written, by choosing weights that
      are not a palindrome (`[1, 3, 1]` reversed is itself, so a renderer that
      reverses the array passes every test built on it) and by making a
      truncation (`[2, 5, 4]` → `[2, 5]`) that no preset lookup could have
      produced.

    The diagnostic is the same one and it costs nothing: **name the wrong
    behaviour you are excluding, and ask whether this fixture — or this
    sabotage — could tell it from the right one.** Where the answer is no and
    nothing at that level can discriminate, say so rather than writing
    something that looks like it does. That was the right answer twice here:
    the collapse case's own sabotage was reported as not discriminating rather
    than quietly counted, and the guard that actually pins the threshold was
    found a level down, in unit assertions that compare the class string
    verbatim.
