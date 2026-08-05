# Repository Consolidation Implementation Plan

> **For agentic workers:** Most of this plan is human-only — transferring a
> repository, changing production server configuration, and flipping repository
> visibility are dashboard and server actions an agent cannot perform. Human-only
> steps are marked 🧑. The agent-runnable parts are the verification queries and
> the source edits in Task 6. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put all three platform repositories under a single owner (`vaoan`), so
that one account has admin on every repo — and so the work is visible on the
profile it is meant to showcase. Achieved without breaking CandyStore's
production deploy path.

**Why:** `candyshop` is owned by the **personal account** `furrycolombia-sys`,
not by `vaoan`. On personal repositories GitHub offers only owner and
collaborator — there is no "admin collaborator" role — so `vaoan` sits at
`permission=write` and **cannot** read or set branch protection, list secrets, or
dispatch the secrets workflow there. `aeleos` and `Puck` are already under
`vaoan`; only `candyshop` is misplaced.

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
| Repo secrets set         | 0                               | **0**                               | not readable                  |
| Secrets referenced in CI | 3                               | 33                                  | 55                            |
| Environments             | none                            | none                                | `production`, `copilot`       |
| Live deploy triggers     | none                            | none (all dispatch-only)            | **yes**                       |
| Branch protection        | impossible (private, free plan) | `main` + `develop`, admins enforced | not readable                  |

Puck references 33 secrets but has **none set** — its CI secrets were never
populated. All genuine risk is concentrated in CandyStore, the one repo that
moves.

`vaoan/candyshop` and `vaoan/candystore` are both free — no name collision.

---

### Task 1: Back up CandyStore's secrets 🧑

**Human-only, and must run as `furrycolombia-sys`** — `vaoan`'s write permission
cannot dispatch the secrets workflow.

GitHub is currently the only home for CandyStore's ~55 secret values. A local
copy is what makes everything after this reversible.

- [ ] **Step 1: Authenticate as the owner account** 🧑

```bash
gh auth login                            # as furrycolombia-sys
gh auth switch --user furrycolombia-sys
gh api repos/furrycolombia-sys/candyshop --jq '.permissions.admin'   # expect: true
```

- [ ] **Step 2: Sync the secrets locally** 🧑

```bash
cd Z:/Github/candystore
pnpm sync-secrets
```

Expected: `Synced N secrets to .secrets`. This is a _second_ sync on a repo that
has synced before — precisely the case the stale-run race broke before
`fix(scripts): stop sync-secrets grabbing a stale workflow run`. A `bad decrypt`
failure means that fix is missing from the checked-out branch, not that the
artifact is corrupt.

- [ ] **Step 3: Record the environment secret names** 🧑

Repository secrets are not the whole picture: CandyStore has a `production`
environment, and **environment secrets are not part of the sync workflow**. From
the dashboard, record the _names_ (never the values) under Settings →
Environments → `production`, plus its protection rules (required reviewers,
allowed deployment branches), so their survival can be checked in Task 4.

- [ ] **Step 4: Confirm the backup is real and untracked**

```bash
cd Z:/Github/candystore
git check-ignore -v .secrets     # expect: a .gitignore rule matches
pnpm secretlint                  # expect: exit 0
```

**Do not proceed until this passes.**

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
transfer.

**Landmine B — the production server has the old URL baked in.**
`candystore/scripts/server/webhook-deploy.mjs:55` hardcodes:

```
REPO_URL: "https://github.com/furrycolombia-sys/candyshop.git",
```

GitHub redirects it, so it keeps working — until the old name is reused or the
redirect lapses. It lives on the production box, so it needs a deliberate edit
and redeploy.

- [ ] **Step 1: Decide the GHCR strategy** 🧑

Either transfer the existing package to `vaoan`, or accept a re-push under the
new namespace and update the server's pull path. Write down which — Task 5
executes it.

- [ ] **Step 2: Stage the source edit**

Prepare the `webhook-deploy.mjs` change (Task 6, Step 2) so it can ship
immediately after the transfer rather than being written under time pressure.

- [ ] **Step 3: Confirm nothing is in flight** 🧑

No deploy, release, or long-running workflow mid-run. Pick a quiet window.

---

### Task 3: Transfer `candyshop` to `vaoan` 🧑

- [ ] **Step 1: Transfer** 🧑

As `furrycolombia-sys`: Settings → General → Danger Zone → Transfer ownership →
target `vaoan`. `vaoan` must accept the transfer.

- [ ] **Step 2: Keep the automation identity** 🧑

Re-add `furrycolombia-sys` as a **collaborator with write**. Its historical
commits stay attributed to it either way, but any automation authenticating as it
needs push access back.

- [ ] **Step 3: Update the local remote**

```bash
cd Z:/Github/candystore
git remote set-url origin https://github.com/vaoan/candyshop.git
git fetch origin && git status
```

GitHub redirects the old URL, but a stale remote hides the move from anyone
reading `git remote -v` later.

---

### Task 4: Verify what survived — do not assume

- [ ] **Step 1: Confirm the admin outcome**

```bash
gh auth switch --user vaoan
gh api repos/vaoan/candyshop --jq '.permissions.admin'    # expect: true
```

`true` here is the plan's actual success condition — everything else is
consequence.

- [ ] **Step 2: Check secrets and environments**

```bash
gh secret list --repo vaoan/candyshop
gh api repos/vaoan/candyshop/environments --jq '.environments[]?.name'
```

Expect `production` and `copilot`. Compare the environment secret **names** and
protection rules against what Task 1 Step 3 recorded. Re-create anything missing
from the local `.secrets` backup.

- [ ] **Step 3: Check CI still runs**

Open a throwaway PR and confirm the gates report. Third-party actions are pinned
by SHA and personal accounts impose no action allowlist, so this should be clean —
verify rather than trust.

---

### Task 5: Repair the deploy path 🧑

- [ ] **Step 1: Execute the GHCR strategy** 🧑

Transfer the package to `vaoan`, or re-push under the new namespace.

- [ ] **Step 2: Update the server** 🧑

Ship the `webhook-deploy.mjs` change and re-point the server's image pull path.

- [ ] **Step 3: Prove a deploy end-to-end, before you need one** 🧑

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

`scripts/server/webhook-deploy.mjs:55` → `https://github.com/vaoan/candyshop.git`

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
cd Z:/Github/candystore && pnpm sync-secrets
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

- [ ] `.secrets` backed up locally for CandyStore **before** the transfer.
- [ ] Environment secret names and protection rules recorded before the transfer.
- [ ] `gh api repos/vaoan/candyshop --jq '.permissions.admin'` returns `true`.
- [ ] CandyStore's `production` environment, its secrets and its protection rules
      verified present, or re-created from the backup.
- [ ] CI green on a PR after the transfer.
- [ ] GHCR images resolve at the new namespace.
- [ ] A CandyStore deploy proven end-to-end, unhurried.
- [ ] `pnpm sync-secrets` works as `vaoan`.
- [ ] Local remote updated.
- [ ] Branch protection applied to `candyshop` (and to `aeleos` if public).
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
