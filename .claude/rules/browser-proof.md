---
paths:
  - "apps/hub/tests/e2e/**"
  - "apps/hub/playwright.config.ts"
  - "apps/hub/.env.example"
---

# Browser proof

Loaded when a Playwright spec or its config is read. Each line is the rule; the link is why.

- **Never diagnose a browser failure against a server older than the code.** → `docs/lessons/rules/12-never-diagnose-a-browser-failure-against-a-server-older-than.md`
- **An event you can OBSERVE is not proof that the thing which acts on it is listening yet.** → `docs/lessons/rules/26-an-event-you-can-observe-is-not-proof-that-the-thing-which.md`
- **A SKIPPED test reports green, and a suite that skips most of itself when a secret is absent is the easiest way in this repository to believe work is verified when it is not.** → `docs/lessons/rules/31-a-skipped-test-reports-green-and-a-suite-that-skips-most-of.md`
- **A responsive fault can live in a BAND a few dozen pixels wide, and the band starts at whichever breakpoint you just used.** → `docs/lessons/rules/38-a-responsive-fault-can-live-in-a-band-a-few-dozen-pixels.md`
- **A NETWORK failure is not a flaky test, and telling them apart decides whether retrying is discipline or its opposite.** → `docs/lessons/rules/41-a-network-failure-is-not-a-flaky-test-and-telling-them-apart.md`
- **A completely ABSENT `apps/hub/.env.local` fails silently rather than loudly, and the resulting error is unrecognizable as a config problem.** → `docs/lessons/rules/43-a-completely-absent-apps-hub-env-local-fails-silently-rather.md`
- **Picture proof on the PR is part of the work, not a follow-up.** → `docs/lessons/conventions/picture-proof-on-the-pr-is-part-of-the-work-not-a-follow-up.md`
