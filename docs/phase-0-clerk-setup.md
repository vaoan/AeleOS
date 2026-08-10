# Phase 0 — Clerk setup (human steps)

These steps cannot be automated. Do them once, then the validation suite runs
from `.secrets`.

## 1. Clerk application

1. Sign up at https://clerk.com on the **free** plan.
2. Create an application named `Furry Colombia`.
3. Enable **Google** and **Discord** social connections. Disable email/password.
   The free plan allows 3 social connections; this uses 2.

## 2. Supabase integration

1. Clerk Dashboard → Supabase integration setup.
2. Select **Activate Supabase integration**.
   This adds the `"role": "authenticated"` claim to session tokens, which
   Supabase requires to assign the Postgres role.
3. Record the **Clerk domain** it reveals.

Do not use the legacy "Supabase JWT template" — deprecated April 2025.

## 3. Local secrets

Copy `.secrets.example` to `.secrets` and fill in the publishable key, secret
key, and Clerk domain. `.secrets` is gitignored.

### Optional: store them once, sync them thereafter

To avoid repeating this by hand on another machine, put the three values in
GitHub repository secrets:

```bash
gh secret set CLERK_PUBLISHABLE_KEY
gh secret set CLERK_SECRET_KEY
gh secret set CLERK_DOMAIN
```

Then `pnpm sync-secrets` regenerates `.secrets` on any checkout: it dispatches
`.github/workflows/sync-secrets.yml` with a one-time passphrase, downloads the
encrypted artifact, and decrypts it locally. It needs an authenticated `gh`
CLI (`gh auth login`).

Those three are the **only** secrets AeleOS has. The Supabase URL, anon key,
service-role key, DB URL and JWT secret are read from `supabase status` at run
time by the test setups — they are generated locally and are not secrets.

`CLERK_SESSION_TOKEN` is never synced; it expires in about 60 seconds. Since a
sync overwrites `.secrets` in full, **sync first, then capture the token** — in
the other order the sync silently discards it.

## 4. Capture a session token

The validation needs a real Clerk-issued JWT. Serve the throwaway capture page:

```bash
set -a; . ./.secrets; set +a
pnpm capture:token
```

Open `http://localhost:5555/capture-clerk-token.html?pk=$CLERK_PUBLISHABLE_KEY`,
sign in with Google or Discord, and paste the printed token into `.secrets` as
`CLERK_SESSION_TOKEN`.

Clerk session tokens are short-lived (about 60 seconds by default), so capture
one immediately before running the validation. A test failing on expiry means
the token went stale — capture a fresh one; it is not a defect.

## 5. Enable the Clerk provider locally

`supabase/config.toml` ships with `[auth.third_party.clerk]` **disabled**, and
that is deliberate. `supabase start` fetches the provider's OpenID discovery
document at boot and aborts if it cannot reach it:

```
LegacyStartInvalidConfigError: Failed to fetch
https://<domain>/.well-known/openid-configuration
```

So committing `enabled = true` would make a real Clerk domain a hard requirement
for starting the stack — breaking `pnpm test:db` in CI and for anyone without
credentials. Instead, flip it locally when you need it:

```toml
[auth.third_party.clerk]
enabled = true
domain = "env(CLERK_DOMAIN)"
```

Leave that edit uncommitted, and revert it when you are done. The stack must be
restarted for the change to apply — editing the file alone does nothing.

## 6. Run the validation

```bash
set -a; . ./.secrets; set +a
pnpm exec supabase stop
pnpm exec supabase start
pnpm test:idp
```

Expected: 9 passing. With `.secrets` absent the suite skips cleanly, which is
why it is never a CI gate.

## Note on hosting

The validation suite runs entirely against the **local** Supabase stack. It
fetches Clerk's real JWKS over the network, so the asymmetric trust being tested
is genuine; what it does not exercise is Cloud dashboard configuration.

Supabase's free plan allows **two** active projects. As of 2026-08-09, verified
against the management API, both are in use:

| Project     | Ref                    | What it is                                            |
| ----------- | ---------------------- | ----------------------------------------------------- |
| `CandyShop` | `olafyajipvsltohagiah` | Libra's production project (still under its old name) |
| `AeleOS`    | `vmmpssydbrtkgvrlkijh` | created 2026-08-09; not used by the test suite        |

**Puck has no Supabase project** — earlier revisions of this doc claimed Puck
held one of the two slots. It never did.
