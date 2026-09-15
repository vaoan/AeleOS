# Rule 34: A SABOTAGE that restores with `git` restores to the last COMMIT, which is not where you were.

34. **A SABOTAGE that restores with `git` restores to the last COMMIT, which is
    not where you were.** "Break it, run it, put it back" is the discipline this
    file is built on, and the putting-back has a trap: a `git checkout -- <file>`
    is the obvious way to undo a mutation, and it silently discards every
    uncommitted change in that file — including the work the sabotage was
    supposed to be verifying. It happened here. A hide-controls button was
    written, a sabotage script mutated the same file and "restored" it with
    `git checkout --`, and the button was gone. Nothing failed: the next run
    reported the case could not find its control, which reads exactly like a
    test that was written wrong.

    **Copy the file before the edit and copy it back**, and put the restore in a
    shell `trap` so a crash cannot leave the tree sabotaged — rule 20's
    requirement, met by a mechanism that cannot also delete your work.

    The general form is worth more than the git detail: **a restore step that
    is not the exact inverse of the mutation step is a second mutation.**
    `git checkout` inverts every change since the last commit, not the one you
    just made, and the difference is invisible in a green run.
