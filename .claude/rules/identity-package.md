---
paths:
  - "packages/identity/**"
  - "docs/integrating.md"
---

# Identity package

Loaded when the shared identity package or its integration contract is read. The link is why.

- **The package imports no framework, and above all no Clerk.** → `docs/overview.md`
- **The contract now names two instances, and the package's rule is why that costs nothing (2026-09-27).** A production Clerk instance exists on `clerk.furrycolombia.com` and Libra launches against it; the hub still runs development, so `docs/integrating.md` says an app on production cannot use this hub's actor sync or picker yet and should store the `sub` as `identity_sub` and treat the person as the actor until the hub follows. Nothing in `packages/identity` changed — it never knew which instance it was talking to, and a future provider is a new trust entry plus a re-claim by verified email, not a package change.
