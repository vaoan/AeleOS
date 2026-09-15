---
paths:
  - "supabase/**"
  - "scripts/check-schema-drift.mjs"
  - "scripts/schema-drift-output.mjs"
  - "scripts/check-page-shapes.mjs"
---

# Migrations

Loaded when a file under `supabase/` or a drift script is read. Each line is the rule; the link is why.

- **Squash the migrations, and squash them again.** → `docs/lessons/conventions/squash-the-migrations-and-squash-them-again.md`
- **A claim about STORED data is checkable now — `pnpm check:page-shapes`.** → `docs/lessons/conventions/a-claim-about-stored-data-is-checkable-now-pnpm-check-page-s.md`
- **An agent that sabotages live state must restore it in the same run, and a session limit does not care.** → `docs/lessons/rules/20-an-agent-that-sabotages-live-state-must-restore-it-in-the-sa.md`
- **Anything that ships file CONTENT to a server, rather than committing it, is exposed to the checkout's line endings — and in this repo `.gitattributes` closed that door, which is why this rule no longer tells you to convert anything.** → `docs/lessons/rules/28-anything-that-ships-file-content-to-a-server-rather-than-com.md`
