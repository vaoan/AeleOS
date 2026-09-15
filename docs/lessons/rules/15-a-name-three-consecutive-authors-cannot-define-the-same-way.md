# Rule 15: A name three consecutive authors cannot define the same way twice has no mechanism — it has a meaning each of them filled in from context.

15. **A name three consecutive authors cannot define the same way twice has no
    mechanism — it has a meaning each of them filled in from context.** The
    `columns` container mode was in the vocabulary, in the SQL and in the
    renderer, and each of those three said something different about it: the
    schema said it laid uniform tracks exactly as `grid` does, `0009` said
    `grid` fills them across and `columns` down, and the renderer shipped
    `grid` plus `items-start`. The middle one is a real mechanism, column-major
    fill order, which nothing else has — **and it was never implemented**, so
    the file whose comments are the readable index of the model was describing
    behaviour the product did not have, where `check:docs` cannot see it. The
    rule generalises past vocabularies, because it replaces an argument with an
    observation: this repo's standing bar is that a thing earns its place by a
    mechanism none of the others has, and "is there a mechanism" is arguable
    where "can three people who wrote it down agree" is not. It was removed
    before anything could store one.
