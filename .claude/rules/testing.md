---
paths:
  - "**/*.test.ts"
  - "**/*.test.tsx"
  - "vitest.config*.ts"
  - "apps/hub/vitest*.ts"
  - "tests/tools/**"
  - "tests/db/**"
  - "tests/idp/**"
---

# Testing

Loaded when a test file or a test-runner config is read. Each line is the rule; the link is why.

- **A property test states a claim; it does not weaken until it passes.** → `docs/lessons/rules/07-a-property-test-states-a-claim-it-does-not-weaken-until-it.md`
- **An argument about cost is not a measurement of it.** → `docs/lessons/rules/10-an-argument-about-cost-is-not-a-measurement-of-it.md`
- **A branch reached only by a random draw is not covered, and the coverage number lies about it at a low rate.** → `docs/lessons/rules/11-a-branch-reached-only-by-a-random-draw-is-not-covered-and.md`
- **A test can exercise a path the product never takes and look exactly like coverage.** → `docs/lessons/rules/13-a-test-can-exercise-a-path-the-product-never-takes-and-look.md`
- **A budget is only real if it separates the two builds, and one reading of each does not establish that.** → `docs/lessons/rules/14-a-budget-is-only-real-if-it-separates-the-two-builds-and-one.md`
- **Being right for the wrong reason is the worse way to be right, because the reasoning is what the next person reuses.** → `docs/lessons/rules/17-being-right-for-the-wrong-reason-is-the-worse-way-to-be.md`
- **An assertion that cannot fail FIRST is corroborating, not independent, and counting it as proof is how a suite overstates itself.** → `docs/lessons/rules/23-an-assertion-that-cannot-fail-first-is-corroborating-not.md`
- **A FIXTURE can make a right answer and a wrong one identical, and then the assertion is perfect and proves nothing.** → `docs/lessons/rules/27-a-fixture-can-make-a-right-answer-and-a-wrong-one-identical.md`
- **A SABOTAGE is a fixture too, and a green restore afterwards is indistinguishable from a real verification.** → `docs/lessons/rules/29-a-sabotage-is-a-fixture-too-and-a-green-restore-afterwards.md`
- **ZERO TOLERANCE FOR FLAKINESS. A test that sometimes fails is a defect report, and the defect is usually not in the test.** → `docs/lessons/rules/33-zero-tolerance-for-flakiness-a-test-that-sometimes-fails-is.md`
- **A SABOTAGE that restores with `git` restores to the last COMMIT, which is not where you were.** → `docs/lessons/rules/34-a-sabotage-that-restores-with-git-restores-to-the-last.md`
- **A test that passes in a suite and fails alone has an isolation defect, and the defect is evidence about the SUITE.** → `docs/lessons/rules/35-a-test-that-passes-in-a-suite-and-fails-alone-has-an.md`
- **Vitest transpiles without typechecking, so a test file can pass every suite at 100% and still fail `tsc`.** → `docs/lessons/rules/40-vitest-transpiles-without-typechecking-so-a-test-file-can.md`
- **Every export is tested on its happy path and on each failure mode.** → `docs/lessons/conventions/every-export-is-tested-on-its-happy-path-and-on-each-failure.md`
- **Edge cases are owed at BOTH levels, and they are different questions at each.** → `docs/lessons/conventions/edge-cases-are-owed-at-both-levels-and-they-are-different.md`
- **Every bug gets a regression test. No exceptions.** → `docs/lessons/conventions/every-bug-gets-a-regression-test-no-exceptions.md`
