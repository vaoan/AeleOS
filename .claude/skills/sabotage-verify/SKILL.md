---
description: Prove a test can fail by breaking the code it guards, watching it go red, and restoring exactly
when_to_use: after writing any test that guards already-correct behaviour, and for every regression test
---

# Sabotage-verify a test

A test never seen red proves nothing.

1. Copy the file aside before the edit, and put the restore in a shell trap;
   never restore with `git checkout --`, which discards every uncommitted
   change in the file (root rule 34):
   `cp <file> "$TEMP/<file>.bak"; trap 'cp "$TEMP/<file>.bak" <file>' EXIT`
2. Make the mutation in the SOURCE, never at runtime through the instrument
   the test is built on (root rule 14).
3. Confirm the mutation landed by the FAILURE COUNT, not by grepping for the
   edit: a substitution that matched nothing looks exactly like a successful
   verification (root rule 29).
4. Name the wrong behaviour the case excludes and ask whether this fixture
   could tell it from the right one; if not, rewrite the fixture (root rule 27).
5. Restore, re-run green, and record the red run's first line in the commit
   message.

Full accounts: `docs/lessons/rules/29-a-sabotage-is-a-fixture-too-and-a-green-restore-afterwards.md`,
`docs/lessons/rules/34-a-sabotage-that-restores-with-git-restores-to-the-last.md`,
`docs/lessons/rules/27-a-fixture-can-make-a-right-answer-and-a-wrong-one-identical.md`.
