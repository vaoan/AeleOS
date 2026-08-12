# AeleOS — Documentation and Test Standards — Design

- **Date:** 2026-08-12
- **Status:** Approved for implementation planning
- **Scope:** How code in this repository documents and proves itself. Applies to
  `apps/hub`, `tests/`, `scripts/`. Platform-wide in intent — the sister repos
  would adopt it next.
- **Author:** Heiner Angarita (with Claude)
- **Related:** `2026-08-12-aeleos-visual-identity-design.md`. **This lands
  first**, so the visual identity is written to these standards rather than
  retrofitted twice.

---

## 1. Why

The repository is developed largely by AI. That changes the economics of
documentation in two ways:

- Code churns faster than a human would rewrite it, so comments go stale faster.
- The next reader is frequently a model with no memory of why anything is the
  way it is.

A stale comment is worse than no comment: it is a confident, wrong instruction
that both humans and models will follow.

## 2. Two enforced artefacts, and one optional note

Overlap is what makes documentation drift, because two things must then be kept
in step. These describe different subjects and never restate one another.

| Artefact  | Answers                                        | Rots when                     |
| --------- | ---------------------------------------------- | ----------------------------- |
| **TSDoc** | what this export is, and its contract          | signature or contract changes |
| **Tests** | what it actually does, including every failure | never silently — it fails     |

**TSDoc never restates types** — TypeScript already has them. It states the
contract: what a caller may assume, what it throws, what is idempotent, what is
security-relevant. **Constraints about an export belong here**, not in a
separate file: _"this list is the security boundary", "absence and failure are
different answers"_.

### Why there is no mandated per-directory `CLAUDE.md`

An earlier draft of this spec required one per code directory, holding
constraints. It was dropped before implementation, for two reasons.

**Most of its content was per-export.** Of the four rules drafted for
`src/lib`, three described exports that already exist — the security boundary
of `PUBLIC_ROUTES`, the error contract of `getPersonActor`, the per-request
token of `createServerClient`. Those belong on the export, where they are
enforced, freshness-checked and visible on hover. Duplicating them into a file
creates precisely the two-things-to-keep-in-step problem this section opens by
warning against.

**It would be the only artefact with no staleness protection.** This document
otherwise exists to stop documentation drifting from code; adding a file that
nothing checks and nothing enforces contradicts that.

A directory file remains **available and unenforced**, for the residue that
genuinely cannot attach to an export: rules constraining code that does not
exist yet. _"Never cast a database row into a type", "the nebula must never
compete with an avatar."_ The distinction is simple — **TSDoc constrains what
exists; a directory note constrains what comes next.** A directory with nothing
in the second category should not be made to invent some.

The cost is accepted knowingly: a directory note loads automatically for agents
working there, while a spec under `docs/superpowers/specs/` does not. Rules for
future work are therefore slightly less likely to be seen. The answer is to
write one where it earns its place, not everywhere.

## 3. What is enforced, and how honestly

### Enforceable mechanically

| Rule                           | Mechanism                                                |
| ------------------------------ | -------------------------------------------------------- |
| Every export is documented     | `jsdoc/require-jsdoc` (`publicOnly`)                     |
| Docs are valid TSDoc           | `tsdoc/syntax`                                           |
| Descriptions are not empty     | `jsdoc/require-description`, `require-param-description` |
| Parameters match the signature | `jsdoc/check-param-names`                                |
| Every parameter is documented  | `jsdoc/require-param`                                    |
| Every error branch is tested   | **branch coverage threshold**                            |

Branch coverage is the load-bearing one. "Test all the errors" is a wish; a
build that fails on an untested branch is a rule.

`require-param` earns its place indirectly. Without it, `check-param-names` has
nothing to compare and the signature-drift guard is inert — which was found by
probing the guard and getting no failure at all.

### Enforceable only by heuristic — adopted deliberately

**Doc freshness: an export's implementation changed, its TSDoc did not.**

No tool can detect a _semantically_ stale comment. Changing
`getPersonActor` from "returns null when missing" to "throws" without touching
the signature produces a comment that is now a lie, and every linter reports
green.

This check is therefore a heuristic, and heuristics that fire spuriously get
ignored — the failure mode this repository has twice removed (secretlint
scanning `.secrets`; a CI gate that would pass while testing nothing).

**It is adopted anyway, as a deliberate trade.** Under AI-driven development the
stale-comment risk is judged higher than the nuisance cost. The decision was
made with that objection stated.

Two mitigations make it survivable:

1. **Per-symbol, not per-file.** It reports "`getPersonActor` changed but its
   documentation did not" — actionable, unlike "this file changed".
2. **Normalised comparison.** Whitespace, formatting and comment reflows are
   stripped before hashing, so Prettier never triggers it.

The escape hatch is to touch the doc — restating the invariant that still holds
is itself worth writing. There is no suppression flag, by choice: a suppression
flag becomes the thing everyone types.

## 4. Test policy

Every exported function has, at minimum:

- the **happy path**
- **each distinct failure mode**, asserted separately

"Each distinct failure mode" means each branch that can throw, return an error
sentinel, or degrade. Branch coverage enforces the floor; judgement covers the
rest.

**Behaviour that matters gets a test, not a comment.** Where the two disagree,
the test wins — it is the only artefact that cannot be quietly wrong.

Tests that guard already-correct behaviour must be **verified by sabotage**:
break the implementation, watch the test fail, restore. A test never seen red
proves nothing. This is already practice here and becomes policy.

## 5. Retrofit, not forward-only

Existing code is documented in the same change that turns the rules on.

A two-tier codebase — new files strict, old files exempt — teaches that the rule
is optional, and the exempt set never shrinks. The hub is currently five source
files; the cost is an hour and they are better for it.

## 6. Explicitly not covered

- Generated documentation sites (TypeDoc). The audience is editors, human and
  model, not a docs portal.
- A component registry for cross-app distribution. Worth doing when a second app
  consumes AeleOS components; speculative before that.
- Enforcing that directory notes exist. They are written where useful, never by
  mandate — see §2.
- Applying these standards to `libra` or `puck`. Prove them here first.
