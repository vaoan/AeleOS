---
description: Post screenshots as a PR comment through a private gist, then read every picture back for what else is in the frame
when_to_use: when opening a pull request, and after every later commit on a branch that has one
disable-model-invocation: true
---

# Picture proof on the PR

A green check is not the picture; a screenshot that never left the working
tree is not the picture.

1. Point `PLAYWRIGHT_BASE_URL` at THIS branch (a local dev server or its
   preview), never at production from an earlier live check.
2. Photograph what changed the way a person would look at it: the editor,
   the public page, before-and-after where the bug was visual. Resize the
   viewport to `document.scrollHeight` before a full-page capture, or a
   `background-attachment: fixed` field photographs with a false white band.
3. Host the pictures: `gh api gists -X POST -f 'description=…' -F 'public=false' -f 'files[README.md][content]=placeholder'`,
   clone its `git_push_url`, add the PNGs, push, and reference
   `https://gist.githubusercontent.com/<user>/<id>/raw/<file>.png`.
   Confirm `gh api user` is the intended identity first.
4. `gh pr comment <n> --body-file -` with one caption per image stating the
   claim it proves.
5. READ EACH PICTURE BACK as its own step, asking "what else is in this
   frame, and is any of it wrong": edges, overlaps, clipped text, raw
   message keys, a colour that did not apply. Correct on the thread, never
   quietly.
6. Delete temporary specs and `shot-*.png` from the tree; nothing is committed.

Full account: `docs/lessons/conventions/picture-proof-on-the-pr-is-part-of-the-work-not-a-follow-up.md`.
