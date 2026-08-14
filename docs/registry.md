# The actor registry

Every consuming app keeps a **mirror** of `actors`, synced from here. This
repository is the exception: its `actors` table is **authoritative**. Nothing
syncs into it.

## One schema, one owner

`supabase/migrations/` at the repository root is the only place migrations
live. `apps/hub` ships none of its own — the hub reads a database whose schema
this repository owns. Every `security definer` RPC is a numbered migration here
like any other.

**The schema was consolidated on 2026-08-13**, and the rule it now keeps is
worth knowing before you write a migration: **every object is defined exactly
once.** Before, six objects had been redefined by `create or replace` — the
`actors_public` view four times — so the current body of a function could live
in a file named after something unrelated, and restating the wrong ancestor
silently reverted a fix. If you are replacing something, you should not have to
hunt for which file owns it.

This is deliberate. The hub and this repository target the same Supabase
project, and two places issuing `supabase db push` at one database is two
sources of truth. See
`docs/superpowers/specs/2026-08-10-hub-in-aeleos-design.md`.

## The one value that must never change

`person_actor_ref` in `0002_actor_helpers.sql` derives a person's `actor_ref`
from their `identity_sub` using UUIDv5 over a fixed namespace. Every app computes the same
value with no coordination, which is what keeps one human as one identity
across the platform.

Changing that namespace forks every person's identity. The derivation is also
**bootstrap-only**: existing rows keep their stored `actor_ref`, so it is never
recomputed for an existing user.

## Checking the schema is what you think it is

```bash
DB_URL=$(pnpm exec supabase status -o json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).DB_URL))")
psql "$DB_URL" -c "select version from supabase_migrations.schema_migrations order by version;"
```
