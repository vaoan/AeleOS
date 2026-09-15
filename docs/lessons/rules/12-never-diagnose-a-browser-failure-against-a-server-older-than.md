# Rule 12: Never diagnose a browser failure against a server older than the code.

12. **Never diagnose a browser failure against a server older than the code.**
    A `next dev` already running when the message catalogues change keeps
    serving the modules it started with, forever. New keys then render as raw
    keys, and because a `select` is as wide as its longest option,
    `fursonas.types.progress` at 155px where `Progreso` is eight characters
    overflows the 320px editor by a real 4px — so `responsive.spec.ts` fails
    honestly, about a page that genuinely was broken, for a reason that is not
    in any diff. **What makes it dangerous rather than annoying is that it
    disguises itself as a bad commit and survives the check you would use to
    rule that out.** An agent stashed its work, watched the failure persist,
    and correctly concluded "pre-existing" — because stashing does not restart
    a server. It cost a full bisect across twenty commits. Restart after
    touching the catalogues, and treat a server that predates the code as no
    evidence at all.
