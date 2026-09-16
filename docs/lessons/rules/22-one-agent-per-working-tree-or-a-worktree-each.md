# Rule 22: One agent per working tree, or a worktree each.

22. **One agent per working tree, or a worktree each.** Two were writing to this
    one at once — the second told to expect files to move under it rather than
    being made to wait — and a whole-tree `pnpm lint` came back red on four
    errors belonging to the other, which is precisely the state in which
    somebody "fixes" work that is not theirs. Nothing was lost only because the
    file sets happened to be nearly disjoint. The overlap rule that was being
    used, stage only your own files by name, protects the INDEX and protects
    nothing whatever about running a gate against a tree somebody else is
    editing. The cost of the rule is occasional serialisation; the cost of not
    having it is a red gate nobody owns.
