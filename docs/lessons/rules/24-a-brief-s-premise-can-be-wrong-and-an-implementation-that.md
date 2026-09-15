# Rule 24: A brief's premise can be wrong, and an implementation that says so is doing the job rather than refusing it.

24. **A brief's premise can be wrong, and an implementation that says so is
    doing the job rather than refusing it.** Twice in one phase. A plan
    demanded `children.length === spaces` on a reading of "spaces" as a total,
    which made a fifty-picture gallery unrepresentable; the implementer hit the
    consequence and asked about the cause. And the editor brief asked what
    happens to a displaced occupant when a shape narrows — a question with no
    answer, because a width is not a capacity and nothing is displaced. Both
    were mine. The failure mode to guard against is the opposite one, an agent
    implementing an impossible instruction and writing tests that assert it, so
    say plainly which part of the instruction does not apply and why, and carry
    on. And note what the second cost when it was half-fixed: three places in
    the plan still stated the old rule after the constraint above them had been
    corrected. **A document that contradicts itself is worse than one that is
    simply wrong**, because whichever half a reader reaches first is the one
    they follow.
