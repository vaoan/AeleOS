# Rule 20: An agent that sabotages live state must restore it in the same run, and a session limit does not care.

20. **An agent that sabotages live state must restore it in the same run, and a
    session limit does not care.** One died mid-sabotage with its probe still
    on the live database — and worse, it had MOVED the probe from the end of a
    column comment to the front before dying, so the containment check somebody
    would reach for (`live.startsWith(file)`) answered false and the obvious
    "is the suffix still there" check would not have found it. Restoring meant
    executing the `comment on column` statement verbatim out of `0009` rather
    than retyping it, which is the idiom for every hand-applied migration edit
    here. The safer shape is to sabotage a COPY — the shadow database or a
    local stack, and `pnpm test:db` runs here now — and to reserve live probes
    for the one case that genuinely needs them. Where a live probe is
    unavoidable, write down where it is before making it, not after.
