# Phase 0 — Clerk setup (human steps)

These steps cannot be automated. Do them once, then the validation suite runs
from `.secrets`.

## 1. Clerk application

1. Sign up at https://clerk.com on the **free** plan.
2. Create an application named `Furry Colombia`.
3. Check the social connections — **a new development instance arrives with some
   already on**. Ours came up with Google, Discord _and_ X enabled. The free plan
   allows three, so all three slots were spent before anyone chose anything.
4. Turn **X** off unless you want it. Turn **password** off: the design is
   social-login-first and a password identity is precisely the thing that makes
   a later migration painful.

None of this is reachable from the Backend API — `/social_connections`,
`/oauth_providers`, `/instance/social_connections`, `/instance/auth_config` and
`/instance/settings` all return 404. It is dashboard-only:

- **Configure → SSO Connections** → toggle providers
- **Configure → Email, Phone, Username** → **Password** → off

To read the current state without the dashboard, ask the frontend API:

```bash
curl -s "https://$CLERK_DOMAIN/v1/environment?__clerk_api_version=2025-04-10&_clerk_js_version=5"
```

`user_settings.social` lists the enabled providers; `user_settings.attributes`
carries `password`, `username` and the rest.

### Development connectors are on Clerk's shared credentials

The connectors work with no OAuth setup because a development instance borrows
Clerk's own OAuth apps. Start a sign-in and the tell is in the redirect:

```
client_id:    787459168867-….apps.googleusercontent.com   ← Clerk's, not ours
redirect_uri: https://clerk.shared.lcl.dev/v1/oauth_callback
```

**Shared credentials do not carry to a production instance.** Standing up
`id.furrycolombia.com` means registering our own OAuth app with each provider —
Google Cloud Console (an OAuth 2.0 Client ID; free, no billing account needed)
and the Discord Developer Portal (free). Both are $0, so the budget holds, but
it is real setup rather than a toggle, and the callback URL changes from
`clerk.shared.lcl.dev` to the production Clerk domain. Plan it into Phase 3
rather than meeting it during a cutover.

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

For a **local** run that is all you need: the Supabase URL, anon key,
service-role key, DB URL and JWT secret are read from `supabase status` at run
time by the test setups — they are generated locally and are not secrets.

The sync also carries four Supabase values (`SUPABASE_ACCESS_TOKEN`,
`SUPABASE_PROJECT_REF`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`) used by the
hosted-project run in step 7. Only the access token is genuinely secret — the
rest are public identifiers kept together so one sync restores a whole machine.

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

## 7. Run the same validation against the hosted project

The local stack proves the mechanism. This proves the product — Supabase's
hosted Auth server fetching Clerk's JWKS over the internet and mapping the token
to the `authenticated` Postgres role.

```bash
AELEOS_DB_PASSWORD=… pnpm test:idp:cloud
```

Expected: the same 9 passing. No Docker, and the local stack does not need to be
running. The runner resolves the project by ref and **refuses to continue unless
its name is `AeleOS`**, so Libra's project cannot be hit by accident.

Two things caught us out the first time:

- **The direct database host is IPv6-only** on the free plan.
  `db.<ref>.supabase.co` does not resolve over IPv4, so the runner connects
  through the pooler (`aws-0-<region>.pooler.supabase.com:5432`).
- **Activating the Supabase integration in Clerk configures the Supabase side
  too.** Clerk registers itself on the project as a third-party auth provider —
  visible via `GET /v1/projects/<ref>/config/auth/third-party-auth` as
  `type: clerk-development`. There is no separate dashboard step in Supabase.

The project needs the schema before the suite will pass:

```bash
pnpm exec supabase db push --db-url "$AELEOS_DB_URL"
```

Build `AELEOS_DB_URL` from the pooler parts rather than the direct host — user
`postgres.<ref>`, host `aws-0-<region>.pooler.supabase.com`, port `5432`,
database `postgres`. Percent-encode the password; ours contains a `/`.

## Note on hosting

Supabase's free plan allows **two** active projects. As of 2026-08-09, verified
against the management API, both are in use:

| Project     | Ref                    | What it is                                            |
| ----------- | ---------------------- | ----------------------------------------------------- |
| `CandyShop` | `olafyajipvsltohagiah` | Libra's production project (still under its old name) |
| `AeleOS`    | `vmmpssydbrtkgvrlkijh` | Phase 0 validation; carries the actor-model schema    |

**Puck has no Supabase project** — earlier revisions of this doc claimed Puck
held one of the two slots. It never did.
