# Picture proof on the PR is part of the work, not a follow-up.

- **Picture proof on the PR is part of the work, not a follow-up.** Opening a
  pull request, and every later commit that lands on a branch that already has
  one open, ends with photographs posted **as a comment on that PR** — so a
  human scrolling the thread and a bot reviewing the same thread can both see
  that the change is what the tests claimed. A green check is not the picture;
  a sentence in the PR body is not the picture; a screenshot that never left
  the working tree is not the picture.

  Photograph the thing that actually changed, the way a person would look at
  it: the editor, the public page, the signed-in chrome, before-and-after
  where the bug was visual. Caption each image with the claim it is supposed
  to prove. If the change has no user-facing surface, photograph the
  verification that would otherwise live only in a log (the passing run, the
  drift check, the schema probe) rather than skipping.

  **Post it on the PR. Do not commit it.** Temporary Playwright specs,
  `shot-*.png`, and crop files stay out of git; delete them after the comment
  is up.

  **`gh pr comment` cannot upload a file, and believing it can was wrong for a
  while.** It posts Markdown only — GitHub's own drag-drop attachment upload
  needs a browser session, which a PAT cannot drive, so there is no `gh`
  equivalent of dropping a PNG into the comment box. The image has to be
  hosted somewhere a raw URL can point at, and the mechanism that works,
  verified on PR #52: a **private gist**, holding nothing but the picture,
  created and pushed to with the same PAT identity as every other action here.

  ```bash
  gh api gists -X POST -f 'description=…' -F 'public=false' -f 'files[README.md][content]=placeholder'
  git clone <git_push_url>   # the gist's own clone URL, from the response
  # copy the PNG in, commit, push
  # reference https://gist.githubusercontent.com/<user>/<id>/raw/<file>.png
  # in the PR comment body
  ```

  Confirmed: the raw URL serves `200` with `Content-Type: image/png`, so it
  renders inline in the comment the same way a native upload would. Confirm
  `gh api user` first — never `git config --global`, never a stored
  osxkeychain login, never `gh auth login` as somebody else, never a
  drag-drop in the browser as a different account. A picture that landed as a
  different GitHub user, or that never left a gist nobody can reach, is not
  posted.

  **Photograph the branch, never `main` by accident.** `PLAYWRIGHT_BASE_URL`
  still pointing at production from an earlier live check is how a comment
  can prove the old site and look like proof of this one. Unset it, or point
  it at a preview of _this_ branch, before taking the pictures. A picture of
  the deployed site is only proof after that commit is what production is
  serving.

  **Then READ the pictures back, as a step of its own (2026-08-27).** Posting
  is not the end of the job. Open every image you just posted and say what it
  shows — including what it shows that you did not intend. A screenshot is
  evidence of **everything in its frame**, not only of the claim you took it
  for, and the claim is all you will see if checking the claim is all you do.

  Paid for immediately, on the pull request that added this line. A shot
  captioned "the way back to the controls sits at the top right, not over the
  page's foot" proved exactly that — and in the same frame the button was
  sitting **on top of** the language toggle, the light/dark toggle and the
  account menu, hiding all three. Both facts were in the picture. Only the one
  being argued for was read, and the reviewer saw the other in seconds.

  So it is a separate pass asking a different question: not "does this show
  what I claimed" but **"what else is in this frame, and is any of it wrong"**.
  Walk the whole frame rather than the subject — edges and corners, anything
  overlapping anything, anything clipped or cut off, a control that has landed
  on another, text that is a raw message key, a colour that did not apply. Do
  it before the comment goes up where you can, and immediately after where you
  cannot; and where a comment is already up, correct it **on the thread**
  rather than quietly, because the picture is there and somebody will read it.
