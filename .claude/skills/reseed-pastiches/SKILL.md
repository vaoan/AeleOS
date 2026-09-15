---
description: Re-seed the sixteen showcase pages to production from main, after a rebase, never from a stale branch
when_to_use: after any change to scripts/pastiche-pages.mjs, scripts/pastiche-references.mjs or scripts/era-looks.generated.json has merged
disable-model-invocation: true
---

# Re-seed the pastiche pages

The seeder writes production from whatever tree you are standing in and
bypasses `set_actor_sections` entirely, so it applies no database guard.

1. Be on `main`, fully rebased: `git checkout main && git pull`. Re-seeding
   from a branch cut before another change silently reverts that change on
   every seeded page.
2. `pnpm --filter hub test -- pastiche-pages era-looks-json`: the pages must
   pass the reassembled validation first, because the database will not
   refuse them.
3. `set -a; . ./.secrets; set +a; node scripts/seed-pastiches.mjs`.
4. Photograph at least the pages that changed and read the pictures back
   (`/picture-proof`); a broken reference capture fails no gate.
5. Expect `arquivo.pt` and `upload.wikimedia.org` to refuse rapid repeated
   requests; a respaced retry clears it, and it is not evidence the
   reference is wrong.

Full account: `docs/lessons/conventions/the-pastiches-were-rebuilt-against-their-captures-one-task.md`.
