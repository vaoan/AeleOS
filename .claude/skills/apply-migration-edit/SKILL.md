---
description: Hand-apply an edited, already-applied migration to the live Supabase project, in the only order that is safe
when_to_use: after editing any file under supabase/migrations/ that the live database has already applied; before merging such a PR
disable-model-invocation: true
---

# Apply a migration edit to live

`db push` will not re-run an applied file, so an in-place edit to `0009` or
any applied migration changes nothing on the live project until you apply it
by hand. Do it LAST, immediately before merge, one pull request at a time.

1. Confirm nothing else is open: `gh pr list --state open` must list only
   your PR. If it lists another, stop: applying now turns that PR's
   `schema-drift` check red for a change that is not in it.
2. Source the secrets in the same shell: `set -a; . ./.secrets; set +a`.
3. Apply only the changed statements, each `create or replace` or
   `comment on` in its own transaction, sending the file's own text rather
   than retyping it (root rule 20). Use `psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f <statement.sql>`
   with the statement extracted verbatim from the migration.
4. Re-run `pnpm check:schema-drift`: it must report that the live database
   matches the migrations.
5. Merge. If the check goes red for a function you did not touch, it is a
   line-endings report until proven otherwise (root rule 28).

Never re-seed pastiches in the same step; that is `/reseed-pastiches`.
Full account: `docs/lessons/conventions/squash-the-migrations-and-squash-them-again.md`.
