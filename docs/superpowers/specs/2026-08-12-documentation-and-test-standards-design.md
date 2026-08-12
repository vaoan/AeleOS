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

## 2. Three artefacts, three jobs, no overlap

Overlap is what makes documentation drift, because two things must be kept in
step. These three describe different subjects and never restate one another.

| Artefact        | Answers                                        | Rots when                     |
| --------------- | ---------------------------------------------- | ----------------------------- |
| **TSDoc**       | what this export is, and its contract          | signature or contract changes |
| **Tests**       | what it actually does, including every failure | never silently — it fails     |
| **`CLAUDE.md`** | what must not be broken, and why               | the constraint itself changes |

**TSDoc never restates types** — TypeScript already has them. It states the
contract: what a caller may assume, what it throws, what is idempotent, what is
security-relevant.

**`CLAUDE.md` never describes an API.** It holds constraints and prohibitions:
_"the nebula must never compete with an avatar", "borders must clear 3:1 —
measure, do not eyeball"_. One per component directory, loaded by agents only
when working under it, so it costs nothing until relevant.

## 3. What is enforced, and how honestly

### Enforceable mechanically

| Rule                           | Mechanism                                                |
| ------------------------------ | -------------------------------------------------------- |
| Every export is documented     | `jsdoc/require-jsdoc` (`publicOnly`)                     |
| Docs are valid TSDoc           | `tsdoc/syntax`                                           |
| Descriptions are not empty     | `jsdoc/require-description`, `require-param-description` |
| Parameters match the signature | `jsdoc/check-param-names`                                |
| Every error branch is tested   | **branch coverage threshold**                            |
| Every component has rules      | script asserting `CLAUDE.md` per component directory     |

Branch coverage is the load-bearing one. "Test all the errors" is a wish; a
build that fails on an untested branch is a rule.

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
- Applying these standards to `libra` or `puck`. Prove them here first.
