---
paths:
  - "apps/hub/src/features/actors/application/**"
---

# Editor application

Loaded when an application-layer hook under the actors feature's editor is read — the glue between the domain and the presentation layers. Each line is the rule; the full account of every line is in the feature's `HISTORY.md` beside `CLAUDE.md`.

- **The document is bound to the page live, in both directions (2026-08-28)** — The page holds the last good tree because a bad parse never writes anything, not because a copy is kept anywhere. → `apps/hub/src/features/actors/HISTORY.md`, section "The document is bound to the page live, in both directions (2026-08-28)"
- **The public routes have their own barrel (2026-09-03)** — `public.ts` holds only what the two signed-out routes render; nothing in it may pull the editor graph (react-hook-form, zod, `@dnd-kit`, Motion) into a public route's chunk. → `apps/hub/src/features/actors/HISTORY.md`, section "The public routes have their own barrel (2026-09-03)"
