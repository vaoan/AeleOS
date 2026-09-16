# Rule 27: A FIXTURE can make a right answer and a wrong one identical, and then the assertion is perfect and proves nothing.

27. **A FIXTURE can make a right answer and a wrong one identical, and then the
    assertion is perfect and proves nothing.** This is the failure that hides
    best, because everything a review looks at is correct: the case reads
    exactly like the behaviour it names, the sabotage is the honest one, and
    the suite stays green through it. The dragging phase sprang it on subject
    after subject. A swap and an insert-and-shift leave the same page when the
    two places are ADJACENT, so the case had to move a block across a place
    rather than beside one. A shift and a swap leave the same page when there
    are only two sections, so the reorder needed a page of three. And a
    write-order guard survived its own removal because the case
    removed a section AFTER the one holding the other half of the exchange,
    where both orders land identically — rewritten to remove the section
    BEFORE it, the same removal reddens.

    The diagnostic is cheap and belongs in the writing rather than the review:
    **name the wrong behaviour you are excluding and ask whether this fixture
    could tell it from the right one.** Two operations, one page, and the
    answer is often no. And where the answer is no and no fixture at that level
    can be built, say so — the dragging suite could not distinguish
    deepest-wins from first-match in a browser at all, because `useDroppable`
    registers children before parents and the first containing candidate simply
    IS the deepest one in that DOM. That was reported rather than added to a
    total, and the discriminating proof was found a level down where the
    candidate order is the test's to make hostile. Rule 23 is the same honesty
    about a different mechanism: there, the assertion never got the chance to
    fail; here, it got the chance and the fixture wasted it.
