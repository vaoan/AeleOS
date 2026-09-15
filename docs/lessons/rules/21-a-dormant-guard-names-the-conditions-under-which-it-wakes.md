# Rule 21: A dormant guard names the conditions under which it wakes, and somebody has to READ them when that condition arrives.

21. **A dormant guard names the conditions under which it wakes, and somebody
    has to READ them when that condition arrives.** The dial-latency half of
    `personalised-page-cost.spec.ts` was stood down with an exact note saying
    phase 3 would restore it, what else would have to move (nothing), and how
    to judge the result. Phase 3 was then built and merged and nobody opened
    the file; three of the note's stated reasons had gone false meanwhile, and
    it took a review to find it. This is not the "a sentence crediting a guard
    is not the guard" failure — the note was excellent and everything it said
    was checkable. What was missing was the step that reads it, so the
    obligation belongs to the phase rather than to the note: **when a phase
    closes, grep the suites for its own name.** A skip whose restore condition
    has arrived is a check that has quietly stopped existing, and it looks
    exactly like a check that is passing.
