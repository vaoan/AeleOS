# Squash the migrations, and squash them again.

- **Squash the migrations, and squash them again.** Nothing is in production
  yet, so the schema is still allowed a clean start — and a clean start is
  worth keeping, because the migration set is the thing every consuming app
  will copy. **Every object is defined exactly once.** A change to an existing
  function is an edit to the file that already defines it, not a new file
  stacked on top: `0015` folded into `0012` and the section layouts folded into
  `0009` for exactly this reason. Applying a squash means resetting the live
  database, which is legitimate **only while no consuming app has copied the
  migrations**. When Puck copies them, this ends permanently and every change
  becomes additive forever.

  **An in-place edit never reaches the live database, and nothing tells you.**
  This is the trap the convention above creates, and it is measured rather than
  theorised. Supabase's migration history records a file as applied; `db push`
  will not re-run an applied file. So editing `0009` changes what a fresh
  database would build and changes **nothing** about the database the app
  actually runs against — silently, permanently, and in exactly the case the
  convention makes normal. Found 2026-08-16: `set_actor_sections()` on the live
  project was missing its **entire** per-section style-validation block, so
  `skin`, `background_url`, `background_fit` and `card_size` were unvalidated at
  the database level from the day `#150`–`#154` merged until this was found. The
  zod schema was the only thing checking them; the database backstop `0009`
  appears to provide was never there.

  Every check was green throughout. Unit tests at 100% cannot see a database.
  **`pnpm test:db` cannot see it either, by construction** — it resets to a
  **fresh** database built from the files, where drift cannot exist. And the
  `actor_profiles.sections` column comment, the one signal this convention asks
  to be kept in step, **was current**: truthful about the file and false about
  the database. So the designed signal pointed the wrong way.

  **THE ORDERING IS THE WHOLE RULE, AND IT WAS BROKEN ON 2026-08-29 BY THE
  AGENT WHO WROTE IT DOWN.** "Apply LAST, immediately before merge, one pull
  request at a time" is stated two paragraphs up; a heading-picture branch
  hand-applied `validate_block` while an unrelated pull request was still open
  and waiting on `e2e`. That request's `schema-drift` had already passed, so
  nothing went red — the check does not re-run on its own — and the breach was
  invisible rather than caught. Had anything re-triggered it, a green pull
  request would have turned red for a change that is not in it, which is the
  most confusing failure this repository can produce.

  **It happened AGAIN the same day, and worse.** The column comment on
  `actor_profiles.sections` was hand-applied to live before a pull request
  carrying it existed at all — so `main` went red on a change that was in
  nobody's branch. Twice in one session, by the same agent, on the same rule,
  minutes after writing the paragraph above. That is the measure of how strong
  the pull is: the edit and the apply feel like one act, and the note saying
  they are not does not stop it.

  **The trap is that applying feels like part of finishing the code**, because
  the edit and the apply are the same thought. They are not the same step: the
  apply belongs to the MERGE, and the test for whether it is safe is `gh pr
list --state open` returning nothing else.

  **A SEEDED page has the same shape, and the same branch tripped it too.**
  Running `seed-pastiches.mjs` from a feature branch makes live reflect
  whichever branch last ran it — so re-seeding from a branch cut before an
  avatar change silently wiped five avatars that a pull request not yet
  rebased onto had added. Nothing failed; the pages simply lost something, and only
  reading a screenshot found it. **The seeder writes production from whatever
  tree you are standing in**, so re-seed from `main` after a rebase, never from
  a branch that predates work already live.

  What guards it now is the `schema-drift` job below. Until it is a required
  check, the obligation is yours: **after editing an applied migration, apply
  the changed statements to the live project yourself** — a `create or replace`
  in its own transaction — and re-run the check.

  **A squash is not finished when the SQL is.** It is finished when every
  document, comment and test that named the old arrangement says the new one —
  the AI-facing notes (`CLAUDE.md`, `AGENTS.md`, the feature notes), the specs
  and plans under `docs/`, the TSDoc, the SQL comments that cross-reference a
  migration by number, and the tests that read a migration file by name. Under
  AI-driven development a stale pointer is a confident, wrong instruction, and
  a renumbered migration is the most confidently wrong kind: the file it names
  still exists and contains something else. `pnpm check:docs` does not catch
  this, because nothing about the TypeScript changed. Grep for the old number.

  The counterweight is that a number is a name other files use, and a stale
  pointer is worse than an untidy one. `0009` alone is cited by a dozen TSDoc
  comments, so renumbering around it is a change to all of them. **Fold what is
  genuinely a redefinition; do not renumber for tidiness.**

  A caution about the reasoning, learned the hard way: this paragraph used to
  say `0006` owned the UUIDv5 derivation other apps copy byte-identically, and
  that was **wrong** — `0002` owns it, and three other documents repeated the
  same error. A reason not to touch something is worth checking before it is
  believed, because a false one protects nothing and costs the work anyway.
