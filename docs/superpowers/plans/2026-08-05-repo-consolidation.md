# Repository Consolidation Implementation Plan

> **For agentic workers:** Most of this plan is human-only — transferring a
> repository, changing production server configuration, and flipping repository
> visibility are dashboard and server actions an agent cannot perform. Human-only
> steps are marked 🧑. The agent-runnable parts are the verification queries and
> the source edits in Task 6. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Renamed 2026-08-07.** The repository formerly at `furrycolombia-sys/candyshop`
> is now **`vaoan/libra`** — a moon-and-scales name matching the platform's
> celestial scheme, chosen because Libra is the merchant's balance. The old slug
> redirects. Historical passages below deliberately keep the name the repository
> had at the time, because rewriting them would make the record of the transfer
> false; forward-looking commands use the new name. The product itself is
> unchanged — it still serves at the `store` subdomain and is still called Store
> in the UI.

**Goal:** Put all three platform repositories under a single owner (`vaoan`), so
that one account has admin on every repo — and so the work is visible on the
profile it is meant to showcase. Achieved without breaking CandyStore's
production deploy path.

**Why:** `candyshop` is owned by the **personal account** `furrycolombia-sys`,
not by `vaoan`. On personal repositories GitHub offers only owner and
collaborator — there is no "admin collaborator" role — so `vaoan` sits at
`permission=write` and **cannot** read or set branch protection, read the
Actions policy, or transfer the repository. `aeleos` and `Puck` are already
under `vaoan`; only `candyshop` is misplaced.

Measured 2026-08-07, because an earlier draft of this plan overstated the gap:

| As `vaoan` (write)                 | Works? |
| ---------------------------------- | ------ |
| `gh secret list`                   | ✅     |
| List environments                  | ✅     |
| Dispatch the sync-secrets workflow | ✅     |
| Read/set branch protection         | ❌     |
| Read the Actions policy            | ❌     |
| Transfer the repository            | ❌     |

Only the last three need the owner, and only the transfer is on this plan's
critical path.

**Approach:** Transfer exactly one repository. `aeleos` and `Puck` do not move.
Then unlock what single ownership makes possible: branch protection on
`candyshop`, and a decision on AeleOS's visibility.

**Tech stack:** GitHub repository transfer, `gh` CLI, GitHub Actions, GHCR
(`ghcr.io`), the CandyStore production server.

## Why not an organisation

An org was considered and rejected. Its headline benefit is admin for more than
one identity — but both accounts are controlled by the same person, so the
permission problem is self-inflicted rather than structural. Against that, an org
removes all three repos from the profile's Repositories tab, which works against
the portfolio goal these repos also serve.

The migration work is **identical either way**: same GHCR namespace change, same
hardcoded URL on the production server, same verification. The org buys no
simplification; it only changes where the repos land.

**Revisit this if a second maintainer appears.** The transfer itself is cheap to
repeat, but the two expensive steps — the GHCR cutover (Task 5) and the
production server edit (Task 6, Step 2) — would be paid twice. If co-maintainers
are likely within the year, do the org instead and skip this plan.

## Global Constraints

- **CandyStore is in production.** Never run anything against its database. The
  only production-touching work is the deploy URL and image path in Tasks 5–6.
- **Budget: $0.** Branch protection is free on **public** repositories for
  personal accounts. It is **not available on private repositories on the free
  plan** — which is why AeleOS's protection depends on Task 7, not on this
  transfer.
- **Secrets never in git.** The local `.secrets` backup created in Task 1 is
  gitignored in every repo. Never commit it; never paste values into this plan or
  any report.
- **Do not assume GitHub's transfer semantics.** Whether repository secrets,
  environment secrets, environment protection rules and branch protection survive
  a transfer is **verified here, not assumed**.
- **The secrets backup happens before the transfer.** It is what makes the whole
  plan reversible.

## Portfolio considerations

These repos double as a public portfolio, and that is a stated goal — so the
following are deliverables, not nice-to-haves.

- **Contribution graph — already correct.** Commits count for any non-fork repo
  you have push access to when authored with a linked email. Verified 2026-08-05:
  commits in all three repos resolve to `author.login=vaoan`, including in
  `furrycolombia-sys/candyshop`. The transfer does not change this.
- **Only default-branch commits count.** AeleOS's Phase 0 commits sit on
  `phase-0-clerk-standup` and contribute nothing until that PR merges to `main`.
- **Private repos are anonymised squares** — no name, no link. AeleOS is private,
  so the specs, the IdP decision record, the actor model and the RLS conformance
  suite are currently **invisible to anyone reading the profile**. This is the
  single highest-value item in the plan (Task 7).
- **`vaoan` has 62 public repos.** Three good ones will not surface on their own —
  **pin them** (Task 6, Step 5). Pinning is the portfolio surface; the
  Repositories tab is not.

## Measured starting state

Taken 2026-08-05. Re-check before starting if time has passed.

|                          | AeleOS                          | Puck                                | CandyStore                    |
| ------------------------ | ------------------------------- | ----------------------------------- | ----------------------------- |
| Slug                     | `vaoan/aeleos`                  | `vaoan/Puck`                        | `furrycolombia-sys/candyshop` |
| Moves in this plan       | no                              | no                                  | **yes**                       |
| Visibility               | private                         | public                              | public                        |
| `vaoan` permission       | admin                           | admin                               | **write**                     |
| Repo secrets set         | 0                               | **0**                               | **64** (all now backed up)    |
| Secrets referenced in CI | 3                               | 33                                  | 55                            |
| Environments             | none                            | none                                | 2, both holding **0** secrets |
| Live deploy triggers     | none                            | none (all dispatch-only)            | **yes**                       |
| Branch protection        | impossible (private, free plan) | `main` + `develop`, admins enforced | not readable                  |

Puck references 33 secrets but has **none set** — its CI secrets were never
populated. All genuine risk is concentrated in CandyStore, the one repo that
moves.

`vaoan/candyshop` and `vaoan/candystore` are both free — no name collision.

---

### Task 1: Back up CandyStore's secrets — ✅ done 2026-08-07

No owner account required: `vaoan`'s write permission dispatches the workflow
fine (verified in run 31203568801). An earlier draft claimed otherwise.

Doing this first turned out to matter more than the plan assumed, because the
backup did not work. Three defects had to be fixed before it did — all of the
same shape, reporting success while doing nothing:

1. **The sync captured 47 of 64 secrets.** Each secret was named twice — in
   `env:` and in the output block — and the two lists drifted. Missing were
   `PROD_SERVER_SSH_KEY`, `GCP_PROD_SERVER_SSH_KEY`, `WEBHOOK_SECRET`,
   `PROD_SERVER_HOST`, `PROD_SERVER_USER` and 12 `NEXT_PUBLIC_*`.
   `GCP_PROD_SERVER_SSH_KEY` was read into `env:` and never echoed.
   Fixed in candyshop#334 / #335: `env:` is the only list, and the output loop
   discovers names from the environment.
2. **`toJSON(secrets)` broke it entirely** (candyshop#334, my regression).
   GitHub rejects such a run: zero jobs, conclusion `action_required`, and the
   approve endpoint refuses it as not awaiting approval. Reverted in #335.
3. **Nothing tested any of it.** `vitest.config.scripts.js` existed but was
   wired to no script and no CI job, and the `code` paths-filter classified
   `.github/workflows/**` as docs-only — so the new guard skipped on exactly
   the PRs it guards. Fixed in #335, #336, #337.

- [x] **Step 1: Sync the secrets locally**

```bash
cd Z:/Github/libra
pnpm sync-secrets
```

Result: **64 of 64 captured**, none missing, verified against
`gh secret list`. Multi-line values (both SSH keys) arrive base64-encoded as
`<NAME>_BASE64` and decode to a valid OpenSSH header.

- [x] **Step 2: Record the environment secret names**

Both environments — `production` and `copilot` — hold **zero** secrets and no
protection rules, so there is nothing here to preserve. The plan assumed
otherwise.

- [x] **Step 3: Confirm the backup is real and untracked**

`.secrets` matches a `.gitignore` rule and `pnpm secretlint` exits 0.

> ⚠️ **Finding, not yet acted on.** The stored `GCP_PROD_SERVER_SSH_KEY` value
> begins with a UTF-8 BOM (`EF BB BF`) — pasted from a Windows editor. The
> backup preserves it byte-exactly, which is correct, but OpenSSH will reject
> that key if anything writes the value straight to a file. Check whether the
> deploy path uses it or the `_B64` twin before relying on it in a restore.

---

### Task 2: Prepare the two landmines before transferring

Both are known breakages, not surprises. Prepare them now so the window between
transfer and repair is short.

**Landmine A — the GHCR namespace follows the owner.**
`candystore/.github/workflows/deploy-gcp.yml:229-232` builds:

```
ghcr.io/${{ github.repository_owner }}/candyshop-prod:<sha>
```

The owner is resolved at run time, so after the transfer images publish to
`ghcr.io/vaoan/...` — a namespace with no images in it — while the production
server still pulls the old path. Packages do **not** follow a repository
transfer, and there is **no redirect**; the old package simply stays where it
is. Investigated in Step 1 below, where it turned out to be milder than this
framing suggests.

**Landmine B — the production server has the old URL baked in.**
`candystore/scripts/server/webhook-deploy.mjs:55` hardcodes:

```
REPO_URL: "https://github.com/furrycolombia-sys/candyshop.git",
```

GitHub redirects it, so it keeps working — until the old name is reused or the
redirect lapses. It lives on the production box, so it needs a deliberate edit
and redeploy.

- [x] **Step 1: Decide the GHCR strategy — decided 2026-08-07: do nothing before the transfer**

This step originally offered a choice between transferring the package and
re-pushing. **Transferring is not an option** — GitHub does not move GHCR
packages with a repository, and provides no redirect. That half of the choice
was never real.

Measured state of `ghcr.io/furrycolombia-sys/candyshop-prod`: 38 versions, 35
tagged, **public**, linked to `furrycolombia-sys/candyshop`. The live image is
`201239a` + `latest` (2026-07-08), matching `main`'s tip; everything older is
sha-tagged history back to May. A second package, `candyshop`, holds ephemeral
CI layers and is not worth preserving.

Why no pre-work is needed:

- `deploy-gcp.yml:231` derives the path from `github.repository_owner`, so the
  **first post-transfer deploy publishes to `ghcr.io/vaoan/libra-prod`
  automatically**. No code change.
- The server pulls **authenticated** — `deploy-gcp.yml:396-397` passes
  `GHCR_TOKEN` / `GHCR_USERNAME` to the box — so a new package being private by
  default is still readable by that repository's own token.
- The old package keeps existing and serving. Nothing breaks at the moment of
  transfer; the namespaces simply diverge.

Two things to do anyway, both in Task 5:

1. **Pre-copy the live image** (`201239a` and `latest`) into
   `ghcr.io/vaoan/libra-prod` — one `docker pull` / `tag` / `push`. Without
   it the new namespace has no known-good rollback target if the first
   post-transfer deploy goes badly; the only good image would be in the old
   namespace under an explicit path.
2. **Check the new package's visibility** once created. The old one is public
   and new ones default to private, so anything pulling anonymously would break
   later, quietly.

**Do not delete the old package** until the new path has served a real deploy.

- [x] **Step 2: Stage the source edit**

Done in candyshop#338, opened as a **draft** so it cannot merge early. Rather
than swapping one hardcoded URL for another, `REPO_URL` now resolves as
`process.env.REPO_URL || "https://github.com/vaoan/libra.git"`, matching
how every other setting in that file already works — it was the only hardcoded
one. The override makes the cutover an env change in PM2 rather than a code
redeploy, and makes rollback a variable rather than a revert-and-ship under
pressure.

- [x] **Step 3: Confirm nothing is in flight — every window is quiet (2026-08-07)**

CandyStore is deployed, running and working, but has **no active users**. That
does not relax the production constraint — the VM, the tunnels, the database and
the deploy path are all real, and nothing here may be run against the database —
but it does change what a bad transfer costs. A broken first deploy strands
_you_ without a working deploy path; it does not take a service away from anyone.

So there is no window to wait for. Task 5's care is still worth taking, for the
same reason you would not want to discover a broken deploy path on the day you
next need it — the app is meant to be usable by others later.

**Transfer prep is complete. Task 3 can run whenever you choose.**

---

### Task 3: Transfer `candyshop` to `vaoan` — ✅ done 2026-08-07

- [x] **Step 1: Transfer**

Executed via the API as `furrycolombia-sys`:

```bash
gh api -X POST repos/furrycolombia-sys/candyshop/transfer -f new_owner=vaoan
```

Returned `202` and created a **pending** transfer. User-to-user transfers
require the recipient to accept, and the pending state is not exposed through
`user/repository_invitations` — that endpoint only covers collaborator invites.
So the accept step is unavoidably manual: the banner on the repository page
while signed in as the recipient, or the emailed request. Nothing changes until
it is accepted, which also makes it trivially abortable.

- [x] **Step 2: Keep the automation identity**

```bash
gh api -X PUT repos/vaoan/libra/collaborators/furrycolombia-sys -f permission=push
```

Collaborators now: `vaoan` = admin, `furrycolombia-sys` = write.

- [x] **Step 3: Update the local remote**

Repointed to `https://github.com/vaoan/libra.git`; fetch confirmed.

---

### Task 4: Verify what survived — ✅ done 2026-08-07, everything did

- [x] **Step 1: Confirm the admin outcome**

`gh api repos/vaoan/libra --jq '.permissions.admin'` → **`true`**. The old
slug redirects; visibility (public) and default branch (`develop`) unchanged.

- [x] **Step 2: Check secrets and environments**

**64 secrets → 64**, compared name-by-name against the local backup: none lost,
none unexpected. Both environments (`production`, `copilot`) present, with the
same zero protection rules they had before.

- [x] **Step 3: Check CI still runs**

Proven end to end rather than by opening a throwaway PR: `pnpm sync-secrets`
under the new owner (run 31215088244) dispatched the workflow, read all 64
secrets, uploaded the artifact and decrypted it locally — exercising Actions,
secret access and artifacts in one pass, and re-confirming the backup.

- [x] **Step 4: Audit the rest of the surface**

Added because Steps 1–3 only cover a slice, and the deploy path is what actually
matters here.

| Surface                     | Result                                                              |
| --------------------------- | ------------------------------------------------------------------- |
| **Webhook**                 | ✅ `https://deploy.furrycolombia.com/deploy`, `push`, active        |
| **Branch protection**       | ✅ both `main` and `develop` — 4 checks, strict, admins, no force   |
| **Workflows**               | ✅ all 12 `active`                                                  |
| **Actions policy**          | ✅ `allowed_actions: all`, workflow permissions `read`              |
| **Variables / deploy keys** | none before, none after                                             |
| **PRs & issues**            | ✅ carried, #338 still open                                         |
| **GHCR packages**           | ❌ **did not move** — still under `furrycolombia-sys` (as expected) |

The webhook surviving is the important one: it is what triggers production
deploys, and it points at a `furrycolombia.com` host rather than a GitHub URL,
so nothing about it needed changing.

Branch protection turned out to have existed all along on both branches — it was
simply unreadable without admin, which is why the starting-state table records it
as "not readable" rather than absent.

**Nothing was lost in the transfer.** The Task 1 backup was insurance that went
unused, which is the outcome to want from insurance.

---

### Task 5: Repair the deploy path 🧑

- [ ] **Step 1: Seed a rollback target in the new namespace** 🧑

Per Task 2 Step 1, the new namespace populates itself on the first deploy — but
seed it first so there is a known-good image to fall back to. Needs Docker and
a token with `write:packages`:

```bash
docker pull ghcr.io/furrycolombia-sys/candyshop-prod:latest
docker tag  ghcr.io/furrycolombia-sys/candyshop-prod:latest ghcr.io/vaoan/libra-prod:latest
docker tag  ghcr.io/furrycolombia-sys/candyshop-prod:latest ghcr.io/vaoan/libra-prod:201239a
docker push ghcr.io/vaoan/libra-prod:latest
docker push ghcr.io/vaoan/libra-prod:201239a
```

- [ ] **Step 2: Match the new package's visibility** 🧑

The old package is **public**; new GHCR packages default to **private**. CI and
the server pull authenticated so they are unaffected, but anything pulling
anonymously would break quietly. Set it public to match what exists today.

- [ ] **Step 3: Merge the staged server change** 🧑

Take candyshop#338 out of draft and merge it, then redeploy the webhook
receiver. If the server needs to keep pointing at the old owner for a moment,
set `REPO_URL` in PM2 instead of reverting the commit.

- [ ] **Step 4: Prove a deploy end-to-end, before you need one** 🧑

Run a deploy through the normal path while you are watching and have time to roll
back. Do not let the first post-transfer deploy be an urgent one.

---

### Task 6: Clean up the stale references

Agent-runnable, as normal PRs.

- [ ] **Step 1: Apply branch protection to `candyshop`**

Now possible as owner. Mirror Puck's ruleset: require a PR, require the repo's
gate checks, strict up-to-date, no force-push, enforced on admins.

```bash
gh api repos/vaoan/Puck/branches/main/protection \
  --jq '{checks: .required_status_checks.contexts, strict: .required_status_checks.strict, admins: .enforce_admins.enabled}'
```

- [ ] **Step 2: Fix the hardcoded production URL** (CandyStore)

`scripts/server/webhook-deploy.mjs:55` → `https://github.com/vaoan/libra.git`

- [ ] **Step 3: Fix the stale comment** (Puck)

`.github/workflows/sandbox-release.yml:8` still says "ensure develop and staging
branches exist in vaoan/Puck" — correct today, but confirm it survived.

- [ ] **Step 4: Sweep cross-repo references in docs**

`CLAUDE.md` and `README.md` in all three repos reference sister repos by path and
URL. Sweep for `furrycolombia-sys/`.

- [ ] **Step 5: Pin the three repos to the profile** 🧑

This is the portfolio surface. With 62 public repos, unpinned work is invisible.
AeleOS can only be pinned once public (Task 7).

- [ ] **Step 6: Confirm the secrets loop still works**

`sync-secrets.mjs` needs **no change** — it derives the slug from `gh repo view`
at run time. Confirm end to end, now as `vaoan`:

```bash
cd Z:/Github/libra && pnpm sync-secrets
```

---

### Task 7: Make AeleOS public 🧑

Independent of the transfer, and the highest-value item here for the portfolio
goal. It also unlocks branch protection, which the free plan denies private
repos.

- [ ] **Step 1: Read the history before flipping** 🧑

`secretlint` has gated every commit and only sanitized examples are committed,
but visibility changes are one-way in practice — assume anything public was
scraped.

```bash
cd Z:/Github/aeleos
pnpm secretlint
git log --all --stat | grep -iE "\.secrets$|\.env$" || echo "no secret files ever committed"
```

Confirm `.secrets` has never been tracked and no real Clerk key or token appears
in any commit.

- [ ] **Step 2: Flip visibility** 🧑

Settings → General → Danger Zone → Change visibility → Public.

- [ ] **Step 3: Apply branch protection**

Mirror Puck's ruleset onto `main`, now that it is possible.

- [ ] **Step 4: Merge the Phase 0 PR when Phase 0 actually closes**

Commits on `phase-0-clerk-standup` do not count toward the contribution graph
until they land on the default branch. This is a reason to finish Phase 0, **not**
a reason to merge it early — the PR states plainly that the trust validation has
not run.

---

## Verification checklist

- [x] `.secrets` backed up locally for CandyStore **before** the transfer —
      64 of 64, verified against `gh secret list`.
- [x] Environment secret names and protection rules recorded before the
      transfer — both environments hold none.
- [x] `gh api repos/vaoan/libra --jq '.permissions.admin'` returns `true`.
- [x] CandyStore's `production` environment, its secrets and its protection rules
      verified present — all 64 secrets survived, nothing re-created.
- [x] CI green after the transfer — proven by a real workflow run rather than a
      throwaway PR (run 31215088244).
- [ ] GHCR images resolve at the new namespace.
- [ ] A CandyStore deploy proven end-to-end, unhurried.
- [x] `pnpm sync-secrets` works as `vaoan`.
- [x] Local remote updated.
- [x] Branch protection applied to `candyshop` — it survived the transfer on both
      `main` and `develop`, so nothing had to be re-created. AeleOS was made
      public and protected separately (Task 7).
- [ ] All three repos pinned to the profile.
- [ ] No secret value appears in git history anywhere.

## Rollback

A repository transfer is reversible — transfer it back, and GitHub redirects
again. What does **not** roll back cleanly:

- **GHCR packages** already pushed to the new namespace. Keep the old package
  until the new path is proven.
- **Secrets that did not survive.** This is why Task 1 exists; without the local
  backup, a rollback still leaves them gone.
- **Production server config.** Reverting `webhook-deploy.mjs` needs a redeploy,
  not a git revert.
- **Repository visibility.** Task 7 is effectively one-way; treat anything
  published as permanently public.

The safe abort point is **before** Task 3. After the transfer the fastest path is
forward — fix the namespace and the server — not back.

## What this plan does NOT deliver

- No organisation. Deliberate; see "Why not an organisation" and the condition
  for revisiting it.
- No move for `aeleos` or `Puck` — they are already correctly owned.
- No consolidation of secrets beyond the existing per-repo model.
- No change to any app's behaviour, database, or identity model. This is
  ownership, permissions and visibility only; it touches nothing in the AeleOS
  identity design.
- No merge of the Phase 0 PR. That waits on Phase 0's own validation.
