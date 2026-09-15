# Rule 25: A premise about the DATA is dated the moment it is written, and `main` moves.

25. **A premise about the DATA is dated the moment it is written, and `main`
    moves.** A plan's migration ruling opened "every page in the database is
    flat-shaped", and every task after it reasoned from that sentence. It had
    been false for about an hour: a pull request merged that morning shipped a
    save boundary writing a shape nobody downstream knew about, so the branch
    read those pages, stripped the key it did not recognise, and answered a
    default — a three-across gallery as one full-width column, for its owner
    and for a stranger, with the next save storing the loss. Nothing failed,
    because a strip is not an error and no test owns the live database. Two
    habits follow, and the second is the one that was missing. **Date a claim
    about stored data and name what would falsify it**, rather than stating it
    as a standing fact. And **re-read what merged to `main` while the branch was
    open**, specifically for writes: a claim about the schema is checked by
    `check:schema-drift`, and a claim about what is IN the rows is checked by
    nobody at all.
