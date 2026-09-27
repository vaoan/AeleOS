# Secrets never in git.

- **Secrets never in git.** Real values live in `.secrets` / provider dashboards /
  CI secrets. `.env`, `.secrets`, and raw IdP config dumps are gitignored — only
  sanitized/example config is committed (`.secrets.example`).
- **A placeholder must not be key-shaped (2026-09-27).** GitHub's push
  protection read `sk_live_` plus 24 x's in `.secrets.example` as a Stripe
  secret and refused the whole push, while the `sk_test_` placeholder one
  screen up was never flagged — it is the pattern's width, not a leak. The
  example's production placeholders say where the value comes from
  (`sk_live_from-the-dashboard`) rather than how long it is. Push protection
  scans every commit in a push, so the fix is amended into the commit that
  introduced the pattern, never added on top of it.
- **Tool output directories inside the repository are git-ignored before a
  tool runs (2026-09-27).** The Playwright MCP browser downloads into
  `.playwright-mcp/` under the repository root, and a Google OAuth client
  secret landed there once; it was moved into `.secrets`, deleted, and the
  directory ignored in the same sitting.
