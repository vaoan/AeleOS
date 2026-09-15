# Rule 43: A completely ABSENT `apps/hub/.env.local` fails silently rather than loudly, and the resulting error is unrecognizable as a config problem.

43. **A completely ABSENT `apps/hub/.env.local` fails silently rather than
    loudly, and the resulting error is unrecognizable as a config problem.**
    `next dev` reads `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` from that file via
    its own dotenv loader; find it missing and `@clerk/nextjs` does not
    refuse to start — it auto-provisions a throwaway "keyless" instance under
    a fresh random `*.clerk.accounts.dev` domain on every boot, writing its
    own debug state to `apps/hub/.clerk/.tmp.stale-*`. A Clerk session token
    minted against the REAL instance (`.secrets`' `CLERK_SECRET_KEY`, which
    every e2e case uses) can never validate against that random instance's
    JWKS, so every signed-in `e2e` case fails on a `kid` mismatch — a signature
    that reads exactly like a Clerk outage or a race between concurrent test
    runs, not like a missing file, and cost real time chasing both wrong
    theories first (2026-09-04).

    The fix was the one-time, per-machine step `.env.example`'s own header
    already names — `cp apps/hub/.env.example apps/hub/.env.local`, then
    paste the four values from `.secrets` — which had simply never been done
    on that machine; `.secrets` being populated says nothing about whether
    this separate, differently-named-keys file exists. `pnpm sync-secrets`
    now creates `apps/hub/.env.local` automatically when it is absent
    (`syncHubEnvLocal` in `scripts/sync-secrets.mjs`), and never touches one
    that already exists — so a deliberate local-Docker-stack override
    (`.env.example`'s own documented alternate path) is never at risk, and a
    fresh clone cannot land in this state at all. The diagnostic habit for
    everyone else: when a signed-in `e2e` case fails on a JWKS/`kid`
    mismatch, check whether `apps/hub/.env.local` exists before suspecting
    Clerk itself or a concurrent run.
