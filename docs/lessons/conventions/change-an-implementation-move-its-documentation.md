# Change an implementation, move its documentation.

- **Change an implementation, move its documentation.** `pnpm check:docs`
  compares each exported symbol against the base branch — and against the index
  in pre-commit — failing when the code moved and the TSDoc did not. It is a
  heuristic and it is deliberate: under AI-driven development a stale comment is
  a confident, wrong instruction. There is no suppression flag. Its companion
  `pnpm check:agent-notes` asks the same question one level up, of the directory
  notes — see the bullet below for the three rulings that shape it.
