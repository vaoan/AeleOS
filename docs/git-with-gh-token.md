# How to use `GH_TOKEN` for git in this repository

This is the procedure for every `git` and `gh` operation in AeleOS: push,
fetch, pull, PR, review, merge, and GitHub API. It is for anyone (human or
agent) acting on `vaoan/AeleOS`. Do not copy a name, email, login, or token
from memory, from `git config --global`, or from a previous session.

Authentication and commit identity both come from the PAT in `.secrets`, via
GitHub's own API. The PAT is the account that owns this repository. The
machine's global git identity is a different person and must not appear on
commits here.

## Prerequisites

- The repository root as the working directory.
- `.secrets` present and containing `GH_TOKEN`. If it does not, run
  `pnpm sync-secrets` (see `.secrets.example` for why the variable is named
  `GH_TOKEN` and not `GITHUB_TOKEN`).
- `gh` on `PATH`.

Never print `GH_TOKEN`. Never commit `.secrets`.

## Load the token

Do this at the start of every shell that will run `git` or `gh`:

```bash
set -a
. ./.secrets
set +a
: "${GH_TOKEN:?GH_TOKEN missing from .secrets — run pnpm sync-secrets}"
export GH_TOKEN
export GITHUB_TOKEN="$GH_TOKEN"
```

`gh` reads `GH_TOKEN`. Some git helpers and CI-shaped tools read
`GITHUB_TOKEN`. Point both at the same PAT so a leftover environment cannot
silently pick another credential. Do not name a repository secret
`GITHUB_TOKEN`: Actions already uses that name for its job token.

## Confirm who the token is

```bash
gh api user --jq '{login,name,email,id}'
```

The `login` is who will appear as the GitHub actor on pushes and PRs. If this
fails, stop — nothing below is valid.

## Set commit identity from that response

Git does not read the PAT for `Author` / `Committer`. It reads `user.name` and
`user.email`. Query them from the same payload, then write **local** config
only:

```bash
NAME="$(gh api user --jq '.name // .login')"
EMAIL="$(gh api user --jq '.email // empty')"
if [ -z "$EMAIL" ]; then
  EMAIL="$(gh api user --jq '[.id, .login] | "\(.[0])+\(.[1])@users.noreply.github.com"')"
fi
git config --local user.name "$NAME"
git config --local user.email "$EMAIL"
```

The fallback is GitHub's documented noreply address when the profile email is
null. Do not invent an address. Do not use `git config --global`. Do not add a
`Co-authored-by` trailer unless the extra author was actually involved; if you
do, that trailer’s address must also come from an API, not from global git
config.

Check before the first commit of the session:

```bash
git config --local --get user.name
git config --local --get user.email
git config --global --get user.email   # must not be what you just committed as
```

## Route `git push` through `gh`

macOS often has `credential.helper=osxkeychain` globally. That helper will
offer a stored OAuth login that is **not** this PAT. For this repository,
disable the default helper on GitHub URLs and use `gh` instead, which honours
`GH_TOKEN`:

```bash
git config --local credential."https://github.com".helper ""
git config --local --add credential."https://github.com".helper "!gh auth git-credential"
```

Every `git` invocation in that shell still needs `GH_TOKEN` exported (step
“Load the token”). Prefer that over embedding the PAT in a remote URL.

If a one-off command must not touch config, pass the same helpers inline:

```bash
git -c credential.helper= -c credential.helper="!gh auth git-credential" push -u origin HEAD
```

## Operations

After the steps above, use ordinary commands. They authenticate as `gh api user`’s
`login`.

| Task                  | Command                                   |
| --------------------- | ----------------------------------------- |
| Status / diff / log   | `git status`, `git diff`, `git log`       |
| Branch from `main`    | `git checkout -b <name> origin/main`      |
| Commit                | `git commit` (local `user.*` already set) |
| Push                  | `git push -u origin HEAD`                 |
| Open a PR             | `gh pr create`                            |
| Checks, review, merge | `gh pr checks`, `gh api`, `gh pr merge`   |

Still follow `CLAUDE.md`: branch from `origin/main` by name, do not commit
unless asked, do not commit secrets, do not skip hooks.

## Expected result

- `gh api user --jq .login` is the GitHub account that owns `vaoan/AeleOS`.
- `git log -1 --format='%an <%ae>'` matches `gh api user`’s `name` and `email`
  (or the noreply fallback).
- `git push` does not prompt and does not fail with “Permission … denied to
  \<some other login\>”.

## Troubleshooting

**`GH_TOKEN missing` / empty.** `.secrets` is stale or was created before the
repository secret existed. Run `pnpm sync-secrets` and confirm a `GH_TOKEN=`
line is present without printing its value (`grep -c '^GH_TOKEN=.' .secrets`).

**`Permission … denied to <login>` on push.** Git used a credential helper
other than `gh`. Re-run the helper config above, keep `GH_TOKEN` exported, and
retry. Do not `gh auth login` as a different account to “fix” it.

**Commit shows an address you did not just fetch from `/user`.** Global git
config leaked in because `--local` was skipped. Amend only if the user asked
and the commit has not been pushed; otherwise a new commit. Reset local
`user.name` / `user.email` from `/user` before that commit.

**`workflow` scope refused when pushing `.github/workflows/`.** The PAT in
GitHub secrets needs the `workflow` scope. That is a token setting on GitHub,
not something to work around with another login.

## See also

- `.secrets.example` — why the variable is `GH_TOKEN`
- `scripts/sync-secrets.mjs` — how `.secrets` is rebuilt from repository secrets
- `CLAUDE.md` — branch-from-`origin/main` and “do not commit unless asked”
