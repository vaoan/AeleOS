# Rule 16: A summary wrong in the safe-sounding direction is worse than one that is simply wrong, because it closes the question.

16. **A summary wrong in the safe-sounding direction is worse than one that is
    simply wrong, because it closes the question.** A report said "the editor
    cannot save at all", which sounded like a limitation and read as settled.
    The truth was that the editor could not save a page WITH sections and saved
    perfectly well when it believed there were none — which, after the model
    changed under it, was every page. So opening any page and pressing Save
    erased it: the parse failed, the read answered `[]`, the mutation sent an
    empty tree, the RPC accepted it and reported success. Nobody looked,
    because the sentence had already told them nothing could be written. When
    writing down what a broken thing cannot do, state the failing input and the
    observed behaviour, not the conclusion — "it refuses a tree" and "it cannot
    save" are not the same claim, and only one of them is checkable.
