# Git:

- **Git:** work on branches, open PRs; do **not** commit unless the user
  explicitly asks. Never commit secrets. Every `git` and `gh` call in this
  repository uses the PAT in `.secrets` (`GH_TOKEN`) and takes commit
  identity from `gh api user` — never from `git config --global` and never
  from a hardcoded name or email. The procedure is
  [`docs/git-with-gh-token.md`](docs/git-with-gh-token.md).

  **This was skipped on `carrd-style-builder` (2026-09-05): several commits
  fell through to the machine's own global identity — a real work account,
  correct for that machine's other repositories — instead of `--local` set
  from `gh api user`, leaking it onto the PR.** Fixed by rewriting only the
  affected commits' author/committer and force-pushing; the global identity
  was left exactly as found. **Never touch the global identity to fix
  this** — set `--local` in this repo from `gh api user` before the first
  commit of the session, every session. See `docs/git-with-gh-token.md`'s
  own troubleshooting entry for the full account.
