# Rule 28: Anything that ships file CONTENT to a server, rather than committing it, is exposed to the checkout's line endings — and in this repo `.gitattributes` closed that door, which is why this rule no longer tells you to convert anything.

28. **Anything that ships file CONTENT to a server, rather than committing it,
    is exposed to the checkout's line endings — and in this repo
    `.gitattributes` closed that door, which is why this rule no longer tells
    you to convert anything.** The fault it was written for: `supabase db reset
--linked`, `db push` and any hand-applied `create or replace` send the
    files as they sit on disk, so a CRLF working tree puts a `\r` on every line
    of `prosrc` that the checked-out file does not have. `migra` compares
    function SOURCE, so all ten multi-line functions in `0009` were reported as
    drift at once, including four nobody had touched. **And every local check
    agreed it was fine** — `check:schema-drift` builds its shadow from the same
    files, so both sides matched and it printed "the live database matches",
    while CI checked out LF and was the only place the two sides differed.

    **The mechanism is gone and the instruction with it. Measured on
    2026-08-19:** `core.autocrlf` is still `true`, but `.gitattributes` —
    `bf8cd29`, 2026-07-29, long since on `main` — sets `* text=auto eol=lf` and
    `*.sql text eol=lf`, and **gitattributes beats `core.autocrlf`**.
    `0009_actor_profiles.sql` holds 0 CRLF pairs and 1056 bare LF on disk. So
    the conversion this rule used to mandate is a no-op, and its corollary —
    that a local drift green "is not evidence about CI" — is no longer true for
    line endings. This paragraph replaces the old instruction rather than
    softening it, because whoever fixes a thing deletes the note saying it is
    broken. What is still owed is the general form above: a NEW file type, a
    checkout on a machine without these attributes, or a paste through an
    editor that adds its own endings all reopen it, and the way to check is to
    count the bytes rather than to trust a setting.

    **And it was reopened, on 2026-08-19, by exactly that third route.** An
    agent editing SQL with Python's `pathlib.Path.write_text` re-wrote whole
    files as CRLF: that call applies the platform's newline translation on
    WRITE, so reading a pure-LF file and writing it back unchanged converts
    every line on Windows. Passing `newline="
"` is what stops it, measured
    rather than assumed. Nothing else said so — `git status` showed only the
    lines actually edited, because `.gitattributes` normalises on the way into
    the index, and the committed blobs were clean throughout.

    What it broke is the one thing that reads the WORKING TREE rather than the
    index: `supabase db reset` built the local and shadow databases from the
    CRLF file, so their `prosrc` carried a carriage return and the live
    project's did not. `check:schema-drift` then reported drift in
    **`public_person`, a function the branch never touched** — which reads as
    the live project having been tampered with, and sends you looking in the
    wrong place entirely. The branch's own function was the one that did NOT
    drift, because the apply script normalised before sending.

    Three things to take from it. **A drift report naming a function you did
    not touch is a line-endings report until proven otherwise** — check that
    before anything else, and check it by comparing the live body against the
    LOCAL database rather than against the file, since the local one is what
    was built from the tree. **A `git stash` round-trip silently launders the
    file back to LF**, which is a trap of its own: the evidence disappears the
    moment you try the obvious isolation step, and the next run comes back
    green for a reason unrelated to what you changed. And **count the bytes of
    any file a script has written before committing it** — the same session
    later committed a `CLAUDE.md` with every newline STRIPPED, 90KB on one
    line, and neither the pre-commit hook nor any check noticed. Prose has no
    compiler; only counting catches this.

    **The diagnostic lesson is the part that never expires.** A script written
    to answer "does live match the file" compared `prosrc` against the file and
    reported `same` for all six functions it checked — because it normalised
    line endings first, having been written by somebody who assumed whitespace
    was noise. **A comparison that normalises cannot see the fault it is
    looking for**, and this one normalised away exactly the byte in question.
    Rule 23's cousin: the assertion ran, it just could not fail.
